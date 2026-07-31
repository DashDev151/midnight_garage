# Implementing the sale value system: gap register, sprint order, guards

**2026-07-30. PLAN, not a design.** The design is `sale-value-system.md` v4. This document says
what stands between the code today and that design, in what order it gets built, and how we
stop ourselves shipping a new pipeline while the old one is still running.

Written against three discovery passes over the code at HEAD, not against memory.

---

## 1. The headline: we are in a much better position than expected

Three things came back better than assumed, and they change the plan's shape.

**Stage A and Stage B are already built exactly as designed.** `beyondDiscount` ships at
0.4 / 0.8 / 1.2 / 1.3, `marketRepairDiscount` at 1.3, `tasteSpread` at 0.12. **Nothing in the
value stack's first half needs rework.**

**There is exactly one valuation function and everything imports it.** `marketValueYen` is
called by the auction anchor, player-sale offers, taste requirements, diagnosis pricing and the
balance probes. **The design's §13.1 parity ruling is already true by construction**, not by
discipline. I expected to find a second formula and there is none. So Stage C and D reprice
auctions, reserves, buyouts and the live room **for free**, with no auction-side code change.

**The coherence input already exists.** `coherenceFactorFor` sits private in `derivedStats.ts`,
fed by `supportVerdict`. It needs exporting, not building. And `marketValueYen`'s signature
already carries every argument `supportVerdict` needs, so **no new parameters anywhere**.

Two more that save real work: `valueLedger.ts` already decomposes value using the value
formula's own atoms and is asserted to sum to `marketValueYen`, which is exactly the appraisal
pattern §10 wants. And `Buyer.wantLine` is already authored and already surfaced on live
offers, so §4's "offers wear their archetype's face" is half-built.

---

## 2. Five real defects, found on the way, that must be fixed regardless

These are not design gaps. They are live problems, and three of them are directly in the path
of this rework.

**D1. `matchedOnly` is a lie, and it will bite the new exits immediately.** The flag is declared
in the schema, authored in content for the magazine and the meet, and read **only by a UI label
helper**. The actual behaviour is a hardcoded switch on channel id in `selling.ts`. **Add a new
channel with `matchedOnly: true` and the UI will confidently say "matched buyers only" while
the draw silently falls through to `default: return {}` and no offer ever appears.** The design
adds three exits. This gets fixed first, by making dispatch read the flag.

**D2. `Buyer.priceSensitivity` is authored, schema-validated, test-asserted and read by
nothing.** Five values, zero readers. Either wire it into Stage E or F, or retire it. It must
not be carried into the new buyer schema unexamined.

**D3. Two unrelated systems are called "coherence" in the same package.**
`packages/sim/src/balanceProbes.ts` is the economy-bible balance-probe module. The design's
`coherenceFactor` is the build-support ratio in `derivedStats.ts`. Neither reads the other, so
it is not a bug today, but somebody will grep and edit the wrong file. One of them gets renamed
before Stage C lands.

**D4. `StatWeightsSchema` still carries `.default(0)`** on power and reliability, the same shape
as the `powerFraction` bug we just fixed, at lower stakes because it is 29 taxonomy entries
rather than 472 SKUs.

**D5. Zod is non-strict everywhere but one place in the codebase.** A *renamed* field does not
error, its old key is silently stripped at parse. Any content schema this rework touches gets
`.strict()`.

**D6. `balanceProbes.ts` hand-builds three probe cars as literals, and they can go stale.**
`buildWorstCaseRawCar`, `buildRoughProbeCar` and `buildCleanProbeCar` each construct a full
`CarInstance` by hand. Every new per-car field must be added to all three or they fail to
typecheck, and worse, a field that merely *changes meaning* leaves them silently wrong while
still compiling. These probes are the economy-bible's Law 1 to Law 4 guards, so a stale probe
means the balance checks are measuring a car the game no longer generates.

**Maintainer instruction, 2026-07-30, explicit and unconditional: make the probe cars read from
live data so they cannot go stale.** They should be derived from real content and the real
generation path, not authored as literals beside it. This is a standing hazard rather than a
sale-value problem, so it can be fixed immediately and does not need to wait for S1.

---

## 3. Gap register

### Adjust (the mechanism exists, its shape changes)

| what | where | change |
| --- | --- | --- |
| Retention | `installedPartsValueYen`, `marketValue.ts` | flat `partsRetention` 0.55 becomes a function of coherence |
| Taste score | `normalizedTasteScore`, `valuation.ts` | weighted mean becomes per-stat target / upper / importance match. **One private function's body**; every caller is unaffected by signature |
| Buyer schema | `buyer.ts`, `buyers.json` | `statWeights` becomes target / upper / importance triples. All five archetypes re-authored |
| Lemon predicate | `saleReputationDeltaFor`, `carCondition.ts` | keeps its deterministic leg exactly as-is, gains a probabilistic hidden-coherence leg |
| Channel dispatch | `drawOfferForChannel`, `selling.ts` | hardcoded switch becomes flag-driven (D1) |
| Value ledger | `valueLedger.ts` | gains lines for the coherence discount and coherence-scaled retention |
| Bay kinds | `facilities.ts` | `['service','parking']` gains `'forecourt'`; three binary switches gain a third arm |

### Build from scratch

| what | notes |
| --- | --- |
| Stage C, the coherence discount | small; the input exists |
| `offersSeen` clock, staleness, offer quality | new persisted state on `ForSaleEntry` |
| `presence` / `basePresence` / `seasonFactor` / `reputationFlowFactor` | nothing resembling any of it exists |
| Magazine feature and its value multiplier | new event type; `DayLogEntry` has no shape for it. **Do NOT call this "provenance", see the naming ruling below** |
| "Cars resurface" | zero existing code |
| Monthly cadence | **no monthly boundary exists anywhere in the game.** Day-of-week semantics do not exist either; only a 7-day modulo |
| Fixer, favour meter, monthly appetite | zero hits for `favour` anywhere in `packages/` |
| Export container, batching, deferred payout | no channel defers payment today |
| Scrapyard venue and scored harvesting | `resolveScrapShell` is the nearest thing and is not a venue |
| Shaken | no per-car calendrical property exists |
| Per-car value keyframes | `bookValueYen` is one static scalar |
| Per-car style baseline | **blocks authoring any style target** |

### Scrap

| what | why |
| --- | --- |
| `partsRetention` (the flat 0.55 lever) | replaced by the retention curve. **DONE, Sprint 144**: deleted outright, not left inert, and in the retired-identifier ledger |
| `ForSaleEntry.sinceDay` | the absolute clock the design explicitly rejects. **DONE, Sprint 147**: retired together with its one reader, `holdingDays` in `bots/sellingHelpers.ts` |
| `Buyer.priceSensitivity` | **DONE, Sprint 143 (D2)**: not wired, so retired. Removed from `BuyerSchema`, all five `buyers.json` entries and every fixture, and added to the ledger |
| `tools/sale-value/model.mjs` | **on the day the shipped stack can generate §9**, per the maintainer's ruling. Still live |

### Two name collisions, ruled before they cost a sprint

Found 2026-07-31 by an audit run specifically for this failure mode, after `calendar.ts` was
caught by accident. Both are cases where the design names something that already exists in the
codebase meaning something else. **A sprint brief that says "build X" when a live `X` already
exists is how a mechanic gets bolted onto the wrong module.**

**"Provenance" is taken, twice.** The design calls the magazine feature's value boost "the
provenance multiplier" (`sale-value-system.md` §5). Two unrelated live modules already own that
word:

- `packages/content/src/provenance.ts` plus `provenance.json`: flavour history lines keyed by age
  and upkeep, feeding `CarInstance.provenanceNote`. Read by auctions, the body pipeline, the
  tutorial and the balance probes.
- `packages/sim/src/provenance.ts`: part **ownership** tracking (`makeCarOrigin`,
  `makeMarketOrigin`, `isCustomerOriginPart`). Nothing to do with car history or value.

**RULING: the new concept is named for what it is, a magazine feature.** State on the car is
`magazineFeature`; the value term is `magazineFeatureMultiplier`. The word "provenance" is not
used for it anywhere, in code, content, or design prose. When §5 is next edited, its wording
changes to match. This costs one sentence now and it is the third instance of this failure.

**`tradeNetwork` is an ADJUST, not a build.** §6's exits table specifies a trade network paying
**0.87**, gated to **runners only**. The shipped channel
(`economy.json` `sellingChannels.tradeNetwork`) pays a `priceBand` of **0.95 to 1.02**, is open
to everyone, and carries `offerChanceFactor: 3`. So S9 does not stand up a new channel: it
re-prices and gates an existing, tested, hash-pinned one, and the price gap is a lever change
needing sign-off rather than an authoring decision. The sprint brief must say so, or it will be
scoped as new work and the existing channel will quietly survive alongside it.

---

## 4. The two blocking rulings, both now settled

### R1. The campaign runs on elapsed time, through a content curve, SETTLED 2026-07-30

`currentGameYear(reputationTier) = 1995 + 2 × reputationTierIndex` derived the in-game year from
reputation, so a player who stalled never left 1995 and **the dodgy player, who has low standing
by construction, would have been frozen there permanently.**

**The ruling: pure elapsed time.** But not a fixed 365 days to the year, because a real career
is a few hundred days and the decade would never arrive. Instead:

- **A `campaignYearCurve` in content**, mapping elapsed days to an in-game year, exactly the
  shape of `mileageFactorCurve`. `interpolateCurve` in `marketValue.ts` already reads curves of
  that form, so this is a reuse rather than a new primitive.
- **Era events pin to a YEAR**, and the curve decides when that arrives in days. Campaign
  length becomes one signed lever instead of a code change.
- **Seasons run on their own fixed cycle**, independent of the compressed year. Tying them to
  it would make winter twelve days long, and "stancers thin in winter" would mean nothing.

`currentGameYear` is rewritten to read elapsed days through the curve, and its reputation
argument is deleted rather than left ignored (guard G1).

### R2. A directive 20 carve-out for typecheck, SETTLED 2026-07-30, CLAUDE.md amended

The `PartsMarketScreen` failure was **cadence, not a missing guard**: `pnpm typecheck` is
whole-program, compiles every `.vue` template, and caught the bug instantly the one time it ran.
Nine commits landed on narrow test runs before anyone pushed.

**Any task that retires, renames or reshapes a schema field or an exported symbol runs
`pnpm typecheck` before it reports.** Narrowest possible carve-out, cheapest stage of the gate,
and it licenses nothing else.

### Parking is a capital cost, with the recurring pressure on capacity, SETTLED 2026-07-30

Bays stay a **once-off purchase**, and **each bay permanently raises weekly rent**. A
per-car-per-week holding fee would double-charge, because a held car already costs the player
the bay it occupies. This way unused capacity bleeds every week, a held car costs the thing you
would otherwise put there, and the fiction is honest: you rent the premises, and a bigger yard
costs more.

### R3. The standing lever grant, and exactly what it is, RECORDED 2026-07-30

Sprints 144 onward cite "the maintainer's standing authority of 2026-07-30" when signing economy
levers. **This section is what that phrase refers to, and it is the only record of it.** Cite it
by name (R3) rather than by date, so a reader can find it.

**What was granted.** Before going off shift on 2026-07-30, the maintainer handed the arc over
verbally, in session: everything designed to that point was to be treated as signed off, work
was to continue without them, and the orchestrator was given authority to move levers that would
normally need per-lever sign-off, on condition that **every such change is documented for review
on their return** and that sane defaults are chosen.

**What it is NOT.** It is **not a CLAUDE.md directive and not an amendment to directive 22**.
The only CLAUDE.md change dated 2026-07-30 is the directive 20 typecheck carve-out at R2 above,
which is a different thing entirely. Anyone auditing a lever change against CLAUDE.md alone will
not find this grant, and should not conclude from that absence that a lever was moved without
authority. Equally, no agent may infer this grant from CLAUDE.md; it exists here and in the
session transcript, nowhere else.

**Its standing.** Every lever moved under it is **provisional pending the maintainer's
ratification**, listed by name and value in its own sprint doc per directive 22's recording
requirement, and consolidated for review in the arc's lever ledger. Directive 22's substance is
unchanged: levers are still moved one at a time, by name, with the reasoning written down. What
the grant changes is only WHO signs, and only until the maintainer picks the arc back up.

**Its expiry.** The grant covers the handover period it was given for. It does **not** extend to
future sessions, and it is not a precedent. Once the maintainer has reviewed the ledger, this
section records the outcome of that review and the grant is spent.

---

## 5. The guards, and what each actually catches

Approved by the maintainer, with one revision from discovery.

**G1. Delete, never deprecate.** A replacement removes the old symbol in the same change, so
the compiler finds every caller. Paired with R2's typecheck rule, this is the primary defence.

**G2. A retired-identifier ledger.** A maintained list of dead names, walked over every `.ts`
and `.vue` under `packages/*/src`, word-boundary matched, failing with file and line. The
machinery exists three times over already (`commentHygieneGuard`, `noEmDash`, and a one-off
in `engineCharacter.test.ts` that does exactly this for a single field). **Generalise that
one-off.** Its value over typecheck is not power, it is reach and cost: it catches retired names
inside string literals, `Record<string, X>` indexing and comments, which the compiler cannot
see, and it runs as one narrow file rather than a whole-program compile.

**G3. A duplicate-formula ban, replacing the parity test I originally proposed.** Discovery
showed there is only one valuation stack, so there is nothing to compare. The real risk is a
*second* formula appearing. So: no file outside the owner module may recombine
`bookValueYen × mileageFactor(...)`. Same grep mechanism as G2, aimed at a live duplicate
rather than a dead name.

**G4. `model.mjs` dies when the shipped stack can generate §9.** One implementation, the
document generated from what the player plays.

**G5. `.strict()` on every content schema this rework touches** (from D5).

**And a standing rule rather than a test: the ledger moves with the stack.** Any sprint that
changes what a car is worth extends `valueLedger.ts` in the same sprint. That file is asserted
to sum exactly to `marketValueYen`, so it is a live check that the player-visible explanation
and the actual number never diverge. It is also how the appraisal gets built incrementally
rather than as a late screen nobody has time for.

---

## 6. Sprint order

Thirteen sprints. That is the honest number, and it is larger than the whole tuning arc. The
sequencing is driven by what unblocks what, and by putting the cheap high-value work first.

**Phase 0, safety, no behaviour change**

- **S1. Guards and defects.** G2, G3, G5. Fix D1 (flag-driven dispatch), D3 (rename a
  coherence), D4. Rule on D2. Nothing a player can see changes. **Everything after this is
  safer for it.**

**Phase 1, the value stack**

- **S2. Stage C and Stage D.** Export `coherenceFactorFor`, add the discount, replace flat
  retention with the curve, delete `partsRetention`. Extend the value ledger with both lines.
  Re-run the `balanceProbes.ts` probes, which call `marketValueYen` directly and will move.
  **Highest value-to-effort ratio in the plan: it delivers "building well pays" on its own, and
  it reprices auctions for free.**

**Phase 2, stats, then taste**

- **S3. Per-car style baselines and the kei archetype.** This is Sprint 140's Task 0 pulled
  forward, because **style targets cannot be authored while every stock car scores 20.** Also
  settles which of the two `authenticity` values a buyer target reads (the raw immutable one, or
  the derived taste one).
- **S4. Taste as match.** Replace one private function's body; re-author five archetypes to
  target / upper / importance. Ledger gains best-fit and poor-fit lines.

**Phase 3, time and space**

- **S5. The listing clock.** `offersSeen`, staleness, the offer-quality distribution,
  `relistRecovery`. Retire `sinceDay` and its bot reader together.
- **S6. Space.** The `forecourt` bay kind, listing requires a forecourt slot, storage is
  cheaper. Cars carry no location field, so this is a third parallel array, not a per-car change.
- **S7. Rhythm.** The monthly cadence primitive and day-of-week semantics, then auction day,
  the meet, and wages on Friday.

**Phase 4, standing**

- **S8. The flow model.** Probabilistic lemon leg, `presence` / `basePresence` /
  `reputationFlowFactor` / `seasonFactor`, magazine feature and provenance, cars resurface.
  Ledger gains the lemon-risk line, which completes the appraisal.

**Phase 5, venues**

- **S9. The exits.** The trade network is **re-priced and gated, not built**: it ships today at a
  `priceBand` of 0.95 to 1.02, open to everyone, and §6 wants 0.87 and runners only. That is a
  lever change on hash-pinned content plus a gate, and the sprint brief must say so or the
  existing channel will survive alongside the "new" one. The fixer with favour and a monthly
  appetite, and the export container with batching and deferred payment, are genuinely new.
  **Depends on S1's D1 fix** or all three will silently draw nothing.
- **S10. The scrapyard.** The venue, favour gating, and scored harvesting.

**Phase 6, period depth**

- **S11. Shaken.** Value and liquidity modifier, compliance bill, and the buying-side arbitrage.
- **S12. The decade.** Whatever R1 rules, then keyframes, era events and seasonal presence.

**Phase 7**

- **S13. Sweep.** Delete `model.mjs`, generate §9 from the shipped sim, close the `TODO.md`
  ratchet entry against the flow model, and re-derive every pin the arc moved.

---

## 7. How this fits the tuning arc

**Sprints 138 and 139 are superseded and should be closed unbuilt**, with their docs recording
why rather than being quietly rewritten. 138 was a measurement sprint whose question ("is the
coherence penalty felt?") this design answers structurally, and 139 asked whether building well
deserves a premium, which Stage D now answers yes.

**Sprint 140 splits.** Its Task 0, per-car style baselines, becomes **S3 and is a prerequisite
for S4**. The rest of 140 (deleting `statModifiers.handling`, the aero ceiling, the parts-market
power readout) stays independent and can run whenever.

**Sprints 141 and 142 are untouched.** The dyno screen and grade sensitivity depend on nothing
here and nothing here depends on them.

**So the tuning arc completes as 140, 141, 142**, with 138 and 139 closed, and this plan runs
after or alongside.

**Numbering.** The tuning arc occupies 134 to 142. **This arc is sprints 143 to 155**, and it is
the larger of the two: the tuning arc rebuilt what a part DOES, and this one rebuilds what that
is WORTH, how long it takes to sell and what it says about the shop. It does not replace the
tuning arc, it consumes its output, Stage C and D read the `coherenceFactor` that Sprint 136
built, and none of this would work without it.

**One task jumps the queue.** D6, making `balanceProbes.ts`'s probe cars read live data, is a
standing hazard rather than a sale-value problem and should be fixed immediately, ahead of S1.

---

## 8. What I would sign first

In order, and the first two cost nothing:

1. **R1**, the calendar axis. It blocks three sprints and nothing can be authored around it.
2. **R2**, the typecheck carve-out.
3. **S1**, which is pure safety and changes no behaviour.
4. **S2's levers**: `coherenceDiscountWeight`, `retentionFloor`, `retentionCeiling`. Three
   numbers that deliver the design's central promise.

Everything else can wait behind measurement.
