# partPricing.json — adjustment notes

Adjusted against `parts-prices.md` (period 1994–2004 catalogue data: HKS, Endless, Cusco, RAYS)
plus the aero and tuning-package calibration figures from Part 4m of the car-price research
(MAZDASPEED, August 1998), which fills the aero gap the parts sweep flagged. Coupled against
the v2.2 car roster throughout.

**Reading the research correctly:** every figure in the parts sweep is a *premium* brand
(HKS/Endless/Cusco/RAYS were the top of the market) and the sweep itself says a real budget
tier sat well below them. So the calibration rule used here is: **premium catalogue price ≈ the
game's `sport`/`race` grade on a `common`/`uncommon` car**, with `street` representing the
budget/shop tier the sweep couldn't reach. Accessories (harnesses, stays, catalysers — a real
20–35% of period bills) are **baked into the base costs** rather than modelled separately.

---

## 1. Changed base costs (9 of 30)

| Part | Old | New | Anchor |
|---|---:|---:|---|
| exhaust | 25,000 | **40,000** | The best-populated ladder in the research: Legal ¥42k entry / ¥62.8–78k volume / ¥128–136k flagship. New common-car grades: street ¥52k ≈ Legal, sport ¥80k ≈ volume sellers, race ¥120k ≈ flagship. Old base gave a ¥50k "sport" exhaust — below the real entry point. |
| springs | 14,000 | **18,000** | HKS Racing Spring was ¥18k *per pair* — a car needs two pairs (¥36k), and car-specific sets were ¥37–40k. New common/sport = ¥36k lands exactly on both. |
| dampers | 26,000 | **40,000** | The biggest correction. Damper kits were ¥127–148k, full coilovers ¥178–208k. New uncommon/sport = ¥128k ≈ the HKS Supra damper kit; uncommon/race = ¥192k ≈ full coilovers; common tiers sit below as the budget brands did. Old base priced a "race" damper at ¥73k — under half the real entry kit. |
| brakePadsDiscs | 8,000 | **15,000** | Premium pads alone were ¥25k 本体. New stock ¥15k = OEM-replacement pads+discs; sport ¥30k ≈ mid-tier pads+discs with the premium ¥25k pad inside it. |
| brakeCalipersLines | 18,000 | **45,000** | The research's headline finding: above pads, brakes jump 8x in one step. Endless 4POT + pads + mandatory stay = ¥203k; full system kits ¥288–408k. New uncommon/sport = ¥144k (budget-adjusted caliper set), rare/race = ¥338k ≈ real system kits. Old base put a "sport" caliper set at ¥36k — off by nearly an order of magnitude. |
| intake | 15,000 | **18,000** | Induction kits were ¥37.8–39.8k; new common/sport = ¥36k. Street ¥23.4k ≈ panel filter + pipe; filter element ¥3.9k stays sensibly below any grade. |
| ignitionEcu | 20,000 | **28,000** | Three real rungs: single-function boxes ¥11.8–12.8k, boost controllers ¥42.8–64.8k, ECU ¥100k + mandatory ¥10–20k harness ≈ ¥110–120k fitted. New: common/street ¥36k ≈ timer + boost box combo, common/sport ¥56k ≈ full EVC, uncommon/race ¥134k ≈ F-CON with harness. |
| rims | 30,000 | **34,000** | Forged TE37 sets ran ¥120k (13") to ¥276k (18") and were the market top; the 1992 wheel-clearance advert had new premium sets at ¥178–540k. New rare/race = ¥255k ≈ an 18" forged set; common grades stay in believable cast-wheel money. |
| aero | 18,000 | **26,000** | Anchored from the car file's Part 4m (the parts sweep found no aero at all): MAZDASPEED wing ¥86k, side skirts ¥92k, front nose ¥118k — all unpainted, fitting extra. New uncommon/sport = ¥83k ≈ the wing; common/street ¥33.8k ≈ a budget lip. |

## 2. Validated and deliberately unchanged

Three of your existing bases land almost exactly on the period data — worth knowing they're
*confirmed*, not just untouched:

- **forcedInduction 90,000** — common/sport = ¥180k ≈ the GT2510 bolt-on kit (¥182–202k);
  uncommon tiers reach GT-R twin-kit money (¥320–358k); rare/race ≈ single-turbo conversion
  territory (¥438–548k). Perfectly shaped already.
- **differential 55,000** — common/street = ¥71.5k ≈ Cusco type A (¥75k); common/sport =
  ¥110k ≈ the supercharged-application variant (¥104k). On the nose.
- **dashGauges 12,000** — gauges were ¥11.5–12.5k each, console ¥26k; street = one gauge,
  sport = a pair, race = trio + housing. Already right.

The remaining bases (block, internals, headValvetrain, camsTiming, fuelSystem, cooling,
gearbox, clutch, driveline, chassis, antiRollBars, steering, tyres, panels, paint, underbody,
seats, zonePanel) have **no period anchor in either research file** — the sweep never reached
engine hard parts, clutches, tyres or bodywork. They're internally coherent as-is, so they were
left alone rather than adjusted on guesswork. If you commission a second sweep, clutches,
tyres and paint/bodywork rates (the back pages of Option/CARBOY) are the gaps.

## 3. Factor changes

- **gradeFactors.race: 2.8 → 3.0.** Small stretch that lands the race rungs on their anchors:
  common/race exhaust ¥120k ≈ the ¥128–136k flagships, rare/race brakes ¥338k inside the
  ¥288–408k system-kit band. The period top-end spreads (suspension 12x, brakes 16x,
  management 9x) argue race could go even higher, but 3.0 keeps race builds affordable
  relative to the car roster (see §4).
- **classFactors: added `legend: 4.0` (optional).** `rare` at 2.5 checks out for JDM legends —
  rare/stock internals = ¥225k, and real S20 conrods were ¥200k a set — but it undercooks the
  exotic end (Countach, 512 TR, 2000GT, LFA), where parts money was another animal entirely.
  The key is additive: if your code's class enum is fixed, it's harmless dead weight; if you
  can assign it, give it to the exotics and true classics. Alternatively handle those few cars
  via `overrides`.
- **shitbox 0.25, common 1.0, uncommon 1.6, globalFactor 1.0 — unchanged.**

## 4. Coupling checks against the car roster (the numbers that matter)

- **Starter mod bill:** a typical first stage (exhaust + intake + springs + pads, street) on a
  **shitbox** = ¥29.6k — pocket-money mods on a ¥150k Sunny. On a **common** car = ¥118k —
  about a quarter of a ¥500k S13, which is exactly what a first-year drift budget looked like.
- **The classic ratio:** a full race build (every part) on a common car = ¥3.87M on a ¥500k
  car. Sounds violent; is period-true — the car research itself documents a ¥4.8M restoration
  on a ¥3.85M Z432 and a ¥7M restoration against a ¥5.8M ask. Builds exceeding car value is
  authentic, and it's also good game economy: the car is the cheap part.
- **MAZDASPEED cross-check:** their 1998 NA packages ran ¥350k (Stage I) to ¥870k (1.8 Stage
  II). Game equivalent (head + cams + intake + ECU at sport, common car) ≈ ¥292k; at race ≈
  ¥438k; with internals ≈ ¥708k. Brackets the real packages from both sides. ✓
- **Rare-car pain:** rare/race full build = ¥9.7M on a ¥6.5M Hakosuka — 1.5× car value,
  matching the documented restoration economics above.
- **Wheel sanity:** shitbox/street rims = ¥11k (steelies and hubcaps energy) up to rare/race
  ¥255k (forged 18s on a GT-R). The 23x spread mirrors the real cast-to-forged canyon.

## 5. Suggested `overrides` (left empty in the JSON pending your schema)

Worth considering once you confirm the override format:

- **Rotary cars (FC, FD, Spirit R, Cosmo, RX-8):** engine internals/block +30–50% — rotary
  rebuilds were famously dearer than piston equivalents.
- **Exotics without a `legend` class:** blanket ×1.6–2.0 on the four cars past the Kenmeri.
- **Kei-class cars:** arguably ×0.8 on drivetrain/engine parts — kei parts were physically
  smaller and cheaper, and the shitbox factor already covers the bottom keis but not the ABC
  sports trio, which are `common`-priced cars with kei-sized components.

## 6. Two period truths the config now encodes

1. **Exhaust is the gateway drug** — the tightest, cheapest ladder in the data (3x spread),
   which is why every 90s catalogue led with it. Street exhaust is now the cheapest meaningful
   upgrade on any car, as it was.
2. **Brakes have a cliff** — pads are cheap, and the very next step is 8x the money. The two
   brake parts now sit either side of that cliff instead of pretending it's a ramp.
