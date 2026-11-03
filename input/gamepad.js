/*
 Gamepad device, built on the standard Gamepad API.

 - Listens for gamepadconnected / gamepaddisconnected and polls navigator.getGamepads() in a
   requestAnimationFrame loop while at least one pad is connected.
 - Buttons become "b<n>" bindings, stick directions "a<n>+" / "a<n>-" (see bindings.js).
 - Analog triggers count as pressed above settings.triggerThreshold and also report their value
   (InputManager "analog" events) for analog actions such as fast-forward.
 - Sticks use a configurable radial dead zone and can drive menus, with auto-repeat.
 - Pads whose mapping is not "standard" still work through their raw button/axis indices; the
   user is pointed at the Controls screen to remap them.
 - Optional rumble through vibrationActuator.
 */
import { DIRECTIONS } from "./actions.js";
import { controllerFamily, controllerName } from "./glyphs.js";

const TRIGGER_INDICES = new Set([6, 7]);

// Menu auto-repeat timing for held directions, from settings.menuRepeat.
const REPEAT_TIMING = {
    slow: { delay: 520, interval: 170 },
    normal: { delay: 400, interval: 110 },
    fast: { delay: 300, interval: 65 }
};

export function repeatTiming(speed) {
    return REPEAT_TIMING[speed] || REPEAT_TIMING.normal;
}

export class GamepadInput extends EventTarget {
    constructor(manager, settings, { notify = () => {} } = {}) {
        super();
        this.manager = manager;
        this.settings = settings;
        this.notify = notify;
        this.pads = new Map();       // index -> { buttons: [], axes: [], axisReady: [], repeat: Map }
        this.lastPad = null;          // most recently used Gamepad
        this.frame = 0;
        this.poll = this.poll.bind(this);
        this.supported = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";
        if (!this.supported) {
            return;
        }
        window.addEventListener("gamepadconnected", (event) => this.onConnect(event.gamepad));
        window.addEventListener("gamepaddisconnected", (event) => this.onDisconnect(event.gamepad));
        // Pads already connected before the page loaded (e.g. navigating from the library).
        for (const pad of this.readPads()) {
            this.onConnect(pad, true);
        }
    }

    readPads() {
        try {
            return [...navigator.getGamepads()].filter(Boolean);
        }
        catch (error) {
            // Blocked by a permissions policy.
            return [];
        }
    }

    connected() {
        return this.readPads();
    }

    family() {
        return controllerFamily(this.lastPad || this.readPads()[0]);
    }

    onConnect(pad, silent = false) {
        if (this.pads.has(pad.index)) {
            return;
        }
        this.pads.set(pad.index, {
            buttons: pad.buttons.map(() => false),
            axes: pad.axes.map(() => 0),
            // An axis only counts once it has been seen near centre. Some pads report a hat
            // switch or an uncalibrated axis resting far from 0; this stops those from firing.
            axisReady: pad.axes.map(() => false),
            repeat: new Map()
        });
        this.lastPad = pad;
        if (!silent) {
            const standard = pad.mapping === "standard";
            this.notify(`${controllerName(pad)} connected${standard ? "" : " (non-standard layout: remap it in Controls if buttons feel wrong)"}`, "🎮");
            this.rumble(0.4, 120, pad);
        }
        this.dispatchEvent(new CustomEvent("connect", { detail: { gamepad: pad } }));
        if (!this.frame) {
            this.frame = requestAnimationFrame(this.poll);
        }
    }

    onDisconnect(pad) {
        this.pads.delete(pad.index);
        this.manager.releaseSource(`gp${pad.index}:`);
        if (this.lastPad && this.lastPad.index === pad.index) {
            this.lastPad = this.readPads()[0] || null;
        }
        this.notify(`${controllerName(pad)} disconnected`, "🔌");
        this.dispatchEvent(new CustomEvent("disconnect", { detail: { gamepad: pad } }));
    }

    poll(time) {
        this.frame = 0;
        const pads = this.readPads();
        for (const pad of pads) {
            if (!this.pads.has(pad.index)) {
                this.onConnect(pad);
            }
            this.pollPad(pad, time);
        }
        if (this.pads.size) {
            this.frame = requestAnimationFrame(this.poll);
        }
    }

    pollPad(pad, time) {
        const state = this.pads.get(pad.index);
        const threshold = this.settings.get("triggerThreshold");
        const deadZone = this.settings.get("deadZone");
        const profile = pad.id;
        let active = false;

        pad.buttons.forEach((button, index) => {
            const value = typeof button === "number" ? button : button.value;
            const isAnalog = TRIGGER_INDICES.has(index) || (value > 0 && value < 1);
            const pressed = isAnalog ? value > threshold : (typeof button === "number" ? value > 0.5 : button.pressed);
            const binding = `b${index}`;
            const key = `gp${pad.index}:${binding}`;
            if (pressed !== state.buttons[index]) {
                state.buttons[index] = pressed;
                active = true;
                this.change(pressed, binding, key, value, profile, pad, time);
            }
            else if (pressed && isAnalog) {
                this.manager.rawAnalog(key, value);
            }
            if (pressed) {
                this.repeat(key, binding, profile, pad, time);
            }
        });

        // Radial dead zone per stick (axes 0/1 = left, 2/3 = right), per-axis for the rest.
        pad.axes.forEach((raw, index) => {
            const pairIndex = index < 4 ? index ^ 1 : -1;
            const magnitude = pairIndex >= 0 ? Math.hypot(raw, pad.axes[pairIndex] || 0) : Math.abs(raw);
            const value = magnitude > deadZone ? raw : 0;
            if (!state.axisReady[index]) {
                if (Math.abs(raw) < Math.max(deadZone, 0.2)) {
                    state.axisReady[index] = true;
                }
                return;
            }
            const previous = state.axes[index];
            state.axes[index] = value;
            for (const sign of [1, -1]) {
                const binding = `a${index}${sign > 0 ? "+" : "-"}`;
                const key = `gp${pad.index}:${binding}`;
                // Slightly above the dead zone on the axis itself, so diagonals stay intentional.
                const now = value * sign > Math.max(deadZone, 0.3);
                const before = previous * sign > Math.max(deadZone, 0.3);
                if (now !== before) {
                    active = true;
                    this.change(now, binding, key, Math.abs(value), profile, pad, time);
                }
                if (now) {
                    this.repeat(key, binding, profile, pad, time);
                }
            }
        });

        if (active) {
            this.lastPad = pad;
            this.manager.setModality("gamepad");
        }
    }

    change(pressed, binding, key, value, profile, pad, time) {
        const state = this.pads.get(pad.index);
        if (pressed) {
            state.repeat.set(key, time + repeatTiming(this.settings.get("menuRepeat")).delay);
            this.manager.rawDown("gamepad", binding, key, { value, profile, raw: pad });
        }
        else {
            state.repeat.delete(key);
            this.manager.rawUp("gamepad", binding, key, { profile, raw: pad });
        }
    }

    // Menu auto-repeat for held directions (keyboards repeat natively; gamepads do not).
    repeat(key, binding, profile, pad, time) {
        const state = this.pads.get(pad.index);
        const due = state.repeat.get(key);
        if (due === undefined || time < due || this.manager.mode !== "menu" || this.manager.captureHandler) {
            return;
        }
        const actions = this.manager.bindings.actionsFor("gamepad", binding, profile);
        if (actions.some((action) => DIRECTIONS.includes(action))) {
            this.manager.rawDown("gamepad", binding, key, { repeat: true, profile, raw: pad });
        }
        state.repeat.set(key, time + repeatTiming(this.settings.get("menuRepeat")).interval);
    }

    // Short vibration on the given (or last used) pad, if supported and enabled.
    rumble(strength = 0.5, duration = 100, pad = null) {
        if (!this.settings.get("rumble")) {
            return;
        }
        const target = pad || this.lastPad;
        const live = target && this.readPads().find((each) => each.index === target.index);
        const actuator = live && live.vibrationActuator;
        if (actuator && typeof actuator.playEffect === "function") {
            actuator.playEffect("dual-rumble", {
                duration,
                strongMagnitude: strength,
                weakMagnitude: Math.min(1, strength * 1.2)
            }).catch(() => {});
        }
    }
}
