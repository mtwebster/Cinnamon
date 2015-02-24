/* -*- mode: C; c-file-style: "gnu"; indent-tabs-mode: nil; -*- */
/*
 * cinnamon-theme-manager: handles theme changes, folder, file checking - headers
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
#ifndef __CINNAMON_THEME_MANAGER_H__
#define __CINNAMON_THEME_MANAGER_H__

#include <glib-object.h>

G_BEGIN_DECLS

#define CINNAMON_TYPE_THEME_MANAGER (cinnamon_theme_manager_get_type ())
#define CINNAMON_THEME_MANAGER(obj) (G_TYPE_CHECK_INSTANCE_CAST ((obj), \
                CINNAMON_TYPE_THEME_MANAGER, CinnamonThemeManager))
#define CINNAMON_IS_THEME_MANAGER(obj) (G_TYPE_CHECK_INSTANCE_TYPE ((obj), \
                CINNAMON_TYPE_THEME_MANAGER))
#define CINNAMON_THEME_MANAGER_CLASS(klass) (G_TYPE_CHECK_CLASS_CAST ((klass), \
                CINNAMON_TYPE_THEME_MANAGER, CinnamonThemeManagerClass))
#define CINNAMON_IS_THEME_MANAGER_CLASS(klass) (G_TYPE_CHECK_CLASS_TYPE ((klass), \
                CINNAMON_TYPE_THEME_MANAGER))
#define CINNAMON_THEME_MANAGER_GET_CLASS(obj) (G_TYPE_INSTANCE_GET_CLASS ((obj), \
                CINNAMON_TYPE_THEME_MANAGER, CinnamonThemeManagerClass))

typedef struct _CinnamonThemeManager CinnamonThemeManager;
typedef struct _CinnamonThemeManagerClass CinnamonThemeManagerClass;

struct _CinnamonThemeManager
{
    GObject parent_instance;
};

struct _CinnamonThemeManagerClass
{
    GObjectClass parent_class;
};

GType cinnamon_theme_manager_get_type (void);

GObject * cinnamon_theme_manager_new (void);

void cinnamon_theme_manager_load_theme (CinnamonThemeManager *manager);

G_END_DECLS

#endif /* __CINNAMON_THEME_MANAGER_H__ */

