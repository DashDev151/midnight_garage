# Sprint 212: the labour laws

**Status: APPROVED (playability pass, playtest notes 2026-08-16 session 3).** Covers
S3-11, S3-12, S3-6/S3-7 (sim half: interior and aero belong to the body bay).

**Levers (behaviour-first):** the felt statements below ride the guard re-pin.

## Tasks

### A. Assembly refit is a set figure (S3-11)

Verified: refit charged per CHANGED member (4 x buried 6 x machineless 3 = 72; one
changed member = 18), where "changed" means any band or SKU difference from the
vacated baseline. Ruling: fitting an engine takes the same labour however many
members changed.

- A1. `refitAssemblyLaborSlotsFor` returns a flat per-assembly figure from
  `energy.actionPoints` (repricing the existing `refitAssembly` key), times the
  machine multiplier. The per-member changed/unchanged fork dies in the assembly
  path; the parts bill still charges changed members' prices.
- A2. `taskLaborChain` prices assembly refits with the same flat figure so a
  customer quote and the player's own refit never drift.
- A3. Felt statement: "an engine goes back in for the same sweat whether you touched
  one cam or all four corners of it; the machine line, not the parts list, decides
  the pace." Chosen values: `refitAssembly` flat points per assembly sized so the
  machine-less engine refit lands near the old ONE-changed-member cost (about 18
  points), never the old four-changed cost.

### B. Install respects the graph downward (S3-12)

Verified shape: refuse INSTALLING part X while any REQUIRED slot listing X in its
`blockedBy` is currently EMPTY. "Required" reuses `isPartMissing`'s own carve-out
(everything except `forcedInduction` on an NA car). The wheel assembly is the sharp
case: today nothing stops refitting wheels over five empty brake/suspension slots.

- B1. `slotsBlockedByPart` inverse query beside `occupiedBlockers`; the refusal
  wired into `installFitGate` (new `job-blocked` reason, e.g. `blocks-access`) and
  into `resolveRefitAssembly` for members (external slots only).
- B2. The reason reaches every surface: the day-log copy map, the proactive picker
  filters (`installablePartsFor`/`installablePartsForPart`), a new install-side
  why-not reason (sibling of `removeBlockedReason`) surfaced on the fit controls,
  and the assembly panel's refit row.
- B3. Copy: "The {slot} under it is still empty - fit that first." idiom.

### C. Interior and aero are body-shop work (S3-6, S3-7 sim half)

- C1. Repair/install/remove for `interior`-group parts and `aero` gate on the BODY
  bay (`carInBodyBay`), not the service bay; refusal reason names the body bay.
- C2. The game surfaces those actions in the body shop room (the UI hosting moves in
  Sprint 211's screen; this sprint makes the sim gate true and the store reasons
  right). The interior remains band-machinery (no new mechanics); the fuller
  interior treatment is future design.

## Definition of done

- Engine refit charges the flat figure at every site (player refit, quote, replay).
- No part can be fitted over a required empty slot anywhere (slot, assembly, drag,
  pick, bot), and every surface says why beforehand.
- Interior/aero work requires the body bay and says so.
- `pnpm typecheck` (signatures move); narrowest tests once; pre-push is the gate.

## Exit

**Implemented 2026-08-17. All green.**

- **A.** `refitAssembly` repriced 0 to 6 flat points; the per-member fork is gone
  from the assembly path and `taskLaborChain` prices identically, so quotes and
  refits never drift. Machine-less engine refit is 18, never 72. Felt statement
  recorded with the guard re-pin.
- **B.** `slotsBlockedByPart`/`requiredEmptySlotsBehind` wired into `installFitGate`
  and `resolveRefitAssembly` (reason `blocks-access`); the pickers filter
  proactively; new `installBlockedReason` getter surfaces "The {slot} under it is
  still empty - fit that first." on the fit controls (lead-wired). The wheel
  assembly can no longer bolt over empty brakes.
- **C.** Interior and aero jobs demand the body bay (`not-in-body-bay` reused); bots
  taught to wait for or skip what they cannot reach (the investor's install step
  waits on the bay; a real gap, since bots cannot move cars to the body bay at all,
  noted for the harness rework).
- Golden hashes re-derived per convention; the clock's comment vocabulary cleaned
  where the hygiene guard flagged it at merge.

**Evidence:** merged tree 230 files / 4,758 tests green, typecheck clean. Pre-push
re-verifies at push.
