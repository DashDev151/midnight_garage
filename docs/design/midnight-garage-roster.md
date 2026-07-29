# MIDNIGHT GARAGE - Car Roster

## v2.3: the single source of truth for the full 94-car roster

*Companion to GDD v0.6 section 4. Real specs per GDD section 2.4 naming layer.*

**This document is canonical for: which cars exist, what each one is worth, which tier it
belongs to, what scene it comes from, and when it ships.** Nothing else may carry a second copy
of that table.

Two documents feed it and neither is canonical on its own:

- **`reference/period-scans/roster-price-list-v2.md`** is the **price provenance only**. Every
  yen figure below came from it, and its per-car anchors, tags and override log are the
  justification. **Its own tier names (Starter, Club, Semi-pro, Pro/Legend) are DEAD.**
- **`packages/content/data/cars.json`** is the shipped subset: 26 of the 94, carrying
  `bookValueYen` and `tier` as live game data. Where it disagrees, this document is right and
  `cars.json` is the thing to change. Section 5 lists every disagreement.

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

## 3. The roster, ascending by price

**Scope key:** **P** = PoC-10 - **L** = Go-Live - **E** = Eventually - pack name = post-launch.
**Built** names the `cars.json` id where the car ships today; blank means not authored yet.
**NEW** marks the nine cars added in v2.1 to v2.3, whose prices are interpolated and **not
yet researched** (section 4).

| # | Car | Price (¥) | Tier | Culture | Scope | Built |
| ---: | --- | ---: | --- | --- | --- | --- |
| 1 | Honda Today (JW1) | 100,000 | entry | Kei | Kei Pack |  |
| 2 | Honda City E (AA) | 130,000 | entry | Honest transport | P | `honda-city-e-aa` |
| 3 | Nissan Sunny (B12) | 150,000 | entry | Honest transport | E | `nissan-sunny-b12` |
| 4 | Honda Acty (HA4 Truck) | 160,000 | entry | Kei | L |  |
| 5 | **Nissan March (K10) 1.0** | 180,000 **(TBC)** | entry | Honest transport | L | **NEW** |
| 6 | **Toyota Corolla 1.5 SE Saloon (AE91)** | 200,000 **(TBC)** | entry | Honest transport | L | **NEW** |
| 7 | **Mazda Familia 1.5 (BG)** | 220,000 **(TBC)** | entry | Honest transport | L | **NEW** |
| 8 | Suzuki Wagon R (CT21S) | 230,000 | entry | Kei | P | `suzuki-wagon-r-ct21s` |
| 9 | **Honda Civic 1.5 (EF3)** | 240,000 **(TBC)** | entry | Honest transport | L | **NEW** |
| 10 | Toyota Carina (AT150) | 250,000 | entry | Honest transport | L | `toyota-carina-at150` |
| 11 | Daihatsu Mira TR-XX (L70) | 280,000 | entry | Kei | L |  |
| 12 | Honda City Turbo II (AA) | 320,000 | entry | Front-drive tuner | L | `honda-city-turbo-ii-aa` |
| 13 | Nissan S-Cargo | 330,000 | entry | Oddball | L |  |
| 14 | Toyota Sera (EXY10) | 340,000 | entry | Oddball | L | `toyota-sera-exy10` |
| 15 | Subaru Vivio RX-R (KK4) | 380,000 | entry | Kei | L |  |
| 16 | **Suzuki Jimny (JA11)** | 390,000 **(TBC)** | entry | Kurokan | L | **NEW** |
| 17 | Suzuki Alto Works RS/Z (HA21S) | 400,000 | entry | Kei | L | `suzuki-alto-works-ha21s` |
| 18 | Daihatsu Mira TR-XX Avanzato R (L502S) | 420,000 | entry | Kei | L |  |
| 19 | Eunos Roadster (NA6CE) | 440,000 | everyday | Touge | L |  |
| 20 | Honda CR-X SiR (EF8) | 480,000 | everyday | Touge | L | `honda-crx-sir-ef8` |
| 21 | Honda Prelude Si VTEC (BB4) | 490,000 | everyday | Front-drive tuner | L | `honda-prelude-si-vtec-bb4` |
| 22 | Nissan Silvia K's (S13) | 500,000 | everyday | Drift | Drift Pack | `nissan-silvia-s13` |
| 23 | Toyota MR2 SC (AW11) | 510,000 | everyday | Touge | E | `toyota-mr2-aw11` |
| 24 | **Mitsubishi Delica Star Wagon (P35W)** | 520,000 **(TBC)** | everyday | Kurokan | L | **NEW** |
| 25 | Mazda Familia GT-R (BG8Z) | 560,000 | everyday | Rally-bred | L |  |
| 26 | Honda Beat (PP1) | 580,000 | everyday | Kei | Kei Pack | `honda-beat-pp1` |
| 27 | Nissan Cefiro (A31) | 620,000 | everyday | Drift | Drift Pack | `nissan-cefiro-a31` |
| 28 | Suzuki Cappuccino (EA11R) | 630,000 | everyday | Kei | Kei Pack |  |
| 29 | Honda Civic SiR-II (EG6) | 650,000 | everyday | Touge | P | `honda-civic-sir2-eg6` |
| 30 | **Nissan Safari (Y60)** | 660,000 **(TBC)** | everyday | Kurokan | L | **NEW** |
| 31 | Toyota Starlet Glanza V (EP91) | 680,000 | everyday | Front-drive tuner | L |  |
| 32 | Datsun 510 Bluebird 1600 SSS | 690,000 | everyday | Kyusha | Kyusha Pack |  |
| 33 | **Toyota Land Cruiser 70 (LJ71)** | 700,000 **(TBC)** | everyday | Kurokan | L | **NEW** |
| 34 | Autozam AZ-1 (PG6SA) | 720,000 | everyday | Kei | Legend |  |
| 35 | Nissan Laurel Club S (C33) | 730,000 | everyday | Drift | Drift Pack |  |
| 36 | **Nissan 180SX ('93 Type II)** | 750,000 | enthusiast | Drift | P | `nissan-180sx-rps13` |
| 37 | Toyota Aristo 3.0V (JZS147) | 770,000 | everyday | Wangan | L | `toyota-aristo-30v-jzs147` |
| 38 | VW Golf GTI 16V (Mk2) | 790,000 | enthusiast | Front-drive tuner | Gaisha II |  |
| 39 | Daihatsu Copen (L880K) | 820,000 | everyday | Kei | 2004+ Wave |  |
| 40 | Mazda Savanna RX-7 GT-X (FC3S) | 850,000 | enthusiast | Rotary | P | `mazda-savanna-rx7-fc3s` |
| 41 | Toyota Chaser Tourer V (JZX90) | 870,000 | enthusiast | Drift | P | `toyota-chaser-tourer-v-jzx90` |
| 42 | Toyota Sprinter Trueno GT-APEX (AE86) | 890,000 | enthusiast | Touge | P | `toyota-sprinter-trueno-ae86` |
| 43 | Eunos Cosmo 20B Type S (JC) | 910,000 | enthusiast | Rotary | L |  |
| 44 | Nissan Pulsar GTI-R (RNN14) | 930,000 | enthusiast | Rally-bred | L |  |
| 45 | Subaru Alcyone SVX Version L (CXD) | 950,000 | enthusiast | Oddball | E |  |
| 46 | Mitsubishi Starion GSR-VR (A187A) | 970,000 | enthusiast | Wangan | E |  |
| 47 | 1965 Mini Cooper S (Mk1) | 1,000,000 | enthusiast | Oddball | Gaisha |  |
| 48 | Nissan Silvia K's (S14, '94) | 1,020,000 | enthusiast | Drift | P | `nissan-silvia-ks-s14` |
| 49 | Alfa Romeo 75 3.0 V6 | 1,100,000 | enthusiast | Oddball | Gaisha |  |
| 50 | Toyota MR2 GT (SW20, '95) | 1,180,000 | enthusiast | Touge | L | `toyota-mr2-sw20` |
| 51 | Toyota Celica GT-Four (ST205) | 1,350,000 | enthusiast | Rally-bred | L |  |
| 52 | Mazda RX-7 Type R (FD3S, '92) | 1,450,000 | enthusiast | Rotary | P | `mazda-rx7-fd3s` |
| 53 | Honda Civic Type R (EK9) | 1,480,000 | enthusiast | Front-drive tuner | L |  |
| 54 | Toyota Altezza RS200 Z Edition (SXE10) | 1,620,000 | enthusiast | Drift | L |  |
| 55 | Honda Integra Type R (DC2, '99) | 1,680,000 | enthusiast | Front-drive tuner | L |  |
| 56 | Toyota Chaser Tourer V (JZX100) | 1,750,000 | enthusiast | Drift | Drift Pack |  |
| 57 | Subaru Impreza WRX STi Version (GC8) | 1,800,000 | enthusiast | Rally-bred | L | `subaru-impreza-wrx-sti-gc8` |
| 58 | Nissan Fairlady Z Version S TT (Z32) | 1,850,000 | enthusiast | Wangan | L | `nissan-fairlady-z-z32` |
| 59 | Honda Integra Type R (DC5) | 2,080,000 | enthusiast | Front-drive tuner | 2004+ Wave |  |
| 60 | Mitsubishi GTO Twin Turbo (Z16A) | 2,150,000 | enthusiast | Wangan | E |  |
| 61 | Toyota Soarer 2.5 GT-T (JZZ30) | 2,200,000 | enthusiast | Wangan | VIP Pack |  |
| 62 | Nissan Silvia Spec-R (S15, '02) | 2,280,000 | enthusiast | Drift | Legend candidate |  |
| 63 | Mazda RX-8 Type RS (SE3P) | 2,380,000 | enthusiast | Rotary | 2004+ Wave |  |
| 64 | BMW M3 (E36, '97) | 2,450,000 | flagship | Touring car | Gaisha II |  |
| 65 | **Mitsubishi Pajero Evolution (V55W)** | 2,500,000 **(TBC)** | flagship | Kurokan | L | **NEW** |
| 66 | Lancia Delta HF Integrale Evo | 2,550,000 | flagship | Rally-bred | Gaisha |  |
| 67 | Lancer Evo VI Tommi Mäkinen (CP9A) | 2,580,000 | flagship | Rally-bred | Legend |  |
| 68 | BMW M3 (E30) | 2,650,000 | flagship | Touring car | Gaisha |  |
| 69 | Lancer Evo VIII MR (CT9A) | 2,680,000 | flagship | Rally-bred | 2004+ Wave |  |
| 70 | Nissan Fairlady 240ZG (HS30) | 2,720,000 | flagship | Kyusha | L |  |
| 71 | Autech Stagea 260RS (WGNC34) | 2,750,000 | flagship | Touring car | L |  |
| 72 | Subaru Impreza WRX STI (GDB, '04) | 2,780,000 | flagship | Rally-bred | L |  |
| 73 | Ford Escort RS Cosworth | 2,850,000 | flagship | Rally-bred | Gaisha II |  |
| 74 | Nissan Fairlady Z (Z33, '02) | 2,880,000 | flagship | Wangan | 2004+ Wave |  |
| 75 | Toyota Supra RZ (JZA80, '98) | 2,890,000 | flagship | Wangan | P | `toyota-supra-rz-jza80` |
| 76 | Honda S2000 (AP1, '03) | 3,380,000 | flagship | Touge | L |  |
| 77 | Nissan Skyline GT-R (BNR32) | 3,500,000 | flagship | Touring car | L | `nissan-skyline-gtr-bnr32` |
| 78 | Nissan Skyline GT-R V-Spec (BCNR33) | 3,750,000 | flagship | Touring car | L |  |
| 79 | Mazda RX-7 Spirit R Type A (FD3S) | 3,880,000 | flagship | Rotary | Legend |  |
| 80 | Nissan Fairlady Z432 (PS30) | 4,380,000 | flagship | Kyusha | Legend |  |
| 81 | Subaru Impreza 22B-STi | 4,480,000 | flagship | Rally-bred | Legend |  |
| 82 | Porsche 911 Turbo 3.3 (930) | 5,500,000 | flagship | Exotic | Gaisha |  |
| 83 | Nissan Skyline GT-R V-Spec II (BNR34) | 5,680,000 | flagship | Touring car | Legend |  |
| 84 | Skyline 2000GT-R Hakosuka (KPGC10) | 6,500,000 | flagship | Kyusha | Legend |  |
| 85 | Mazda Cosmo Sport 110S (Series II) | 6,800,000 | flagship | Kyusha | Kyusha Pack |  |
| 86 | Mercedes 190E 2.5-16 Evolution II | 6,850,000 | flagship | Touring car | Gaisha |  |
| 87 | Skyline 2000GT-R Kenmeri (KPGC110) | 8,800,000 | flagship | Kyusha | Kyusha Pack |  |
| 88 | Honda NSX-R (NA1) | 8,980,000 | flagship | Exotic | Legend |  |
| 89 | Nissan GT-R Black Edition (R35) | 9,471,000 | flagship | Wangan | Hyper Wave |  |
| 90 | Ferrari F355 Berlinetta (6MT) | 9,480,000 | flagship | Exotic | Gaisha II |  |
| 91 | Ferrari 512 TR | 10,800,000 | flagship | Exotic | Gaisha |  |
| 92 | Lamborghini Countach LP5000 QV | 14,800,000 | flagship | Exotic | Gaisha |  |
| 93 | Toyota 2000GT (MF10) | 23,000,000 | flagship | Kyusha | Legend |  |
| 94 | Lexus LFA | 37,500,000 | flagship | Exotic | Hyper Wave |  |

### 3a. The same roster, grouped by culture

The review view. Same 94 cars, same numbers, sorted by price inside each class. **Derived from
the table above and kept in the same file on purpose**, so the two cannot drift apart.

**(TBC) marks a STAND-IN price with no evidence behind it.** Nine of them, all listed in
section 4.

#### Kei (11)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 1 | Honda Today (JW1) | 100,000 | entry |  |
| 4 | Honda Acty (HA4 Truck) | 160,000 | entry |  |
| 8 | Suzuki Wagon R (CT21S) | 230,000 | entry | `suzuki-wagon-r-ct21s` |
| 11 | Daihatsu Mira TR-XX (L70) | 280,000 | entry |  |
| 15 | Subaru Vivio RX-R (KK4) | 380,000 | entry |  |
| 17 | Suzuki Alto Works RS/Z (HA21S) | 400,000 | entry | `suzuki-alto-works-ha21s` |
| 18 | Daihatsu Mira TR-XX Avanzato R (L502S) | 420,000 | entry |  |
| 26 | Honda Beat (PP1) | 580,000 | everyday | `honda-beat-pp1` |
| 28 | Suzuki Cappuccino (EA11R) | 630,000 | everyday |  |
| 34 | Autozam AZ-1 (PG6SA) | 720,000 | everyday |  |
| 39 | Daihatsu Copen (L880K) | 820,000 | everyday |  |

#### Rally-bred (10)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 25 | Mazda Familia GT-R (BG8Z) | 560,000 | everyday |  |
| 44 | Nissan Pulsar GTI-R (RNN14) | 930,000 | enthusiast |  |
| 51 | Toyota Celica GT-Four (ST205) | 1,350,000 | enthusiast |  |
| 57 | Subaru Impreza WRX STi Version (GC8) | 1,800,000 | enthusiast | `subaru-impreza-wrx-sti-gc8` |
| 66 | Lancia Delta HF Integrale Evo | 2,550,000 | flagship |  |
| 67 | Lancer Evo VI Tommi Mäkinen (CP9A) | 2,580,000 | flagship |  |
| 69 | Lancer Evo VIII MR (CT9A) | 2,680,000 | flagship |  |
| 72 | Subaru Impreza WRX STI (GDB, '04) | 2,780,000 | flagship |  |
| 73 | Ford Escort RS Cosworth | 2,850,000 | flagship |  |
| 81 | Subaru Impreza 22B-STi | 4,480,000 | flagship |  |

#### Drift (9)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 22 | Nissan Silvia K's (S13) | 500,000 | everyday | `nissan-silvia-s13` |
| 27 | Nissan Cefiro (A31) | 620,000 | everyday | `nissan-cefiro-a31` |
| 35 | Nissan Laurel Club S (C33) | 730,000 | everyday |  |
| 36 | Nissan 180SX ('93 Type II) | 750,000 | enthusiast | `nissan-180sx-rps13` |
| 41 | Toyota Chaser Tourer V (JZX90) | 870,000 | enthusiast | `toyota-chaser-tourer-v-jzx90` |
| 48 | Nissan Silvia K's (S14, '94) | 1,020,000 | enthusiast | `nissan-silvia-ks-s14` |
| 54 | Toyota Altezza RS200 Z Edition (SXE10) | 1,620,000 | enthusiast |  |
| 56 | Toyota Chaser Tourer V (JZX100) | 1,750,000 | enthusiast |  |
| 62 | Nissan Silvia Spec-R (S15, '02) | 2,280,000 | enthusiast |  |

#### Wangan (8)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 37 | Toyota Aristo 3.0V (JZS147) | 770,000 | everyday | `toyota-aristo-30v-jzs147` |
| 46 | Mitsubishi Starion GSR-VR (A187A) | 970,000 | enthusiast |  |
| 58 | Nissan Fairlady Z Version S TT (Z32) | 1,850,000 | enthusiast | `nissan-fairlady-z-z32` |
| 60 | Mitsubishi GTO Twin Turbo (Z16A) | 2,150,000 | enthusiast |  |
| 61 | Toyota Soarer 2.5 GT-T (JZZ30) | 2,200,000 | enthusiast |  |
| 74 | Nissan Fairlady Z (Z33, '02) | 2,880,000 | flagship |  |
| 75 | Toyota Supra RZ (JZA80, '98) | 2,890,000 | flagship | `toyota-supra-rz-jza80` |
| 89 | Nissan GT-R Black Edition (R35) | 9,471,000 | flagship |  |

#### Front-drive tuner (7)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 12 | Honda City Turbo II (AA) | 320,000 | entry | `honda-city-turbo-ii-aa` |
| 21 | Honda Prelude Si VTEC (BB4) | 490,000 | everyday | `honda-prelude-si-vtec-bb4` |
| 31 | Toyota Starlet Glanza V (EP91) | 680,000 | everyday |  |
| 38 | VW Golf GTI 16V (Mk2) | 790,000 | enthusiast |  |
| 53 | Honda Civic Type R (EK9) | 1,480,000 | enthusiast |  |
| 55 | Honda Integra Type R (DC2, '99) | 1,680,000 | enthusiast |  |
| 59 | Honda Integra Type R (DC5) | 2,080,000 | enthusiast |  |

#### Honest transport (7)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 2 | Honda City E (AA) | 130,000 | entry | `honda-city-e-aa` |
| 3 | Nissan Sunny (B12) | 150,000 | entry | `nissan-sunny-b12` |
| 5 | Nissan March (K10) 1.0 | 180,000 **(TBC)** | entry |  |
| 6 | Toyota Corolla 1.5 SE Saloon (AE91) | 200,000 **(TBC)** | entry |  |
| 7 | Mazda Familia 1.5 (BG) | 220,000 **(TBC)** | entry |  |
| 9 | Honda Civic 1.5 (EF3) | 240,000 **(TBC)** | entry |  |
| 10 | Toyota Carina (AT150) | 250,000 | entry | `toyota-carina-at150` |

#### Kyusha (7)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 32 | Datsun 510 Bluebird 1600 SSS | 690,000 | everyday |  |
| 70 | Nissan Fairlady 240ZG (HS30) | 2,720,000 | flagship |  |
| 80 | Nissan Fairlady Z432 (PS30) | 4,380,000 | flagship |  |
| 84 | Skyline 2000GT-R Hakosuka (KPGC10) | 6,500,000 | flagship |  |
| 85 | Mazda Cosmo Sport 110S (Series II) | 6,800,000 | flagship |  |
| 87 | Skyline 2000GT-R Kenmeri (KPGC110) | 8,800,000 | flagship |  |
| 93 | Toyota 2000GT (MF10) | 23,000,000 | flagship |  |

#### Touge (7)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 19 | Eunos Roadster (NA6CE) | 440,000 | everyday |  |
| 20 | Honda CR-X SiR (EF8) | 480,000 | everyday | `honda-crx-sir-ef8` |
| 23 | Toyota MR2 SC (AW11) | 510,000 | everyday | `toyota-mr2-aw11` |
| 29 | Honda Civic SiR-II (EG6) | 650,000 | everyday | `honda-civic-sir2-eg6` |
| 42 | Toyota Sprinter Trueno GT-APEX (AE86) | 890,000 | enthusiast | `toyota-sprinter-trueno-ae86` |
| 50 | Toyota MR2 GT (SW20, '95) | 1,180,000 | enthusiast | `toyota-mr2-sw20` |
| 76 | Honda S2000 (AP1, '03) | 3,380,000 | flagship |  |

#### Touring car (7)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 64 | BMW M3 (E36, '97) | 2,450,000 | flagship |  |
| 68 | BMW M3 (E30) | 2,650,000 | flagship |  |
| 71 | Autech Stagea 260RS (WGNC34) | 2,750,000 | flagship |  |
| 77 | Nissan Skyline GT-R (BNR32) | 3,500,000 | flagship | `nissan-skyline-gtr-bnr32` |
| 78 | Nissan Skyline GT-R V-Spec (BCNR33) | 3,750,000 | flagship |  |
| 83 | Nissan Skyline GT-R V-Spec II (BNR34) | 5,680,000 | flagship |  |
| 86 | Mercedes 190E 2.5-16 Evolution II | 6,850,000 | flagship |  |

#### Exotic (6)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 82 | Porsche 911 Turbo 3.3 (930) | 5,500,000 | flagship |  |
| 88 | Honda NSX-R (NA1) | 8,980,000 | flagship |  |
| 90 | Ferrari F355 Berlinetta (6MT) | 9,480,000 | flagship |  |
| 91 | Ferrari 512 TR | 10,800,000 | flagship |  |
| 92 | Lamborghini Countach LP5000 QV | 14,800,000 | flagship |  |
| 94 | Lexus LFA | 37,500,000 | flagship |  |

#### Kurokan (5)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 16 | Suzuki Jimny (JA11) | 390,000 **(TBC)** | entry |  |
| 24 | Mitsubishi Delica Star Wagon (P35W) | 520,000 **(TBC)** | everyday |  |
| 30 | Nissan Safari (Y60) | 660,000 **(TBC)** | everyday |  |
| 33 | Toyota Land Cruiser 70 (LJ71) | 700,000 **(TBC)** | everyday |  |
| 65 | Mitsubishi Pajero Evolution (V55W) | 2,500,000 **(TBC)** | flagship |  |

#### Oddball (5)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 13 | Nissan S-Cargo | 330,000 | entry |  |
| 14 | Toyota Sera (EXY10) | 340,000 | entry | `toyota-sera-exy10` |
| 45 | Subaru Alcyone SVX Version L (CXD) | 950,000 | enthusiast |  |
| 47 | 1965 Mini Cooper S (Mk1) | 1,000,000 | enthusiast |  |
| 49 | Alfa Romeo 75 3.0 V6 | 1,100,000 | enthusiast |  |

#### Rotary (5)

| # | Car | Price (¥) | Tier | Built |
| ---: | --- | ---: | --- | --- |
| 40 | Mazda Savanna RX-7 GT-X (FC3S) | 850,000 | enthusiast | `mazda-savanna-rx7-fc3s` |
| 43 | Eunos Cosmo 20B Type S (JC) | 910,000 | enthusiast |  |
| 52 | Mazda RX-7 Type R (FD3S, '92) | 1,450,000 | enthusiast | `mazda-rx7-fd3s` |
| 63 | Mazda RX-8 Type RS (SE3P) | 2,380,000 | enthusiast |  |
| 79 | Mazda RX-7 Spirit R Type A (FD3S) | 3,880,000 | flagship |  |

---

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
