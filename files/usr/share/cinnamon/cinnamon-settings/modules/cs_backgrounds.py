#!/usr/bin/python3

import os
import gettext
import _thread as thread
import subprocess
import locale
import time
import hashlib
import mimetypes
import pickle
import shutil
from io import BytesIO
from xml.etree import ElementTree

from PIL import Image
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("CinnamonBg", "1.0")
from gi.repository import Gio, Gtk, Gdk, GdkPixbuf, Pango, GLib, CinnamonBg

from bin.SettingsWidgets import SidePage
from xapp.GSettingsWidgets import *

gettext.install("cinnamon", "/usr/share/locale")

BACKGROUND_COLOR_SHADING_TYPES = [
    ("solid", _("Solid color")),
    ("horizontal", _("Horizontal gradient")),
    ("vertical", _("Vertical gradient"))
]

BACKGROUND_PICTURE_OPTIONS = [
    ("none", _("No picture")),
    ("wallpaper", _("Mosaic")),
    ("centered", _("Centered")),
    ("scaled", _("Scaled")),
    ("stretched", _("Stretched")),
    ("zoom", _("Zoom"))
]

BACKGROUND_ICONS_SIZE = 100

PLACEMENT_BY_NICK = {
    "none": CinnamonBg.Placement.NONE,
    "wallpaper": CinnamonBg.Placement.WALLPAPER,
    "centered": CinnamonBg.Placement.CENTERED,
    "scaled": CinnamonBg.Placement.SCALED,
    "stretched": CinnamonBg.Placement.STRETCHED,
    "zoom": CinnamonBg.Placement.ZOOM,
}
NICK_BY_PLACEMENT = {int(v): k for k, v in PLACEMENT_BY_NICK.items()}

SHADING_BY_NICK = {
    "solid": CinnamonBg.Shading.SOLID,
    "horizontal": CinnamonBg.Shading.HORIZONTAL,
    "vertical": CinnamonBg.Shading.VERTICAL,
}
NICK_BY_SHADING = {int(v): k for k, v in SHADING_BY_NICK.items()}

BACKGROUND_COLLECTION_TYPE_DIRECTORY = "directory"
BACKGROUND_COLLECTION_TYPE_XML = "xml"

CONFIG_FOLDER = os.path.join(GLib.get_user_config_dir(), 'cinnamon', 'backgrounds')
OLD_CONFIG_FOLDER = os.path.expanduser("~/.cinnamon/backgrounds")
USER_FOLDERS_FILE_NAME = 'user-folders.lst'

# even though pickle supports higher protocol versions, we want to version 2 because it's the latest
# version supported by python2 which (at this time) is still used by older versions of Cinnamon.
# When those versions are no longer supported, we can consider using a newer version.
PICKLE_PROTOCOL_VERSION = 2

(STORE_IS_SEPARATOR, STORE_ICON, STORE_NAME, STORE_PATH, STORE_TYPE) = range(5)

# EXIF utility functions (source: http://stackoverflow.com/questions/4228530/pil-thumbnail-is-rotating-my-image)
def flip_horizontal(im): return im.transpose(Image.FLIP_LEFT_RIGHT)
def flip_vertical(im): return im.transpose(Image.FLIP_TOP_BOTTOM)
def rotate_180(im): return im.transpose(Image.ROTATE_180)
def rotate_90(im): return im.transpose(Image.ROTATE_90)
def rotate_270(im): return im.transpose(Image.ROTATE_270)
def transpose(im): return rotate_90(flip_horizontal(im))
def transverse(im): return rotate_90(flip_vertical(im))
orientation_funcs = [None,
                     lambda x: x,
                     flip_horizontal,
                     rotate_180,
                     flip_vertical,
                     transpose,
                     rotate_270,
                     transverse,
                     rotate_90
                     ]
def apply_orientation(im):
    """
    Extract the oritentation EXIF tag from the image, which should be a PIL Image instance,
    and if there is an orientation tag that would rotate the image, apply that rotation to
    the Image instance given to do an in-place rotation.

    :param Image im: Image instance to inspect
    :return: A possibly transposed image instance
    """

    try:
        kOrientationEXIFTag = 0x0112
        if hasattr(im, '_getexif'): # only present in JPEGs
            e = im._getexif()       # returns None if no EXIF data
            if e is not None:
                #log.info('EXIF data found: %r', e)
                orientation = e[kOrientationEXIFTag]
                f = orientation_funcs[orientation]
                return f(im)
    except:
        # We'd be here with an invalid orientation value or some random error?
        pass # log.exception("Error applying EXIF Orientation tag")
    return im


class AspectWidget(SettingsWidget):
    def __init__(self, size_group, module):
        super(AspectWidget, self).__init__(dep_key=None)
        self.module = module
        self._updating = False

        self.combo = Gtk.ComboBox()
        renderer_text = Gtk.CellRendererText()
        self.combo.pack_start(renderer_text, True)
        self.combo.add_attribute(renderer_text, "text", 1)
        model = Gtk.ListStore(str, str)
        self.combo.set_model(model)
        self.combo.set_id_column(0)
        for option in BACKGROUND_PICTURE_OPTIONS:
            model.append([option[0], option[1]])
        self.combo.connect('changed', self.on_combo_changed)

        self.content_widget = Gtk.Box(valign=Gtk.Align.CENTER)
        self.content_widget.pack_start(self.combo, False, False, 2)
        self.add_to_size_group(size_group)
        self.label = SettingsLabel(_("Picture aspect"))
        self.pack_start(self.label, False, False, 0)
        self.pack_end(self.content_widget, False, False, 0)
        self.show_all()
        self.set_no_show_all(True)
        self.refresh()

    def refresh(self):
        # Aspect is per-monitor scaling; it's meaningless when one image spans
        # the whole desktop, so hide the row in spanned mode.
        spanned = self.module.mode() == "spanned"
        self.set_visible(not spanned)
        if spanned:
            return
        item = self.module.effective_item()
        nick = NICK_BY_PLACEMENT.get(int(item.get_picture_options()), "zoom")
        self._updating = True
        for i, row in enumerate(self.combo.get_model()):
            if row[0] == nick:
                self.combo.set_active(i)
                break
        self._updating = False

    def on_combo_changed(self, widget):
        if self._updating:
            return
        tree_iter = widget.get_active_iter()
        if tree_iter is not None:
            self.module.write_placement(widget.get_model()[tree_iter][0])


class ColorsWidget(SettingsWidget):
    def __init__(self, size_group, module):
        super(ColorsWidget, self).__init__(dep_key=None)
        self.module = module
        self._updating = False

        self.combo = Gtk.ComboBox()
        renderer_text = Gtk.CellRendererText()
        self.combo.pack_start(renderer_text, True)
        self.combo.add_attribute(renderer_text, "text", 1)
        model = Gtk.ListStore(str, str)
        self.combo.set_model(model)
        self.combo.set_id_column(0)
        for option in BACKGROUND_COLOR_SHADING_TYPES:
            model.append([option[0], option[1]])
        self.combo.connect('changed', self.on_combo_changed)

        self.content_widget = Gtk.Box(valign=Gtk.Align.CENTER)
        self.content_widget.pack_start(self.combo, False, False, 2)

        self.color_buttons = {}
        for key in ['primary-color', 'secondary-color']:
            color_button = Gtk.ColorButton()
            color_button.set_use_alpha(True)
            color_button.connect('color-set', self.on_color_changed, key)
            self.content_widget.pack_start(color_button, False, False, 2)
            self.color_buttons[key] = color_button

        # Keep a ref on the second color button (so we can hide/show it when appropriate)
        self.color2_button = self.color_buttons['secondary-color']
        self.color2_button.set_no_show_all(True)
        self.add_to_size_group(size_group)
        self.label = SettingsLabel(_("Background color"))
        self.pack_start(self.label, False, False, 0)
        self.pack_end(self.content_widget, False, False, 0)
        self.refresh()

    def refresh(self):
        item = self.module.effective_item()
        shading = NICK_BY_SHADING.get(int(item.get_color_shading_type()), "solid")
        self._updating = True
        for i, row in enumerate(self.combo.get_model()):
            if row[0] == shading:
                self.combo.set_active(i)
                break
        for key, value in (('primary-color', item.get_primary_color()),
                           ('secondary-color', item.get_secondary_color())):
            rgba = Gdk.RGBA()
            rgba.parse(value)
            self.color_buttons[key].set_rgba(rgba)
        self._updating = False
        self.show_or_hide_color2(shading)

    def on_color_changed(self, widget, key):
        if self._updating:
            return
        self.module.write_color(key, widget.get_rgba().to_string())

    def on_combo_changed(self, widget):
        if self._updating:
            return
        tree_iter = widget.get_active_iter()
        if tree_iter is not None:
            nick = widget.get_model()[tree_iter][0]
            self.module.write_shading(nick)
            self.show_or_hide_color2(nick)

    def show_or_hide_color2(self, value):
        if value == 'solid':
            self.color2_button.hide()
        else:
            self.color2_button.show()


class SlideshowSwitch(SettingsWidget):
    def __init__(self, module):
        super(SlideshowSwitch, self).__init__(dep_key=None)
        self.module = module
        self._updating = False
        self.content_widget = Gtk.Switch(valign=Gtk.Align.CENTER)
        self.content_widget.connect("notify::active", self.on_toggled)
        self.label = SettingsLabel(_("Slideshow"))
        self.pack_start(self.label, False, False, 0)
        self.pack_end(self.content_widget, False, False, 0)
        self.refresh()

    def refresh(self):
        self._updating = True
        self.content_widget.set_active(self.module.effective_item().get_slideshow())
        self._updating = False

    def on_toggled(self, widget, param):
        if self._updating:
            return
        self.module.write_slideshow(widget.get_active())


class FramedSection(Gtk.Frame):
    """A framed 'view' box that groups the monitor switcher, the folder/thumbnail
    picker and the appearance rows. Content packs from the top; a widget packed
    with expand=True fills the leftover space, while a hidden child takes none —
    so hiding the picker leaves the appearance rows top-aligned rather than
    centered. Rolled locally to avoid depending on xapp SettingsSection internals."""

    def __init__(self):
        super().__init__(shadow_type=Gtk.ShadowType.IN)
        self.get_style_context().add_class("view")
        self.box = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0)
        self.add(self.box)

    def pack(self, widget, expand=False, fill=False):
        self.box.pack_start(widget, expand, fill, 0)

    def _row_box(self, widget, separator):
        box = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0)
        if separator:
            box.pack_start(Gtk.Separator.new(Gtk.Orientation.HORIZONTAL), False, False, 0)
        list_box = Gtk.ListBox()
        list_box.set_selection_mode(Gtk.SelectionMode.NONE)
        row = Gtk.ListBoxRow(can_focus=False)
        row.add(widget)
        list_box.add(row)
        box.pack_start(list_box, False, False, 0)
        return box

    def add_row(self, widget, separator=True):
        self.box.pack_start(self._row_box(widget, separator), False, False, 0)

    def add_reveal_row(self, widget, separator=True):
        # Like add_row, but the row (and its separator) live in a revealer so the
        # whole thing slides away when hidden. Caller drives it via set_reveal_child.
        revealer = Gtk.Revealer()
        revealer.set_transition_type(Gtk.RevealerTransitionType.SLIDE_DOWN)
        revealer.set_transition_duration(150)
        revealer.add(self._row_box(widget, separator))
        self.box.pack_start(revealer, False, False, 0)
        return revealer


class Module:
    name = "backgrounds"
    category = "appear"
    comment = _("Change your desktop's background")

    def __init__(self, content_box):
        keywords = _("background, picture, slideshow, wallpaper")
        self.sidePage = SidePage(_("Backgrounds"), "cs-backgrounds", keywords, content_box, module=self)

    def on_module_selected(self):
        if not self.loaded:
            print("Loading Backgrounds module")

            self.sidePage.stack = SettingsStack()
            self.sidePage.add_widget(self.sidePage.stack)

            self.shown_collection = None  # Which collection is displayed in the UI

            self._background_schema = Gio.Settings(schema="org.cinnamon.desktop.background")

            self.bg_list = CinnamonBg.List.new()
            self.bg_monitors = CinnamonBg.Monitors.new()
            # DisplayConfig is queried asynchronously, so the monitor list can be
            # empty at build time and arrive (or change on hotplug) later.
            self.bg_monitors.connect("changed", self.on_monitors_changed)
            self.current_connector = None
            # Guards the folder/grid handlers while we point the picker at a
            # monitor's stored source, so refreshing doesn't write back.
            self._loading = False
            self.add_folder_dialog = Gtk.FileChooserDialog(title=_("Add Folder"),
                                                           action=Gtk.FileChooserAction.SELECT_FOLDER,
                                                           buttons=(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL,
                                                                    Gtk.STOCK_OPEN, Gtk.ResponseType.OK))

            self.xdg_pictures_directory = os.path.expanduser("~/Pictures")
            xdg_config = os.path.expanduser("~/.config/user-dirs.dirs")
            if os.path.exists(xdg_config) and shutil.which("xdg-user-dir"):
                path = subprocess.check_output(["xdg-user-dir", "PICTURES"]).decode("utf-8").rstrip("\n")
                if os.path.exists(path):
                    self.xdg_pictures_directory = path

            self.get_user_backgrounds()

            # Images

            mainbox = Gtk.Box.new(Gtk.Orientation.HORIZONTAL, 2)
            mainbox.expand = True
            mainbox.set_border_width(8)

            left_vbox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0)
            right_vbox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0)

            folder_scroller = Gtk.ScrolledWindow.new(None, None)
            folder_scroller.set_shadow_type(Gtk.ShadowType.IN)
            folder_scroller.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
            folder_scroller.set_property("min-content-width", 150)

            self.folder_tree = Gtk.TreeView.new()
            self.folder_tree.set_headers_visible(False)
            folder_scroller.add(self.folder_tree)

            button_toolbar = Gtk.Toolbar.new()
            button_toolbar.set_icon_size(1)
            Gtk.StyleContext.add_class(Gtk.Widget.get_style_context(button_toolbar), "inline-toolbar")
            self.add_folder_button = Gtk.ToolButton.new(None, None)
            self.add_folder_button.set_icon_name("xsi-list-add-symbolic")
            self.add_folder_button.set_tooltip_text(_("Add new folder"))
            self.add_folder_button.connect("clicked", lambda w: self.add_new_folder())
            self.remove_folder_button = Gtk.ToolButton.new(None, None)
            self.remove_folder_button.set_icon_name("xsi-list-remove-symbolic")
            self.remove_folder_button.set_tooltip_text(_("Remove selected folder"))
            self.remove_folder_button.connect("clicked", lambda w: self.remove_folder())
            button_toolbar.insert(self.add_folder_button, 0)
            button_toolbar.insert(self.remove_folder_button, 1)

            image_scroller = Gtk.ScrolledWindow.new(None, None)
            image_scroller.set_shadow_type(Gtk.ShadowType.IN)
            image_scroller.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)

            self.icon_view = ThreadedIconView()
            image_scroller.add(self.icon_view)
            self.icon_view.connect("selection-changed", self.on_wallpaper_selection_changed)

            right_vbox.pack_start(image_scroller, True, True, 0)
            left_vbox.pack_start(folder_scroller, True, True, 0)
            left_vbox.pack_start(button_toolbar, False, False, 0)

            mainbox.pack_start(left_vbox, False, False, 2)
            mainbox.pack_start(right_vbox, True, True, 2)

            left_vbox.set_border_width(2)
            right_vbox.set_border_width(2)

            self.collection_store = Gtk.ListStore(bool,    # is separator
                                                  str,     # Icon name
                                                  str,     # Display name
                                                  str,     # Path
                                                  str)     # Type of collection
            cell = Gtk.CellRendererText()
            cell.set_alignment(0, 0)
            pb_cell = Gtk.CellRendererPixbuf()
            self.folder_column = Gtk.TreeViewColumn()
            self.folder_column.pack_start(pb_cell, False)
            self.folder_column.pack_start(cell, True)
            self.folder_column.add_attribute(pb_cell, "icon-name", 1)
            self.folder_column.add_attribute(cell, "text", 2)

            self.folder_column.set_alignment(0)

            self.folder_tree.append_column(self.folder_column)
            self.folder_tree.connect("cursor-changed", self.on_folder_source_changed)

            self.get_system_backgrounds()

            tree_separator = [True, None, None, None, None]
            self.collection_store.append(tree_separator)

            if len(self.user_backgrounds) > 0:
                for item in self.user_backgrounds:
                    self.collection_store.append(item)

            self.folder_tree.set_model(self.collection_store)
            self.folder_tree.set_row_separator_func(self.is_row_separator, None)

            self.get_initial_path()

            # The Images page: mode selector + monitor row, then the folder/
            # thumbnail picker, with the per-image appearance controls beneath it.
            images_page = Gtk.Box.new(Gtk.Orientation.VERTICAL, 12)
            images_page.set_border_width(15)

            # Section 1: background mode (no heading — the setting is self-explanatory).
            mode_section = SettingsSection()
            mode_combo = GSettingsComboBox(_("Background mode"), "org.cinnamon.desktop.background",
                                           "background-mode",
                                           [("independent", _("Different per monitor")),
                                            ("mirror", _("Same on all monitors")),
                                            ("spanned", _("Spanned across monitors"))])
            mode_section.add_row(mode_combo)
            images_page.pack_start(mode_section, False, False, 0)

            # Section 2: the monitor switcher, the folder/thumbnail picker and the
            # appearance controls, visually grouped in one framed section.
            picker_section = FramedSection()

            self.monitor_revealer = Gtk.Revealer()
            self.monitor_stack = Gtk.Stack()
            self.monitor_stack.connect("notify::visible-child-name", self.on_monitor_switched)
            self.monitor_switcher = Gtk.StackSwitcher(homogeneous=True, halign=Gtk.Align.FILL)
            self.monitor_switcher.set_stack(self.monitor_stack)
            switcher_box = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0)
            switcher_box.set_border_width(6)
            switcher_box.pack_start(self.monitor_switcher, False, False, 0)
            switcher_box.pack_start(self.monitor_stack, False, False, 0)
            self.monitor_revealer.add(switcher_box)
            self.build_monitor_switcher()
            self.monitor_revealer.set_reveal_child(self.mode() == "independent")
            self._background_schema.connect("changed::background-mode", self.on_background_mode_changed)

            # The picker fills the leftover space; it's hidden for a colour-only
            # ('no picture') monitor, where an invisible child takes no room, so
            # the appearance rows stay top-aligned. Show its subtree once now,
            # then gate it with no-show-all so a later show_all can't re-reveal it.
            self.mainbox = mainbox
            self.mainbox.show_all()
            self.mainbox.set_no_show_all(True)

            picker_section.pack(self.monitor_revealer, False, False)
            picker_section.pack(self.mainbox, True, True)

            size_group = Gtk.SizeGroup.new(Gtk.SizeGroupMode.HORIZONTAL)
            self._aspect_widget = AspectWidget(size_group, self)
            picker_section.add_row(self._aspect_widget)
            self._colors_widget = ColorsWidget(size_group, self)
            picker_section.add_row(self._colors_widget)
            self._slideshow_switch = SlideshowSwitch(self)
            self._slideshow_revealer = picker_section.add_reveal_row(self._slideshow_switch)

            images_page.pack_start(picker_section, True, True, 0)
            self.sidePage.stack.add_titled(images_page, "images", _("Images"))

            # The Settings page: slideshow controls only (these are global).
            page = SettingsPage()

            slideshow = page.add_section(_("Slideshow"))

            self.sidePage.stack.add_titled(page, "settings", _("Settings"))

            widget = GSettingsSpinButton(_("Delay"), "org.cinnamon.desktop.background.slideshow", "delay", _("minutes"), 1, 1440)
            slideshow.add_row(widget)

            widget = GSettingsSwitch(_("Play images in random order"), "org.cinnamon.desktop.background.slideshow", "random-order")
            slideshow.add_row(widget)

            # Point the picker at the current target and highlight its picture.
            if self.mode() == "independent":
                self.refresh_picker()
            else:
                self.icon_view.set_pending_selection(self.current_uri())
            self.update_picker_visibility()

    def mode(self):
        return self._background_schema.get_string("background-mode")

    def on_background_mode_changed(self, settings, key):
        self._prune_stale_entries()
        self.monitor_revealer.set_reveal_child(self.mode() == "independent")
        self.refresh_appearance()
        self.refresh_picker()

    def _prune_stale_entries(self):
        # A deliberate mode switch is the natural point to discard entries for
        # monitors that no longer exist: a connector rename otherwise leaves one
        # stale entry behind per rename, forever, and a stale duplicate index
        # can win the resolver's index fallback over the current entry. Entries
        # with an empty connector (the mirror/spanned representative) are always
        # kept, and we never sweep before the monitor list has loaded.
        connected, _indices = self._monitor_layout()
        if not connected:
            return
        items = [self.bg_list.get_item(i) for i in range(self.bg_list.get_n_items())]
        stale = [item for item in items
                 if item.get_connector() and item.get_connector() not in connected]
        if not stale:
            return
        for item in stale:
            self.bg_list.remove_item(item)
        self.bg_list.save_pictures()

    def _resolved_all(self):
        # FULL-set resolve (required invariant): exactly what csd-background
        # renders for every monitor. Returns (connectors, indices, GListModel).
        connectors, indices = self._monitor_layout()
        return connectors, indices, self.bg_list.resolve(connectors, indices)

    def _resolved_for(self, connector):
        connectors, indices, resolved = self._resolved_all()
        if connector in connectors:
            return resolved.get_item(connectors.index(connector))
        return resolved.get_item(0) if resolved.get_n_items() > 0 else CinnamonBg.Item.new()

    def _monitor_layout(self):
        # (connectors, indices) left-to-right by x.
        model = self.bg_monitors
        infos = [model.get_item(i) for i in range(model.get_n_items())]
        infos.sort(key=lambda mi: mi.get_property("x"))
        pairs = [(mi.get_property("connector"), mi.get_property("index")) for mi in infos]
        pairs = [(c, idx) for (c, idx) in pairs if c]
        return [c for (c, idx) in pairs], [idx for (c, idx) in pairs]

    def _index_for(self, connector):
        # The current session's logical-monitor index for a connector (-1 if
        # unknown), stored so the layout survives connector renames next session.
        model = self.bg_monitors
        for i in range(model.get_n_items()):
            mi = model.get_item(i)
            if mi.get_property("connector") == connector:
                return mi.get_property("index")
        return -1

    def effective_item(self):
        # Read-only item the appearance widgets DISPLAY: the selected monitor's
        # full-set-resolved entry in independent mode, else the representative
        # (list[0], which mirror/spanned fan to every monitor).
        if self.mode() == "independent" and self.current_connector:
            return self._resolved_for(self.current_connector)
        return self.bg_list.get_single()

    def _ensure_entry(self, connector):
        # The live list entry for connector, materialized (seeded from its
        # resolved/displayed value, never blank) if it doesn't exist yet.
        item = self.bg_list.get_item_for_connector(connector)
        if item is not None:
            item.set_property("index", self._index_for(connector))
            return item
        seed = self._resolved_for(connector)
        item = CinnamonBg.Item.new()
        item.set_property("connector", connector)
        item.set_property("index", self._index_for(connector))
        for prop in ("picture-uri", "picture-options", "slideshow-source",
                     "slideshow", "color-shading-type", "primary-color", "secondary-color"):
            item.set_property(prop, seed.get_property(prop))
        self.bg_list.add_item(item)
        return item

    def _single_entry(self):
        if self.bg_list.get_n_items() > 0:
            return self.bg_list.get_item(0)
        item = CinnamonBg.Item.new()
        self.bg_list.add_item(item)
        return item

    def edit_targets(self):
        # Which entries a write applies to. independent: the selected monitor's
        # (materialized) entry. mirror/spanned: the single representative
        # (list[0]) — the library fans it to every monitor and the renderer only
        # ever paints it, so this is the same entry effective_item() reads.
        if self.mode() == "independent":
            if not self.current_connector:
                return []
            return [self._ensure_entry(self.current_connector)]
        return [self._single_entry()]

    def write_property(self, key, value):
        # The single write path: set key on every edit target, persist the list
        # only (never background-mode — the mode combo owns that), then refresh.
        for item in self.edit_targets():
            item.set_property(key, value)
        self.bg_list.save_pictures()
        self.refresh_appearance()

    def write_placement(self, nick):
        self.write_property("picture-options", PLACEMENT_BY_NICK.get(nick, CinnamonBg.Placement.ZOOM))
        # Reveal/hide the picker and point it at this target's source. Coming
        # from 'no picture' with no folder yet, select a default so the revealed
        # picker isn't empty.
        self.update_picker_visibility()
        if nick != "none" and not self.current_source():
            self.select_default_source()
        else:
            self.refresh_picker()

    def write_slideshow(self, enabled):
        self.write_property("slideshow", enabled)
        # Enabling with no folder yet: pick a default so there's something to rotate.
        if enabled and not self.current_source():
            self.select_default_source()
        self.update_grid_sensitivity()

    def update_grid_sensitivity(self):
        # While a target is slideshowing, its picture is daemon-driven, so the
        # thumbnail grid is not directly selectable.
        slideshow = self.effective_item().get_slideshow()
        self.icon_view.set_sensitive(not slideshow)
        self.icon_view.set_selection_mode(Gtk.SelectionMode.NONE if slideshow
                                          else Gtk.SelectionMode.SINGLE)

    def write_shading(self, nick):
        self.write_property("color-shading-type", SHADING_BY_NICK.get(nick, CinnamonBg.Shading.SOLID))

    def write_color(self, key, color_str):
        self.write_property(key, color_str)

    def refresh_appearance(self):
        if hasattr(self, "_aspect_widget"):
            self._slideshow_switch.refresh()
            self._aspect_widget.refresh()
            self._colors_widget.refresh()
        self.update_picker_visibility()
        if hasattr(self, "icon_view"):
            self.update_grid_sensitivity()

    def update_picker_visibility(self):
        if not hasattr(self, "mainbox"):
            return
        # The in-memory item reflects a just-set placement immediately (both modes).
        has_picture = int(self.effective_item().get_picture_options()) != int(CinnamonBg.Placement.NONE)
        # A hidden GtkBox child takes no space, so the appearance rows stay
        # top-aligned; showing it again lets it fill the leftover space as before.
        self.mainbox.set_visible(has_picture)
        # Slideshow only makes sense with a picture, so slide its row away for a
        # colour-only ('no picture') target.
        if hasattr(self, "_slideshow_revealer"):
            self._slideshow_revealer.set_reveal_child(has_picture)

    def current_uri(self):
        # The picture-uri the current target is showing (for highlighting).
        return self.effective_item().get_picture_uri()

    def current_source(self):
        # The folder collection to display for the current target: its
        # slideshow-source if set, else the folder holding its picture. None
        # when the target has neither (a colour/gradient-only monitor).
        item = self.effective_item()
        source = item.get_slideshow_source()
        if source:
            return source
        uri = item.get_picture_uri()
        if uri:
            parent = Gio.File.new_for_uri(uri).get_parent()
            if parent is not None:
                return self.format_source(BACKGROUND_COLLECTION_TYPE_DIRECTORY, parent.get_path())
        return None

    def select_folder_source(self, source):
        # Move the folder tree cursor to the row matching source and load its
        # thumbnails. Runs guarded so it doesn't write the source back.
        if not source:
            return
        tree_iter = self.collection_store.get_iter_first()
        while tree_iter is not None:
            row = self.collection_store[tree_iter]
            if not row[STORE_IS_SEPARATOR]:
                row_source = self.format_source(row[STORE_TYPE], row[STORE_PATH])
                if row_source == source:
                    tree_path = self.collection_store.get_path(tree_iter)
                    self.folder_tree.set_cursor(tree_path)
                    self.remove_folder_button.set_sensitive(row[STORE_TYPE] != BACKGROUND_COLLECTION_TYPE_XML)
                    self.update_icon_view(row[STORE_PATH], row[STORE_TYPE])
                    return
            tree_iter = self.collection_store.iter_next(tree_iter)

    def select_default_source(self):
        # Move the folder cursor to the first usable collection and let
        # on_folder_source_changed commit it as this monitor's source.
        tree_iter = self.collection_store.get_iter_first()
        while tree_iter is not None:
            row = self.collection_store[tree_iter]
            if not row[STORE_IS_SEPARATOR] and os.path.exists(row[STORE_PATH]):
                self.folder_tree.set_cursor(self.collection_store.get_path(tree_iter))
                return
            tree_iter = self.collection_store.iter_next(tree_iter)

    def refresh_picker(self):
        # Point the folder tree + thumbnail grid at the current target's stored
        # source and queue a highlight of its picture. With no source (a monitor
        # that has a placement but no folder yet), clear rather than leave the
        # previous monitor's folder showing.
        source = self.current_source()
        self._loading = True
        try:
            if source:
                self.select_folder_source(source)
            else:
                self.folder_tree.get_selection().unselect_all()
                self.icon_view.set_pictures_list([], None)
                self.shown_collection = None
        finally:
            self._loading = False
        self.icon_view.set_pending_selection(self.current_uri())

    def build_monitor_switcher(self):
        for child in self.monitor_stack.get_children():
            self.monitor_stack.remove(child)
        model = self.bg_monitors
        infos = [model.get_item(i) for i in range(model.get_n_items())]
        infos.sort(key=lambda mi: mi.get_property("x"))
        connectors = []
        for mi in infos:
            connector = mi.get_property("connector")
            connectors.append(connector)
            name = mi.get_property("display-name") or mi.get_property("model") or connector
            title = "%s  %s" % (name, connector)
            self.monitor_stack.add_titled(Gtk.Box(), connector, title)
        self.monitor_stack.show_all()
        self.monitor_switcher.show_all()
        if connectors:
            if self.current_connector not in connectors:
                self.current_connector = connectors[0]
            self.monitor_stack.set_visible_child_name(self.current_connector)

    def on_monitors_changed(self, monitors):
        self.build_monitor_switcher()
        self.refresh_appearance()
        self.refresh_picker()

    def on_monitor_switched(self, stack, param):
        name = stack.get_visible_child_name()
        if name:
            self.current_connector = name
            self.refresh_appearance()
            self.refresh_picker()

    def is_row_separator(self, model, iter, data):
        return model.get_value(iter, 0)

    def get_system_backgrounds(self):
        picture_list = []
        folder_list = []
        properties_dir = "/usr/share/cinnamon-background-properties"
        backgrounds = []
        if os.path.exists(properties_dir):
            for i in os.listdir(properties_dir):
                if i.endswith(".xml"):
                    xml_path = os.path.join(properties_dir, i)
                    display_name = i.replace(".xml", "").replace("-", " ").replace("_", " ").split(" ")[-1].capitalize()
                    icon = "xsi-wallpaper-symbolic"
                    order = 10
                    # Special case for Linux Mint. We don't want to use 'start-here' here as it wouldn't work depending on the theme.
                    # Also, other distros should get equal treatment. If they define cinnamon-backgrounds and use their own distro name, we should add support for it.
                    if display_name == "Retro":
                        icon = "xsi-document-open-recent-symbolic"
                        order = 20 # place retro bgs at the end
                    if display_name == "Linuxmint":
                        display_name = "Linux Mint"
                        icon = "linuxmint-logo-badge-symbolic"
                        order = 0
                    backgrounds.append([[False, icon, display_name, xml_path, BACKGROUND_COLLECTION_TYPE_XML], display_name, order])

        backgrounds.sort(key=lambda x: (x[2], x[1]))
        for background in backgrounds:
            self.collection_store.append(background[0])

    def get_user_backgrounds(self):
        self.user_backgrounds = []
        path = os.path.join(CONFIG_FOLDER, USER_FOLDERS_FILE_NAME)
        old_path = os.path.join(OLD_CONFIG_FOLDER, USER_FOLDERS_FILE_NAME)
        path = path if os.path.exists(path) else old_path
        if os.path.exists(path):
            with open(path) as f:
                folders = f.readlines()
            for line in folders:
                folder_path = line.strip("\n")
                folder_name = folder_path.split("/")[-1]
                if folder_path == self.xdg_pictures_directory:
                    icon = "xsi-folder-pictures-symbolic"
                else:
                    icon = "xsi-folder-symbolic"
                self.user_backgrounds.append([False, icon, folder_name, folder_path, BACKGROUND_COLLECTION_TYPE_DIRECTORY])
        else:
            # Add XDG PICTURE DIR
            self.user_backgrounds.append([False, "xsi-folder-pictures-symbolic", self.xdg_pictures_directory.split("/")[-1], self.xdg_pictures_directory, BACKGROUND_COLLECTION_TYPE_DIRECTORY])
            self.update_folder_list()

    def format_source(self, type, path):
        # returns 'type://path'
        return f"{type}://{path}"

    def get_initial_path(self):
        # Show the current target's folder if we can match it, else default to
        # the first collection (display only — guarded so it writes nothing).
        try:
            source = self.current_source()
            self._loading = True
            self.remove_folder_button.set_sensitive(True)
            first_iter = self.collection_store.get_iter_first()
            tree_iter = first_iter
            matched = False
            while tree_iter is not None:
                collection = self.collection_store[tree_iter]
                if not collection[STORE_IS_SEPARATOR]:
                    collection_type = collection[STORE_TYPE]
                    collection_path = collection[STORE_PATH]
                    collection_source = self.format_source(collection_type, collection_path)
                    if source and collection_source == source:
                        self.folder_tree.set_cursor(self.collection_store.get_path(tree_iter))
                        self.remove_folder_button.set_sensitive(collection_type != BACKGROUND_COLLECTION_TYPE_XML)
                        self.update_icon_view(collection_path, collection_type)
                        matched = True
                        break
                tree_iter = self.collection_store.iter_next(tree_iter)

            if not matched and first_iter is not None:
                collection = self.collection_store[first_iter]
                collection_type = collection[STORE_TYPE]
                collection_path = collection[STORE_PATH]
                self.folder_tree.get_selection().select_path(self.collection_store.get_path(first_iter))
                self.remove_folder_button.set_sensitive(collection_type != BACKGROUND_COLLECTION_TYPE_XML)
                self.update_icon_view(collection_path, collection_type)
        except Exception as detail:
            print(detail)
        finally:
            self._loading = False

    def on_row_activated(self, tree, path, column):
        self.folder_tree.set_selection(path)

    def on_folder_source_changed(self, tree):
        if self._loading:
            return
        self.remove_folder_button.set_sensitive(True)
        if tree.get_selection() is not None:
            folder_paths, iter = tree.get_selection().get_selected()
            if iter:
                collection_path = folder_paths[iter][STORE_PATH]
                collection_type = folder_paths[iter][STORE_TYPE]
                collection_source = self.format_source(collection_type, collection_path)
                if os.path.exists(collection_path):
                    if self.effective_item().get_slideshow_source() != collection_source:
                        self.write_property("slideshow-source", collection_source)
                    if collection_type == BACKGROUND_COLLECTION_TYPE_XML:
                        self.remove_folder_button.set_sensitive(False)
                    self.update_icon_view(collection_path, collection_type)

    def get_selected_wallpaper(self):
        selected_items = self.icon_view.get_selected_items()
        if len(selected_items) == 1:
            path = selected_items[0]
            iter = self.icon_view.get_model().get_iter(path)
            return self.icon_view.get_model().get(iter, 0)[0]
        return None

    def on_wallpaper_selection_changed(self, iconview):
        if self._loading:
            return
        wallpaper = self.get_selected_wallpaper()
        if not wallpaper:
            return
        uri = Gio.File.new_for_path(wallpaper["filename"]).get_uri() if "filename" in wallpaper else None
        if uri is None:
            return

        # The async highlight re-selects the current picture; don't persist that.
        if uri == self.current_uri():
            return

        self.write_property("picture-uri", uri)
        # Picking an image implies a picture; only supply a placement when there
        # was none — never adopt the collection's <options> over the user's choice.
        if int(self.effective_item().get_picture_options()) == int(CinnamonBg.Placement.NONE):
            self.write_property("picture-options", CinnamonBg.Placement.ZOOM)

    def add_new_folder(self):
        res = self.add_folder_dialog.run()
        if res == Gtk.ResponseType.OK:
            folder_path = self.add_folder_dialog.get_filename()
            folder_name = folder_path.split("/")[-1]
            # Make sure it's not already added..
            for background in self.user_backgrounds:
                if background[STORE_PATH] == folder_path:
                    self.add_folder_dialog.hide()
                    return
            if folder_path == self.xdg_pictures_directory:
                icon = "xsi-folder-pictures-symbolic"
            else:
                icon = "xsi-folder-symbolic"
            self.user_backgrounds.append([False, icon, folder_name, folder_path, BACKGROUND_COLLECTION_TYPE_DIRECTORY])
            self.collection_store.append([False, icon, folder_name, folder_path, BACKGROUND_COLLECTION_TYPE_DIRECTORY])
            self.update_folder_list()
        self.add_folder_dialog.hide()

    def remove_folder(self):
        if self.folder_tree.get_selection() is not None:
            self.icon_view.clear()
            folder_paths, iter = self.folder_tree.get_selection().get_selected()
            if iter:
                path = folder_paths[iter][STORE_PATH]
                self.collection_store.remove(iter)
                for item in self.user_backgrounds:
                    if item[STORE_PATH] == path:
                        self.user_backgrounds.remove(item)
                        self.update_folder_list()
                        break

    def update_folder_list(self):
        path = CONFIG_FOLDER
        if not os.path.exists(path):
            os.makedirs(path, mode=0o755, exist_ok=True)
        path = os.path.join(CONFIG_FOLDER, USER_FOLDERS_FILE_NAME)
        if len(self.user_backgrounds) == 0:
            file_data = ""
        else:
            first_path = self.user_backgrounds[0][STORE_PATH]
            file_data = first_path + "\n"
            for folder in self.user_backgrounds:
                if folder[STORE_PATH] == first_path:
                    continue
                else:
                    file_data += f"{folder[STORE_PATH]}\n"

        with open(path, "w") as f:
            f.write(file_data)

    def update_icon_view(self, path=None, type=None):
        if path != self.shown_collection:
            self.shown_collection = path
            picture_list = []
            if os.path.exists(path):
                if type == BACKGROUND_COLLECTION_TYPE_DIRECTORY:
                    files = os.listdir(path)
                    files.sort()
                    for i in files:
                        filename = os.path.join(path, i)
                        picture_list.append({"filename": filename})
                elif type == BACKGROUND_COLLECTION_TYPE_XML:
                    picture_list += self.parse_xml_backgrounds_list(path)

            self.icon_view.set_pictures_list(picture_list, path)
            self.update_grid_sensitivity()

    def splitLocaleCode(self, localeCode):
        try:
            loc = localeCode.partition("_")
            loc = (loc[0], loc[2])
        except:
            loc = ("en", "US")
        return loc

    def getLocalWallpaperName(self, names, loc):
        result = ""
        mainLocFound = False
        for wp in names:
            wpLoc = wp[0]
            wpName = wp[1]
            if wpLoc == ("", ""):
                if not mainLocFound:
                    result = wpName
            elif wpLoc[0] == loc[0]:
                if wpLoc[1] == loc[1]:
                    return wpName
                elif wpLoc[1] == "":
                    result = wpName
                    mainLocFound = True
        return result

    def parse_xml_backgrounds_list(self, filename):
        try:
            locAttrName = "{http://www.w3.org/XML/1998/namespace}lang"
            loc = self.splitLocaleCode(locale.getlocale()[0])
            res = []
            subLocaleFound = False
            f = open(filename)
            rootNode = ElementTree.fromstring(f.read())
            f.close()
            if rootNode.tag == "wallpapers":
                for wallpaperNode in rootNode:
                    if wallpaperNode.tag == "wallpaper" and wallpaperNode.get("deleted") != "true":
                        wallpaperData = {"metadataFile": filename}
                        names = []
                        for prop in wallpaperNode:
                            if type(prop.tag) == str:
                                if prop.tag != "name":
                                    wallpaperData[prop.tag] = prop.text
                                else:
                                    propAttr = prop.attrib
                                    wpName = prop.text
                                    locName = self.splitLocaleCode(propAttr.get(locAttrName)) if locAttrName in propAttr else ("", "")
                                    names.append((locName, wpName))
                        wallpaperData["name"] = self.getLocalWallpaperName(names, loc)

                        if "filename" in wallpaperData and wallpaperData["filename"] != "" and os.path.exists(wallpaperData["filename"]) and os.access(wallpaperData["filename"], os.R_OK):
                            if wallpaperData["name"] == "":
                                wallpaperData["name"] = os.path.basename(wallpaperData["filename"])
                            res.append(wallpaperData)
            return res
        except Exception as detail:
            print(f"Could not parse {filename}!")
            print(detail)
            return []

class PixCache(object):

    def __init__(self):
        self._data = {}

    def get_pix(self, filename, size=None):
        if filename is None:
            return None
        mimetype = mimetypes.guess_type(filename)[0]
        if mimetype is None or not mimetype.startswith("image/"):
            return None

        if filename not in self._data:
            self._data[filename] = {}
        if size in self._data[filename]:
            pix = self._data[filename][size]
        else:
            try:
                h = hashlib.sha1(('%f%s' % (os.path.getmtime(filename), filename)).encode()).hexdigest()
                tmp_cache_path = GLib.get_user_cache_dir() + '/cs_backgrounds/'
                if not os.path.exists(tmp_cache_path):
                    os.mkdir(tmp_cache_path)
                cache_filename = tmp_cache_path + h + "v2"

                loaded = False
                if os.path.exists(cache_filename):
                    # load from disk cache
                    try:
                        with open(cache_filename, "rb") as cache_file:
                            pix = pickle.load(cache_file)
                        tmp_img = Image.open(BytesIO(pix[0]))
                        pix[0] = self._image_to_pixbuf(tmp_img)
                        loaded = True
                    except Exception as detail:
                        # most likely either the file is corrupted, or the file was pickled using the
                        # python2 version of cinnamon settings. Either way, we want to ditch the current
                        # cache file and generate a new one. This is still backward compatible with older
                        # Cinnamon versions
                        os.remove(cache_filename)

                if not loaded:
                    if mimetype in ("image/svg+xml", "image/avif", "image/jxl"):
                        # rasterize svg with Gdk-Pixbuf and convert to PIL Image
                        tmp_pix = GdkPixbuf.Pixbuf.new_from_file(filename)
                        mode = "RGBA" if tmp_pix.props.has_alpha else "RGB"
                        img = Image.frombytes(mode, (tmp_pix.props.width, tmp_pix.props.height),
                                              tmp_pix.read_pixel_bytes().get_data(), "raw",
                                              mode, tmp_pix.props.rowstride)
                    else:
                        img = Image.open(filename)
                        img = apply_orientation(img)

                    # generate thumbnail
                    (width, height) = img.size
                    if img.mode != "RGB":
                        if img.mode == "RGBA":
                            bg_img = Image.new("RGBA", img.size, (255,255,255,255))
                            img = Image.alpha_composite(bg_img, img)
                        img = img.convert("RGB")
                    if size:
                        img.thumbnail((size, size), Image.LANCZOS)


                    from bin import imtools
                    img = imtools.round_image(img, {}, False, None, 3, 255)
                    img = imtools.drop_shadow(img, 4, 4, background_color=(255, 255, 255, 0),
                                              shadow_color=0x444444, border=8, shadow_blur=3,
                                              force_background_color=False, cache=None)

                    # save to disk cache
                    try:
                        png_bytes = BytesIO()
                        img.save(png_bytes, "png")
                        with open(cache_filename, "wb") as cache_file:
                            pickle.dump([png_bytes.getvalue(), width, height], cache_file, PICKLE_PROTOCOL_VERSION)
                    except Exception as detail:
                        print(f"Failed to save cache file: {cache_filename}: {detail}")

                    pix = [self._image_to_pixbuf(img), width, height]
            except Exception as detail:
                print(f"Failed to convert {filename}: {detail}")
                pix = None
            if pix:
                self._data[filename][size] = pix
        return pix

    # Convert RGBA PIL Image to Pixbuf
    def _image_to_pixbuf(self, img):
        [w, h] = img.size
        return GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(img.tobytes()),
                                               GdkPixbuf.Colorspace.RGB,
                                               True, 8, w, h,
                                               w * 4)

PIX_CACHE = PixCache()


class ThreadedIconView(Gtk.IconView):

    def __init__(self):
        Gtk.IconView.__init__(self)
        self.set_item_width(BACKGROUND_ICONS_SIZE * 1.1)
        self._model = Gtk.ListStore(object, GdkPixbuf.Pixbuf, str, str)
        self._model_filter = self._model.filter_new()
        self._model_filter.set_visible_func(self.visible_func)
        self.set_model(self._model_filter)

        area = self.get_area()

        self.current_path = None

        pixbuf_renderer = Gtk.CellRendererPixbuf()
        text_renderer = Gtk.CellRendererText(ellipsize=Pango.EllipsizeMode.END)

        text_renderer.set_alignment(.5, .5)
        area.pack_start(pixbuf_renderer, True, False, False)
        area.pack_start(text_renderer, True, False, False)
        self.add_attribute(pixbuf_renderer, "pixbuf", 1)
        self.add_attribute(text_renderer, "markup", 2)
        text_renderer.set_property("alignment", Pango.Alignment.CENTER)

        self._loading_queue = []
        self._loading_queue_lock = thread.allocate_lock()

        self._loading_lock = thread.allocate_lock()
        self._loading = False

        self._loaded_data = []
        self._loaded_data_lock = thread.allocate_lock()

        self._pending_uri = None

    def set_pending_selection(self, uri):
        # Remember the picture to highlight, and try now in case its folder is
        # already loaded; otherwise _check_loading_progress retries as thumbs
        # arrive.
        self._pending_uri = uri or None
        self._try_pending_selection()

    def _try_pending_selection(self):
        if not self._pending_uri:
            return
        model = self.get_model()
        iter = model.get_iter_first()
        while iter is not None:
            data = model.get_value(iter, 0)
            filename = data.get("filename") if isinstance(data, dict) else None
            if filename and Gio.File.new_for_path(filename).get_uri() == self._pending_uri:
                path = model.get_path(iter)
                self.select_path(path)
                self.scroll_to_path(path, False, 0, 0)
                self._pending_uri = None
                return
            iter = model.iter_next(iter)

    def visible_func(self, model, iter, data=None):
        item_path = model.get_value(iter, 3)
        return item_path == self.current_path

    def set_pictures_list(self, pictures_list, path=None):
        self.clear()
        self.current_path = path
        for i in pictures_list:
            self.add_picture(i, path)

    def clear(self):
        self._loading_queue_lock.acquire()
        self._loading_queue = []
        self._loading_queue_lock.release()

        self._loading_lock.acquire()
        is_loading = self._loading
        self._loading_lock.release()
        while is_loading:
            time.sleep(0.1)
            self._loading_lock.acquire()
            is_loading = self._loading
            self._loading_lock.release()

        self._model.clear()

    def add_picture(self, picture, path):
        self._loading_queue_lock.acquire()
        self._loading_queue.append(picture)
        self._loading_queue_lock.release()

        start_loading = False
        self._loading_lock.acquire()
        if not self._loading:
            self._loading = True
            start_loading = True
        self._loading_lock.release()

        if start_loading:
            GLib.timeout_add(100, self._check_loading_progress)
            thread.start_new_thread(self._do_load, (path,))

    def _check_loading_progress(self):
        self._loading_lock.acquire()
        self._loaded_data_lock.acquire()
        res = self._loading
        to_load = []
        while len(self._loaded_data) > 0:
            to_load.append(self._loaded_data[0])
            self._loaded_data = self._loaded_data[1:]
        self._loading_lock.release()
        self._loaded_data_lock.release()

        for i in to_load:
            self._model.append(i)

        if to_load:
            self._try_pending_selection()

        return res

    def _do_load(self, path):
        finished = False
        while not finished:
            self._loading_queue_lock.acquire()
            if len(self._loading_queue) == 0:
                finished = True
            else:
                to_load = self._loading_queue[0]
                self._loading_queue = self._loading_queue[1:]
            self._loading_queue_lock.release()
            if not finished:
                filename = to_load["filename"]
                if filename.endswith(".xml"):
                    filename = self.getFirstFileFromBackgroundXml(filename)
                pix = PIX_CACHE.get_pix(filename, BACKGROUND_ICONS_SIZE)
                if pix is not None:
                    if "name" in to_load:
                        label = to_load["name"]
                    else:
                        label = os.path.split(to_load["filename"])[1]
                    if "artist" in to_load:
                        artist = f"{to_load['artist']}\n"
                    else:
                        artist = ""
                    dimensions = f"{pix[1]}x{pix[2]}"

                    self._loaded_data_lock.acquire()
                    self._loaded_data.append((to_load, pix[0], f"<b>{label}</b>\n<small>{artist}{dimensions}</small>", path))
                    self._loaded_data_lock.release()

        self._loading_lock.acquire()
        self._loading = False
        self._loading_lock.release()

    def getFirstFileFromBackgroundXml(self, filename):
        try:
            f = open(filename)
            rootNode = ElementTree.fromstring(f.read())
            f.close()
            if rootNode.tag == "background":
                for backgroundNode in rootNode:
                    if backgroundNode.tag == "static":
                        for staticNode in backgroundNode:
                            if staticNode.tag == "file":
                                if len(staticNode) > 0 and staticNode[-1].tag == "size":
                                    return staticNode[-1].text
                                return staticNode.text
            print(f"Could not find filename in {filename}")
            return None
        except Exception as detail:
            print(f"Failed to read filename from {filename}: {detail}")
            return None
