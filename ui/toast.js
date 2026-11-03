/*
 Small non-blocking notifications (controller connected, update available, ...).
 Announced to screen readers through an aria-live region.
 */
let region = null;

function ensureRegion() {
    if (!region) {
        region = document.createElement("div");
        region.className = "toasts";
        region.setAttribute("role", "status");
        region.setAttribute("aria-live", "polite");
        document.body.appendChild(region);
    }
    return region;
}

/*
 toast("Saved") or toast("Update available", { action: { label: "Reload", onClick }, timeout: 0 })
 timeout 0 keeps the toast until dismissed. Returns a function that dismisses it.
 */
export function toast(message, { action = null, timeout = 3500, icon = "" } = {}) {
    const container = ensureRegion();
    const item = document.createElement("div");
    item.className = "toast";
    if (icon) {
        const iconElement = document.createElement("span");
        iconElement.className = "toast__icon";
        iconElement.setAttribute("aria-hidden", "true");
        iconElement.textContent = icon;
        item.appendChild(iconElement);
    }
    const text = document.createElement("span");
    text.className = "toast__text";
    text.textContent = message;
    item.appendChild(text);

    const dismiss = () => {
        item.classList.add("toast--leaving");
        setTimeout(() => item.remove(), 200);
    };
    if (action) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn--small btn--primary";
        button.textContent = action.label;
        button.addEventListener("click", () => {
            dismiss();
            action.onClick();
        });
        item.appendChild(button);
    }
    if (timeout === 0) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "btn btn--icon btn--ghost btn--small";
        close.setAttribute("aria-label", "Dismiss");
        close.textContent = "✕";
        close.addEventListener("click", dismiss);
        item.appendChild(close);
    }
    container.appendChild(item);
    if (timeout > 0) {
        setTimeout(dismiss, timeout);
    }
    return dismiss;
}
