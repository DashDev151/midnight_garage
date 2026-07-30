# MIDNIGHT GARAGE - Roster corrections and proposals v1

*Review pass against `midnight-garage-roster.csv` and `midnight-garage-roster.md` v2.3,
2026-07-30. Keyed by `uid` throughout, per section 3a: `rosterNo` is for reading, never for
referring.*

**Status legend, used on every item:**

- **FIX** - confirmed wrong, direction certain. Often the row's own `notes` or a section 10
  identity ruling already states the correct value; the numeric column just never caught up.
- **RULING** - a maintainer decision is needed. A recommendation is given and can be argued with.
- **TBC** - a candidate value with no anchor. Under the stand-in law these must not be treated
  as research or authored into `cars.json` before sourcing. They exist so the gap has a shape.
- **POLICY** - a rule about all cars. Belongs in `midnight-garage-roster.md`, not the CSV.

**Verified this pass (external sources):** Autech 260RS factory figures (280 PS/6800 rpm,
37.5 kg-m = 368 N-m/4400 rpm, 2568 cc, 1720 kg, WGNC34, ¥4,500,000 list in 1998); Wagon R
CT21S first-gen NA F6A at 55 PS (row MG-008 is correct as-is, no change).

---

## 1. Eight rows whose spec or measured block belongs to a different car

These are the rows where the export-twin problem is *inside* a single row rather than between
two rows. In five of them the `notes` column already flags it (LOUD FLAG) and states the correct
JDM figure; the fix is to promote the note into the columns. In all eight, the measured block
(the columns the performance model calibrates against, section 3a) currently describes the
wrong car and should be quarantined until re-measured - see policy P1 in section 5.

### 1a. MG-019 - Eunos Roadster (NA6CE)

Section 10 already rules this row "NA6CE 1.6, ¥440,000". The spec block is the NA8C 1.8 from
Forza, which the row's own note states plainly.

| column | current | proposed | status | why |
| --- | --- | --- | --- | --- |
| `yearFrom` | 1994 | 1989 | FIX | NA6CE production 1989-1993; 1994 is the NA8C. |
| `stockPowerPs` | 130 | 120 | FIX | B6-ZE, per the row's own note and the s.10 ruling. |
| `quotedPowerPs` | 120 | 120 (or blank, see P6) | FIX | No longer differs from stock. |
| `peakTorqueNm` | 149 | 137 | FIX | B6-ZE 14.0 kg-m at 5500 rpm. `torqueRpm` 5500 stands. |
| `displacementCc` | 1840 | 1597 | FIX | Must match `engineCode` B6-ZE (validation rule V2). |
| `curbWeightKg` | 1057 | 940 | FIX | Per the row's own note. |
| `redlineRpm` | blank | 7200 | TBC | B6-ZE redline; confirm against spec book. |
| measured block | Forza NA8C | quarantine | FIX | 8% more power, 12% more weight than the car this row is. Re-measure in sim at 120 PS / 940 kg. |

### 1b. MG-021 - Honda Prelude Si VTEC (BB4)

The note states it: Forza's is the US H23 Prelude Si at 162 PS / 1302 kg; ours is the JDM H22A
Si VTEC at 200 PS / 1240 kg.

| column | current | proposed | status | why |
| --- | --- | --- | --- | --- |
| `stockPowerPs` | 162 | 200 | FIX | JDM H22A, per the row's own note. |
| `peakTorqueNm` | 207 | 219 | FIX | H22A 22.3 kg-m at 5500 rpm. Current 207 is the US engine. |
| `curbWeightKg` | 1302 | 1240 | FIX | Per the row's own note. |
| measured block | Forza US car | quarantine | FIX | Telemetry of a car with 19% less power. |

### 1c. MG-022 - Nissan Silvia K's (S13)

The note rules the identity ("Ours is the SR20DET 2.0 at 205 PS / 1150 kg") and the engine
columns already agree. The three cells that still describe the 1989 CA18DET car:

| column | current | proposed | status | why |
| --- | --- | --- | --- | --- |
| `yearFrom` | 1989 | 1991 | FIX | SR20DET arrived with the 1991 facelift. 1989 + SR20DET is a contradiction. |
| `stockPowerPs` | 175 | 205 | FIX | 175 is the CA18DET. The note rules SR20DET. |
| `quotedPowerPs` | 205 | 205 (or blank, P6) | FIX | No longer differs. |
| `curbWeightKg` | 1140 | 1150 | FIX | Per the row's own note. The 1140 is the Forza-wiki CA18 car (the weight-conflict note documents that derivation). |
| measured block | forza-panel-override | keep, re-check | RULING | 6.331 s at 205 PS / 1150 kg is plausible (the S14 at 220 PS / 1265 kg reads 6.229). If the override already corrected for the CA18 source car, record that in `notes`; if not, quarantine like the others. |

*Section 10 addition:* record the ruling formally - **Silvia (22): priced and specced as the
1991-on K's (SR20DET). Alternate: 1988-1990 K's (CA18DET, 175 PS), not priced.**

### 1d. MG-036 - Nissan 180SX ('93 Type II)

The most gameplay-distorting row in the file: a Drift-culture hero car currently accelerating
like a Glanza because its measured block is the US 240SX (KA24DE, NA). The note already says
everything.

| column | current | proposed | status | why |
| --- | --- | --- | --- | --- |
| `stockPowerPs` | 157 | 205 | FIX | 157 is the KA24DE. The row is the SR20DET Type II. |
| `quotedPowerPs` | 205 | 205 (or blank, P6) | FIX | No longer differs. |
| `curbWeightKg` | 1322 | 1220 | FIX | Per the row's own note; 1322 is the 240SX. |
| measured block | Forza 240SX | quarantine | FIX | 8.332 s to 97 is a 23%-less-power car. Re-measure at 205 PS / 1220 kg; expect ~6.3-6.6 s, i.e. a whisker behind the S13/S14. |

### 1e. MG-041 - Toyota Chaser Tourer V (JZX90)

The note documents that Forza's car is the preceding JZX81 generation. Engine columns are fine
(same 1JZ-GTE); the chassis cells are the JZX81's.

| column | current | proposed | status | why |
| --- | --- | --- | --- | --- |
| `yearFrom` | 1991 | 1992 | FIX | JZX90 launched October 1992. 1991 is the Forza JZX81's year. |
| `curbWeightKg` | 1540 | 1450 | FIX | Per the row's own note ("1540 against our 1450 kg"). |
| measured block | Forza JZX81 | quarantine | FIX | 90 kg heavier than the car this row is. |

### 1f. MG-056 - Toyota Chaser Tourer V (JZX100)

The note says this row "takes Forza's 1997 Chaser 2.5 Tourer V", but the measured block is
byte-identical to MG-041's (5.933 / 14.526 / 0.86 G / 47.2 m) - the intended re-measure never
landed, so this row is a clone of a row that is itself the wrong generation. The note itself is
also MG-041's note verbatim.

| column | current | proposed | status | why |
| --- | --- | --- | --- | --- |
| `yearFrom` | 1991 | 1996 | FIX | JZX100 launched September 1996. |
| `peakTorqueNm` | 362 | 378 | FIX | VVT-i 1JZ-GTE: 38.5 kg-m. Current value pairs JZX81 torque with the VVT-i's 2400 rpm peak (`torqueRpm` 2400 is correct and stands). |
| `displacementCc` | 2490 | 2491 | FIX | Canonicalise with MG-041 (V2). |
| `curbWeightKg` | 1540 | 1470 | TBC | JZX100 Tourer V figure; confirm against spec book. 1540 is the JZX81 clone value. |
| `redlineRpm` | blank | 7000 | TBC | Match MG-041's 1JZ unless the spec book differs. |
| `drivetrain` | RWD | FR | FIX | Enum normalisation (P2); its own twin MG-041 already reads FR. |
| measured block | clone of MG-041 | quarantine | FIX | Clone of a wrong-generation measurement. Re-measure. |
| `notes` | MG-041's note | rewrite | FIX | Placeholder note; should describe this row's own provenance. |

### 1g. MG-071 - Autech Stagea 260RS (WGNC34)

Section 10 rules the identity ("Autech 260RS, ¥2,750,000; alternate 25t RS FOUR V") and the
note flags that Forza's car is the RS Four V - but every spec cell except `engineCode` and
`chassisCode` still carries the RS Four V's data, plus one cell no other row gets wrong:

| column | current | proposed | status | why |
| --- | --- | --- | --- | --- |
| `origin` | gaisha | jdm | FIX | It is a Nissan. Only Japanese car marked foreign; will poison any origin-keyed logic. (Validation rule V1 exists to catch exactly this.) |
| `stockPowerPs` | 235 | 280 | FIX | Factory 280 PS at 6800 rpm (verified this pass). The note's "320 PS" is the folk-actual for RB26s; siblings MG-077/078 use catalog 280, so consistency says 280 here. If the roster ever adopts actuals for RB26 cars, change all four together. |
| `quotedPowerPs` | blank | 280 (or blank, P6) | FIX | The 280-agreement car par excellence. |
| `powerRpm` | blank | 6800 | FIX | Verified. |
| `peakTorqueNm` | 274 | 368 | FIX | 37.5 kg-m at 4400 rpm, verified. 274 is the RB25DET. |
| `torqueRpm` | blank | 4400 | FIX | Verified. |
| `displacementCc` | 2500 | 2568 | FIX | RB26DETT; must match `engineCode` (V2). |
| `curbWeightKg` | 1620 | 1720 | FIX | Verified. 1620 is the RS Four V. |
| `redlineRpm` | blank | 8000 | TBC | Match the RB26 siblings unless the spec book differs. |
| measured block | Forza RS Four V | quarantine | FIX | 8.1 s to 97 is the 27%-less-power wagon. Expect mid-5s once re-measured; at ¥2.75M flagship this goes from worst value in the game to the GT-R-wagon it is priced as. |

Price provenance footnote for `roster-price-list-v2.md`: list price was ¥4,500,000 in 1998, so
the ¥2,750,000 used figure is comfortable and needs no change.

### 1h. MG-074 - Nissan Fairlady Z (Z33, '02)

The whole row below the engine code is a partial clone of MG-058 (Z32): identical measured
tuple (5.441 / 14.448 / 0.90 / 45.5), the Z32's 1520 kg, the Z32's torque figure, and MG-058's
note pasted verbatim ("Same Z32 twin turbo, later Version S trim" - describing a different
car).

| column | current | proposed | status | why |
| --- | --- | --- | --- | --- |
| `yearFrom` | 1994 | 2002 | FIX | The variantLabel already says '02. 1994 is the Z32 row's year. |
| `peakTorqueNm` | 384 | 363 | FIX | VQ35DE JDM: 37.0 kg-m at 4800 rpm (`torqueRpm` 4800 stands). 384 is neither car's figure. |
| `curbWeightKg` | 1520 | 1440 | TBC | Z33 6MT band is 1430-1470 by grade; pin once the grade is ruled (see below). 1520 is the Z32's. |
| `redlineRpm` | blank | 6600 | TBC | VQ35DE; confirm. |
| `drivetrain` | RWD | FR | FIX | Enum normalisation (P2). |
| measured block | clone of MG-058 | quarantine | FIX | Re-measure; a Z33 is ~80 kg lighter and differently geared. |
| `notes` | MG-058's note | rewrite | FIX | Placeholder note. |

*Section 10 addition:* the row needs a grade ruling the way the Laurel got one - **Fairlady Z
(74): priced as base Fairlady Z 6MT / Version S? Alternate: Version ST.** Weight follows the
ruling.

---

## 2. Confirmed single-cell fixes

| uid | car | column | current | proposed | status | why |
| --- | --- | --- | --- | --- | --- | --- |
| MG-055 | Integra Type R (DC2, '99) | `yearFrom` | 2001 | 1999 | FIX | 2001 is the DC5's year (MG-059 has it correctly). The '99-spec DC2 is 1999. |
| MG-047 | 1965 Mini Cooper S | `yearFrom` | 1964 | 1965 | FIX | Section 10 rules the row as the 1965 Cooper S; displayName agrees; the cell disagrees with both. |
| MG-087 | Kenmeri GT-R (KPGC110) | `styleBase` | 10 | 16 | FIX (value RULING) | Maintainer-confirmed too low. 16 places it above the 240ZG (15), below Supra/R32 (17): halo classic, arguably the prettiest Skyline, the roster's second-dearest Japanese car. Argue the digit, not the direction. |

---

## 3. Rulings requested

### 3a. Cosmo Sport culture: Kyusha -> Rotary (RULING, recommended)

Maintainer leans "Kyusha may just be wrong". The case for **Rotary**: the class is defined as
"a parts island and a knowledge island, and the reason a specialist exists at all" - no car in
the roster is more of a parts island than a 1960s hand-built two-rotor, and the Rotary
Pilgrimage already binds it into the rotary lineage as the pilgrimage's rarest step. The buyer
story fits too: in 1995 it is bought as *the first rotary*, the shrine object, not as a generic
pre-1975 classic. The case for Kyusha is real (pre-1975, provenance-over-performance,
wrong-engine-costs-more) but the rotary identity is the stronger of the two truths.

Effect on balance: Kyusha 7 -> 6, Rotary 5 -> 6; both stay inside the 5-11 band. Whichever way
it lands, record it in section 2's "calls worth re-opening" list so it stops being re-litigated.

### 3b. styleBase re-checks adjacent to the Kenmeri fix (RULING)

- **MG-084 Hakosuka at 12.** Sits oddly once the Kenmeri moves to 16: the KPGC10 is the more
  raced, more mythologised car. Suggest 14. Not confirmed by maintainer; flagged only.
- **MG-041 JZX90 at 13 vs MG-056 JZX100 at 9.** Near-identical cars four points apart, the
  facelift lower. Whichever way taste runs, they should sit within a point or two; suggest
  JZX100 -> 12. If the 4-point gap is a deliberate take, record it as a ruling so it reads as
  one.

### 3c. Two performance-model decision items (RULING)

- **MG-044 Pulsar GTI-R at 4.928 s to 97** - statistically tied with the BNR32 (4.923) and
  ahead of every Supra, FD and the F355's launch. Period magazines did record ~5.0 s AWD
  launches, so it is defensible; but at ¥930,000 it makes the fourth-fastest-launching car in
  the game cheaper than an S14. Keep it as the sleeper legend or soften it - either is fine,
  but make it a conscious economy decision, not an inherited measurement.
- **MG-088 NSX-R at 1.07 / 1.13 lateral G** - modern-sim grip; period tests sat ~0.95-1.0 on
  1992 tyres. Harmless as a relative ranking. Matters only if lateral G ever feeds a
  player-facing stat or price; decide once, note it, move on.

---

## 4. Roster addition: the missing RWD Skyline (maintainer-confirmed gap)

There is no non-GT-R Skyline in the roster, and the cheap-RB coupe is the canonical Drift-scene
first car. Proposed row, fully formed for the process:

| column | value | status |
| --- | --- | --- |
| `uid` | MG-095 (next free, never renumber) | - |
| `displayName` | Nissan Skyline GTS-t Type M (HCR32) | - |
| `yearFrom` | 1989 | - |
| `priceYen` | 740,000 **(TBC)** | Stand-in. Chosen to sit between the Cefiro (620,000) and the Laurel (730,000)-to-180SX (750,000) shelf, reflecting the Type M's period premium over the four-door RBs. Needs the archived-dealer sweep like the other nine; do not author before sourcing. |
| `tier` | everyday | Inside the 440-820k band; "the cheap end of fun" is exactly what it is. |
| `culture` | Drift | The class description already names it: "cheap rear-drive saloons bought for what they do sideways" - the GTS-t is that idea as a coupe. |
| `origin` / `rarity` / `scope` | jdm / common / Drift Pack | Drift Pack goes 4 -> 5 cars. |
| engine block | RB20DET, 215 PS / 6400, 27.0 kg-m (265 N-m) / 3200, 1998 cc, I6, turbo, redline 7500 | Spec-book confirm before authoring. |
| chassis | ~1260 kg, FR | Spec-book confirm. |
| `reliabilityBase` | 93 | Band 90-95, "the rest of modern Japan, including most turbocharged cars". |
| `styleBase` | 12 **(TBC)** | Below the S13 (15): loved for what it does, not how it looks. |

*Alternate for the section 10 table:* **ECR33 Skyline GTS25t (1993, RB25DET 250 PS, ~¥900,000)**
- the same idea one generation on. One of the two, not both; the HCR32 is recommended because
it undercuts the S13's price point less and is the scene's foundational RB chassis.

---

## 5. Policy proposals (rules about all cars -> `midnight-garage-roster.md`)

### P1. Wrong-variant quarantine

**A LOUD FLAG in `notes` means the measured block describes a different car.** Such a row must
carry a `meas` token in `estimatedFields`, `dataConfidence` capped at LOW, and its measured
block must not calibrate the performance model until re-measured or explicitly overridden
(`measuredFrom: forza-panel-override` plus a note saying what the override corrected, as
MG-022 may already have done). Today five flagged rows feed the model as if measured. Section
3a already says the measured columns "are not decoration"; this rule is that sentence with
teeth.

### P2. One drivetrain vocabulary

Current column runs two vocabularies at once: FF(16)/FWD(8), FR(17)/RWD(24), AWD(20)/4WD(4) -
the two Chasers literally read FR and RWD. **Canonical enum: `FF`, `FR`, `MR`, `RR`, `AWD`,
`4WD`.** Layout terms are the JDM-native choice and they carry information RWD throws away.
The AWD/4WD split is retained deliberately: `4WD` means a part-time transfer case and low
range, which is the Kurokan class's mechanical identity.

Mechanical mapping: all `FWD` -> `FF`; all `RWD` -> `FR` **except** the five below, where the
current value is not merely unnormalised but wrong about the layout:

| uid | car | current | correct |
| --- | --- | --- | --- |
| MG-088 | Honda NSX-R | RWD | MR |
| MG-090 | Ferrari F355 | RWD | MR |
| MG-091 | Ferrari 512 TR | RWD | MR |
| MG-092 | Countach LP5000 QV | RWD | MR |
| MG-082 | Porsche 911 Turbo (930) | RWD | RR |

Two judgement calls to rule: **MG-004 Acty (HA4)** currently AWD - a kei truck's part-time
system reads more `4WD`; and **MG-065 Pajero Evolution** currently AWD - Super Select is
genuinely both, pick one and note it.

### P3. Top-speed sanity for the Forza-derived figures

Four `topSpeedKmh` values are sim-optimistic beyond any period reality: MG-020 CR-X SiR
**250.0** (period ~195-200), MG-053 EK9 **243.2** (~225), MG-031 Glanza V **222.9**
(~180-200), MG-062 S15 **279.9** (~250). MG-029 EG6 at 215 is borderline. These look
drag-limited-in-sim rather than gearing-limited-in-reality, and if top speed feeds Wangan
gameplay they flatten the distance between an EK9 and a Supra. Options, pick one roster-wide:
re-derive from gearing; or add a `ts` token to `estimatedFields` and cap by era class; or
accept as sim-internal and say so in the .md.

Related design note, free with the audit: **the JDM 180 km/h limiter is a period fact the
roster ignores and the game could love** - "limiter removal" is one of the most
period-authentic first shop jobs a Wangan build can have.

### P4. Measured-provenance completeness

If any measured column is present, `measuredFrom` and `dataConfidence` are mandatory. About 30
rows currently carry full telemetry with neither (Vivio, GTI-R, Glanza, EK9, S15, 22B, NSX-R,
LFA, Stagea, Z33...). Most are mechanically backfillable from `specSource`; the rule prevents
the gap reopening.

### P5. Clone detection

Two rows sharing an identical (zeroTo97S, zeroTo161S, lateralG97, braking97To0M) tuple is a
copy, not a coincidence (caught MG-056<-MG-041 and MG-074<-MG-058, including a pasted `notes`
cell in both). A duplicate tuple across distinct uids fails validation unless `estimatedFields`
declares the clone.

### P6. `quotedPowerPs` convention

Section 3a defines it as "the advertised figure **where it differs**", implying
blank-when-equal; the CSV mostly fills it always (JZX90 280/280, Hakosuka 160/160...). Two
conventions in one column is a null-semantics trap for any code that reads it. Recommend
**always-filled** (no null meaning to remember) and amending the .md sentence; blank-when-equal
is equally fine if enforced. Pick one.

### P7. Canonical displacement per engine code

One engine code, one cc figure. Current drift: SR20 as 1998 (three rows) and 2000 (MG-044);
3S-GTE as 1998 (MG-050) and 2000 (MG-051); S20 as 1989 (MG-084/087) and 1990 (MG-080); 1JZ as
2491 (MG-041) and 2490 (MG-056); RB26 as 2568 (MG-077/078), 2570 (MG-083) and 2500 (MG-071).
Cosmetic individually, but it defeats any engine-code join. Canonical: SR20 1998, 3S-GTE 1998,
S20 1989, 1JZ-GTE 2491, RB26DETT 2568.

---

## 6. Directive-24 gap worklist (candidates marked, none sourced)

| uid | car | gap | candidate | status |
| --- | --- | --- | --- | --- |
| MG-001 | Honda Today (JW1) | `yearFrom` | 1985 | TBC |
| MG-011 | Mira TR-XX (L70) | `yearFrom`, `stockPowerPs`, `engineCode`, `curbWeightKg` - the emptiest row in the roster | 1985; 64 PS (post-'87 EB26 turbo) or 52 PS early; ~620 kg | TBC - this row needs a proper pass before it can be anything |
| MG-078 | GT-R V-Spec (BCNR33) | `yearFrom` | 1995 | TBC |
| MG-089 | GT-R Black Edition (R35) | `yearFrom` | 2007 | TBC |
| MG-009 | Civic 1.5 (EF2) | `styleBase` | 5 | TBC |
| MG-013 | S-Cargo | `styleBase` | 15 | TBC - it is an icon; the Sera reads 14 |
| MG-035 | Laurel Club S | `styleBase` | 11 | TBC - beside the Cefiro's 11 |
| MG-007 | Familia 1.5 (BG) | `drivetrain`, `curbWeightKg` | FF; ~950 kg | TBC - only row missing drivetrain entirely |
| MG-076 | S2000 (AP1) | `redlineRpm` | 8800 | TBC - the F20C's defining number; its absence is felt |

Note the .md's own gap table (section 3c) says `styleBase` is filled for 26; the CSV now has 91
filled. Either the doc is stale or 65 values were authored outside the sprint 140 process -
reconcile whichever way is true (see errata E2).

---

## 7. Validation predicates (each tied to the bug it would have caught)

Stated as testable predicates; each is one expression against the CSV.

| # | predicate | catches |
| --- | --- | --- |
| V1 | `origin = jdm` iff `brand` is in the Japanese-brand set | MG-071 marked gaisha |
| V2 | `displacementCc` matches the canonical cc for `engineCode` (P7 table) | B6-ZE at 1840; RB26 at 2500; all the rounding drift |
| V3 | notes containing LOUD FLAG => `estimatedFields` contains `meas` and `dataConfidence` <= LOW | five wrong-variant rows feeding the model (P1) |
| V4 | measured tuple unique across uids unless clone declared | MG-056, MG-074 (P5) |
| V5 | any measured column present => `measuredFrom` and `dataConfidence` present | ~30 rows (P4) |
| V6 | `drivetrain` in {FF, FR, MR, RR, AWD, 4WD} | the split vocabulary (P2) |
| V7 | `yearFrom` present, and consistent with any year in `displayName`/`variantLabel` | Z33 '02/1994, DC2 '99/2001, Mini 1965/1964, plus the four blanks |
| V8 | `quotedPowerPs` obeys whichever P6 convention is chosen | the mixed convention |
| V9 | origin jdm and 1989 <= yearFrom <= 2004 => `quotedPowerPs` <= 280 | the 280-agreement lint; currently clean, keeps it so |
| V10 | `tier` price band per section 1, with the ruled exceptions listed (180SX overlap) | future drift; the known overlap is data, not an error |

---

## 8. Errata in `midnight-garage-roster.md` itself (doc, not CSV)

| # | where | what |
| --- | --- | --- |
| E1 | section 4a table | Says "Honda Civic 1.5 (EF3)"; section 10's own ruling and the CSV say EF2 (EF3 is the 1.6 Si). Stale reference. |
| E2 | section 3c gap table | `styleBase` "filled 26" vs 91 in the CSV (only MG-009/013/035 blank). Reconcile doc or provenance. |
| E3 | section 11, open question 5 | "The Cosmo Sport (row 80)" - the Cosmo Sport is row 85; row 80 is the Z432. If the least-defended price is genuinely the Z432's, the sentence is about a different car; either way the row number is wrong. |
| E4 | MG-085 `notes` | Says "our Series I L10A at 110 PS" while displayName, chassisCode (L10B), 130 PS and the section 10 ruling all say Series II. The note lost the argument; update it. |
| E5 | MG-074 / MG-056 `notes` | Verbatim copies of MG-058's / MG-041's notes (section 1f/1h). The notes column is provenance; a pasted note is false provenance. |

---

## 9. Verified, no change needed

For completeness, things this pass checked and cleared:

- **Wagon R (MG-008) at 55 PS** - matches the first-gen NA F6A (61 PS RT/S and 64 PS turbo are
  other grades). Correct as the base car.
- **260RS price ¥2,750,000** - against a 1998 list of ¥4,500,000, comfortable. The spec block
  was the problem, never the price.
- **Tier/price inversions (180SX, Golf GTI)** - intentional per maintainer and section 1's
  ruled overlap. V10 encodes the exception rather than flagging it.
- **The stock/quoted convention on the 280-agreement cars** (Supra 324/280, Aristo 324/280,
  GTO 324/280) - coherent and good design. The section 1 fixes restore its meaning on the five
  rows where the "actual" was secretly a different market's engine.
- **Price-ladder anchors** - LFA at list ¥37.5M, R35 Black Edition at launch ¥9.471M, Kenmeri
  above Hakosuka, 2000GT at ¥23M: all sound.
- **reliabilityBase bands** - the CSV conforms to the section 3b band table throughout,
  including the good jokes (RX-8 the least reliable modern rotary at 72; NSX and Countach
  thirty points apart inside `Exotic`).
- **Kei class integrity** - every post-1990 kei at 64 PS quoted; the Vivio correctly an I4.

---

## Suggested order of work

1. Section 1 fixes (they change gameplay), with P1 quarantine applied in the same pass so the
   stale telemetry stops calibrating the model immediately.
2. Section 2 single cells and the P2 drivetrain normalisation (they will break code, and the
   fix is mechanical).
3. Re-measure the eight quarantined rows in the sim at corrected mass/power.
4. Rulings (section 3), the MG-095 addition (section 4), and the P3-P7 policy picks.
5. Validation predicates as a check script run in CI or pre-commit, so none of this regresses.
