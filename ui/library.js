/*
 Library page (index.html): renders the game grid from data/games.js, search and the
 "downloaded" filter, offline badges, and the menu action (opens settings).
 */
import { cachedGameIds } from "../pwa/register.js";
import { createApp } from "./app.js";
import { HintsBar } from "./hints.js";

const app = createApp();
const library = window.gameLibrary || [];

const gamesGrid = document.getElementById("game-grid");
const collectionsGrid = document.getElementById("collection-grid");
const search = document.getElementById("game-search");
const status = document.getElementById("search-status");
const empty = document.getElementById("search-empty");
const downloadedFilter = document.getElementById("filter-downloaded");
let offlineIds = new Set();

// Deterministic hue per title so placeholder tiles differ but stay on-brand (blues/violets).
function hueFor(text) {
    let hash = 0;
    for (const char of text) {
        hash = (hash * 31 + char.charCodeAt(0)) | 0;
    }
    return 190 + Math.abs(hash) % 70;
}

function initials(title) {
    const words = title.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

function placeholder(game) {
    const tile = document.createElement("span");
    tile.className = "card__placeholder";
    tile.style.setProperty("--tile-hue", hueFor(game.title));
    tile.setAttribute("aria-hidden", "true");
    tile.textContent = initials(game.short);
    return tile;
}

// Cover image element with lazy loading and a placeholder fallback if it fails to load.
function coverImage(game, src) {
    const image = document.createElement("img");
    image.src = src;
    image.alt = `${game.title} cover`;
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 256;
    image.height = 256;
    image.addEventListener("error", () => image.replaceWith(placeholder(game)), { once: true });
    return image;
}

function card(game) {
    const item = document.createElement("li");
    item.className = "grid__item";
    item.dataset.search = `${game.title} ${game.short}`.toLowerCase();
    item.dataset.id = game.id;

    const link = document.createElement("a");
    link.className = "card";
    link.href = `./launcher.html#${encodeURIComponent(game.id)}`;
    link.setAttribute("aria-label", `Play ${game.title}`);

    const art = document.createElement("span");
    art.className = "card__art";
    if (game.cover) {
        art.appendChild(coverImage(game, game.cover));
    }
    else {
        art.appendChild(placeholder(game));
    }
    const title = document.createElement("span");
    title.className = "card__title";
    title.textContent = game.short;
    title.title = game.title;
    const badge = document.createElement("span");
    badge.className = "card__badge";
    badge.textContent = "Offline";
    badge.hidden = true;

    link.append(art, title, badge);
    item.appendChild(link);
    return item;
}

function render() {
    const games = library.filter((game) => !game.collection);
    const collections = library.filter((game) => game.collection);
    gamesGrid.replaceChildren(...games.map(card));
    collectionsGrid.replaceChildren(...collections.map(card));
    document.getElementById("game-count").textContent = `${library.length} games`;
}

function applyFilter() {
    const query = search.value.trim().toLowerCase();
    const onlyDownloaded = downloadedFilter.getAttribute("aria-pressed") === "true";
    let shown = 0;
    document.querySelectorAll(".grid__item").forEach((item) => {
        const visible = (!query || item.dataset.search.includes(query)) && (!onlyDownloaded || offlineIds.has(item.dataset.id));
        item.hidden = !visible;
        shown += visible ? 1 : 0;
    });
    document.querySelectorAll("[data-section]").forEach((section) => {
        section.hidden = !section.querySelector(".grid__item:not([hidden])");
    });
    empty.hidden = shown > 0;
    status.textContent = query || onlyDownloaded ? `${shown} game${shown === 1 ? "" : "s"} found` : "";
}

async function refreshOffline() {
    offlineIds = await cachedGameIds();
    document.querySelectorAll(".grid__item").forEach((item) => {
        const cached = offlineIds.has(item.dataset.id);
        item.querySelector(".card__badge").hidden = !cached;
        item.classList.toggle("grid__item--unavailable", !navigator.onLine && !cached);
    });
    applyFilter();
}

/*
 Optional box art: covers/manifest.json maps game id -> image path, either as a string or as
 { "file": "..." }. Paths starting with "covers/" or "/" are taken from the site root, anything
 else is relative to the covers/ folder. Entries here take priority over data/games.js covers.
 Missing manifest or images simply keep the placeholder tiles.
 */
async function loadCoverManifest() {
    let manifest;
    try {
        const response = await fetch("covers/manifest.json");
        if (!response.ok) {
            return;
        }
        manifest = await response.json();
    }
    catch (error) {
        return;
    }
    const byId = new Map(library.map((game) => [game.id, game]));
    for (const [id, entry] of Object.entries(manifest || {})) {
        const file = typeof entry === "string" ? entry : entry && (entry.file || entry.path || entry.image);
        const game = byId.get(id);
        const item = document.querySelector(`.grid__item[data-id="${CSS.escape(id)}"]`);
        if (!file || !game || !item) {
            continue;
        }
        const src = /^(covers\/|\/|https?:)/.test(file) ? file : `covers/${file}`;
        item.querySelector(".card__art").replaceChildren(coverImage(game, src));
    }
}

render();
loadCoverManifest();
search.addEventListener("input", applyFilter);
downloadedFilter.addEventListener("click", () => {
    downloadedFilter.setAttribute("aria-pressed", String(downloadedFilter.getAttribute("aria-pressed") !== "true"));
    applyFilter();
});
window.addEventListener("online", refreshOffline);
window.addEventListener("offline", refreshOffline);
document.addEventListener("offlinegameschange", refreshOffline);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        refreshOffline();
    }
});
refreshOffline();

// The library is always in menu mode: directions move focus, confirm opens a game,
// the menu action toggles settings.
app.manager.addEventListener("actiondown", (event) => {
    if (event.detail.action !== "menu" || event.detail.repeat) {
        return;
    }
    if (app.dialogs.isOpen()) {
        app.dialogs.close();
    }
    else {
        app.settingsDialog.open();
    }
});

new HintsBar(document.getElementById("hints"), app, () => [
    { action: "confirm", label: "Play" },
    { action: "back", label: "Back" },
    { action: "menu", label: "Settings" }
]);

// App shortcut / deep link: index.html#controls opens the Controls screen.
if (location.hash === "#controls") {
    app.settingsDialog.open("controls");
}
