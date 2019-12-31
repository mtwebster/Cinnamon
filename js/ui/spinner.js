//-*- indent-tabs-mode: nil-*-
const Mainloop = imports.mainloop;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const PopupMenu = imports.ui.popupMenu;

const SPINNER_MS_PER_REV = 100;

var Spinner = class Spinner {
    constructor() {
        this.actor = new St.Bin( );
        // this.spin_actor = new St.Icon({ icon_type: St.IconType.SYMBOLIC,
        //                                 icon_name: "error" } );
        this.spin_actor = new St.Icon({icon_type: St.IconType.SYMBOLIC, x_align: St.Align.MIDDLE,
                                        icon_name: "alarm-symbolic",  style_class: 'popup-menu-icon' } );

        // this.spin_actor.set_icon_size(20);
        this.actor.child = this.spin_actor;

        this._timeoutId = 0;

        // this.spin_actor.rotation_angle_z = 360.0 * 4
        // this.spin_actor.set_pivot_point(.5, .5);

        // this.actor.connect('destroy', () => this._onDestroy());

        // this.actor.connect('notify::visible', () => {
        //     if (this.actor.visible) {
        //         this._timeoutId = Mainloop.timeout_add(SPINNER_MS_PER_REV, () => this._update());
        //     } else {
        //         if (this._timeoutId > 0) {
        //             Mainloop.source_remove(this._timeoutId);
        //             this._timeoutId = 0;
        //         }
        //     }
        // });
    }

    _update() {
        Tweener.addTween(this.spin_actor,
                         { time: SPINNER_MS_PER_REV / 1000,
                           transition: 'easeNone',
                           rotation_angle_z: 0,
                           onComplete: this._rev_done,
                           onCompleteScope: this });

        return true;
    }

    _rev_done() {
        this.spin_actor.rotation_angle_z = 360.0;
    }
};




var SpinnerMenuItem = class SpinnerMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init (params) {
        super._init.call(this, params);

        // this.label = new St.Label({text: text});
        // this._icon = new St.Icon({ style_class: 'popup-menu-icon',
        //     icon_name: "alarm-symbolic",
        //     icon_type: St.IconType.SYMBOLIC,
        //     x_align: St.Align.MIDDLE});

        this.spinner = new Spinner();

        this.addActor(this.spinner.actor, {span: -1});
    }

}