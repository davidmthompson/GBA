/*
 Controls screen: one row per action with its keyboard and gamepad bindings as glyph chips.
 Fully usable with mouse, touch, keyboard or gamepad.

   action name - select it to rebind: listen for one key OR button and make it the only
                 binding for that device
   +           - listen for an extra binding on that device (multiple bindings per action)
   chip (×)    - remove that binding
   ↺           - reset that action to its defaults
 While listening (a large overlay with a countdown ring): Esc cancels, holding the gamepad's
 B/○ (button 1) for a moment cancels, and it times out after LISTEN_TIMEOUT. A binding already
 used by another action shows an inline banner on that row offering Swap or Cancel.
 */
import { ACTIONS, ACTION_MAP } from "./actions.js";
import { ALL_PROFILES } from "./bindings.js";
import { applyIcons } from "../ui/icons.js";
import { bindingLabel, controllerFamily, controllerName, spokenLabel } from "./glyphs.js";

const LISTEN_TIMEOUT = 5000;
const CANCEL_HOLD = 800;
const RING = 2 * Math.PI * 52;

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
        this.conflict = null;      // { actionId, device, binding, mode, conflicts }
        this.confirmReset = false;
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
        if (this.listening) {
            return;
        }
        const focusKey = document.activeElement && this.container.contains(document.activeElement) ? document.activeElement.dataset.key : null;
        const family = this.family();
        const pads = this.gamepad.connected();
        const saved = this.bindings.profiles().filter((id) => !pads.some((pad) => pad.id === id));
        const profiles = [{ id: ALL_PROFILES, name: "All controllers" }]
            .concat(pads.map((pad) => ({ id: pad.id, name: controllerName(pad) })))
            .concat(saved.map((id) => ({ id, name: `${controllerName({ id })} (saved)` })));
        const groups = [...new Set(ACTIONS.map((action) => action.group))];

        const chip = (device, action, binding) => {
            const label = bindingLabel(device, binding, family);
            return `<button type="button" class="chip bind-chip bind-chip--${device === "gamepad" ? family : "key"}" data-glyph="${escapeHtml(label)}" data-op="remove" data-device="${device}" data-action="${action.id}" data-binding="${escapeHtml(binding)}" data-key="rm-${device}-${action.id}-${escapeHtml(binding)}" aria-label="Remove ${escapeHtml(spokenLabel(label))} from ${escapeHtml(action.label)}"><span class="bind-chip__label">${escapeHtml(label)}</span><span class="chip__x" aria-hidden="true">×</span></button>`;
        };
        const cell = (device, action) => {
            const list = this.bindings.get(device, action.id, this.profile);
            const deviceName = device === "keyboard" ? "key" : "button";
            return `<div class="remap__cell" role="group" aria-label="${device === "keyboard" ? "Keyboard" : "Controller"} bindings for ${escapeHtml(action.label)}">
                <span class="remap__device" data-icon="${device === "keyboard" ? "keyboard" : "gamepad"}" title="${device === "keyboard" ? "Keyboard" : "Controller"}"></span>
                ${list.length ? list.map((binding) => chip(device, action, binding)).join("") : `<span class="remap__none">None</span>`}
                <button type="button" class="chip chip--add" data-op="add" data-device="${device}" data-action="${action.id}" data-key="add-${device}-${action.id}" aria-label="Add a ${deviceName} for ${escapeHtml(action.label)}">+</button>
            </div>`;
        };
        const conflictBanner = (action) => {
            const conflict = this.conflict;
            if (!conflict || conflict.actionId !== action.id) {
                return "";
            }
            const label = bindingLabel(conflict.device, conflict.binding, family);
            const names = conflict.conflicts.map((id) => ACTION_MAP[id].label).join(", ");
            return `<li class="remap__conflict" role="alert">
                <p><strong>${escapeHtml(label)}</strong> is already used by <strong>${escapeHtml(names)}</strong>. Swap them? ${escapeHtml(names)} will get ${escapeHtml(action.label)}'s current binding.</p>
                <div class="remap__conflict-actions">
                    <button type="button" class="btn btn--small btn--primary" data-op="swap" data-key="swap" data-nav-default>Swap</button>
                    <button type="button" class="btn btn--small" data-op="conflict-cancel" data-key="conflict-cancel">Cancel</button>
                </div>
            </li>`;
        };

        this.container.innerHTML = `
            ${profiles.length > 2 || saved.length ? `
                <div class="setting remap__profiles">
                    <div class="setting__text">
                        <span class="setting__label" id="remap-profile-label">Controller</span>
                        <p class="setting__hint">Bindings for one controller override "All controllers".</p>
                    </div>
                    <div class="segmented" role="radiogroup" aria-labelledby="remap-profile-label">
                        ${profiles.map((profile) => `<button type="button" role="radio" class="segmented__option" data-op="profile" data-profile="${escapeHtml(profile.id)}" data-key="profile-${escapeHtml(profile.id)}" aria-checked="${profile.id === this.profile}">${escapeHtml(profile.name)}</button>`).join("")}
                    </div>
                </div>` : ""}
            <div class="remap__columns" aria-hidden="true"><span>Action</span><span>Keyboard</span><span>Controller</span><span></span></div>
            ${groups.map((group) => `
                <section class="remap__group" aria-label="${escapeHtml(group)}">
                    <h4 class="remap__heading">${escapeHtml(group)}</h4>
                    <ul class="remap__list" role="list">
                        ${ACTIONS.filter((action) => action.group === group).map((action) => `
                            <li class="remap__row${this.bindings.isCustom("keyboard", action.id) || this.bindings.isCustom("gamepad", action.id, this.profile) ? " remap__row--custom" : ""}${this.conflict && this.conflict.actionId === action.id ? " remap__row--conflict" : ""}">
                                <button type="button" class="remap__action" data-op="rebind" data-action="${action.id}" data-key="rebind-${action.id}" aria-label="Rebind ${escapeHtml(action.label)}">
                                    <span class="remap__action-name">${escapeHtml(action.label)}</span>
                                    <span class="remap__action-hint" aria-hidden="true">Change</span>
                                </button>
                                ${cell("keyboard", action)}
                                ${cell("gamepad", action)}
                                <button type="button" class="btn btn--icon btn--ghost remap__reset" data-op="reset" data-action="${action.id}" data-key="reset-${action.id}" aria-label="Reset ${escapeHtml(action.label)} to default" title="Reset to default"><span data-icon="reset"></span></button>
                            </li>
                            ${conflictBanner(action)}`).join("")}
                    </ul>
                </section>`).join("")}
            <div class="remap__footer">
                ${this.confirmReset ? `
                    <div class="remap__confirm" role="alert">
                        <p>Reset every control${this.profile === ALL_PROFILES ? "" : " for this controller"} to its default?</p>
                        <div class="remap__conflict-actions">
                            <button type="button" class="btn btn--small btn--primary" data-op="reset-all-yes" data-key="reset-all-yes">Reset all</button>
                            <button type="button" class="btn btn--small" data-op="reset-all-no" data-key="reset-all-no">Cancel</button>
                        </div>
                    </div>` : `<button type="button" class="btn" data-op="reset-all" data-key="reset-all"><span data-icon="reset"></span>Reset all to defaults</button>`}
            </div>
            <div class="remap__listen" role="alertdialog" aria-modal="true" aria-labelledby="remap-listen-title" aria-describedby="remap-listen-text" hidden>
                <div class="remap__listen-card">
                    <div class="remap__ring" aria-hidden="true">
                        <svg viewBox="0 0 120 120"><circle class="remap__ring-track" cx="60" cy="60" r="52"/><circle class="remap__ring-bar" cx="60" cy="60" r="52" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
                        <span class="remap__ring-count"></span>
                    </div>
                    <p class="remap__listen-eyebrow"></p>
                    <h3 id="remap-listen-title" class="remap__listen-title"></h3>
                    <p id="remap-listen-text" class="remap__listen-text"></p>
                    <div class="remap__listen-actions"></div>
                </div>
            </div>`;
        applyIcons(this.container);

        const target = focusKey && this.container.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
        const preferred = this.conflict ? this.container.querySelector("[data-op=swap]") : this.confirmReset ? this.container.querySelector("[data-op=reset-all-yes]") : null;
        (preferred && (this.pendingFocus || !target) ? preferred : target)?.focus({ preventScroll: true });
        this.pendingFocus = false;
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
                this.conflict = null;
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
                this.confirmReset = true;
                this.pendingFocus = true;
                this.render();
                break;
            case "reset-all-yes":
                this.confirmReset = false;
                this.bindings.resetAll(null, this.profile === ALL_PROFILES ? null : this.profile);
                this.notify("All controls reset to defaults");
                this.container.querySelector("[data-op=reset-all]")?.focus({ preventScroll: true });
                break;
            case "reset-all-no":
                this.confirmReset = false;
                this.render();
                this.container.querySelector("[data-op=reset-all]")?.focus({ preventScroll: true });
                break;
            case "listen-cancel":
                this.stopListening("Cancelled");
                break;
            case "swap":
                this.resolveConflict(true);
                break;
            case "conflict-cancel":
                this.resolveConflict(false);
                break;
        }
    }

    // Enters the "press a key or button…" state.
    listen(actionId, { device, mode }) {
        const action = ACTION_MAP[actionId];
        const panel = this.container.querySelector(".remap__listen");
        const returnFocus = document.activeElement;
        const what = device === "keyboard" ? "a key" : device === "gamepad" ? "a button" : "a key or button";
        this.conflict = null;
        panel.hidden = false;
        this.setBackgroundInert(true);
        panel.querySelector(".remap__listen-eyebrow").textContent = mode === "add" ? `Add ${device === "keyboard" ? "a key" : "a button"}` : "Rebind";
        panel.querySelector(".remap__listen-title").textContent = action.label;
        panel.querySelector(".remap__listen-text").textContent = `Press ${what}…`;
        panel.querySelector(".remap__listen-actions").innerHTML = `
            <button type="button" class="btn" data-op="listen-cancel" data-nav-default>Cancel</button>
            <p class="remap__listen-hint"><kbd class="glyph glyph--key">Esc</kbd> or hold <kbd class="glyph glyph--${this.gamepad.family()}" data-glyph="${escapeHtml(bindingLabel("gamepad", "b1", this.gamepad.family()))}">${escapeHtml(bindingLabel("gamepad", "b1", this.gamepad.family()))}</kbd> to cancel</p>`;
        panel.querySelector("[data-op=listen-cancel]").focus();

        const state = { actionId, device, mode, returnFocus, cancelHold: null, started: performance.now() };
        state.timer = setTimeout(() => this.stopListening("Timed out, nothing changed"), LISTEN_TIMEOUT);
        this.listening = state;
        this.countdown();

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

    // Countdown ring and seconds left. Under reduced motion only the number changes.
    countdown() {
        const state = this.listening;
        if (!state) {
            return;
        }
        const panel = this.container.querySelector(".remap__listen");
        const left = Math.max(0, LISTEN_TIMEOUT - (performance.now() - state.started));
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        panel.querySelector(".remap__ring-bar").setAttribute("stroke-dashoffset", String(reduced ? 0 : RING * (1 - left / LISTEN_TIMEOUT)));
        panel.querySelector(".remap__ring-count").textContent = String(Math.ceil(left / 1000));
        state.frame = requestAnimationFrame(() => this.countdown());
    }

    capturePress(press) {
        const state = this.listening;
        if (!state) {
            return;
        }
        const { actionId, mode } = state;
        const pending = { device: press.device, binding: press.binding };
        const profile = pending.device === "gamepad" ? this.profile : ALL_PROFILES;
        const result = this.bindings.assign(pending.device, actionId, pending.binding, { mode, swap: false, profile });
        if (!result.ok) {
            // Conflict: close the overlay and ask inline on the row.
            this.conflict = { actionId, mode, ...pending, conflicts: result.conflicts };
            this.stopListening(null, false);
            this.pendingFocus = true;
            this.render();
            return;
        }
        this.gamepad.rumble(0.3, 80);
        this.stopListening(`${bindingLabel(pending.device, pending.binding, this.family())} → ${ACTION_MAP[actionId].label}`);
    }

    resolveConflict(swap) {
        const conflict = this.conflict;
        this.conflict = null;
        if (!conflict) {
            return;
        }
        if (swap) {
            const profile = conflict.device === "gamepad" ? this.profile : ALL_PROFILES;
            const result = this.bindings.assign(conflict.device, conflict.actionId, conflict.binding, { mode: conflict.mode, swap: true, profile });
            this.gamepad.rumble(0.3, 80);
            this.notify(`${bindingLabel(conflict.device, conflict.binding, this.family())} → ${ACTION_MAP[conflict.actionId].label} (swapped with ${result.swapped.map((id) => ACTION_MAP[id].label).join(", ")})`);
        }
        else {
            this.notify("Nothing changed");
            this.render();
        }
        this.container.querySelector(`[data-key="rebind-${conflict.actionId}"]`)?.focus({ preventScroll: true });
    }

    stopListening(message, restoreFocus = true) {
        const state = this.listening;
        if (!state) {
            return;
        }
        clearTimeout(state.timer);
        clearTimeout(state.cancelHold);
        cancelAnimationFrame(state.frame);
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
        // Bindings may have changed while the overlay blocked re-rendering.
        this.render();
        if (restoreFocus) {
            const again = state.returnFocus && state.returnFocus.dataset && this.container.querySelector(`[data-key="${CSS.escape(state.returnFocus.dataset.key || "")}"]`);
            (again || this.container.querySelector("[data-op=rebind]"))?.focus({ preventScroll: true });
        }
    }

    // Keeps focus (and gamepad navigation) inside the listening panel.
    setBackgroundInert(inert) {
        for (const child of this.container.children) {
            if (!child.classList.contains("remap__listen")) {
                child.inert = inert;
            }
        }
        // The rest of the settings dialog too.
        const dialog = this.container.closest("dialog");
        if (dialog) {
            dialog.querySelectorAll(".settings__rail, .settings__header, .settings-panel > :not(.settings-section:has(.remap))").forEach((element) => {
                element.inert = inert;
            });
        }
    }

    // Called by the settings dialog when it closes mid-listen.
    cancel() {
        this.stopListening(null, false);
        if (this.conflict || this.confirmReset) {
            this.conflict = null;
            this.confirmReset = false;
            this.render();
        }
    }
}
