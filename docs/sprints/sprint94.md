# Sprint 94 - The energy bar (labour becomes continuous) - PLANNED

Captured 2026-07-18 (maintainer direction). Design stub; full design + reuse analysis to be
written before implementation, after Sprint 93 lands.

## The direction

Replace the integer labour-slot model with a continuous "energy" bar (Stardew Valley style).
The current display shows labour as an integer; the model is heading into fractions, so the
representation must become a bar, not a count.

Maintainer rulings so far:

- **Full reset every day** (Stardew-style: a night's sleep refills the bar).
- **Staff increase the MAXIMUM** (a bigger pool), not the drain rate.
- **Actions drain the bar by (fractional) amounts that vary** by action type, by the time
  spent, and by which machinery/tier is available: better tools drain less per action.
- **Progression makes the player less labour-constrained over time** (bigger pool via staff,
  less drain via tools).

## Consequences to design (not yet decided)

- Tier-3's "speed" advantage (currently fewer labour SLOTS per repair) re-expresses as
  "drains LESS energy per action". This folds the whole tier-speed axis onto the bar.
- Every action currently priced in integer slots (repair via `slotsNeededToClimb`, install
  via `installSlotsByClass`, etc.) becomes a fractional energy cost.
- The daily budget (`laborSlotsPerDay`, `laborSlotsSpentToday`) becomes a max-pool +
  spent-today on a continuous scale; the crew model's per-member slot contribution becomes a
  pool increase.
- Every UI surface showing integer labour (CarDetailScreen confirm bar, per-action captions,
  the day report) becomes the bar + fractional costs.
- Blast radius: every test asserting integer labour slots re-derives (directive 17).

## Sequencing

After Sprint 93. This re-touches all labour UI and every action's cost, so it is its own
sprint (or a short arc). Do not start until 93 is landed and the band-ceiling economics are
settled.
