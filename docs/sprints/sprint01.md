# Sprint 01 — Data Model & Schemas

*Source: roadmap Phase 1, Sprint 1. GDD sections 2.4 (naming layer), 4 (cars), 5 (parts), 6.3 (buyers), 7 (staff). Status: **implemented — ready for review.***

## Goal

The complete game data model as Zod schemas, the Naming Layer with its CI leak test, and the first
real seed content. Everything headless: no UI work this sprint. When this lands, every later system
(day tick, auctions, buyers) is built against these types, so getting the shapes right matters more
than speed.

## Definition of Done (from roadmap)

`pnpm test` validates all seed content against the schemas; the naming-layer leak test is green
(parody mode produces zero real-brand strings).

## Design decisions (made at design time, flag disagreement in review)

1. **Schemas and types live in `packages/content`**; `packages/sim` will depend on
   `@midnight-garage/content` (pure data + Zod, imports nothing else), never the reverse.
   The boundary law is untouched: content is renderer-agnostic by construction.
2. **Seed cars: the PoC-10 from the roster** (City AA, Wagon R, EG6, AE86, 180SX, JZX90, S14,
   FC3S, FD3S, JZA80) rather than the roadmap's "8 cars" — the roster v1.2 PoC tier supersedes
   the older roadmap count. Zero extra system work, two extra JSON entries.
3. **Naming mode is a content-level concept:** `resolveCarDisplayName(model, mode)` /
   `resolveCarBrand(model, mode)` where mode is `'real' | 'parody'`. Every `CarModel` carries
   both `displayName`/`brand` (real) and `parodyName`/`parodyBrand`. The game reads the mode
   from one `NAMING_MODE` config constant; flipping it touches no gameplay data (GDD 2.4).
   Parts are parody-only from day one and have no real variant.
4. **Implementation-time addition: no `spec.drivetrain` field.** The Sprint 00 stub had a
   `spec.drivetrain` enum duplicating what `tags` already expresses (GDD 4.4 lists layout as
   one of "the tags"). Keeping both is a DRY violation (two sources of truth for the same fact),
   so `spec.drivetrain` was dropped; `CarModelSchema` instead `.refine()`s that `tags` contains
   exactly one layout tag (FR/FF/AWD/MR/RR), one induction tag (NA/Turbo/Supercharged), and one
   engine-family tag (Piston/Rotary). A `layoutTagOf(model)` helper reads it back out. Flagging
   this since it revises committed Sprint 00 seed data — no downstream code referenced the old
   field, so it was a zero-cost fix.

## Task breakdown

### A. Schemas (`packages/content/src`, split into one file per domain)

- [x] **Platform tags** (`src/tags.ts`, GDD 4.4): layout (`FR/FF/AWD/MR/RR`), induction
  (`NA/Turbo/Supercharged`), engine family (`Piston/Rotary`), class (`Kei`), decade, origin
  (`JDM/Gaisha`) as one closed `TagSchema` enum. `ZoneSchema`, `SlotSchema`, `GradeSchema`,
  `RarityTierSchema`, `ReputationTierSchema` also live here.
- [x] **`CarModel`** (`src/carModel.ts`): tier, tags, `bookValueYen`, naming-layer fields
  (`parodyName`, `parodyBrand`), `hiddenIssueWeights` (zone -> weight). No `spec.drivetrain` —
  see design decision 4; layout lives in `tags`, schema-refined to exactly one each of
  layout/induction/engine-family.
- [x] **`CarInstance`** (`src/carInstance.ts`): `modelId` ref, year, mileage, color, provenance
  note, per-zone condition (0-100), `hiddenIssues[]` (issueId + revealed flag), authenticity
  percent, `buildSheet` (7 slots, each a nullable embedded `PartInstance`).
- [x] **`Part`** (`src/part.ts`, GDD 5.1-5.2): brand + name (parody-only), slot, grade,
  required tags, stat modifiers, price. Condition and genuine-period status moved to the new
  `PartInstance` type (per-instance, not per-catalog-entry — see GDD 5.3 on used vs. repro parts).
- [x] **`HiddenIssue` catalog schema** (`src/hiddenIssue.ts`): id, zone, severity range
  (refined min <= max), hint text, base repair cost.
- [x] **`Buyer`** (`src/buyer.ts`, GDD 6.3): archetype enum, five-stat weight block, tier
  preferences, price sensitivity.
- [x] **`Staff`** (`src/staff.ts`, GDD 7): `TraitId` enum + `TraitDefinition` catalog schema,
  `StaffMember` (four stats 1-5, wage, one trait). No staff seeded — GDD 7 starts you with zero.
- [x] **`GameState` + `DayLog`** (`src/gameState.ts`): day, seed, cash, reputation tier, owned
  cars, part inventory, staff. `DayLogEntrySchema` is a discriminated union (5 event types) kept
  separate from `GameState`, matching the `advanceDay` contract's `newState + eventLog` split.

### B. Naming Layer (risk R5 — build the escape hatch now)

- [x] `resolveCarDisplayName(model, mode)` + `resolveCarBrand(model, mode)` in `src/naming.ts`.
- [x] `NAMING_MODE` config constant (single flip point, default `'real'`).
- [x] **CI leak test** (`tests/naming.test.ts`): `REAL_BRANDS` (5 manufacturers) +
  `REAL_MODEL_TOKENS` (10 nameplates) checked as case-insensitive substrings against every car's
  parody name/brand, plus a check that no seed part brand collides with a real car brand.
  Verified live: deliberately reverted one car's `parodyName` to its real name, confirmed the
  test failed on both the substring check and the parody-differs-from-real check, then reverted.
- [x] Parody names drafted for all 10 PoC cars (e.g. "Suprema RZ (JZA80)", matching the GDD's own
  example). Flagged for your review in group D.

### C. Seed content (`packages/content/data`)

- [x] **10 PoC cars**: City AA, Wagon R, EG6, AE86, 180SX (RPS13), Chaser (JZX90), Silvia K's
  (S14), Savanna RX-7 (FC3S), RX-7 (FD3S), Supra RZ (JZA80) — real chassis/engine codes, curb
  weights, stock PS; tiers matched to GDD 4.3's explicit examples where given. Book values fall
  inside the `docs/economy-v0.md` tier ranges (enforced by an integrity test).
- [x] **20 parts** across all 7 slots and all 4 grades (stock/street/sport/race all represented —
  final tally: 1 stock, 6 street, 8 sport, 5 race). Engine and Forced Induction parts gated to
  `Piston`-tagged platforms (rotary cars have no compatible catalog parts yet — accurate scarcity
  for PoC scope, not a bug). Dished steering wheel from the draft list was folded into the bucket
  seat entry to keep wheels/interior at 3 parts and the total at exactly 20.
- [x] **5 buyer archetypes** (`data/buyers.json`) with weights matching the GDD 6.3 table
  (Collector, Tuner, Stancer, Racer, First-timer).
- [x] **Hidden-issue catalog v1** (`data/hidden-issues.json`): 10 issues, all 5 zones covered
  (body x3, engine x3, drivetrain x2, interior x1, suspension x1).
- [x] **5 staff trait definitions** (`data/traits.json`): Ex-pro driver, Auction rat,
  Perfectionist, Night owl, Gaisha-fluent (per GDD 4.5/7/8) — flavor text only, effects later.

### D. User tasks

- [x] Review parody names for the 10 cars and the parody parts brands. **Approved as-is** (2026-07-08).
- [x] Review `docs/economy-v0.md` book values. **Approved as-is** (2026-07-08) — the draft ranges
  and Sprint 01 seed data now stand as accepted, not just drafted.

## Testing

- [x] Schema validation of every data file (`tests/schemas.test.ts`): cars, parts, buyers,
  hidden-issues, traits all parse; id-uniqueness checked per file.
- [x] Naming-layer leak test (`tests/naming.test.ts`) — the sprint's headline test, verified to
  actually fail on a real leak (see group B).
- [x] Referential integrity (`tests/integrity.test.ts`): every buyer's `statWeights` covers
  exactly the five stat keys; no car repeats a zone in `hiddenIssueWeights`; every book value
  falls inside its tier's economy-v0 range. (`Part.requiredTags` and hidden-issue zone validity
  are enforced structurally by the schemas themselves, since both fields are typed as closed
  enums — no separate test needed for those.)
- [x] Round-trip test (`tests/gameState.test.ts`): a hand-built `GameState` with one car instance
  (carrying one installed `PartInstance`) and one inventory part parses through `GameStateSchema`
  unchanged; a `DayLog` with one entry per event type parses through `DayLogSchema` unchanged.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (22 tests, 5 files — 5 in
  `packages/sim`, 17 across `packages/content`'s 4 new test files), `pnpm build` all green.

## Hygiene and docs

- [x] CLAUDE.md current-state note updated.
- [x] Design decision 4 (dropping `spec.drivetrain`) flagged above — a deliberate deviation from
  the Sprint 00 stub, not silent drift.

## Exit

DoD met locally (`pnpm test` green, naming leak test verified to actually catch leaks). User
reviewed and approved parody names and economy-v0 numbers on 2026-07-08. Committed as `832e47b`
and pushed to `main`. **Sprint 01 complete.** Sprint 02 (`advanceDay` + golden-master determinism
test) builds on these types next.
