/*
 Settings dialog: a side tab rail (top tabs on phones) with Controls, Touch, Audio & Video,
 Gameplay and About, and a footer of button hints. Shared by the library and the emulator page;
 game-only options are shown when options.inGame is set.

 Controller navigation: up/down moves between rows, left/right changes sliders, switches and
 choices, A activates, B backs out, L/R (Q/E on a keyboard) switch tabs.
 */
import { PadDiagram } from "../input/pad-diagram.js";
import { RemapUI } from "../input/remap-ui.js";
import { applyUpdate, cachedGameIds, clearCachedGames, hasUpdate, storageEstimate, updateState } from "../pwa/register.js";
import { HintsBar } from "./hints.js";
import { applyIcons } from "./icons.js";

const TABS = [
    { id: "controls", label: "Controls", icon: "gamepad" },
    { id: "touch", label: "Touch", icon: "touch" },
    { id: "av", label: "Audio & Video", icon: "audio" },
    { id: "gameplay", label: "Gameplay", icon: "sliders" },
    { id: "about", label: "About", icon: "info" }
];

// Older tab names used by links and the pause menu.
const TAB_ALIASES = { general: "av" };

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
        this.frame = 0;
        this.dialog = document.createElement("dialog");
        this.dialog.className = "dialog dialog--settings";
        this.dialog.setAttribute("aria-labelledby", "settings-title");
        this.dialog.innerHTML = this.template();
        document.body.appendChild(this.dialog);
        applyIcons(this.dialog);

        this.remap = new RemapUI(this.dialog.querySelector("#panel-controls .remap-host"), {
            manager: app.manager,
            bindings: app.bindings,
            gamepad: app.gamepad,
            notify: (message) => app.toast(message)
        });
        this.diagram = new PadDiagram(this.dialog.querySelector("#pad-diagram"), {
            manager: app.manager,
            bindings: app.bindings,
            gamepad: app.gamepad,
            settings: app.settings,
            getProfile: () => this.remap.profile
        });
        new HintsBar(this.dialog.querySelector("#settings-hints"), app, () => [
            { actions: ["up", "down"], label: "Move" },
            { action: "confirm", label: "Select" },
            { action: "back", label: "Back" },
            { actions: ["prev_tab", "next_tab"], label: "Tab" }
        ]);
        this.loop = this.loop.bind(this);
        this.bind();
        this.syncFromSettings();
        this.dialog.addEventListener("dialogclose", () => {
            this.remap.cancel();
            this.stopLive();
        });
        this.dialog.addEventListener("dialogopen", () => {
            this.refreshOffline();
            this.startLive();
        });
        updateState.addEventListener("update", () => this.syncUpdate());
    }

    template() {
        const range = (id, label, key, min, max, step, hint = "", extra = "") => `
            <div class="setting setting--range">
                <div class="setting__text">
                    <label class="setting__label" for="${id}">${label}</label>
                    ${hint ? `<p class="setting__hint" id="${id}-hint">${hint}</p>` : ""}
                </div>
                <div class="setting__control">
                    <input type="range" id="${id}" data-setting="${key}" min="${min}" max="${max}" step="${step}"${hint ? ` aria-describedby="${id}-hint"` : ""}>
                    <output class="setting__value" id="${id}-out" for="${id}"></output>
                </div>
                ${extra}
            </div>`;
        const toggle = (id, label, key, hint = "", extra = "") => `
            <div class="setting setting--switch">
                <label class="switch" for="${id}">
                    <span class="setting__text">
                        <span class="setting__label">${label}</span>
                        ${hint ? `<span class="setting__hint">${hint}</span>` : ""}
                    </span>
                    <input type="checkbox" role="switch" id="${id}" data-setting="${key}">
                    <span class="switch__track" aria-hidden="true"></span>
                </label>
                ${extra}
            </div>`;
        const segmented = (label, key, options, hint = "") => `
            <div class="setting">
                <div class="setting__text">
                    <span class="setting__label" id="seg-${key.replace(/\./g, "-")}">${label}</span>
                    ${hint ? `<p class="setting__hint">${hint}</p>` : ""}
                </div>
                <div class="segmented" role="radiogroup" aria-labelledby="seg-${key.replace(/\./g, "-")}">
                    ${options.map(([value, text]) => `<button type="button" role="radio" class="segmented__option" data-setting="${key}" data-value="${value}">${text}</button>`).join("")}
                </div>
            </div>`;
        const section = (title, description, body) => `
            <section class="settings-section">
                <h3 class="settings-section__title">${title}</h3>
                ${description ? `<p class="settings-section__desc">${description}</p>` : ""}
                <div class="settings-section__body">${body}</div>
            </section>`;
        const panel = (id, body, extraClass = "") => `
            <section class="tabpanel settings-panel${extraClass}" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" tabindex="-1" hidden>
                <h2 class="settings-panel__title">${TABS.find((tab) => tab.id === id).label}</h2>
                ${body}
            </section>`;

        return `
            <div class="dialog__header settings__header">
                <h2 class="dialog__title" id="settings-title">Settings</h2>
                <button type="button" class="btn btn--icon btn--ghost" data-close aria-label="Close settings"><span data-icon="close"></span></button>
            </div>
            <div class="settings__layout">
                <div class="settings__rail" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
                    ${TABS.map((tab, index) => `<button type="button" role="tab" class="rail-tab" id="tab-${tab.id}" aria-controls="panel-${tab.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-tab="${tab.id}"><span class="rail-tab__icon" data-icon="${tab.icon}"></span><span class="rail-tab__label">${tab.label}</span></button>`).join("")}
                </div>
                <div class="settings__content" data-swipe-tabs>
                    ${panel("controls", `
                        ${section("Test your controls", "Press any key or button. The matching GBA button lights up.", `<div id="pad-diagram"></div>`)}
                        ${section("Button mapping", "Select an action to change its button, use + to add another, or select a binding to remove it.", `<div class="remap-host"></div>`)}
                    `)}
                    ${panel("touch", `
                        ${section("On-screen controls", "", `
                            ${segmented("Show touch controls", "touch.mode", [["auto", "Automatic"], ["always", "Always"], ["never", "Never"]], "Automatic shows them on touch screens and hides them when you use a controller or keyboard.")}
                            ${segmented("Layout", "touch.handed", [["right", "Right-handed"], ["left", "Left-handed"]])}
                            ${range("set-touch-scale", "Button size", "touch.scale", 0.7, 1.5, 0.05)}
                            ${range("set-touch-opacity", "Opacity", "touch.opacity", 0.2, 1, 0.05)}
                            ${toggle("set-haptics", "Haptic feedback", "haptics", "Short vibration on each press, where supported.")}
                        `)}
                        ${section("Button positions", this.inGame ? "Drag the buttons where your thumbs rest." : "Start a game to drag the buttons into place.", `
                            <div class="button-row">
                                ${this.inGame ? `<button type="button" class="btn btn--primary" id="touch-edit">Move buttons…</button>` : ""}
                                <button type="button" class="btn" id="touch-reset">Reset positions</button>
                            </div>
                        `)}
                    `)}
                    ${panel("av", `
                        ${section("Appearance", "", segmented("Theme", "theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]]))}
                        ${section("Sound", "", this.inGame ? range("set-volume", "Volume", "volume", 0, 1, 0.05) : `<p class="setting__hint">Volume is available from the pause menu while a game is running.</p>`)}
                    `)}
                    ${panel("gameplay", `
                        ${section("Controller", "Tune how your controller feels.", `
                            ${range("set-deadzone", "Stick dead zone", "deadZone", 0.05, 0.6, 0.05, "Movement inside the inner circle is ignored. Raise it if the cursor drifts.", `
                                <div class="meter meter--stick" aria-hidden="true">
                                    <svg viewBox="0 0 100 100"><circle class="meter__ring" cx="50" cy="50" r="46"/><circle class="meter__zone" cx="50" cy="50" r="12"/><line class="meter__axis" x1="4" y1="50" x2="96" y2="50"/><line class="meter__axis" x1="50" y1="4" x2="50" y2="96"/><circle class="meter__dot" cx="50" cy="50" r="6"/></svg>
                                    <span class="meter__caption">Left stick</span>
                                </div>`)}
                            ${range("set-trigger", "Trigger press threshold", "triggerThreshold", 0.1, 0.9, 0.05, "How far a trigger must be pulled to count as a press.", `
                                <div class="meter meter--trigger" aria-hidden="true">
                                    <span class="meter__track"><span class="meter__fill"></span><span class="meter__mark"></span></span>
                                    <span class="meter__caption">Triggers</span>
                                </div>`)}
                            ${toggle("set-rumble", "Rumble", "rumble", "Vibrate the controller for feedback, where supported.", `<button type="button" class="btn btn--small" id="rumble-test"><span data-icon="rumble"></span>Test rumble</button>`)}
                            ${segmented("Menu repeat speed", "menuRepeat", [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]], "How fast the selection moves while you hold a direction.")}
                        `)}
                        ${section("Button hints", "", toggle("set-hints", "Show button hints", "showHints", "Shows the matching keys or buttons at the bottom of menus."))}
                        ${section("Offline games", "", `
                            <p class="setting__hint" id="offline-status" aria-live="polite">Games you play are saved for offline use.</p>
                            <div class="button-row">
                                <button type="button" class="btn" id="offline-clear">Remove downloaded games</button>
                            </div>
                            <p class="setting__hint">Your save files are kept.</p>
                        `)}
                    `)}
                    ${panel("about", `
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
                        ${section("Credits", "", `
                            <ul class="plain-list">
                                <li>Emulator core: IodineGBA by Grant Galitz (MIT licence)</li>
                                <li>Audio: XAudioJS by Grant Galitz</li>
                                <li>Box art: libretro-thumbnails</li>
                                <li>Original site and engine setup: Keyz</li>
                            </ul>
                            <p class="setting__hint">Please only play games you own. Your saves are stored on this device.</p>
                        `)}
                    `, " about")}
                </div>
            </div>
            <div class="settings__footer hints" id="settings-hints" hidden></div>`;
    }

    bind() {
        const dialog = this.dialog;
        const settings = this.app.settings;
        dialog.querySelector("[data-close]").addEventListener("click", () => this.app.dialogs.close(dialog));

        // Tabs: click, arrow-key / gamepad focus (automatic activation), L/R, and swipe.
        dialog.querySelectorAll("[role=tab]").forEach((tab) => {
            tab.addEventListener("click", () => this.selectTab(tab.dataset.tab));
            tab.addEventListener("focus", () => this.selectTab(tab.dataset.tab, false));
        });
        this.bindSwipe(dialog.querySelector("[data-swipe-tabs]"));
        this.app.manager.addEventListener("actiondown", (event) => {
            const { action, repeat } = event.detail;
            if ((action === "prev_tab" || action === "next_tab") && !repeat && this.app.dialogs.top() === dialog && !this.remap.listening) {
                this.stepTab(action === "next_tab" ? 1 : -1);
            }
        });

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

        dialog.querySelector("#rumble-test").addEventListener("click", () => {
            const pad = this.app.gamepad.lastPad;
            if (!pad) {
                this.app.toast("Connect a controller to test rumble", "🎮");
            }
            else if (!settings.get("rumble")) {
                this.app.toast("Turn rumble on first");
            }
            else if (!(pad.vibrationActuator && pad.vibrationActuator.playEffect)) {
                this.app.toast("This controller or browser doesn't support rumble");
            }
            else {
                this.app.gamepad.rumble(0.9, 450);
            }
        });
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
            if (event.pointerType === "touch" && !event.target.closest("input[type=range], .remap__listen, .remap__list")) {
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

    stepTab(step) {
        const index = TABS.findIndex((tab) => tab.id === this.currentTab());
        this.selectTab(TABS[(index + step + TABS.length) % TABS.length].id);
    }

    selectTab(id, focus = true) {
        id = TAB_ALIASES[id] || id;
        this.dialog.querySelectorAll("[role=tab]").forEach((tab) => {
            const selected = tab.dataset.tab === id;
            tab.setAttribute("aria-selected", String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected) {
                tab.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
            if (selected && focus && document.activeElement !== tab) {
                tab.focus({ preventScroll: true });
            }
        });
        this.dialog.querySelectorAll("[role=tabpanel]").forEach((panel) => {
            panel.hidden = panel.id !== `panel-${id}`;
        });
        this.dialog.querySelector(".settings__content").scrollTop = 0;
        if (id !== "controls") {
            this.remap.cancel();
        }
    }

    open(tab = "controls") {
        tab = TAB_ALIASES[tab] || tab;
        this.selectTab(tab, false);
        this.app.dialogs.open(this.dialog, { focus: `#tab-${tab}` });
    }

    // Live controller test and meters, only while the dialog is open.
    startLive() {
        this.diagram.start();
        if (!this.frame) {
            this.frame = requestAnimationFrame(this.loop);
        }
    }

    stopLive() {
        this.diagram.stop();
        cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    loop() {
        this.frame = requestAnimationFrame(this.loop);
        if (this.currentTab() !== "gameplay") {
            return;
        }
        const pad = this.app.gamepad.connected().find((each) => !this.app.gamepad.lastPad || each.index === this.app.gamepad.lastPad.index);
        const x = pad ? pad.axes[0] || 0 : 0;
        const y = pad ? pad.axes[1] || 0 : 0;
        const deadZone = this.app.settings.get("deadZone");
        const dot = this.dialog.querySelector(".meter__dot");
        dot.setAttribute("cx", String(50 + x * 40));
        dot.setAttribute("cy", String(50 + y * 40));
        dot.classList.toggle("is-active", Math.hypot(x, y) > deadZone);
        const value = (index) => {
            const button = pad && pad.buttons[index];
            return button ? (typeof button === "number" ? button : button.value) : 0;
        };
        const trigger = Math.max(value(6), value(7));
        const fill = this.dialog.querySelector(".meter__fill");
        fill.style.transform = `scaleX(${trigger})`;
        fill.classList.toggle("is-active", trigger > this.app.settings.get("triggerThreshold"));
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
        this.dialog.querySelector(".meter__zone").setAttribute("r", String(settings.get("deadZone") * 40));
        this.dialog.querySelector(".meter__mark").style.left = `${settings.get("triggerThreshold") * 100}%`;
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
