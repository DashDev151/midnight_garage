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
| **Specialty** | The horizontal axis (redefined, fourth amendment): standing within a buyer scene (collector, tuner, show crowd, racer, daily drivers, touge), earned by matched deliveries to it, expressed as clientele behaviour and craft operations. Code: `sceneStanding` / `sceneLedger`. |
| **Tool line / tool tier** | One always-owned, named tool ladder per component group, tiers 1-3. Never "equipment ownership". |
| **Craft operation** | A named, real-world act performed on a car (e.g. corner weighting) that a scene's Shop-stage standing, plus tier 3 of the tool line it uses, unlocks. Additive capability; never a stat, a rate, a cost or an access change. Code: `economy.machining.operations`' scene-scoped entries. |

**Banned vocabulary** in design docs, code identifiers, and player-facing copy: XP, skill points,
levels/leveling (of the player), mastery meter, prestige, renown, perk, talent tree. (The code
name `reputationTier` predates this and stays; do not rename code symbols to chase vocabulary.)

## The four pillars (and the only things each may gate)

| Pillar | Gates (allowed) | May NEVER gate |
|---|---|---|
| **Reputation** (vertical) | BREADTH: auction tiers, job reputation-tiers, clientele quality, facility expansion, tool-tier purchases (tiers 2/3 only, alongside cash - Sprint 43 amendment, 2026-07-13) | which disciplines you can work in; anything speed-related |
| **Specialty** (horizontal) | DEPTH: which scene's clientele walks in more often (word of mouth), scene commissions, craft operations, and how well a delivered car is finished | repair speed; repair cost; whether basic work is possible; how much a car sells for |
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
   keep a ledger of their own record. It is a pull-not-push page the player chooses to open.
   Everywhere else stays diegetic - offer mix, walk-ins, and copy do the ambient work, and no
   number leaks onto a gameplay screen. The dev console remains a separate, unrelated debug
   surface.

   **Second amendment (Sprint 69, 2026-07-15, maintainer-approved).** Sprint 62's amendment
   permitted exact numbers on that screen but explicitly kept "no bar, no percentage". The
   maintainer, having actually used the prose version, asked for exactly bars: *"Make the mastery
   progress bars. Like 19/120 to next level. Same with Rep."* **That one Standing screen may now
   use progress bars against named thresholds.** The rest of the law is untouched and still binds
   everywhere it already bound: the ban is on AMBIENT progression - nothing follows the player
   around, nothing pops up mid-job, nothing renders on a gameplay screen. A bar on a page you
   opened on purpose is not ambient; it is a shop owner reading their own ledger, which is exactly
   the fiction Law 4 protects. "No percentage" survives as written - the bars read `19 / 120`, real
   points against a real named threshold, never a percent (guard-asserted in
   `StandingScreen.test.ts`). Banned vocabulary (xp/mastery/level/prestige) is untouched: the
   maintainer's word "mastery" is their shorthand, and shipped copy still says
   *specialty*/*discipline*.

   **Third amendment (Sprint 157, 2026-08-01, maintainer-approved).** Sprint 62's amendment granted
   exactly ONE pull-not-push screen; there are now two. **A single dedicated weekly cost sheet may
   show the shop's own money in real yen** - money in, on cars, parts on the shelf, running the
   shop, into the shop, and the net, one sheet per week. The amendment's own justification carries
   it: *a shop owner CAN keep a ledger of their own record.* A weekly cost sheet is a MORE literal
   1995 artefact than the reputation bar Sprint 62 allowed: shops kept them, on paper, on a
   clipboard by the door. The Standing screen's "ledger" is a metaphor; this one is not, and Law 4's
   litmus (*could a 1995 shop owner perceive this signal in the real world?*) passes without
   argument. Everything else is untouched and still binds: the sheet never auto-opens, never
   renders on a gameplay screen, never follows the player around (which rules out `DayCashBox.vue`,
   mounted at the app root), shows no percentage, and offers no trend, chart or advice. It reports
   what happened and never tells the player they are spending too much on anything, because that
   would be both a judgement instrument and a push.
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
- **Specialist vs generalist:** emergent, via opportunity cost. Both are valid; neither is
  punished. *(The shop title's soft bias, named here originally, is retired: see below.)*
- ~~**Specialty earns from work performed**~~ **RETIRED by the fourth amendment (2026-08-05).**
  Standing is earned by a matched delivery to a scene, which is a sale, so the old
  "sales must NOT feed specialty" rule is inverted rather than narrowed. The TODO entry it parked
  its open question in is closed by that amendment.
- ~~**Techniques are access only.**~~ **RETIRED by the fourth amendment.** Techniques are gone; a
  craft operation deliberately DOES write quality onto the car, which is the whole of what the
  horizontal axis now buys.
- ~~**The shop title is derived, never stored ceremony.**~~ **RETIRED OUTRIGHT (maintainer,
  2026-08-05): dropped entirely, with no replacement and none wanted.** The old title derived a
  name from your strongest component group ("the engine house", "the chassis works"). The
  maintainer's ruling when offered a scene-keyed successor: *the title does not change ever,
  carried by the standing screen alone, for now.* The shop's identity is what the Standing screen
  shows, and nothing names it on the wall. **This closes the open question the fourth amendment
  left**; do not re-propose a title.

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
- 2026-07-15: **Law 4 amended a SECOND time** (Sprint 69, playtest 2026-07-15 item 24,
  maintainer-approved). Sprint 62's amendment above allowed exact numbers on the Standing screen
  but explicitly kept "no bar, no percentage". The maintainer, having now actually used that
  screen, asked for exactly bars: *"Make the mastery progress bars. Like 19/120 to next level.
  Same with Rep."* The one Standing screen may now use progress bars against named thresholds.
  Nothing else moves: the ban is on AMBIENT progression, and a bar on a page the player opened on
  purpose is not ambient. "No percentage" survives literally - the bars read `19 / 120`, real
  points against a real named threshold, guard-asserted (`StandingScreen.test.ts` fails on a `%`
  reaching the screen). Implemented as a shared `ProgressBar.vue` used only here: one bar for
  reputation against the next tier's threshold, one per discipline against its technique
  threshold. At `legend` the bar reads FULL rather than empty - an empty rail at the top of a
  ladder reads as failure, which is the opposite of the truth. Banned vocabulary untouched: the
  maintainer's word "mastery" is shorthand, and shipped copy still says specialty/discipline.
- 2026-08-01: **Law 4 amended a THIRD time** (Sprint 157, maintainer-approved). Sprint 62's
  amendment granted exactly one pull-not-push screen and `StandingScreen.vue` was it; the weekly
  cost sheet is the second. The maintainer's ruling that created it: *"Machine-shop hire is NOT a
  per car fee... same with rent and bays and staff costs. These are running costs. They accrue and
  should be shown on a overarching, maybe weekly, financial summary, but they are not attributed to
  a specific car. listing fees are however."* The amendment's own justification carries the screen:
  a shop owner CAN keep a ledger of their own record, and a weekly cost sheet is a MORE literal
  1995 artefact than a reputation bar - shops kept them on paper, and unlike the Standing screen's
  metaphorical "ledger" this one is the real thing. Implemented as `CostSheetScreen.vue` at
  `/costs` over the store's `costSheetView` (pure derivation over `GameState.financeLedger`, no
  state of its own), reached from its own nav entry. Every other clause of Law 4 binds unchanged
  and is guarded in `CostSheetScreen.test.ts`: no auto-open, no gameplay screen, nothing that
  follows the player around, no percentage, no trend or advice. The sheet's completeness is a test
  rather than a claim - `financeLedger.test.ts` asserts, per week and to the yen, that money in
  less everything out equals what the shop's cash actually did.
- 2026-07-15: **Sprint 69 also recorded a CANCELLATION, not an amendment.** An earlier draft of
  that sprint proposed folding the Standing screen into `UpgradesScreen` (reasoning: progression
  belongs where it is gated). The maintainer overruled it after using the screen - *"The standing
  page is fine, don't move it to upgrades."* It stays at `/standing` with its own nav entry.
  Recorded here so no future sprint re-litigates a decision already made by the person using it.
- 2026-08-05: **The horizontal axis is redefined (fourth amendment, the scene-standing arc,
  Sprints 175-181, design of record `docs/design/systems/scene-standing-refactor.md`).** The old
  Specialty - a point track keyed on the six component groups, earned from service-job work,
  spending as an offer-selection bias, an in-lane payout premium and a derived shop title - is
  deleted outright, not migrated (directive 19: there were no players and no old saves to protect).
  Five points, spending the approval this arc asked for:
  - **Specialty is now standing within a buyer scene** (collector, tuner, show crowd, racer, daily
    drivers, touge), earned by a matched delivery to it - a sale at or above that buyer's own taste,
    or a completed scene commission. Expressed as clientele behaviour (word of mouth raises a
    scene's draw weight across every selling channel; standing raises that scene's own taste band)
    and as craft operations, never as a number the player is shown. The vocabulary table's
    `Specialty`/`Craft operation` rows above are current; `Technique` and `Shop title` are retired
    along with the mechanism, not renamed - the shop-title feature is gone with no replacement built
    in this arc, an open question for whoever next wants a scene-keyed name on the wall.
  - **Result quality is specialty's domain, restated precisely.** Rate, cost and access remain
    forbidden to it - not how fast, not how cheap, not whether - only how well: a craft operation
    writes real state onto the car (power/handling/style past catalogue, reliability past its
    condition band, reduced authenticity cost), and that state is what a buyer or a taste-matched
    channel pays for.
  - **Value never reads performance, now stated at the precision the refactor needed:** value never
    reads *stats* at all; stats route through taste only. `marketValueYen` stayed exactly as stat-
    blind through this arc as it was before it - the six laws' Litmus 3 ("no reward double-dips")
    is what the old in-lane premium violated by letting specialty pay the seller directly, which is
    exactly the design flaw this arc closed.
  - **Nothing basic is ever locked, unchanged.** Every craft operation is additive capability - nothing
    existing is gated behind one, and a shop with no scene standing anywhere still does every ordinary
    job the game has.
  - **Banned vocabulary, unchanged and complied with.** The system says scene, standing, stage, deed,
    ledger, operation; none of the words this bible already bans, and none of the retired terms
    (specialty-as-component-group, technique, shop title), appear in the surviving design, code or
    copy.
  The six craft operations survive the teardown by name where the old techniques already named the
  same craft (`blueprint-building`, `corner-weighting`, `show-fitment`); the other three retired
  techniques (`dog-box-conversion`, `one-off-fabrication`, `bespoke-trim`) had no scene-operation
  successor authored for them in the arc's six, so their own signature service-job templates
  (`dog-box-conversion-job`, `one-off-widebody`, `bespoke-cabin-build`) are deleted with them rather
  than left ungated - an ungated tier-4 signature job would have been a silent value change directive
  22 does not permit, and a permanently unreachable one would have been exactly the "quietly keeps
  working/quietly keeps failing" fragment the teardown exists to avoid.
- 2026-08-05: **What EARNS reputation is redefined (fifth amendment, maintainer-approved,
  implemented `docs/sprints/sprint184.md`).** The vertical axis keeps every gate it already has;
  only the earning changes. It previously read the car's condition bands at the moment of sale
  (a lemon predicate, a clean bonus, a concours bonus), plus a flat matched bonus, plus service
  jobs and missions. **No stat and no condition predicate feeds reputation any longer.** Five
  points:
  - **Reputation reads the buyer's own verdict on the car they were sold, and nothing else.** Two
    rungs: **Satisfied**, the buyer's champion stat cleared, and **Delighted**, every stat that
    buyer cares about cleared. Selling a rough show car to the Show Crowd is honest work and pays,
    because their reliability importance is exactly 0 and they never asked; selling the same car to
    a Daily Driver pays nothing, because reliability is the only thing they came for. That is the
    whole rule.
  - **Authenticity is out, and concours with it.** Concours was the game's only +4 and required 85
    per cent authenticity, which **no built car can reach** (an aftermarket block alone costs 18 of
    the 100 points). A tuner, show or racing shop was structurally capped at the +2 rate however
    good its work was. Satisfied and Delighted are reachable by every play style, which is the
    point.
  - **Reputation only ever rises.** A disappointed buyer pays nothing; they never take anything
    away. This strengthens law 6 (no decay, no upkeep treadmill) rather than bending it, and it
    retires the lemon penalty along with the lemon predicate.
  - **Sales are rebalanced against service jobs.** A clean sale currently pays 2 while a tier-4
    service job with a race part pays up to 75, so the reputation ladder is a service business that
    happens to gate a car business. **A good car sale must out-earn a standard service job.** The
    specific values are listed in the sprint doc under directive 22.
  - **Law 3 is not violated, and this is the argument.** Reputation and scene standing now read
    overlapping INPUTS (both look at the finished car against its buyer) but grant different
    REWARDS, which is what law 3 actually forbids: reputation buys **breadth** (auction rooms, tool
    tiers, bays, job tiers, and the campaign calendar itself), standing buys **quality of demand**
    (who walks in, that scene's taste band, commissions, craft operations). Neither pays the other's
    currency.

  **The rejected alternative is recorded so it is not re-proposed: reputation must NOT read the
  work performed.** It was the more attractive design on its face (reputation as craftsmanship,
  standing as fit) and it does not survive measurement. Condition multiplies style, reliability and
  authenticity, so **restoring a car IS how its taste score rises**: across 400 generated cars, 94
  per cent matched at least one scene untouched and 100 per cent matched after nothing but a
  restoration to mint, with the average car going from 3.89 to 5.15 scenes of six. "Did the work"
  and "made it fit" are the same action, so a reputation that read work would be scene standing
  measured a second time under another name, which is precisely the double-dip law 3 exists to
  stop.
