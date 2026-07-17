# IDEAS.md - scope-creep parking lot

Per roadmap risk R3, the GDD v1.0 feature set is **frozen**. Every new idea lands here first -
cost-estimated, honestly assessed against the design pillars, and scheduled **post-launch only** (if
ever). Being written down here is *not* the same as being in v1.0 scope. This file is tracked in the
repo (the maintainer chose to keep it visible rather than private) - but it is explicitly the
parking lot, not the roadmap.

---

## Driving minigame (wanted - optional, zero gameplay weight)

*Added 2026-07-08. Status: the maintainer wants this, explicitly as a purely-optional "just for fun"
mode with **no gameplay weight**. Not designed yet, not scheduled into a sprint - a post-launch /
expansion candidate, but a wanted one, not a likely-cut one.*

*Update 2026-07-12: a full technical implementation spec (physics model, rendering approach, map
pipeline, phased delivery) now exists at `docs/design/drive-mode-spec.md`, filed after a technical
review found the architecture sound. Still not scheduled - this is groundwork for whenever it's
picked up, not a signal that it's moving into a sprint. The one open design question the review
flagged: the spec's real slip-angle physics genuinely reward driving skill in the moment, which
sits in tension with this entry's "stat-linked, not twitch-linked" constraint below - worth a
deliberate look when this is scheduled, not a blocker to having filed the spec.*

**The dream:** actually *drive* the cars you build, at least a little - a simplified top-down /
isometric driving physics minigame, rally-flavored, in the spirit of **Super Woden GP** but pared
way down. The emotional payoff: the car you hunted, restored, and tuned isn't just a stat block you
sell - you get to feel it move.

**Maintainer's standing intent (2026-07-08):** "I get that it runs against core design decisions but
I still want it, as purely optional and with no gameplay weight. It's just for fun." So the pillar
conflicts below are acknowledged and *accepted as an explicit opt-in exception* - this is a
sanctioned future exception, not an oversight to be talked out of. The job when it's built is to
honor the constraints, not to relitigate whether it belongs.

**Why it's exciting:** it closes the loop emotionally. Right now the build is abstract (radar +
numbers); driving would make the machine real. For a vibe-led game about car culture, "I can drive
the thing I built" is a powerful hook and a shareable moment (GIFs).

**Why it fights the current design - acknowledged and accepted as an opt-in exception (see intent
above); documented so the eventual build respects the pillars rather than bulldozing them:**

1. **Directly contradicts a hard design rule:** GDD / CLAUDE.md state *"No driving gameplay - events
   resolve via pre-run decisions + animated resolution."* This idea is the exact thing that rule
   rules out. Touge nights, wangan runs, attack fests are all currently designed as
   pre-run-decision + animated-cutaway resolution, specifically to avoid a driving engine.
2. **Contradicts the accessibility pillar:** *"No reflex-based input anywhere - no QTEs, no timing
   bars. Everything is decision-paced."* A physics driving game is inherently reflex-based. Any
   version of this would need a fully decision-paced alternative path so it never becomes a skill
   gate - which is a lot of design and build for an "optional" mode.
3. **Scope:** a driving physics engine (even simplified/arcade) is a *large* new subsystem - input,
   physics, collision, track authoring, a whole second art pipeline (top-down car sprites + tracks),
   tuning that maps build stats to handling feel, and mobile/touch controls. This is comfortably a
   multi-sprint effort on its own, i.e. a post-launch expansion, not a v1.0 feature.

**If it's ever pursued, the non-negotiable constraints:**

- **Fully optional and skippable** - never gates progression, money, or reputation. A player who
  never drives must be able to finish the whole game.
- **Decision-paced alternative preserved** - the existing "resolve events by pre-run decisions"
  path stays as the default; driving is an opt-in overlay on top, not a replacement.
- **Separate mode / separate milestone** - built as an isolated island (its own Pixi/physics scene),
  behind a clean boundary, so it can be cut without touching the core sim.
- **Stat-linked, not twitch-linked** - the build should matter more than reaction time (e.g. a
  better-built car is forgiving/faster on rails), keeping it closer to "management payoff" than
  "driving skill test."

**Verdict for now:** wanted but parked. It does not enter a sprint until v1.0 has shipped and the
core loop is proven - but it is a real, intended future addition, not a maybe. When it's time, the
constraints above are hard requirements (optional, decision-paced default preserved, isolated
cuttable module, stat-linked not twitch-linked), and the pillar conflict is already signed off as an
explicit exception. Do not re-argue whether it belongs; just build it right, small, and skippable.

---

## Parts market: a junk/scrapyard grade tier + multiple vendors

*Added 2026-07-09, moved here from `TODO.md`'s Sprint 14 placeholder. Status: **not maintainer-
requested - traced to an earlier Claude session inventing scope while drafting the Sprint 14
placeholder, not to the GDD or any playtest note.** Unlike the driving minigame above, this has no
sign-off; it's parked here specifically so it stops silently riding along in the roadmap as if it
were confirmed scope.*

**The idea:** a 5th part grade below Stock (junk/scrapyard-condition) and multiple vendors per
component (a cheap scrapyard vs. a pricier performance house), instead of today's single catalog with
one price per part.

**Why it's not simply in scope:** the GDD (`docs/design/midnight-garage-gdd.md`, frozen for v1.0)
is explicit - parts have exactly four grades, **Stock → Street → Sport → Race** - and describes no
vendor concept anywhere. Adding a 5th grade or a vendor system is new mechanic surface the GDD didn't
plan for, not a bugfix or a UI pass, so it needs the same explicit sign-off the driving minigame got,
not a default assumption baked into a TODO.md one-liner.

**What Sprint 14 actually covers instead:** the real, sourced playtest ask (#7, "the parts-market
cart/checkout overhaul" - batch-buying multiple parts in one flow) plus sorting/filtering, which is
pure UI/QoL over the existing single-grade catalog, not a new mechanic. See `docs/sprints/sprint14.md`
once it exists.

**If this is ever pursued:** it would need its own reuse-analysis pass against `GradeSchema` (adding a
grade means every part-grade-driven formula - pricing, stat modifiers, reputation scaling on installs
 - gets audited for a new bottom rung) and a real vendor data model (`packages/content`), not just a
content JSON tweak. Revisit only with an explicit ask, the same way the driving minigame is explicit
opt-in scope rather than an assumed default.

---

## Bay-specific equipment (per-bay machinery, not shop-wide)

*Added 2026-07-10, maintainer note during Sprint 17's drag-and-drop work: now that a car's specific
bay is a real, physically-tracked position (not just shop-wide membership), equipment could plausibly
attach to a *specific bay* instead of unlocking repair for the whole shop.*

**The idea:** equipment (welder, engine crane, etc.) lives on a particular service bay rather than
being owned shop-wide - repairing a car requires it to be sitting in a bay that actually has the tool,
not just any bay. Could also mean needing to buy multiple copies of the same tool to equip more than
one bay at once, and/or bay *upgrades* (a bay itself has a tier, not just a count).

**Why it's not in scope now:** `EquipmentSchema`/`ownedEquipmentIds` (Sprint 13) are explicitly
shop-wide with no per-bay concept at all - this would be a real data-model change (equipment moves
from a flat owned-ids list to something keyed by bay), touching the repair gate, the Upgrades tab, the
harness/bot equipment logic, and probably the price ladder (multiple copies changes the economy). Not
a small follow-on to Sprint 17's positional-slot fix.

**If pursued:** revisit once bay *count* growth (buying more bays) and reputation gating (Sprint 16)
have real playtest signal - whether "more bays" alone is a satisfying upgrade path, or whether it
needs the added texture of "which bays are tooled up," is an open design question, not just an
engineering one.

---

## Part restoration + car stripping (two related salvage/parts-economy features)

*Added 2026-07-10, maintainer note during the Sprint 19/19b/19c auction-economics work. Two distinct
ideas raised together because they naturally feed each other, but each is its own scope - neither is
designed or scheduled.*

### 1. Restore damaged parts

**The idea:** buy or otherwise acquire a *damaged* part (not the always-100%-condition parts the
market sells today) and repair it back up to usable condition, instead of only ever buying pristine
stock or scrapping worn parts outright.

**Why it's not a small extension of today's repair system:** `PartInstance` already carries its own
`conditionPercent` (Sprint 12), so the *data* to represent a damaged part already exists - but the
entire repair/labor/job system (`jobs.ts`, the equipment gate, `repairJobGate`) is scoped to a car
sitting in a service bay (`Job.carInstanceId` + `componentId`), not a loose inventory item. Repairing a
part outside a car would be a genuinely new job *kind*, not a reskin of the existing repair-zone job -
worth an explicit reuse-analysis pass (directive 15) before design starts: which parts of the
job/labor/equipment machinery generalize cleanly to "the target is a `PartInstance` in inventory, not a
car in a bay," and which need real new plumbing.

**Not the same idea as** the already-parked "Parts market: a junk/scrapyard grade tier" above - that
one is about a part's *grade* (a 5th tier below Stock, explicitly out of the GDD's frozen 4-grade
system). This is about a part's *condition* (already a real, continuous field on every `PartInstance`,
independent of grade) - a Stock or a Race part can both show up damaged. Worth keeping the distinction
clear if either is ever picked up, since they'd touch different schema fields.

### 2. Strip a car for parts

**The idea:** instead of repairing and selling a car (or selling it as-is), pull it apart: every
component that has a real aftermarket `PartInstance` installed gets extracted into the player's parts
inventory, and whatever's left (the stripped chassis, plus any still-stock components with no
installed part) sells for scrap - a low, flat value, well under any real sale channel.

**Reuse note:** `CarInstance.components[id].installed: PartInstance | null` (Sprint 12) already *is*
the real part sitting in that slot - extraction is conceptually just moving that object from the car
into `GameState.partInventory`, the same shape `resolveBuyPart` already populates. The genuinely new
piece is the scrap-sale valuation (a new, deliberately low formula - likely a small fraction of book
value, distinct from `valuateCarForBuyer`, since a chassis with nothing installed and no going concern
as a car isn't the same thing today's buyer-valuation formula was built to price) and the UI flow for
"pick apart this car" as a third disposal path alongside walk-in and public listing.

**A real design wrinkle to resolve before this is designed properly:** a bone-stock car (nothing
aftermarket ever installed) yields *no* real parts at all under this model - every component is just a
condition score, not a `Part` the catalog knows how to price or reinstall elsewhere. Stripping only
pays off on a car that's already been built up, which may be exactly the intended feel (strip a
project car you over-invested in) or may need its own stock-component salvage concept to feel worth
doing on a rougher, more typical acquisition.

**How the two connect:** a stripped part (idea 2) is the natural, thematic *source* of a damaged part
(idea 1) - it was ripped out of a running car, not bought new, so it's a plausible candidate to enter
inventory below 100% condition rather than pristine. Neither needs the other to be built first, but a
combined design pass would likely make both feel more coherent than designing them in isolation.

**Status:** both ideas only, no reuse-analysis, no task breakdown, no sprint attached - parked here
per the standing rule (frozen v1.0 GDD scope), not a near-term commitment.

---

## Build logbook / wall of finished cars

*Added 2026-07-12, during the Progression Rework arc (Sprints 36-39). Status: idea only, parked at
arc close-out - not designed, not scheduled.*

**The idea:** a physical-feeling record of every car the player has fully restored/built and sold or
kept - a "wall of the cars you've finished" the player can flip through, rather than a stats panel.
Surfaced while designing Sprint 39's specialty/technique reveal: the progression bible's law 4 (no
meters, everything revealed diegetically) wants milestones to feel like real memories, not counters -
"your 12th engine build" as a story beat you can look back at, not a number that went up.

**Why it fits the pillars:** it's the natural physical anchor for the identity axis (specialty/
techniques/shop title, Sprint 38-39) - a shop's reputation is who walks in the door, and a logbook is
what the SHOP OWNER would actually keep. No reflex input, no real-time pressure, purely a browsable
record.

**Why it's parked, not built:** genuinely new UI surface (a browsable gallery/log screen) and a new
persisted record (which builds counted, when, what tier) - not a small addition, and the core
progression mechanics (Sprints 36-39) don't need it to function; the dev-console specialty/technique
readouts already cover debugging. Worth a real design pass (what counts as "finished," does it
include cars sold vs. kept, does it show stats or just the story) before any implementation.

**Status:** idea only, no reuse-analysis, no task breakdown, no sprint attached - parked here per the
standing rule (frozen v1.0 GDD scope), not a near-term commitment.

---

## Parts diagram: per-model art layouts and the zoomed per-zone view (tier 3)

*Added 2026-07-17 at Sprint 84 close-out (the parts diagram v1). Status: recorded per Sprint 84
decision 8 as tier-3, out of v1.0 by definition.*

**The idea:** Sprint 84 ships one hand-authored, model-agnostic layout (`partsDiagramLayout.ts`)
of plain rectangles, shared by every car. Two tier-3 extensions were deliberately deferred:
(1) **per-model layout variants** - a mid-engine or FR car laid out to its own silhouette rather
than the single shared side-on schematic; and (2) a **zoomed per-zone view** - clicking the engine
bay opens a larger, better-spaced drawing of just that cluster, so the buried-slot stack reads
without the whole-car scale fighting it. The maintainer's glyph-art pass (swapping each rectangle
interior for a hand-drawn Aseprite part, in the SAME layout) is a separate, already-planned art
task tracked in `docs/sprints/sprint84.md`, not here.

**Why it's parked, not built:** v1's rectangle diagram already makes the teardown hierarchy legible
(the occlusion is the mechanic), and the layout-coherence test guarantees it stays honest. Per-model
variants multiply the hand-authored layout (and its coherence test) by the roster; the zoomed view
is a whole second interaction surface. Neither is needed for the core "see what comes off first"
payoff, and both want a real design pass first.

**Status:** idea only, no reuse-analysis, no task breakdown, no sprint attached - parked here per the
standing rule (frozen v1.0 GDD scope), not a near-term commitment.
