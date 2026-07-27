# Playtest notes, 2026-07-11 (maintainer, raw dump)

Second maintainer playtest, first one on the post-Sprint-24 build (foundational-economy arc
complete plus the hover-fix/UI-declutter hotfix). Raw notes below, lightly formatted but
otherwise verbatim; numbering is the maintainer's own. Triage and sprint mapping live in
`docs/sprints/sprint25.md` through `sprint31.md` (the Loop Rework arc); each note's
disposition is recorded there, not here.

1. Move the Upgrades button on the main garage page to the main menu bar at the top rather,
   as a top-level page.
2. When accepting a job, don't immediately add the car to the garage; the car should only
   appear in the garage on the next day. Immediate feedback after accepting the job with a
   message like "Thanks, I'll drop it off first thing in the morning."
3. "Time to go forced induction - build me some real power." is the very first job offered in
   a new game. No. A turbo install is insanely complicated. Ground the jobs in reality and
   have progression in the type of jobs that get offered: start with small brake and coilover
   replacement jobs, then work up to more involved jobs.
4. Right now a job is always just install-one-component. That's boring. We need more
   complicated jobs, e.g. "I put her in a ditch because my tyres were bad" = repair bodywork,
   repair suspension, repair engine, fit upgraded tyres. Themed jobs based in reality, with
   clear progression.
5. A job "Install forced induction part" pays 116,000 while the cheapest turbo is 180,000, so
   some jobs literally cannot profit. We need a proper FRAMEWORK for designing these jobs:
   proper progression, proper task combinations, proper flavour text, and proper profit math.
   We cannot just guess at this; build a system to build well-structured jobs.
6. Auction page: how is book value determined? If it's a static dumb book value linked to the
   car model, that needs rework. Mileage, age (regYear), condition all affect real-world book
   value; show that. Also explain the buyout price: 180k book with only a 91k buyout, why so
   low?
7. Inspection report on a car with a 91k buyout: body clearcoat peeling (minor, ~8,000 to
   fix); engine compression numbers the seller forgot to mention (minor, ~173,000 to fix). A
   173,000 MINOR fix on a 90k car. Also 60k to fix faint bubbling paint under wheelarches on
   a 150k car. The inspect feature is embarrassingly bad; the amounts look made up. This is
   the most critical finding.
8. How does the inspection mechanic actually work? If I inspect and find an issue, what can I
   do about it? Can I fix that specific issue? What if I just ignored it and flipped the car?
   What is the WEIGHT of this feature? Also: I paid for the information but don't own the
   machinery to act on it (greyed-out repair buttons), with no indication beforehand. 8k in
   the hole to learn something I can't act on.
9. The parts/components system is not nearly granular enough. Example: Honda City, engine
   condition 29%. What does that mean? Bought a "Street ECU" (one of three parts labeled
   engine), installed it, engine condition went 29 to 73, and "cosmetic condition" is
   reported as 100. What is cosmetic condition and why do we care? This needs a major rework,
   for everything: go more granular, every part needs a condition (pistons fair, block fair,
   piston seals poor, spark plugs worn, etc.). Rethink the current 8 categories; proposal:
   Engine (includes forced induction), Drivetrain (includes chassis/reinforcement),
   Suspension (includes brakes), Wheels, Body, Interior. Also remove the "needs Piston" text
   on almost all parts (that's the default; mark rotary-only parts with a tiny subtle rotary
   triangle instead). Remove the massive "needs Engine Crane etc" text next to every Replace
   button; move it to an on-hover tooltip.
10. Dragging a component from the inventory highlights/selects all of the page text. Very
    annoying.
11. Verbatim UI text: "Thanks - install forcedinduction part looks great!" Jibberish; raw
    ids are leaking into player-facing copy.
12. New critical rule going forward: NO EM DASHES ANYWHERE, EVER. Remove all em dashes
    immediately, especially in the actual game UI.
13. CRITICAL BUG: bought parts with standard delivery and they were NOT in inventory the next
    day; they arrived a day late. Express: add to inventory immediately. Standard: in
    inventory after ONE click of Next Day.
14. CRITICAL BUG in auction pacing: a car sat ~4 days with 0 bids (that alone shouldn't
    happen; why was the bid rate so low?), then one minimum at-reserve bid won the auction
    outright on the very next day-advance. Bad, inorganic experience; investigate.
15. Walk-in and list-publicly sale prices for the Honda City are very low. Is that the hidden
    issues exposed by the inspection? If I had NOT paid 8,000 to inspect, would those issues
    still be there? Am I paying 8,000 to make my own asset worth substantially less? THINK
    ABOUT THIS.
16. "Listings (1): Honda City E (AA), asking 18,060, resolves day 10." Is listing an
    automatic multi-day wait? Rework the whole listing/walk-in system: get rid of listings.
    The resource we play with is opportunity cost and storage space. Walk-in only: does the
    player accept today's offer or wait for a better one, occupying a parking space and tying
    up capital? New offer every day; figure out the algorithm and randomness coefficient; run
    the sims (when waiting n days, what is the likelihood of getting x% more than the initial
    offer).
17. Jobs and auctions should arrive organically. Right now everything dumps on the first day
    of the week and then nothing happens for 7 days. New job requests every day on a 0-4
    bell curve (usually 2, sometimes 1 or 3, rarely 0 or 4); auction cars listed across the
    week in an organic cadence. In general MORE jobs and MORE auctions: the player should
    feel they cannot possibly attend to all of them and must choose what to pursue and what
    to let expire.

Maintainer's summary: the biggest finding is that the repair and replace system, which is the
main gameplay loop, is not good enough right now and needs a total redesign.
