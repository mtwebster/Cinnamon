/* -*- mode: C; c-file-style: "gnu"; indent-tabs-mode: nil; -*- */
/*
 * st-sass-context: Interface class for libsass
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

#include "st-sass-context.h"

#define ST_SASS_CONTEXT_GET_PRIVATE(obj) (G_TYPE_INSTANCE_GET_PRIVATE ((obj), \
                ST_TYPE_SASS_CONTEXT, StSassContextPrivate))

enum
{
    PROP_ZERO,
    PROP_NAME,
    N_PROPERTIES
};

typedef struct _StSassContextPrivate StSassContextPrivate;

struct _StSassContextPrivate
{
    gchar *name;
};

static GParamSpec *st_sass_context_properties[N_PROPERTIES] = { NULL };

G_DEFINE_TYPE (StSassContext, st_sass_context, G_TYPE_OBJECT);

static void
st_sass_context_dispose (GObject *obj)
{
    StSassContext *self = ST_SASS_CONTEXT (obj);
    StSassContextPrivate *priv = ST_SASS_CONTEXT_GET_PRIVATE (self);

    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    G_OBJECT_CLASS (st_sass_context_parent_class)->dispose (obj);
}

static void
st_sass_context_finalize (GObject *obj)
{
    StSassContext *self = ST_SASS_CONTEXT (obj);
    StSassContextPrivate *priv = ST_SASS_CONTEXT_GET_PRIVATE (self);

    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    G_OBJECT_CLASS (st_sass_context_parent_class)->finalize (obj);
}

static GObject *
st_sass_context_constructor (GType type,
            guint n,
            GObjectConstructParam *param)
{
    GObject *obj = NULL;

    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    obj = G_OBJECT_CLASS (st_sass_context_parent_class)->
        constructor (type, n, param);

    return obj;
}

static void
st_sass_context_constructed (GObject *obj)
{
    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    G_OBJECT_CLASS (st_sass_context_parent_class)->constructed (obj);
}

static void
st_sass_context_get_property (GObject *obj, guint id,
            GValue *value, GParamSpec *pspec)
{
    StSassContext *self = ST_SASS_CONTEXT (obj);
    StSassContextPrivate *priv = ST_SASS_CONTEXT_GET_PRIVATE (self);

    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    switch (id) {
    case PROP_NAME:
        g_value_set_string (value, priv->name);
        break;
    default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (obj, id, pspec);
        break;
    }
}

static void
st_sass_context_set_property (GObject *obj, guint id,
            const GValue *value, GParamSpec *pspec)
{
    StSassContext *self = ST_SASS_CONTEXT (obj);
    StSassContextPrivate *priv = ST_SASS_CONTEXT_GET_PRIVATE (self);

    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    switch (id) {
    case PROP_NAME:
        if (priv->name)
          g_free (priv->name);
        priv->name = g_strdup (g_value_get_string(value));
        break;
    default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (obj, id, pspec);
        break;
    }
}

static void
st_sass_context_class_init (StSassContextClass *klass)
{
    GObjectClass *obj_class = G_OBJECT_CLASS (klass);

    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    obj_class->constructor = st_sass_context_constructor;
    obj_class->constructed = st_sass_context_constructed;
    obj_class->dispose = st_sass_context_dispose;
    obj_class->finalize = st_sass_context_finalize;
    obj_class->get_property = st_sass_context_get_property;
    obj_class->set_property = st_sass_context_set_property;

    /* Properties */
    st_sass_context_properties[PROP_NAME] =
        g_param_spec_string ("name", "Name", "Name",
                    NULL, G_PARAM_READWRITE);
    g_object_class_install_properties (obj_class, N_PROPERTIES,
                st_sass_context_properties);

    g_type_class_add_private (klass, sizeof (StSassContextPrivate));
}

static void
st_sass_context_init (StSassContext *self)
{
    StSassContextPrivate *priv = ST_SASS_CONTEXT_GET_PRIVATE (self);

    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);
}

GObject *
st_sass_context_new (void)
{
    g_debug ("%s:%d[%s]", __FILE__, __LINE__, __FUNCTION__);

    return g_object_new (ST_TYPE_SASS_CONTEXT, NULL);
}

