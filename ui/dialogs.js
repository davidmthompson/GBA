/*
 Modal dialog stack built on <dialog>. Opening a dialog switches input to "menu" mode;
 closing the last one calls onEmpty (the launcher uses it to resume the game).
 Dialogs with [data-animate-close] get an "is-closing" class for --duration before they close,
 so CSS can fade them out (reduced motion sets --duration to 0, which closes at once).
 */
function closeDelay(dialog) {
    if (!dialog.hasAttribute("data-animate-close")) {
        return 0;
    }
    const value = getComputedStyle(dialog).getPropertyValue("--duration").trim();
    const ms = value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
    return Number.isFinite(ms) ? ms : 0;
}

export class DialogStack {
    constructor(manager, nav, { onEmpty = () => {}, onOpen = () => {} } = {}) {
        this.manager = manager;
        this.nav = nav;
        this.onEmpty = onEmpty;
        this.onOpen = onOpen;
        this.stack = [];
    }

    top() {
        return this.stack[this.stack.length - 1] || null;
    }

    isOpen() {
        return this.stack.length > 0;
    }

    open(dialog, { focus = null } = {}) {
        if (this.stack.includes(dialog)) {
            return;
        }
        if (!dialog.dataset.stackReady) {
            dialog.dataset.stackReady = "true";
            // Esc / Android back: route through close() so the stack stays in sync.
            dialog.addEventListener("cancel", (event) => {
                event.preventDefault();
                this.close(dialog);
            });
            // Clicking the backdrop closes the dialog.
            dialog.addEventListener("click", (event) => {
                if (event.target === dialog) {
                    this.close(dialog);
                }
            });
        }
        const returnFocus = document.activeElement;
        this.stack.push(dialog);
        this.manager.setMode("menu");
        this.onOpen(dialog);
        if (dialog.closeTimer) {
            // Reopened while fading out: keep it open and keep the original return target.
            clearTimeout(dialog.closeTimer);
            dialog.closeTimer = null;
            dialog.classList.remove("is-closing");
        }
        else {
            dialog.returnFocusTo = returnFocus;
            dialog.showModal();
        }
        const target = focus ? dialog.querySelector(focus) : null;
        if (target) {
            target.focus();
        }
        else {
            this.nav.focusFirst(dialog);
        }
        dialog.dispatchEvent(new CustomEvent("dialogopen"));
    }

    close(dialog = this.top()) {
        if (!dialog || !this.stack.includes(dialog)) {
            return;
        }
        dialog.dispatchEvent(new CustomEvent("dialogclose"));
        this.stack = this.stack.filter((each) => each !== dialog);
        const finish = () => {
            dialog.closeTimer = null;
            dialog.classList.remove("is-closing");
            dialog.close();
            if (dialog.returnFocusTo && dialog.returnFocusTo.isConnected) {
                dialog.returnFocusTo.focus({ preventScroll: true });
            }
        };
        const delay = closeDelay(dialog);
        if (delay > 0) {
            dialog.classList.add("is-closing");
            dialog.closeTimer = setTimeout(finish, delay);
        }
        else {
            finish();
        }
        if (!this.stack.length) {
            this.onEmpty();
        }
    }

    closeAll() {
        while (this.stack.length) {
            this.close();
        }
    }
}
