# The Progression Bible

*Canonical rules for all progression design in Midnight Garage. Locked with the maintainer
2026-07-12 during the Progression Rework arc. Every sprint, feature, or tuning change that touches
progression MUST be checked against this document before implementation. Deviating from it is a
bug, not a creative choice. Amendments require explicit maintainer approval recorded here with a
date. No em dashes anywhere in this file or anything derived from it (CLAUDE.md directive 15).*

## The fantasy is the spec

1995. You are nobody with a rusty trolley jack in a rented lockup. By endgame you are the shop the
scene whispers about. **Progression is the world's changing opinion of you, made tangible.**
Every mechanic is judged against that sentence. Anything that does not express it (XP bars,
ability points, level-up ceremonies) is out, no matter how standard it is in the genre.

## Vocabulary (use these words, never the banned ones)

| Term | Meaning |
|---|---|
| **Reputation** | The vertical axis: general standing. The existing 5-tier ladder (unknown, local, known, respected, legend) and its points. Code: `reputationTier` / `reputationPoints`. |
| **Specialty** | The horizontal axis: per-discipline word of mouth, keyed by the six component groups (engine, drivetrain, suspension, wheels, body, interior). Code: `specialty`. |
| **Tool line / tool tier** | One always-owned, named tool ladder per component group, tiers 1-3. Never "equipment ownership". |
| **Technique** | A named, real-world craft unlocked by specialty (e.g. corner weighting). Access, never a stat. |
| **Shop title** | The derived name your shop earns when one specialty leads above threshold ("the engine house"). |

**Banned vocabulary** in design docs, code identifiers, and player-facing copy: XP, skill points,
levels/leveling (of the player), mastery meter, prestige, renown, perk, talent tree. (The code
name `reputationTier` predates this and stays; do not rename code symbols to chase vocabulary.)

## The four pillars (and the only things each may gate)

| Pillar | Gates (allowed) | May NEVER gate |
|---|---|---|
| **Reputation** (vertical) | BREADTH: auction tiers, job reputation-tiers, clientele quality, facility expansion, tool-tier purchases (tiers 2/3 only, alongside cash - Sprint 43 amendment, 2026-07-13) | which disciplines you can work in; anything speed-related |
| **Specialty** (horizontal) | DEPTH: specialty offer mix, in-lane premium pay, techniques, shop title | repair speed; repair cost; whether basic work is possible |
| **Cash** | Capability purchases (tool tiers, bays, staff), parts, cars | reputation or specialty directly (money never buys standing) |
| **Capability** (tools, bays, staff) | THROUGHPUT: labor efficiency, parallelism; CEILINGS: involved/fabrication work | offer quality or pay rates (that is specialty's job) |

## The six laws

1. **Nothing basic is ever locked.** Tier 1 of every tool line is owned from day one. Basic work
   in every discipline is always possible, just slow. Involved work is gated by tool tier along
   the bolt-on vs built line. *Litmus: if a player can be SHOWN work they cannot possibly start,
   the design is wrong; if a whole discipline is inaccessible, the design is wrong.*
2. **Early difficulty is scarcity, not walls.** Labor and cash are tight; access is not. *Litmus:
   any new gate must answer "why is this not just expensive or slow instead?"*
3. **No reward double-dips.** Tools buy speed and ceilings. Specialty buys quality of demand and
   access. Reputation buys breadth. Cash buys capability. *Litmus: if two pillars grant the same
   kind of reward, one of them is fake and must be cut.*
4. **Progression is revealed diegetically.** Who walks in, what they bring, what they say, what
   shows up at auction. No AMBIENT meters, no bars, no toasts, no jingles, no floating numbers on
   any gameplay screen. *Litmus: could a 1995 shop owner perceive this signal in the real world?
   If not, it does not render.* **Amendment (Sprint 62, 2026-07-14, maintainer-approved):** the
   one exception is a single dedicated "Your standing" screen (the shop's own record on the wall),
   reachable on demand, which MAY show exact reputation and specialty points and the named next
   threshold - the player asked for a place to see their granular standing, and a shop owner CAN
   keep a ledger of their own record. This is not a meter (no bar, no percentage, no live overlay,
   no toast); it is a static, pull-not-push page the player chooses to open. Everywhere else stays
   diegetic - offer mix, walk-ins, and copy do the ambient work, and no number leaks onto a
   gameplay screen. The dev console remains a separate, unrelated debug surface.
5. **Every unlock is a named, real thing** from the era and the culture (corner weighting,
   blueprinting, NA-to-turbo conversion), with parody brands only. *Litmus: if an unlock needs a
   made-up fantasy name or a number ("Repair II"), it is not grounded enough to ship.*
6. **No decay, no upkeep treadmill.** Standing never erodes with time; nothing happens while the
   browser is closed. Specialization pressure comes from opportunity cost, never punishment.
   *Litmus: if a system asks the player to maintain a number to avoid loss, it is out.*

## Standing decisions (maintainer-locked, 2026-07-12)

- **The capability ceiling line is bolt-on vs built.** You can swap a turbo on an already-boosted
  car with hand tools; you cannot convert an NA engine or build a bottom end without machine
  tooling (tier 3).
- **Payouts price worst-case tooling.** Customers pay the standard rate derived at tier-1 labor;
  better tools finish faster and the freed labor is the upgrade's payoff. Never fork pricing by
  tier.
- **Tools gate on cash AND reputation (amended 2026-07-13, Sprint 43 maintainer decision).**
  Originally: "tools have no reputation gates, upgrade prices are the only gate on capability."
  The maintainer overturned that for tiers 2 and 3 specifically (tier 1 stays free and ungated,
  per law 1): a tool-tier purchase now mirrors the facilities gate exactly (`minReputationTier`
  alongside `upgradePriceYen`), the same coarse-banding pattern bays already used. The original
  cash-only rationale is kept here as history, not as the current rule.
- **Specialist vs generalist:** emergent, via opportunity cost and the shop title's soft bias.
  Both are valid; neither is punished.
- **Specialty earns from work performed** (service jobs in v1; sale attribution is an open design
  question parked in TODO.md, and until the game can attribute a sale to the disciplines the
  player actually improved, sales must NOT feed specialty).
- **Techniques are access only.** No technique may modify speed, cost, or quality math.
- **The shop title is derived, never stored ceremony.** It can shift when another line overtakes.

## Anti-patterns (each of these has already burned us once)

- Binary ownership gates on capability (the pre-rework equipment system; caused the day-one
  dead zone and the shown-but-undoable job bug class).
- Offer filters that check reachability instead of designs that make everything shown honest
  (Sprint 33's filter needed a bug fix on top of a bug fix; the rework made it unnecessary).
- Parallel systems standing next to an existing one that already covers the concern (Sprint 08).
- A second place pricing the same fact (the Sprint 34 value-model double-count; law 3 is its
  progression twin).
- Authored numbers where derived ones belong (payouts are derived; content curves are tunable
  inputs, not outputs).

## Amendment log

- 2026-07-12: v1 locked (Progression Rework arc, maintainer + Claude). Naming: vertical axis
  stays "Reputation"; horizontal axis named "Specialty" (replacing the working names "prestige"
  and "renown", both now banned).
- 2026-07-14: Law 4 amended (Sprint 62, playtest pass-2 item 17, maintainer-approved). A single
  dedicated, pull-not-push "Your standing" screen may display exact reputation and specialty
  points plus the named next threshold; the ban on ambient meters/bars/toasts/floating numbers on
  gameplay screens is otherwise unchanged. The maintainer asked for one place to see the granular
  standing every job builds; a shop keeping its own ledger is diegetically sound. Implemented as
  `StandingScreen.vue` over the store's `standingView` (pure derivation, no new state); reached
  from the garage-header reputation line and the jobs-screen rep figure. Banned vocabulary
  untouched - the copy says "standing", "specialty", "discipline", never "mastery"/"XP"/"level".
