# Playtest notes - 2026-07-18 (fresh start, post-Sprint-84 build)

Maintainer playtest against committed main (b9966ae, Sprints 00-84). New game from day 1,
unstructured notes captured verbatim-in-substance below, per the standing triage workflow:
capture formally, verify ambiguity against code, then design sprints. Item numbers are the
maintainer's own (no item 17 existed in the source notes).

Triage classes used below: **BUG** (defect, root cause needed), **SYSTEM** (design rework),
**TUNE** (number change, knob), **UI** (layout/presentation), **COPY** (content tone).

---

## The items

### 1. Garage bays lose their shape (UI)

Empty service and parking bays render short/wide; when a car moves in, the bay changes
shape. Wanted: bays taller (closer to square) and shape-stable between empty and occupied
states.

### 2. Bay occupancy counters inconsistent (UI)

A completely empty garage shows "(1/1 free)" for service bays but "(0/3)" for parking.
Standardise both to occupied/total: an empty garage reads 0/1 and 0/3.

### 3. Sake-shop job line reads terse and rude (COPY)

"Vibration at speed, feels like the tyres need balancing. Sort it out." Maintainer
question: is that an authentic exchange? Orchestrator to judge in context of the
surrounding templates and rule on a rewrite (this is sweep territory).

### 4. Job cards are jumbled (UI)

Make job cards taller with clear separate sections: title and description / car info /
job checklist / rewards and Accept button.

### 5. Day counters: show time remaining, not a date (UI)

Across ALL jobs, radial and story: replace "expires on day X" phrasing with "X days
left". The player should read remaining time directly.

### 6. Radial job offer lifetimes too long (TUNE)

Tune offer active-days down: keep variety, average about 5, range roughly 3-8. Must be a
content-configurable knob.

### 7. Reject button for radial jobs (UI + small SYSTEM)

Add Reject next to Accept on radial job cards. Rejecting clears the offer from the board
with ZERO penalty (as if it never existed). Restyle both buttons while in there.

### 8. Tier chip colours collide with condition colours (UI)

The shop's Street/Sport/Race grade chips use the same colour code as the worn/poor
condition markers; at first glance race parts read as poor quality. Recolour the tier
chips: adhere to the art bible, adding colours if needed, but the tier scale must not
reuse the red/amber/green condition ramp.

### 9. Auction cards: drop the bill figure (UI)

"bill ¥92,600" on the auction card is irrelevant information for the majority of cases;
remove it outright. Standing invitation to reassess what else on the card no longer earns
its place.

### 10. Auction card raise-to row miscentred (UI)

The raise-to label, input and +/- buttons all sit too far right; fix centring and drop
the "raise to" label entirely.

### 11. Car repair screen rework: sub-assemblies + the diagram becomes the page (SYSTEM, the big one)

Three connected rulings:

- **Sub-assembly model.** Current flow for a tyre change is logical nonsense (pull rim,
  pull tyre "from the car", install tyre "on the car", refit rim). Wanted: rim+tyre is a
  sub-assembly, removed from the car as a unit, separated/worked at the relevant machine
  (tyre fitter and balancer), reassembled, refitted as a unit. Same shape for the
  engine/transmission cluster: pull the assembly, strip it off-car, fix, rebuild,
  reinstall. Needs a proper system design, not a patch.
- **The diagram replaces the list.** The Sprint 84 service diagram is currently
  hyperlinks into the old components list; that is not the destination. The blocks must
  BE the items: clicking a part opens a compact info/action panel beneath the diagram
  (name, condition, dependencies, remove/replace/repair controls). The old list goes.
- **The diagram is the hero.** Full playable-area width, large. The radar graph moves to
  the top right, inline with the title and car info.

### 12. Pixel-art placeholders for every component (UI/art)

Replace the bare rectangles with simple 2D placeholder pixel art for every component,
placed in a logical orientation. Not detailed, just readable ("you can see what the art
is trying to represent"). Art-spike precedent shows this is achievable in-repo.

### 13. Radar text slightly larger (UI)

Self-explanatory.

### 14. Early-game auction pool too expensive (TUNE, possibly SYSTEM)

Too many expensive cars at game start. More very cheap shitboxes should surface in the
first ~2 weeks. Needs the lot-generation facts before choosing knob vs mechanism.

### 15. BUG: parts spawning at mint on removal (BUG, root cause pending)

Pulling scrap tyres from a customer car may have turned them mint, or removing rims may
have spawned mint tyres into an empty tyre slot. Reproduced harder in item 20.

### 16. BUG: new tyres installed for 0 labour (BUG, suspected downstream of 15)

Installing NEW tyres on a job cost 0 labour slots, plausibly because the phantom mint
part from item 15 made the game read the install as a mint-for-mint equivalence refit
(the Sprint 79 free-refit rule keying off the vacated baseline).

### 18. Story missions should not be failable (SYSTEM ruling)

Yuki's mission is available too early; players will accept immediately, before owning a
suitable car, and face a large chance of deadline failure. Maintainer's position: story
missions should NOT be failable at all, completed at the player's leisure; no benefit in
making them missable. Orchestrator recommendation: agree, remove story-mission deadlines
entirely (the budget cap and requirements remain the challenge; the timer only punishes
accepting early, which is not a decision worth punishing). Radial jobs keep their
deadlines: they are the disposable, rolling content. Pending maintainer word on the
final ruling.

### 19. Labour costs need visual prominence (UI)

The labour cost of car actions and component repairs gets lost in running text on the
repair screen. Surface it prominently (folds into the item 11 diagram/action-panel
rework).

### 20. Bug 15 reproduced with a clean repro (BUG)

Clicked "Take it off" on a Poor-condition Ignition & ECU; the game immediately replaced
it with a Mint OEM stock Ignition & ECU in the slot. Not all parts, or not all the time.
Root-cause investigation dispatched.

### 21. Engine crane rep gate makes early cars unrepairable (SYSTEM)

Yuki's job: bought a car with worn engine parts; removing them needs an engine crane;
the crane sits far beyond reachable reputation at that point, so the parts cannot be
touched and the job stalls until much later. Bigger point: early game currently cannot
repair all components, and that may be wrong in itself. Ties directly into the item 11
sub-assembly redesign; needs big-picture flow planning, not a gate tweak.

### 22. Yuki's first mission becomes the tutorial (SYSTEM, maintainer directive mid-triage)

Turn Yuki's story mission into the game's tutorial: the first thing the player does. A
guided, scripted flow teaching the whole core loop end to end:

- inspecting a car at the auction house and choosing a good one to bid on;
- winning the auction (scripted: the game cheats for this one lot, spawning a specific
  car with set characteristics and conditions, and the win is guaranteed);
- removing, repairing and replacing parts on that car;
- buying tools/upgrades (e.g. the engine crane) so the work is possible;
- buying new components (tyres, brake pads) from the shop and fitting them.

Sequencing consequence: the tutorial teaches exactly the flows items 11/21 are about to
redesign (sub-assemblies, the diagram-as-page, tool access), so it must be designed
against the NEW repair model and land after it, as the capstone of this arc. It also
interlocks with item 21: if the tutorial has the player buy the engine crane in week
one, the crane cannot sit behind a distant reputation gate; the tool-access ruling and
the tutorial script are one design decision.

### 23. Working title change: "Ran When Parked" (maintainer proposal, mid-triage)

"Midnight Garage" does not fit the vibe; proposed replacement: **Ran When Parked**.
Orchestrator endorsement recorded (the title names the core loop: buying cars on a
seller's half-truth; register matches the game's dry, mechanically literate voice).
Availability check 2026-07-18: no game by this name found on itch.io or Steam; the
phrase exists as a car blog (ranwhenparked.net) and a 2017 Rob Siegel memoir, both
different categories, and the phrase itself is generic car-culture idiom (weak
trademark surface). Adoption scope: player-facing surfaces and doc headers only;
internal identifiers (package scope `@midnight-garage/*`, repo directory) stay
unchanged until launch, same philosophy as the directive-18 identifier exemption.
Folded into Sprint 86 as decision 9.

---

## Verified findings (discovery pass, 2026-07-18)

- **Bug chain 15/16/20, root cause found.** `resolveRemovePart`
  (`packages/sim/src/jobs.ts:437-462`) still carries its pre-Sprint-79 branch (Sprint 32
  decision 7): removing a part whose catalogue grade is not `stock` does not empty the
  slot, it backfills a synthesised MINT OEM stock instance in the same update that
  stamps the Sprint 79 `vacatedBaseline`, contradicting the schema contract in
  `carInstance.ts` (installed part and baseline must never coexist). Trigger is the
  part's GRADE, not its band, which is why it looked intermittent. Item 16 is
  second-order: the phantom forces a second removal, which overwrites the baseline with
  the phantom's own mint-stock fields, so a genuinely new mint stock part then matches
  and installs as a free equivalence refit. `refitLaborSlotsFor` itself is correct.
  Fix: delete the backfill branch, always write `installed: null`; rewrite the stale
  pinned test `jobs.test.ts:1109-1141` (directive 17 case (a): Sprint 79 redefined
  removal semantics and this test pins the old ones); update the three stale
  comments/docstrings; add regression tests for both symptoms.
- **Offer lifetime (6):** flat hard-coded `SERVICE_JOB_EXPIRY_DAYS = 10`
  (`packages/sim/src/constants.ts:24`), explicitly not a content knob. Becomes a content
  range knob (3-8, mean ~5) rolled per offer.
- **Reject (7):** no decline mechanic exists anywhere; expiry is already penalty-free,
  so a reject action is pure addition (sim action + store + button).
- **Story missions (18):** lapse costs `lapseReputationPenalty` (7 rep for Yuki) and a
  10-day reoffer wait, repeating forever. Ruling: remove the deadline/lapse/reoffer
  machinery outright; story missions become offered/accepted/delivered, at leisure.
  Directive 19 applies: no compat, just the schema bump.
- **Tool wall (21):** buried engine parts (block, internals, head, cams) are
  unremovable without the engine crane: ¥600,000 AND `local` reputation AND a live
  classifieds listing. Gearbox/clutch same shape behind the ¥900,000 transmission
  bench. 23 of 29 parts are bench-only (removal required to repair). Tools never cap
  the repair band, only speed; the walls are purely access. The tyre machine exists in
  content but gates nothing.
- **Early pool (14):** all early lots are Local Yard (venue rep gates already do that),
  but the pool draws UNIFORMLY over 8 shitbox (¥180-480k) + 4 common (¥560-820k)
  models: a third of early lots are common-tier metal, with only ~3 lots on day 1 and
  ~1.3 arrivals/day. Fix direction: rarity weighting by reputation tier (content knob),
  not a day timer.
- **Auction card (9/10):** the bill figure is the full restore-to-mint estimate off the
  apparent car (`restorationBillYen`); remove per ruling. The raise-to row's off-centre
  look is the label+stepper being centred as one block; dropping the label fixes it
  almost by itself.
- **Chips (8):** `GradeChip` race uses the identical hex as `BandChip` poor/scrap
  (`--mg-neon-pink`), sport shares the amber that grade stamps use for "middling", and
  street shares fine's cyan: the whole tier ladder is dressed in quality-verdict
  colours. Needs its own visual family (art bible locks palette TIERS by role, exact
  hexes deliberately open, so a dedicated treatment is legal).
- **Bays (1/2):** empty slots collapse to an 84px `min-height` floor while occupied
  slots stack taller; no shared fixed height/aspect exists. Counters are two phrasing
  conventions over the same numbers (`GarageScreen.vue:115` vs `:137`).
- **Copy (3):** the "sort it/sorted" imperative family runs through at least six
  templates, so the tone fix is a family-wide sweep, not one line.
- **Pixel-art precedent (12):** the art spike's technique (indexed character-row
  templates rasterised to canvas at 4x, nearest-neighbour) is a workable authoring path
  for ~29 tiny part sprites without commissioning assets.
- **Tutorial (22):** interlocks with the tool-access ruling; the scripted mission must
  be designed against the post-rework repair model (sequenced last in the arc).

## Triage: the sprint arc (proposed)

1. **Sprint 85, honesty fixes (sim):** the phantom-mint fix + regression tests; story
   mission deadline removal; offer-lifetime content knob (3-8d); reject action;
   rep-weighted early auction pool.
2. **Sprint 86, board and shop face-lift (UI + copy):** job card restructure; "X days
   left" phrasing everywhere; Accept/Reject styling; garage bay geometry + counters;
   tier-chip recolour; auction card cleanup (bill gone, raise row recentred); radar
   text; the "sort it out" copy-family sweep.
3. **Sprint 87, the assembly model (sim):** sub-assembly teardown redesign (rim+tyre,
   engine/gearbox as removable assemblies worked at machines), tool-access ruling
   (crane reachable in week one), Sprint 79 labour principles lifted to assembly level.
4. **Sprint 88, the diagram is the page (UI):** diagram replaces the components list
   (info/action panel), hero layout with radar top-right, per-action labour/cost
   prominence, pixel-art part placeholders.
5. **Sprint 89, Yuki teaches you the game:** mission 1 becomes the scripted tutorial
   (scripted lot, guaranteed win, guided teardown/repair/shop/tool purchases).
