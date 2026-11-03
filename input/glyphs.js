/*
 Human-readable names for bindings, matched to the connected controller family:
 Xbox (A/B/X/Y), PlayStation (✕/○/□/△), Switch (B/A/Y/X by position) or a generic pad,
 plus keyboard key names.
 */

// Labels for the standard-layout button indices 0-17.
const BUTTON_LABELS = {
    xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "Xbox", "Share"],
    playstation: ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "PS", "Touchpad"],
    switch: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "LS", "RS", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "Home", "Capture"],
    generic: ["Button 1", "Button 2", "Button 3", "Button 4", "L1", "R1", "L2", "R2", "Select", "Start", "L3", "R3", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "Home", "Button 18"]
};

// Spoken names for screen readers, where the glyph alone is unclear.
const SPOKEN = { "✕": "Cross", "○": "Circle", "□": "Square", "△": "Triangle", "−": "Minus", "+": "Plus" };

const AXIS_LABELS = ["Left stick ←", "Left stick →", "Left stick ↑", "Left stick ↓", "Right stick ←", "Right stick →", "Right stick ↑", "Right stick ↓"];

// Guesses the controller family from Gamepad.id (which usually contains the USB vendor id).
export function controllerFamily(gamepad) {
    const id = (gamepad && gamepad.id ? gamepad.id : "").toLowerCase();
    if (!id) {
        return "generic";
    }
    // Xbox first: "Xbox Wireless Controller" would otherwise match the generic Sony name below.
    if (/xbox|xinput|045e|microsoft/.test(id)) {
        return "xbox";
    }
    if (/054c|playstation|dualshock|dualsense|wireless controller/.test(id)) {
        return "playstation";
    }
    if (/057e|nintendo|pro controller|joy-con/.test(id)) {
        return "switch";
    }
    return "generic";
}

export const FAMILY_NAMES = { xbox: "Xbox controller", playstation: "PlayStation controller", switch: "Switch controller", generic: "Controller" };

// Short controller name for toasts and the profile picker.
export function controllerName(gamepad) {
    const raw = (gamepad && gamepad.id) || "";
    const cleaned = raw.replace(/\(.*?(vendor|STANDARD GAMEPAD).*?\)/gi, "").replace(/\s+/g, " ").trim();
    return cleaned || FAMILY_NAMES[controllerFamily(gamepad)];
}

export function gamepadLabel(binding, family = "xbox") {
    const button = /^b(\d+)$/.exec(binding);
    if (button) {
        const index = Number(button[1]);
        return (BUTTON_LABELS[family] || BUTTON_LABELS.generic)[index] || `Button ${index + 1}`;
    }
    const axis = /^a(\d+)([+-])$/.exec(binding);
    if (axis) {
        const index = Number(axis[1]) * 2 + (axis[2] === "+" ? 1 : 0);
        return AXIS_LABELS[index] || `Axis ${axis[1]} ${axis[2]}`;
    }
    return binding;
}

export function spokenLabel(label) {
    return SPOKEN[label] || label;
}

const KEY_NAMES = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    ShiftLeft: "Left Shift", ShiftRight: "Right Shift", ControlLeft: "Left Ctrl", ControlRight: "Right Ctrl",
    AltLeft: "Left Alt", AltRight: "Right Alt", MetaLeft: "Left Meta", MetaRight: "Right Meta",
    Escape: "Esc", Space: "Space", Enter: "Enter", Backspace: "Backspace", Tab: "Tab",
    NumpadEnter: "Num Enter", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
    Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/"
};

export function keyboardLabel(code) {
    if (KEY_NAMES[code]) {
        return KEY_NAMES[code];
    }
    let match = /^Key([A-Z])$/.exec(code);
    if (match) {
        return match[1];
    }
    match = /^Digit(\d)$/.exec(code);
    if (match) {
        return match[1];
    }
    match = /^Numpad(.+)$/.exec(code);
    if (match) {
        return `Num ${match[1]}`;
    }
    return code;
}

export function bindingLabel(device, binding, family) {
    return device === "keyboard" ? keyboardLabel(binding) : gamepadLabel(binding, family);
}

/*
 How a binding is drawn on the Controls screen:
   keyboard - { shape: "key", size: "normal" | "wide" | "space" }
   gamepad  - face buttons 0-3 { shape: "face", position: "south" | "east" | "west" | "north" },
              bumpers / triggers 4-7 { shape: "shoulder" }, d-pad 12-15 { shape: "dpad", direction },
              stick axes { shape: "stick", stick: "left" | "right", direction },
              anything else { shape: "pill" }
 */
const DIRECTIONS_BY_DPAD = { 12: "up", 13: "down", 14: "left", 15: "right" };
const FACE_POSITIONS = ["south", "east", "west", "north"];

export function glyphShape(device, binding) {
    if (device === "keyboard") {
        if (binding === "Space") {
            return { shape: "key", size: "space" };
        }
        return { shape: "key", size: keyboardLabel(binding).length > 2 ? "wide" : "normal" };
    }
    const button = /^b(\d+)$/.exec(binding);
    if (button) {
        const index = Number(button[1]);
        if (index <= 3) {
            return { shape: "face", position: FACE_POSITIONS[index] };
        }
        if (index <= 7) {
            return { shape: "shoulder" };
        }
        if (DIRECTIONS_BY_DPAD[index]) {
            return { shape: "dpad", direction: DIRECTIONS_BY_DPAD[index] };
        }
        return { shape: "pill" };
    }
    const axis = /^a(\d+)([+-])$/.exec(binding);
    if (axis) {
        const index = Number(axis[1]);
        const vertical = index % 2 === 1;
        const positive = axis[2] === "+";
        return {
            shape: "stick",
            stick: index < 2 ? "left" : "right",
            direction: vertical ? (positive ? "down" : "up") : (positive ? "right" : "left")
        };
    }
    return { shape: "pill" };
}
