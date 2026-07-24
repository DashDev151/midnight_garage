# Car Spec Arc: research batch 2 (staging, uncommitted)

**Status: STAGING (2026-07-23).** The batches that returned before the research fleet was
stopped. Compact core specs only; full sourced blocks with confidence and estimated-field flags
are in the session transcript. Not yet triaged, not committed. Estimated fields (CoM, Cd,
frontal area, most weight distributions) noted where flagged by the researcher.

Fields: drivetrain / enginePos / config / aspiration / displCc / realPS@rpm (quoted) /
torqueNm@rpm / redline / kerbKg / front% / wheelbaseMm / CoMmm(est) / Cd / stockTyre / 0-100s /
topKmh / confidence.

## Fast FWD

- Civic Type R (EK9) 1997: FWD/front / I4 NA / 1595 / 185@8200 (185) / 160@7500 / 8400 / 1040 / 62%est / 2620 / 470est / 0.32 / 195/55R15 / 6.6 / 228 / MED
- Integra Type R (DC2) 1995: FWD/front / I4 NA / 1797 / 200@8000 (200) / 181@7500 / 8600 / 1060 / 60%est / 2620 / 450est / 0.32est / 195/55R15 / ~6.5 / 233 / MED (weight 1060-1200 by year/market)
- Prelude Si VTEC (BB4) 1991: FWD/front / I4(H22A) NA / 2157 / 200@6800 (200) / 207@5500 / ~7600 / 1240 / 58% / 2550 / 460est / 0.32est / 205/55R15 / 6.9 / 200 / MED
- CR-X SiR (EF8) 1989: FWD/front / I4(B16A) NA / 1595 / 160@7600 (160) / 152@7000 / ~8000 / 970 / 60%est / 2300 / 420est / 0.30 / 195/60R14 / 7.2 / n-p / MED
- City Turbo II (AA) 1983: FWD/front / I4(ER) turbo / 1231 / 110@5500 (110) / 160@3000 / ~6500est / 735 / 62%est / 2220 / 500est / 0.38est / 185/60R13 / 8.3 / 180 / LOW-MED
- Starlet Glanza V (EP91) 1996: FWD/front / I4(4E-FTE) turbo / 1331 / 135@6400 (135) / 157@4800 / ~7200 / 950 / 62%est / 2300 / 450est / 0.33est / 185/55R14 / 7.7 / n-p / MED

## FR / Drift

- 180SX (RPS13) 1991: RWD/front / I4(SR20DET) turbo / 1998 / 205@6000 (205) / 275@4000 / 7500 / 1220 / 53%est / 2475 / 480est / 0.33est / 205/60R15 / ~6.5 / 180ltd / MED
- Chaser Tourer V (JZX90) 1992: RWD/front / I6(1JZ-GTE) twin-turbo / 2491 / ~280@6200 (280) / 363@4800 / ~7000 / 1450 / 55%est / 2730 / 530est / 0.31est / 205/60R15 f 225/50R16 r / n-p / 180ltd / MED
- Silvia S13 (K's) 1988: RWD/front / I4(SR20DET; early CA18DET 175PS) turbo / 1998 / 205@6000 (205) / 275@4000 / 7500 / 1150 / 53%est / 2475 / 480est / 0.32est / 205/60R15 / n-p / 180ltd / MED
- Cefiro (A31) 1988: RWD/front / I6(RB20DET) turbo / 1998 / 205@6400 (205) / 265@3200 / ~7400 / 1370 / 55%est / 2670 / 535est / 0.31est / 205/60R15 / n-p / 180ltd / MED
- Laurel (C33) 1989: RWD/front / I6(RB20DET) turbo / 1997 / 205@6400 (205) / 265@3200 / ~7400 / 1350 / 55%est / 2670 / 540est / 0.33est / 205/60R15 / n-p / 180ltd / MED
- Chaser Tourer V (JZX100) 1996: RWD/front / I6(1JZ-GTE VVT-i single turbo) turbo / 2491 / ~300@6200 (280) / 378@2400 / ~7500 / 1480 / 55%est / 2730 / 535est / 0.30est / 205/55R16 f 225/50R16 r / n-p / 180ltd / MED (realPS LOW conf)

## Flagships & bubble weirdos 2

- Sera (EXY10) 1990: FWD/front / I4(5E-FHE) NA / 1497 / 110@6400 (110) / 132@5200 / ~7000est / 900 / 60%est / 2300 / 460est / 0.32est / 175/65R14 / n-p / 195 / MED
- S-Cargo (FHK11) 1989: FWD/front / I4(E15S) NA / 1487 / 73@5600 (73) / 116@3200 / ~6000est / 950 / 62%est / 2260 / 700est / 0.42est / 155SR13 / n-p / n-p / MED
- Alcyone SVX (CXD) 1991: AWD/front / flat-6(EG33) NA / 3318 / 240@6000 (240) / 309@4400 / ~6600est / 1620 / 60% / 2610 / 500est / 0.29 / 225/50R16 / n-p / n-p / MED-HIGH
- GTO Twin Turbo (Z16A) 1990: AWD/front / V6(6G72TT) twin-turbo / 2972 / 280@6000 (280) / 427@2500 / ~7000est / 1710 / 58%est / 2470 / 480est / 0.33est / 235/45R17 / n-p / n-p / LOW-MED
- Starion (A187A) ~1988: RWD/front / I4(G54B 2.6, NOT 4G63) turbo / 2555 / 175@5000 (175) / 314@3000 / ~6000est / 1320 / 55%est / 2435 / 470est / 0.37 / 205/55R16 f 225/50R16 r / 8.2 / 215 / LOW (chassis-code/year/engine mismatch, see transcript)
- Soarer (JZZ30) 1991: RWD/front / I6(1JZ-GTE) twin-turbo / 2491 / 280@6200 (280) / 363@4800 / ~7000est / 1560 / 55%est / 2690 / 480est / 0.30est / 225/55R16 / n-p / 180ltd / MED

## Kyusha

- Fairlady 240ZG (HS30) 1971: RWD/front / I6(L24) NA / 2393 / 150@5600 (150 gross) / 206@4800 / ~7000est / 1010 / 51%est / 2305 / 460est / 0.39 (G-nose) / 175HR14 / n-p / 210 / HIGH-core
- Datsun 510/Bluebird (PL510) 1968: RWD/front / I4(L16) NA / 1595 / 97@5600 (97; JDM SSS twin-carb 130PS) / 136@3600 / ~6500est / ~940(912-965) / 55%est / 2420 / 520est / 0.46est / 5.60-13 / ~13.3 / 161 / MED
- Skyline 2000GT-X Kenmeri (KGC110) 1972: RWD/front / I6(L20) NA / 1998 / 130@6000 (130; regular-fuel 125) / 172@4400 / ~6900est / 1150 / 55%est / 2610 / 530est / 0.45est / 6.45S-14 / n-p / 175 / MED
- Cosmo Sport 110S (L10A) 1967: RWD/front / rotary-2(10A) NA / 982 (491x2) / 110@7000 (110 gross) / 130@3500 / 7000 / 940 / 51%est / 2200 / 440est / 0.38est / 165SR14 / 8.7 / 185 / HIGH-core (topKmh 185 vs 193 disagree)

## Gaisha (Euro spec)

- Mercedes 190E 2.5-16 Evo II (W201) 1990: RWD/front / I4(M102) NA / 2463 / 235@7200 (235) / 245@5000-6000 / 7700 / 1340 / 53%est / 2665 / 500est / 0.30 / 245/40ZR17 / 7.1 / 250 / HIGH
- BMW M3 (E30) 1986: RWD/front / I4(S14B23) NA / 2302 / 200@6750 (200; catalyst 195) / 240@4750 / 7250 / 1165(DIN) / 52.2% / 2562 / 460est / 0.33 / 205/55VR15 / 6.7 / 235 / HIGH
- Lancia Delta HF Integrale Evo (831) 1991: AWD/front / I4 turbo / 1995 / 210@5750 (210) / 298@3500 / ~6500 / 1300(1350-1375 EU homolog) / n-p / 2480 / 500est / 0.415 / 205/50ZR15 / 5.7 / 220 / MED
- Alfa Romeo 75 3.0 V6 1987: RWD/front / V6 NA / 2959 / 188@5800 (188) / 245@4000 / ~6200est / 1250(DIN) / 55.4% / 2510 / 520est / 0.34 / 195/60VR14 / 7.5(0-60) / 220 / MED
- Ferrari Testarossa (F113) 1984: RWD/mid / flat-12 NA / 4942 / 390@6300 (390) / 490@4500 / 6800 / 1506(dry; ~1630 wet) / 40% / 2550 / 480est / 0.36 / 255/50VR16 (later) / 5.8 / ~290claim(~275 tested) / HIGH
- Lamborghini Countach LP5000 QV 1985: RWD/mid / V12 NA / 5167 / 455@7000 (455 carb Euro) / 500@5200 / ~7300 / 1490(dry) / 42% / 2450 / 450est / 0.42est / 225/50VR15 f 345/35VR15 r / 4.8 / 298claim / MED
- Rover Mini Cooper 1.3i 1992: FWD/front / I4(A-series) NA / 1275 / 63@5550 (63) / 95@3000 / ~6000est / 690 / 64%est / 2035 / 480est / 0.48est / 145/70R12 / ~12.5 / 152 / MED (note: ~1990 date = carb RSP ~61PS instead)

## Gaisha II (Euro spec)

- Ferrari F355 Berlinetta (F129) 1994: RWD/mid / V8 NA / 3496 / 380@8250 (380) / 363@6000 / 8500 / ~1450(1350 dry) / 41% / 2451 / 480est / 0.32(low conf) / 225/40ZR18 f 265/40ZR18 r / 4.7 / 295 / MED
- BMW M3 (E36) 1992: RWD/front / I6(S50B30 Euro) NA / 2990 / 286@7000 (286) / 320@3600 / 7200 / 1460(DIN) / 50% / 2700 / 510est / 0.32 / 235/40ZR17 / 6.0 / 250 / HIGH
- Ford Escort RS Cosworth 1992: AWD/front / I4(YBT) turbo / 1993 / 227@6250 (227) / 304@3500 / ~6800 / 1275 / 60%est / 2551 / 540est / 0.38 / 245/45ZR16 / n-p(5.8-6.2 0-60) / 220 / MED
- VW Golf GTI Mk2 16V (KR) 1986: FWD/front / I4 NA / 1781 / 139@6100 (139) / 168@4600 / ~7000 / 907 / 63% / 2475 / 530est / 0.34 / 185/60VR14 / 8.1 / 204 / HIGH
