// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/*
 * Copyright 2021 - 2023 José Expósito <jose.exposito89@gmail.com>
 *
 * This file is part of gnome-shell-extension-x11gestures.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation,  either version 2 of the License,  or (at your option)  any later
 * version.
 *
 * This program is distributed in the hope that it will be useful,  but  WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the  GNU General Public License along with
 * this program. If not, see <http://www.gnu.org/licenses/>.
 */
const { GLib, Gio, GObject, Cinnamon } = imports.gi;
const Util = imports.misc.util;
const gestures = imports.ui.gestures;
const actions = gestures.actions;
// const { toucheggClient } = gestures.touchegg.ToucheggClient;
const { GestureType,  GestureDirection, DeviceType } = gestures.touchegg.ToucheggTypes;

const DBUS_ADDRESS = 'unix:abstract=touchegg';
const DBUS_OBJECT_PATH = '/io/github/joseexposito/Touchegg';

const SCHEMA = "org.cinnamon.gestures";
const NON_GESTURE_KEYS = [
    "swipe-percent-threshold",
    "pinch-percent-threshold"
]

const GestureDirectionString = [
    "unknown",
    "up",
    "down",
    "left",
    "right",

    "in",
    "out"
];

const GestureTypeString = [
    "unsupported",
    "swipe",
    "pinch",
    "tap"
];

const DeviceTypeString = [
    "unknown",
    "touchpad",
    "touchscreen"
]

var parse_type = (type_str) => {
    switch(type_str) {
    case "swipe":
        return GestureType.SWIPE;
    case "pinch":
        return GestureType.PINCH;
    case "tap":
        return GestureType.TAP;
    default:
        return GestureType.NOT_SUPPORTED;
    }
}

var parse_direction = (dir_str) => {
    switch(dir_str) {
    case "up":
        return GestureDirection.UP;
    case "down":
        return GestureDirection.DOWN;
    case "left":
        return GestureDirection.LEFT;
    case "right":
        return GestureDirection.RIGHT;
    case "in":
        return GestureDirection.IN;
    case "out":
        return GestureDirection.OUT
    default:
        return GestureDirection.UNKNOWN;
    }
}

const DEBUG_GESTURES=true;
var debug_gesture = (...args) => {
    if (DEBUG_GESTURES) {
        global.log(...args);
    }
}

var GestureDefinition = class {
    constructor(key, action) {
        this.action = action

        const parts = key.split("-");

        if (parts.length == 2) {
            this.type = parse_type(parts[0]);
            this.fingers = parseInt(parts[1]);
        } else {
            this.type = parse_type(parts[0]);
            this.direction = parse_direction(parts[1]);
            this.fingers = parseInt(parts[2]);
        }
    }
}

var GesturesManager = class {
    constructor(wm) {
        this.settings = new Gio.Settings({ schema_id: SCHEMA })
        this.settings.connect("changed", () => this.setup_actions());
        this.setup_actions();
        this._current_gesture = null;

        this.connection = null;
        this.proxy = null;
        this.signal_handler_id = 0;
        this._kill_touchegg();
        this.connect_client();
    }

    connect_client() {
        Gio.DBusConnection.new_for_address(
            DBUS_ADDRESS,
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT,
            null,
            null,
            this.bus_connected.bind(this)
        );
    }

    bus_connected(source, res) {
        try {
            this.connection = Gio.DBusConnection.new_finish(res);
        } catch (e) {
            global.logError("Could not connect to touchegg bus, is the daemon running?", e);
            return;
        }

        Cinnamon.ToucheggProxy.new(
            this.connection,
            Gio.DBusConnectionFlags.NONE,
            null,
            DBUS_OBJECT_PATH,
            null,
            this.proxy_made.bind(this)
        );
    }

    proxy_made(source, res) {
        try {
            this.proxy = Cinnamon.ToucheggProxy.new_finish(res);
        } catch (e) {
            global.logError("Could not make Touchegg proxy", e);
            return;
        }

        global.log('Connecting Touchégg client signals');
        // this.proxy.connect('g-signal', this._handle_signal.bind(this));
        this.proxy.connect('on-gesture-begin', this._handle_signal.bind(this, "begin"));
        this.proxy.connect('on-gesture-update', this._handle_signal.bind(this, "update"));
        this.proxy.connect('on-gesture-end', this._handle_signal.bind(this, "end"));
    }

    _handle_signal(signame, proxy, type, direction, percentage, fingers, device, time) {
        global.log(signame, type, direction, percentage, fingers, device, time);
        const args = [type, direction, percentage, fingers, device, time];
        // const args = params.unpack()
        // var func = null;
        var func = null;
        switch (signame) {
        case "begin":
            // log("BEGINN");
            func = this._gesture_begin;
            break
        case "update":
            // log("UPDATE");
            func = this._gesture_update;
            break;
        case "end":
            // log("END");
            func = this._gesture_end;
            break;
        }

        if (this.signal_handler_id > 0) {
            GLib.source_remove(this.signal_handler_id);
        }
        // global.log(args);
        this.signal_handler_id = GLib.idle_add(GLib.DEFAULT_IDLE, () => {
            func.call(this, ...args);
        });
    }

    setup_actions() {
        this.live_actions = new Map();

        const ssource = Gio.SettingsSchemaSource.get_default();
        const schema = ssource.lookup(SCHEMA, true);
        const keys = schema.list_keys();

        for (let key of keys) {
            if (NON_GESTURE_KEYS.includes(key)) {
                continue;
            }

            const action = this.settings.get_string(key);
            if (action === '') {
                continue;
            }

            this.live_actions.set(key, new GestureDefinition(key, action));
        }
    }

    construct_map_key(type, direction, fingers) {
        if (type === GestureType.TAP) {
            return `tap-${fingers}`;
        } else
        if (type === GestureType.SWIPE) {
            return `swipe-${GestureDirectionString[direction]}-${fingers}`;
        } else
        if (type === GestureType.PINCH) {
            return `pinch-${GestureDirectionString[direction]}-${fingers}`;
        } else
        {
            return null;
        }
    }

    _lookup_definition(type, direction, fingers) {
        const key = this.construct_map_key(type, direction, fingers);
        const definition = this.live_actions.get(key);

        if (definition === undefined) {
            // no action set for this gesture
            return null;
        }

        return definition;
    }

    _gesture_begin(type, direction, percentage, fingers, device, elapsed_time) {
        global.log(type, direction, percentage);
        this.signal_handler_id = 0;
        if (this._current_gesture != null) {
            global.logWarning("New gesture started before another was completed. Clearing the old one");
            this._current_gesture = null;
        }

        const definition_match = this._lookup_definition(type, direction, fingers);

        if (definition_match == null) {
            debug_gesture(`No definition for (${DeviceTypeString[device]}) ${GestureTypeString[type]}, ${GestureDirectionString[direction]}, fingers: ${fingers}`);
            return;
        }

        debug_gesture(`Gesture started: (${DeviceTypeString[device]}) ${GestureTypeString[type]}, ${GestureDirectionString[direction]}, fingers: ${fingers}`);

        this._current_gesture = actions.make_action(this.settings, definition_match, device);
        this._current_gesture.begin(direction, percentage, elapsed_time);

    }

    _gesture_update(type, direction, percentage, fingers, device, elapsed_time) {
        this.signal_handler_id = 0;
        if (this._current_gesture == null) {
            global.logWarning("Gesture update but there's no current one.");
            return;
        }

        const def  = this._lookup_definition(type, direction, fingers);
        if (def == null || this._current_gesture == null || def !== this._current_gesture.definition) {
            this._current_gesture = null;
            global.logWarning("Invalid gesture update received, clearing current gesture");
            return;
        }

        debug_gesture(`Gesture update: ${GestureDirectionString[direction]}, progress: ${parseInt(percentage)}`);

        this._current_gesture.update(direction, percentage, elapsed_time);
    }

    _gesture_end(type, direction, percentage, fingers, device, elapsed_time) {
        this.signal_handler_id = 0;
        const def  = this._lookup_definition(type, direction, fingers);
        if (def == null || this._current_gesture == null || def !== this._current_gesture.definition) {
            global.logWarning("Invalid gesture end received, clearing current gesture");
            return;
        }

        debug_gesture(`${GestureTypeString[type]} end: progress: ${parseInt(percentage)} (threshold: ${this._current_gesture.threshold})`);

        if (percentage < this._current_gesture.threshold) {
            debug_gesture(`Gesture threshold not met`);
            this._current_gesture = null;
            return;
        }

        this._current_gesture.end(direction, percentage, elapsed_time)
        this._current_gesture = null;
    }

    _kill_touchegg() {
        global.log("Looking for existing touchegg client");
        Util.spawnCommandLineAsyncIO(
            "lslocks --json --output COMMAND,PID",
            (stdout, stderr, code) => {
                const json = JSON.parse(stdout);
                for (let pinfo of json.locks) {
                    if (pinfo.command === "touchegg") {
                        global.log(`Killing touchegg client (pid ${pinfo.pid})`);
                        Util.spawnCommandLineAsync(`kill ${pinfo.pid}`);
                    }
                }
            }
        );
    }

}

