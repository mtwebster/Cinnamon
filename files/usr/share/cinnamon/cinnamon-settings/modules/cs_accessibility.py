#!/usr/bin/env python2

from SettingsWidgets import *
from gi.repository import Gtk, CDesktopEnums

DPI_FACTOR_LARGE         = 1.25
DPI_FACTOR_NORMAL        = 1.0

HIGH_CONTRAST_THEME      = "HighContrast"
KEY_TEXT_SCALING_FACTOR  = "text-scaling-factor"
KEY_GTK_THEME            = "gtk-theme"
KEY_ICON_THEME           = "icon-theme"
KEY_WM_THEME             = "theme"

class Module:
    name = "universal-access"
    comment = _("Miscellaneous Cinnamon preferences")
    category = "prefs"

    def __init__(self, content_box):
        keywords = _("magnifier, talk, access, zoom, keys, contrast");
        sidePage = SidePage(_("Accessibility"), "cs-universal-access", keywords, content_box, module=self)
        self.sidePage = sidePage

    def on_module_selected(self):
        if not self.loaded:
            print "Loading Accessibility module"

            self.iface_settings = Gio.Settings(schema_id="org.cinnamon.desktop.interface")
            self.wm_settings = Gio.Settings(schema_id="org.cinnamon.desktop.wm.preferences");
            self.mag_settings = Gio.Settings(schema_id="org.cinnamon.desktop.a11y.magnifier");

            page = SettingsPage()
            self.sidePage.add_widget(page)

            settings = page.add_section(_("Visual Aids"))

            switch = GSettingsSwitch(_("High Contrast"))
            self.iface_settings.bind_with_mapping(KEY_GTK_THEME,
                                                  switch.content_widget, "active",
                                                  Gio.SettingsBindFlags.DEFAULT,
                                                  self.hi_con_get_mapping,
                                                  self.hi_con_set_mapping)
            settings.add_row(switch)

            switch = GSettingsSwitch(_("Large Text"))
            self.iface_settings.bind_with_mapping(KEY_TEXT_SCALING_FACTOR,
                                                  switch.content_widget, "active",
                                                  Gio.SettingsBindFlags.DEFAULT,
                                                  self.lg_text_get_mapping,
                                                  self.lg_text_set_mapping)
            settings.add_row(switch)

            switch = GSettingsSwitch(_("Beep on Caps and Num Lock"),
                                     "org.cinnamon.desktop.a11y.keyboard",
                                     "togglekeys-enable")
            settings.add_row(switch)

            settings = page.add_section(_("Desktop Zoom"))

            switch = GSettingsSwitch(_("Enable Zoom"), "org.cinnamon.desktop.a11y.applications", "screen-magnifier-enabled")
            settings.add_row(switch)

            spin = GSettingsSpinButton(_("Magnification:"), "org.cinnamon.desktop.a11y.magnifier", "mag-factor", None, 1.0, 15.0, step=0.5)
            settings.add_reveal_row(spin, "org.cinnamon.desktop.a11y.applications", "screen-magnifier-enabled")

            zoom_key_options = [["", _("Disabled")], ["<Alt>", "<Alt>"],["<Super>", "<Super>"],["<Control>", "<Control>"]]
            widget = GSettingsComboBox(_("Mouse wheel modifier"), "org.cinnamon.desktop.wm.preferences", "mouse-button-zoom-modifier", zoom_key_options)
            widget.set_tooltip_text(_("While this modifier is pressed, mouse scrolling will increase or decrease zoom."))
            settings.add_reveal_row(widget, "org.cinnamon.desktop.a11y.applications", "screen-magnifier-enabled")

            switch = GSettingsSwitch(_("Scroll at screen edges"), "org.cinnamon.desktop.a11y.magnifier", "scroll-at-edges")
            settings.add_reveal_row(switch, "org.cinnamon.desktop.a11y.applications", "screen-magnifier-enabled")

            mouse_track_options = [["centered",     _("Keep cursor centered")],
                                   ["proportional", _("Cursor moves with contents")],
                                   ["push",         _("Cursor pushes contents around")]]

            widget = GSettingsComboBox(_("Mouse tracking mode"), "org.cinnamon.desktop.a11y.magnifier", "mouse-tracking", mouse_track_options)
            settings.add_reveal_row(widget, "org.cinnamon.desktop.a11y.applications", "screen-magnifier-enabled")

            switch = GSettingsSwitch(_("Lens Mode"), "org.cinnamon.desktop.a11y.magnifier", "lens-mode")
            settings.add_reveal_row(switch, "org.cinnamon.desktop.a11y.applications", "screen-magnifier-enabled")

            self.zoom_stack = SettingsStack()
            self.zoom_stack.set_transition_type(Gtk.StackTransitionType.CROSSFADE)

            lens_shape_options = [["square",          _("Square")],
                                  ["horizontal",      _("Horizontal strip")],
                                  ["vertical",        _("Vertical strip")]]

            widget = GSettingsComboBox(_("Lens shape"), "org.cinnamon.desktop.a11y.magnifier", "lens-shape", lens_shape_options)
            self.zoom_stack.add_named(widget, "shape")

            screen_pos_options = [["full-screen",     _("Full screen")],
                                  ["top-half",        _("Top half")],
                                  ["bottom-half",     _("Bottom half")],
                                  ["left-half",       _("Left half")],
                                  ["right-half",      _("Right half")]]

            widget = GSettingsComboBox(_("Screen position"), "org.cinnamon.desktop.a11y.magnifier", "screen-position", screen_pos_options)
            self.zoom_stack.add_named(widget, "screen")

            settings.add_reveal_row(self.zoom_stack, "org.cinnamon.desktop.a11y.applications", "screen-magnifier-enabled")

            self.mag_settings.bind_with_mapping("lens-mode",
                                                self.zoom_stack, "visible-child-name",
                                                Gio.SettingsBindFlags.GET,
                                                self.zoom_stack_get,
                                                None)

            if (self.mag_settings.get_boolean("lens-mode")):
                self.zoom_stack.set_visible_child_name("shape")
            else:
                self.zoom_stack.set_visible_child_name("screen")

    def zoom_stack_get(self, lens_mode):
        ret = "screen"

        if lens_mode:
            ret = "shape"
        else:
            ret = "screen"

        return ret

    def hi_con_get_mapping(self, string):
        return string == HIGH_CONTRAST_THEME

    def hi_con_set_mapping(self, active):
        ret = None

        if active:
            ret = HIGH_CONTRAST_THEME

            self.iface_settings.set_string(KEY_ICON_THEME, HIGH_CONTRAST_THEME)
            self.wm_settings.set_string(KEY_WM_THEME, HIGH_CONTRAST_THEME)
        else:
            ret = self.iface_settings.get_default_value(KEY_GTK_THEME).get_string()
            self.iface_settings.reset(KEY_ICON_THEME)
            self.wm_settings.reset(KEY_WM_THEME)

        return ret

    def lg_text_get_mapping(self, factor):
        return factor > DPI_FACTOR_NORMAL

    def lg_text_set_mapping(self, active):
        ret = None

        if active:
            ret = DPI_FACTOR_LARGE
        else:
            ret = self.iface_settings.get_default_value(KEY_TEXT_SCALING_FACTOR).get_double()

        return ret


