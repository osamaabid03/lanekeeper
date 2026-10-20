# Clash Map

**See which parallel Claude Code agents are touching what, and catch clashes before you merge.**

Running several agents at once, each in its own git worktree, stops them overwriting each other's files. It doesn't
stop them making changes that can't both be true. Git compares text, not intent, so contradictory work merges cleanly
and breaks later.

Clash Map watches every worktree of a repository and shows a live map:

- one lane per agent, with its task and every file it has changed
- clashes highlighted, each explained in plain English with a suggested fix
- a suggested merge order: clash-free work first, risky changes last

Everything runs on your machine. Nothing is hosted, and your code never leaves your computer.

## What it detects (v0.1)

| Severity | Clash | Example |
| --- | --- | --- |
| High | **Removed vs used**: one agent removes or renames a definition another agent is building on | Agent A replaces `PaymentService`; Agent B adds PayPal to it |
| Medium | **Lockfile**: both agents change the same dependency lockfile | Both add packages to `package-lock.json` |
| Medium | **Same function**: both agents change the same function or class | Both edit `checkout()` |
| Low | **Same file**: both agents change one file in different places | Both touch `routes.ts` |

Definition detection is pattern-based and works best for JavaScript, TypeScript, Python, Go and Rust. File, lockfile
and same-file checks work for any language.

## Install

From GitHub (once this repository is published):

```
/plugin marketplace add <your-github-user>/clash-map
/plugin install clash-map@clash-map
```

From a local folder while developing:

```
claude --plugin-dir ./clash-map
```

Requires Node.js 18+ and git.

## Use

1. Start agents in their own worktrees, for example `claude --worktree stripe` and `claude --worktree paypal`.
2. In any of them (or your main checkout), run `/clash-map:clashes`. Claude starts the map and gives you the link,
   usually `http://127.0.0.1:4777`, and summarizes any clashes.
3. Pick a clash to read what happened. **Copy note for agents** copies a message you can paste into each agent's
   session; **Mark as fine** hides it.

Outside Claude Code, from any worktree:

```
node scripts/check.mjs          # text report; exit code 1 if High or Medium clashes
node scripts/check.mjs --json   # machine-readable
node scripts/start.mjs --open   # start the map and open it
node scripts/start.mjs --stop   # stop the map
```

Options: `--base <branch>` (defaults to origin's default branch, then main, master, trunk, develop),
`CLASH_MAP_PORT` (default 4777).

## Try the demo

```
./examples/make-demo-repo.sh /tmp/clash-demo
cd /tmp/clash-demo/shop && node /path/to/clash-map/scripts/check.mjs
```

It creates a repository with three agent worktrees: one replacing `PaymentService`, one extending it, and one working
on an unrelated page.

## How it works

- **Hooks** (`hooks/hooks.json`) run in the background on session start, each prompt, each file edit and each stop.
  They record which worktree an agent works in, its task and the files it edits. They never block Claude.
- **Store**: events are appended to `.git/clash-map/events.jsonl` in the shared git directory, so every worktree sees
  them.
- **Detector** (`lib/detect.mjs`) diffs each worktree, including uncommitted work, against the point where it branched
  from the base branch, then compares the agents pairwise.
- **Map** (`server/server.mjs`, `ui/index.html`): a local-only server on `127.0.0.1` that refreshes every few seconds
  and stops itself after two hours without visitors.

No dependencies beyond Node.js and git.

## Limits

- Pattern-based detection can miss renamed concepts and can flag compatible work. Treat findings as leads.
- It sees committed and uncommitted changes in worktrees on this machine only.
- It suggests fixes; it never edits code or merges anything.

## License

MIT
