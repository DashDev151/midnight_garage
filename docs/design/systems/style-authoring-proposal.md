# Style base and ceiling: a proposal for all 94 cars

**Status: IMPLEMENTED IN SPRINT 152 AS PRELIMINARY VALUES. Still not signed.** Every figure below
is live: it is what the game reads. Adopting a reviewed proposal is not the same as ratifying it,
so section 6's ten calls to review remain open and a later pass can move any of them. Serves
`desirability-system.md` section 2, which asks for a rescaled base and a new ceiling, authored
per car for the whole roster.

**Where the values live now.** `midnight-garage-roster.csv` carries **`styleBase`** (how good the
car looks as it left the factory, mint and unmodified) and **`styleCeiling`** (how good it could
ever look, fully and tastefully modified) for all 94 rows, both 0 to 100. The proposal was
delivered in a separate `styleBaseProposed` column; Sprint 152 promoted that column into
`styleBase` and deleted it, because two columns answering one question is exactly the drift the
CSV is canonical to prevent. **Where this document says `styleBaseProposed`, read `styleBase`.**

**The gap is the product.** A beautiful car has a high base and no headroom, so it is a
restoration car. A plain car has a low base and a large ceiling, so it is a building car.

---

## 1. The bands

The existing `styleBase` (4 to 20) already encodes the maintainer's relative judgement, so it was
rescaled band by band rather than re-authored. Each old value maps to a **disjoint, ascending**
range; placement inside a range is tie-breaking and carries no rank claim.

| old | n | new range | | old | n | new range |
| ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 4 | 2 | 15-16 | | 13 | 13 | 50-55 |
| 5 | 1 | 18 | | 14 | 8 | 56-60 |
| 6 | 4 | 20-23 | | 15 | 9 | 61-65 |
| 7 | 3 | 24-26 | | 16 | 7 | 66-70 |
| 8 | 2 | 27-28 | | 17 | 5 | 72-76 |
| 9 | 5 | 30-33 | | 18 | 6 | 79-84 |
| 10 | 6 | 34-38 | | 20 | 1 | 88 |
| 11 | 6 | 39-43 | | | | |
| 12 | 12 | 44-49 | | | | |

**Zero pairwise rank violations across the 90 rows that were not declared departures.**

What the base bands mean, in words:

| base | reading |
| --- | --- |
| 80-88 | An object. People photograph it in a car park. Nothing you fit improves it. |
| 66-79 | Handsome enough to satisfy a stancer stock. Restoration is the play. |
| 50-65 | Good-looking. Clears the collector and the tuner stock, not the stancer. |
| 39-49 | Presentable. The starting point for most builds. |
| 27-38 | Plain metal with a shape underneath. |
| 15-26 | Appliance. A first-timer barely notices it. |

The ceiling is not banded, because it is not a rescale of anything. It is authored per car against
one question: **what does the best possible tasteful build of this car look like, and can the
scene actually do it?** Three things drive it, in this order: whether an aftermarket exists,
whether the shape can take the work, and whether the work makes the car better or merely
different.

---

## 2. Departures from the existing ranking

Four cars, listed in full so nothing is re-ranked quietly.

### Toyota 2000GT (MG-093): old 15, would have been 61-65, **proposed 80 / 85**

The maintainer's own worked example gives this car base 80 and ceiling 85, and the figures used
here are exactly those, not a value near them. The old 15 puts the roster's most beautiful object
below an RX-8 and a 22B, which reads as a ranking of scene credit in 1995 rather than of beauty.
This is the one departure the brief effectively mandates.

### Skyline 2000GT-R Hakosuka (MG-084): old 12, would have been 44-49, **proposed 66 / 86**

An 8.8-million-yen-neighbour Legend sitting level with an S-Cargo and a Jimny. The Hakosuka is a
shape that a whole modification culture is built on top of, and stock it is already the reference.
Ceiling 86 rather than the 2000GT's 85-on-80 because works style genuinely improves this car,
where nothing improves a 2000GT.

### Skyline 2000GT-R Kenmeri (MG-087): old 10, would have been 34-38, **proposed 61 / 84**

Same argument, one notch quieter. The Kenmeri is a bigger, heavier-looking and genuinely more
divisive shape than the Hakosuka, so it stays below it, but 10 out of 20 put the roster's most
expensive Skyline level with a Nissan March.

### Nissan Fairlady Z (Z33, MG-074): old 14, would have been 56-60, **proposed 45 / 96**

**Downward, and this is the one to argue about.** MG-074 *is* the 350Z of the maintainer's second
worked example, which gives it base 30 and ceiling 95: sixty-five points of headroom, the whole
point of the shape. The old 14 makes it a handsome car that needs nothing. The proposal meets the
example most of the way rather than all of it (45, not 30) because 30 would drop it below every
kei hatch on the roster, which no reading of the ranking supports. At 45/96 it carries **the
largest headroom of any car outside the Honest transport and Kurokan classes** and is the
roster's clearest "buy it to build it" flagship.

If the maintainer wants the worked example honoured exactly, the change is one cell: 45 becomes
30.

---

## 3. Sanity checks

**How many cars satisfy the stancer (65) stock? 23 of 94.**

They are the roster's genuinely beautiful cars, and 22 of the 23 cost 850,000 yen or more. The
cheapest is the AZ-1 at 720,000. **Nothing in the entry tier and nothing in the first two thirds
of `everyday` can satisfy a stancer without work**, so the early game has no shortcut. Note also
that a car only scores its base when **mint**: `style = styleRaw * conditionFactor`, so a stock
stancer sale is itself a completed restoration, not a flip.

**How many can never reach 45, even at ceiling? Two.** Honda Acty (15/42) and Suzuki Wagon R
(16/44). A kei truck and a kei one-box: neither has a performance case for the tuner either, so
nothing is lost that was reachable. Every other car on the roster can be built to the tuner's
style target.

**Is any car's ceiling below its own buyers?**

- **Kei versus the hobbyist (55):** nine of eleven reach it. The two that cannot are again
  the Acty and the Wagon R, which is correct against his own want line ("a kei that still drives
  like a kei: light and tidy on its feet"). Every kei hatch, roadster and sports kei clears.
- **Stancer (65) reachability:** seven cars can never reach it at any build. Acty 42, Wagon R 44,
  S-Cargo 51, Today 58, Carina 60, Corolla 62, Mira Avanzato 64. All seven are `entry`. The
  cheapest metal cannot be turned into a show car, which is the intent.
- **Collector (50) and tuner (45) stock:** 52 and 63 cars respectively. Both are broad on purpose.
  The collector's real gate is authenticity at importance 1.00 against style at 0.40, and the
  tuner's is power at 0.90.
- **First-timer (20):** three cars miss it stock (Acty 15, Wagon R 16, Corolla 18). His style
  importance is 0.15, so the miss is close to free.

---

## 4. Cross-check against `aeroCeiling`

The 26 cars carrying `aeroCeiling` agree with `styleCeiling` at the top and diverge in exactly one
place, which is the interesting one.

**Agree:** FD3S 1.00/96, Supra 1.00/95, BNR32 1.00/94, Z32 0.95/92, FC3S 0.90/92, SW20 0.90/90,
the three S-chassis 0.85/94-95, AW11 0.75/82, Sera 0.45/68, Carina 0.40/60, Wagon R 0.20/44.

**Diverge, deliberately:** AE86 0.70/94, EG6 0.65/92, JZX90 0.65/92, Cefiro 0.60/90, Aristo
0.60/90. These are saloons and hatches whose shapes cannot be made to generate downforce but whose
scenes can do anything they like with them visually. `aeroCeiling` asks what a body can be made to
do; `styleCeiling` asks what a scene can be made to do with a body. **A plain saloon with a huge
aftermarket is precisely where the two must disagree**, and if they never did, one of them would
be redundant.

---

## 5. The roster, grouped by culture

Sorted by base within each class. `headroom` is ceiling minus base and is the number the whole
system turns on.

### Kei (11)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Honda Acty (HA4 Truck) | entry | 15 | 42 | 27 |
| Suzuki Wagon R (CT21S) | entry | 16 | 44 | 28 |
| Honda Today (JW1) | entry | 25 | 58 | 33 |
| Daihatsu Mira TR-XX Avanzato R (L502S) | entry | 28 | 64 | 36 |
| Suzuki Alto Works (HA21S) | entry | 30 | 66 | 36 |
| Daihatsu Mira TR-XX (L70) | entry | 34 | 66 | 32 |
| Subaru Vivio RX-R (KK4) | entry | 41 | 66 | 25 |
| Daihatsu Copen (L880K) | everyday | 54 | 70 | 16 |
| Suzuki Cappuccino (EA11R) | everyday | 55 | 74 | 19 |
| Honda Beat (PP1) | everyday | 60 | 76 | 16 |
| Autozam AZ-1 (PG6SA) | everyday | 75 | 84 | 9 |

Ceilings top out around 66 for the ordinary keis, which is what keeps modifying the wrong kei a
losing move while still letting a good build clear the hobbyist's 55. The sports trio
(Cappuccino, Beat, AZ-1) are pretty stock and have little to gain, which is the correct shape for
cars whose whole appeal is that they are already finished.

### Rally-bred (10)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Nissan Pulsar GTI-R (RNN14) | enthusiast | 35 | 78 | 43 |
| Subaru Impreza WRX STI (GDB, '04) | flagship | 44 | 86 | 42 |
| Mazda Familia GT-R (BG8Z) | everyday | 46 | 82 | 36 |
| Ford Escort RS Cosworth | flagship | 51 | 82 | 31 |
| Lancia Delta HF Integrale Evo | flagship | 54 | 80 | 26 |
| Lancer Evo VIII MR (CT9A) | flagship | 58 | 86 | 28 |
| Lancer Evo VI Tommi Mäkinen (CP9A) | flagship | 59 | 84 | 25 |
| Toyota Celica GT-Four (ST205) | enthusiast | 62 | 86 | 24 |
| Subaru Impreza WRX STI (GC8) | enthusiast | 63 | 88 | 25 |
| Subaru Impreza 22B-STi | flagship | 79 | 88 | 9 |

Rally cars arrive with their arches and their wings already fitted, so the class runs
mid-to-high base and modest headroom. The 22B is the extreme: it left the factory as the finished
article.

### Drift (9)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Toyota Chaser Tourer V (JZX100) | enthusiast | 33 | 92 | 59 |
| Toyota Altezza RS200 Z Edition (SXE10) | enthusiast | 38 | 88 | 50 |
| Nissan Laurel Club S (C33) | everyday | 39 | 88 | 49 |
| Nissan Cefiro (A31) | everyday | 40 | 90 | 50 |
| Toyota Chaser Tourer V (JZX90) | enthusiast | 50 | 92 | 42 |
| Nissan Silvia Spec-R (S15, '02) | enthusiast | 55 | 95 | 40 |
| Nissan Silvia K's (S14) | enthusiast | 57 | 94 | 37 |
| Nissan 180SX (RPS13) | enthusiast | 63 | 95 | 32 |
| Nissan Silvia (S13) | everyday | 64 | 95 | 31 |

The class with the highest ceilings on the roster, and the saloons carry the biggest gaps. A plain
big saloon that becomes a 92 is the archetype the whole system exists to serve.

### Touge (7)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Honda Civic SiR-II (EG6) | everyday | 45 | 92 | 47 |
| Eunos Roadster (NA6CE) | everyday | 48 | 84 | 36 |
| Toyota MR2 (AW11) | everyday | 52 | 82 | 30 |
| Honda S2000 (AP1, '03) | flagship | 53 | 88 | 35 |
| Honda CR-X SiR (EF8) | everyday | 53 | 90 | 37 |
| Toyota MR2 (SW20) | enthusiast | 64 | 90 | 26 |
| Toyota Sprinter Trueno (AE86) | enthusiast | 67 | 94 | 27 |

### Wangan (8)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Toyota Soarer 2.5 GT-T (JZZ30) | enthusiast | 43 | 90 | 47 |
| Toyota Aristo 3.0V (JZS147) | everyday | 44 | 90 | 46 |
| Nissan Fairlady Z (Z33, '02) | flagship | 45 | 96 | 51 |
| Nissan GT-R Black Edition (R35) | flagship | 56 | 90 | 34 |
| Mitsubishi GTO Twin Turbo (Z16A) | enthusiast | 57 | 88 | 31 |
| Mitsubishi Starion GSR-VR (A187A) | enthusiast | 58 | 88 | 30 |
| Nissan Fairlady Z (Z32) | enthusiast | 69 | 92 | 23 |
| Toyota Supra RZ (JZA80) | flagship | 74 | 95 | 21 |

The Soarer and the Aristo are the roster's bippu canvases: anonymous stock, transformable, and the
cheapest route to a 90.

### Honest transport (7)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Toyota Corolla 1.5 SE Saloon (AE91) | entry | 18 | 62 | 44 |
| Toyota Carina (AT150) | entry | 20 | 60 | 40 |
| Honda Civic 1.5 (EF2) | entry | 21 | 88 | 67 |
| Honda City E (AA) | entry | 23 | 66 | 43 |
| Nissan Sunny (B12) | entry | 24 | 68 | 44 |
| Mazda Familia 1.5 (BG) | entry | 31 | 76 | 45 |
| Nissan March (K10) 1.0 | entry | 36 | 70 | 34 |

**The EF2 Civic carries the largest headroom on the roster, 67 points**, and it is the cheapest
car that can reach a stancer-satisfying build. That is deliberate: the plain Civic is the great
canvas, and the class that pays the rent should contain exactly one car that rewards ambition. The
Carina and the Corolla are the honest opposites, plain shapes with plain scenes.

### Kyusha (7)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Datsun 510 Bluebird 1600 SSS | everyday | 33 | 82 | 49 |
| Skyline 2000GT-R Kenmeri (KPGC110) | flagship | 61 | 84 | 23 |
| Nissan Fairlady Z432 (PS30) | flagship | 64 | 72 | 8 |
| Nissan Fairlady 240ZG (HS30) | flagship | 65 | 84 | 19 |
| Skyline 2000GT-R Hakosuka (KPGC10) | flagship | 66 | 86 | 20 |
| Mazda Cosmo Sport 110S (Series II) | flagship | 76 | 81 | 5 |
| Toyota 2000GT (MF10) | flagship | 80 | 85 | 5 |

**The class splits in two, and the split is the interesting part.** The 2000GT, the Cosmo Sport
and the Z432 are provenance objects: high base, five to eight points of headroom, leave them
alone. The 510, the ZG, the Hakosuka and the Kenmeri are the works-style canvases the Kyusha Pack
already plans bosozoku parts for, so they keep real headroom. Authenticity is what punishes
modifying either group, per `desirability-system.md` section 4, so the ceiling does not have to
do that job as well.

### Touring car (7)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Autech Stagea 260RS (WGNC34) | flagship | 36 | 86 | 50 |
| BMW M3 (E36, '97) | flagship | 41 | 84 | 43 |
| BMW M3 (E30) | flagship | 48 | 84 | 36 |
| Nissan Skyline GT-R V-Spec (BCNR33) | flagship | 61 | 92 | 31 |
| Mercedes 190E 2.5-16 Evolution II | flagship | 68 | 82 | 14 |
| Nissan Skyline GT-R (BNR32) | flagship | 73 | 94 | 21 |
| Nissan Skyline GT-R V-Spec II (BNR34) | flagship | 80 | 94 | 14 |

### Front-drive tuner (7)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Toyota Starlet Glanza V (EP91) | everyday | 32 | 84 | 52 |
| VW Golf GTI 16V (Mk2) | enthusiast | 42 | 84 | 42 |
| Honda Integra Type R (DC5) | enthusiast | 46 | 88 | 42 |
| Honda Integra Type R (DC2, '99) | enthusiast | 47 | 92 | 45 |
| Honda City Turbo II (AA) | entry | 49 | 72 | 23 |
| Honda Civic Type R (EK9) | enthusiast | 51 | 92 | 41 |
| Honda Prelude Si VTEC (BB4) | everyday | 54 | 88 | 34 |

The City Turbo II is the outlier and should be: the Bulldog left the factory as a caricature of a
modified car, so it starts high for an entry car and has little left to say.

### Exotic (6)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Porsche 911 Turbo 3.3 (930) | flagship | 55 | 80 | 25 |
| Ferrari 512 TR | flagship | 69 | 78 | 9 |
| Honda NSX-R (NA1) | flagship | 70 | 84 | 14 |
| Lexus LFA | flagship | 81 | 86 | 5 |
| Ferrari F355 Berlinetta (6MT) | flagship | 84 | 88 | 4 |
| Lamborghini Countach LP5000 QV | flagship | 88 | 92 | 4 |

### Oddball (5)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Alfa Romeo 75 3.0 V6 | enthusiast | 45 | 66 | 21 |
| Nissan S-Cargo | entry | 47 | 51 | 4 |
| 1965 Mini Cooper S (Mk1) | enthusiast | 52 | 74 | 22 |
| Toyota Sera (EXY10) | entry | 59 | 68 | 9 |
| Subaru Alcyone SVX Version L (CXD) | enthusiast | 72 | 77 | 5 |

**The class where judgement mattered most and no formula would have worked.** The S-Cargo is not
beautiful and is deeply charming, so it starts at 47 and gains four points from every part anyone
could fit: there is nothing to do to one. The SVX has the same shape of answer for the opposite
reason, because the glass canopy defeats every wheel and every drop. The Sera is a set of
butterfly doors and is otherwise a Starlet. The Alfa is the only car here with a low ceiling
because it had no scene in Japan at all rather than because nothing suits it.

### Kurokan (5)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Nissan Safari (Y60) | everyday | 22 | 78 | 56 |
| Mitsubishi Delica Star Wagon (P35W) | everyday | 26 | 80 | 54 |
| Toyota Land Cruiser 70 (LJ71) | everyday | 27 | 82 | 55 |
| Mitsubishi Pajero Evolution (V55W) | flagship | 37 | 86 | 49 |
| Suzuki Jimny (JA11) | entry | 46 | 88 | 42 |

Utility vehicles start near the bottom of the roster and finish near the top, which gives the
660,000-yen end of the game a genuine build route. The Pajero Evolution starts higher because the
factory already fitted the arches.

### Rotary (5)
| car | tier | base | ceiling | headroom |
| --- | --- | ---: | ---: | ---: |
| Mazda Savanna RX-7 (FC3S) | enthusiast | 65 | 92 | 27 |
| Mazda RX-8 Type RS (SE3P) | enthusiast | 66 | 88 | 22 |
| Eunos Cosmo 20B Type S (JC) | enthusiast | 68 | 82 | 14 |
| Mazda RX-7 (FD3S) | enthusiast | 82 | 96 | 14 |
| Mazda RX-7 Spirit R Type A (FD3S) | flagship | 83 | 96 | 13 |

The FD is the roster's one car that is both beautiful stock and improved by a widebody, which is
why it holds a high base and a 96 ceiling at the same time.

---

## 6. The calls to review first

Ordered by how much they would move if the maintainer disagrees.

1. **Z33 at 45.** The declared downward departure. The worked example says 30. One cell.
2. **The Kyusha split.** Four cars keep works-style headroom (510, ZG, Hakosuka, Kenmeri) and
   three do not (2000GT, Cosmo Sport, Z432). If the intent is "a Kyusha is always best left
   alone", the four drop to headroom of about 8 and the Kyusha Pack's bosozoku parts lose their
   home.
3. **Kenmeri 61 and Hakosuka 66.** Two of the four departures, and the only ones argued purely
   from price and stature rather than from a maintainer statement.
4. **Kurokan ceilings of 78 to 88.** A lifted Safari satisfying a *stancer* is mechanically
   correct and conceptually odd: the stancer wants a car slammed, not raised. If a kurokan buyer
   is ever authored, these want revisiting. Until then, high style is the only encoding available.
5. **Porsche 911 Turbo 3.3 at 55.** The old 13 leaves the 930 as by far the lowest-based Exotic,
   below three of its class at 69 to 88, and it misses the stancer stock. Defensible against the
   ranking, uncomfortable against the car.
6. **BMW M3 (E36) at 41 and Stagea 260RS at 36.** Two flagships at 2.45 and 2.75 million yen with
   presentable-not-handsome bases. Understatement is genuinely their point, but they are the
   lowest-based flagships on the roster.
7. **The two Chasers, 33 and 50.** The old column separates the JZX90 and the JZX100 by four
   points, which becomes seventeen after rescaling. Both were placed at the extreme ends of their
   bands to narrow it. The JZX90 is the better-loved shape, but probably not by seventeen.
8. **Datsun 510 at 33.** The roster's cheapest Kyusha, and a genuinely handsome 1968 coupe sitting
   level with an Alto Works. Held in band; a departure upward is arguable.
9. **Honda Civic 1.5 (EF2) ceiling 88, the roster's largest gap at 67 points.** Correct about the
   car, and it makes a 240,000-yen entry car the cheapest route to a stancer sale. That may be too
   generous an on-ramp.
10. **The AZ-1 at 75.** The first Legend the player acquires, and the only kei that satisfies a
    stancer stock. Nine points of headroom says "restore it, do not build it", which suits a
    Legend and slightly undersells a mid-engined gullwing.

---

## 7. Two notes on the brief

**Kurokan is not the VIP scene.** The brief describes it that way; the roster legend has it as
クロカン, cross-country, and the five cars in it are a Jimny, a Delica, a Safari, a Land Cruiser
and a Pajero Evolution. The conclusion still holds (modification is the entire point of that
scene), but the ceilings above are authored for lift kits and all-terrains, not for air
suspension. The roster's actual VIP canvases are in `Wangan` and `Drift`: the Aristo, the Soarer,
the Laurel, the Cefiro and the Cosmo 20B, which is why those five carry ceilings of 82 to 90.

**MG-074 carries two pre-existing data errors**, untouched here because this pass is additive:
`yearFrom` reads 1994 for a Z33, and `notes` is a verbatim copy of the Z32 row above it ("Same Z32
twin turbo, later Version S trim"). Worth a separate correction.
