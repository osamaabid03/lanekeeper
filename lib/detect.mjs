// Clash detection across every git worktree of a repository.
//
// For each worktree (one per agent) we diff its working tree against the point where it
// branched from the base branch, then compare those changes pairwise:
//   1. removed-used  : one agent removed or renamed a definition that another agent is building on
//   2. same-function : both agents changed the same function or class in the same file
//   3. lockfile      : both agents changed the same dependency lockfile
//   4. same-file     : both agents changed the same file in different places
import fs from 'node:fs';
import path from 'node:path';
import { git, listWorktrees, detectBase, repoInfo, mergeConflicts, dirtyFiles } from './git.mjs';
import { readEvents } from './store.mjs';

const LOCKFILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock', 'npm-shrinkwrap.json',
  'poetry.lock', 'Pipfile.lock', 'uv.lock', 'Cargo.lock', 'go.sum', 'Gemfile.lock', 'composer.lock',
]);

const NOT_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'else', 'do', 'try', 'new', 'typeof',
  'await', 'super', 'elif', 'with', 'yield', 'async', 'def', 'class', 'import', 'from', 'export',
  'default', 'const', 'let', 'var', 'public', 'private', 'protected', 'static', 'get', 'set', 'func', 'fn',
]);

// Names too common to be meaningful when one agent removes them.
const GENERIC = new Set([
  'constructor', 'init', '__init__', 'main', 'test', 'index', 'render', 'setup', 'run', 'handle', 'update',
  'value', 'data', 'name', 'id', 'type', 'toString', 'props', 'state', 'default', 'module', 'exports',
]);

const DEF_PATTERNS = [
  /\b(?:function\*?|class|interface|enum|struct|trait|protocol)\s+([A-Za-z_$][\w$]*)/,
  /\btype\s+([A-Z][\w$]*)\s*[=<]/,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/,
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
  /^\s*(?:(?:public|private|protected|static|async|override|readonly|abstract|export|default)\s+)*(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^()]*\)\s*(?::\s*[^={;]+)?\{\s*$/,
];

export function definitionsIn(line) {
  const names = new Set();
  for (const re of DEF_PATTERNS) {
    const m = line.match(re);
    if (m && m[1] && !NOT_NAMES.has(m[1])) names.add(m[1]);
  }
  return [...names];
}

function identifiersIn(line) {
  return line.match(/[A-Za-z_$][\w$]*/g) || [];
}

function newFile(p, status) {
  return { path: p, status, symbols: new Set(), added: [], removed: [] };
}

// Parses `git diff -U0` output into per-file changes.
export function parseDiff(text) {
  const files = [];
  let cur = null;
  let oldPath = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      cur = null;
      oldPath = null;
      continue;
    }
    if (line.startsWith('--- ')) {
      oldPath = line === '--- /dev/null' ? null : line.slice(6);
      continue;
    }
    if (line.startsWith('+++ ')) {
      const newPath = line === '+++ /dev/null' ? null : line.slice(6);
      const status = !oldPath ? 'added' : !newPath ? 'deleted' : 'modified';
      cur = newFile(newPath || oldPath, status);
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('@@')) {
      const context = line.replace(/^@@[^@]*@@\s?/, '');
      for (const name of definitionsIn(context)) cur.symbols.add(name);
      continue;
    }
    if (line.startsWith('+')) cur.added.push(line.slice(1));
    else if (line.startsWith('-')) cur.removed.push(line.slice(1));
  }
  for (const f of files) {
    for (const l of [...f.added, ...f.removed]) for (const name of definitionsIn(l)) f.symbols.add(name);
  }
  return files;
}

function untrackedFiles(wt) {
  const out = git(wt, ['ls-files', '--others', '--exclude-standard', '-z'], { allowFail: true }) || '';
  const files = [];
  for (const rel of out.split('\0').filter(Boolean)) {
    const abs = path.join(wt, rel);
    let content = '';
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile() || stat.size > 1024 * 1024) continue;
      content = fs.readFileSync(abs, 'utf8');
      if (content.includes('\0')) content = '';
    } catch {
      continue;
    }
    const f = newFile(rel, 'added');
    f.added = content.split('\n');
    for (const l of f.added) for (const name of definitionsIn(l)) f.symbols.add(name);
    files.push(f);
  }
  return files;
}

// Everything one worktree has changed since it branched from the base.
export function analyzeWorktree(wt, base) {
  const mergeBase = (git(wt, ['merge-base', base, 'HEAD'], { allowFail: true }) || '').trim();
  if (!mergeBase) return null;
  const diff = git(wt, ['-c', 'core.quotePath=false', 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', mergeBase], { allowFail: true }) || '';
  const files = [...parseDiff(diff), ...untrackedFiles(wt)];

  const definedAdded = new Set();
  const definedRemoved = new Map(); // name -> file
  const references = new Map(); // identifier -> { file, line }
  for (const f of files) {
    for (const l of f.added) {
      for (const name of definitionsIn(l)) definedAdded.add(name);
      for (const id of identifiersIn(l)) if (!references.has(id)) references.set(id, { file: f.path, line: l.trim() });
    }
    for (const l of f.removed) for (const name of definitionsIn(l)) if (!definedRemoved.has(name)) definedRemoved.set(name, f.path);
  }
  const removedDefs = new Map([...definedRemoved].filter(([name]) => !definedAdded.has(name) && name.length >= 3 && !GENERIC.has(name)));

  return { mergeBase, files, removedDefs, references, dirty: dirtyFiles(wt) };
}

export function lockfileNote(file) {
  const pkg = (l) => l.match(/^\s*"node_modules\/((?:@[^/"]+\/)?[^/"]+)"\s*:/)?.[1];
  const before = new Set(file.removed.map(pkg).filter(Boolean));
  const added = new Set(file.added.map(pkg).filter((n) => n && !before.has(n)));
  if (added.size) return `Added ${[...added].slice(0, 3).join(', ')}${added.size > 3 ? ` and ${added.size - 3} more` : ''}`;
  return `Changed ${file.path}`;
}

// "Agent B (agent/stripe)": the branch lets whichever agent reads a pasted note recognise itself.
const who = (a) => `${a.name} (${a.branch})`;

const GIT_NOTE = {
  conflict: 'Git will also report a text conflict here when you merge these branches, so you will be warned at merge time.',
  clean: 'As committed so far, Git merges the files involved without a conflict, so nothing will warn you.',
  uncommitted: 'Git can only check committed work, and some of these changes are not committed yet.',
};

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

export function detect(repoDir, { base: preferredBase, now = Date.now() } = {}) {
  const info = repoInfo(repoDir);
  if (!info) throw new Error(`Not inside a git repository: ${repoDir}`);
  const base = detectBase(info.top, preferredBase);
  if (!base) throw new Error('Could not find a base branch (tried main, master, trunk, develop). Pass --base.');

  const events = readEvents(info.commonDir);
  const trees = listWorktrees(info.top);
  const lettersFor = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Letters follow worktree creation order and are handed out before idle worktrees are filtered out,
  // so an agent keeps its letter when others appear. (Where the filesystem has no creation time, path order.)
  const born = (p) => {
    try {
      return fs.statSync(path.join(p, '.git')).birthtimeMs;
    } catch {
      return 0;
    }
  };
  const isBase = (t) => t.branch === base || `origin/${t.branch}` === base;
  trees.sort((x, y) => born(x.path) - born(y.path) || x.path.localeCompare(y.path));
  const letters = new Map(trees.filter((t) => !isBase(t)).map((t, i) => [t.path, lettersFor[i] || String(i + 1)]));

  const agents = [];
  for (const t of trees) {
    const analysis = analyzeWorktree(t.path, base);
    if (!analysis) continue;
    const mine = events.filter((e) => e.worktree === t.path);
    const onBase = isBase(t);
    if (onBase && analysis.files.length === 0) continue;
    if (!onBase && analysis.files.length === 0 && mine.length === 0) continue;

    const last = mine[mine.length - 1];
    const lastSession = last?.session;
    const prompts = mine.filter((e) => e.type === 'prompt');
    const sessionPrompt = prompts.find((e) => e.session === lastSession) || prompts[prompts.length - 1];
    let status = 'no activity recorded';
    if (last) {
      const recent = now - last.ts < 3 * 60 * 1000;
      status = recent && !['idle', 'end'].includes(last.type) ? 'working' : 'idle';
    }
    const recentEdits = new Map();
    for (const e of mine) if (e.type === 'edit' && now - e.ts < 2 * 60 * 1000) recentEdits.set(e.file, e.ts);

    const letter = letters.get(t.path) || '•';
    agents.push({
      id: letter,
      letter,
      name: `Agent ${letter}`,
      branch: t.branch,
      path: t.path,
      head: t.head,
      task: sessionPrompt?.prompt || null,
      status,
      lastActive: last?.ts || null,
      analysis,
      recentEdits,
    });
  }

  const clashes = [];
  const add = (c) => clashes.push(c);

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const A = agents[i];
      const B = agents[j];
      const filesA = new Map(A.analysis.files.map((f) => [f.path, f]));
      const filesB = new Map(B.analysis.files.map((f) => [f.path, f]));

      // 1. Removed or renamed in one branch, still being built on in the other.
      const coveredFiles = new Set();
      for (const [X, Y] of [[A, B], [B, A]]) {
        const touchedY = new Map();
        for (const f of Y.analysis.files) for (const s of f.symbols) if (!touchedY.has(s)) touchedY.set(s, f.path);
        for (const [sym, fileX] of X.analysis.removedDefs) {
          const ref = Y.analysis.references.get(sym);
          const touchedIn = touchedY.get(sym);
          if (!ref && !touchedIn) continue;
          const fileY = touchedIn || ref.file;
          const extends_ = Boolean(touchedIn);
          coveredFiles.add(`${fileX}\u0000${fileY}`);
          add({
            severity: 'high',
            kind: 'removed-used',
            agents: [X.id, Y.id],
            files: { [X.id]: fileX, [Y.id]: fileY },
            symbol: sym,
            title: `${sym}: removed by ${X.name}, ${extends_ ? 'extended' : 'used'} by ${Y.name}`,
            explain: `${who(X)} removed or renamed ${sym} in ${fileX}, but ${who(Y)} is ${extends_ ? 'changing' : 'calling'} it in ${fileY}. ${Y.name}'s work may point at something that no longer exists.`,
            did: {
              [X.id]: `Removed or renamed ${sym} in ${fileX}`,
              [Y.id]: extends_ ? `Changes ${sym} in ${fileY}` : `Uses ${sym} in ${fileY}: ${ref.line.slice(0, 90)}`,
            },
            fix: `Decide which direction wins. If both are needed, agree on one shared interface first, then have ${Y.name} build against ${X.name}'s new version.`,
          });
        }
      }

      for (const [p, fa] of filesA) {
        const fb = filesB.get(p);
        if (!fb) continue;
        const base_ = path.posix.basename(p);

        // 3. Lockfiles: merge cleanly but can silently drop a dependency.
        if (LOCKFILES.has(base_)) {
          add({
            severity: 'medium',
            kind: 'lockfile',
            agents: [A.id, B.id],
            files: { [A.id]: p, [B.id]: p },
            title: `Both changed ${base_}`,
            explain: `${who(A)} and ${who(B)} both changed ${p}. Lockfiles often merge in a way that silently drops one side's packages.`,
            did: { [A.id]: lockfileNote(fa), [B.id]: lockfileNote(fb) },
            fix: 'Merge one branch first, then rerun the install on the other instead of merging the lockfile by hand.',
          });
          continue;
        }

        if (coveredFiles.has(`${p}\u0000${p}`)) continue;

        // 2. Same function or class in the same file.
        const shared = [...fa.symbols].filter((s) => fb.symbols.has(s));
        if (shared.length) {
          const names = shared.slice(0, 3).join(', ');
          add({
            severity: 'medium',
            kind: 'same-function',
            agents: [A.id, B.id],
            files: { [A.id]: p, [B.id]: p },
            symbol: shared[0],
            title: `Both changed ${names} in ${base_}`,
            explain: `${who(A)} and ${who(B)} both changed ${names} in ${p}, without seeing each other's edits. Git may merge them cleanly while the combined logic no longer makes sense.`,
            did: { [A.id]: `Changed ${names}`, [B.id]: `Changed ${names}` },
            fix: 'Merge one branch first, then have the other agent rebase and re-read the function before continuing.',
          });
          continue;
        }

        // 4. Same file, different places.
        add({
          severity: 'low',
          kind: 'same-file',
          agents: [A.id, B.id],
          files: { [A.id]: p, [B.id]: p },
          title: `Both changed ${base_}`,
          explain: `${who(A)} and ${who(B)} both changed ${p}, in different places. Usually fine, but worth a look.`,
          did: { [A.id]: `Changed ${p}`, [B.id]: `Changed ${p}` },
          fix: 'Merge one branch, rebase the other, and run the tests on the merged result.',
        });
      }
    }
  }

  // Ask Git itself: would these two branches conflict as committed so far? Findings above are about
  // meaning; this says whether Git will warn you, or stay silent.
  for (const c of clashes) {
    const [x, y] = c.agents.map((id) => agents.find((a) => a.id === id));
    const conflicts = mergeConflicts(info.top, x.head, y.head);
    if (!conflicts) continue;
    const uncommitted = x.analysis.dirty.has(c.files[x.id]) || y.analysis.dirty.has(c.files[y.id]);
    c.git = uncommitted ? 'uncommitted' : Object.values(c.files).some((f) => conflicts.has(f)) ? 'conflict' : 'clean';
    c.explain += ` ${GIT_NOTE[c.git]}`;
  }

  clashes.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  clashes.forEach((c, k) => {
    c.id = `c${k + 1}`;
    c.tag = `Clash ${k + 1}`;
  });

  // Per-agent file list with clash tags.
  const outAgents = agents.map((a) => {
    const files = a.analysis.files.map((f) => {
      const tags = clashes.filter((c) => c.files[a.id] === f.path).map((c) => ({ id: c.id, tag: c.tag, severity: c.severity }));
      const removed = [...a.analysis.removedDefs].filter(([, file]) => file === f.path).map(([n]) => n);
      return {
        path: f.path,
        status: f.status,
        symbols: [...f.symbols].slice(0, 6),
        removed,
        live: a.recentEdits.has(f.path),
        clashes: tags,
      };
    });
    files.sort((x, y) => (y.clashes.length - x.clashes.length) || x.path.localeCompare(y.path));
    return {
      id: a.id,
      letter: a.letter,
      name: a.name,
      branch: a.branch,
      path: a.path,
      task: a.task,
      status: a.status,
      lastActive: a.lastActive,
      files,
      clashCount: new Set(clashes.filter((c) => c.agents.includes(a.id)).map((c) => c.id)).size,
    };
  });

  // Suggested merge order: clash-free first, agents whose removals break others last.
  const removerOf = (id) => clashes.filter((c) => c.kind === 'removed-used' && c.agents[0] === id);
  const order = [...outAgents].sort((x, y) => {
    const rx = removerOf(x.id).length;
    const ry = removerOf(y.id).length;
    if ((x.clashCount === 0) !== (y.clashCount === 0)) return x.clashCount === 0 ? -1 : 1;
    if (rx !== ry) return rx - ry;
    return x.clashCount - y.clashCount;
  });
  const mergeOrder = order.map((a) => {
    const removals = removerOf(a.id);
    let note;
    if (a.clashCount === 0) note = 'No clashes. Merge now.';
    else if (removals.length) note = `After resolving ${removals.map((c) => c.tag).join(', ')}.`;
    else note = 'Then rebase the others and check again.';
    return { id: a.id, name: a.name, branch: a.branch, note };
  });

  const mainCheckout = path.basename(info.commonDir) === '.git' ? path.dirname(info.commonDir) : info.top;
  return {
    repo: path.basename(mainCheckout),
    id: info.commonDir,
    root: info.top,
    base,
    generatedAt: now,
    agents: outAgents,
    clashes,
    mergeOrder,
    counts: {
      agents: outAgents.length,
      working: outAgents.filter((a) => a.status === 'working').length,
      clashes: clashes.length,
      high: clashes.filter((c) => c.severity === 'high').length,
    },
  };
}
