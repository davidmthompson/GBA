/*
 Modal dialog stack built on <dialog>. Opening a dialog switches input to "menu" mode;
 closing the last one calls onEmpty (the launcher uses it to resume the game).
 */
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
        dialog.returnFocusTo = returnFocus;
        this.manager.setMode("menu");
        this.onOpen(dialog);
        dialog.showModal();
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
        dialog.close();
        if (dialog.returnFocusTo && dialog.returnFocusTo.isConnected) {
            dialog.returnFocusTo.focus({ preventScroll: true });
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
