/*
 Button hints bar ("Ⓐ Select  Ⓑ Back  ☰ Menu") that matches the input in use:
 controller glyphs for the connected pad family, key names for the keyboard, hidden for
 mouse and touch.
 */
import { bindingLabel } from "../input/glyphs.js";

export class HintsBar {
    // items: () => [{ action, label }] or [{ actions: [...], label }] for a pair like L / R
    constructor(element, app, items) {
        this.element = element;
        this.app = app;
        this.items = items;
        element.classList.add("hints");
        element.setAttribute("aria-hidden", "true"); // visual helper; real labels live on the controls
        const render = () => this.render();
        app.manager.addEventListener("modality", render);
        app.manager.addEventListener("modechange", render);
        app.bindings.addEventListener("change", render);
        app.settings.addEventListener("change", render);
        app.gamepad.addEventListener("connect", render);
        this.render();
    }

    render() {
        const modality = this.app.manager.modality;
        const device = modality === "gamepad" ? "gamepad" : modality === "keyboard" ? "keyboard" : null;
        if (!device || !this.app.settings.get("showHints")) {
            this.element.hidden = true;
            return;
        }
        const family = this.app.gamepad.family();
        const profile = this.app.gamepad.lastPad ? this.app.gamepad.lastPad.id : "*";
        const parts = this.items().map(({ action, actions = [action], label }) => {
            const glyphs = actions.map((each) => {
                const binding = this.app.bindings.get(device, each, profile)[0];
                if (!binding) {
                    return "";
                }
                const glyph = bindingLabel(device, binding, family);
                return `<kbd class="glyph glyph--${device === "gamepad" ? family : "key"}" data-glyph="${glyph}">${glyph}</kbd>`;
            });
            if (glyphs.some((glyph) => !glyph)) {
                return "";
            }
            return `<span class="hints__item">${glyphs.join("")}${label}</span>`;
        }).filter(Boolean);
        this.element.innerHTML = parts.join("");
        this.element.hidden = parts.length === 0;
    }
}
