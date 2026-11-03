/*
 Binding storage: which keys and gamepad controls trigger each action.

 Binding strings:
   keyboard - KeyboardEvent.code, e.g. "KeyX", "ArrowUp", "ShiftLeft" (layout independent)
   gamepad  - "b<n>" for button n, "a<n>+" / "a<n>-" for axis n pushed positive / negative,
              using the W3C "standard" gamepad layout indices.

 Several bindings per action are allowed. Gamepad bindings are kept per controller profile:
 "*" applies to every controller; a gamepad id (Gamepad.id) overrides "*" for that controller,
 action by action. Only changed actions are stored; anything not stored falls back to the
 defaults below. Everything is saved to localStorage under STORAGE_KEY.
 */
import { ACTIONS, ACTION_MAP, scopesOverlap } from "./actions.js";

export const STORAGE_KEY = "gba.bindings.v1";
export const ALL_PROFILES = "*";

// Defaults match the original IodineGBA keys (X = A, Z = B, A = L, S = R, Enter = Start,
// Shift = Select, D/R = volume, 3/4 = speed).
export const DEFAULT_BINDINGS = {
    keyboard: {
        up: ["ArrowUp"],
        down: ["ArrowDown"],
        left: ["ArrowLeft"],
        right: ["ArrowRight"],
        a: ["KeyX"],
        b: ["KeyZ"],
        l: ["KeyA"],
        r: ["KeyS"],
        start: ["Enter"],
        select: ["ShiftLeft", "ShiftRight"],
        fast_forward: ["Space"],
        speed_up: ["Digit3"],
        speed_down: ["Digit4"],
        volume_up: ["KeyR"],
        volume_down: ["KeyD"],
        menu: ["Escape"],
        confirm: ["Enter", "Space"],
        back: ["Backspace"]
    },
    gamepad: {
        // Standard layout: 0 south, 1 east, 2 west, 3 north, 4/5 bumpers, 6/7 triggers,
        // 8 back/select, 9 start, 10/11 stick clicks, 12-15 d-pad, 16 home.
        up: ["b12", "a1-"],
        down: ["b13", "a1+"],
        left: ["b14", "a0-"],
        right: ["b15", "a0+"],
        a: ["b0"],
        b: ["b1"],
        l: ["b4", "b6"],
        r: ["b5", "b7"],
        start: ["b9"],
        select: ["b8"],
        fast_forward: [],
        speed_up: [],
        speed_down: [],
        volume_up: [],
        volume_down: [],
        menu: ["b16", "b11"],
        confirm: ["b0"],
        back: ["b1"]
    }
};

export const DEVICES = ["keyboard", "gamepad"];

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key)
    };
}

export class BindingStore extends EventTarget {
    constructor(storage) {
        super();
        this.storage = storage || memoryStorage();
        this.data = { keyboard: {}, gamepad: { [ALL_PROFILES]: {} } };
        this.load();
    }

    load() {
        try {
            const parsed = JSON.parse(this.storage.getItem(STORAGE_KEY) || "null");
            if (parsed && typeof parsed === "object") {
                this.data.keyboard = sanitizeActionMap(parsed.keyboard);
                this.data.gamepad = {};
                for (const [profile, map] of Object.entries(parsed.gamepad || {})) {
                    this.data.gamepad[profile] = sanitizeActionMap(map);
                }
                this.data.gamepad[ALL_PROFILES] = this.data.gamepad[ALL_PROFILES] || {};
            }
        }
        catch (error) {
            // Corrupt or blocked storage: fall back to defaults.
        }
    }

    save() {
        try {
            this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        }
        catch (error) {
            // Storage full or unavailable: bindings still work for this session.
        }
        this.dispatchEvent(new CustomEvent("change"));
    }

    // The stored override map for a device/profile, created on demand when `create` is set.
    overrides(device, profile, create = false) {
        if (device === "keyboard") {
            return this.data.keyboard;
        }
        if (!this.data.gamepad[profile] && create) {
            this.data.gamepad[profile] = {};
        }
        return this.data.gamepad[profile] || null;
    }

    // Current bindings for one action.
    get(device, actionId, profile = ALL_PROFILES) {
        if (device === "gamepad") {
            const own = this.data.gamepad[profile];
            if (own && own[actionId]) {
                return [...own[actionId]];
            }
            const shared = this.data.gamepad[ALL_PROFILES];
            if (shared && shared[actionId]) {
                return [...shared[actionId]];
            }
        }
        else if (this.data.keyboard[actionId]) {
            return [...this.data.keyboard[actionId]];
        }
        return [...(DEFAULT_BINDINGS[device][actionId] || [])];
    }

    // True when the action differs from its default for this device/profile.
    isCustom(device, actionId, profile = ALL_PROFILES) {
        const current = this.get(device, actionId, profile);
        const defaults = DEFAULT_BINDINGS[device][actionId] || [];
        return current.length !== defaults.length || current.some((binding, index) => binding !== defaults[index]);
    }

    // Every action a binding triggers (in any scope).
    actionsFor(device, binding, profile = ALL_PROFILES) {
        return ACTIONS.filter((action) => this.get(device, action.id, profile).includes(binding)).map((action) => action.id);
    }

    // Other actions that already use `binding` and could fire at the same time as `actionId`.
    conflicts(device, actionId, binding, profile = ALL_PROFILES) {
        const scope = ACTION_MAP[actionId].scope;
        return this.actionsFor(device, binding, profile).filter((other) => other !== actionId && scopesOverlap(scope, ACTION_MAP[other].scope));
    }

    set(device, actionId, bindings, profile = ALL_PROFILES) {
        this.overrides(device, profile, true)[actionId] = [...new Set(bindings)];
        this.save();
    }

    /*
     Binds `binding` to `actionId`.
       mode "replace" - it becomes the only binding for this device (a rebind)
       mode "add"     - it is added next to the existing ones
     When the binding is used by a conflicting action:
       - without swap, nothing changes and { ok: false, conflicts } is returned;
       - with swap, the conflicting actions lose it and, in replace mode, receive this
         action's previous bindings instead, so nothing is left unbound.
     */
    assign(device, actionId, binding, { mode = "replace", swap = false, profile = ALL_PROFILES } = {}) {
        const conflicts = this.conflicts(device, actionId, binding, profile);
        if (conflicts.length && !swap) {
            return { ok: false, conflicts };
        }
        const previous = this.get(device, actionId, profile);
        const target = this.overrides(device, profile, true);
        for (const other of conflicts) {
            let list = this.get(device, other, profile).filter((item) => item !== binding);
            if (mode === "replace") {
                list = list.concat(previous.filter((item) => item !== binding && !list.includes(item)));
            }
            target[other] = list;
        }
        target[actionId] = mode === "replace" ? [binding] : [...new Set(previous.concat(binding))];
        this.save();
        return { ok: true, conflicts, swapped: conflicts };
    }

    remove(device, actionId, binding, profile = ALL_PROFILES) {
        this.set(device, actionId, this.get(device, actionId, profile).filter((item) => item !== binding), profile);
    }

    // Restores one action's defaults. With device omitted, resets keyboard and gamepad.
    reset(actionId, device = null, profile = ALL_PROFILES) {
        for (const each of device ? [device] : DEVICES) {
            const map = this.overrides(each, profile);
            if (map) {
                delete map[actionId];
            }
        }
        this.save();
    }

    // Restores every action. With device omitted, resets everything including all
    // per-controller profiles; with a gamepad profile, resets only that profile.
    resetAll(device = null, profile = null) {
        if (!device || device === "keyboard") {
            this.data.keyboard = {};
        }
        if (!device || device === "gamepad") {
            if (profile && profile !== ALL_PROFILES) {
                delete this.data.gamepad[profile];
            }
            else {
                this.data.gamepad = { [ALL_PROFILES]: {} };
            }
        }
        this.save();
    }

    // Gamepad profiles with stored customisations (besides "*").
    profiles() {
        return Object.keys(this.data.gamepad).filter((profile) => profile !== ALL_PROFILES);
    }
}

function sanitizeActionMap(map) {
    const clean = {};
    for (const [actionId, list] of Object.entries(map || {})) {
        if (ACTION_MAP[actionId] && Array.isArray(list)) {
            clean[actionId] = list.filter((item) => typeof item === "string");
        }
    }
    return clean;
}
