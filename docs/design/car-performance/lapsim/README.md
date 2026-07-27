# The calibration harness

**Status: PROTOTYPE, not game code.** This is where the car performance model actually runs. It is
kept in the repo so every fit is reproducible and nothing lives only in a chat log. The model it
implements is documented in `../README.md`; the maths is in `../formulas.md`. **Read those first.**
This file covers the harness itself: what it does, what it prints, and what its fits are honest
about.

The model here is LOCKED. It has also diverged from `packages/sim/src/performance.ts`, which still
runs the older derived physics; closing that gap is a whole sprint and is tracked in `TODO.md`.

## Files

- `lapsim-report.cjs` - the model and every fit. Reads the `CARS` array out of
  `../car-spec-book.html`, runs the sim over the four courses, prints the ranked report and all the
  calibration evidence, and writes `lapsim-data.json`. CommonJS because the repo root is
  `type: module`. The course list derives from `COURSES` everywhere downstream, so adding or removing
  a course is one edit.
- `lapsim-data.json` - the model output, plus a `constants` block and a `validation` block. This is
  the authoritative record of what the published run produced; quote it rather than a doc.
- `lapsim-report.txt` - the last captured stdout, for quick review. The calibration sections go to
  **stderr** and are not in this file; capture them with `2>` if you want them.
- `lapsim-viz.html` - the dashboard artifact. Its embedded data blob is refreshed from
  `lapsim-data.json`; see below.
- `blind-predictions-2026-07-27.md` - one round's predictions, committed in writing before the cars
  were driven, with the results appended underneath. Nothing in the prediction half may be edited.

## Run

```sh
node docs/design/car-performance/lapsim/lapsim-report.cjs
```

A little over a minute. Two things cost that: the corner-exit term has no affine shortcut, so its
sweep costs a real lap simulation per driven time per candidate weight; and the drag set's mechanism
probes re-solve every measured car's acceleration curve and re-lap every driven lap once per
candidate value.

Refresh the dashboard's embedded data after a run:

```sh
node -e '
const fs=require("fs"),d="docs/design/car-performance/lapsim/";
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

## The published constants

Read out of `lapsim-data.json`'s `constants` block, which the run writes itself:

| Constant | Value | What it is |
|---|---|---|
| `kAgi` | 0.82 | direction-change weight, the additive term |
| `kExit` | 0 | the corner-exit speed penalty, **not applied** (see below) |
| `brakeD0` | 5.987 m | the dead distance in front of every published stop |
| `geoMu` / `geoR` / `geoT` | 1.220 / 20 / 0.0612 | the geometric corner-grip ceiling |
| drag offset | -3.28% | applies to the standing kilometre and to nothing else |
| acceleration provenance | 59 measured, 4 one-point, 22 predicted | of the 85-car roster |

## What is fitted, and on what

This is the part that decides how much any error figure is worth.

- **The direction-change weight** is fitted on all 38 driven laps across Misaki, Hakone and Wangan
  at once, equal weight per course. Its functional form was swept as a family, 198 variants over
  three stages, against the same three courses simultaneously.
- **The geometric grip ceiling** is fitted only on the six high-grip points that sit above the
  roster's grip range, with the direction-change weight swept jointly inside every cell. It is inert
  for ordinary cars by construction rather than by tuning: the ceiling at the tightest radius on any
  course is above the grip of all 85 roster cars, and the run proves the 45 existing driven laps do
  not move by a single bit rather than asserting it.
- **The brake dead distance** is one global constant, least-squares over the 59 cars that publish
  both stopping distances. It is not fitted per car: each car's own dead distance is exactly
  determined by its two distances, and the constant only has to collapse the disagreement between
  them.
- **The drag offset** is fitted on the seven standing kilometres. It lives inside the drag evaluator
  and structurally cannot reach a lap.
- **NOTHING is fitted per car.** Every per-car quantity is solved from that car's own measurements
  and round-trips to them exactly.

## The two searched geometries, and what that costs

**Hakone and Wangan are behavioural facsimiles, not surveys. Say so every time their geometry is
quoted.** No radius, angle or connector in either array is a measured fact about a road.

Hakone is a 2.7 km road searched to reproduce its first eight driven times. The surveyed road is
kept in the file as `HAK_MAP` and nothing laps it except the diagnostics, because on it the model is
about 22% slow with the direction-change term switched off entirely, which is the FLOOR of what it
can produce there. The missing physics is a racing-line model: a mapped radius is a centreline
radius, a driver on a road with width does not drive the centreline, and apex speed goes as the
square root of radius. Keeping the surveyed map in the file is what stops the facsimile quietly
becoming "the road". What the facsimile costs, recorded so it is never lost: the switchback count
drops from eleven to four. What it buys is that eight laps become readable as car results instead of
as one large shared bias.

Wangan is the same idea from the other end. The maintainer's description of the road is authored in
the file as `WAN_DESC` and the published geometry was searched from there against the first five
driven times, holding the corner character (8 fast, 2 medium, 1 slow) and the 7.0 km length.

**Only Misaki's geometry is independent of any fit.** So only Misaki's error LEVEL measures the
model. On the facsimiles a search moves the level and cannot move the per-car scatter about it,
because a geometry charges every car through the same corners. Read the mean as the search and the
spread as the model.

## Why the corner-exit penalty is switched off

The direction-change term charges a fixed number of seconds per corner, scaled by geometry and
divided by usable grip. That is wrong in KIND rather than badly tuned: a car it penalises leaves the
corner at exactly the speed it would have had anyway, so the charge cannot propagate down the
following straight, which is how a real direction-change deficit actually costs time.

A replacement was built and fitted: a reduction in corner-exit speed, with nothing added to the
clock. It is better at what it was built for. It reproduces more of the driven course-character
swing and it halves the error on the pair that motivated it. It also costs level accuracy on every
course at once, roughly doubling Hakone's and Wangan's mean absolute error, because both facsimile
geometries were searched under the additive term and held fixed, and an exit-speed deficit
structurally cannot supply what the frozen Hakone geometry asks of a direction-change term without
saturating.

So `kExit` is 0 and the additive term stands. **The machinery for both is kept in the file** and the
report scores them side by side, because the right answer is probably to re-search both geometries
under the exit term, and that work has not been done.

## Reading the report

Everything below is on stdout unless stated.

- The **ranked table**: all 85 cars, per-course times, per-course ranks, and the weighted overall
  index.
- The **driven-lap tables**, one per course, model against driven with the error, plus the committed
  blind prediction where one exists.
- The **drag set** and its mechanism probes: seven standing kilometres, and the five candidate
  mechanisms that were priced against them and rejected.
- The **grip-ceiling section**: the six high-grip points before and after, and the proof that the 45
  existing driven laps did not move.
- The **course-character swing** and the **cross-course residual decomposition**, which is what
  separates a per-car error from a per-corner one.
- The **calibration tables** on stderr: the braking derivation, the shape sweep, the geometry
  searches, and the parameter surfaces.

## Two cards you must read before changing anything about them

Nineteen spec figures are overridden rather than scraped, across two cars, for the same reason in
both: the third-party scrape measured Forza's **preset starter car** rather than the stock one. The
1989 Silvia K's overrides six fields against the Forza wiki's stock panel, and its 0-161 is NOT
corrected because no stock figure exists, so that car's solved effective power is still
preset-tainted while its launch acceleration is not. The 1994 Celica GT-Four ST205 overrides
thirteen against the game's own stock panel, read first hand, and nothing on that card is tainted
afterwards. Both rulings live on the entries as `gOvr` in `../car-spec-book.html`.
