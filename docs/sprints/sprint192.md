# Sprint 192: Bodywork means something

**Status: IMPLEMENTED, ready for review.** Levers recorded below, approved before implementation.

Four changes, one theme: the body half of the game says one thing and does another. The slot is
called `panels` and holds nothing. Fitting ¥121,000 of carbon adds nothing to what a car sells for.
Carbon weighs the same as steel. And two separate mechanisms answer the identical question about
which machine a slot needs.

## Ruling 1: the slot is Bodywork

> *"Lets start clearing up the confusion by renaming this everywhere. We call it Bodywork. This is
> the Summary. 9 panel condition = final bodywork."*

Three things share the word "panel" today and it is the root of the confusion:

| today | what it actually is | after |
| --- | --- | --- |
| the `panels` slot | a **summary** of the nine zones' condition. Nothing is ever fitted to it | **Bodywork** |
| a zone | one of nine physical areas of the body, each with its own state and its own fitted panel | zone, unchanged |
| a zone panel SKU | the 144 parts you actually buy and fit, `zoneId`-addressed | panel, unchanged |

**And "widebody" is not a thing in the game.** A widebody is sport or race panels on the four corner
zones, because at those grades the corner panel **is** an over-fender. From now on they are called
what they are: **sport and race body panels**.

> *"Just don't half-arse it. Change it correctly everywhere."*

So: display names, all player copy, all docs, the identifier across schema, taxonomy, the 148 SKUs
carrying `carPartId: "panels"`, every economy weight table keyed by it, and the save shape.
`SAVE_VERSION` bump, no migration (directive 19).

## Ruling 2: zone panels count toward market value

The value tension the maintainer raised (*"installing expensive parts adds inherent value"* against
*"only if someone is willing to buy it"*) is **already answered by the existing model, and zone
panels are simply excluded from the answer.**

`installedPartsValueYen` credits a fitted part's catalogue price, discounted twice: by **coherence**
(retention 0.3 to 1.1, does the build make sense) and by **`aftermarketReturn`** (0.3 to 1.0 by
tier, does anyone modify this kind of car). A coherent flagship build recovers about 110 per cent of
catalogue; a bodged entry-car build about 9.

**That is both statements reconciled, and it needs no new philosophy.** Zone panels join it and
inherit it. Today they reach `marketValue.ts` not at all: that file never reads `zoneId` or
`panelGrade`, and `installedPartsValueYen` walks only the 28 slots.

## Ruling 3: carbon saves weight

Real figures, presented and accepted: a steel bonnet on a 90s coupe is 12 to 15 kg and carbon is 4
to 5, so a full carbon set saves roughly **25 to 35 kg on a 1,200 kg car, 2 to 3 per cent**. For
scale the five existing race mass parts together give 10 per cent, so bodywork sits sensibly below
them.

**A drafting claim in this doc said it would be worth close to nothing in lap time. That was wrong**,
and the Exit carries the measurement: a full carbon set is 0.238s at Hakone, 0.19 per cent. Mass
does reach only the power-limited acceleration term and never cornering or braking, but two and a
half per cent of kerb weight over a two-minute lap is two tenths, not two hundredths.

## Ruling 4: one slot property, not two mechanisms

> *"Why 2 different vars that do the same thing? Why do we not just have a 'Requires' flag on the
> part... yes make it a slot property."*

`removeMachineGateGroup` (buried engine and drivetrain slots) and `signatureGroupFor` (the slots
named in `economy.machineShopAssist.signatureSlotsByGroup`) both answer **"this slot needs its
line's machine."** They differ only in whether removal is gated as well as install.
`benchSwapGateGroup` is a third, a hardcoded `=== 'tyres'` literal.

**It is a fact about the slot, so it belongs on the 28 taxonomy rows, not on 580 hand-authored
SKUs.** One field, three mechanisms collapse.

## LEVERS (directive 22)

**Approved 2026-08-07.** The magnitudes were presented and accepted before implementation.

| lever | file | value |
| --- | --- | --- |
| race body panel mass | `parts.json`, the 36 race zone SKUs | `physicalModifiers.mass: 0.975` |
| street and sport body panel mass | `parts.json` | unchanged at 1.0 |

**Why one value rather than nine.** Only carbon is lighter; a replica or a steel over-fender is not.
Per-zone figures would be over-engineering for a 2 to 3 per cent total, and mass can only ever save
(`PhysicalModifierSchema.mass` is `.max(1)`), so a heavier over-fender is not expressible anyway.
With the mean-of-nine shape this reads 0.975 on a full carbon set and about 0.989 with only the four
corners done.

**A restructure, not a value change:** ruling 4 moves `machineShopAssist.signatureSlotsByGroup` out
of `economy.json` and into `parts-taxonomy.json` as a slot property. **The facts and the semantics
are identical**; only their home changes. Hash re-pinned with the record.

## Reuse analysis (directive 16)

**New: two taxonomy fields and two terms.** Nothing else.

- Ruling 2 and 3 are the same shape as the style fix that shipped this morning: a term reading the
  nine zones' `panelGrade` back to the SKU. `zonePanelStylePoints` is the working precedent.
- Ruling 4 removes code rather than adding it.
- The rename adds nothing at all.

## Tasks

1. **Rename `panels` to `bodywork`, correctly and everywhere.** Do this FIRST and alone, so
   everything after is written in the new vocabulary and the sweep cannot hide a mistake inside a
   design change.
2. **Zone panels reach `installedPartsValueYen`**, inheriting coherence retention and
   `aftermarketReturn` exactly as every other fitted part does.
3. **Race body panels save mass**, through the same zone term the style points use.
4. **One `machineGate` slot property** replacing `removeMachineGateGroup`, `signatureGroupFor` and
   `benchSwapGateGroup`, expressing both "which line" and "install only, or install and remove".

## Definition of done

- Nothing player-facing, in code, or in docs calls the summary slot "panels".
- A fitted carbon body adds to a car's value, discounted by coherence and tier like any other part.
- A full carbon set reads about 2.5 per cent lighter; street and sport read unchanged.
- One slot property answers the machine question; the three old mechanisms are gone, not wrapped.
- `pnpm typecheck` clean, all three projects green, pre-push gate green.

## Deliberately not here

- **The race parts shop** (scarcity, flaky stock, its own vendor). Recorded in `TODO.md`.
- **Contact patch**, splitting tyre width from compound so wide bodywork can gate wide tyres. An
  investigation first; it is the best idea on the table and it is blocked on that answer.
- **Aero as a system** rather than one slot with one `byGrade` table. A splitter and a GT wing are
  currently the same object.

## Exit

All four landed, in two waves: the rename alone, then the three changes that make Bodywork mean
something.

### The rename

**79 files, 515 lines.** Only the summary slot moved. Zones stayed zones and the 144
zone-addressed SKUs stayed panels, which was the whole judgement of the task.

**The two golden-master hashes were proved key-name-only rather than assumed.** The assertions were
temporarily wrapped in a deep `bodywork` to `panels` un-rename, both previous hashes reproduced
exactly, the proof reverted, and the new pins recorded with that evidence. No behaviour changed and
no value moved; two hashes re-pinned because a key changed home, not a number.

Deliberately kept as zone panels: `PANEL_ZONE_IDS`, `zonePanelPart`, `planInstallPanel`,
`zoneNeedsPanel`, `matchingPanelsFor`, `baseCostYen.zonePanel`, the 144 SKU ids, and every piece of
physical-panel flavour copy. Two genuinely ambiguous calls, both kept and both argued:
`panelsAreAllStock` reads the nine zone panels, and `zonePanelStylePoints` is named for them even
though the points it returns belong to the slot.

"Widebody" is gone from live copy, code and docs. They are **sport and race body panels**, which is
what they are.

### Value sums, style means, and the difference is the point

Style takes the mean because style is one statement a whole car makes and the body is one slot
making it. **Money is not shared.** Nine carbon panels are nine purchases at nine prices, and a mean
would price eight of them at zero.

Measured, mint Civic SiR-II, `everyday`, book ¥650,000:

| shell | spent | `marketValueYen` | credited |
| --- | ---: | ---: | ---: |
| stock | 0 | 650,000 | |
| full street set | 52,200 | **684,452** | +34,452 |
| full carbon set | 120,600 | **729,596** | +79,596 |

Both credit exactly `retention 1.1 x aftermarketReturn 0.6 = 0.66` of spend, which is the existing
model doing to a panel precisely what it does to a fitted damper. **The maintainer's tension
resolves itself:** expensive parts add value, and how much depends on whether the build coheres and
whether anyone modifies this kind of car. No new philosophy was needed, only inclusion.

**No double counting**, verified across three terms: `pricePaidYen` posts to the car's ledger and is
read by no price; `carCostToMintYen` quotes a stock panel only for a zone that needs one, pinned by
a test asserting the bill is byte-identical between a stock-panelled and a carbon-panelled car; and
`installedPartsValueYen` applies no band factor, so condition still reaches value exactly once.

`zonePanelValueYen`, `zonePanelStylePoints` and `zonePanelMassFactor` now walk one shared
`fittedZonePanels`, so the three can never disagree about what the body is wearing.

### Carbon weighs less, and it is worth more than this doc predicted

36 race zone SKUs at `physicalModifiers.mass: 0.975`; street and sport unchanged. Mean reads 0.975
for a full set, 0.98889 for four corners.

| course | stock | carbon | gain |
| --- | ---: | ---: | ---: |
| Hakone | 122.245 | 122.007 | **0.238s** (0.19%) |
| Wangan | 150.038 | 149.857 | 0.181s |
| Misaki | 116.322 | 116.198 | 0.124s |
| Yatabe | 26.888 | 26.749 | 0.139s |

**The brief said anything above a few hundredths meant something was wrong. Nothing was wrong; the
expectation was.** The mechanism was checked rather than the number: `build.mass` enters
`carBlock.m` and nothing else, and `m` is read only by `netAccel` and `vTopOf`, so cornering and
braking never see it. Sweeping mass alone at Hakone gives 0.954s for the existing 10 per cent race
ladder and 0.238s for 2.5 per cent, exactly a quarter and linear. Two and a half per cent of kerb
weight over a two-minute lap is two tenths.

The player-facing readout rounds to a tenth, so what a player sees is 122.2 becoming 122.0. **If
that is louder than wanted the lever is the 0.975 itself** (0.994 would give about 0.06s), and that
is a maintainer call rather than an implementation one.

### One slot property, and the fourth mechanism that nearly survived

`machineGate: MachineGateOperation[]` on the taxonomy row, default empty. **The line is not
restated: it is the row's own `group`**, which is what all three old mechanisms already returned in
every case, so naming it again would have put a second copy of a fact already on the row.

Four operations, because a line needed at one site is not needed at another: `install`, `remove`,
`repair`, `bench-fit`. Thirteen rows reproduce the old sets exactly: six buried engine and
drivetrain slots at `["install","remove"]`, the six ex-signature slots at `["install","repair"]`,
and `tyres` at `["bench-fit"]`.

**All four old symbols are deleted rather than wrapped**, including `machineLineGroupFor`, the union
helper that would otherwise have quietly become the fourth mechanism this task existed to remove.
`signatureSlotsByGroup` left `economy.json` for the taxonomy; the hash re-pinned recording a move,
not a value.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 621 passed |
| `pnpm test --project sim` | 2618 passed |
| `pnpm test --project game` | 1003 passed |
| `npx eslint` / `prettier --check` | clean |
| content value diff | 36 race mass modifiers, the signed lever |

Every failing test across both waves was case (a). **No case (b) anywhere**, which on a rename is
the result that matters: a genuine one would have meant behaviour changed by accident.

### Process note

An agent ran a scripted batch replacement whose nested arrays flattened, applying single-character
replacements across seven test files, and recovered with `git checkout --` on those seven paths. It
caught the mistake immediately, the files held nothing but its own corruption at that moment, it
disclosed it unprompted, and the tree was verified intact afterwards. **`CLAUDE.md` forbids
destructive git commands and this was one.** Subsequent briefs now name the prohibition explicitly
and ban scripted multi-file replacement in favour of the Edit tool.
