# Lap-sim prototype

**Status: PROTOTYPE, not game code.** This is the calibration harness for the pace/lap model,
kept in the repo so the calibration is reproducible and nothing lives only in a scratchpad. It is
the source the maintainer verifies against the Forza gold standard before any of it is ported into
`packages/sim` (see the integration plan and Sprint 124 in `docs/design/`).

## Files

- `lapsim-report.cjs` - the model. Reads the spec sheet from `../car-spec-book.html` (the `CARS`
  array), runs the quasi-static point-mass sim over the four game courses plus Legend Island, and
  writes `lapsim-data.json`. Prints a ranked report to stdout and the Legend Island calibration
  table to stderr. CommonJS (`.cjs`) because the repo root is `type: module`.
- `lapsim-data.json` - the model output consumed by the dashboard (85 cars x courses).
- `lapsim-report.txt` - the last captured run (ranked report + Legend calibration), for quick review.
- `lapsim-viz.html` - the dashboard artifact (published to claude.ai; redeploy with the same file
  path / URL). Its embedded data blob is refreshed from `lapsim-data.json` (see below).

## Run

```
node docs/design/lapsim/lapsim-report.cjs
```

Refresh the dashboard's embedded data after a run:

```
node -e '
const fs=require("fs"),d="docs/design/lapsim/";
let h=fs.readFileSync(d+"lapsim-viz.html","utf8");
const data=fs.readFileSync(d+"lapsim-data.json","utf8").trim();
const L=h.split("\n"),i=L.findIndex(l=>l.startsWith("const DATA="));
const line=L[i],s=line.indexOf("{");let depth=0,end=-1,inStr=false,esc=false;
for(let p=s;p<line.length;p++){const c=line[p];
  if(inStr){if(esc)esc=false;else if(c=="\\")esc=true;else if(c=="\"")inStr=false;continue}
  if(c=="\"")inStr=true;else if(c=="{")depth++;else if(c=="}"){if(--depth==0){end=p;break}}}
L[i]="const DATA="+data+line.slice(end+1);
fs.writeFileSync(d+"lapsim-viz.html",L.join("\n"));
'
```

## The model and its calibration

The exact maths is in `../pace-model-math.md`; the design rationale in `../pace-model-design.md`;
the Forza-anchored calibration record (anchor times, sense-checks, the Legend Island geometry, and
open tuning items) in `../lap-calibration.md`. Grip/spec ground truth is `../car-spec-book.html`.

As of the first calibration pass (2026-07-24) the seven-car main field matches the maintainer's
Legend Island laps within +/-3%; the two extreme kei cars (Beat, Acty) are known outliers pending a
low-power modelling pass. None of this is in the game yet.
