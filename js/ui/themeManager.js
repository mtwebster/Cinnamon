// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Load shell theme from ~/.themes/name/gnome-shell

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Main = imports.ui.main;
const Signals = imports.signals;
const Settings = imports.ui.settings;
const Cinnamon = imports.gi.Cinnamon;

const SETTINGS_SCHEMA = 'org.cinnamon.theme';
const SETTINGS_KEY = 'name';

function ThemeBootstrapper(themeName, styleSheet) {
    this._init(themeName, styleSheet);
}

ThemeBootstrapper.prototype = {
    _init: function(themeName, styleSheet) {

        this.ss_file = Gio.file_new_for_path(styleSheet);
        this.theme_folder = this.ss_file.get_parent();

        let has_settings = false;
        this.settings = null;

        let settings_file = this.theme_folder.get_child("settings-schema.json");
        if (settings_file.query_exists(null))
            has_settings = true;

        this.sheet = null;
        this.json = null;

        if (has_settings) {
            this.settings = new Settings.ThemeSettings(this, themeName, this.theme_folder.get_path());
            this.settings.connect("settings-changed", Lang.bind(this.reload));
            this.reload();
        } else {
            this.loadStyleSheet();
        }
    },

    reload: function() {
        this.loadStyleSheet();
        this.json = this.settings.dump();

        this.preProcessStyleSheet();
        this.preProcessStyleSheet();
    },

    loadStyleSheet: function() {
        this.sheet = Cinnamon.get_file_contents_utf8_sync(this.ss_file.get_path());
        if (this.sheet == null)
            this.sheet == "";
        global.logError(this.sheet);
    },

    preProcessStyleSheet: function() {
        for (let key in this.json) {
            this.sheet.replace(key, this.json[key]["value"]);
        }
    },

    get_stylesheet: function() {
        return this.sheet;
    },

    get_stylesheet_path: function() {
        return this.ss_file.get_path();
    }
}


function ThemeManager() {
    this._init();
}

ThemeManager.prototype = {
    _init: function() {
        this._settings = new Gio.Settings({ schema: SETTINGS_SCHEMA });
        this._changedId = this._settings.connect('changed::'+SETTINGS_KEY, Lang.bind(this, this._changeTheme));
        this._changeTheme();
        this._themeBootstrapper = null;
    },    
    
    _findTheme: function(themeName) {
        let stylesheet = null;

        if (themeName == "") {
            stylesheet = "/usr/share/cinnamon/theme/cinnamon.css";
        } else {
            let _userCssStylesheet = GLib.get_home_dir() + '/.themes/' + themeName + "/cinnamon/cinnamon.css";

            let file = Gio.file_new_for_path(_userCssStylesheet);
            if (file.query_exists(null))
                stylesheet = _userCssStylesheet;
            else {
                let sysdirs = GLib.get_system_data_dirs();
                for (let i = 0; i < sysdirs.length; i++) {
                    _userCssStylesheet = sysdirs[i] + '/themes/' + themeName + "/cinnamon/cinnamon.css";
                    let file = Gio.file_new_for_path(_userCssStylesheet);
                    if (file.query_exists(null)) {
                        stylesheet = _userCssStylesheet;
                        break;
                    }
                }
            }
        }
        return stylesheet;
    },

    _changeTheme: function() {
        let _stylesheet = null;
        let _settingsfile = null;
        let _themeName = this._settings.get_string(SETTINGS_KEY);        

        _stylesheet = this._findTheme(_themeName);

        if (_themeName != "" && _stylesheet)
            global.log('loading user theme: ' + _stylesheet);
        else
            global.log('loading default theme');

        this._themeBootstrapper = new ThemeBootstrapper(_themeName, _stylesheet);

        Main.setThemeStylesheet(this._themeBootstrapper.get_stylesheet(),
                                this._themeBootstrapper.get_stylesheet_path());
        Main.loadTheme();
        this.emit("theme-set");
    }
};
Signals.addSignalMethods(ThemeManager.prototype);
