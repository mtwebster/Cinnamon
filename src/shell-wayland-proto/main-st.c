/*
 * St Wayland Client Backend Test
 *
 * Tests St toolkit rendering with the Clutter wayland-client backend:
 * 1. StThemeContext initialization
 * 2. StLabel rendering
 * 3. StButton rendering
 * 4. Basic theming via CSS
 */

#include <stdio.h>
#include <stdlib.h>
#include <clutter/clutter.h>

#include <st/st-theme.h>
#include <st/st-theme-context.h>
#include <st/st-label.h>
#include <st/st-button.h>
#include <st/st-box-layout.h>
#include <st/st-widget.h>
#include <st/st-icon.h>

static int frame_count = 0;

static gboolean
on_timeout (gpointer user_data)
{
    ClutterActor *stage = user_data;

    frame_count++;

    if (frame_count % 60 == 0) {
        printf ("Frame %d\n", frame_count);
    }

    clutter_actor_queue_redraw (stage);

    return G_SOURCE_CONTINUE;
}

int
main (int argc, char *argv[])
{
    ClutterActor *stage;
    ClutterColor panel_bg = { 40, 40, 40, 255 };
    StThemeContext *context;
    StTheme *theme;
    StWidget *box;
    StWidget *label;
    StWidget *button;
    StWidget *clock_label;
    ClutterActor *icon;

    printf ("St Wayland Client Backend Test\n");
    printf ("==============================\n\n");
    fflush (stdout);

    /* Force the wayland-client backend */
    g_setenv ("CLUTTER_BACKEND", "wayland-client", TRUE);

    printf ("Initializing Clutter...\n");
    fflush (stdout);

    /* Initialize Clutter */
    if (clutter_init (&argc, &argv) != CLUTTER_INIT_SUCCESS) {
        fprintf (stderr, "Failed to initialize Clutter\n");
        return 1;
    }

    printf ("Clutter initialized with backend: %s\n",
            g_getenv ("CLUTTER_BACKEND") ?: "(default)");
    fflush (stdout);

    /* Create the stage */
    stage = clutter_stage_new ();
    if (!stage) {
        fprintf (stderr, "Failed to create stage\n");
        return 1;
    }

    clutter_stage_set_title (CLUTTER_STAGE (stage), "St Wayland Test");
    clutter_actor_set_background_color (stage, &panel_bg);

    printf ("Creating St theme context...\n");
    fflush (stdout);

    /* Initialize St theme context */
    context = st_theme_context_get_for_stage (CLUTTER_STAGE (stage));
    if (!context) {
        fprintf (stderr, "Failed to get theme context\n");
        return 1;
    }

    printf ("Creating St theme...\n");
    fflush (stdout);

    /* Create a simple inline theme - no external CSS file needed */
    theme = st_theme_new (NULL, NULL, NULL);
    st_theme_context_set_theme (context, theme);
    st_theme_context_set_font (context,
                               pango_font_description_from_string ("Sans 12"));

    printf ("St theme context initialized\n");
    fflush (stdout);

    /* Create a horizontal box layout for the panel */
    box = st_box_layout_new ();
    st_box_layout_set_vertical (ST_BOX_LAYOUT (box), FALSE);
    clutter_actor_set_position (CLUTTER_ACTOR (box), 0, 0);

    /* Make the box fill the stage width */
    clutter_actor_add_constraint (CLUTTER_ACTOR (box),
        clutter_bind_constraint_new (stage, CLUTTER_BIND_WIDTH, 0));
    clutter_actor_set_height (CLUTTER_ACTOR (box), 40);

    clutter_actor_add_child (stage, CLUTTER_ACTOR (box));

    /* Create a menu button */
    button = st_button_new_with_label ("Menu");
    st_widget_set_style (button, "padding: 8px 16px; color: white; background-color: #444;");
    clutter_actor_add_child (CLUTTER_ACTOR (box), CLUTTER_ACTOR (button));

    printf ("Created StButton\n");
    fflush (stdout);

    /* Create an icon */
    icon = st_icon_new ();
    st_icon_set_icon_name (ST_ICON (icon), "linuxmint-logo-ring");
    st_icon_set_icon_size (ST_ICON (icon), 24);
    st_icon_set_icon_type (ST_ICON (icon), ST_ICON_SYMBOLIC);
    st_widget_set_style (ST_WIDGET (icon), "padding: 8px; color: white;");
    clutter_actor_add_child (CLUTTER_ACTOR (box), icon);

    printf ("Created StIcon\n");
    fflush (stdout);

    /* Create a label */
    label = st_label_new ("St Wayland Panel Test");
    st_widget_set_style (label, "padding: 8px 16px; color: #88ff88;");
    clutter_actor_add_child (CLUTTER_ACTOR (box), CLUTTER_ACTOR (label));

    printf ("Created StLabel\n");
    fflush (stdout);

    /* Create a clock label (right-aligned would need more layout work) */
    clock_label = st_label_new ("12:00");
    st_widget_set_style (clock_label, "padding: 8px 16px; color: white;");
    clutter_actor_add_child (CLUTTER_ACTOR (box), CLUTTER_ACTOR (clock_label));

    printf ("Created clock StLabel\n");
    fflush (stdout);

    printf ("Showing stage...\n");
    fflush (stdout);

    /* Show the stage */
    clutter_actor_show (stage);

    printf ("Stage shown, adding timeout...\n");
    fflush (stdout);

    /* Add a timeout for redraw (16ms ~ 60fps) */
    g_timeout_add (16, on_timeout, stage);

    printf ("\nEntering main loop (Ctrl+C to exit)...\n\n");
    printf ("If you see styled widgets, St rendering works!\n\n");
    fflush (stdout);

    /* Run the main loop */
    clutter_main ();

    printf ("\nDone.\n");
    return 0;
}
