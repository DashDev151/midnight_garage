# Facilities & Bays Design (the sprint directly after service jobs)

*Full requirements capture, written 2026-07-09 at the maintainer's request. This is the committed
design for the **Facilities sprint**, which comes **directly after Sprint 08 (service jobs)**. The
detailed end-to-end implementation design (exact schemas, action shapes, UI flows) is finalized when
that sprint starts — this doc pins down **what the system must do and why**, so nothing is lost.
Elaborates GDD §258's "Tools, not levels" shop-equipment progression.*

## The core idea: two kinds of bay

The garage has two distinct capacities, and separating them is the whole point:

- **Parking bays = STORAGE.** How many cars you can *hold* at once — owned cars (won at auction /
  bought out, in inventory or mid-build) **and** accepted service-job cars waiting their turn. A car
  in a parking bay just sits there; no work happens.
- **Service bays = WORK CAPACITY.** How many cars you can *actively work on* at once. **To apply
  labor to a car — an owned-car build job OR a service job — it must be in a service bay.** Service
  bays are scarce; parking bays are plentiful.

You **move cars between parking and service bays** (a player action). With few service bays, you
shuffle: pull the finished car out to parking (or sell it), move the next one in.

**This is cross-cutting.** It gates **owned-car builds too**, not just service jobs — an owned car
you're restoring can't progress its repair/install jobs unless it's in a service bay. That's exactly
why this is its own sprint and not a bolt-on to service jobs.

## Progression (first-pass numbers, tunable)

| Capacity | Start | Early expansion | Late game |
|---|---|---|---|
| **Service bays** (work) | 1 | 2 (first month — the *building/expansion tutorial* beat) | ~5 |
| **Parking bays** (storage) | 3 | grows with the shop | ~10–15 |

Ultra-early game with **one** service bay makes the first expansion (to two) a meaningful,
teachable moment — the moment the player learns the shop itself is upgradable.

## Expansion is a purchase — the "Tools, not levels" spine

Additional service and parking bays are **bought** (yen, possibly gated by reputation/equipment),
each a visible upgrade in the garage (GDD §258: "Basic tools → Two-post lift → Dyno cell → …; you
can't build what you can't lift. Equipment + staff skill + rep gate the ceiling; money alone never
skips the climb"). Bays are one axis of that broader facility/equipment arc — expanding them is how
money converts into throughput ceiling, deliberately and visibly, never as an invisible level-up.

## The loop to model: labor ↔ bays ↔ staff (maintainer, 2026-07-09)

These three are a self-reinforcing growth engine, and they must be **tuned as a set**:

- **Bays** = how many cars you can work on *at once*.
- **Labor** = how much wrenching gets done *per day* (base + staff).
- **Staff** = the release valve that adds labor.

> Add bays → now you *can* work on more cars → but you don't have the labor to fill them → hire more
> people → now you have too much idle labor and nowhere to put it → expand your bays → …

Two hard balance rules that fall out of this:

1. **An extra service bay is dead weight without the labor to use it.** Bay count and labor pool must
   climb together; the economy pass tunes them jointly (never one in isolation).
2. **Idle labor is wasted money** (you pay staff wages whether or not there's bay space) — which is
   the pressure that makes expanding bays feel necessary, not optional.

Sprint 08 ships the **labor** half of this (shared daily labor budget across owned-car jobs and
service jobs, no bay cap). The Facilities sprint adds the **bays** half; staff (Sprint 13) complete
the triangle.

## What the Facilities sprint must build

**State (GameState):**
- `serviceBayCount`, `parkingBayCount` (persisted; save-law version bump + migration).
- A **location** for each owned car and each active service-job car: `parking | service` (or a
  service-bay slot index). Persisted.

**Rules (advanceDay / actions):**
- **Acquisition is capped by parking:** winning an auction, buying out a lot, or accepting a service
  job is blocked (or queued) when parking is full. (Removes the current "infinite garage.")
- **Labor requires a service bay:** `advanceDay` only applies labor to jobs whose car is in a service
  bay; cars in parking don't progress. (Reworks Sprint 06/08's labor step, which today ignores
  location.)
- **Move action:** `moveToServiceBay(carOrJobId)` / `moveToParking(...)`, bounded by
  `serviceBayCount`. Decide: manual only, or auto-pull-next when a bay frees.
- **Buy-bay actions:** `buyServiceBay` / `buyParkingBay`, priced from content (tunable), possibly
  rep/equipment-gated.

**UI:**
- A garage view that shows **service bays** (cars actively worked, with progress) vs **parking bays**
  (cars waiting), with move controls.
- A facilities/expansion affordance to buy bays (visible upgrade, ties into the eventual equipment
  shop).

**Tuning:**
- Bay purchase prices and the start/expansion curve, tuned *with* the labor pool and (later) staff
  wages via the balance harness — the crossover where "expand vs. hire" becomes the right call.

## Open questions (resolve at sprint start)

- Manual bay assignment vs. auto-fill-from-parking when a service bay frees.
- Whether bays are the first slice of a broader **equipment** system (lifts, dyno, welder — GDD §258)
  or ship standalone first.
- Staff-to-bay assignment (does a staffer occupy/attach to a bay?) — coordinate with Sprint 13.
- How the store's labor auto-planner (`planActions`) chooses *which* in-service-bay jobs to feed when
  labor is scarce.

## Dependencies & sequencing

- **Directly after Sprint 08 (service jobs).** Both service jobs and owned-car builds need to exist
  first (they're what bays gate).
- **Before or alongside staff (Sprint 13):** staff are the labor release valve the bay loop needs;
  the two are designed to interlock. Bays can ship first (labor = just the player) and staff plug in.
- Save-law: adding bay counts + car locations to GameState = `SAVE_VERSION` bump + migration +
  golden-save test, same PR.
