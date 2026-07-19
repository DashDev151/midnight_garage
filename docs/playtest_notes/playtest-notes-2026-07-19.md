# Playtest notes - 2026-07-19 (fresh start, post-Sprint-94 build)

Maintainer playtest against committed main (81c76f1, Sprints 00-94). New game from day 1,
unstructured notes captured verbatim-in-substance below, per the standing triage workflow:
capture formally, verify ambiguity against code, then design sprints. This pass focuses on
the tutorial; the maintainer flagged more notes may follow as the playtest continues.

Triage classes used below: **BUG** (defect, root cause needed), **SYSTEM** (design rework),
**TUNE** (number change, knob), **UI** (layout/presentation), **COPY** (content tone).

Overall maintainer verdict on the tutorial: it half-guides. It names concepts without
telling the player where to go, what to click, why they are doing it, or what happens
next. The rebuild bar is: explicit and accurate guidance at EVERY step of the first loop,
each action given a reason, verified by personally tracing every step against the running
flow (no delegated sign-off).

---

## The items

### 1. Cold open: "Who is Yuki?" (COPY + SYSTEM)

The very first walkthrough note talks about Yuki as if the player knows her. There is no
indication this refers to the story job sitting under the Jobs tab. The player's first
screen (the garage) gives zero orientation. Wanted: the walkthrough must introduce the
place before the person, and explicitly point at the Jobs tab when it first mentions the
job.

### 2. Copy cuts in step 1 (COPY)

Two lines ordered out of the opening step:

- "that is the budget and the pay both" - a design-correction artefact leaking into
  player copy; the sentence reads awkwardly. The one-price model should be shown, not
  explained defensively.
- "This first one is about learning the work, not the money." - cringey, cut.

### 3. Full walkthrough copy review (COPY)

The voice is too clinical and aphoristic ("The room prices what it fears.", "Reserve is
the seller's floor."). Reframe every note organically, with motive: e.g. the Wagon R note
becomes, in substance, "here is a car that may work for Yuki; nothing special, but that
listed fault might scare off the room; let's inspect it and see if we should take a
chance on it". Every instruction needs a REASON attached: why inspect (risk vs reward:
the fear may be unearned and the discount real), why bid rather than buy-now, why end the
day. The tutorial voice itself may change if needed.

### 4. Orientation tour of the tabs (SYSTEM + COPY)

Add walkthrough coverage that shows the player the rooms: this is your garage (bays,
cash, labour), this is the job board (customers post work), this is the auction house,
the parts shop, and so on. Right now the tabs are never introduced.

### 5. Overworld map proposal (SYSTEM, maintainer proposal, needs scoping)

Standing maintainer want ("I still think"): instead of, or in addition to, the top tabs,
a representational overworld map with the places on it (your garage, auction house, parts
shop, staff centre, ...). Navigation as a place, not a menu. Note: presentation/navigation
rework, not a new mechanic, so arguably outside the GDD feature freeze, but it touches
the art bible's diegetic-UI law and needs its own design pass and maintainer sign-off on
scope (v1.0 or post-launch).

### 6. "Local Yard - where is that?" (COPY)

The walkthrough says "Open the Local Yard" with no path to it. Guide explicitly: there
are several auction houses; right now the Local Yard is the only one with stock we can
afford; go to the Auctions tab and open it. The tutorial must GUIDE, not allude.

### 7. Safeguard: no random Wagon R beside the scripted one (BUG-class safeguard)

Make sure the day-1 random lot generation cannot spawn a second Suzuki Wagon R alongside
the scripted tutorial Wagon R (CT21S). If the RNG can duplicate the tutorial model while
the scripted lot is live, the player cannot tell which car the walkthrough means. Add an
explicit exclusion.

### 8. Inspect button prominence + motive (UI + COPY)

The "Inspect here (10 labour + ¥2,000)" button is super easy to miss (small chip, far
corner of the lot card). Make it visually prominent, and have the walkthrough explicitly
direct the player to click it, explain what inspecting at an auction house is, and what
the labour/cash cost buys (the truth about the listed fault before committing money).

### 9. Walkthrough box must be draggable (UI)

The fixed walkthrough panel sits over critical text at times. Make it draggable so the
player can move it out of the way.

### 10. Post-bid dead end: "bid placed... now what" (SYSTEM + COPY, the big one)

After placing the bid the tutorial goes silent. Nothing tells the player the auction
resolves at end of day, that they should end the day, that the car arrives, how to get it
into a bay, how to repair to the mission bar, or how to hand the car to Yuki. The
walkthrough must cover the ENTIRE first loop step by step: accept job -> find car ->
inspect -> bid -> end day -> win -> car arrives -> into the service bay -> repair every
part to worn+ within budget -> show Yuki the car -> payout. Each step triggered at the
right moment, each telling the player exactly what to do next and why.

### 11. No other jobs during the tutorial (SYSTEM)

While the tutorial is running, the job board must hold ONLY Yuki's job. Normal radial
jobs start appearing only after Yuki's job is done (and immediately for skipped
tutorials and non-tutorial careers; the gate is the tutorial, not the calendar). The
2026-07-19 build showed Mrs. Ito's radial job beside Yuki's on day 1, splitting the
player's attention during onboarding.

### 12. Service diagram condition unreadable at a glance (UI)

The tiny condition dot in the top-right of each diagram part is basically impossible to
read at a glance. Wanted: some way to actually see part condition from the diagram; the
maintainer's suggestion is a semi-transparent condition-coloured background (e.g. on
hover), but the binding requirement is glanceability, with the art bible's colour
discipline respected.

### 13. Tyre change flow is overcomplicated and unguided (SYSTEM + UI, live rage)

Mid-playtest, stuck at the bench with the wheel assembly off (Rims worn / Tyres scrap
chips, "machine shop assist +¥3,000", "Refit assembly", "restoration bill ¥70,590",
"Planned work (0)"): "how the FUCK do I change the tyres? What button must be clicked?
Clean this shit up." Requirements: (a) walk the flow click by click AS A PLAYER and
document exactly where each next click is; (b) simplify the interaction path itself, not
just the copy; (c) the walkthrough must name the actual buttons.

### 14. Tone directive: the tutorial sets the game's tone (COPY, maintainer directive)

"Use the tutorial to set the tone of the entire game: lighthearted and wholesome, with
some more challenging sections and complicated economy management; kind of a management
game with cosy elements. Use the tutorial's voice to build this vibe." Applied as a full
warm pass over the Sprint 95 script (the sprint doc carries the voice contract), and
standing law for all future player-facing copy.

### 15. "Job board" is the wrong fiction (COPY + SYSTEM framing, maintainer ruling)

"This isnt a medieval fantasy village that posts jobs in the middle of town for a witcher.
Its just a mechanics shop. Clients Will Call, or just walk in." Maintainer chose the
reframe (from three options): **the office phone**. Radial offers are calls and
answering-machine messages; accepting is ringing back and booking the drop-off (which is
exactly the existing arrives-tomorrow mechanic); story customers are walk-ins standing in
the shop. Fleet work arriving by fax is noted as a period-true future hook. Sprint 97.

### 16. Process ruling: no delegated tutorial sign-off (PROCESS)

The previous tutorial was drafted by an agent and signed off without a genuine
step-by-step trace. Ruling: the orchestrator personally authors the walkthrough copy and
personally traces every step's trigger and screen state through the flow before it
ships. Delegated drafting is fine for scaffolding only; the sign-off must be real.
