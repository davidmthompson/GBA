"use strict";
/*
 Copyright (C) 2012-2015 Grant Galitz
 
 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
/*
 Bridge between the input action layer (input/actions.js) and the emulator.
 Keyboard, gamepad and touch input are all translated into named actions first, so this file
 never sees raw keys or buttons. It maps the GBA button actions to the emulator's joypad
 indices and handles the emulator hotkey actions (volume and speed).
 */
//Action name -> IodineGBA joypad index.
var gbaButtonIndex = {
    "a":0,
    "b":1,
    "select":2,
    "start":3,
    "right":4,
    "left":5,
    "up":6,
    "down":7,
    "r":8,
    "l":9
};
var fastForwardBaseSpeed = null;
function gbaActionDown(action) {
    if (Iodine && typeof gbaButtonIndex[action] == "number") {
        Iodine.keyDown(gbaButtonIndex[action] | 0);
    }
}
function gbaActionUp(action) {
    if (Iodine && typeof gbaButtonIndex[action] == "number") {
        Iodine.keyUp(gbaButtonIndex[action] | 0);
    }
}
//Releases every GBA button, e.g. before pausing so no key stays held inside the core.
function gbaReleaseAll() {
    for (var action in gbaButtonIndex) {
        gbaActionUp(action);
    }
}
//Fast-forward: hold to run faster. With an analog trigger the speed follows trigger pressure.
function gbaFastForward(amount) {
    if (!Iodine) {
        return;
    }
    if (amount > 0) {
        if (fastForwardBaseSpeed === null) {
            fastForwardBaseSpeed = Iodine.getSpeed();
        }
        //Quantise to quarter steps: setSpeed() resets audio, so avoid calling it every frame.
        var target = fastForwardBaseSpeed * (1 + 2 * Math.round(Math.min(amount, 1) * 4) / 4);
        if (Math.abs(target - Iodine.getSpeed()) > 0.01) {
            Iodine.setSpeed(target);
        }
    }
    else if (fastForwardBaseSpeed !== null) {
        Iodine.setSpeed(fastForwardBaseSpeed);
        fastForwardBaseSpeed = null;
    }
}
//Subscribes the emulator to an InputManager (see input/actions.js).
function attachJoyPadBridge(input) {
    input.addEventListener("actiondown", function (event) {
        var action = event.detail.action;
        if (event.detail.repeat) {
            return;
        }
        switch (action) {
            case "volume_down":
                lowerVolume();
                break;
            case "volume_up":
                raiseVolume();
                break;
            case "speed_up":
                Iodine && Iodine.incrementSpeed(0.10);
                break;
            case "speed_down":
                Iodine && Iodine.incrementSpeed(-0.10);
                break;
            case "fast_forward":
                gbaFastForward(event.detail.value || 1);
                break;
            default:
                gbaActionDown(action);
        }
    });
    input.addEventListener("analog", function (event) {
        if (event.detail.action == "fast_forward") {
            gbaFastForward(event.detail.value);
        }
    });
    input.addEventListener("actionup", function (event) {
        if (event.detail.action == "fast_forward") {
            gbaFastForward(0);
        }
        else {
            gbaActionUp(event.detail.action);
        }
    });
}
