// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/**
 * FILE:timers.js
 * @short_description: Debug timing utilities
 *
 * Provides #DebugTimer for measuring elapsed time during development
 * and debugging. Wraps GLib's timer functions with a simple
 * start/stop/elapsed interface.
 */

function DebugTimer(name){
    this._init(name);
}

DebugTimer.prototype = {
    _init: function(name) {
        this.name = name;
        this.start_time = 0;
    },

    start: function() {
        this.start_time = Date.now();
        log("Debug timer __" + this.name + "__ started.");
    },

    stop: function() {
        let diff = Date.now() - this.start_time;
        log("Debug timer __" + this.name + "__ stopped at * " + diff.toString() + "ms *")
        this.start_time = 0;
    }

};

