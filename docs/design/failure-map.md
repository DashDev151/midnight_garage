# The Failure Map (diagnosis design bible)

Status: DRAFT for maintainer review (Sprint 109). Amendments to the ontology or laws
require explicit maintainer approval recorded here, as with the other bibles.

The generated graph of the SHIPPED content lives in `failure-map.generated.md`
(`node scripts/generateFailureMap.cjs` regenerates it; run after any change to
`failureModes.json`, `symptoms.json`, or `diagnosticTests.json`). This document is the
design intent; the generated file is the proof the game matches it.

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
   The emotional register is authored per outcome: a GEM reveal lands quiet relief, a
   subtle "found a steal" victory ("clear it and it's fixed", "not the expensive kind");
   a GRENADE line stays bone-dry serious (dread does not joke); dead ends carry the dry
   shrug. A gem line that reads neutral is a defect.

## The map

### Routed (built, Sprints 105-106; measured ratios in the probe)

| Symptom | Causes (weight) | Board shape | Reading pays | Grenade |
|---|---|---|---|---|
| damp-passenger-footwell | matrix 38 / scuttle-drain 20 / grommet 14 / sunroof-drain 10 / seam 18 (scrap) | trace-the-wet -> board of 4; hose-the-roof at level 3 | 1.83x | 15m |
| smokes-on-startup | seals 45 / breather 20 / gasket 22 / rings 13 (scrap) | cold-start-watch -> board of 4 | 1.61x | 30m |
| crunch-into-second | synchros 48 / low-oil 14 / clutch 20 / gearset 18 (scrap) | gearbox-oil-check -> board of 4 | 1.70x | 25m |

### Unrouted: the fourteen

Boards are designed HERE for maintainer review; Sprint 108 implements nothing that has
not passed that review.

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
**Tutorial consequence (maintainer ruling, 2026-07-21): the tutorial bends to the
system, never the reverse.** The four-wheels guided diagnosis becomes the two-step read
(revs-and-listen, then the stethoscope); Sprint 108 updates the tutorial steps and the
satisfiability probe with it. No law-1 exceptions exist anywhere on the map.

**wont-idle** - ladder unchanged (vacuum-leak intake worn 48 / tired-ecu ignitionEcu
poor 27 / worn-cams camsTiming poor 15 / burnt-valve headValvetrain scrap 10). Current
root (spray-test) isolates the 48% cause: illegal. New root: idle-watch NEW 5m
[leak+ecu | cams+valve] (hunting idle against a lumpy misfire). Board: spray-test 10m
[leak | rest], compression-test 25m [valve | rest]; the ECU-versus-cams call stays
DELIBERATELY bench-only (declared ambiguity, the yard closes honestly short); dead end:
fuel-sniff NEW 5m. Grenade 30m.

**clunk-over-bumps** - ladder unchanged (4 causes). Current root (bounce-test) isolates
33%: illegal. New root: rock-and-listen NEW 5m [bushes+steering | dampers+subframe]
(a rattle up top against a deep thud underneath). Board: bounce-test 10m [dampers |
rest], steering-linkage-check 10m [steering | rest], undercarriage-look 15m [subframe |
rest]; dead end: ride-height-check. Grenade 20m.

**overheats-in-traffic** - ladder unchanged (4 causes); coolant-check root is already
legal [gasket+block | fan+radiator]. Board: warm-idle-watch 20m [fan | rest],
compression-test 25m [block | rest], rad-flow-feel NEW 5m [radiator | rest] (cold spots
across the core); dead end: hose-squeeze NEW 5m (same split as the root). Grenade 35m,
the dearest question in the game after smokes, deliberately.

**diff-whine** - ladder +worn-wheel-bearing NEW (driveline worn 15): diff-bearings 50,
wheel-bearing 15, propshaft-uj 20, ring-pinion 15. Root: coast-and-load-listen NEW 5m
[diff side | shaft side] (whine that changes on and off the throttle lives in the diff).
Board: magnet-check 10m [ring-pinion | rest], undercarriage-look 15m [uj | rest],
spin-the-hub NEW 5m [wheel-bearing | rest]; dead end: stethoscope. Grenade 15m.

**sagging-spring** - ladder +perished-spring-seats NEW (springs fine 15): sagging 50,
seats 15, broken 22, turret 13. Root: ride-height-check 10m [sagging+seats |
broken+turret] (even settle against one corner down). Board: wheel-off-look 15m
[broken | rest], undercarriage-look 15m [turret | rest], seat-poke NEW 5m [seats |
rest]; dead end: bounce-test. Grenade 25m.

**quarter-panel-filler** - ladder +blown-clearcoat NEW (paint fine 15): respray 45,
clearcoat 15, rust-patch 25, rail 15. Root: sight-down-the-panel NEW 5m
[respray+clearcoat | patch+rail] (a straight lazy shine against ripple and bubble).
Board: magnet-check 10m [patch | rest], undercarriage-look 15m [rail | rest],
paint-tap NEW 5m [clearcoat | rest]; dead end: open-the-boot NEW 5m (same split as the
root). Grenade 20m.

**oil-pressure-flutter** - ladder +thin-cheap-oil NEW (internals fine 15): sender 50,
thin-oil 15, pump 20, mains 15. Current root (oil-pressure-check) isolates 50%:
illegal. New root: warm-gauge-watch NEW 5m [sender+thin-oil | pump+mains] (flutter only
hot at idle against sag everywhere). Board: oil-pressure-check 20m [sender | rest] (the
mechanical gauge does not lie), dipstick-check NEW 5m [thin-oil | rest], stethoscope
15m [mains | rest]; dead end: pull-a-plug. Grenade 20m.

**hesitates-under-load** - ladder +stale-fuel NEW (fuelSystem fine 15): filter 50,
stale-fuel 15, stretched-chain 23, jumped-chain 12. Root: rev-response-watch NEW 5m
[fuel side | chain side] (starving at the top end against a baggy, rattly pickup).
Board: fuel-pressure-check 15m [filter | rest], fuel-sniff NEW 5m [stale | rest],
compression-test 25m [jumped | rest]; dead end: pull-a-plug. Grenade 30m.

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
