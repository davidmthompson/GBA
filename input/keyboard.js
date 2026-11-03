/*
 Keyboard device: turns key presses into InputManager raw events using KeyboardEvent.code,
 so bindings follow physical key positions regardless of keyboard layout.
 */

// While typing in a text field only these actions are taken from the keyboard.
const TEXT_FIELD_ACTIONS = new Set(["menu"]);

function isTextField(element) {
    if (!element) {
        return false;
    }
    if (element.isContentEditable || element.tagName === "TEXTAREA") {
        return true;
    }
    return element.tagName === "INPUT" && !["button", "checkbox", "radio", "range", "submit", "reset", "color"].includes(element.type);
}

export function attachKeyboard(manager) {
    const onKeyDown = (event) => {
        if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
            // Leave browser and OS shortcuts alone.
            return;
        }
        manager.setModality("keyboard");
        const binding = event.code;
        if (!binding) {
            return;
        }
        if (manager.captureHandler) {
            manager.rawDown("keyboard", binding, `kb:${binding}`, { repeat: event.repeat, raw: event });
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const target = event.target;
        if (manager.mode === "menu") {
            if (isTextField(target)) {
                const actions = manager.bindings.actionsFor("keyboard", binding);
                if (!actions.some((action) => TEXT_FIELD_ACTIONS.has(action))) {
                    return;
                }
            }
            // Native controls already handle their own arrow keys.
            if ((target.type === "range" && /^Arrow(Left|Right)$/.test(binding)) || target.tagName === "SELECT") {
                return;
            }
        }
        const used = manager.rawDown("keyboard", binding, `kb:${binding}`, { repeat: event.repeat, raw: event });
        if (!used) {
            return;
        }
        // In menus, Enter/Space keep their native meaning (activate the focused control);
        // everything else, and every key in game mode, is ours.
        const nativeActivation = manager.mode === "menu" && (binding === "Enter" || binding === "NumpadEnter" || binding === "Space") && target !== document.body;
        if (!nativeActivation) {
            event.preventDefault();
        }
    };
    const onKeyUp = (event) => {
        if (event.code) {
            manager.rawUp("keyboard", event.code, `kb:${event.code}`, { raw: event });
        }
    };
    // Releasing everything on blur stops keys sticking when focus leaves the window mid-press.
    const onBlur = () => manager.releaseSource("kb:");

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("keyup", onKeyUp, true);
        window.removeEventListener("blur", onBlur);
    };
}

// Tracks mouse / touch / pen use so the UI can adapt (focus ring style, touch overlay).
export function attachPointerModality(manager) {
    window.addEventListener("pointerdown", (event) => {
        manager.setModality(event.pointerType === "touch" || event.pointerType === "pen" ? "touch" : "mouse");
    }, true);
    window.addEventListener("mousemove", (event) => {
        // Ignore the synthetic mousemove some browsers fire after touch.
        if (manager.modality !== "touch" && (event.movementX || event.movementY)) {
            manager.setModality("mouse");
        }
    }, { passive: true });
}
