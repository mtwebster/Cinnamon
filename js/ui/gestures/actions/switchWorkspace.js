// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;

const gestures = imports.ui.gestures;
const { ToucheSwipeTracker } = gestures.ToucheSwipeTracker;
const { GestureType, GestureDirection, DeviceType } = gestures.touchegg.ToucheggTypes;
const { AllowedGesture } = gestures.utils.AllowedGesture;

var SwitchWorkspaceAction = class {
    constructor() {
        this._begin_id = 0;
        this._update_id = 0;
        this._end_id = 0;

        this.allowedGesture = new AllowedGesture(
            GestureType.SWIPE,
            4,
            [GestureDirection.LEFT, GestureDirection.RIGHT],
            [DeviceType.TOUCHPAD, DeviceType.TOUCHSCREEN],
        );

        this.tracker = new ToucheSwipeTracker(
            global.stage,
            Cinnamon.StageInputMode.NORMAL,
            { allowDrag: false, allowScroll: false },
            this.allowedGesture,
        );
    }

    enable() {
        log("enaable");
        this._begin_id = this.tracker.connect('begin', this.action_begin.bind(this));
        this._update_id = this.tracker.connect('update', this.action_update.bind(this));
        this._end_id = this.tracker.connect('end', this.action_end.bind(this));
    }

    disable() {
        if (this._begin_id > 0) {
            this.tracker.disconnect(this._begin_id);
            this._begin_id = 0;
        }
        if (this._update_id > 0) {
            this.tracker.disconnect(this._update_id);
            this._update_id = 0;
        }
        if (this._update_id > 0) {
            this.tracker.disconnect(this._update_id);
            this._update_id = 0;
        }
    }

    action_begin(tracker, monitor) {
        log("begin");
        if (Meta.prefs_get_workspaces_only_on_primary() &&
            monitor !== Main.layoutManager.primaryIndex)
            return;

        let workspaceManager = global.workspace_manager;
        let horiz = workspaceManager.layout_rows !== -1;
        tracker.orientation = horiz
            ? Clutter.Orientation.HORIZONTAL
            : Clutter.Orientation.VERTICAL;

        let activeWorkspace = workspaceManager.get_active_workspace();

        let baseDistance;
        if (horiz)
            baseDistance = global.screen_width;
        else
            baseDistance = global.screen_height;

        let progress;
        // if (this._switchData && this._switchData.gestureActivated) {
        //     this._switchData.container.remove_all_transitions();
        //     if (!horiz)
        //         progress = -this._switchData.container.y / baseDistance;
        //     else if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL)
        //         progress = this._switchData.container.x / baseDistance;
        //     else
        //         progress = -this._switchData.container.x / baseDistance;
        // } else {
            // this._prepareWorkspaceSwitch(activeWorkspace.index(), -1);
            progress = 0;
        // }

        let points = [];
        // let [lower, upper] = this._getProgressRange();

        // if (lower !== 0)
        //     points.push(lower);

        points.push(0);

        // if (upper !== 0)
        //     points.push(upper);

        tracker.confirmSwipe(baseDistance, points, progress, 0);
    }

    _directionForProgress(progress) {
        if (global.workspace_manager.layout_rows === -1) {
            return progress > 0
                ? Meta.MotionDirection.DOWN
                : Meta.MotionDirection.UP;
        } else if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL) {
            return progress > 0
                ? Meta.MotionDirection.LEFT
                : Meta.MotionDirection.RIGHT;
        } else {
            return progress > 0
                ? Meta.MotionDirection.RIGHT
                : Meta.MotionDirection.LEFT;
        }
    }

    action_update(tracker, progress) {
        // if (!this._switchData)
        //     return;

        // let direction = this._directionForProgress(progress);
        // let info = this._switchData.surroundings[direction];
        // let xPos = 0;
        // let yPos = 0;
        // if (info) {
        //     if (global.workspace_manager.layout_rows === -1)
        //         yPos = -Math.round(progress * global.screen_height);
        //     else if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL)
        //         xPos = Math.round(progress * global.screen_width);
        //     else
        //         xPos = -Math.round(progress * global.screen_width);
        // }

        log("udate");
        // this._switchData.container.set_position(xPos, yPos);
    }

    action_end(tracker, duration, endProgress) {
        log("end");
        // if (!this._switchData)
        //     return;

        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();
        let newWs = activeWorkspace;
        let xDest = 0;
        let yDest = 0;
        if (endProgress !== 0) {
            let direction = this._directionForProgress(endProgress);
            newWs = activeWorkspace.get_neighbor(direction);
            // xDest = -this._switchData.surroundings[direction].xDest;
            // yDest = -this._switchData.surroundings[direction].yDest;
        }
        Main.wm.moveToWorkspace(newWs, direction);
        // let switchData = this._switchData;
        // switchData.gestureActivated = true;

        // this._switchData.container.ease({
        //     x: xDest,
        //     y: yDest,
        //     duration,
        //     mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        //     onComplete: () => {
        //         if (newWs !== activeWorkspace)
        //             this.actionMoveWorkspace(newWs);
        //         this._finishWorkspaceSwitch(switchData);
        //     },
        // });
    }
}
