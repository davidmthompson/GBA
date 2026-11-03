/*
 Emulator page (launcher.html): toolbar, pause menu, touch controls and the bridge from the
 input action layer to the emulator. The emulator itself is still started by
 user_scripts/IodineGBACoreGlueCode.js (window.onload).
 */
import { TouchOverlay } from "../input/touch-overlay.js";
import { createApp } from "./app.js";
import { HintsBar } from "./hints.js";

const gameId = decodeURIComponent(location.hash.slice(1));
const pauseMenu = document.getElementById("pause-menu");
const editorBar = document.getElementById("layout-editor");
let resumeOnClose = false;
let editingLayout = false;

const app = createApp({
    inGame: true,
    onEditLayout: () => startLayoutEdit(),
    onDialogOpen: () => pauseGame(),
    onDialogsEmpty: () => resumeGame()
});
const { manager, settings } = app;
manager.setMode("game");

// Emulator bridge: GBA buttons and hotkeys arrive as actions (IodineGBAJoyPadGlueCode.js).
window.attachJoyPadBridge(manager);

const overlay = new TouchOverlay(document.getElementById("touch-layer"), { manager, settings });
app.gamepad.addEventListener("connect", () => {
    overlay.autoVisible = false;
    overlay.updateVisibility();
});

// ---- Pause / resume ----

function pauseGame() {
    if (window.Iodine && !window.Iodine.paused) {
        window.gbaReleaseAll();
        window.Iodine.pause();
        resumeOnClose = true;
    }
    document.documentElement.classList.add("is-paused");
}

function resumeGame() {
    if (editingLayout) {
        return;
    }
    manager.setMode("game");
    document.documentElement.classList.remove("is-paused");
    if (resumeOnClose && window.Iodine) {
        window.Iodine.play();
    }
    resumeOnClose = false;
}

function openMenu() {
    app.dialogs.open(pauseMenu);
}

manager.addEventListener("actiondown", (event) => {
    const { action, repeat } = event.detail;
    if (repeat) {
        return;
    }
    if (editingLayout && (action === "menu" || action === "back")) {
        finishLayoutEdit();
        return;
    }
    if (action === "menu") {
        if (app.dialogs.isOpen()) {
            app.dialogs.close();
        }
        else {
            openMenu();
        }
    }
    else if (action === "volume_up" || action === "volume_down") {
        // The bridge already changed the volume; remember it and show it.
        requestAnimationFrame(() => {
            if (window.Iodine) {
                const volume = window.Iodine.settings.audioVolume;
                settings.set("volume", Math.round(volume * 100) / 100);
                app.toast(`Volume ${Math.round(volume * 100)}%`, "🔊");
            }
        });
    }
    else if (action === "speed_up" || action === "speed_down") {
        requestAnimationFrame(() => window.Iodine && app.toast(`Speed ${Math.round(window.Iodine.getSpeed() * 100)}%`, "⏩"));
    }
});

document.getElementById("menu-button").addEventListener("click", openMenu);

// ---- Pause menu actions ----

pauseMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-menu]");
    if (!button) {
        return;
    }
    switch (button.dataset.menu) {
        case "resume":
            app.dialogs.close(pauseMenu);
            break;
        case "save":
            window.ExportSave();
            app.toast("Game saved on this device", "💾");
            break;
        case "settings":
            app.settingsDialog.open("general");
            break;
        case "controls":
            app.settingsDialog.open("controls");
            break;
        case "layout":
            app.dialogs.closeAll();
            startLayoutEdit();
            break;
        case "fullscreen":
            toggleFullscreen();
            break;
    }
});

function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    else {
        document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => app.toast("Full screen is not available here"));
    }
}
const fullscreenButton = pauseMenu.querySelector("[data-menu=fullscreen]");
fullscreenButton.hidden = !document.fullscreenEnabled;
document.addEventListener("fullscreenchange", () => {
    fullscreenButton.querySelector("span:last-child").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
});

// ---- Touch layout editor ----

function startLayoutEdit() {
    editingLayout = true;
    pauseGame();
    manager.setMode("menu");
    overlay.setEditing(true);
    editorBar.hidden = false;
    editorBar.setAttribute("data-nav-scope", "");
    editorBar.querySelector("[data-editor=done]").focus();
}

function finishLayoutEdit() {
    editingLayout = false;
    overlay.setEditing(false);
    editorBar.hidden = true;
    editorBar.removeAttribute("data-nav-scope");
    app.toast("Touch layout saved");
    resumeGame();
}

editorBar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-editor]");
    if (!button) {
        return;
    }
    if (button.dataset.editor === "done") {
        finishLayoutEdit();
    }
    else if (button.dataset.editor === "reset") {
        overlay.resetLayout();
    }
    else if (button.dataset.editor === "hand") {
        settings.set("touch.handed", settings.get("touch.handed") === "left" ? "right" : "left");
    }
});

// ---- Emulator settings ----

settings.addEventListener("change", (event) => {
    if (event.detail.key === "volume" && window.Iodine) {
        window.Iodine.changeVolume(event.detail.value);
    }
});
window.addEventListener("load", () => {
    // Runs after the glue code's window.onload has created the emulator.
    if (window.Iodine) {
        window.Iodine.changeVolume(settings.get("volume"));
    }
});

// ---- Page chrome ----

const title = (window.games && window.games[gameId]) || "Game not found";
document.getElementById("game-title").textContent = title;
document.title = `${title} · GBA`;
window.addEventListener("hashchange", () => location.reload());

// Block browser gestures that interfere with play (long-press menu, pinch, double-tap zoom).
document.getElementById("stage").addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("gesturestart", (event) => event.preventDefault());

// One-time tip for small portrait screens.
overlay.addEventListener("visibility", (event) => {
    try {
        if (event.detail.visible && window.matchMedia("(orientation: portrait) and (max-width: 520px)").matches && !sessionStorage.getItem("gba.rotateTip")) {
            sessionStorage.setItem("gba.rotateTip", "1");
            app.toast("Tip: turn your phone sideways for a bigger screen", "📱");
        }
    }
    catch (error) {
        // sessionStorage unavailable: skip the tip.
    }
});
overlay.updateVisibility();

new HintsBar(document.getElementById("hints"), app, () => (manager.mode === "game"
    ? [{ action: "menu", label: "Menu" }]
    : [{ action: "confirm", label: "Select" }, { action: "back", label: "Back" }, { action: "menu", label: "Resume" }]));
