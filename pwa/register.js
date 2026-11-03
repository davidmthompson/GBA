/*
 Service worker registration and the "Update available" prompt.

 When a new sw.js is deployed, the browser installs it in the background and it takes over at once
 (sw.js calls skipWaiting). The open page keeps running the files it already loaded; we show a
 toast, and choosing Reload loads the new version. Nothing reloads by itself, so a game in progress
 is never interrupted.
 */
import { toast } from "../ui/toast.js";

export const updateState = new EventTarget();
let waitingWorker = null;
let reloadRequested = false;

export function applyUpdate() {
    reloadRequested = true;
    // An older worker may still be waiting (it predates skipWaiting): activate it first.
    if (waitingWorker && waitingWorker.state === "installed") {
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    else {
        location.reload();
    }
}

export function hasUpdate() {
    return !!waitingWorker;
}

function announce(worker) {
    waitingWorker = worker;
    updateState.dispatchEvent(new CustomEvent("update"));
    toast("Update available.", { action: { label: "Reload", onClick: applyUpdate }, timeout: 0, icon: "✨" });
}

export function registerServiceWorker({ beforeReload = () => {} } = {}) {
    if (!("serviceWorker" in navigator)) {
        return;
    }
    // A service worker needs HTTPS (or localhost).
    if (!window.isSecureContext) {
        return;
    }
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading || !reloadRequested) {
            return;
        }
        reloading = true;
        beforeReload();
        location.reload();
    });

    window.addEventListener("load", async () => {
        try {
            const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
            if (registration.waiting && navigator.serviceWorker.controller) {
                announce(registration.waiting);
            }
            registration.addEventListener("updatefound", () => {
                const worker = registration.installing;
                if (!worker) {
                    return;
                }
                worker.addEventListener("statechange", () => {
                    // "installed" with an existing controller means an update (not the first install).
                    if (worker.state === "installed" && navigator.serviceWorker.controller) {
                        announce(worker);
                    }
                });
            });
            // Check for updates when the app comes back to the foreground.
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") {
                    registration.update().catch(() => {});
                }
            });
        }
        catch (error) {
            console.warn("Service worker registration failed:", error);
        }
    });
}

// Game ids whose ROMs are in the offline cache (see sw.js ROM_CACHE).
export async function cachedGameIds() {
    if (!("caches" in window)) {
        return new Set();
    }
    try {
        const cache = await caches.open("gba-roms");
        const keys = await cache.keys();
        return new Set(keys.map((request) => decodeURIComponent(new URL(request.url).pathname.split("/").pop().replace(/\.gba$/, ""))));
    }
    catch (error) {
        return new Set();
    }
}

export async function clearCachedGames() {
    if ("caches" in window) {
        await caches.delete("gba-roms");
    }
}

export async function storageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
        try {
            return await navigator.storage.estimate();
        }
        catch (error) {
            return null;
        }
    }
    return null;
}
