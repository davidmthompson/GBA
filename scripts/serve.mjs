#!/usr/bin/env node
/*
 Minimal static server for local development (Node built-ins only).
   npm run serve            http://localhost:8080
   PORT=3000 npm run serve
 Service workers need a secure context; http://localhost counts as one, so the PWA works
 locally. Use HTTPS (e.g. Vercel) anywhere else.
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { ROOT } from "./build-sw.mjs";

const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".gba": "application/octet-stream",
    ".bin": "application/octet-stream",
    ".swf": "application/x-shockwave-flash",
    ".md": "text/markdown; charset=utf-8"
};

const server = createServer((request, response) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    }
    catch (error) {
        response.writeHead(400).end("Bad request");
        return;
    }
    if (pathname.endsWith("/")) {
        pathname += "index.html";
    }
    const file = normalize(join(ROOT, pathname));
    if (!file.startsWith(ROOT + sep) || file.includes(`${sep}.git`)) {
        response.writeHead(403).end("Forbidden");
        return;
    }
    let stats;
    try {
        stats = statSync(file);
    }
    catch (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
    }
    if (stats.isDirectory()) {
        response.writeHead(301, { Location: `${pathname}/` }).end();
        return;
    }
    response.writeHead(200, {
        "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": stats.size,
        // Always revalidate during development (and the service worker script in production too).
        "Cache-Control": "no-cache",
        "Service-Worker-Allowed": "/"
    });
    if (request.method === "HEAD") {
        response.end();
        return;
    }
    createReadStream(file).pipe(response);
});

server.listen(PORT, () => {
    console.log(`Serving ${ROOT} at http://localhost:${PORT}/`);
});
