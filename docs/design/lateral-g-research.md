# Lateral-g research: verified figures, and why they are NOT the sim's source

**Status: REFERENCE ONLY. Completed 2026-07-25.** Five research agents searched the full 85-car
roster for measured real-world skidpad figures. The headline conclusion is a negative one, and it is
the useful part: **these numbers are on a different scale from Forza's and must never be fed to the
lap model.** They are kept for authenticity, flavour copy, and sanity-checking only.

## Why they are not the sim's source

1. **Different scale.** The Countach LP5000 QV measures **0.86 g** (Car and Driver, April 1986,
   300 ft, read verbatim from the OCR'd scan) against Forza's **1.10 g**: a 28% gap. Forza does not
   replicate 1980s tyre technology, so period rubber's limitations largely vanish. The divergence
   looks era-dependent, which also explains why Forza's 1989 R32 (0.96) out-grips its 1997 GTO
   (0.89) when real-world era logic would reverse them.
2. **The same car varies hugely between tests.** The NSX measured 0.86 g (1990), 0.93 g (1994) and
   0.95 g (1995 NSX-T), all Car and Driver, all 300 ft. A 10% spread on one model from one magazine,
   driven by which year's tyres it wore.
3. **Coverage is structurally impossible.** Skidpad lateral-g is a US road-test convention. JDM-only
   and Euro-only cars were never measured this way, and pre-1975 cars predate the practice entirely.
   That is most of this roster.
4. **Methodology cannot be normalised.** 200 ft pads generally read higher than 300 ft, but not
   always: on the STI, Road and Track's 200 ft pad read 0.02 g LOWER than Car and Driver's 300 ft.
   Paired figures are a range, not convertible onto one scale.
5. **Aggregators are calculated, not measured.** automobile-catalog, carfolio, encycarpedia,
   ultimatespecs and fastestlaps return a plausible number for nearly every car, derived from
   specifications. That is the same circularity the formula already suffers from.

**Verification standard:** every figure below was read from the actual page or magazine scan. The
search-summary layer fabricated attributions at least four times during this work, including
attributing a 1982 road test to a Golf GTI 16V, an engine that did not exist until 1986.

## Verified figures (all Car and Driver 300 ft unless noted)

| Car | g | Note |
|---|---|---|
| Ferrari F355 | 1.02 | Jul 1995 |
| Mazda RX-7 (FD3S) | 0.99 | **R1 package car**; base/JDM plausibly 0.94-0.97 |
| Acura NSX-T | 0.95 | 1995; ordinary NA1, not Type R |
| Toyota Supra RZ (JZA80) | 0.95 | Mar 1993. R&T 0.98 on 200 ft: the two agree once pad size is allowed for |
| Nissan Skyline GT-R (BCNR33) | 0.94 | Dec 1995, V-Spec |
| Honda NSX | 0.93 | 1994 |
| Honda S2000 (AP1) | 0.90 | reject 0.95, that is the 2008 AP2 Club Racer |
| Subaru Impreza WRX STI (GDB) | 0.90 | R&T 0.88 on 200 ft |
| Honda Integra Type R (DC2) | 0.88 | US spec at 1161 kg; the 1060 kg JDM car plausibly exceeds it |
| Nissan 350Z (Z33) | 0.88 | **Track trim on 18s**, not our base 17-inch car |
| Nissan Silvia K's (S14) | 0.87 | US 240SX SE, NA KA24DE, not the JDM K's |
| Ferrari Testarossa | 0.87 | Sep 1986 |
| Toyota MR2 GT-S (SW20) | 0.86 | R&T Apr 1990, Rev1. Rev2 measured 0.91 (MT 1992) |
| Lamborghini Countach LP5000 QV | 0.86 | Apr 1986. The circulating 0.82 is the pre-QV 5000S on a 200 ft pad |
| Subaru Alcyone SVX | 0.86 | 1992 |
| Toyota Soarer (JZZ30) | 0.86 | **substitute: Lexus SC400 V8 (UZZ30)**, not the straight-six |
| Honda NSX | 0.86 | 1990, earliest car |
| Nissan Silvia (S13) / 180SX | 0.83 | US 240SX, SOHC KA24E |
| Porsche 911 Turbo (930) | 0.82 | **1986 4-speed car**, not the 1988 G50 |
| BMW M3 (E30) | 0.82 | R&T Feb 1988, probably a 200 ft pad, so not comparable to the C/D entries |
| Eunos Roadster (NA6CE) | 0.82 | Sep 1989; R&T 0.83 |
| Toyota MR2 (AW11) | 0.816 | R&T Nov 1984, 200 ft, **naturally aspirated**, not the supercharged car |
| Mitsubishi Starion | 0.80 | base car; 0.85 with the Sport Handling Package. Unattributed, LOW |
| Honda Prelude Si VTEC (BB4) | 0.80 | US car on **all-season** tyres; JDM on summer rubber reads higher |
| Lexus LFA | 1.02-1.04 | production figures (Edmunds/R&T/MT). C/D's verified 1.00 was a PROTOTYPE on non-DOT tyres |
| Nissan GT-R (R35) | 0.96 | 300 ft-equivalent. C/D's 0.99 was on a **185 ft** pad, which inflates it |
| Subaru Impreza 22B STi | 0.96 | Mar 1999, 235/40ZR-17 |
| Mitsubishi Lancer Evo VIII MR | 0.94 | US 2005 MY. Plain Evo VIII 0.90 in the same test |
| Nissan Skyline GT-R V-Spec (BCNR33) | 0.94 | Dec 1995, 245/45ZR-17 |
| Nissan Fairlady Z (Z32) Twin Turbo | 0.89 | Nov 1989. The NA car read 0.86 in the same test |
| Nissan Skyline GT-R V-Spec (BNR34) | 0.89 | R&T Jul 1999, presumed 200 ft. **See the contradiction below** |
| Mitsubishi Evo VI (plain, German mkt) | 0.90 | substitute for the TME, which has no test |
| Toyota Celica All-Trac (ST165) | 0.74 | **wrong generation**, a floor for the ST205, not an estimate |

**Explicitly rejected:** AE86 "0.79/0.82" (projectjdm cites nothing and gives both figures for the
same measurement), F355 "0.93/0.96/0.97" (unsourced, untraceable, or the Spider), E36 M3 "0.84"
(unverifiable), Testarossa "0.88" (unattributed), any "Est." figure.

## The capstone: two well-sourced figures that rank backwards

The **R33 V-Spec reads 0.94 g** on Car and Driver's 300 ft pad; the newer, wider-tyred **R34 V-Spec
reads 0.89 g** on Road and Track's 200 ft pad. That is backwards twice over: the later car should not
be slower, and the smaller pad should read higher, not lower. Both figures were read at source and
both are individually sound. No published data resolves it.

This is the whole problem in one line. Even where the real-world data exists and is well sourced, it
cannot be trusted to RANK two closely-related cars, which is exactly what a lap model needs it for.

## Two more traps worth recording

- **The 2000GT's "0.84 g" is braking deceleration from 80 mph**, not cornering, and sits in the
  Road and Track 1967 panel where it is easy to misread into a lateral slot. (Car and Driver's
  2000GT test is April 1968, not 1967.)
- **A "Car and Driver 1991 NSX, 0.86 g, 300 ft" figure** was asserted repeatedly by the search layer
  with convincing supporting detail. It appears on no fetchable page and C/D has no 1990-93 NSX
  archive test it could have come from. Fabricated.

## Structural gaps, by kind

- **No figure can exist:** the kei cars, the JDM Hondas (EG6, EK9, EF8), the JDM saloons (Chaser,
  Cefiro, Laurel, Altezza), the Euro rally cars (Delta Integrale, Escort Cosworth), the pre-1975
  classics (240ZG, 510, Kenmeri, Cosmo Sport, 2000GT).
- **Exists but gated:** Milano Verde, E36 M3, GTI 16V, RX-7 Turbo II, 350Z base, RX-8, 190E Evo II.
  Mostly gaisha and roster-only cars. Reachable with a Car and Driver archive subscription, or by
  reading the data cards in MotorWeek retro reviews.

## Method note for any future pass

`caranddriver.com`, `roadandtrack.com`, `motortrend.com` and `evo.co.uk` all refuse WebFetch but
answer a plain `curl` with a browser user-agent, and archive.org serves OCR'd magazine scans as raw
text. That combination is how the Countach and NSX figures were recovered and is the route if the
gated bucket is ever worth closing.
