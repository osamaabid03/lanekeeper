#!/usr/bin/env node
// Starts the Lanekeeper page for the repository in the current directory (or reuses a running one)
// and prints its address. Usage: node start.mjs [--repo DIR] [--open] [--stop]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repoInfo, storeDir } from '../lib/git.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const i = process.argv.indexOf('--repo');
const repo = path.resolve(i > -1 ? process.argv[i + 1] : process.cwd());

const info = repoInfo(repo);
if (!info) {
  console.error('lanekeeper: run this inside a git repository (any of its worktrees).');
  process.exit(2);
}
const serverFile = path.join(storeDir(info.commonDir), 'server.json');

function readServer() {
  try {
    return JSON.parse(fs.readFileSync(serverFile, 'utf8'));
  } catch {
    return null;
  }
}

async function healthy(s) {
  if (!s) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${s.port}/api/health`, { signal: AbortSignal.timeout(800) });
    const body = await res.json();
    return body.ok && body.pid === s.pid;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let s = readServer();

  if (process.argv.includes('--stop')) {
    if (s && (await healthy(s))) {
      process.kill(s.pid, 'SIGTERM');
      console.log('Lanekeeper stopped.');
    } else {
      console.log('Lanekeeper is not running.');
    }
    return;
  }

  if (!(await healthy(s))) {
    const child = spawn(process.execPath, [path.join(here, '..', 'server', 'server.mjs'), info.top], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
    s = null;
    for (let k = 0; k < 50 && !s; k++) {
      await sleep(100);
      const candidate = readServer();
      if (candidate && candidate.pid === child.pid && (await healthy(candidate))) s = candidate;
    }
    if (!s) {
      console.error('lanekeeper: the server did not start. Try: node server/server.mjs <repo> to see the error.');
      process.exit(2);
    }
  }

  const url = `http://127.0.0.1:${s.port}`;
  console.log(`Lanekeeper is running at ${url}`);
  if (process.argv.includes('--open')) openBrowser(url);
}

main();
