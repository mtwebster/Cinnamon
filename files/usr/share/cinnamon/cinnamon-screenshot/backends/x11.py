import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gdk

from backends.base import Backend


def _root_pixbuf():
    display = Gdk.Display.get_default()
    if display is None:
        return None
    screen = display.get_default_screen()
    root = screen.get_root_window()
    w, h = root.get_width(), root.get_height()
    return Gdk.pixbuf_get_from_window(root, 0, 0, w, h)


class X11Backend(Backend):
    """Fallback backend used when the cinnamon screenshot DBus service is
    unowned. Only full-screen capture is supported; the application UI is
    expected to restrict modes accordingly."""

    def screenshot(self, include_pointer):
        return _root_pixbuf()
