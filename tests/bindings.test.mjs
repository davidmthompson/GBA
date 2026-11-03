// Binding store: defaults, conflicts, swap, multiple bindings, reset and persistence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_PROFILES, BindingStore, DEFAULT_BINDINGS, STORAGE_KEY } from "../input/bindings.js";

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        data,
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key)
    };
}

test("defaults match the original IodineGBA keys", () => {
    const store = new BindingStore(fakeStorage());
    assert.deepEqual(store.get("keyboard", "a"), ["KeyX"]);
    assert.deepEqual(store.get("keyboard", "b"), ["KeyZ"]);
    assert.deepEqual(store.get("keyboard", "l"), ["KeyA"]);
    assert.deepEqual(store.get("keyboard", "r"), ["KeyS"]);
    assert.deepEqual(store.get("keyboard", "start"), ["Enter"]);
    assert.deepEqual(store.get("keyboard", "select"), ["ShiftLeft", "ShiftRight"]);
    assert.deepEqual(store.get("keyboard", "volume_down"), ["KeyD"]);
    assert.deepEqual(store.get("keyboard", "volume_up"), ["KeyR"]);
    assert.deepEqual(store.get("gamepad", "up"), ["b12", "a1-"]);
});

test("every action has keyboard and gamepad defaults defined", () => {
    for (const device of ["keyboard", "gamepad"]) {
        for (const list of Object.values(DEFAULT_BINDINGS[device])) {
            assert.ok(Array.isArray(list));
        }
    }
});

test("actionsFor finds every action using a binding", () => {
    const store = new BindingStore(fakeStorage());
    assert.deepEqual(store.actionsFor("keyboard", "Enter").sort(), ["confirm", "start"]);
    assert.deepEqual(store.actionsFor("gamepad", "b0").sort(), ["a", "confirm"]);
});

test("conflicts only count actions whose scopes overlap", () => {
    const store = new BindingStore(fakeStorage());
    // Z is B (game scope): binding it to A (game) conflicts.
    assert.deepEqual(store.conflicts("keyboard", "a", "KeyZ"), ["b"]);
    // Enter is Start (game); Confirm is menu scope, so no conflict.
    assert.deepEqual(store.conflicts("keyboard", "confirm", "Enter"), []);
    // Directions are "both": binding Up's key to Confirm conflicts.
    assert.deepEqual(store.conflicts("keyboard", "confirm", "ArrowUp"), ["up"]);
});

test("assign without swap refuses a conflicting binding and changes nothing", () => {
    const store = new BindingStore(fakeStorage());
    const result = store.assign("keyboard", "a", "KeyZ");
    assert.equal(result.ok, false);
    assert.deepEqual(result.conflicts, ["b"]);
    assert.deepEqual(store.get("keyboard", "a"), ["KeyX"]);
    assert.deepEqual(store.get("keyboard", "b"), ["KeyZ"]);
});

test("assign with swap exchanges bindings so nothing is left unbound", () => {
    const store = new BindingStore(fakeStorage());
    const result = store.assign("keyboard", "a", "KeyZ", { swap: true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.swapped, ["b"]);
    assert.deepEqual(store.get("keyboard", "a"), ["KeyZ"]);
    assert.deepEqual(store.get("keyboard", "b"), ["KeyX"]);
});

test("replace mode makes the new binding the only one", () => {
    const store = new BindingStore(fakeStorage());
    store.assign("keyboard", "select", "KeyQ");
    assert.deepEqual(store.get("keyboard", "select"), ["KeyQ"]);
});

test("add mode keeps existing bindings and ignores duplicates", () => {
    const store = new BindingStore(fakeStorage());
    store.assign("keyboard", "a", "KeyK", { mode: "add" });
    store.assign("keyboard", "a", "KeyK", { mode: "add" });
    assert.deepEqual(store.get("keyboard", "a"), ["KeyX", "KeyK"]);
    assert.deepEqual(store.actionsFor("keyboard", "KeyK"), ["a"]);
});

test("remove drops one binding", () => {
    const store = new BindingStore(fakeStorage());
    store.remove("keyboard", "select", "ShiftRight");
    assert.deepEqual(store.get("keyboard", "select"), ["ShiftLeft"]);
    assert.equal(store.isCustom("keyboard", "select"), true);
});

test("reset restores one action; resetAll restores everything", () => {
    const store = new BindingStore(fakeStorage());
    store.assign("keyboard", "a", "KeyK");
    store.assign("keyboard", "b", "KeyJ");
    store.assign("gamepad", "a", "b3");
    store.reset("a");
    assert.deepEqual(store.get("keyboard", "a"), ["KeyX"]);
    assert.deepEqual(store.get("gamepad", "a"), ["b0"]);
    assert.deepEqual(store.get("keyboard", "b"), ["KeyJ"]);
    store.resetAll();
    assert.deepEqual(store.get("keyboard", "b"), ["KeyZ"]);
    assert.equal(store.isCustom("keyboard", "b"), false);
});

test("reset can target one device", () => {
    const store = new BindingStore(fakeStorage());
    store.assign("keyboard", "a", "KeyK");
    store.assign("gamepad", "a", "b3");
    store.reset("a", "gamepad");
    assert.deepEqual(store.get("keyboard", "a"), ["KeyK"]);
    assert.deepEqual(store.get("gamepad", "a"), ["b0"]);
});

test("bindings persist to storage and load back", () => {
    const storage = fakeStorage();
    const first = new BindingStore(storage);
    first.assign("keyboard", "a", "KeyZ", { swap: true });
    first.assign("gamepad", "start", "b3", { mode: "add" });
    assert.ok(storage.data.has(STORAGE_KEY));
    const second = new BindingStore(storage);
    assert.deepEqual(second.get("keyboard", "a"), ["KeyZ"]);
    assert.deepEqual(second.get("keyboard", "b"), ["KeyX"]);
    assert.deepEqual(second.get("gamepad", "start"), ["b9", "b3"]);
});

test("per-controller profiles override the shared profile action by action", () => {
    const storage = fakeStorage();
    const store = new BindingStore(storage);
    const pad = "054c-0ce6-Wireless Controller";
    store.assign("gamepad", "a", "b1", { profile: pad, swap: true });
    assert.deepEqual(store.get("gamepad", "a", pad), ["b1"]);
    assert.deepEqual(store.get("gamepad", "b", pad), ["b0"]);
    // Other controllers and untouched actions use the shared profile / defaults.
    assert.deepEqual(store.get("gamepad", "a", ALL_PROFILES), ["b0"]);
    assert.deepEqual(store.get("gamepad", "start", pad), ["b9"]);
    assert.deepEqual(new BindingStore(storage).profiles(), [pad]);
    store.resetAll("gamepad", pad);
    assert.deepEqual(store.get("gamepad", "a", pad), ["b0"]);
});

test("corrupt or unknown stored data falls back to defaults", () => {
    const store = new BindingStore(fakeStorage({ [STORAGE_KEY]: "{not json" }));
    assert.deepEqual(store.get("keyboard", "a"), ["KeyX"]);
    const odd = new BindingStore(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ keyboard: { nope: ["KeyQ"], a: [1, "KeyQ"] } }) }));
    assert.deepEqual(odd.get("keyboard", "a"), ["KeyQ"]);
    assert.deepEqual(odd.actionsFor("keyboard", "KeyQ"), ["a"]);
});

test("a throwing storage does not break binding changes", () => {
    const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem() {} };
    const store = new BindingStore(storage);
    store.assign("keyboard", "a", "KeyK");
    assert.deepEqual(store.get("keyboard", "a"), ["KeyK"]);
});
