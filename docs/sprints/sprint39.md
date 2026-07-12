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

Implemented directly (no subagent, per maintainer directive 2026-07-12), exactly per the locked
specification. This closes the Progression Rework arc (Sprints 36-39).

**Techniques + signature templates.** New `techniques.json` (6 entries, one per line, all
threshold 120) + `techniques.ts` schema. Six new tier-4, single-group signature templates added to
`serviceJobTemplates.json`, each carrying `requiresTechnique` (new optional field on
`ServiceJobTypeSchema`). Every carPartId/group/grade verified against the real taxonomy before
writing; flavor lines hand-checked against the integrity guard's foreign-word trap (including the
"nobody" -> "body" substring case caught and reworded in `bespoke-cabin-build`, where body is NOT
a touched group).

**Derived helpers, zero new state.** `unlockedTechniques(state, context)` and
`shopTitle(state, context)` are both pure functions of `state.specialty` (`shopTitle` reuses
`topSpecialtyGroup`'s own tie-break, gated by a new `titleThresholdPoints` economy tunable).
Private `specialty`-shaped twins (`unlockedTechniquesFor`/`titleGroupFor`) serve offer generation,
which only ever carries the loose `specialty` record, not a full `GameState`.

**Offer generation.** A `requiresTechnique` template is excluded from the eligible pool unless its
technique's threshold is cleared; an unresolvable technique id fails CLOSED (verified by a direct
test) rather than accidentally exposing a broken signature job. The shop's derived title line gets
its Sprint 38 bias weight further multiplied by a new `titleBiasMultiplier` (1.25) - composes
multiplicatively, verified to be a no-op at zero/no-title specialty by construction (title is
`null` whenever `specialty[top] < titleThresholdPoints`, which zero always is). A picked signature
template's flavor draws from `[...flavorPool, technique.unlockLogLine]` (folded in as one more
candidate line, never a stateful announcement) unless the Sprint 38 in-lane premium's
`specialtyCopy` swap applies instead - same single `rng.pick`, draw count never changes.
`resolveAcceptServiceJob` re-checks the technique gate live (reason `'technique'`, new enum value
alongside `'tool-tier'`), defensive against specialty dropping between generation and accept.

**`specialtyCopy.json` restructured** (Sprint 38's shape widened, not a save-schema change - pure
content): each group's entry gained a `titleName` field (`ToolLineTier`-adjacent shape,
`{ lines, titleName }`) alongside the existing word-of-mouth pool. All six call sites updated
(`serviceJobs.ts`, `gameStore.ts` not needed since it never read it directly, two test files).

**UI (copy only).** `GarageScreen.vue`'s reputation line appends `, known as "the engine house"`
when `shopTitleName` is non-null. Dev console gained a read-only techniques/title readout, the
same one sanctioned debug exception as Sprint 38's specialty dump. No other UI; no meters, no
toasts.

**Save: confirmed no bump, exactly as designed.** `SAVE_VERSION` stays 24; two new tests assert
this directly and prove a v24 save with specialty high enough to unlock a technique/title decodes
byte-identical to one without - nothing new is ever persisted, both derive live.

**Tests.** Technique gating (never offered below threshold, offered above, fails closed on an
unknown id, accept re-check); `shopTitle` (null below threshold, correct argmax, tie-break,
overtake flips it); `unlockedTechniques` (empty at zero, exact set at real thresholds); the
existing profitability-floor test automatically covers all 6 new signature templates (already
iterates every `SERVICE_JOB_TYPES` entry); a `GarageScreen` UI test for the title's appear/disappear
condition. **Focused-vs-spread pacing, verified ad-hoc (not a committed test, per spec):** a
focused single-line player reaches a technique's 120-point threshold in 12 completed jobs; an
even round-robin across all six lines takes 67 completed jobs to get any ONE line there first -
5.6x more completed work for the spread player to unlock their first technique. Confirms the
design intent directly: specialization is meaningfully faster than spreading thin, entirely as a
side effect of the earn-split math, no extra mechanic needed.

**Arc close-out.**
- `IDEAS.md`: added the build-logbook / wall-of-finished-cars idea (parked, post-launch).
- `TODO.md`: removed two now-resolved stale items (the pre-Sprint-36 "equipment gate
  surfaced-then-blocked" complaint, structurally retired by Sprint 36's `isTemplateOfferable`; the
  Sprint 32 days-to-`local` regression note, which has read PASS in every balance run since Sprint
  33 and was stale/actively misleading); removed the Sprint 33 in-inventory-recondition item
  (shipped in Sprint 35, the note predated it); kept the specialty-from-sales deferral (added
  Sprint 38) and extended the "Skill / XP progression" planned-system item with a reconciliation
  note against the now-built tool-tier mechanism.
- `docs/design/skill-progression.md` reconciled: the original 2026-07-08 note is preserved
  verbatim at `docs/design/archive/skill-progression-2026-07-08.md` (clean-codebase rule: archive,
  don't delete); the live doc now cites `progression-bible.md` as canonical, updates the "Tools,
  not levels" framing from binary-ownership language to the real tool-tier mechanism, and adds an
  explicit relationship table distinguishing Skill (unbuilt, per-worker efficiency/quality) from
  Specialty (built, shop-level identity/access) so a future reader can't confuse the two.
- `docs/design/gdd-amendment-progression.md` drafted (GDD itself NOT touched, confirmed by empty
  diff): proposed text for S3.2 (labor base 2 -> 6, tool tier speeds not adds), S9.0 (six always-
  owned tiered lines replacing the binary-purchase ladder), S9.1 (Specialty appended as the
  horizontal complement), and S6.1 commissions - the last one flagged explicitly for a maintainer
  call, since its "score vs. brief" framing was never actually built that way even before this
  arc, a pre-existing gap this amendment surfaces rather than causes.

**Gate (all shown, all green):** typecheck (content/sim/game); lint; format; `pnpm test` 803/803
(up from 789); `pnpm test:coverage` 803/803 (statements 90.43%, branches 79.14%, functions 90.43%,
lines 94.27%, all above 80/65/78/82); `pnpm build`. No golden-hash re-pin needed (technique gating
is purely additive at zero specialty; the fixed-seed scripted-career fixture never reaches the
tier-4/threshold-120 territory a signature template needs).

**Balance harness, Sprint 39 run: all hard invariants PASS.** Numbers unchanged from Sprint 38
(days-to-`local` p50=12.0; steal tail 61.4%; no strategy below the sanity floor) - exactly as
expected: every signature template needs both reputation tier 4 AND 120 specialty points in one
line, and no current bot strategy is tuned to chase specialty at all, so signature offers are
essentially never generated in the harness and move nothing. This will change once (or if) a bot
strategy is built or retuned to pursue specialty deliberately - a real candidate for the arc-end
balance pass below, not evidence the mechanism is inert (the sim-level and game-level tests above
prove it fires correctly; the harness's bot population just doesn't exercise it yet).

**Progression Rework arc-wide final state (Sprints 36-39):**

| Metric | Pre-arc (Sprint 35) | Sprint 36 (tool lines) | Sprint 37 (job ladder) | Sprint 38-39 (specialty/techniques) |
|---|---|---|---|---|
| Days-to-`local` p50 | 12.0 | 19.0 | 12.0 | 12.0 |
| Auction steal tail | ~79.6% | ~61-65% | 61.4% | 61.4% |
| Sanity floor | pass | pass | pass | pass |

Days-to-`local` dipped to 19 during Sprint 36's mechanical transition (bots spending labor on
slow tier-1 repairs they were previously forbidden from attempting) and recovered to baseline once
Sprint 37's real job content gave them honest, diverse work to do. The auction steal tail improved
as a side effect of the arc (not a goal of it) and remains an open, separately-tracked tuning item
(`TODO.md`'s Sprint 30 living-auction entry). No new hard-invariant failure was introduced or left
open by this arc.

**What the arc actually shipped, one paragraph:** binary equipment ownership (own it or the job is
impossible) is gone, replaced by six always-owned, three-tier tool lines that buy labor speed and
gate fabrication-grade ceilings (Sprint 36); the job content was rebuilt as a real bolt-on ->
involved -> fabrication ladder across all six lines so day one is honest and diverse instead of a
single-template dead zone (Sprint 37); a horizontal Specialty axis rewards doing real work in a
discipline with more and better-paying work in that discipline, surfaced only through offer mix
and word-of-mouth copy (Sprint 38); and named techniques plus a derived shop title give
specialization its payoff and its story, with zero new save state and zero new meters (Sprint 39).
The day-one job-board failure that triggered this whole arc is now structurally unrepresentable.

**Deferred to the arc-end balance/tuning pass (not this sprint, tracked in `TODO.md`):** tool-tier
upgrade prices (the handyman tier-payback signal flagged in Sprint 36's Exit, still unresolved);
`stepCostYen` not scaling with part value (surfaced Sprint 34, more relevant now that specialty
makes repeated work in one line more likely); the auction steal tail (still above its informational
target); a bot strategy that actually pursues specialty/techniques, so the harness can measure
what this arc built instead of reporting it as inert.
