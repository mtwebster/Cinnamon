const Main = imports.ui.main;

const RAISE_ENABLED_KEY = "panel-raise-in-fullscreen";

var ChromeRaiseManager = class ChromeRaiseManager {
    constructor() {
        this._raisedMonitor = -1;

        global.display.connect("super-tap", () => this._onSuperTap());
    }

    get raisedMonitor() {
        return this._raisedMonitor;
    }

    isRaised(monitorIndex) {
        return this._raisedMonitor >= 0 && this._raisedMonitor === monitorIndex;
    }

    _onSuperTap() {
        if (!global.settings.get_boolean(RAISE_ENABLED_KEY))
            return false;

        if (this._raisedMonitor >= 0)
            return false;

        let monitor = this._fullscreenFocusMonitor();
        if (monitor < 0)
            return false;

        this.raise(monitor);
        return true;
    }

    // Returns the monitor index of the focused window iff it is fullscreen on
    // its monitor, else -1.
    _fullscreenFocusMonitor() {
        let focus = global.display.get_focus_window();
        if (!focus || !focus.is_fullscreen())
            return -1;

        let monitor = focus.get_monitor();
        if (monitor < 0 || !global.display.get_monitor_in_fullscreen(monitor))
            return -1;

        return monitor;
    }

    raise(monitorIndex) {
        if (this._raisedMonitor >= 0)
            return;

        this._raisedMonitor = monitorIndex;
        global.log(`ChromeRaise: raise monitor ${monitorIndex}`);
    }

    dismiss() {
        if (this._raisedMonitor < 0)
            return;

        global.log(`ChromeRaise: dismiss monitor ${this._raisedMonitor}`);
        this._raisedMonitor = -1;
    }
};
