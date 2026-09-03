"""Regenerate the Status Digest inside docs/handoff/producer.md.

Reads .producer/digest.json (written by groom.py) and replaces the block between
<!-- digest:start --> and <!-- digest:end --> in the handoff file. Everything
outside the markers is hand-written by the Producer and left untouched. If the
markers are missing, the digest is inserted before the first "## " heading that
follows the title, and markers are added.
"""
import json, os, re, subprocess

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, cwd=SP).stdout.strip()
HANDOFF = os.path.join(ROOT, "docs", "handoff", "producer.md")
START, END = "<!-- digest:start -->", "<!-- digest:end -->"


def render_digest(d):
    """Build the digest markdown from groom.py's digest.json."""
    ms, cols = d["milestones"], d["columns"]
    L = [f"## Status Digest ({d['generated']})", "", "| Milestone | done / total |", "|---|---|"]
    for k in ("M0 Foundation", "M1 Overworld", "M1.5 Map Generation"):
        v = ms.get(k, [0, 0]); L.append(f"| {k} | {v[0]} / {v[1]} |")
    L += ["", "Board: " + " · ".join(f"{k} {cols.get(k, 0)}" for k in ("Backlog", "Ready", "In Progress", "In Review", "Blocked", "Done")), ""]
    sm = d.get("seat_map", {})
    if sm:
        L += ["**Engineer seats** (one open issue per seat; Producer assigns via `seat:eng-N`; route by `complexity:*` — high → default-effort seats only, low → medium-effort seats first):", "", "| Seat | Effort | Current | Status | Last merged |", "|---|---|---|---|---|"]
        for seat, v in sm.items():
            cur = "; ".join(f"#{n} {t}" for n, _, t in v["current"]) or "IDLE"
            st = "; ".join(str(s) for _, s, _ in v["current"]) or "-"
            last = f"#{v['last_done'][0]}" if v.get("last_done") else "-"
            L.append(f"| {seat} | {v.get('effort', '?')} | {cur} | {st} | {last} |")
        flags = []
        if d.get("idle_seats"): flags.append("idle: " + ", ".join(d["idle_seats"]))
        if d.get("over_assigned"): flags.append("over-assigned: " + ", ".join(d["over_assigned"]))
        if d.get("unassigned_ready"): flags.append("unassigned Ready: " + ", ".join(f"#{u[0]} ({u[2] if len(u) > 2 and u[2] else 'no complexity label'})" for u in d["unassigned_ready"]))
        if d.get("missing_complexity"): flags.append("need Tech Lead complexity label before assignment: " + ", ".join(f"#{n}" for n in d["missing_complexity"]))
        L += ["", ("⚠ " + " · ".join(flags)) if flags else "All live seats occupied.", ""]
    L += ["**Ready now** (no unmerged dependencies):", ""] + [f"- #{n} ({o}) {t}" for n, o, t in d["ready"]] + [""]
    L += ["**In-flight PRs** (age h / idle h / review):", ""]
    L += [f"- #{p['number']} {p['age_h']}h / {p['idle_h']}h / {p['review']}{' · DRAFT' if p['draft'] else ''} — {p['title']}" + ("  ⚠ needs review" if p["idle_h"] > 3 and p["review"] in ("none", "n/a") else "") for p in d["open_prs"]] or ["- none"]
    L += ["", "**In progress** (branch pushed?):", ""] + ([f"- #{n} {'yes' if b else 'NO BRANCH'} — {t}" for n, t, b in d["in_progress"]] or ["- none"])
    L += ["", "**Blocked**:", ""] + ([f"- #{n} — {t}" for n, t in d["blocked"]] or ["- none"])
    L += ["", "**Next assignments for idle engineers** (Ready first, then what unblocks next):", ""]
    eng = [r for r in d["ready"] if r[1] == "engineer"]
    L += [f"{i + 1}. #{n} — {t}" for i, (n, o, t) in enumerate(eng)]
    L += [f"{len(eng) + i + 1}. #{n} — {t} (Ready once {', '.join('#' + str(x) for x in deps)} merges)" for i, (n, t, deps) in enumerate(d["next_up"][:6])]
    return "\n".join(L)


def main():
    """Splice the rendered digest into the handoff file."""
    d = json.load(open(os.path.join(ROOT, ".producer", "digest.json")))
    digest = f"{START}\n{render_digest(d)}\n{END}"
    text = open(HANDOFF).read() if os.path.exists(HANDOFF) else "# Producer handoff\n\n"
    if START in text and END in text:
        text = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: digest, text, count=1, flags=re.S)
    else:
        # Legacy layout: replace the generated "## Status Digest" section up to the risks divider, else insert after the title block.
        m = re.search(r"## Status Digest.*?\n---\n", text, re.S)
        text = text[:m.start()] + digest + "\n\n" + text[m.end():] if m else re.sub(r"(\A# [^\n]*\n(?:>[^\n]*\n)?\n?)", lambda mm: mm.group(1) + digest + "\n\n", text, count=1)
    open(HANDOFF, "w").write(text)
    print(f"digest written to {os.path.relpath(HANDOFF, ROOT)}")


if __name__ == "__main__":
    main()
