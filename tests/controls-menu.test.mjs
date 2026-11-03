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

test("bindings are drawn as keycaps, face buttons, shoulders, d-pad or stick glyphs", async () => {
    const { glyphShape } = await import("../input/glyphs.js");
    assert.deepEqual(glyphShape("keyboard", "KeyX"), { shape: "key", size: "normal" });
    assert.deepEqual(glyphShape("keyboard", "Enter"), { shape: "key", size: "wide" });
    assert.deepEqual(glyphShape("keyboard", "ShiftLeft"), { shape: "key", size: "wide" });
    assert.deepEqual(glyphShape("keyboard", "Space"), { shape: "key", size: "space" });
    assert.deepEqual(glyphShape("gamepad", "b0"), { shape: "face", position: "south" });
    assert.deepEqual(glyphShape("gamepad", "b3"), { shape: "face", position: "north" });
    assert.deepEqual(glyphShape("gamepad", "b6"), { shape: "shoulder" });
    assert.deepEqual(glyphShape("gamepad", "b14"), { shape: "dpad", direction: "left" });
    assert.deepEqual(glyphShape("gamepad", "a1-"), { shape: "stick", stick: "left", direction: "up" });
    assert.deepEqual(glyphShape("gamepad", "a2+"), { shape: "stick", stick: "right", direction: "right" });
    assert.deepEqual(glyphShape("gamepad", "b9"), { shape: "pill" });
});

test("every action appears in exactly one Controls group", async () => {
    const { ACTIONS } = await import("../input/actions.js");
    const { remapGroups } = await import("../input/remap-ui.js");
    const listed = remapGroups().flatMap((group) => group.actions);
    assert.deepEqual([...listed].sort(), ACTIONS.map((action) => action.id).sort());
    assert.deepEqual(remapGroups().map((group) => group.label), ["D-pad", "Buttons", "Shoulders", "System", "Emulator"]);
});
