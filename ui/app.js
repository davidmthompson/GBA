/*
 Shared start-up for both pages: settings, theme, the input layer (keyboard, pointer modality,
 gamepad, menu navigation), dialogs, the settings dialog, iOS install help and the service worker.
 */
import { InputManager } from "../input/actions.js";
import { BindingStore } from "../input/bindings.js";
import { GamepadInput } from "../input/gamepad.js";
import { attachKeyboard, attachPointerModality } from "../input/keyboard.js";
import { MenuNavigator } from "../input/menu-nav.js";
import { initInstall } from "../pwa/install.js";
import { registerServiceWorker } from "../pwa/register.js";
import { DialogStack } from "./dialogs.js";
import { SettingsDialog } from "./settings-dialog.js";
import { safeStorage, SettingsStore } from "./settings-store.js";
import { initTheme, nextTheme } from "./theme.js";
import { toast } from "./toast.js";

export function createApp({ inGame = false, onEditLayout = null, onDialogsEmpty = () => {}, onDialogOpen = () => {}, beforeReload = () => {} } = {}) {
    const storage = safeStorage();
    const settings = new SettingsStore(storage);
    initTheme(settings);

    const bindings = new BindingStore(storage);
    const manager = new InputManager(bindings);
    manager.setModality(window.matchMedia("(pointer: coarse)").matches ? "touch" : "mouse");
    attachKeyboard(manager);
    attachPointerModality(manager);

    const app = { settings, bindings, manager, toast: (message, icon) => toast(message, { icon }) };
    app.gamepad = new GamepadInput(manager, settings, { notify: (message, icon) => toast(message, { icon }) });

    app.nav = new MenuNavigator(manager, {
        getScope: () => app.dialogs.top() || document.querySelector("[data-nav-scope]") || document.body,
        onBack: () => {
            if (app.dialogs.isOpen()) {
                app.dialogs.close();
            }
        }
    });
    app.dialogs = new DialogStack(manager, app.nav, { onEmpty: onDialogsEmpty, onOpen: onDialogOpen });
    app.settingsDialog = new SettingsDialog(app, { inGame, onEditLayout });
    app.iosDialog = buildIOSDialog(app);

    // Theme toggle buttons: [data-theme-toggle] cycles System → Light → Dark.
    const syncThemeButtons = () => {
        const preference = settings.get("theme");
        const names = { system: "System theme", light: "Light theme", dark: "Dark theme" };
        const icons = { system: "◐", light: "☀", dark: "☾" };
        document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
            button.setAttribute("aria-label", `${names[preference]} (change theme)`);
            button.title = names[preference];
            button.querySelector("[data-theme-icon]").textContent = icons[preference];
        });
    };
    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-theme-toggle]")) {
            settings.set("theme", nextTheme(settings.get("theme")));
        }
        const opener = event.target.closest("[data-open-settings]");
        if (opener) {
            app.settingsDialog.open(opener.dataset.openSettings || "general");
        }
    });
    settings.addEventListener("change", syncThemeButtons);
    syncThemeButtons();

    // Resume audio contexts on the first gesture (autoplay policies keep them suspended).
    const unlockAudio = () => {
        const context = window.XAudioJSWebAudioContextHandle;
        if (context && context.state === "suspended") {
            context.resume().catch(() => {});
        }
    };
    window.addEventListener("pointerdown", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    manager.addEventListener("actiondown", unlockAudio);

    initInstall({ openIOSHelp: () => app.dialogs.open(app.iosDialog) });
    registerServiceWorker({ beforeReload });
    return app;
}

function buildIOSDialog(app) {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog";
    dialog.setAttribute("aria-labelledby", "ios-title");
    dialog.innerHTML = `
        <div class="dialog__header">
            <h2 class="dialog__title" id="ios-title">Install on iPhone or iPad</h2>
            <button type="button" class="btn btn--icon btn--ghost" data-close aria-label="Close">✕</button>
        </div>
        <div class="dialog__body">
            <ol class="steps">
                <li>Open this page in <strong>Safari</strong>.</li>
                <li>Tap the <strong>Share</strong> button <span class="ios-share" aria-hidden="true">⎙</span> in the toolbar.</li>
                <li>Scroll down and choose <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong>. GBA opens full screen from your Home Screen and works offline.</li>
            </ol>
            <button type="button" class="btn btn--primary" data-close data-nav-default>Got it</button>
        </div>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => app.dialogs.close(dialog)));
    return dialog;
}
