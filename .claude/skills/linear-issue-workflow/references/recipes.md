# Recipes — exact tool calls and commands

Precise syntax for each step of `linear-issue-workflow`. The main `SKILL.md`
says *when* and *why*; this file says *how*. `INI-123` is a placeholder issue
identifier — substitute the real one.

## Contents

- [Reading Linear](#reading-linear)
- [Refining the issue](#refining-the-issue)
- [Publishing the plan](#publishing-the-plan)
- [Move to In Progress](#move-to-in-progress)
- [Branch hygiene](#branch-hygiene)
- [Base off main](#base-off-main)
- [Branching](#branching)
- [Committing](#committing)
- [Draft PR](#draft-pr)
- [Linking the PR](#linking-the-pr)
- [Review](#review)
- [Acceptance check](#acceptance-check)
- [Ready for review](#ready-for-review)

---

## Reading Linear

All via the Linear MCP (`mcp__linear-server__*`). Fan these out to subagents when
you're pulling several at once.

- **The issue itself** — `get_issue` with `id: "INI-123"`, `includeRelations:
  true`. Returns the description, attachments, existing PR links, relations
  (blocks / blocked-by / related / duplicate), and the **git branch name** Linear
  suggests (you need this in [Branching](#branching)).
- **The project** — if the issue has one, `get_project` with the project name/ID,
  `includeMilestones: true`. Gives the bigger goal the issue serves.
- **Sibling issues** — `list_issues` with `project: "<name>"` (optionally
  `state`, `label`) to see what else is in flight and avoid overlap.
- **Comments** — `list_comments` with `issueId: "INI-123"`. Someone may have
  already scoped part of this.

## Refining the issue

Show the proposed changes to the user first. Then apply with `save_issue`,
passing `id: "INI-123"` (its presence = update, not create):

- `title`, `description` (Markdown — literal newlines, no escaped `\n`)
- `priority` (0 None · 1 Urgent · 2 High · 3 Medium · 4 Low), `estimate`,
  `labels` (names or IDs), `project`, `parentId`
- Relations are **append-only**: `relatedTo`, `blocks`, `blockedBy` add; use
  `removeRelatedTo` / `removeBlocks` / `removeBlockedBy` to drop.

Change only what needs changing — pass just the fields you're updating.

## Publishing the plan

Post the agreed plan as a **comment** with `save_comment`:

```
issueId: "INI-123"
body: |
  >>> claude-code-plan
  **Objectif** — <one line>

  **Approche**
  1. <step>
  2. <step>

  **Fichiers touchés** — `path/a`, `path/b`
  **Tests** — <how it's verified>
  **Hors scope** — <what this deliberately doesn't do>
```

`>>>` + space on the first line makes it a **collapsible** whose summary is the
rest of that line (`claude-code-plan`); everything below is the folded body. This
is the syntax from Linear's editor docs. After posting, glance at the result — if
the workspace renders `>>>` as a plain nested quote instead of a toggle, tell the
user and switch to whatever their editor expects (e.g. re-create the toggle via
the `/collapsible` structure). Don't silently leave it as a quote.

## Move to In Progress

Plan signed off and published → mark the issue started so the board is honest:

```
save_issue  id: "INI-123"  state: "In Progress"   # exact name via list_issue_statuses
```

The started status name varies per team (`In Progress`, `Started`, …) — confirm
with `list_issue_statuses` for the issue's team before setting it. Doing this
explicitly keeps the board right even when you don't branch from Linear's
suggested name (the branch integration would otherwise be what moves it, and only
later, in [Branching](#branching)).

## Branch hygiene

```bash
git status --porcelain        # empty output == clean
git status                    # human-readable, when dirty
git diff --stat               # what changed, to judge if it's part of this work
```

Dirty-tree options, chosen with the user — never discard:

```bash
git stash push -m "wip: <what it is>"   # set aside unrelated work
git add -p && git commit -m "..."       # commit work that belongs here
```

## Base off main

```bash
git checkout main
git pull --ff-only            # fail loudly rather than create a surprise merge
```

If `--ff-only` refuses (local main diverged), stop and surface it.

## Branching

Prefer Linear's suggested name from `get_issue` — it embeds the issue ID, so the
GitHub integration auto-links the PR (the issue is already In Progress from
[Move to In Progress](#move-to-in-progress)):

```bash
git checkout -b sohett/ini-123-short-title    # value from get_issue
```

Fallback when no Linear branch name exists — conventional-commit type + issue ID
+ slug:

```bash
git checkout -b feat/ini-123-short-title
# type ∈ feat | fix | chore | refactor | docs | test | perf | build | ci
```

## Committing

Small, frequent, conventional. **No Co-Authored-By trailer** (repo rule).

```bash
pnpm verify                                   # green before you push
git commit -m "feat(coach): <imperative summary>"
```

## Draft PR

```bash
git push -u origin <branch>
gh pr create --draft --base main \
  --title "INI-123 <concise title>" \
  --body "$(cat <<'EOF'
## Résumé
<what and why>

## Test plan
- <how it was verified>

Fixes INI-123
EOF
)"
```

- **Draft** on purpose: work-in-progress, not yet for review.
- Issue ID in the title + `Fixes INI-123` in the body → GitHub↔Linear links it
  and merging will close the issue. To link without auto-closing on merge, use a
  contributing magic word instead (`Part of INI-123`, `Related to INI-123`).

## Linking the PR

The branch name and the magic word already link it via the native integration.
**Verify** the attachment landed:

```
get_issue  id: "INI-123"   # PR should appear under attachments / links
```

Fallback if the workspace has no GitHub integration — attach the URL by hand
(`links` is append-only, existing links are never removed):

```
save_issue
  id: "INI-123"
  links: [{ url: "https://github.com/Sohett/Inigo/pull/<n>", title: "PR: <title>" }]
```

## Review

Delegate to the **code-reviewer agent** with the Agent tool, subagent type
`pr-review-toolkit:code-reviewer` — an independent pass beats reviewing your own
diff. Tell it exactly what to review: the branch's changes against `main` (the
whole PR scope, not just the last edit).

```bash
git diff main...HEAD --stat     # the scope to hand the reviewer
```

Agent prompt, roughly:

> Review the changes on this branch against `main` for INI-123
> (`git diff main...HEAD`). Focus on correctness, adherence to the repo
> conventions in `AGENTS.md` / `CLAUDE.md`, error handling, and test coverage.
> Report findings ranked by severity.

Then, with the user:

- Fix real findings → re-run `pnpm verify` → re-review if the fixes were
  non-trivial.
- Note and skip false positives / out-of-scope items with a one-line reason.

Only a clean or consciously-triaged review unlocks
[Ready for review](#ready-for-review).

**Fallback:** if the `pr-review-toolkit:code-reviewer` agent isn't available in
the session, run the `/code-review` skill on the working diff instead — same
intent, less specialised.

## Acceptance check

Map each acceptance criterion on the card to evidence in the diff, then post a ✅
checklist as a PR comment. Pull the criteria from the issue you refined in Phase 1
(`get_issue`), and read the shipped change to confirm each is actually delivered:

```bash
git diff main...HEAD          # the shipped change, criterion by criterion
gh pr view <number>           # confirm the PR number / current state
```

Post the verdict — GitHub renders ✅ and `- [x]` boxes inline, so it reads as a
visual sign-off:

```bash
gh pr comment <number> --body "$(cat <<'EOF'
## ✅ Revue d'acceptance — INI-123

**Métier / produit** — la PR livre ce que la carte demande
- [x] <critère d'acceptance 1> — `path/file.ts:42` / test `foo.spec.ts`
- [x] <critère d'acceptance 2> — <preuve>
- [ ] <critère hors scope> — reporté, voir INI-456

**Code** — revue code-reviewer clean / triée (3g)
**Specs tech** — TS, lint, archi, SOLID OK (`pnpm verify` + revue)
**Tests** — suite verte, pas de régression (`pnpm verify`)
EOF
)"
```

Any unchecked box blocks [Ready for review](#ready-for-review): finish the missing
work, or leave it unchecked with a one-line reason and confirm the waiver with the
user. Where a criterion is a runtime behaviour, drive it and observe it before
ticking — don't infer "done" from the code.

## Ready for review

Only when `pnpm verify` is green, the code-reviewer pass is clean, and the
acceptance checklist is all-✅ (or consciously waived):

```bash
gh pr ready <number>
```

Then, if the integration didn't already, move the Linear issue to its review
status:

```
save_issue  id: "INI-123"  state: "In Review"   # exact name via list_issue_statuses
```
