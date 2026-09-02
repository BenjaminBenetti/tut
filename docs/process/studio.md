# Studio Process

How work moves through the Terra Under Threat project. Every agent reads this before starting.

## 1. Roles

| Role | Lifespan | Owns |
|---|---|---|
| **Executive Director** (human) | — | Vision, milestones, taste decisions |
| **Director** (Claude, outside fleet) | — | Design doc, architecture sign-off, staffing, priorities. Never reads code. |
| **Tech Lead** | long-lived | Reviews and merges every PR. CI, engine architecture, ADRs, conventions. Sole merge authority. |
| **Producer** | long-lived | Project board, issue decomposition, dependency tracking, status digest, stale PR chasing |
| **Engineer** | one issue | Implements an issue, opens a PR, addresses review |
| **Map Generation Specialist** | long-lived | Owns `mapgen/` end to end |
| **Art Director** | long-lived | Models, textures, generated images, VFX, style guide |
| **QA** | periodic | Headless runs, smoke tests, bug reports |

Role briefs live in `docs/process/roles/`. Handoff notes live in `docs/handoff/`.

## 2. Work item lifecycle

```
  Backlog ──► Ready ──► In Progress ──► In Review ──► Done
                 ▲            │              │
                 └── Blocked ◄┴──────────────┘
```

1. **Issue.** Every unit of work is a GitHub issue with a milestone, one `area:*` label, one `type:*` label, and a `p0`–`p3` priority. Epics (`type:epic`) list child issues as a task list.
2. **Ready** means: acceptance criteria written, dependencies merged, no open design question.
3. **Branch.** `<type>/<issue-number>-<short-slug>`, e.g. `feat/42-infestation-tick`. Branch from `main`.
4. **PR.** Title `<type>(<area>): <summary> (#<issue>)`. Body follows the template. Link the issue with `Closes #N`. Keep PRs under ~500 changed lines where possible; split otherwise.
5. **Review.** Tech Lead reviews. Engineers address comments on the same branch. Tech Lead merges with squash when CI is green and the PR is approved.
6. **Done** when merged. The producer moves the card; engineers may also move it.

## 3. Rules for every agent

- **Never push to `main`.** Never force-push a branch you don't own. Never rewrite history on `main`.
- **Never touch another repository.** This project is `BenjaminBenetti/tut` only.
- **Every change is a PR.** Docs included.
- **Don't block on art.** Use placeholders.
- **Don't block on questions.** If an issue is ambiguous, make a reasonable call, state the assumption in the PR, and label the issue `design-decision` if it needs the Director.
- **Keep your handoff current.** Long-lived roles update `docs/handoff/<role>.md` at least every few hours of work and before finishing. Short-lived roles put their state in the PR description.
- **Comment header.** Every GitHub comment an agent posts starts with `**<Role>** · TUT agent` on its own line so humans can tell who said what.
- **Conventions are enforced.** SOLID, `/<domain>/<type>/<file>`, doc comments on every method, section comments. See `CLAUDE.md`.
- **CI must be green.** Red CI is the author's problem, not the reviewer's.

## 4. Communication

- Agents cannot message the Director. The Director reads your session screen and your handoff, and may type questions into your session. Answer them in the session and, if it matters, in your handoff.
- Engineer ↔ Tech Lead: PR comments.
- Engineer ↔ Producer: issue comments.
- Anything needing the Executive Director: open or label an issue `design-decision` with a crisp question and a recommended default.

## 5. Status digest (Producer)

The Producer keeps `docs/handoff/producer.md` current with, at the top, a **Status Digest** section:

- Milestone progress (issues done / total per milestone)
- In-flight PRs and their age
- Blocked items and why
- Recommended next assignments for idle engineers
- Risks

The Director reads this every tick. Keep it under one screen.

## 6. Handoff protocol

When a long-lived agent is refreshed, its replacement starts by reading `docs/handoff/<role>.md`. A good handoff has:

1. What I was doing and where it stands
2. Open PRs / issues I own
3. Decisions I made and why
4. Things I'd do next, in order
5. Gotchas

Handoff files are committed via PR like everything else, titled `chore(handoff): <role> <date>`. The Tech Lead fast-tracks these.
