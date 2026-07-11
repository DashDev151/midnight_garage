# Sprint 16 — Progression gating & the Upgrades tab

*Source: 2026-07-10 playtest session (`docs/playtest-notes-2026-07-10.md`, items #6/#7/#8/#10) and the
same-day design conversation. Depends on Sprint 15 (reputation system) for #7/#10 — this sprint spends
the reputation tier Sprint 15 makes real. #8 (job-board equipment hinting) doesn't actually depend on
Sprint 15 at all (it's equipment-only), and #6 (Upgrades tab) is pure UI — both ride along here because
they're the same "shop progression" surface, not because they share a technical dependency. Status:
**implemented, committed (`8e74448`).** Decision 1's equipment ladder was revised
mid-implementation after a real catch-22 was found (see Exit) — not just disclosed, fixed, the way
Sprint 13 first handled this exact class of problem.

## Goal

Right now nothing stops a player from buying the best equipment or the deepest auction access on day
one if they've got the cash — the GDD's own stated pillar ("Equipment + staff skill + rep gate the
ceiling; money alone never skips the climb", §9.0 The Climb, quoted verbatim — verified 2026-07-10)
isn't actually true yet. This sprint makes it true:
equipment and facilities get reputation gates on top of their existing price gates, the two cheaper
auction tiers (regional, premium) get the same reputation gate `collector-network` already has, the
service-job board mostly hides jobs the player can't act on (while occasionally showing one as a
"here's what's next" hint), and Facilities/Equipment get pulled out of the Garage screen into their
own dedicated Upgrades tab.

## Reuse analysis (directive 15 — read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Reputation-tier gate check | `reputationAtLeast` (`calendar.ts`) — already the one gate function every rep-gated thing in this codebase calls | **Reused for every new gate this sprint** — facilities, the two newly-gated auction tiers. No second gate function. |
| Equipment reputation gate | `applyEquipmentPurchase`'s existing `reputationAtLeast(state.reputationTier, equipment.minReputationTier)` check (Sprint 13, dormant since no content sets the field) | **Untouched code** — this sprint only sets `minReputationTier` values in `equipment.json`. The mechanism doesn't change at all. |
| Collector Network's existing auction gate | `catalogs.ts`'s `refreshCatalogs`: `if (tier === 'collector-network' && !reputationAtLeast(...)) continue` — skips catalog *generation* for a tier the player can't reach yet | **Generalized, not replaced** — the same skip-generation-if-ungated shape extends to `regional`/`premium`, driven by a per-tier threshold lookup instead of one hardcoded special case. |
| Equipment ownership check | `hasEquipmentFor(state, componentId, context)` (Sprint 13) | The job-hinting filter needs the same "does the player own the tool for this component" question, but at *offer-generation* time, which doesn't have a full `GameState` to hand — see decision 5 for the small refactor this implies (extracting the pure lookup so both call sites share it, not duplicating the logic). |
| Silent-refusal-on-gate pattern | Every existing purchase gate in this codebase (`applyEquipmentPurchase`, `applyBayPurchase`) refuses with `applied: false` and no log entry when a gate fails, not an error | **Reused for the new facility reputation gate** — same shape, no new log-entry type needed for "you don't have the rep yet." |
| Content-driven tunable numbers | `EquipmentSchema.minReputationTier` (optional field, already exists, just unset in content) | **Reused for equipment**; **mirrored for facilities** — a parallel `minReputationTier` array alongside `Facilities`' existing `bayPricesYen` array, same shape, same place. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **Facility reputation gating.** `applyBayPurchase`/`nextBayPriceYen` are cash-only today — no
   equivalent of equipment's `minReputationTier` exists on `Facilities` content or in the purchase
   resolver. This is the one real new gate this sprint adds (the auction-tier gate is an extension of
   an existing pattern; this is the first time bays get *any* non-cash gate).
2. **Job-board equipment hinting with a "rare exception" policy.** Sprint 13 already gates whether a
   repair-kind offer can be *accepted*; nothing today influences whether one is *generated* in the
   first place. This sprint adds a genuinely new policy: mostly filter out repair offers for
   unowned-equipment components, but let a small fraction through anyway as a deliberate "you'll need
   this next" signal — a probabilistic content-generation rule that doesn't exist anywhere else in
   this codebase yet.
3. **The Upgrades tab itself** — new route, new screen. Pure relocation of existing Facilities/
   Equipment sections already built in Sprint 09/13, not new game logic.

## Definition of Done

- Equipment purchases require both cash and reputation again (mirroring the original Sprint 13 intent
  before it was reversed for lack of a real reputation system — the system now exists, Sprint 15).
- Bays (service and parking) require both cash and reputation — genuinely new, didn't exist before in
  any form.
- Auction access follows a real ladder: local-yard always open, regional/premium/collector-network
  each require progressively higher reputation (today only collector-network is gated).
- The service-job board mostly shows offers the player can actually act on given owned equipment, with
  a deliberately rare chance of surfacing one they can't yet — a hint, not a wall.
- Facilities and Equipment purchase UI move out of `GarageScreen.vue` into a new `/upgrades` route,
  visually distinct from the plain list it is today.
- All 8 harness bots verified still functional under the new gates — none silently inert — with the
  expected shift in harness numbers reported honestly (see the bots & harness section below; this bar
  has applied to every gate-adding sprint since 13 and was missing from this doc's first draft).
- All checks green; new tests cover both new gates, the hinting policy's "mostly filtered, rarely not"
  behavior, and the moved UI's basic render/purchase flow.

## Decisions (approve / adjust before implementation)

1. **Equipment reputation ladder — first-pass, tied to the existing price ladder's own ordering** (not
   claimed correct, same "reasonable defaults, tune later" spirit as Sprint 15):

   | Equipment | Price | Reputation |
   |---|---|---|
   | `tire-machine` | ¥150,000 | none (day-1 accessible) |
   | `brake-lathe` | ¥250,000 | none |
   | `upholstery-bench` | ¥350,000 | none (revised — see below) |
   | `suspension-press` | ¥400,000 | `local` |
   | `welder` | ¥700,000 | `known` |
   | `transmission-bench` | ¥900,000 | `known` |
   | `engine-crane` | ¥1,500,000 | `respected` |

   **Revised during implementation (2026-07-10): `upholstery-bench` left ungated instead of `local`
   as originally proposed.** Real content only defines repair-kind service-job types for 5 of 8
   components — engine/drivetrain/suspension/body/interior (verified: `serviceJobs.json` has no
   `repair-brakes`/`repair-wheels` type at all, only install-kind for those two). Service Grinder
   (and any real player who only ever works customer service jobs, never buying or selling a car)
   has no reputation source *except* completing one of those five repair-kind jobs — but completing
   one needs its equipment, and every one of those five was originally gated. That's a genuine
   catch-22, not just a harder economy: verified empirically at 0/30 sampled seeds ever bought
   equipment over a 100-day career, cash flat at the exact rent-only floor every time (not rare,
   permanent). Leaving the cheapest of the five (`upholstery-bench`) ungated breaks the loop — exactly
   how Sprint 13 first discovered and resolved this same class of problem (see `TODO.md`) — while
   `suspension-press`/`welder`/`transmission-bench`/`engine-crane` stay gated as designed. Re-sampled
   after the fix: 19/30 seeds now bootstrap within 100 days (the remainder is genuinely probabilistic —
   a repair-interior offer still has to survive the job-board hint roll before Service Grinder can see
   one to accept).

2. **Facility reputation ladder — a coarse banding across each ladder's rungs, not a unique value per
   rung.** Service bays (4 purchasable rungs beyond the starting one): rungs 1-2 `local`, rungs 3-4
   `known`. Parking bays (12 rungs): banded in thirds — rungs 1-4 `local`, 5-8 `known`, 9-12
   `respected`. Exact per-rung JSON values are an implementation-time authoring detail, not a design
   blocker — the policy (coarse bands, not one threshold per rung) is the actual decision here.

3. **Auction tier reputation ladder** — extends the existing `collector-network: respected` gate to:
   `local-yard`: none, `regional`: `local`, `premium`: `known`, `collector-network`: `respected`
   (unchanged). A clean 1:1 mapping onto 4 of the 5 reputation tiers, leaving `legend` reputation
   reserved for something rarer than a mere auction tier (nothing currently needs it at that level —
   fine, not every tier needs to gate something).
   Verified 2026-07-10: `auctionTierForRarity` (`auctions.ts`) already hard-maps car rarity to venue
   1:1 — shitbox/common → local-yard, uncommon → regional, rare → premium, legend →
   collector-network, gaisha → never auctioned — so gating venues by reputation *is* the car-quality
   progression playtest note #10 asked for: an `unknown`-rep player sees only shitbox/common metal,
   with no separate per-car gate needed.

4. **Job-board hinting: a flat per-candidate "let it through anyway" chance, not a hard cap count.**
   During offer generation, a repair-kind candidate whose equipment isn't owned is normally
   rerolled/dropped; instead, keep it anyway with a small fixed probability
   (`JOB_HINT_OFFER_CHANCE`, proposed first-pass `0.15`) rather than a "cap at 1-2 per batch" rule —
   simpler to implement and reason about, and naturally produces "usually 0, occasionally 1" across a
   typical weekly batch (`SERVICE_JOB_OFFERS_PER_REFRESH = 4`, verified), matching the maintainer's
   own framing ("majority... but rarely one or 2"). Install-kind offers are never filtered
   (unaffected, as already true since Sprint 13).
5. **Small refactor to share equipment-ownership logic between two call sites.** `hasEquipmentFor`
   currently takes a full `GameState`; offer generation doesn't have one (it only ever receives loose
   pieces — models, hidden issues, etc., never a `GameState`). Extract the actual lookup into a lower-
   level pure function taking just `ownedEquipmentIds: readonly string[]` and
   `equipmentById: Readonly<Record<string, Equipment>>`, with `hasEquipmentFor(state, componentId,
   context)` becoming a thin wrapper over it. One real check, two callers, not two implementations.

## Task breakdown

### A. Content (`packages/content`)

- [x] `equipment.json`: set `minReputationTier` per decision 1.
- [x] `facilities.ts`/`facilities.json`: `Facilities`' per-kind config gains a `minReputationTier:
  ReputationTier[]` array parallel to `bayPricesYen`, populated per decision 2.

### B. Sim (`packages/sim`)

- [x] `equipment.ts`: extract the pure ownership-lookup helper (decision 5); `hasEquipmentFor` becomes
  a thin wrapper over it.
- [x] `facilities.ts`: `nextBayPriceYen`/`applyBayPurchase` gain a reputation check (same silent-
  refusal shape as equipment) reading the new content array.
- [x] `constants.ts`: `JOB_HINT_OFFER_CHANCE` (decision 4).
- [x] `catalogs.ts`: the collector-network-only skip generalizes to a per-tier threshold lookup
  covering all 4 auction tiers (decision 3).
- [x] `serviceJobs.ts`: `generateServiceJobOffers` gains `ownedEquipmentIds`/`equipment` params (via
  the decision-5 helper), applying the hinting policy (decision 4) to repair-kind candidates only.
  Call sites (`catalogs.ts`'s `refreshCatalogs`) updated to pass `state.ownedEquipmentIds`/
  `context.equipment` through.

### B2. Bots & harness (added in review, 2026-07-10 — missing from the first draft)

- [x] **These gates hit the bots hard, and that impact was unexamined.** Bots start at `unknown`
  reputation and — outside Service Grinder's service-job income and Sprint 15's new quality-sale
  bonus — have no reputation income at all. Under this sprint's gates, most bots therefore live in
  local-yard (shitbox/common) lots and the two ungated equipment items (`tire-machine`/`brake-lathe`)
  for their entire career. That is a large, *expected* shift in harness output, not a regression (no
  baseline has ever been validated — standing maintainer guidance); the work is: confirm no bot goes
  fully inert (Handyman can still buy the ungated tools; every bidding bot still finds local-yard
  lots to bid on; Service Grinder can still accept and complete *some* repair offers), update any
  harness tests that assert mechanism-works claims, and report the before/after numbers honestly
  using Sprint 15's new reputation telemetry.
- [x] **Open design question to settle at implementation time:** should any bot get minimal
  reputation-*seeking* behavior this sprint (e.g. Balanced Player's existing service-job work already
  earns points — enough to climb to `local` naturally?), or is flat-reputation bot behavior
  acceptable until the recorded-play ruleset idea (see `TODO.md`) lands? Leaning: keep bots as-is and
  report the shift — but decide it explicitly, don't discover it.

### C. Game (`packages/game`)

- [x] New `screens/UpgradesScreen.vue` — Facilities + Equipment sections moved here wholesale from
  `GarageScreen.vue` (same store computeds/actions already exist: `serviceBaysView`, `equipmentCatalog`,
  `buyBay`, `buyEquipment`, etc. — genuinely a relocation, not new state), with real visual treatment
  ("make it look nice" — layout/styling pass, not a new mechanic).
- [x] `GarageScreen.vue`: Facilities/Equipment sections removed; a nav link/button to `/upgrades` added.
- [x] `router/index.ts`: new `/upgrades` route, lazy-loaded, matching the existing route shape exactly.
- [x] `gameStore.ts`: purchase-refusal paths (`buyEquipment`/`buyBay`) already return `false` on any
  refusal reason (cash or, now, reputation) — confirm the UI's existing disabled-button + hint text
  pattern (Sprint 13's "needs `<equipment>`" style) extends sensibly to "needs `<reputation tier>`"
  too, not just cash.

### D. Testing

- [x] Sim: equipment/facility purchase tests extended for the reputation gate (owned-but-insufficient-
  rep case, distinct from unaffordable); auction catalog generation tests confirm regional/premium
  lots stop appearing below their new thresholds and resume above them; job-offer generation tests
  confirm the hinting policy statistically (a large sample lands close to `JOB_HINT_OFFER_CHANCE`, not
  exactly — matching how other probabilistic sim mechanics are tested in this codebase).
- [x] Content: `gameState.test.ts`/schema tests updated for the new `Facilities` field.
- [x] Game: `UpgradesScreen.test.ts` covering render + purchase flow (mirroring existing
  `GarageScreen.test.ts` facility/equipment coverage, since it's the same functionality relocated).
- [x] Golden masters re-pinned if the scripted `advanceDay.test.ts` career's fixture equipment/bay
  ownership no longer satisfies the new gates (needs checking at implementation time).

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies, no data-layer access.

**User-only:** play through enough of a career to confirm the gating ladder *feels* right (not too
slow, not trivially fast) — the actual point-threshold tuning is explicitly deferred to real playtest
data per Sprint 15's own decision 1, and this sprint's gates are exactly what that tuning pass will be
judged against.

## Exit

Implemented as designed, with one real mid-implementation revision (decision 1's `upholstery-bench`
gate, detailed above) found and fixed via the same bots-and-harness verification this doc's B2
section called for — not discovered later. Every other decision shipped as proposed.

**Findings, all verified against real content and the harness, not assumed:**

- The auction-tier gate generalization changes RNG consumption in `refreshCatalogs` even for a
  career that never touches equipment or facilities (regional/premium lots simply stop generating
  at `unknown` reputation) — both `advanceDay.test.ts` golden masters re-pinned for this reason
  alone, confirmed by tracing the cause, not just re-pinning on faith.
- Service Grinder's harness assertion was rewritten from a single fixed-seed hard check to a
  30-seed majority check (`successes > 15/30`) — the job-board hint that lets a repair-interior
  offer through is genuinely probabilistic, so a single seed is the wrong bar for it, matching this
  project's existing convention for every other probabilistic sim mechanic (Monte Carlo-style
  testing, not exact-value assertions).
- No other bot needed code changes: `ensureEquipmentFor` (`equipmentHelpers.ts`) already checked
  `minReputationTier` (built dormant in Sprint 13); no bot ever queues a bay purchase at all, so the
  new facility gate has zero effect on bot behavior; auction/job-board gating only changes *which*
  lots/offers appear, which every bot already copes with structurally (fewer choices, not a crash).

All checks green: `pnpm typecheck` / `lint` / `format` / `test:coverage` (416 tests, up from 393) /
`build`. No new dependencies, no data-layer access.

Not done this sprint (explicitly out of scope, tracked in the doc's own B2 section as an open
question): no bot gained deliberate reputation-*seeking* behavior — every bot's reputation
trajectory is still whatever falls out of its existing decisions, reported honestly via Sprint 15's
harness sampling rather than engineered toward a target.

Committed (`8e74448`).
