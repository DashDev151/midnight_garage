# MIDNIGHT GARAGE - Car Roster

## v2.3: the single source of truth for the full 94-car roster

*Companion to GDD v0.6 section 4. Real specs per GDD section 2.4 naming layer.*

**The data lives in `midnight-garage-roster.csv`, beside this file. All 94 cars, all 56 per-car
values, one row each.** Edit it in a spreadsheet. **Nothing else may carry a second copy of any
value in it**, and the markdown tables that used to sit in section 3 were deleted so that nothing
can.

**This document is the legend for that file**: what the tiers mean, what the culture classes are,
what the three per-car game constants do, the Legends, the easter eggs, the identity rulings, and
the open questions. **A number about one car goes in the CSV. A rule about all cars goes here.**

Two documents feed the CSV and neither is canonical on its own:

- **`reference/period-scans/roster-price-list-v2.md`** is the **price provenance only**. Every
  `priceYen` in the CSV came from it, and its per-car anchors, tags and override log are the
  justification. **Its own tier names (Starter, Club, Semi-pro, Pro/Legend) are DEAD.**
- **`packages/content/data/cars.json`** is the shipped subset: 26 of the 94. The CSV carries its
  `bookValueYen` in its own column beside `priceYen`, **so any disagreement between design and
  content is visible in one glance rather than needing an audit**. They currently agree on all 26.
  Where they diverge, the CSV is right and `cars.json` is the thing to change; section 5 lists the
  tier disagreements that remain.
- **`car-performance/data/forza-fh6-roster-data.csv`** supplied the measured figures for the
  cars not yet in content. The `specSource` column says which of the three fed each row.

## NINE PRICES ARE STAND-INS, MARKED (TBC)

**Every other figure in this roster is evidence-backed**: a dated period observation, a
bracketed interpolation between two real observations, or a recorded maintainer override, each
justified car by car in the provenance document.

**The nine marked (TBC) are none of those.** They were chosen to read correctly against their
neighbours and nothing more. **They must not be treated as research, quoted as period fact, or
authored into `cars.json` before they are properly sourced.** Section 4 lists all nine and says
what sourcing them takes.

---

## 1. The four tiers

**`entry`, `everyday`, `enthusiast`, `flagship`.** Locked. These are the only tier names, in
content and in prose alike.

A tier is **the class of parts a car takes and what a buyer expects of it**, and the roster is
ordered so that **the tiers ascend in price**. The two are the same axis nearly everywhere,
because a dearer car takes dearer parts. Where they disagree, the price band wins.

| tier | price range | count | what lives here |
| --- | --- | ---: | --- |
| **entry** | 100,000 to 420,000 | 18 | keis, kei utility, and ordinary small saloons and hatches |
| **everyday** | 440,000 to 820,000 | 19 | the cheap end of fun, and the keis whose parts were genuinely scarce |
| **enthusiast** | 750,000 to 2,380,000 | 26 | the sports cars the game is actually about |
| **flagship** | 2,450,000 upward | 31 | homologation specials, halo cars, classics, exotics |

**One deliberate overlap: everyday into enthusiast, 750,000 to 820,000.** The 180SX is the only
enthusiast car below 850,000, and it is there because it shares its platform, its parts and its
entire aftermarket with the S13 and S14. Three `everyday` cars sit above it.

The other two boundaries are clean steps, and that is the intent: entry to everyday is where a
player stops buying transport and starts buying cars, and enthusiast to flagship is where the
endgame begins.

---

## 2. Culture: what scene a car comes from

**Thirteen classes, one axis: the scene a car belonged to in period Japan.**

**Culture answers "who bought this, and why did they want it".** Not what layout it has, not
where it was built, not what it cost. Those are `tags`, `origin` and `bookValueYen`, and they
answer their own questions.

**No class is a proxy for `origin`, and this is a hard rule.** An earlier pass created a
`Gaisha` culture for the cars whose Japanese appeal was "it is European". It read as though it
were the foreign-car class, which it could never be: the Ferraris are `Exotic`, the Integrale is
`Rally-bred`, and the Escort Cosworth sits beside a Subaru. Two names for one idea, disagreeing.

**So the axis was restructured instead of renamed, and every mixed class now holds both
Japanese and foreign cars.** `Oddball` runs from a Nissan van to a Mini. `Touring car` puts both
M3s beside the Skylines. `Front-drive tuner` has a Golf among the Hondas. `Exotic` has a Ferrari
and an NSX. **Whether a car is foreign is `origin`'s job and it stays there.**

**This is a documentation grouping only. It is not a content field**, so it cannot drift into a
second source of truth.

| culture | n | what it means |
| --- | ---: | --- |
| **Kei** | 11 | The 660cc class, sporting or not. Its own rules, its own yellow plates, its own aftermarket, and a whole industry that exists because of a tax bracket. |
| **Rally-bred** | 10 | Built in numbers so somebody could go rallying. Gravel homologation with a road registration and a warranty. |
| **Drift** | 9 | The FR turbo scene. S-chassis, JZX saloons, cheap rear-drive saloons bought for what they do sideways, and worth what the scene says they are worth. |
| **Touge** | 7 | The mountain pass. Light, balanced, momentum cars driven hard on a road that turns 200 times. Grip or slide, the pass does not care. |
| **Wangan** | 8 | Big, fast, and pointed down a motorway at night. Top-speed money: the bubble's serious coupes and the sleeper saloons that quietly kept up. |
| **Honest transport** | 7 | Base-spec saloons and hatches with no performance pretension. Somebody's commute. The service work that keeps the lights on, and the game should be fond of them. |
| **Kyusha** | 7 | Pre-1975 Japanese classics. Provenance matters more than performance, and the wrong engine costs more than a bad respray. |
| **Touring car** | 7 | Group A and what grew out of it: circuit homologation, and the lineages that inherited it. |
| **Front-drive tuner** | 7 | Front-drive taken seriously by people who were told it could not be. Turbo hatches, the VTEC ladder, and the coupes that ran the same engines. |
| **Exotic** | 6 | Supercars, foreign or not. Bought as objects, feared as jobs, and priced accordingly in both directions. |
| **Oddball** | 5 | Bought with the heart, over the accountant's objection. A snail van, butterfly doors, a glass canopy, a transaxle saloon nobody could service. Fond, not mocking. |
| **Kurokan** | 5 | Cross-country. Ladder chassis, low range, and the RV boom that made all of it fashionable. Bought to leave the tarmac, whether or not the owner ever did. |
| **Rotary** | 5 | Mazda's stubborn corner of the world. A parts island and a knowledge island, and the reason a specialist exists at all. |

**Balance: 5 to 11 per class, mean 7.2.**

### How this axis was arrived at, and the calls worth re-opening

**`Homologation` was 19 cars, a fifth of the roster, spanning ¥560,000 to ¥9,471,000.** It has
become **Rally-bred** (gravel) and **Touring car** (circuit). **`Grand tourer` was a Western
label for a specific Japanese thing** and is now **Wangan**, which is also the setting this game
is about: the Bayshore Route, Mid Night Club, 1990 to 1999.

**`Touge` was the largest gap and 1995 is exactly its moment**, the year *Initial D* began
serialising. It had been split three ways, which is an analytical split of what was culturally
one thing. The AE86, both MR2s, the Roadster, the CR-X, the EG6 and the S2000 are now together.
**`Lightweight` was dissolved into it**: a motoring-press category rather than a scene.

**Touge and Drift genuinely overlap and the split is a judgement.** The rule applied: **Drift is
the cheap rear-drive turbo bought to slide; Touge is the light balanced car bought to carry
speed.** The AE86 is the honest crossover and it sits in Touge, because that is what it is
famous for.

**`Oddball` replaced `Bubble curio`, and it is a narrower idea on purpose.** Two earlier attempts
at this class failed by being too broad. `Bubble curio` grouped by era, and era already lives in
`tags`. `Showpiece` grouped by "bought to be looked at", which flattered some cars and libelled
others: nobody bought an S-Cargo to be admired, and a Prelude Si VTEC is a tuned FWD coupe
before it is a fashion item.

**What the five actually share is that they are odd choices, bought with the heart.** A snail
van, a coupe with butterfly doors and a glass roof, a Giugiaro glass canopy over a flat six, a
1965 Mini in 1990s Tokyo, and an Alfa saloon with a rear transaxle nobody local could service.
Fond rather than mocking, and the game should like them.

**Two cars left that class for scenes that describe them better.** The **Prelude Si VTEC** went
to `Front-drive tuner`, where its H22A puts it. The **Soarer 2.5 GT-T** went to `Wangan`,
because a 1JZ-GTE coupe on a night motorway is exactly what that class is. The **GTO** is in
`Wangan` for the same reason.

**The remaining judgement calls, stated so they can be argued with:**

- **The Mini in `Oddball` rather than `Rally-bred`.** Monte Carlo 1964, 65 and 67 justify the
  racing label on paper, but in 1990s Japan the Mini was bought on affection and fashion, by
  people with no interest in its trophy cabinet. Culture follows the buyer.
- **The M3s and the 190E Evo II in `Touring car`.** They are genuine circuit homologation and
  they sit with the Skylines on that basis. Their being expensive imports in Japan is real, and
  it is `origin`'s to record.
- **The Starion in `Wangan`.** The weakest assignment left: an 80s wide-body turbo coupe sold
  against the Supra and the Z, so Wangan is the least-bad fit rather than a good one.
- **The Escort Cosworth and the Integrale in `Rally-bred`.** Unlike the Mini, these really were
  bought in Japan by rally people for being rally cars.

**Retired and not to be reused: "shitbox".** It was never player-facing and it is not used here
either. Ordinary cheap cars are `Honest transport`.

---

## 3. The roster lives in `midnight-garage-roster.csv`

**All 94 cars, all 56 per-car values, one file: `docs/design/midnight-garage-roster.csv`.**
Open it in a spreadsheet and edit it there. **There is no second copy of any car value anywhere**,
and the two markdown tables that used to sit in this section are gone precisely so that there
cannot be.

**What is in the CSV and what is in this document.** The CSV holds every value that varies per
car. This document holds the things that explain those values and cannot be a spreadsheet cell:
what the four tiers mean (section 1), what the culture classes are and why (section 2), the
Legends (section 7), the easter eggs, the identity rulings, and the open questions. **A number
about one car goes in the CSV. A rule about all cars goes here.**

**Directive 24 binds this file.** A per-car value is authored for all 94 rows when it is
introduced, not just for the cars currently in `cars.json`. Deciding a value only for the shipped
subset is exactly how the tier drift happened.

### 3a. The columns

**`uid` is the key. It is the only column that may never change.**

`MG-001` to `MG-094`, assigned once when a row is created, **never reused and never renumbered**.
A new car takes the next free uid whatever its price. **`rosterNo` cannot do this job**: the
roster is ordered by price, so inserting one car renumbers every row below it, and anything that
pointed at row 40 would silently now point at a different car. That is the whole failure this
column exists to prevent, and it is the column to key off if the roster is ever normalised into a
database or generated into content.

`rosterNo` stays as the display ordinal: what position a car holds on the price ladder today.
**Useful for reading, never for referring.**

**Identity** - `uid`, `rosterNo`, `id` (the `cars.json` id, blank until authored),
`displayName` (the player-facing string, identical to `cars.json` where the car is built),
`variantLabel` (the precise variant, which is what tells two FD3S rows apart), `brand`,
`parodyName`, `parodyBrand` (the Naming Layer, engineering law 3), `chassisCode`, `engineCode`,
`yearFrom`.

**Market** - `priceYen`, `priceStatus` (`researched` or `STAND-IN`), `bookValueYen` (what
`cars.json` actually ships, so any disagreement with `priceYen` is visible), `tier`, `rarity`,
`origin`, `culture`, `scope`, `builtInContent`.

**Game constants** - `reliabilityBase`, `styleBase`, `aeroCeiling`. What the car IS, never a
difficulty knob. See section 3b.

**Engine** - `stockPowerPs`, `quotedPowerPs` (the advertised figure where it differs, the 280 PS
agreement), `powerRpm`, `peakTorqueNm`, `torqueRpm`, `redlineRpm`, `displacementCc`,
`engineConfig`, `aspiration`.

**Chassis** - `curbWeightKg`, `weightDistributionFront`, `drivetrain`, `wheelbaseMm`, `widthMm`,
`heightMm`, `comHeightMm`, `dragCd`.

**Tyres** - `stockTyre`, `tyreCompound`.

**Measured** - `topSpeedKmh`, `lateralG97`, `lateralG193`, `braking97To0M`, `braking161To0M`,
`zeroTo97S`, `zeroTo161S`. These are the figures the performance model is calibrated against
(`car-performance/README.md`), not decoration.

**Provenance** - `measuredFrom`, `dataConfidence`, `estimatedFields`, `tags`, `specSource`
(`cars.json`, `forza-fh6-roster-data.csv`, or `NONE`).

**Prose** - `notes` (why a figure is what it is, and where it is doubted), `flavour`.

### 3b. The three per-car game constants

**`reliabilityBase`** is what the car reads when everything about it is right. A mint, stock,
coherently built example scores exactly this and nothing ever scores higher; condition and build
coherence only take it down (`docs/sprints/sprint_archive/sprint136.md`).

**The scale is 65 to 100 and the axis is age and engineering culture, not price.** An NSX is a
supercar you can drive to work and a Countach is not, so they sit thirty points apart inside the
same culture class. **The floor is 65 rather than lower because the base multiplies everything
else**: a car with very little to lose is a car where condition and coherence stop mattering, and
those are the two systems the tuning arc exists to make matter.

| band | what sits there |
| ---: | --- |
| 96-100 | ordinary 1990s Japanese, and the Land Cruiser |
| 90-95 | the rest of modern Japan, including most turbocharged cars |
| 84-89 | known-issue Japanese, the best of Europe, the homologation specials |
| 78-83 | rotaries, and Japanese classics from the 1970s |
| 72-77 | the 1960s Japanese classics, and the triple-rotor Cosmo |
| 65-71 | Italy, and a 1965 Mini |

**`styleBase`** (0 to 20) is **authored for all 94 rows and BUILT**: it landed in
`docs/sprints/sprint_archive/sprint145.md`, `CarModel.spec.styleBase` is a required schema field,
all 26 shipped cars carry it, and the flat `statFormulas.styleCap` it replaced is retired.
`rosterCsvGuard.test.ts` holds every row inside the authored band.

**`aeroCeiling`** (0 to 1) is proposed in `docs/sprints/sprint140.md` and is **authored for the 26
shipped cars only**. Under directive 24 that is the wrong scope, and it wants completing to 94
before that sprint runs. It is unsigned as well as incomplete.

### 3c. What the CSV is still missing, stated rather than discovered

Counts are out of 94.

| gap | filled | what it means |
| --- | ---: | --- |
| `flavour` | **0** | Deliberate. Ninety-four flavour lines written in one pass would be filler, and the copy bar (`CLAUDE.md`, the game-tone law) does not allow filler. Written per car, by hand, against the "lived in Japan in 1995" test. |
| `rarity` | 26 | A spawn-rate lever, so it is directive 22 territory as well as directive 24. Needs the full 94 signed. |
| `styleBase` | **94** | Complete, and built. Section 3b. |
| `aeroCeiling` | 26 | Section 3b. Still the wrong scope under directive 24, and unsigned. |
| `stockPowerPs` and the rest of the engine block | 56 | 26 from `cars.json`, 30 from the research sweep. |
| geometry (`wheelbaseMm`, `dragCd`, `comHeightMm`, tyres) | 26 | Only the shipped cars have been through the spec book. |
| measured lateral G and braking | 43-46 | The research sweep did not reach every car. |
| any spec data at all | 65 | **29 cars have none**: the nine stand-in-price cars, plus twenty the Forza sweep never covered. |

**None of these blocks the tuning arc.** They block authoring those cars into `cars.json`, which
is what `scope` already governs.

## 4. The nine new cars, and what they still need

**Two additions, one problem each.**

### 4a. Four ordinary cars, because `entry` was almost all kei (v2.1)

Before v2.1 the entry tier held four ordinary cars against nine keis, so the early game was
almost all 660cc and the player met almost no plain metal. `Honest transport` is the culture
that pays the rent, and it needed stock. All four are base-spec and non-performance, and each
has a humble relationship to a car already on the roster:

| Car | Price (¥) | Why this one |
| --- | ---: | --- |
| Nissan March (K10) 1.0 | 180,000 | The archetypal cheap first car, and the one everyone's sister actually had. |
| Toyota Corolla 1.5 SE Saloon (AE91) | 200,000 | The most ordinary car in Japan, and the AE86's boring cousin on the same family tree. |
| Mazda Familia 1.5 (BG) | 220,000 | The Familia GT-R's humble sibling: same shell, none of the trousers. |
| Honda Civic 1.5 (EF3) | 240,000 | The base Civic the EG6 and CR-X make sense against. |

### 4b. Five cross-country vehicles, because the roster had no mud on it (v2.2 and v2.3)

The roster had one van and no four-wheel drive that was not a rally car. **`Kurokan` is the new
culture**: クロカン, the Japanese contraction of cross-country, and the word actually used in
period for this kind of vehicle.

| Car | Price (¥) | Tier | Why this one |
| --- | ---: | --- | --- |
| Suzuki Jimny (JA11) | 390,000 | entry | A kei AND a genuine ladder-chassis four-wheel drive, which nothing else on the roster manages. A cult object rather than a curiosity. |
| Mitsubishi Delica Star Wagon (P35W) | 520,000 | everyday | The RV boom's poster child: a high-riding 4WD one-box that people genuinely took up forest roads. Gives Mitsubishi a presence outside the Evos. |
| Nissan Safari (Y60) | 660,000 | everyday | The TD42 diesel workhorse, and the other half of a Toyota-versus-Nissan pairing the roster otherwise lacks entirely. |
| Toyota Land Cruiser 70 (LJ71) | 700,000 | everyday | The 70 rather than the 80 deliberately: the 80 is a bubble-era luxury RV at ¥1.5M-plus, duplicating money already covered. The 70 is the tool, and it fits the band that needed filling. |
| Mitsubishi Pajero Evolution (V55W) | 2,500,000 | flagship | The Dakar homologation car: 3.5 MIVEC V6, double-wishbone rear, arches like a rally raid truck, about 2,500 built. Its papers say homologation special; everything else about it says cross-country, and that is where it belongs. |

**The Pajero Evolution is filed by scene rather than by paperwork**, on the maintainer's call. It
could sit in `Rally-bred` beside the Evos and the Imprezas on its Dakar credentials, but nobody
who wanted one wanted it for the same reasons they wanted a Lancer. It is the top of the
cross-country world, not a rally car with extra ground clearance.

**The Delica is the one stretch in the class**, being a van. It earns its place because its whole
identity was going where a kurokan goes, which is exactly what the class is about.

**The 80-series Land Cruiser is a good later addition to `flagship`**, which remains the tier
with only two authored cars. It is not in this pass because it was not asked for.

**The Acty is NOT in this class.** It moved here briefly and moved back to `Kei`, which is right:
a kei truck's world is the tax bracket, the plates and the kei aftermarket, not the mountain.

### The problem all nine share, stated as plainly as it can be

**These nine prices are STAND-INS. They are not evidence.**

The other 85 figures each carry a dated period observation, a bracketed interpolation between
two real observations, or a recorded maintainer override, and the provenance document justifies
every one individually. **The nine below have no anchor of any kind.** They were picked to sit
sensibly between the cars either side of them, which makes them plausible and does not make them
right.

| Car | Stand-in price (¥) |
| --- | ---: |
| Nissan March (K10) 1.0 | 180,000 |
| Toyota Corolla 1.5 SE Saloon (AE91) | 200,000 |
| Mazda Familia 1.5 (BG) | 220,000 |
| Honda Civic 1.5 (EF3) | 240,000 |
| Suzuki Jimny (JA11) | 390,000 |
| Mitsubishi Delica Star Wagon (P35W) | 520,000 |
| Nissan Safari (Y60) | 660,000 |
| Toyota Land Cruiser 70 (LJ71) | 700,000 |
| Mitsubishi Pajero Evolution (V55W) | 2,500,000 |

**What must happen before any of them is trusted:** the same archived-dealer method that priced
the other 85. The 1998 Kyushu calibration page is the obvious start for the four ordinary cars,
since it prices exactly that class at exactly that money. The five cross-country vehicles need
their own sweep; the Pajero Evolution is the one most likely to move, because a limited-run
homologation special does not depreciate like a Land Cruiser and ¥2,500,000 is a guess at half
its 1997 list rather than an observation.

**Until then they keep their (TBC) marks, in this table and in the grouped view, and they are
the least-defended figures in the roster.** `TODO.md` carries the research as an open item.

## 5. What `cars.json` must change

**13 of the 26 shipped cars carry a tier this table disagrees with.** Applying them is a
content change with real economic consequences and is NOT done yet: `tier` keys
`valuation.expectationByTier`, `partPricing.classFactors`,
`partsGeneration.minWorkBillFractionByTier`, the three zone-state severity tables and
`diagnosis.symptomChanceByTier`. **All six move for every car listed.**

| car | price | current | should be |
| --- | ---: | --- | --- |
| `nissan-sunny-b12` | 150,000 | everyday | **entry** |
| `toyota-carina-at150` | 250,000 | everyday | **entry** |
| `toyota-sera-exy10` | 340,000 | everyday | **entry** |
| `honda-crx-sir-ef8` | 480,000 | enthusiast | **everyday** |
| `honda-prelude-si-vtec-bb4` | 490,000 | enthusiast | **everyday** |
| `nissan-silvia-s13` | 500,000 | enthusiast | **everyday** |
| `toyota-mr2-aw11` | 510,000 | enthusiast | **everyday** |
| `honda-beat-pp1` | 580,000 | entry | **everyday** |
| `honda-civic-sir2-eg6` | 650,000 | enthusiast | **everyday** |
| `toyota-aristo-30v-jzs147` | 770,000 | enthusiast | **everyday** |
| `mazda-rx7-fd3s` | 1,450,000 | flagship | **enthusiast** |
| `subaru-impreza-wrx-sti-gc8` | 1,800,000 | flagship | **enthusiast** |
| `nissan-fairlady-z-z32` | 1,850,000 | flagship | **enthusiast** |

The 13 unchanged: City E, Wagon R, City Turbo II, Alto Works, Cefiro, 180SX, FC3S, Chaser
JZX90, AE86, S14, MR2 SW20, Supra RZ, GT-R BNR32.

**The shipped distribution afterwards is entry 7, everyday 8, enthusiast 9, flagship 2.**

---

## 6. Scope ladder

| Tier | Count | When |
| --- | --- | --- |
| **PoC** | 10 | Ugly MVP and Vibe Slice |
| **Go-Live** | ~58 (40 regular, 10 Legends, 8 Gaisha) | v1.0 launch |
| **Eventually** | 94 | Post-launch expansion packs |

**Expansion packs:** Kei Pack, Kyusha Pack (including bosozoku style parts), Drift Pack, VIP
Pack (Celsior, Cima, bippu parts), Gaisha II, 2004+ Wave, Hyper Wave (2007+).

---

## 7. The 10 Legends (GDD 9.2, locked candidates)

1. Nissan Skyline GT-R V-Spec II (BNR34)
2. Honda NSX-R (NA1)
3. Nissan Skyline GT-R Hakosuka (KPGC10)
4. **Nissan Fairlady Z432 (PS30)** - S20 engine shared with the KPGC10; numbers-matching
   provenance mechanic
5. Subaru Impreza 22B STi
6. Mitsubishi Lancer Evolution VI Tommi Mäkinen Edition
7. **Toyota 2000GT (MF10)** - acquired via the Collector's Quarter story lead
8. **Mazda Autozam AZ-1 - the FIRST Legend the player acquires** (maintainer, 2026-07-29)
9. Mazda RX-7 Spirit R (FD3S)
10. Toyota Supra RZ final edition (JZA80) *or* Nissan Silvia Spec-R (S15), last slot decided in
    playtesting

*Acquisition order across the rest is undecided, deliberately not fixed, and not to be weighted
toward endgame (GDD 9.2). No car here is "the" capstone. The AZ-1 is the one fixed point.*

*The Honda S2000 (AP1) moved to the Rare roster: brilliant, but volume-produced, and Legend
slots are for unicorns.*

**The AZ-1 being first is why it is an `everyday`-tier kei at 720,000 rather than a flagship.**
That is not a contradiction: Legend status is about scarcity and enshrinement, `tier` is about
parts and expectations, and sprint 133 split those axes precisely so a car could be both. It
also makes the first Legend something a mid-game player can plausibly reach, which is what
being first requires.

**The Legend system itself is designed only in outline and is not built.** See `TODO.md`.

---

## 8. Easter eggs

**Honda Motocompo (NC50).** Appears at the Local Yard as "box of scooter parts, ¥5,000", with
no hint. Restore it on the workbench and it becomes a shop runabout: one day faster on scout
deliveries. Also a trunk-find inside the City Turbo II, which is the car it was designed to
live in.

**Honda Acty as a shop tool.** Owning one cuts transport and delivery fees. It is the only
roster car whose value is a mechanic rather than a sale price.

---

## 9. The Zero Legend (secret, do not surface publicly)

**Mazda 787B (#55).** Not a roster car: the hidden eleventh enshrinement (10 Legends plus this
one). From day one the Hall holds one more space than it admits to, dark and unexplained, just
a stretch of rain-slicked pavement under a single sodium lamp, reflecting nothing back yet.

It fills only if the player completes the **Rotary Pilgrimage** after the credits: enshrine the
Spirit R, restore an FC3S, a Eunos Cosmo 20B, *and* a Cosmo Sport 110S (row 85, in the Kyusha
Pack as the pilgrimage's rarest step). Then a fax arrives with no sender, just an address in
Hiroshima and four rotors drawn in pen.

The 787B is never bought, never sold, never flipped: it is *entrusted*. It cannot be modified
and its build sheet is sealed ("R26B - 4 rotors - do not touch"). Put it on the dyno and the
needle simply leaves the gauge while the whole screen shakes, the 280 PS joke inverted at
maximum volume. Enshrined, the Hall plays a different music sting: a sustained quad-rotor note
under the synthwave, forever.

**Never surface it in public-facing text, devlogs or marketing.**

## Hall of Legends art direction

Not a museum. 90s city pop nostalgia: sodium-vapour amber, wet asphalt, neon signage bleeding
into rain-puddle reflections, a warm and happy melancholy, closer to *Akira*'s Neo-Tokyo street
pixel work than a sterile display case. Each enshrined car sits under its own lamp rather than
on a pedestal; condition and light both improve as the Hall fills.

---

## 10. Identity rulings

Where a roster id could refer to more than one grade, this is the one it is priced and specced
as. Alternates are recorded because they were real cars at real money, not because they are
open questions.

| Row | Priced as | Alternate |
| --- | --- | --- |
| Kenmeri (87) | GT-R (KPGC110), ¥8,800,000 | GT-X, ¥1,050,000 |
| Stagea (71) | Autech 260RS, ¥2,750,000 | 25t RS FOUR V, ¥1,050,000 |
| Chaser (41) | JZX90 Tourer V, ¥870,000 | JZX81 GT Twin Turbo, ¥600,000 |
| Mini (47) | 1965 Cooper S, ¥1,000,000 | 1990s Rover Mini 1.3i, ¥1,750,000 |
| Cosmo Sport (85) | Series II (L10B), ¥6,800,000 | L10A, same price |
| Roadster (19) | NA6CE 1.6, ¥440,000 | NA8C, about ¥700,000 |
| Laurel Club S (35) | Turbocharged RB20DET Medalist Club S, ¥730,000 | RB25DE Club S, not priced |
| Datsun 510 SSS (32) | KP510 coupe, ¥690,000, already encoded as such | Four-door SSS saloon, not priced |
| Civic (9) | EF2, the 1.5 D15B car, ¥240,000 | EF3 1.6 Si (ZC), not priced |

**Two cars, not one.** The DC2 (55) and the DC5 (59) are two separate Integra Type Rs in the
roster, not one car mislabelled, and the E30 (68) and the E36 (64) are likewise two separate M3s.
Each pair briefly shared a single spec block; both have been split back apart. The Civic row above
is the opposite error and was a plain misnaming: EF3 is the 1.6 Si, so the cheap 1.5 is the EF2.

---

## 11. Open questions

1. **Only two flagship cars are authored** (Supra RZ, GT-R BNR32), against an auction draw that
   gives collector-network rooms a 70 per cent flagship appetite and premium rooms 25 per cent.
   **Authoring more flagship cars is the fix, not re-tiering cheaper ones upward.**
2. **The four new entry cars need real price research** (section 4).
3. **The `everyday` tier is mostly performance variants**, which sits oddly with its name. In
   `TODO.md`.
4. **The Sunny (row 3) is scope `Eventually` and is already built.** Either promote its scope or
   accept that scope and shipped state have drifted for one car.
5. **The Cosmo Sport (row 80) is the least-defended price of the original 85**, proven absent
   from every period source. Confident in its slot, not in the digit.
6. **The Kenmeri as GT-R at ¥8.8M** is the single largest price lever in the table.

---

## 12. Amendment log

**This document is a bible: an amendment needs explicit maintainer approval, recorded here.**

- **2026-07-31: APPROVED. The `styleBase` entries in sections 3b and 3c, corrected from
  "proposed, authored for the 26 shipped cars only" to "authored for all 94 rows and BUILT".**
  The count had gone stale rather than been wrong when written: `midnight-garage-roster.csv`,
  which this document designates as the source of truth, carries `styleBase` for all 94 rows;
  `CarModel.spec.styleBase` is a schema-required field; and the flat `statFormulas.styleCap` it
  replaced was retired in `docs/sprints/sprint_archive/sprint145.md`. **No rule, no number and no
  car moved.** `aeroCeiling`, which shared the sentence being corrected, keeps its 26-of-94 status
  and its unsigned mark unchanged. The edit landed in commit `1fb2681`, flagged there for
  ratification rather than assumed; this entry is that ratification.
