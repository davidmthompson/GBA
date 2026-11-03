/*
 "Install app" button.
 - Chromium browsers: uses the beforeinstallprompt event to show the native install dialog.
 - iOS / iPadOS Safari (no beforeinstallprompt): opens a sheet explaining Share → Add to Home Screen.
 Any element with [data-install] is shown when installing is possible and hidden otherwise.
 */
let deferredPrompt = null;

export function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
}

export function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function setVisible(visible) {
    document.querySelectorAll("[data-install]").forEach((element) => {
        element.hidden = !visible;
    });
}

export function initInstall({ openIOSHelp }) {
    setVisible(false);
    if (isStandalone()) {
        return;
    }
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event;
        setVisible(true);
    });
    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        setVisible(false);
    });
    if (isIOS()) {
        setVisible(true);
    }
    document.addEventListener("click", async (event) => {
        if (!event.target.closest("[data-install]")) {
            return;
        }
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            deferredPrompt = null;
            if (choice.outcome === "accepted") {
                setVisible(false);
            }
        }
        else if (isIOS()) {
            openIOSHelp();
        }
    });
}
