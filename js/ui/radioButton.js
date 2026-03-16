/**
 * FILE:radioButton.js
 * @short_description: A radio button widget
 *
 * A toggle button styled as a radio button with a label. Use in
 * groups where only one option should be selected at a time.
 * Uses the `radio-button` style class.
 */

const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const Pango = imports.gi.Pango;
const St = imports.gi.St;

var RadioButton = GObject.registerClass(
class RadioButton extends St.Button {
    _init(label) {
        let container = new St.BoxLayout();
        super._init({
            style_class: 'radiobutton',
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
        container.add_child(this._box);

        this._label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        this._label.clutter_text.set_line_wrap(true);
        this._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        container.add_child(this._label);

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
