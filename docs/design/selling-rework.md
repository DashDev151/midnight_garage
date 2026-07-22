# Selling rework - design draft

**Status: APPROVED by the maintainer (2026-07-22), including the venue-name pools.** Not yet
implemented: the implementation sprint doc must list every new tunable (channel fees, offer
profiles, the matched-sale bonus value) for explicit sign-off per CLAUDE.md directive 22
before any agent launches. The maintainer's brief: selling is too flat; haggling is ruled out
as thematically wrong; every channel a cost and a purpose, EXCEPT the free-but-bad shop-front
channel (a sign in the window, the worst buyers), which is deliberately the zero-cost floor
of the table below. The rep-law check on section 2's matched-sale bonus PASSED with one
binding condition: the word-of-mouth bonus reveals diegetically (sale-close copy, Standing
screen arithmetic only), never as an ambient number (progression bible Law 4).

## The diagnosis

Selling today has one verb (accept/reject) against an anonymous dice roll. Everything below
exists to add real decisions, never minigames: no haggling, no timing, no reflex.

## 1. Listing channels

The decision: WHERE you list decides WHO shows up, at what cost, at what speed. One choice
per listing; re-listing on another channel costs that channel's fee again.

| Channel | Fiction | Cost | Speed | Buyer pool | Right for | Wrong for |
|---|---|---|---|---|---|---|
| The shop front | Price in the windscreen, car on the kerb | Free | Slow | Walk-ins: the weakest, most random taste rolls | Anything you are not in a hurry about | Anything special: the right buyer never walks past |
| The free ads paper | The weekly giveaway classifieds rag | Cheap, flat | Fast for cheap cars | Bargain hunters: students, first-car buyers, penny pinchers; taste caps low, offers land below value but ARRIVE | Shitboxes, honest tired cars | Anything above common tier (bargain hunters lowball it) or freshly restored (the polish is wasted on them) |
| The tuner magazine | A classified with a photo in a monthly | Real yen, per listing | Slow (monthly cadence beat?) | Enthusiasts: pay taste premiums for the RIGHT build (aftermarket-coherent, sporting models); ignore stock shopping-trolleys | Modified/sporting cars, coherent builds | Stock kei, anything rough (they laugh; wasted fee) |
| The trade network | A fax to the dealer circle | Percentage cut | Near-instant | Dealers: pay wholesale (below value, tight band, no taste upside) but pay NOW | Cash-flow moments, mistakes you want gone | Anything with real upside |
| The weekend meet | Take it to the parking-area meet yourself | A day slot + small fee | That day only | The scene: the one crowd that values the car for what it is; best taste realisation for the right car, nothing for the wrong one | Builds with identity, era heroes | Daily-driver fodder |

Config shape (content law, all tunable): per channel: `feeYen` (flat or fraction),
`offerChanceProfile` (per tier), `buyerPoolWeights` (which personas can arrive),
`tasteRealisation` (how much of the +/-12% band the pool can express), and per-channel
mismatch behaviour (a wrong-for-channel listing draws no-shows or lowballs rather than a
hidden penalty: the player SEES the wrong crowd shrugging, which teaches the matching).

Reuses: personas/buyers content, `valuateCarForBuyer`'s taste machinery, the daily offer
draw (`drawDailyOffers` gains a channel filter), the existing listing state. New: the
channel field on a listing, channel config, the mismatch presentation.

## 2. Making buyer-reading matter (the maintainer's challenge)

"All that matters is the price they will pay" is true at the moment one offer sits on the
table. Reading matters only if it changes a DECISION. Three mechanisms, all decision-shaped:

1. **The wait is a wager, reading sets the odds.** Rejecting an offer is already a verb, but
   today it is a blind one. With legible archetypes and channel-known populations, "hold or
   take" becomes a forecast: this is a student, students never pay top yen for an FD; the
   magazine crowd would, and that crowd checks in monthly; every day of holding costs rent.
   The archetype's visible WANT is mechanically its taste cap: reading it tells you the
   ceiling of this buyer and the plausibility of a better one. No new currency, just the
   existing taste band made forecastable instead of random.
2. **The right buyer pays in a second currency.** A matched sale (the car fits what the
   buyer visibly wanted) pays a small reputation/word-of-mouth bonus on top of quality rep;
   a mismatched sale pays yen only. Now a real trade-off exists: the dealer offers 1.03x
   and silence; the young enthusiast offers 0.97x, plus rep, plus a face you will see
   again. OPEN QUESTION for the maintainer: a new rep source must be checked against the
   progression bible's rep laws before this clause is designed further.
3. **Premium extraction becomes skill.** The +/-12% taste band exists today and lands by
   luck. Channel choice plus informed holding lets a player deliberately fish the top of
   the band on the cars that deserve it: the sell side gains the same read-the-situation
   skill expression the buy side got from the failure map.

If (2) fails the rep-law check, (1) and (3) still stand on their own: reading matters
because holding is a priced bet and the read prices it.

## 3. The receipts idea: parked, honestly

As pitched it had no mechanics (maintainer called it correctly). The mechanical version
(documented work narrowing a buyer's doubt discount, or gating premium buyers) requires
per-car work provenance the sim deliberately does not track: the same gap that already
blocks specialty-from-sales (see TODO). Parked unless that provenance system ever lands on
its own merits; not part of this design.

## 4. Venue names: rolled per save (approved shape)

Each auction tier owns a POOL of venue names; a new save rolls one per tier (seeded) and
displays it everywhere the tier name appears today. Pure flavour, zero mechanics, no
suffix-progression conceit. Implementation: content JSON pools, one roll at `newGame`,
stored on the save (Dexie bump only, per the pre-launch rule), display swap in the auction
screens. The pools below are DRAFT COPY awaiting the maintainer's red pen (registers per
their direction: dingy bottom, K.K. mid, big-house acronyms up top).

**Local yard (dingy):** Harumidai Car Land · Nishikage Auto Fair, No. 2 Yard · Midorizaka
Auto Plaza, Rear Lot · Sunadabashi Sunday Auto Market · Ozuhama Motor Pool · Shirahagi Auto
Fair, Annex Yard · Tobishima Auto Square No. 3 · Kanamori U-Car Plaza, East Lot · Rokugo
Riverside Car Yard · Kagemine Auto Ichiba

**Regional (proper mid-size firms):** K.K. Hamakaze Auto Exchange · Tsurumi Auto Auction
Hall · K.K. Ohgishima Motor Market · Keihin Car Exchange, Main Yard · Shonan Auto Fair,
Head Office Yard · K.K. Wakamatsu & Sons Auto Auction · Tsubakidai Auction Hall ·
Minamigawa Auto Auction, Yard B · K.K. Fujimidai Car Trading · Isogodai Auto Exchange

**Premium (the big houses, invented acronyms only, never real ones):** NCX Yokohama · UCS
Bayside · KAX Keihin, No. 1 Hall · AAN Tokyo Bay · Pacific Auto Exchange, Daikoku Hall ·
Aoba Auto Auction International · JXA Haneda · Makuhari Motor Auction Pavilion · NCX
Shonan · UCS Rinkai Hall

**Collector network (discreet, by introduction):** The Meisha-kai List · Katsuragi Private
Treaty Sales · Hozonkai Register, Setagaya · Kurogane & Partners, By Introduction ·
Shirakawa Collection Exchange · The Garage Azabu Ledger · Tsukishima Private Viewing Room ·
The Hayama Concours Circle · Onodera Estate Dispersals · The Daikanyama Consignment Book

## Out of scope, permanently

Haggling in any form (ruled thematically wrong); anything reflex- or timing-based; any
change to the value model itself (the channels shape WHO arrives and HOW the existing
bands realise, never what a car is worth).
