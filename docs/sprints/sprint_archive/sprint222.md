# Sprint 222: the body shop earns its ladder

**Status:** Complete. Committed and pushed in `2c299e8` (2026-08-19).
**Trigger:** Maintainer rulings on the sprint 220/221 body shop: brand the inline material
buying, fix the shortfall caption, desync paper from filler by pack size, cheapen the body
tool line, gate polish behind tier 2, fold the polish line into the summary's body
materials, and give tier 3 a physical ability: the whole-car respray. Paint buying stays
exactly as shipped. All shape changes maintainer-approved verbatim; values below are
Claude's under the behaviour-first amendment.

## Reuse analysis (directive 16)

New mechanisms: the respray action (one new staged action kind and resolver) and the
Karagawa brand strings. Everything else is value changes and regrouping on existing
mechanisms: tool line prices (toolLines.json / toolShops.json), tin catalogue
(consumableTins.json), polish's existing capability read (`planSharedPipelineStage`),
the sprint 220 caption/buy idiom (extended to list every shortfall), the existing
swatch-selection state (respray reads the same selected tin), the financial summary's
existing body-materials rows (regrouped), and `buyConsumableTin`/`buyPaintTin` unchanged.
Bills deliberately do NOT learn about respray: the bill walker stays per-panel.

## Lever ledger (behaviour-first: values chosen by Claude, validated by playtest)

| Lever | Old | New | Felt behaviour |
| --- | --- | --- | --- |
| body tier 2 (MIG welder & panel tools) | 700,000 | 280,000 | A committed flipper owns the MIG by week three or four; welding stops being an 18-point labour tax early. Sits between the two-post lift (250k) and the trim bench (350k). |
| body-and-trim shop | 1,500,000 | 600,000 | The booth is a mid-game purchase that pays for itself through respray margin and the mint ceiling, not an end-game trophy. |
| paper | 1,400 per tin | 3,200 for a pack of 10 | Paper stops running out in lockstep with filler (4-use tins); one pack outlasts two filler tins. Not a multiple of 4, per ruling. Recipe unchanged: fill and sand still draws 1 filler + 1 paper; polish recipe untouched. |
| polish stage gate | always available | requires body line `unlocked` (tier 2 owned or hired today) | Rattle-can shops do honest but never pretty work; the first pretty car needs the MIG rung or a 14,000 yen hire day. Ladder reads: tier 1 worn ceiling, tier 2 fine, tier 3 mint. |
| respray labour | n/a | 1 labour per primed panel | Half the per-panel rate (2 each): a nine-panel respray costs 9 labour instead of 18. |
| respray paint draw | n/a | ceil(primed panels x 2/3) tin uses | Six tins where panel-by-panel burns nine. The bill still prices paint per-panel, so the booth owner pockets the spread on every full respray: tier 3's standing margin. |
| machineShopAssist.feeYenByGroup.body | 14,000 | 6,500 | The whole body ladder got cheaper and the hire rides the same ruling: a booth day costs a call-out, not a rent payment. Forty hire-days still undercut the MIG rung (260,000 vs 280,000), keeping the Sprint 85 hire-coherence bound: renting stays the sane default until body work is weekly. Added mid-sprint when the price cut tripped that exact probe. |

## The respray (design, exact)

New staged action `pipeline-respray`, planned in `bodyPipeline.ts`, resolved in
`pipelineActions.ts` alongside paint. Requires: car in the body bay, body line
`fullCapability` (booth owned or hired today), at least 2 zones primed, a colour and
grade under exactly the same stock-colour gate as `paint`. Effect per primed zone:
`finish` 1, `primed` false, `colour` set (identical to a booth panel coat). Labour and
tin draw per the ledger; tin uses consumed from the same paint stock key; materials cost
posted to the car's `repairYen` exactly as paint does. Zones not primed are untouched and
the UI says how many it will cover. Per-panel Paint remains for touch-ups and two-tones.
The bill walker (`planZoneRepair`) is deliberately not taught respray economics: a bill
is the market's per-panel price for the work; the booth's efficiency is the owner's
private margin. Save schema: new action kind means a Dexie version bump and nothing else
(directive 19).

## Karagawa Express (copy, fixed by Claude, not delegated)

Every inline buy control in the body shop carries the brand. Button text stays
functional ("Buy a tin (5,000 yen)" idiom); a single strapline sits with the control,
rotating by in-game day through exactly these three lines:

1. "Karagawa Express: on your shelf before the kettle boils."
2. "Karagawa Express: don't ask how. K."
3. "Karagawa Express: same-day is for amateurs."

No other Karagawa copy anywhere yet. Paint purchasing flows are otherwise untouched
(maintainer ruling: exactly as shipped).

## Tasks

- [x] **A (sim + content):** tool line and shop prices; paper pack size and price; polish
  capability gate with a new refusal reason surfaced through the existing caption map;
  the respray plan + resolver + staged-action kind; Dexie version bump; guard test
  re-pins with the ledger rows above recorded; sim tests (polish gate at each tier,
  respray effect/labour/tins/stock/refusals, bills unchanged by respray, golden
  adjudication if any hashes move).
- [x] **B (game UI):** respray control in a fixed row under the whole-body header
  (label "Respray {colour}", figures, caption slot: tier lock names the booth and the
  hire price; primed-count; stock shortfall with buy). Polish caption at tier 1 names
  the gate ("Needs the body line: tier 2 tools or a day's hire (14,000 yen)").
  Shortfall captions list EVERY missing tin, each with its own buy button. Karagawa
  strapline on all inline buys. Financial summary: polish folds into one body materials
  line (grouping only; the till still reconciles). Component tests.
- [x] **C:** TODO.md deferred entry: the mysterious late-game commission (van or wagon,
  full race spec, maximum power).
- [x] **D (verify):** touched test files once; sim project once if goldens move;
  `pnpm typecheck` once (new exported action kind).

## Exit

All four tasks landed. One lever was added mid-sprint under the behaviour-first amendment
and is in the ledger above: `machineShopAssist.feeYenByGroup.body` 14,000 to 6,500, because
the MIG price cut tripped the Sprint 85 hire-coherence probe (40 hires must not exceed the
machine; 560,000 vs the new 280,000). The implementing agent halted on the unlisted lever
per directive 22 and the value was then chosen and recorded here before it moved.

Sim/content: tool line and shop prices per the ledger; paper 10 uses at 3,200; polish
refuses without the body line (`'tool-tier'` refusal, BILL_CAPABILITY bills unaffected);
`pipeline-respray` staged action + `planRespray` + resolver (labour = primed count, tins =
ceil(2/3 x count), materials to `repairYen`, one zoneless `body-materials-used` entry);
no save bump needed (neither StagedAction nor DayLogEntry persists; the session-event
table is versioned independently). Guard test re-pinned twice (toolLines/toolShops, then
economy.json for the fee) with ledger lines in its header. Goldens: one 30-day scripted
career hires the body line on day 1, so its hash moved with the fee and was re-pinned
with the trace recorded (directive 17 case a); every other golden and script confirmed
unmoved by grep of all hire call sites.

Game: `resprayCar` store action + plan branch; the respray row fixed under the whole-body
header with the full caption precedence (bay, booth tier with the live hire fee, primed
count, tin shortfall with inline buy, labour); polish's tier caption; shortfall captions
now list every missing tin with its own buy control (fillAndSand can owe filler and paper
at once); the Karagawa strapline rotating by day through the three fixed lines; the day
report aggregates a day's body materials into one line per car (the granular per-stage
polish line the ruling named lived in `classifyDayReport`, not the weekly cost sheet,
which already bucketed consumables coarsely; the reference EventLogDrawer stays raw).

Evidence: sim and content suites for every touched file green (including
storyMissionProbes 19 passing with the fee fix, economyApprovalGate 6, advanceDay
re-pinned and green); game files green (BodyShopScreen 52, dayLogFormat 23, DayReport 4,
sessionEventCoverage 63, CarDetailScreen 97); `pnpm typecheck` clean across all three
projects after replacing three test calls of `devSetToolTier('body', 3)` with the honest
`devSetToolShopOwned('body-and-trim-shop', true)` (level 3 is shop ownership, not a line
tier, and the tier type rightly refused 3).
