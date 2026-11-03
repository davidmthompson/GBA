// Input manager (modes, release, capture), spatial navigation and controller glyphs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIONS, InputManager } from "../input/actions.js";
import { BindingStore, DEFAULT_BINDINGS } from "../input/bindings.js";
import { controllerFamily, gamepadLabel, keyboardLabel } from "../input/glyphs.js";
import { nearest } from "../input/menu-nav.js";

function setup(mode = "game") {
    const manager = new InputManager(new BindingStore());
    manager.setMode(mode);
    const events = [];
    for (const type of ["actiondown", "actionup", "analog"]) {
        manager.addEventListener(type, (event) => events.push(`${type}:${event.detail.action}${event.detail.repeat ? ":repeat" : ""}`));
    }
    return { manager, events };
}

test("every action has defaults for both devices", () => {
    for (const action of ACTIONS) {
        assert.ok(DEFAULT_BINDINGS.keyboard[action.id], `keyboard ${action.id}`);
        assert.ok(DEFAULT_BINDINGS.gamepad[action.id], `gamepad ${action.id}`);
    }
});

test("game mode fires game actions, not menu ones", () => {
    const { manager, events } = setup("game");
    manager.rawDown("keyboard", "Enter", "kb:Enter");
    manager.rawUp("keyboard", "Enter", "kb:Enter");
    assert.deepEqual(events, ["actiondown:start", "actionup:start"]);
});

test("menu mode fires menu actions, not game ones", () => {
    const { manager, events } = setup("menu");
    manager.rawDown("keyboard", "Enter", "kb:Enter");
    manager.rawDown("keyboard", "KeyX", "kb:KeyX");
    assert.deepEqual(events, ["actiondown:confirm"]);
});

test("directions and the menu action work in both modes", () => {
    const { manager, events } = setup("game");
    manager.rawDown("gamepad", "b12", "gp0:b12");
    manager.setMode("menu");
    manager.rawDown("gamepad", "b12", "gp0:b12b");
    assert.deepEqual(events, ["actiondown:up", "actionup:up", "actiondown:up"]);
});

test("switching mode releases held actions", () => {
    const { manager, events } = setup("game");
    manager.rawDown("keyboard", "KeyX", "kb:KeyX");
    manager.setMode("menu");
    assert.deepEqual(events, ["actiondown:a", "actionup:a"]);
    // The later key-up is ignored rather than releasing twice.
    manager.rawUp("keyboard", "KeyX", "kb:KeyX");
    assert.equal(events.length, 2);
});

test("an action held by two sources is released only when both let go", () => {
    const { manager, events } = setup("game");
    manager.rawDown("keyboard", "KeyX", "kb:KeyX");
    manager.press("a", "touch:1", "touch");
    manager.rawUp("keyboard", "KeyX", "kb:KeyX");
    assert.deepEqual(events, ["actiondown:a"]);
    manager.release("a", "touch:1", "touch");
    assert.deepEqual(events, ["actiondown:a", "actionup:a"]);
});

test("repeats only reach menu directions", () => {
    const { manager, events } = setup("menu");
    manager.rawDown("keyboard", "ArrowDown", "kb:ArrowDown");
    manager.rawDown("keyboard", "ArrowDown", "kb:ArrowDown", { repeat: true });
    manager.setMode("game");
    manager.rawDown("keyboard", "KeyX", "kb:KeyX");
    manager.rawDown("keyboard", "KeyX", "kb:KeyX", { repeat: true });
    assert.deepEqual(events, ["actiondown:down", "actiondown:down:repeat", "actionup:down", "actiondown:a"]);
});

test("capture routes raw presses to the remap screen instead of actions", () => {
    const { manager, events } = setup("menu");
    const captured = [];
    manager.capture((press) => captured.push(`${press.device}:${press.binding}:${press.phase}`));
    manager.rawDown("gamepad", "b3", "gp0:b3");
    manager.rawUp("gamepad", "b3", "gp0:b3");
    manager.endCapture();
    manager.rawDown("keyboard", "Enter", "kb:Enter");
    assert.deepEqual(captured, ["gamepad:b3:down", "gamepad:b3:up"]);
    assert.deepEqual(events, ["actiondown:confirm"]);
});

test("analog values reach analog actions held by that source", () => {
    const store = new BindingStore();
    store.assign("gamepad", "fast_forward", "b7", { mode: "add", swap: true });
    const manager = new InputManager(store);
    manager.setMode("game");
    const values = [];
    manager.addEventListener("analog", (event) => values.push(event.detail.value));
    manager.rawDown("gamepad", "b7", "gp0:b7", { value: 0.5 });
    manager.rawAnalog("gp0:b7", 0.8);
    assert.deepEqual(values, [0.8]);
});

test("releaseSource releases a disconnected pad's buttons", () => {
    const { manager, events } = setup("game");
    manager.rawDown("gamepad", "b0", "gp1:b0");
    manager.rawDown("keyboard", "KeyZ", "kb:KeyZ");
    manager.releaseSource("gp1:");
    assert.deepEqual(events, ["actiondown:a", "actiondown:b", "actionup:a"]);
});

test("spatial navigation picks the nearest element in the direction", () => {
    const rect = (left, top, width = 100, height = 50) => ({ left, top, width, height, right: left + width, bottom: top + height });
    const from = rect(100, 100);
    const candidates = [
        { element: "right-near", rect: rect(220, 100) },
        { element: "right-far", rect: rect(400, 100) },
        { element: "right-diagonal", rect: rect(220, 300) },
        { element: "below", rect: rect(100, 200) },
        { element: "left", rect: rect(-50, 100) }
    ];
    assert.equal(nearest(from, candidates, "right"), "right-near");
    assert.equal(nearest(from, candidates, "down"), "below");
    assert.equal(nearest(from, candidates, "left"), "left");
    assert.equal(nearest(from, candidates, "up"), null);
});

test("controller family and glyphs follow the gamepad id", () => {
    assert.equal(controllerFamily({ id: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)" }), "xbox");
    assert.equal(controllerFamily({ id: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" }), "playstation");
    assert.equal(controllerFamily({ id: "Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)" }), "switch");
    assert.equal(controllerFamily({ id: "USB Gamepad" }), "generic");
    assert.equal(gamepadLabel("b0", "xbox"), "A");
    assert.equal(gamepadLabel("b0", "playstation"), "✕");
    assert.equal(gamepadLabel("b1", "switch"), "A");
    assert.equal(gamepadLabel("a1-", "xbox"), "Left stick ↑");
    assert.equal(keyboardLabel("KeyX"), "X");
    assert.equal(keyboardLabel("ArrowLeft"), "←");
    assert.equal(keyboardLabel("Digit3"), "3");
});
