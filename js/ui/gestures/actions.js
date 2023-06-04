// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const { GLib, Gio, GObject, Cinnamon, Meta, Clutter, Cvc } = imports.gi;
const Main = imports.ui.main;
const Params = imports.misc.params;
const Util = imports.misc.util;
const gestures = imports.ui.gestures;
const { GestureType,  GestureDirection, DeviceType } = gestures.touchegg.ToucheggTypes;

const GestureActions = [
    "DISABLED",
    "WORKSPACE_NEXT",
    "WORKSPACE_PREVIOUS",
    "WORKSPACE_UP",
    "WORKSPACE_DOWN",
    "TOGGLE_EXPO",
    "TOGGLE_OVERVIEW",
    "MINIMIZE",
    "MAXIMIZE",
    "CLOSE",
    "WINDOW_WORKSPACE_NEXT",
    "WINDOW_WORKSPACE_PREVIOUS",
    "FULLSCREEN",
    "UNFULLSCREEN",
    "PUSH_TILE_UP",
    "PUSH_TILE_DOWN",
    "PUSH_TILE_LEFT",
    "PUSH_TILE_RIGHT",
    "TOGGLE_DESKTOP",
];

const touchpad_settings = new  Gio.Settings({ schema_id: "org.cinnamon.desktop.peripherals.touchpad" });

var make_action = (settings, definition, device) => {
    var threshold = 100;

    if (definition.type === GestureType.SWIPE) {
        threshold = settings.get_uint("swipe-percent-threshold");
    }
    else
    if (definition.type === GestureType.PINCH) {
        threshold = settings.get_uint("pinch-percent-threshold");
    }

    switch (definition.action) {
    case "WORKSPACE_NEXT":
    case "WORKSPACE_PREVIOUS":
    case "WORKSPACE_UP":
    case "WORKSPACE_DOWN":
        return new WorkspaceSwitchAction(definition, device, threshold);
    case "TOGGLE_EXPO":
    case "TOGGLE_OVERVIEW":
    case "TOGGLE_DESKTOP":
        return new GlobalDesktopAction(definition, device, threshold);
    case "MINIMIZE":
    case "MAXIMIZE":
    case "CLOSE":
    case "WINDOW_WORKSPACE_NEXT":
    case "WINDOW_WORKSPACE_PREVIOUS":
    case "FULLSCREEN":
    case "UNFULLSCREEN":
    case "PUSH_TILE_UP":
    case "PUSH_TILE_DOWN":
    case "PUSH_TILE_LEFT":
    case "PUSH_TILE_RIGHT":
        return new WindowOpAction(definition, device, threshold);
    case "VOLUME_UP":
    case "VOLUME_DOWN":
    case "TOGGLE_MUTE":
        return new VolumeAction(definition, device, threshold);
    }

    if (action.startsWith("EXEC:")) {
        return new ExecAction(definition, device, threshold);
    }
}

var BaseAction = class {
    constructor(definition, device, threshold) {
        this.definition = definition;
        this.device = device;
        this.threshold = threshold;
    }

    begin(direction, percentage, time) {
    }

    update(direction, percentage, time) {
    }

    end(direction, percentage, time) {
    }
}

var WorkspaceSwitchAction = class extends BaseAction {
    constructor(definition, device, threshold) {
        super(definition, device, threshold);
    }

    end(direction, percentage, time) {
        const current = global.workspace_manager.get_active_workspace();

        let motion_dir = Meta.MotionDirection.RIGHT;
        let reverse = touchpad_settings.get_boolean("natural-scroll");

        switch (this.definition.action) {
        case "WORKSPACE_NEXT":
            motion_dir = reverse ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT;
            break;
        case "WORKSPACE_PREVIOUS":
            motion_dir = reverse ? Meta.MotionDirection.LEFT : Meta.MotionDirection.RIGHT;
            break;
        case "WORKSPACE_UP":
            motion_dir = Meta.MotionDirection.UP;
            break;
        case "WORKSPACE_DOWN":
            motion_dir = Meta.MotionDirection.DOWN;
            break;
        }

        const neighbor = current.get_neighbor(motion_dir);
        neighbor.activate(global.get_current_time());
    }
}

var WindowOpAction = class extends BaseAction {
    constructor(definition, device, threshold) {
        super(definition, device, threshold);
    }

    end(direction, percentage, time) {
        const window = global.display.get_focus_window();

        if (window == null) {
            global.logWarning("WorkspaceSwitchAction: no focus window");
            return
        }

        switch (this.definition.action) {
        case "MINIMIZE":
            window.minimize();
            break
        case "MAXIMIZE":
            if (window.maximized_horizontally && window.maximized_vertically) {
                window.unmaximize(Meta.MaximizeFlags.BOTH);
            } 
            else {
                window.maximize(Meta.MaximizeFlags.BOTH);
            }
            break
        case "CLOSE":
            window.delete(global.get_current_time());
            break
        case "FULLSCREEN":
            window.make_fullscreen();
            break
        case "UNFULLSCREEN":
            window.unmake_fullscreen();
            break
        case "PUSH_TILE_UP":
        case "PUSH_TILE_DOWN":
        case "PUSH_TILE_LEFT":
        case "PUSH_TILE_RIGHT":
            this._handle_tile(this.definition.action, window);
            break;
        case "WINDOW_WORKSPACE_NEXT":
        case "WINDOW_WORKSPACE_PREVIOUS":
            this._handle_window_workspace_move(this.definition.action, window);
            break;
        }
    }

    _handle_tile(action, window) {
        switch (action) {
        case "PUSH_TILE_LEFT":
            global.display.push_tile(window, Meta.MotionDirection.LEFT);
            return;
        case "PUSH_TILE_RIGHT":
            global.display.push_tile(window, Meta.MotionDirection.RIGHT);
            return;
        case "PUSH_TILE_UP":
            global.display.push_tile(window, Meta.MotionDirection.UP);
            return;
        case "PUSH_TILE_DOWN":
            global.display.push_tile(window, Meta.MotionDirection.DOWN);
            return;
        }
    }

    _handle_window_workspace_move(action, window) {
        if (window.is_on_all_workspaces()) {
            return;
        }

        const workspace = window.get_workspace();
        const cur_index = workspace.index();
        const max_index = global.workspace_manager.get_n_workspaces() - 1;
        var new_workspace = null;

        // Don't use workspace.get_neighbor() here - just do nothing if we swipe right
        // from the last workspace or left from the first.
        switch (action) {
        case "WINDOW_WORKSPACE_NEXT":
            if (cur_index === max_index) {
                return;
            }

            new_workspace = global.workspace_manager.get_workspace_by_index(cur_index + 1)
            if (new_workspace != null) {
                window.change_workspace(new_workspace);
            } else {
                global.logWarning("Gesture - move window to next workspace failed, workspace doesn't exist");
            }
            return;
        case "WINDOW_WORKSPACE_PREVIOUS":
            if (cur_index === 0) {
                return;
            }

            new_workspace = global.workspace_manager.get_workspace_by_index(cur_index - 1)
            if (new_workspace != null) {
                window.change_workspace(new_workspace);
            } else {
                global.logWarning("Gesture - move window to next workspace failed, workspace doesn't exist");
            }
            return;
        }
    }
}

var GlobalDesktopAction = class extends BaseAction {
    constructor(definition, device, threshold) {
        super(definition, device, threshold);
    }

    _cancel_current_mode() {
        if (global.stage_input_mode === Cinnamon.StageInputMode.FULLSCREEN) {
            Main.expo.hide()
            Main.overview.hide();
            return true;
        }

        return false;
    }

    end(direction, percentage, time) {
        if (this._cancel_current_mode()) {
            return;
        }

        switch (this.definition.action) {
        case "TOGGLE_EXPO":
            Main.expo.toggle();
            break
        case "TOGGLE_OVERVIEW":
            Main.overview.toggle();
            break;
        case "TOGGLE_DESKTOP":
            global.workspace_manager.toggle_desktop(global.get_current_time());
            break;
        }
    }
}

var ExecAction = class extends BaseAction {
    constructor(definition, device, threshold) {
        super(definition, device, threshold);
    }

    end(direction, percentage, time) {
        const real_action = action.replace("EXEC:", "");
        try {
            GLib.spawn_command_line_async(real_action);
        } catch (e) {
            global.logError(`Failed to execute custom gesture action: ${e}`);
        }
    }
};

// Make a single mixer control, the first time there's a VolumeAction,
// and reuse it for subsequent ones.
var mixer = null;
var init_mixer = () => {
    if (mixer != null) {
        return;
    }

    mixer = new Cvc.MixerControl({ name: "cinnamon-gestures" });
    mixer.open();
}

var VolumeAction = class extends BaseAction {
    FACTOR = 1.0;

    constructor(definition, device, threshold) {
        super(definition, device, threshold);

        if (mixer == null) {
            init_mixer();
        }

        this.ignoring = true;

        this.max_volume = mixer.get_vol_max_norm();
        this.pct_step = this.max_volume / 100;
    }

    _set_volume(up, percentage) {
        const sink = mixer.get_default_sink();

        if (sink == null) {
            return;
        }

        var new_volume = sink.volume;

        if (this.ignoring) {
            if (up) {
                if (percentage * this.pct_step < sink.volume) {
                    return;
                }
            } else {
                if (percentage * this.pct_step >= sink.volume) {
                    return;
                }
            }

            this.ignoring = false;
        }

        new_volume = percentage * this.pct_step;
        new_volume = new_volume.clamp(0, this.max_volume);
        
        if (new_volume === sink.volume) {
            return;
        }

        sink.set_volume(new_volume);
        sink.push_volume();

        if (sink.is_muted) {
            sink.change_is_muted(false);
        }

        Main.osdWindowManager.show(-1, this._get_volume_icon(new_volume), Math.floor(new_volume / this.max_volume * 100), false);
    }

    _toggle_muted() {
        const sink = mixer.get_default_sink();

        if (sink == null) {
            return;
        }

        sink.change_is_muted(!sink.is_muted);
    }

    _get_volume_icon(volume) {
        let icon;
        if (volume < 5) {
            icon = "muted";
        } else {
            const icon_step = Math.floor(this.max_volume / 3);
            if (volume < icon_step)
                icon = "low";
            else
            if (volume < icon_step * 2) {
                icon = "medium";
            }
            else {
                icon = "high";
            }
        }

        return new Gio.ThemedIcon({ name: `audio-volume-${icon}-symbolic` });
    }

    begin(direction, percentage, time) {
        this.update(direction, percentage, time);
    }

    update(direction, percentage, time) {
        if (this.definition.action === "VOLUME_UP") {
            this._set_volume(true, percentage);
        }
        else
        if (this.definition.action === "VOLUME_DOWN") {
            this._set_volume(false, 100 - percentage);
        }
    }

    end(direction, percentage, time) {
        if (this.definition.action === "TOGGLE_MUTE") {
            this._toggle_muted();
        }
    }
}
