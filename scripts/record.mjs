#!/usr/bin/env node
// Claude Code hook: records what each agent session is doing.
// Runs in the background (async) and never blocks or fails the session.
import path from 'node:path';
import { repoInfo } from '../lib/git.mjs';
import { appendEvent } from '../lib/store.mjs';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    setTimeout(() => resolve(data), 2000).unref();
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) return;
  const input = JSON.parse(raw);
  const eventName = input.hook_event_name;
  const cwd = input.cwd || process.cwd();

  const base = {
    ts: Date.now(),
    session: input.session_id || null,
    agent: input.agent_id || null,
    agentType: input.agent_type || null,
  };

  let event = null;
  let locateFrom = cwd;

  if (eventName === 'SessionStart') {
    event = { ...base, type: 'session', source: input.source || null };
  } else if (eventName === 'UserPromptSubmit') {
    const prompt = String(input.prompt ?? input.user_prompt ?? '').trim();
    if (!prompt || prompt.startsWith('/')) return;
    event = { ...base, type: 'prompt', prompt: prompt.slice(0, 400) };
  } else if (eventName === 'PostToolUse' && EDIT_TOOLS.has(input.tool_name)) {
    const ti = input.tool_input || {};
    const file = ti.file_path || ti.notebook_path || ti.path;
    if (!file) return;
    const abs = path.resolve(cwd, file);
    locateFrom = path.dirname(abs);
    event = { ...base, type: 'edit', tool: input.tool_name, abs };
  } else if (eventName === 'Stop' || eventName === 'SubagentStop') {
    event = { ...base, type: 'idle' };
  } else if (eventName === 'SessionEnd') {
    event = { ...base, type: 'end' };
  } else {
    return;
  }

  const info = repoInfo(locateFrom);
  if (!info) return;
  event.worktree = info.top;
  event.branch = info.branch;
  if (event.abs) {
    event.file = path.relative(info.top, event.abs).split(path.sep).join('/');
    delete event.abs;
  }
  appendEvent(info.commonDir, event);
}

main().catch(() => {}).finally(() => process.exit(0));
