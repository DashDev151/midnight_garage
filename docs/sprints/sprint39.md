# Sprint 39: Techniques and the shop title

*Arc: Progression Rework finale. Read `docs/design/progression-bible.md`,
`arc-progression-rework.md`, sprint36-38 Exits, and `CLAUDE.md` in full; no em dashes anywhere.
Specialty exists (Sprint 38); this sprint gives it its reveal: named craft unlocked by doing the
work, and the shop earning a name. Everything below is specified; implement exactly.*

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- Specialty state + bias + premium (Sprint 38): techniques and the title are pure FUNCTIONS of
  specialty; this sprint persists NO new state (no save bump), both derive deterministically.
- The template pipeline: technique-gated templates are ordinary templates with one new optional
  gate field, flowing through the same offer generation, derived payouts, and profitability guard.
- Sprint 38's copy mechanism (specialtyCopy pools) for title/technique flavor.
- `IDEAS.md` for the parking-lot item this sprint does not build.

**Genuinely new (small):** `techniques.json` content + schema; `requiresTechnique` on templates +
its offer/accept gate; the derived `shopTitle` + its extra bias; six signature templates.

**Explicitly NOT in this sprint:** the build logbook / wall of builds (`IDEAS.md`); staff mastery;
specialty from sales (still parked); any technique modifying speed, cost, or quality math (bible:
techniques are access only).

## Locked specification

### 1. Techniques (`packages/content/data/techniques.json` + `src/techniques.ts` schema)

One per line. Fields: `id`, `componentId`, `displayName`, `thresholdPoints`, `unlocksTemplateIds`,
`unlockLogLine` (one quiet day-log sentence). Shipped values (thresholds content-tunable):

| id | line | displayName | threshold | unlocks |
|---|---|---|---|---|
| blueprint-building | engine | Blueprint engine building | 120 | full-blueprint-build |
| dog-box-conversion | drivetrain | Dog-box conversion | 120 | dog-box-conversion-job |
| corner-weighting | suspension | Corner weighting | 120 | corner-weighted-setup |
| show-fitment | wheels | Show fitment | 120 | show-fitment-program |
| one-off-fabrication | body | One-off panel fabrication | 120 | one-off-widebody |
| bespoke-trim | interior | Bespoke trim work | 120 | bespoke-cabin-build |

### 2. Signature templates (added to `serviceJobTemplates.json`, all with `requiresTechnique`)

`ServiceJobTypeSchema` gains optional `requiresTechnique: z.string()`. Same notation as sprint37:

| id | rep tier | deadline | baseRep | tasks |
|---|---|---|---|---|
| full-blueprint-build | 4 | 10 | 34 | repair block->mint @3, install internals (race+) @3, repair headValvetrain->mint @3 |
| dog-box-conversion-job | 4 | 8 | 30 | install gearbox (race+) @3, install clutch (race+) @2 |
| corner-weighted-setup | 4 | 8 | 28 | repair steering->mint @3, repair antiRollBars->mint @3, install springs (sport+) @2 |
| show-fitment-program | 4 | 7 | 26 | install rims (race+) @2, repair tyres->mint @2 |
| one-off-widebody | 4 | 10 | 34 | repair panels->mint @3, install aero (race+) @3, repair paint->mint @3 |
| bespoke-cabin-build | 4 | 8 | 28 | install seats (race+) @2, repair dashGauges->mint @2 |

FlavorPool >= 2 each, enthusiast-brief register ("build me a motor that revs to nine", "want it
corner-weighted for the touge"); integrity guard applies; no em dashes; parody brands only.

### 3. Derived helpers (pure functions, `packages/sim/src`, NO state writes)

- `unlockedTechniques(state, context)`: techniques whose `specialty[componentId] >=
  thresholdPoints`.
- `shopTitle(state, context)`: the technique-independent title line = argmax specialty group with
  `specialty >= titleThresholdPoints` (ties: higher points, then `ComponentIdSchema.options`
  order); returns `null` below threshold. Tunables in economy.json `specialty` block, added:
  `"titleThresholdPoints": 80, "titleBiasMultiplier": 1.25`.
- Offer generation: templates with `requiresTechnique` are excluded unless unlocked (both at
  generation AND re-checked at accept, refusal reason `'technique'`); the title line's candidates
  get their Sprint 38 bias weight multiplied by `titleBiasMultiplier`.
- Day log: on the FIRST offer generated for a newly unlocked technique (detectable statelessly:
  technique unlocked AND no prior offer of its template in `state.serviceJobOffers`... NOT
  reliable across days; instead: whenever a `requiresTechnique` offer is generated, its flavor is
  the technique's `unlockLogLine`-register copy, and NO separate unlock announcement exists. The
  `unlockLogLine` field is used as an extra flavor line appended to the signature template's
  flavor pool at generation, nothing else. No popups, no toasts.)

### 4. UI (copy only)

- `GarageScreen.vue`: where the reputation tier already renders, append the title as plain copy
  when non-null: `known as "the engine house"` (title strings per line in `specialtyCopy.json`,
  new `titleName` field per group: the engine house, the driveline shop, the chassis works, the
  wheel specialists, the body shop, the trim house).
- Dev console: read-only techniques/title dump.
- No other UI.

### 5. Tests

- A `requiresTechnique` template never offered below threshold, offered above (seeded, both sides
  of the boundary); accept re-check refuses if specialty somehow below at accept.
- Title derivation: null below 80; correct argmax; tie-break by points then group order; overtake
  flips it (pure function tests).
- Signature templates pass the profitability floor (they enter the existing every-template loop
  automatically; just keep it green).
- No save bump: assert `SAVE_VERSION` unchanged (24) and a v24 save decodes identically.
- Focused-vs-spread pacing note for Exit: seeded comparison showing a focused line reaches 120
  points in materially fewer completed jobs than an even spread (documented in Exit, not a hard
  test).

### 6. Arc close-out (in this sprint)

- `IDEAS.md`: add the build logbook / wall-of-builds entry (post-launch parking lot).
- `TODO.md`: sweep retired equipment-gate items; keep the specialty-from-sales design question.
- `docs/design/skill-progression.md`: reconcile against the bible; superseded content moved to an
  `archive/` subfolder (clean-codebase rule: archive, do not delete).
- GDD amendment DRAFT (maintainer approval required before applying): S3.2 labor slots (base 6,
  tier-scaled efficiency), S9.0 The Climb (always-owned tool tiers + ceilings replace equipment
  purchases as unlocks), S9.1 (reputation + specialty split), S6.1 commissions (ladder +
  techniques). Produce as a separate `docs/design/gdd-amendment-progression.md` for sign-off; do
  NOT edit the GDD directly.

## Definition of Done

- Signature work arrives only through earned specialty, pays like the fabrication tier it is, and
  is narrated diegetically; zero new HUD beyond the title copy line.
- No save bump, proven by test.
- Full gate green; balance harness (orchestrator-run) disclosed; arc-wide final state recorded in
  Exit (days-to-`local` band, steal tail, strategy spreads).

## Fences

Do NOT add state for techniques/title (derive them), do NOT touch repair math, tool tiers,
reputation, the value model, auctions/selling. No meters, no toasts, no direct GDD edits. Do NOT
run the balance harness.

## Exit

*(filled on completion)*
