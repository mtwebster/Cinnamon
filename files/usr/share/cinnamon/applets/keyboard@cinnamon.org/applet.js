const Applet = imports.ui.applet;
const Gkbd = imports.gi.Gkbd;
const Lang = imports.lang;
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Gtk = imports.gi.Gtk;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;

try {
    var IBus = imports.gi.IBus;
    if (!('new_async' in IBus.Bus))
        throw "IBus version is too old";
    const IBusCandidatePopup = imports.ui.ibusCandidatePopup;
} catch (e) {
    var IBus = null;
    log(e);
}

const INPUT_SOURCE_TYPE_IBUS = 'ibus';


function IBusManager(readyCallback) {
    this._init(readyCallback);
}

IBusManager.prototype = {
    Name: 'IBusManager',

    _init: function(readyCallback) {
        if (!IBus)
            return;

        IBus.init();

        this._readyCallback = readyCallback;
        this._candidatePopup = new IBusCandidatePopup.CandidatePopup();

        this._ibus = null;
        this._panelService = null;
        this._engines = {};
        this._ready = false;
        this._registerPropertiesId = 0;
        this._currentEngineName = null;

        this._nameWatcherId = Gio.DBus.session.watch_name(IBus.SERVICE_IBUS,
                                                          Gio.BusNameWatcherFlags.NONE,
                                                          Lang.bind(this, this._onNameAppeared),
                                                          Lang.bind(this, this._clear));
    },

    _clear: function() {
        if (this._panelService)
            this._panelService.destroy();
        if (this._ibus)
            this._ibus.destroy();

        this._ibus = null;
        this._panelService = null;
        this._candidatePopup.setPanelService(null);
        this._engines = {};
        this._ready = false;
        this._registerPropertiesId = 0;
        this._currentEngineName = null;

        if (this._readyCallback)
            this._readyCallback(false);
    },

    _onNameAppeared: function() {
        this._ibus = IBus.Bus.new_async();
        this._ibus.connect('connected', Lang.bind(this, this._onConnected));
    },

    _onConnected: function() {
        this._ibus.list_engines_async(-1, null, Lang.bind(this, this._initEngines));
        this._ibus.request_name_async(IBus.SERVICE_PANEL,
                                      IBus.BusNameFlag.REPLACE_EXISTING,
                                      -1, null,
                                      Lang.bind(this, this._initPanelService));
        this._ibus.connect('disconnected', Lang.bind(this, this._clear));
    },

    _initEngines: function(ibus, result) {
        let enginesList = this._ibus.list_engines_async_finish(result);
        if (enginesList) {
            for (let i = 0; i < enginesList.length; ++i) {
                let name = enginesList[i].get_name();
                this._engines[name] = enginesList[i];
            }
            this._updateReadiness();
        } else {
            this._clear();
        }
    },

    _initPanelService: function(ibus, result) {
        let success = this._ibus.request_name_async_finish(result);
        if (success) {
            this._panelService = new IBus.PanelService({ connection: this._ibus.get_connection(),
                                                         object_path: IBus.PATH_PANEL });
            this._candidatePopup.setPanelService(this._panelService);
            // Need to set this to get 'global-engine-changed' emitions
            this._ibus.set_watch_ibus_signal(true);
            this._ibus.connect('global-engine-changed', Lang.bind(this, this._engineChanged));
            this._panelService.connect('update-property', Lang.bind(this, this._updateProperty));
            // If an engine is already active we need to get its properties
            this._ibus.get_global_engine_async(-1, null, Lang.bind(this, function(i, result) {
                let engine;
                try {
                    engine = this._ibus.get_global_engine_async_finish(result);
                    if (!engine)
                        return;
                } catch(e) {
                    return;
                }
                this._engineChanged(this._ibus, engine.get_name());
            }));
            this._updateReadiness();
        } else {
            this._clear();
        }
    },

    _updateReadiness: function() {
        this._ready = (Object.keys(this._engines).length > 0 &&
                       this._panelService != null);

        if (this._readyCallback)
            this._readyCallback(this._ready);
    },

    _engineChanged: function(bus, engineName) {
        this._currentEngineName = engineName;

        if (this._registerPropertiesId != 0)
            return;

        this._registerPropertiesId =
            this._panelService.connect('register-properties', Lang.bind(this, function(p, props) {
                if (!props.get(0))
                    return;

                this._panelService.disconnect(this._registerPropertiesId);
                this._registerPropertiesId = 0;

                this.emit('properties-registered', this._currentEngineName, props);
            }));
    },

    _updateProperty: function(panel, prop) {
        this.emit('property-updated', this._currentEngineName, prop);
    },

    activateProperty: function(key, state) {
        this._panelService.property_activate(key, state);
    },

    getEngineDesc: function(id) {
        if (!IBus || !this._ready)
            return null;

        return this._engines[id];
    }
};
Signals.addSignalMethods(IBusManager.prototype);



function InputSourcePopup(items, action, actionBackward) {
    this._init(items, action, actionBackward);
}

InputSourcePopup.prototype = {
    __proto__: SwitcherPopup.SwitcherPopup.prototype,

    _init: function(items, action, actionBackward) {
        SwitcherPopup.SwitcherPopup.prototype._init.call(this, items);

        this._action = action;
        this._actionBackward = actionBackward;
    },

    _createSwitcher: function() {
        this._switcherList = new InputSourceSwitcher(this._items);
        return true;
    },

    _initialSelection: function(backward, binding) {
        if (binding == 'switch-input-source') {
            if (backward)
                this._selectedIndex = this._items.length - 1;
        } else if (binding == 'switch-input-source-backward') {
            if (!backward)
                this._selectedIndex = this._items.length - 1;
        }
        this._select(this._selectedIndex);
    },

    _keyPressHandler: function(keysym, backwards, action) {
        if (action == this._action)
            this._select(backwards ? this._previous() : this._next());
        else if (action == this._actionBackward)
            this._select(backwards ? this._next() : this._previous());
        else if (keysym == Clutter.Left)
            this._select(this._previous());
        else if (keysym == Clutter.Right)
            this._select(this._next());
    },

    _finish : function() {
        this.parent();

        this._items[this._selectedIndex].activate();
    },
};

function InputSourceSwitcher(items) {
    this._init(items);
}

InputSourceSwitcher.prototype =  {
    __proto__: SwitcherPopup.SwitcherList.prototype,

    _init: function(items) {
        SwitcherPopup.SwitcherList.prototype._init.call(this, true);

        for (let i = 0; i < items.length; i++)
            this._addIcon(items[i]);
    },

    _addIcon: function(item) {
        let box = new St.BoxLayout({ vertical: true });

        let bin = new St.Bin({ style_class: 'input-source-switcher-symbol' });
        let symbol = new St.Label({ text: item.shortName });
        bin.set_child(symbol);
        box.add(bin, { x_fill: false, y_fill: false } );

        let text = new St.Label({ text: item.displayName });
        box.add(text, { x_fill: false });

        this.addItem(box, text);
    }
};

function LayoutMenuItem() {
    this._init.apply(this, arguments);
}

LayoutMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(config, id, indicator, long_name) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this);

        this._config = config;
        this._id = id;
        this.label = new St.Label({ text: long_name });
        this.indicator = indicator;
        this.addActor(this.label);
        this.addActor(this.indicator);
    },

    activate: function(event) {
        PopupMenu.PopupBaseMenuItem.prototype.activate.call(this);
        this._config.lock_group(this._id);
    }
};

function MyApplet(metadata, orientation, panel_height) {
    this._init(metadata, orientation, panel_height);
}

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(metadata, orientation, panel_height) {        
        Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height);
        
        try {  
            Gtk.IconTheme.get_default().append_search_path(metadata.path + "/flags");                              
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.menuManager.addMenu(this.menu);                            

            this.actor.add_style_class_name('panel-status-button');            

            this._labelActors = [ ];
            this._layoutItems = [ ];

            this._showFlags = global.settings.get_boolean("keyboard-applet-use-flags");
            this._config = Gkbd.Configuration.get();
            this._config.connect('changed', Lang.bind(this, this._syncConfig));
            this._config.connect('group-changed', Lang.bind(this, this._syncGroup));
            global.settings.connect('changed::keyboard-applet-use-flags', Lang.bind(this, this._reload_settings));
            this._config.start_listen();

            this._syncConfig();

            this._ibusReady = false;
            this._ibusManager = new IBusManager(Lang.bind(this, this._ibusReadyCallback));
            this._ibusManager.connect('properties-registered', Lang.bind(this, this._ibusPropertiesRegistered));
            this._ibusManager.connect('property-updated', Lang.bind(this, this._ibusPropertyUpdated));

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addAction(_("Show Keyboard Layout"), Lang.bind(this, function() {
                Main.overview.hide();
                Util.spawn(['gkbd-keyboard-display', '-g', String(this._config.get_current_group() + 1)]);
            }));                                
            this.menu.addAction(_("Show Character Table"), Lang.bind(this, function() {
                Main.overview.hide();
                Util.spawn(['gucharmap']);
            }));
            this.menu.addSettingsAction(_("Region and Language Settings"), 'region'); 
            
            this.show_flags_switch = new PopupMenu.PopupSwitchMenuItem(_("Show flags"), this._showFlags);
            this._applet_context_menu.addMenuItem(this.show_flags_switch);            
            this.show_flags_switch.connect('toggled', Lang.bind(this, this._toggle_flags));
                      
        }
        catch (e) {
            global.logError(e);
        }
    },
    
    on_applet_clicked: function(event) {
        this.menu.toggle();        
    },
    
    _toggle_flags: function() {
        if (this._showFlags) {            
            this.show_flags_switch.setToggleState(false);
            global.settings.set_boolean("keyboard-applet-use-flags", false);
        } else {
            this.show_flags_switch.setToggleState(true);
            global.settings.set_boolean("keyboard-applet-use-flags", true);
        }
    },
    
    _reload_settings: function() {
        this._showFlags = global.settings.get_boolean("keyboard-applet-use-flags");
        this._syncConfig();
    },

    _ibusReadyCallback: function(ready) {
        if (this._ibusReady == ready)
            return;

        this._ibusReady = ready;
        this._mruSources = [];
        this._inputSourcesChanged();
    },

    _ibusPropertiesRegistered: function(im, engineName, props) {
        let source = this._ibusSources[engineName];
        if (!source)
            return;

        source.properties = props;

        if (source == this._currentSource)
            this._currentInputSourceChanged();
    },

    _ibusPropertyUpdated: function(im, engineName, prop) {
        let source = this._ibusSources[engineName];
        if (!source)
            return;

        if (this._updateSubProperty(source.properties, prop) &&
            source == this._currentSource)
            this._currentInputSourceChanged();
    },

   _adjustGroupNames: function(names) {
        // Disambiguate duplicate names with a subscript
        // This is O(N^2) to avoid sorting names
        // but N <= 4 so who cares?

        for (let i = 0; i < names.length; i++) {
            let name = names[i];
            let cnt = 0;
            for (let j = i + 1; j < names.length; j++) {
                if (names[j] == name) {
                    cnt++;
                    // U+2081 SUBSCRIPT ONE
                    names[j] = name + String.fromCharCode(0x2081 + cnt);
                }
            }
            if (cnt != 0)
                names[i] = name + '\u2081';
        }

        return names;
    },

    _syncConfig: function() {
        this._showFlags = global.settings.get_boolean("keyboard-applet-use-flags");

        let groups = this._config.get_group_names();
        if (groups.length > 1) {
            this.actor.show();
        } else {
            this.menu.close();
            this.actor.hide();
        }

        for (let i = 0; i < this._layoutItems.length; i++)
            this._layoutItems[i].destroy();

        for (let i = 0; i < this._labelActors.length; i++)
            this._labelActors[i].destroy();

        let short_names = this._adjustGroupNames(this._config.get_short_group_names());

        this._selectedLayout = null;
        this._layoutItems = [ ];
        this._labelActors = [ ];
        for (let i = 0; i < groups.length; i++) {
            let icon_name = this._config.get_group_name(i);
            let actor;
            if (this._showFlags)
                actor = new St.Icon({ icon_name: icon_name, icon_type: St.IconType.FULLCOLOR, style_class: 'popup-menu-icon' });
            else
                actor = new St.Label({ text: short_names[i] });
            let item = new LayoutMenuItem(this._config, i, actor, groups[i]);
            item._short_group_name = short_names[i];
            item._icon_name = icon_name;
            this._layoutItems.push(item);
            this.menu.addMenuItem(item, i);

            let shortLabel = new St.Label({ text: short_names[i] });
            this._labelActors.push(shortLabel);
        }

        this._syncGroup();
    },

    _syncGroup: function() {
        let selected = this._config.get_current_group();

        if (this._selectedLayout) {
            this._selectedLayout.setShowDot(false);
            this._selectedLayout = null;
        }

        let item = this._layoutItems[selected];
        item.setShowDot(true);

        let selectedLabel = this._labelActors[selected];

        if (this._showFlags) {
            this.set_applet_icon_name(item._icon_name);
            this.set_applet_label("");
        } else {
            this.hide_applet_icon();
            this.set_applet_label(selectedLabel.text);
        }       

        this._selectedLayout = item;
    }    
};

function main(metadata, orientation, panel_height) {  
    let myApplet = new MyApplet(metadata, orientation, panel_height);
    return myApplet;      
}
