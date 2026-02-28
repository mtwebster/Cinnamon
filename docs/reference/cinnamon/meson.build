ignore = [
    'cinnamon-recorder-src.h',
    'cinnamon-recorder.h',
    'cinnamon-keyring-prompt.h',
    'cinnamon-polkit-authentication-agent.h',
    'cinnamon-secure-text-buffer.h',
    'cinnamon-touchegg-client.h',
    'cinnamon-network-agent.h',
    'cinnamon-perf-log.h',
    'cinnamon-wm.h',
    'cinnamon-embedded-window.h',
    'cinnamon-gtk-embed.h',
    'cinnamon-plugin.c',
    cinnamon_private_headers,
    st_headers,
    st_private_headers,
    'tray',
    sniffer_headers,
    'screensaver',
]

if not get_option('build_recorder')
    ignore += 'cinnamon-recorder.h'
endif

gnome.gtkdoc(
    'cinnamon',
    mode: 'xml',
    main_xml: 'cinnamon-docs.sgml',
    gobject_typesfile: 'cinnamon.types',
    dependencies: [libcinnamon_deps, st_dep, cinnamon_dep],
    src_dir: [
        join_paths(meson.project_source_root(), 'src'),
        join_paths(meson.project_build_root(), 'src'),
    ],
    scan_args: '--rebuild-types',
    mkdb_args: ['--xml-mode', '--output-format=xml'],
    ignore_headers: ignore,
    install: true,
)
