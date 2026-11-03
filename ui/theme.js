/*
 Light / dark theme. "system" follows prefers-color-scheme; "light" and "dark" override it via
 <html data-theme="...">, which css/tokens.css keys off.
 */
const THEME_COLORS = { dark: "#01315f", light: "#f3f7fb" };

export function resolvedTheme(preference) {
    if (preference === "light" || preference === "dark") {
        return preference;
    }
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(preference) {
    const root = document.documentElement;
    if (preference === "light" || preference === "dark") {
        root.dataset.theme = preference;
    }
    else {
        delete root.dataset.theme;
    }
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) {
        meta.content = THEME_COLORS[resolvedTheme(preference)];
    }
}

// Applies the saved preference and keeps it in sync with settings and the OS setting.
export function initTheme(settings) {
    applyTheme(settings.get("theme"));
    settings.addEventListener("change", (event) => {
        if (event.detail.key === "theme") {
            applyTheme(event.detail.value);
        }
    });
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => applyTheme(settings.get("theme")));
}

// Cycles system -> light -> dark -> system for the header toggle button.
export function nextTheme(preference) {
    return { system: "light", light: "dark", dark: "system" }[preference] || "system";
}
