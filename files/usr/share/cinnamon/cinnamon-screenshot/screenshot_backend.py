import os
import sys

import gi
gi.require_version('XApp', '1.0')
from gi.repository import GdkPixbuf, Gio, GLib, GObject, XApp


BUS_NAME = 'org.cinnamon.Screenshot'
OBJECT_PATH = '/org/cinnamon/Screenshot'
INTERFACE = 'org.cinnamon.Screenshot'


class CinnamonBackend(GObject.Object):
    __gsignals__ = {
        'online-changed': (GObject.SignalFlags.RUN_LAST, None, (bool,)),
    }

    def __init__(self):
        super().__init__()
        self._proxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES,
            None,
            BUS_NAME, OBJECT_PATH, INTERFACE,
            None,
        )
        self._proxy.connect('notify::g-name-owner', self._on_name_owner_changed)

    def _on_name_owner_changed(self, *_args):
        self.emit('online-changed', self.is_available())

    def is_available(self):
        return self._proxy.get_name_owner() is not None

    def _tempfile(self):
        return os.path.join(XApp.get_tmp_dir(), f'cinnamon-screenshot-{os.getpid()}.png')

    def _call(self, method, params):
        try:
            return self._proxy.call_sync(
                method, params,
                Gio.DBusCallFlags.NONE,
                -1, None,
            ).unpack()
        except GLib.Error as exc:
            print(f'cinnamon-screenshot: DBus {method} failed: {exc.message}', file=sys.stderr)
            return None

    def _load_and_unlink(self, path):
        try:
            pixbuf = GdkPixbuf.Pixbuf.new_from_file(path)
        except GLib.Error:
            pixbuf = None
        try:
            os.unlink(path)
        except OSError:
            pass
        return pixbuf

    def screenshot(self, include_pointer):
        path = self._tempfile()
        result = self._call('Screenshot',
                            GLib.Variant('(bs)', (include_pointer, path)))
        if not result or not result[0]:
            return None
        return self._load_and_unlink(result[1] or path)

    def screenshot_window(self, include_pointer, include_shadow):
        path = self._tempfile()
        result = self._call('ScreenshotWindow',
                            GLib.Variant('(bbs)', (include_shadow, include_pointer, path)))
        if not result or not result[0]:
            return None
        return self._load_and_unlink(result[1] or path)

    def screenshot_area(self, x, y, w, h):
        path = self._tempfile()
        result = self._call('ScreenshotArea',
                            GLib.Variant('(iiiis)', (x, y, w, h, path)))
        if not result or not result[0]:
            return None
        return self._load_and_unlink(result[1] or path)

    def flash_area(self, x, y, w, h):
        self._call('FlashArea', GLib.Variant('(iiii)', (x, y, w, h)))

    def select_area(self):
        result = self._call('SelectArea', None)
        return tuple(result) if result else None
