# Roster Price List v2 - sliding progression clock (1995 → 2005)

Supersedes v1. Same research base (`msrp-consolidated.md`), new pricing basis: the game clock
advances with the player, so **each car is priced at the game year the player naturally reaches
it**, not at a single frozen 2005 moment. All 85 cars re-ranked; every v1→v2 change logged in
Section 4.

---

## 1. The basis (v2)

The game runs 1995→2005 with a strong progression: shitboxes and keis first, legends last. So
the "moment of pricing" slides with the tiers:

| Tier | Game years | What lives here | Priced as |
|---|---|---|---|
| **Starter** | ~1995–97 | old keis, shitbox saloons | what they cost on an ordinary mid-90s forecourt. **Bonus:** the "ABSENT by 2005" problem (Today, Sunny, Carina, City, L70 Mira) disappears: in 1996 these cars *were* on forecourts, and the 1998 Kyushu calibration page prices their world directly. |
| **Club** | ~1998–2001 | kei sports, cheap coupes, first drift cars | 5–10-year-old used cars at era-true retail (the "used-lot rule": the player buys the depreciated example, never the near-new one). |
| **Semi-pro** | ~2001–2003 | mainstream 90s sports cars | same used-lot rule, at 2001–03 values: these cars were 2–5 years younger than in v1's frozen 2005, so most rise 10–30%. |
| **Pro / Legend** | ~2004–05 | flagships, homologation specials, classics, halo | **frozen at 2004–05**: the endgame is one moment, so every endgame car is priced at the *same* date and stays directly comparable. Identical to v1. |
| **Expansion** | post-2005 | R35, LFA, RX-8 Type RS | Japanese launch list. Accuracy less critical per your note; these are placeholders that already sit in sensible slots. |

Two consequences worth stating plainly:

- **The order barely changes; the levels do.** The middle of the ladder inflates because a '95
  MR2 in 2001 was simply worth more than the same car in 2005. That's era-true *and* good for
  the game: it stretches the mid-game grind and widens the gap between starter and mid.
- **Cross-tier prices are from different dates by design.** Within a tier everything is
  same-date comparable; across tiers, the comparison is "what the player pays when they get
  there", which is the number that matters for progression.

Tags as before: **[P]** period observation for this grade · **[P~]** period model data adjusted
for grade/year/date · **[I]** interpolated · **[L]** launch list · **[O]** gameplay override,
where the grounded figure is preserved in the override tables (§7, §8) rather than lost.

---

## 2. The ranked list (v2)

"Yr" = the game year the price is set at. "vs previous" = the pairwise check.

| # | Car (variant priced) | Yr | Price (¥) | Tag | Anchor / vs previous |
|---|---|---|---:|---|---|
| 1 | Honda Today (JW1) | '96 | 100,000 | P~ | A 10-year-old base 550 kei on a mid-90s lot; the '91 Alto at ¥190k (1998) caps it from above. Floor. |
| 2 | Honda City E (AA) | '96 | 130,000 | I | 13-year-old base City; older than everything near it, so it sits just above the kei floor. |
| 3 | Nissan Sunny (B12) | '97 | 150,000 | P~ | 10-year-old base saloon; the H3 Presea at ¥180k (1998) is the direct calibration. Above City E: newer, bigger car; in-era, age beats future cult status. |
| 4 | Honda Acty (HA4 Truck) | '97 | 160,000 | O | **OVERRIDE (v2.2):** swapped with the Carina per your call: the joke truck belongs at the bottom of the starter tier. Grounded figure was ¥250k. |
| 5 | Suzuki Wagon R (CT21S) | '00 | 230,000 | O | **OVERRIDE (v2.2):** pushed way down (was ¥350k) below the City Turbo II per your call: a shopping kei shouldn't out-price fun cars, whatever the 1998 market thought. |
| 6 | Toyota Carina (AT150, 1.5) | '97 | 250,000 | O | **OVERRIDE (v2.2):** swapped with the Acty per your call. Grounded figure was ¥160k. |
| 7 | Daihatsu Mira TR-XX (L70) | '97 | 280,000 | P~ | Era-findable at last: the L200 TR-XX at ¥350k (1998) caps a 550cc L70 from above. Above Acty: hot-kei cachet. |
| 8 | Honda City Turbo II (AA) | '98 | 320,000 | P | Bulldogs held ¥250–320k from 1998 to 2006, one of the flattest curves in the set; priced at the top of the observed range for the earlier date. |
| 9 | Nissan S-Cargo | '99 | 330,000 | O | **OVERRIDE (v2.2):** trimmed (was ¥360k) to sit between the City Turbo II and the Sera per your call. |
| 10 | Toyota Sera (EXY10) | '99 | 340,000 | P~ | An 8-year-old Sera; its 2005 exact was ¥280k, and it was worth more the younger it was. Above City Turbo II: marginal, gullwing novelty vs turbo cult. |
| 11 | Subaru Vivio RX-R (KK4) | '00 | 380,000 | P~ | A '94 RX-R at 6 years ≈ 29% of its ¥1.328M list. **Now above the Wagon R**: the sliding clock resolves v1's Flag 1 by itself. |
| 12 | Suzuki Alto Works RS/Z (HA21S) | '01 | 400,000 | O | **OVERRIDE (v2.2):** cut from ¥520k per your call, now safely below the S13 (¥500k) and AW11 (¥510k), keeping its one notch over the Vivio RX-R. |
| 13 | Daihatsu Mira TR-XX Avanzato R (L502S) | '01 | 420,000 | O | **OVERRIDE (v2.2):** cut from ¥540k with its Suzuki rival; keeps its one-notch lead over the Works. |
| 14 | Eunos Roadster (NA6CE) | '02 | 440,000 | P~ | A '90–91 NA6 between its 1998 V-Special ¥990k and its 2004 ¥390k dealer-retail. Trimmed ¥20k in the v2.2 Prelude swap. |
| 15 | Honda CR-X SiR (EF8) | '98 | 480,000 | P | **Exact**: the 1998 Kyushu H2 SiR at ¥480k with warranty; priced at the datum, at its own date. Above NA6: B16A premium. |
| 16 | Honda Prelude Si VTEC (BB4) | '02 | 490,000 | O | **OVERRIDE (v2.2):** lifted above the Miata per your call (agreed: 200 PS shouldn't undercut 120 PS), and above the 160 PS CR-X by the same logic (my extension; veto if unwanted). Market truth was murkier: Preludes were unfashionable and cheap in period. |
| 17 | Nissan Silvia K's (S13) | '98 | 500,000 | P | **Exact-grade, exact-year, in-era**: the H1 K's HICAS-II at ¥480k on a 1998 Kyushu lot; clean K's ran to ¥580k on the same page. The best-evidenced cheap car in the game. |
| 18 | Toyota MR2 SC (AW11) | '99 | 510,000 | P~ | A 10-year-old supercharged AW11 in 1999, up-era from its exact ¥398k 2006 observation (three cars nationally, all high-mileage T-bars). Above S13: mid-engine rarity, marginal. |
| 19 | Mazda Familia GT-R (BG8Z) | '00 | 560,000 | I | An 8-year-old homologation special *before* the market fully abandoned it: the sliding clock rescues this row from the brutal 2006 sub-¥400k bound. v1's Flag 2 resolved. Above Avanzato: real car, homologation badge. Confirmed: this is the 323 GT-R (export badge for the BG8Z). **HIDDEN GEM by design**: 210 PS AWD at hot-hatch money. |
| 20 | Honda Beat (PP1) | '00 | 580,000 | P | Beat values were nearly flat across the window (¥399–898k for H3 cars); minor up-era nudge. Above Familia GT-R: cult liquidity. |
| 21 | Nissan Cefiro (A31 Cruising) | '00 | 620,000 | P~ | The ¥609k exact-grade ask (2005) back-dated slightly into the drift boom's rise. |
| 22 | Suzuki Cappuccino (EA11R) | '01 | 630,000 | O | **OVERRIDE (v2.2):** compressed from ¥720k. The real Cappuccino was a freak value-holder (¥530–798k for 13-year-old cars in 2007), but 64 PS at ¥720k fails the gameplay test. |
| 23 | Honda Civic SiR-II (EG6) | '00 | 650,000 | P~ | The 1998 Kyushu page had a plain SiR (one grade *below*) at ¥890k with fresh shaken; an SiR-II two years later lands here. Big v1 change (+¥160k): the ¥490k v1 figure was the 2006 tired-market read. Still miles above the Sunny. |
| 24 | Toyota Starlet Glanza V (EP91) | '01 | 680,000 | P~ | A '96 turbo at 5 years ≈ 45% of list; its ¥350–580k v1 range was the 2005 read of much older cars. |
| 25 | Datsun 510 Bluebird 1600 SSS | '02 | 690,000 | P | **Unchanged from v1**: genuine SSS money was flat at ¥500–800k from 2000 to 2006, so the clock doesn't move it. A 1970 classic sitting among 90s hatches is a lovely mid-game "gateway classic" beat. |
| 26 | Autozam AZ-1 (PG6SA) | '01 | 720,000 | O | **OVERRIDE (v2.2):** compressed hard from ¥990k. The rarity premium was real (4,392 built; standard cars ¥650k–1.2M), but the ABC ladder now reads Beat 580 < Cappuccino 630 < AZ-1 720: order preserved, gaps humane. |
| 27 | Nissan Laurel Club S (C33) | '01 | 730,000 | P~ | v1's promoted-page discount retained, then back-dated two notches into the drift boom. |
| 28 | Nissan 180SX ('93 Type II) | '01 | 750,000 | P~ | Mid-run car at 8 years; whole-run retail spanned ¥300k–1.7M with the standard-car reference at ¥500–700k buy-in. |
| 29 | Toyota Aristo 3.0V (JZS147) | '01 | 770,000 | I | The 3.0Q was ¥1.28M in mid-1998; the dearer 3.0V three years later lands here, before the JZS147 became the invisible cheap end it was by 2005. |
| 30 | VW Golf GTI 16V (Mk2) | '00 | 790,000 | P~ | The one observed ask was ¥800k (2005, modified); Mk2 GTI values were flat, so era ≈ same money for a cleaner car. |
| 31 | Daihatsu Copen (L880K) | '04 | 820,000 | O | **OVERRIDE (v2.3):** cut further from the v2.2 figure of ¥900k per your call, so a 64 PS kei sits below the AE86 rather than one notch above it. Now between the Golf GTI 16V and the FC RX-7 GT-X. Real Copens genuinely asked ¥1.2–1.45M near-new, so this is now a substantial deliberate departure from the research. |
| 32 | Mazda Savanna RX-7 GT-X (FC3S) | '00 | 850,000 | P~ | Splits its two firm observations: ¥980k (1998) and the ¥480k–1.08M spread (2006). The 2001 volume-dealer conflict page is set aside as in v1. |
| 33 | Toyota Chaser Tourer V (JZX90) | '01 | 870,000 | P~ | A '93–95 Tourer V at 6–8 years; the 2004 thread's ¥650k realistic sale sits three years and one market layer below this retail ask. Identity ruling I3 unchanged (JZX81 alt now ¥600k at '00). |
| 34 | Toyota Sprinter Trueno GT-APEX (AE86) | '99 | 890,000 | P | Now *inside* its best data: the July 1997 specialist ran GT-APEX cars at ¥950k–1.18M; a clean car two years later lands just under. The clock turns v1's compromise into a near-direct observation. |
| 35 | Eunos Cosmo 20B Type S (JC) | '01 | 910,000 | P~ | H2 Type S cars ran ¥600–999k in 2005; four years earlier, top of that band. |
| 36 | Nissan Pulsar GTI-R (RNN14) | '01 | 930,000 | P~ | The country's two examples asked ¥550k/¥880k in 2005; a clean car four years younger edges above. |
| 37 | Subaru Alcyone SVX Version L (CXD) | '01 | 950,000 | P~ | Clean Version Ls ¥690k–1.28M in 2005; up-era to a 9-year-old car. |
| 38 | Mitsubishi Starion GSR-VR (A187A) | '99 | 970,000 | P~ | Rarity held Starions firm (band ¥700k–1.3M even in 2005, 2–4 cars nationally); a 10-year-old GSR-VR in 1999 tops the club tier. |
| 39 | 1965 Mini Cooper S (Mk1) | '04–05 | 1,000,000 | O | **OVERRIDE (v2.2):** dropped to ¥1.0M flat per your call ("I don't care if that's not accurate"). It now reads like a nice Rover Mini wearing a '65 badge, which is honestly a fine fiction for a game. |
| 40 | Nissan Silvia K's (S14, '94) | '01 | 1,020,000 | P~ | A '94 K's at 7 years, between the 1998 market and its promoted 2005 asks. |
| 41 | Alfa Romeo 75 3.0 V6 | '00 | 1,100,000 | I | Still the shakiest mid-table price; grey-import premium over the ¥840–880k TS asks. Now sits *below* the SW20: the era clock flipped v1's order here, correctly. |
| 42 | Toyota MR2 GT (SW20, '95) | '01 | 1,180,000 | P~ | A '95 GT at 6 years: H10–11 cars still fetched ¥1.49–1.65M in 2005, so this is conservative. Big v1 change (+¥200k). |
| 43 | Toyota Celica GT-Four (ST205) | '02 | 1,350,000 | P~ | '95–96 cars were ¥1.08–1.09M in 2006; four years earlier ≈ here, with the '98 final at ¥1.68M capping it. |
| 44 | Mazda RX-7 Type R (FD3S, '92) | '01 | 1,450,000 | I | An early FD while the FD was *still in production*, meaningfully dearer than v1's 2006-forum read. |
| 45 | Honda Civic Type R (EK9) | '03 | 1,480,000 | P~ | The ¥1.28M volume point is Jan 2006; a '98–99 EK9 three years earlier sits ~15% up. |
| 46 | Toyota Altezza RS200 Z Edition | '03 | 1,620,000 | P~ | H11 cars were ¥1.46–1.48M in Dec 2005; a 4-year-old example in '03 lands here. |
| 47 | Honda Integra Type R (DC2, '99) | '03 | 1,680,000 | P~ | '99 cars ¥1.259–1.78M in 2006; at 4 years old, upper half. |
| 48 | Toyota Chaser Tourer V (JZX100) | '03 | 1,750,000 | P | Direct in-era datum: a 2003 purchase at ¥1.5M *with accident history*, dealers ~¥2.0M for the best cars → clean ¥1.75M. One of the strongest anchors in the mid-game. |
| 49 | Subaru Impreza WRX STi Version (GC8) | '02 | 1,800,000 | P~ | A '98 car was ¥1.58M in 2007; five years earlier ≈ ¥1.8M, still under the ¥2.56M+ V-Limited ceiling the file warns about. |
| 50 | Nissan Fairlady Z Version S TT (Z32, '94) | '01 | 1,850,000 | P~ | A '94 2-seater TT at 7 years, between the 1998 trade layer (H4 bids ¥0.8–1.3M) and the H11 ask (¥2.689M). |
| 51 | Honda Integra Type R (DC5) | '04 | 2,080,000 | P | '01–03 cars ran ¥1.59–2.2M in Jan 2006; near-new in '04, top of that. Note the order change vs v1: the DC5 now sits *below* the GTO/Soarer pair, which are priced two years earlier; see §4, order changes. |
| 52 | Mitsubishi GTO Twin Turbo (Z16A, '97) | '02 | 2,150,000 | P~ | The H11 car asked ¥2.28M in Nov 2005; a '97 five years old in '02 ≈ here. |
| 53 | Toyota Soarer 2.5 GT-T (JZZ30, '97) | '02 | 2,200,000 | P~ | The exact ¥1.899M is Nov 2005; three years earlier a '97 GT-T carried ~¥300k more. GTO/Soarer stay a near-peer pair, ¥50k apart, same order as v1. |
| 54 | Nissan Silvia Spec-R (S15, '02) | '04 | 2,280,000 | P | Unchanged; H14 volume asks ¥2.18–2.28M are already the "met late, near-new" price. |
| 55 | Mazda RX-8 Type RS (SE3P) | '05 | 2,380,000 | P~ | Re-anchored again per your call: now priced as an early-2003 first-year car, upper-middle of the real Jul 2005 RX-8 band (¥1.7–3.8M). Below the R33 V-Spec and E36 M3 as demanded, and arguably *more* grounded than before, since a period Type RS price cannot exist anyway. Expansion car. |
| 56 | BMW M3 (E36, '97) | '04–05 | 2,450,000 | P~ | **Endgame freeze begins here: everything from this row up is priced at 2004–05, exactly as v1.** Band ¥1.8–3.2M, good late car upper-middle. |
| 57 | Lancia Delta HF Integrale Evo | '04–05 | 2,550,000 | P~ | Unchanged; Evo II asks ¥2.48–3.1M, Evo I discounted. |
| 58 | Lancer Evo VI Tommi Mäkinen (CP9A) | '04–05 | 2,580,000 | P | Unchanged; volume ¥2.29–2.86M. Same-date comparable with the Evo VIII MR two rows up: the freeze exists precisely so pairs like this stay honest. |
| 59 | BMW M3 (E30) | '04–05 | 2,650,000 | P~ | Unchanged; 10 cars nationally, turning collectible. |
| 60 | Lancer Evo VIII MR (CT9A) | '04–05 | 2,680,000 | P | Unchanged; '04 GSR cars ¥2.29–2.859M. |
| 61 | Nissan Fairlady 240ZG (HS30) | '04–05 | 2,720,000 | P | Unchanged; genuine G-nose cars, typical clean ¥2.4–2.98M. |
| 62 | Autech Stagea 260RS (WGNC34) | '04–05 | 2,750,000 | P | Unchanged; identity ruling I2 stands (25t RS FOUR V alt ¥1.05M). |
| 63 | Subaru Impreza WRX STI (GDB, '04) | '04–05 | 2,780,000 | P | Unchanged; ¥2.48–2.999M for '04 cars. |
| 64 | Ford Escort RS Cosworth | '04–05 | 2,850,000 | I | Unchanged; tiered above the Integrale on grey-import scarcity. |
| 65 | Nissan Fairlady Z (Z33, '02) | '04–05 | 2,880,000 | P | Unchanged; held 75–95% of list. |
| 66 | Toyota Supra RZ (JZA80, '98) | '04–05 | 2,890,000 | P | Unchanged; the exact clean-car ¥2.89M, still ¥10k over the Z33 by design. |
| 67 | Honda S2000 (AP1, '03) | '04–05 | 3,380,000 | P | Unchanged; 97% of list. |
| 68 | Nissan Skyline GT-R (BNR32) | '04–05 | 3,500,000 | P~ | **Moved into the endgame freeze and lifted (v2.3)** per your call: at ¥2.35M it sat below the E36 M3, the E30 M3, the Lancia Delta, the Evo VI TME and the Evo VIII MR, which fails the feel test for the game's most iconic car. ¥3.5M sits comfortably inside the observed 2005 band (¥500k–10.1M), with real low-mileage V-Spec listings at ¥4.88M and ¥4.89M above it, so the new figure is *better* grounded than the interpolation it replaces. Above the S2000, below the RX-7 Spirit R. |
| 69 | Nissan Skyline GT-R V-Spec (BCNR33) | '04–05 | 3,750,000 | I | **Lifted (v2.3)** to preserve the Skyline generational ladder (R32 below R33 V-Spec below R34 V-Spec II) after the R32 moved. **An extension of your R32 call, not a separate approval; veto if unwanted.** ¥3.75M sits in the upper half of the observed ¥1.3–4.5M generation band against a ¥5.39M list, and since that band pools standard cars with V-Specs, the upper half is where a V-Spec belongs. Better grounded than the ¥2.48M it replaces. |
| 70 | Mazda RX-7 Spirit R Type A (FD3S) | '04–05 | 3,880,000 | P | Unchanged; zero depreciation against its ¥3.998M list. |
| 71 | Nissan Fairlady Z432 (PS30) | '04–05 | 4,380,000 | P | Unchanged; the ¥3.85M/¥4.98M conflict split toward the middle. |
| 72 | Subaru Impreza 22B-STi | '04–05 | 4,480,000 | P | Unchanged; a clean 22B asked full list eight years on. Still ¥100k above the Z432 per the period data. |
| 73 | Porsche 911 Turbo 3.3 (930) | '04–05 | 5,500,000 | I | Unchanged; bracketed under the 964 Turbo (¥6.95M, same 2005 page). |
| 74 | Nissan Skyline GT-R V-Spec II (BNR34) | '04–05 | 5,680,000 | P~ | Unchanged; upper half of the ¥3.6–8.0M band, near list. |
| 75 | Skyline 2000GT-R Hakosuka (KPGC10) | '04–05 | 6,500,000 | P | Unchanged; the Dec 2005 five-car median. |
| 76 | Mazda Cosmo Sport 110S (Series II) | '04–05 | 6,800,000 | I | Unchanged; least-anchored classic, between Hakosuka and Kenmeri. |
| 77 | Mercedes 190E 2.5-16 Evolution II | '04–05 | 6,850,000 | O | **OVERRIDE (v2.2):** trimmed from the exact ¥6.98M single listing per your call. Kept above both the Hakosuka and the Cosmo Sport so no order changes; going below ¥6.8M would drop it under the Cosmo. |
| 78 | Skyline 2000GT-R Kenmeri (KPGC110) | '04–05 | 8,800,000 | P | Unchanged; ¥8.8M across nine captures. Identity ruling I1 stands (GT-X alt ¥1.05M). |
| 79 | Honda NSX-R (NA1) | '04–05 | 8,980,000 | P | Unchanged; exact. |
| 80 | Nissan GT-R Black Edition (R35) | list | 9,471,000 | L | Expansion car; launch list. |
| 81 | Ferrari F355 Berlinetta (6MT) | '04–05 | 9,480,000 | P | Unchanged; volume of 35 manual cars ¥9.0–9.9M. |
| 82 | Ferrari 512 TR | '04–05 | 10,800,000 | I | Unchanged; above the F355, below the Countach. |
| 83 | Lamborghini Countach LP5000 QV | '04–05 | 14,800,000 | I | Unchanged. |
| 84 | Toyota 2000GT (MF10) | '04–05 | 23,000,000 | P | Unchanged; ¥23M inc-tax, Dec 2005, in-window. |
| 85 | Lexus LFA | list | 37,500,000 | L | Expansion car; launch list. Ceiling. |

---

## 3. Identity rulings - unchanged from v1, alternates re-dated

| Row | Priced as | Alternative under the v2 clock |
|---|---|---|
| Kenmeri (`...kgc110`) | GT-R (KPGC110), ¥8,800,000 | GT-X, ¥1,050,000 (period-observed, would slot near the S14) |
| Stagea (`...260rs`) | Autech 260RS, ¥2,750,000 | 25t RS FOUR V, ¥1,050,000 (interpolated, '02) |
| Chaser (`...jzx90`) | JZX90 Tourer V, ¥870,000 | JZX81 GT Twin Turbo, ¥600,000 (interpolated, '00; was ¥480k under the frozen clock) |
| Mini (`rover-mini-cooper-1-3i`) | 1965 Cooper S, ¥1,000,000 (v2.2 override) | 1990s Rover Mini 1.3i, ¥1,750,000 (period-observed; note this now sits *above* the car it is an alternative to, an inversion the v2.1 and v2.2 cuts created and your call to resolve) |
| Cosmo Sport (`...l10a`) | Series II (L10B), ¥6,800,000 | L10A, same price |
| US-named rows | JDM car per id | NA6CE priced as the 1.6; NA8C alt ≈ ¥700,000 at '02 |

---

## 4. Change log v1 → v2

**51 of 85 prices changed; 34 unchanged: the endgame freeze (rows 56–85, including the
three expansion cars at list, and excepting the BNR32 at row 68, the one car inside the freeze
whose price moved in the v2.3 pass) plus the 510, the Copen and the S15.** The order changed in only six places, listed at the
end; everything else is a level shift with rank preserved.

### Starter tier - re-priced at ~1996–97 (era forecourt, ABSENT problem dissolved)

| Car | v1 | v2 | Why |
|---|---:|---:|---|
| Today JW1 | 80,000 | 100,000 | On mid-90s lots it was a real car, not a 2005 ghost; capped by the ¥190k '91 Alto. |
| City E | 150,000 | 130,000 | In-era, a 13-year-old City sits below a 9-year-old Sunny; v1's "future cult" premium removed. |
| Sunny B12 | 120,000 | 150,000 | Presea-calibrated (¥180k for an H3 in 1998). |
| Carina AT150 | 130,000 | 160,000 | Same logic, one notch up. |
| Acty '94 | 230,000 | 250,000 | A '94 truck met in '97 is young; even the tired example costs more. |
| Mira TR-XX L70 | 250,000 | 280,000 | Era-findable; L200 TR-XX ¥350k (1998) caps it. |

### Club tier - re-priced at ~1998–2001 (used-lot rule)

| Car | v1 | v2 | Why |
|---|---:|---:|---|
| City Turbo II | 300,000 | 320,000 | Flat curve; top of its stable ¥250–320k range at the earlier date. |
| Sera | 280,000 | 340,000 | 8-year-old car vs the 14-year-old car v1 priced. |
| Wagon R | 330,000 | 350,000 | On the down-slope from its 1998 near-¥1M asks. |
| S-Cargo | 320,000 | 360,000 | Pike cult, firmer earlier. |
| Vivio RX-R | 290,000 | 380,000 | 6-year-old car ≈ 29% of list. **Resolves v1 Flag 1**: now above the Wagon R without touching the data. |
| Prelude BB4 | 380,000 | 440,000 | 8-year-old car, sliding from ~¥900k-class 1998 money. |
| Roadster NA6 | 430,000 | 460,000 | Between 1998 (¥990k V-Special) and 2004 (¥390k retail). |
| CR-X EF8 | 440,000 | 480,000 | Now priced *at* its exact 1998 datum instead of discounting it. |
| Silvia S13 K's | 450,000 | 500,000 | Same: the 1998 exact (¥480k, clean cars to ¥580k) used at its own date. |
| MR2 SC AW11 | 398,000 | 510,000 | 10-year-old car in '99 vs the 17-year-old car v1 priced from the thin 2006 sample. |
| Alto Works HA21S | 470,000 | 520,000 | 5–6-year-old RS/Z, up-era from the 2006 spread. |
| Mira Avanzato R | 480,000 | 540,000 | Keeps its one-notch lead over the Suzuki. |
| Familia GT-R | 390,000 | 560,000 | **Resolves v1 Flag 2**: priced in 2000, before the market fully abandoned it, instead of at the brutal 2006 ≤¥400k bound. Now a plausible homologation price while staying far under the GTI-R. |
| Beat | 560,000 | 580,000 | Flat curve, minor nudge. |
| Cefiro A31 | 590,000 | 620,000 | Back-dated into the rising drift boom. |
| Civic SiR-II EG6 | 490,000 | 650,000 | Largest club-tier move: the 1998 plain-SiR at ¥890k (one grade below, fresh shaken) anchors an SiR-II two years later here. v1's ¥490k was the tired 2006 market. |
| Glanza V | 520,000 | 680,000 | A 5-year-old '96 turbo ≈ 45% of list. |
| Cappuccino | 650,000 | 720,000 | Famously flat depreciation; firmer at 7 years old. |
| Laurel C33 | 720,000 | 730,000 | v1's promoted-page discount kept, tiny era nudge. |
| 180SX | 680,000 | 750,000 | Mid-run car at 8 years. |
| Aristo 3.0V | 660,000 | 770,000 | Anchored off the ¥1.28M 3.0Q of mid-1998 rather than the invisible 2005 cheap end. |
| Golf GTI 16V | 740,000 | 790,000 | Flat import values; clean car ≈ the observed ¥800k ask. |
| RX-7 FC GT-X | 750,000 | 850,000 | Now the midpoint of its two firm observations (¥980k in '98, ¥480k–1.08M in '06). |
| Chaser JZX90 | 780,000 | 870,000 | 6–8-year-old Tourer V, three years before the ¥650k thread figure. |
| AE86 GT-APEX | 800,000 | 890,000 | Sits just under the 1997 specialist band (¥950k–1.18M): the clock turns v1's compromise into near-direct observation. |
| Eunos Cosmo 20B | 830,000 | 910,000 | Top of its H2 band, four years earlier. |
| Pulsar GTI-R | 840,000 | 930,000 | Clean car, four years younger than the 2005 pair. |
| Alcyone SVX | 860,000 | 950,000 | 9-year-old Version L. |
| Starion GSR-VR | 890,000 | 970,000 | Rarity-firm; 10-year-old car in '99. |
| AZ-1 | 900,000 | 990,000 | Stable range, priced high-middle at 8 years. |
| Silvia S14 K's | 920,000 | 1,020,000 | A '94 at 7 years, between the '98 market and the promoted 2005 asks. |

### Semi-pro tier - re-priced at ~2001–2003

| Car | v1 | v2 | Why |
|---|---:|---:|---|
| Alfa 75 3.0 V6 | 1,080,000 | 1,100,000 | Token nudge; still the shakiest price in the middle. |
| MR2 SW20 GT | 980,000 | 1,180,000 | A '95 GT at 6 years; H10–11 cars still made ¥1.49–1.65M in 2005, so this is conservative. |
| Celica ST205 | 1,180,000 | 1,350,000 | '95–96 cars four years before their ¥1.08M 2006 read. |
| RX-7 FD Type R ('92) | 1,320,000 | 1,450,000 | Priced while the FD was still in production. |
| Civic Type R EK9 | 1,280,000 | 1,480,000 | ~15% up-era from the Jan 2006 volume point. |
| Altezza Z Edition | 1,480,000 | 1,620,000 | 4-year-old car in '03. |
| Integra Type R DC2 | 1,520,000 | 1,680,000 | '99 car at 4 years, upper half of its 2006 spread. |
| Chaser JZX100 | 1,580,000 | 1,750,000 | Direct 2003 datum: ¥1.5M *with* accident history, ~¥2.0M dealer best → ¥1.75M clean. |
| Impreza GC8 STi | 1,650,000 | 1,800,000 | Five years before the ¥1.58M 2007 observation. |
| Fairlady Z32 VS TT | 1,680,000 | 1,850,000 | '94 car at 7 years, between the '98 trade layer and the H11 ask. |
| Integra Type R DC5 | 1,980,000 | 2,080,000 | Near-new in '04, top of its 2006 range. |
| GTO Twin Turbo | 1,860,000 | 2,150,000 | '97 car at 5 years. |
| Soarer 2.5 GT-T | 1,890,000 | 2,200,000 | Same logic; the pair stays ¥50k apart in v1's order. |
| Skyline GT-R BNR32 | 1,780,000 | 2,350,000 | Biggest single move: in 2000 an R32 GT-R was a ¥2–3M car. v1's figure was the 2005 tired-market interpolation. |

### Order changes (the only six)

1. **City E vs Sunny B12**: swapped. In-era, age and size beat future cult status.
2. **Vivio RX-R vs Wagon R**: swapped (RX-R now above). v1's Flag 1 is closed: the fix came
   from the clock, not from overriding data.
3. **Familia GT-R**: climbs from #13 to #18, out of the sub-EG6 embarrassment. Flag 2 closed.
4. **Alfa 75 vs MR2 SW20**: swapped (SW20 now above). The Alfa price was a guess; the SW20's
   era price is data-backed, so the data-backed car wins the slot.
5. **DC5 vs GTO/Soarer**: the DC5 (priced '04) now sits below the pair (priced '02). A
   cross-date artifact of the sliding clock; harmless, and arguably nice: the big JZ coupes
   feel appropriately expensive in their moment.
6. **S15 vs BNR32** (restated at v2.3): the R32 GT-R no longer sits one notch above the S15, it
   sits far above it. The sliding clock moved it past the S15 in v2; the v2.3 maintainer pass
   then moved it into the endgame freeze at ¥3.5M (see §8), so it is now row 68 against the
   S15's row 54, with thirteen cars between them including both M3s, the Integrale, both Evos
   and the Supra RZ. Same conclusion as before, much larger gap: the R32 is a serious endgame
   aspiration, not a bargain.

### Unchanged and why

- **Endgame freeze (rows 56–85 except expansion cars, and except the BNR32 at row 68, moved
  into the freeze and re-priced in the v2.3 pass):** Pro/Legend cars are all priced at the
  same 2004–05 moment so they stay same-date comparable: this preserves every carefully
  balanced v1 pair (TME vs Evo VIII MR, Z432 vs 22B, Hakosuka vs Kenmeri, F355 vs 512 TR).
- **510 SSS (¥690k):** its market was flat 2000–2006; the clock cannot move it.
- **Copen (¥1.26M), S15 (¥2.28M):** met late-game as near-new; v1 already priced them there.
- **R35, LFA, RX-8 Type RS:** expansion placeholders at launch list, per your note.

---

## 5. Remaining flags (v2)

1. **The endgame freeze boundary sits between the RX-8 Type RS (¥2.38M, priced '05) and the E36
   M3 (¥2.45M, priced '04–05).** The BNR32 was the boundary car until v2.3 moved it inside the
   freeze. If you later re-tier a car across that line, re-date its price.
2. **22B above Z432** still stands (true in 2005, inverted today): flip if your endgame leans
   classic-prestige; they're ¥100k apart so the flip is cheap.
3. **Kenmeri as GT-R (¥8.8M)** remains the biggest single lever: confirm against your physics
   spec (160 PS = GT-R).
4. **Familia GT-R at ¥560k** is now interpolation on top of interpolation (no period figure at
   any date). It reads right, but it's the least-defended price in the club tier.
5. **Mid-game inflation is a feature, not a bug**, but if your economy tuning wants the old
   flatter middle back, v1's numbers remain valid as "same cars, frozen 2005 clock" and the two
   lists share an identical order everywhere except the six swaps above.

---

## 6. v2.1 revisions (from your review pass)

| Change | Old | New | Reason |
|---|---:|---:|---|
| 1965 Mini Cooper S | 3,480,000 | 2,620,000 | Your call: too expensive. Was interpolated anyway (no Japanese figure exists), so nothing grounded is lost. It now sits between the TME and the E30 M3, under the Supra; the "Mini above Supra" optics problem is gone. |
| Mazda RX-8 Type RS | 3,180,000 (launch list) | 2,560,000 | Your call: must be under the Supra. Bonus: the new figure is *better* grounded; it's the file's only real Type RS observation (¥2.55M, five near-new cars, Jul 2009) instead of a list-price placeholder. |
| Mazda Familia GT-R | 560,000 | 560,000 (unchanged) | Confirmed: this is the 323 GT-R; "323 GT-R" is the export badge for the same BG8Z. Price deliberately kept low as the roster's **flagship hidden gem**: 210 PS AWD homologation metal at hot-hatch money. |

**Hidden gems (cars that outperform their price, by design):** Familia/323 GT-R (¥560k, the
flagship of the category), Pulsar GTI-R (¥930k, 230 PS), Cefiro A31 (¥620k, RB20DET), Vivio
RX-R (¥380k, supercharged), Glanza V (¥680k, turbo). These are all *priced correctly for their
period markets*: the market undervalued them, which is exactly what makes them gems. No price
was distorted to create the effect.

**Settled by your review (no longer open flags):** the S15 vs BNR32 seam is superseded by the
v2.3 pass, which moved the R32 thirteen rows above the S15 and into the endgame freeze (§8). Evo
II above the Hakosuka: kept.

### Confidence audit: long-gap endgame cars (built decades before their pricing moment)

The calendar gap is not the risk: the risk is whether a period observation exists *at the
pricing date*. Two groups:

| Confidence | Cars | Why |
|---|---|---|
| **HIGH: gap already priced by the market** | NSX-R (¥8.98M, two captures, grade-verified), 2000GT (¥23M in-window), Kenmeri (nine captures), Hakosuka (5-car stock list), Z432, 240ZG, 22B, F355 (35 cars), Evo II (single but exact), 510 SSS | A real 2005-era dealer ask exists for the exact car; all the intervening appreciation is baked into the observed number. The age gap is irrelevant. |
| **MEDIUM: bracketed by real neighbours** | 930 Turbo (capped by the ¥6.95M 964 Turbo on the same 2005 page), 512 TR (floored by the F355 ask spread), BNR34 (band, upper half) | No direct observation, but a same-page calibration figure pins one side. |
| **LOW: pure interpolation across the gap** | Countach (±25–30%; note 2005 is *pre*-boom, so if wrong, likely slightly high), Cosmo Sport (proven ABSENT everywhere, the least-defended endgame price), Escort Cosworth, Mini Cooper S (now dropped anyway) | Confident in the **slot** (ordinal position between neighbours), not the digit. If a number is wrong here it is wrong *in place*; correcting it later reshuffles nobody. |

---

## 7. v2.2 - gameplay overrides (your balance pass)

These are deliberate departures from the research for gameplay reasons: cars whose real-world
prices were too high for their performance level, leaving no reason to ever buy them. Every one
is tagged **[O]** in the table so the grounded figure is never lost.

| Car | Grounded (v2.1) | Override (v2.2) | Note |
|---|---:|---:|---|
| Honda Acty | 250,000 | 160,000 | Swapped with the Carina: joke truck to the bottom. |
| Toyota Carina AT150 | 160,000 | 250,000 | Other half of the swap. |
| Wagon R CT21S | 350,000 | 230,000 | Way down, below the City Turbo II. |
| S-Cargo | 360,000 | 330,000 | Slotted between Turbo II and Sera. |
| Roadster NA6CE | 460,000 | 440,000 | Half of the Prelude swap. |
| Prelude Si VTEC BB4 | 440,000 | 490,000 | Now above the Miata (agreed) **and** above the 160 PS CR-X, my extension of your logic; veto if unwanted. |
| Alto Works HA21S | 520,000 | 400,000 | Below the S13 and AW11, one notch over the Vivio. |
| Mira Avanzato R | 540,000 | 420,000 | Cut with its Suzuki rival, notch preserved. |
| Cappuccino EA11R | 720,000 | 630,000 | ABC compression. The historical gaps *were* accurate (the Cappuccino was a freak value-holder and the AZ-1's rarity premium was real), but 64 PS keis crowding ¥1M is bad gameplay. |
| AZ-1 PG6SA | 990,000 | 720,000 | ABC compression; ladder now Beat 580 < Cappuccino 630 < AZ-1 720. |
| Copen L880K | 1,260,000 | 900,000 | Real Copens genuinely asked ¥1.2M+ near-new; overridden for performance-per-yen. |
| 1965 Mini Cooper S | 2,620,000 | 1,000,000 | Flat ¥1.0M per your call. Effectively priced as a nice Rover Mini wearing a '65 badge, a fine fiction. |
| RX-8 (SE3P) | 2,560,000 | 2,380,000 | Not really an override: re-anchored as an early-2003 first-year car in the real Jul 2005 band (¥1.7–3.8M), below the R33 V-Spec. More grounded than the '09 figure, since a period Type RS price cannot exist. |
| 190E Evo II | 6,980,000 | 6,850,000 | Slight trim off the exact single listing. Still above the Hakosuka (your earlier call) and the Cosmo Sport, so no order changes. Dropping below ¥6.8M would put it under the Cosmo; your choice if you want more off. |

**Design note carried forward:** the hidden-gem set (Familia/323 GT-R, Pulsar GTI-R, Cefiro
A31, Vivio RX-R, Glanza V) now gains company from the *opposite* direction: the overridden keis
(Works, Avanzato, AZ-1, Copen) are no longer overpriced traps, which was the point.

---

## 8. v2.3 - maintainer pass

Three moves against the v2.2 table. **The Copen and BNR32 changes you approved directly. The
BCNR33 change is not a separate approval: it is a consequential extension of the BNR32 call,
made to keep the Skyline ladder intact, and it is offered here for veto.** Ranks shift with the
prices, so the Copen drops three places and the two Skylines climb thirteen and eleven.

| Car | v2.2 | v2.3 | Reason |
|---|---:|---:|---|
| Copen L880K | 900,000 | 820,000 | Your call: a 64 PS kei belongs below the AE86, not one notch above it. Row 34 to row 31, now between the Golf GTI 16V and the FC RX-7 GT-X. The distance from the real ¥1.2–1.45M near-new asks is now large and fully deliberate. |
| Skyline GT-R BNR32 | 2,350,000 | 3,500,000 | Your call: at ¥2.35M the game's most iconic car sat below both M3s, the Integrale, the Evo VI TME and the Evo VIII MR, which fails the feel test. Moved into the endgame freeze (Yr now '04–05, tag now P~) and lifted to row 68, above the S2000 and below the RX-7 Spirit R. ¥3.5M is well inside the observed 2005 band of ¥500k–10.1M and under the ¥4.88M/¥4.89M low-mileage V-Spec asks, so it is better grounded than the interpolation it replaces. |
| Skyline GT-R V-Spec BCNR33 | 2,480,000 | 3,750,000 | **Extension of the R32 call, not an approved change; veto if unwanted.** Preserves the generational ladder (R32 below R33 V-Spec below R34 V-Spec II) after the R32 moved. Row 58 to row 69. ¥3.75M is the upper half of the observed ¥1.3–4.5M R33 band against a ¥5.39M list, and since the band pools standard cars with V-Specs, the upper half is where a V-Spec belongs. Also better grounded than the ¥2.48M interpolation it replaces. |
