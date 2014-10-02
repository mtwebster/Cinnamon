#!/usr/bin/env python

from gi.repository import Gtk
import sys

class GtkPreviewGenerator:
    def __init__(self):
        settings = Gtk.Settings.get_default()

        settings.set_string_property("gtk-theme-name", sys.argv[1], "gtk-preview-widget-%s" % sys.argv[1])

        box = Gtk.Box(Gtk.Orientation.HORIZONTAL)

        w = Gtk.Button("Button")
        box.pack_start(w, False, False, 2)

        w = Gtk.VScale(draw_value=False)
        w.set_range(0, 1.0)
        w.set_value(0)
        box.pack_start(w, False, False, 2)

        w = Gtk.CheckButton()
        w.set_active(True)
        box.pack_start(w, False, False, 2)

        w = Gtk.RadioButton()
        box.pack_start(w, False, False, 2)

        eventbox = Gtk.EventBox(above_child=True)
        eventbox.set_events(0)
        # eventbox.connect("event", self.on_event)
        eventbox.add(box)

        plug = Gtk.Plug.new(long(sys.argv[2]))
        plug.add(eventbox)

        plug.connect("destroy", Gtk.main_quit)
        plug.show_all()

    def on_event(self, *args):
        return False

if len(sys.argv) < 3:
    exit()

GtkPreviewGenerator()
Gtk.main()
