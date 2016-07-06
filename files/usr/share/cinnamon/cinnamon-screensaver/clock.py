#! /usr/bin/python3

from gi.repository import CinnamonDesktop, GLib, Gtk, Gio, GObject
import utils
import random
from baseWindow import BaseWindow

CLOCK_POSITIONING_TIMEOUT = 5

ALIGNMENTS = [int(Gtk.Align.START), int(Gtk.Align.END), int(Gtk.Align.CENTER)]

class ClockWidget(BaseWindow):
    def __init__(self, away_message=None, initial_monitor=0):
        super(ClockWidget, self).__init__()

        self.set_halign(Gtk.Align.CENTER)
        self.set_valign(Gtk.Align.CENTER)

        self.set_margin_start(200)
        self.set_margin_end(200)
        self.set_margin_top(100)
        self.set_margin_bottom(100)

        self.current_monitor = initial_monitor
        self.positioning_id = 0

        self.away_message = away_message

        self.label = Gtk.Label()
        self.label.show()
        self.add(self.label)

        self.clock_tracker = CinnamonDesktop.WallClock()
        self.clock_tracker.connect("notify::clock", self.on_clock_changed)

        self.ss_settings = Gio.Settings("org.cinnamon.desktop.screensaver")
        self.ss_settings.connect("changed", self.on_settings_changed)
        self.iface_settings = Gio.Settings("org.cinnamon.desktop.interface")
        self.iface_settings.connect("changed", self.on_settings_changed)

        tz = Gio.File.new_for_path(path="/etc/localtime")
        self.tz_monitor = tz.monitor_file(0, None)
        self.tz_monitor.connect("changed", self.on_tz_changed)

        self.settings = utils.Settings()
        self.fetch_settings()

        self.update_clock()

    def on_clock_changed(self, clock, pspec):
        self.update_clock()

    def on_settings_changed(self, settings, key):
        self.update_clock()

    def on_tz_changed(self, monitor, file, other, event):
        self.update_clock()

    def get_clock_string(self):
        date_value = ""
        time_value = ""

        now = GLib.DateTime.new_now_local()

        if not self.settings.use_custom_format:
            if self.settings.show_date:
                date_value = now.format(_("%A, %B %e"))
            else:
                date_value = ""

            if self.settings.use_24h:
                time_value = now.format("%H:%M").lstrip()
            else:
                time_value = now.format("%l:%M %p").lstrip()
        else:
            date_value = now.format(self.settings.custom_date)
            time_value = now.format(self.settings.custom_time)

        clock_string = ('<b><span font_desc=\"%s\" foreground=\"#FFFFFF\">%s</span></b>\n' +\
                       '<b><span font_desc=\"%s\" foreground=\"#FFFFFF\">%s</span></b>')\
                        % (self.settings.font_time, time_value, self.settings.font_date, date_value)

        return clock_string

    def update_clock(self):
        default_message = GLib.markup_escape_text (self.settings.default_message, -1)
        font_message = self.settings.font_message

        if self.away_message and self.away_message != "":
            user_name = utils.get_user_display_name()
            markup = ('%s\n\n<b><span font_desc=\"Ubuntu 14\" foreground=\"#CCCCCC\">%s</span></b>' +\
                      '\n<b><span font_desc=\"Ubuntu 10\" foreground=\"#ACACAC\">  ~ %s</span></b>') %\
                     (self.get_clock_string(), self.away_message, user_name)
        else:
            markup = '%s\n\n<b><span font_desc=\"%s\" foreground=\"#CCCCCC\">%s</span></b>' %\
                     (self.get_clock_string(), font_message, default_message)

        self.label.set_markup(markup)
        self.label.set_line_wrap(True)
        self.label.set_alignment(0.5, 0.5)

    def fetch_settings(self):
        self.settings.default_message = self.ss_settings.get_string("default-message")
        self.settings.font_message = self.ss_settings.get_string("font-message")

        self.settings.use_custom_format = self.ss_settings.get_boolean("use-custom-format")
        self.settings.custom_time = self.ss_settings.get_string("time-format")
        self.settings.custom_date = self.ss_settings.get_string("date-format")
        self.settings.font_time = self.ss_settings.get_string("font-time")
        self.settings.font_date = self.ss_settings.get_string("font-date")

        self.settings.show_date = self.iface_settings.get_boolean("clock-show-date")
        self.settings.use_24h = self.iface_settings.get_boolean("clock-use-24h")

    def start_positioning(self):
        if self.positioning_id > 0:
            GObject.source_remove(self.positioning_id)
            self.positioning_id = 0

        self.positioning_id = GObject.timeout_add_seconds(CLOCK_POSITIONING_TIMEOUT, self.positioning_callback)

    def stop_positioning(self, to_unlock_position=False):
        if self.positioning_id > 0:
            GObject.source_remove(self.positioning_id)
            self.positioning_id = 0

        self.positioning_callback(to_unlock_position)

    def positioning_callback(self, to_unlock_position=False):
        self.unreveal()
        self.queue_draw()
        GObject.timeout_add(self.REVEALER_DURATION + 10, self.align_clock, to_unlock_position)

        return True

    def align_clock(self, to_unlock_position=False):
        current_halign = int(self.get_halign())
        horizontal = current_halign

        current_valign = int(self.get_valign())
        vertical = current_valign

        while horizontal == current_halign:
            horizontal = ALIGNMENTS[random.randint(0, 2)]
        while vertical == current_valign:
            vertical = ALIGNMENTS[random.randint(0, 2)]

        if to_unlock_position:
            self.set_halign(Gtk.Align.START)
            self.set_valign(Gtk.Align.CENTER)
        else:
            self.set_halign(Gtk.Align(horizontal))
            self.set_valign(Gtk.Align(vertical))

        self.queue_draw()

        self.reveal()

        return False



