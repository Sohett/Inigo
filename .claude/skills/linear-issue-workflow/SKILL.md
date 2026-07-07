---
name: linear-issue-workflow
description: >-
  Senior-dev workflow for turning a Linear issue into shipped code. Use this
  whenever the user starts working on, references, or pastes a Linear
  issue/ticket (e.g. "let's work on INI-123", a linear.app URL, "implement this
  ticket", "start the feature for ..."), or asks to plan / refine / groom a
  Linear issue before coding. It drives the full loop: pull the issue + related
  context via the Linear MCP, refine the issue as product work, get sign-off on
  a plan, publish that plan to the Linear card in a `claude-code-plan`
  collapsible, then run a Gitflow implementation loop — verify branch
  cleanliness, branch off an updated main, commit often, open a draft PR, link
  it to the Linear issue, self-review the diff with the code-reviewer agent, and
  promote it to ready-for-review when done. Trigger it even when the user only
  mentions a Linear issue in passing before jumping straight into code.
---

# Linear issue workflow

This skill encodes how a senior developer takes a Linear issue from "let's look
at this" to "ready for review". The point is discipline, not ceremony: think
before touching Linear, agree on a plan before writing code, and keep git clean
and traceable throughout. Each phase ends at a **human checkpoint** — you never
silently rewrite someone's issue, and you never start branching or committing
without the user knowing where you are.

Work through the three phases in order. Don't skip ahead: publishing a plan
before it's agreed, or branching before the plan exists, defeats the purpose.

Exact tool calls, git commands, and the Linear markdown for the plan comment
live in `references/recipes.md`. Read it when you reach the step that needs it —
this file is the *process and judgment*, the recipe file is the *precise syntax*.

## The two hard rules

1. **Nothing is written to Linear or git without the user in the loop.** Refined
   issue content is shown before it's saved. The plan is published only after
   explicit sign-off. Destructive git operations (stash, discard, force) are
   proposed, never assumed.
2. **"Done" means verified.** `pnpm verify` is green before you push and before
   you flip a PR to ready. No Co-Authored-By in commits (repo rule). Conventional
   commit messages. See the repo `AGENTS.md` for the rest of the coding
   conventions — they are auto-loaded and still apply.

---

## Phase 1 — Understand & refine the issue

Goal: fully understand what's being asked and leave the Linear card in a state a
senior would be happy to hand to any engineer.

1. **Pull the issue and its context.** Fetch the issue with its relations and git
   branch name. If it belongs to a project, pull the project and the sibling
   issues too — the answer to "what does this ticket actually mean" is usually in
   the neighbours. Read the existing comments; someone may have already scoped
   part of this. Delegate this fan-out to subagents (one per lookup) to keep the
   main context clean, per the repo convention. See `references/recipes.md`
   → *Reading Linear*.

2. **Discuss and build a plan with the user.** Surface what's ambiguous, what's
   risky, and what the smallest correct change looks like. This is a
   conversation, not a monologue — the user knows the product context you don't.

3. **Do the product-management pass.** Ask honestly: is this issue well-formed?
   A good issue has a clear problem statement, scope/non-scope, and acceptance
   criteria. If it's thin or stale, draft an improved version — sharper title,
   restructured description, right priority/labels/estimate, correct
   project/parent, related-issue links. **Show the proposed changes and get a yes
   before saving.** Then update the issue via the Linear MCP (see
   `references/recipes.md` → *Refining the issue*). Improving the ticket is part
   of the job; overwriting someone's words without asking is not.

**Checkpoint:** the user agrees the issue is well-scoped and there's a plan you
both believe in. Only now move on.

---

## Phase 2 — Agree on the plan, then publish it

The plan is the contract. It gets published to the Linear card so anyone looking
at the ticket sees exactly what will be built, before a line of code exists.

1. **Get explicit sign-off on the plan.** Not "looks fine" in passing — a real
   "yes, build this". If the user is still editing the plan, stay in Phase 1.

2. **Publish the plan as a Linear comment** inside a collapsible titled
   `claude-code-plan`. A comment (not the description) keeps the refined
   description clean and timestamps the plan as a point-in-time artifact. The
   exact collapsible markdown is in `references/recipes.md` → *Publishing the
   plan*. Post it with the Linear MCP `save_comment` tool.

**Checkpoint:** the plan comment is live on the card. Implementation starts now,
not before.

---

## Phase 3 — Implement (Gitflow loop)

Short-lived feature branch off `main`, back into `main` via a PR. This repo has
no `develop` branch, so "Gitflow" here means: clean base, one focused branch per
issue, frequent commits, draft PR early, an independent review pass, and ready
only when truly done.

### 3a — Branch hygiene (before anything else)

Check the working tree with `git status --porcelain`.

- **Clean** → proceed to 3b.
- **Dirty** → do not steamroll it. Look at *what* the changes are (`git status`,
  `git diff --stat`) and figure out whether they belong to this work:
  - Part of the current logical change and you're already on the right branch →
    offer to commit them.
  - Unrelated work in progress → offer to `git stash push -m "..."`.
  - Genuinely unsure → **ask the user** which of commit / stash / keep they want.
  Never discard or force. Losing someone's uncommitted work is unforgivable.

If you're already on a clean feature branch that clearly belongs to this issue
and is based on recent `main`, you can keep working on it — no need to recreate.

### 3b — Base off an updated main

Switch to `main` and fast-forward it to the remote so you branch from the latest
code, not a stale local copy. `git checkout main && git pull --ff-only`. If the
fast-forward fails, stop and surface it rather than papering over it with a merge.

### 3c — Create the branch

Prefer **Linear's suggested git branch name** — `get_issue` returns it, and it
embeds the issue ID (e.g. `sohett/ini-123-...`). Using it makes the GitHub↔Linear
integration auto-link the PR and move the issue into its started status for free.
If no Linear branch name is available, fall back to `<type>/<issue-id>-<slug>`
where `<type>` matches the work (`feat`, `fix`, `chore`, `refactor`, `docs`,
`test`, `perf`). Recipe: `references/recipes.md` → *Branching*.

### 3d — Develop and commit often

Implement against the agreed plan, following the repo's coding conventions
(auto-loaded from `AGENTS.md`). Keep commits **small and frequent** — each a
coherent step with a conventional-commit message (`feat(scope): ...`), and never
with a Co-Authored-By trailer. Committing often gives you a clean history and
easy rollback points; it's a safety net, not bureaucracy. Run the relevant
checks as you go and `pnpm verify` before you push.

### 3e — Push and open a draft PR

Push the branch (`git push -u origin <branch>`) and open the PR **as a draft** —
draft signals "in progress, don't review yet" and lets CI and the Linear link
attach early. Give it a real title (include the issue ID) and a body with a
short summary, the test plan, and a magic-word link (`Fixes INI-123`) so merging
closes the issue. Base is `main`. Recipe: `references/recipes.md` →
*Draft PR*.

### 3f — Link the PR to the Linear issue

If you branched from Linear's name and put `Fixes INI-123` in the body, the
native integration links it automatically — **verify** the attachment appeared on
the issue (`get_issue`). If the workspace has no GitHub integration, attach the
PR URL to the issue manually via the MCP. Recipe: `references/recipes.md` →
*Linking the PR*.

### 3g — Self-review with the code-reviewer agent

Before you'd ask anyone else to look, get it reviewed — properly, and by a fresh
pair of eyes. Delegate to the **code-reviewer agent**
(`pr-review-toolkit:code-reviewer`) rather than eyeballing your own diff: an
independent pass catches what the author's eye skips and checks the change
against the repo conventions. Point it at the whole branch scope, not just your
last edit — the changes on this branch versus `main` (`git diff main...HEAD`).
Recipe: `references/recipes.md` → *Review*.

Then triage the findings with the user — this is judgment, not a checklist to
clear:
- Real issues (bugs, convention violations, missing tests, silent failures) →
  fix them, then re-run `pnpm verify`.
- Noise, false positives, or deliberately out-of-scope → say so with a one-line
  reason. Don't silently ignore them, and don't gold-plate to satisfy a nit.

Re-run the review after non-trivial fixes. A clean (or consciously-triaged)
review is what "PR clean" actually means, and it's the precondition for the next
step.

### 3h — Promote to ready-for-review

Only when the branch is genuinely finished: plan fully implemented, `pnpm verify`
green, and the code-reviewer pass from 3g is clean with its findings addressed.
Then flip the draft to ready (`gh pr ready <number>`). Draft → ready is a
deliberate act that means "I'd put my name on this" — treat it that way. Move the
Linear issue to its review status if the integration didn't already.

---

## If things drift

If mid-implementation the plan turns out to be wrong, stop and replan with the
user rather than forcing the original plan through — then update the
`claude-code-plan` comment so the card stays honest. A plan you no longer believe
in isn't worth following.
