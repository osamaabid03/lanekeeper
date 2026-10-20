#!/usr/bin/env node
// Prints a clash report for every worktree of the repository in the current directory.
// Exit code: 0 = no high or medium clashes, 1 = clashes found, 2 = could not run.
// Usage: node check.mjs [--repo DIR] [--base BRANCH] [--json]
import { detect } from '../lib/detect.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

try {
  const state = detect(arg('--repo') || process.cwd(), { base: arg('--base') });
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(state, null, 2) + '\n');
  } else {
    const lines = [];
    lines.push(`Lanekeeper: ${state.repo} (base: ${state.base})`);
    lines.push('');
    if (!state.agents.length) lines.push('No agent worktrees with changes found.');
    for (const a of state.agents) {
      lines.push(`${a.name}  ${a.branch}  [${a.status}]${a.task ? `  task: ${a.task.slice(0, 80)}` : ''}`);
      for (const f of a.files) {
        const tags = f.clashes.map((c) => c.tag).join(', ');
        lines.push(`  ${f.status.padEnd(8)} ${f.path}${tags ? `   <- ${tags}` : ''}`);
      }
    }
    lines.push('');
    if (!state.clashes.length) {
      lines.push('No clashes found.');
    } else {
      lines.push(`${state.clashes.length} clash(es):`);
      for (const c of state.clashes) {
        lines.push(`  ${c.tag} [${c.severity.toUpperCase()}] ${c.title}`);
        lines.push(`    ${c.explain}`);
        lines.push(`    Fix: ${c.fix}`);
      }
    }
    if (state.mergeOrder.length > 1) {
      lines.push('');
      lines.push('Suggested merge order:');
      state.mergeOrder.forEach((m, k) => lines.push(`  ${k + 1}. ${m.name} (${m.branch}): ${m.note}`));
    }
    process.stdout.write(lines.join('\n') + '\n');
  }
  process.exit(state.clashes.some((c) => c.severity !== 'low') ? 1 : 0);
} catch (err) {
  process.stderr.write(`lanekeeper: ${err.message}\n`);
  process.exit(2);
}
