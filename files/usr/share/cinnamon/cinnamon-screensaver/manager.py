#! /usr/bin/python3

import gi
gi.require_version('CinnamonDesktop', '3.0')
from gi.repository import Gtk, CinnamonDesktop, Gdk, Gio
import random

from overlay import ScreensaverOverlayWindow
from window import ScreensaverWindow
from lock import LockDialog
from clock import ClockWidget
import timers

UNLOCK_TIMEOUT = 30

class ScreensaverManager:
    def __init__(self):
        self.bg = CinnamonDesktop.BG()
        self.bg.connect("changed", self.on_bg_changed)

        self.bg_settings = Gio.Settings(schema_id="org.cinnamon.desktop.background")
        self.bg_settings.connect("change-event", self.on_bg_settings_changed)

        self.bg.load_from_preferences(self.bg_settings)

        self.windows = []

        self.screen = Gdk.Screen.get_default()

        self.overlay = None
        self.clock_widget = None
        self.lock_dialog = None

        self.focus_monitor = self.get_monitor_at_pointer_position()

        self.lock_added = False

        self.setup_overlay()

# Setup the stuff #

    def setup_overlay(self):
        self.overlay = ScreensaverOverlayWindow(self.screen)
        self.overlay.overlay.connect("get-child-position", self.position_overlay_child)
        self.overlay.connect("realize", self.on_overlay_realized)
        self.overlay.show_all()

    def on_overlay_realized(self, widget):
        self.setup_windows()
        self.setup_clock()
        self.setup_events()
        self.mn_id = self.overlay.connect("motion-notify-event", self.on_wake_event)

    def setup_windows(self):
        n = self.screen.get_n_monitors()

        for index in range(n):
            primary = self.screen.get_primary_monitor() == index

            window = ScreensaverWindow(self.screen, index, primary)
            window.bg_image.connect("realize", self.on_window_bg_image_realized, window)

            self.windows.append(window)

            window.reveal()

            self.overlay.add_child(window)
            self.overlay.put_on_bottom(window)

    def on_window_bg_image_realized(self, widget, window):
        self.bg.create_and_set_gtk_image (widget, window.rect.width, window.rect.height)
        widget.queue_draw()

    def setup_clock(self):
        self.clock_widget = ClockWidget("I'll be back in 5", self.focus_monitor)

        self.overlay.add_child(self.clock_widget)
        self.overlay.put_on_top(self.clock_widget)

        self.clock_widget.show_all()

        self.clock_widget.reveal()
        self.clock_widget.start_positioning()

    def setup_events(self):
        self.bp_id = self.overlay.connect("button-press-event", self.on_wake_event)
        self.br_id = self.overlay.connect("button-release-event", Gtk.main_quit)
        self.kp_id = self.overlay.connect("key-press-event", self.on_wake_event)
        self.kr_id = self.overlay.connect("key-release-event", self.on_wake_event)

    def disconnect_events(self):
        if self.bp_id > 0:
            self.overlay.disconnect(self.bp_id)
            self.bp_id = 0

        if self.br_id > 0:
            self.overlay.disconnect(self.br_id)
            self.br_id = 0

        if self.kp_id > 0:
            self.overlay.disconnect(self.kp_id)
            self.kp_id = 0

        if self.kr_id > 0:
            self.overlay.disconnect(self.kr_id)
            self.kr_id = 0

# Event Handling #

    def on_wake_event(self, widget, event):
        self.focus_monitor = self.get_monitor_at_pointer_position()

        if not self.lock_added:
            self.raise_lock_widget()
            self.disconnect_events()

        if self.lock_added:
            self.overlay.put_on_top(self.clock_widget)
            self.overlay.put_on_top(self.lock_dialog)

        timers.get().start("wake-timeout", UNLOCK_TIMEOUT * 1000, self.on_wake_timeout)

        return True

    def on_wake_timeout(self):
        timers.get().cancel("wake-timeout")
        self.cancel_lock_widget()

        return False

    def raise_lock_widget(self):
        self.disconnect_events()
        self.clock_widget.stop_positioning()

        self.lock_dialog = LockDialog()
        self.overlay.add_child(self.lock_dialog)

        self.overlay.set_default(self.lock_dialog.auth_unlock_button)
        self.lock_dialog.auth_prompt_entry.grab_focus()

        self.lock_added = True

        self.lock_dialog.reveal()

    def cancel_lock_widget(self):
        self.clock_widget.start_positioning()

        self.lock_dialog.destroy()
        self.lock_dialog = None

        self.lock_added = False

        self.setup_events()

# GnomeBG stuff #

    def on_bg_changed(self, bg):
        pass

    def on_bg_settings_changed(self, settings, keys, n_keys):
        self.bg.load_from_preferences(self.bg_settings)
        self.refresh_backgrounds()

# Overlay window management #

    def position_overlay_child(self, overlay, child, allocation):
        if isinstance(child, ScreensaverWindow):
            allocation.x = child.rect.x
            allocation.y = child.rect.y
            allocation.width = child.rect.width
            allocation.height = child.rect.height

            return True

        if isinstance(child, LockDialog):
            monitor = self.get_monitor_at_pointer_position()
            monitor_rect = self.screen.get_monitor_geometry(monitor)

            min_rect, nat_rect = child.get_preferred_size()

            allocation.width = nat_rect.width
            allocation.height = nat_rect.height

            allocation.x = monitor_rect.x + (monitor_rect.width / 2) - (nat_rect.width / 2)
            allocation.y = monitor_rect.y + (monitor_rect.height / 2) - (nat_rect.height / 2)

            return True

        if isinstance(child, ClockWidget):
            min_rect, nat_rect = child.get_preferred_size()

            if self.lock_added:
                monitor_rect = self.screen.get_monitor_geometry(self.focus_monitor)

                allocation.width = nat_rect.width
                allocation.height = nat_rect.height

                allocation.x = monitor_rect.x
                allocation.y = monitor_rect.y + (monitor_rect.height / 2) - (nat_rect.height / 2)

                return True
            else:
                current_monitor = child.current_monitor

                monitor_rect = self.screen.get_monitor_geometry(current_monitor)

                allocation.width = nat_rect.width
                allocation.height = nat_rect.height

                halign = child.get_halign()
                valign = child.get_valign()

                if halign == Gtk.Align.START:
                    allocation.x = monitor_rect.x
                elif halign == Gtk.Align.CENTER:
                    allocation.x = monitor_rect.x + (monitor_rect.width / 2) - (nat_rect.width / 2)
                elif halign == Gtk.Align.END:
                    allocation.x = monitor_rect.x + monitor_rect.width - nat_rect.width

                if valign == Gtk.Align.START:
                    allocation.y = monitor_rect.y
                elif halign == Gtk.Align.CENTER:
                    allocation.y = monitor_rect.y + (monitor_rect.height / 2) - (nat_rect.height / 2)
                elif halign == Gtk.Align.END:
                    allocation.y = monitor_rect.y + monitor_rect.height - nat_rect.height

                if self.screen.get_n_monitors() > 1:
                    new_monitor = current_monitor
                    while new_monitor == current_monitor:
                        new_monitor = random.randint(0, self.screen.get_n_monitors() - 1)
                    child.current_monitor = new_monitor

                return True

        return False

# Utilities #

    def get_monitor_at_pointer_position(self):
        if self.overlay == None:
            return 0

        manager = Gdk.Display.get_default().get_device_manager()
        pointer = manager.get_client_pointer()

        window, x, y, mask = self.overlay.get_window().get_device_position(pointer)

        return self.screen.get_monitor_at_point(x, y)
