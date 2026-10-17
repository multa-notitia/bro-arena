#!/usr/bin/env python3
"""Print a markdown table of every sheet/clip (frames, total ms, events) from the JSON."""
import json, os, sys
d = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "/workspace/bro/art", "public", "sprites")
print("| id | clip | loop | frames (cell:ms) | total | events |")
print("|---|---|---|---|---|---|")
for f in sorted(os.listdir(d)):
    if not f.endswith(".json") or f.startswith("prop-"):
        continue
    m = json.load(open(os.path.join(d, f)))
    for cn, c in m["clips"].items():
        fr = c["frames"]
        ev = []
        for k, x in enumerate(fr):
            e = x.get("events") or ([x["event"]] if x.get("event") else [])
            if e:
                ev.append(f"f{k}@{sum(y['ms'] for y in fr[:k])}ms:{'+'.join(e)}")
        seq = " ".join(f"{x['i']}:{x['ms']}" for x in fr)
        print(f"| {f[:-5]} | {cn} | {'yes' if c.get('loop', True) else 'no'} | {seq} | {sum(x['ms'] for x in fr)} | {', '.join(ev)} |")
