// PWA assets: manifest fields and icons, service worker precache list, game catalogue.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { buildManifest, ROOT } from "../scripts/build-sw.mjs";

// Width and height from a PNG's IHDR chunk.
function pngSize(path) {
    const data = readFileSync(join(ROOT, path));
    assert.equal(data.toString("ascii", 1, 4), "PNG", `${path} is a PNG`);
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

test("manifest has the fields installability needs", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.webmanifest"), "utf8"));
    for (const key of ["name", "short_name", "description", "start_url", "scope", "display", "theme_color", "background_color", "icons"]) {
        assert.ok(manifest[key], key);
    }
    assert.equal(manifest.theme_color, "#01315f");
    assert.equal(manifest.display, "standalone");
    const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
    assert.ok(sizes.includes("192x192:any"));
    assert.ok(sizes.includes("512x512:any"));
    assert.ok(sizes.includes("512x512:maskable"));
    for (const icon of manifest.icons) {
        const [width, height] = pngSize(icon.src);
        assert.equal(`${width}x${height}`, icon.sizes, icon.src);
    }
});

test("apple touch icon and favicon exist at the right sizes", () => {
    assert.deepEqual(pngSize("icons/apple-touch-icon.png"), [180, 180]);
    assert.deepEqual(pngSize("icons/favicon-32.png"), [32, 32]);
});

test("both pages link the manifest and iOS meta tags", () => {
    for (const page of ["index.html", "launcher.html"]) {
        const html = readFileSync(join(ROOT, page), "utf8");
        assert.match(html, /rel="manifest" href="manifest.webmanifest"/, page);
        assert.match(html, /rel="apple-touch-icon"/, page);
        assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/, page);
        assert.match(html, /name="apple-mobile-web-app-status-bar-style"/, page);
        assert.match(html, /name="viewport"[^>]*viewport-fit=cover/, page);
    }
});

test("every precached file exists and the shell is complete", () => {
    const { entries } = buildManifest();
    const paths = entries.map(([path]) => path);
    for (const path of paths.filter((path) => path !== "./")) {
        assert.ok(existsSync(join(ROOT, path)), path);
    }
    for (const required of ["index.html", "launcher.html", "manifest.webmanifest", "Binaries/gba_bios.bin", "ui/app.js", "input/actions.js", "IodineGBA/core/Emulator.js"]) {
        assert.ok(paths.includes(required), required);
    }
    assert.ok(!paths.some((path) => path.endsWith(".gba")), "ROMs are not precached");
});

test("every script the launcher loads is precached", () => {
    const html = readFileSync(join(ROOT, "launcher.html"), "utf8");
    const paths = new Set(buildManifest().entries.map(([path]) => path));
    for (const [, src] of html.matchAll(/<script[^>]*src="([^"]+)"/g)) {
        assert.ok(paths.has(src), src);
    }
});

test("every catalogue entry has a ROM and every ROM is listed", () => {
    const context = {};
    runInNewContext(readFileSync(join(ROOT, "data/games.js"), "utf8"), context);
    const ids = context.gameLibrary.map((game) => game.id);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
    for (const game of context.gameLibrary) {
        assert.ok(game.title && game.short, game.id);
        assert.ok(existsSync(join(ROOT, "Binaries", `${game.id}.gba`)), `${game.id}.gba`);
        assert.equal(context.games[game.id], game.title);
        if (game.cover) {
            assert.ok(existsSync(join(ROOT, game.cover)), game.cover);
        }
    }
});
