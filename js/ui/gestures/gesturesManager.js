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
        this.client = new Cinnamon.ToucheggClient();
        // this.client.stablishConnection();
        // this.client = toucheggClient;
        // this.client.stablishConnection();

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
        this.client.connect("gesture-begin", this._gesture_begin.bind(this));
        this.client.connect("gesture-update", this._gesture_update.bind(this));
        this.client.connect("gesture-end", this._gesture_end.bind(this));

        // toucheggClient.connect('begin', this._gesture_begin.bind(this));
        // toucheggClient.connect('update', this._gesture_update.bind(this));
        // toucheggClient.connect('end', this._gesture_end.bind(this));
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

    _gesture_begin(client, type, direction, percentage, fingers, device, elapsed_time) {
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

    _gesture_update(client, type, direction, percentage, fingers, device, elapsed_time) {
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

    _gesture_end(client, type, direction, percentage, fingers, device, elapsed_time) {
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

