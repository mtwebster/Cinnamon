// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const CinnamonBg = imports.gi.CinnamonBg;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;

const dbusIFace =
    '<node> \
        <interface name="org.Cinnamon.Slideshow"> \
            <method name="begin" /> \
            <method name="end" /> \
            <method name="getNextImage" /> \
        </interface> \
    </node>';

const proxy = Gio.DBusProxy.makeProxyWrapper(dbusIFace);

function SlideshowManager() {
    this._init();
}

SlideshowManager.prototype = {

    _init: function() {
        this.proxy = null;
        this._bgSettings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.background" });
        this._bgList = CinnamonBg.List.new();
        this._monitors = CinnamonBg.Monitors.new();

        this._migrateLegacy();

        this._bgSettings.connect("changed::picture-uri-list", Lang.bind(this, this._sync));
        this._bgSettings.connect("changed::background-mode", Lang.bind(this, this._sync));
        this._monitors.connect("changed", Lang.bind(this, this._sync));

        this._sync();
    },

    // One-time migration: fold the old slideshow-enabled/image-source keys into
    // list[0]. An empty picture-uri-list is the pre-migration signal; after the
    // first save the list is non-empty, so this never runs again. Lives here
    // because the daemon is D-Bus-activated and won't launch for an unmigrated
    // (empty-list) config, while this manager runs at every Cinnamon startup.
    _migrateLegacy: function() {
        if (this._bgList.get_n_items() > 0)
            return;
        let sl = new Gio.Settings({ schema_id: "org.cinnamon.desktop.background.slideshow" });
        let enabled = sl.get_boolean("slideshow-enabled");
        let source = sl.get_string("image-source");
        if (!enabled && source == "")
            return;
        let item = this._bgList.get_single();
        if (source != "")
            item.set_property("slideshow-source", source);
        item.set_property("slideshow", enabled);
        this._bgList.add_item(item);
        this._bgList.save_pictures();
    },

    _shouldBeActive: function() {
        let model = this._monitors;
        let connectors = [], indices = [];
        for (let i = 0; i < model.get_n_items(); i++) {
            let mi = model.get_item(i);
            connectors.push(mi.connector);
            indices.push(mi.index);
        }
        if (connectors.length == 0)
            return false;
        let resolved = this._bgList.resolve(connectors, indices);
        for (let i = 0; i < connectors.length; i++) {
            let item = resolved.get_item(i);
            if (item && item.get_slideshow())
                return true;
        }
        return false;
    },

    _sync: function() {
        if (this._shouldBeActive())
            this.begin();
        else
            this.end();
    },

    ensureProxy: function() {
        if (!this.proxy)
            this.proxy = new proxy(Gio.DBus.session, 'org.Cinnamon.Slideshow', '/org/Cinnamon/Slideshow');
    },

    _logRemoteError: function(method) {
        return (result, error) => {
            if (error)
                global.logWarning("SlideshowManager: " + method + " failed: " + error.message);
        };
    },

    begin: function() {
        this.ensureProxy();
        this.proxy.beginRemote(this._logRemoteError("begin"));
    },

    end: function() {
        this.ensureProxy();
        this.proxy.endRemote(this._logRemoteError("end"));
    },

    getNextImage: function() {
        this.ensureProxy();
        this.proxy.getNextImageRemote(this._logRemoteError("getNextImage"));
    }
};
