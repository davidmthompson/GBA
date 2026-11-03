/*
 Spatial focus navigation for menus, dialogs and the library grid, driven by actions only.
   up/down/left/right - move focus to the nearest focusable element in that direction
   confirm            - activate the focused element (click)
   back               - handled by the page (close dialog / leave screen)
 Works the same for gamepad, keyboard arrows and anything else bound to those actions.
 */
const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
].join(",");

function isVisible(element) {
    if (!element.getClientRects().length || element.closest("[inert], [hidden]")) {
        return false;
    }
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none";
}

export function focusables(scope) {
    return [...scope.querySelectorAll(FOCUSABLE)].filter(isVisible);
}

// Nearest candidate in a direction. Elements overlapping on the cross axis win, then the
// smallest distance with the cross-axis offset weighted more heavily.
export function nearest(fromRect, candidates, direction) {
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "right" || direction === "down" ? 1 : -1;
    const from = { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 };
    let best = null;
    let bestScore = Infinity;
    for (const { element, rect } of candidates) {
        const to = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const primary = (horizontal ? to.x - from.x : to.y - from.y) * sign;
        if (primary <= 2) {
            continue;
        }
        const overlap = horizontal
            ? Math.min(rect.bottom, fromRect.bottom) - Math.max(rect.top, fromRect.top)
            : Math.min(rect.right, fromRect.right) - Math.max(rect.left, fromRect.left);
        const cross = overlap > 0 ? 0 : Math.abs(horizontal ? to.y - from.y : to.x - from.x);
        const score = primary + cross * 3;
        if (score < bestScore) {
            bestScore = score;
            best = element;
        }
    }
    return best;
}

export class MenuNavigator {
    /*
     getScope: returns the element navigation is limited to (top dialog or the page).
     onBack:   called for the "back" action.
     */
    constructor(manager, { getScope = () => document.body, onBack = () => {} } = {}) {
        this.manager = manager;
        this.getScope = getScope;
        this.onBack = onBack;
        this.enabled = true;
        manager.addEventListener("actiondown", (event) => this.onAction(event.detail));
    }

    onAction({ action, source }) {
        if (!this.enabled || this.manager.mode !== "menu") {
            return;
        }
        const scope = this.getScope();
        if (!scope) {
            return;
        }
        if (action === "back") {
            this.onBack();
            return;
        }
        if (action === "confirm") {
            // Keyboard Enter/Space already activate the focused control natively.
            if (source === "keyboard") {
                return;
            }
            const active = document.activeElement;
            if (active && active !== document.body && scope.contains(active)) {
                active.click();
            }
            else {
                this.focusFirst(scope);
            }
            return;
        }
        if (["up", "down", "left", "right"].includes(action)) {
            this.move(action, scope);
        }
    }

    focusFirst(scope = this.getScope()) {
        const preferred = scope.querySelector("[data-nav-default]");
        const target = preferred && isVisible(preferred) ? preferred : focusables(scope)[0];
        if (target) {
            this.focus(target);
        }
        return target;
    }

    move(direction, scope) {
        const active = document.activeElement;
        if (!active || active === document.body || !scope.contains(active)) {
            this.focusFirst(scope);
            return;
        }
        // Sliders take left/right as value changes.
        if (active.type === "range" && (direction === "left" || direction === "right")) {
            if (direction === "right") {
                active.stepUp();
            }
            else {
                active.stepDown();
            }
            active.dispatchEvent(new Event("input", { bubbles: true }));
            active.dispatchEvent(new Event("change", { bubbles: true }));
            return;
        }
        const candidates = focusables(scope)
            .filter((element) => element !== active)
            .map((element) => ({ element, rect: element.getBoundingClientRect() }));
        const target = nearest(active.getBoundingClientRect(), candidates, direction);
        if (target) {
            this.focus(target);
        }
    }

    focus(element) {
        element.focus({ preventScroll: true });
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    }
}
