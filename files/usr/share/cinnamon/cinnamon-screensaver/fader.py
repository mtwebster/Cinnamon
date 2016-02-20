#! /usr/bin/python3

from gi.repository import Gtk, Gdk, GObject

class WindowFader:
    STEP = .05     # 0....1.0
    INTERVAL = 50 # ms

    def __init__(self, window):
        self.window = window

    def fade_in_step(self):
        new_opacity = min(self.window.get_opacity() + self.STEP, 1.0)
        self.window.set_opacity(new_opacity)

        return new_opacity < 1.0

    def fade_in(self):
        self.window.set_opacity(0)
        self.window.show()

        GObject.timeout_add(self.INTERVAL, self.fade_in_step)

    def fade_out_step(self):
        new_opacity = max(self.window.get_opacity() - self.STEP, 0.0)
        self.window.set_opacity(new_opacity)

        return new_opacity > 0.0

    def fade_out(self):
        GObject.timeout_add(self.INTERVAL, self.fade_out_step)



