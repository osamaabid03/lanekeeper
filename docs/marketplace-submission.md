# Marketplace submission: Lanekeeper

Submit through Anthropic's plugin directory form: https://clau.de/plugin-directory-submission
(The form's exact fields aren't public, so the sections below cover what such a form usually asks. Paste what fits.)

## Basics

| Field | Value |
| --- | --- |
| Plugin name | `lanekeeper` (the slug can't be changed after publishing) |
| Display name | Lanekeeper |
| Repository | https://github.com/osamaabid03/lanekeeper |
| Version | 0.1.0 ([release v0.1.0](https://github.com/osamaabid03/lanekeeper/releases/tag/v0.1.0)) |
| License | MIT |
| Author | Osama Abid (osamaabid03) |
| Category | Development / Productivity |
| Install | `/plugin marketplace add osamaabid03/lanekeeper` then `/plugin install lanekeeper@lanekeeper` |
| Requirements | Node.js 18+, git 2.38+ (older git works but skips the merge-conflict check) |

## One-line description

Keeps parallel Claude Code agents in their lanes: a live map of what each agent is touching, with clashes caught before
you merge.

## Description

When you run several Claude Code agents at once, each in its own git worktree, Git stops them overwriting each other's
files. It doesn't stop them making changes that can't both be true: one agent renames a method while another writes
code that calls it, and the branches merge cleanly and break later.

Lanekeeper watches every worktree of a repository and shows a live map in your browser:

- one lane per agent, with its task and every file it has changed
- clashes highlighted, each explained in plain English with a suggested fix
- whether Git itself will warn you at merge time, or stay silent (asked via `git merge-tree`)
- a suggested merge order: clash-free work first, risky changes last
- a **Copy note for agents** button to paste the clash into each agent's session

Zero setup: install the plugin, run `/lanekeeper:clashes`. Everything runs on your machine; nothing is hosted.

## What it detects

| Severity | Clash |
| --- | --- |
| High | One agent removes or renames a definition another agent is building on |
| Medium | Both agents change the same dependency lockfile |
| Medium | Both agents change the same function or class |
| Low | Both agents change the same file in different places |

Definition detection is pattern-based (best for JS/TS, Python, Go and Rust), so findings are worded as leads, not
verdicts.

## What the plugin does on your machine (security and privacy)

- **Hooks:** five async command hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse` on Write/Edit/MultiEdit/
  NotebookEdit, `Stop`, `SessionEnd`) run `scripts/record.mjs` in the background. They never block a session and fail
  silently.
- **What is recorded:** the worktree path, branch, session id, the **first 400 characters of each prompt** (shown as the
  agent's task), and the path of each edited file. File contents are not stored.
- **Where it is stored:** `.git/lanekeeper/events.jsonl` inside the repository's own git directory. It never leaves the
  machine and is trimmed automatically.
- **Network:** no outbound requests, no telemetry, no analytics. The map is served from `127.0.0.1` only (requests with
  any other `Host` header get a 403) and exits after two hours without visitors.
- **Commands it runs:** read-only `git` commands (`diff`, `status`, `worktree list`, `merge-base`, `rev-parse`) and
  `git merge-tree --write-tree`, which writes unreferenced objects into the git object store (removed by `git gc`). It
  also starts its own local server and, on request, opens your browser.
- **What it never does:** edit your code, commit, merge, or change branches. It only detects and suggests.
- **Dependencies:** none beyond Node.js and git.

## Testing

- `claude plugin validate .` passes.
- Installs cleanly from GitHub: `/plugin marketplace add osamaabid03/lanekeeper` then
  `/plugin install lanekeeper@lanekeeper` (checked in an isolated config; shows 0.1.0, enabled).
- `node --test` runs 6 tests (definition detection, diff parsing, lockfile notes, and an end-to-end run on a generated
  demo repository, including a check against real `git merge-tree` results).
- Dogfooded in real Claude Code sessions in parallel worktrees: hooks fire on every event and add about 2–22 ms before
  going to the background.
- **Known gaps:** Windows is untested. Detection can miss renamed concepts and can flag compatible work.

## Demo

- Video (70 s): https://github.com/osamaabid03/lanekeeper/releases/download/v0.1.0/lanekeeper-demo.mp4
- Reproduce it yourself: `./examples/make-demo-repo.sh ~/lanekeeper-demo`, then follow the README's "Try the demo".

## Support

Issues: https://github.com/osamaabid03/lanekeeper/issues
