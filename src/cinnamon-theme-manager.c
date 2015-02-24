/* -*- mode: C; c-file-style: "gnu"; indent-tabs-mode: nil; -*- */
/*
 * cinnamon-theme-manager: handles theme changes, folder, file checking
 *
 * Copyright 2015 Michael Webster
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation, either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This program is distributed in the hope it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU Lesser General Public License for
 * more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

#include "config.h"

#include "cinnamon-global.h"
#include <gio/gio.h>
#include "st.h"

#include "cinnamon-theme-manager.h"

#define CINNAMON_THEME_MANAGER_GET_PRIVATE(obj) (G_TYPE_INSTANCE_GET_PRIVATE ((obj), \
                CINNAMON_TYPE_THEME_MANAGER, CinnamonThemeManagerPrivate))

enum
{
    PROP_ZERO,
    PROP_CURRENT_THEME_NAME,
    N_PROPERTIES
};

static GParamSpec *cinnamon_theme_manager_properties[N_PROPERTIES] = { NULL };

enum {
  INITIALIZED,
  THEME_SET,
  LAST_SIGNAL
};

static guint signals[LAST_SIGNAL] = { 0 };

typedef struct _CinnamonThemeManagerPrivate CinnamonThemeManagerPrivate;

struct _CinnamonThemeManagerPrivate
{
    gchar *current_theme_name;
    gchar *previous_theme_name;

    GSettings *theme_settings;

    GHashTable *paths_by_name;
    GHashTable *names_by_path;

    gboolean ready;
};

typedef struct
{
    GHashTable *new_paths_by_name;
    GHashTable *new_names_by_path;
}  ThemeFoldersData;

typedef struct
{
    StTheme *theme;
} LoadThemeData;

G_DEFINE_TYPE (CinnamonThemeManager, cinnamon_theme_manager, G_TYPE_OBJECT);

static void
update_theme_icon_path (CinnamonThemeManager *manager)
{
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (manager);
    GtkIconTheme *theme = gtk_icon_theme_get_default ();

    if (priv->previous_theme_name != NULL) {
        gchar **paths = NULL;
        gint count = 0;
        gint i = 0;

        const gchar *old_path = g_hash_table_lookup (priv->paths_by_name, priv->previous_theme_name);

        gtk_icon_theme_get_search_path (theme, &paths, &count);

        GPtrArray *new_list = g_ptr_array_new ();

        while (i < count) {
            if (g_strcmp0 (old_path, paths[i]) != 0)
                g_ptr_array_add (new_list, g_strdup (paths[i]));
            i++;
        }

        g_ptr_array_add (new_list, NULL);

        gchar **new_list_ptr = (char **) g_ptr_array_free (new_list, FALSE);

        gtk_icon_theme_set_search_path (theme, (const gchar **)new_list_ptr, g_strv_length (new_list_ptr));

        g_strfreev (paths);
        g_strfreev (new_list_ptr);
    }

    const gchar *path = g_hash_table_lookup (priv->paths_by_name, priv->current_theme_name);

    gtk_icon_theme_append_search_path (theme, path);
}


/******REFRESH THEME FOLDERS*******/

static void
theme_folders_data_free (ThemeFoldersData *data)
{
    g_hash_table_unref (data->new_paths_by_name);
    g_hash_table_unref (data->new_names_by_path);
}

static void
add_to_tables (ThemeFoldersData *data,
               const gchar      *name,
               const gchar      *path)
{
    g_hash_table_insert (data->new_paths_by_name,
                         g_strdup (name),
                         g_strdup (path));
    g_hash_table_insert (data->new_names_by_path,
                         g_strdup (path),
                         g_strdup (name));
}

static void
iterate_thru_folder (ThemeFoldersData *data,
                     GFile *file,
                     GError **r_error)
{
    GFileEnumerator *enumer; 
    GFileInfo *info_iter;
    GError *error = NULL;
    enumer = g_file_enumerate_children (file,
                                        "standard::*",
                                        G_FILE_QUERY_INFO_NONE,
                                        NULL,
                                        &error);

    if (error != NULL) {
        *r_error = error;
        return;
    }

    info_iter = g_file_enumerator_next_file (enumer, NULL, &error);

    if (error != NULL) {
        *r_error = error;
        g_clear_object (&info_iter);
        return;
    }

    while (info_iter != NULL) {
        GFile *f_iter = g_file_enumerator_get_child (enumer, info_iter);
        gchar *theme_path = g_file_get_path (f_iter);

        gchar *cinnamon_folder = g_build_filename (theme_path, "cinnamon", NULL);
        GFile *cin_check = g_file_new_for_path (cinnamon_folder);

        if (g_file_query_exists (cin_check, NULL)) {
            gchar *name = g_file_get_basename (f_iter);
            gchar *path = g_file_get_path (cin_check);

            add_to_tables (data, name, path);

            g_free (name);
            g_free (path);
        }

        g_object_unref (f_iter);
        g_object_unref (cin_check);
        g_free (cinnamon_folder);
        g_free (theme_path);

        g_clear_object (&info_iter);

        info_iter = g_file_enumerator_next_file (enumer, NULL, &error);

        if (error != NULL) {
            g_clear_object (&info_iter);
            *r_error = error;
            break;
        }
    }
}

static void
refresh_theme_folders_thread (GTask         *task,
                              gpointer       source_object,
                              gpointer       task_data,
                              GCancellable  *cancellable)
{
    ThemeFoldersData *data = (ThemeFoldersData *) task_data;
    GError *error = NULL;

    gint i;

    GFile *current_file;
    gchar *current_root;

    /* Check for user theme folder root */
    current_root = g_build_filename (g_get_home_dir (), ".themes", NULL);
    current_file = g_file_new_for_path (current_root);

    if (g_file_query_exists (current_file, NULL))
        iterate_thru_folder (data, current_file, &error);

    if (error != NULL)
        goto out;

    g_clear_pointer (&current_root, (GDestroyNotify) g_free);
    g_clear_object (&current_file);

    /* Check system data directories (/usr/share, /usr/local/share, etc...) */
    const char * const * data_dirs;

    data_dirs = g_get_system_data_dirs ();

    for (i = 0; data_dirs[i] != NULL; i++) {
        current_root = g_build_filename ((gchar *) data_dirs[i], "themes", NULL);
        current_file = g_file_new_for_path (current_root);

        if (g_file_query_exists (current_file, NULL))
            iterate_thru_folder (data, current_file, &error);

        if (error != NULL)
            goto out;

        g_clear_pointer (&current_root, (GDestroyNotify) g_free);
        g_clear_object (&current_file);
    }

    /* Add the default/fallback theme folder */
    const gchar *peek_datadir;

    g_object_get (cinnamon_global_get (),
                  "datadir", &peek_datadir,
                  NULL);

    current_root = g_build_filename (peek_datadir, "theme", NULL);

    add_to_tables (data, "fallback", current_root);
    add_to_tables (data, "cinnamon", current_root);

    g_clear_pointer (&current_root, g_free);

out:
    if (error != NULL) {
        g_clear_pointer (&current_root, g_free);
        g_clear_object (&current_file);
        g_task_return_error (task, error);
    } else
        g_task_return_boolean (task, TRUE);
}

static void
theme_folders_refreshed_cb (CinnamonThemeManager *manager,
                            GAsyncResult         *res,
                            gpointer              user_data)
{
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (manager);

    GTask *task = G_TASK (res);
    GError *error = NULL;

    if (!g_task_propagate_boolean (task, &error)) {
        if (error != NULL) {
            g_printerr ("cinnamon-theme-manager: Problem loading theme folders - %s\n", error->message);
            g_clear_error (&error);
        }

        return;
    }

    ThemeFoldersData *data = g_task_get_task_data (task);

    g_clear_pointer (&priv->paths_by_name, (GDestroyNotify) g_hash_table_unref);
    g_clear_pointer (&priv->names_by_path, (GDestroyNotify) g_hash_table_unref);

    priv->paths_by_name = g_hash_table_ref (data->new_paths_by_name);
    priv->names_by_path = g_hash_table_ref (data->new_names_by_path);

    if (!priv->ready)
        cinnamon_theme_manager_load_theme (manager);
}

static void
refresh_theme_folders (CinnamonThemeManager *manager)
{
    GTask *task;
    ThemeFoldersData *data;

    data = g_slice_new (ThemeFoldersData);
    data->new_names_by_path = g_hash_table_new_full (g_str_hash, g_str_equal,
                                                     (GDestroyNotify)g_free, (GDestroyNotify)g_free);
    data->new_paths_by_name = g_hash_table_new_full (g_str_hash, g_str_equal,
                                                     (GDestroyNotify)g_free, (GDestroyNotify)g_free);

    task = g_task_new (manager, NULL, (GAsyncReadyCallback) theme_folders_refreshed_cb, NULL);

    g_task_set_task_data (task, data, (GDestroyNotify) theme_folders_data_free);

    g_task_run_in_thread (task, refresh_theme_folders_thread);
}

/******END REFRESH THEME FOLDERS*******/

/******LOAD THEME*******/

static void
load_theme_data_free (LoadThemeData *data)
{
    g_object_unref (data->theme);
}

static void
load_theme_thread (GTask         *task,
                   gpointer       source_object,
                   gpointer       task_data,
                   GCancellable  *cancellable)
{
    LoadThemeData *data = (LoadThemeData *) task_data;
    CinnamonThemeManager *manager = CINNAMON_THEME_MANAGER (source_object);
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (manager);

    gchar *name = NULL;

    if (priv->current_theme_name == NULL ||
        g_strcmp0 (priv->current_theme_name, "") == 0) {
        name = g_strdup_printf ("fallback");
    } else {
        name = g_strdup (priv->current_theme_name);
    }

    const gchar *path = g_hash_table_lookup (priv->paths_by_name, name);

    if (path == NULL) {
        g_warning ("No theme path found in hash table for theme %s\n", name);
        goto out;
    }

    const gchar *fallback_path = g_hash_table_lookup (priv->paths_by_name, "fallback");
    data->theme = g_object_ref (st_theme_new (path, fallback_path));

out:
    g_free (name);

    if (data->theme) {
        g_task_return_boolean (task, TRUE);
    } else {
        g_task_return_boolean (task, FALSE);
    }
}

static void
load_theme_finished_cb (CinnamonThemeManager *manager,
                            GAsyncResult         *res,
                            gpointer              user_data)
{
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (manager);

    GTask *task = G_TASK (res);
    GError *error = NULL;

    if (!g_task_propagate_boolean (task, &error)) {
        if (error != NULL) {
            g_printerr ("cinnamon-theme-manager: Problem loading theme - %s\n", error->message);
            g_clear_error (&error);
        }

        return;
    }

    LoadThemeData *data = g_task_get_task_data (task);

    if (data->theme) {
        update_theme_icon_path (manager);

        StThemeContext *context = st_theme_context_get_for_stage (cinnamon_global_get_stage (cinnamon_global_get ()));
        st_theme_context_set_theme (context, data->theme);

        if (!priv->ready) {
            priv->ready = TRUE;
            g_signal_emit (manager, signals[INITIALIZED], 0);
        } else {
            g_signal_emit (manager, signals[THEME_SET], 0);
        }
    }
}

static void
load_theme_internal (CinnamonThemeManager *manager)
{
    GTask *task;

    LoadThemeData *data = g_slice_new (LoadThemeData);
    data->theme = NULL;

    task = g_task_new (manager, NULL, (GAsyncReadyCallback) load_theme_finished_cb, NULL);

    g_task_set_task_data (task, data, (GDestroyNotify) load_theme_data_free);

    g_task_run_in_thread (task, load_theme_thread);
}

/******END LOAD THEME*******/

static void
on_settings_changed (GSettings *settings, gchar *key, gpointer user_data)
{
    CinnamonThemeManager *manager = CINNAMON_THEME_MANAGER (user_data);
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (manager);

    gchar *newval = g_settings_get_string (settings, key);

    if (g_strcmp0 (newval, priv->current_theme_name) != 0) {
        g_clear_pointer (&priv->previous_theme_name, g_free);
        priv->previous_theme_name = priv->current_theme_name;
        priv->current_theme_name = g_strdup (newval);
    }

    g_clear_pointer (&newval, g_free);

    cinnamon_theme_manager_load_theme (manager);
}

static void
cinnamon_theme_manager_finalize (GObject *obj)
{
    CinnamonThemeManager *self = CINNAMON_THEME_MANAGER (obj);
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (self);

    g_free (priv->current_theme_name);

    g_clear_pointer (&priv->paths_by_name, (GDestroyNotify) g_hash_table_unref);
    g_clear_pointer (&priv->names_by_path, (GDestroyNotify) g_hash_table_unref);

    g_clear_object (&priv->theme_settings);

    G_OBJECT_CLASS (cinnamon_theme_manager_parent_class)->finalize (obj);
}

static void
cinnamon_theme_manager_constructed (GObject *obj)
{
    G_OBJECT_CLASS (cinnamon_theme_manager_parent_class)->constructed (obj);

    CinnamonThemeManager *self = CINNAMON_THEME_MANAGER (obj);
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (self);

    priv->current_theme_name = g_settings_get_string (priv->theme_settings, "name");

    refresh_theme_folders (CINNAMON_THEME_MANAGER (obj));

    g_signal_connect (priv->theme_settings, "changed::name",
                      G_CALLBACK (on_settings_changed),
                      CINNAMON_THEME_MANAGER (obj));
}

static void
cinnamon_theme_manager_get_property (GObject *obj, guint id,
            GValue *value, GParamSpec *pspec)
{
    CinnamonThemeManager *self = CINNAMON_THEME_MANAGER (obj);
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (self);

    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    switch (id) {
        case PROP_CURRENT_THEME_NAME:
            g_value_set_string (value, priv->current_theme_name);
            break;
        default:
            G_OBJECT_WARN_INVALID_PROPERTY_ID (obj, id, pspec);
            break;
    }
}

static void
cinnamon_theme_manager_set_property (GObject *obj, guint id,
            const GValue *value, GParamSpec *pspec)
{
    CinnamonThemeManager *self = CINNAMON_THEME_MANAGER (obj);
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (self);

    switch (id) {
        case PROP_CURRENT_THEME_NAME:
            if (priv->current_theme_name)
              g_free (priv->current_theme_name);
            priv->current_theme_name = g_strdup (g_value_get_string(value));
            break;
        default:
            G_OBJECT_WARN_INVALID_PROPERTY_ID (obj, id, pspec);
            break;
    }
}

static void
cinnamon_theme_manager_class_init (CinnamonThemeManagerClass *klass)
{
    GObjectClass *obj_class = G_OBJECT_CLASS (klass);

    obj_class->finalize = cinnamon_theme_manager_finalize;
    obj_class->get_property = cinnamon_theme_manager_get_property;
    obj_class->set_property = cinnamon_theme_manager_set_property;
    obj_class->constructed = cinnamon_theme_manager_constructed;

    /* Properties */
    cinnamon_theme_manager_properties[PROP_CURRENT_THEME_NAME] =
        g_param_spec_string ("current-theme-name",
                             "The name of the current theme",
                             "The name of the current theme",
                             NULL, G_PARAM_READWRITE);

    g_object_class_install_properties (obj_class, N_PROPERTIES,
                cinnamon_theme_manager_properties);

    signals[INITIALIZED] = g_signal_new ("initialized",
                                         CINNAMON_TYPE_THEME_MANAGER,
                                         G_SIGNAL_RUN_FIRST,
                                         0,
                                         NULL, NULL,
                                         g_cclosure_marshal_VOID__VOID,
                                         G_TYPE_NONE, 0);

    signals[THEME_SET] = g_signal_new ("theme-set",
                                       CINNAMON_TYPE_THEME_MANAGER,
                                       G_SIGNAL_RUN_FIRST,
                                       0,
                                       NULL, NULL,
                                       g_cclosure_marshal_VOID__VOID,
                                       G_TYPE_NONE, 0);

    g_type_class_add_private (klass, sizeof (CinnamonThemeManagerPrivate));
}

static void
cinnamon_theme_manager_init (CinnamonThemeManager *self)
{
    CinnamonThemeManagerPrivate *priv = CINNAMON_THEME_MANAGER_GET_PRIVATE (self);

    priv->current_theme_name = NULL;
    priv->previous_theme_name = NULL;
    priv->ready = FALSE;

    priv->theme_settings = g_settings_new ("org.cinnamon.theme");

    priv->paths_by_name = NULL;
    priv->names_by_path = NULL;
}

GObject *
cinnamon_theme_manager_new (void)
{
    return g_object_new (CINNAMON_TYPE_THEME_MANAGER, NULL);
}

void
cinnamon_theme_manager_load_theme (CinnamonThemeManager *manager)
{
    load_theme_internal (manager);
}
