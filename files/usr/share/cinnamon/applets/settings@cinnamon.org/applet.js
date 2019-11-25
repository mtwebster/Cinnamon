const Applet = imports.ui.applet;
const Panel = imports.ui.panel;
const St = imports.gi.St;

class CinnamonSettingsApplet extends Applet.IconApplet {
    constructor(orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);

        this.set_applet_tooltip(_("Settings"));
        this.on_orientation_changed(this._orientation);
    }

    on_applet_clicked(event) {
        let vertical = this._orientation == St.Side.LEFT || this._orientation == St.Side.RIGHT;
        let [x, y] = event.get_coords();

        if (vertical) {
            let xformed_y = y - this.panel.actor.y;
            this.panel._context_menu.shiftToPosition(y);
        } else {
            let xformed_x = x - this.panel.actor.x;
            this.panel._context_menu.shiftToPosition(x);
        }

        this.panel._context_menu.toggle();
    }

    on_orientation_changed(neworientation) {
        let icon_name;

        switch (neworientation) {
            case St.Side.LEFT:
                icon_name = "go-next";
                break;
            case St.Side.RIGHT:
                icon_name = "go-previous";
                break;
            case St.Side.TOP:
                icon_name = "go-down";
                break;
            case St.Side.BOTTOM:
            default:
                icon_name = "go-up";
                break;
        }

        this.set_applet_icon_symbolic_name(icon_name);
    }
}

function main(metadata, orientation, panel_height, instance_id) {
    return new CinnamonSettingsApplet(orientation, panel_height, instance_id);
}
