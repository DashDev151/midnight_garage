# Sprint 130: what aftermarket parts do to performance

**Status: DESIGNED at outline depth. Needs a full lever table before it opens, which cannot be
written until Sprints 128 and 129 have landed.**

Opens after Sprint 129. Last of four in the porting arc, and **the one that makes the model
matter**: until it lands, the game can say precisely what a car does and nothing connects that to
what the player built.

## The gap

The lap model answers "what does a car with this grip and this power do". Nothing answers "what does
fitting this part do to grip and power". Today a part moves four abstract stats. After this sprint
it moves the physical dials, and the lap time follows.

## Reuse analysis (directive 16)

### Genuinely new

- Per-SKU **physical** dial deltas.
- One aero grade above the current top, for GT3-class wings, splitters and diffusers. The ceiling
  that lets it exist is signed in Sprint 128; the part itself is authored here.

### Existing mechanisms reused, unchanged

- **`statModifiers` on each part** (`parts.json`). The mechanism is right, the target changes. This
  is the same move Sprint 129 makes on condition, for the same reason.
- **`statFormulas.aero.byGrade`** already maps an aero grade to a downforce coefficient and a drag
  cost. It is the one place parts already reach a physical dial, and it is the template for the
  rest.
- **The grip anchoring ratio from Sprint 128** already gives a tyre upgrade its effect. Do not add a
  second path for tyres.
- **Economy-bible Law 5** governs what a part does to VALUE, and it is untouched here. A part
  raising performance and a part raising value are two independent effects of the same purchase.

## The three rules this sprint has to hold

1. **Performance and value stay independent.** A part may add both. Neither causes the other, and
   `marketValueYen` must still take no derived stat.
2. **One dial, one path.** As in Sprint 129: if the grip anchoring ratio already handles tyres, a
   tyre SKU must not also carry a grip delta.
3. **A build must be able to reach the top of the range.** The maintainer's standing requirement is
   room for GT3-style aero, and the measured target is an effective grip of 1.5 or a little more on
   an aggressively winged build. Sprint 128 signs the ceiling; this sprint has to actually author
   parts that get there, and prove one build does.

## The acceptance test, which is unusually good here

The harness has driven times for **maxed builds**, not just stock cars: two maxed road cars, a Group
A race car and a heavily modified prototype. Those builds were assembled from real parts. So this
sprint can be scored the same way Sprint 128 is: **assemble the equivalent build in the game and
check it lands on the driven time.** That turns the whole aftermarket table from a taste question
into a measured one, and it is the strongest reason to keep those builds' figures in the harness.

## Open questions for the design session

- Does a part's delta apply to the dial or to the ratio? A turbo raises crank power, which the ratio
  bridge already scales; a lightweight flywheel changes how much of it reaches the road, which is
  the ratio itself. These are different and the table must say which each SKU is.
- How does the model treat a part it has no measurement for? The fallback regression predicts
  ratios from power-to-weight and drivetrain, which may extend to modified cars unchanged, or may
  not. Test before assuming.
- Do the driving-mode figures (`docs/design/parked/drive-mode-spec.md` section 4.1) come from the
  same table? They should, and this sprint is where that stops being a hope.

## Definition of done (draft)

- [ ] A lever table naming every SKU's physical deltas, signed before any agent runs.
- [ ] At least one in-game build reproduces a driven reference time for the real build it mirrors.
- [ ] A GT3-class aero part exists and reaches the effective grip target without meeting a ceiling.
- [ ] No car's market value moved as a consequence of a performance delta.

## Exit

_(to be filled on completion.)_
