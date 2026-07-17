#!/usr/bin/python3

import random
import signal
import sys
import os, locale
from xml.etree import ElementTree
from setproctitle import setproctitle

import gi
gi.require_version('GLibUnix', '2.0')
gi.require_version('CinnamonBg', '1.0')
from gi.repository import Gio, GLib, GLibUnix, CinnamonBg

from slideshow_rotation import PerMonitorRotation, parse_source, list_directory_images

SLIDESHOW_DBUS_NAME = "org.Cinnamon.Slideshow"
SLIDESHOW_DBUS_PATH = "/org/Cinnamon/Slideshow"

BACKGROUND_COLLECTION_TYPE_DIRECTORY = "directory"
BACKGROUND_COLLECTION_TYPE_XML = "xml"

VERBOSE = False


def set_verbose(value):
    global VERBOSE
    VERBOSE = value


def log(message):
    if VERBOSE:
        print("slideshow: " + message, flush=True)

# D-Bus interface XML definition
DBUS_INTERFACE_XML = '''
<node>
    <interface name="org.Cinnamon.Slideshow">
        <method name="begin" />
        <method name="end" />
        <method name="getNextImage" />
    </interface>
</node>
'''

class CinnamonSlideshowApplication(Gio.Application):
    def __init__(self):
        super().__init__(
            application_id=SLIDESHOW_DBUS_NAME,
            flags=Gio.ApplicationFlags.IS_SERVICE
        )

        self.slideshow_settings = Gio.Settings(schema="org.cinnamon.desktop.background.slideshow")
        self.background_settings = Gio.Settings(schema="org.cinnamon.desktop.background")

        self.bg_list = CinnamonBg.List.new()
        self.bg_monitors = None
        self.rotation = None
        self._n_streams = 0
        self.active = False     # True once begin() has set up; makes begin() idempotent
        self._config_sig = None  # (connector, slideshow-source) signature, to detect external edits
        self._last_mode = None   # background-mode we last set up for, to detect switches
        self._monitors_dirty = False  # a monitor hotplug arrived since the last setup
        self._reeval_id = 0      # debounce timer coalescing bursts of settings changes

        # Connected once here (not on every begin()) so restarts don't stack
        # duplicate handlers.
        self.background_settings.connect("changed::background-mode", self.on_background_mode_changed)
        self.bg_list.connect("changed", self.on_bg_list_changed)
        self.slideshow_settings.connect("changed::random-order", self.on_random_order_changed)

        if self.slideshow_settings.get_boolean("slideshow-paused"):
            self.slideshow_settings.set_boolean("slideshow-paused", False)

        self.starting_image = self.background_settings.get_string("picture-uri")

        self.update_id = 0
        # Also (re)loaded in load_settings, but a getNextImage D-Bus call can
        # activate us and dispatch before the deferred begin()/load_settings, so
        # give it a value up front.
        self.random_order = self.slideshow_settings.get_boolean("random-order")

        self.connection = None
        self.registration_id = 0

        self.cinnamon_seen = False
        self.cinnamon_watch_id = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            "org.Cinnamon",
            Gio.BusNameWatcherFlags.NONE,
            self.on_cinnamon_appeared,
            self.on_cinnamon_vanished
        )

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, sig, self.end)
            except AttributeError:
                GLibUnix.signal_add_full(GLib.PRIORITY_DEFAULT, sig, self.end, None)

    def on_cinnamon_appeared(self, connection, name, name_owner):
        self.cinnamon_seen = True

    def on_cinnamon_vanished(self, connection, name):
        # Cinnamon owns org.Cinnamon; if it goes away (logout, crash, replace)
        # this orphaned service should exit too, since nothing else will stop it.
        log("cinnamon vanished (seen=%s)" % self.cinnamon_seen)
        if self.cinnamon_seen:
            self.end()

    def do_startup(self):
        Gio.Application.do_startup(self)
        self.hold()
        log("do_startup (background-mode=%s, active=%s)" % (
            self.background_settings.get_string("background-mode"),
            self.should_be_active()))
        if self.should_be_active():
            log("slideshow work present — self-starting")
            GLib.idle_add(self.begin)

    def do_dbus_register(self, connection, object_path):
        try:
            self.connection = connection
            iface_info = Gio.DBusNodeInfo.new_for_xml(DBUS_INTERFACE_XML)
            try:
                register = connection.register_object_with_closures2
            except AttributeError:
                register = connection.register_object
            self.registration_id = register(
                SLIDESHOW_DBUS_PATH,
                iface_info.interfaces[0],
                self.handle_method_call,
                None,  # get_property
                None   # set_property
            )
        except Exception as e:
            print(f"Failed to export slideshow service: {e}")
            return False

        return Gio.Application.do_dbus_register(self, connection, object_path)

    def do_dbus_unregister(self, connection, path):
        if self.registration_id > 0:
            connection.unregister_object(self.registration_id)
            self.registration_id = 0

        Gio.Application.do_dbus_unregister(self, connection, path)

    def do_activate(self):
        log("do_activate")
        self.setup_slideshow()

    def handle_method_call(self, connection, sender, object_path, interface_name, method_name, parameters, invocation):
        try:
            if method_name == "begin":
                self.begin()
                invocation.return_value(None)
            elif method_name == "end":
                self.end()
                invocation.return_value(None)
            elif method_name == "getNextImage":
                self.get_next_image()
                invocation.return_value(None)
            else:
                invocation.return_error_literal(
                    Gio.dbus_error_quark(),
                    Gio.DBusError.UNKNOWN_METHOD,
                    f"Unknown method: {method_name}"
                )
        except Exception as e:
            invocation.return_error_literal(
                Gio.dbus_error_quark(),
                Gio.DBusError.FAILED,
                str(e)
            )

    def begin(self):
        log("begin")
        if self.active:
            log("begin: already active, ignoring")
            return
        if not self.should_be_active():
            log("begin: nothing to slideshow; staying idle")
            return
        self.active = True
        self.setup_slideshow()

    def stop(self):
        # Stop operating (timer + rotation) but keep the process alive.
        log("stop")
        self.active = False
        if self.update_id > 0:
            GLib.source_remove(self.update_id)
            self.update_id = 0
        if self._reeval_id > 0:
            GLib.source_remove(self._reeval_id)
            self._reeval_id = 0
        self.rotation = None

    def end(self):
        log("end")
        self.stop()
        if self.cinnamon_watch_id > 0:
            Gio.bus_unwatch_name(self.cinnamon_watch_id)
            self.cinnamon_watch_id = 0
        self.quit()

    def get_next_image(self):
        log("getNextImage (background-mode=%s)" % self.background_mode())
        # A getNextImage D-Bus call can activate us before begin() has set up;
        # begin() is idempotent, so this guarantees rotation state exists.
        self.begin()
        self.advance_all()

    def setup_slideshow(self):
        self.load_settings()
        self._last_mode = self.background_mode()
        self._monitors_dirty = False
        log("setup_slideshow: background-mode=%s" % self._last_mode)

        if self.update_id > 0:
            GLib.source_remove(self.update_id)
            self.update_id = 0

        descriptors = self._build_streams()
        self._n_streams = len(descriptors)
        self.rotation = PerMonitorRotation(descriptors, self.random_order)
        for mid, uri in self.rotation.initial():
            log("  initial assign %s -> %s" % (mid, uri))
            self._apply(mid, uri)
        self.bg_list.save_pictures()
        self._config_sig = self._config_signature()

        self.start_timer()

    def _build_streams(self):
        # Returns the PerMonitorRotation descriptors. Each stream's id ties back
        # to a live bg_list entry via _apply (never a cached item ref, so an
        # external panel edit that reloads the list can't leave us writing an
        # orphaned object).
        connectors, indices = self.get_monitor_layout()
        resolved = self.bg_list.resolve(connectors, indices)
        if self._last_mode == "independent":
            return self._streams_independent(connectors, indices, resolved)
        return self._streams_synced()

    def _streams_synced(self):
        # single / spanned: the library resolves list[0] onto every monitor, so we
        # rotate one shared stream and let the renderer fan it out. No list rebuild.
        single = self.bg_list.get_single()
        if not single.get_slideshow():
            log("  synced: representative entry is static; nothing to rotate")
            return []
        folder = single.get_slideshow_source()
        images = self.gather_source_images(folder)
        current = single.get_picture_uri() or None
        log("  synced: source=%s (%d images) current=%s" % (folder, len(images), current))
        return [{"id": "__all__", "folder": folder,
                 "images": images, "current": current}]

    def _streams_independent(self, connectors, indices, resolved):
        # independent: one stream per slideshow monitor; static monitors keep their uri.
        # Ensure an entry exists for each CONNECTED monitor (materialising a
        # missing one from its resolved/inherited value) but never remove the
        # entries of disconnected monitors, so a per-monitor layout survives a
        # monitor being temporarily unplugged.
        descriptors = []
        for i, conn in enumerate(connectors):
            src = resolved.get_item(i)
            is_slideshow = src.get_slideshow()
            current = src.get_picture_uri() or None

            item = self.bg_list.get_item_for_connector(conn)
            if item is None:
                item = CinnamonBg.Item.new()
                item.set_property("connector", conn)
                item.set_property("index", indices[i])
                item.set_property("slideshow-source", src.get_slideshow_source())
                item.set_property("slideshow", is_slideshow)
                item.set_property("picture-options", src.get_picture_options())
                item.set_property("color-shading-type", src.get_color_shading_type())
                item.set_property("primary-color", src.get_primary_color())
                item.set_property("secondary-color", src.get_secondary_color())
                if current:
                    item.set_property("picture-uri", current)
                self.bg_list.add_item(item)
            else:
                item.set_property("index", indices[i])

            if not is_slideshow:
                log("  %s: static (no rotation) current=%s" % (conn, current))
                continue

            source = src.get_slideshow_source()
            images = self.gather_source_images(source)
            log("  %s: source=%s (%d images) current=%s" % (conn, source, len(images), current))
            descriptors.append({"id": conn, "folder": source,
                                "images": images, "current": current})
        return descriptors

    def _apply(self, mid, uri):
        # Route a rotation result to the live bg_list entry it drives. Synced mode
        # drives the representative (list[0]); independent mode the matching
        # connector. Both look the item up fresh so a reloaded list is honoured.
        if mid == "__all__":
            self.bg_list.get_single().set_property("picture-uri", uri)
            return
        item = self.bg_list.get_item_for_connector(mid)
        if item is not None:
            item.set_property("picture-uri", uri)

    def load_settings(self):
        self.random_order = self.slideshow_settings.get_boolean("random-order")

    def on_random_order_changed(self, settings, key):
        self.random_order = self.slideshow_settings.get_boolean("random-order")

    def ensure_monitors(self):
        if self.bg_monitors is None:
            self.bg_monitors = CinnamonBg.Monitors.new()
            self.bg_monitors.connect("changed", self.on_monitors_changed)
        return self.bg_monitors

    def on_monitors_changed(self, monitors):
        self._monitors_dirty = True
        self._schedule_reevaluate()

    def get_monitor_layout(self):
        # (connectors, indices) left-to-right by x; index is the logical-monitor
        # index used as a cross-session match fallback.
        try:
            model = self.ensure_monitors()
            infos = [model.get_item(i) for i in range(model.get_n_items())]
            infos.sort(key=lambda mi: mi.get_property("x"))
            pairs = [(mi.get_property("connector"), mi.get_property("index")) for mi in infos]
            pairs = [(c, idx) for (c, idx) in pairs if c]
            return [c for (c, idx) in pairs], [idx for (c, idx) in pairs]
        except Exception as e:
            print("slideshow: could not get monitor layout: %s" % e)
            return [], []

    def get_monitor_connectors(self):
        return self.get_monitor_layout()[0]

    def background_mode(self):
        return self.background_settings.get_string("background-mode")

    def on_background_mode_changed(self, settings, key):
        self._schedule_reevaluate()

    def gather_source_images(self, source):
        stype, path = parse_source(source)
        if stype == BACKGROUND_COLLECTION_TYPE_DIRECTORY:
            return [Gio.file_new_for_path(p).get_uri() for p in list_directory_images(path)]
        if stype == BACKGROUND_COLLECTION_TYPE_XML:
            return [Gio.file_new_for_path(pic["filename"]).get_uri()
                    for pic in self.parse_xml_backgrounds_list(path)]
        return []

    def _config_signature(self):
        items = self.bg_list
        return tuple((items.get_item(i).get_connector(),
                      items.get_item(i).get_slideshow_source(),
                      items.get_item(i).get_slideshow())
                     for i in range(items.get_n_items()))

    def should_be_active(self):
        # We run iff at least one monitor's resolved entry is a slideshow.
        connectors, indices = self.get_monitor_layout()
        if not connectors:
            return False
        resolved = self.bg_list.resolve(connectors, indices)
        for i in range(len(connectors)):
            item = resolved.get_item(i)
            if item is not None and item.get_slideshow():
                return True
        return False

    def on_bg_list_changed(self, bg_list):
        self._schedule_reevaluate()

    def _schedule_reevaluate(self):
        # Coalesce a burst of settings changes (a mode switch writes both
        # background-mode and picture-uri-list; a settings save can echo back)
        # into a single re-evaluation once things have settled.
        if self._reeval_id > 0:
            GLib.source_remove(self._reeval_id)
        self._reeval_id = GLib.timeout_add(150, self._reevaluate)

    def _reevaluate(self):
        self._reeval_id = 0
        monitors_dirty = self._monitors_dirty
        self._monitors_dirty = False

        if not self.should_be_active():
            if self.active:
                log("reevaluate: no slideshow monitors; stopping")
                self.stop()
            return False
        if not self.active:
            log("reevaluate: a slideshow monitor is present; starting")
            self.begin()
            return False
        # Already running: only re-setup for a real change — a mode switch, a
        # monitor hotplug, or an external per-monitor config edit. Our own
        # per-tick picture-uri saves don't change any of these, so this is a
        # no-op for them (which is what stops the feedback loop).
        if (monitors_dirty
                or self.background_mode() != self._last_mode
                or self._config_signature() != self._config_sig):
            log("reevaluate: config changed; re-setup")
            self.setup_slideshow()
        return False

    def start_timer(self):
        if self.update_id > 0:
            GLib.source_remove(self.update_id)
            self.update_id = 0
        n = max(1, self._n_streams)
        delay = self.slideshow_settings.get_int("delay")
        interval = max(1, int(delay * 60 / n))
        log("start_timer: interval=%ds (delay=%dm / %d streams)" % (interval, delay, n))
        self.update_id = GLib.timeout_add_seconds(interval, self.tick)

    def tick(self):
        if self.slideshow_settings.get_boolean("slideshow-paused"):
            log("tick: paused")
            return True
        result = self.rotation.tick()
        if result is not None:
            mid, uri = result
            log("tick: advance %s -> %s" % (mid, uri))
            self._apply(mid, uri)
            self.bg_list.save_pictures()
        else:
            log("tick: no advance")
        return True

    def advance_all(self):
        # Manual "next": advance every stream one step and reset the timer.
        if self.rotation is None:
            self.setup_slideshow()
            return
        changed = self.rotation.advance_all()
        for mid, uri in changed:
            log("getNextImage: advance %s -> %s" % (mid, uri))
            self._apply(mid, uri)
        if changed:
            self.bg_list.save_pictures()
        self.start_timer()

########### TAKEN FROM CS_BACKGROUND
    def splitLocaleCode(self, localeCode):
        loc = localeCode.partition("_")
        loc = (loc[0], loc[2])
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
            print(detail)
            return []

if __name__ == "__main__":
    setproctitle("cinnamon-slideshow")

    if "--verbose" in sys.argv or "-v" in sys.argv:
        set_verbose(True)

    app = CinnamonSlideshowApplication()
    app.run([a for a in sys.argv if a not in ("--verbose", "-v")])