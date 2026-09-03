# Releasing

A release is a git tag. Pushing a tag that starts with `v` runs
`.github/workflows/release.yml`, which verifies the build (typecheck, lint,
test, build), publishes a **GitHub Release** with `dist/` attached as
`tut-vX.Y.Z.zip`, and deploys the same build to **GitHub Pages**.

```
   git tag v0.1.3 && git push origin v0.1.3
          │
          ▼
      verify ──┬──► GitHub Release  https://github.com/BenjaminBenetti/tut/releases
               └──► GitHub Pages    https://benjaminbenetti.github.io/tut/
```

The release and deploy jobs are independent: a Pages outage never blocks the
Release, and vice versa. The main-branch CI workflow is untouched.

## Cutting a release

1. Make sure `main` is green and contains what you want to ship.
2. `git checkout main && git pull`
3. `git tag vX.Y.Z && git push origin vX.Y.Z`
4. Watch the run: `gh run list --workflow release.yml --limit 1` then
   `gh run watch <id>`.
5. Play it at <https://benjaminbenetti.github.io/tut/> (Pages takes up to a
   minute to swap builds). The zip is on the Release page for offline use.

Re-pushing an existing tag is not supported (never force-push tags). To ship
a fix, cut the next patch version.

## Where the build lives

| What | Where |
|---|---|
| Playable snapshot | <https://benjaminbenetti.github.io/tut/> (Pages, always the newest tag) |
| Every release + zip | <https://github.com/BenjaminBenetti/tut/releases> |
| Pages settings | Build type `workflow`; enabled via `gh api -X POST repos/BenjaminBenetti/tut/pages -f build_type=workflow` |
| `github-pages` environment | Deployment branch policy must allow tags: `main` (branch) and `v*` (tag). GitHub creates the environment allowing `main` only, which refuses tag-triggered deploys; add the tag rule with `gh api -X POST repos/BenjaminBenetti/tut/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag` |

The Pages site is publicly reachable by anyone with the URL even though the
repository is private. Do not put secrets in the build.

## Versioning

Tags are `v0.M.N`: `0` until the game is feature complete, `M` identifies the
milestone the build belongs to, `N` counts snapshots within it.

| Milestone | Tags |
|---|---|
| M0 Foundation | `v0.0.N` |
| M1 Overworld | `v0.1.N` |
| M1.5 Map Generation | `v0.2.N` |
| M2 Basic Missions | `v0.3.N` |
| M3 Mission Variety | `v0.4.N` |
| M4 Final Mission | `v0.5.N` |

The Director tags builds worth tasting; the Tech Lead owns the workflow.

## How the sub-path works

Pages serves the site under `/tut/`. The workflow sets `TUT_BASE_PATH=/tut/`,
which `vite.config.ts` uses as Vite's `base`, so bundled asset URLs are
prefixed. Runtime asset lookups go through `import.meta.env.BASE_URL`
(icon and sprite manifests, model loader), so they follow the same base.
Local development and CI keep `base: "/"`.
