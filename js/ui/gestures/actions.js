// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const { GLib, Gio, GObject, Cinnamon, Meta, Clutter } = imports.gi;
const Main = imports.ui.main;
const Util = imports.misc.util;

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
    "FULLSCREEN",
    "UNFULLSCREEN",
    "PUSH_TILE_UP",
    "PUSH_TILE_DOWN",
    "PUSH_TILE_LEFT",
    "PUSH_TILE_RIGHT",
    "TOGGLE_DESKTOP",
];

var do_action = (action) => {
    switch (action) {
    case "WORKSPACE_NEXT":
    case "WORKSPACE_PREVIOUS":
    case "WORKSPACE_UP":
    case "WORKSPACE_DOWN":
        return do_workspace_switch(action);
    case "TOGGLE_EXPO":
        return do_toggle_expo();
    case "TOGGLE_OVERVIEW":
        return do_toggle_overview();
    case "MINIMIZE":
        return do_minimize();
    case "MAXIMIZE":
        return do_maximize();
    case "CLOSE":
        return do_close();
    case "FULLSCREEN":
        return do_fullscreen();
    case "UNFULLSCREEN":
        return do_unfullscreen();
    case "PUSH_TILE_UP":
    case "PUSH_TILE_DOWN":
    case "PUSH_TILE_LEFT":
    case "PUSH_TILE_RIGHT":
        return do_tile(action);
    case "TOGGLE_DESKTOP":
        return do_toggle_desktop();
    }

    if (action.startsWith("EXEC:")) {
        return do_exec(action);
    }
};

const touchpad_settings = new  Gio.Settings({ schema_id: "org.cinnamon.desktop.peripherals.touchpad" });

const do_minimize = () => {
    const window = global.display.get_focus_window();

    if (window != null) {
        window.minimize();
    }
};

const do_maximize = () => {
    const window = global.display.get_focus_window();

    if (window != null) {
        if (window.maximized_horizontally && window.maximized_vertically) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        } 
        else {
            window.maximize(Meta.MaximizeFlags.BOTH);
        }
    }
};

const do_close = () => {
    const window = global.display.get_focus_window();

    if (window != null) {
        window.delete(global.get_current_time());
    }
};

const do_fullscreen = () => {
    const window = global.display.get_focus_window();

    if (window != null) {
        window.make_fullscreen();
    }
};

const do_unfullscreen = () => {
    const window = global.display.get_focus_window();

    if (window != null) {
        window.unmake_fullscreen();
    }
};

const do_toggle_desktop = () => {
    global.workspace_manager.toggle_desktop(global.get_current_time());
};

const do_toggle_expo = () => {
    if (global.stage_input_mode === Cinnamon.StageInputMode.FULLSCREEN) {
        Main.expo.hide()
        Main.overview.hide();
        return;
    }

    Main.expo.toggle();
};

const do_toggle_overview = () => {
    if (global.stage_input_mode === Cinnamon.StageInputMode.FULLSCREEN) {
        Main.expo.hide()
        Main.overview.hide();
        return;
    }

    Main.overview.toggle();
};

const do_workspace_switch = (action) => {
    const current = global.workspace_manager.get_active_workspace();

    let direction = Meta.MotionDirection.RIGHT;
    let reverse = touchpad_settings.get_boolean("natural-scroll");

    switch (action) {
    case "WORKSPACE_NEXT":
        direction = reverse ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT;
        break;
    case "WORKSPACE_PREVIOUS":
        direction = reverse ? Meta.MotionDirection.LEFT : Meta.MotionDirection.RIGHT;
        break;
    case "WORKSPACE_UP":
        direction = Meta.MotionDirection.UP;
        break;
    case "WORKSPACE_DOWN":
        direction = Meta.MotionDirection.DOWN;
        break;
    }

    const neighbor = current.get_neighbor(direction);
    global.log(current === neighbor, direction);
    neighbor.activate(global.get_current_time());
};

const do_tile = (action) => {
    const window = global.display.get_focus_window();

    if (window != null) {
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
};

const do_exec = (action) => {
    global.log(`Custom action: ${action}`);

    const real_action = action.replace("EXEC:", "");
    try {
        GLib.spawn_command_line_async(real_action);
    } catch (e) {
        global.logError(`Failed to execute custom gesture action: ${e}`);
    }
};
