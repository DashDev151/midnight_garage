# Car Spec Arc: pilot research data (staging)

**Status: STAGING, uncommitted working data (2026-07-23).** The first research batch, ten cars
across every archetype, source-grounded, to validate the schema and the accuracy of the
research pipeline before scaling to the full roster. Folded into the real content once the
`spec` schema lands. Every estimated field is marked; sources are in the agent transcripts.

## Accuracy verdict

Power figures cross-check almost perfectly against the existing `cars.json` values (nine of ten
exact matches; only the City E has a grade-nuance of 61 vs 63 PS). The gentleman's-agreement
split worked (Supra and GT-R captured at quoted 280 plus a real ~320). Torque curves are
peak-point-only from public sources (full dyno sheets are not readily available), which confirms
the schema plan: store the sourced anchor points, let the archetype shape the path. CoM, Cd,
frontal area, and most weight distributions are estimated and flagged.

## Decisions the pilot surfaced

1. **Three existing in-game weights look off against better-sourced figures.** These feed the
   handling stat and lap times, so correcting them shifts gameplay (a spec change, not an
   economy lever). Maintainer call whether to correct or keep:
   - Alto Works (HA21S): game 700 kg vs researched 650 kg. Likely a generation mix-up (700 kg
     matches the later HB21S/HA22S).
   - Civic SiR-II (EG6): game 985 kg vs documented ~1050 kg. 985 is a widely-repeated enthusiast
     figure (possibly a dry/stripped weight or a lighter Si grade); 1050 is the sourced factory
     curb weight for the fully-equipped SiR-II.
   - Supra RZ (JZA80): game 1590 kg vs researched 1490-1520 kg for the base 6-speed RZ. 1590
     may reflect a heavier grade (targa/Aerotop, automatic) or a deliberate buffer.
2. **Gaisha market-spec policy.** The 930 Turbo differs by market: ROW 300 PS / ~1290 kg vs
   US-federalised 287 PS / ~1360 kg. We need a rule (model the market the car would have been
   imported from, likely the higher ROW/Euro spec for grey-import flavour).

## The ten cars

Fields: drivetrain / enginePosition / engineCode / config / aspiration / displacementCc /
realPS@rpm (quotedPS) / torqueNm@rpm / redline / kerbKg / frontWeight% / wheelbaseMm / CoMmm /
Cd / frontalM2 / stockTyre / 0-100s / topKmh. "est" marks an estimated field.

### Batch A

- **Honda City E (AA) 1984**: FWD / front / ER / I4 / NA / 1231 / 63@5000 (63) / 98@3000 /
  ~6300 est / 690 (game; 655-710 sourced) / 62% est / 2220 / 550 est / 0.40 est / 1.7 est /
  145SR12 / 12.9 / 141. Power 61 in-game (Pro F grade) vs 63 (E grade).
- **Suzuki Wagon R (CT21S) 1993**: FWD / front / F6A / I3 / NA / 657 / 55@7500 (55) / 57@5500 /
  ~8000 est / 720 (game; 730-760 sourced) / 63% est / 2335 / 600 est / 0.36 est / 2.0 est /
  145/80R12 / n-p / n-p.
- **Suzuki Alto Works (HA21S) 1994**: FWD / front / K6A / I3 / turbo / 658 / 64@6500 (64, kei
  ceiling) / 103@3500 / ~8500 est / 650 sourced (game 700, likely later gen) / 64% est / 2335 /
  480 est / 0.33 est / 1.75 est / 155/65R13 / n-p / n-p.
- **Honda Civic SiR-II (EG6) 1991**: FWD / front / B16A / I4 / NA / 1595 / 170@7800 (170) /
  157@7300 / 8000 / 1050 sourced (game 985) / 62% est / 2570 / 500 est / 0.32 / 1.85 est /
  195/55R15 / 7.2-7.8 / ~215. VTEC ~5500.
- **Toyota Sprinter Trueno GT-APEX (AE86) 1983**: RWD / front / 4A-GEU / I4 / NA / 1587 /
  130@6600 (130) / 149@5200 / ~7600 / 940 (game MATCH) / 53% / 2400 / 450 est / 0.35 / 1.80 est /
  185/70R13 / 8.5 / 180. Best-corroborated block.

### Batch B

- **Nissan Silvia K's (S14) 1993**: RWD / front / SR20DET / I4 / turbo / 1998 / 220@6000 (220) /
  275@4800 / 7500 / 1240 (game MATCH) / 53% est / 2525 / 460 est / 0.32 est / 1.85 est /
  205/55R16 / ~6.5 / 180 (limited).
- **Mazda RX-7 Type R (FD3S) 1992**: RWD / front / 13B-REW / rotary-2 / twin-turbo (sequential) /
  1308 ("1.3L") / 255@6500 (255) / 294@5000 / 8000 / 1260 (game MATCH) / 50% / 2425 / 440 est /
  0.31 / 1.79 est / 225/50R16 / ~5.6 / 180 (limited).
- **Toyota Supra RZ (JZA80) 1993**: RWD / front / 2JZ-GTE / I6 / twin-turbo (sequential) / 2997 /
  ~324@5600 (280 quoted) / 431@4000 / 6800 / 1490-1520 sourced (game 1590) / 53% / 2550 /
  470 est / 0.32 / 1.95 est / 235/45R17 f, 255/40R17 r / ~4.6-5.0 / 180 (limited). Skidpad
  0.95-0.98g (US-spec platform).
- **Nissan Skyline GT-R (BNR32) 1989** [not in-game]: AWD / front / RB26DETT / I6 / twin-turbo /
  2568 / ~320@6800 (280 quoted) / 353@4400 / 8000 / 1430 (Nissan official) / 59% / 2615 /
  490 est / 0.40 / 2.05 est / 225/50R16 / ~5.0-5.3 / 180 (limited).
- **Porsche 911 Turbo (930) 1988 3.3L** [not in-game, gaisha]: RWD / rear / M30/69 / flat-6 /
  turbo / 3299 / 300@5500 ROW (300) / 412@4000 / ~6600 est / 1290 ROW / 38% / 2272 / 450 est /
  0.39 est / 1.95 est / 205/55R16 f, 225/50R16 r / 5.4 / 260. US spec differs: 287 PS / ~1360 kg.
