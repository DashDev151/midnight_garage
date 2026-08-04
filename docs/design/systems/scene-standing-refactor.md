# Scene Standing — the specialty refactor, design of record

**Status: finalised.** Supersedes `docs/design/systems/specialty-redesign.md` (the paused redesign)
and the specialty portions of the progression bible. Requires one bible amendment, specified in
section 10.

**One sentence:** your shop becomes known in buyer scenes, not car parts — and being known changes
who walks in, what they will pay, and what you can build.

---

## 1. The problem this solves

The old specialty system was thin for a structural reason: it was an accumulate-points-hit-thresholds
track keyed on component groups, whose every output lived in the service-job lane. You could be the
best engine builder in the city and it changed nothing about buying a car, fixing it, or selling it —
only which phone calls you got. It also credited points from a mission's hand-written discipline tag
rather than from anything real, which is how the tutorial paid Body points for tyre and engine work.

The root cause was the axis. Specialty keyed on car parts had to invent connections to the core loop.
Specialty keyed on **buyer culture** plugs into machinery the economy already runs: archetypes drive
valuation, channels bias toward archetypes, and the sim already has a formal definition of a matched
sale. It is also the truer model — real shops of the era were known by scene, not by component.

## 2. What is removed

Deleted outright, not migrated:

- The six component-group disciplines (engine, drivetrain, suspension, wheels, body, interior) as a
  standing axis.
- The point track and its 40 / 80 / 120 thresholds.
- Hand-written mission discipline tags, and all crediting derived from them. The tutorial's crediting
  bug dies structurally, not by patch. **The tutorial itself does NOT need rewriting**: it teaches
  take the job, buy a car, diagnose it, fix it, hand it over, and none of that changes. What changes
  is only what the handover credits, and that comes from the customer rather than a tag. Personas
  carry `id`, `name` and `intro` today and need an archetype; Yuki, who wants "anything on four
  wheels that starts every morning" with almost no money, is a Daily Drivers buyer exactly. Three
  data changes, no tutorial copy touched.
- The flat +15 per cent in-discipline payout premium.
- The derived shop title at 80 points (titles now come from stages, section 5).
- Discipline-keyed offer bias (word of mouth replaces it, section 5).
- Techniques as service-job unlocks. The six names survive as craft operations (section 6).
- The **hobbyist** buyer archetype, entirely — not demoted to an unaffiliated pool, deleted. Its
  demand is inherited by Daily Drivers and the broadened Tuner (section 3), and the buyer pool
  weights it held (notably 1.4 in the free ads paper) need a rebalance pass.

## 3. The six scenes

One scene per buyer archetype. Each scene has a champion stat; every derived stat has a home.

| Scene | Replaces | Taste shape (authoring guidance) |
| --- | --- | --- |
| **Daily Drivers** | first-timer | Reliability importance 1.0. Keep the power `upper` — too much car still puts them off. Renamed because "first-timer" is condescending to someone who just wants a good cheap product; these are budget-commuter buyers. |
| **Tuners** | tuner (retuned) | The improve-everything-please crowd. Power importance down from 0.9 to ~0.6; handling, style, reliability importance up. **Authenticity importance stays 0.** The tuner-0 / collector-1.0 authenticity split is the sharpest authored distinction in `buyers.json`; broadening the tuner must not soften it. |
| **Collectors** | collector | Unchanged. Authenticity importance 1.0. |
| **Show Crowd** | stancer | Style importance 1.0. The scene name is broad English; shakotan, kaido racer, VIP, grachan and bōsōzoku styling live in the flavour copy, never in the system vocabulary. |
| **Racers** | racer | Power and handling jointly, **power-biased** (current authoring already is: power 1.0, handling 0.9 — keep). Wangan top-speed culture folds here in flavour. |
| **Touge** | new | Power and handling jointly, **handling-biased**: handling importance 1.0 (target ~0.75), power ~0.6, authenticity 0. Self-descriptor of the era was *hashiriya* ("runners") — nobody called themselves "a touge", you ran the touge — so hashiriya belongs in flavour copy. The scene name stays **Touge**: place-based like Show Crowd, and one of the few Japanese terms the English audience already knows, via Initial D (airing 1998, dead centre of the setting). Needs `buyerPoolWeights` authored into every selling channel. |

**Reserved for future expansion:** drift as a seventh scene. Not in this refactor.

## 4. Earning: the matched delivery

There is exactly **one earn event**: a **matched delivery** to a scene —

- a sale where that buyer's `channelBuyerTaste >= 1.0` at accept time (the sim's existing MATCHED
  definition), or
- a completed commission for that scene (section 5, Respected).

The buyer is the fact. There is no tag to disagree with the work, so the crediting-bug class is gone,
not the instance.

**There is no point track the player ever sees, and that distinction is presentational on purpose.**
Underneath, stage advancement counts: deeds are tallied and compared against thresholds, because
everything is. What changes is what the player is shown and what they can point at. The record of
standing is the **shop ledger**: the actual, readable list of cars delivered, filterable by scene. A
player says "I built those" rather than reading a bar filling up, and that is the whole win, which
the progression bible's pull-not-push law already asks for.

**Implement it as a tally and present it as a history.** Anyone who reads "not a tally" literally and
tries to build thresholdless advancement will stall; the requirement is that no number is ever
surfaced, not that no number exists.

## 5. Stages: what mastery moves

Every scene holds its own taste band toward your shop, starting at the global `[1 - tasteSpread,
1 + tasteSpread]` = **[0.88, 1.12]**. Standing in a scene moves **only that scene's band**; every
other scene prices you exactly as before. All figures below are first-pass and tunable.

| Stage | Earned by (deeds, first-pass) | That scene's band | Also grants |
| --- | --- | --- | --- |
| **Known** | a few matched deliveries | floor 0.88 → **0.92** | Word of mouth: that scene's draw weight is increased across all your channels. |
| **Respected** | a body of matched work | floor → **0.95**, ceiling 1.12 → **1.17** | Scene commissions: better-paying briefs authored on that scene's own stat targets. |
| **The Shop** | a marquee build — a matched delivery over a price bar | ceiling → **1.25**, matched only | The scene's craft operation (section 6). Shop title. |

Rules that keep the band honest:

- **Anything above 1.12 is matched-only.** A raised ceiling is never reachable by a mismatched car.
  Respect is not gullibility: the design's other half — a specialised car is also somebody's WRONG
  car — survives, because the floor rises only partway (to 0.95, never 1.0) and the mismatch gates on
  premium channels are untouched.
- **Mastery ceilings and channel ceilings take the max, never stack.** For that scene's buyers the
  effective ceiling is `max(channelTasteCeiling, sceneStandingCeiling)`. At Respected, your scene
  pays magazine money even off the shop front; at The Shop, it pays past every channel — "I know
  what I'm buying, and I'm not lowballing either."
- **No rival AI.** Nothing about titles is contested by NPC shops. Cut for scope.

## 6. The six craft operations

The payload of The Shop stage, and the survivors of the old techniques by name. Each is an act
performed on your own car that **writes inspectable state onto the car**; the existing stat-blind
valuation (`marketValueYen` reading work, condition, coherence, installed premium) and the taste
system read that state. Money follows the metal, never the seller.

| Scene | Operation | State it writes |
| --- | --- | --- |
| Racers | **Race prep** | Handling and power contributions past catalogue on installed parts, coherence-supported. |
| Touge | **Corner weighting** | The handling-biased twin of race prep — the old suspension technique, finally with a home. |
| Tuners | **Blueprint building** | Machining generalised: power past catalogue at reduced **originality** cost. |
| Show Crowd | **Show fitment** | Style past catalogue. |
| Collectors | **Period-correct restoration** | Repair and machining at reduced **authenticity** cost — spends less of the car's originality, never less money. |
| Daily Drivers | **Sorting** | The car gains a *sorted* state: reliability contribution past what its condition band implies. "A properly sorted car" is exactly what this buyer wants, in the period trade slang. |

Laws the operations obey:

- **No cost or rate discount anywhere in any of them.** An earlier draft's "recommissioning
  (cheap)" was a banned mechanic and is replaced by sorting. Reduced *originality/authenticity* cost
  is car state, not player cost, and is legal.
- **Purely additive capability.** Nothing basic is ever behind an operation; no existing work is
  gated. First law intact.
- **One chassis, six skins.** Implementation-wise these are one operation shape — pick zone, spend
  labour and money, output exceeds catalogue and/or costs the car less originality — parameterised
  per scene. Machining already proves the shape. Solo-project scope depends on this collapse.
- Possessing an operation also makes it available as a service job — the old signature jobs survive
  as the service-lane expression of the same capability, a side effect rather than the payload.
- **To verify before build:** the interaction of sorting and race prep with `repairCeilingForLevel`
  and the derived-stat normalisation, so operations extend the condition-ceiling system rather than
  colliding with it.

## 7. The money laws, restated and untouched

- **Base value reads work and condition, never stats.** `marketValueYen` stays stat-blind: book
  value, mileage, heat, restoration bill, coherence, installed-parts premium ("what was DONE to the
  part, never the power it makes"), machining premium.
- **Stats decide who pays a bit more, and through which channel.** All five stats remain
  taste-only. This is symmetric across performance and style by construction, so "builds exceed the
  catalogue" pays through matched tuners and racers exactly as show fitment pays through the Show
  Crowd — no new performance sink is required.

  **But performance demand is currently broken, and this refactor depends on it.** Taste normalises
  power against `statFormulas.powerNormalizationCeiling`, which is **300 PS**. Racers carry power
  importance 1.0 but **target 0.75**, so a Racer is fully satisfied by **225 PS** and pays nothing
  above it; Tuners saturate at 195. Nine roster cars exceed 225 PS in stock form and a built engine
  clears it twice over. So **Race prep, whose entire payload is power and handling past catalogue,
  sells into a scene that stopped caring three quarters of the way down the range** — the Racers
  scene would ship feeling identical to the Tuners scene from the buyer's side. This is a systems
  fault, not a content one, and it is a prerequisite (section 13, step 0).
- **Mastery earns money in exactly two ways:** (a) better state in the car via operations, credited
  by the existing machinery; (b) that one scene's taste band. **Never a multiplier on the seller.**
  The seller-aura, provenance-as-value, and documentation-as-an-act ideas are rejected (section 11).

## 8. Anti-lock-in

The feedback loop (deliver to a scene → known in it → more of its buyers → deliver more) is the
feature; unguarded, it is also the trap — everyone specialises in Daily Drivers because that is the
early stock, and the standing is dead weight by mid-game. Two guards:

- **Standing never decays.** Your history is your history; stages and operations, once earned, are
  permanent. The Daily Drivers specialist keeps the floor, the band and sorting forever — a
  permanent quick-flip lane while chasing Collector standing.
- **The daily draw follows recent deliveries** (rolling window), on top of the channels' authored
  weights. Pivoting scenes takes effect in days, not a second climb. "Switch or keep reaping" stays
  a live decision through the whole mid-game.

Aiming needs no new mechanism: channels already bias by `buyerPoolWeights` without gating (anyone
can walk into the shop front; a tuner is simply far likelier to read the magazine), and that stays
the deliberate aiming tool.

## 9. Channels

No one-scene-one-channel mapping is required — the weights are the mechanism. Two content items:

- **Touge** needs weights authored into every channel (weekend meet and magazine plausibly warm,
  free ads cold).
- **Collectors** currently have no favoured selling channel anywhere (best weight 1.0 at the shop
  front; 0.15–0.3 at both premium-ceiling channels). Fix by reusing what exists: hang a selling
  channel off the **Collector Network** building — currently a buying-side auction tier only
  (rep-gated members' club, fortnightly, 70 per cent flagship, legends confined by GDD 9.2).
  Consignment through the club: collector-heavy weights, high ceiling, plausibly the same
  fortnightly rhythm. Same place, same gate, same fiction.

## 10. Bible amendment (spend the approval here, once)

- The horizontal axis is redefined: **specialty is standing within buyer scenes, earned by matched
  deliveries, expressed as clientele behaviour and craft operations.**
- **Result quality is specialty's domain.** Rate, cost and access remain forbidden to it: not how
  fast, not how cheap, not whether — how well.
- Value never reads performance — unchanged, and now understood precisely: value never reads *stats*;
  stats route through taste.
- Nothing basic is ever locked — unchanged; operations are additive capability.
- Banned vocabulary — unchanged and complied with. The system uses *scene, standing, stage, deed,
  ledger, operation*; none of the banned words appear in design, code or copy.

## 11. Decision log — rejected on the way here

Kept so the reasons survive the ideas.

- **Rate multipliers of any kind** (labour efficiency, material yield): change how fast, never what.
- **Recommissioning as a cost discount**: same class, caught in review, replaced by sorting.
- **Seller aura / provenance-as-value** ("cars you touched are worth more"): a price multiplier on
  the person — changes how much, never what or who. Same failure class as rate multipliers.
- **Documentation as a mechanic**: a paperwork mechanic in a wrenching game. Killed. Cars
  resurfacing in the world with your old work in them may stay as pure flavour if cheap — with zero
  price hook.
- **Floor raised to 1.0**: erases "a specialised car is also somebody's wrong car". Floor stops at
  0.95.
- **Hobbyist as an unaffiliated sixth pool**: unnecessarily convoluted; deleted outright instead.
- **Rival NPC title-holders**: a whole system the refactor does not need.
- **Techniques kept as a separate deed axis**: overcomplication; the six names live on solely as the
  operations.

## 12. Noted for later, explicitly not in this refactor

- **Radial one-component service jobs are fine as-is.** Investigate late-game **automation** of them
  as passive income.
- **Drift** as a seventh scene.
- **Teardown condition preservation** (a master's head comes out as it went in) — passes the
  pointing test, unowned, low priority.

## 13. Build order and touched surfaces

0. **Buyer power expectation** (prerequisite, its own piece before anything else). **BUILT**
   (docs/sprints/sprint175.md). The shared 300 PS normalisation ceiling saturated every buyer's
   power target far below what a built engine makes, which made Racers and Race prep inert.
   Raising the constant alone was ruled out early because it drags every archetype's fraction up
   together, but a fixed ceiling was never the wrong fix on its own - it needed a second mechanism
   sitting above it. The shipped shape is two parts: `statFormulas.powerNormalizationCeiling`
   moved 300 to 600 (just above the roster's fastest stock car), so ordinary appetite - still
   each archetype's own authored fraction - simply means sensible PS numbers again (racer 450,
   tuner 390, touge 420); and a NEW climbing chain (`GameState.powerExpectationChain`,
   `currentPowerExpectationBarPs` in `valuation.ts`) tracks the player's own best-ever delivered
   power and a bar that closes on it (best minus 10 per cent on a new best, minus 5 after one
   delivery at that bar, minus 1 after another, restarting at minus 10 on the next personal best).
   The chain governs only the TOP of the market - it changes no archetype's `statTargets.power` -
   and ships unconsumed this sprint: it is state plus a derived figure, proved and ready for a
   later sprint (word-of-mouth/scene commissions) to read.
1. `buyers.json`: delete hobbyist; retune tuner; author touge; rename first-timer → daily drivers,
   stancer → show crowd (data ids and copy).
2. `economy.json`: rebalance `buyerPoolWeights` for the hobbyist deletion; add touge weights; author
   the Collector Network selling channel. **The hobbyist rebalance is larger than it reads**: that
   archetype carries 1.4 in the free ads paper and 0.8 at the weekend meet, so removing it shifts
   every remaining weight's relative share and changes who walks in on channels this refactor was
   not otherwise touching. Four channels times six archetypes, re-authored deliberately rather than
   by deleting a row, and every value approval-gated.
3. `valuation.ts` and `selling.ts`: per-scene standing band (floor/ceiling per stage), max-not-stack
   against channel ceilings, matched-only above 1.12.
4. Earn event + ledger: matched-delivery detection (the `>= 1.0` accept-time read already exported),
   ledger store and screen, stage triggers from deeds.
5. Word-of-mouth draw weighting from the rolling delivery window.
6. Scene commissions (Respected) on archetype stat targets.
7. The operation chassis, then six parameter skins — after the condition-ceiling interaction check.
8. Delete the old specialty module, tags, thresholds, premium, title derivation; rewrite the
   tutorial against the matched-delivery earn event; amend the bible per section 10.

**Acceptance test for the whole refactor:** give two players with different scene standings the same
auction sheet. If their shortlists differ — the Show Crowd shop bidding on the rust-free shell, the
Touge shop on the tired chassis with good bones — the system works.
