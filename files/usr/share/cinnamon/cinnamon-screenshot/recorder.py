import sys

import gi
gi.require_version('Gst', '1.0')
from gi.repository import GLib, GObject, Gst

Gst.init(None)


class Recorder(GObject.Object):
    """Screen-rect recorder built on top of GStreamer's ximagesrc element.

    Captures a fixed rectangle of the X11 root window, encodes to VP8/webm,
    and writes to a file. The pipeline is driven entirely by the GLib main
    loop via the bus signal watch, so callers should connect to
    `finished` / `error` rather than blocking on stop()."""

    __gsignals__ = {
        'finished': (GObject.SignalFlags.RUN_LAST, None, (str,)),
        'error':    (GObject.SignalFlags.RUN_LAST, None, (str,)),
    }

    def __init__(self):
        super().__init__()
        self._pipeline = None
        self._bus = None
        self._path = None

    @property
    def is_recording(self):
        return self._pipeline is not None

    def start(self, path, x, y, w, h, show_pointer=False, framerate=15):
        if self._pipeline is not None:
            return False
        if w <= 0 or h <= 0:
            return False

        endx = x + w - 1
        endy = y + h - 1
        descr = (
            f'ximagesrc startx={x} starty={y} endx={endx} endy={endy} '
            f'use-damage=false show-pointer={1 if show_pointer else 0} '
            f'! video/x-raw,framerate={framerate}/1 '
            f'! videoconvert ! vp8enc deadline=1 cpu-used=4 '
            f'! webmmux ! filesink location="{path}"'
        )
        try:
            self._pipeline = Gst.parse_launch(descr)
        except GLib.Error as exc:
            self._pipeline = None
            self.emit('error', exc.message)
            return False

        self._path = path
        self._bus = self._pipeline.get_bus()
        self._bus.add_signal_watch()
        self._bus.connect('message', self._on_bus_message)

        if self._pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            self._teardown()
            self.emit('error', 'Failed to start GStreamer pipeline')
            return False
        return True

    def stop(self):
        """Asks the pipeline to drain. The `finished` signal fires once the
        muxer has flushed and the file is fully written."""
        if self._pipeline is None:
            return
        self._pipeline.send_event(Gst.Event.new_eos())

    def _on_bus_message(self, _bus, msg):
        t = msg.type
        if t == Gst.MessageType.EOS:
            path = self._path
            self._teardown()
            self.emit('finished', path)
        elif t == Gst.MessageType.ERROR:
            err, dbg = msg.parse_error()
            self._teardown()
            detail = err.message if err else 'unknown'
            if dbg:
                print(f'cinnamon-screenshot: recorder: {detail} ({dbg})',
                      file=sys.stderr)
            self.emit('error', detail)

    def _teardown(self):
        if self._bus is not None:
            self._bus.remove_signal_watch()
        if self._pipeline is not None:
            self._pipeline.set_state(Gst.State.NULL)
        self._pipeline = None
        self._bus = None
        self._path = None
