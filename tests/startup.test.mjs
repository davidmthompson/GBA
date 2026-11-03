// Start-up smoke checks: every browser script parses, input reaches the emulator, and the service
// worker never mixes page and script versions or waits for a click to update.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createContext, runInContext, Script } from "node:vm";
import { InputManager } from "../input/actions.js";
import { BindingStore } from "../input/bindings.js";
import { ROOT } from "../scripts/build-sw.mjs";

const MODULE_DIRS = ["ui", "input", "pwa"];
const CLASSIC_SCRIPTS = ["sw.js", "data/games.js", ...readdirSync(join(ROOT, "user_scripts")).filter((name) => name.endsWith(".js")).map((name) => `user_scripts/${name}`)];

// A syntax error in one module (e.g. a broken regex in ui/launcher.js) stops the whole page:
// no input layer, no controller, no menu. Catch it here instead of in the browser.
test("every browser module parses", () => {
    for (const dir of MODULE_DIRS) {
        for (const name of readdirSync(join(ROOT, dir)).filter((file) => file.endsWith(".js"))) {
            const path = join(ROOT, dir, name);
            try {
                execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
            }
            catch (error) {
                assert.fail(`${dir}/${name} does not parse:\n${error.stderr}`);
            }
        }
    }
});

test("every classic script parses", () => {
    for (const path of CLASSIC_SCRIPTS) {
        assert.doesNotThrow(() => new Script(readFileSync(join(ROOT, path), "utf8"), { filename: path }), path);
    }
});

test("keyboard, controller and touch input reach the emulator through the bridge", () => {
    const calls = [];
    const context = createContext({
        Iodine: { keyDown: (index) => calls.push(`down${index}`), keyUp: (index) => calls.push(`up${index}`), getSpeed: () => 1, setSpeed() {} }
    });
    runInContext(readFileSync(join(ROOT, "user_scripts/IodineGBAJoyPadGlueCode.js"), "utf8"), context);
    const manager = new InputManager(new BindingStore());
    manager.setMode("game");
    context.attachJoyPadBridge(manager);

    manager.rawDown("gamepad", "b0", "gp0:b0");         // A
    manager.rawUp("gamepad", "b0", "gp0:b0");
    manager.rawDown("gamepad", "b13", "gp0:b13");       // d-pad down
    manager.rawUp("gamepad", "b13", "gp0:b13");
    manager.rawDown("gamepad", "a0+", "gp0:a0+");       // left stick right
    manager.rawUp("gamepad", "a0+", "gp0:a0+");
    manager.rawDown("gamepad", "b9", "gp0:b9");         // Start
    manager.rawUp("gamepad", "b9", "gp0:b9");
    manager.rawDown("keyboard", "KeyZ", "kb:KeyZ");     // B
    manager.rawUp("keyboard", "KeyZ", "kb:KeyZ");
    manager.press("l", "touch:l", "touch");             // touch L
    manager.release("l", "touch:l", "touch");
    assert.deepEqual(calls, ["down0", "up0", "down7", "up7", "down4", "up4", "down3", "up3", "down1", "up1", "down9", "up9"]);
});

// Runs sw.js against in-memory caches and a fake network.
function serviceWorker(network) {
    const stores = new Map();
    const handlers = {};
    const cacheFor = (name) => {
        if (!stores.has(name)) {
            stores.set(name, new Map());
        }
        const store = stores.get(name);
        return {
            put: async (key, response) => store.set(typeof key === "string" ? key : key.url, response),
            match: async (key) => store.get(typeof key === "string" ? key : key.url)
        };
    };
    let skipped = false;
    const self = {
        location: new URL("https://example.test/sw.js"),
        registration: { scope: "https://example.test/" },
        addEventListener: (type, handler) => {
            handlers[type] = handler;
        },
        skipWaiting: async () => {
            skipped = true;
        },
        clients: { claim: async () => {} }
    };
    const caches = {
        open: async (name) => cacheFor(name),
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        match: async (key, { cacheName } = {}) => {
            const names = cacheName ? [cacheName] : [...stores.keys()];
            for (const name of names) {
                const hit = stores.get(name)?.get(typeof key === "string" ? key : key.url);
                if (hit) {
                    return hit;
                }
            }
            return undefined;
        }
    };
    const fetch = async (request) => network(typeof request === "string" ? request : request.url);
    const context = createContext({ self, caches, fetch, URL, Request: class { constructor(url) { this.url = url; } }, Response: class {}, setTimeout, Promise, console });
    runInContext(readFileSync(join(ROOT, "sw.js"), "utf8"), context);
    const run = async (type, event) => {
        let result;
        await handlers[type]({ ...event, waitUntil: (promise) => { result = promise; }, respondWith: (promise) => { result = promise; } });
        return result;
    };
    return { run, skipped: () => skipped };
}

test("the service worker takes over at once and serves pages from the same version as their scripts", async () => {
    const network = (url) => ({ ok: true, url, redirected: false, body: `v1:${url}`, clone() { return this; } });
    const sw = serviceWorker(network);
    await sw.run("install", {});
    assert.equal(sw.skipped(), true, "install calls skipWaiting");

    // A newer launcher.html on the network must not be mixed with this version's cached scripts.
    const served = [];
    const sw2 = serviceWorker((url) => {
        served.push(url);
        return { ok: true, url, redirected: false, body: `v1:${url}`, clone() { return this; } };
    });
    await sw2.run("install", {});
    served.length = 0;
    const page = await sw2.run("fetch", { request: { method: "GET", mode: "navigate", url: "https://example.test/launcher.html#advancewars" } });
    assert.equal(page.body, "v1:https://example.test/launcher.html");
    const script = await sw2.run("fetch", { request: { method: "GET", mode: "cors", url: "https://example.test/ui/launcher.js" } });
    assert.equal(script.body, "v1:https://example.test/ui/launcher.js");
    assert.deepEqual(served, [], "both came from the cache, not the network");
});
