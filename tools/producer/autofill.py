"""Seat autofill: for each live seat with no open seat-labelled issue, label the best eligible issue.
Eligible: open, not epic, not design-decision, has complexity:*, no seat label, every 'Blocked by #N' closed.
Routing: default seat -> high > medium > low; medium seat -> medium > low (never high).
Ranking: priority p0..p3, then milestone M2 first, then lowest number. Prints one line per action.
Usage: python3 tools/producer/autofill.py [--dry | --selftest]. Producer role only; no game code here."""
import json, os, re, subprocess, sys
ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                      cwd=os.path.dirname(os.path.abspath(__file__))).stdout.strip()
CONTROL = os.path.join(ROOT, ".producer")
REPO = "BenjaminBenetti/tut"; DRY = "--dry" in sys.argv


# ===========================================
# Control files
# ===========================================

def read_numbers(name):
    """Read one control file in `.producer/` as an ordered list of issue numbers.

    Format: one issue number per line, bare, first token on the line. Everything after it is
    free text, so a hold can finally say *why* it is held:

        457   PR #713 rewrites the same seam in tactical-animation-queue.ts
        594   Art Director is choosing between three options

    A line whose first token is not a number is a comment and is skipped. Returns None when the
    file does not exist, which is how callers tell "no list" from "an empty list".

    The old parser was `{int(x) for x in open(path).read().split()}` inside a bare `except` that
    swallowed everything: one annotation, and every hold silently vanished — or, on the release
    allowlist, a scope freeze silently lifted. Anything unparseable now shouts instead.
    """
    path = os.path.join(CONTROL, name)
    try:
        raw = open(path).read()
    except FileNotFoundError:
        return None
    except OSError as ex:
        print(f"WARN: {name} exists but could not be read ({ex}); treating it as absent")
        return None
    nums, junk = [], []
    for line in raw.splitlines():
        tok = line.split()[0] if line.split() else ""
        if tok.isdigit():
            n = int(tok)
            if n not in nums: nums.append(n)
        elif line.strip():
            junk.append(line.strip())
    for j in junk:
        # `#457` on its own line reads as a comment and holds nothing. That is the exact way a
        # well-meant annotation disables a hold, so name it rather than skipping quietly.
        if re.fullmatch(r"#\s*\d+.*", j):
            print(f"WARN: {name}: {j!r} starts with '#', so it is a comment and is NOT in effect."
                  f" Write the number bare and put the reason after it.")
        else:
            print(f"note: {name}: ignoring comment line {j[:60]!r}")
    return nums


def selftest():
    """Prove the control-file guards fire. `python3 tools/producer/autofill.py --selftest`."""
    import tempfile, io, contextlib
    global CONTROL
    real, ok = CONTROL, True
    with tempfile.TemporaryDirectory() as d:
        CONTROL = d
        cases = [
            ("457\n594\n447\n", [457, 594, 447], ""),
            ("457   PR #713 rewrites the same file\n594   waiting on the Art Director\n", [457, 594], ""),
            ("", [], ""),
            ("#457\n594\n", [594], "NOT in effect"),
            ("nonsense\n457\n", [457], "ignoring comment line"),
            ("457\n457\n", [457], ""),
        ]
        for body, want, want_out in cases:
            open(os.path.join(d, "t.txt"), "w").write(body)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf): got = read_numbers("t.txt")
            out = buf.getvalue()
            bad = got != want or (want_out and want_out not in out)
            ok &= not bad
            print(f"{'FAIL' if bad else 'pass'} {body!r} -> {got} (want {want}) {out.strip()[:70]}")
        missing = read_numbers("absent.txt")
        ok &= missing is None
        print(f"{'pass' if missing is None else 'FAIL'} missing file -> None (want None)")
    CONTROL = real  # the temp dir is gone; leaving it set would make every later read return None
    print("SELFTEST OK" if ok else "SELFTEST FAILED")
    return 0 if ok else 1


if "--selftest" in sys.argv:
    sys.exit(selftest())
def gh(*a, inp=None):
    p = subprocess.run(["gh", "api", *a], capture_output=True, text=True, input=inp)
    if p.returncode: raise RuntimeError(p.stderr[:200])
    return json.loads(p.stdout) if p.stdout.strip() else None
labels = {l["name"]: (l.get("description") or "") for l in gh(f"repos/{REPO}/labels?per_page=100")}
seats = {}
for name, desc in labels.items():
    if name.startswith("seat:eng-") and "inactive" not in desc.lower():
        seats[name] = "default" if "default" in desc.lower() else "medium"
pages = gh(f"repos/{REPO}/issues?state=open&per_page=100", "--paginate", "--slurp")
issues = [i for page in pages for i in page if "pull_request" not in i]
def L(i): return {l["name"] for l in i["labels"]}
occupied = {l for i in issues for l in L(i) if l.startswith("seat:")}
empty = [s for s in seats if s not in occupied]
if not empty:
    print("all seats occupied"); sys.exit(0)
def tier(i):
    for l in L(i):
        if l.startswith("complexity:"): return l.split(":")[1]
def prio(i):
    for l in L(i):
        if re.fullmatch(r"p[0-3]", l): return int(l[1])
    return 9
def blockers(i):
    body = i.get("body") or ""
    m = re.search(r"## Dependencies\s*(.*?)(?:\n## |\Z)", body, re.S)
    sec = (m.group(1) if m else "").strip()
    if re.match(r"(?i)^[_*\s]*none\b", sec): return []
    phrases = re.findall(r"(?i)(?:blocked by|depends on|needs|after|requires)((?:\s*(?:,|and|\+)?\s*#\d+(?:\s*\([^)]*\))?)+)", sec)
    return sorted({int(x) for ph in phrases for x in re.findall(r"#(\d+)", ph)} if phrases else {int(x) for x in re.findall(r"#(\d+)", sec)})
state_cache = {}
def is_closed(n):
    if n not in state_cache:
        try: state_cache[n] = gh(f"repos/{REPO}/issues/{n}")["state"] == "closed"
        except Exception: state_cache[n] = True  # a PR number or missing: treat as satisfied
    return state_cache[n]
# Hold list: issues another role has claimed (Tech Lead, MapGen, Art) that must not be seated,
# plus anything parked on a decision. Put the reason on the line after the number.
HOLD = set(read_numbers("hold.txt") or [])
# Release push (Director, 2026-09-04 05:00 UTC): until the file is removed, seats refill only from
# this ordered list. Order is the Director's: release-critical set first, then the named fallbacks.
ALLOW = read_numbers("release-allowlist.txt")
# area:art and area:qa belong to the Art Director and QA. Auto-seating an engineer onto them has
# misfired repeatedly (#343 five times, #190, #450). If an engineer should take one, label it by hand.
# MapGen self-directs its own queue and asks for routing when idle, so its issues are not
# auto-seated either (the loop grabbed #447, an M3 sketch the Director is holding).
ROLE_OWNED = {"area:art", "area:qa", "area:mapgen"}
cands = [i for i in issues if tier(i) and i["number"] not in HOLD
         and not (L(i) & {"type:epic", "design-decision", "status:blocked"})
         and not (L(i) & ROLE_OWNED)
         and not any(l.startswith("seat:") for l in L(i))]
cands = [i for i in cands if all(is_closed(b) for b in blockers(i))]
# Milestone order: the Director's standing rule is that M2.5 Tactical Feel outranks the M2 remainder,
# so rank them explicitly rather than by prefix — "M2.5..." and "M2 ..." both start with "M2".
MILESTONE_RANK = {"M2.5 Tactical Feel": 0, "M2 Basic Missions": 1}
def rank(i): return (prio(i), MILESTONE_RANK.get((i.get("milestone") or {}).get("title", ""), 2), i["number"])
taken = set()
for seat in empty:
    # Tier rule relaxed by the Director 2026-09-04: eng-4 and eng-5 run Opus at xhigh and take
    # complexity:high too. eng-3 (max) still gets high first by being offered it first.
    order = ["high", "medium", "low"] if seats[seat] == "default" else ["medium", "high", "low"]
    # Priority dominates: take the best priority the seat can reach, and only then prefer the
    # richer tier within it, so an unprioritised or p2 issue never outranks a p1 one.
    pool_all = [c for c in cands if tier(c) in order and c["number"] not in taken]
    pick = None
    if ALLOW is not None:
        by_num = {c["number"]: c for c in pool_all}
        for n in ALLOW:
            if n in by_num: pick = by_num[n]; break
        if pick is None:
            print(f"HOLD {seat}: idle, but the release allowlist has nothing left it can take (scope freeze)")
            continue
    elif pool_all:
        # Precedence: priority, then milestone (M2.5 outranks the M2 remainder by the Director's
        # standing rule), and only then the richer tier the seat can take. Tier used to come before
        # milestone, which let an M2 leftover beat M2.5 band work at the same priority.
        best = min(prio(c) for c in pool_all)
        at_best = [c for c in pool_all if prio(c) == best]
        best_ms = min(rank(c)[1] for c in at_best)
        at_best = [c for c in at_best if rank(c)[1] == best_ms]
        for t in order:
            pool = sorted([c for c in at_best if tier(c) == t], key=rank)
            if pool: pick = pool[0]; break
    # Labels lag; start comments do not. Before labelling, check the chosen issue for someone
    # already on it — an unlabelled seat can be mid-flight (this cost duplicate work on #525 and a
    # mis-route on #552). One extra call, only for the issue actually about to be assigned.
    while pick is not None:
        n0 = pick["number"]
        # gh() already prepends "api" — passing it again made every call fail, and the bare
        # `except` swallowed it, so this guard was inert from the day it was written (it let #108
        # be built twice). Any failure now shouts instead of silently allowing the assignment.
        try:
            cmts = gh(f"repos/{REPO}/issues/{n0}/comments?per_page=100")
            last_start = max((k for k, c in enumerate(cmts)
                              if c["body"].lstrip().startswith("**Engineer**")
                              and any(w in c["body"].lower() for w in ("starting", "taking this", "i am on it", "picking this up"))),
                             default=None)
            # A start that the Producer has since unseated is stale, not live work — otherwise an
            # issue a seat was moved off is blocked forever (this idled eng-4 on #497).
            # A start is stale if the Producer unseated it, or the engineer handed it back /
            # stood down afterwards. Without this an issue somebody briefly touched is blocked
            # forever (this idled eng-4 while #497 sat free).
            RELEASE = ("unseated", "handing this back", "handing it back", "standing down",
                       "not starting", "stood down", "released")
            released = last_start is not None and any(
                any(w in c["body"].lower() for w in RELEASE) for c in cmts[last_start + 1:])
            started = last_start is not None and not released
        except Exception as ex:
            print(f"WARN: start-comment guard failed on #{n0} ({ex}); assigning without it")
            started = False
        if not started: break
        print(f"SKIP #{n0}: an engineer has already commented that they are on it (label lag)")
        taken.add(n0); pick = None
        # Re-select across every remaining candidate, not just the bucket the skipped issue was in.
        rest = [c for c in cands if c["number"] not in taken and tier(c) in order]
        if ALLOW is not None:
            by_num2 = {c["number"]: c for c in rest}
            for nn in ALLOW:
                if nn in by_num2: pick = by_num2[nn]; break
        elif rest:
            b2 = min(prio(c) for c in rest)
            r2 = [c for c in rest if prio(c) == b2]
            m2 = min(rank(c)[1] for c in r2)
            r2 = [c for c in r2 if rank(c)[1] == m2]
            for t in order:
                cand = sorted([c for c in r2 if tier(c) == t], key=rank)
                if cand: pick = cand[0]; break
    if not pick:
        print(f"IDLE {seat}: no eligible issue (Ready, tiered, unseated) — Producer to decompose or ask for tiers"); continue
    n = pick["number"]; taken.add(n)
    if DRY:
        print(f"[dry] AUTOFILL {seat} <- #{n} ({tier(pick)}, p{prio(pick)}) {pick['title'][:60]}"); continue
    gh("-X", "POST", f"repos/{REPO}/issues/{n}/labels", "--input", "-", inp=json.dumps({"labels": [seat]}))
    gh("-X", "POST", f"repos/{REPO}/issues/{n}/comments", "--input", "-", inp=json.dumps({"body": f"**Producer** · TUT agent\nAssigned to seat {seat.split(':')[1]} ({seats[seat]} effort; `complexity:{tier(pick)}`) by the 5-minute occupancy loop: the seat was empty and this is the highest-priority Ready issue it can take. Read the acceptance criteria and blockers in the body; ask here if anything is unclear."}))
    print(f"AUTOFILL {seat} <- #{n} ({tier(pick)}, p{prio(pick)}) {pick['title'][:60]}")
