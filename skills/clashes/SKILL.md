---
name: clashes
description: Show which parallel Claude Code agents, each working in its own git worktree, are touching the same files or functions, and flag clashes before their branches are merged. Use when the user runs /clashes, asks whether parallel agents or worktrees conflict, asks what other agents are doing, or is about to merge agent branches.
---

# Clash Map

Clash Map compares every git worktree of this repository against the base branch and finds clashes between agents:
a definition one agent removed that another is building on, both agents changing the same function, both changing
a lockfile, or both changing the same file.

## Steps

1. Start (or reuse) the live map from the repository the user is working in:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/start.mjs" --open
   ```

   It prints the local address, for example `http://127.0.0.1:4777`. Give the user that link.

2. Get the current clashes as text:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs"
   ```

   Exit code 1 means clashes were found; that is expected, not an error. Exit code 2 means it could not run
   (for example, not a git repository, or no base branch found: rerun with `--base <branch>`).

3. Summarize for the user in a few lines: how many agents, each clash in plain words with its suggested fix, and the
   suggested merge order. Do not change any code or merge anything yourself unless the user asks.

## Variants

- If the user only wants a quick answer ("any clashes?"), run step 2 alone and answer.
- If the user wants to stop the map: `node "${CLAUDE_PLUGIN_ROOT}/scripts/start.mjs" --stop`.
- If the user is about to merge agent branches, run step 2 first and mention any High or Medium clash before merging.
