# Clutter Wayland Client Backend Test
#
# Build with:
#   meson setup build
#   ninja -C build
#
# Run with:
#   ./build/clutter-wayland-test

project('clutter-wayland-test', 'c',
  version: '0.1',
  default_options: ['warning_level=2', 'c_std=c11'])

# Dependencies - use muffin's Clutter library
muffin_clutter = dependency('muffin-clutter-0')

# Build the test executable
executable('clutter-wayland-test',
  'main.c',
  dependencies: [
    muffin_clutter,
  ],
  install: false
)
