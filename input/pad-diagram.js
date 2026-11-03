/*
 Controller test diagram for the Controls screen: a GBA-style handheld drawn in SVG, labelled
 with the key or controller button bound to each GBA button (matched to the controller family),
 that lights up live while a bound key or button is held. Reads the hardware directly
 (keyboard events and navigator.getGamepads()), so it also works in menus, where GBA actions
 never fire.
 */
import { ALL_PROFILES } from "./bindings.js";
import { bindingLabel, FAMILY_NAMES } from "./glyphs.js";

export const PAD_ACTIONS = ["up", "down", "left", "right", "a", "b", "l", "r", "start", "select", "menu"];

// True when a gamepad binding ("b<n>" or "a<n>+/-") is held on `pad`.
export function gamepadBindingDown(pad, binding, { deadZone = 0.25, threshold = 0.35 } = {}) {
    const button = /^b(\d+)$/.exec(binding);
    if (button) {
        const state = pad.buttons[Number(button[1])];
        if (state == null) {
            return false;
        }
        const value = typeof state === "number" ? state : state.value;
        return (typeof state === "object" && state.pressed && value >= 1) || value > threshold;
    }
    const axis = /^a(\d+)([+-])$/.exec(binding);
    if (axis) {
        const value = pad.axes[Number(axis[1])] || 0;
        return value * (axis[2] === "+" ? 1 : -1) > Math.max(deadZone, 0.3);
    }
    return false;
}

// The diagram actions whose bindings are currently held, given a predicate for one binding.
export function pressedActions(bindings, device, isDown, profile = ALL_PROFILES) {
    return new Set(PAD_ACTIONS.filter((action) => bindings.get(device, action, profile).some(isDown)));
}

const SVG = `
<svg class="pad__svg" viewBox="0 0 480 230" role="img" aria-labelledby="pad-svg-title">
    <title id="pad-svg-title">Controller test: buttons light up when pressed</title>
    <g class="pad__btn" data-pad="l"><rect class="pad__shape" x="52" y="6" width="118" height="34" rx="15"/><text class="pad__label" x="111" y="28"></text></g>
    <g class="pad__btn" data-pad="r"><rect class="pad__shape" x="310" y="6" width="118" height="34" rx="15"/><text class="pad__label" x="369" y="28"></text></g>
    <rect class="pad__body" x="30" y="34" width="420" height="180" rx="70"/>
    <rect class="pad__screen" x="160" y="58" width="160" height="104" rx="10"/>
    <text class="pad__device" x="240" y="104"></text>
    <text class="pad__hint" x="240" y="128">Press a button to test it</text>
    <g class="pad__btn" data-pad="up"><rect class="pad__shape" x="88" y="74" width="26" height="32" rx="4"/></g>
    <g class="pad__btn" data-pad="down"><rect class="pad__shape" x="88" y="130" width="26" height="32" rx="4"/></g>
    <g class="pad__btn" data-pad="left"><rect class="pad__shape" x="56" y="105" width="33" height="26" rx="4"/></g>
    <g class="pad__btn" data-pad="right"><rect class="pad__shape" x="113" y="105" width="33" height="26" rx="4"/></g>
    <rect class="pad__dpad-centre" x="88" y="105" width="26" height="26"/>
    <text class="pad__caption" x="101" y="184" data-pad-caption="dpad"></text>
    <g class="pad__btn" data-pad="b"><circle class="pad__shape" cx="356" cy="132" r="24"/><text class="pad__label" x="356" y="138"></text></g>
    <g class="pad__btn" data-pad="a"><circle class="pad__shape" cx="406" cy="102" r="24"/><text class="pad__label" x="406" y="108"></text></g>
    <g class="pad__btn" data-pad="select"><rect class="pad__shape" x="176" y="178" width="56" height="20" rx="10"/><text class="pad__label pad__label--small" x="204" y="192"></text></g>
    <g class="pad__btn" data-pad="start"><rect class="pad__shape" x="248" y="178" width="56" height="20" rx="10"/><text class="pad__label pad__label--small" x="276" y="192"></text></g>
    <g class="pad__btn" data-pad="menu"><rect class="pad__shape" x="214" y="22" width="52" height="18" rx="9"/><text class="pad__label pad__label--small" x="240" y="35"></text></g>
    <text class="pad__name" x="204" y="212">SELECT</text>
    <text class="pad__name" x="276" y="212">START</text>
    <text class="pad__name" x="240" y="14">MENU</text>
    <text class="pad__name" x="356" y="170">B</text>
    <text class="pad__name" x="406" y="140">A</text>
</svg>`;

export class PadDiagram {
    constructor(container, { manager, bindings, gamepad, settings, getProfile = () => ALL_PROFILES }) {
        this.container = container;
        this.manager = manager;
        this.bindings = bindings;
        this.gamepad = gamepad;
        this.settings = settings;
        this.getProfile = getProfile;
        this.keys = new Set();
        this.device = null;
        this.frame = 0;
        this.running = false;
        container.classList.add("pad");
        container.innerHTML = `${SVG}<p class="pad__status" aria-live="polite"></p>`;
        this.status = container.querySelector(".pad__status");
        this.loop = this.loop.bind(this);
        this.onKey = (event) => {
            if (event.type === "keydown") {
                this.keys.add(event.code);
            }
            else {
                this.keys.delete(event.code);
            }
        };
        this.onBlur = () => this.keys.clear();
        const refresh = () => this.labels();
        bindings.addEventListener("change", refresh);
        gamepad.addEventListener("connect", refresh);
        gamepad.addEventListener("disconnect", refresh);
        manager.addEventListener("modality", refresh);
        this.labels();
    }

    // Keyboard while the keyboard is in use or no pad is connected, otherwise the controller.
    currentDevice() {
        const modality = this.manager.modality;
        if (modality === "keyboard") {
            return "keyboard";
        }
        return this.gamepad.connected().length ? "gamepad" : "keyboard";
    }

    labels() {
        const device = this.currentDevice();
        const family = this.gamepad.family();
        const profile = device === "gamepad" ? this.getProfile() : ALL_PROFILES;
        this.device = device;
        this.container.dataset.device = device === "gamepad" ? family : "keyboard";
        for (const action of PAD_ACTIONS) {
            const label = this.container.querySelector(`[data-pad="${action}"] .pad__label`);
            if (label) {
                const binding = this.bindings.get(device, action, profile)[0];
                // Short form so "Left Shift" fits on the small Select pill.
                label.textContent = binding ? bindingLabel(device, binding, family).replace(/^(Left|Right) /, "") : "–";
            }
        }
        const up = this.bindings.get(device, "up", profile)[0];
        this.container.querySelector("[data-pad-caption]").textContent = device === "keyboard"
            ? (up ? "Arrow keys" : "")
            : "D-pad / stick";
        this.container.querySelector(".pad__device").textContent = device === "keyboard" ? "Keyboard" : FAMILY_NAMES[family];
    }

    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        window.addEventListener("keydown", this.onKey, true);
        window.addEventListener("keyup", this.onKey, true);
        window.addEventListener("blur", this.onBlur);
        this.labels();
        this.frame = requestAnimationFrame(this.loop);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frame);
        window.removeEventListener("keydown", this.onKey, true);
        window.removeEventListener("keyup", this.onKey, true);
        window.removeEventListener("blur", this.onBlur);
        this.keys.clear();
        this.show(new Set());
    }

    loop() {
        if (!this.running) {
            return;
        }
        const held = pressedActions(this.bindings, "keyboard", (binding) => this.keys.has(binding));
        const limits = { deadZone: this.settings.get("deadZone"), threshold: this.settings.get("triggerThreshold") };
        for (const pad of this.gamepad.connected()) {
            const profile = this.getProfile() === ALL_PROFILES ? pad.id : this.getProfile();
            pressedActions(this.bindings, "gamepad", (binding) => gamepadBindingDown(pad, binding, limits), profile).forEach((action) => held.add(action));
        }
        this.show(held);
        // Relabel when a different controller becomes the active one.
        const active = this.gamepad.lastPad ? this.gamepad.lastPad.id : "";
        if (active !== this.activePad) {
            this.activePad = active;
            this.labels();
        }
        this.frame = requestAnimationFrame(this.loop);
    }

    show(held) {
        this.container.querySelectorAll("[data-pad]").forEach((element) => {
            element.classList.toggle("is-pressed", held.has(element.dataset.pad));
        });
        const names = { up: "Up", down: "Down", left: "Left", right: "Right", a: "A", b: "B", l: "L", r: "R", start: "Start", select: "Select", menu: "Menu" };
        const text = held.size ? `Pressed: ${[...held].map((action) => names[action]).join(", ")}` : "";
        if (this.status.textContent !== text) {
            this.status.textContent = text;
        }
    }
}
