#!/usr/bin/env node
/*
 Writes the precache manifest into sw.js (between "// @precache-start" and "// @precache-end").
 Each entry is [path, contentHash]; VERSION is a hash of the whole list, so any change to a
 precached file produces a new service worker and triggers the "Update available" prompt.

   npm run build:sw            update sw.js
   npm run build:sw -- --check exit with code 1 if sw.js is out of date (used by npm test)

 Node built-ins only.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Directories whose matching files are precached (recursively).
const SHELL_DIRECTORIES = [
    ["css", /\.css$/],
    ["user_css", /\.css$/],
    ["data", /\.js$/],
    ["ui", /\.js$/],
    ["input", /\.js$/],
    ["pwa", /\.js$/],
    ["IodineGBA", /\.js$/],
    ["user_scripts", /\.js$/],
    ["icons", /\.png$/]
];
const SHELL_FILES = ["index.html", "launcher.html", "manifest.webmanifest", "Binaries/gba_bios.bin"];

function walk(directory, pattern) {
    const found = [];
    for (const name of readdirSync(join(ROOT, directory))) {
        const path = join(directory, name);
        if (statSync(join(ROOT, path)).isDirectory()) {
            found.push(...walk(path, pattern));
        }
        else if (pattern.test(name)) {
            found.push(path.split(sep).join("/"));
        }
    }
    return found;
}

export function precacheFiles() {
    const files = [...SHELL_FILES];
    for (const [directory, pattern] of SHELL_DIRECTORIES) {
        files.push(...walk(directory, pattern));
    }
    return [...new Set(files)].sort();
}

function hashFile(path) {
    // Normalise line endings so Windows (CRLF checkout) and CI (LF) agree on the hash.
    const content = readFileSync(join(ROOT, path));
    const text = /\.(html|css|js|mjs|json|webmanifest)$/.test(path) ? Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n")) : content;
    return createHash("sha256").update(text).digest("hex").slice(0, 10);
}

export function buildManifest() {
    const entries = precacheFiles().map((path) => [path, hashFile(path)]);
    // "./" is the start_url; it serves index.html.
    const index = entries.find(([path]) => path === "index.html");
    entries.unshift(["./", index[1]]);
    const version = createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 12);
    return { version, entries };
}

export function renderBlock({ version, entries }) {
    const lines = entries.map(([path, revision]) => `    [${JSON.stringify(path)}, ${JSON.stringify(revision)}]`).join(",\n");
    return `// @precache-start\nconst VERSION = ${JSON.stringify(version)};\nconst PRECACHE = [\n${lines}\n];\n// @precache-end`;
}

export function injectInto(source, block) {
    const pattern = /\/\/ @precache-start[\s\S]*?\/\/ @precache-end/;
    if (!pattern.test(source)) {
        throw new Error("sw.js is missing the @precache-start / @precache-end markers");
    }
    return source.replace(pattern, block);
}

function main() {
    const swPath = join(ROOT, "sw.js");
    const current = readFileSync(swPath, "utf8");
    const manifest = buildManifest();
    const updated = injectInto(current, renderBlock(manifest));
    const normalise = (text) => text.replace(/\r\n/g, "\n");
    if (process.argv.includes("--check")) {
        if (normalise(updated) !== normalise(current)) {
            console.error("sw.js precache manifest is out of date. Run: npm run build:sw");
            process.exit(1);
        }
        console.log(`sw.js is up to date (version ${manifest.version}, ${manifest.entries.length} files).`);
        return;
    }
    writeFileSync(swPath, updated);
    console.log(`Wrote sw.js: version ${manifest.version}, ${manifest.entries.length} precached files (${relative(process.cwd(), swPath) || "sw.js"}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main();
}
