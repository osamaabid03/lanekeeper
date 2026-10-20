// Small, dependency-free helpers around the git CLI.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export function git(cwd, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

// Returns { top, commonDir, branch } for the worktree containing `dir`, or null outside git.
export function repoInfo(dir) {
  let start = dir;
  while (start && !fs.existsSync(start)) start = path.dirname(start);
  if (!start) return null;
  const out = git(start, ['rev-parse', '--show-toplevel', '--git-common-dir', '--abbrev-ref', 'HEAD'], { allowFail: true });
  if (!out) return null;
  const [top, common, branch] = out.trim().split('\n');
  return {
    top,
    commonDir: path.resolve(start, common),
    branch: branch === 'HEAD' ? '(detached)' : branch,
  };
}

// Where Clash Map keeps its data: inside the shared git directory, so every worktree sees it.
export function storeDir(commonDir) {
  const dir = path.join(commonDir, 'clash-map');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listWorktrees(dir) {
  const out = git(dir, ['worktree', 'list', '--porcelain'], { allowFail: true }) || '';
  const trees = [];
  let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9), branch: null, head: null, bare: false, prunable: false };
      trees.push(cur);
    } else if (!cur) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      cur.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      cur.bare = true;
    } else if (line.startsWith('prunable')) {
      cur.prunable = true;
    } else if (line === 'detached') {
      cur.branch = '(detached)';
    }
  }
  return trees.filter((t) => !t.bare && !t.prunable && fs.existsSync(t.path));
}

export function detectBase(dir, preferred) {
  const exists = (ref) => git(dir, ['rev-parse', '--verify', '--quiet', ref], { allowFail: true }) !== null;
  if (preferred && exists(preferred)) return preferred;
  const originHead = git(dir, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { allowFail: true });
  if (originHead) {
    const name = originHead.trim().replace(/^refs\/remotes\/origin\//, '');
    if (exists(name)) return name;
    if (exists(`origin/${name}`)) return `origin/${name}`;
  }
  for (const candidate of ['main', 'master', 'trunk', 'develop']) {
    if (exists(candidate)) return candidate;
  }
  return null;
}
