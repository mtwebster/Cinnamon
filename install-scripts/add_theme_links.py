#!/usr/bin/python3

import os
import subprocess
from pathlib import Path

dirnames_to_display_names = {
    "theme"              : "Cinnamon",
    "high-contrast-theme": "CinnamonHighContrast"
}

dest_dir = os.environ.get('DESTDIR')
if dest_dir is None:
    dest = Path("/")
else:
    dest = Path(dest_dir)

prefix = os.environ["MESON_INSTALL_PREFIX"]

for name in dirnames_to_display_names.keys():
    link_path = Path(os.path.join(prefix[1:], 'share', 'themes', dirnames_to_display_names[name], 'cinnamon'))
    link_path = dest.joinpath(link_path)

    target = Path(os.path.join(prefix, 'share', 'cinnamon', name))

    if link_path.exists():
        print('%s already exists, skipping symlink creation' % link_path)
    else:
        print('adding symlink %s...' % link_path)
        link_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.call(['ln', '-s', target, link_path])
