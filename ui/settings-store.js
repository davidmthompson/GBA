/*
 App preferences (theme, rumble, haptics, dead zone, touch layout, ...), saved in localStorage.
 Listen for "change" events to react to updates.
 */
export const SETTINGS_KEY = "gba.settings.v1";

export const DEFAULT_SETTINGS = {
    theme: "system",          // "system" | "light" | "dark"
    rumble: true,             // gamepad vibration feedback
    haptics: true,            // navigator.vibrate on touch controls
    deadZone: 0.25,           // analog stick dead zone (0-0.9)
    triggerThreshold: 0.35,   // analog trigger value that counts as a press
    volume: 1,                // emulator volume (0-1)
    showHints: true,          // controller button hints bar
    menuRepeat: "normal",     // held-direction repeat speed in menus: "slow" | "normal" | "fast"
    touch: {
        mode: "auto",         // "auto" (touch devices) | "always" | "never"
        scale: 1,             // control size multiplier (0.7-1.5)
        opacity: 0.75,        // control opacity (0.2-1)
        handed: "right",      // "right": d-pad left, buttons right; "left": swapped
        positions: { portrait: {}, landscape: {} } // custom group centres, fractions of the layer
    }
};

export class SettingsStore extends EventTarget {
    constructor(storage) {
        super();
        this.storage = storage;
        this.values = structuredClone(DEFAULT_SETTINGS);
        try {
            const saved = JSON.parse(storage.getItem(SETTINGS_KEY) || "null");
            if (saved && typeof saved === "object") {
                this.values = merge(this.values, saved);
            }
        }
        catch (error) {
            // Corrupt or unavailable storage: use defaults.
        }
    }

    get(key) {
        return key.split(".").reduce((value, part) => (value == null ? value : value[part]), this.values);
    }

    // Sets a value by dotted path, e.g. set("touch.scale", 1.2).
    set(key, value) {
        const parts = key.split(".");
        let target = this.values;
        parts.slice(0, -1).forEach((part) => {
            target[part] = target[part] && typeof target[part] === "object" ? target[part] : {};
            target = target[part];
        });
        target[parts[parts.length - 1]] = value;
        try {
            this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.values));
        }
        catch (error) {
            // Not persisted; still applied for this session.
        }
        this.dispatchEvent(new CustomEvent("change", { detail: { key, value } }));
    }
}

function merge(base, extra) {
    for (const [key, value] of Object.entries(extra)) {
        if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object") {
            base[key] = merge(base[key], value);
        }
        else if (key in base) {
            base[key] = value;
        }
    }
    return base;
}

// localStorage can throw (private mode, blocked cookies); fall back to memory.
export function safeStorage() {
    try {
        const probe = "__gba_probe__";
        window.localStorage.setItem(probe, probe);
        window.localStorage.removeItem(probe);
        return window.localStorage;
    }
    catch (error) {
        const data = new Map();
        return {
            getItem: (key) => (data.has(key) ? data.get(key) : null),
            setItem: (key, value) => data.set(key, String(value)),
            removeItem: (key) => data.delete(key)
        };
    }
}
