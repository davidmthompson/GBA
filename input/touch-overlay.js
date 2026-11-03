/*
 On-screen touch controls for the emulator page.

 - Pointer Events with pointer capture, so touch, pen and mouse share one code path, and
   several fingers work at once.
 - The d-pad reads the finger's angle from its centre: sliding between directions and
   diagonals works without lifting. Fingers can also slide between face buttons (A ↔ B).
 - Everything maps to the same actions as keyboard and gamepad (input/actions.js).
 - Shown automatically on touch devices; hidden when a gamepad or physical key is used, shown
   again on the next touch. settings.touch.mode can force "always" or "never".
 - Layout editor: drag groups to move them, plus size, opacity and handedness (in the settings
   dialog). Positions are saved per orientation as fractions of the control layer.
 */
const GROUPS = {
    dpad: { label: "D-pad" },
    face: { label: "A and B buttons" },
    l: { label: "L button" },
    r: { label: "R button" },
    system: { label: "Select, menu and Start" }
};

const DEFAULT_POSITIONS = {
    portrait: { dpad: { x: 0.25, y: 0.5 }, face: { x: 0.75, y: 0.5 }, l: { x: 0.12, y: 0.1 }, r: { x: 0.88, y: 0.1 }, system: { x: 0.5, y: 0.88 } },
    landscape: { dpad: { x: 0.1, y: 0.55 }, face: { x: 0.9, y: 0.5 }, l: { x: 0.08, y: 0.12 }, r: { x: 0.92, y: 0.12 }, system: { x: 0.9, y: 0.9 } }
};

// Groups mirrored horizontally in the left-handed layout.
const MIRRORED = new Set(["dpad", "face"]);

const DPAD_DEAD = 0.22;

export class TouchOverlay extends EventTarget {
    constructor(layer, { manager, settings }) {
        super();
        this.layer = layer;
        this.manager = manager;
        this.settings = settings;
        this.pointers = new Map(); // pointerId -> { kind, actions:Set, element }
        this.editing = false;
        this.autoVisible = window.matchMedia("(pointer: coarse)").matches;
        this.build();
        this.applyAppearance();
        this.updateVisibility();

        layer.addEventListener("pointerdown", (event) => this.onDown(event));
        layer.addEventListener("pointermove", (event) => this.onMove(event));
        layer.addEventListener("pointerup", (event) => this.onUp(event));
        layer.addEventListener("pointercancel", (event) => this.onUp(event));
        layer.addEventListener("lostpointercapture", (event) => this.onUp(event));
        layer.addEventListener("contextmenu", (event) => event.preventDefault());

        manager.addEventListener("modality", (event) => {
            const { modality } = event.detail;
            if (modality === "touch") {
                this.autoVisible = true;
            }
            else if (modality === "keyboard" || modality === "gamepad") {
                this.autoVisible = false;
            }
            this.updateVisibility();
        });
        settings.addEventListener("change", (event) => {
            if (event.detail.key.startsWith("touch")) {
                this.applyAppearance();
                this.updateVisibility();
            }
        });
        this.orientationQuery = window.matchMedia("(orientation: portrait)");
        this.orientationQuery.addEventListener("change", () => this.applyPositions());
        window.addEventListener("resize", () => this.applyPositions());
    }

    build() {
        this.layer.classList.add("touch");
        this.layer.innerHTML = `
            <div class="touch__group" data-group="dpad" role="group" aria-label="D-pad">
                <div class="dpad" data-control="dpad">
                    <span class="dpad__arm dpad__arm--up" data-dir="up"></span>
                    <span class="dpad__arm dpad__arm--down" data-dir="down"></span>
                    <span class="dpad__arm dpad__arm--left" data-dir="left"></span>
                    <span class="dpad__arm dpad__arm--right" data-dir="right"></span>
                    <span class="dpad__hub"></span>
                </div>
            </div>
            <div class="touch__group touch__group--face" data-group="face" role="group" aria-label="A and B buttons">
                <button type="button" tabindex="-1" class="tbtn tbtn--round tbtn--b" data-action="b" aria-label="B">B</button>
                <button type="button" tabindex="-1" class="tbtn tbtn--round tbtn--a" data-action="a" aria-label="A">A</button>
            </div>
            <div class="touch__group" data-group="l"><button type="button" tabindex="-1" class="tbtn tbtn--shoulder" data-action="l" aria-label="L">L</button></div>
            <div class="touch__group" data-group="r"><button type="button" tabindex="-1" class="tbtn tbtn--shoulder" data-action="r" aria-label="R">R</button></div>
            <div class="touch__group touch__group--system" data-group="system" role="group" aria-label="Select, menu and Start">
                <button type="button" tabindex="-1" class="tbtn tbtn--pill" data-action="select" aria-label="Select">Select</button>
                <button type="button" tabindex="-1" class="tbtn tbtn--pill tbtn--menu" data-action="menu" aria-label="Menu">☰</button>
                <button type="button" tabindex="-1" class="tbtn tbtn--pill" data-action="start" aria-label="Start">Start</button>
            </div>`;
        this.groups = Object.fromEntries([...this.layer.querySelectorAll("[data-group]")].map((element) => [element.dataset.group, element]));
        this.dpad = this.layer.querySelector("[data-control=dpad]");
    }

    orientation() {
        return window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
    }

    isVisible() {
        return !this.layer.hidden;
    }

    updateVisibility() {
        const mode = this.settings.get("touch.mode");
        const visible = this.editing || mode === "always" || (mode === "auto" && this.autoVisible);
        if (visible === this.isVisible() && this.layer.dataset.ready) {
            return;
        }
        this.layer.dataset.ready = "true";
        this.layer.hidden = !visible;
        document.documentElement.classList.toggle("touch-active", visible);
        if (!visible) {
            this.releaseAll();
        }
        this.applyPositions();
        this.dispatchEvent(new CustomEvent("visibility", { detail: { visible } }));
    }

    applyAppearance() {
        const touch = this.settings.get("touch");
        this.layer.style.setProperty("--touch-scale", touch.scale);
        this.layer.style.setProperty("--touch-opacity", touch.opacity);
        this.layer.dataset.handed = touch.handed;
        this.applyPositions();
    }

    position(group) {
        const orientation = this.orientation();
        const saved = (this.settings.get("touch.positions") || {})[orientation] || {};
        const base = saved[group] || DEFAULT_POSITIONS[orientation][group];
        const mirrored = this.settings.get("touch.handed") === "left" && MIRRORED.has(group);
        return { x: mirrored ? 1 - base.x : base.x, y: base.y };
    }

    // Places each group at its centre point, clamped so it stays fully inside the layer.
    applyPositions() {
        if (this.layer.hidden) {
            return;
        }
        const bounds = this.layer.getBoundingClientRect();
        for (const [name, element] of Object.entries(this.groups)) {
            const { x, y } = this.position(name);
            const halfW = element.offsetWidth / 2 / Math.max(bounds.width, 1);
            const halfH = element.offsetHeight / 2 / Math.max(bounds.height, 1);
            const cx = Math.min(Math.max(x, halfW), 1 - halfW);
            const cy = Math.min(Math.max(y, halfH), 1 - halfH);
            element.style.left = `${cx * 100}%`;
            element.style.top = `${cy * 100}%`;
        }
    }

    // ---- Playing ----

    onDown(event) {
        if (event.button > 0) {
            return;
        }
        if (this.editing) {
            this.startDrag(event);
            return;
        }
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const control = element && element.closest("[data-action], [data-control=dpad]");
        if (!control || !this.layer.contains(control)) {
            return;
        }
        event.preventDefault();
        try {
            this.layer.setPointerCapture(event.pointerId);
        }
        catch (error) {
            // Synthetic events without a live pointer.
        }
        const kind = control.dataset.control === "dpad" ? "dpad" : "button";
        this.pointers.set(event.pointerId, { kind, actions: new Set() });
        this.update(event);
    }

    onMove(event) {
        if (this.drag && this.drag.pointerId === event.pointerId) {
            this.moveDrag(event);
            return;
        }
        if (this.pointers.has(event.pointerId)) {
            event.preventDefault();
            this.update(event);
        }
    }

    onUp(event) {
        if (this.drag && this.drag.pointerId === event.pointerId) {
            this.endDrag();
            return;
        }
        const pointer = this.pointers.get(event.pointerId);
        if (!pointer) {
            return;
        }
        this.pointers.delete(event.pointerId);
        this.setActions(event.pointerId, pointer, new Set());
    }

    // Works out which actions a pointer holds now and presses/releases the difference.
    update(event) {
        const pointer = this.pointers.get(event.pointerId);
        let next = new Set();
        if (pointer.kind === "dpad") {
            next = this.dpadDirections(event.clientX, event.clientY);
        }
        else {
            const element = document.elementFromPoint(event.clientX, event.clientY);
            const button = element && element.closest("[data-action]");
            if (button && this.layer.contains(button)) {
                next.add(button.dataset.action);
            }
        }
        this.setActions(event.pointerId, pointer, next);
    }

    dpadDirections(x, y) {
        const rect = this.dpad.getBoundingClientRect();
        const dx = (x - (rect.left + rect.width / 2)) / (rect.width / 2);
        const dy = (y - (rect.top + rect.height / 2)) / (rect.height / 2);
        const directions = new Set();
        if (Math.hypot(dx, dy) < DPAD_DEAD) {
            return directions;
        }
        // Eight 45° sectors: each cardinal direction covers 135°, so diagonals overlap two.
        const angle = Math.atan2(dy, dx) * 180 / Math.PI; // 0 = right, 90 = down
        if (angle > -67.5 && angle < 67.5) {
            directions.add("right");
        }
        if (angle > 112.5 || angle < -112.5) {
            directions.add("left");
        }
        if (angle > 22.5 && angle < 157.5) {
            directions.add("down");
        }
        if (angle < -22.5 && angle > -157.5) {
            directions.add("up");
        }
        return directions;
    }

    setActions(pointerId, pointer, next) {
        const key = `touch:${pointerId}`;
        let pressedSomething = false;
        for (const action of pointer.actions) {
            if (!next.has(action)) {
                this.manager.release(action, key, "touch");
                this.mark(action, false);
            }
        }
        for (const action of next) {
            if (!pointer.actions.has(action)) {
                this.manager.press(action, key, "touch");
                this.mark(action, true);
                pressedSomething = true;
            }
        }
        pointer.actions = next;
        if (pressedSomething) {
            this.haptic();
        }
    }

    // Visual pressed state (several pointers may hold the same action).
    mark(action, pressed) {
        const held = this.manager.isHeld(action) || pressed;
        this.layer.querySelectorAll(`[data-action="${action}"], [data-dir="${action}"]`).forEach((element) => element.classList.toggle("is-pressed", held));
    }

    haptic() {
        if (this.settings.get("haptics") && navigator.vibrate) {
            try {
                navigator.vibrate(12);
            }
            catch (error) {
                // Some browsers throw without a user gesture.
            }
        }
    }

    releaseAll() {
        for (const [pointerId, pointer] of this.pointers) {
            this.setActions(pointerId, pointer, new Set());
        }
        this.pointers.clear();
    }

    // ---- Layout editing ----

    setEditing(editing) {
        this.editing = editing;
        this.releaseAll();
        this.layer.classList.toggle("touch--editing", editing);
        this.updateVisibility();
        this.applyPositions();
    }

    startDrag(event) {
        const group = event.target.closest("[data-group]");
        if (!group) {
            return;
        }
        event.preventDefault();
        try {
            this.layer.setPointerCapture(event.pointerId);
        }
        catch (error) {
            // Synthetic events without a live pointer.
        }
        const rect = group.getBoundingClientRect();
        this.drag = {
            pointerId: event.pointerId,
            group: group.dataset.group,
            element: group,
            offsetX: event.clientX - (rect.left + rect.width / 2),
            offsetY: event.clientY - (rect.top + rect.height / 2)
        };
        group.classList.add("is-dragging");
    }

    moveDrag(event) {
        const bounds = this.layer.getBoundingClientRect();
        const { element, offsetX, offsetY } = this.drag;
        const halfW = element.offsetWidth / 2 / bounds.width;
        const halfH = element.offsetHeight / 2 / bounds.height;
        const x = Math.min(Math.max((event.clientX - offsetX - bounds.left) / bounds.width, halfW), 1 - halfW);
        const y = Math.min(Math.max((event.clientY - offsetY - bounds.top) / bounds.height, halfH), 1 - halfH);
        element.style.left = `${x * 100}%`;
        element.style.top = `${y * 100}%`;
        this.drag.x = x;
        this.drag.y = y;
    }

    endDrag() {
        const { group, element, x, y } = this.drag;
        element.classList.remove("is-dragging");
        this.drag = null;
        if (x === undefined) {
            return;
        }
        // Store in right-handed coordinates so switching hands mirrors custom layouts too.
        const mirrored = this.settings.get("touch.handed") === "left" && MIRRORED.has(group);
        const positions = structuredClone(this.settings.get("touch.positions") || { portrait: {}, landscape: {} });
        const orientation = this.orientation();
        positions[orientation] = positions[orientation] || {};
        positions[orientation][group] = { x: mirrored ? 1 - x : x, y };
        this.settings.set("touch.positions", positions);
    }

    resetLayout() {
        this.settings.set("touch.positions", { portrait: {}, landscape: {} });
    }
}

export const TOUCH_GROUPS = GROUPS;
