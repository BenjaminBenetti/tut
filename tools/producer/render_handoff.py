import json, os, subprocess, sys
"""Render docs/handoff/producer.md from .producer/digest.json (groom.py) + tools/producer/handoff_static.md."""
SP=os.path.dirname(os.path.abspath(__file__))
ROOT=subprocess.run(["git","rev-parse","--show-toplevel"],capture_output=True,text=True,cwd=SP).stdout.strip()
d=json.load(open(os.path.join(ROOT,".producer","digest.json")))
ms=d["milestones"]; cols=d["columns"]
def mrow(k): v=ms.get(k,[0,0]); return f"| {k} | {v[0]} / {v[1]} |"
L=["# Producer handoff","","> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.","",
   f"## Status Digest ({d['generated']})","","| Milestone | done / total |","|---|---|"]
for k in ("M0 Foundation","M1 Overworld","M1.5 Map Generation"): L.append(mrow(k))
L+=["", "Board: " + " · ".join(f"{k} {cols.get(k,0)}" for k in ("Backlog","Ready","In Progress","In Review","Blocked","Done")), ""]
L+=["**Ready now** (no unmerged dependencies):",""]+[f"- #{n} ({o}) {t}" for n,o,t in d["ready"]]+[""]
L+=["**In-flight PRs** (age h / idle h / review):",""]+([f"- #{p['number']} {p['age_h']}h / {p['idle_h']}h / {p['review']}{' · DRAFT' if p['draft'] else ''} — {p['title']}"+("  ⚠ needs review" if p['idle_h']>3 and p['review']=='none' else "") for p in d["open_prs"]] or ["- none"])+[""]
L+=["**In progress** (branch pushed?):",""]+([f"- #{n} {'yes' if b else 'NO BRANCH'} — {t}" for n,t,b in d["in_progress"]] or ["- none"])+[""]
L+=["**Blocked**:",""]+([f"- #{n} — {t}" for n,t in d["blocked"]] or ["- none"])+[""]
L+=["**Next assignments for idle engineers** (Ready first, then what unblocks next):",""]
eng=[r for r in d["ready"] if r[1]=="engineer"]
L+=[f"{i+1}. #{n} — {t}" for i,(n,o,t) in enumerate(eng)]
L+=[f"{len(eng)+i+1}. #{n} — {t} (Ready once {', '.join('#'+str(x) for x in deps)} merges)" for i,(n,t,deps) in enumerate(d["next_up"][:6])]
L+=["", "**Risks**:", "",
    "- M1 Ready queue is four data-model issues; it widens only as #43 merges (unblocks #50, #51, #52) and #7/#8/#11 land (unblocks #47, #53, #54). If engineers outpace the Tech Lead's M0 merges, they idle.",
    "- #54 (GameState root) must fit #7's root and ADR 0003; a mismatch costs a rework day on the critical path.",
    "- Biome / settlement ids: #43 and MapGen #19 must agree (comment on #19). Whoever lands second reconciles.",
    "- M1.5 is one serial chain of passes; a slow review on any one stalls the whole milestone.",
    "- #29 is oversized (flagged on #32).",
    "", "---", ""]
L.append(open(os.path.join(SP,"handoff_static.md")).read())
open(os.path.join(ROOT,"docs/handoff/producer.md"),"w").write("\n".join(L))
print("rendered docs/handoff/producer.md", len(L), "lines")
