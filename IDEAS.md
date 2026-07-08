# IDEAS.md — scope-creep parking lot

Per roadmap risk R3, the GDD v1.0 feature set is **frozen**. Every new idea lands here first —
cost-estimated, honestly assessed against the design pillars, and scheduled **post-launch only** (if
ever). Being written down here is *not* the same as being in v1.0 scope. This file is tracked in the
repo (the maintainer chose to keep it visible rather than private) — but it is explicitly the
parking lot, not the roadmap.

---

## Driving minigame (wanted — optional, zero gameplay weight)

*Added 2026-07-08. Status: the maintainer wants this, explicitly as a purely-optional "just for fun"
mode with **no gameplay weight**. Not designed yet, not scheduled into a sprint — a post-launch /
expansion candidate, but a wanted one, not a likely-cut one.*

**The dream:** actually *drive* the cars you build, at least a little — a simplified top-down /
isometric driving physics minigame, rally-flavored, in the spirit of **Super Woden GP** but pared
way down. The emotional payoff: the car you hunted, restored, and tuned isn't just a stat block you
sell — you get to feel it move.

**Maintainer's standing intent (2026-07-08):** "I get that it runs against core design decisions but
I still want it, as purely optional and with no gameplay weight. It's just for fun." So the pillar
conflicts below are acknowledged and *accepted as an explicit opt-in exception* — this is a
sanctioned future exception, not an oversight to be talked out of. The job when it's built is to
honor the constraints, not to relitigate whether it belongs.

**Why it's exciting:** it closes the loop emotionally. Right now the build is abstract (radar +
numbers); driving would make the machine real. For a vibe-led game about car culture, "I can drive
the thing I built" is a powerful hook and a shareable moment (GIFs).

**Why it fights the current design — acknowledged and accepted as an opt-in exception (see intent
above); documented so the eventual build respects the pillars rather than bulldozing them:**

1. **Directly contradicts a hard design rule:** GDD / CLAUDE.md state *"No driving gameplay — events
   resolve via pre-run decisions + animated resolution."* This idea is the exact thing that rule
   rules out. Touge nights, wangan runs, attack fests are all currently designed as
   pre-run-decision + animated-cutaway resolution, specifically to avoid a driving engine.
2. **Contradicts the accessibility pillar:** *"No reflex-based input anywhere — no QTEs, no timing
   bars. Everything is decision-paced."* A physics driving game is inherently reflex-based. Any
   version of this would need a fully decision-paced alternative path so it never becomes a skill
   gate — which is a lot of design and build for an "optional" mode.
3. **Scope:** a driving physics engine (even simplified/arcade) is a *large* new subsystem — input,
   physics, collision, track authoring, a whole second art pipeline (top-down car sprites + tracks),
   tuning that maps build stats to handling feel, and mobile/touch controls. This is comfortably a
   multi-sprint effort on its own, i.e. a post-launch expansion, not a v1.0 feature.

**If it's ever pursued, the non-negotiable constraints:**

- **Fully optional and skippable** — never gates progression, money, or reputation. A player who
  never drives must be able to finish the whole game.
- **Decision-paced alternative preserved** — the existing "resolve events by pre-run decisions"
  path stays as the default; driving is an opt-in overlay on top, not a replacement.
- **Separate mode / separate milestone** — built as an isolated island (its own Pixi/physics scene),
  behind a clean boundary, so it can be cut without touching the core sim.
- **Stat-linked, not twitch-linked** — the build should matter more than reaction time (e.g. a
  better-built car is forgiving/faster on rails), keeping it closer to "management payoff" than
  "driving skill test."

**Verdict for now:** wanted but parked. It does not enter a sprint until v1.0 has shipped and the
core loop is proven — but it is a real, intended future addition, not a maybe. When it's time, the
constraints above are hard requirements (optional, decision-paced default preserved, isolated
cuttable module, stat-linked not twitch-linked), and the pillar conflict is already signed off as an
explicit exception. Do not re-argue whether it belongs; just build it right, small, and skippable.
