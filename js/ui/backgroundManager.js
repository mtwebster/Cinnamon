// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Cinnamon = imports.gi.Cinnamon;
const CinnamonBg = imports.gi.CinnamonBg;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;

const LOGGING = false;

// csd-background draws the wallpaper (per-monitor, via layer-shell on Wayland).
// It is D-Bus activatable; we start it, watch its readiness so the startup
// reveal can wait for the wallpaper, and restart it if it dies.
const DAEMON_NAME = 'org.cinnamon.SettingsDaemon.Background';
const DAEMON_PATH = '/org/cinnamon/SettingsDaemon/Background';
const DAEMON_STATE_READY = 1;
const READY_BACKSTOP_MS = 4000;

// Stop restarting a crash-looping daemon: at most this many exits per window.
const RESTART_LIMIT = 3;
const RESTART_WINDOW_US = 60 * GLib.USEC_PER_SEC;

var BackgroundManager = class {
    constructor() {
        this._daemonProxy = null;
        this._daemonReady = false;
        this._onDaemonReady = null;
        this._daemonHadOwner = false;
        this._daemonExitTimes = [];

        this._startDaemon();
        Gio.bus_watch_name(Gio.BusType.SESSION, DAEMON_NAME,
                           Gio.BusNameWatcherFlags.NONE,
                           () => { this._daemonHadOwner = true; },
                           this._onDaemonVanished.bind(this));

        this._cinnamonSettings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.background" });
        this._bgList = CinnamonBg.List.new();
        this._monitors = CinnamonBg.Monitors.new();

        // "Set as wallpaper" reaches us through two legacy entry points, both of
        // which write a flat picture-uri instead of our per-monitor list, so we
        // translate each into a single background. Nothing else writes these
        // keys any more (the panel and the slideshow daemon only touch
        // picture-uri-list), so there's no feedback from our own saves.
        //
        // xdg-desktop-portal-xapp's wallpaper plugin writes cinnamon's key --
        // this is the path sandboxed/portal-using apps take.
        this.cinnamonPictureUri = this._cinnamonSettings.get_string("picture-uri");
        this._cinnamonSettings.connect("changed::picture-uri",
                                       this._onCinnamonPictureURIChanged.bind(this));

        // Some apps (Firefox historically, pix) set GNOME's key directly instead
        // of going through the portal. Optional: that schema may not be installed.
        let schema = Gio.SettingsSchemaSource.get_default();
        if (!schema.lookup("org.gnome.desktop.background", true))
            return;

        this._gnomeSettings = new Gio.Settings({ schema_id: "org.gnome.desktop.background" });
        this.pictureUri = this._gnomeSettings.get_string("picture-uri");
        this._gnomeSettings.connect("changed::picture-uri", this._onPictureURIChanged.bind(this));
    }

    showBackground() {
        for (let actor of global.get_background_actors()) {
            actor.show();
        }
    }

    hideBackground() {
        for (let actor of global.get_background_actors()) {
            actor.hide();
        }
    }

    _startDaemon() {
        // Proxy construction alone won't auto-start the service, so activate it
        // explicitly. A no-op if it is already running (e.g. on a Cinnamon restart).
        Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'StartServiceByName',
            new GLib.Variant('(su)', [DAEMON_NAME, 0]),
            null, Gio.DBusCallFlags.NONE, -1, null,
            (conn, res) => {
                try { conn.call_finish(res); }
                catch (e) { global.logWarning('BackgroundManager: could not start csd-background: ' + e.message); }
            });

        // One proxy is enough for the daemon's whole lifetime: it tracks
        // name-owner changes, so it follows a restarted daemon by itself.
        if (this._daemonProxy)
            return;

        // Track readiness independently of when the reveal asks for it -- the proxy
        // can finish constructing before or after the startup animation is ready.
        Cinnamon.BackgroundDaemonProxy.new_for_bus(Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE,
            DAEMON_NAME, DAEMON_PATH, null,
            (src, res) => {
                try { this._daemonProxy = Cinnamon.BackgroundDaemonProxy.new_for_bus_finish(res); }
                catch (e) { global.logWarning('BackgroundManager: background daemon proxy failed: ' + e.message); return; }

                const checkState = () => {
                    if (this._daemonProxy.state === DAEMON_STATE_READY)
                        this._markDaemonReady();
                };
                this._daemonProxy.connect('notify::state', checkState);
                checkState();   // it may already be READY by the time we connect
            });
    }

    _markDaemonReady() {
        if (this._daemonReady)
            return;
        this._daemonReady = true;
        if (this._onDaemonReady) {
            const cb = this._onDaemonReady;
            this._onDaemonReady = null;
            cb();
        }
    }

    // Run `callback` once the wallpaper is on screen, or after a short backstop so a
    // missing or slow background daemon can never hold the desktop hostage.
    whenReady(callback) {
        if (this._daemonReady) {
            callback();
            return;
        }

        let done = false;
        const fire = () => {
            if (done)
                return;
            done = true;
            callback();
        };

        this._onDaemonReady = fire;

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, READY_BACKSTOP_MS, () => {
            if (!done)
                global.logWarning('BackgroundManager: background not ready in time; revealing anyway');
            fire();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onDaemonVanished() {
        // The watcher reports "vanished" once up front when the name simply has
        // no owner yet -- that's the daemon not yet activated, not a crash.
        if (!this._daemonHadOwner)
            return;

        const now = GLib.get_monotonic_time();
        this._daemonExitTimes = this._daemonExitTimes.filter(t => now - t < RESTART_WINDOW_US);
        if (this._daemonExitTimes.length >= RESTART_LIMIT) {
            global.logError('BackgroundManager: csd-background keeps exiting; giving up on restarting it');
            return;
        }
        this._daemonExitTimes.push(now);

        global.logWarning('BackgroundManager: csd-background exited; restarting it');
        this._startDaemon();
    }

    _applyExternalUri(uri, source) {
        if (uri == "")
            return;
        // An external "set as wallpaper" picks one image for every monitor, so
        // make it the single background: set_single_uri() replaces the list with
        // one zoomed entry and mirrors it onto every monitor, discarding any
        // per-monitor layout. That's the intent of the request.
        if (LOGGING) global.log("BackgroundManager: %s picture-uri -> single background (%s)".format(source, uri));
        this._bgList.set_single_uri(uri);
    }

    _onCinnamonPictureURIChanged(settings, key) {
        let newValue = this._cinnamonSettings.get_string(key);
        if (newValue == this.cinnamonPictureUri)
            return;
        this.cinnamonPictureUri = newValue;
        this._applyExternalUri(newValue, "portal");
    }

    _onPictureURIChanged(settings, key) {
        let newValue = this._gnomeSettings.get_string(key);
        if (newValue == this.pictureUri)
            return;
        this.pictureUri = newValue;
        this._applyExternalUri(newValue, "GNOME");
    }

    _layout() {
        let model = this._monitors;
        let infos = [];
        for (let i = 0; i < model.get_n_items(); i++)
            infos.push(model.get_item(i));
        infos.sort((a, b) => a.x - b.x);
        let connectors = [], indices = [];
        for (let mi of infos) {
            if (!mi.connector)
                continue;
            connectors.push(mi.connector);
            indices.push(mi.index);
        }
        return { connectors, indices };
    }

    _basename(uri) {
        if (!uri)
            return _("(none)");
        return decodeURIComponent(uri).split("/").pop();
    }

    // Per-monitor background info for consumers like the slideshow applet, using
    // this manager's already-live CinnamonBg objects (no duplicate instances).
    // Returns { slideshowActive, multi, entries: [{ index, name }] }.
    getBackgroundSummary() {
        if (!this._bgList)
            return { slideshowActive: false, multi: false, entries: [] };

        if (this._cinnamonSettings.get_string("background-mode") == "independent") {
            let { connectors, indices } = this._layout();
            let resolved = this._bgList.resolve(connectors, indices);
            let entries = [];
            let active = false;
            for (let i = 0; i < connectors.length; i++) {
                let item = resolved.get_item(i);
                if (item && item.get_slideshow())
                    active = true;
                entries.push({ index: i, name: this._basename(item ? item.get_picture_uri() : "") });
            }
            return { slideshowActive: active, multi: true, entries: entries };
        }

        let single = this._bgList.get_single();
        return { slideshowActive: single.get_slideshow(), multi: false,
                 entries: [{ index: 0, name: this._basename(single.get_picture_uri()) }] };
    }
};
