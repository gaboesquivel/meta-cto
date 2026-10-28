---
name: board
description: Read-only progress board of the project's specs by stage, derived from git. Use when the user says "show the board", "show progress", or "open the board".
disable-model-invocation: false
---

# Board

**Show the board.** Render every spec in `docs/specs/` (and, with GitHub links, every open `candidate` issue) as a card in five columns: **Candidate → Specced → Ready → Building → Shipped**. The columns are the same in every delivery mode.

The board is read-only. Git decides each stage: spec status lines and task checkboxes on the default branch, spec branches, and merges. With GitHub links, a merged pull request from the spec's branch into the default branch also counts as that branch's merge. To move work, use the skill that does it (`to-spec`, `to-tasks`, `build`, `ship`); never edit cards or the generated page.

## Run it

From any directory inside the project, start the live board as a background process:

```bash
node <this skill's directory>/scripts/board.mjs --serve
```

It prints `Board at http://127.0.0.1:<port>/ (pid N)…` and keeps running. Give the user that URL, or open it for them. If this project's board already answers on that port, `--serve` prints `Board already running at <url>` and exits 0; give the user that URL. The page refreshes itself every few seconds from git and shows a banner when it cannot update. It listens on `127.0.0.1` only, on port 4178 or a free port when that is taken (for example by another project's board); `--port <n>` requires a specific port.

**Stop the board** when the user asks ("stop the board", "close the board"): run the script with `--stop` (add `--port <n>` if it was started with one). It stops this project's board on that port, or says there is none. Do not leave the board running past the session unless the user wants it.

Limit: a board that fell back to a free port can only be stopped by the session that started it (stop its background process) or with `--stop --port <n>`.

If the background start fails or exits immediately, use `--once`. It writes a self-contained HTML snapshot to `.git/flow/board.html` (the repository's common git directory, shared by worktrees) and prints the path; open that file or give the user the path, and run it again for fresh state. `--out <file>` writes elsewhere; `--repo <path>` targets another repository (any mode); `--json` prints the derived board instead, for answering in chat.

When the user wants progress in chat rather than a page, run `--json` and summarize the columns in a few lines.

## Read the cards

A card shows the spec number, title, task progress (`done/total`, from `- [x] NN: Title (#45)` checklist items or `### NN: Title (#45)` headings in the Tasks section), and the branch that set its stage.

**GitHub mode** is every project whose Flow block does not say `Delivery: local` (`Delivery: github`; an unset `Delivery` counts as `github`, except in a repository with no remote, which counts as local). In this mode an open spec branch alone is not Building: it counts only when it changes something outside `docs/`. Otherwise a ticked task or a live `build` run moves the card; a draft stays in Specced, an accepted spec with tasks in Ready. This rule follows the delivery mode alone, so it holds without GitHub data and with `--no-github`.

**GitHub links** (GitHub mode, when `gh` is installed and authenticated): cards also link the spec issue from the header's `Issue:` line, the task issues, and the pull request (head branch matches the slug, or its body closes the spec issue or a task issue), with each state in text. With GitHub data:

- An `accepted` label on the spec issue reads as status `accepted`.
- An open issue labelled `candidate` that no spec's `Issue:` line names is a Candidate card numbered `#N`.
- A spec whose issue was closed as not planned leaves the columns; `--json` lists it under `dropped`.

When GitHub cannot be reached, the board renders from git alone and its header says why; pass that note on, never treat it as an error. `--no-github` skips `gh` entirely (no links, labels, or candidate issues); staging still follows the delivery mode.

Markers flag what needs a human look:

- `no status line` or `unknown status "…"`: the card stays in Specced unless git shows more progress.
- `on branch <name>`: the spec is not on the default branch yet, so it never shows past Building.
- `number NNN also used by …`: two spec files share a number.
- `label accepted, file draft` (any pair): the spec issue's label and the file's `Status:` disagree.
- `build run stopped updating…`: a `build` run never recorded its end and has not updated for 30 minutes (likely a crash), so its task states are ignored.

During a `build` task-set run, the run's card moves to Building and lists each task with its live state (`running`, `waiting`, `integrated`, `blocked`), fix round, and note, from `<git common dir>/flow/board.json`. Git wins: a task the spec marks done shows integrated, and a spec git shows as shipped stays Shipped. An ended run is ignored; an unreadable overlay is ignored with a header note. `--record` is for `build`: its orchestrator records `run-start` and `run-end`, and the orchestrator or a worker records its own task with `--record task`. Never use it to move cards or answer a request to change progress.

Report markers rather than fixing specs unasked.

Limits: a merged branch ships a spec only when it changed something outside `docs/` and the spec's tasks are done. With GitHub links, a merged pull request counts the same way when its merge commit is in the local clone; a rebase merge is judged by its last commit only. Without them, fast-forward merges, and squash merges later edited on the default branch, may show as Building; a spec reads as Shipped for good once its `Status:` line says `implemented`, which `build` sets once an accepted spec's last task integrates (`ship` sets it if still missing). The board shows one `build` run per repository at a time: a new run start replaces the previous overlay.

The script exits nonzero with a message when it is not inside a git repository or finds no default branch (`main`, `origin/HEAD`, `master`, or `init.defaultBranch`); report that message and the command you ran. Outside a repository, offer `git init` as `write-agents` [Repository](../write-agents/SKILL.md#repository) describes.
