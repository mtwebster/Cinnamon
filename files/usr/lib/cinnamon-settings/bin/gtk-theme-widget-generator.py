#!/usr/bin/env python

from gi.repository import Gtk, GObject
import sys

class GtkPreviewGenerator:
    def __init__(self):
        settings = Gtk.Settings.get_default()

        settings.set_string_property("gtk-theme-name", sys.argv[1], "gtk-preview-widget-%s" % sys.argv[1])

        top_row = Gtk.Box(Gtk.Orientation.HORIZONTAL)

        w = Gtk.Button("Button")
        top_row.pack_start(w, False, False, 2)

        w = Gtk.HScale(draw_value=False)
        w.set_range(0, 1.0)
        w.set_value(0.5)
        top_row.pack_start(w, True, True, 2)

        w = Gtk.CheckButton()
        w.set_active(True)
        top_row.pack_start(w, False, False, 2)

        w = Gtk.RadioButton()
        top_row.pack_start(w, False, False, 2)

        bottom_row = Gtk.Box(Gtk.Orientation.HORIZONTAL)

        w = Gtk.Switch()
        w.set_active(True)
        bottom_row.pack_start(w, False, False, 2)

        w = Gtk.Entry()
        w.set_placeholder_text("Search...")
        w.set_icon_from_stock(Gtk.EntryIconPosition.PRIMARY, "gtk-find")
        bottom_row.pack_start(w, False, False, 2)

        main_box = Gtk.VBox()
        main_box.pack_start(top_row, False, False, 2)
        main_box.pack_start(bottom_row, False, False, 2)

        align = Gtk.Alignment(xalign=0.5, yalign=0.5, xscale=1.0, yscale=1.0)
        align.set_padding(5, 5, 5, 5)
        align.add(main_box)

        # eventbox = Gtk.EventBox(above_child=False)
        # eventbox.add(align)

        plug = Gtk.Plug.new(long(sys.argv[2]))
        plug.add(align)

        plug.connect("destroy", Gtk.main_quit)
        plug.show_all()

    def on_event(self, *args):
        return False



if len(sys.argv) < 3:
    exit()

GtkPreviewGenerator()
Gtk.main()
