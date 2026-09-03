"""Producer grooming pass: sync project 5 Status/Owner from live issue, PR and branch state.
Usage: python3 tools/producer/groom.py [--dry]. Writes .producer/digest.json at the repo root (git-ignored).
Requires `gh` authenticated with project scope. Producer role only; no game code here."""
import json, os, re, subprocess, sys, datetime
ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))).stdout.strip()
OUT = os.path.join(ROOT, ".producer"); os.makedirs(OUT, exist_ok=True)
REPO = "BenjaminBenetti/tut"; PNUM = "5"; POWNER = "BenjaminBenetti"
PID = "PVT_kwHOAVZkgc4BiL0w"; SF = "PVTSSF_lAHOAVZkgc4BiL0wzhhEyFA"; OF = "PVTSSF_lAHOAVZkgc4BiL0wzhhEyMA"
STATUS = {"Backlog": "ae63e765", "Ready": "5025a5a6", "In Progress": "6a94ad75", "In Review": "c8fa47ad", "Blocked": "8d9f4db2", "Done": "7db260b6"}
OWN = {"director": "5e31d037", "producer": "8a552d5d", "tech-lead": "705b43c0", "engineer": "d1c51bce", "art-director": "0e5b142d", "mapgen": "aa2f1e75", "qa": "5ce3489f"}
DRY = "--dry" in sys.argv
def gh(*a):
    p = subprocess.run(["gh", *a], capture_output=True, text=True)
    if p.returncode: raise RuntimeError(p.stderr.strip()[:300])
    return p.stdout
def edit(item, field, opt):
    if DRY: return
    gh("project", "item-edit", "--project-id", PID, "--id", item, "--field-id", field, "--single-select-option-id", opt)

# Reads go through REST (separate 5000/h budget) because the shared account's GraphQL quota is
# spent by every agent; GraphQL is reserved for the project-field writes below.
def rest_issues():
    """All issues (not PRs) as gh-issue-list-shaped dicts."""
    raw = json.loads(gh("api", f"repos/{REPO}/issues?state=all&per_page=100", "--paginate", "--slurp"))
    out = {}
    for page in raw:
        for i in page:
            if "pull_request" in i: continue
            out[i["number"]] = dict(number=i["number"], title=i["title"], state=i["state"].upper(),
                                    labels=[{"name": l["name"]} for l in i["labels"]],
                                    milestone={"title": i["milestone"]["title"]} if i.get("milestone") else None,
                                    body=i.get("body") or "", url=i["html_url"], updatedAt=i["updated_at"], createdAt=i["created_at"])
    return out
def rest_prs():
    """All PRs as gh-pr-list-shaped dicts (state OPEN / MERGED / CLOSED)."""
    raw = json.loads(gh("api", f"repos/{REPO}/pulls?state=all&per_page=100", "--paginate", "--slurp"))
    out = []
    for page in raw:
        for p in page:
            state = "OPEN" if p["state"] == "open" else ("MERGED" if p.get("merged_at") else "CLOSED")
            out.append(dict(number=p["number"], title=p["title"], state=state, headRefName=p["head"]["ref"], body=p.get("body") or "",
                            createdAt=p["created_at"], updatedAt=p["updated_at"], reviewDecision=None, mergedAt=p.get("merged_at"), isDraft=p.get("draft", False)))
    return out
issues = rest_issues()
prs = rest_prs()
subprocess.run(["git", "fetch", "origin", "--prune", "-q"], cwd=ROOT)
branches = [b.strip().replace("origin/", "") for b in subprocess.run(["git", "branch", "-r"], capture_output=True, text=True, cwd=ROOT).stdout.splitlines() if "->" not in b]
items = json.loads(gh("project", "item-list", PNUM, "--owner", POWNER, "--format", "json", "--limit", "500"))["items"]
by_num = {it["content"]["number"]: it for it in items if it.get("content", {}).get("number")}

PR_BY_NUM = {p["number"]: p for p in prs}
def deps_of(i):
    """Issue numbers named in the Dependencies section. PR numbers are dropped unless the PR is still open."""
    body = i["body"] or ""
    m = re.search(r"## Dependencies\s*(.*?)(?:\n## |\Z)", body, re.S)
    sec = (m.group(1) if m else "").strip()
    if re.match(r"(?i)^[_*\s]*none\b", sec): return []
    # Prefer numbers inside explicit blocker phrases ("Blocked by #N, #M", "depends on #N"); a sentence such as
    # "independent of #8" must not count. Fall back to every number only when no phrase is present.
    phrases = re.findall(r"(?i)(?:blocked by|depends on|needs|after|requires)((?:\s*(?:,|and|\+)?\s*#\d+(?:\s*\([^)]*\))?)+)", sec)
    nums = {int(x) for ph in phrases for x in re.findall(r"#(\d+)", ph)} if phrases else {int(x) for x in re.findall(r"#(\d+)", sec)}
    out = set()
    for n in nums:
        if n in issues: out.add(n)
        elif n in PR_BY_NUM and PR_BY_NUM[n]["state"] == "OPEN": out.add(n)  # open PR named as a blocker
    return sorted(out)
def labels(i): return {l["name"] for l in i["labels"]}
def issue_prs(n):
    out = []
    for p in prs:
        refs = {int(x) for x in re.findall(r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)", p["body"] or "", re.I)}
        refs |= {int(x) for x in re.findall(r"\(#(\d+)\)", p["title"])}
        bm = re.match(r"[a-z]+/(\d+)-", p["headRefName"] or "")
        if bm: refs.add(int(bm.group(1)))
        if n in refs: out.append(p)
    return out
def has_branch(n): return any(re.match(rf"[a-z]+/{n}-", b) for b in branches)
def infer_owner(i):
    L = labels(i); t = i["title"]
    if "type:epic" in L:
        if "area:mapgen" in L: return "mapgen"
        if "area:art" in L or t.startswith("Art:"): return "art-director"
        return "producer"
    if "area:mapgen" in L: return "mapgen"
    if "area:art" in L or t.startswith("Art:"): return "art-director"
    if "area:qa" in L: return "qa"
    if (i.get("milestone") or {}).get("title", "").startswith("M0") or "area:infra" in L: return "tech-lead"
    return "engineer"
def desired_status(i, current):
    n = i["number"]; L = labels(i)
    if i["state"] == "CLOSED": return "Done"
    ps = issue_prs(n)
    if any(p["state"] == "OPEN" for p in ps): return "In Review"
    if "type:epic" in L:
        kids = [issues[d] for d in re.findall(r"- \[[ x]\] #(\d+)", i["body"] or "") for d in [int(d)] if d in issues]
        if kids and all(k["state"] == "CLOSED" for k in kids): return "Done"
        if any(by_num.get(k["number"], {}).get("status") not in (None, "Backlog", "Ready") for k in kids): return "In Progress"
        return current if current in ("In Progress",) else "Backlog"
    # In Progress means someone is on it: a seated engineer issue, or a non-engineer owner (mapgen, art, tech-lead)
    # working its own branch. An unseated engineer issue with a parked branch is Ready again (Director, pause rules).
    seated = any(l.startswith("seat:") for l in L)
    owner = by_num.get(n, {}).get("owner")
    if (has_branch(n) or current == "In Progress") and (seated or owner not in (None, "engineer")): return "In Progress"
    if "status:blocked" in L: return "Blocked"
    # studio.md §2: Ready means no open design question. A design-decision issue waits in Backlog for the Director.
    if "design-decision" in L: return "Backlog"
    deps = deps_of(i)
    if all(issues.get(d, {}).get("state") == "CLOSED" for d in deps): return "Ready"
    return "Backlog"

changes = []; added = []
for n, i in sorted(issues.items()):
    if n not in by_num:
        if DRY: print(f"[dry] would add #{n}"); continue
        item = json.loads(gh("project", "item-add", PNUM, "--owner", POWNER, "--url", i["url"], "--format", "json"))["id"]
        by_num[n] = {"id": item, "status": None, "owner": None}; added.append(n)
    it = by_num[n]; cur = it.get("status"); want = desired_status(i, cur)
    if cur != want:
        edit(it["id"], SF, STATUS[want]); changes.append((n, cur, want, i["title"])); it["status"] = want
    if not it.get("owner"):
        ow = infer_owner(i); edit(it["id"], OF, OWN[ow]); it["owner"] = ow; changes.append((n, "owner", ow, i["title"]))

# digest data
now = datetime.datetime.now(datetime.timezone.utc)
def age_h(ts): return round((now - datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() / 3600, 1)
open_prs = [dict(number=p["number"], title=p["title"], age_h=age_h(p["createdAt"]), idle_h=age_h(p["updatedAt"]), review=p["reviewDecision"] or "n/a", draft=p["isDraft"]) for p in prs if p["state"] == "OPEN"]
ms = {}
for i in issues.values():
    t = (i.get("milestone") or {}).get("title", "none")
    ms.setdefault(t, [0, 0]); ms[t][1] += 1; ms[t][0] += i["state"] == "CLOSED"
cols = {}
for n, it in by_num.items():
    cols.setdefault(it.get("status") or "none", []).append(n)
ready = [(n, by_num[n]["owner"], issues[n]["title"]) for n in cols.get("Ready", []) if n in issues]
blocked = [(n, issues[n]["title"]) for n in cols.get("Blocked", []) if n in issues]
inprog = [(n, issues[n]["title"], has_branch(n)) for n in cols.get("In Progress", []) if n in issues and "type:epic" not in labels(issues[n])]
# next-up: Backlog issues whose deps are all merged or in review
nextup = []
for n in cols.get("Backlog", []):
    i = issues.get(n)
    if not i or "type:epic" in labels(i): continue
    deps = deps_of(i)
    if deps and all(issues.get(d, {}).get("state") == "CLOSED" or any(p["state"] == "OPEN" for p in issue_prs(d)) for d in deps):
        nextup.append((n, i["title"], [d for d in deps if issues.get(d, {}).get("state") != "CLOSED"]))
# engineer seats: current open issue per seat label, plus the most recently closed one for context
SEATS = ["eng-1", "eng-2", "eng-3", "eng-4", "eng-5", "eng-6"]
# Seat effort level is recorded in each seat label's description (process PR #189): default | medium | low.
label_desc = {l["name"]: (l.get("description") or "") for l in json.loads(gh("api", f"repos/{REPO}/labels?per_page=100"))}
def seat_effort(seat):
    """Effort tier parsed from the seat label description, or 'unknown'."""
    m = re.search(r"(?i)\b(default|medium|low|high)\b", label_desc.get(f"seat:{seat}", ""))
    return m.group(1).lower() if m else "unknown"
def complexity_of(i):
    """complexity:* tier of an issue, or None when the Tech Lead has not labelled it."""
    for l in labels(i):
        if l.startswith("complexity:"): return l.split(":", 1)[1]
    return None
def seat_active(seat):
    """A seat whose label description says INACTIVE is not part of the live pool."""
    return "inactive" not in label_desc.get(f"seat:{seat}", "").lower()
seat_map = {}
for seat in [s for s in SEATS if seat_active(s)]:
    lab = f"seat:{seat}"
    cur = [i for i in issues.values() if lab in labels(i) and i["state"] == "OPEN"]
    last = sorted([i for i in issues.values() if lab in labels(i) and i["state"] == "CLOSED"], key=lambda i: i["updatedAt"], reverse=True)
    seat_map[seat] = dict(
        effort=seat_effort(seat),
        current=[(i["number"], by_num.get(i["number"], {}).get("status"), i["title"]) for i in cur],
        last_done=(last[0]["number"], last[0]["title"]) if last else None,
    )
idle_seats = [s for s, v in seat_map.items() if not v["current"]]
over_assigned = [s for s, v in seat_map.items() if len(v["current"]) > 1]
unassigned_ready = [(n, t, complexity_of(issues[n])) for n, o, t in ready if o == "engineer" and not any(l.startswith("seat:") for l in labels(issues[n]))]
missing_complexity = [n for n, _, c in unassigned_ready if c is None]
digest = dict(seat_map=seat_map, idle_seats=idle_seats, over_assigned=over_assigned, unassigned_ready=unassigned_ready, missing_complexity=missing_complexity, generated=now.strftime("%Y-%m-%d %H:%M UTC"), milestones=ms, columns={k: len(v) for k, v in cols.items()}, ready=ready, blocked=blocked, in_progress=inprog, open_prs=open_prs, next_up=nextup, changes=changes, added=added)
json.dump(digest, open(os.path.join(OUT, "digest.json"), "w"), indent=1, default=str)
print(f"{'[dry] ' if DRY else ''}added={added} changes={len(changes)}")
for c in changes: print("  ", c)
print("columns:", digest["columns"]); print("milestones:", ms)
print("SEATS:", {k: [c[0] for c in v["current"]] for k, v in seat_map.items()}, "IDLE:", idle_seats, "OVER:", over_assigned, "UNASSIGNED READY:", [f"#{n}:{c or '?'}" for n, _, c in unassigned_ready], "MISSING COMPLEXITY:", missing_complexity); print("READY:", [f"#{n} ({o})" for n, o, _ in ready]); print("IN PROGRESS:", inprog); print("OPEN PRs:", open_prs); print("NEXT UP:", nextup[:12])
