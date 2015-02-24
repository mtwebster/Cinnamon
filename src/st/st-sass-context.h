/* -*- mode: C; c-file-style: "gnu"; indent-tabs-mode: nil; -*- */
/*
 * st-sass-context: Interface class for libsass - headers
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


#ifndef __ST_SASS_CONTEXT_H__
#define __ST_SASS_CONTEXT_H__

#include <glib-object.h>

G_BEGIN_DECLS

#define ST_TYPE_SASS_CONTEXT (st_sass_context_get_type ())
#define ST_SASS_CONTEXT(obj) (G_TYPE_CHECK_INSTANCE_CAST ((obj), \
                ST_TYPE_SASS_CONTEXT, StSassContext))
#define ST_IS_SASS_CONTEXT(obj) (G_TYPE_CHECK_INSTANCE_TYPE ((obj), \
                ST_TYPE_SASS_CONTEXT))
#define ST_SASS_CONTEXT_CLASS(klass) (G_TYPE_CHECK_CLASS_CAST ((klass), \
                ST_TYPE_SASS_CONTEXT, StSassContextClass))
#define ST_IS_SASS_CONTEXT_CLASS(klass) (G_TYPE_CHECK_CLASS_TYPE ((klass), \
                ST_TYPE_SASS_CONTEXT))
#define ST_SASS_CONTEXT_GET_CLASS(obj) (G_TYPE_INSTANCE_GET_CLASS ((obj), \
                ST_TYPE_SASS_CONTEXT, StSassContextClass))

typedef struct _StSassContext StSassContext;
typedef struct _StSassContextClass StSassContextClass;

struct _StSassContext
{
    GObject parent_instance;
};

struct _StSassContextClass
{
    GObjectClass parent_class;
};

GType st_sass_context_get_type (void);

GObject * st_sass_context_new (void);

G_END_DECLS

#endif /* __ST_SASS_CONTEXT_H__ */

