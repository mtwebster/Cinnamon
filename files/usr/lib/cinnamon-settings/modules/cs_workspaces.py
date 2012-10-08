#!/usr/bin/env python


import settings
from settings import *

class Module:
    def __init__(self, content_box):
        sidePage = SidePage(_("Workspaces"), "workspaces.svg", content_box)
        self.sidePage = sidePage
        sidePage.add_widget(GSettingsCheckButton(_("Enable workspace OSD"), "org.cinnamon", "workspace-osd-visible", None))

        box = IndentedHBox()
        box.add(GSettingsSpinButton(_("Workspace OSD duration"), "org.cinnamon", "workspace-osd-duration", "org.cinnamon/workspace-osd-visible", 0, 2000, 50, 400, _("milliseconds")))
        sidePage.add_widget(box)

        box = IndentedHBox()
        box.add(GSettingsSpinButton(_("Workspace OSD horizontal position"), "org.cinnamon", "workspace-osd-x", "org.cinnamon/workspace-osd-visible", 0, 100, 5, 50, _("percent of the monitor's width")))
        sidePage.add_widget(box)

        box = IndentedHBox()
        box.add(GSettingsSpinButton(_("Workspace OSD vertical position"), "org.cinnamon", "workspace-osd-y", "org.cinnamon/workspace-osd-visible", 0, 100, 5, 50, _("percent of the monitor's height")))
        sidePage.add_widget(box)

        sidePage.add_widget(GSettingsCheckButton(_("Only use workspaces on primary monitor (requires Cinnamon restart)"), "org.cinnamon.overrides", "workspaces-only-on-primary", None))
        sidePage.add_widget(GSettingsCheckButton(_("Display Expo view as a grid"), "org.cinnamon", "workspace-expo-view-as-grid", None))
