# Repair Refactor: Final Design Spec

## 1. Problem

Every non-panel part has one action: "repair". Bland. The mechanic is fine; the presentation is the gap. Body panels (metal / surface / finish loop) are already good and are untouched by this refactor.

## 2. Unchanged

- Condition grades: scrap (never repairable), poor, worn, fine, mint.
- Body panel system for `bodywork` and `paint`.
- Non-repairables: `clutch`, `brakePadsDiscs`, `tyres`. Replace only.
- `blockedBy` strip order, `scrapDisablesCar`, part removal/refit actions, energy day budget (`energy.basePoolPoints`), staff, rep, auctions, valuation.
- Machine hire screen. Hire per day already exists; it is reused, not rebuilt.

## 3. Core model

### 3.1 Three job types (replaces the per-band repair pipeline)

| Job | Target | Available from | Where | Tool tier needed |
|---|---|---|---|---|
| **Service** | worn | poor | Where the part sits (in situ for buried, on car for fixed, in place for bolt-ons) | 1 |
| **Rebuild** | fine | poor or worn | Part removed, on its bench | 2 |
| **Restore** | mint | poor, worn or fine | Own shop room | 3 |

- A job runs its full ordered step list. **No optional steps.** Every step is required.
- A job folds in everything beneath it: Rebuild from poor costs the **same energy** as Rebuild from worn (the strip is the service). Restore likewise. Parts/materials bill still scales with band steps crossed (`restoration.repairStepFraction` per step).
- A job is only offered if the part's current grade is below the job's target.

### 3.2 Tool tiers

- **Tier 1**: starting kit per group. Free, owned from day one.
- **Tier 2**: buyable tool line per group. `minReputationTier: local`.
- **Tier 3**: the shop room covering the group. `minReputationTier: known`. Shops: machine shop (engine), chassis shop (drivetrain, suspension, wheels), body & trim shop (body, interior).

### 3.3 Three ways to have tier 2 tools

| Route | Cost | Notes |
|---|---|---|
| Own | Line purchase price | Permanent |
| Hire | Existing per-day fee (`machineShopAssist` table, rename `toolHire`) | Grants the full tier 2 kit for that group, including its access rig, for one day. Max one hired line per day. |
| Slog | ×3 energy (`machinelessLaborMultiplier`, rename `slogMultiplier`) | Do tier 2 work, including part removal, with tier 1 kit, improvised. |

Restore has **one** route: own the shop. No hire, no slog.

### 3.4 Hard gates

- **Welding steps cannot be slogged.** The four † steps in section 9 (exhaust Rebuild, chassis Rebuild, chassis Restore, rim Restore). Hire or own the kit; TIG lives in the chassis shop, so rim cracks are shop work by definition.
- **Restore requires owning the covering shop.**

Nothing else is hard-gated. All removal is sloggable (see 4).

## 4. Location and removal rules

- **Bolt-on parts**: removed as today (`removePart`), rebuilt at their bench.
- **Buried parts**: Service is done in situ (existing `energyByClass.buried` +6 surcharge applies). Rebuild/Restore require the part out. Removal uses the group's tier 2 access rig (engine crane / transmission jack), own or hire, or is slogged at ×3 (block and tackle off the beams for the engine, box wrestled down onto the crate for the gearbox). Once out, no buried surcharge.
- **Fixed surface parts** (`removable: false`: chassis, bodywork, paint): always worked on the car.
- **Tyre fitting**: install action, not repair. Tier 1 levers work at extra energy; tier 2 tyre machine is the standard job. Replaces the old `bench-fit` gate.
- `machineGate` field in the taxonomy is **retired**; the rules above replace it.
- **Two-post lift**: not part of any tool line and not a gate. Standalone garage equipment (see 6) granting an energy discount on all under-car work (suspension, drivetrain, wheels, exhaust). Discount value: tuning.
- Work in progress persists across hire days (engine out on the bench when the crane goes back). UI must state before commit: "refitting will need the crane again."

## 5. Energy and cost — PRELIMINARY

Implement as written. All values and formulas in this section are subject to playtest acceptance; that is the final test, not this document.

- Step energy: `energyPerBandStepByToolTier` reinterpreted as energy **per recipe step by job tier** (Service steps 4, Rebuild 3, Restore 2). Slog multiplies by 3.
- Job energy = sum of step energies + applicable surcharges (buried in situ +6; removal/refit actions as today). Start grade does not change job energy (3.1).
- Job yen = parts bill (`repairStepFraction` × band steps crossed × part value) + hire fee if hired.
- Service job quotes (customer work): fold any required hire fee into the cost basis **before** applying `serviceJobs.marginMin/Max`, so no quoted job is a loss.
- Job generator: never offer mint-target (Restore) commissions to a player who does not own the covering shop.

## 6. Garage purchase page

The page is organised as the garage itself, three places. Membership rule: work **at** it, bench; car goes **on** it, bay; walk **into** it, room.

1. **Benches** — the six tool lines, grouped under their three benches (engine bench: engine; chassis bench: drivetrain, suspension, wheels; body & trim corner: body, interior). Each line row shows current tier and the tier 2 upgrade (price, rep gate). Buying tier 2 populates that bench's shadow board and delivers its access rig.
2. **The bay** — kit the car goes on: the **two-post lift** and the existing **rolling road** (dyno). Each row: hire for the day (existing fees, lift ¥5,000) or buy outright (lift price and rep gate: tuning; rolling road as currently configured). Lift effect: under-car energy discount.
3. **Rooms** — the three shops (price, `known` rep). Buying one is tool tier 3 for its groups and opens its room.

The machine hire screen keeps listing all hireable rows as it does today: the six tool lines, the lift, the rolling road.

## 7. Benches, shadow boards and the repair interaction

Three benches plus the car. Grouping matches `staff.skillGroupMap` and shop coverage: **engine bench** (engine), **chassis bench** (drivetrain, suspension, wheels), **body & trim corner** (body, interior; one bench, panel end and trim end).

### 7.1 Bench screen anatomy

- **Shadow board** across the top: five verb zones (clean, fit, cut, join, measure) with painted tool outlines. Owned tools hang on their outlines; unowned tools are empty outlines; hired tools hang with a rental tag for the day. Board contents per tier: section 7.5.
- **Bench surface** below the board: parts the player has removed and carried here sit on it. Multiple parts can wait; one is active at a time.
- **Access rigs** (crane, transmission jack, lift) stand beside the bench in the scene, not on the board.

### 7.2 Doing a repair on the bench

1. Player selects a part on the bench surface. Its job's **step strip** appears above it: the ordered steps, each showing tool icon + copy line, all greyed.
2. The tool for the current step **glows on the shadow board**. Player clicks that tool.
3. The tool plays a short animation on the part, the copy line prints ("Press in new synchros and bearings"), energy is deducted, the step ticks. The next tool glows.
4. Clicking a non-glowing tool does nothing (small shake, no penalty).
5. Last step ticks → part's grade updates on the spot.

**Slog**: the required tool's outline is empty; the improvised stand-in lies on the bench surface below it, glowing amber. Clicking it runs the step at ×3 energy. Same loop, worse tool, triple cost, visible at a glance.

**Interruption**: a part mid-job keeps its ticked steps and stays on the bench. Resume any time the next step's tool is available. This is how a rebuild spans hire days.

### 7.3 Doing a repair on the car (Service, and all fixed-surface work)

Same loop, different surfaces. Player selects the part in the bay view (on the car). The step strip anchors to the part's location on the car, and a **tool trolley** rolls in beside the car, stocked automatically with exactly the tools this job needs, pulled from their boards (their outlines sit empty while the trolley is out). Player taps the glowing tool on the trolley; animation, copy line, energy, tick. Job done, trolley returns, tools rehang. No tool inventory is ever managed by the player; the trolley is how "carrying your tools to the car" is represented.

### 7.4 Worked example (gearbox Rebuild, nothing automated)

Read job card → decide own/hire/slog → (book hire if chosen) → car on stands → strip blockers (`blockedBy`) → remove box (transmission jack, or slog it onto the crate at ×3) → box appears on the chassis bench surface → select it, tap dip tank ("Strip and wash the case"), tap floor press ("Press in new synchros and bearings") → grade reads fine → refit everything by hand.

### 7.5 Board contents

**Engine bench**

| Zone | Tier 1 | Tier 2 | Shop (machine shop) |
|---|---|---|---|
| Clean | Degreaser tin, parts brush, carb/contact cleaner | Parts washer, ultrasonic tub | Hot tank |
| Fit | Spanner roll | Torque wrench, press tool tray | Clean assembly table |
| Cut | — | Flex-hone, lapping stick | Boring bar, valve grinder, die grinder |
| Join | — | Soldering iron | — |
| Measure | Timing light, feeler gauges | Micrometer, plastigauge | Degree wheel, dial gauge, balancing rig, vacuum gauges, flow bench, pressure tester, test rig |

**Chassis bench**

| Zone | Tier 1 | Tier 2 | Shop (chassis shop) |
|---|---|---|---|
| Clean | Solvent bucket, wire brush, grease gun, bleed bottle | Dip tank, flush rig | — |
| Fit | Breaker bar, drifts, spring compressors, ball joint splitter | Floor press, pullers, rebuild tooling, seal drivers | — |
| Cut | Flat file, wet-and-dry | Rim straightener ram | Polishing lathe, blast cabinet, powder oven |
| Join | — | — | TIG welder |
| Measure | — | Torque wrench, dial gauge, backlash kit | Corner scales, shock dyno, propshaft balancer, nitrogen rig, string gauges, marking compound, flaring tool |

**Body & trim corner**

| Zone | Tier 1 | Tier 2 | Shop (body & trim shop) |
|---|---|---|---|
| Clean | Drill + wire wheel, rust converter, upholstery cleaner | DA sander | Underseal gun |
| Fit | Trim wedge, hog-ring pliers, hardware tray | Staple gun, foam kit | Fabric rolls |
| Cut | Hammer and dolly, filler board | Angle grinder, edge setter | Pull jig |
| Join | Hot stapler (panel), needle and thread (trim) | MIG + fibreglass kit (panel), sewing machine + soldering iron + heat gun (trim) | Seam-welding rig, spray booth |
| Measure | — | Multimeter | Jig measuring arms, gauge calibration rig, polishing wheel |

## 8. Job card (UI panel)

Click a part → panel showing its jobs. It is a price list. **Nothing on it is clickable; it performs no actions.**

Per job line: name (Service / Rebuild / Restore), target grade swatch, total all-in cost (energy · yen, including removal/refit and any hire fee), tool status: **own** (green) / **hire ¥X** (yellow) / **slog ×3** (amber) / **locked + short reason** (grey, e.g. "needs machine shop").

## 9. Recipe content (complete mapping)

Tool → copy line, in step order. All steps required. † = welding step, cannot slog. Exhaust Rebuild uses the body corner.

| Part | Service (→ worn) | Rebuild (→ fine) | Restore (→ mint) |
|---|---|---|---|
| Block | Degreaser tin: "Degrease it in the bay" · Spanner roll: "Chase the threads, drive in new core plugs" | Parts washer: "Through the parts washer" · Flex-hone: "Hone the cylinder bores" · Micrometer: "Straight-edge the deck" | Boring bar: "Rebore and line-hone" · Dial gauge + mics: "Blueprint every clearance" |
| Internals | Degreaser tin: "Clean and inspect" · Spanner roll: "Drop the sump, fit new bearing shells" | Lapping stick: "Polish the crank journals" · Torque wrench: "Fresh piston rings" · Plastigauge: "Plastigauge the clearances" | Balancing rig: "Balance the rotating assembly" · Torque wrench: "Torque to blueprint spec" |
| Head & Valvetrain | Degreaser tin: "Decoke the chambers" · Spanner roll: "New stem seals with the rope trick" | Lapping stick: "Lap the valves in by hand" · Press tray: "New valve springs" | Valve grinder: "Skim the face, three-angle grind" · Dial gauge: "Set the seat widths" |
| Cams & Timing | Spanner roll: "New belt and tensioner over the bay" · Timing light: "Set the tension, check it with the light" | Feeler gauges: "Shim the valve clearances" · Lapping stick: "Polish the cam lobes" | Degree wheel + dial gauge: "Degree the cams in on the wheel" |
| Intake | Carb cleaner: "Blast it out with carb cleaner" · Spanner roll: "New air filter" | Ultrasonic tub: "Ultrasonic the idle valve" · Press tray: "Rebuild the throttle body, new gaskets" | Die grinder: "Port-match and polish the runners" · Vacuum gauges: "Sync the throttles" |
| Exhaust | Wire brush: "Wire-brush the joints" · Spanner roll: "Paste and clamp the leaks" | MIG †(body corner): "Cut out the rot, MIG in new pipe" · Spanner roll: "Refit on new rubbers" | Torque wrench: "New gaskets and hangers throughout" · Degreaser tin: "Wrap it, heat-paint the tails" |
| Fuel System | Degreaser tin: "Drain the stale fuel" · Spanner roll: "New filter" | Ultrasonic tub: "Ultrasonic the injectors" · Press tray: "New pump strainer" | Flow bench: "Flow-test and balance the injectors" · Torque wrench: "Fresh lines and a new regulator" |
| Ignition & ECU | Spanner roll: "New plugs and leads" · Contact cleaner: "Contact-clean the connectors" | Soldering iron: "Re-solder the cracked joints" · Soldering iron: "New capacitors on the board" | Test rig + timing light: "Bench-test the board, set base timing" · Spanner roll: "New relays" |
| Cooling | Degreaser tin: "Flush the system" · Spanner roll: "Fresh coolant, new hoses" | Parts washer: "Rod out the radiator core" · Press tray: "New stat and water pump" | Torque wrench: "New core, silicone hoses" · Pressure tester: "Pressure-test the lot" |
| Forced Induction | Degreaser tin: "Clean the compressor housing" · Spanner roll: "Free off the wastegate actuator" | Parts washer: "Strip and wash the housings" · Press tray: "Rebuild the CHRA, new seals and bearings" | Balancing rig: "Balance the shaft assembly" · Die grinder: "Port the wastegate" |
| Gearbox | Solvent bucket: "Drain and refill the oil" · Breaker bar: "New selector bushes from below" | Dip tank: "Strip and wash the case" · Floor press: "Press in new synchros and bearings" | Backlash kit + dial gauge: "Shim the shafts to spec" · Seal drivers: "New seals throughout" |
| Differential | Solvent bucket: "Fresh oil" · Drifts: "New output seals" | Floor press: "Press in new carrier bearings" · Torque wrench + dial gauge: "Reset the preload" | Marking compound + backlash kit: "Set backlash and pinion depth with marking paste" |
| Driveline | Grease gun: "Grease the joints" · Drifts: "New boots" | Floor press: "Press in new UJs and a centre bearing" | Propshaft balancer: "Balance the propshaft" · Torque wrench: "New hardware throughout" |
| Dampers | Solvent bucket: "Clean the shafts" · Spring compressors: "New bump stops and top mounts" | Rebuild tooling: "Strip and reseal" · Dip tank: "Refill with fresh oil" | Nitrogen rig + shock dyno: "Re-gas, match the pair on the dyno" |
| Springs | Wire brush: "Wire-brush and paint" · Spring compressors: "New rubber isolators" | Dial gauge + tape: "Match free lengths across the axle" · Spring compressors: "Re-seat them properly" | Blast cabinet + powder oven: "Shot-peen and powder coat" · Corner scales: "Corner-weight the car" |
| Anti-Roll Bars | Breaker bar: "New bushes" | Breaker bar: "New drop links" · Solvent bucket: "Clean and paint the bar" | Breaker bar: "Poly bushes throughout" · Torque wrench + scales: "Set the preload, torque to spec" |
| Steering | Ball joint splitter: "New tie rod ends" · Solvent bucket: "Top up the fluid" | Rebuild tooling: "Rebuild the rack, new seals" · Flush rig: "Flush the system" | String gauges: "Set the rack preload, string-align on the gauges" |
| Brake Calipers & Lines | Solvent bucket: "Clean and grease the slide pins" · Bleed bottle: "Bleed the fluid through" | Rebuild tooling: "Rebuild with new pistons and seals" · Flush rig: "Full fluid flush" | Flaring tool: "New hard and braided lines" · Blast cabinet: "Refinish the calipers" |
| Rims | Solvent bucket: "Deep clean the brake dust" · Flat file: "File back the kerb rash" | Straightener ram: "Straighten the buckles on the ram" | TIG †: "TIG the cracks" · Polishing lathe + powder oven: "Strip, polish the lips, powder coat" · Dial gauge: "Spin-check for run-out" |
| Chassis (on car) | Wire wheel + converter: "Wire-brush the rust, treat with converter" | Angle grinder: "Cut out the rot" · MIG †: "Weld in repair sections" | Seam rig †: "Seam-weld the shell" · Jig arms: "Measure it on the jig" · Underseal gun: "Underseal" |
| Aero | Hot stapler: "Hot-staple the cracks" · Hardware tray: "Re-tab the mounts" | Fibreglass kit: "Glass the splitters and wings" · Drill: "Re-drill the mounts" | Spray booth: "Sand and refinish in the booth" · Hardware tray: "Fresh hardware, line up the gaps" |
| Seats | Upholstery cleaner: "Deep clean" · Hog-ring pliers: "Re-tension the springs, free the rails" | Staple gun + foam: "Rebuild the bolster foam" · Sewing machine: "Stitch the tears" | Fabric rolls + machine: "Retrim in period cloth" · Hardware tray: "Rebuild the recliner" |
| Dash & Gauges | Upholstery cleaner: "Clean it up, chase the rattles" · Trim wedge: "New bulbs" | Soldering iron: "Re-solder the cluster" · Heat gun + vinyl kit: "Repair the dash cracks" | Calibration rig: "Recalibrate the gauges" · Polishing wheel: "Polish the lenses, restore the trim" |

## 10. Data changes

**Not exhaustive.** The implementing dev must run a full blast-radius discovery pass across the codebase and data (anything reading `machineGate`, `repairBandCeilingByTier`, `machineShopAssist`, `machinelessLaborMultiplier`, tool tier checks, job generation, quoting, save data) before starting.

**parts-taxonomy.json**
- Remove `machineGate` from all parts. Keep `depthClass`, `removable`, `repairable`, `blockedBy`, weights.

**workbench.json** (new)
- `benchByGroup` map (6 groups → 3 benches).
- `benches`: 5 zones each, tool props per tier as in 7.5.
- `recipes`: per part, per job (`service` / `rebuild` / `restore`), ordered steps `{tool, copy}`, `requiresMachine: true` on the four † steps, `bench: "body-trim-bench"` on the exhaust Rebuild MIG step. No `optional` field exists.

**toolLines.json**
- Six lines, tier 1 (¥0, start) and tier 2 (price, `local`). Tier 3 entries point at the covering shop. Suspension line: no lift. Wheels line: no TIG.
- Proposed tier 2 prices (tuning): engine 600,000 · drivetrain 550,000 · suspension 300,000 · wheels 250,000 · body 400,000 · interior 280,000.

**toolShops.json**
- Unchanged structure. Proposed prices (tuning): machine 3,000,000 · chassis 2,200,000 · body & trim 1,500,000. All `known`.

**economy.json**
- Replace `repairBandCeilingByTier` with the job model: `{ "service": {"target": "worn", "toolTier": 1}, "rebuild": {"target": "fine", "toolTier": 2}, "restore": {"target": "mint", "toolTier": 3} }`.
- Rename `machineShopAssist` → `toolHire`. Keep per-day fees; keep the amortisation constant as the fee-from-price derivation (`fee = tier2Price / amortisationDays`, tune the constant). Add `maxHiredLinesPerDay: 1`.
- Rename `machinelessLaborMultiplier` → `slogMultiplier` (value 3). Slog scope: one tier above owned kit, including removal, never on `requiresMachine` steps, never Restore.
- Add lift entry under garage equipment: hire fee (existing ¥5,000 row), purchase price and rep gate (tuning), `underCarEnergyDiscount` (tuning).

**Code**
- Job resolver: `job → (target grade, tool tier, location, step list, energy, yen)` per sections 3 to 5.
- Access resolver: removal requirements and slog per section 4, lift discount.
- Garage purchase page per section 6.
- Bench screen, shadow boards, tool trolley, tool-tap step execution per section 7.
- Job card panel per section 8.
- Job generator guard + hire-fee-in-quote per section 5.
