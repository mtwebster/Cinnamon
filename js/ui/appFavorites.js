// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/**
 * FILE:appFavorites.js
 * @short_description: Manages the list of favorite applications
 *
 * Provides access to the user's favorite applications list stored in
 * GSettings. Use #getAppFavorites to obtain the singleton instance.
 */

const Cinnamon = imports.gi.Cinnamon;
const Lang = imports.lang;
const Signals = imports.signals;

/**
 * #AppFavorites
 * @short_description: Favorite applications manager
 *
 * Manages the user's list of favorite applications, backed by the
 * `favorite-apps` GSettings key. Emits a `changed` signal when the
 * list is modified.
 */
function AppFavorites() {
    this._init();
}

AppFavorites.prototype = {
    FAVORITE_APPS_KEY: 'favorite-apps',

    _init: function() {
        this._favorites = {};
        global.settings.connect('changed::' + this.FAVORITE_APPS_KEY, Lang.bind(this, this._onFavsChanged));
        this._reload();
    },

    _onFavsChanged: function() {
        this._reload();
        this.emit('changed');
    },

    _reload: function() {
        let ids = global.settings.get_strv(this.FAVORITE_APPS_KEY);
        let appSys = Cinnamon.AppSystem.get_default();
        this._favorites = ids.reduce((favorites, id) => {
            const app = appSys.lookup_app(id);
            if (app) {
                favorites[app.get_id()] = app;
            }

            return favorites;
        }, {});
    },

    _getIds: function() {
        return Object.keys(this._favorites);
    },

    /**
     * getFavoriteMap:
     *
     * Returns (object): a map of application IDs to #Cinnamon.App objects
     */
    getFavoriteMap: function() {
        return this._favorites;
    },

    /**
     * getFavorites:
     *
     * Returns (array): an array of #Cinnamon.App objects
     */
    getFavorites: function() {
        return Object.values(this._favorites);
    },

    /**
     * isFavorite:
     * @appId (string): the application ID to check
     *
     * Returns (boolean): whether the application is a favorite
     */
    isFavorite: function(appId) {
        return appId in this._favorites;
    },

    _addFavorite: function(appId, pos) {
        if (appId in this._favorites)
            return false;

        let appSys = Cinnamon.AppSystem.get_default();
        let app = appSys.lookup_app(appId);

        if (!app)
            return false;

        let ids = this._getIds();
        if (pos == -1)
            ids.push(appId);
        else
            ids.splice(pos, 0, appId);
        global.settings.set_strv(this.FAVORITE_APPS_KEY, ids);
        this._favorites[appId] = app;
        return true;
    },

    /**
     * addFavoriteAtPos:
     * @appId (string): the application ID to add
     * @pos (int): position to insert at, or -1 for end
     *
     * Adds an application to the favorites list at the given position.
     */
    addFavoriteAtPos: function(appId, pos) {
        this._addFavorite(appId, pos);                            
    },

    /**
     * addFavorite:
     * @appId (string): the application ID to add
     *
     * Adds an application to the end of the favorites list.
     */
    addFavorite: function(appId) {
        this.addFavoriteAtPos(appId, -1);
    },

    /**
     * moveFavoriteToPos:
     * @appId (string): the application ID to move
     * @pos (int): the new position
     *
     * Moves a favorite application to a new position in the list.
     */
    moveFavoriteToPos: function(appId, pos) {
        this._removeFavorite(appId);
        this._addFavorite(appId, pos);
    },

    _removeFavorite: function(appId) {
        if (!(appId in this._favorites))
            return false;

        let ids = this._getIds().filter(function (id) { return id != appId; });
        global.settings.set_strv(this.FAVORITE_APPS_KEY, ids);
        return true;
    },

    /**
     * removeFavorite:
     * @appId (string): the application ID to remove
     *
     * Removes an application from the favorites list.
     */
    removeFavorite: function(appId) {
        let app = this._favorites[appId];
        this._removeFavorite(appId);                    
    }
};
Signals.addSignalMethods(AppFavorites.prototype);

var appFavoritesInstance = null;
/**
 * getAppFavorites:
 *
 * Gets the singleton #AppFavorites instance.
 *
 * Returns (AppFavorites): the favorites manager
 */
function getAppFavorites() {
    if (appFavoritesInstance == null)
        appFavoritesInstance = new AppFavorites();
    return appFavoritesInstance;
}
