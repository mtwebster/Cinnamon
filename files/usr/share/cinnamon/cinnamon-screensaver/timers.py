#! /usr/bin/python3

from gi.repository import GObject

class TimerTracker:
# self.timers = [name : timeout id] pairs
    def __init__(self):
        self.timers = {}

    def start(self, name, duration, callback):
        self.cancel(name)

        timeout_id = GObject.timeout_add(duration, callback)

        self.timers[name] = timeout_id

    def cancel(self, name):
        try:
            if self.timers[name]:
                GObject.source_remove(self.timers[name])
                del self.timers[name]
        except KeyError:
            pass

tracker = TimerTracker()

def get():
    global tracker
    return tracker