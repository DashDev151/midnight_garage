# Sprint 86 - Board and shop face-lift

Second sprint of the 2026-07-18 playtest arc (items 1, 2, 3, 4, 5, 7-styling, 8, 9, 10, 13).
Pure presentation and copy: no sim changes. Depends on Sprint 85 only where it removed things
(mission deadline chips, the Decline control exists).

## Reuse analysis (directive 16)

**New mechanisms:** none. Everything here restyles or rephrases existing surfaces.

**Existing mechanisms to reuse:**

- `ShopSlot.vue` renders both garage bay states; the geometry fix is CSS on the existing
  component, not a new bay component.
- The occupancy numbers already exist as computeds (`serviceBayFreeCount`/`serviceBayCount`,
  `parkingOccupancyCount`/`parkingCapacity`); only the rendered phrasing changes.
- The `"{n}d left" / "due today"` idiom already shipped for active jobs
  (`ServiceJobsScreen.vue:272-274`); offers adopt the same convention rather than a new one.
- `GradeChip.vue` / `BandChip.vue` / `GradeStamp.vue` and the `style.css` tokens; the tier
  recolour re-dresses `GradeChip` with existing tokens (no new hex).
- The auction card markup (`AuctionScreen.vue`) and `StatRadar.vue` label CSS.
- `serviceJobTemplates.json` flavour pools (copy sweep edits in place).

## Decisions

1. **Garage bay geometry (playtest 1).** Empty and occupied `ShopSlot`s share one fixed
   min-height sized to the occupied state's natural content (car card + move button), so a
   bay's shape never changes when a car moves in or out; empty-state label stays centred in
   the taller box. Grid column minimum narrows if needed to bring the proportions nearer
   square. CSS only.

2. **Occupancy counters (playtest 2).** Both sections render `({occupied}/{total})`:
   an empty garage reads `Service bays (0/1)` and `Parking (0/3)`. The "free" phrasing goes;
   service-bay occupied count = `serviceBayCount - serviceBayFreeCount`.

3. **Job card structure (playtest 4 + 7).** The offer card becomes four visually separated
   sections in order: title and description (customer line + flavour text); car info (car
   name + fitment-class chip); job checklist (`ServiceTaskList`, unchanged); a footer row
   with rewards (`pays {¥X} · +{N} rep`) left and the Accept / Decline buttons right.
   Accept is the primary-styled action, Decline quiet secondary. Cards get taller; that is
   the point.

4. **Day counters read as time remaining (playtest 5).** The offer card's
   `offer expires day {n}` becomes the existing active-job idiom: `{n}d left`
   (`expiresOnDay - day`). One convention everywhere a countdown appears. Story missions
   have no timers after Sprint 85, so radial surfaces are the whole scope.

5. **Tier chips leave the verdict palette (playtest 8, orchestrator ruling, maintainer veto
   open).** `GradeChip` stops borrowing quality colours (race currently shares poor/scrap's
   magenta, street shares fine's cyan). New treatment, one family, intensity = tier, using
   the existing warm amber token (`--mg-neon-violet`, which holds `#d29a5a`):
   - stock: dim grey text, panel-edge border (unchanged);
   - street: amber text, panel-edge border;
   - sport: amber text, amber border;
   - race: amber text, amber border, subtle amber background tint (a low-alpha fill, not a
     solid block: the rule of glow stays respected).
   Cyan/magenta/green/red remain verdicts and money stays gold. The shared amber with
   `GradeStamp`'s "middling" stamp is accepted: different screens, different shapes, and
   amber-as-heat reads correctly in both.

6. **Auction card cleanup (playtest 9 + 10).** Remove the `bill {¥X}` span (the
   restore-to-mint estimate; `AuctionScreen.vue:568`) and, if nothing else consumes it, the
   `restorationBillYen` view field. Drop the visible `raise to` label (keep an
   `aria-label` on the input so the control stays named for assistive tech); with the label
   gone the stepper group centres itself under the parent's existing `align-items: center`.
   Verify no leftover asymmetric margin.

7. **Radar text (playtest 13).** `StatRadar` label `font-size` 9px to 10px, value 10px to
   11px. Nothing else.

8. **Copy family sweep (playtest 3).** The "sort it / sorted" imperative family in
   `serviceJobTemplates.json` reads British-builder, not 1995 Japan. Ruling: every flavour
   line containing "sort/sorted" is rewritten; bare imperative closers are softened except
   where the speaker is deliberately characterised as blunt (the touge customer keeps their
   edge). Known targets from discovery: `tyre-fit-and-balance` ("Sort it out."),
   `brake-pads-service` ("Sort the brakes before my shaken."), `tyres-and-pads-service`
   ("Sort both before my shaken."), `brake-system-overhaul` ("sorted properly"), plus a
   full-file scan for the family. **Replacement lines are drafted by the orchestrator
   personally at implementation time (content quality bar); the implementer applies them
   verbatim and writes no copy.**

9. **Working title becomes "Ran When Parked" (maintainer ruling 2026-07-18).** Applied to
   player-facing surfaces and document headers only: the title screen / app title string,
   the GDD's title line (recorded as a maintainer-approved amendment in the doc itself,
   per the bible-amendment rule), CLAUDE.md's one-line description, and the README if it
   names the game. Internal identifiers are exempt and unchanged (`@midnight-garage/*`
   package scope, repo directory, save keys): renaming them is churn for zero player
   value pre-launch, the same philosophy as directive 18's identifier exemption. The
   itch.io page name is a launch-time task, not this sprint.

## Definition of done

- [ ] Bays hold one shape empty or occupied; both counters read `(occupied/total)`.
- [ ] Offer cards show the four-section structure with Accept/Decline styled; countdown
      reads `{n}d left`.
- [ ] Tier chips use the amber-intensity family; no tier shares a hex role with
      condition verdicts.
- [ ] Auction card shows no bill figure; the stepper row sits centred with no visible
      label.
- [ ] Radar labels one step larger.
- [ ] Every "sort/sorted" flavour line replaced with orchestrator-drafted copy, applied
      verbatim; spelling guard and em-dash guard stay green.
- [ ] "Ran When Parked" on the title surface, GDD header (amendment recorded), CLAUDE.md
      description; internal identifiers untouched.
- [ ] Narrowest relevant checks run once; pre-push gate is the evidence (directive 20).

## Task breakdown

**Claude-implementable:** all decisions; decision 8's copy drafts come from the
orchestrator, applied by the implementer.
**User-only:** eyeball pass on the restyled board, bays, chips and auction card (visual
work has no automated arbiter).

## Exit

(Filled at sprint close.)
