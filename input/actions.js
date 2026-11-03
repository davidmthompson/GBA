/*
 Input action layer.

 Every input device (keyboard.js, gamepad.js, touch-overlay.js) reports raw presses to the
 InputManager, which resolves them to named ACTIONS using the current bindings and emits:

   "actiondown"  detail: { action, source, value, repeat }
   "actionup"    detail: { action, source }
   "analog"      detail: { action, source, value }      (0..1, e.g. analog triggers)
   "modality"    detail: { modality }                   (keyboard | mouse | touch | gamepad)

 App code (menus, the library, the emulator bridge) only listens for actions.

 Each action has a scope:
   "game" - only while a game is running (GBA buttons, hotkeys)
   "menu" - only while a menu or the library is active (confirm, back)
   "both" - always (directions, menu toggle)
 The same key may be bound to a "game" action and a "menu" action at once (Enter = Start in
 game, Confirm in menus). That is not a conflict, because they never fire in the same mode.
 */

export const ACTIONS = [
    { id: "up", label: "Up", scope: "both", group: "Directions" },
    { id: "down", label: "Down", scope: "both", group: "Directions" },
    { id: "left", label: "Left", scope: "both", group: "Directions" },
    { id: "right", label: "Right", scope: "both", group: "Directions" },
    { id: "a", label: "A", scope: "game", group: "GBA buttons" },
    { id: "b", label: "B", scope: "game", group: "GBA buttons" },
    { id: "l", label: "L", scope: "game", group: "GBA buttons" },
    { id: "r", label: "R", scope: "game", group: "GBA buttons" },
    { id: "start", label: "Start", scope: "game", group: "GBA buttons" },
    { id: "select", label: "Select", scope: "game", group: "GBA buttons" },
    { id: "fast_forward", label: "Fast-forward (hold)", scope: "game", group: "Emulator", analog: true },
    { id: "speed_up", label: "Speed +10%", scope: "game", group: "Emulator" },
    { id: "speed_down", label: "Speed −10%", scope: "game", group: "Emulator" },
    { id: "volume_up", label: "Volume up", scope: "game", group: "Emulator" },
    { id: "volume_down", label: "Volume down", scope: "game", group: "Emulator" },
    { id: "menu", label: "Open / close menu", scope: "both", group: "Menus" },
    { id: "confirm", label: "Confirm", scope: "menu", group: "Menus" },
    { id: "back", label: "Back", scope: "menu", group: "Menus" },
    { id: "prev_tab", label: "Previous tab", scope: "menu", group: "Menus" },
    { id: "next_tab", label: "Next tab", scope: "menu", group: "Menus" }
];

export const ACTION_MAP = Object.fromEntries(ACTIONS.map((action) => [action.id, action]));

export const DIRECTIONS = ["up", "down", "left", "right"];

// True when two scopes can be active at the same time.
export function scopesOverlap(scopeA, scopeB) {
    return scopeA === "both" || scopeB === "both" || scopeA === scopeB;
}

// True when an action may fire in the given mode ("game" or "menu").
export function actionActiveIn(actionId, mode) {
    const action = ACTION_MAP[actionId];
    return !!action && (action.scope === "both" || action.scope === mode);
}

export class InputManager extends EventTarget {
    constructor(bindings) {
        super();
        this.bindings = bindings;       // BindingStore (bindings.js)
        this.mode = "menu";             // "menu" or "game"
        this.modality = "mouse";
        this.held = new Map();          // action -> Set of source keys holding it
        this.sourceActions = new Map(); // source key -> actions it pressed
        this.captureHandler = null;     // set while the remap screen listens for a key/button
        this.suspended = false;
    }

    // Switches between "game" and "menu". Everything held is released first, so no GBA button
    // stays pressed behind a menu.
    setMode(mode) {
        if (mode === this.mode) {
            return;
        }
        this.releaseAll();
        this.mode = mode;
        this.dispatchEvent(new CustomEvent("modechange", { detail: { mode } }));
    }

    // Records the last used input type and mirrors it on <html data-input="..."> for styling
    // (focus rings, touch overlay visibility, button hints).
    setModality(modality) {
        if (modality === this.modality) {
            return;
        }
        this.modality = modality;
        if (typeof document !== "undefined") {
            document.documentElement.dataset.input = modality;
        }
        this.dispatchEvent(new CustomEvent("modality", { detail: { modality } }));
    }

    // While a capture handler is set, raw presses go to it instead of becoming actions.
    // The handler returns true when it has consumed the press.
    capture(handler) {
        this.releaseAll();
        this.captureHandler = handler;
    }

    endCapture() {
        this.captureHandler = null;
    }

    // Called by device modules. `device` is "keyboard" or "gamepad"; `binding` is a binding
    // string (see bindings.js); `sourceKey` uniquely identifies the physical control.
    // Returns true when the press was used (so the device can call preventDefault).
    rawDown(device, binding, sourceKey, { value = 1, repeat = false, profile = "*", raw = null } = {}) {
        if (this.captureHandler) {
            return this.captureHandler({ device, binding, profile, raw, phase: "down", repeat }) !== false;
        }
        if (this.suspended) {
            return false;
        }
        const actions = this.bindings.actionsFor(device, binding, profile).filter((id) => actionActiveIn(id, this.mode));
        if (repeat) {
            // Key repeat only matters for menu navigation.
            const repeatable = actions.filter((id) => this.mode === "menu" && DIRECTIONS.includes(id));
            repeatable.forEach((id) => this.emit("actiondown", { action: id, source: device, value, repeat: true }));
            return actions.length > 0;
        }
        if (actions.length) {
            this.sourceActions.set(sourceKey, actions);
            actions.forEach((id) => this.press(id, sourceKey, device, value));
        }
        return actions.length > 0;
    }

    rawUp(device, binding, sourceKey, { profile = "*", raw = null } = {}) {
        if (this.captureHandler) {
            this.captureHandler({ device, binding, profile, raw, phase: "up" });
            return true;
        }
        const actions = this.sourceActions.get(sourceKey);
        if (!actions) {
            return false;
        }
        this.sourceActions.delete(sourceKey);
        actions.forEach((id) => this.release(id, sourceKey, device));
        return true;
    }

    // Analog value for a held control (e.g. trigger pressure). Only actions marked analog care.
    rawAnalog(sourceKey, value, device = "gamepad") {
        const actions = this.sourceActions.get(sourceKey);
        if (!actions) {
            return;
        }
        actions.filter((id) => ACTION_MAP[id].analog).forEach((id) => this.emit("analog", { action: id, source: device, value }));
    }

    // Direct action press used by the touch overlay, which works in actions rather than bindings.
    press(actionId, sourceKey, source, value = 1) {
        let holders = this.held.get(actionId);
        if (!holders) {
            holders = new Set();
            this.held.set(actionId, holders);
        }
        const wasHeld = holders.size > 0;
        holders.add(sourceKey);
        if (!wasHeld) {
            this.emit("actiondown", { action: actionId, source, value, repeat: false });
        }
    }

    release(actionId, sourceKey, source) {
        const holders = this.held.get(actionId);
        if (!holders || !holders.delete(sourceKey)) {
            return;
        }
        if (holders.size === 0) {
            this.held.delete(actionId);
            this.emit("actionup", { action: actionId, source });
        }
    }

    // Releases one source (e.g. all buttons of a disconnected gamepad, prefix match).
    releaseSource(prefix) {
        for (const [sourceKey, actions] of [...this.sourceActions]) {
            if (sourceKey.startsWith(prefix)) {
                this.sourceActions.delete(sourceKey);
                actions.forEach((id) => this.release(id, sourceKey, "system"));
            }
        }
        for (const [actionId, holders] of [...this.held]) {
            [...holders].filter((key) => key.startsWith(prefix)).forEach((key) => this.release(actionId, key, "system"));
        }
    }

    releaseAll() {
        this.sourceActions.clear();
        for (const [actionId, holders] of [...this.held]) {
            [...holders].forEach((key) => this.release(actionId, key, "system"));
        }
    }

    isHeld(actionId) {
        return this.held.has(actionId);
    }

    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}
