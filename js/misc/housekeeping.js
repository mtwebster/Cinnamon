// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const GnomeSession = imports.misc.gnomeSession;
const System = imports.system;

function Housekeeping() {
    this._init();
}

Housekeeping.prototype = {
    _init: function() {
        this.user_status = GnomeSession.PresenceStatus.AVAILABLE

        this._presence = new GnomeSession.Presence(null);

        this._presence.connectSignal('StatusChanged', Lang.bind(this, function(proxy, senderName, [status]) {
            this._onStatusChanged(status);
        }));
    },

    _onStatusChanged: function(status) {
        let going_to_idle = (this.user_status == GnomeSession.PresenceStatus.AVAILABLE &&
                             status == GnomeSession.PresenceStatus.IDLE);

        this.user_status = status;

        if (going_to_idle) {
            St.TextureCache.get_default().session_idle_cleanup_check();

            Mainloop.idle_add(Lang.bind(this, function() {
                System.gc();
                return false;
            }))
        }
    }
};
