// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const CinnamonBg = imports.gi.CinnamonBg;
const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;

const LOGGING = false;

var BackgroundManager = class {
    constructor() {
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
        let model = this._monitors.get_monitors();
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
