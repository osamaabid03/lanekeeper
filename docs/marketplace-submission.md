# Directory submission: Lanekeeper

Anthropic's directory takes plugins through the developer portal: https://claude.ai/directory/manage
(docs: https://claude.com/docs/directory/publish and https://claude.com/docs/plugins/submit). The old
clau.de form redirects there.

## Before you start

- A paid claude.ai plan (Pro, Max, Team or Enterprise). Free accounts can't submit.
- Your GitHub account connected to claude.ai, with push access to the repo (you own it).
- The repo must be public before the listing goes live. It already is.
- The first organization to submit a repo owns the listing, so submit from the account that should keep it.

## Pre-submission checklist (checked against the official one)

| Check | Status |
| --- | --- |
| `.claude-plugin/plugin.json` at the repo root, with `description`, `author`, `version` | yes |
| `claude plugin validate .` | passes |
| README over 40 words, outside code blocks | yes (about 690) |
| License | `LICENSE` (MIT) and `license` in `plugin.json` |
| Name: lowercase, hyphens, 64 chars or fewer, not a reserved word | `lanekeeper` |
| Files: all text, each under 256 KiB, at most 512 files | 19 files, all small text |
| Hook commands use full `${CLAUDE_PLUGIN_ROOT}` paths, no launchers or package installs | yes (`node` + script path) |
| No lockfile, `package.json`, or package-manager config in the plugin | none |
| Readable, unminified source | yes |
| README describes everything the plugin records, runs and sends | yes, "Data and privacy" section |

Can't be checked from here: whether the name `lanekeeper` is taken, and whether "Lanekeeper" is read as confusable with
another listing. The portal's **Validate** step reports both.

## Portal steps and what to enter

1. **Submit new** > **Plugin bundle**.
2. **Source**
   - Repository: `osamaabid03/lanekeeper`
   - Plugin path: leave empty (the plugin is at the repo root)
   - Branch or tag: leave empty to follow `main`, so every merge to `main` becomes a new version
   - Select **Validate**, fix anything marked Blocking, push, then **Re-validate**.
3. **Listing details**: read from `plugin.json` and the README, nothing to type. To change them, edit those files.
4. **Data handling** (answers):
   - Reads or stores personal data? It stores prompt text you type (first 400 characters) and edited file paths,
     locally, in `.git/lanekeeper/events.jsonl`. Prompts could contain personal data, so answer yes and say it stays on
     the user's machine.
   - Sends data to services other than declared connectors? No. There are no network requests; the map is served on
     `127.0.0.1` only.
   - How long is data kept? Locally until the user deletes `.git/lanekeeper`; the log is trimmed automatically past 2 MB.
   - Intended for people under 18? No. It's a developer tool.
5. **Compliance**: confirm a contact email you read, and tick all four acknowledgements.
6. **Review and submit**: keep **GitHub push webhook** (needs admin on the repo, which you have), then
   **Submit for review**.

## After you submit

- A person reviews a new listing, and every later version gets an automated scan. Watch the status under
  **Submissions** in the portal. It is not instant, and Anthropic publishes the first version.
- Findings marked **Policy hold** go to a reviewer and aren't rejections.
- Release updates by merging to `main`, and raise `version` in `plugin.json` each time.
- The demo video: https://github.com/osamaabid03/lanekeeper/releases/download/v0.1.0/lanekeeper-demo.mp4 (the portal
  form doesn't have a video field that I could confirm; use it wherever the listing allows links).

## Facts for questions from reviewers

- Hooks: `SessionStart`, `UserPromptSubmit`, `PostToolUse` (Write, Edit, MultiEdit, NotebookEdit), `Stop`,
  `SessionEnd`. All async, all fail silently.
- Writes only inside `.git/lanekeeper/` (event log, server pid file) plus unreferenced git objects from
  `git merge-tree --write-tree`.
- Runs read-only `git` commands, starts a local server on `127.0.0.1` (Host header checked, exits after two hours idle),
  and opens the browser on request.
- Never edits code, commits, merges or changes branches.
- Tested: 6 `node:test` tests, a headless run with two real Claude Code sessions, and a clean install from GitHub in an
  isolated config. Not tested on Windows.
