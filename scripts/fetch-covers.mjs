#!/usr/bin/env node
/*
 Downloads box art from libretro-thumbnails (Nintendo_-_Game_Boy_Advance/Named_Boxarts) for every
 line of covers/sources.list ("id|filename|libretro name[|fallback name]"), resizes it to a centred
 256x256 transparent PNG with scripts/resize-covers.ps1, and writes covers/manifest.json.

   npm run fetch:covers

 Node built-ins only; the resize step needs Windows PowerShell (System.Drawing).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = "https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Game_Boy_Advance/master/Named_Boxarts/";
const CONCURRENCY = 6;
const ATTEMPTS = 3;

function readSources() {
    return readFileSync(join(ROOT, "covers", "sources.list"), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
            const [id, file, ...names] = line.split("|");
            return { id, file, names: names.filter(Boolean) };
        });
}

// Returns the PNG bytes, null on 404, and throws after ATTEMPTS failures of any other kind.
async function download(name) {
    const url = BASE_URL + encodeURIComponent(name) + ".png";
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(url);
            if (response.status === 404) {
                return null;
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return Buffer.from(await response.arrayBuffer());
        }
        catch (error) {
            if (attempt >= ATTEMPTS) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
        }
    }
}

async function fetchSource(source, directory) {
    for (const name of source.names) {
        const data = await download(name);
        if (data) {
            const path = join(directory, source.file);
            writeFileSync(path, data);
            return { ...source, path, name };
        }
    }
    throw new Error(`not found: ${source.names.join(" / ")}`);
}

async function main() {
    const sources = readSources();
    const directory = mkdtempSync(join(tmpdir(), "gba-covers-"));
    const fetched = [];
    const failures = [];
    let next = 0;
    async function worker() {
        while (next < sources.length) {
            const source = sources[next++];
            try {
                const result = await fetchSource(source, directory);
                if (result.name !== source.names[0]) {
                    console.log(`${source.id}: used fallback "${result.name}"`);
                }
                fetched.push(result);
            }
            catch (error) {
                failures.push(`${source.id}: ${error.message}`);
            }
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const jobFile = join(directory, "jobs.txt");
    writeFileSync(jobFile, fetched.map((item) => `${item.path}|${join(ROOT, "covers", item.file)}`).join("\n"), "utf8");
    try {
        execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(ROOT, "scripts", "resize-covers.ps1"), "-JobFile", jobFile], { stdio: "inherit" });
    }
    catch (error) {
        failures.push(`resize: ${error.status} image(s) failed`);
    }
    rmSync(directory, { recursive: true, force: true });

    const manifest = {};
    for (const source of sources) {
        if (fetched.some((item) => item.id === source.id) && existsSync(join(ROOT, "covers", source.file))) {
            manifest[source.id] = `covers/${source.file}`;
        }
    }
    writeFileSync(join(ROOT, "covers", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    console.log(`${Object.keys(manifest).length} of ${sources.length} covers written to covers/.`);
    if (failures.length) {
        console.error(`Failures:\n  ${failures.join("\n  ")}`);
        process.exitCode = 1;
    }
}

main();
