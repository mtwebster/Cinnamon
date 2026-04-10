// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;

const Main = imports.ui.main;
const Workspace = imports.ui.workspace;

var WORKSPACE_SWITCH_TIME = 250;

var SwipeScrollDirection = {
    NONE: 0,
    HORIZONTAL: 1,
    VERTICAL: 2
};

var SwipeScrollResult = {
    CANCEL: 0,
    SWIPE: 1,
    CLICK: 2
};

var WorkspacesView = GObject.registerClass({
    Signals: {
        'sticky-detected': { param_types: [GObject.TYPE_OBJECT] },
    },
}, class WorkspacesView extends St.Widget {
    _init(workspaces) {
        super._init({ style_class: 'workspaces-view' });

        // The actor itself isn't a drop target, so we don't want to pick on its area
        this.set_size(0, 0);

        this.connect('destroy', this._onDestroy.bind(this));

        // does not work:
        // this.connect('scroll-event', this._onScrollEvent.bind(this));

        this.connect('style-changed', () => {
            let node = this.get_theme_node();
            this._spacing = node.get_length('spacing');
            this._updateWorkspaceActors(false);
        });
        this.connect('notify::mapped', this._onMappedChanged.bind(this));

        this._width = 0;
        this._height = 0;
        this._x = 0;
        this._y = 0;
        this._workspaceRatioSpacing = 0;
        this._spacing = 0;
        this._animating = false; // tweening
        this._scrolling = false; // swipe-scrolling
        this._animatingScroll = false; // programmatically updating the adjustment

        this._keyIsHandled = true;

        let activeWorkspaceIndex = global.workspace_manager.get_active_workspace_index();
        this._workspaces = [];
        for (let i = 0; i < global.workspace_manager.n_workspaces; i++) {
            let metaWorkspace = global.workspace_manager.get_workspace_by_index(i);
            this._workspaces[i] = new Workspace.Workspace(metaWorkspace, this);
            this.add_child(this._workspaces[i]);
        }
        this._workspaces[activeWorkspaceIndex].raise_top();

        // Position/scale the desktop windows and their children after the
        // workspaces have been created. This cannot be done first because
        // window movement depends on the Workspaces object being accessible
        // as an Overview member.
        let overviewShowingId = Main.overview.connect('showing', () => {
            Main.overview.disconnect(overviewShowingId);
            for(let workspace of this._workspaces)
                workspace.zoomToOverview();
        });

        this._scrollAdjustment = new St.Adjustment({ value: activeWorkspaceIndex,
                                                     lower: 0,
                                                     page_increment: 1,
                                                     page_size: 1,
                                                     step_increment: 0,
                                                     upper: this._workspaces.length });
        this._scrollAdjustment.connect('notify::value', this._onScroll.bind(this));


        this._swipeScrollBeginId = 0;
        this._swipeScrollEndId = 0;

        global.display.connectObject(
            'restacked', this._onRestacked.bind(this), this);
        global.window_manager.connectObject(
            'switch-workspace', this._activeWorkspaceChanged.bind(this), this);
        global.workspace_manager.connectObject(
            'notify::n-workspaces', this._workspacesChanged.bind(this), this);

        this._onRestacked();
        this.connect('key-press-event', this._onStageKeyPress.bind(this));
        this.connect('key-release-event', this._onStageKeyRelease.bind(this));
        global.stage.set_key_focus(this);

        let primary = Main.layoutManager.primaryMonitor;
        this.setGeometry(primary.x, primary.y, primary.width, primary.height, 0);
    }

    _onStageKeyPress(actor, event) {
        let activeWorkspaceIndex = global.workspace_manager.get_active_workspace_index();
        let activeWorkspace = this._workspaces[activeWorkspaceIndex];
        this._keyIsHandled = activeWorkspace._onKeyPress(actor, event);
        return this._keyIsHandled;
    }

    _onStageKeyRelease(actor, event) {
        if (this._keyIsHandled)
            return false;

        let modifiers = Cinnamon.get_event_state(event);
        let symbol = event.get_key_symbol();

        switch (symbol) {
            case Clutter.KEY_Escape:
            case Clutter.KEY_Super_L:
            case Clutter.KEY_Super_R:
                Main.overview.hide();
                return true;
            default:
                return false;
        }
    }

    setGeometry(x, y, width, height, spacing) {
        this._width = width;
        this._height = height;
        this._x = x;
        this._y = y;
        this._workspaceRatioSpacing = spacing;
    }

    getActiveWorkspace() {
        let active = global.workspace_manager.get_active_workspace_index();
        return this._workspaces[active];
    }

    getWorkspaceByIndex(index) {
        return this._workspaces[index];
    }

    hide() {
        let activeWorkspaceIndex = global.workspace_manager.get_active_workspace_index();
        let activeWorkspace = this._workspaces[activeWorkspaceIndex];

        activeWorkspace.raise_top();
        activeWorkspace.zoomFromOverview();
    }

    destroy() {
        if (this._swipeScrollBeginId > 0) {
            Main.overview.disconnect(this._swipeScrollBeginId);
            this._swipeScrollBeginId = 0;
        }
        if (this._swipeScrollEndId > 0) {
            Main.overview.disconnect(this._swipeScrollEndId);
            this._swipeScrollEndId = 0;
        }

        for (let w = 0; w < this._workspaces.length; w++) {
            this._workspaces[w].destroy();
        }
        this._workspaces = [];
        super.destroy();
    }

    updateWindowPositions() {
        for (let w = 0; w < this._workspaces.length; w++)
            this._workspaces[w].positionWindows(Workspace.WindowPositionFlags.ANIMATE);
    }

    _scrollToActive(showAnimation) {
        let active = global.workspace_manager.get_active_workspace_index();

        this._updateWorkspaceActors(showAnimation);
        Main.wm.showWorkspaceOSD();
        this._updateScrollAdjustment(active, showAnimation);
    }

    // Update workspace actors parameters
    // @showAnimation: iff %true, transition between states
    _updateWorkspaceActors(showAnimation) {
        let active = global.workspace_manager.get_active_workspace_index();

        // Animation is turned off in a multi-manager scenario till we fix
        // the animations so that they respect the monitor boundaries.
        this._animating = Main.layoutManager.monitors.length < 2 && showAnimation;

        for (let w = 0; w < this._workspaces.length; w++) {
            let workspace = this._workspaces[w];

            workspace.remove_all_transitions();

            let x = (w - active) * (this._width + this._spacing + this._workspaceRatioSpacing);

            if (this._animating) {
                let params = { x: x,
                               duration: WORKSPACE_SWITCH_TIME,
                               mode: Clutter.AnimationMode.EASE_OUT_QUAD
                             };
                // we have to call _updateVisibility() once before the
                // animation and once afterwards - it does not really
                // matter which tween we use, so we pick the first one ...
                if (w == 0) {
                    this._updateVisibility();
                    params.onComplete = () => {
                            this._animating = false;
                            this._updateVisibility();
                    };
                }

                workspace.ease(params);
            } else if (!workspace.is_finalized()) {
                workspace.set_position(x, 0);
                if (w == 0)
                    this._updateVisibility();
            }
        }
    }

    _updateVisibility() {
        let active = global.workspace_manager.get_active_workspace_index();

        for (let w = 0; w < this._workspaces.length; w++) {
            let workspace = this._workspaces[w];
            if (this._animating || this._scrolling) {
                workspace.hideWindowsOverlays();
                workspace.show();
            } else if (!workspace.is_finalized()) {
                workspace.showWindowsOverlays();
                workspace.visible = (w == active);
            }
        }
    }

    _updateScrollAdjustment(index, showAnimation) {
        if (this._scrolling)
            return;

        this._animatingScroll = true;

        if (showAnimation) {
            this._scrollAdjustment.ease({
                value: index,
                duration: WORKSPACE_SWITCH_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._animatingScroll = false;
                }
            });
        } else {
            this._scrollAdjustment.value = index;
            this._animatingScroll = false;
        }
        let active = global.workspace_manager.get_active_workspace_index();
        this._workspaces[active].zoomToOverview();
    }

    _workspacesChanged() {
        let removedCount = 0;
        this._workspaces.slice().forEach(function(workspace, i) {
            let metaWorkspace = global.workspace_manager.get_workspace_by_index(i - removedCount);
            if (workspace.metaWorkspace != metaWorkspace) {
                workspace.remove_all_transitions();
                workspace.destroy();
                this._workspaces.splice(i - removedCount, 1);
                ++removedCount;
            }
        }, this);

        while (global.workspace_manager.n_workspaces > this._workspaces.length) {
            let lastWs = global.workspace_manager.get_workspace_by_index(this._workspaces.length);
            let workspace = new Workspace.Workspace(lastWs, this);
            this._workspaces.push(workspace);
            this.add_child(workspace);
        }
        this._animating = false;
        this._updateVisibility();
    }

    _activeWorkspaceChanged(wm, from, to, direction) {
        if (this._scrolling)
            return;

        this._keyIsHandled = true;

        this._scrollToActive(true);
    }

    _onDestroy() {
        this._scrollAdjustment.run_dispose();
    }

    _onMappedChanged() {
        if (this.mapped) {
            let direction = SwipeScrollDirection.HORIZONTAL;
            Main.overview.setScrollAdjustment(this._scrollAdjustment,
                                              direction);
            this._swipeScrollBeginId = Main.overview.connect('swipe-scroll-begin',
                                                             this._swipeScrollBegin.bind(this));
            this._swipeScrollEndId = Main.overview.connect('swipe-scroll-end',
                                                           this._swipeScrollEnd.bind(this));
        }
    }

    _swipeScrollBegin() {
        this._scrolling = true;
    }

    _swipeScrollEnd(overview, result) {
        this._scrolling = false;

        // Close overview on click when there are no windows
        if (result === SwipeScrollResult.CLICK) {
            let active = global.workspace_manager.get_active_workspace_index();
            if (this._workspaces[active].isEmpty())
                Main.overview.hide();
        } else {
            // Make sure title captions etc are shown as necessary
            this._updateVisibility();
        }

    }

    _onRestacked() {
        let stack = global.get_window_actors().reverse();
        let stackIndices = {};

        for (let i = 0; i < stack.length; i++) {
            // Use the stable sequence for an integer to use as a hash key
            stackIndices[stack[i].get_meta_window().get_stable_sequence()] = i;
        }

        for (let j = 0; j < this._workspaces.length; j++)
            this._workspaces[j].syncStacking(stackIndices);
    }

    // sync the workspaces' positions to the value of the scroll adjustment
    // and change the active workspace if appropriate
    _onScroll(adj) {
        if (this._animatingScroll)
            return;

        let active = global.workspace_manager.get_active_workspace_index();
        let current = Math.round(adj.value);

        if (active != current) {
            let metaWorkspace = this._workspaces[current].metaWorkspace;
            metaWorkspace.activate(global.get_current_time());
        }

        let last = this._workspaces.length - 1;
        let firstWorkspaceX = this._workspaces[0].x;
        let lastWorkspaceX = this._workspaces[last].x;
        let workspacesWidth = lastWorkspaceX - firstWorkspaceX;

        if (adj.upper == 1)
            return;

        let currentX = firstWorkspaceX;
        let newX =  - adj.value / (adj.upper - 1) * workspacesWidth;

        let dx = newX - currentX;

        for (let i = 0; i < this._workspaces.length; i++) {
            this._workspaces[i].hideWindowsOverlays();
            this._workspaces[i].visible = Math.abs(i - adj.value) <= 1;
            this._workspaces[i].x += dx;
        }
    }

    _onScrollEvent(actor, event) {
        switch ( event.get_scroll_direction() ) {
        case Clutter.ScrollDirection.UP:
            Main.wm.actionMoveWorkspaceUp();
            break;
        case Clutter.ScrollDirection.DOWN:
            Main.wm.actionMoveWorkspaceDown();
            break;
        }
    }
});
