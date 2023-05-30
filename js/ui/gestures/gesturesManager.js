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
const { Gio, GObject, Cinnamon } = imports.gi;
const Util = imports.misc.util;
const gestures = imports.ui.gestures;
const actions = gestures.actions;
const { toucheggClient } = gestures.touchegg.ToucheggClient;
const { GestureType,  GestureDirection, DeviceType } = gestures.touchegg.ToucheggTypes;

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

const DEBUG_GESTURES=false;
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
            this.type = parts[0]; // fix
            this.fingers = parseInt(parts[1]);
        } else {
            this.type = parts[0]; // fix
            this.direction = parts[1]; //fix
            this.fingers = parseInt(parts[2]);
        }
    }
}

var GesturesManager = class {
    constructor(wm) {
        toucheggClient.stablishConnection();

        this.settings = new Gio.Settings({ schema_id: SCHEMA })
        this.settings.connect("changed", () => this.setup_actions());
        this.setup_actions();
        this._current_gesture = null;

        this._kill_touchegg();
        this.connect_client();
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

    connect_client() {
        global.log('Connecting Touchégg client signals');
        toucheggClient.connect('begin', this._gesture_begin.bind(this));
        toucheggClient.connect('update', this._gesture_update.bind(this));
        toucheggClient.connect('end', this._gesture_end.bind(this));
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
        const gesture = this.live_actions.get(key);

        if (gesture === undefined) {
            // no action set for this gesture
            return null;
        }

        if (this._current_gesture != null && gesture !== this._current_gesture) {
            global.logWarning("Gesture mismatch (gesture event does not match starting)");
            return null;
        }

        return gesture;
    }

    _gesture_begin(gesture, type, direction, percentage, fingers, device, time) {
        if (this._current_gesture != null) {
            global.logWarning("New gesture started before another was completed. Clearing the old one");
            this._current_gesture = null;
        }

        const def  = this._lookup_definition(type, direction, fingers);

        debug_gesture(`Gesture started: (${DeviceTypeString[device]}) ${GestureTypeString[type]}, ${GestureDirectionString[direction]}, fingers: ${fingers}`);
        this._current_gesture = def;
    }

    _gesture_update(gesture, type, direction, percentage, fingers, device, time) {
        const def  = this._lookup_definition(type, direction, fingers);
        if (def == null) {
            return;
        }

        debug_gesture(`Gesture update: progress: ${parseInt(percentage)}`);
    }

    _gesture_end(gesture, type, direction, percentage, fingers, device, time) {
        const def  = this._lookup_definition(type, direction, fingers);
        if (def === null) {
            return;
        }

        let reached = false;

        switch (type) {
        case GestureType.SWIPE:
            reached = Math.floor(percentage) >= this.settings.get_uint("swipe-percent-threshold");
            break;
        case GestureType.PINCH:
            reached = Math.floor(percentage) >= this.settings.get_uint("pinch-percent-threshold");
            break;
        case GestureType.TAP:
            reached = true;
            break;
        default:
            break;
        }

        debug_gesture(`${GestureTypeString[type]} end: progress: ${parseInt(percentage)} - activating ${def.action}? ${reached ? "yes" : "no"}`);

        if (reached) {
            actions.do_action(def.action, time);
        }

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

