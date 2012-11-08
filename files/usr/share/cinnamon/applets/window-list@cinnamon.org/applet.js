const Applet = imports.ui.applet;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Panel = imports.ui.panel;
const PopupMenu = imports.ui.popupMenu;
const Meta = imports.gi.Meta;
const Tooltips = imports.ui.tooltips;
const DND = imports.ui.dnd;
const Mainloop = imports.mainloop

const PANEL_ICON_SIZE = 24; // this is for the spinner when loading
const DEFAULT_ICON_SIZE = 16; // too bad this can't be defined in theme (cinnamon-app.create_icon_texture returns a clutter actor, not a themable object -
                              // probably something that could be addressed
const SPINNER_ANIMATION_TIME = 1;
const ICON_HEIGHT_FACTOR = .64;


function AppMenuButtonRightClickMenu(actor, metaWindow, orientation) {
    this._init(actor, metaWindow, orientation);
}

AppMenuButtonRightClickMenu.prototype = {
    __proto__: PopupMenu.PopupMenu.prototype,

    _init: function(actor, metaWindow, orientation) {
        //take care of menu initialization        
        PopupMenu.PopupMenu.prototype._init.call(this, actor, 0.0, orientation, 0);        
        Main.uiGroup.add_actor(this.actor);
        //Main.chrome.addActor(this.actor, { visibleInOverview: true,
        //                                   affectsStruts: false });
        this.actor.hide();
        this.window_list = actor._delegate._applet._windows;
        actor.connect('key-press-event', Lang.bind(this, this._onSourceKeyPress));        
        this.connect('open-state-changed', Lang.bind(this, this._onToggled));        

        this.metaWindow = metaWindow;

        this.itemCloseWindow = new PopupMenu.PopupMenuItem(_("Close"));
        this.itemCloseWindow.connect('activate', Lang.bind(this, this._onCloseWindowActivate));        

        this.itemCloseAllWindows = new PopupMenu.PopupMenuItem(_("Close all"));
        this.itemCloseAllWindows.connect('activate', Lang.bind(this, this._onCloseAllActivate));

        this.itemCloseOtherWindows = new PopupMenu.PopupMenuItem(_("Close others"));
        this.itemCloseOtherWindows.connect('activate', Lang.bind(this, this._onCloseOthersActivate));

        if (metaWindow.minimized)
            this.itemMinimizeWindow = new PopupMenu.PopupMenuItem(_("Restore"));
        else
            this.itemMinimizeWindow = new PopupMenu.PopupMenuItem(_("Minimize"));
        this.itemMinimizeWindow.connect('activate', Lang.bind(this, this._onMinimizeWindowActivate));        
        
        this.itemMaximizeWindow = new PopupMenu.PopupMenuItem(_("Maximize"));
        this.itemMaximizeWindow.connect('activate', Lang.bind(this, this._onMaximizeWindowActivate));  
        
        this.itemMoveToLeftWorkspace = new PopupMenu.PopupMenuItem(_("Move to left workspace"));
        this.itemMoveToLeftWorkspace.connect('activate', Lang.bind(this, this._onMoveToLeftWorkspace));
        
        this.itemMoveToRightWorkspace = new PopupMenu.PopupMenuItem(_("Move to right workspace"));
        this.itemMoveToRightWorkspace.connect('activate', Lang.bind(this, this._onMoveToRightWorkspace));      
        
        this.itemOnAllWorkspaces = new PopupMenu.PopupMenuItem(_("Visible on all workspaces"));
        this.itemOnAllWorkspaces.connect('activate', Lang.bind(this, this._toggleOnAllWorkspaces));

        if (orientation == St.Side.BOTTOM) {
            this.addMenuItem(this.itemOnAllWorkspaces);
            this.addMenuItem(this.itemMoveToLeftWorkspace);
            this.addMenuItem(this.itemMoveToRightWorkspace);
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.addMenuItem(this.itemCloseAllWindows);
            this.addMenuItem(this.itemCloseOtherWindows);
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.addMenuItem(this.itemMinimizeWindow);
            this.addMenuItem(this.itemMaximizeWindow);            
            this.addMenuItem(this.itemCloseWindow);                        
        }
        else {
            this.addMenuItem(this.itemCloseWindow);            
            this.addMenuItem(this.itemMaximizeWindow);
            this.addMenuItem(this.itemMinimizeWindow);
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.addMenuItem(this.itemCloseOtherWindows);
            this.addMenuItem(this.itemCloseAllWindows);
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.addMenuItem(this.itemMoveToLeftWorkspace);
            this.addMenuItem(this.itemMoveToRightWorkspace);
            this.addMenuItem(this.itemOnAllWorkspaces);
        }
     },

     _onToggled: function(actor, event){
	if (!event)
            return;

	if (this.metaWindow.is_on_all_workspaces()) {
            this.itemOnAllWorkspaces.label.set_text(_("Only on this workspace"));
            this.itemMoveToLeftWorkspace.actor.hide();
            this.itemMoveToRightWorkspace.actor.hide();
        } else {
            this.itemOnAllWorkspaces.label.set_text(_("Visible on all workspaces"));
            if (this.metaWindow.get_workspace().get_neighbor(Meta.MotionDirection.LEFT) != this.metaWindow.get_workspace())
                this.itemMoveToLeftWorkspace.actor.show();
            else
                this.itemMoveToLeftWorkspace.actor.hide();
            
            if (this.metaWindow.get_workspace().get_neighbor(Meta.MotionDirection.RIGHT) != this.metaWindow.get_workspace())
                this.itemMoveToRightWorkspace.actor.show();
            else
                this.itemMoveToRightWorkspace.actor.hide();
        }
        if (this.metaWindow.get_maximized()) {
            this.itemMaximizeWindow.label.set_text(_("Unmaximize"));
        }else{
            this.itemMaximizeWindow.label.set_text(_("Maximize"));
        }
    },
    
    _onWindowMinimized: function(actor, event){
    },

    _onCloseWindowActivate: function(actor, event){
        this.metaWindow.delete(global.get_current_time());
        this.destroy();
    },

    _onCloseAllActivate: function(actor, event) {
        let metas = new Array();
        for (let i = 0; i < this.window_list.length; i++) {
            if (this.window_list[i].actor.visible && !this.window_list[i]._needsAttention) {
                metas.push(this.window_list[i].metaWindow);
            }
        }
        metas.forEach(Lang.bind(this, function(window) {
            window.delete(global.get_current_time());
            }));
    },

    _onCloseOthersActivate: function(actor, event) {
        let metas = new Array();
        for (let i = 0; i < this.window_list.length; i++) {
            if (this.window_list[i].metaWindow != this.metaWindow &&
                                this.window_list[i].actor.visible &&
                                !this.window_list[i]._needsAttention) {
                metas.push(this.window_list[i].metaWindow);
            }
        }
        metas.forEach(Lang.bind(this, function(window) {
            window.delete(global.get_current_time());
            }));
    },

    _onMinimizeWindowActivate: function(actor, event){
        if (this.metaWindow.minimized) {
            this.metaWindow.unminimize(global.get_current_time());
            this.metaWindow.activate(global.get_current_time());
        }
        else {
            this.metaWindow.minimize(global.get_current_time());
        }
    },

    _onMaximizeWindowActivate: function(actor, event){      
        if (this.metaWindow.get_maximized()){
            this.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
        }else{
            this.metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
        }
    },
    
    _onMoveToLeftWorkspace: function(actor, event){
        let workspace = this.metaWindow.get_workspace().get_neighbor(Meta.MotionDirection.LEFT); 
        if (workspace) {
            this.actor.destroy();
            this.metaWindow.change_workspace(workspace);
            Main._checkWorkspaces();
        }
    },

    _onMoveToRightWorkspace: function(actor, event){
        let workspace = this.metaWindow.get_workspace().get_neighbor(Meta.MotionDirection.RIGHT); 
        if (workspace) {
            this.actor.destroy();
            this.metaWindow.change_workspace(workspace);
            Main._checkWorkspaces();
        }
    },

    _toggleOnAllWorkspaces: function(actor, event) {
        if (this.metaWindow.is_on_all_workspaces())
            this.metaWindow.unstick();
        else
            this.metaWindow.stick();
    },

    _onSourceKeyPress: function(actor, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_space || symbol == Clutter.KEY_Return) {
            this.menu.toggle();
            return true;
        } else if (symbol == Clutter.KEY_Escape && this.menu.isOpen) {
            this.menu.close();
            return true;
        } else if (symbol == Clutter.KEY_Down) {
            if (!this.menu.isOpen)
                this.menu.toggle();
            this.menu.actor.navigate_focus(this.actor, Gtk.DirectionType.DOWN, false);
            return true;
        } else
            return false;
    }

};

function AppMenuButton(applet, metaWindow, animation, orientation, panel_height, draggable) {
    this._init(applet, metaWindow, animation, orientation, panel_height, draggable);
}

AppMenuButton.prototype = {
//    __proto__ : AppMenuButton.prototype,

    
    _init: function(applet, metaWindow, animation, orientation, panel_height, draggable) {
               
        this.actor = new St.Bin({ style_class: 'window-list-item-box',
								  reactive: true,
								  can_focus: true,
								  x_fill: true,
								  y_fill: false,
								  track_hover: true });
								  
	if (orientation == St.Side.TOP) 
		this.actor.add_style_class_name('window-list-item-box-top');
	else
		this.actor.add_style_class_name('window-list-item-box-bottom');
      
        this.actor._delegate = this;
        this.actor.connect('button-release-event', Lang.bind(this, this._onButtonRelease));

		this.metaWindow = metaWindow;	

        this._applet = applet;
        let bin = new St.Bin({ name: 'appMenu' });
        this.actor.set_child(bin);

        this._container = new Cinnamon.GenericContainer();
        bin.set_child(this._container);
        this._container.connect('get-preferred-width',
								Lang.bind(this, this._getContentPreferredWidth));
        this._container.connect('get-preferred-height',
								Lang.bind(this, this._getContentPreferredHeight));
        this._container.connect('allocate', Lang.bind(this, this._contentAllocate));

        
        this._iconBox = new Cinnamon.Slicer({ name: 'appMenuIcon' });
        this._iconBox.connect('style-changed',
                              Lang.bind(this, this._onIconBoxStyleChanged));
        this._iconBox.connect('notify::allocation',
                              Lang.bind(this, this._updateIconBoxClip));
        this._container.add_actor(this._iconBox);
        this._label = new St.Label();
        this._container.add_actor(this._label);

        this._iconBottomClip = 0;
		if (!Main.overview.visible || !Main.expo.visible)
        	this._visible = true;
		else
			this._visible = false;
        if (!this._visible)
            this.actor.hide();
        Main.overview.connect('hiding', Lang.bind(this, function () {
            this.show();
        }));
        Main.overview.connect('showing', Lang.bind(this, function () {
            this.hide();
        }));
		Main.expo.connect('hiding', Lang.bind(this, function () {
            this.show();
        }));
        Main.expo.connect('showing', Lang.bind(this, function () {
            this.hide();
        }));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
        
        this._updateCaptionId = this.metaWindow.connect('notify::title', Lang.bind(this, function () {
            let title = this.getDisplayTitle();
            this._label.set_text(title);
            if (this._tooltip) this._tooltip.set_text(title);
        }));
                
        this._spinner = new Panel.AnimatedIcon('process-working.svg', PANEL_ICON_SIZE);
        this._container.add_actor(this._spinner.actor);
        this._spinner.actor.lower_bottom();

        let tracker = Cinnamon.WindowTracker.get_default();
        this.app = tracker.get_window_app(this.metaWindow);
        if (global.settings.get_boolean('panel-scale-text-icons') && global.settings.get_boolean('panel-resizable')) {
            this.iconSize = Math.round(panel_height * ICON_HEIGHT_FACTOR);
        } else {
            this.iconSize = DEFAULT_ICON_SIZE;
        }

        let icon = this.app ?
                            this.app.create_icon_texture(this.iconSize) :
                            new St.Icon({ icon_name: 'application-default-icon',
                                         icon_type: St.IconType.FULLCOLOR,
                                         icon_size: this.iconSize });
        let title = this.getDisplayTitle();
        if (metaWindow.minimized)
            this._label.set_text("[" + title + "]");
        else
            this._label.set_text(title);
        this._iconBox.set_child(icon);
        if(animation){
			this.startAnimation(); 
			this.stopAnimation();
		}
		

        this._tooltip = new Tooltips.PanelItemTooltip(this, title, orientation);
        if (draggable) {
            //set up the right click menu
            this._menuManager = new PopupMenu.PopupMenuManager(this);
            this.rightClickMenu = new AppMenuButtonRightClickMenu(this.actor, this.metaWindow, orientation);
            this._menuManager.addMenu(this.rightClickMenu);

            this._draggable = DND.makeDraggable(this.actor);
            this._draggable.connect('drag-begin', Lang.bind(this, this._onDragBegin));
            this._draggable.connect('drag-cancelled', Lang.bind(this, this._onDragCancelled));
            this._draggable.connect('drag-end', Lang.bind(this, this._onDragEnd));
        } else {
            this._draggable = null;
        }
        this.on_panel_edit_mode_changed();
        global.settings.connect('changed::panel-edit-mode', Lang.bind(this, this.on_panel_edit_mode_changed));
        global.settings.connect('changed::window-list-applet-scroll', Lang.bind(this, this.on_scroll_mode_changed));
        this.window_list = this.actor._delegate._applet._windows;
        this.alert_list = this.actor._delegate._applet._alertWindows;
        this.scroll_connector = null;
        this.on_scroll_mode_changed();
        this._needsAttention = false;
    },
    
    on_panel_edit_mode_changed: function() {
        if (this._draggable) {
            this._draggable.inhibit = global.settings.get_boolean("panel-edit-mode");
        }
    }, 

    on_scroll_mode_changed: function() {
        let scrollable = global.settings.get_boolean("window-list-applet-scroll");
        if (scrollable) {
            this.scroll_connector = this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));
        } else {
            if (this.scroll_connector) {
                this.actor.disconnect(this.scroll_connector);
                this.scroll_connector = null;
            }
        }
    },

    _onScrollEvent: function(actor, event) {
        let direction = event.get_scroll_direction();
        let current;
        let vis_windows = new Array();
        for (let i = 0; i < this.window_list.length; i++) {
            if (this.window_list[i].actor.visible) {
                vis_windows.push(i);
            }
        }
        let num_windows = vis_windows.length;
        for (let i = 0; i < num_windows; i++) {
            if (this.window_list[vis_windows[i]].metaWindow.has_focus()) {
                current = i;
                break;
            }
        }
        let target;
        if (direction == 1) {
            target = ((current - 1) >= 0) ? (current - 1) : (num_windows - 1);
        }
        if (direction == 0) {
            target = ((current + 1) <= num_windows - 1) ? (current + 1) : 0;
        }
        this.window_list[vis_windows[target]].metaWindow.activate(global.get_current_time());
    },

    _onDragBegin: function() {
        this._tooltip.hide();
        this._tooltip.preventShow = true;
    },

    _onDragEnd: function() {
        this._applet.myactorbox._clearDragPlaceholder();
        this._tooltip.preventShow = false;
    },

    _onDragCancelled: function() {
        this._applet.myactorbox._clearDragPlaceholder();
        this._tooltip.preventShow = false;
    },

    getDisplayTitle: function() {
        let title = this.metaWindow.get_title();
        if (!title) title = this.app ? this.app.get_name() : '?';
        return title;
    },

    _onDestroy: function() {
        this.metaWindow.disconnect(this._updateCaptionId);
        this._tooltip.destroy();
        if (this.rightClickMenu) {
            this.rightClickMenu.destroy();
        }
    },
    
    doFocus: function() {
        let tracker = Cinnamon.WindowTracker.get_default();
        let app = tracker.get_window_app(this.metaWindow);
        if ( app ) {
            let icon = app.create_icon_texture(this.iconSize);
            this._iconBox.set_child(icon);
        }
        if (this.metaWindow.has_focus() && !this.metaWindow.minimized) {
            this.actor.add_style_pseudo_class('focus');
            this.actor.remove_style_class_name("window-list-item-demands-attention");
            this.actor.remove_style_class_name("window-list-item-demands-attention-top");
            this._needsAttention = false;
            this._removeAlerts(this.metaWindow);
        } else {
            this.actor.remove_style_pseudo_class('focus');
        }
    },
    
    _onButtonRelease: function(actor, event) {
        this._tooltip.hide();
        if (!this._draggable) {
            if ( Cinnamon.get_event_state(event) & Clutter.ModifierType.BUTTON1_MASK ) {
                this._windowHandle(false);
            }
            return;
        }
        if ( Cinnamon.get_event_state(event) & Clutter.ModifierType.BUTTON1_MASK ) {
            if ( this.rightClickMenu.isOpen ) {
                this.rightClickMenu.toggle();
            }
            this._windowHandle(false);
        } else if (Cinnamon.get_event_state(event) & Clutter.ModifierType.BUTTON2_MASK) {
            this.metaWindow.delete(global.get_current_time());
        } else if (Cinnamon.get_event_state(event) & Clutter.ModifierType.BUTTON3_MASK) {
            this.rightClickMenu.mouseEvent = event;
            this.rightClickMenu.toggle();   
        }   
    },

    _windowHandle: function(fromDrag){
        if ( this.metaWindow.has_focus() ) {
            if (fromDrag){
                return;
            }

            
            this.metaWindow.minimize(global.get_current_time());
            this.actor.remove_style_pseudo_class('focus');
        }
        else {
            if (this.metaWindow.minimized) {
                this.metaWindow.unminimize(global.get_current_time()); 
            }
            let ws = this.metaWindow.get_workspace().index()
            if (ws != global.screen.get_active_workspace_index()) {
                global.screen.get_workspace_by_index(ws).activate(global.get_current_time());
            }
            this.metaWindow.activate(global.get_current_time());
            this.actor.add_style_pseudo_class('focus');
            this._removeAlerts(this.metaWindow);
        }
    },

    _removeAlerts: function(metaWindow) {
        for (let i = 0; i < this.alert_list.length; i++) {
            if (metaWindow == this.alert_list[i].metaWindow) {
                let alert = this.alert_list[i];
                if (alert.actor.get_parent()) {
                    alert.actor.get_parent().remove_actor(alert.actor);
                }
                alert.actor.destroy();
                this.alert_list.splice(i, 1);
            }
        }
    },

    handleDragOver: function(source, actor, x, y, time) {
        if (source instanceof AppMenuButton) return DND.DragMotionResult.CONTINUE;
        
        if (typeof(this._applet.dragEnterTime) == 'undefined') {
            this._applet.dragEnterTime = time;
        } else {
            if (time > (this._applet.dragEnterTime + 3000))
            {
                this._applet.dragEnterTime = time;
            }
        }
                
        if (time > (this._applet.dragEnterTime + 300)) {
            this._windowHandle(true);
        }
        return DND.DragMotionResult.NO_DROP;
    },
    
    acceptDrop: function(source, actor, x, y, time) {
        return false;
    },
    
    show: function() {
        if (this._visible)
            return;
        this._visible = true;
        this.actor.show();
    },

    hide: function() {
        if (!this._visible)
            return;
        this._visible = false;
        this.actor.hide();
    },

    _onIconBoxStyleChanged: function() {
        let node = this._iconBox.get_theme_node();
        this._iconBottomClip = node.get_length('app-icon-bottom-clip');
        this._updateIconBoxClip();
    },

    _updateIconBoxClip: function() {
        let allocation = this._iconBox.allocation;
       if (this._iconBottomClip > 0)
           this._iconBox.set_clip(0, 0,
                                 allocation.x2 - allocation.x1,
                                   allocation.y2 - allocation.y1 - this._iconBottomClip);
        else
            this._iconBox.remove_clip();
    },

    stopAnimation: function() {
        Tweener.addTween(this._spinner.actor,
                         { opacity: 0,
                           time: SPINNER_ANIMATION_TIME,
                           transition: "easeOutQuad",
                           onCompleteScope: this,
                           onComplete: function() {
                               this._spinner.actor.opacity = 255;
                               this._spinner.actor.hide();
                           }
                         });
    },

    startAnimation: function() {
        this._spinner.actor.show();
    },

    _getContentPreferredWidth: function(actor, forHeight, alloc) {
        let [minSize, naturalSize] = this._iconBox.get_preferred_width(forHeight);
        alloc.min_size = minSize; // minimum size just enough for icon if we ever get that many apps going
        alloc.natural_size = naturalSize;
        [minSize, naturalSize] = this._label.get_preferred_width(forHeight);
	alloc.min_size = alloc.min_size + Math.max(0, minSize - Math.floor(alloc.min_size / 2));
        alloc.natural_size = 150;
    },

    _getContentPreferredHeight: function(actor, forWidth, alloc) {
        let [minSize, naturalSize] = this._iconBox.get_preferred_height(forWidth);
        alloc.min_size = minSize;
        alloc.natural_size = naturalSize;
        [minSize, naturalSize] = this._label.get_preferred_height(forWidth);
        if (minSize > alloc.min_size)
            alloc.min_size = minSize;
        if (naturalSize > alloc.natural_size)
            alloc.natural_size = naturalSize;
    },

    _contentAllocate: function(actor, box, flags) {
        let allocWidth = box.x2 - box.x1;
        let allocHeight = box.y2 - box.y1;
        let childBox = new Clutter.ActorBox();

        let [minWidth, minHeight, naturalWidth, naturalHeight] = this._iconBox.get_preferred_size();

        let direction = this.actor.get_text_direction();

        let yPadding = Math.floor(Math.max(0, allocHeight - naturalHeight) / 2);
        childBox.y1 = yPadding;
        childBox.y2 = childBox.y1 + Math.min(naturalHeight, allocHeight);
        if (direction == Clutter.TextDirection.LTR) {
            childBox.x1 = 3;
            childBox.x2 = childBox.x1 + Math.min(naturalWidth, allocWidth);
        } else {
            childBox.x1 = Math.max(0, allocWidth - naturalWidth);
            childBox.x2 = allocWidth;
        }
        this._iconBox.allocate(childBox, flags);

        let iconWidth = this.iconSize;

        [minWidth, minHeight, naturalWidth, naturalHeight] = this._label.get_preferred_size();

        yPadding = Math.floor(Math.max(0, allocHeight - naturalHeight) / 2);
        childBox.y1 = yPadding;
        childBox.y2 = childBox.y1 + Math.min(naturalHeight, allocHeight);

        if (direction == Clutter.TextDirection.LTR) {
            childBox.x1 = Math.floor(iconWidth + 5);
            childBox.x2 = Math.min(childBox.x1 + naturalWidth, allocWidth);
        } else {
            childBox.x2 = allocWidth - Math.floor(iconWidth + 3);
            childBox.x1 = Math.max(0, childBox.x2 - naturalWidth);
        }
        this._label.allocate(childBox, flags);

        if (direction == Clutter.TextDirection.LTR) {
            childBox.x1 = Math.floor(iconWidth / 2) + this._label.width;
            childBox.x2 = childBox.x1 + this._spinner.actor.width;
            childBox.y1 = box.y1;
            childBox.y2 = box.y2 - 1;
            this._spinner.actor.allocate(childBox, flags);
        } else {
            childBox.x1 = -this._spinner.actor.width;
            childBox.x2 = childBox.x1 + this._spinner.actor.width;
            childBox.y1 = box.y1;
            childBox.y2 = box.y2 - 1;
            this._spinner.actor.allocate(childBox, flags);
        }
    },
    
    getDragActor: function() {
        return new Clutter.Clone({ source: this.actor });
    },

    // Returns the original actor that should align with the actor
    // we show as the item is being dragged.
    getDragActorSource: function() {
        return this.actor;
    },

    getAttention: function() {
        if (this._needsAttention) {
            return false;
        }
        this._needsAttention = true;
        let counter = 0;
        this._flashButton(counter);
        return true;
    },

    _flashButton: function(counter) {
        if (!this._needsAttention) {
            return;
        }
        this.actor.add_style_class_name("window-list-item-demands-attention");
        if (counter < 4) {
            Mainloop.timeout_add(500, Lang.bind(this, function () {
                if (this.actor.has_style_class_name("window-list-item-demands-attention")) {
                    this.actor.remove_style_class_name("window-list-item-demands-attention");
                }
                Mainloop.timeout_add(500, Lang.bind(this, function () {
                    this._flashButton(++counter)
                }));
            }));
        }
    }
};

function MyAppletBox(applet) {
    this._init(applet);
}

MyAppletBox.prototype = {
    _init: function(applet) {
        this.actor = new St.BoxLayout({ name: 'windowList',
                                        style_class: 'window-list-box' });
        this.actor._delegate = this;
        
        this._applet = applet;
        
        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._animatingPlaceholdersCount = 0;
    },
    
    handleDragOver: function(source, actor, x, y, time) {
        if (!(source instanceof AppMenuButton)) return DND.DragMotionResult.NO_DROP;
        
        let children = this.actor.get_children();
        let windowPos = children.indexOf(source.actor);
        
        let pos = 0;
        
        for (var i in children){
            if (x > children[i].get_allocation_box().x1 + children[i].width / 2) pos = i;
        }
        
        if (pos != this._dragPlaceholderPos) {            
            this._dragPlaceholderPos = pos;

            // Don't allow positioning before or after self
            if (windowPos != -1 && pos == windowPos) {
                if (this._dragPlaceholder) {
                    this._dragPlaceholder.animateOutAndDestroy();
                    this._animatingPlaceholdersCount++;
                    this._dragPlaceholder.actor.connect('destroy',
                        Lang.bind(this, function() {
                            this._animatingPlaceholdersCount--;
                        }));
                }
                this._dragPlaceholder = null;

                return DND.DragMotionResult.CONTINUE;
            }

            // If the placeholder already exists, we just move
            // it, but if we are adding it, expand its size in
            // an animation
            let fadeIn;
            if (this._dragPlaceholder) {
                this._dragPlaceholder.actor.destroy();
                fadeIn = false;
            } else {
                fadeIn = true;
            }

            this._dragPlaceholder = new DND.GenericDragPlaceholderItem();
            this._dragPlaceholder.child.set_width (source.actor.width);
            this._dragPlaceholder.child.set_height (source.actor.height);
            this.actor.insert_actor(this._dragPlaceholder.actor,
                                        this._dragPlaceholderPos);
            if (fadeIn)
                this._dragPlaceholder.animateIn();
        }
        
        return DND.DragMotionResult.MOVE_DROP;
    },
    
    acceptDrop: function(source, actor, x, y, time) {  
        if (!(source instanceof AppMenuButton)) return false;
        
        this.actor.move_child(source.actor, this._dragPlaceholderPos);
        
        this._clearDragPlaceholder();
        actor.destroy();
        
        return true;
    },
    
    _clearDragPlaceholder: function() {        
        if (this._dragPlaceholder) {
            this._dragPlaceholder.animateOutAndDestroy();
            this._dragPlaceholder = null;
            this._dragPlaceholderPos = -1;
        }
    }
}

function MyAppletAlertBox(applet) {
    this._init(applet);
}

MyAppletAlertBox.prototype = {
    _init: function(applet) {
        this.actor = new St.BoxLayout({ name: 'windowList',
                                        style_class: 'window-list-box' });
        this.actor._delegate = this;
        this._applet = applet;
    },
}

function MyApplet(orientation, panel_height) {
    this._init(orientation, panel_height);
}

MyApplet.prototype = {
    __proto__: Applet.Applet.prototype,

    _init: function(orientation, panel_height) {        
        Applet.Applet.prototype._init.call(this, orientation, panel_height);
        this.actor.set_track_hover(false);
        try {                    
            this.orientation = orientation;
            this.dragInProgress = false;

            this.myactorbox = new MyAppletBox(this);
            this.leftAlertBox = new MyAppletAlertBox(this);
            this.rightAlertBox = new MyAppletAlertBox(this);

            this.myactor = this.myactorbox.actor;

            this.actor.add(this.leftAlertBox.actor);
            this.actor.add(this.myactor);
            this.actor.add(this.rightAlertBox.actor);

            this.actor.reactive = global.settings.get_boolean("panel-edit-mode");
            this.on_orientation_changed(orientation);

            this._windows = new Array();
            this._alertWindows = new Array();
            let tracker = Cinnamon.WindowTracker.get_default();
            tracker.connect('notify::focus-app', Lang.bind(this, this._onFocus));

            this.switchWorkspaceHandler = global.window_manager.connect('switch-workspace',
                                            Lang.bind(this, this._refreshItems));
            global.window_manager.connect('minimize',
                                            Lang.bind(this, this._onMinimize));
            global.window_manager.connect('maximize',
                                            Lang.bind(this, this._onMaximize));
            global.window_manager.connect('unmaximize',
                                            Lang.bind(this, this._onMaximize));
            global.window_manager.connect('map',
                                            Lang.bind(this, this._onMap));
                                            
            Main.expo.connect('showing', Lang.bind(this, 
	    					function(){	global.window_manager.disconnect(this.switchWorkspaceHandler);}));
	    	Main.expo.connect('hidden', Lang.bind(this, 
							function(){	this.switchWorkspaceHandler=global.window_manager.connect('switch-workspace', 
												Lang.bind(this, this._refreshItems)); 
												this._refreshItems();}));

	    	Main.overview.connect('showing', Lang.bind(this, 
							function(){	global.window_manager.disconnect(this.switchWorkspaceHandler);}));
	    	Main.overview.connect('hidden', Lang.bind(this, 
							function(){	this.switchWorkspaceHandler=global.window_manager.connect('switch-workspace', 
												Lang.bind(this, this._refreshItems)); 
												this._refreshItems();}));
            
            this._workspaces = [];
            this._changeWorkspaces();
            global.screen.connect('notify::n-workspaces',
                                    Lang.bind(this, this._changeWorkspaces));
            this._urgent_signal = null;
            global.settings.connect('changed::window-list-applet-alert', Lang.bind(this, this._updateAttentionGrabber));
            this._updateAttentionGrabber();
            // this._container.connect('allocate', Lang.bind(Main.panel, this._allocateBoxes)); 
            global.settings.connect('changed::panel-edit-mode', Lang.bind(this, this.on_panel_edit_mode_changed));
        }
        catch (e) {
            global.logError(e);
        }
    },

    on_orientation_changed: function(orientation) {
        let box_list = this.actor.get_children();
        if (orientation == St.Side.TOP) {
            for (let i = 0; i < box_list.length; i++) {
                box_list[i].add_style_class_name('window-list-box-top');
                box_list[i].set_style('margin-top: 0px;');
                box_list[i].set_style('padding-top: 0px;');
            }
            this.actor.set_style('margin-top: 0px;');
            this.actor.set_style('padding-top: 0px;');
        }
        else {
            for (let i = 0; i < box_list.length; i++) {
                box_list[i].add_style_class_name('window-list-box-bottom');
                box_list[i].set_style('margin-bottom: 0px;');
                box_list[i].set_style('padding-bottom: 0px;');
            }
            this.actor.set_style('margin-bottom: 0px;');
            this.actor.set_style('padding-bottom: 0px;');
        }
    },

    _updateAttentionGrabber: function() {
        let active = global.settings.get_boolean('window-list-applet-alert');
        if (active) {
            this._urgent_signal = global.display.connect('window-marked-urgent', Lang.bind(this, this._onWindowDemandsAttention));
        } else {
            if (this._urgent_signal) {
                global.display.disconnect(this._urgent_signal);
            }
        }
    },

    on_applet_clicked: function(event) {
    },

    on_panel_edit_mode_changed: function() {
        this.actor.reactive = global.settings.get_boolean("panel-edit-mode");
    }, 

    _onWindowDemandsAttention : function(display, window) {
        for ( let i=0; i<this._windows.length; ++i ) {
            if ( this._windows[i].metaWindow == window ) {
                if (!this._windows[i].actor._delegate.getAttention()) {
                    return;
                }
            }
        }
        let alertButton = new AppMenuButton(this, window, true, this.orientation, this._panelHeight, false);
        this._alertWindows.push(alertButton);
        this.calculate_alert_positions();
    },

    _clean_alert_boxes: function() {
        let left_box_items = this.leftAlertBox.actor.get_children();
        for (let i = 0; i < left_box_items.length; i++) {
            this.leftAlertBox.actor.remove_actor(left_box_items[i]);
        }
        let right_box_items = this.rightAlertBox.actor.get_children();
        for (let i = 0; i < right_box_items.length; i++) {
            this.rightAlertBox.actor.remove_actor(right_box_items[i]);
        }
    },

    calculate_alert_positions: function() {
        this._clean_alert_boxes();

        let cur_ws_index = global.screen.get_active_workspace_index();

        for (let i = 0; i < this._alertWindows.length; i++ ) {
            let window_ws_index = this._alertWindows[i].metaWindow.get_workspace().index();
            if (window_ws_index < cur_ws_index) {
                this.leftAlertBox.actor.add(this._alertWindows[i].actor);
            } else if (window_ws_index > cur_ws_index) {
                this.rightAlertBox.actor.add(this._alertWindows[i].actor);
            }
            if (!this._alertWindows[i]._needsAttention) {
                this._alertWindows[i].getAttention();
            }
        }
    },

    _onFocus: function() {
        for ( let i = 0; i < this._windows.length; ++i ) {
            this._windows[i].doFocus();
        }
    },

    on_panel_height_changed: function() {
        this._refreshItems();
    },
    
    _refreshItems: function() {
        for ( let i = 0; i < this._windows.length; ++i ) {
            let metaWindow = this._windows[i].metaWindow;
            if (metaWindow.get_workspace().index() == global.screen.get_active_workspace_index()
                      || metaWindow.is_on_all_workspaces())
                this._windows[i].actor.show();
            else
                this._windows[i].actor.hide();
        }
        this.calculate_alert_positions();
        this._onFocus();
    },

    _onWindowStateChange: function(state, actor) {
        for ( let i=0; i<this._windows.length; ++i ) {
            if ( this._windows[i].metaWindow == actor.get_meta_window() ) {
                let windowReference = this._windows[i];
                let menuReference = this._windows[i].rightClickMenu;
                let title = windowReference.getDisplayTitle();
                
                if (state == 'minimize') {
                    windowReference._label.set_text("["+ title +"]");
                    menuReference.itemMinimizeWindow.label.set_text(_("Restore"));
                    
                    return;
                } else if (state == 'map') {
                    windowReference._label.set_text(title);
                    menuReference.itemMinimizeWindow.label.set_text(_("Minimize"));
                    
                    return;
                }
            }
        }
    },
    
    _onMinimize: function(cinnamonwm, actor) {
        this._onWindowStateChange('minimize', actor);
    },
    
    _onMaximize: function(cinnamonwm, actor) {
        this._onWindowStateChange('maximize', actor);
    },
    
    _onMap: function(cinnamonwm, actor) {
    	/* Note by Clem: The call to this._refreshItems() below doesn't look necessary. 
    	 * When a window is mapped in a quick succession of times (for instance if 
    	 * the user repeatedly minimize/unminimize the window by clicking on the window list, 
    	 * or more often when the showDesktop button maps a lot of minimized windows in a quick succession.. 
    	 * when this happens, many calls to refreshItems are made and this creates a memory leak. 
    	 * It also slows down all the mapping and so it takes time for all windows to get unminimized after showDesktop is clicked.
    	 * 
    	 * For now this was removed. If it needs to be put back, this isn't the place. 
    	 * If showDesktop needs it, then it should only call it once, not once per window.
    	 */ 
        //this._refreshItems();
        this._onWindowStateChange('map', actor);
    },
  
    _windowAdded: function(metaWorkspace, metaWindow) {
        if (!Main.isInteresting(metaWindow))
            return;        
        for ( let i=0; i<this._windows.length; ++i ) {
            if ( this._windows[i].metaWindow == metaWindow ) {
                return;
            }
        }

        let appbutton = new AppMenuButton(this, metaWindow, true, this.orientation, this._panelHeight, true);
        this._windows.push(appbutton);
        this.myactor.add(appbutton.actor);
        if (metaWorkspace.index() != global.screen.get_active_workspace_index())
            appbutton.actor.hide();
    },

    _windowRemoved: function(metaWorkspace, metaWindow) {
        for ( let i=0; i<this._windows.length; ++i ) {
            if ( this._windows[i].metaWindow == metaWindow ) {
                this.myactor.remove_actor(this._windows[i].actor);
                this._windows[i].actor.destroy();
                this._windows.splice(i, 1);
                break;
            }
        }
    },
    
    _changeWorkspaces: function() {
        for ( let i=0; i<this._workspaces.length; ++i ) {
            let ws = this._workspaces[i];
            ws.disconnect(ws._windowAddedId);
            ws.disconnect(ws._windowRemovedId);
        }

        this._workspaces = [];
        for ( let i=0; i<global.screen.n_workspaces; ++i ) {
            let ws = global.screen.get_workspace_by_index(i);
            this._workspaces[i] = ws;
            ws._windowAddedId = ws.connect('window-added',
                                    Lang.bind(this, this._windowAdded));
            ws._windowRemovedId = ws.connect('window-removed',
                                    Lang.bind(this, this._windowRemoved));
        }
    },
    
    _allocateBoxes: function(container, box, flags) {	
		let allocWidth = box.x2 - box.x1;
		let allocHeight = box.y2 - box.y1;
		let [leftMinWidth, leftNaturalWidth] = this._leftBox.get_preferred_width(-1);
		let [centerMinWidth, centerNaturalWidth] = this._centerBox.get_preferred_width(-1);
		let [rightMinWidth, rightNaturalWidth] = this._rightBox.get_preferred_width(-1);

		let sideWidth, centerWidth;
		centerWidth = centerNaturalWidth;
		sideWidth = (allocWidth - centerWidth) / 2;

		let childBox = new Clutter.ActorBox();

		childBox.y1 = 0;
		childBox.y2 = allocHeight;
		if (this.myactor.get_text_direction() == Clutter.TextDirection.RTL) {
			childBox.x1 = allocWidth - Math.min(allocWidth - rightNaturalWidth,
												leftNaturalWidth);
			childBox.x2 = allocWidth;
		} else {
			childBox.x1 = 0;
			childBox.x2 = Math.min(allocWidth - rightNaturalWidth, leftNaturalWidth);
		}
		this._leftBox.allocate(childBox, flags);

		childBox.x1 = Math.ceil(sideWidth);
		childBox.y1 = 0;
		childBox.x2 = childBox.x1 + centerWidth;
		childBox.y2 = allocHeight;
		this._centerBox.allocate(childBox, flags);

		childBox.y1 = 0;
		childBox.y2 = allocHeight;
		if (this.myactor.get_text_direction() == Clutter.TextDirection.RTL) {
			childBox.x1 = 0;
			childBox.x2 = Math.min(Math.floor(sideWidth),
								   rightNaturalWidth);
		} else {
			childBox.x1 = allocWidth - Math.min(Math.floor(sideWidth),
												rightNaturalWidth);
			childBox.x2 = allocWidth;
		}
		this._rightBox.allocate(childBox, flags);
    }
};

function main(metadata, orientation, panel_height) {  
    let myApplet = new MyApplet(orientation, panel_height);
    return myApplet;      
}
