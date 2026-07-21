# The Failure Map (diagnosis design bible)

Status: DRAFT for maintainer review (Sprint 109). Amendments to the ontology or laws
require explicit maintainer approval recorded here, as with the other bibles.

The generated graph of the SHIPPED content lives in `failure-map.generated.md` and
`failure-map.html` (`node scripts/generateFailureMap.cjs` regenerates both; run after any
change to `failureModes.json`, `symptoms.json`, or `diagnosticTests.json`). VS Code's
built-in Markdown preview does not render mermaid: install the Markdown Preview Mermaid
Support extension, or open `failure-map.html` in a browser instead. This document is the
design intent; the generated files are the proof the game matches it.

## Ontology

- **Failure mode** - ground truth. A specific fault in a specific component with a
  severity band (`failureModes.json`, the global registry). Terminal nodes. One is
  rolled true per car-symptom at generation, weighted by the symptom's own odds.
- **Symptom** - a public observable on the lot card, pointing at 2+ failure modes with
  weighted odds. The odds are what the room prices; the map is what the player walks.
  Never 1:1 with a failure mode.
- **Test** - an edge, performed against a symptom during a paid yard visit. Binary
  result, DETERMINED by the car's rolled failure mode (never rolled at click time): the
  same test on the same symptom answers differently car to car. Costs minutes from the
  shared visit budget.
- **Finding** - what a result produces: a knowledge state (the surviving failure modes)
  plus its authored line. Findings are implicit in content for v1.0 (per-symptom trees);
  this document draws them explicitly. If the full map shows the same finding sub-tree
  recurring across symptoms, promoting findings to shared content nodes is the recorded
  follow-up - evidence first, structure second.
- **Dead end** - contextual, never a node type: any test whose split does not divide
  what is currently still suspected. Every test is signal in some knowledge states and
  waste in others; the previous result line is the only thing that separates them.

## Laws (all enforced by `packages/sim/tests/diagnosisRouteProbes.test.ts`)

1. **Root shape:** no root-test outcome carrying more than 25% of a symptom's weight
   may resolve outright. Minority instant-reads are allowed and welcome (white sweet
   smoke IS the head gasket): jackpot or bad news, honestly and rarely.
2. **Choice everywhere:** once any test has run, every reachable unresolved node offers
   at least two unrun tests.
3. **Waste and signal:** every such node offers at least one live dead end AND at least
   one narrowing test.
4. **Reading pays, quantified:** expected minutes of uniform-random clicking must be at
   least 1.5x the weighted best-route minutes.
5. **Grenade budgets:** the worst-case minutes to decide the write-off in or out are
   measured and pinned per symptom.
6. **Copy is the compass:** every result line routes the next choice. Tone: mechanically
   true first, wholesome, dry; never cringey (the game-tone law). Era band 1995-2005.
   The emotional register is authored per outcome: a GEM reveal lands the
   treasure-found victory, quiet but unmistakable; a GRENADE line must be UNMISTAKABLY
   terminal, never cold or clinical, and may carry a shade of dry gallows humour (the
   player should hear "walk away" in the mechanic's voice, not read a lab report); dead
   ends carry the dry shrug. A gem or grenade line that reads neutral is a defect.
   The honest-limit closing ("that's everything the yard will tell you") is a deliberate,
   reusable pattern: where the yard genuinely cannot take a question further, saying so
   is good design, and the sweep should use it wherever it is mechanically true.
   THE VOICE (maintainer law, 2026-07-21): Sam Vimes as a mechanic in 90s Japan. Short
   declaratives; evidence over stories; jokes delivered flat and never flagged; cynicism
   with a floor; the car is a witness, not a pet; if a line sounds like it knows it is
   clever, cut it. Standing decisions from the Vimes copy review: "The rail remembers."
   is KEPT and must be EARNED (the sweep seeds the evidence-outlasts-the-story worldview
   in at least two more lines, candidates: seat-poke, terminal-wiggle, open-the-boot);
   roughly a third of the "not X, narrows to Y or Z" closers vary their delivery on the
   long boards (information content untouchable); the "Compression reads even and
   healthy" opener stays near-verbatim identical everywhere it appears, deliberately:
   the gauge does not care which car it is on.

## The map

### Routed (built, Sprints 105-106; measured ratios in the probe)

| Symptom | Causes (weight) | Board shape | Reading pays | Grenade |
|---|---|---|---|---|
| damp-passenger-footwell | matrix 38 / scuttle-drain 20 / grommet 14 / sunroof-drain 10 / seam 18 (scrap) | trace-the-wet -> board of 4; hose-the-roof at level 3 | 1.83x | 15m |
| smokes-on-startup | seals 45 / breather 20 / gasket 22 / rings 13 (scrap) | cold-start-watch -> board of 4 | 1.61x | 30m |
| crunch-into-second | synchros 48 / low-oil 14 / clutch 20 / gearset 18 (scrap) | gearbox-oil-check -> board of 4 | 1.70x | 25m |

### Unrouted: the fourteen

Boards are designed HERE for maintainer review; Sprint 108 implements nothing that has
not passed that review. An external mechanical-accuracy review (2026-07-21) has been
applied: two structural swaps (the quarter-panel gem and test; diff-whine's shaft-side
cause) and five copy laws recorded inline below.

Board designs for maintainer mark-up. NEW marks additions; weights re-sum to 100.
Result copy is authored at build time (Sprint 108) under the orchestrator's personal
sweep; gists here show the routing intent. Every board obeys the laws above; probes
verify the ratios at build.

**non-starter** - ladder: flat-battery (ignitionEcu worn 45), corroded-terminals NEW
(ignitionEcu fine 14, the gem), fuel-pump (fuelSystem poor 29), seized-engine (block
scrap 12). Root: hand-crank 15m [seized | rest] (the 12% grenade decided at root, like
glitter in the oil). Board: electrics-check 10m [battery+terminals | pump],
terminal-wiggle NEW 5m [terminals | rest], listen-for-pump NEW 5m [pump | rest]; dead
end: stethoscope (nothing left to hear once it cranks). Grenade 15m.

**tick-at-idle** - ladder: lifter-tick (headValvetrain poor 50), rocker-adjustment NEW
(headValvetrain fine 14, the gem: a feeler-gauge afternoon), blowing-manifold (exhaust
poor 23), rod-knock (internals scrap 13). Root: revs-and-listen NEW 5m
[lifter+rocker | manifold+knock] (a light tick in time with the cam against something
deeper). Board: stethoscope 15m [lifter | rest], exhaust-glove-test NEW 5m [manifold |
rest], oil-pressure-check 20m [knock | rest]; dead end: pull-a-plug. Grenade 25m.
Copy laws (external mechanical review): the root read sells RHYTHM and WARMTH, never
depth (a manifold chuff fades as it warms and seals; a knock hardens under revs; a
valvetrain tick stays metronomic at half crank speed), and the lifter-versus-rocker
result leans into the architecture reveal (solid lifters: good news, a feeler gauge
and a quiet afternoon).
**Tutorial consequence (maintainer ruling, 2026-07-21): the tutorial bends to the
system, never the reverse.** The four-wheels guided diagnosis becomes the two-step read
(revs-and-listen, then the stethoscope); Sprint 108 updates the tutorial steps and the
satisfiability probe with it. No law-1 exceptions exist anywhere on the map.

**wont-idle** - ladder unchanged (vacuum-leak intake worn 48 / tired-ecu ignitionEcu
poor 27 / worn-cams camsTiming poor 15 / burnt-valve headValvetrain scrap 10). Current
root (spray-test) isolates the 48% cause: illegal. New root: idle-watch NEW 5m
[leak+ecu | cams+valve] (hunting idle against a lumpy misfire). Board: spray-test 10m
[leak | rest], compression-test 25m [valve | rest]; under this root the ECU and the
cams resolve by ELIMINATION (spray clears the leak, compression clears the valve), so
nothing on this board is declared ambiguous; the honest-limit closing pattern lives on
boards where the limit is mechanically real; dead end: fuel-sniff NEW 5m. Grenade 30m.

**clunk-over-bumps** - ladder unchanged (4 causes). Current root (bounce-test) isolates
33%: illegal. New root: rock-and-listen NEW 5m [bushes+steering | dampers+subframe]
(a rattle up top against a deep thud underneath). Board: bounce-test 10m [dampers |
rest], steering-linkage-check 10m [steering | rest], undercarriage-look 15m [subframe |
rest]; dead end: ride-height-check. Grenade 20m.

**overheats-in-traffic** - ladder unchanged (4 causes); coolant-check root is already
legal [gasket+block | fan+radiator]. Board: warm-idle-watch 20m [fan | rest],
compression-test 25m [block | rest], rad-flow-feel NEW 5m [radiator | rest] (cold spots
across the core); dead end: hose-squeeze NEW 5m (same split as the root). Grenade 35m,
the dearest question in the game after smokes, deliberately. Copy law: the
compression split hangs on the PATTERN (two adjacent cylinders down is the gasket;
one odd cylinder, or nothing at all, is the crack), never a bare pass or fail.

**diff-whine** - ladder +worn-wheel-bearing NEW (driveline worn 15): diff-bearings 50,
wheel-bearing 15, centre-bearing 20, ring-pinion 15. Root: coast-and-load-listen NEW 5m
[diff side | shaft side] (a load-sensitive whine lives in the diff; a steady speed-drone rides the propshaft centre bearing or a hub).
Board: gearbox-oil-check 15m [ring-pinion | rest] (reuses the diff-oil swab, not a new
test), undercarriage-look 15m [centre bearing | rest] (the collapsed doughnut mount is
visible), spin-the-hub NEW 5m [wheel-bearing | rest]; dead end: stethoscope. Grenade
20m (built at gearbox-oil-check's own 15m off the root's 5m, not the 10m magnet-check
would have cost - corrected here to match the build).

**sagging-spring** - ladder +perished-spring-seats NEW (springs fine 15): sagging 50,
seats 15, broken 22, turret 13. Root: ride-height-check 10m [sagging+seats |
broken+turret] (even settle against one corner down). Board: wheel-off-look 15m
[broken | rest], undercarriage-look 15m [turret | rest], seat-poke NEW 5m [seats |
rest]; dead end: bounce-test. Grenade 25m.

**quarter-panel-filler** - ladder +tired-lacquer NEW (paint fine 15, the hidden gem: dead-flat paint that cuts back deep with a machine polish): respray 45,
tired-lacquer 15, rust-patch 25, rail 15. Root: sight-down-the-panel NEW 5m
[respray+tired-lacquer | patch+rail] (a straight lazy shine against ripple and bubble).
Board: magnet-check 10m [patch | rest], undercarriage-look 15m [rail | rest],
polish-spot-test NEW 10m [tired-lacquer | rest] (a dab of compound on one corner: comes back deep and glossy, or stays flat); dead end: open-the-boot NEW 5m (same split as the
root). Grenade 20m.

**oil-pressure-flutter** - ladder +thin-cheap-oil NEW (internals fine 15): sender 50,
thin-oil 15, pump 20, mains 15. Current root (oil-pressure-check) isolates 50%:
illegal. New root: warm-gauge-watch NEW 5m [sender+thin-oil | pump+mains], copy hedged: the
gauge alone cannot separate thin oil from tired mains (both read low hot and recover
with revs); the dipstick and the mechanical gauge do the real work. Board: dipstick-check NEW 5m [thin-oil | rest],
oil-pressure-check 20m on the mechanical gauge [mains | rest], read by PATTERN (low
hot idle that only part-recovers with revs is the mains; low across the range is the
pump; healthy readings mean the sender lies); dead ends: pull-a-plug, and the
stethoscope, which hears an engine, running. Grenade 25m.

**hesitates-under-load** - ladder +stale-fuel NEW (fuelSystem fine 15): filter 50,
stale-fuel 15, stretched-chain 23, jumped-chain 12. Root: rev-response-watch NEW 5m
[fuel side | chain side] (starving at the top end against a baggy, rattly pickup).
Board: fuel-pressure-check 15m [filter | rest], fuel-sniff NEW 5m [stale | rest],
compression-test 25m [jumped | rest]; dead end: pull-a-plug. Grenade 30m. Fiction
law: stale fuel only reads true on a car that has been sitting; the sniff copy sells
the half-tank-of-last-winter story.

**The four non-fatal doubts stay FLAT, deliberately:** pulls-under-braking (2 causes),
exhaust-rasp (2), steering-wander (2), wheel-vibration (3). A two-cause doubt with one
honest test is a complete, legible mechanic; routing it would be noise. The laws bind
routed symptoms only; these carry no `unlockedBy` and the probes skip them by
construction.

## Parked decisions (maintainer's, recorded)

- **Cross-symptom coherence:** a two-symptom car whose symptoms trace to the SAME rolled
  failure (one bill, one reveal). Cheap to express once the registry exists; needs an
  economy read before switching on.
- **Findings as shared content nodes:** promote only if the completed map shows real
  sub-tree repetition.
- **No OBD-II code reader anywhere on the map, deliberately.** The era straddles its
  arrival, but the yard is scruffy and the reader lives on the bench, where the
  tired-ECU call already sits. Recorded so "why not just scan it" has an answer:
  character first, and the yard look stays hands-and-ears.
