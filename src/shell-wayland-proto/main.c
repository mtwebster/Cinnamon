/*
 * Clutter Wayland Client Backend Test
 *
 * This tests the new Clutter wayland-client backend with:
 * 1. Layer-shell surface positioning
 * 2. ClutterText rendering (the critical test)
 * 3. Basic actor animations
 */

#include <stdio.h>
#include <stdlib.h>
#include <clutter/clutter.h>

static ClutterActor *label = NULL;
static ClutterActor *background = NULL;
static int frame_count = 0;

static gboolean
on_timeout (gpointer user_data)
{
    ClutterActor *stage = user_data;

    frame_count++;

    /* Update label text periodically */
    if (frame_count % 60 == 0) {
        gchar *text = g_strdup_printf ("Clutter Wayland Client Test - Frame %d", frame_count);
        clutter_text_set_text (CLUTTER_TEXT (label), text);
        g_free (text);
        printf ("Frame %d\n", frame_count);
    }

    /* Animate background hue */
    float hue = (frame_count % 360) / 360.0f;
    int hi = (int)(hue * 6.0f) % 6;
    float f = hue * 6.0f - hi;
    float v = 0.3f;
    float p = v * (1.0f - 0.7f);
    float q = v * (1.0f - f * 0.7f);
    float t = v * (1.0f - (1.0f - f) * 0.7f);

    float r, g, b;
    switch (hi) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q; break;
    }

    ClutterColor color;
    color.red = (guint8)(r * 255);
    color.green = (guint8)(g * 255);
    color.blue = (guint8)(b * 255);
    color.alpha = 255;

    clutter_actor_set_background_color (background, &color);

    /* Queue redraw */
    clutter_actor_queue_redraw (stage);

    return G_SOURCE_CONTINUE;
}

int
main (int argc, char *argv[])
{
    ClutterActor *stage;
    ClutterColor white = { 255, 255, 255, 255 };
    ClutterColor dark = { 40, 40, 60, 255 };

    printf ("Clutter Wayland Client Backend Test\n");
    printf ("====================================\n\n");

    /* Force the wayland-client backend */
    g_setenv ("CLUTTER_BACKEND", "wayland-client", TRUE);

    /* Initialize Clutter */
    if (clutter_init (&argc, &argv) != CLUTTER_INIT_SUCCESS) {
        fprintf (stderr, "Failed to initialize Clutter\n");
        return 1;
    }

    printf ("Clutter initialized with backend: %s\n",
            g_getenv ("CLUTTER_BACKEND") ?: "(default)");

    /* Get the default stage */
    stage = clutter_stage_new ();
    if (!stage) {
        fprintf (stderr, "Failed to create stage\n");
        return 1;
    }

    clutter_stage_set_title (CLUTTER_STAGE (stage), "Clutter Wayland Test");
    clutter_actor_set_background_color (stage, &dark);

    /* Create a background rectangle for color animation */
    background = clutter_actor_new ();
    clutter_actor_set_background_color (background, &dark);
    clutter_actor_add_constraint (background,
        clutter_bind_constraint_new (stage, CLUTTER_BIND_WIDTH, 0));
    clutter_actor_add_constraint (background,
        clutter_bind_constraint_new (stage, CLUTTER_BIND_HEIGHT, 0));
    clutter_actor_add_child (stage, background);

    /* Create a ClutterText - this is the critical test */
    label = clutter_text_new_with_text ("Sans Bold 16",
                                        "Clutter Wayland Client Test - Initializing...");
    clutter_text_set_color (CLUTTER_TEXT (label), &white);
    clutter_actor_set_position (label, 20, 10);
    clutter_actor_add_child (stage, label);

    printf ("Created ClutterText actor\n");

    /* Show the stage */
    clutter_actor_show (stage);

    /* Add a timeout for animation (16ms ~ 60fps) */
    g_timeout_add (16, on_timeout, stage);

    printf ("\nEntering main loop (Ctrl+C to exit)...\n\n");
    printf ("If you see animated text, ClutterText rendering works!\n\n");

    /* Run the main loop */
    clutter_main ();

    printf ("\nDone.\n");
    return 0;
}
