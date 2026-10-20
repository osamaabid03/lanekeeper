// Append-only event log shared by every worktree of a repository.
// v1 uses a JSON Lines file: no native dependencies, safe for small concurrent appends.
import fs from 'node:fs';
import path from 'node:path';
import { storeDir } from './git.mjs';

const MAX_EVENTS = 5000;

export function eventsPath(commonDir) {
  return path.join(storeDir(commonDir), 'events.jsonl');
}

export function appendEvent(commonDir, event) {
  fs.appendFileSync(eventsPath(commonDir), JSON.stringify(event) + '\n');
}

export function readEvents(commonDir) {
  const file = eventsPath(commonDir);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const events = [];
  for (const line of lines.slice(-MAX_EVENTS)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A half-written line from a concurrent append: skip it.
    }
  }
  return events;
}

// Keeps the log from growing forever: called by the server now and then.
export function compactEvents(commonDir) {
  const file = eventsPath(commonDir);
  if (!fs.existsSync(file)) return;
  const { size } = fs.statSync(file);
  if (size < 2 * 1024 * 1024) return;
  const keep = readEvents(commonDir).slice(-MAX_EVENTS / 2);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, keep.map((e) => JSON.stringify(e)).join('\n') + '\n');
  fs.renameSync(tmp, file);
}
