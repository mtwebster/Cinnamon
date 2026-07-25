const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;

const RAISE_ENABLED_KEY = "panel-raise-in-fullscreen";

var ChromeRaiseManager = class ChromeRaiseManager {
    constructor() {
        this._raisedMonitor = -1;
        this._owner = null;
        this._captureId = 0;
        this._focusWindowId = 0;

        global.display.connect("super-tap", () => this._onSuperTap());
    }

    get raisedMonitor() {
        return this._raisedMonitor;
    }

    isRaised(monitorIndex) {
        return this._raisedMonitor >= 0 && this._raisedMonitor === monitorIndex;
    }

    isPanelRaised(actor) {
        if (this._raisedMonitor < 0)
            return false;

        return Main.panelManager.panels.some(
            panel => panel && panel.monitorIndex === this._raisedMonitor && panel === actor);
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

        // Owner actor for the modal: the first panel on the target monitor.
        let owner = Main.panelManager.panels.find(
            panel => panel && panel.monitorIndex === monitorIndex);
        if (!owner)
            return;

        // NORMAL mode: the raised chrome is ordinary interaction floating over
        // a fullscreen window, so a second Super tap (and other bindings) keep
        // working - the menu opens on top of the still-revealed panels.
        if (!Main.pushModal(owner, global.get_current_time(), 0,
                            Cinnamon.ActionMode.NORMAL, () => this.dismiss())) {
            return;
        }

        this._owner = owner;
        this._raisedMonitor = monitorIndex;

        this._captureId = global.stage.connect("captured-event",
            (actor, event) => this._onCapturedEvent(event));

        // Switching to a window (e.g. clicking the window list) ends the raise.
        this._focusWindowId = global.display.connect("notify::focus-window",
            () => this.dismiss());

        Main.layoutManager._chrome._updateVisibility();
    }

    dismiss() {
        if (this._raisedMonitor < 0)
            return;

        if (this._captureId) {
            global.stage.disconnect(this._captureId);
            this._captureId = 0;
        }

        if (this._focusWindowId) {
            global.display.disconnect(this._focusWindowId);
            this._focusWindowId = 0;
        }

        let owner = this._owner;
        this._owner = null;
        this._raisedMonitor = -1;

        Main.popModal(owner, global.get_current_time());
        Main.layoutManager._chrome._updateVisibility();
    }

    _onCapturedEvent(event) {
        // Only act while our grab is topmost; if a menu is stacked on top, let
        // it handle events (Escape closes the menu, clicks go to the menu).
        if (!this._isTopmostModal())
            return Clutter.EVENT_PROPAGATE;

        let type = event.type();

        if (type === Clutter.EventType.KEY_PRESS &&
            event.get_key_symbol() === Clutter.KEY_Escape) {
            this.dismiss();
            return Clutter.EVENT_STOP;
        }

        // A press anywhere but a raised panel (e.g. the fullscreen window) ends
        // the raise and returns input to whatever was clicked.
        if (type === Clutter.EventType.BUTTON_PRESS && !this._eventOnRaisedPanel(event)) {
            this.dismiss();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _eventOnRaisedPanel(event) {
        let source = event.get_source();
        return source && Main.panelManager.panels.some(
            panel => panel && panel.monitorIndex === this._raisedMonitor &&
                     panel.contains(source));
    }

    _isTopmostModal() {
        let stack = Main.modalActorFocusStack;
        return stack.length > 0 && stack[stack.length - 1].actor === this._owner;
    }
};
