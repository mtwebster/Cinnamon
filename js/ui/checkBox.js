/**
 * FILE:checkBox.js
 * @short_description: A check box widget
 *
 * A toggle button styled as a check box with an optional label.
 * Uses the `check-box` style class.
 */

const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const Pango = imports.gi.Pango;
const St = imports.gi.St;

/**
 * #CheckBox
 * @short_description: A labelled check box toggle button
 *
 * A #St.Button in toggle mode styled as a check box. The checked state
 * is available via the inherited `checked` property.
 *
 * Inherits: St.Button
 */
var CheckBox = GObject.registerClass(
class CheckBox extends St.Button {
    _init(label) {
        let container = new St.BoxLayout();
        super._init({
            style_class: 'check-box',
            important: true,
            child: container,
            button_mask: St.ButtonMask.ONE,
            toggle_mode: true,
            can_focus: true,
            x_fill: true,
            y_fill: true,
        });

        this._box = new St.Bin();
        this._box.set_y_align(Clutter.ActorAlign.START);
        container.add_actor(this._box);

        this._label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        this._label.clutter_text.set_line_wrap(true);
        this._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        container.add_actor(this._label);

        if (label)
            this.setLabel(label);
    }

    setLabel(label) {
        this._label.set_text(label);
    }

    getLabelActor() {
        return this._label;
    }
});
