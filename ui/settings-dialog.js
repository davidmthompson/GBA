/*
 Settings dialog with tabs: General, Controls (remapping), Touch, About.
 Shared by the library and the emulator page; game-only options are shown when
 options.inGame is set.
 */
import { RemapUI } from "../input/remap-ui.js";
import { applyUpdate, cachedGameIds, clearCachedGames, hasUpdate, storageEstimate, updateState } from "../pwa/register.js";

const TABS = [
    { id: "general", label: "General" },
    { id: "controls", label: "Controls" },
    { id: "touch", label: "Touch" },
    { id: "about", label: "About" }
];

function formatBytes(bytes) {
    if (!bytes) {
        return "0 MB";
    }
    return bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export class SettingsDialog {
    constructor(app, { inGame = false, onEditLayout = null } = {}) {
        this.app = app;
        this.inGame = inGame;
        this.onEditLayout = onEditLayout;
        this.dialog = document.createElement("dialog");
        this.dialog.className = "dialog dialog--wide";
        this.dialog.setAttribute("aria-labelledby", "settings-title");
        this.dialog.innerHTML = this.template();
        document.body.appendChild(this.dialog);

        this.remap = new RemapUI(this.dialog.querySelector("#panel-controls .remap-host"), {
            manager: app.manager,
            bindings: app.bindings,
            gamepad: app.gamepad,
            notify: (message) => app.toast(message)
        });
        this.bind();
        this.syncFromSettings();
        this.dialog.addEventListener("dialogclose", () => this.remap.cancel());
        this.dialog.addEventListener("dialogopen", () => this.refreshOffline());
        updateState.addEventListener("update", () => this.syncUpdate());
    }

    template() {
        const s = this.app.settings;
        const range = (id, label, key, min, max, step, format) => `
            <div class="field field--range">
                <label class="field__label" for="${id}">${label} <output id="${id}-out" for="${id}"></output></label>
                <input type="range" id="${id}" data-setting="${key}" data-format="${format}" min="${min}" max="${max}" step="${step}">
            </div>`;
        const toggle = (id, label, key, hint = "") => `
            <div class="field field--switch">
                <label class="switch" for="${id}">
                    <input type="checkbox" role="switch" id="${id}" data-setting="${key}">
                    <span class="switch__track" aria-hidden="true"></span>
                    <span class="switch__label">${label}${hint ? `<span class="field__hint">${hint}</span>` : ""}</span>
                </label>
            </div>`;
        const segmented = (label, key, options) => `
            <div class="field">
                <span class="field__label" id="seg-${key.replace(/\./g, "-")}">${label}</span>
                <div class="segmented" role="radiogroup" aria-labelledby="seg-${key.replace(/\./g, "-")}">
                    ${options.map(([value, text]) => `<button type="button" role="radio" class="segmented__option" data-setting="${key}" data-value="${value}">${text}</button>`).join("")}
                </div>
            </div>`;
        return `
            <div class="dialog__header">
                <h2 class="dialog__title" id="settings-title">Settings</h2>
                <button type="button" class="btn btn--icon btn--ghost" data-close aria-label="Close settings">✕</button>
            </div>
            <div class="tabs" role="tablist" aria-label="Settings sections">
                ${TABS.map((tab, index) => `<button type="button" role="tab" class="tabs__tab" id="tab-${tab.id}" aria-controls="panel-${tab.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-tab="${tab.id}">${tab.label}</button>`).join("")}
            </div>
            <div class="dialog__body" data-swipe-tabs>
                <section class="tabpanel" role="tabpanel" id="panel-general" aria-labelledby="tab-general">
                    <h3 class="section-title">Appearance</h3>
                    ${segmented("Theme", "theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]])}
                    ${toggle("set-hints", "Show button hints", "showHints")}
                    ${this.inGame ? `<h3 class="section-title">Sound</h3>${range("set-volume", "Volume", "volume", 0, 1, 0.05, "percent")}` : ""}
                    <h3 class="section-title">Controller</h3>
                    ${toggle("set-rumble", "Rumble", "rumble", "Vibrate the controller for feedback, where supported.")}
                    ${range("set-deadzone", "Stick dead zone", "deadZone", 0.05, 0.6, 0.05, "percent")}
                    ${range("set-trigger", "Trigger press threshold", "triggerThreshold", 0.1, 0.9, 0.05, "percent")}
                    <h3 class="section-title">Offline games</h3>
                    <p class="muted" id="offline-status" aria-live="polite">Games you play are saved for offline use.</p>
                    <button type="button" class="btn" id="offline-clear">Remove downloaded games</button>
                    <p class="field__hint">Your save files are kept.</p>
                </section>
                <section class="tabpanel" role="tabpanel" id="panel-controls" aria-labelledby="tab-controls" hidden>
                    <div class="remap-host"></div>
                </section>
                <section class="tabpanel" role="tabpanel" id="panel-touch" aria-labelledby="tab-touch" hidden>
                    ${segmented("Show touch controls", "touch.mode", [["auto", "Automatic"], ["always", "Always"], ["never", "Never"]])}
                    <p class="field__hint">Automatic shows them on touch screens and hides them when you use a controller or keyboard.</p>
                    ${segmented("Layout", "touch.handed", [["right", "Right-handed"], ["left", "Left-handed"]])}
                    ${range("set-touch-scale", "Button size", "touch.scale", 0.7, 1.5, 0.05, "percent")}
                    ${range("set-touch-opacity", "Opacity", "touch.opacity", 0.2, 1, 0.05, "percent")}
                    ${toggle("set-haptics", "Haptic feedback", "haptics", "Short vibration on each press, where supported.")}
                    <div class="button-row">
                        ${this.inGame ? `<button type="button" class="btn btn--primary" id="touch-edit">Move buttons…</button>` : `<p class="field__hint">Start a game to drag the buttons into place.</p>`}
                        <button type="button" class="btn" id="touch-reset">Reset positions</button>
                    </div>
                </section>
                <section class="tabpanel about" role="tabpanel" id="panel-about" aria-labelledby="tab-about" hidden>
                    <a class="about__logo" href="https://davidthompson.dev" target="_blank" rel="noopener" aria-label="David Thompson website">
                        <img class="only-light" src="icons/logo-black.png" alt="" width="397" height="186">
                        <img class="only-dark" src="icons/logo-white.png" alt="" width="397" height="186">
                    </a>
                    <p class="about__lead"><strong>GBA</strong> is a free Game Boy Advance player that runs in your browser and installs as an app.</p>
                    <p class="credit">Made by <a href="https://davidthompson.dev" target="_blank" rel="noopener">David Thompson</a>, photographer &amp; developer.</p>
                    <div class="button-row">
                        <button type="button" class="btn btn--primary" data-install hidden>Install app</button>
                        <button type="button" class="btn" id="about-update" hidden>Update available: reload</button>
                    </div>
                    <h3 class="section-title">Credits</h3>
                    <ul class="plain-list">
                        <li>Emulator core: IodineGBA by Grant Galitz (MIT licence)</li>
                        <li>Audio: XAudioJS by Grant Galitz</li>
                        <li>Original site and engine setup: Keyz</li>
                    </ul>
                    <p class="field__hint">Please only play games you own. Your saves are stored on this device.</p>
                </section>
            </div>`;
    }

    bind() {
        const dialog = this.dialog;
        const settings = this.app.settings;
        dialog.querySelector("[data-close]").addEventListener("click", () => this.app.dialogs.close(dialog));

        // Tabs: click, arrow-key / gamepad focus (automatic activation), and swipe.
        dialog.querySelectorAll("[role=tab]").forEach((tab) => {
            tab.addEventListener("click", () => this.selectTab(tab.dataset.tab));
            tab.addEventListener("focus", () => this.selectTab(tab.dataset.tab, false));
        });
        this.bindSwipe(dialog.querySelector("[data-swipe-tabs]"));

        dialog.addEventListener("input", (event) => {
            const input = event.target;
            if (input.dataset.setting && input.type === "range") {
                settings.set(input.dataset.setting, Number(input.value));
                this.syncOutputs();
            }
        });
        dialog.addEventListener("change", (event) => {
            const input = event.target;
            if (input.dataset.setting && input.type === "checkbox") {
                settings.set(input.dataset.setting, input.checked);
            }
        });
        dialog.addEventListener("click", (event) => {
            const option = event.target.closest(".segmented__option[data-setting]");
            if (option) {
                settings.set(option.dataset.setting, option.dataset.value);
            }
        });
        settings.addEventListener("change", () => this.syncFromSettings());

        dialog.querySelector("#touch-reset").addEventListener("click", () => {
            settings.set("touch.positions", { portrait: {}, landscape: {} });
            this.app.toast("Touch buttons moved back to their default positions");
        });
        const edit = dialog.querySelector("#touch-edit");
        if (edit && this.onEditLayout) {
            edit.addEventListener("click", () => {
                this.app.dialogs.closeAll();
                this.onEditLayout();
            });
        }
        dialog.querySelector("#about-update").addEventListener("click", applyUpdate);
        dialog.querySelector("#offline-clear").addEventListener("click", async (event) => {
            const button = event.currentTarget;
            if (!button.dataset.confirming) {
                button.dataset.confirming = "true";
                button.textContent = "Press again to remove";
                setTimeout(() => {
                    delete button.dataset.confirming;
                    button.textContent = "Remove downloaded games";
                }, 4000);
                return;
            }
            delete button.dataset.confirming;
            button.textContent = "Remove downloaded games";
            await clearCachedGames();
            this.app.toast("Downloaded games removed");
            this.refreshOffline();
            document.dispatchEvent(new CustomEvent("offlinegameschange"));
        });
        this.syncUpdate();
    }

    bindSwipe(area) {
        let start = null;
        area.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "touch" && !event.target.closest("input[type=range], .remap__listen")) {
                start = { x: event.clientX, y: event.clientY, time: event.timeStamp };
            }
        });
        area.addEventListener("pointerup", (event) => {
            if (!start) {
                return;
            }
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            const fast = event.timeStamp - start.time < 600;
            start = null;
            if (fast && Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) / 2) {
                const index = TABS.findIndex((tab) => tab.id === this.currentTab());
                const next = TABS[index + (dx < 0 ? 1 : -1)];
                if (next) {
                    this.selectTab(next.id);
                }
            }
        });
        area.addEventListener("pointercancel", () => {
            start = null;
        });
    }

    currentTab() {
        return this.dialog.querySelector("[role=tab][aria-selected=true]").dataset.tab;
    }

    selectTab(id, focus = true) {
        this.dialog.querySelectorAll("[role=tab]").forEach((tab) => {
            const selected = tab.dataset.tab === id;
            tab.setAttribute("aria-selected", String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected && focus && document.activeElement !== tab) {
                tab.focus({ preventScroll: true });
            }
        });
        this.dialog.querySelectorAll("[role=tabpanel]").forEach((panel) => {
            panel.hidden = panel.id !== `panel-${id}`;
        });
        if (id !== "controls") {
            this.remap.cancel();
        }
    }

    open(tab = "general") {
        this.selectTab(tab, false);
        this.app.dialogs.open(this.dialog, { focus: `#tab-${tab}` });
    }

    syncFromSettings() {
        const settings = this.app.settings;
        this.dialog.querySelectorAll("input[data-setting]").forEach((input) => {
            const value = settings.get(input.dataset.setting);
            if (input.type === "checkbox") {
                input.checked = !!value;
            }
            else if (document.activeElement !== input) {
                input.value = value;
            }
        });
        this.dialog.querySelectorAll(".segmented__option[data-setting]").forEach((option) => {
            option.setAttribute("aria-checked", String(settings.get(option.dataset.setting) === option.dataset.value));
        });
        this.syncOutputs();
    }

    syncOutputs() {
        this.dialog.querySelectorAll("input[type=range][data-setting]").forEach((input) => {
            const output = this.dialog.querySelector(`#${input.id}-out`);
            if (output) {
                output.textContent = `${Math.round(Number(input.value) * 100)}%`;
            }
        });
    }

    syncUpdate() {
        this.dialog.querySelector("#about-update").hidden = !hasUpdate();
    }

    async refreshOffline() {
        const status = this.dialog.querySelector("#offline-status");
        const [ids, estimate] = await Promise.all([cachedGameIds(), storageEstimate()]);
        const used = estimate && estimate.usage ? `, using about ${formatBytes(estimate.usage)} on this device` : "";
        status.textContent = ids.size
            ? `${ids.size} game${ids.size === 1 ? "" : "s"} available offline${used}.`
            : "Games you play are saved for offline use. None downloaded yet.";
    }
}
