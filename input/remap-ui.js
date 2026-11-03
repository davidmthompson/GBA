/*
 Controls screen: one card per action, grouped (D-pad, Buttons, Shoulders, System, Emulator),
 with the keyboard bindings drawn as keycaps and the controller bindings as controller glyphs
 for the connected pad family. Fully usable with mouse, touch, keyboard or gamepad.

   action name - select it to rebind: listen for one key OR button and make it the only
                 binding for that device
   + Add cap   - listen for an extra binding on that device (multiple bindings per action)
   a cap       - remove that binding (a × shows on hover / focus)
   ↺           - reset that action to its defaults (shown only when it differs)
 While listening, the cap being edited pulses inside the row with "Press a key…" and a
 countdown ring: Esc cancels, holding the gamepad's B/○ (button 1) for a moment cancels, and it
 times out after LISTEN_TIMEOUT. A binding already used by another action shows an inline
 banner on that row offering Swap or Cancel.
 */
import { applyIcons } from "../ui/icons.js";
import { ACTIONS, ACTION_MAP } from "./actions.js";
import { ALL_PROFILES } from "./bindings.js";
import { bindingLabel, controllerFamily, controllerName, glyphShape, spokenLabel } from "./glyphs.js";

const LISTEN_TIMEOUT = 5000;
const CANCEL_HOLD = 800;
const RING = 2 * Math.PI * 9;

// Display groups for the Controls screen. Actions not listed here land in "System".
export const REMAP_GROUPS = [
    { id: "dpad", label: "D-pad", icon: "dpad", actions: ["up", "down", "left", "right"] },
    { id: "buttons", label: "Buttons", icon: "face", actions: ["a", "b"] },
    { id: "shoulders", label: "Shoulders", icon: "shoulder", actions: ["l", "r"] },
    { id: "system", label: "System", icon: "system", actions: ["start", "select", "menu", "confirm", "back", "prev_tab", "next_tab"] },
    { id: "emulator", label: "Emulator", icon: "gauge", actions: ["fast_forward", "speed_up", "speed_down", "volume_up", "volume_down"] }
];

export function remapGroups() {
    const listed = new Set(REMAP_GROUPS.flatMap((group) => group.actions));
    return REMAP_GROUPS.map((group) => ({
        ...group,
        actions: group.actions.concat(group.id === "system" ? ACTIONS.filter((action) => !listed.has(action.id)).map((action) => action.id) : [])
            .filter((id) => ACTION_MAP[id])
    }));
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

const ARROWS = { up: "M12 6l-5 6h10z", down: "M12 18l-5-6h10z", left: "M6 12l6-5v10z", right: "M18 12l-6-5v10z" };

// The visual for one binding: a keycap, a face button, a shoulder pill, a d-pad or a stick.
function glyphHtml(device, binding, family) {
    const label = bindingLabel(device, binding, family);
    const shape = glyphShape(device, binding);
    switch (shape.shape) {
        case "key":
            return `<span class="cap cap--key cap--${shape.size}"><span class="cap__text">${escapeHtml(label)}</span></span>`;
        case "face":
            // A generic pad has no printed letters: number the face buttons instead.
            return `<span class="cap cap--face cap--${family}" data-position="${shape.position}"><span class="cap__text">${escapeHtml(family === "generic" ? binding.slice(1) * 1 + 1 : label)}</span></span>`;
        case "shoulder":
            return `<span class="cap cap--shoulder"><span class="cap__text">${escapeHtml(label)}</span></span>`;
        case "dpad":
            return `<span class="cap cap--icon" title="${escapeHtml(label)}"><svg class="glyph-dpad" viewBox="0 0 24 24" aria-hidden="true">
                <path class="glyph-dpad__base" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>
                <path class="glyph-dpad__arm" d="${{ up: "M9 3h6v6H9z", down: "M9 15h6v6H9z", left: "M3 9h6v6H3z", right: "M15 9h6v6h-6z" }[shape.direction]}"/>
            </svg></span>`;
        case "stick":
            return `<span class="cap cap--icon" title="${escapeHtml(label)}"><svg class="glyph-stick" viewBox="0 0 24 24" aria-hidden="true">
                <circle class="glyph-stick__ring" cx="12" cy="12" r="9.5"/>
                <path class="glyph-stick__arrow" d="${ARROWS[shape.direction]}"/>
            </svg><span class="cap__sub">${shape.stick === "left" ? "L" : "R"}</span></span>`;
        default:
            return `<span class="cap cap--pill"><span class="cap__text">${escapeHtml(label)}</span></span>`;
    }
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
        const focusKey = document.activeElement && this.container.contains(document.activeElement) ? document.activeElement.dataset.key : null;
        const family = this.family();
        const pads = this.gamepad.connected();
        const saved = this.bindings.profiles().filter((id) => !pads.some((pad) => pad.id === id));
        const profiles = [{ id: ALL_PROFILES, name: "All controllers" }]
            .concat(pads.map((pad) => ({ id: pad.id, name: controllerName(pad) })))
            .concat(saved.map((id) => ({ id, name: `${controllerName({ id })} (saved)` })));
        const listening = this.listening;

        const cap = (device, action, binding) => {
            const label = bindingLabel(device, binding, family);
            return `<button type="button" class="bind" data-op="remove" data-device="${device}" data-action="${action.id}" data-binding="${escapeHtml(binding)}" data-key="rm-${device}-${action.id}-${escapeHtml(binding)}" aria-label="${escapeHtml(spokenLabel(label))}. Remove from ${escapeHtml(action.label)}">
                ${glyphHtml(device, binding, family)}<span class="bind__x" aria-hidden="true">×</span>
            </button>`;
        };
        const listenCap = (device) => `
            <span class="bind bind--listening" role="status">
                <svg class="bind__ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="bind__ring-track" cx="12" cy="12" r="9"/><circle class="bind__ring-bar" cx="12" cy="12" r="9" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
                <span class="bind__prompt">${device === "keyboard" ? "Press a key…" : "Press a button…"}</span>
            </span>`;
        const cell = (device, action) => {
            const list = this.bindings.get(device, action.id, this.profile);
            const deviceName = device === "keyboard" ? "key" : "button";
            const isListening = listening && listening.actionId === action.id && (!listening.device || listening.device === device);
            return `<div class="remap__cell" role="group" aria-label="${device === "keyboard" ? "Keyboard" : "Controller"} bindings for ${escapeHtml(action.label)}">
                <span class="remap__cell-label" aria-hidden="true">${device === "keyboard" ? "Keyboard" : "Controller"}</span>
                <div class="remap__caps">
                    ${isListening && listening.mode === "replace" ? "" : list.map((binding) => cap(device, action, binding)).join("")}
                    ${isListening ? listenCap(device) : `<button type="button" class="bind bind--add${list.length ? "" : " bind--empty"}" data-op="add" data-device="${device}" data-action="${action.id}" data-key="add-${device}-${action.id}" aria-label="Add a ${deviceName} for ${escapeHtml(action.label)}"><span class="cap cap--add">+${list.length ? "" : " Add"}</span></button>`}
                </div>
            </div>`;
        };
        const banner = (action) => {
            const conflict = this.conflict;
            if (!conflict || conflict.actionId !== action.id) {
                return "";
            }
            const label = bindingLabel(conflict.device, conflict.binding, family);
            const names = conflict.conflicts.map((id) => ACTION_MAP[id].label).join(", ");
            return `<div class="remap__conflict" role="alert">
                <p><strong>${escapeHtml(label)}</strong> is already used by <strong>${escapeHtml(names)}</strong>. Swap them? ${escapeHtml(names)} will get ${escapeHtml(action.label)}'s current binding.</p>
                <div class="remap__conflict-actions">
                    <button type="button" class="btn btn--small btn--primary" data-op="swap" data-key="swap">Swap</button>
                    <button type="button" class="btn btn--small" data-op="conflict-cancel" data-key="conflict-cancel">Cancel</button>
                </div>
            </div>`;
        };
        const row = (action) => {
            const custom = this.bindings.isCustom("keyboard", action.id) || this.bindings.isCustom("gamepad", action.id, this.profile);
            const isListening = listening && listening.actionId === action.id;
            return `<li class="remap__row${isListening ? " is-listening" : ""}${this.conflict && this.conflict.actionId === action.id ? " has-conflict" : ""}">
                <div class="remap__main">
                    <button type="button" class="remap__action" data-op="rebind" data-action="${action.id}" data-key="rebind-${action.id}" aria-label="Rebind ${escapeHtml(action.label)}"${listening ? " disabled" : ""}>
                        <span class="remap__action-name">${escapeHtml(action.label)}</span>
                        <span class="remap__action-hint${isListening || custom ? " is-shown" : ""}" aria-hidden="true">${isListening ? "Listening…" : custom ? "Changed" : "Select to rebind"}</span>
                    </button>
                    ${cell("keyboard", action)}
                    ${cell("gamepad", action)}
                    <div class="remap__end">
                        ${isListening
                            ? `<button type="button" class="btn btn--small" data-op="listen-cancel" data-key="listen-cancel">Cancel</button>`
                            : custom ? `<button type="button" class="btn btn--icon btn--ghost remap__reset" data-op="reset" data-action="${action.id}" data-key="reset-${action.id}" aria-label="Reset ${escapeHtml(action.label)} to default" title="Reset to default"><span data-icon="reset"></span></button>` : ""}
                    </div>
                </div>
                ${banner(action)}
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
            ${remapGroups().map((group) => `
                <section class="remap__group" aria-label="${escapeHtml(group.label)}">
                    <div class="remap__group-head">
                        <h4 class="remap__heading"><span class="remap__heading-icon" data-icon="${group.icon}"></span>${escapeHtml(group.label)}</h4>
                        <span class="remap__col-label" aria-hidden="true">Keyboard</span>
                        <span class="remap__col-label" aria-hidden="true">Controller</span>
                        <span></span>
                    </div>
                    <ul class="remap__list" role="list">${group.actions.map((id) => row(ACTION_MAP[id])).join("")}</ul>
                </section>`).join("")}
            <div class="remap__footer">
                ${this.confirmReset ? `
                    <div class="remap__confirm" role="alert">
                        <p>Reset every control${this.profile === ALL_PROFILES ? "" : " for this controller"} to its default?</p>
                        <div class="remap__conflict-actions">
                            <button type="button" class="btn btn--small btn--primary" data-op="reset-all-yes" data-key="reset-all-yes">Reset all</button>
                            <button type="button" class="btn btn--small" data-op="reset-all-no" data-key="reset-all-no">Cancel</button>
                        </div>
                    </div>` : `<button type="button" class="btn" data-op="reset-all" data-key="reset-all"${listening ? " disabled" : ""}><span data-icon="reset"></span>Reset all to defaults</button>`}
            </div>`;
        applyIcons(this.container);

        const target = focusKey && this.container.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
        const preferred = listening ? this.container.querySelector("[data-op=listen-cancel]")
            : this.conflict ? this.container.querySelector("[data-op=swap]")
            : this.confirmReset ? this.container.querySelector("[data-op=reset-all-yes]") : null;
        (preferred && (this.pendingFocus || !target) ? preferred : target)?.focus({ preventScroll: true });
        this.pendingFocus = false;
    }

    onClick(event) {
        const target = event.target.closest("[data-op]");
        if (!target || this.listening && target.dataset.op !== "listen-cancel") {
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
                this.container.querySelector(`[data-key="rebind-${action}"]`)?.focus({ preventScroll: true });
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

    // Enters the "press a key or button…" state inside the action's row.
    listen(actionId, { device, mode }) {
        const returnFocus = document.activeElement;
        this.conflict = null;
        const state = { actionId, device, mode, returnFocus, cancelHold: null, started: performance.now() };
        state.timer = setTimeout(() => this.stopListening("Timed out, nothing changed"), LISTEN_TIMEOUT);
        this.listening = state;
        this.pendingFocus = true;
        this.render();
        this.container.querySelector(".remap__row.is-listening")?.scrollIntoView({ block: "nearest" });
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

    // Countdown rings on the listening caps. Under reduced motion they stay full.
    countdown() {
        const state = this.listening;
        if (!state) {
            return;
        }
        const left = Math.max(0, LISTEN_TIMEOUT - (performance.now() - state.started));
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.container.querySelectorAll(".bind__ring-bar").forEach((ring) => {
            ring.setAttribute("stroke-dashoffset", String(reduced ? 0 : RING * (1 - left / LISTEN_TIMEOUT)));
        });
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
        // Leave listening first so the change event re-renders the normal row.
        this.stopListening(null, false);
        const result = this.bindings.assign(pending.device, actionId, pending.binding, { mode, swap: false, profile });
        if (!result.ok) {
            // Conflict: ask inline on the row.
            this.conflict = { actionId, mode, ...pending, conflicts: result.conflicts };
            this.pendingFocus = true;
            this.render();
            return;
        }
        this.gamepad.rumble(0.3, 80);
        this.notify(`${bindingLabel(pending.device, pending.binding, this.family())} → ${ACTION_MAP[actionId].label}`);
        this.container.querySelector(`[data-key="rebind-${actionId}"]`)?.focus({ preventScroll: true });
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
        this.render();
        if (message) {
            this.notify(message);
        }
        if (restoreFocus) {
            const again = state.returnFocus && state.returnFocus.dataset && this.container.querySelector(`[data-key="${CSS.escape(state.returnFocus.dataset.key || "")}"]`);
            (again || this.container.querySelector(`[data-key="rebind-${state.actionId}"]`))?.focus({ preventScroll: true });
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
