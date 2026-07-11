# TODO

Deliberately deferred items that are **not** tied to any specific future sprint number, so they
won't surface again just by reading `docs/sprints/sprintXX.md` in order. Check this file
separately when planning a new sprint. (Deferrals that already have a sprint number attached live
in their sprint docs instead and aren't duplicated here.)

**This file holds only what's still open.** Once an item is fully resolved, it's removed outright —
the sprint doc (`docs/sprints/sprintNN.md`) or the commit that picked it up is the permanent
historical record; this file doesn't re-narrate it. (Last full pass: 2026-07-11, after the
foundational-economy arc — Sprints 20-24 — landed; see `git log` for every sprint's commit hash.)

## Next playtest checklist

The maintainer's next real `pnpm dev` session — nothing here has ever been checked in a browser.
Consolidates every standing "verify this UI in person" item (Sprints 12/13/14) with Sprint 24's own
Human Validation section, so there's one list to work through instead of several scattered ones:

- [ ] **Components list** (`CarDetailScreen.vue`) — the 8-row Repair/Replace layout, restructured in
  Sprint 24 into a name+bar+percent line with buttons/hints on their own line below it. Never
  visually confirmed, in either the original Sprint 12 layout or the Sprint 24 restructure.
- [ ] **Equipment UI** — Upgrades tab's buy flow, `CarDetailScreen`'s disabled-repair + "needs
  `<equipment>`" hint, `ServiceJobsScreen`'s disabled-accept + hint for repair-kind offers.
- [ ] **Cart/checkout/delivery flow** (`PartsMarketScreen.vue`) — does the cart actually feel like a
  misclick safeguard, is "On order" (pending standard-delivery parts) discoverable, does
  checkout-disabled-when-unaffordable read clearly.
- [ ] **Drag-and-drop hover highlight** (Sprint 24 hotfix) — only the bay/slot actually under the
  pointer should highlight teal during a live drag now, not every valid target at once. Confirm it
  feels right, not just that it's technically correct.
- [ ] **Full economy loop**: win an auction war (get outbid overnight, then hammer), lose one on
  purpose, buy one out, inspect a risky lot and walk away, discover an issue on a blind buy, fix it,
  clean-sale and concours-sale a car, flood one model's market, feel rent.
- [ ] **Export the session log** (`SaveMenu.vue` → "Export session log") from the session — the
  first real artifact for the recorded-play idea below.
- [ ] Triage afterward: whatever breaks or feels off becomes the next sprint's input, same as every
  playtest before this one.

## Standing concerns

Not single tasks — revisit when related work comes up, don't treat either as resolved by "checks
pass."

- [ ] **Whether the balance harness (bots + invariants) actually reflects real gameplay is still an
  open doubt**, restated increasingly sharply since 2026-07-08: bots may behave consistently with
  each other without resembling how a real player plays. Sprint 23's fresh harness run sharpened
  this further — every active strategy underperforms a do-nothing baseline at day 100 under current
  mechanics (see `tools/balance/src/balance/invariants.py`'s module docstring for the numbers) — a
  genuine finding about the economy's pacing/cost curve, not yet resolved. "N invariants pass" is
  evidence the mechanism works, never evidence the game is fun or the bots are realistic.
- [ ] **Recorded-play idea** (user-proposed 2026-07-09): parse real play sessions into per-archetype
  statistical rulesets — rates and biases ("bids X% below book," "does these repairs, buys that
  part"), not literal replay, and **phase-aware** (a career can drift mid-run; today's bots don't).
  Capture infrastructure (v0) shipped in Sprint 24 — a Dexie `sessionEvents` table, a `gameStore.ts`
  hook on every player action, a JSON export button — but it's capture only. Still unscoped: how
  many real sessions before a derived rate is trustworthy, how phase-drift gets detected/encoded,
  and how a derived ruleset plugs into the existing `(state, context) => DayActions` bot shape.
  Blocked on there being real play data to parse — the next playtest (above) is the first session
  this can actually capture.

## Open engineering

- [ ] Split `gameStore` into domain stores (`useGarageStore` / `useAuctionStore` / `useStaffStore`
  behind the current surface) once staff/events land — it's a fine façade now, but trending toward a
  god-store.

## Open balance/economy questions

- [ ] **Invariant #6 (first-timer resale speed)** — "first-timer buyers keep sub-¥500k Commons
  sellable within 7 days at book value or better" has no bot modeling first-timer-specific selling
  behavior; `competentPolicyStrategy` (Sprint 23) sells via the generic clean/concours faucet, not
  this. Needs a purpose-built bot or harness variant if this specific invariant is ever wanted.
- [ ] Forced-loan interest rate and repayment cadence (GDD 6.6 says "painful," doesn't specify how
  painful) — open question for the spreadsheet pass.
- [ ] Parts pricing curve per grade (Stock/Street/Sport/Race) relative to car book value — open
  question for the spreadsheet pass.

## Planned systems (designed, not yet scheduled)

- [ ] **Skill / XP progression** — learn-by-doing growth for staff *and* the player character; skill
  *optimizes* (efficiency/quality), never *unlocks* tiers (tools + rep do that). Staff skill lands
  with the staff system, still unscheduled; player-character skill is new v1.0 scope, slotted
  against the service-jobs feature. Full design: `docs/design/skill-progression.md`.

## Design decisions awaiting maintainer direction

- [ ] **Naming Layer parody-flag default is undecided.** GDD explicitly defers whether the game
  ships with real brand names or parody names by default to closer to release. Revisit once a
  release date is in sight.
- [ ] **The recurring cast (landlord, bazaar auntie, the Rival) has no actual character design** —
  GDD only ever gives roles, never names. Needs real character design (names, personality, at
  minimum) — the maintainer's call on direction and timing, not something to invent unprompted.
- [ ] **Hall of Legends acquisition cadence isn't specified.** GDD names it the explicit v1.0 win
  condition (10 Legend cars, Enshrine mechanic) but only 1 of 10 ever had an acquisition trigger
  written down, and acquisition order across all 10 is explicitly undecided
  (`midnight-garage-roster.md`). Direction given: surface Legend-acquisition chances at regular
  intervals across a run (Blacklist/NFS-Most-Wanted style "always chasing the next car," not an
  endgame dump), gated by some combination of rep/skill/staff/money — but which combination gates
  each of the 10, and the actual story-lead writing/delivery, are still undesigned. Depends on the
  cast character-design item above for who delivers the leads.
- [ ] Real main/pause menu (Continue / Settings / New Game / Load Game) — explicitly lower priority
  ("at some stage").
- [ ] Salvage & restore parts mechanic — maintainer said they'll expand on this separately; parked
  until that expansion exists, don't design it unprompted.

## User-only tasks (air-gapped / purchases / accounts / legal)

- [ ] Buy Aseprite; (optional, whenever convenient) draw a real car sprite to replace the
  programmatic placeholder from the Sprint 00 art spike.
- [ ] Trademark search on the final title ("Midnight Garage" vs. alternates in the GDD); register a
  domain if the search comes back clean.
