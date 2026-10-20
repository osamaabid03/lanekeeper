#!/usr/bin/env node
// Local-only web server for the Clash Map page. Usage: node server.mjs <repo-dir>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect } from '../lib/detect.mjs';
import { repoInfo, storeDir } from '../lib/git.mjs';
import { compactEvents } from '../lib/store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(here, '..', 'ui', 'index.html');
const IDLE_EXIT_MS = 2 * 60 * 60 * 1000; // stop after two hours without visitors

const info = repoInfo(path.resolve(process.argv[2] || process.cwd()));
if (!info) {
  console.error('clash-map: not inside a git repository');
  process.exit(2);
}
const serverFile = path.join(storeDir(info.commonDir), 'server.json');

let cache = { at: 0, body: null };
function state() {
  const now = Date.now();
  if (cache.body && now - cache.at < 1500) return cache.body;
  let body;
  try {
    body = JSON.stringify(detect(info.top, { base: process.env.CLASH_MAP_BASE }));
  } catch (err) {
    body = JSON.stringify({ error: err.message });
  }
  cache = { at: now, body };
  return body;
}

let lastRequest = Date.now();
const server = http.createServer((req, res) => {
  // Only answer requests addressed to this machine (guards against DNS rebinding).
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
    res.writeHead(403).end();
    return;
  }
  lastRequest = Date.now();
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(UI));
  } else if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(state());
  } else if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, root: info.top, pid: process.pid }));
  } else {
    res.writeHead(404).end();
  }
});

function cleanup() {
  try {
    const current = JSON.parse(fs.readFileSync(serverFile, 'utf8'));
    if (current.pid === process.pid) fs.unlinkSync(serverFile);
  } catch {}
}

const firstPort = Number(process.env.CLASH_MAP_PORT) || 4777;
function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < firstPort + 20) listen(port + 1);
    else {
      console.error(`clash-map: ${err.message}`);
      process.exit(2);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    fs.writeFileSync(serverFile, JSON.stringify({ port, pid: process.pid, root: info.top, startedAt: Date.now() }));
    console.log(`Clash Map running at http://127.0.0.1:${port}`);
  });
}
listen(firstPort);

setInterval(() => {
  try {
    compactEvents(info.commonDir);
  } catch {}
  if (Date.now() - lastRequest > IDLE_EXIT_MS) {
    cleanup();
    process.exit(0);
  }
}, 60 * 1000).unref();

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);
