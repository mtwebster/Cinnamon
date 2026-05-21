import os

import gi
gi.require_version('XApp', '1.0')
from gi.repository import GdkPixbuf, Gio, GLib, XApp


BUS_NAME = 'org.cinnamon.Screenshot'
OBJECT_PATH = '/org/cinnamon/Screenshot'
INTERFACE = 'org.cinnamon.Screenshot'


class CinnamonBackend:
    def __init__(self):
        self._bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

    def _tempfile(self):
        return os.path.join(XApp.get_tmp_dir(), f'cinnamon-screenshot-{os.getpid()}.png')

    def _call(self, method, params):
        try:
            result = self._bus.call_sync(
                BUS_NAME, OBJECT_PATH, INTERFACE, method,
                params,
                GLib.VariantType('(bs)'),
                Gio.DBusCallFlags.NONE,
                -1, None,
            )
        except GLib.Error as exc:
            print(f'cinnamon-screenshot: DBus {method} failed: {exc.message}')
            return None
        return result.unpack()

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
        try:
            self._bus.call_sync(
                BUS_NAME, OBJECT_PATH, INTERFACE, 'FlashArea',
                GLib.Variant('(iiii)', (x, y, w, h)),
                None,
                Gio.DBusCallFlags.NONE,
                -1, None,
            )
        except GLib.Error:
            pass

    def select_area(self):
        try:
            result = self._bus.call_sync(
                BUS_NAME, OBJECT_PATH, INTERFACE, 'SelectArea',
                None,
                GLib.VariantType('(iiii)'),
                Gio.DBusCallFlags.NONE,
                -1, None,
            )
        except GLib.Error:
            return None
        return tuple(result.unpack())
