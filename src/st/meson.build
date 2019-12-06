st_headers = [
    'st-adjustment.h',
    'st-background-effect.h',
    'st-bin.h',
    'st-border-image.h',
    'st-box-layout.h',
    'st-box-layout-child.h',
    'st-button.h',
    'st-clipboard.h',
    'st-drawing-area.h',
    'st-entry.h',
    'st-focus-manager.h',
    'st-group.h',
    'st-icon.h',
    'st-icon-colors.h',
    'st-im-text.h',
    'st-label.h',
    'st-polygon.h',
    'st-private.h',
    'st-scrollable.h',
    'st-scroll-bar.h',
    'st-scroll-view.h',
    'st-settings.h',
    'st-shadow.h',
    'st-table.h',
    'st-table-child.h',
    'st-texture-cache.h',
    'st-theme.h',
    'st-theme-context.h',
    'st-theme-node.h',
    'st-types.h',
    'st-widget.h',
    'st-widget-accessible.h',
]

st_non_gir = [
    'st-cogl-wrapper.h',
    'st-cogl-wrapper.c',
]

st_private_headers = [
    'st/croco/cr-additional-sel.h',
    'st/croco/cr-attr-sel.h',
    'st/croco/cr-cascade.h',
    'st/croco/cr-declaration.h',
    'st/croco/cr-doc-handler.h',
    'st/croco/cr-enc-handler.h',
    'st/croco/cr-fonts.h',
    'st/croco/cr-input.h',
    'st/croco/cr-num.h',
    'st/croco/cr-om-parser.h',
    'st/croco/cr-parser.h',
    'st/croco/cr-parsing-location.h',
    'st/croco/cr-prop-list.h',
    'st/croco/cr-pseudo.h',
    'st/croco/cr-rgb.h',
    'st/croco/cr-selector.h',
    'st/croco/cr-simple-sel.h',
    'st/croco/cr-statement.h',
    'st/croco/cr-string.h',
    'st/croco/cr-stylesheet.h',
    'st/croco/cr-term.h',
    'st/croco/cr-tknzr.h',
    'st/croco/cr-token.h',
    'st/croco/cr-utils.h',
    'st/croco/libcroco-config.h',
    'st/croco/libcroco.h',
    'st-private.h',
    'st-table-private.h',
    'st-theme-private.h',
    'st-theme-node-private.h',
    'st-theme-node-transition.h',
]

croco_sources = [
    'croco/cr-additional-sel.c',
    'croco/cr-attr-sel.c',
    'croco/cr-cascade.c',
    'croco/cr-declaration.c',
    'croco/cr-doc-handler.c',
    'croco/cr-enc-handler.c',
    'croco/cr-fonts.c',
    'croco/cr-input.c',
    'croco/cr-num.c',
    'croco/cr-om-parser.c',
    'croco/cr-parser.c',
    'croco/cr-parsing-location.c',
    'croco/cr-prop-list.c',
    'croco/cr-pseudo.c',
    'croco/cr-rgb.c',
    'croco/cr-selector.c',
    'croco/cr-simple-sel.c',
    'croco/cr-statement.c',
    'croco/cr-string.c',
    'croco/cr-stylesheet.c',
    'croco/cr-term.c',
    'croco/cr-tknzr.c',
    'croco/cr-token.c',
    'croco/cr-utils.c'
]

st_gir_sources = [
    'st-adjustment.c',
    'st-background-effect.c',
    'st-bin.c',
    'st-border-image.c',
    'st-box-layout.c',
    'st-box-layout-child.c',
    'st-button.c',
    'st-clipboard.c',
    'st-drawing-area.c',
    'st-entry.c',
    'st-focus-manager.c',
    'st-group.c',
    'st-icon.c',
    'st-icon-colors.c',
    'st-im-text.c',
    'st-label.c',
    'st-polygon.c',
    'st-private.c',
    'st-scrollable.c',
    'st-scroll-bar.c',
    'st-scroll-view.c',
    'st-settings.c',
    'st-shadow.c',
    'st-table.c',
    'st-table-child.c',
    'st-texture-cache.c',
    'st-theme.c',
    'st-theme-context.c',
    'st-theme-node.c',
    'st-theme-node-drawing.c',
    'st-theme-node-transition.c',
    'st-widget.c',
    st_headers,
    st_private_headers,
]

st_gir_sources += gnome.mkenums_simple(
    'st-enum-types',
    sources: st_headers,
)

st_sources = [
    'st-scroll-view-fade.c',
    'st-scroll-view-fade.h',
    st_gir_sources,
    st_non_gir,
    croco_sources
]

st_include_list = []
foreach include : st_headers
  st_include_list += '#include <@0@>'.format(include)
endforeach

st_includes = configuration_data()
st_includes.set('includes', '\n'.join(st_include_list))

st_h = configure_file(
    input: 'st.h.in',
    output: 'st.h',
    configuration: st_includes,
)

libst_deps = [
    clutter,
    cogl,
    cogl_path,
    config_h,
    croco,
    gio,
    glib,
    gtk,
    math,
    muffin,
]

libst = library(
    'st',
    st_sources,
    c_args: '-DST_H_INSIDE',
    build_rpath: muffinlibdir,
    install_rpath: muffinlibdir,
    include_directories: include_root,
    dependencies: libst_deps,
    install: true,
    install_dir: pkglibdir,
)

st_dep = declare_dependency(
    include_directories: include_directories('.'),
    dependencies: libst_deps,
    link_with: libst,
    link_args: ['-Wl,-Bsymbolic', '-Wl,-z,relro', '-Wl,-z,now'],
)

st_gir_includes = [
    'Clutter-0',
    'ClutterX11-0',
    'Meta-Muffin.0',
    'Gtk-3.0',
]

st_gir = gnome.generate_gir(
    libst,
    namespace: 'St',
    nsversion: '1.0',
    sources: st_gir_sources,
    dependencies: libst_deps,
    identifier_prefix: 'St',
    symbol_prefix: 'st',
    includes: st_gir_includes,
    install: true,
    install_dir_typelib: pkglibdir,
    install_dir_gir: false,
    extra_args: [
        '-DST_COMPILATION',
        '--quiet',
    ],
)
