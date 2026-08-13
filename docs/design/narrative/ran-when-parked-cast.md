# Ran When Parked: The Cast Sheet

*Locked with the maintainer 2026-08-12. Eight named characters plus the player's own nameless
voice. All personal names are WORKING NAMES and freely replaceable; everything else (wants,
wounds, roles, system attachments) is the locked design. Sample lines are first-pass voice
references for the maintainer's pen, not shipped copy. House rules apply: no em dashes,
British English, no decorative Unicode.*

## The craft rules (locked)

1. **Write wants, not flaws.** Every character is the hero of a life that makes sense.
   Conflicts are between loves, never between good and bad people.
2. **No traditional antagonists.** The only villains in the game are rust, time, and the
   number 280. Every character must be likeable or magnetic; intrigue is an acceptable
   substitute for warmth, never for both.
3. **No character without a system, no system without a face.** Every cast member is
   attached to at least one live mechanic; depth comes from the want intersecting the
   player's actual play, never from backstory alone.
4. **Characterise through transactions.** What they buy, what they bring back, what they
   refuse. Dialogue trees and text walls are banned; recurrence with visible state change is
   the engine (their cars change between visits, ideally because of the player).
5. **The car is the mnemonic anchor.** Players forget faces and remember cars; every
   character owns one image on wheels that tells their whole story.
6. **The theme, stated once so nobody has to say it in game:** everyone in this cast was
   sidelined by the world in some way, and cars are how each of them refuses to disappear.
   The shop is the place where things worth saving get saved, and so are they. Yuki is the
   only one not yet sidelined, which is exactly why she gets the decade.


## What a face means mechanically (the anti-filler rule)

Every "scene face" and "channel face" claim in this sheet resolves to real systems:

1. **A channel is a character's buyer network.** The six `sellingChannels` map one-to-one:
   `shopFront` is the Mechanic's own door; `freeAdsPaper` is Yuki's world;
   `tunerMagazine` is Nagata's pages; `tradeNetwork` is selling to Ebisu's trade;
   `weekendMeet` is Dai-chan's meet; `collectorNetwork` is Kurogane's crates. Listing on a
   channel is diegetically handing the car to that person's crowd. The two story-earned
   channels (listing-channels.md) are `tunerMagazine` (Nagata's mission) and
   `collectorNetwork` (Kurogane's, held for the Hall of Legends arc).
2. **A scene face is the voice of that scene's commissions** (`sceneCommissions.ts`): the
   Respected-stage generated brief arrives from a named person, not a system.
3. **A face is the messenger of standing-stage changes.** The diegetic progression law
   already forbids meters and requires "who walks in" to carry progression; stage
   transitions are delivered as that face's visit and copy.
4. **A face is a weighted persona in their scene's buyer pool** (`personas.json`,
   `buyerPoolWeights`), so they recur as actual buyers, not cutscene guests.
5. **Two tribes have no channel, by design (D15):** racers and touge runners buy through
   word of mouth only (`wordOfMouthMultiplierByStage`), making theirs the two scenes where
   standing matters most. The paddock and the mountain cannot be advertised at; they hear
   about you, or they do not.

Any integration note below that cannot be traced to one of these four hooks, a named
mission, a content field, or a workstream in the economy brief is filler and must be cut.

---

## The Mechanic (the player; nameless)

**Bio.** Never named, never shown, never described. Exists only as the internal monologue
that narrates the work: dry, unsentimental, seen-it-all, and quietly romantic underneath,
in the voice already established by the tutorial and the diagnosis copy (the Vimes
register). The world's opinion of the Mechanic is the progression system; the Mechanic's
opinion of the world is the prose.

**System integration.** The narrator of everything: tutorial, diagnosis results, ledger
copy, sale reveals. The one voice that binds all systems.

**Voice, alone at the bench:**
- "Compression's even on all four. Somewhere, a small miracle is being wasted on this car."
- "The sheet says one owner. The four different reds under this trim say the sheet is an
  optimist."

**Voice, about the others (the cast seen through the Mechanic's eyes):**
- On Gonda: "He remembers every car that ever died in this prefecture. I try not to think
  about what that means he knows about the ones still driving."
- On Reiko: "She counts minutes like other people count money, and money like other people
  count minutes. I have stopped trying to win either conversation."
- On Ebisu: "The man sells seven-figure cars and takes the bus home. I used to think that
  was an act. It is the only thing in that showroom that isn't."
- On Nagata: "He talks about the 4G63 the way you'd talk about a colleague who deserved a
  promotion and never got one. Tomorrow we give it the promotion."
- On Dai-chan: "You hear the shop before you see it, and you see the car before you see the
  shop. He'd tell you that's the correct order of things."
- On the nurse: "Same two tyres, every month, worn in a pattern that has nothing to do with
  the speed limit. I fit them, I say nothing, and come winter I fit the good compound
  without being asked."
- On Kurogane: "He never asks what a car costs. He asks what it is. It took me years to
  understand those are different questions, and that only one of them is hard."
- On Yuki: "Her budget's grown three sizes since the bus pass died. The rust on my sign
  hasn't. Funny which of the two of us the decade is being kind to."

---

## Gonda (working name)

**Role:** the opening. Scrapyard owner; the man who got the Mechanic the lockup and stood
the Local Yard guarantee. Narrative driver one.

**Bio.** Sixties. Barely speaks, never advises. He is the undertaker of cars: every wreck
in the prefecture passed through his gate, and he remembers each one the way an undertaker
remembers faces, where it died, when, and how it rained. Everything in his yard is dead,
which is why he is the only man in the game who never lies about a car. In the middle of
the yard sits one immaculate machine: the first car he ever scrapped, forty years ago, a
rotary pioneer he has spent his whole life quietly un-scrapping, one salvaged part at a
time. The yard's single resurrection is the game's entire thesis standing in a field, and
its destination is the Hall's rotary plinth: at the end of the decade he donates it, the
one exhibit the shop never touched, accepted because the old man's hands were always good
enough. And the lease was never kindness. It was a commission: Kurogane needed a good
pair of hands, a space for them, and a member to stand for them at the auction house, and
Gonda chose the player and wagered on the choice. He will name the odds he gave,
eventually, once they have been beaten.

**System integration.**
- The scrapyard venue and the donor-lot species (Workstream C): his fiction IS the venue's
  honesty rule (everything here is dead, and priced like it).
- The identity system's oracle (Workstream I): when a quarter panel's filler raises a
  doubt, Gonda is where the player asks whether this car has died before. His memory is
  the accident-history check made diegetic.
- The decade clock (P3): the yard slowly empties across the years; his winding-down is a
  calendar landmark.
- **The Hall's intermediary** (`ran-when-parked-narrative.md`): the disguised early
  chapters arrive through him, and the bet with Kurogane is chapter zero. He owns the
  rotary chapter ("We gambled") via the donation.
- **The arc's recap system** (delivery law, narrative doc section 8): at each beat
  transition he compresses the case into one blunt line, in character, so even a skimming
  player carries the state forward.

**Voice:**
- "Everything in my yard is dead. That's why it's cheap."
- "That one? Guardrail, Hakone side, February '92. Rained all week. The front third is
  honest. Nothing behind the doors is."
- On the resurrection car: "It was the first one I ever cut up. Seemed only fair I be the
  one to take it back."
- On the lease, late in the decade: "He asked for a good pair of hands. I said I knew of
  one, going cheap. You want an apology or the odds?"
- Recap, during the endgame: "Paper says one thing. Car says another. You know which one
  I trust."

---

## Yuki

**Role:** the tutorial's first customer; the daily-drivers scene face; the decade made
visible. Already canon (personas.json: "Student. Bus pass expired, patience with it.").

**Bio.** A student who saved all year for four wheels that will pass inspection. Not
sidelined, not wounded, not mysterious: she is ordinary life, growing up through the
forecourt. Her recurrence IS her character: the tutorial kei, then a first-job budget a
few years on, then the day a child seat will not fit in the old car. Her cars changing is
how the player feels the years passing.

**System integration.**
- The tutorial (existing).
- Daily-drivers scene face: the buyer archetype the whole entry tier exists to serve;
  the `freeAdsPaper` channel is her world (the paper a student actually reads).
- Hall chapter: "First, we moved" (the people's kei; the first disguised commission).
- P3's fictional-time pillar, embodied: her visits partition the career into chapters.

**Voice:**
- Tutorial era: "It doesn't have to be nice. It has to start in the rain."
- First-job era: "I have an actual salary now. I'd like the windows to close. Both of
  them."
- Later: "The little one gets carsick in the back of the old one. Mum says it's the
  suspension. Mum is usually right."

---

## Reiko (working name)

**Role:** Regional auction guarantor; the racer scene face; the fleet.

**Bio.** She was a racing driver, or would have been, in the early seventies, when no team
in Japan would sign a woman. Driving cabs was the only professional wheel anyone would
offer, so she took it and built a fleet out of it. The uptime obsession is love wearing
overalls: every cab is a driver with a family, most of them people the trade discarded
the way it discarded her, and she knows every driver's kid by name. She keeps the old
Cedrics alive past all sense out of loyalty, which is why she needs the Mechanic. Late in
the career she brings in a bare chassis and finally commissions the build she was owed in
1972. If drive mode ever holds one purely ceremonial moment, it is her shakedown lap. The
player does not drive it. She does.

**System integration.**
- Regional guarantor mission (auction-guarantors.md's fleet-owner slot, now with a spine).
- The service-bay and fleet-work fiction: her cabs are recurring service jobs with a face.
- Racer scene face; the paddock has no paid channel (D15) and finds the shop through
  word of mouth alone. Her late commission is a flagship story mission.
- Drive mode touchpoint: her lap is ceremony under the drive-mode laws (she drives, so
  attendance-not-aptitude is satisfied by construction).
- Hall chapter: "Then we learned to win" (the touring legend, built to period race trim,
  set in the years that refused her).

**Voice:**
- "That's forty minutes of fares you cost me. I docked it from what I owe you in
  gratitude. You're still ahead."
- "Number six has a daughter starting university. Number six's clutch does not get to fail
  this year. Understood?"
- The commission: "Nineteen seventy-two, they told me the seat was taken. It wasn't. It
  was mine. Build me the car I was going to put in it."

---

## Ebisu (working name; yes, the god of fortune, and he would find that funny)

**Role:** Premium auction guarantor; the top of the walk-in market; the bubble's ghost,
smiling.

**Bio.** He made a fortune in the eighties and lost every yen of it in '91, keeping only
the showroom. Now he sells the bubble's orphans: repossessed Aristos, abandoned Soarers,
cars whose owners' fortunes died underneath them, and he is genuinely cheerful about it,
because losing everything taught him exactly which things were ever his, and the answer
was none of them, and that turned out to be freedom. He knows every car's previous
owner's fate and mentions it lightly, without cruelty. The image that carries him: the
man who sells the most beautiful cars in the prefecture takes the bus to work. He vouches
for the Mechanic because the Mechanic fixes things, and the bubble was ten years of
people who didn't.

**System integration.**
- Premium guarantor mission (auction-guarantors.md's dealer slot).
- **The `tradeNetwork` channel is him**: the fee-free, no-forecourt, instant-offer channel
  is diegetically selling to the trade, and the trade is Ebisu. Its 3x offer chance and
  its price band are his handshake.
- The voice of provenance on bubble-era cars: generation already rolls each car a history
  (`generation-damage.md`, provenance.json); his copy is where a repossessed Aristo's
  rolled past gets said out loud.
- Hall chapter: "Then the world noticed" (the export hero; the salesman canonising the
  car that invented his trade).

**Voice:**
- "Lovely thing. Outlived a golf-course developer."
- "I owned eleven of these once. Well. The bank and I owned eleven of these. The bank was
  always going to win the custody dispute."
- "You fix them. Do you know how rare that was, back then? We were ten thousand men buying
  things, and not one of us could mend anything."

---

## Nagata (working name)

**Role:** the tuner scene face; the tuner magazine's technical editor; the man who wrote
the polite number.

**Bio.** Ex-factory powertrain engineer, early-retired in the post-bubble restructuring.
The gentleman's agreement governed the PUBLISHED figure, never the metal, and his
signature lived on the paperwork: he wrote 280 on engines that made 320, while the export
documents for the same car told Europe the truth. A career of certified understatement.
(The game already models this: `spec.quotedPowerPs` sits beside `spec.stockPowerPs` in
cars.json, a polite lie in the data with no fiction attached until him.) After the
restructuring, the tuner magazine hired his credibility; he runs the dyno column. His
want: to correct the record before he goes. And the reason he needs the Mechanic is
structural: a factory engineer designs and certifies; he never once builds. Thirty years
of drawings, dyno cells and sign-off stamps, not a gram of swarf under his fingernails,
and the restructuring took even the dyno cell away. The shop is his hands, and the first
build it finishes for him is the first running engine of his career he has ever touched.
He refers to engines by their codes, like former colleagues, because they are.

**System integration.**
- **The `tunerMagazine` channel is his buyer pool**, and his story mission is its unlock
  (one of the two story-earned channels, listing-channels.md). Listing a matched car there
  is listing in his pages.
- **His commissions are dyno-target builds** verified on the shop's actual dyno
  (`dyno.ts`): "make her make the number the export sheet promised." Later commissions
  demand tier-3 tools and craft operations, making him the machining system's recurring
  customer.
- **He is the mouthpiece for `quotedPowerPs` vs `stockPowerPs`**: existing content fields
  that currently have no voice. His copy is where the game says out loud that the brochure
  and the engine disagree.
- Tuner scene face per the four hooks above (commissions voice, standing messenger, pool
  persona).
- Hall chapter: "We told polite lies" (the 280PS liar, uncorked to export truth on the
  shop's dyno; his correction of the record, in metal).

**Voice:**
- "The brochure says two-eighty. The brochure is being polite."
- "In Europe she was allowed three-twenty. Same engine. Better manners on paper here,
  that's all."
- "I wrote the polite number. Print run of forty thousand. I should like to correct the
  record before I go."
- At the first finished build: "Thirty-one years. That is the first one I have ever
  touched while it was running. They are warmer than the data says."

---

## Dai-chan (working name)

**Role:** the show-crowd scene face; the paint system and the style stat made flesh.

**Bio.** Runs a paint-and-sign shop. Laughs like a landslide, dresses like a pachinko win,
and judges every car by exactly one criterion: does the street turn around. Shakotan and
early VIP style; loud, low, gleaming, and completely unashamed that he has never once
asked how anything drives. The spine under the volume: he grew up poor and invisible, and
a slammed, mirror-finished car was the first thing that ever made anyone look at him. The
loudness is generosity now; he wants everyone to get looked at. He remembers every kid's
first car and makes an event of it, and when one of the shop's builds debuts, his crew
turns the forecourt into a festival.

**System integration.**
- **The `weekendMeet` channel is his meet**: its one-draw-per-weekend cadence and
  matched-only rule are his door policy.
- Show-crowd scene face per the four hooks; his commissions arrive through
  `sceneCommissions.ts` and price the style/desirability system's outputs.
- The paint system's fiction (he is, professionally, the paint).
- Shows as calendar events (P3 landmarks): the weekend cadence already in the channel
  data is the hook his festivals hang from.
- Hall chapter: "The street answered" (the kaido racer; the modification exhibit that
  argues tuning culture into the canon).

**Voice:**
- "How does it drive? Brother, the road is three metres wide and the crowd is on both
  sides of it. It drives at walking pace, beautifully."
- "Nobody looked at me until the car. So now the car looks back. That's the whole
  philosophy, no charge."
- "First cars get the full polish. House rule. Everyone remembers their first time being
  seen."

---

## The Night Nurse (name deliberately unwritten; mountain name learned secondhand)

**Role:** the touge scene face.

**Bio.** Works nights at the hospital over the pass; the mountain is simply the commute,
and has been for years. Polite, unhurried, tired-eyed at seven in the morning, and buys
tyres in pairs with a wear pattern that has nothing to do with the speed limit. Nobody at
the hospital knows. On the mountain they have a name, and the player only ever learns it
secondhand, from other drivers, never from them. Gender undecided and it should stay
unremarkable either way.

**System integration.**
- Touge scene face per the five hooks; the touge tribe has NO paid channel (D15) and
  reaches the shop only through word of mouth, which is the character's whole texture
  made mechanical.
- **A recurring service-job customer** (`serviceJobs.ts`, `serviceJobTemplates.json`):
  the tyre-and-pads fitting jobs arrive on a cadence, from the same named customer, with
  a wear pattern in the copy. Transactional characterisation on an existing system.
- The one character whose story the player assembles entirely from purchases and rumours:
  the diagnosis fantasy applied to a person.
- Hall chapter: "We made the mountains ours" (the hachiroku restored to driven spec:
  hero's wear, not concours shine).

**Voice:**
- "Just the usual pair. Fronts. Yes, again. It's a long commute."
- "Someone on the hill asked if I knew the car with your sticker in the window. I said I'd
  ask around."
- Seven a.m., quietly: "Winter compound this month, I think. The forecast says the
  forecast is wrong."

---

## Kurogane (canon name; Collector Network guarantor, held for the Hall of Legends arc)

**Role:** Collector Network guarantor; the collector scene face; the Hall's founder;
narrative driver two.

**Bio.** The man you call when a car's story needs proving. He repatriates the important
cars Japan sold abroad before it knew what they were; papers are his religion, and the
quiet crates hold cars whose truth he has personally verified. His public work is the
Hall of Legends: the first museum of a culture that does not yet know it is one, built a
decade too early, and he is patient about being laughed at, because he bets. The shop
itself was his opening move: in the beginning he asked Gonda for a good pair of hands, a
space for them, and a guarantor at the auction house, and the player was the answer
(chapter zero; the reveal lands mid-career when the player finds their own early work on
the plinths).

His wound, revealed at the end: **he is hunting the record car because he is the one who
sold it.** The grail is the 2000GT that ran the 1966 72-hour endurance trial through a
typhoon and set the records that announced Japan to the world. In 1970 a collector wanted
that specific chassis; it could not be had; so a young, brilliant Kurogane shipped an
ordinary 2000GT wearing the record car's identity, and, because he held the provenance
file, bent the official record by one digit so paper and substitute agreed. The deal made
his name. The consequence he did not foresee: the TRUE record car, still in Japan with
its real numbers, was now officially abroad, so it has spent twenty-five years being
rejected as a fake of itself. He did not lose the car; he erased it. The repatriation
empire, the religion of papers: one long apology in progress. He cannot authenticate the
grail himself, for two reasons that are really one: a man cannot referee his own hope,
and the forger's testimony is worthless. Only the metal can speak, and the player is the
one who reads metal, which is why the confession is not given but ARRIVED AT: the player
walks into the warehouse with the accusation. Full arc: `ran-when-parked-narrative.md`.

**System integration.**
- Collector Network guarantor (canon: the-quiet-crate, held for the Hall of Legends arc);
  **the `collectorNetwork` channel is his crates**, the second story-earned channel.
- Collector scene face per the four hooks (commissions voice, standing messenger, pool
  persona).
- The Hall of Legends arc (D14): commissions every plinth chapter; owns the AZ-1 chapter
  ("We could afford to be unreasonable"), the public bet that earns the laughter.
- The identity endgame (economy brief section 10): the authored authentication missions
  are his, culminating in the 2000GT hunt, where his 1970 falsehood is the trap that
  catches forgers and the signature that proves the true car.

**Voice:**
- "Anyone can tell you what it costs. I am asking you what it is."
- "The chassis number is correct. The stamping is not. Someone wanted this car to be true
  so badly they forgot that true things are stamped by tired men on a Friday."
- On the grail, once: "It left in 1970, on a boat, in the rain, and every paper that says
  so is lying about something small. Find me the small thing."
- The confession, at the end: "You are asking who could have written papers that good.
  I was twenty-six, and I was very good."
- The callback, spoken for the skimmers: "I told you the papers were lying about
  something small. I never said I did not know what."

---

## Coverage table (every role filled, every face employed)

| Need | Character |
|---|---|
| Tutorial customer | Yuki |
| Local Yard guarantor / opening | Gonda |
| Regional guarantor | Reiko |
| Premium guarantor | Ebisu |
| Collector Network guarantor | Kurogane |
| Scrapyard owner / donor venue | Gonda |
| Daily drivers scene | Yuki |
| Racer scene | Reiko |
| Collector scene | Kurogane |
| Show crowd scene | Dai-chan |
| Tuner scene | Nagata |
| Touge scene | The Night Nurse |
| Narrative drivers | Gonda (the bet, the resurrection), Kurogane (the grail) |
| Identity system faces | Kurogane (papers), Gonda (deaths) |
| Drive mode ceremony | Reiko's lap |
| Period history | Ebisu (the bubble), Nagata (the 280 cap) |
| The decade clock | Yuki's cars; Gonda's emptying yard |
| `shopFront` channel | The Mechanic's own door |
| `freeAdsPaper` channel | Yuki's world |
| `tunerMagazine` channel (story-earned) | Nagata |
| `tradeNetwork` channel | Ebisu |
| `weekendMeet` channel | Dai-chan |
| `collectorNetwork` channel (story-earned) | Kurogane |
| Hall chapters (one each, `ran-when-parked-narrative.md`) | Yuki, Reiko, Ebisu, Gonda, Dai-chan, the Nurse, Nagata, Kurogane |
| The 2000GT verdict | The Mechanic |

Eight characters, no one-job characters, and no scene without a face.
