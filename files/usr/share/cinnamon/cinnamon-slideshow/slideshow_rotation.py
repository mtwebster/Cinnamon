import os
import random
import mimetypes


def parse_source(source):
    """Split a "type://path" source into (type, expanded_path). "" -> (None, "")."""
    if source and "://" in source:
        stype, path = source.split("://", 1)
        return stype, os.path.expanduser(path)
    return None, ""


def list_directory_images(path):
    """Sorted absolute paths of image files (by mimetype) directly in `path`."""
    out = []
    if os.path.isdir(path):
        for name in sorted(os.listdir(path)):
            full = os.path.join(path, name)
            if not os.path.isfile(full):
                continue
            mime = mimetypes.guess_type(full)[0]
            if mime and mime.startswith("image/"):
                out.append(full)
    return out


class PerMonitorRotation:
    """Pure per-monitor slideshow state: no GLib, no gsettings, no timers.

    monitors: ordered (left-to-right) list of dicts:
        {"id": <connector>, "folder": <source key>, "images": [uri,...],
         "current": <uri or None>}
    A monitor's `current` is its resume marker (its currently-displayed image).
    """

    def __init__(self, monitors, random_order, choice=random.choice):
        self._random = random_order
        self._choice = choice
        self._order = [m["id"] for m in monitors]
        self._by_id = {m["id"]: m for m in monitors}
        self._rr = 0
        self._groups = {}   # folder -> {"images": [...], "cursor": int, "members": [id,...]}
        for m in monitors:
            g = self._groups.setdefault(
                m["folder"], {"images": m["images"], "cursor": 0, "members": []})
            g["members"].append(m["id"])

    def initial(self):
        """Assignments to apply now. Keeps a valid `current` (resume); otherwise
        assigns. Returns [(id, uri), ...] for monitors that need a write."""
        out = []
        for g in self._groups.values():
            images = g["images"]
            if not images:
                continue
            if self._random:
                displayed = {self._by_id[i]["current"] for i in g["members"]
                             if self._by_id[i]["current"] in images}
                for mid in g["members"]:
                    if self._by_id[mid]["current"] in images:
                        continue
                    uri = self._pick(images, displayed)
                    self._by_id[mid]["current"] = uri
                    displayed.add(uri)
                    out.append((mid, uri))
            else:
                idxs = [images.index(self._by_id[i]["current"]) for i in g["members"]
                        if self._by_id[i]["current"] in images]
                nxt = (max(idxs) + 1) % len(images) if idxs else 0
                for mid in g["members"]:
                    if self._by_id[mid]["current"] in images:
                        continue
                    uri = images[nxt]
                    nxt = (nxt + 1) % len(images)
                    self._by_id[mid]["current"] = uri
                    out.append((mid, uri))
                g["cursor"] = nxt
        return out

    def advance_all(self):
        """Advance every monitor one step (round-robin order). Returns
        [(id, uri), ...] for each monitor that changed."""
        out = []
        for _ in range(len(self._order)):
            result = self.tick()
            if result is not None:
                out.append(result)
        return out

    def tick(self):
        """Advance the next monitor (round-robin). Returns (id, uri) or None."""
        if not self._order:
            return None
        mid = self._order[self._rr]
        self._rr = (self._rr + 1) % len(self._order)
        m = self._by_id[mid]
        g = self._groups[m["folder"]]
        images = g["images"]
        if not images:
            return None
        if self._random:
            displayed = {self._by_id[i]["current"] for i in g["members"]}
            uri = self._pick(images, displayed)
        else:
            uri = images[g["cursor"]]
            g["cursor"] = (g["cursor"] + 1) % len(images)
        m["current"] = uri
        return (mid, uri)

    def _pick(self, images, displayed):
        candidates = [i for i in images if i not in displayed]
        if not candidates:
            candidates = images   # best-effort: too few images to avoid a collision
        return self._choice(candidates)
