/*
 Controls screen: lists every action with its keyboard and gamepad bindings and lets the user
 rebind them. Fully usable with mouse, touch, keyboard or gamepad.

   Rebind  - listen for one key OR button and make it the only binding for that device
   +       - listen for an extra binding on that device (multiple bindings per action)
   chip    - activating a binding chip removes it
   ↺       - reset that action to its defaults
 While listening: Esc cancels, holding the gamepad's B/○ (button 1) for a moment cancels, and
 it times out after LISTEN_TIMEOUT. A binding already used by another action triggers a
 conflict prompt offering to swap.
 */
import { ACTIONS, ACTION_MAP } from "./actions.js";
import { ALL_PROFILES } from "./bindings.js";
import { bindingLabel, controllerFamily, controllerName, spokenLabel } from "./glyphs.js";

const LISTEN_TIMEOUT = 5000;
const CANCEL_HOLD = 800;

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export class RemapUI {
    constructor(container, { manager, bindings, gamepad, notify = () => {} }) {
        this.container = container;
        this.manager = manager;
        this.bindings = bindings;
        this.gamepad = gamepad;
        this.notify = notify;
        this.profile = ALL_PROFILES;
        this.listening = null;
        container.classList.add("remap");
        container.addEventListener("click", (event) => this.onClick(event));
        bindings.addEventListener("change", () => this.render());
        gamepad.addEventListener("connect", () => this.render());
        gamepad.addEventListener("disconnect", () => {
            if (this.profile !== ALL_PROFILES && !gamepad.connected().some((pad) => pad.id === this.profile)) {
                this.profile = ALL_PROFILES;
            }
            this.render();
        });
        this.render();
    }

    family() {
        if (this.profile !== ALL_PROFILES) {
            return controllerFamily({ id: this.profile });
        }
        return this.gamepad.family();
    }

    render() {
        const focusKey = document.activeElement && this.container.contains(document.activeElement) ? document.activeElement.dataset.key : null;
        const family = this.family();
        const pads = this.gamepad.connected();
        const profiles = [{ id: ALL_PROFILES, name: "All controllers" }]
            .concat(pads.map((pad) => ({ id: pad.id, name: controllerName(pad) })))
            .concat(this.bindings.profiles().filter((id) => !pads.some((pad) => pad.id === id)).map((id) => ({ id, name: `${controllerName({ id })} (saved)` })));
        const groups = [...new Set(ACTIONS.map((action) => action.group))];

        const chip = (device, action, binding) => {
            const label = bindingLabel(device, binding, family);
            return `<button type="button" class="chip" data-op="remove" data-device="${device}" data-action="${action.id}" data-binding="${escapeHtml(binding)}" data-key="rm-${device}-${action.id}-${escapeHtml(binding)}" aria-label="Remove ${escapeHtml(spokenLabel(label))} from ${escapeHtml(action.label)}"><span>${escapeHtml(label)}</span><span class="chip__x" aria-hidden="true">✕</span></button>`;
        };
        const cell = (device, action) => {
            const list = this.bindings.get(device, action.id, this.profile);
            const deviceName = device === "keyboard" ? "key" : "button";
            return `<div class="remap__cell" role="group" aria-label="${device === "keyboard" ? "Keyboard" : "Gamepad"} bindings for ${escapeHtml(action.label)}">
                <span class="remap__device" aria-hidden="true">${device === "keyboard" ? "⌨" : "🎮"}</span>
                ${list.length ? list.map((binding) => chip(device, action, binding)).join("") : `<span class="remap__none">None</span>`}
                <button type="button" class="chip chip--add" data-op="add" data-device="${device}" data-action="${action.id}" data-key="add-${device}-${action.id}" aria-label="Add a ${deviceName} for ${escapeHtml(action.label)}">+</button>
            </div>`;
        };

        this.container.innerHTML = `
            <div class="remap__intro">
                <p>Choose <strong>Rebind</strong> and press a key or controller button. Use <strong>+</strong> to add another binding, or select a binding to remove it.</p>
                <div class="field">
                    <span class="field__label" id="remap-profile-label">Controller bindings apply to</span>
                    <div class="segmented" role="radiogroup" aria-labelledby="remap-profile-label">
                        ${profiles.map((profile) => `<button type="button" role="radio" class="segmented__option" data-op="profile" data-profile="${escapeHtml(profile.id)}" data-key="profile-${escapeHtml(profile.id)}" aria-checked="${profile.id === this.profile}">${escapeHtml(profile.name)}</button>`).join("")}
                    </div>
                </div>
            </div>
            ${groups.map((group) => `
                <section class="remap__group" aria-label="${escapeHtml(group)}">
                    <h3 class="remap__heading">${escapeHtml(group)}</h3>
                    <ul class="remap__list" role="list">
                        ${ACTIONS.filter((action) => action.group === group).map((action) => `
                            <li class="remap__row${this.bindings.isCustom("keyboard", action.id) || this.bindings.isCustom("gamepad", action.id, this.profile) ? " remap__row--custom" : ""}">
                                <span class="remap__action">${escapeHtml(action.label)}</span>
                                ${cell("keyboard", action)}
                                ${cell("gamepad", action)}
                                <span class="remap__buttons">
                                    <button type="button" class="btn btn--small" data-op="rebind" data-action="${action.id}" data-key="rebind-${action.id}">Rebind</button>
                                    <button type="button" class="btn btn--small btn--icon btn--ghost" data-op="reset" data-action="${action.id}" data-key="reset-${action.id}" aria-label="Reset ${escapeHtml(action.label)} to default" title="Reset to default">↺</button>
                                </span>
                            </li>`).join("")}
                    </ul>
                </section>`).join("")}
            <div class="remap__footer">
                <button type="button" class="btn" data-op="reset-all" data-key="reset-all">Reset all to defaults</button>
            </div>
            <div class="remap__listen" role="alertdialog" aria-modal="true" aria-labelledby="remap-listen-title" aria-describedby="remap-listen-text" hidden>
                <div class="remap__listen-card">
                    <h3 id="remap-listen-title" class="remap__listen-title"></h3>
                    <p id="remap-listen-text" class="remap__listen-text"></p>
                    <div class="remap__listen-bar" aria-hidden="true"><span></span></div>
                    <div class="remap__listen-actions"></div>
                </div>
            </div>`;

        if (focusKey) {
            const again = this.container.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
            if (again) {
                again.focus({ preventScroll: true });
            }
        }
    }

    onClick(event) {
        const target = event.target.closest("[data-op]");
        if (!target || this.listening && !target.closest(".remap__listen")) {
            return;
        }
        const { op, device, action, binding } = target.dataset;
        switch (op) {
            case "profile":
                this.profile = target.dataset.profile;
                this.render();
                break;
            case "remove":
                this.bindings.remove(device, action, binding, device === "gamepad" ? this.profile : ALL_PROFILES);
                this.notify(`Removed ${bindingLabel(device, binding, this.family())} from ${ACTION_MAP[action].label}`);
                break;
            case "add":
                this.listen(action, { device, mode: "add" });
                break;
            case "rebind":
                this.listen(action, { device: null, mode: "replace" });
                break;
            case "reset":
                this.bindings.reset(action, null, this.profile);
                this.notify(`${ACTION_MAP[action].label} reset to default`);
                break;
            case "reset-all":
                if (target.dataset.confirming) {
                    this.bindings.resetAll(null, this.profile === ALL_PROFILES ? null : this.profile);
                    this.notify("All controls reset to defaults");
                }
                else {
                    // Two-step confirm without a modal: the second press resets.
                    target.dataset.confirming = "true";
                    target.textContent = "Press again to reset everything";
                    setTimeout(() => {
                        if (target.isConnected) {
                            delete target.dataset.confirming;
                            target.textContent = "Reset all to defaults";
                        }
                    }, 4000);
                }
                break;
            case "listen-cancel":
                this.stopListening("Cancelled");
                break;
            case "swap":
                this.applyBinding(this.listening.pending, true);
                break;
        }
    }

    // Enters the "press a key or button…" state.
    listen(actionId, { device, mode }) {
        const action = ACTION_MAP[actionId];
        const panel = this.container.querySelector(".remap__listen");
        const returnFocus = document.activeElement;
        const what = device === "keyboard" ? "a key" : device === "gamepad" ? "a controller button" : "a key or controller button";
        panel.hidden = false;
        this.setBackgroundInert(true);
        panel.querySelector(".remap__listen-title").textContent = `${mode === "add" ? "Add binding" : "Rebind"}: ${action.label}`;
        panel.querySelector(".remap__listen-text").textContent = `Press ${what}… (Esc or hold B/○ to cancel)`;
        panel.querySelector(".remap__listen-actions").innerHTML = `<button type="button" class="btn" data-op="listen-cancel" data-nav-default>Cancel</button>`;
        const bar = panel.querySelector(".remap__listen-bar span");
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = `remap-countdown ${LISTEN_TIMEOUT}ms linear forwards`;
        panel.querySelector("[data-op=listen-cancel]").focus();

        const state = { actionId, device, mode, returnFocus, cancelHold: null, pending: null };
        state.timer = setTimeout(() => this.stopListening("Timed out, nothing changed"), LISTEN_TIMEOUT);
        this.listening = state;

        this.manager.capture((press) => {
            if (press.device === "keyboard" && press.binding === "Escape" && press.phase === "down") {
                this.stopListening("Cancelled");
                return true;
            }
            if (device && press.device !== device) {
                return true;
            }
            if (press.repeat) {
                return true;
            }
            // Gamepad button 1 (B / ○): a short press binds it, a long hold cancels.
            if (press.device === "gamepad" && press.binding === "b1") {
                if (press.phase === "down") {
                    state.cancelHold = setTimeout(() => this.stopListening("Cancelled"), CANCEL_HOLD);
                }
                else if (state.cancelHold) {
                    clearTimeout(state.cancelHold);
                    this.capturePress(press);
                }
                return true;
            }
            if (press.phase === "down") {
                this.capturePress(press);
            }
            return true;
        });
    }

    capturePress(press) {
        const state = this.listening;
        if (!state) {
            return;
        }
        clearTimeout(state.timer);
        clearTimeout(state.cancelHold);
        this.manager.endCapture();
        state.pending = { device: press.device, binding: press.binding };
        this.applyBinding(state.pending, false);
    }

    applyBinding({ device, binding }, swap) {
        const state = this.listening;
        const profile = device === "gamepad" ? this.profile : ALL_PROFILES;
        const family = this.family();
        const result = this.bindings.assign(device, state.actionId, binding, { mode: state.mode, swap, profile });
        const label = bindingLabel(device, binding, family);
        if (!result.ok) {
            // Conflict: explain and offer a swap.
            const names = result.conflicts.map((id) => ACTION_MAP[id].label).join(", ");
            const panel = this.container.querySelector(".remap__listen");
            panel.querySelector(".remap__listen-bar span").style.animation = "none";
            panel.querySelector(".remap__listen-text").textContent = `${label} is already used by ${names}. Swap them? ${names} will get ${ACTION_MAP[state.actionId].label}'s current binding.`;
            panel.querySelector(".remap__listen-actions").innerHTML = `
                <button type="button" class="btn btn--primary" data-op="swap">Swap</button>
                <button type="button" class="btn" data-op="listen-cancel">Cancel</button>`;
            panel.querySelector("[data-op=swap]").focus();
            return;
        }
        this.gamepad.rumble(0.3, 80);
        this.stopListening(result.swapped.length
            ? `${label} → ${ACTION_MAP[state.actionId].label} (swapped with ${result.swapped.map((id) => ACTION_MAP[id].label).join(", ")})`
            : `${label} → ${ACTION_MAP[state.actionId].label}`);
    }

    stopListening(message) {
        const state = this.listening;
        if (!state) {
            return;
        }
        clearTimeout(state.timer);
        clearTimeout(state.cancelHold);
        this.manager.endCapture();
        this.listening = null;
        const panel = this.container.querySelector(".remap__listen");
        if (panel) {
            panel.hidden = true;
        }
        this.setBackgroundInert(false);
        if (message) {
            this.notify(message);
        }
        const again = state.returnFocus && state.returnFocus.dataset && this.container.querySelector(`[data-key="${CSS.escape(state.returnFocus.dataset.key || "")}"]`);
        (again || this.container.querySelector("[data-op=rebind]"))?.focus({ preventScroll: true });
    }

    // Keeps focus (and gamepad navigation) inside the listening panel.
    setBackgroundInert(inert) {
        for (const child of this.container.children) {
            if (!child.classList.contains("remap__listen")) {
                child.inert = inert;
            }
        }
    }

    // Called by the settings dialog when it closes mid-listen.
    cancel() {
        this.stopListening(null);
    }
}
