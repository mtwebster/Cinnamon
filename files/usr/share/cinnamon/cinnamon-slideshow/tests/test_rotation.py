#!/usr/bin/python3
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from slideshow_rotation import PerMonitorRotation

A = ["file:///1.jpg", "file:///2.jpg", "file:///3.jpg"]


def mon(mid, folder, images, current=None):
    return {"id": mid, "folder": folder, "images": images, "current": current}


class TestSequential(unittest.TestCase):
    def test_initial_assigns_when_no_current(self):
        r = PerMonitorRotation([mon("DP-1", "d://x", A)], False)
        self.assertEqual(r.initial(), [("DP-1", A[0])])

    def test_initial_resumes_valid_current(self):
        r = PerMonitorRotation([mon("DP-1", "d://x", A, current=A[1])], False)
        self.assertEqual(r.initial(), [])   # already showing a valid image; no write

    def test_tick_round_robins_across_monitors(self):
        # Daemon flow: initial() aligns each group's cursor to `current`, then
        # ticks advance from there, round-robin across monitors.
        r = PerMonitorRotation(
            [mon("DP-1", "d://x", A, current=A[0]),
             mon("DP-2", "d://y", A, current=A[0])], False)
        self.assertEqual(r.initial(), [])   # both resume a valid current
        self.assertEqual(r.tick(), ("DP-1", A[1]))
        self.assertEqual(r.tick(), ("DP-2", A[1]))
        self.assertEqual(r.tick(), ("DP-1", A[2]))

    def test_synced_single_stream_advances_together(self):
        # One shared stream (synced mode): every tick advances the same id.
        r = PerMonitorRotation([mon("__all__", "d://x", A, current=A[0])], False)
        self.assertEqual(r.initial(), [])   # resumes A[0], cursor now past it
        self.assertEqual(r.tick(), ("__all__", A[1]))
        self.assertEqual(r.tick(), ("__all__", A[2]))
        self.assertEqual(r.tick(), ("__all__", A[0]))   # wraps

    def test_empty_images_stream_ticks_none(self):
        r = PerMonitorRotation([mon("DP-1", "d://x", [])], False)
        self.assertIsNone(r.tick())

    def test_no_monitors_ticks_none(self):
        self.assertIsNone(PerMonitorRotation([], False).tick())


class TestRandomCollisionFree(unittest.TestCase):
    def test_two_monitors_one_folder_get_distinct_images(self):
        # random path, but deterministic choice: first candidate.
        r = PerMonitorRotation(
            [mon("DP-1", "d://x", A), mon("DP-2", "d://x", A)],
            True, choice=lambda c: c[0])
        out = dict(r.initial())
        self.assertEqual(len(set(out.values())), 2)   # no collision


if __name__ == "__main__":
    unittest.main()
