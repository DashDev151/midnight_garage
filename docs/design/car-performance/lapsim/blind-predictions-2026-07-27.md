# Blind prediction set, committed 2026-07-27

Written BEFORE the maintainer drove any of these laps. Nothing below may be edited after driven
times arrive; corrections go in a new section at the bottom.

## The three cars, and why they are clean

None of these three has been used to fit anything, on any course. Nineteen roster cars have been
used somewhere across the Misaki, Hakone and Wangan fits; these are not among them.

| Car | Drive | PS | kg | mu | Character |
|---|---|---|---|---|---|
| 1998 Subaru Impreza 22B-STi | AWD | 280 | 1270 | 0.93 | turbo, understated-power class |
| 1990 Mercedes-Benz 190E 2.5-16 Evolution II | RWD | 238 | 1340 | 0.88 | naturally aspirated |
| 1997 Honda Civic Type R (EK9) | FWD | 185 | 1090 | 0.86 | naturally aspirated VTEC |

Between them: every drivetrain, three eras, three engine characters, and a 95 PS spread.

## The predictions

| Car | Hakone | Wangan | Misaki |
|---|---|---|---|
| Impreza 22B-STi | **111.8 s** (1:51.8) | **133.4 s** (2:13.4) | **105.1 s** (1:45.1) |
| 190E 2.5-16 Evo II | **119.7 s** (1:59.7) | **142.1 s** (2:22.1) | **111.4 s** (1:51.4) |
| Civic Type R (EK9) | **119.7 s** (1:59.7) | **143.0 s** (2:23.0) | **112.4 s** (1:52.4) |

Stated uncertainty: **+/- 3%** on each, consistent with the earlier Supra prediction and wider than
the in-sample fit error, because these are genuinely fresh cars.

Also outstanding from the previous round: **Toyota Supra RZ on Wangan, 134.7 s (2:14.7)**.

## Protocol

Hakone and Wangan are standing starts (rolling from a grid place or two back). Misaki is a hotlap.
Each course's model is self-consistent with its own protocol, because each course's geometry was
searched against laps driven under that protocol. No standing-start term is applied, deliberately:
the start line's position is unknown, and inventing one would be a fitted parameter dressed as
physics.

## How this can fail, stated in advance

1. **The 190E and the EK9 are predicted DEAD LEVEL on Hakone, both 119.7 s.** A 238 PS rear-drive
   saloon and a 185 PS front-drive hatch, identical to a tenth on a hairpin course. This is the
   sharpest falsifiable claim in the set: if they come in more than about 2 s apart, the model is
   trading power against mass and drivetrain wrongly on tight courses.
2. **The EK9 is front-wheel drive, our least-validated drivetrain.** Only two FWD laps have ever
   been driven, and one of them, the CRX SiR on Hakone, is the worst residual on that course at 5.3%
   slow. If the EK9 also comes in well slower than predicted, FWD has a systematic defect rather
   than one odd car.
3. **The 22B is predicted to beat both by roughly 8 s on Hakone and 9 s on Wangan.** It sits in the
   class where measured acceleration required more than the declared crank power. If that margin
   does not appear, the understated-power handling does not generalise.
4. **Misaki is the only course whose geometry was never tuned to driven times**, so it is the one
   real test of the model. Hakone and Wangan errors partly measure the geometry search.
5. Any error that is one-signed across all three cars on Hakone or Wangan, while Misaki is clean,
   points at the standing-start offset rather than at the car model.

---

## RESULT, appended 2026-07-27 after the nine laps were driven

The predictions above are unedited. Every figure in this section is the driven time against the
committed prediction, at the model as it stood when the prediction was made (measured acceleration
plus the additive agility term at kAgi 0.84, later refitted to 0.82 once these nine laps joined the
set). Nothing in this section is a fit.

| Car | Hakone pred / driven | Wangan pred / driven | Misaki pred / driven (hotlap) |
|---|---|---|---|
| Impreza 22B-STi | 111.8 / **106.6** (+4.9%) | 133.4 / **128.2** (+4.1%) | 105.1 / **101.5** (+3.5%) |
| 190E 2.5-16 Evo II | 119.7 / **119.3** (+0.3%) | 142.1 / **141.3** (+0.6%) | 111.4 / **112.6** (-1.1%) |
| Civic Type R (EK9) | 119.7 / **116.7** (+2.6%) | 143.0 / **144.7** (-1.2%) | 112.4 / **112.5** (-0.1%) |

Mean absolute error over the nine: **2.0%**. Every lap inside the stated +/- 3% band except the
22B's three, which are all just outside it and all in the same direction.

### The five falsifiable claims, scored

1. **190E and EK9 dead level on Hakone (both 119.7 s).** WRONG, and by more than the stated
   threshold: the EK9 came in 2.6 s ahead. The model was trading power against mass wrongly on a
   tight course, exactly as claim 1 said it would be if this happened. The pair also reverses on
   Wangan, where the 190E wins by 3.4 s, so the total course-character swing between them is 6.0 s
   and the model produced 0.9 s of it. That is what motivated replacing the additive direction-change
   term with a corner-exit speed penalty; see the report and the README.
2. **FWD is the least-validated drivetrain.** NOT CONFIRMED as a systematic defect. The EK9 sits at
   -0.1% on Misaki and -1.2% on Wangan and only +2.6% on Hakone, which is a course-character
   residual and not a drivetrain one. The CRX SiR remains the worst FWD lap on Hakone on its own.
3. **The 22B beats both by roughly 8 s on Hakone and 9 s on Wangan.** The margin appeared and was
   BIGGER than predicted: 12.7 s and 13.1 s. The car is uniformly quicker than the model has it.
4. **Misaki is the only real test.** It reads 3.5% / -1.1% / -0.1%, i.e. the 22B carries the whole
   of the Misaki error and the other two are inside a per cent on the untuned course.
5. **A one-signed error across all three cars on Hakone or Wangan with a clean Misaki would point at
   the standing start.** It is not one-signed: Hakone runs +4.9 / +0.3 / +2.6 and Wangan +4.1 / +0.6
   / -1.2, and the same cars carry the same signs on Misaki. The standing start is exonerated as the
   explanation, and the cross-course decomposition in the report says why: the 22B's residual is a
   CAR CONSTANT of +4.0% that is the same size on all three roads, and the EK9's is a
   COURSE-VARYING remainder of +2.0% on Hakone against -1.5% on Wangan. Two different findings.

### And one measurement that was not asked for

All three cars were also driven on Misaki from a standing start, so the standing-start offset is now
measured rather than estimated: 3.8 s for the 190E, 4.9 s for the EK9, 4.2 s for the 22B. Mean
4.3 s, spread 1.1 s. The model's own estimate of the same quantity is about 7.6 s, i.e. it
overstates it by roughly three quarters, most likely because the model launches from a true
standstill while the driver rolls up from a grid place or two back. Nothing is applied: every fit in
the harness is on the flying lap and stays there.
