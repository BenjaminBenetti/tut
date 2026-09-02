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

issues = {i["number"]: i for i in json.loads(gh("issue", "list", "-R", REPO, "--state", "all", "--limit", "500", "--json", "number,title,state,labels,milestone,body,url,updatedAt,createdAt"))}
prs = json.loads(gh("pr", "list", "-R", REPO, "--state", "all", "--limit", "200", "--json", "number,title,state,headRefName,body,createdAt,updatedAt,reviewDecision,mergedAt,isDraft"))
branches = [b.strip().replace("origin/", "") for b in subprocess.run(["git", "branch", "-r"], capture_output=True, text=True, cwd=ROOT).stdout.splitlines() if "->" not in b]
subprocess.run(["git", "fetch", "origin", "--prune", "-q"], cwd=ROOT)
items = json.loads(gh("project", "item-list", PNUM, "--owner", POWNER, "--format", "json", "--limit", "500"))["items"]
by_num = {it["content"]["number"]: it for it in items if it.get("content", {}).get("number")}

def deps_of(i):
    body = i["body"] or ""
    m = re.search(r"## Dependencies\s*(.*?)(?:\n## |\Z)", body, re.S)
    sec = m.group(1) if m else ""
    return sorted({int(n) for n in re.findall(r"#(\d+)", sec)})
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
    if "type:epic" in L: return "mapgen" if "area:mapgen" in L else "producer"
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
    if has_branch(n) or current == "In Progress": return "In Progress"
    if "status:blocked" in L: return "Blocked"
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
open_prs = [dict(number=p["number"], title=p["title"], age_h=age_h(p["createdAt"]), idle_h=age_h(p["updatedAt"]), review=p["reviewDecision"] or "none", draft=p["isDraft"]) for p in prs if p["state"] == "OPEN"]
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
digest = dict(generated=now.strftime("%Y-%m-%d %H:%M UTC"), milestones=ms, columns={k: len(v) for k, v in cols.items()}, ready=ready, blocked=blocked, in_progress=inprog, open_prs=open_prs, next_up=nextup, changes=changes, added=added)
json.dump(digest, open(os.path.join(OUT, "digest.json"), "w"), indent=1, default=str)
print(f"{'[dry] ' if DRY else ''}added={added} changes={len(changes)}")
for c in changes: print("  ", c)
print("columns:", digest["columns"]); print("milestones:", ms)
print("READY:", [f"#{n} ({o})" for n, o, _ in ready]); print("IN PROGRESS:", inprog); print("OPEN PRs:", open_prs); print("NEXT UP:", nextup[:12])
