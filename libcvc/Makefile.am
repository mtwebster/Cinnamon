lib_LTLIBRARIES = libcvc.la

INTROSPECTION_SCANNER_ARGS = --warn-all

libcvc_la_CPPFLAGS =			\
	$(WARN_CFLAGS)			\
	$(CVC_CFLAGS)			\
	-I$(srcdir)			\
	-DWITH_INTROSPECTION		\
	-DG_LOG_DOMAIN="\"Cvc\""

libcvc_la_gir_sources = 			\
	gvc-mixer-card.h			\
	gvc-mixer-card.c			\
	gvc-mixer-stream.h			\
	gvc-mixer-stream.c			\
	gvc-channel-map.h			\
	gvc-channel-map.c			\
	gvc-mixer-ui-device.h			\
	gvc-mixer-ui-device.c			\
	gvc-mixer-sink.h			\
	gvc-mixer-sink.c			\
	gvc-mixer-source.h			\
	gvc-mixer-source.c			\
	gvc-mixer-sink-input.h			\
	gvc-mixer-sink-input.c			\
	gvc-mixer-source-output.h		\
	gvc-mixer-source-output.c		\
	gvc-mixer-event-role.h			\
	gvc-mixer-event-role.c			\
	gvc-mixer-control.h			\
	gvc-mixer-control.c			\
	$(NULL)

libcvc_la_SOURCES =				\
	$(libcvc_la_gir_sources)		\
	gvc-mixer-card-private.h		\
	gvc-mixer-stream-private.h		\
	gvc-channel-map-private.h		\
	gvc-mixer-control-private.h		\
	gvc-pulseaudio-fake.h			\
	$(NULL)

libcvc_la_LIBADD = 	\
	$(CVC_LIBS)	\
	$(NULL)

if HAVE_INTROSPECTION
include $(INTROSPECTION_MAKEFILE)

Cvc-1.0.gir: libcvc.la
Cvc_1_0_gir_INCLUDES = GObject-2.0 Gio-2.0
Cvc_1_0_gir_CFLAGS = $(INCLUDES) -I$(top_srcdir)/libcvc -DWITH_INTROSPECTION
Cvc_1_0_gir_LIBS = libcvc.la
Cvc_1_0_gir_SCANNERFLAGS = --identifier-prefix=Gvc --symbol-prefix=gvc_
Cvc_1_0_gir_FILES = $(addprefix $(top_srcdir)/libcvc/,$(libcvc_la_gir_sources))
INTROSPECTION_GIRS = Cvc-1.0.gir

girdir = $(GIRDIR)
gir_DATA = Cvc-1.0.gir

typelibdir = $(TYPELIBDIR)
typelib_DATA = $(INTROSPECTION_GIRS:.gir=.typelib)

CLEANFILES = $(gir_DATA) $(typelib_DATA)

endif
