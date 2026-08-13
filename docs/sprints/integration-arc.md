# Integration arc: the live orchestration board

**Status: LIVE. This is the working board for integrating the economy overhaul, the cast, and
the narrative arc into the vertical slice.** It supersedes `economy-overhaul-arc.md` as a plan
(that document already marked itself superseded; its code-verification section remains the
factual record and is cited below as "the verification"). The documents of record are:

1. `docs/reviews/economy-overhaul-brief.md` (936-line revision): decisions D1-D17, workstreams
   A-H, identity in the one system.
2. `docs/design/narrative/ran-when-parked-cast.md`: the locked cast.
3. `docs/design/narrative/ran-when-parked-narrative.md`: the Hall of Legends arc.

Phase ordering is locked: instruments, bench, economy arc (one signed change under envelopes),
cast wiring, narrative slice. Drive mode stays in its standalone container throughout
(`drive_mode_unintegrated/` at repo root; first touchpoint is the post-repair verification
drive, after the slice).

Directive 22 is in force for the whole of Phase 1: nothing here moves a value. The envelope
governance model (D18) applies only after the maintainer ratifies the directive amendment
(gate G-D18 below); until then classic per-lever sign-off applies everywhere.

---

## Findings that shaped this board (verified against the code, 2026-08-13)

- **Session recording already exists.** Sprint 24's session log captures every player action
  day-stamped (49 call sites in `gameStore.ts`, refused actions excluded), persisted to the
  `sessionEvents` Dexie table, with an export in `SaveMenu.vue`. No session has ever been
  captured. The golden careers can therefore be RECORDED from real play, not hand-invented;
  the missing piece is a replay interpreter, not a recorder.
- **The replay surface is wider than `DayActions`.** `DayActions` (12 action arrays,
  zod-serialisable today) is the bot surface; many player actions are instant resolvers
  called between days. The golden-master test in `advanceDay.test.ts` already established
  the correct pattern: instant resolvers between days, `DayActions` within a day, pinned by
  `hashState`. The harness generalises that pattern; it does not invent one.
- **The per-day aggregator derives, it does not add.** `cashMovementFor`
  (`packages/content/src/cashLedger.ts`) is the single exhaustive classification law over
  `DayLogEntry`. The weekly 5-bucket sheet and the daily 3-bucket report both derive from it.
  The harness derives per-day per-category flow from the same function over each `DayLog`;
  a third mapping is banned. Correctness check: the flow table reconciles to the weekly
  `financeLedger` to the yen.
- **The bench rebuild (Phase 2) is mostly shipped.** Generator spawn, the work log, the
  buyer panel, and the as-you-type preview all landed by commit `0018bda`; the
  identical-figures and duplicate-formula guards are green. Phase 2 shrinks to shop-state
  presets plus progressive disclosure, and no longer needs a full sprint's width.
- **Reusable salvage from the condemned harness.** The policy bots stay condemned
  (directive 21). The `CareerSnapshot` per-day types in `bots/runCareer.ts`, the CLI build
  pattern (`tsconfig.cli.json` plus fixups), and the manifest convention are sound
  infrastructure and are reused. The Python `tools/balance` package is proposed for
  archival once the new report exists (gate G4).
- **Narrative and cast documents are clean.** No conflicts with D13-D17, section 9.10,
  section 10, or repo law. Nothing in them touches Phase 1. One stale citation (cast sheet
  credits Gonda to the superseded Workstream I) is batched into the errata gate (G-ERRATA).
- **Chapter one's dependencies confirm the phase order.** It needs cast wiring (Gonda,
  Yuki as personas and commission voices) and the 9.6 doubt-follows-the-car behaviour from
  Phase 3; the arc's own shippability clause means it never waits on late chapters.

---

## Phase 1: instruments (sprints 198-200)

Read-only with respect to the economy: no lever moves, no game-visible change. Each sprint
gets its own `sprintNN.md` with the directive-16 reuse analysis before implementation
starts; the reuse skeletons below seed those docs.

### Sprint 198: career replay machinery (Workstream A1; brief 4.A tasks 1, 3, 4, 5)

Reuse: `advanceDay` contract and the golden-master driver pattern (`advanceDay.test.ts`),
`hashState` for checkpoints, `DayActionsSchema` for serialisation, `cashMovementFor` for
classification, `financeLedger` for reconciliation, `CareerSnapshot` types, the CLI build
pattern, the Sprint 24 session log and its `SaveMenu.vue` export.
New: the career-script format, the replay interpreter, the per-day aggregator, the report.

| id | task | verification | gate |
| --- | --- | --- | --- |
| 198.1 | Career-script format: zod schema for an ordered list of days, each carrying instant-resolver invocations, a `DayActions` payload, and optional expected-state checkpoints (`hashState` or named fields) | schema round-trips the smoke script | auto |
| 198.2 | Replay runner in `packages/sim`: pure, deterministic, instant resolvers between days per the golden-master pattern | same script + same seed reproduces the same `hashState` sequence | auto |
| 198.3 | Session-log converter: typed mapping from `sessionEvents` types to script entries, covering the event types a first-week session uses; unmapped types fail loudly, never silently skip | unit test over a synthetic session-event fixture | auto |
| 198.4 | Per-day sources-and-sinks aggregator over the returned `DayLog` stream via `cashMovementFor` | flow table reconciles to the weekly `financeLedger` to the yen on the smoke career | auto |
| 198.5 | Report command (`pnpm career:report`): per career, cash curve, labour utilisation, standing curve per day, faucet/sink table per week; one page, curves not endpoints; output generated on demand and NOT committed (a committed report goes stale, which is the exact failure the old harness died of) | report renders from the smoke career; maintainer eyeballs the format once | sign-off (format only) |
| 198.6 | Smoke script: a throwaway synthetic career whose only job is to exercise the runner; labelled synthetic in the file header, never used as a baseline | replay green | auto |
| 198.7 | Verify the session-log export path end to end (the brief notes an open TODO that no session was ever captured); fix export gaps if found | an exported log from a dev session parses through 198.3 | auto |
| 198.8 | ABSORBED INTO SPRINT 202 (task C3): payload enrichment, the daily ledger stream, hire logging, session-table reset | see `sprint202.md` | moved |

Real fixtures exist: `docs/playtest-notes/sessions/2026-08-13-day1-half-tutorial.json` and
`2026-08-13-day4-open-play.json` (a full 4-day open-play career, events 41-215; G1 is
substantially delivered by it). The export pipeline is proven end to end. Sprint 202
replaces the staging event vocabulary with direct-action events; the converter treats the
archived logs' `stageAction`/`confirmCarWork` vocabulary as historical.

### Sprint 199: the lever census (Workstream F steps 1-2; runs parallel to 198, no file overlap)

Reuse: `EconomyConfig` typed access (`context.economy.<key>` is the greppable seam), the
`economyApprovalGate.test.ts` header changelog as lever provenance, the verification's known
dead candidates (`fearPremium` references in `tools/balance`, `computeDonorBalanceProbe`).
New: a committed trace tool (TypeScript compiler API, already in the stack, no new
dependencies) so "is this lever dead" stays answerable permanently.

| id | task | verification | gate |
| --- | --- | --- | --- |
| 199.1 | Trace tool: map every leaf in `economy.json` (1,053) and `partPricing.json` (51) to its consumer function(s); flag unread leaves and shadow candidates | tool emits the full table; leaf count matches the mechanical count | auto |
| 199.2 | Classification pass: per leaf, the consumer, the player decision it serves or "none", the wiggle-test verdict, the tier (anchor / texture / dead / shadow-of-X) | every row classified; contested rows batched | orchestrator judgement, contested rows to maintainer |
| 199.3 | One-page summary plus the draft kill list and tier assignments | summary states the surviving anchor count; target "dozens, not hundreds" | **G2: maintainer sign-off** (a deletion is a lever change, D7) |

### Sprint 200: golden careers and the baseline (Workstream A2; blocked on G1)

| id | task | verification | gate |
| --- | --- | --- | --- |
| 200.1 | Convert the maintainer's exported session into the first golden career (the first-week arc); extend converter coverage to whatever event types the real session used | replay reproduces the session's end-state checkpoints | auto |
| 200.2 | Baseline report of the CURRENT economy from the golden career(s) | report generated; reconciliation green | auto |
| 200.3 | Disclosure set: record the observed curve bands as DISCLOSED values; no hard gates until the maintainer signs specific curve properties (brief A.5, the Sprint 69 lesson) | disclosed bands listed in the report | auto |

### Sprint 201: make play possible (gates G1; findings of 2026-08-13, first playtest attempt)

**Re-scoped by maintainer ruling 2026-08-13; full doc `sprint201.md`.** The 2026-08-13
half-tutorial session (`docs/playtest-notes/playtest-notes-2026-08-13.md`) ended on
playability, and the maintainer's diagnosis went deeper than the original bug list: the
garage exists twice (the Garage screen and the overworld's static-image garage interior),
which is directive 16's parallel-system failure in the UI layer, and the tutorial keeps
breaking because it pins UI that is still moving. The sprint is now:

| id | task | source |
| --- | --- | --- |
| 201.A | Tutorial off: new game is open play from day 1 (verified one-call-site change; day-1 board, jobs, and first story mission all survive by construction) | maintainer ruling |
| 201.B | One garage: stations become clickable elements of the Garage screen; `GarageInteriorScreen`, its static room scenes, and the standalone station routes die; unique surfaces rehomed; routing traced and guarded by a routing-integrity test | maintainer ruling; navigation trace (16-interaction repair loop, 6 screens) |
| 201.C | Sell guard on parts, station refusal reasons | findings 2, 3 |

### Phase 1 gates

- **G1 (the one maintainer action, unblocks 200): BLOCKED on Sprint 201.** Play one real
  session, export the session log. The 2026-08-13 attempt ended half way through the
  tutorial on playability bugs; G1 re-opens when 201 lands. Short bug-hunt sessions remain
  valuable meanwhile, and every export is converter fuel.
- **G2:** lever-census kill list and tier assignments, one sitting, yes/no per block.
- **G3 (the Phase 1 exit gate):** the maintainer reads the baseline report of the current
  economy and confirms it matches felt reality closely enough to measure against. Phase 3
  cannot open before G3 passes (D12).
- **G4 (proposal, batched with G2):** archive `tools/balance` (Python) and the bot policy
  layer; the new report replaces the old one; first entries on the kill list.
- **G-D18: RATIFIED EARLY, 2026-08-13.** The maintainer ordered behaviour-first
  governance directly ("you tell me what it means, you choose the number, I playtest
  it"); the amendment is recorded in CLAUDE.md directive 22. No raw number is ever
  presented for ratification again; design-shape changes still need maintainer approval.
- **G-ERRATA (batched, ten minutes):** an errata appendix to the brief recording the five
  verified corrections (Law 1's zero slope on floor-pinned cars, the donor probe fiction,
  rep as the game clock, the weekly-not-daily ledger, the bench panels already shipped),
  plus the cast sheet's stale Workstream I citation. The brief is locked; the appendix is
  additive and needs only acknowledgement.

---

## Later phases (sketch only; each gets its own board when its predecessor's exit gate passes)

- **Phase 2 (bench, shrunk):** shop-state presets plus progressive disclosure across the six
  existing sections; the donor spawn toggle waits for Workstream C. Can run in any gap; it
  is small enough to pair with Phase 1 downtime while blocked on G1.
- **Phase 3 (the economy arc, ONE signed change):** basket inversion (9.9), lemon generation
  (9.1), donor species and scrapyard (Workstream C), law scope amendments, straddle and
  rung-distinctness probes (9.2, 9.3), teardown re-measurement (9.11). Enters as an envelope
  set in felt units after G3 and G-D18. The verification's corrections apply: the law
  surgery is three laws (Law 1 needs the auction scope clause too), the donor generation
  target must be built (not read from `donorBreakEvenBillRatio`), and routes 1-3 each have
  a named bound.
- **Phase 4 (cast wiring, may overlap Phase 3):** personas into buyer pools, faces onto
  `sceneCommissions` and standing messages, guarantor missions gain their characters, the
  Night Nurse as a recurring service-job customer, `wordOfMouthMultiplierByStage` weights
  for racer and touge (D15). Copy tasks have zero dependencies and fill any gap.
- **Phase 5 (narrative slice):** chapter one only, through Gonda and Yuki, gated off the
  existing Local guarantor rung; depends on Phase 4 wiring and Phase 3's 9.6 behaviour.
- **Parallel lane:** drive mode in its container, per the five drive-mode laws (brief 8.3).

## Standing risks this board watches

- **Instrument scope creep:** the harness is for one tired person, one command, one page.
  Any proposed second page, dashboard, or configuration surface is rejected by default.
- **Replay coverage creep:** the converter covers the event types real sessions actually
  use, grown career by career; it never aims for the full 49 up front.
- **Ceremony creep:** every gate above is a batched yes/no with the evidence attached. If a
  gate needs more than ten minutes of maintainer reading, the packet is wrong, not the
  maintainer.
