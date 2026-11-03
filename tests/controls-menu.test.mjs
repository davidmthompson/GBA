// Settings / Controls menu logic: controller test diagram, menu repeat speed, switches and tab actions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { InputManager } from "../input/actions.js";
import { BindingStore } from "../input/bindings.js";
import { repeatTiming } from "../input/gamepad.js";
import { switchValueFor } from "../input/menu-nav.js";
import { gamepadBindingDown, pressedActions } from "../input/pad-diagram.js";

function fakePad({ buttons = {}, axes = [0, 0, 0, 0] } = {}) {
    const list = Array.from({ length: 17 }, (_, index) => {
        const value = buttons[index] || 0;
        return { pressed: value >= 0.5, value };
    });
    return { id: "Xbox Wireless Controller (STANDARD GAMEPAD)", buttons: list, axes };
}

test("gamepad bindings are read as held from buttons, triggers and stick directions", () => {
    const pad = fakePad({ buttons: { 0: 1, 7: 0.2 }, axes: [-0.9, 0.1, 0, 0] });
    assert.equal(gamepadBindingDown(pad, "b0"), true);
    assert.equal(gamepadBindingDown(pad, "b1"), false);
    // Trigger below the threshold is not a press; above it is.
    assert.equal(gamepadBindingDown(pad, "b7", { threshold: 0.35 }), false);
    assert.equal(gamepadBindingDown(pad, "b7", { threshold: 0.1 }), true);
    assert.equal(gamepadBindingDown(pad, "a0-"), true);
    assert.equal(gamepadBindingDown(pad, "a0+"), false);
    // Inside the dead zone counts as centred.
    assert.equal(gamepadBindingDown(pad, "a1+", { deadZone: 0.25 }), false);
    assert.equal(gamepadBindingDown(pad, "b99"), false);
});

test("the diagram lights the GBA buttons whose bindings are held, following remaps", () => {
    const bindings = new BindingStore();
    const pad = fakePad({ buttons: { 0: 1, 13: 1 } });
    const held = pressedActions(bindings, "gamepad", (binding) => gamepadBindingDown(pad, binding));
    assert.deepEqual([...held].sort(), ["a", "down"]);
    bindings.assign("gamepad", "b", "b0", { swap: true });
    const swapped = pressedActions(bindings, "gamepad", (binding) => gamepadBindingDown(pad, binding));
    assert.ok(swapped.has("b") && !swapped.has("a"));
    const keys = pressedActions(bindings, "keyboard", (code) => code === "KeyX" || code === "Escape");
    assert.deepEqual([...keys].sort(), ["a", "menu"]);
});

test("menu repeat speed maps to delays, with normal as the fallback", () => {
    assert.ok(repeatTiming("fast").interval < repeatTiming("normal").interval);
    assert.ok(repeatTiming("slow").delay > repeatTiming("normal").delay);
    assert.deepEqual(repeatTiming("bogus"), repeatTiming("normal"));
});

test("left turns a switch off and right turns it on", () => {
    assert.equal(switchValueFor("right"), true);
    assert.equal(switchValueFor("left"), false);
});

test("L/R and Q/E switch tabs in menus without changing in-game buttons", () => {
    const manager = new InputManager(new BindingStore());
    const events = [];
    manager.addEventListener("actiondown", (event) => events.push(event.detail.action));
    manager.setMode("menu");
    manager.rawDown("gamepad", "b4", "gp0:b4");
    manager.rawDown("gamepad", "b5", "gp0:b5");
    manager.releaseAll();
    manager.rawDown("keyboard", "KeyQ", "kb:KeyQ");
    manager.rawDown("keyboard", "KeyE", "kb:KeyE");
    assert.deepEqual(events, ["prev_tab", "next_tab", "prev_tab", "next_tab"]);
    manager.releaseAll();
    events.length = 0;
    manager.setMode("game");
    manager.rawDown("gamepad", "b4", "gp0:b4");
    assert.deepEqual(events, ["l"]);
});
