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
const { GObject, Cinnamon } = imports.gi;

const gestures = imports.ui.gestures;
const { SwitchWorkspaceAction } = gestures.actions.switchWorkspace;

var actions = [];

class GesturesManagerClass extends GObject.Object {
    static start() {
        actions = [
            new SwitchWorkspaceAction()
        ]
        for (let action of actions) {
            action.enable();
        }
    }

    stop() {
        for (let action of actions) {
            action.disable();
        }
    }
}

var GesturesManager = // eslint-disable-line
  GObject.registerClass(GesturesManagerClass);
