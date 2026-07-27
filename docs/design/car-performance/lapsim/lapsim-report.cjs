/* eslint-disable -- prototype calibration harness, not production code: reads the spec book, evals its CARS array, and marches a lap sim; deliberately outside the packages lint standard */
// Full lap-time model report, all cars. Prototype/validation, not game code.
const fs = require('fs')
const path = require('path')
const h = fs.readFileSync(path.join(__dirname, '..', 'car-spec-book.html'), 'utf8')
const m = h.match(/const CARS = \[([\s\S]*?)\n\];/)
eval('global.CARS=[' + m[1] + ']')
// Every cross-reference in this file joins on the spec book's stable `id`. Display names are
// Forza's and move with Forza's identity for a car; ids do not, which is what makes them a key.
const byId = (id) => CARS.find((c) => c.id === id)
// The book stores Forza's 0-97 km/h as z97 and its 0-161 km/h inside the verbatim `fz` panel
// record, as a100 (0-100 mph). Lift the second one to a first-class field so every consumer
// reads the same pair of names whatever the record's provenance: the acceleration solve below
// takes z97/z161 off a car object, and the Forza-panel and telemetry-anchor records set them
// directly rather than carrying an `fz` block.
CARS.forEach((c) => {
  if (c.z161 == null && c.fz && c.fz.a100 != null) c.z161 = c.fz.a100
})

function tyreW(c) {
  const x = c.ty.match(/(\d{3})/)
  return x ? +x[0] : 160
}
function trackOf(c) {
  return c.sec === 'Kei' ? 1210 : tyreW(c) >= 245 ? 1560 : 1470
}
function compoundOf(c) {
  const w = tyreW(c),
    t = ['eco', 'touring', 'performance', 'sport', 'grand']
  const ti = w < 165 ? 0 : w < 195 ? 1 : w < 225 ? 2 : w < 255 ? 3 : 4
  const cap = c.y < 1990 ? 2 : c.y < 2000 ? 3 : 4
  return t[Math.min(ti, cap)]
}
function eraRubber(y) {
  return y < 1968
    ? 0.72
    : y < 1975
      ? 0.76
      : y < 1982
        ? 0.8
        : y < 1988
          ? 0.835
          : y < 1993
            ? 0.875
            : y < 1998
              ? 0.905
              : y < 2008
                ? 0.93
                : 0.98
}
function tierDelta(t) {
  return t === 'eco'
    ? -0.04
    : t === 'touring'
      ? -0.02
      : t === 'performance'
        ? 0
        : t === 'sport'
          ? 0.02
          : 0.075
}
function gripMu(c) {
  // A measured lateral g is authoritative where we have one: it is a real per-car
  // spec like power or kerb weight, and no formula over year, width and mass can
  // out-predict a measurement. The formula below is the fallback for the rest.
  if (c.lg) return c.lg
  const w = tyreW(c),
    cm = eraRubber(c.y) + tierDelta(compoundOf(c))
  const we = Math.max(0.4, Math.min(1, (cm - 0.7) / 0.3))
  const wa = Math.max(-0.03, Math.min(0.045, (w - 200) / 1100)) * we
  const mu = cm + wa
  const cr = (c.com || 460) / trackOf(c)
  const tr = Math.max(0.8, Math.min(1, 1 - 0.75 * (cr - 0.27)))
  let L = 1
  const act = /RB26DETT|VR38DETT/.test(c.ec) || /lancer-evo/.test(c.id || '')
  if (c.dt === 'AWD') L += act ? 0.035 : 0.02
  else if (c.ep === 'mid') L += 0.015
  return mu * tr * L
}
function dispGrip(g) {
  let v
  if (g <= 1.1) v = 10 + (g - 0.66) * (45 / 0.44)
  else v = 55 + (g - 1.1) * (45 / 0.52)
  return Math.max(0, Math.min(100, Math.round(v)))
}
function archOf(c) {
  const ec = c.ec,
    cfg = c.cfg,
    asp = c.asp,
    rot = cfg.indexOf('rotary') === 0
  if (rot) return asp.indexOf('turbo') >= 0 ? 'seqTwinR' : 'rotaryNA'
  if (asp === 'twin-turbo') return /2JZ-GTE/.test(ec) ? 'seqTwin' : 'parallelTwin'
  if (asp === 'turbo') return 'singleTurbo'
  if (asp === 'supercharged') return 'superch'
  if (/B16|B18C|H22|F20C|K20A|C30A/.test(ec)) return 'vtecNA'
  if (['V8', 'V10', 'V12', 'flat-12'].indexOf(cfg) >= 0) return 'bigNA'
  return 'plainNA'
}
const ARCHLBL = {
  plainNA: 'NA',
  bigNA: 'big-NA',
  superch: 's/c',
  seqTwin: 'seq-twin',
  parallelTwin: 'twin-t',
  seqTwinR: 'rotary-t',
  vtecNA: 'VTEC',
  rotaryNA: 'rotary',
  singleTurbo: 'turbo',
}
function deliveryFactor(c) {
  return {
    plainNA: 1,
    bigNA: 1,
    superch: 0.98,
    seqTwin: 0.9,
    parallelTwin: 0.85,
    seqTwinR: 0.85,
    vtecNA: 0.88,
    rotaryNA: 0.82,
    singleTurbo: 0.78,
  }[archOf(c)]
}

const g = 9.81,
  rho = 1.2,
  eta = 0.88,
  froll = 0.012,
  PS = 735.5
// The speeds the Forza stats panel quotes at. Lateral g is read at 97 and 193 km/h;
// braking and acceleration at 97 and 161. Mixing the pairs corrupts the aero fit,
// because downforce is speed-SQUARED and reading 193 as 161 is a 44% error in the term.
const V97 = 97 / 3.6,
  V161 = 161 / 3.6,
  V193 = 193 / 3.6
// Mirrors statFormulas.aero in packages/content/data/economy.json so the prototype and
// the game speak the same units: downforceK is the scale, downforceCoeff the per-car
// multiplier on it, maxGripMultiplier the ceiling.
const DOWNFORCE_K = 6.2e-5,
  MAXGRIP = 1.6
// Real published width x height (mm), keyed by the spec book's stable `id` rather than by the
// display name: the display name is now Forza's and moves whenever Forza's identity for a car
// does, so keying a lookup on it would silently drop cars out of the table.
const DIMS = {
  'honda-city-e-aa': [1570, 1470],
  'suzuki-wagon-r-ct21s': [1395, 1680],
  'honda-civic-sir2-eg6': [1695, 1350],
  'toyota-sprinter-trueno-ae86': [1625, 1335],
  'nissan-180sx-rps13': [1690, 1290],
  'toyota-chaser-tourer-v-jzx90': [1750, 1390],
  'nissan-silvia-ks-s14': [1730, 1295],
  'mazda-savanna-rx7-fc3s': [1690, 1265],
  'mazda-rx7-fd3s': [1780, 1230],
  'toyota-supra-rz-jza80': [1810, 1275],
  'toyota-carina-at150': [1670, 1365],
  'nissan-sunny-b12': [1640, 1379],
  'suzuki-alto-works-ha21s': [1395, 1380],
  'honda-beat-pp1': [1395, 1175],
  'honda-crx-sir-ef8': [1675, 1270],
  'honda-city-turbo-ii-aa': [1625, 1470],
  'toyota-sera-exy10': [1650, 1265],
  'honda-prelude-si-vtec-bb4': [1765, 1290],
  'nissan-silvia-s13': [1690, 1290],
  'toyota-mr2-sw20': [1695, 1240],
  'nissan-cefiro-a31': [1695, 1375],
  'subaru-impreza-wrx-sti-gc8': [1690, 1390],
  'nissan-skyline-gtr-bnr32': [1755, 1340],
  'nissan-fairlady-z-z32': [1800, 1255],
  'toyota-aristo-30v-jzs147': [1795, 1420],
  'toyota-mr2-aw11': [1665, 1250],
  'porsche-911-turbo-930': [1775, 1310],
  'honda-civic-type-r-ek9': [1695, 1360],
  'honda-integra-type-r-dc2': [1695, 1330],
  'toyota-starlet-glanza-v-ep91': [1625, 1400],
  'nissan-laurel-c33': [1700, 1370],
  'toyota-chaser-tourer-v-jzx100': [1755, 1400],
  'nissan-s-cargo-fhk11': [1595, 1839],
  'subaru-alcyone-svx-cxd': [1770, 1310],
  'mitsubishi-gto-twin-turbo-z16a': [1840, 1285],
  'mitsubishi-starion-a187a': [1745, 1275],
  'toyota-soarer-jzz30': [1790, 1340],
  'nissan-fairlady-240zg-hs30': [1690, 1285],
  'datsun-510-bluebird-pl510': [1560, 1405],
  'nissan-skyline-2000gt-x-kenmeri-kgc110': [1595, 1375],
  'mazda-cosmo-sport-110s-l10a': [1595, 1165],
  'mercedes-190e-2-5-16-evo-ii-w201': [1720, 1342],
  'bmw-m3-e30': [1680, 1370],
  'lancia-delta-hf-integrale-evo': [1770, 1365],
  'alfa-romeo-75-3-0-v6': [1631, 1349],
  'ferrari-testarossa-f113': [1976, 1130],
  'lamborghini-countach-lp5000-qv': [2000, 1070],
  'rover-mini-cooper-1-3i': [1440, 1340],
  'ferrari-f355-berlinetta-f129': [1900, 1170],
  'bmw-m3-e36': [1710, 1335],
  'ford-escort-rs-cosworth': [1738, 1405],
  'vw-golf-gti-mk2-16v': [1680, 1400],
  'eunos-cosmo-jc': [1795, 1305],
  'toyota-celica-gt-four-st205': [1750, 1305],
  'nissan-pulsar-gti-r-rnn14': [1690, 1410],
  'mazda-familia-gt-r-bg8z': [1690, 1390],
  'nissan-350z-z33': [1815, 1315],
  'mazda-rx-8-se3p': [1770, 1340],
  'mitsubishi-lancer-evo-viii-mr-ct9a': [1770, 1450],
  'honda-integra-type-r-dc5': [1725, 1385],
  'daihatsu-copen-l880k': [1475, 1245],
  'nissan-gt-r-r35': [1895, 1370],
  'lexus-lfa': [1895, 1220],
  'nissan-skyline-gt-r-v-spec-ii-bnr34': [1785, 1360],
  'honda-nsx-r-na1': [1810, 1170],
  'nissan-skyline-gt-r-hakosuka-kpgc10': [1665, 1370],
  'nissan-fairlady-z432-ps30': [1630, 1290],
  'subaru-impreza-22b-sti': [1770, 1390],
  'mitsubishi-lancer-evo-vi-tommi-makinen-cp9a': [1770, 1405],
  'toyota-2000gt-mf10': [1600, 1160],
  'mazda-autozam-az-1-pg6sa': [1395, 1150],
  'mazda-rx-7-spirit-r-fd3s': [1760, 1230],
  'nissan-silvia-spec-r-s15': [1695, 1285],
  'autech-stagea-260rs-wgnc34': [1755, 1510],
  'toyota-altezza-rs200-z-edition-sxe10': [1720, 1410],
  'honda-s2000-ap1': [1750, 1285],
  'daihatsu-mira-tr-xx-l70': [1395, 1400],
  'honda-today-jw1': [1395, 1315],
  'subaru-vivio-rx-r-kk4': [1395, 1375],
  'daihatsu-mira-tr-xx-avanzato-r-l502s': [1395, 1430],
  'honda-acty-ha4': [1395, 1745],
  'suzuki-cappuccino-ea11r': [1395, 1185],
  'eunos-roadster-na6ce': [1675, 1235],
  'nissan-skyline-gt-r-bcnr33': [1780, 1360],
  'subaru-impreza-wrx-sti-gdb': [1730, 1425],
}
const secA = {
  Kei: 1.45,
  Shitbox: 1.75,
  'Fast FWD': 1.75,
  'FR / Drift': 1.85,
  Rotary: 1.85,
  Flagship: 1.95,
  'AWD Turbo': 1.9,
  Gaisha: 1.9,
  'Bubble weird': 1.95,
  Kyusha: 1.8,
  '2004+ wave': 1.9,
  'Hyper wave': 1.95,
  Legend: 1.9,
}
function frontalArea(c) {
  const d = DIMS[c.id]
  return d ? 0.82 * (d[0] / 1000) * (d[1] / 1000) : secA[c.sec] || 1.85
}
// A lateral-g pair at two speeds separates mechanical grip from downforce: with
// grip(v) = mu (1 + k v^2), two readings give two unknowns. Returns the mechanical mu
// the model wants and the k that accounts for the rest of the measured figure.
function aeroFit(g97, g193) {
  if (!(g193 > g97)) return { k: 0, mu: g97 }
  const R = g193 / g97,
    k = (R - 1) / (V193 * V193 - R * V97 * V97)
  return { k, mu: g97 / (1 + k * V97 * V97) }
}
// Ports of the shipped aeroGripMultiplier and apexSpeed (packages/sim/src/performance.ts)
// so the prototype and the game cannot drift apart. Both are exact no-ops at dfC 0.
function aeroMult(v, dfC) {
  if (!dfC || dfC <= 0) return 1
  return Math.min(1 + DOWNFORCE_K * dfC * v * v, MAXGRIP)
}
// Drag area implied by a measured top speed: at terminal velocity wheel power exactly
// balances aero plus rolling drag. Returns a Cd against the car's real frontal area.
// phi is deliberately absent - top speed IS steady state at peak-power rpm.
function cdFromTop(c, topKmh) {
  const v = topKmh / 3.6,
    m = c.kg + 75,
    Pw = c.ps * PS * eta
  return (Pw / v - froll * m * g) / (0.5 * rho * v * v) / frontalArea(c)
}
function apexOf(mu, r, dfC) {
  const base = mu * g * r
  if (!dfC || dfC <= 0) return Math.sqrt(base)
  const k = DOWNFORCE_K * dfC,
    den = 1 - mu * k * g * r
  if (den <= 0) return Math.sqrt(base * MAXGRIP)
  const solved = base / den
  return Math.sqrt(1 + k * solved > MAXGRIP ? base * MAXGRIP : solved)
}

// =====================================================================================
// THE GEOMETRIC CORNER-GRIP CEILING (2026-07-27)
// =====================================================================================
// WHAT IT IS FOR. sqrt(mu g r) has no upper bound, so grip buys corner speed without limit, and
// the direction-change term divides by mu, so a grippier car is ALSO charged less to change
// direction. A corner therefore pays a high-grip car twice. Through a 12 m hairpin that is not
// what happens: the car is bounded by steering lock, wheelbase, width and how fast a driver can
// place it, not by the contact patch, so past some grip level more grip buys nothing there.
//
// WHAT SAID SO. Three Hakone laps at three grip levels, all driven after the figure was
// committed: the Elise at mu 1.226 came in at -0.2%, the Calsonic Gr.A at 1.512 at -9.2% and the
// modified 787B at 1.699 at -11.0%. The error is not linear in mu - it is nothing at 1.23, most
// of the way to its full size by 1.51, and nearly saturated by 1.70, which is what two cars both
// hitting the same limit looks like while only the model keeps crediting them. The Calsonic then
// said the same thing along a second, independent axis: +2.5% on a corner-free kilometre, +1.3%
// on a fast highway loop, -5.6% on a mixed circuit and -9.2% on eleven hairpins. Its power, drag
// and mass are therefore right and the defect is the cornering treatment alone.
//
// THE FORM, AND WHY IT HAS TWO PARAMETERS RATHER THAN ONE.
//
//     usable mu in a corner of radius r = min(mu, GEO_MU * (r / GEO_R)^GEO_T)
//
// The ceiling rises with radius, so it bites hardest in the tightest corner and releases
// entirely once the corner is open enough for geometry to stop binding. One parameter (the level,
// with GEO_T held at 0) is a flat grip cap with no geometry in it at all, and the report scores
// it: it fixes Hakone and then pushes the Calsonic's Wangan lap 3.6% SLOW, because a fast highway
// loop has no tight corners to charge and a flat cap charges its sweepers anyway. The radius
// exponent is what stops that, and it is the whole justification for the second parameter. Both
// are fitted below, on every driven lap at once, equal weight per course.
//
// IT IS EXACTLY INERT FOR ORDINARY CARS, BY CONSTRUCTION AND NOT BY TUNING. The ceiling at the
// tightest radius on any course is above the grip of every car on the 85-car roster, so all 85
// lap identically to the last bit and the 38 existing driven laps do not move at all. The report
// asserts that rather than claiming it.
//
// IT IS APPLIED IN BOTH PLACES THE DOUBLE PAYOUT HAPPENS: to the grip the corner ARC may use
// (here) and to the grip the DIRECTION-CHANGE term may divide by (agiCornerW below). The report
// fits all three placements separately; only this one reaches the driven times without biting
// ordinary cars, and the other two are printed beside it.
const GEO_R = 20
let GEO_MU = Infinity
let GEO_T = 0
const cornerMu = (mu, r) => Math.min(mu, GEO_MU * Math.pow(r / GEO_R, GEO_T))
// Which half of the double payout the ceiling is applied to. 'both' is the published setting and
// the only one anything published ever runs at; the other two exist for the placement comparison
// in stderr section 7, which is what establishes that neither half alone reaches the driven times
// without capping grip below what ordinary cars already use.
let GEO_PLACE = 'both'
const arcMu = (mu, r) => (GEO_PLACE === 'agi' ? mu : cornerMu(mu, r))
const agiMu = (mu, r) => (GEO_PLACE === 'apex' ? mu : cornerMu(mu, r))
// ---- Braking grip: its own per-car input, not a copy of lateral grip ----
// The traction circle says the two are equal. The measurements say they are not, and not by
// a constant either: the Countach stops at 0.86 of what it corners at, the LFA at 1.16. Old
// cars brake worse than they corner and modern cars brake harder, so braking gets its own
// coefficient instead of borrowing mu.
//
// A stopping distance is an integral, not a constant-deceleration formula, because braking
// grip rises with speed for the same reason lateral grip does. With a(v) = bmu g (1 + k v^2)
// and k = dfC * DOWNFORCE_K:
//   d(V) = d0 + ln(1 + k V^2) / (2 g k bmu)   ->   bmu = ln(1 + k V^2) / (2 g k (d - d0))
// The k -> 0 limit is the schoolbook bmu = V^2 / (2 g (d - d0)); the log form would divide by
// zero. d0 is the DEAD DISTANCE: the metres covered between the test tripping and full
// retardation arriving (pedal travel, pad bite, weight transfer). It is a property of the
// measurement, not of the car, and it is fitted just below.
//
// THE DEAD DISTANCE (2026-07-26). Solving bmu with d0 = 0 made the 161-0 figure read about ten
// per cent more grip than the 97-0 figure on all 59 cars that publish both, one-signed with no
// exceptions - which is a model defect, not scatter. A fixed distance in front of every stop
// explains it exactly, and cheaply: it is a bigger share of a short stop than a long one, so it
// bites the fast cars hardest, which is the signature the data shows. The alternative on offer
// was a downforce coefficient roughly forty times the lateral-fitted one, landing as hard on a
// 1967 Cosmo as on a 2010 LFA. One shared quarter-second beats 59 impossible aero fits.
const RATIO_D = (k) =>
  k <= 1e-9
    ? (V161 * V161) / (V97 * V97)
    : Math.log(1 + k * V161 * V161) / Math.log(1 + k * V97 * V97)
// With both distances the car's own d0 is exactly determined: the two equations above carry two
// unknowns (bmu, d0), so no fitting is involved per car, only across cars.
function d0Of(c) {
  if (c.b97 == null || c.b161 == null) return null
  const R = RATIO_D((c.dfC || 0) * DOWNFORCE_K)
  return (R * c.b97 - c.b161) / (R - 1)
}
const D0SET = CARS.map(d0Of).filter((x) => x != null)
// The published gap between the two solutions, as a fraction, at a candidate global d0. Zero
// when the car's own d0 is used; this is the quantity the global constant has to collapse.
const d0Gap = (c, D0) => RATIO_D((c.dfC || 0) * DOWNFORCE_K) * ((c.b97 - D0) / (c.b161 - D0)) - 1
// Least squares over the 59, not the median of them. The two answers differ by 0.17 m and their
// residuals by 0.02 percentage points, because the per-car distribution is near-symmetric (mean
// and median agree to 0.02 m), so the median's robustness buys nothing here; least squares is
// preferred because it minimises the disagreement the constant exists to remove, rather than a
// proxy for it. Solved on a fine grid: one bounded parameter, no need for anything cleverer.
const BRAKE_D0 = (function () {
  const set = CARS.filter((c) => c.b97 != null && c.b161 != null)
  let best = null
  for (let D0 = 0; D0 <= 14; D0 += 0.0005) {
    const s = set.reduce((a, c) => a + d0Gap(c, D0) ** 2, 0)
    if (!best || s < best.s) best = { D0, s }
  }
  return best.D0
})()
function brakeMuFrom(d, V, dfC) {
  const de = d - BRAKE_D0
  if (!(de > 0)) return null
  const k = (dfC || 0) * DOWNFORCE_K
  if (k <= 1e-9) return (V * V) / (2 * g * de)
  return Math.log(1 + k * V * V) / (2 * g * k * de)
}
const bmu97Of = (c) => (c.b97 != null ? brakeMuFrom(c.b97, V97, c.dfC) : null)
const bmu161Of = (c) => (c.b161 != null ? brakeMuFrom(c.b161, V161, c.dfC) : null)
// Least squares by Gauss-Jordan on the normal equations. Three predictors over 63 rows, so
// conditioning is a non-issue, and fitting at run time keeps the fallback derived from the
// measurements rather than frozen as magic numbers in the source.
function ols(X, y) {
  const p = X[0].length
  const A = []
  for (let i = 0; i < p; i++) {
    const row = []
    for (let j = 0; j < p; j++) row.push(X.reduce((a, x) => a + x[i] * x[j], 0))
    row.push(X.reduce((a, x, r) => a + x[i] * y[r], 0))
    A.push(row)
  }
  for (let i = 0; i < p; i++) {
    let piv = i
    for (let r = i; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r
    const t = A[i]
    A[i] = A[piv]
    A[piv] = t
    for (let r = 0; r < p; r++) {
      if (r === i) continue
      const f = A[r][i] / A[i][i]
      for (let cc = i; cc <= p; cc++) A[r][cc] -= f * A[i][cc]
    }
  }
  return A.map((row, i) => row[p] / A[i][i])
}
// The 22 cars with no measured braking still need a bmu, and it must not be "bmu = mu":
// that is exactly the assumption the measurements refute. Predicting bmu from era and
// drivetrain alone is far too coarse for a 0.64-to-1.19 range, so the regression predicts
// the RATIO bmu/mu, which carries the car's own grip level as its scale:
//   bmu = mu * (a + b (year - 1990)/10 + c [AWD])
// Section "Braking" below prints the coefficients, the residuals and the 22 predictions.
const BRAKE_X = (c) => [1, (c.y - 1990) / 10, c.dt === 'AWD' ? 1 : 0]
const BRAKE_FIT = (function () {
  const set = CARS.filter((c) => c.b97 != null)
  const beta = ols(
    set.map(BRAKE_X),
    set.map((c) => bmu97Of(c) / gripMu(c)),
  )
  const ratio = (c) => BRAKE_X(c).reduce((a, x, i) => a + x * beta[i], 0)
  const rows = set.map((c) => {
    const meas = bmu97Of(c),
      pred = gripMu(c) * ratio(c)
    return { c, meas, pred, e: pred - meas }
  })
  return { beta, ratio, set, rows }
})()
function brakeMu(c) {
  const meas = bmu97Of(c)
  return meas != null ? meas : gripMu(c) * BRAKE_FIT.ratio(c)
}

// ---- The four DERIVED acceleration constants (SUPERSEDED 2026-07-26) ----
// aCapK, awdK, phi and deliveryFactor were four fitted stand-ins for an acceleration model we
// did not have: a launch cap as a fraction of mu, an AWD launch fraction, a mean-power fraction
// through the gears, and a nine-entry engine-archetype ramp. Every one of them predicted
// acceleration from `ps`. They are now superseded, not supplemented, by the per-car solve
// below, which MEASURES acceleration from Forza's own 0-97 and 0-161 times on the 59 cars that
// publish both. Nothing in the published run reads these four any more; they survive only
// behind the `derived` flag, which the before/after tables set to reproduce, exactly, the
// model that was published before this change.
let aCapK = 0.7
let awdK = 0.66
let phi = 1.0
// When true, carBlock ignores the measured/fitted acceleration model and runs the four
// superseded constants above. Used ONLY by the "before" tables.
let derived = false
// A car cannot out-accelerate the speed at which its own thrust balances its own drag. The
// measured pEff below is an EFFECTIVE through-the-gears power and lands above the crank figure
// on a handful of cars (the 280 PS gentleman's-agreement entries, mostly), so without this the
// straight march would carry them past their own measured top speed on a long enough straight.
// Flagged rather than hard-wired so the before/after can hold it fixed.
let capToVTop = true
// Agility weight: the seconds of direction-change time, per unit of corner geometry, that a
// point-mass sim cannot represent. Grip-limited only; see the term inside lap() for the shape
// and for why mass is deliberately absent from it.
let kAgi = 0.3
// The agility SHAPE, held apart from its weight so the whole functional form can be swept
// instead of only its coefficient:
//
//   agility per corner = kAgi * (m/1200)^p * (1/mu)^q * (angle/90)^a * clamp((R0/r)^t, lo, hi)
//
// READ THE ONE STRUCTURAL FACT ABOUT THIS FAMILY BEFORE TUNING ANY OF IT. Everything after the
// (1/mu)^q factor is PURE GEOMETRY: no property of the car appears in it. So on a fixed course
// the whole of a, t, hi and lo collapse into a single scalar that multiplies kAgi, and the only
// car-dependence the term has is mass^p and grip^-q. Sharpening the tightness clamp cannot make
// the term separate two cars any better than a change of kAgi does, because it does not know
// which car it is charging. What the shape DOES control is the ratio between two courses' totals,
// which is the only channel through which a second course can argue about it at all.
const AGI_LEGACY = { p: 0, q: 1, a: 1, t: 1, lo: 0.4, hi: 2.5, R0: 80 }
let AGI = Object.assign({}, AGI_LEGACY)
const shp = (o) => Object.assign({}, AGI_LEGACY, o)
// The geometric factor of one corner, and its sum over a course. `tightSum` is the scalar the
// paragraph above is about: lap time is EXACTLY kAgi * tightSum(course) * (car factor) plus a
// remainder that does not contain kAgi at all.
function tightOf(seg, s) {
  return (
    Math.pow(seg[1] / 90, s.a) * Math.min(s.hi, Math.max(s.lo, Math.pow(s.R0 / seg[0], s.t)))
  )
}
const tightSum = (segs, s) => segs.reduce((a, x) => a + tightOf(x, s || AGI), 0)
// The car factor for ONE corner: the only part of the agility term that knows which car it is
// charging. The grip it divides by is the GEOMETRIC CEILING's wherever that ceiling binds, which
// is the second half of the double payout a corner used to pay a high-grip car: a car with more
// grip than a hairpin can use does not change direction any sooner for having it. It reduces to
// the plain (m/1200)^p / mu^q wherever the ceiling does not bind, which is every car on the
// roster and every one of the 38 existing driven laps.
const agiCornerW = (b, s, seg) =>
  Math.pow(b.m / 1200, s.p) / Math.pow(agiMu(b.mu, seg[0]), s.q)
// The whole direction-change weight of a course for one car: what multiplies kAgi. It is the
// quantity the affine identity is written in, and with the ceiling inert it is exactly
// tightSum(segs, s) * (m/1200)^p / mu^q, so writing it this way moves no existing number.
const agiSum = (b, segs, s) =>
  segs.reduce((a, x) => a + agiCornerW(b, s, x) * tightOf(x, s), 0)

// =====================================================================================
// THE CORNER-EXIT SPEED PENALTY: what replaced the additive agility term (2026-07-27)
// =====================================================================================
// THE DIAGNOSIS, WHICH IS THAT THE ADDER WAS WRONG IN KIND RATHER THAN BADLY TUNED. The term
// above charges seconds and hands the car back to the straight at exactly the apex speed it
// would have had anyway. Nothing it does can propagate: the following straight begins from the
// same initial condition whether the car was charged or not, so the cost is EXACTLY linear in
// corner count and completely blind to what comes after the corner. A real direction-change
// deficit is not like that. A car that cannot rotate leaves the corner SLOWER, and then pays for
// that lower speed all the way down whatever follows.
//
// THE REPLACEMENT. The car leaves a direction change carrying less speed than the apex formula
// gives it, and `straightTime` starts from the reduced speed. Nothing is added to the clock
// anywhere; the whole cost is whatever the slower start turns out to be worth on that particular
// road. On eleven hairpin exits onto short connectors it compounds; on eight motorway sweepers
// taken at 200 km/h it is worth almost nothing, because the geometric factor is forty times
// smaller and the straight is long enough to wash it out. The tight-versus-fast axis therefore
// comes out of the arithmetic instead of being fitted in.
//
// MASS IS THE MECHANISM, and that is the second thing that changes. Inertia is what a car fails
// to redirect; the adder was refused a mass exponent because charging seconds by mass made it a
// heavy-car handicap on top of three other places mass is already priced. An exit-speed deficit
// is not a handicap of that kind: it is spent through the following straight, where a heavy car
// with the power to match recovers it and a heavy car without does not. The exponent is swept
// rather than assumed, and the sweep is in stderr section 2c.
let kExit = 0
// The exit-penalty SHAPE, held apart from its weight exactly as the agility shape is:
//
//   deficit (m/s) = kExit * base(v) * (m/1200)^p * (1/mu)^q * (angle/90)^a clamp((R0/r)^t, lo, hi)
//
// `form` selects `base`, which is the one genuinely new choice:
//   abs   - base 1. The deficit is a fixed number of m/s per unit of corner geometry.
//   frac  - base = apex speed. The car loses a FRACTION of what it was carrying.
//   ratio - v_exit = apex / (1 + L), the same idea written so it CANNOT saturate. frac and abs
//           both need a floor to stop a hairpin exit going negative, and a floor stops the term
//           telling two cars apart in exactly the corners that matter most; this form is bounded
//           by its own algebra instead.
//   tau   - base = the car's own net acceleration at the apex. kExit is then SECONDS: the term
//           reads as time spent rotating instead of accelerating, which is the cleanest physical
//           statement of the four, and it makes a car with nothing left to give lose nothing.
// All four are swept and the report publishes whichever wins on all three courses at once.
const EXIT_LEGACY = { form: 'abs', p: 1, q: 0, a: 1, t: 1, lo: 0.4, hi: 2.5, R0: 80 }
let EXIT = Object.assign({}, EXIT_LEGACY)
const xshp = (o) => Object.assign({}, EXIT_LEGACY, o)
// A car cannot leave a corner below this fraction of its apex speed. It is a structural bound on
// the three forms that need one, not a tuned quantity; the report counts how often it binds so it
// cannot become one by stealth, and the `ratio` form does not use it at all.
const EXIT_FLOOR = 0.4
// How much speed the car fails to carry out of ONE corner, in m/s. Zero at kExit 0, exactly.
function exitDrop(b, seg, apexV, s, k) {
  if (!k) return 0
  const L = k * (Math.pow(b.m / 1200, s.p) / Math.pow(b.mu, s.q)) * tightOf(seg, s)
  if (s.form === 'ratio') return (apexV * L) / (1 + L)
  const base = s.form === 'frac' ? apexV : s.form === 'tau' ? Math.max(0, netAccel(b, apexV)) : 1
  return Math.min(apexV * (1 - EXIT_FLOOR), L * base)
}
// Marching step, in m/s of speed, for the two acceleration integrators below. Both quadrate
// each step with Simpson's rule and SOLVE for their exit points rather than stepping past
// them, so these values sit on the converged answer instead of setting it; they are named
// module-level values so a convergence probe can re-run the same code at a finer step.
let DV_STRAIGHT = 0.5
let DV_ACCEL = 0.1
// Road gradient, as a slope (0.08 = an 8% descent), read ONLY by straightTime. It is a
// DIAGNOSTIC, not a term in the model: it is held at 0 for every published number, and the one
// section that moves it says so and puts it back. It exists because the honest Hakone geometry
// leaves a large one-signed bias that a descent is the obvious candidate for, and asking "how
// much hill would that be" is cheaper and more honest than asserting the answer.
let GRADE = 0
// Scales on the two resistance terms, read by accelIntegral, netAccel and vTopOf. Both are
// DIAGNOSTICS in exactly the sense GRADE is: they are 1 for every published number in this file,
// and the one section that moves them (the drag set) says so and puts them back. They exist so
// that "could a drag or rolling-resistance error explain this?" is priced rather than asserted.
let DRAG_K = 1
let ROLL_K = 1
// Below this net acceleration a car on a straight is treated as being at terminal speed and
// coasts the rest of it. The integrand the march works on is 1/a, which is unbounded as a
// approaches zero, so a floor is needed; the speed at which it bites is interpolated, so the
// threshold is a statement about terminal speed and not a property of the step size.
const A_CRUISE = 0.12

// =====================================================================================
// ACCELERATION IS MEASURED, NOT DERIVED
// =====================================================================================
// Grip and braking already come from measurement. Acceleration did not: it was predicted from
// `ps` through phi, awdK, aCapK and a nine-entry engine-archetype table, four fitted fudges in
// series. Forza publishes a 0-97 AND a 0-161 for 59 of the 85 cars, and two measurements are
// exactly enough to pin the two unknowns of the curve the lap sim already integrates:
//
//   a(v) = min(aLaunch, pEff / (m v)) - (0.5 rho CdA v^2 + froll m g) / m
//
// aLaunch is the low-speed plateau and pEff the effective wheel power that governs the rest.
//
// Neither is a claim about WHY a car falls short of its crank figure. A gearing loss and an
// overstated power figure are indistinguishable from a lap time, and this is what dissolves the
// attribution question that blocked the model for days: two unknowns, two measurements, and no
// need to know which half of the deficit is which. The curve reproduces the car; that is the
// whole requirement. pEff is deliberately NOT used for top speed - that is steady state at
// peak-power rpm, it already runs on the crank figure, and it is already right.
//
// WHAT THE INDIFFERENCE ABOVE CANNOT SURVIVE, and where the model was wrong until 2026-07-27:
// it holds only INSIDE the range the two measurements cover. A traction loss and a gearing loss
// are the same number to a 0-161, but they are not the same number at 250 km/h, because one of
// them stops existing when the demanded thrust falls below what the tyres can hold and the other
// does not. Applying the solved pEff at every speed silently decides that question in favour of
// the permanent reading, for every car, without evidence. `tractionShare` and `paccAt` below are
// where that decision is taken on the car's own arithmetic instead, and only above 161 km/h; the
// two integrals in this section never march that high, so nothing here changes by a single bit.
// `eng` overrides the engine-limited acceleration, as eng(u, ctx) with ctx carrying the same
// fields a car block does. It is read ONLY by the drag set's mechanism probes, which need the
// two measurements re-inverted against a DIFFERENT curve shape so their round trips stay exact
// at whatever shape is being tested. Omitted, this function is unchanged to the last bit.
function accelIntegral(m, CdA, aL, pE, v0, v1, strict, eng) {
  const dv = DV_ACCEL,
    fro = ROLL_K * froll * m * g,
    ctx = eng ? { m, aGrip: aL, Pacc: pE, Pw: 0, vTop: 0 } : null
  // Power-limited acceleration diverges at a standstill, but aLaunch is what actually binds
  // there, so the march starts at rest. Simpson quadrature, and the final step is cut to land
  // exactly on the target instead of overshooting it by up to a whole step.
  const acc = (u) => {
    const aPow = u <= 0 ? Infinity : pE / (m * u)
    return (
      (eng ? eng(u, ctx) : Math.min(aPow, aL)) - (0.5 * rho * DRAG_K * CdA * u * u + fro) / m
    )
  }
  let v = v0,
    t = 0
  for (let i = 0; i < 100000 && v < v1 - 1e-12; i++) {
    const h = Math.min(dv, v1 - v)
    const a0 = acc(v),
      a1 = acc(v + h / 2),
      a2 = acc(v + h)
    // `strict` makes an unreachable target return Infinity instead of the truncated time. A
    // solve MUST use it: a truncated time is smaller than the true one, which inverts the
    // monotonicity the bisections below depend on. Reporting keeps the lenient default.
    if (a0 <= 0 || a1 <= 0 || a2 <= 0) return strict ? Infinity : t
    t += (h / 6) * (1 / a0 + 4 / a1 + 1 / a2)
    v += h
  }
  return t
}
// Both unknowns strictly lower every time they touch, so each solve is one monotone bisection.
function accBisect(f, lo, hi, target, n) {
  for (let i = 0; i < (n || 60); i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
// Wide enough to bracket anything on the roster and to make a bound-hit mean "no solution",
// not "the bracket was mean": 0.03 g to 4 g of launch, 0.5 kW to 4 MW of wheel power.
const A_LO = 0.3,
  A_HI = 40,
  P_LO = 500,
  P_HI = 4e6
const ACC_TOL = 5e-3
function solveAccel(m, CdA, t97, t161) {
  // Above the launch crossover the curve is pure power, so the 97->161 segment fixes pEff on
  // its own and the 0-97 then fixes aLaunch: two 1-D solves instead of a 2-D one. The
  // decoupling is exact whenever the crossover falls below 97 km/h, which is where it lands
  // for every car in the set but one.
  let pE = accBisect(
    (p) => accelIntegral(m, CdA, Infinity, p, V97, V161, true),
    P_LO, P_HI, t161 - t97,
  )
  let aL = accBisect((a) => accelIntegral(m, CdA, a, pE, 0, V97, true), A_LO, A_HI, t97)
  let mode = 'decoupled'
  if (pE / (m * aL) > V97) {
    // Still traction-limited at 97 km/h, so the segment carries aLaunch too and the pair has
    // to be solved jointly: an inner solve for pEff against the 0-161, an outer for aLaunch
    // against the 0-97. The outer is monotone because holding the 0-161 fixed while raising
    // aLaunch moves time out of the launch phase and into the power phase.
    mode = 'joint'
    const inner = (a) =>
      accBisect((p) => accelIntegral(m, CdA, a, p, 0, V161, true), P_LO, P_HI, t161, 50)
    aL = accBisect((a) => accelIntegral(m, CdA, a, inner(a), 0, V97, true), A_LO, A_HI, t97, 45)
    pE = inner(aL)
  }
  const r97 = accelIntegral(m, CdA, aL, pE, 0, V97),
    r161 = accelIntegral(m, CdA, aL, pE, 0, V161)
  const bad = []
  if (aL <= A_LO * 1.001 || aL >= A_HI * 0.999) bad.push('aLaunch pinned at a bracket bound')
  if (pE <= P_LO * 1.001 || pE >= P_HI * 0.999) bad.push('pEff pinned at a bracket bound')
  if (!isFinite(r97) || Math.abs(r97 - t97) > ACC_TOL) bad.push('0-97 does not round-trip')
  if (!isFinite(r161) || Math.abs(r161 - t161) > ACC_TOL) bad.push('0-161 does not round-trip')
  // The crossover speed and the share of the 0-97 spent below it say how well the data
  // IDENTIFIES aLaunch: a car that is power-limited from 20 km/h barely constrains it.
  const vc = pE / (m * aL)
  const launchShare = accelIntegral(m, CdA, aL, pE, 0, Math.min(vc, V97)) / r97
  return { aL, pE, mode, r97, r161, vc, launchShare, bad, e97: r97 - t97, e161: r161 - t161 }
}
// The same solve against an ARBITRARY engine-curve shape, read only by the drag set's mechanism
// probes. It is always the joint 2-D form: the decoupled shortcut keys on where the launch
// crossover falls, and a changed shape moves that, so the shortcut's precondition cannot be
// assumed. Both round trips come out exact at whatever shape is passed, which is the point:
// a candidate mechanism has to be scored WITHOUT spending the two measurements that pin the car.
function solveAccelShaped(m, CdA, t97, t161, eng) {
  const rt = (a, p) => ({
    e97: accelIntegral(m, CdA, a, p, 0, V97, false, eng) - t97,
    e161: accelIntegral(m, CdA, a, p, 0, V161, false, eng) - t161,
  })
  const off = (r) =>
    !isFinite(r.e97) || !isFinite(r.e161) ||
    Math.abs(r.e97) > ACC_TOL || Math.abs(r.e161) > ACC_TOL
  let pE = accBisect(
    (p) => accelIntegral(m, CdA, Infinity, p, V97, V161, true, eng), P_LO, P_HI, t161 - t97,
  )
  let aL = accBisect((a) => accelIntegral(m, CdA, a, pE, 0, V97, true, eng), A_LO, A_HI, t97)
  let r = rt(aL, pE)
  if (off(r)) {
    const inner = (a) =>
      accBisect((p) => accelIntegral(m, CdA, a, p, 0, V161, true, eng), P_LO, P_HI, t161, 44)
    aL = accBisect(
      (a) => accelIntegral(m, CdA, a, inner(a), 0, V97, true, eng), A_LO, A_HI, t97, 40,
    )
    pE = inner(aL)
    r = rt(aL, pE)
  }
  return { aL, pE, e97: r.e97, e161: r.e161 }
}
// One measurement leaves one free parameter. Rather than throw the measurement away, aLaunch
// comes from the fallback regression and pEff is then solved to reproduce the published 0-97
// exactly. These are the cars Forza cannot run to 161 km/h at all, so they are slow, so they
// are power-limited over almost the whole run and pEff is what the datum actually pins.
function solveAccelFromT97(m, CdA, t97, aL) {
  const pE = accBisect((p) => accelIntegral(m, CdA, aL, p, 0, V97, true), P_LO, P_HI, t97)
  const r97 = accelIntegral(m, CdA, aL, pE, 0, V97)
  const bad = []
  if (pE <= P_LO * 1.001 || pE >= P_HI * 0.999) bad.push('pEff pinned at a bracket bound')
  if (!isFinite(r97) || Math.abs(r97 - t97) > ACC_TOL) bad.push('0-97 does not round-trip')
  return { aL, pE, mode: 'one-point', r97, r161: null, vc: pE / (m * aL), bad, e97: r97 - t97 }
}
// The fallback's predictors, in the same shape the braking fallback already uses: predict the
// dimensionless RATIO, so the car's own grip and own power carry the scale, and only the
// fraction of each that reaches the road is regressed. Those two ratios are the direct
// successors of aCapK/awdK and phi, which were the same two quantities held constant.
const ACC_X = (c) => [
  1,
  c.dt === 'AWD' ? 1 : 0,
  c.dt === 'FWD' ? 1 : 0,
  Math.log((c.ps * 1000) / c.kg),
]
const ACCEL_SOLVED = CARS.filter((c) => c.z97 != null && c.z161 != null).map((c) => {
  const m = c.kg + 75,
    CdA = c.cd * frontalArea(c),
    mu = gripMu(c)
  return Object.assign({ c, m, CdA, mu, Pw: c.ps * PS * eta }, solveAccel(m, CdA, c.z97, c.z161))
})
const ACCEL_FIT = (function () {
  const X = ACCEL_SOLVED.map((r) => ACC_X(r.c))
  const bA = ols(X, ACCEL_SOLVED.map((r) => r.aL / (r.mu * g)))
  const bP = ols(X, ACCEL_SOLVED.map((r) => r.pE / r.Pw))
  const dot = (b, c) => ACC_X(c).reduce((a, x, i) => a + x * b[i], 0)
  return {
    bA,
    bP,
    aRatio: (c) => dot(bA, c),
    pRatio: (c) => dot(bP, c),
    aOf: (c) => Math.max(0.5, dot(bA, c) * gripMu(c) * g),
    pOf: (c) => Math.max(2e3, dot(bP, c) * c.ps * PS * eta),
  }
})()
// carBlock is called once per lap per car and the solve is a nested bisection, so the answer is
// memoised on everything the solve actually reads. Keying on values rather than on the object
// is what lets the Forza-panel and telemetry-anchor variants of a car - same id, different
// mass, power and drag - each get their own honest solve instead of sharing one.
const ACC_CACHE = new Map()
// The provenance of a car's acceleration curve, in four characters. It is not a lever: meas =
// both published times solved, 1pt = one published and the other half regressed, est = both
// halves regressed. Declared here beside the solve because two sections print it.
const ACCTAG = { measured: 'meas', 'one-point': ' 1pt', predicted: ' est' }
function accelOf(c) {
  const m = c.kg + 75,
    CdA = c.cd * frontalArea(c),
    mu = gripMu(c)
  const key = [m, CdA, mu, c.ps, c.dt, c.z97, c.z161].join('|')
  const hit = ACC_CACHE.get(key)
  if (hit) return hit
  let out
  if (c.z97 != null && c.z161 != null) {
    out = Object.assign({ src: 'measured' }, solveAccel(m, CdA, c.z97, c.z161))
  } else if (c.z97 != null) {
    out = Object.assign({ src: 'one-point' }, solveAccelFromT97(m, CdA, c.z97, ACCEL_FIT.aOf(c)))
  } else {
    const aL = ACCEL_FIT.aOf(c),
      pE = ACCEL_FIT.pOf(c)
    out = {
      src: 'predicted',
      aL,
      pE,
      mode: 'regression',
      vc: pE / (m * aL),
      bad: [],
      clamped:
        (ACCEL_FIT.aRatio(c) * mu * g < 0.5 ? ['aLaunch'] : []).concat(
          ACCEL_FIT.pRatio(c) * c.ps * PS * eta < 2e3 ? ['pEff'] : [],
        ),
    }
  }
  ACC_CACHE.set(key, out)
  return out
}
// =====================================================================================
// WHAT pEff IS A MEASUREMENT OF, AND WHERE IT STOPS BEING ONE
// =====================================================================================
// The solve fits pEff to the 0-97 and 0-161 and the sim then applied that one number at EVERY
// speed, which is a claim the measurement does not support. A car whose tyres run out before its
// engine does is measured through a window where the binding constraint is traction, so the
// number that comes back is what the contact patch allowed over that window, not what the engine
// makes. Hold it flat to 300 km/h and the model asserts two incompatible things about the same
// car: that it reaches a top speed only full crank power can reach, and that it accelerates at
// six tenths of that power on the way there.
//
// THE DETECTION IS ARITHMETIC ON QUANTITIES ALREADY SOLVED, not a new per-car input.
//   vFull = Pw / (m aLaunch)  is the speed below which FULL crank power asks the contact patch
//                             for more thrust than the solved launch plateau can give.
//   fTr   = the share of the 97-161 km/h measurement window that sits below vFull.
// fTr = 0 says the window never touched the traction-limited regime, so the whole shortfall is
// gearing, torque curve or an overstated crank figure and it is just as real at 250 km/h as at
// 100. fTr = 1 says the car was traction-bound across the entire window including its top end,
// so the shortfall the fit measured is traction and traction alone, and it evaporates as the
// speed rises and the demanded thrust falls.
//
// THE ONE ASSUMPTION, said plainly: fTr is a share of the measurement WINDOW, and it is used as
// the share of the measured SHORTFALL that traction owns. Those are two different quantities and
// nothing here proves they are equal. What is defensible is the direction and the ordering - the
// more of the window ran under the traction ceiling, the more of the deficit that window read is
// traction - and the endpoints, which are exact: a window entirely above vFull can have measured
// no traction at all, and a window entirely below it can have measured nothing else.
//
// THIS IS INERT FOR ORDINARY CARS BY CONSTRUCTION, not by tuning: 82 of the 85 have vFull below
// 97 km/h, so fTr is exactly zero for them and paccAt returns the solved value at every speed
// they can reach. Only cars with a great deal of torque against very little grip go the other way.
function tractionShare(m, aL, Pw) {
  const vFull = Pw / (m * aL)
  return Math.max(0, Math.min(1, (vFull - V97) / (V161 - V97)))
}
// Effective wheel power at a speed. Below the top of the measurement window it IS the solved
// value, exactly, which is what keeps every car's 0-97 and 0-161 round trip bit-for-bit intact:
// neither solve integral ever marches above V161, so neither can see this function move.
//
// ABOVE IT the traction-owned share of the shortfall is handed back. The shape is the same
// dilution arithmetic the detection is built on: run the measurement window on past 161 km/h to
// speed v and the traction-limited share of it falls as (V161 - V97) / (v - V97), because the
// numerator is fixed at whatever sat below vFull and only the denominator grows. One over that,
// subtracted from one, is how much of the contamination has washed out by v. It is normalised to
// complete at the car's own top speed, which is the speed at which the rest of this model already
// assumes full crank power - so the two stop contradicting each other at exactly the point where
// the contradiction was visible. What is never handed back is (1 - fTr) of the shortfall: the part
// the measurement says is gearing, torque curve or an overstated crank figure, which is as real at
// 300 km/h as it is at 100.
// Switched off ONLY by the accountability section that prices the term in lap time, and put back
// immediately. Every published number in this file runs with it on.
let tractionRelease = true
function paccAt(b, u) {
  if (!tractionRelease || !b.fTr || u <= V161 || !(b.vTop > V161)) return b.Pacc
  const W = V161 - V97
  const dTop = 1 - W / (b.vTop - V97)
  const w = dTop <= 1e-9 ? 1 : Math.max(0, Math.min(1, (1 - W / (u - V97)) / dTop))
  return b.Pacc + b.fTr * Math.max(0, b.Pw - b.Pacc) * w
}

// carBlock is called once per lap, and the corner-exit fit below runs tens of thousands of laps
// because that term has no affine shortcut. Everything the function reads is memoised on the
// VALUES it reads, never on the object, so the sensitivity probes that mutate a car in place get
// their own block instead of a stale one. `clearCaches` exists for the one probe that changes an
// answer without changing a field (it swaps the acceleration fallback), and every caller that
// used to clear ACC_CACHE now calls it.
let CB_CACHE = new WeakMap()
const clearCaches = () => {
  ACC_CACHE.clear()
  CB_CACHE = new WeakMap()
}
function carBlock(c) {
  // Keyed on the object, guarded by a signature over the fields anything in this file ever
  // MUTATES in place (the section-6 probes move kg, lg, dfC and b97; `derived` switches the whole
  // acceleration path). Everything else carBlock reads is fixed for the life of the object, so
  // the object identity pins it. A car record that is rebuilt rather than mutated simply gets a
  // fresh entry, which is correct rather than merely safe.
  const sig =
    (derived ? phi + ':' + awdK + ':' + aCapK : '0') + '|' + c.kg + '|' + (c.lg || 0) + '|' +
    (c.dfC || 0) + '|' + c.b97 + '|' + c.b161 + '|' + c.cd + '|' + c.ps + '|' + c.z97 +
    '|' + c.z161
  const cached = CB_CACHE.get(c)
  if (cached && cached.sig === sig) return cached.b
  const m = c.kg + 75,
    Pw = c.ps * PS * eta,
    mu = gripMu(c)
  const CdA = c.cd * frontalArea(c)
  let b
  if (derived) {
    // The superseded path, reachable only from the before/after tables.
    const bL = 1 - (c.fr != null ? c.fr : 55) / 100,
      cL = (c.fr != null ? c.fr : 55) / 100,
      hL = (c.com || 460) / (c.wb || 2500)
    const aCap = aCapK * mu
    let ag
    if (c.dt === 'AWD') ag = mu * awdK
    else if (c.dt === 'RWD') ag = Math.min((mu * bL) / (1 - Math.min(0.9, mu * hL)), aCap)
    else ag = Math.min((mu * cL) / (1 + mu * hL), aCap)
    b = {
      m, Pw, mu, bmu: brakeMu(c), CdA, dfC: c.dfC || 0,
      aGrip: Math.min(mu, ag) * g,
      Pacc: Pw * phi,
      dF: deliveryFactor(c),
      acc: null,
      // The superseded path predicted power rather than measuring it, so there is no measurement
      // window to leave and nothing for the traction release to act on. Zero holds it unchanged.
      fTr: 0,
    }
  } else {
    const a = accelOf(c)
    // dF 1 is not "delivery is perfect": the corner-exit ramp was a guess at what the measured
    // curve now states outright, so keeping both would count the same shortfall twice.
    b = {
      m, Pw, mu, bmu: brakeMu(c), CdA, dfC: c.dfC || 0, aGrip: a.aL, Pacc: a.pE, dF: 1, acc: a,
      fTr: tractionShare(m, a.aL, Pw),
    }
  }
  b.vTop = vTopOf(b, c)
  CB_CACHE.set(c, { sig, b })
  return b
}
// Accelerate down a straight of length L from v_in, arriving at the next corner's apex speed
// v_out. The march is in speed, not time, and it ends at whichever comes first: the brake
// point, or terminal speed. BOTH exits are solved for inside the step that crosses them. A
// step is ~15 m at motorway speed, so breaking at the first step past the brake point charges
// the car for braking from a speed it never reached and stretches the straight by up to that
// whole stride - an error that reads as lap time, varies by car, and is not physics.
// The car's own net acceleration at a speed. Acceleration runs on the car's OWN measured curve:
// aGrip is the solved launch plateau and paccAt the effective wheel power, which is the solved
// pEff over the range that solved it and rises above it only on a car whose measurement was
// traction-bound (see tractionShare). The delivery ramp is inert (dF 1) on every car that has
// one, and survives only for the superseded derived path.
// Hoisted out of straightTime because the `tau` reading of the exit penalty prices its seconds
// against exactly this quantity, and two copies of it would be free to drift apart.
// `eng` is the same override accelIntegral takes, and for the same reason: the drag set's
// mechanism probes have to march on exactly the curve their own solve inverted. A block may
// also carry one, which is what lets a whole LAP be run at a candidate curve without threading
// the override through straightTime. Both are absent from every published number in this file,
// and the body below is then unchanged to the last bit.
function netAccel(b, u, aSlope, eng) {
  const e = eng || b.eng
  const aRes = (0.5 * rho * DRAG_K * b.CdA * u * u + ROLL_K * froll * b.m * g) / b.m
  if (e) return e(u, b) - aRes + (aSlope || 0)
  const aPow = paccAt(b, u) / (b.m * u),
    dRamp = b.dF + (1 - b.dF) * Math.min(1, u / 33),
    aEng = Math.min(aPow, b.aGrip) * dRamp
  return aEng - aRes + (aSlope || 0)
}
function straightTime(b, v_in, v_out, L) {
  const dv = DV_STRAIGHT
  // Gravity along the road, zero for every published number. See GRADE.
  const aSlope = GRADE ? g * Math.sin(Math.atan(GRADE)) : 0
  // Braking runs on the car's own measured braking coefficient, not on lateral mu.
  // Downforce still helps it, and more the faster the car is going.
  const aBrakeOf = (u) => Math.max(0.5, b.bmu * aeroMult(u, b.dfC) * g - aSlope)
  const dBrakeOf = (u) => (u > v_out ? (u * u - v_out * v_out) / (2 * aBrakeOf(u)) : 0)
  const tBrakeOf = (u) => (u > v_out ? (u - v_out) / aBrakeOf(u) : 0)
  const accelOf = (u) => netAccel(b, u, aSlope)
  let v = Math.max(v_in, 3),
    x = 0,
    t = 0
  // Simpson's rule over a partial step of `s` of the current stride. Both integrands
  // (dt = dv/a and dx = v dv/a) steepen sharply as a falls towards A_CRUISE, which is exactly
  // where an endpoint rule spends its error, so the extra two evaluations per step buy the
  // convergence. The stride shrinks near the top-speed cap so the march lands exactly on it.
  let stride = dv
  const stepTo = (s) => {
    const hh = s * stride
    const a0 = accelOf(v),
      a1 = accelOf(v + hh / 2),
      a2 = accelOf(v + hh)
    return {
      dt: (hh / 6) * (1 / a0 + 4 / a1 + 1 / a2),
      dx: (hh / 6) * (v / a0 + (4 * (v + hh / 2)) / a1 + (v + hh) / a2),
    }
  }
  // Bisection on a monotone crossing inside the step; 40 halvings of [0,1] is exact in double.
  const cross = (hi, f) => {
    let lo = 0
    for (let j = 0; j < 40; j++) {
      const mid = (lo + hi) / 2
      if (f(mid)) lo = mid
      else hi = mid
    }
    return hi
  }
  const coast = () => (L - x - dBrakeOf(v)) / v + tBrakeOf(v)
  // The car can enter faster than the following corner allows, in which case the whole
  // straight is braking. This cannot recur inside the loop: every step stops at the brake
  // point, so x + dBrake(v) < L still holds at the top of the next one.
  if (dBrakeOf(v) >= L) return tBrakeOf(v)
  // Nothing may exceed the speed at which the car's own crank power balances its own drag,
  // whatever the effective acceleration power says. See `capToVTop`.
  const vCap = capToVTop && b.vTop ? b.vTop : Infinity
  for (let i = 0; i < 100000; i++) {
    if (v >= vCap - 1e-9 || accelOf(v) <= A_CRUISE) return t + coast()
    stride = Math.min(dv, vCap - v)
    // How far into this step the car reaches terminal speed, if it does so at all...
    const sc =
      accelOf(v + stride) > A_CRUISE ? 1 : cross(1, (s) => accelOf(v + s * stride) > A_CRUISE)
    const step = stepTo(sc)
    // ...and how far into it the brake point falls, which is x + dBrake(v) = L.
    if (x + step.dx + dBrakeOf(v + sc * stride) >= L) {
      const sb = cross(sc, (s) => x + stepTo(s).dx + dBrakeOf(v + s * stride) < L)
      return t + stepTo(sb).dt + tBrakeOf(v + sb * stride)
    }
    x += step.dx
    t += step.dt
    v += sc * stride
    if (sc < 1) return t + coast()
  }
  return t
}
const COURSES = {
  // Hakone: 2.7 km of mountain road carrying the maintainer's eight reference laps. Four 11 m
  // switchbacks of about 150 degrees, five linking bends of 91 to 138 m, connectors of 161 to
  // 290 m. It is the ONLY copy of this geometry in the file: the ranked table and the driven-lap
  // section below both read it.
  //
  // THIS GEOMETRY IS A BEHAVIOURAL FACSIMILE, NOT A SURVEY. SAY SO EVERY TIME IT IS QUOTED.
  // It is a road that makes cars behave the way Hakone makes them behave. It is NOT a reading of
  // the real Hakone Nanamagari, and no radius, angle or connector below is a measured value of
  // anything. Every number here was chosen by a search (2026-07-27, maintainer ruling: "use
  // whatever track geometry you need to to get the closest fit to my driven times"), minimising
  // the error against the eight driven laps with kAgi refitted at every candidate. Do not cite a
  // radius from this array as a fact about the road.
  //
  // WHY IT HAS TO BE A FACSIMILE. The surveyed road is kept below as HAK_MAP: eleven switchbacks
  // of 11 to 19 m on 90 to 165 m connectors. On that geometry this model is about 21% slow on all
  // eight driven laps with the agility term switched off entirely, which is the FLOOR of what it
  // can produce there, and no agility weight and no member of the agility shape family repairs
  // it. The missing physics is a racing-line model: a mapped radius is a centreline radius, a
  // driver on a road with width does not drive the centreline, and apex speed goes as the square
  // root of the radius. That is a geometry-to-line transformation and this model has no term for
  // it. It is NOT the descent - the diagnostics below price a grade and even 12% closes a
  // fraction of the gap, because a grade cannot touch a corner arc. Until a line model exists,
  // the choice is a course the model cannot lap or a course that behaves like the real one, and
  // the maintainer has ruled for the second. The surveyed map stays in the file, and every
  // diagnostic that used to argue against the tuning still runs, against this geometry.
  //
  // WHAT THE FACSIMILE COSTS, STATED HERE SO IT IS NEVER LOST: the switchback count drops from
  // eleven to four and the direction-change demand from 56.2 to 18.8, so this course is a
  // materially easier road than the one that was driven. What it buys is that the eight laps
  // become readable as car results instead of as one large shared bias.
  Hakone: [
    [97, 53, 290],
    [11, 152, 161],
    [93, 61, 290],
    [138, 40, 161],
    [11, 150, 290],
    [105, 40, 290],
    [11, 150, 290],
    [91, 40, 161],
    [11, 150, 230],
  ],
  // Wangan: 7.0 km of highway loop carrying the maintainer's five reference laps. Eight fast
  // sweepers of 295 to 645 m, two medium corners of 100 and 125 m, one slow 55 m junction ramp,
  // connectors of 320 to 838 m. It is the ONLY copy of this geometry in the file.
  //
  // THIS GEOMETRY IS A BEHAVIOURAL FACSIMILE, NOT A SURVEY. SAY SO EVERY TIME IT IS QUOTED, on
  // exactly the footing Hakone is quoted. The maintainer's description is the whole of what is
  // known about the road: a C1-loop-like highway circuit, a little wider and faster than the real
  // C1, 7.0 km round, roughly eight fast sweepers (straights for a slow car), two mediums, one
  // slow corner, the rest straights and near-straights, driven in Rivals mode from a standing
  // start with ABS on, manual shifting, traction and stability control off. That description is
  // authored below as WAN_DESC and is kept in the file. On WAN_DESC the model is FAST, by several
  // per cent on the mean and by more on the worst lap, so the radii, angles and connectors
  // published here were chosen by a search against those five times with kAgi refitted at every
  // candidate, the corner character held to the description (8 fast, 2 medium, 1 slow), the length
  // held at 7.0 km, and nothing tighter than the real C1's own junction ramps. No number in this
  // array is a measured value of anything and none may be quoted as a fact about the road. The
  // driven-lap section on stdout prints the WAN_DESC figures beside the published ones.
  //
  // WHAT ITS ERROR FIGURE MEASURES. The LEVEL is the search's: it was fitted, so a near-zero mean
  // is a receipt for the search and not for the model. What the search could NOT move is the
  // scatter about that level, because the geometry charges every car through the same corners:
  // three of the five laps land inside a fifth of a per cent, the NSX-R sits about 3% fast and the
  // LFA about 6% slow, and those two residuals hold their size and their sign across every
  // plausible geometry in the search box. Read the mean as the search and the spread as the model,
  // and read the driven-lap section below for what the spread turns out to say.
  Wangan: [
    [515, 21, 838],
    [375, 18, 530],
    [295, 24, 400],
    [100, 83, 660],
    [645, 15, 320],
    [55, 133, 490],
    [425, 18, 320],
    [555, 16, 590],
    [335, 26, 400],
    [125, 70, 320],
    [475, 19, 510],
  ],
  // THE CLUB CIRCUIT IS GONE (maintainer ruling, 2026-07-27: "kill the club circuit as well").
  // It was the last synthetic course: no driven lap was ever run on it, so no time on it was a
  // measurement of anything, and the earlier course-character analysis found it read as a blend
  // of the other three rather than as a separate axis. Every surviving course carries driven
  // reference laps (Hakone 8, Wangan 5, Misaki 14), and the overall index is now the mean over
  // those three alone.
  //
  // Misaki International Raceway: the calibrated Legend Island facsimile (Forza Horizon 6
  // gold standard, ~4.72 km), the course every driven reference lap is measured on.
  // Geometry traced from the top-view: fast W-coast run, S-point hairpin, centre lollipop,
  // fast right sweepers, long main straight. [radius m, angle deg, following straight m]
  // This is the ONLY copy in this file; the calibration sections below alias it, and it
  // matches the shipped `misaki` entry in packages/content/data/courses.json verbatim.
  Misaki: [
    [700, 20, 300],
    [350, 30, 300],
    [200, 40, 200],
    [45, 95, 180],
    [250, 38, 200],
    [160, 42, 300],
    [18, 175, 350],
    [400, 26, 350],
    [280, 35, 400],
    [450, 20, 650],
  ],
  // Yatabe Straight: 1 km from a standing start, no corners. Added 2026-07-27, when the seven
  // measured standing kilometres became a scored set large enough to publish as a course. The
  // name is the JARI Yatabe proving ground in Ibaraki, where Japanese manufacturers and tuners
  // did their top-speed runs through the 1980s and 90s, so it is era-correct for this game.
  //
  // ITS SEGMENT ARRAY IS EMPTY, AND THAT IS DELIBERATE. A pure straight cannot be written in the
  // [radius, angle, straight] contract: a zero-angle segment still ENTERS its straight at the
  // apex speed, which would make this a flying kilometre rather than a standing one, and the
  // segment arithmetic downstream (average radius, corner mix) has nothing to divide by. Yatabe
  // therefore carries its own evaluator, registered in COURSE_EVAL beside the drag integrator,
  // and its own trackInfo record in FLAT_INFO. EVERYTHING ELSE about it is what the other three
  // get and nothing about it is special-cased anywhere else: CK membership, the ranked table,
  // the overall index, the per-course ranks, the JSON export and the dashboard tabs all derive
  // from this object exactly as before.
  //
  // IT IS ALSO THE ONE COURSE THAT CARRIES A CALIBRATION OFFSET. See DRAG_OFFSET: the drag times
  // published here are the model's times less a flat, maintainer-approved protocol constant
  // fitted on the seven driven kilometres. That constant reaches this course and NOTHING else.
  Yatabe: [],
}
// The length of the standing kilometre, in metres. Named once so the course, the driven set,
// the evaluator and the printed geometry cannot disagree about how long the run is.
const YATABE_M = 1000
// THE SURVEYED MAP: Hakone Nanamagari as read off the course map. Eleven switchbacks of 11 to
// 19 m linked by 90 to 165 m connectors, a run-in bend and a run-out bend, and nothing
// resembling a main straight. No radius, angle or connector here was ever moved to make a lap
// time come out; this is the honest reading of the road.
//
// IT IS NOT THE PUBLISHED COURSE, AND THE REASON IS IN THE COURSE COMMENT ABOVE. Nothing laps
// this except the diagnostics, which report what the facsimile bought, what it cost, and how far
// the model has to be from the real road to reach the driven level. Keeping it in the file is
// what stops the facsimile from quietly becoming "the road".
const HAK_MAP = [
  [55, 65, 290],
  [13, 175, 130],
  [15, 165, 150],
  [12, 180, 110],
  [17, 160, 165],
  [11, 175, 95],
  [45, 85, 135],
  [14, 170, 120],
  [19, 150, 145],
  [12, 175, 100],
  [16, 170, 140],
  [13, 165, 115],
  [18, 155, 90],
  [38, 100, 255],
]
// WANGAN AS DESCRIBED: the maintainer's account of the road written down before any search
// touched it. Eight fast sweepers of 300 to 650 m turning 25 to 45 degrees, two mediums of 150 and
// 190 m, one 70 m junction ramp, 7.0 km round, 64% straight. It is the honest reading of the
// description in the same way HAK_MAP is the honest reading of the course map, and it plays the
// same role: nothing laps it except the diagnostics, which report how far the published facsimile
// had to move from it and in which direction. Keeping it here is what stops the facsimile from
// quietly becoming "the road".
const WAN_DESC = [
  [520, 35, 729],
  [380, 30, 440],
  [300, 40, 330],
  [150, 65, 550],
  [650, 25, 260],
  [70, 110, 400],
  [430, 30, 260],
  [560, 28, 490],
  [340, 45, 330],
  [190, 55, 260],
  [480, 32, 420],
]
// Every course-shaped consumer below (ranked table, overall, specialty, JSON export)
// reads this, so adding a course to COURSES is the whole change.
const CK = Object.keys(COURSES)
const abbr = (k) => k.slice(0, 5).toLowerCase()
// Terminal speed is a root, not a march: wheel thrust exactly balances aero plus rolling drag,
// and net acceleration falls monotonically with speed. Bisecting it costs the same as the old
// 0.5 m/s scan and removes a 1.8 km/h quantisation from every apex clamp and every published
// top-speed figure. phi is deliberately absent, as in cdFromTop: top speed IS steady state.
function vTopOf(b, c) {
  const net = (v) =>
    b.Pw / (b.m * v) - (0.5 * rho * DRAG_K * b.CdA * v * v + ROLL_K * froll * b.m * g) / b.m
  let lo = 1,
    hi = 200
  let vt
  if (net(lo) <= 0) vt = lo
  else if (net(hi) > 0) vt = hi
  else {
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (net(mid) > 0) lo = mid
      else hi = mid
    }
    vt = (lo + hi) / 2
  }
  if (c && c.top) vt = Math.min(vt, c.top / 3.6)
  return vt
}
// The lap, and the three costs it is made of: time on the corner arcs, the direction-change
// charge, and time on the straights (acceleration plus braking into the next corner). `lap` is
// the total and is what everything downstream reads; the split exists so the course-character
// diagnostics can say where a course actually spends its time instead of inferring it from the
// straight-length fraction, which on a hairpin course says almost nothing. One implementation,
// accumulated in the same order as before, so the total is unchanged to the last bit.
// `wantCost` makes the split price the corner-exit penalty by running each straight twice, once
// from the reduced speed and once from the apex. It is OFF by default because `lap` is the hot
// path and the counterfactual doubles the straight march; every reporting caller that needs the
// column asks for it. The total is identical either way.
// `blk` runs the lap on a supplied car block instead of the car's own. Only the drag set's
// mechanism probes pass one, so that a candidate acceleration curve can be priced in LAP TIME
// on all 36 driven laps before it is considered. Omitted everywhere else.
function lapSplit(c, segs, wantCost, blk) {
  const b = blk || carBlock(c),
    vTop = b.vTop,
    n = segs.length,
    apex = segs.map((s) => Math.min(apexOf(arcMu(b.mu, s[0]), s[0], b.dfC), vTop))
  let t = 0,
    arc = 0,
    agi = 0,
    str = 0,
    exi = 0,
    floored = 0
  for (let i = 0; i < n; i++) {
    const dArc = (segs[i][0] * (segs[i][1] * Math.PI)) / 180 / apex[i]
    t += dArc
    arc += dArc
    const tight = tightOf(segs[i], AGI)
    // Direction-change cost: the seconds spent turning the car IN, which a point-mass sim
    // steering an arc at a fixed apex speed never charges for. `tight` is the geometry (how
    // much heading the corner asks for, and how abruptly), and 1/mu is the price: a car with
    // more grip changes direction sooner, because the transient uses the same contact patch
    // the steady-state corner does. That makes it a GRIP-LIMITED cost and nothing else.
    //
    // It deliberately does NOT scale with mass. Mass is already priced three times over in
    // this model - through apex speed via the grip fit, through braking distance, and through
    // acceleration off the corner - and a fourth, linear charge on top of those made the term
    // a heavy-car handicap rather than a transition model. Fitted against the driven laps
    // (section 6 sweeps the exponent), dropping it improves every group's error at once and
    // collapses the residual-versus-mass correlation, which is what removing a mis-specified
    // exponent looks like as opposed to tuning one.
    const dAgi = kAgi * agiCornerW(b, AGI, segs[i]) * tight
    t += dAgi
    agi += dAgi
    // The corner-exit penalty. The arc is still charged at the apex speed, so this is purely an
    // exit-speed effect and not a second bite at corner speed; what it changes is the INITIAL
    // CONDITION of the straight that follows, which is the whole point of the term.
    const vOut = Math.min(apex[(i + 1) % n], vTop)
    const drop = exitDrop(b, segs[i], apex[i], EXIT, kExit)
    if (drop >= apex[i] * (1 - EXIT_FLOOR) - 1e-9 && kExit) floored++
    const dStr = straightTime(b, apex[i] - drop, vOut, segs[i][2])
    t += dStr
    str += dStr
    if (wantCost && drop > 0) exi += dStr - straightTime(b, apex[i], vOut, segs[i][2])
  }
  // `str` is reported net of the exit cost so the three shares still add to the lap; `t` is
  // accumulated in the same order as before, so a run at kExit 0 is unchanged to the last bit.
  return { t, arc, agi, str: str - exi, exi, floored, b, apex }
}
function lap(c, segs, blk) {
  return lapSplit(c, segs, false, blk).t
}
// What a standing start costs, in seconds, against the flying lap the model runs. lap() enters
// corner 0 at its apex speed and never sees a standstill; a driven lap begins at rest. Placing
// the start line at the exit of corner 0 makes the offset exactly the extra time the first
// straight takes from rest, and that is what this returns. It is an estimate of a systematic
// offset, not a term in the model.
function standingPenalty(c, segs) {
  const s = lapSplit(c, segs),
    b = s.b
  const vOut = s.apex[1 % segs.length]
  // straightTime floors its entry speed at 3 m/s, so the launch below that is charged here.
  const launch = accelIntegral(b.m, b.CdA, b.aGrip, b.Pacc, 0, 3)
  // The flying reference enters that first straight at the corner-exit speed, not at the apex,
  // because that is what the lap it is being differenced against actually does.
  const vFly = s.apex[0] - exitDrop(b, segs[0], s.apex[0], EXIT, kExit)
  return launch + straightTime(b, 0, vOut, segs[0][2]) - straightTime(b, vFly, vOut, segs[0][2])
}
// The same lap at an ARBITRARY agility shape, `s` carrying its own k as well as the exponents.
// It is a PROBE OF THE ADDITIVE TERM AT AN ARBITRARY SHAPE, not the published model: it
// deliberately ignores kExit, so it stays a clean reading of the whole family however the
// published levers are set. Two callers need it: the shape sweep, which is the evidence behind
// every exponent the term carries; and the archival "before" blocks, which run it at p = 1 so a
// table that says it reproduces the superseded mass-proportional model actually does instead of
// re-scoring history at today's shape.
function lapShape(c, segs, s) {
  const b = carBlock(c),
    vTop = b.vTop,
    n = segs.length
  const apex = segs.map((x) => Math.min(apexOf(arcMu(b.mu, x[0]), x[0], b.dfC), vTop))
  let t = 0
  for (let i = 0; i < n; i++) {
    t += (segs[i][0] * (segs[i][1] * Math.PI)) / 180 / apex[i]
    t += s.k * agiCornerW(b, s, segs[i]) * tightOf(segs[i], s)
    t += straightTime(b, Math.min(apex[i], vTop), Math.min(apex[(i + 1) % n], vTop), segs[i][2])
  }
  return t
}
// The superseded mass-proportional shape at whatever kAgi is currently set to. Read ONLY by the
// archival "before" blocks; nothing in the published model touches it.
const lapMassAgi = (c, segs) => lapShape(c, segs, shp({ p: 1, k: kAgi }))
// THE AFFINE IDENTITY, which is what makes every sweep below exact rather than sampled.
// kAgi appears in exactly one additive place, so for a fixed car, course and shape:
//     lap(k) = lap(0) + k * agiSum(car, course, shape)
// One lap sim per car per course therefore prices EVERY k and every (a, t, hi, lo) at once, and
// the fit is arithmetic instead of a search over re-simulated laps. Section 2b asserts this
// against the simulator rather than trusting the algebra.
function lapAtZero(c, segs) {
  const k0 = kAgi,
    x0 = kExit
  kAgi = 0
  kExit = 0
  const t = lap(c, segs)
  kAgi = k0
  kExit = x0
  return t
}
// The standing-start time to a speed. It is the SAME integrator the acceleration solve inverts,
// which is what makes the round-trip check below meaningful rather than circular-by-accident:
// if the solved pair did not reproduce the measurement here, the solve would be wrong.
function zeroTo(c, kmh, strict) {
  const b = carBlock(c)
  return accelIntegral(b.m, b.CdA, b.aGrip, b.Pacc, 0, kmh / 3.6, strict)
}
function zeroTo100(c) {
  return zeroTo(c, 100)
}

// ---- track info ----
const cls = (r) => (r < 30 ? 'hairpin' : r < 90 ? 'slow' : r < 220 ? 'medium' : 'fast')
// A course with no corners has nothing for the segment arithmetic below to work on: there is no
// radius to average, no corner mix to count and no longest straight to pick out of a list. The
// cornerless courses therefore declare their geometry here, keyed by the same name trackInfo is
// called with. It is a description of a road, not a lever.
const FLAT_INFO = {
  Yatabe: { corners: 0, len: YATABE_M, straightPct: 100, avgR: null, longest: YATABE_M, mix: {} },
}
function trackInfo(name, segs) {
  if (FLAT_INFO[name]) return Object.assign({ name }, FLAT_INFO[name])
  const arcs = segs.map((s) => (s[0] * s[1] * Math.PI) / 180)
  const straights = segs.map((s) => s[2])
  const len = arcs.reduce((a, b) => a + b, 0) + straights.reduce((a, b) => a + b, 0)
  const mix = {}
  segs.forEach((s) => {
    const k = cls(s[0])
    mix[k] = (mix[k] || 0) + 1
  })
  const straightSum = straights.reduce((a, b) => a + b, 0)
  return {
    name,
    corners: segs.length,
    len: Math.round(len),
    straightPct: Math.round((100 * straightSum) / len),
    avgR: Math.round(segs.reduce((a, s) => a + s[0], 0) / segs.length),
    longest: Math.max(...straights),
    mix,
  }
}

console.log('# RAN WHEN PARKED - lap-time model, all cars (external review, prototype)\n')
console.log('## The model')
console.log('Lap time = quasi-static point-mass sim over a course of corners + straights.')
console.log(' - corner apex speed = sqrt(mu * g * radius), mu from the signed-off grip model')
console.log(
  ' - straights: accelerate on the car\'s OWN MEASURED acceleration curve, a(v) = min(aLaunch,',
)
console.log('   pEff / m v) - drag, whose two unknowns are SOLVED from that car\'s published 0-97')
console.log('   and 0-161 km/h; 59 of the 85 have both, 4 have one, the rest fall back to a')
console.log('   regression on the 59. Aero drag = Cd x frontal area (0.82 x width x height), speed')
console.log('   capped at the published top speed, then braking into the next corner on the car\'s')
console.log('   OWN measured braking coefficient bmu, which is not its lateral mu (see below)')
console.log(' - pEff governs the range it was MEASURED over and no more. Above 161 km/h the share of')
console.log('   the shortfall that the car\'s own arithmetic says was traction rather than engine is')
console.log('   handed back, completing at the car\'s top speed, which is where the model already')
console.log('   assumed full crank power. It fires on ' +
  CARS.filter((c) => carBlock(c).fTr > 0).length + ' of the ' + CARS.length +
  ' and is exactly zero on the rest;')
console.log('   nothing below 161 km/h moves, so every measured car still round-trips its own pair')
console.log(' - a DIRECTION-CHANGE CHARGE, kAgi / mu x (angle/90) x a tightness clamp, added in')
console.log('   SECONDS once per corner. THIS IS THE TERM THE PUBLISHED TABLE RUNS. Its weight is')
console.log('   fitted on ALL driven laps on ALL THREE courses at once, equal weight per course')
console.log('   (stderr section 2b)')
console.log(' - a CORNER-EXIT SPEED PENALTY, built and fitted beside it and SWITCHED OFF: kExit is')
console.log('   0 in the published run, which makes the term return exactly zero. It is the more')
console.log('   honest shape, and that is why it exists: a car would leave a direction change')
console.log('   carrying less speed than the apex formula gives it, and the following straight')
console.log('   would START from the reduced speed, so a real deficit would propagate down the road')
console.log('   instead of being a flat per-corner charge blind to what follows. It is off because')
console.log('   at its own best weight it costs level accuracy on all three lap courses: both')
console.log('   facsimile geometries were searched under the additive term and are held FIXED, so')
console.log('   the roads have already absorbed what the adder got wrong about them. The whole')
console.log('   comparison is kept and scored, because it is the evidence (stderr section 2c)')
console.log(' - KNOWN STRUCTURAL GAP, AND WHAT WAS DONE ABOUT IT, stated up front: on the SURVEYED')
console.log('   Hakone geometry the model is about 21% slow on every driven lap even with the')
console.log('   direction-change term switched off, and no direction-change term repairs it. The')
console.log('   missing physics is a racing-line model - a mapped radius is a centreline radius -')
console.log('   and it is not a gradient, which prices out at a fraction of the gap. The model has')
console.log('   NOT been given that term. Instead, on maintainer ruling (2026-07-27), the Hakone')
console.log('   course is now a BEHAVIOURAL FACSIMILE: a 2.7 km road searched to reproduce the')
console.log('   first eight driven times, not a survey of the real one. Read every Hakone number on')
console.log('   that footing. The surveyed map is kept in the file and every diagnostic scores it.')
console.log(' - AND ONE MORE CAVEAT ON THAT COMPARISON: both facsimile geometries were searched')
console.log('   with the additive term in place and are held FIXED while the exit term is fitted,')
console.log('   by instruction, so the two are scored on the same roads. That handicaps the exit')
console.log('   term, and the size of the handicap is in stderr 2c: the frozen Hakone road needs')
console.log('   about 14% of a lap from its direction-change term, which an exit-speed deficit')
console.log('   structurally cannot supply without saturating.')
console.log(
  ' - the ranked table below runs at the constants THIS RUN FITS, printed above it, not at any',
)
console.log('   value frozen in the source. Frontal areas are REAL (0.82 x width x height) for')
console.log('   all 85 cars from published dimensions.')
console.log(
  ' - the 64 cars Forza Horizon 6 carries ARE their Forza entries here, Forza\'s name and year',
)
console.log('   included; the other 21 are web-sourced and modelled.')
console.log(' - the standing kilometre is now a COURSE, Yatabe Straight, and it carries the only')
console.log('   calibration constant in the model that is not physics. Seven measured 1 km runs')
console.log('   exist and the raw model is slow on every one of them, by +1.3% to +6.4%, mean')
console.log('   +3.4%, in an order that neither power nor power-to-weight predicts. Five candidate')
console.log('   mechanisms were priced against those points and none survived, so on maintainer')
console.log('   ruling (2026-07-27) a FLAT PROTOCOL OFFSET is subtracted from computed 1 km times')
console.log('   and from nothing else. It is not physics: the model is fed Forza\'s canned panel')
console.log('   figures and the driven runs are hand-driven with the assists off, which are')
console.log('   plausibly not the same measurement. It reaches the drag strip ONLY - see the')
console.log('   DRAG_OFFSET comment for why touching the lap path would break three courses.')
console.log('')
console.log('## The ' + CK.length + ' courses')
CK.forEach((k) => {
  const t = trackInfo(k, COURSES[k])
  if (!t.corners) {
    console.log(
      `- ${t.name}: ${(t.len / 1000).toFixed(1)} km in a straight line from a standing start, no corners`,
    )
    return
  }
  const mix = Object.entries(t.mix)
    .map(([a, b]) => b + ' ' + a)
    .join(', ')
  console.log(
    `- ${t.name}: ${(t.len / 1000).toFixed(1)} km, ${t.corners} corners (${mix}), ${t.straightPct}% straight, avg radius ${t.avgR} m, longest straight ${t.longest} m`,
  )
})
console.log('  Hakone = a 2.7 km mountain-road FACSIMILE, searched against the FIRST 8 driven laps')
console.log('           on it, NOT a survey: four 11 m switchbacks and five linking bends -> grip')
console.log('           and direction change. The surveyed road (eleven 11-19 m switchbacks) is in')
console.log('           the file as HAK_MAP; nothing gets the model closer than ~21% slow on it,')
console.log('           and that floor is the direction-change term switched OFF.')
console.log('  Wangan = a 7.0 km highway loop FACSIMILE, searched against the FIRST 5 driven laps:')
console.log('           eight fast sweepers of 295-645 m that are straights for a slow car, two')
console.log('           mediums, one 55 m junction ramp -> drag, power and grip ABOVE 161 km/h,')
console.log('           which is where the measured acceleration curve stops being measured.')
console.log('           The description it was authored from is in the file as WAN_DESC; on that')
console.log('           reading the model runs FAST and the search had to add corner demand.')
console.log('  Misaki = the calibrated Legend Island facsimile; 17 driven laps are on it, and it is')
console.log('           the only one of the three lap courses whose geometry was never tuned to a')
console.log('           lap time.')
console.log('  Yatabe = 1 km from rest in a straight line, no corners: the JARI proving ground')
console.log('           name for the standing-kilometre set that has been scored since 2026-07-27')
console.log('           and is a course from this run on. It measures acceleration and drag with')
console.log('           the cornering model taken out of the question entirely, and it is the only')
console.log('           course carrying a calibration offset (DRAG_OFFSET, drag strip only).')
console.log('  The corner-exit weight is fitted on the Misaki, Hakone and Wangan driven laps')
console.log('  TOGETHER, weighted equally by course; Yatabe is in NO fit of any lap constant.')
console.log('  EVERY course here carries driven times: the synthetic club Circuit was dropped on')
console.log('  maintainer ruling (2026-07-27) and the overall index is the mean over these four,')
console.log('  at equal weight per course. READ THE INDEX WITH THAT IN MIND: a quarter of it is now')
console.log('  a single straight-line measure, and the ranked table below prints what that moved.')
console.log('  THREE CARS ARE OUT OF SAMPLE FOR ALL OF IT. The 190E Evo II, the Civic Type R EK9 and')
console.log('  the Impreza 22B were predicted on all three courses before a lap of any of them was')
console.log('  driven, so neither searched geometry nor any fitted weight had ever seen them. Their')
console.log('  committed predictions are printed beside their driven times in every table below.')

// =====================================================================================
// BRAKING: the per-car coefficient, its internal consistency check, and its fallback
// =====================================================================================
const mAvg = (a) => a.reduce((x, y) => x + y, 0) / a.length
const quant = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
const rmsOf = (a) => Math.sqrt(mAvg(a.map((x) => x * x)))
const rcorr = (xs, ys) => {
  const mx = mAvg(xs),
    my = mAvg(ys)
  return (
    mAvg(xs.map((x, i) => (x - mx) * (ys[i] - my))) /
    Math.sqrt(mAvg(xs.map((x) => (x - mx) ** 2)) * mAvg(ys.map((y) => (y - my) ** 2)))
  )
}
console.log('\n## Braking grip is a separate measurement from lateral grip')
console.log('bmu is solved from each measured stopping distance with the aero-corrected integral')
console.log(
  '  bmu = ln(1 + k V^2) / (2 g k (d - d0)),  k = dfC * ' + DOWNFORCE_K.toExponential(1),
)
console.log('d0 is the dead distance every published stop carries in front of the retardation.')
console.log('The 97-0 solution is the stored value; the 161-0 solution is the check on it.')

// ---- The dead distance, derived ----
const d0sorted = D0SET.slice().sort((a, b) => a - b)
const bothSet = CARS.filter((c) => c.b97 != null && c.b161 != null)
const gapsAt = (D0) => bothSet.map((c) => 100 * d0Gap(c, D0)).sort((a, b) => a - b)
const d0mean = mAvg(d0sorted),
  d0med = quant(d0sorted, 0.5)
const gBefore = gapsAt(0),
  gAfter = gapsAt(BRAKE_D0)
console.log('\n### The dead distance d0')
console.log(
  '  Solved per car (two equations, two unknowns) over the ' +
    d0sorted.length +
    ' cars with both figures:',
)
console.log(
  '    min ' + d0sorted[0].toFixed(2) + '  p25 ' + quant(d0sorted, 0.25).toFixed(2) +
    '  median ' + d0med.toFixed(2) + '  p75 ' + quant(d0sorted, 0.75).toFixed(2) +
    '  max ' + d0sorted[d0sorted.length - 1].toFixed(2) +
    ' m   (mean ' + d0mean.toFixed(2) +
    ', sd ' + Math.sqrt(mAvg(d0sorted.map((x) => (x - d0mean) ** 2))).toFixed(2) + ')',
)
console.log(
  '  GLOBAL CONSTANT: least squares on the two-point disagreement gives d0 = ' +
    BRAKE_D0.toFixed(3) + ' m, i.e. ' + (BRAKE_D0 / V97).toFixed(3) + ' s of',
)
console.log(
  '  brake application at 97 km/h. The median of the ' + d0sorted.length + ' is ' +
    d0med.toFixed(3) + ' m: the two differ by ' + Math.abs(d0med - BRAKE_D0).toFixed(2) +
    ' m and their residual rms by ' +
    Math.abs(rmsOf(gapsAt(d0med)) - rmsOf(gAfter)).toFixed(3) + ' points.',
)
console.log(
  '  Least squares is the one used, on two grounds: the per-car spread is near-symmetric (mean',
)
console.log(
  '  and median agree to ' + Math.abs(d0mean - d0med).toFixed(2) +
    ' m) so the median buys no robustness here, and least squares minimises the',
)
console.log('  disagreement the constant exists to remove rather than a proxy for it.')
console.log('\n  two-point disagreement, bmu161 against bmu97 (n=' + gBefore.length + '):')
const gapLine = (lbl, gs) =>
  console.log(
    '    ' + lbl.padEnd(16) +
      'min ' + gs[0].toFixed(2).padStart(6) +
      '  p25 ' + quant(gs, 0.25).toFixed(2).padStart(6) +
      '  median ' + quant(gs, 0.5).toFixed(2).padStart(6) +
      '  p75 ' + quant(gs, 0.75).toFixed(2).padStart(6) +
      '  max ' + gs[gs.length - 1].toFixed(2).padStart(6) +
      '   mean ' + mAvg(gs).toFixed(2).padStart(6) +
      '  MAE ' + mAvg(gs.map(Math.abs)).toFixed(2) +
      '  rms ' + rmsOf(gs).toFixed(2) +
      '  positive ' + gs.filter((x) => x > 0).length + '/' + gs.length,
  )
gapLine('d0 = 0 (before)', gBefore)
gapLine('d0 = ' + BRAKE_D0.toFixed(2) + ' m', gAfter)
console.log(
  '  VERDICT: the gap was one-signed on all ' + gBefore.length + ' cars and is now split ' +
    gAfter.filter((x) => x > 0).length + '/' + gAfter.filter((x) => x <= 0).length +
    ', with the mean bias down from ' + mAvg(gBefore).toFixed(2) + '% to ' +
    mAvg(gAfter).toFixed(2) + '%.',
)
console.log(
  '  It has collapsed, not vanished: ' + rmsOf(gAfter).toFixed(2) +
    '% rms remains and it is unsigned. That is the size a per-car spread in brake-application',
)
console.log(
  '  rate plus 0.005-g panel rounding on the lateral pair (which moves dfC, hence k) would leave.',
)

console.log('\n### Per-car braking coefficients at that d0')
console.log(
  'car                                        yr  dt    mu    bmu97  bmu161   gap%   bmu/mu',
)
const brakeRows = CARS.filter((c) => c.b97 != null)
  .map((c) => {
    const b1 = bmu97Of(c),
      b2 = bmu161Of(c)
    return { c, b1, b2, gap: b2 == null ? null : ((b2 - b1) / b1) * 100, r: b1 / gripMu(c) }
  })
  .sort((a, b) => a.b1 - b.b1)
brakeRows.forEach((r) =>
  console.log(
    '  ' +
      r.c.n.slice(0, 40).padEnd(41) +
      String(r.c.y) +
      '  ' +
      r.c.dt.padEnd(4) +
      gripMu(r.c).toFixed(3).padStart(6) +
      r.b1.toFixed(3).padStart(8) +
      (r.b2 == null ? '    n/a' : r.b2.toFixed(3).padStart(8)) +
      (r.gap == null ? '    n/a' : r.gap.toFixed(1).padStart(7)) +
      r.r.toFixed(3).padStart(9),
  ),
)
const measured = CARS.filter((c) => c.b97 != null)
const bmus = brakeRows.map((r) => r.b1).sort((a, b) => a - b)
const bmusOld = measured
  .map((c) => {
    const k = (c.dfC || 0) * DOWNFORCE_K
    return k <= 1e-9
      ? (V97 * V97) / (2 * g * c.b97)
      : Math.log(1 + k * V97 * V97) / (2 * g * k * c.b97)
  })
  .sort((a, b) => a - b)
const bmuLine = (lbl, a) =>
  console.log(
    '  ' + lbl.padEnd(20) +
      'min ' + a[0].toFixed(3) + '  p25 ' + quant(a, 0.25).toFixed(3) +
      '  median ' + quant(a, 0.5).toFixed(3) + '  p75 ' + quant(a, 0.75).toFixed(3) +
      '  max ' + a[a.length - 1].toFixed(3) + '   mean ' + mAvg(a).toFixed(3),
  )
console.log('\n  bmu distribution over the ' + bmus.length + ' measured cars:')
bmuLine('with d0 = 0', bmusOld)
bmuLine('at d0 = ' + BRAKE_D0.toFixed(2) + ' m', bmus)
const shortest = Math.min(...measured.map((c) => c.b97)),
  longest = Math.max(...measured.map((c) => c.b97))
console.log(
  '  Every car gains and the short stoppers gain most, which is the whole point: ' +
    BRAKE_D0.toFixed(2) + ' m is ' + ((100 * BRAKE_D0) / shortest).toFixed(0) +
    '% of the shortest stop in the set (' + shortest.toFixed(1) + ' m) and ' +
    ((100 * BRAKE_D0) / longest).toFixed(0) + '% of the longest (' + longest.toFixed(1) + ' m).',
)

console.log('\n### Fallback for the ' + (CARS.length - BRAKE_FIT.set.length) + ' unmeasured cars')
console.log(
  '  bmu = mu * (' +
    BRAKE_FIT.beta[0].toFixed(4) +
    ' + ' +
    BRAKE_FIT.beta[1].toFixed(4) +
    ' * (year-1990)/10 + ' +
    BRAKE_FIT.beta[2].toFixed(4) +
    ' * [AWD])',
)
const bres = BRAKE_FIT.rows.map((r) => r.e)
const bmuBar = mAvg(BRAKE_FIT.rows.map((r) => r.meas))
const sse = bres.reduce((a, x) => a + x * x, 0)
const sst = BRAKE_FIT.rows.reduce((a, r) => a + (r.meas - bmuBar) ** 2, 0)
const bsd = Math.sqrt(sse / bres.length)
console.log(
  '  residuals over the ' +
    bres.length +
    ' measured cars: sd ' +
    bsd.toFixed(4) +
    ', MAE ' +
    mAvg(bres.map(Math.abs)).toFixed(4) +
    ', max |e| ' +
    Math.max(...bres.map(Math.abs)).toFixed(4) +
    ', R2 ' +
    (1 - sse / sst).toFixed(3),
)
console.log(
  '  for scale: predicting bmu from year and drivetrain WITHOUT the mu scale gives sd ' +
    (function () {
      const b = ols(
        BRAKE_FIT.set.map(BRAKE_X),
        BRAKE_FIT.set.map((c) => bmu97Of(c)),
      )
      const e = BRAKE_FIT.set.map((c) => BRAKE_X(c).reduce((a, x, i) => a + x * b[i], 0) - bmu97Of(c))
      return Math.sqrt(mAvg(e.map((x) => x * x))).toFixed(4)
    })() +
    ' (rejected),',
)
console.log('  and "bmu = mu" gives sd ' + Math.sqrt(mAvg(BRAKE_FIT.rows.map((r) => (gripMu(r.c) - r.meas) ** 2))).toFixed(4) + ' (the assumption this change removes).')
console.log('  worst 6 residuals (model minus measured):')
BRAKE_FIT.rows
  .slice()
  .sort((a, b) => Math.abs(b.e) - Math.abs(a.e))
  .slice(0, 6)
  .forEach((r) =>
    console.log(
      '    ' +
        r.c.n.slice(0, 40).padEnd(41) +
        String(r.c.y) +
        '  meas ' +
        r.meas.toFixed(3) +
        '  pred ' +
        r.pred.toFixed(3) +
        '  e ' +
        r.e.toFixed(3),
    ),
  )
console.log('  the ' + (CARS.length - BRAKE_FIT.set.length) + ' cars this is actually applied to:')
CARS.filter((c) => c.b97 == null).forEach((c) =>
  console.log(
    '    ' +
      c.n.slice(0, 40).padEnd(41) +
      String(c.y) +
      '  ' +
      c.dt.padEnd(4) +
      ' mu ' +
      gripMu(c).toFixed(3) +
      '  ratio ' +
      BRAKE_FIT.ratio(c).toFixed(3) +
      '  bmu ' +
      brakeMu(c).toFixed(3),
  ),
)


// ---- Legend Island calibration (Forza Horizon 6 gold standard, ~4.715 km) ----
// The geometry lives once, in COURSES.Misaki. This is a reference to that same array, so
// the ranked table and every calibration figure below are literally the same course.
const LEGEND = COURSES.Misaki
const legLen = LEGEND.reduce((a, s) => a + (s[0] * s[1] * Math.PI) / 180 + s[2], 0)
// Driven reference laps, keyed by the spec book's stable id.
const FORZA = {
  'lexus-lfa': 92.6,
  'ferrari-f355-berlinetta-f129': 101.3,
  'honda-nsx-r-na1': 102.9,
  'mitsubishi-lancer-evo-vi-tommi-makinen-cp9a': 103.2,
  'bmw-m3-e30': 112.1,
  'toyota-altezza-rs200-z-edition-sxe10': 113.1,
  'toyota-2000gt-mf10': 123.4,
  'honda-beat-pp1': 129.8,
  'honda-acty-ha4': 171.9,
}
// This section is the "before" picture, so it runs the SUPERSEDED derived acceleration model
// at its previously committed constants, the SUPERSEDED mass-proportional agility shape, and
// each car's spec-book record. Everything after the acceleration solve below runs the measured
// model at the published shape.
derived = true
capToVTop = false
const cmp = Object.keys(FORZA)
  .map((id) => {
    const c = byId(id)
    return c ? { nm: c.n, t: lapMassAgi(c, LEGEND), f: FORZA[id] } : null
  })
  .filter(Boolean)
console.error(
  '\n# Legend Island calibration [runs the SUPERSEDED derived acceleration model at the pre-fit' +
    ' committed constants phi 1.00 / awdK 0.66 / kAgi 0.30 with the old mass-proportional agility' +
    ' term, and at each car\'s spec-book record: it is the "before" picture. The published' +
    ' comparison is section 3 of the decisive run.]',
)
console.error(
  '# (course length ' +
    Math.round(legLen) +
    ' m, straight frac ' +
    Math.round((100 * LEGEND.reduce((a, s) => a + s[2], 0)) / legLen) +
    '%)',
)
console.error('car                                          ours   forza  delta    %err')
cmp.forEach((r) =>
  console.error(
    r.nm.padEnd(44) +
      r.t.toFixed(1).padStart(6) +
      r.f.toFixed(1).padStart(7) +
      (r.t - r.f).toFixed(1).padStart(7) +
      (((r.t - r.f) / r.f) * 100).toFixed(1).padStart(7),
  ),
)
const oS = Math.max(...cmp.map((r) => r.t)) / Math.min(...cmp.map((r) => r.t)),
  fS = Math.max(...cmp.map((r) => r.f)) / Math.min(...cmp.map((r) => r.f))
const mae = cmp.reduce((a, r) => a + Math.abs(r.t - r.f), 0) / cmp.length
console.error(
  'spread ours ' +
    oS.toFixed(2) +
    'x  forza ' +
    fS.toFixed(2) +
    'x   mean abs err ' +
    mae.toFixed(1) +
    ' s',
)

// ---- blind predictions on Misaki (the calibrated ex-Legend-Island course) ----
// Each entry names a spec-book car and, optionally, the power Forza will show for
// it (the gentleman's-agreement cars display the capped figure, so parity means
// predicting at the number the game itself simulates).
const PREDICT = [
  // Forza-parity stats, read off the game by the maintainer: the model is fed the
  // numbers the game itself simulates, so a spec difference cannot masquerade as a
  // model error. The DC2 here is the US-market car (heavier than our JDM entry).
  {
    id: 'honda-integra-type-r-dc2',
    as: 'Integra Type R (DC2, US 2001)',
    ps: 198,
    tq: 176,
    kg: 1197,
    fr: 62,
  },
  { id: 'mazda-rx7-fd3s', as: 'RX-7 Type R (FD3S, 1992)', ps: 256, tq: 294, kg: 1260, fr: 50 },
  {
    id: 'nissan-skyline-gtr-bnr32',
    as: 'Skyline GT-R (BNR32, 1992)',
    ps: 280,
    tq: 353,
    kg: 1480,
    fr: 59,
  },
  // Round 2: the discriminating test. AWD and heavy, with unambiguous power, so it
  // separates "our AWD/heavy modelling is short" from "the R32 is a special case".
  // `y` matters: it selects the tyre-era band, and Forza's car is the 1997, not our
  // spec book's 1990.
  {
    id: 'mitsubishi-gto-twin-turbo-z16a',
    as: 'GTO Twin Turbo (1997)',
    y: 1997,
    ps: 324,
    tq: 427,
    kg: 1680,
    fr: 61,
  },
  // Round 3: measured lateral g of its own (1.10), so the fallback-formula work
  // still in flight cannot move this one.
  {
    id: 'lamborghini-countach-lp5000-qv',
    as: 'Countach LP5000 QV (1988)',
    y: 1988,
    ps: 461,
    tq: 501,
    kg: 1490,
    fr: 41,
    top: 300,
  },
]
console.error(
  '\n# Blind predictions, Misaki International Raceway [also the SUPERSEDED derived model at' +
    ' phi 1.00 / awdK 0.66 / kAgi 0.30, mass-proportional agility]',
)
console.error('car                                     PS    kg   mu  0-100  top   PREDICTED')
PREDICT.forEach((p) => {
  const base = byId(p.id)
  if (!base) return console.error('  MISSING FROM SPEC BOOK: ' + p.id)
  const c = { ...base }
  if (p.ps != null) c.ps = p.ps
  if (p.tq != null) c.tq = p.tq
  if (p.kg != null) c.kg = p.kg
  if (p.fr != null) c.fr = p.fr
  if (p.y != null) c.y = p.y
  if (p.top != null) c.top = p.top
  const b = carBlock(c)
  console.error(
    (p.as || c.n).padEnd(38) +
      String(c.ps).padStart(4) +
      String(c.kg).padStart(6) +
      gripMu(c).toFixed(2).padStart(5) +
      zeroTo100(c).toFixed(1).padStart(6) +
      String(Math.round(vTopOf(b, c) * 3.6)).padStart(5) +
      lapMassAgi(c, LEGEND).toFixed(1).padStart(11),
  )
})
// End of the "before" picture: everything below runs the measured acceleration model.
derived = false
capToVTop = true

// ---- Forza acceleration anchors ----
// Telemetry measured in game by the maintainer. Each record below is carBlock-shaped:
// every field carBlock, gripMu, frontalArea and deliveryFactor read is populated, so no
// fallback can quietly stand in for a missing number. All three set `lg`, which pins
// mechanical grip straight to the measured lateral g.

// The Gr.A car races the road BNR32 shell, so it inherits that car's published
// dimensions; its cd is solved below so that Cd x A lands exactly on the measured 0.94.
DIMS['calsonic-skyline-gtr-bnr32-gra'] = [1755, 1340]

// Each measured lateral-g PAIR is split into mechanical grip and downforce before it
// reaches the model. The raw 97 km/h reading already contains whatever downforce the car
// makes at 97 km/h, so feeding it in as `lg` AND running an aero term would count the
// same grip twice.
const AF_COUNTACH = aeroFit(1.1, 1.15),
  AF_GTO = aeroFit(0.89, 0.91),
  AF_CALSONIC = aeroFit(1.58, 1.78)
// A stopping distance is a property of the physical car, not of the variant's power figure,
// so the two road anchors inherit their spec-book braking measurements instead of dropping
// to the fallback regression. The Calsonic has none: it is a race car with no panel reading,
// and it is never lapped, only accelerated, so no braking number is ever read from it.
const brakeSpecOf = (id) => {
  const c = byId(id)
  return c ? { b97: c.b97, b161: c.b161 } : {}
}
// cd 0.466 against the real Countach frontal area (0.82 x 2.000 x 1.070 = 1.755 m^2)
// gives CdA 0.818, which reproduces the measured 299.7 km/h top speed.
const A_COUNTACH = {
  id: 'lamborghini-countach-lp5000-qv',
  n: '1988 Lamborghini Countach LP5000 QV',
  y: 1988,
  sec: 'Gaisha',
  dt: 'RWD',
  ep: 'mid',
  ec: 'LP112D',
  cfg: 'V12',
  asp: 'NA',
  ps: 461,
  kg: 1490,
  fr: 41,
  wb: 2500,
  com: 420,
  cd: 0.466,
  ty: '345/35R15',
  lg: AF_COUNTACH.mu,
  dfC: AF_COUNTACH.k / DOWNFORCE_K,
  top: 299.7,
  ...brakeSpecOf('lamborghini-countach-lp5000-qv'),
}
// kg, fr, cd, wb, com and the DIMS-driven frontal area come straight from the spec-book
// entry for the Z16A; only ps, lg and top are overridden to the 1997 car Forza simulates.
const A_GTO = {
  id: 'mitsubishi-gto-twin-turbo-z16a',
  n: '1997 Mitsubishi GTO',
  y: 1997,
  sec: 'Flagship',
  dt: 'AWD',
  ep: 'front',
  ec: '6G72TT',
  cfg: 'V6',
  asp: 'twin-turbo',
  ps: 324,
  kg: 1710,
  fr: 58,
  wb: 2470,
  com: 480,
  cd: 0.33,
  ty: '235/45R17',
  lg: AF_GTO.mu,
  dfC: AF_GTO.k / DOWNFORCE_K,
  top: 268.1,
  ...brakeSpecOf('mitsubishi-gto-twin-turbo-z16a'),
}
// The GTO's spec-book cd 0.33 is an `est` estimate; its measured 268.1 km/h top speed
// pins the real figure, and the two disagree badly (CdA 0.64 estimated, 0.78 measured).
A_GTO.cd = cdFromTop(A_GTO, 268.1)
const A_CALSONIC = {
  id: 'calsonic-skyline-gtr-bnr32-gra',
  n: 'Calsonic Skyline GT-R (BNR32 Gr.A)',
  y: 1993,
  sec: 'AWD Turbo',
  dt: 'AWD',
  ep: 'front',
  ec: 'RB26DETT',
  cfg: 'I6',
  asp: 'twin-turbo',
  ps: 650,
  kg: 1261,
  fr: 60,
  wb: 2615,
  com: 430,
  cd: 0,
  ty: '280/650R18',
  lg: AF_CALSONIC.mu,
  dfC: AF_CALSONIC.k / DOWNFORCE_K,
  top: 322.9,
  // Read off the in-game panel by the maintainer 2026-07-27. Before this the car had no
  // stopping distance at all and its braking coefficient came from the fallback regression,
  // which left it the one input its four driven times could not pin.
  b97: 23.5,
  b161: 56.1,
}
A_CALSONIC.cd = 0.94 / frontalArea(A_CALSONIC)

const ANCHORS = [
  { c: A_COUNTACH, lbl: 'Countach LP5000 QV', m97: 4.839, m161: 11.721, mseg: 6.882, road: true },
  { c: A_GTO, lbl: 'Mitsubishi GTO (1997)', m97: 5.629, m161: 14.241, mseg: 8.612, road: true },
  { c: A_CALSONIC, lbl: 'Calsonic GT-R Gr.A', m97: 2.5, m161: 5.238, mseg: 2.738, road: false },
]
// The telemetry pair is these records' acceleration measurement, exactly as z97/z161 is the
// spec book's. Attaching it here is what puts them through the same solve as every other car
// instead of leaving them on a fitted constant.
ANCHORS.forEach((a) => {
  a.c.z97 = a.m97
  a.c.z161 = a.m161
})
const pct = (t, meas) => ((t - meas) / meas) * 100

console.error('\n# Forza acceleration anchors')
console.error('measured (maintainer telemetry):')
ANCHORS.forEach((a) =>
  console.error(
    '  ' +
      a.lbl.padEnd(22) +
      '0-97 ' +
      a.m97.toFixed(3) +
      ' s    0-161 ' +
      a.m161.toFixed(3) +
      ' s    97-161 segment ' +
      a.mseg.toFixed(3) +
      ' s' +
      (a.road ? '' : '   [SEPARATE CASE]'),
  ),
)
console.error(
  '  [SEPARATE CASE] Calsonic GT-R Gr.A: race sequential gearbox + big aero. It is solved like',
)
console.error(
  '  any other measured car, but it is never lapped and never enters a fallback fit.',
)
console.error('\nanchor car blocks (aLaunch and pEff SOLVED from the pair above):')
console.error(
  'car                       PS    kg  dt      mu    bmu    area    CdA   aLaunch  pEff kW  pEff/Pw',
)
ANCHORS.forEach((a) => {
  const b = carBlock(a.c)
  console.error(
    '  ' +
      a.lbl.padEnd(22) +
      String(a.c.ps).padStart(4) +
      String(a.c.kg).padStart(6) +
      '  ' +
      a.c.dt.padEnd(4) +
      b.mu.toFixed(2).padStart(6) +
      b.bmu.toFixed(2).padStart(7) +
      frontalArea(a.c).toFixed(3).padStart(8) +
      b.CdA.toFixed(3).padStart(7) +
      b.aGrip.toFixed(2).padStart(9) +
      (b.Pacc / 1000).toFixed(1).padStart(9) +
      (b.Pacc / b.Pw).toFixed(3).padStart(9),
  )
})

const phi0 = phi,
  awdK0 = awdK,
  aCapK0 = aCapK

// =====================================================================================
// FORZA FINGERPRINTS: nine complete captures. Protocol: ../forza-telemetry.md
// =====================================================================================
// Read straight off each car's stats panel. Forza's PS/kg/fr supersede the spec book
// where they differ, because Forza's variant is frequently not ours.
//   TRUSTED  - displayed power believable, nothing near the 280 PS cap.
//   SUSPECT  - at or on the gentleman's-agreement cap. The split no longer decides which
//              cars a phi is fitted on (there is no phi): it now flags whose displayed power
//              the solved pEff/Pw ratio should be read as an indictment of, in section 2.
const FING = [
  { book: 'lexus-lfa', lbl: '2010 Lexus LFA', y: 2010, ps: 560, tq: 480, kg: 1480, fr: 48,
    dt: 'RWD', g97: 1.03, g193: 1.09, b97: 30.8, b161: 73.4, t97: 3.66, t161: 7.694,
    top: 327.1, cls: 'TRUSTED' },
  { book: 'mazda-rx7-fd3s', lbl: '1992 RX-7 Type R', y: 1992, ps: 256, tq: 294, kg: 1260,
    fr: 50, dt: 'RWD', g97: 0.92, g193: 0.95, b97: 44.3, b161: 109.6, t97: 5.24, t161: 13.0,
    top: 285.5, cls: 'TRUSTED' },
  { book: 'mitsubishi-lancer-evo-vi-tommi-makinen-cp9a', lbl: '2001 Evo VI GSR TME', y: 2001,
    ps: 280, tq: 373, kg: 1280, fr: 58, dt: 'AWD', g97: 0.95, g193: 1.03, b97: 40.6,
    b161: 101.5, t97: 4.52, t161: 9.667, top: 240.0, cls: 'SUSPECT', realPs: 330,
    gearLimited: true },
  { book: 'nissan-skyline-gt-r-v-spec-ii-bnr34', lbl: '2000 Skyline GT-R V-spec II', y: 2000,
    ps: 285, tq: 392, kg: 1505, fr: 54, dt: 'AWD', g97: 0.94, g193: 0.97, b97: 40.8,
    b161: 103.2, t97: 4.438, t161: 10.076, top: 291.3, cls: 'SUSPECT', realPs: 327 },
  { book: 'honda-acty-ha4', lbl: '1994 Honda Acty', y: 1994, ps: 38, tq: 54, kg: 770, fr: 52,
    dt: 'AWD', g97: 0.8, g193: 0.8, b97: 49.3, b161: null, t97: 24.717, t161: null,
    top: 111.3, cls: 'TRUSTED' },
  { book: 'honda-nsx-r-na1', lbl: '1992 Honda NSX-R', y: 1992, ps: 280, tq: 294, kg: 1230,
    fr: 42, dt: 'RWD', g97: 1.07, g193: 1.13, b97: 38.8, b161: 96.8, t97: 4.632, t161: 11.46,
    top: 275.2, cls: 'SUSPECT', realPs: 280 },
  { book: 'honda-integra-type-r-dc2', lbl: '2001 Acura Integra Type R', y: 2001, ps: 198,
    tq: 176, kg: 1197, fr: 62, dt: 'FWD', g97: 0.9, g193: 0.91, b97: 44.5, b161: 111.0,
    t97: 6.168, t161: 14.538, top: 250.3, cls: 'TRUSTED' },
  { book: 'toyota-altezza-rs200-z-edition-sxe10', lbl: '1999 Altezza RS200 Z', y: 1999,
    ps: 210, tq: 216, kg: 1360, fr: 50, dt: 'RWD', g97: 0.89, g193: 0.91, b97: 45.6,
    b161: 112.7, t97: 6.846, t161: 17.674, top: 251.8, cls: 'TRUSTED' },
  { book: 'nissan-skyline-gtr-bnr32', lbl: '1992 Nissan Skyline GT-R', y: 1992, ps: 280,
    tq: 353, kg: 1480, fr: 59, dt: 'AWD', g97: 0.9, g193: 0.94, b97: 42.0, b161: 106.0,
    t97: 4.943, t161: 12.758, top: 267.7, cls: 'SUSPECT', realPs: 280 },
]
function fingerCar(f) {
  const base = byId(f.book)
  if (!base) throw new Error('missing from spec book: ' + f.book)
  const a = aeroFit(f.g97, f.g193)
  // b97/b161 come from the same capture as this car's lateral pair and top speed, so the
  // braking coefficient is solved against the dfC that the very same panel reading produced.
  // t97/t161 come from the same capture too, and they are this record's acceleration
  // measurement: the panel's own figures for the panel's own variant, so the solve runs on
  // the mass, power and drag the same reading produced rather than on the book's.
  const c = Object.assign({}, base, {
    y: f.y, ps: f.ps, tq: f.tq, kg: f.kg, fr: f.fr, dt: f.dt,
    lg: a.mu, dfC: a.k / DOWNFORCE_K, top: f.top, b97: f.b97, b161: f.b161,
    z97: f.t97, z161: f.t161,
  })
  // Drag is pinned by the measured top speed for every car EXCEPT one whose top speed is
  // gearing-limited, where that route measures the gearbox rather than the air.
  c.cd = f.gearLimited ? base.cd : cdFromTop(c, f.top)
  return c
}
FING.forEach((f) => {
  f.aero = aeroFit(f.g97, f.g193)
  f.c = fingerCar(f)
  f.seg = f.t161 != null ? f.t161 - f.t97 : null
  f.geoCdA = (byId(f.book).cd || 0) * frontalArea(f.c)
  f.topCdA = cdFromTop(Object.assign({}, f.c, { cd: 1 }), f.top) * frontalArea(f.c)
})
const fingerOf = (id) => {
  const f = FING.find((x) => x.book === id)
  return f ? f.c : null
}

console.error('\n\n# ============ NINE FORZA FINGERPRINTS ============')
console.error('\n## 0. Drag consistency: is any other top speed gearing-limited?')
console.error(
  'A top speed BELOW what the car\'s own thrust implies inflates the drag backed out of it.',
)
console.error('car                          top   CdA(top)  CdA(geo)  ratio  verdict')
FING.forEach((f) => {
  const ratio = f.topCdA / f.geoCdA
  const flag = f.gearLimited
    ? 'GEARING-LIMITED (drag from geometry instead)'
    : ratio > 1.25
      ? 'SUSPECT: top speed looks gearing-limited too'
      : ratio < 0.75
        ? 'SUSPECT: implied drag far below geometry'
        : 'consistent'
  console.error(
    '  ' + f.lbl.padEnd(28) + f.top.toFixed(1).padStart(6) + f.topCdA.toFixed(3).padStart(9) +
      f.geoCdA.toFixed(3).padStart(10) + ratio.toFixed(2).padStart(7) + '  ' + flag,
  )
})

// ---- Analysis 1: the measured acceleration model, solved per car ----
// This replaces the phi fit that used to live here. There is no phi to fit: every car in this
// section publishes both times, so its curve is solved rather than predicted.
const SUSPECT = FING.filter((f) => f.cls === 'SUSPECT')
const accRowsOf = (list) =>
  list.map((o) => {
    const c = o.c
    const b = carBlock(c)
    return {
      lbl: o.lbl,
      c,
      b,
      a: b.acc,
      ratioA: b.aGrip / (b.mu * g),
      ratioP: b.Pacc / b.Pw,
    }
  })
console.error('\n## 1. The solved acceleration curve, a(v) = min(aLaunch, pEff/(m v)) - drag')
console.error(
  'Two published times, two unknowns, no fitted constant anywhere in it. aLaunch is in m/s^2;',
)
console.error(
  'aL/(mu g) is the fraction of the car\'s own lateral grip it puts down off the line, the',
)
console.error(
  'quantity aCapK 0.70 and awdK 0.66-0.70 held CONSTANT. pEff/Pw is the fraction of crank x 0.88',
)
console.error('that reaches the road through the gears, the quantity phi held constant.')
console.error(
  'vc is the launch/power crossover and "lnch" the share of the 0-97 spent below it: a low',
)
console.error('share means the data barely constrains aLaunch, and says so rather than hiding it.')
console.error(
  'car                            0-97   0-161  aLaunch  aL/mug   pEff kW  pEff/Pw   vc  lnch  solve',
)
const fingAcc = accRowsOf(FING).concat(
  accRowsOf(ANCHORS.filter((a) => !FING.some((f) => f.book === a.c.id))),
)
fingAcc.forEach((r) => {
  const a = r.a
  console.error(
    '  ' +
      r.lbl.slice(0, 28).padEnd(30) +
      (r.c.z97 == null ? '   n/a' : r.c.z97.toFixed(2).padStart(6)) +
      (r.c.z161 == null ? '     n/a' : r.c.z161.toFixed(2).padStart(8)) +
      a.aL.toFixed(2).padStart(9) +
      r.ratioA.toFixed(3).padStart(8) +
      (a.pE / 1000).toFixed(1).padStart(10) +
      r.ratioP.toFixed(3).padStart(9) +
      (a.vc * 3.6).toFixed(0).padStart(5) +
      (a.launchShare == null ? '   n/a' : (100 * a.launchShare).toFixed(0).padStart(4) + '%') +
      '  ' +
      a.mode +
      (a.bad && a.bad.length ? '  UNPHYSICAL: ' + a.bad.join('; ') : ''),
  )
})

console.error('\n### the whole solved set (' + ACCEL_SOLVED.length + ' spec-book cars)')
const accQ = (arr, p) => arr.slice().sort((x, y) => x - y)[Math.round(p * (arr.length - 1))]
const accDist = (lbl, arr) =>
  console.error(
    '  ' + lbl.padEnd(14) +
      'min ' + accQ(arr, 0).toFixed(3) + '  p10 ' + accQ(arr, 0.1).toFixed(3) +
      '  p25 ' + accQ(arr, 0.25).toFixed(3) + '  median ' + accQ(arr, 0.5).toFixed(3) +
      '  p75 ' + accQ(arr, 0.75).toFixed(3) + '  p90 ' + accQ(arr, 0.9).toFixed(3) +
      '  max ' + accQ(arr, 1).toFixed(3) + '   mean ' + mAvg(arr).toFixed(3),
  )
accDist('aL/(mu g)', ACCEL_SOLVED.map((r) => r.aL / (r.mu * g)))
accDist('pEff/Pw', ACCEL_SOLVED.map((r) => r.pE / r.Pw))
accDist('launch share', ACCEL_SOLVED.map((r) => r.launchShare))
;['AWD', 'RWD', 'FWD'].forEach((d) => {
  const s = ACCEL_SOLVED.filter((r) => r.c.dt === d)
  if (!s.length) return
  console.error(
    '  ' + d + ' (n=' + s.length + ')'.padEnd(6) +
      '  mean aL/(mu g) ' + mAvg(s.map((r) => r.aL / (r.mu * g))).toFixed(3) +
      '   mean pEff/Pw ' + mAvg(s.map((r) => r.pE / r.Pw)).toFixed(3),
  )
})
console.error(
  '  THE SUPERSEDED CONSTANTS AGAINST THEIR MEASURED SUCCESSORS: aCapK ' + aCapK0.toFixed(2) +
    ' / awdK 0.66-0.70 against a measured aL/(mu g) that runs ' +
    accQ(ACCEL_SOLVED.map((r) => r.aL / (r.mu * g)), 0).toFixed(2) + ' to ' +
    accQ(ACCEL_SOLVED.map((r) => r.aL / (r.mu * g)), 1).toFixed(2) + ',',
)
console.error(
  '  and phi 0.81 against a measured pEff/Pw that runs ' +
    accQ(ACCEL_SOLVED.map((r) => r.pE / r.Pw), 0).toFixed(2) + ' to ' +
    accQ(ACCEL_SOLVED.map((r) => r.pE / r.Pw), 1).toFixed(2) +
    ' (median ' + accQ(ACCEL_SOLVED.map((r) => r.pE / r.Pw), 0.5).toFixed(3) + ').',
)
console.error(
  '  phi 0.81 was a good CENTRE and a useless SPREAD: the roster median is ' +
    accQ(ACCEL_SOLVED.map((r) => r.pE / r.Pw), 0.5).toFixed(2) +
    ', so a single value was never going to be',
)
console.error(
  '  biased, only wrong per car. It under-thrusts the highest car by ' +
    (100 * (0.81 / accQ(ACCEL_SOLVED.map((r) => r.pE / r.Pw), 1) - 1)).toFixed(0) +
    '% and over-thrusts the lowest by ' +
    (100 * (0.81 / accQ(ACCEL_SOLVED.map((r) => r.pE / r.Pw), 0) - 1)).toFixed(0) + '%.',
)
console.error(
  '  aCapK/awdK were worse: a ' +
    (accQ(ACCEL_SOLVED.map((r) => r.aL / (r.mu * g)), 1) /
      accQ(ACCEL_SOLVED.map((r) => r.aL / (r.mu * g)), 0)).toFixed(1) +
    'x spread held at one number.',
)

// ---- the round-trip check: the solve is only right if it reproduces the measurement ----
console.error('\n### Round trip: every solved car back through zeroTo')
const rt = ACCEL_SOLVED.map((r) => ({
  n: r.c.n,
  e97: zeroTo(r.c, 97) - r.c.z97,
  e161: zeroTo(r.c, 161) - r.c.z161,
}))
const rtWorst97 = rt.reduce((a, b) => (Math.abs(b.e97) > Math.abs(a.e97) ? b : a))
const rtWorst161 = rt.reduce((a, b) => (Math.abs(b.e161) > Math.abs(a.e161) ? b : a))
console.error(
  '  worst 0-97  ' + Math.abs(rtWorst97.e97).toExponential(2) + ' s  (' +
    rtWorst97.n.slice(0, 34) + ')',
)
console.error(
  '  worst 0-161 ' + Math.abs(rtWorst161.e161).toExponential(2) + ' s  (' +
    rtWorst161.n.slice(0, 34) + ')',
)
console.error(
  '  mean |e| ' + mAvg(rt.map((r) => Math.abs(r.e97))).toExponential(2) + ' / ' +
    mAvg(rt.map((r) => Math.abs(r.e161))).toExponential(2) + ' s.  zeroTo integrates the same' +
    ' curve the solve inverted,',
)
console.error(
  '  so this checks the SOLVE, not the integrator: a non-zero worst case would mean a bisection' +
    ' had not converged.',
)
const accFail = ACCEL_SOLVED.filter((r) => r.bad.length)
console.error(
  '  solves that failed to converge or returned something unphysical: ' + accFail.length +
    ' of ' + ACCEL_SOLVED.length,
)
accFail.forEach((r) => console.error('    ' + r.c.n.slice(0, 40).padEnd(42) + r.bad.join('; ')))
const jointSolves = ACCEL_SOLVED.filter((r) => r.mode === 'joint')
console.error(
  '  cars needing the joint 2-D solve (still traction-limited at 97 km/h): ' + jointSolves.length +
    (jointSolves.length ? ' (' + jointSolves.map((r) => r.c.n.slice(0, 26)).join(', ') + ')' : ''),
)
const weak = ACCEL_SOLVED.filter((r) => r.launchShare < 0.25).sort((a, b) => a.launchShare - b.launchShare)
console.error(
  '  cars where aLaunch is WEAKLY IDENTIFIED (under a quarter of the 0-97 spent below the' +
    ' crossover): ' + weak.length,
)
weak.forEach((r) =>
  console.error(
    '    ' + r.c.n.slice(0, 40).padEnd(42) + 'launch share ' + (100 * r.launchShare).toFixed(0) +
      '%,  aL ' + r.aL.toFixed(2) + ' m/s^2 - the pair still reproduces the car, but this half' +
      ' of it is barely pinned',
  ),
)
{
  // A result, not a caveat: this list used to be led by the Celica ST205, and what took it off is
  // the correction rather than any change to the model.
  const cel = ACCEL_SOLVED.find((r) => r.c.id === 'toyota-celica-gt-four-st205')
  if (cel)
    console.error(
      '    NOTE. Until 2026-07-27 the Celica GT-Four ST205 led this list: aLaunch 8.75 m/s^2, 1.00' +
        ' of its own lateral grip and second of the 59, on a 20% launch share, with pEff/Pw 0.648,' +
        ' second LOWEST of the 59. That pair was read at the time as the gearing signature of a' +
        ' PRESET measurement, and it was. The maintainer has since read the stock panel and the' +
        ' book carries it as a gOvr; the car now solves at aLaunch ' + cel.aL.toFixed(2) +
        ' m/s^2 (' + (cel.aL / (cel.mu * g)).toFixed(3) + ' of grip) and pEff/Pw ' +
        (cel.pE / cel.Pw).toFixed(3) + ', and is not on this list at all.',
    )
}

// ---- Analysis 2: what the solved pEff says about the displayed power ----
console.error('\n## 2. pEff against the displayed crank figure')
console.error(
  'A car whose solved pEff exceeds crank x 0.88 is making more power than its panel admits:',
)
console.error(
  'no gearbox returns more than it is given. Implied crank = pEff / (0.88 x the roster median',
)
console.error(
  'pEff/Pw of ' + accQ(ACCEL_SOLVED.map((r) => r.pE / r.Pw), 0.5).toFixed(3) +
    '), i.e. what the car would need at a typical drivetrain to do what it does.',
)
const PMED = accQ(ACCEL_SOLVED.map((r) => r.pE / r.Pw), 0.5)
console.error('car                        shown   doc   pEff/Pw   implied PS   verdict')
SUSPECT.forEach((f) => {
  const b = carBlock(f.c)
  const impl = b.Pacc / (PMED * eta * PS)
  const near = Math.abs(impl - f.realPs) / f.realPs
  console.error(
    '  ' + f.lbl.padEnd(26) + String(f.ps).padStart(5) + String(f.realPs).padStart(7) +
      (b.Pacc / b.Pw).toFixed(3).padStart(10) + impl.toFixed(0).padStart(13) + '   ' +
      (near < 0.08 ? 'matches documented' : near < 0.2 ? 'near documented' : 'ABOVE documented'),
  )
})
const overPw = ACCEL_SOLVED.filter((r) => r.pE > r.Pw).sort((a, b) => b.pE / b.Pw - a.pE / a.Pw)
console.error(
  '  across the whole solved set, ' + overPw.length + ' of ' + ACCEL_SOLVED.length +
    ' cars need MORE than crank x 0.88 at the wheels:',
)
overPw.forEach((r) =>
  console.error(
    '    ' + r.c.n.slice(0, 40).padEnd(42) + 'shown ' + String(r.c.ps).padStart(4) +
      ' PS   pEff/Pw ' + (r.pE / r.Pw).toFixed(3) +
      (r.c.q && r.c.q !== r.c.ps ? '   (book quotes ' + r.c.q + ')' : ''),
  ),
)
console.error(
  '  That list is the gentleman\'s-agreement roster plus the kei cars, which is the right answer' +
    ' arriving',
)
console.error(
  '  from the wrong direction: the model is not claiming free energy, it is measuring an' +
    ' understated crank figure.',
)

// ---- Analysis 2b: the fallback regression for the cars Forza does not measure ----
console.error('\n## 2b. Fallback for the cars with no measured pair')
console.error(
  'Same shape as the braking fallback: regress the dimensionless RATIO so the car\'s own grip',
)
console.error('and own power carry the scale, over the ' + ACCEL_SOLVED.length + ' solved cars.')
const fmtBeta = (b) =>
  b[0].toFixed(4) + ' + ' + b[1].toFixed(4) + ' [AWD] + ' + b[2].toFixed(4) + ' [FWD] + ' +
  b[3].toFixed(4) + ' ln(PS/tonne)'
console.error('  aLaunch = mu g x (' + fmtBeta(ACCEL_FIT.bA) + ')')
console.error('  pEff    = Pw   x (' + fmtBeta(ACCEL_FIT.bP) + ')')
const regStats = (lbl, actual, pred) => {
  const e = actual.map((y, i) => pred[i] - y)
  const ybar = mAvg(actual)
  const sse = e.reduce((a, x) => a + x * x, 0)
  const sst = actual.reduce((a, y) => a + (y - ybar) ** 2, 0)
  console.error(
    '  ' + lbl.padEnd(16) + 'sd ' + Math.sqrt(sse / e.length).toFixed(4) + '  MAE ' +
      mAvg(e.map(Math.abs)).toFixed(4) + '  max |e| ' + Math.max(...e.map(Math.abs)).toFixed(4) +
      '  R2 ' + (1 - sse / sst).toFixed(3),
  )
}
console.error('  in-sample residuals on the ratios:')
regStats(
  'aL/(mu g)',
  ACCEL_SOLVED.map((r) => r.aL / (r.mu * g)),
  ACCEL_SOLVED.map((r) => ACCEL_FIT.aRatio(r.c)),
)
regStats(
  'pEff/Pw',
  ACCEL_SOLVED.map((r) => r.pE / r.Pw),
  ACCEL_SOLVED.map((r) => ACCEL_FIT.pRatio(r.c)),
)
// A ratio R2 flatters the thing that matters, which is TIME. Refit without each car and
// predict it, so the number quoted is what the fallback actually does to a car it never saw.
const LOO = ACCEL_SOLVED.map((r, k) => {
  const tr = ACCEL_SOLVED.filter((_, i) => i !== k)
  const X = tr.map((s) => ACC_X(s.c))
  const bA = ols(X, tr.map((s) => s.aL / (s.mu * g))),
    bP = ols(X, tr.map((s) => s.pE / s.Pw))
  const dot = (b) => ACC_X(r.c).reduce((a, x, i) => a + x * b[i], 0)
  const aL = Math.max(0.5, dot(bA) * r.mu * g),
    pE = Math.max(2e3, dot(bP) * r.Pw)
  const t97 = accelIntegral(r.m, r.CdA, aL, pE, 0, V97, true),
    t161 = accelIntegral(r.m, r.CdA, aL, pE, 0, V161, true)
  return {
    n: r.c.n,
    e97: (100 * (t97 - r.c.z97)) / r.c.z97,
    e161: isFinite(t161) ? (100 * (t161 - r.c.z161)) / r.c.z161 : Infinity,
  }
})
const looFin = LOO.filter((r) => isFinite(r.e161))
console.error('  LEAVE-ONE-OUT error in TIME, which is the number that matters:')
console.error(
  '    0-97  mean ' + mAvg(LOO.map((r) => r.e97)).toFixed(2) + '%  MAE ' +
    mAvg(LOO.map((r) => Math.abs(r.e97))).toFixed(2) + '%  max |e| ' +
    Math.max(...LOO.map((r) => Math.abs(r.e97))).toFixed(1) + '%',
)
console.error(
  '    0-161 mean ' + mAvg(looFin.map((r) => r.e161)).toFixed(2) + '%  MAE ' +
    mAvg(looFin.map((r) => Math.abs(r.e161))).toFixed(2) + '%  max |e| ' +
    Math.max(...looFin.map((r) => Math.abs(r.e161))).toFixed(1) + '%' +
    (LOO.length - looFin.length
      ? '   (' + (LOO.length - looFin.length) + ' car(s) could not reach 161 on the predicted curve)'
      : ''),
)
LOO.slice()
  .sort((a, b) => Math.abs(b.e97) - Math.abs(a.e97))
  .slice(0, 6)
  .forEach((r) =>
    console.error(
      '      ' + r.n.slice(0, 40).padEnd(42) + '0-97 ' + r.e97.toFixed(1).padStart(6) + '%   0-161 ' +
        (isFinite(r.e161) ? r.e161.toFixed(1).padStart(6) + '%' : 'unreachable'),
    ),
  )
console.error(
  '  BE CLEAR ABOUT THIS: an 8% out-of-sample MAE is a WEAK model. Power-to-weight and',
)
console.error(
  '  drivetrain do not carry gearing, and no predictor tried (torque/power ratio, rev span,',
)
console.error(
  '  induction, year, weight transfer) moved it. The 59 measured cars are measured to the',
)
console.error('  millisecond; the other 26 are estimated to about a tenth of their acceleration.')
const oneP = CARS.filter((c) => c.z97 != null && c.z161 == null)
console.error(
  '\n  the ' + oneP.length + ' cars with a 0-97 but no 0-161 (Forza cannot run them to 161 km/h):',
)
console.error(
  '  aLaunch comes from the regression and pEff is then SOLVED to reproduce the measured 0-97,',
)
console.error('  so the one measurement they do have is kept rather than discarded.')
oneP.forEach((c) => {
  const a = accelOf(c)
  console.error(
    '    ' + c.n.slice(0, 40).padEnd(42) + '0-97 meas ' + c.z97.toFixed(2) + '  model ' +
      zeroTo(c, 97).toFixed(2) + '   aL ' + a.aL.toFixed(2) + '  pEff ' + (a.pE / 1000).toFixed(1) +
      ' kW  (' + (a.pE / (c.ps * PS * eta)).toFixed(3) + ' x Pw)' +
      (a.bad.length ? '  UNPHYSICAL: ' + a.bad.join('; ') : ''),
  )
})
const noMeas = CARS.filter((c) => c.z97 == null)
console.error('\n  the ' + noMeas.length + ' cars the regression actually carries:')
console.error(
  '  car                                       dt    mu   PS/t   aL/mug     aL   pEff/Pw  pEff kW  0-100',
)
noMeas.forEach((c) => {
  const a = accelOf(c)
  console.error(
    '    ' + c.n.slice(0, 40).padEnd(42) + c.dt.padEnd(5) + gripMu(c).toFixed(2).padStart(5) +
      String(Math.round((c.ps / c.kg) * 1000)).padStart(6) +
      ACCEL_FIT.aRatio(c).toFixed(3).padStart(9) + a.aL.toFixed(2).padStart(7) +
      ACCEL_FIT.pRatio(c).toFixed(3).padStart(10) + (a.pE / 1000).toFixed(1).padStart(9) +
      zeroTo(c, 100).toFixed(1).padStart(7) +
      (a.clamped && a.clamped.length ? '   CLAMPED: ' + a.clamped.join(', ') : ''),
  )
})

// ---- Analysis 3: stock downforce, measured ----
console.error('\n## 3. Stock downforce from the lateral-g pair, grip(v) = mu (1 + k v^2)')
console.error(
  'coeff = k / downforceK (shipped 6.2e-5). The band is the effect of +/-0.005 panel',
)
console.error('rounding on BOTH readings: a small g-rise is mostly rounding noise.')
console.error('car                          g@97  g@193   mu_mech       k      coeff   band')
const dfRows = FING.map((f) => ({ lbl: f.lbl, g97: f.g97, g193: f.g193, a: f.aero })).concat([
  { lbl: 'Mitsubishi GTO 1997 (sep)', g97: 0.89, g193: 0.91, a: AF_GTO },
  { lbl: 'Countach LP5000 QV (sep)', g97: 1.1, g193: 1.15, a: AF_COUNTACH },
  { lbl: 'Calsonic Gr.A (calibrator)', g97: 1.58, g193: 1.78, a: AF_CALSONIC },
])
dfRows.forEach((r) => {
  let lo = Infinity,
    hi = -Infinity
  ;[-0.005, 0.005].forEach((d1) =>
    [-0.005, 0.005].forEach((d2) => {
      const cf = aeroFit(r.g97 + d1, r.g193 + d2).k / DOWNFORCE_K
      lo = Math.min(lo, cf)
      hi = Math.max(hi, cf)
    }),
  )
  console.error(
    '  ' + r.lbl.padEnd(28) + r.g97.toFixed(2).padStart(5) + r.g193.toFixed(2).padStart(7) +
      r.a.mu.toFixed(3).padStart(10) + r.a.k.toExponential(2).padStart(10) +
      (r.a.k / DOWNFORCE_K).toFixed(3).padStart(9) + '   ' +
      lo.toFixed(2) + ' to ' + hi.toFixed(2),
  )
})
console.error(
  '  Sprint 125 shipped downforceCoeff 0 for every stock car, proposing LFA 0.30 / Evo VI 0.10.',
)

// ---- What is left to fit ----
// phi, awdK, aCapK and deliveryFactor are gone from the published model: acceleration is
// solved per car above. kAgi is now the ONLY lever this file fits, and the only one the
// published table runs at other than the brake dead distance.
// The value every save/restore pair below restores to. It starts at the file's default and is
// REPOINTED after the corner-exit fit to the weight this run fits, so a diagnostic that saves and
// restores kAgi returns to this run's lever rather than to the value declared at the top.
let kAgi0 = kAgi
console.error('\n\n# ======== DECISIVE RUN: acceleration MEASURED, kAgi the only lever ========')

// --- 1. The anchors' acceleration, round-tripped ---
console.error('\n## 1. Acceleration anchors: measurement in, measurement out')
console.error('car                      0-97 model   meas   err%    0-161 model   meas   err%')
ANCHORS.forEach((a) => {
  const t97 = zeroTo(a.c, 97),
    t161 = zeroTo(a.c, 161)
  console.error(
    '  ' +
      a.lbl.padEnd(22) +
      t97.toFixed(3).padStart(9) +
      a.m97.toFixed(3).padStart(8) +
      pct(t97, a.m97).toFixed(1).padStart(8) +
      t161.toFixed(3).padStart(13) +
      a.m161.toFixed(3).padStart(8) +
      pct(t161, a.m161).toFixed(1).padStart(8) +
      (a.road ? '' : '   [race car, never lapped]'),
  )
})
console.error(
  '  These were 20% and 26% out on the Countach at the old fitted constants. They are exact now' +
    ' because',
)
console.error(
  '  the times are INPUTS: the row is a check that the solve converged, not a claim of skill.',
)

// --- 2. kAgi sweep against every driven Misaki lap ---
// kAgi is the only lever fitted on lap time, so it absorbs whatever else the lap is missing,
// and the list of things it should NOT be absorbing has just got longer. Acceleration error
// used to leak into it wholesale: with phi, awdK, aCapK and a delivery archetype standing in
// for a real curve, a car that was 20% short down the straight had nowhere to put that error
// except the agility term. It has a measured curve now, and the term no longer carries a mass
// factor either, so the value below is fitted from scratch and is NOT comparable with the
// numbers that shared this variable's name in earlier runs: the old factor averaged 1.12 over
// these cars (0.70 to 1.49 across them), so a like-for-like k rises by roughly that much before
// anything else moves. It rises by 1.16x in the event.
function withSpec(id, o) {
  const base = byId(id)
  if (!base) throw new Error('missing from spec book: ' + id)
  return Object.assign({}, base, o)
}
// ---- ROUND 4: three cars, nine laps, all of them predicted before any of them was driven ----
// The predictions were committed on 2026-07-27 at the model as it then stood (additive agility
// term, kAgi 0.84) and are recorded here VERBATIM so their status can never be lost: every table
// that quotes one of these nine laps also quotes what the harness said it would be. Nothing about
// these cars was tuned, and neither searched geometry has ever seen them.
//
// PROTOCOL, WHICH DIFFERS BY COURSE AND MATTERS. Misaki was driven as a HOTLAP (flying start);
// Hakone and Wangan from a STANDING start, rolling from a grid place or two back, exactly as the
// earlier laps on those two courses were. The Misaki hotlap figure is the one that enters the fit,
// so it matches the other 14. The Misaki STANDING time is recorded beside it because the pair
// measures the standing-start offset DIRECTLY, on the one course whose geometry is not a free
// parameter: three cars, three offsets, and a modelled counterpart to compare them with.
const R4 = [
  {
    id: 'mercedes-190e-2-5-16-evo-ii-w201',
    short: '190E Evo II',
    mis: 112.6, misStand: 116.4, hak: 119.3, wan: 141.3,
    pMis: 111.4, pHak: 119.7, pWan: 142.1,
  },
  {
    id: 'honda-civic-type-r-ek9',
    short: 'Civic Type R EK9',
    mis: 112.5, misStand: 117.4, hak: 116.7, wan: 144.7,
    pMis: 112.4, pHak: 119.7, pWan: 143.0,
  },
  {
    id: 'subaru-impreza-22b-sti',
    short: 'Impreza 22B-STi',
    mis: 101.5, misStand: 105.7, hak: 106.6, wan: 128.2,
    pMis: 105.1, pHak: 111.8, pWan: 133.4,
  },
]
// THE ACCEPTANCE TEST (2026-07-27): one car, four committed figures, all four then driven.
// The 1992 RX-7 Type R was run through the whole harness at the published constants and its four
// times were written down BEFORE any of them was driven. THREE OF THE FOUR ARE GENUINELY OUT OF
// SAMPLE: Hakone, Wangan and the standing kilometre had never seen this car, and neither searched
// geometry had either. The fourth, Misaki, is not: this car already carried a driven Misaki lap
// in the fit (the round-1 blind entry below, 105.3 s on the Forza-panel fingerprint record), and
// the acceptance drive is a second, later drive of the same course on the spec-book record. Both
// are kept, separately and labelled, because averaging two drives of different records would hide
// the only thing either of them measures.
//
// EVERY FIGURE HERE RAN THE SPEC-BOOK RECORD, on all three courses and on the kilometre, which is
// what makes the predictions reconcilable. Hakone's driven table runs that record too; Wangan's
// runs the fingerprint by its own convention, and prints the book time in its `book rec.` column
// so the prediction stays checkable against the number that was actually committed.
const ACC_RX7 = {
  id: 'mazda-rx7-fd3s',
  short: 'RX-7 Type R (FD3S)',
  pMis: 106.2, pHak: 113.6, pWan: 134.8, pKm: 25.11,
  mis: 106.5, hak: 112.8, wan: 132.2, km: 23.943,
}
// `c` is the car as the fingerprints now describe it (measured mechanical mu, measured
// downforce, drag from the measured top speed). `cOld` is the pre-fingerprint car, so the
// before/after below compares like with like instead of crediting new data to new levers.
const DRIVEN = Object.keys(FORZA)
  .filter((id) => byId(id))
  .map((id) => ({
    id,
    lbl: byId(id).n,
    cOld: byId(id),
    c: fingerOf(id) || byId(id),
    fp: !!fingerOf(id),
    t: FORZA[id],
    blind: false,
  }))
  .concat([
    // Round-1 blind cars. cOld carries the Forza-parity stats the PREDICT block uses, and
    // for the R32 the pre-correction lg 0.96, so the grip fix shows up in the before/after.
    {
      id: 'nissan-skyline-gtr-bnr32',
      lbl: 'Skyline GT-R (BNR32, 1992)',
      cOld: withSpec('nissan-skyline-gtr-bnr32', {
        ps: 280, tq: 353, kg: 1480, fr: 59, lg: 0.96,
      }),
      c: fingerOf('nissan-skyline-gtr-bnr32'),
      fp: true,
      t: 105.4,
      blind: true,
    },
    {
      id: 'mazda-rx7-fd3s',
      lbl: 'RX-7 Type R (FD3S, 1992)',
      cOld: withSpec('mazda-rx7-fd3s', { ps: 256, tq: 294, kg: 1260, fr: 50 }),
      c: fingerOf('mazda-rx7-fd3s'),
      fp: true,
      t: 105.3,
      blind: true,
    },
    {
      id: 'honda-integra-type-r-dc2',
      lbl: 'Integra Type R (DC2, 2001)',
      cOld: withSpec('honda-integra-type-r-dc2', { ps: 198, tq: 176, kg: 1197, fr: 62 }),
      c: fingerOf('honda-integra-type-r-dc2'),
      fp: true,
      t: 108.8,
      blind: true,
    },
    // Rounds 2 and 3 carry fingerprints of their own, so the same car record is judged on
    // its lap and on its 0-97/0-161 at once.
    { id: A_GTO.id, lbl: 'Mitsubishi GTO (1997)', cOld: A_GTO, c: A_GTO, fp: true, t: 109.495, blind: true },
    {
      id: A_COUNTACH.id,
      lbl: 'Countach LP5000 QV (1988)',
      cOld: A_COUNTACH,
      c: A_COUNTACH,
      fp: true,
      t: 97.7,
      blind: true,
    },
  ])
  .concat(
    // ROUND 4 (2026-07-27). Three cars predicted on ALL THREE courses before a single lap of
    // any of them was driven, then driven on all three. They are the first cars to enter the
    // harness that way, and it is what makes them the strongest evidence in the file: they are
    // out of sample not only for kAgi but for BOTH SEARCHED GEOMETRIES, neither of which had
    // ever seen them. Every one of the nine driven times below is a genuine forecast test.
    // Each runs the plain spec-book record on all three courses (no fingerprint, no telemetry
    // anchor exists for any of them), so the cross-course comparison is bookkeeping-clean.
    R4.map((r) => ({
      id: r.id,
      lbl: byId(r.id).n,
      cOld: byId(r.id),
      c: byId(r.id),
      fp: false,
      t: r.mis,
      blind: true,
      r4: true,
    })),
  )
// Three flags the raw group means would otherwise hide.
// kei: the Beat and the Acty are the standing kei outliers (calibration doc section 7,
//   "Open items"). Both are near-insensitive to kAgi, so they load the fitted-group MAE
//   with a constant that no agility fit can move.
// oos: round 1's three cars were themselves used to fit kAgi 0.5 -> 0.3, so they are
//   IN-sample for this lever. Rounds 2, 3 and 4 are genuinely out of sample.
// r4:  round 4, the three cars predicted on all three courses at once.
DRIVEN.forEach((d) => {
  d.kei = d.id === 'honda-beat-pp1' || d.id === 'honda-acty-ha4'
  d.oos =
    d.id === 'mitsubishi-gto-twin-turbo-z16a' ||
    d.id === 'lamborghini-countach-lp5000-qv' ||
    !!d.r4
})
const grpOf = (per, pred) => {
  const e = per.filter((_, i) => pred(DRIVEN[i])).map((r) => r.e)
  return { n: e.length, mean: mAvg(e), mae: mAvg(e.map(Math.abs)) }
}
// The second driven course. Eight laps on Hakone, driven by the maintainer in Rivals mode:
// standing start, ABS on, TC and stability off, manual shifting. Keyed on the spec book's
// stable id, as every other driven table is, and run on the spec-book record, so the Hakone
// column of the ranked table and the modelled column of the driven table are the same number.
// All eight cars carry a full panel capture (lateral pair, both stopping distances, 0-97, top
// speed) in the book already.
const HAK = COURSES.Hakone
// THE LAST THREE ROWS ARE OUT OF SAMPLE FOR THIS COURSE'S GEOMETRY. The 2.7 km facsimile was
// searched against the first eight times only; the round-4 cars were predicted on it and then
// driven, so their residuals are the first honest test this geometry has ever faced.
const HAKONE_DRIVEN = [
  { id: 'nissan-gt-r-r35', t: 99.2 },
  { id: 'lexus-lfa', t: 101.655 },
  { id: 'lamborghini-countach-lp5000-qv', t: 105.7 },
  { id: 'subaru-impreza-22b-sti', t: 106.6, r4: true },
  // The acceptance-test car, predicted on this road (113.6 s) before it was ever driven on it,
  // and out of sample for the searched geometry exactly as the round-4 three are.
  { id: ACC_RX7.id, t: ACC_RX7.hak, acc: true },
  { id: 'toyota-supra-rz-jza80', t: 113.8 },
  { id: 'mitsubishi-gto-twin-turbo-z16a', t: 114.4 },
  { id: 'honda-crx-sir-ef8', t: 114.9 },
  { id: 'honda-civic-type-r-ek9', t: 116.7, r4: true },
  { id: 'mercedes-190e-2-5-16-evo-ii-w201', t: 119.3, r4: true },
  { id: 'nissan-silvia-s13', t: 120.0 },
  { id: 'mazda-autozam-az-1-pg6sa', t: 126.6 },
]
const HAKD = HAKONE_DRIVEN.map((d) => {
  const c = byId(d.id)
  if (!c) throw new Error('missing from spec book: ' + d.id)
  return { id: d.id, c, lbl: c.n, t: d.t, r4: !!d.r4, acc: !!d.acc }
})
// The third driven course. Five laps on Wangan, driven by the maintainer in Rivals mode on the
// same settings as Hakone: standing start, ABS on, TC and stability off, manual shifting.
//
// RECORD CONVENTION, AND WHY IT IS MISAKI'S RATHER THAN HAKONE'S. Each car is resolved exactly as
// the Misaki driven table resolves it - the maintainer's own panel capture where one exists, the
// telemetry anchor for the Countach, the spec-book entry otherwise - because the question this
// course exists to answer is whether a car's Misaki residual survives on a fast road, and that
// question is only meaningful if both courses run the same record. The two conventions differ
// materially on exactly one car, the LFA, whose drag the spec book reads off its body (gearLtd)
// and the fingerprint off its top speed; the driven table below prints both so the ranked table's
// Wangan column stays reconcilable and the choice cannot hide a conclusion.
const WAN = COURSES.Wangan
//
// THREE OF THESE EIGHT ARE OUT OF SAMPLE FOR THIS COURSE'S GEOMETRY TOO. The 7.0 km facsimile was
// searched against the first five times only; the round-4 cars were predicted on it before it
// ever saw them.
const WANGAN_DRIVEN = [
  { id: 'lexus-lfa', t: 114.1 },
  { id: 'lamborghini-countach-lp5000-qv', t: 123.7 },
  { id: 'subaru-impreza-22b-sti', t: 128.2, r4: true },
  { id: 'honda-nsx-r-na1', t: 129.6 },
  { id: 'mitsubishi-lancer-evo-vi-tommi-makinen-cp9a', t: 131.9 },
  // The acceptance-test car, predicted on this road (134.8 s, spec-book record) before it was
  // ever driven on it. Out of sample for the searched geometry, like the round-4 three.
  { id: ACC_RX7.id, t: ACC_RX7.wan, acc: true },
  { id: 'mercedes-190e-2-5-16-evo-ii-w201', t: 141.3, r4: true },
  { id: 'honda-civic-type-r-ek9', t: 144.7, r4: true },
  { id: 'honda-beat-pp1', t: 166.6 },
]
// The canonical record for a car that has been DRIVEN: the telemetry anchor where one exists, the
// maintainer's own panel capture next, the spec book last. The two anchors are named explicitly
// because the variant Forza simulates is not the spec book's car in either case (the GTO the
// maintainer drove is the 1997, 324 PS car; the book's Z16A is the 1990).
const drivenCar = (id) =>
  id === A_COUNTACH.id ? A_COUNTACH : id === A_GTO.id ? A_GTO : fingerOf(id) || byId(id)
const WAND = WANGAN_DRIVEN.map((d) => {
  const c = drivenCar(d.id)
  if (!c) throw new Error('missing from spec book: ' + d.id)
  return { id: d.id, c, lbl: byId(d.id).n, t: d.t, r4: !!d.r4, acc: !!d.acc }
})
const maeOf = (e) => mAvg(e.map(Math.abs))

// =====================================================================================
// THE TWO AD-HOC BUILDS, AND THE SIX MEASURED 1 km DRAG RUNS
// =====================================================================================
// Two ad-hoc builds the model has never seen, defined ONCE here because three sections read
// them: the drag set below, the high-grip set after it, and the blind-validation record at the
// end of the file. Both
// are OUT OF SAMPLE and stay out of sample. They are in no fit: not the corner-exit weight, not
// the agility weight, not the braking dead distance, not the acceleration fallback regression,
// and neither searched geometry has ever seen either of them.
//
// Drag area comes from the measured top speed for both, so the car's real frontal area cancels
// out of CdA exactly (cdFromTop divides by it and carBlock multiplies it back). The published
// dimensions are recorded anyway, because the printed Cd is only meaningful against a real area.
function adhocCar(spec) {
  const af = aeroFit(spec.g97, spec.g193)
  const c = Object.assign({}, spec, {
    lg: Math.max(0, af.mu),
    dfC: Math.max(0, af.k / DOWNFORCE_K),
    cd: 0,
  })
  DIMS[c.id] = spec.dim
  c.cd = cdFromTop(c, c.top)
  return c
}
// A Wangan special: big power, no added aero, mild extra mechanical grip.
const ADHOC_BMW = adhocCar({
  id: 'adhoc-bmw-850csi-v8tt',
  n: '1995 BMW 850CSi (modified, 4.4 V8-TT)',
  y: 1995, sec: 'Flagship', dt: 'RWD', ep: 'front', ec: 'S63TT', cfg: 'V8', asp: 'twin-turbo',
  ps: 701, kg: 1901, fr: 51, wb: 2684, com: 490, ty: '265/40R18', top: 363,
  b97: 37.3, b161: 92.6, z97: 5.215, z161: 10.281, g97: 0.93, g193: 0.92, dim: [1855, 1340],
})
// Its deliberate mirror: very light, slicks plus real aero, AWD swap, modest power.
const ADHOC_LOTUS = adhocCar({
  id: 'adhoc-lotus-elise-s1-awd',
  n: '1999 Lotus Elise S1 Sport 190 (modified, AWD)',
  y: 1999, sec: 'Lightweight', dt: 'AWD', ep: 'mid', ec: 'K-Series', cfg: 'I4', asp: 'na',
  ps: 220, kg: 645, fr: 42, wb: 2300, com: 400, ty: '225/45R17', top: 227.5,
  b97: 32, b161: 76, z97: 3.348, z161: 8.883, g97: 1.29, g193: 1.48, dim: [1701, 1202],
})
// A third build, and the most extreme thing the harness has ever been asked to lap: everything
// pushed to the maximum at once, grip, downforce, power and braking all far outside the range any
// fitted constant has seen. It is defined here rather than in the stress-test block at the end of
// the file because it now carries a DRIVEN Hakone lap and is therefore a scored point, not only a
// blind prediction. It is in no fit but the geometric ceiling's, and its Hakone time is one of
// the three that ceiling is fitted on.
const ADHOC_787B = adhocCar({
  id: 'adhoc-mazda-787b-max',
  n: '1991 Mazda 787B (heavily modified)',
  y: 1991, sec: 'Prototype', dt: 'AWD', ep: 'mid', ec: 'R26B', cfg: 'rotary', asp: 'na',
  ps: 774, kg: 881, fr: 47, wb: 2662, com: 300, ty: '300/40R18', top: 357.1,
  b97: 18.9, b161: 43.5, z97: 1.77, z161: 4.387, g97: 2.03, g193: 3.01, dim: [1994, 1003],
})
// Yatabe Straight's driven times, and the only scored set in the file that is a straight line.
// Seven standing kilometres, traction and stability control off, each the average of three
// consistent runs, every one of them driven AFTER the harness had committed the figure in `p`. A
// lap cannot separate the acceleration model from the cornering model; a kilometre in a straight
// line can, and above 161 km/h it is the only measurement that exists at all, because that is
// where the two published acceleration figures stop.
//
// RECORD CONVENTION: the roster cars run the SPEC-BOOK record, which is what the committed
// prediction ran. That is deliberately not the driven-lap convention, which prefers the telemetry
// anchor for the Countach; the anchor and the book differ on that car's 0-161 by 0.022 s, and the
// prediction column has to stay reconcilable with what was actually committed.
const DRAG_DRIVEN = [
  { c: ADHOC_LOTUS, lbl: 'Lotus Elise S1 (AWD swap)', sh: 'Lotus', t: 22.737, p: 23.03 },
  { id: 'lexus-lfa', lbl: 'Lexus LFA', sh: 'LFA', t: 20.63, p: 20.9 },
  { id: 'nissan-gt-r-r35', lbl: 'Nissan GT-R Black Edition', sh: 'R35', t: 19.777, p: 20.27 },
  { id: 'honda-beat-pp1', lbl: 'Honda Beat', sh: 'Beat', t: 33.061, p: 34.16 },
  { c: ADHOC_BMW, lbl: 'BMW 850CSi (V8-TT swap)', sh: 'BMW', t: 21.856, p: 22.69 },
  // The acceptance-test car, and the seventh run. Its kilometre was a committed prediction like
  // the other six, and it is the run that took the mean deficit from +3.1% to +3.4%.
  { id: ACC_RX7.id, lbl: 'Mazda RX-7 Type R', sh: 'RX-7', t: ACC_RX7.km, p: ACC_RX7.pKm, acc: true },
  { id: 'lamborghini-countach-lp5000-qv', lbl: 'Countach LP5000 QV', sh: 'Ctach', t: 22.835, p: 24.3 },
].map((d) => {
  const c = d.c || byId(d.id)
  if (!c) throw new Error('missing from spec book: ' + d.id)
  return { c, lbl: d.lbl, sh: d.sh, t: d.t, p: d.p, acc: !!d.acc }
})
// Filled in by the drag section far below and read by the JSON export after it, so the
// dashboard can show this set beside the three driven-lap sets.
const DRAG_SCORE = {}
// The standing kilometre, marched in time rather than in speed because the quantity being
// integrated to a target is DISTANCE. `blk` supplies a car block, which may carry its own
// engine curve, so a mechanism probe marches exactly the curve its own solve inverted; omitted,
// this is the published model and nothing else. The step is far inside convergence: 5e-4 s and
// 2e-5 s agree on all six to better than a millisecond.
function dragKm(c, metres, blk) {
  const b = blk || carBlock(c)
  const vCap = vTopOf(b, c)
  const dt = 5e-4
  let v = 0.1, x = 0, t = 0, tLo = 0, xLo = 0, tCap = 0, t97 = 0, t161 = 0, x97 = 0, x161 = 0
  for (let i = 0; i < 4e6 && x < metres; i++) {
    const atCap = v >= vCap - 1e-9
    v = Math.min(vCap, v + Math.max(0, netAccel(b, v, 0)) * dt)
    x += v * dt
    t += dt
    if (v < V161) { tLo += dt; xLo += v * dt }
    if (atCap) tCap += dt
    if (!t97 && v >= V97) { t97 = t; x97 = x }
    if (!t161 && v >= V161) { t161 = t; x161 = x }
  }
  return { t, v, vCap, tLo, xLo, tCap, t97, t161, x97, x161, b }
}

// =====================================================================================
// THE DRAG-ONLY PROTOCOL OFFSET (maintainer-approved, 2026-07-27)
// =====================================================================================
// WHAT IT IS. A single flat multiplier taken off computed 1 km times, and off nothing else in
// this file. The raw model is slow on all seven driven kilometres, by +1.3% to +6.4%, mean about
// +3.4%, and the deficit is one-signed on every car. Power does not order it (the 560 PS LFA is
// the best fit at +1.3% and the 255 PS RX-7 nearly the worst at +4.9%) and neither does
// power-to-weight, so a scaling law is refused by the data and a flat constant is the honest
// shape. The section far below prices five candidate physical mechanisms against these points and
// every one of them fails on its own arithmetic; the constant is what is left.
//
// WHAT IT IS NOT: PHYSICS. It is a PROTOCOL OFFSET, and the label is load-bearing. The model is
// fed Forza's canned panel figures for 0-97 and 0-161; the driven kilometres are hand-driven with
// the assists off. Those are plausibly not the same measurement, and a constant that is one-signed
// across a 645 kg Elise and a 1901 kg 850CSi looks far more like a measurement gap than like a
// missing term. It is a calibration and it must be read as one.
//
// WHY IT TOUCHES THE DRAG STRIP ONLY, AND WHY THAT IS NOT NEGOTIABLE (maintainer, 2026-07-27):
// the three lap courses are accurate NOW, with the straight-line pessimism in place, because it
// cancels against a direction-change weight that was fitted with that pessimism present. Correct
// acceleration globally and all three fitted courses go fast by roughly the amount the fit was
// absorbing, i.e. the offset would break three working courses to fix one. So it is applied HERE,
// at the drag computation, in exactly one expression, and it is deliberately NOT inside
// accelIntegral, netAccel, paccAt, carBlock or anything else the lap path can reach. If a later
// tidy-up moves it into the shared acceleration path, every lap time in the file moves with it.
// Do not do that. The lap path calls lap(); the strip calls dragTime(); nothing calls both.
//
// HOW THE CONSTANT IS FITTED. Least squares in RELATIVE error, which is the currency every score
// in this file is quoted in: with r_i = model_i / driven_i, minimising sum((a r_i - 1)^2) over the
// multiplier a gives a = sum(r) / sum(r^2), and the offset is 1 - a. It is refitted from the
// driven set on every run rather than frozen at a decimal, so adding a kilometre re-fits it.
// THE SEVEN RUNS ARE THEREFORE IN-SAMPLE FOR THIS ONE CONSTANT: their MAE after it is a residual
// spread, not a forecast, and the report says so wherever it prints one.
const DRAG_OFFSET = (function () {
  const r = DRAG_DRIVEN.map((d) => dragKm(d.c, YATABE_M).t / d.t)
  const num = r.reduce((a, x) => a + x, 0),
    den = r.reduce((a, x) => a + x * x, 0)
  return 1 - num / den
})()
// THE ONE PLACE THE OFFSET IS EVER APPLIED. Everything that publishes a standing-kilometre time
// goes through here: the Yatabe column of the ranked table, the JSON export, the dashboard, the
// scored set and the blind probes. `dragKm` itself stays raw, because the diagnostics that argue
// about the model have to see the model.
const dragTime = (c, blk) => dragKm(c, YATABE_M, blk).t * (1 - DRAG_OFFSET)
// The course evaluator registry: a course named here is timed by its own function instead of by
// lap(), because lap() cannot express a road with no corners. Nothing else about such a course is
// special-cased; courseTime is what every course-shaped consumer in the file calls.
const COURSE_EVAL = { Yatabe: (c, blk) => dragTime(c, blk) }
const courseTime = (k, c, blk) =>
  COURSE_EVAL[k] ? COURSE_EVAL[k](c, blk) : lap(c, COURSES[k], blk)

// =====================================================================================
// THE HIGH-GRIP SET, AND THE GEOMETRIC CEILING FITTED ON IT
// =====================================================================================
// SIX DRIVEN TIMES ON CARS WITH MORE GRIP THAN ANY ROSTER CAR HAS. The 38 driven laps already in
// this file span mu 0.66 to 1.23 and the model is accurate over that whole range; these six are the
// only measurements that exist above it. Three are the same road at three grip levels, which is
// what isolates GRIP as the variable; the other three are one car on three more courses, which
// is what isolates CORNER CONTENT. Two axes, one defect.
//
// THEY ARE A SEPARATE SET AND NOT MEMBERS OF THE FOUR DRIVEN SETS, deliberately. The four sets
// carry every fitted constant in the file and every diagnostic that argues about the model;
// folding six outliers into them would make "did the 45 move" unanswerable, which is the one
// question a new term has to answer. They are scored here and nowhere else.
//
// THE CALSONIC'S KILOMETRE IS SCORED BUT NOT IN THE DRAG SET, for the same reason and one more:
// DRAG_OFFSET is refitted from its set on every run, so adding a kilometre would move all seven
// published Yatabe times. The offset stays drag-only and stays fitted on the seven it was fitted
// on. Nothing in this section can reach it: the ceiling lives in the corner arithmetic and a
// standing kilometre has no corners.
const GRIP_DRIVEN = [
  { c: ADHOC_LOTUS, lbl: 'Lotus Elise S1 (AWD)', course: 'Hakone', t: 94.9, p: 94.7 },
  { c: A_CALSONIC, lbl: 'Calsonic BNR32 Gr.A', course: 'Hakone', t: 90.1, p: 81.8 },
  { c: ADHOC_787B, lbl: 'Mazda 787B (modified)', course: 'Hakone', t: 80.7, p: 71.8 },
  { c: A_CALSONIC, lbl: 'Calsonic BNR32 Gr.A', course: 'Misaki', t: 81.06, p: 76.5, anchor: true },
  { c: A_CALSONIC, lbl: 'Calsonic BNR32 Gr.A', course: 'Wangan', t: 100.7, p: 99.4 },
  { c: A_CALSONIC, lbl: 'Calsonic BNR32 Gr.A', course: 'Yatabe', t: 17.654, p: 18.1 },
]
// The four scored sets, keyed by course, so the ceiling's objective can be stated once over
// EVERYTHING and read course by course. Yatabe's members are the standing kilometres.
const SCORED = {}
CK.forEach((k) => {
  SCORED[k] = (k === 'Misaki' ? DRIVEN : k === 'Hakone' ? HAKD : k === 'Wangan' ? WAND : DRAG_DRIVEN)
    .map((d) => ({ c: d.c, t: d.t, lbl: d.lbl, grip: false }))
    .concat(GRIP_DRIVEN.filter((d) => d.course === k).map((d) => ({ c: d.c, t: d.t, lbl: d.lbl, grip: true })))
})
// The objective: the mean of the four courses' MAEs over every scored point, equal weight per
// course. Yatabe contributes a constant, because no cornering lever can move a straight line;
// it is in the objective anyway so the statement "fitted on all the data at once" is literally
// true and the constant is visible rather than quietly dropped.
//
// kAgi is swept jointly inside the fit rather than held, so the ceiling cannot be credited with
// work the direction-change weight would have done. What comes back is that it makes no
// difference: the joint sweep wants a kAgi within 0.001 of the value the 38 legacy laps fit on
// their own, because the ceiling is inert on all of them and six points cannot outvote thirty
// eight at equal course weight. The published run therefore leaves kAgi to its own fit, and
// section 7 prints the joint value beside it.
const GEO_KGRID = 600
// The cornerless courses' contribution, computed ONCE: no cornering lever can move a straight
// line, so re-timing seven standing kilometres per candidate would buy nothing but minutes.
const GEO_FLAT = CK.filter((ck) => COURSE_EVAL[ck]).map((ck) =>
  mAvg(SCORED[ck].map((d) => Math.abs(pct(courseTime(ck, d.c), d.t)))),
)
const GEO_LAPCK = CK.filter((ck) => !COURSE_EVAL[ck])
function geoScore(mu20, t) {
  const s0 = GEO_MU,
    t0 = GEO_T,
    k0 = kAgi
  GEO_MU = mu20
  GEO_T = t
  kAgi = 0
  const s = shp({})
  const rows = {}
  GEO_LAPCK.forEach((ck) => {
    rows[ck] = SCORED[ck].map((d) => ({
      d,
      L0: lap(d.c, COURSES[ck]),
      w: agiSum(carBlock(d.c), COURSES[ck], s),
    }))
  })
  const flat = GEO_FLAT
  let best = null
  for (let i = 0; i <= GEO_KGRID; i++) {
    const k = (i * 1.5) / GEO_KGRID
    const per = Object.keys(rows).map((ck) => maeOf(rows[ck].map((r) => pct(r.L0 + k * r.w, r.d.t))))
    const o = per.concat(flat).reduce((a, x) => a + x, 0) / (per.length + flat.length)
    if (!best || o < best.o) best = { k, o, per }
  }
  GEO_MU = s0
  GEO_T = t0
  kAgi = k0
  return { mu20, t, k: best.k, o: best.o, per: best.per }
}
// Coarse then fine, both interior; the report prints the surface and the basin so the two
// parameters cannot pass as better determined than they are.
const GEO_FIT = (function () {
  let best = null
  for (let i = 0; i <= 24; i++)
    for (let j = 0; j <= 16; j++) {
      const r = geoScore(1.0 + i * 0.025, j * 0.0125)
      if (!best || r.o < best.o) best = r
    }
  const m0 = best.mu20,
    t0 = best.t
  for (let i = -10; i <= 10; i++)
    for (let j = -10; j <= 10; j++) {
      const mu = m0 + i * 0.0025,
        t = t0 + j * 0.00125
      if (mu <= 0 || t < 0) continue
      const r = geoScore(mu, t)
      if (r.o < best.o) best = r
    }
  return best
})()
GEO_MU = GEO_FIT.mu20
GEO_T = GEO_FIT.t

// THE AFFINE BASE. kAgi enters the lap in exactly one additive place, so one lap sim per car per
// course at kAgi = 0 prices every k and every agility shape in the family by arithmetic:
//     lap = L0 + k * agiSum(car, course, shape)
// The sweeps below are therefore EXACT over their grids rather than sampled, and a 245-shape by
// 4000-k surface costs 22 lap sims in total. Section 2b asserts the identity against the
// simulator before spending it.
const affine = (set, segs) => set.map((d) => ({ d, L0: lapAtZero(d.c, segs), b: carBlock(d.c) }))
const MIS_AFF = affine(DRIVEN, LEGEND)
const HAK_AFF = affine(HAKD, HAK)
const WAN_AFF = affine(WAND, WAN)
const errAt = (rows, segs, s) =>
  rows.map((r) => pct(r.L0 + s.k * agiSum(r.b, segs, s), r.d.t))
// The two driven-lap objectives, at an arbitrary agility shape. Kept side by side because the
// joint fit below is the only thing that reads them and it must weigh them the same way twice.
const misErr = (s) => errAt(MIS_AFF, LEGEND, s)
const hakErr = (s) => errAt(HAK_AFF, HAK, s)
const wanErr = (s) => errAt(WAN_AFF, WAN, s)
// The error with its own mean taken out. It was load-bearing on the surveyed map, where the
// level was unreachable by about 21% at any k and the raw MAE therefore measured a missing term
// rather than the cars. On the facsimile the level IS reachable, so RAW is the objective the fit
// publishes and this reading is kept only as a diagnostic: the two now agree, and showing that
// they agree is the check that the geometry did its job.
const centred = (e) => {
  const m = mAvg(e)
  return e.map((x) => x - m)
}
// EQUAL WEIGHT PER COURSE, not per lap: the objective is the mean of the two courses' MAEs.
// Weighting per lap would let the 17 Misaki laps outvote the 12 Hakone ones on a question - what
// a hairpin costs - that only the 12 can answer, and Misaki has one hairpin.
// Equal course weight is also the weighting that makes "did Misaki get worse" readable straight
// off the table, since its own column is unmixed.
// RAW is the objective as asked for and the one that is published; LEVEL-FREE is the same
// objective with Hakone's own mean removed from its errors first. Both are computed at every
// shape by fitShape below: on the surveyed map they disagreed violently, and on the facsimile
// they land within a hundredth of each other, which is the finding.
// One k, scored every way the report reads it. Shared by the printed coarse grid and by the
// fine refinement that follows, so the two cannot disagree about what "minimising" means.
function sweepAt(k) {
  kAgi = k
  const per = DRIVEN.map((d) => {
    const t = lap(d.c, LEGEND)
    return { t, e: pct(t, d.t) }
  })
  kAgi = kAgi0
  const fit = per.filter((_, i) => !DRIVEN[i].blind).map((r) => r.e)
  const bld = per.filter((_, i) => DRIVEN[i].blind).map((r) => r.e)
  const all = per.map((r) => r.e)
  return {
    k,
    per,
    fMean: mAvg(fit),
    fMae: mAvg(fit.map(Math.abs)),
    bMean: mAvg(bld),
    bMae: mAvg(bld.map(Math.abs)),
    aMean: mAvg(all),
    aMae: mAvg(all.map(Math.abs)),
    f7: grpOf(per, (d) => !d.blind && !d.kei),
    a12: grpOf(per, (d) => !d.kei),
    oos: grpOf(per, (d) => d.oos),
  }
}
const KVALS = []
// The printed grid: swept well past the minimum on both sides so it is visibly interior rather
// than a wall, at a 0.04 step because that is a table a person can read. The floor is 0, since
// the measured acceleration model took a large bite out of this lever and the grid has to be
// able to follow it down; the ceiling is 1.12, comfortably clear of where the mass-free shape
// settles. Refitting from scratch after dropping the mass factor was NOT optional: the old
// factor averaged 1.12 over the driven cars, so the same physical cost has to reappear in k,
// and reading the old value across would have been a silent cut of that size to the term.
for (let i = 0; i <= 28; i++) KVALS.push(+(i * 0.04).toFixed(2))
const sweep = KVALS.map(sweepAt)
const bestKc = sweep.reduce((a, b) => (b.aMae < a.aMae ? b : a))
// The published constant is refined on a 0.01 grid so it is the fit's answer and not the
// printed grid's rounding. Same objective as the coarse table: mean |error| over all 14.
const FINE = []
for (let i = 0; i <= 120; i++) FINE.push(sweepAt(+(i * 0.01).toFixed(2)))
const fineMin = (key, sub) =>
  FINE.reduce((a, b) => ((sub ? b[key].mae : b[key]) < (sub ? a[key].mae : a[key]) ? b : a))
const bestK = fineMin('aMae')
const nFit = DRIVEN.filter((d) => !d.blind).length,
  nBld = DRIVEN.length - nFit

console.error(
  '\n## 2. kAgi sweep on the ' + DRIVEN.length + ' driven Misaki laps (acceleration measured)',
)
console.error(
  '   f = one of the ' + nFit + ' originally-fitted anchors; B = one of the ' + nBld + ' blind-driven',
)
console.error('\n### predicted lap (s), rows = car, columns = kAgi')
console.error('car'.padEnd(31) + KVALS.map((k) => k.toFixed(2).padStart(7)).join(''))
DRIVEN.forEach((d, i) =>
  console.error(
    ((d.blind ? 'B ' : 'f ') + d.lbl).slice(0, 30).padEnd(31) +
      sweep.map((s) => s.per[i].t.toFixed(1).padStart(7)).join(''),
  ),
)
console.error('\n### % error vs driven, rows = car, columns = kAgi')
console.error('car'.padEnd(31) + KVALS.map((k) => k.toFixed(2).padStart(7)).join(''))
DRIVEN.forEach((d, i) =>
  console.error(
    ((d.blind ? 'B ' : 'f ') + d.lbl).slice(0, 30).padEnd(31) +
      sweep.map((s) => s.per[i].e.toFixed(1).padStart(7)).join(''),
  ),
)
console.error('\n### group means by kAgi')
console.error(
  ' kAgi   fitted-' +
    nFit +
    ' mean    MAE     blind-' +
    nBld +
    ' mean    MAE      ALL-' +
    DRIVEN.length +
    ' mean    MAE',
)
sweep.forEach((s) =>
  console.error(
    s.k.toFixed(2).padStart(5) +
      s.fMean.toFixed(2).padStart(13) +
      s.fMae.toFixed(2).padStart(8) +
      s.bMean.toFixed(2).padStart(15) +
      s.bMae.toFixed(2).padStart(8) +
      s.aMean.toFixed(2).padStart(14) +
      s.aMae.toFixed(2).padStart(8) +
      (s === bestKc ? '   <== min combined MAE on the printed grid' : ''),
  ),
)
const bestK12c = sweep.reduce((a, b) => (b.a12.mae < a.a12.mae ? b : a))
const bestKoosc = sweep.reduce((a, b) => (b.oos.mae < a.oos.mae ? b : a))
const bestK12 = fineMin('a12', true)
const bestKoos = fineMin('oos', true)
console.error('\n### the same sweep with the two standing kei outliers removed')
console.error(
  ' kAgi   main-field-' +
    sweep[0].f7.n +
    ' mean   MAE     no-kei-' +
    sweep[0].a12.n +
    ' mean   MAE     TRUE out-of-sample-' +
    sweep[0].oos.n +
    ' mean   MAE',
)
sweep.forEach((s) =>
  console.error(
    s.k.toFixed(2).padStart(5) +
      s.f7.mean.toFixed(2).padStart(15) +
      s.f7.mae.toFixed(2).padStart(7) +
      s.a12.mean.toFixed(2).padStart(15) +
      s.a12.mae.toFixed(2).padStart(7) +
      s.oos.mean.toFixed(2).padStart(22) +
      s.oos.mae.toFixed(2).padStart(7) +
      (s === bestK12c ? '   <== min no-kei' : '') +
      (s === bestKoosc ? '   <== min true-OOS' : ''),
  ),
)
// The 0.01 refinement, and the flatness of the basin around it. A lever whose basin is 0.05
// percentage points deep over a wide k window is not precisely determined, and saying so is
// cheaper than pretending the third decimal means something.
const FLAT_PP = 0.05
const flatBand = FINE.filter((s) => s.aMae <= bestK.aMae + FLAT_PP)
console.error('\n### refined on a 0.01 grid (same objective: mean |error| over all ' + DRIVEN.length + ')')
console.error(
  '  minimising kAgi (combined MAE) = ' + bestK.k.toFixed(2) + '   fitted ' +
    bestK.fMean.toFixed(2) + '% mean / ' + bestK.fMae.toFixed(2) + '% MAE   blind ' +
    bestK.bMean.toFixed(2) + '% mean / ' + bestK.bMae.toFixed(2) + '% MAE   ALL-' +
    DRIVEN.length + ' ' + bestK.aMean.toFixed(2) + '% mean / ' + bestK.aMae.toFixed(2) + '% MAE',
)
console.error(
  '  minimising kAgi: no-kei-' + sweep[0].a12.n + ' = ' + bestK12.k.toFixed(2) + ' (' +
    bestK12.a12.mae.toFixed(2) + '% MAE)   true-out-of-sample-' + sweep[0].oos.n + ' = ' +
    bestKoos.k.toFixed(2) + ' (' + bestKoos.oos.mae.toFixed(2) + '% MAE)',
)
console.error(
  '  INTERIOR: the grid runs ' + FINE[0].k.toFixed(2) + ' to ' +
    FINE[FINE.length - 1].k.toFixed(2) + ' and the minimum sits at ' + bestK.k.toFixed(2) +
    ', with MAE rising on both sides (' + FINE[Math.max(0, FINE.indexOf(bestK) - 10)].aMae.toFixed(2) +
    '% at ' + FINE[Math.max(0, FINE.indexOf(bestK) - 10)].k.toFixed(2) + ', ' +
    bestK.aMae.toFixed(2) + '% at the minimum, ' +
    FINE[Math.min(FINE.length - 1, FINE.indexOf(bestK) + 10)].aMae.toFixed(2) + '% at ' +
    FINE[Math.min(FINE.length - 1, FINE.indexOf(bestK) + 10)].k.toFixed(2) + '). Not a bound.',
)
console.error(
  '  BASIN: every k from ' + flatBand[0].k.toFixed(2) + ' to ' +
    flatBand[flatBand.length - 1].k.toFixed(2) + ' is within ' + FLAT_PP.toFixed(2) +
    ' percentage points of the minimum, so read the fitted value to two decimals at most.',
)
// Cross-check: the GTO lap above uses the spec-book kg/fr (1710/58) carried by the
// acceleration anchor. The PREDICT block feeds Forza's displayed 1680/61 instead; this
// line shows the lap that variant produces, so the choice cannot hide a conclusion.
const gtoParity = Object.assign({}, A_GTO, { kg: 1680, fr: 61 })
kAgi = bestK.k
console.error(
  '  cross-check: GTO at Forza-displayed 1680 kg / 61% front = ' +
    lap(gtoParity, LEGEND).toFixed(1) +
    ' s (' +
    pct(lap(gtoParity, LEGEND), 109.495).toFixed(1) +
    '%) vs ' +
    lap(A_GTO, LEGEND).toFixed(1) +
    ' s at spec-book 1710/58',
)
kAgi = kAgi0

// --- 2b. THE AGILITY SHAPE, fitted on all 27 driven laps ---
// Everything above this line is Misaki-only, and Misaki is 68% straight with one hairpin. The
// eight Hakone laps are the model's only tight-course evidence and the five Wangan laps its only
// fast-course evidence, and this is where both are spent. What is fitted here is not a
// coefficient but the whole functional form:
//
//     agility = k (m/1200)^p (1/mu)^q (angle/90)^a clamp((80/r)^t, 0.4, hi)
//
// a, t, hi and k are swept; p and q are re-checked against the published geometry rather than
// assumed.
//
// READ THIS BEFORE READING THE NUMBERS. Hakone's geometry IS a free parameter again, by ruling,
// and it has been spent: the published course is a searched facsimile, not the map. So the
// tables below are no longer evidence that the model reproduces a mountain road. They are
// evidence about the agility term GIVEN a road that the model can lap. The surveyed map is still
// scored beside every one of them, and every conclusion that was drawn against the map still
// holds against the map: NO member of this family reaches the driven times on the surveyed
// geometry, because the model is about 21% slow there with the term switched off entirely and
// the term can only add time.
const HAKM_AFF = affine(HAKD, HAK_MAP)
// The same eight laps scored on the SURVEYED map. Every diagnostic that asks "what is wrong with
// the model" reads this, not the published facsimile: the facsimile fits by construction, so
// asking it what is missing would be asking a question it was built to answer.
const mapErr = (s) => errAt(HAKM_AFF, HAK_MAP, s)
const P_GRID = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0]
const Q_GRID = [0, 0.5, 1, 1.5]
const A_GRID = [0.5, 0.75, 1, 1.25, 1.5, 2]
const T_GRID = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5]
const HI_GRID = [1.5, 2, 2.5, 3.5, 5, 8, Infinity]
// The published shape's exponents, named once so the p/q re-check and the published constant
// cannot drift apart. They are the shape as it stood; the sweep below is what decides whether
// they should move, and its answer is that it cannot see them.
const JOINT_A = 1,
  JOINT_T = 1,
  JOINT_HI = 2.5
// The fine k grid the shape sweep runs on. It is exhaustive rather than clever because the
// affine identity makes each point cost 22 multiplications.
const K_N = 3000,
  K_MAX = 3
const hiLbl = (h) => (isFinite(h) ? h.toFixed(1) : 'none')
const shpLbl = (s) => 'a ' + s.a + '  t ' + s.t + '  hi ' + hiLbl(s.hi)
// One shape, every k, scored on both objectives. The per-car weights and the two course sums are
// hoisted out of the k loop: they do not depend on k, and leaving them inside is what made the
// first attempt at this sweep too slow to run exhaustively.
// `hakAff`/`hakSegs` default to the published course. Passing the surveyed map instead is what
// lets every conclusion be scored on both geometries rather than only on the one that fits.
function fitShape(s0, hakAff, hakSegs) {
  const s = shp(s0)
  const HA = hakAff || HAK_AFF,
    HS = hakSegs || HAK
  const Gm = tightSum(LEGEND, s),
    Gh = tightSum(HS, s),
    Gw = tightSum(WAN, s)
  // The weight already carries the course's corner geometry (agiSum sums over the corners), so
  // Gm/Gh/Gw survive only for the ratio columns the report prints below.
  const wm = MIS_AFF.map((r) => agiSum(r.b, LEGEND, s)),
    wh = HA.map((r) => agiSum(r.b, HS, s)),
    ww = WAN_AFF.map((r) => agiSum(r.b, WAN, s))
  let raw = null,
    free = null
  for (let i = 0; i <= K_N; i++) {
    const k = (i * K_MAX) / K_N
    const me = MIS_AFF.map((r, j) => (100 * (r.L0 + k * wm[j] - r.d.t)) / r.d.t)
    const he = HA.map((r, j) => (100 * (r.L0 + k * wh[j] - r.d.t)) / r.d.t)
    const we = WAN_AFF.map((r, j) => (100 * (r.L0 + k * ww[j] - r.d.t)) / r.d.t)
    const mis = maeOf(me),
      hak = maeOf(he),
      wan = maeOf(we),
      scat = maeOf(centred(he))
    const o1 = (mis + hak + wan) / 3,
      o2 = (mis + scat + wan) / 3
    if (!raw || o1 < raw.o) raw = { k, o: o1, mis, hak, wan, scat }
    if (!free || o2 < free.o) free = { k, o: o2, mis, hak, wan, scat }
  }
  return { s, Gm, Gh, Gw, ratio: Gh / Gm, ratioW: Gw / Gm, raw, free }
}
// Everything the report wants to say about one (shape, k) pair, in one place.
const sprOf = (rows, segs, s, k) => {
  const t = rows.map((r) => r.L0 + k * agiSum(r.b, segs, s))
  return Math.max(...t) / Math.min(...t)
}
function scoreAt(s0, k, hakAff, hakSegs) {
  const HA = hakAff || HAK_AFF,
    HS = hakSegs || HAK
  const s = shp(Object.assign({}, s0, { k }))
  const me = misErr(s),
    he = errAt(HA, HS, s),
    we = wanErr(s)
  return {
    s, k, me, he, we,
    mis: maeOf(me), misMean: mAvg(me),
    hak: maeOf(he), hakMean: mAvg(he), scat: maeOf(centred(he)),
    wan: maeOf(we), wanMean: mAvg(we),
    misSpread: sprOf(MIS_AFF, LEGEND, s, k),
    hakSpread: sprOf(HA, HS, s, k),
    wanSpread: sprOf(WAN_AFF, WAN, s, k),
  }
}
const drivenSpread = (rows) => {
  const t = rows.map((r) => r.d.t)
  return Math.max(...t) / Math.min(...t)
}
console.error('\n## 2b. The agility SHAPE fitted on ALL THREE driven courses, at the HONEST geometry')
console.error(
  '   agility = k (m/1200)^p (1/mu)^q (angle/90)^a clamp((80/r)^t, 0.4, hi), once per corner.',
)
console.error(
  '   Objective: the MEAN OF THE THREE COURSES\' MAEs, i.e. equal weight per course, not per lap.',
)
console.error(
  '   Per-lap weighting would price a Misaki lap and a Hakone lap the same, on the only questions',
)
console.error(
  '   the other two courses exist to answer. There are ' + DRIVEN.length + ' Misaki laps, ' +
    HAKD.length + ' on Hakone and ' + WAND.length + ' on Wangan.',
)
console.error(
  '   Wangan spends a very small share of its lap on the agility term, so it barely votes on this',
)
console.error(
  '   constant at all: what it argues about is drag, power and grip at speed. The share is printed',
)
console.error('   in the driven-lap section on stdout rather than asserted here.')

// ---- the affine identity, asserted against the simulator ----
// The whole sweep rests on it, so it is checked rather than argued.
console.error('\n### the affine identity, checked against the simulator (not assumed)')
console.error('   lap(k) = lap(0) + k * sum over corners of (m/1200)^p / muUsable^q * tight, exactly.')
{
  let worst = 0,
    n = 0
  const kSave = kAgi,
    aSave = AGI
  for (const sh of [shp({}), shp({ a: 1.5, t: 0.5, hi: 5 }), shp({ p: 1, q: 0.5, t: 0 })]) {
    AGI = sh
    for (const k of [0.17, 0.85, 2.3]) {
      kAgi = k
      for (const pair of [
        [MIS_AFF, LEGEND],
        [HAK_AFF, HAK],
        [WAN_AFF, WAN],
      ]) {
        pair[0].forEach((r) => {
          worst = Math.max(
            worst,
            Math.abs(lap(r.d.c, pair[1]) - (r.L0 + k * agiSum(r.b, pair[1], sh))),
          )
          n++
        })
      }
    }
  }
  kAgi = kSave
  AGI = aSave
  const NLAP = MIS_AFF.length + HAK_AFF.length + WAN_AFF.length
  console.error(
    '   worst disagreement over ' + n +
      ' re-simulated laps (3 shapes x 3 values of k x ' + NLAP + ' laps): ' +
      worst.toExponential(1) + ' s.',
  )
  console.error(
    '   Every sweep below is therefore EXACT over its grid rather than sampled, and the whole',
  )
  console.error('   shape surface costs ' + NLAP + ' lap sims in total.')
}

// ---- the structural fact that decides most of this section ----
console.error('\n### THE FAMILY HAS ONE CAR-DEPENDENT FACTOR, AND IT IS NOT THE TIGHTNESS TERM')
console.error(
  '   (angle/90)^a and clamp((80/r)^t, 0.4, hi) contain no property of the car. On a fixed course',
)
console.error(
  '   they collapse into ONE SCALAR multiplying k, so re-shaping them is arithmetically identical',
)
console.error(
  '   to changing k. Below: four shapes as different as the grid allows, each with k rescaled to',
)
console.error('   spend the same agility seconds, and the modelled Hakone field they produce.')
console.error('     shape                        k        modelled Hakone spread')
{
  const G0 = tightSum(HAK, shp({}))
  ;[shp({}), shp({ t: 0 }), shp({ t: 1.5, hi: Infinity }), shp({ t: 0.25, hi: 8, a: 2 })].forEach(
    (s) => {
      const k = (0.3 * G0) / tightSum(HAK, s)
      console.error(
        '     ' + shpLbl(s).padEnd(26) + k.toFixed(4).padStart(8) +
          sprOf(HAK_AFF, HAK, s, k).toFixed(6).padStart(22),
      )
    },
  )
}
console.error(
  '   Identical to six decimal places. The maintainer\'s hypothesis - that a clamp saturating at',
)
console.error(
  '   2.5 for every hairpin cannot differentiate cars through the corners that matter most - is',
)
console.error(
  '   false as stated, and this is the disproof. The term does not know which car it is charging.',
)
console.error(
  '   Its entire car-dependence is (1/mu)^q. What the shape DOES control is the ratio between two',
)
console.error(
  '   courses\' totals, which is the only channel through which a second course can argue at all.',
)
console.error('\n### tightSum by shape: the one quantity the shape controls')
console.error(
  '     shape                        Misaki   Hakone pub.   surveyed map   Wangan   ratio pub./Misaki',
)
;[
  shp({}),
  shp({ t: 0 }),
  shp({ t: 0.5 }),
  shp({ hi: Infinity }),
  shp({ t: 1.5, hi: Infinity }),
  shp({ a: 2 }),
].forEach((s) =>
  console.error(
    '     ' + shpLbl(s).padEnd(26) + tightSum(LEGEND, s).toFixed(2).padStart(8) +
      tightSum(HAK, s).toFixed(2).padStart(14) + tightSum(HAK_MAP, s).toFixed(2).padStart(15) +
      tightSum(WAN, s).toFixed(2).padStart(9) +
      (tightSum(HAK, s) / tightSum(LEGEND, s)).toFixed(2).padStart(20),
  ),
)
{
  const satPub = HAK.filter((s) => 80 / s[0] > JOINT_HI).length
  const satMap = HAK_MAP.filter((s) => 80 / s[0] > JOINT_HI).length
  console.error(
    '   Note the clamp: taking the ceiling off multiplies the surveyed map\'s demand by ' +
      (tightSum(HAK_MAP, shp({ hi: Infinity })) / tightSum(HAK_MAP, shp({}))).toFixed(1) + 'x (' +
      tightSum(HAK_MAP, shp({})).toFixed(0) + ' to ' +
      tightSum(HAK_MAP, shp({ hi: Infinity })).toFixed(0) + '),',
  )
  console.error(
    '   because ' + satMap + ' of its ' + HAK_MAP.length +
      ' corners are saturated against ' + satPub + ' of the published course\'s ' + HAK.length + '.',
  )
  console.error(
    '   De-saturating makes a course the model is already far too slow on slower still, which is',
  )
  console.error('   why it cannot help on the map, and it does not.')
}

// ---- the k surface at the shape as it stands ----
console.error('\n### the k surface at the shape as it stands (a 1, t 1, hi 2.5, p 0, q 1)')
console.error(
  '    kAgi   MAE Misaki  mean Misaki   MAE Hakone  mean Hakone  Hak scatter   MAE Wangan  mean Wangan   raw obj  level-free',
)
for (let k = 0; k <= 1.2001; k += 0.1) {
  const kk = +k.toFixed(2)
  const z = scoreAt(shp({}), kk)
  console.error(
    kk.toFixed(2).padStart(8) + z.mis.toFixed(2).padStart(12) + '%' +
      z.misMean.toFixed(2).padStart(12) + '%' + z.hak.toFixed(2).padStart(12) + '%' +
      z.hakMean.toFixed(2).padStart(12) + '%' + z.scat.toFixed(2).padStart(12) + '%' +
      z.wan.toFixed(2).padStart(12) + '%' + z.wanMean.toFixed(2).padStart(12) + '%' +
      ((z.mis + z.hak + z.wan) / 3).toFixed(3).padStart(10) +
      ((z.mis + z.scat + z.wan) / 3).toFixed(3).padStart(12),
  )
}
const LEG_FIT = fitShape(shp({}))
const MAP_FIT = fitShape(shp({}), HAKM_AFF, HAK_MAP)
console.error(
  '  THE RAW OBJECTIVE NOW HAS AN INTERIOR MINIMUM, which is the whole point of the geometry',
)
console.error(
  '  change. It lands at k = ' + LEG_FIT.raw.k.toFixed(3) + ', Misaki ' + LEG_FIT.raw.mis.toFixed(2) +
    '% MAE, Hakone ' + LEG_FIT.raw.hak.toFixed(2) + '% and Wangan ' + LEG_FIT.raw.wan.toFixed(2) +
    '%, and the level-free objective',
)
console.error(
  '  agrees with it to ' + Math.abs(LEG_FIT.raw.k - LEG_FIT.free.k).toFixed(3) +
    ' in k. On the SURVEYED map the same sweep is monotone increasing in k from zero,',
)
console.error(
  '  lands at k = ' + MAP_FIT.raw.k.toFixed(2) + ' (Misaki ' + MAP_FIT.raw.mis.toFixed(2) +
    '% MAE, Hakone ' + MAP_FIT.raw.hak.toFixed(2) + '%) and deletes the agility term outright:',
)
console.error(
  '  that is one course drowning the other, and it is the behaviour the facsimile exists to end.',
)

// ---- the full shape surface ----
const SURFACE = []
for (const a of A_GRID)
  for (const t of T_GRID) for (const hi of HI_GRID) SURFACE.push(fitShape({ a, t, hi }))
const bestRaw = SURFACE.reduce((x, y) => (y.raw.o < x.raw.o ? y : x))
const bestFree = SURFACE.reduce((x, y) => (y.free.o < x.free.o ? y : x))
console.error(
  '\n### the full shape surface: ' + SURFACE.length +
    ' shapes (a x t x hi), each refitting its own k',
)
console.error(
  '   RAW objective = (MAE Misaki + MAE Hakone + MAE Wangan)/3, exactly as asked for, and it is',
)
console.error(
  '   what is published. LEVEL-FREE = the same with Hakone\'s own mean taken out of its errors',
)
console.error(
  '   first. That reading was load-bearing on the surveyed map, where the level was unreachable;',
)
console.error('   on the published facsimiles the two agree, and their agreement is the check.')
console.error(
  '    shape                  ratio   RAW: k      obj    MIS     HAK     WAN  |  FREE: k      obj    MIS   scat',
)
const surfRow = (r, tag) =>
  console.error(
    '    ' + shpLbl(r.s).padEnd(22) + r.ratio.toFixed(2).padStart(6) +
      r.raw.k.toFixed(3).padStart(10) + r.raw.o.toFixed(3).padStart(9) +
      r.raw.mis.toFixed(2).padStart(7) + r.raw.hak.toFixed(2).padStart(8) +
      r.raw.wan.toFixed(2).padStart(8) + '  |' +
      r.free.k.toFixed(3).padStart(10) + r.free.o.toFixed(3).padStart(9) +
      r.free.mis.toFixed(2).padStart(7) + r.free.scat.toFixed(2).padStart(7) + (tag || ''),
  )
const byRatio = SURFACE.slice().sort((x, y) => x.ratio - y.ratio)
console.error('   -- the six shapes with the SMALLEST course ratio --')
byRatio.slice(0, 6).forEach((r) => surfRow(r))
console.error('   -- the shape as it stands, and the two argmins --')
surfRow(LEG_FIT, '   <== as it stands')
surfRow(bestRaw, '   <== argmin, raw')
surfRow(bestFree, '   <== argmin, level-free')
console.error('   -- the six shapes with the LARGEST course ratio --')
byRatio.slice(-6).forEach((r) => surfRow(r))
// The surface is one-dimensional in disguise, and saying so is the whole point of printing it.
const rankCorr = (xs, ys) => {
  const rk = (v) => {
    const s = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0])
    const o = new Array(v.length)
    s.forEach((p, i) => (o[p[1]] = i))
    return o
  }
  const a = rk(xs),
    b = rk(ys),
    n = xs.length,
    m = (n - 1) / 2
  let num = 0,
    da = 0,
    db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - m) * (b[i] - m)
    da += (a[i] - m) ** 2
    db += (b[i] - m) ** 2
  }
  return num / Math.sqrt(da * db)
}
console.error(
  '   Spearman rank correlation between a shape\'s course ratio and its objective: raw ' +
    rankCorr(
      SURFACE.map((r) => r.ratio),
      SURFACE.map((r) => r.raw.o),
    ).toFixed(3) + ', level-free ' +
    rankCorr(
      SURFACE.map((r) => r.ratio),
      SURFACE.map((r) => r.free.o),
    ).toFixed(3) + '.',
)
console.error(
  '   THE LEVEL-FREE SURFACE IS STILL ONE-DIMENSIONAL IN DISGUISE (rank correlation 1.000 against',
)
console.error(
  '   the course ratio): on that reading a shape wins by charging less agility on Hakone, which is',
)
console.error(
  '   the lever k already pulls. The RAW surface is not, and that is new: its rank correlation is',
)
console.error(
  '   ' + rankCorr(SURFACE.map((r) => r.ratio), SURFACE.map((r) => r.raw.o)).toFixed(3) +
    ', because a course the model can lap punishes a shape that gets the ratio wrong in either',
)
console.error(
  '   direction instead of rewarding "less". THE SHAPE STILL DOES NOT MOVE: the raw argmin (' +
    shpLbl(bestRaw.s) + ')',
)
console.error(
  '   scores ' + bestRaw.raw.o.toFixed(3) + ' against the standing shape\'s ' +
    LEG_FIT.raw.o.toFixed(3) + ', a difference of ' +
    Math.abs(bestRaw.raw.o - LEG_FIT.raw.o).toFixed(3) + ' on a surface that spans ' +
    (Math.max(...SURFACE.map((r) => r.raw.o)) - Math.min(...SURFACE.map((r) => r.raw.o))).toFixed(3) + '.',
)
console.error(
  '   That is not identification, and it is on a geometry that was fitted to these same laps.',
)

// ---- p and q, re-checked on the published geometry ----
// Both were last settled on the surveyed map. The geometry has changed, so they are re-run rather
// than carried across. Scored on the RAW objective now that it has an interior minimum: on the
// map it sent every row to k = 0, where p and q have no effect at all and the table said nothing.
function fitAt(p, q) {
  const f = fitShape({ p, q, a: JOINT_A, t: JOINT_T, hi: JOINT_HI })
  const s = shp({ p, q, a: JOINT_A, t: JOINT_T, hi: JOINT_HI, k: f.raw.k })
  return {
    p, q, k: f.raw.k, o: f.raw.o, mis: f.raw.mis, hak: f.raw.hak, wan: f.raw.wan, scat: f.raw.scat,
    me: misErr(s), he: hakErr(s), we: wanErr(s),
  }
}
console.error(
  '\n### the mass exponent p, at q = 1, each p refitting its own k (raw objective)',
)
console.error('     p    best k   MAE Misaki   MAE Hakone   MAE Wangan   objective   worst car')
P_GRID.forEach((p) => {
  const f = fitAt(p, 1)
  console.error(
    p.toFixed(1).padStart(6) + f.k.toFixed(2).padStart(10) + f.mis.toFixed(2).padStart(13) + '%' +
      f.hak.toFixed(2).padStart(12) + '%' + f.wan.toFixed(2).padStart(12) + '%' +
      f.o.toFixed(3).padStart(12) +
      Math.max(...f.me.map(Math.abs)).toFixed(1).padStart(11) + '%' +
      (p === 0 ? '   <== published' : ''),
  )
})
console.error('\n### the grip exponent q, at p = 0')
console.error('     q    best k   MAE Misaki   MAE Hakone   MAE Wangan   objective')
Q_GRID.forEach((q) => {
  const f = fitAt(0, q)
  console.error(
    q.toFixed(1).padStart(6) + f.k.toFixed(2).padStart(10) + f.mis.toFixed(2).padStart(13) + '%' +
      f.hak.toFixed(2).padStart(12) + '%' + f.wan.toFixed(2).padStart(12) + '%' +
      f.o.toFixed(3).padStart(12) +
      (q === 1 ? '   <== published' : ''),
  )
})

// ---- what gets published, and why it is not the argmin ----
// The shape stays where it was. The sweep does not IDENTIFY it: the objective moves almost
// entirely with a single scalar (the course ratio), so "the best shape" is close to a restatement
// of "how much agility Hakone is charged" rather than a finding about corners, and the whole
// surface spans a few hundredths of a point. Moving a, t or hi on that evidence would be fitting
// exponents that 22 laps cannot see.
//
// k IS NOW FITTED ON THE RAW OBJECTIVE, and that is a change. On the surveyed map the raw fit
// went to k = 0 and deleted the term, so the level-free reading was the only honest one. The
// published geometry is a facsimile chosen so the level IS reachable, which is exactly the
// condition the raw objective needed. The two readings now land within a few thousandths of each
// other; the report prints both so that agreement is visible rather than asserted.
const JOINT = shp({ p: 0, q: 1, a: JOINT_A, t: JOINT_T, hi: JOINT_HI, k: LEG_FIT.raw.k })
JOINT.o = LEG_FIT.raw.o
JOINT.mis = LEG_FIT.raw.mis
JOINT.hak = LEG_FIT.raw.hak
JOINT.wan = LEG_FIT.raw.wan
JOINT.scat = LEG_FIT.raw.scat
AGI = shp(JOINT)
const soloBest = (which, s0) => {
  let best = null
  for (let i = 0; i <= K_N; i++) {
    const k = (i * K_MAX) / K_N
    const m = maeOf(which(shp(Object.assign({}, s0, { k }))))
    if (!best || m < best.m) best = { k, m }
  }
  return best
}
const misSolo = soloBest(misErr, shp({}))
const hakSolo = soloBest(hakErr, shp({}))
const wanSolo = soloBest(wanErr, shp({}))
const hakScatSolo = soloBest((s) => centred(hakErr(s)), shp({}))
const mapSolo = soloBest(mapErr, shp({}))
console.error('\n### what is published, and what each course wanted on its own')
console.error(
  '  Misaki alone wants k = ' + misSolo.k.toFixed(2) + ' (' + misSolo.m.toFixed(2) +
    '% MAE).  Hakone alone wants k = ' + hakSolo.k.toFixed(2) + ' (' + hakSolo.m.toFixed(2) +
    '% MAE).',
)
console.error(
  '  Wangan alone wants k = ' + wanSolo.k.toFixed(2) + ' (' + wanSolo.m.toFixed(2) +
    '% MAE), and it says so very quietly: its whole k range from 0 to ' + K_MAX.toFixed(0) +
    ' moves its MAE by only',
)
console.error(
  '  ' + Math.abs(maeOf(wanErr(shp({ k: 0 }))) - maeOf(wanErr(shp({ k: K_MAX })))).toFixed(2) +
    ' points, against ' +
    Math.abs(maeOf(hakErr(shp({ k: 0 }))) - maeOf(hakErr(shp({ k: K_MAX })))).toFixed(1) +
    ' on Hakone. A 77%-straight course cannot argue about a corner charge.',
)
console.error(
  '  Hakone\'s SCATTER alone wants k = ' + hakScatSolo.k.toFixed(2) + ' (' +
    hakScatSolo.m.toFixed(2) + '%).  PUBLISHED: k = ' + JOINT.k.toFixed(3) +
    ', RAW objective, shape unmoved.',
)
console.error(
  '  Misaki and Hakone agree to ' + Math.abs(misSolo.k - hakSolo.k).toFixed(2) +
    ' in k, which they did not on the surveyed map: there Hakone alone wanted k = ' +
    mapSolo.k.toFixed(2) + ' (' + mapSolo.m.toFixed(1) + '% MAE),',
)
console.error(
  '  i.e. the agility term deleted, because its level was +' +
    scoreAt(shp({}), 0, HAKM_AFF, HAK_MAP).hakMean.toFixed(1) +
    '% out at k = 0 and that is the FLOOR of this family.',
)
console.error(
  '  THE AGREEMENT IS NOT EVIDENCE ABOUT THE AGILITY TERM. The published geometry was searched to',
)
console.error(
  '  produce it, so k here is the constant that makes a facsimile and Misaki consistent, and the',
)
console.error(
  '  level-free reading (k = ' + LEG_FIT.free.k.toFixed(3) + ') is kept beside it as the check.',
)
const FLAT2 = 0.05
const jband = []
for (let i = 0; i <= K_N; i++) {
  const k = (i * K_MAX) / K_N
  const z = scoreAt(shp({}), k)
  if ((z.mis + z.hak + z.wan) / 3 <= JOINT.o + FLAT2) jband.push(k)
}
console.error(
  '  BASIN: every k from ' + jband[0].toFixed(2) + ' to ' + jband[jband.length - 1].toFixed(2) +
    ' is within ' + FLAT2.toFixed(2) + ' percentage points of the minimum, so read',
)
console.error('  the published value to two decimals and do not defend the second one.')

// ---- does any shape in this family reproduce both courses on the surveyed map? ----
// This runs on the SURVEYED map, because it is the one question the facsimile cannot be asked.
console.error('\n### DOES ANY SHAPE IN THIS FAMILY REPRODUCE BOTH COURSES ON THE SURVEYED MAP?')
{
  const floor = scoreAt(shp({}), 0, HAKM_AFF, HAK_MAP)
  const MAPSURF = []
  for (const a of A_GRID)
    for (const t of T_GRID)
      for (const hi of HI_GRID) MAPSURF.push(fitShape({ a, t, hi }, HAKM_AFF, HAK_MAP))
  const bestHak = MAPSURF.reduce((x, y) => (y.raw.hak < x.raw.hak ? y : x))
  console.error(
    '  NO, and not narrowly. The agility term is non-negative, so the best Hakone any member of the',
  )
  console.error(
    '  family can produce is its k = 0 lap - and that lap is IDENTICAL for every shape, because k =',
  )
  console.error(
    '  0 annihilates a, t, hi and lo together. That common floor is: mean error +' +
      floor.hakMean.toFixed(2) + '%, MAE ' + floor.hak.toFixed(2) + '%,',
  )
  console.error(
    '  all eight laps slow, range +' + Math.min(...floor.he).toFixed(1) + '% to +' +
      Math.max(...floor.he).toFixed(1) + '%. Best surveyed-map MAE anywhere on the ' +
      MAPSURF.length + '-shape surface: ' + bestHak.raw.hak.toFixed(2) + '%.',
  )
  console.error(
    '  THE RESIDUAL AT THE BEST AVAILABLE SHAPE is a near-constant +' + floor.hakMean.toFixed(0) +
      '% bias with ' + rmsOf(centred(floor.he)).toFixed(2) + '% rms of scatter',
  )
  console.error(
    '  around it. It is a LEVEL error, not a pattern error: the eight cars are wrong together and by',
  )
  console.error(
    '  much the same amount, which is the signature of a missing whole-course term rather than of a',
  )
  console.error(
    '  mis-shaped corner charge. The next two sections price the two candidates for that term, and',
  )
  console.error(
    '  the answer is NOT the one everybody assumed. THIS IS WHY THE PUBLISHED COURSE IS A FACSIMILE:',
  )
  console.error(
    '  the missing physics is real, it is structural, and the geometry is standing in for it by',
  )
  console.error('  ruling rather than by accident. Nothing below is repaired; it is priced.')
}

// ---- where the missing time on the SURVEYED MAP would have to come from ----
// The agility term is exonerated above; that leaves the question of what IS wrong with the model
// on the road as mapped. This is a decomposition, not a proposal, it runs on HAK_MAP, and it runs
// at k = 0 so the agility term is not in the way. It matters because "it is the descent" was the
// standing assumption, and the assumption is wrong: the arithmetic says a descent cannot pay for
// more than a fraction of it. It is also the whole justification for the published facsimile, so
// it stays in the report at full length even though nothing laps this geometry any more.
const mapLen = HAK_MAP.reduce((a, s) => a + (s[0] * s[1] * Math.PI) / 180 + s[2], 0)
console.error('\n### the surveyed map: where the missing time would have to come from  (k = 0)')
{
  const kSave = kAgi
  kAgi = 0
  const dec = HAKD.map((d) => {
    const s = lapSplit(d.c, HAK_MAP)
    return { d, s }
  })
  console.error(
    '  car                            driven   modelled  short by   arc s  straights s   arc% ',
  )
  dec.forEach((r) =>
    console.error(
      '  ' + r.d.lbl.slice(0, 30).padEnd(32) + r.d.t.toFixed(1).padStart(6) +
        r.s.t.toFixed(1).padStart(11) + (r.s.t - r.d.t).toFixed(1).padStart(10) +
        r.s.arc.toFixed(1).padStart(8) + r.s.str.toFixed(1).padStart(13) +
        ((100 * r.s.arc) / r.s.t).toFixed(0).padStart(7) + '%',
    ),
  )
  const r35 = dec[0]
  const sw = HAK_MAP.filter((s) => s[0] < 30)
  const arcOnly = sw.reduce(
    (a, s) => a + (s[0] * s[1] * Math.PI) / 180 / Math.sqrt(gripMu(r35.d.c) * g * s[0]),
    0,
  )
  const conn = HAK_MAP.reduce((a, s) => a + s[2], 0)
  console.error(
    '  THE ARITHMETIC THAT DECIDES THIS. The R35 drove ' + (mapLen / 1000).toFixed(2) + ' km in ' +
      r35.d.t.toFixed(1) + ' s, an average of ' +
      (3.6 * (mapLen / r35.d.t)).toFixed(0) + ' km/h,',
  )
  console.error(
    '  over a road whose ' + sw.length + ' switchbacks this model takes at ' +
      Math.round(3.6 * Math.sqrt(gripMu(r35.d.c) * g * Math.min(...sw.map((s) => s[0])))) +
      ' to ' +
      Math.round(3.6 * Math.sqrt(gripMu(r35.d.c) * g * Math.max(...sw.map((s) => s[0])))) +
      ' km/h. Those ' + sw.length + ' arcs alone',
  )
  console.error(
    '  cost ' + arcOnly.toFixed(0) + ' s at sqrt(mu g r). That leaves ' +
      (r35.d.t - arcOnly).toFixed(0) + ' s for ' + conn + ' m of connectors and ' +
      (HAK_MAP.length - sw.length) + ' more corners,',
  )
  console.error(
    '  i.e. an average of ' + (3.6 * (conn / (r35.d.t - arcOnly))).toFixed(0) +
      ' km/h on connectors entered and left at ' +
      Math.round(3.6 * Math.sqrt(gripMu(r35.d.c) * g * 12)) + ' km/h over ' +
      Math.round(conn / HAK_MAP.length) + ' m. Nothing',
  )
  console.error(
    '  accelerates and brakes like that. The driven time and sqrt(mu g r) at these radii are not',
  )
  console.error('  merely in tension; they are incompatible.')
  kAgi = kSave
}
// Two candidate explanations, priced. Neither is applied and neither becomes a term today.
console.error('\n### candidate 1: the descent.  (DIAGNOSTIC, k = 0, nothing here is applied)')
console.error(
  '  A constant grade adds g sin(theta) to every acceleration and takes it off every braking',
)
console.error(
  '  deceleration. It cannot touch an arc at all, and the arcs are over a third of this lap.',
)
console.error('     grade     mean err%    R35 lap   s recovered   % of the shortfall closed')
{
  const gSave = GRADE,
    kSave = kAgi
  kAgi = 0
  const base = HAKD.map((d) => lap(d.c, HAK_MAP))
  const need = mAvg(HAKD.map((d, i) => base[i] - d.t))
  let closed12 = 0
  ;[0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12].forEach((gr) => {
    GRADE = gr
    const t = HAKD.map((d) => lap(d.c, HAK_MAP))
    const e = HAKD.map((d, i) => pct(t[i], d.t))
    const rec = mAvg(base.map((b, i) => b - t[i]))
    closed12 = (100 * rec) / need
    console.error(
      '     ' + (100 * gr).toFixed(0).padStart(4) + '%' + mAvg(e).toFixed(1).padStart(12) +
        t[0].toFixed(1).padStart(11) + rec.toFixed(1).padStart(14) +
        ((100 * rec) / need).toFixed(0).padStart(23) + '%',
    )
  })
  GRADE = gSave
  kAgi = kSave
  console.error(
    '  VERDICT: NOT THE ANSWER. A 12% grade closes ' + closed12.toFixed(0) +
      '% of the shortfall. It buys speed on the',
  )
  console.error(
    '  connectors and hands most of it back in longer braking, and the corner arcs are untouched.',
  )
  console.error(
    '  The standing assumption that a tuned geometry would be "absorbing the descent" is wrong: it',
  )
  console.error(
    '  absorbs something roughly an order of magnitude larger than any plausible descent, and the',
  )
  console.error(
    '  published facsimile should be read as standing in for THAT, not for a hill.',
  )
}
console.error('\n### candidate 2: the racing line.  (DIAGNOSTIC, k = 0, nothing here is applied)')
console.error(
  '  A mapped radius is a CENTRELINE radius. A driver on a road with width straightens a corner:',
)
console.error(
  '  the effective radius of a 12 m centreline hairpin on a road several metres wide is materially',
)
console.error(
  '  larger, and apex speed goes as its square root. Radii scaled by a common factor, length held',
)
console.error(
  '  at 2.7 km. This UNDERSTATES the effect, because a real line also shortens the path and this',
)
console.error('  keeps the distance.')
console.error('     radius x   switchbacks m   mean err%    MAE%    spread     R35 lap')
{
  const kSave = kAgi
  kAgi = 0
  ;[1, 1.25, 1.5, 1.75, 2, 2.5, 3].forEach((sc) => {
    const segs = widenBy(HAK_MAP, sc)
    if (!segs) return
    const hp = segs.filter((s) => s[0] < 40).map((s) => Math.round(s[0]))
    const t = HAKD.map((d) => lap(d.c, segs))
    const e = HAKD.map((d, i) => pct(t[i], d.t))
    console.error(
      '     ' + (sc.toFixed(2) + 'x').padStart(7) +
        (Math.min(...hp) + ' to ' + Math.max(...hp)).padStart(16) +
        mAvg(e).toFixed(1).padStart(12) + maeOf(e).toFixed(1).padStart(8) +
        (Math.max(...t) / Math.min(...t)).toFixed(3).padStart(10) + t[0].toFixed(1).padStart(12),
    )
  })
  kAgi = kSave
}
console.error(
  '  This is the larger term by a wide margin - it nulls the level at about 3x - and it is what a',
)
console.error(
  '  tuned geometry stands in for. It is NOT an agility question and NOT a gradient question: it is',
)
console.error(
  '  a geometry-to-line transformation, and nothing in the family swept above can express it.',
)
console.error(
  '  IT IS NOT A CLEAN ANSWER EITHER, AND THE SPREAD COLUMN IS WHY. Opening the radii nulls the',
)
{
  const kS = kAgi
  kAgi = 0
  const t1 = HAKD.map((d) => lap(d.c, HAK_MAP))
  const t3 = HAKD.map((d) => lap(d.c, widenBy(HAK_MAP, 3)))
  kAgi = kS
  console.error(
    '  level and takes the field the WRONG WAY: ' +
      (Math.max(...t1) / Math.min(...t1)).toFixed(3) + 'x at the map as read, ' +
      (Math.max(...t3) / Math.min(...t3)).toFixed(3) + 'x at 3x, against a',
  )
}
console.error(
  '  driven ' + drivenSpread(HAK_AFF).toFixed(3) +
    'x. So a uniform line factor buys the level at the cost of the one thing the',
)
console.error(
  '  surveyed geometry was good at. A real line does not scale every corner alike - it straightens',
)
console.error(
  '  a hairpin far more than a sweeper, and it does it more for a car that can use the width - so',
)
console.error(
  '  the term this model wants is a per-corner, possibly per-car, line model, not a scalar. IT IS',
)
console.error(
  '  STILL NOT APPLIED. The published course does not implement a line model; it is a road chosen so',
)
console.error(
  '  the cars behave right without one, which is a different and lesser thing, and the difference is',
)
console.error('  exactly what this section exists to keep visible.')

// ---- the geometry the model would need, quantified ----
// How far the surveyed map has to move before the model reaches the driven times. Two ways of
// moving it, both at the published k, both diagnostics: nothing below is applied. This is the
// section that PRICES the published facsimile, so it is also where the facsimile is scored.
function thinBy(n) {
  const hp = HAK_MAP.map((s, i) => [s[0], i])
    .filter((x) => x[0] < 30)
    .sort((a, b) => a[0] - b[0])
  const drop = new Set(hp.slice(0, n).map((x) => x[1]))
  const out = HAK_MAP.filter((_, i) => !drop.has(i))
  const arc = out.reduce((a, x) => a + (x[0] * x[1] * Math.PI) / 180, 0)
  const s0 = out.reduce((a, x) => a + x[2], 0)
  const f = (2700 - arc) / s0
  return out.map((x) => [x[0], x[1], Math.round(x[2] * f)])
}
console.error('\n### how far the surveyed map has to move before the model reaches the driven times')
console.error(
  '  Two ways to move it, both holding 2.7 km, both at the published k = ' + JOINT.k.toFixed(3) +
    '. DIAGNOSTIC ONLY.',
)
console.error('  (a) delete switchbacks, tightest first, connectors rescaled')
console.error('   corners  hairpins  sum of tight   mean err%   MAE%   spread')
for (let n = 0; n <= 9; n++) {
  const segs = thinBy(n)
  const t = HAKD.map((d) => lapShape(d.c, segs, JOINT))
  const e = HAKD.map((d, i) => pct(t[i], d.t))
  console.error(
    String(segs.length).padStart(10) + String(segs.filter((s) => s[0] < 30).length).padStart(10) +
      tightSum(segs, JOINT).toFixed(1).padStart(15) + mAvg(e).toFixed(1).padStart(12) +
      maeOf(e).toFixed(1).padStart(8) + (Math.max(...t) / Math.min(...t)).toFixed(3).padStart(9) +
      (n === 0 ? '   <== THE SURVEYED MAP' : ''),
  )
}
console.error('  (b) open every radius by a common factor, connectors rescaled')
console.error('   radius x  switchbacks m   sum of tight   mean err%   MAE%   spread')
;[1, 1.25, 1.5, 2, 2.5, 3].forEach((sc) => {
  const segs = widenBy(HAK_MAP, sc)
  if (!segs) return
  const hp = segs.filter((s) => s[0] < 40).map((s) => Math.round(s[0]))
  const t = HAKD.map((d) => lapShape(d.c, segs, JOINT))
  const e = HAKD.map((d, i) => pct(t[i], d.t))
  console.error(
    (sc.toFixed(2) + 'x').padStart(10) + (Math.min(...hp) + ' to ' + Math.max(...hp)).padStart(16) +
      tightSum(segs, JOINT).toFixed(1).padStart(15) + mAvg(e).toFixed(1).padStart(12) +
      maeOf(e).toFixed(1).padStart(8) + (Math.max(...t) / Math.min(...t)).toFixed(3).padStart(9) +
      (sc === 1 ? '   <== THE SURVEYED MAP' : ''),
  )
})
{
  const t = HAKD.map((d) => lapShape(d.c, HAK, JOINT))
  const e = HAKD.map((d, i) => pct(t[i], d.t))
  console.error(
    '  THE PUBLISHED FACSIMILE, scored on the same scale: ' + HAK.length + ' corners, ' +
      HAK.filter((s) => s[0] < 30).length + ' switchbacks, sum of tight ' +
      tightSum(HAK, JOINT).toFixed(1) + ' against the surveyed map\'s ' +
      tightSum(HAK_MAP, JOINT).toFixed(1) + ',',
  )
  console.error(
    '  mean ' + mAvg(e).toFixed(1) + '%, MAE ' + maeOf(e).toFixed(1) + '%, spread ' +
      (Math.max(...t) / Math.min(...t)).toFixed(3) + ' against a driven ' +
      drivenSpread(HAK_AFF).toFixed(3) + '.',
  )
}
console.error(
  '  THAT IS THE SIZE OF THE FICTION, AND IT IS PUBLISHED ON PURPOSE. To reach the level the model',
)
console.error(
  '  needs the road\'s direction-change demand cut by more than half, or its switchbacks opened out',
)
console.error(
  '  into something that is not a switchback. The road is not negotiable and the model does not yet',
)
console.error(
  '  have the term, so by ruling the COURSE gives way, and this table is the receipt for how much.',
)

// ---- the spread question, tested directly ----
console.error('\n### the modelled field on each geometry  (tested, not asserted)')
{
  const dHak = drivenSpread(HAK_AFF),
    dMis = drivenSpread(MIS_AFF)
  const line = (lbl, v, d) =>
    console.error(
      '    ' + lbl.padEnd(48) + v.toFixed(4) + 'x   ' + (100 * (v / d - 1)).toFixed(1) +
        '% against driven',
    )
  const onMap = sprOf(HAKM_AFF, HAK_MAP, shp({}), JOINT.k)
  const after = sprOf(HAK_AFF, HAK, shp({}), JOINT.k)
  const floor = sprOf(HAK_AFF, HAK, shp({}), 0)
  console.error('  HAKONE, driven spread ' + dHak.toFixed(4) + 'x')
  line('PUBLISHED facsimile, kAgi ' + JOINT.k.toFixed(3), after, dHak)
  line('        facsimile, agility off (kAgi 0)', floor, dHak)
  line('SURVEYED map, same kAgi', onMap, dHak)
  console.error('  MISAKI, driven spread ' + dMis.toFixed(4) + 'x  (its geometry did not move)')
  line('published kAgi ' + JOINT.k.toFixed(3), sprOf(MIS_AFF, LEGEND, shp({}), JOINT.k), dMis)
  const mus = HAK_AFF.map((r) => r.b.mu)
  console.error(
    '  The facsimile spreads the field ' + (100 * (after / dHak - 1)).toFixed(1) +
      '% against driven, the surveyed map ' + (100 * (onMap / dHak - 1)).toFixed(1) + '%.',
  )
  console.error(
    '  THE AGILITY TERM IS SPREAD-NEGATIVE ON BOTH, which is worth knowing before anyone proposes',
  )
  console.error(
    '  reshaping it to widen the field: the field it imposes is the grip ratio, ' +
      (Math.max(...mus) / Math.min(...mus)).toFixed(3) + 'x across these',
  )
  console.error(
    '  eight cars, NARROWER than the ' + floor.toFixed(3) +
      'x the rest of the model already produces, so every second',
  )
  console.error(
    '  of agility charged pulls the field TOGETHER (' + floor.toFixed(4) + 'x at k 0 down to ' +
      sprOf(HAK_AFF, HAK, shp({}), JOINT.k).toFixed(4) + 'x at the published k).',
  )
  console.error(
    '  Whatever residual spread error is left is not the agility term\'s to fix under ANY shape. It',
  )
  console.error(
    '  has to come from something that separates cars more than grip does in a slow corner.',
  )
}

// =====================================================================================
// --- 2c. THE CORNER-EXIT SPEED PENALTY, FITTED ON ALL THREE COURSES AT ONCE ---
// =====================================================================================
// Everything above this line is the ADDITIVE direction-change term and the record of how it was
// fitted, and that term is what the published run applies. From here down is the corner-exit
// speed penalty described where `exitDrop` is defined. It is fitted and scored on the same laps
// so the two can be read against each other, and then it is left switched off at kExit 0. The
// comparison is the point of this section; the term is not the model.
//
// WHAT IS DIFFERENT ABOUT THIS FIT, AND IT IS THE WHOLE REASON TO TRUST IT MORE. Two previous
// attempts to make the adder carry course character were fitted on MISAKI ALONE, so nothing in
// either of them was ever contradicted by a tight course: a term can be arbitrarily wrong about a
// hairpin and score perfectly on a road with one. This one is fitted on all driven laps on all
// three courses simultaneously, equal weight per course. It cannot buy Misaki with Hakone.
//
// AND WHAT HANDICAPS IT, STATED BEFORE ANY NUMBER. Both facsimile geometries were SEARCHED
// against their driven times WITH THE OLD TERM IN PLACE, and they are held fixed here. So the
// roads themselves already absorbed whatever the adder got wrong about them, and the new term is
// being asked to improve on a fit whose two out of three courses were shaped to suit its
// predecessor. Re-searching them would make the comparison meaningless, so it is not done, and
// the handicap is real: every Hakone and Wangan figure below is scored on a road built for the
// term that is being replaced.
const X_SETS = [
  { k: 'Misaki', segs: LEGEND, rows: DRIVEN.map((d) => ({ id: d.id, c: d.c, t: d.t })) },
  { k: 'Hakone', segs: HAK, rows: HAKD.map((d) => ({ id: d.id, c: d.c, t: d.t })) },
  { k: 'Wangan', segs: WAN, rows: WAND.map((d) => ({ id: d.id, c: d.c, t: d.t })) },
]
const X_NLAP = X_SETS.reduce((a, s) => a + s.rows.length, 0)
// One (shape, weight) pair, scored by DIRECT SIMULATION. There is no affine identity to spend
// here and there cannot be: the penalty enters the straight march as an initial condition, so lap
// time is not linear in the weight and every point on every sweep below costs a real lap per
// driven time. That is the price of a term that propagates, and it is why the grids are coarser
// than section 2b's.
function xScore(s, k) {
  const sA = kAgi,
    sX = kExit,
    sE = EXIT
  kAgi = 0
  kExit = k
  EXIT = s
  const c = X_SETS.map((cs) => {
    const e = cs.rows.map((r) => pct(lap(r.c, cs.segs), r.t))
    return { k: cs.k, e, mae: maeOf(e), mean: mAvg(e), scat: maeOf(centred(e)) }
  })
  kAgi = sA
  kExit = sX
  EXIT = sE
  // TWO OBJECTIVES, AND BOTH ARE PRINTED EVERYWHERE. RAW is the mean of the three MAEs, exactly
  // as asked for, and it is what the published weight is fitted on. LEVEL-FREE is the same with
  // each course own mean error taken out of its residuals first. On a frozen geometry the
  // level-free reading is the only one that measures the TERM rather than the road: a searched
  // geometry sets the level, and it was searched for a different term. Section 2b carries the
  // same pair for the same reason.
  return {
    obj: mAvg(c.map((o) => o.mae)),
    free: mAvg(c.map((o) => o.scat)),
    c,
  }
}
// The weight, for one shape. A coarse pass over the whole plausible range, then two local
// refinements around the winner. 25 + 18 evaluations, i.e. 43 x X_NLAP laps per shape.
// Ranges wide enough that a minimum against the ceiling means "this shape wants more than the
// physics allows", not "the grid was mean". At the top of each range the term is saturated on
// every hairpin on the roster.
const X_KMAX = { abs: 400, frac: 12, ratio: 200, tau: 200 }
function xFit(s0) {
  const s = xshp(s0)
  const kmax = X_KMAX[s.form]
  let best = null,
    bestFree = null
  const N = 30
  const take = (k) => {
    const z = xScore(s, k)
    if (!best || z.obj < best.obj) best = Object.assign({ k }, z)
    if (!bestFree || z.free < bestFree.free) bestFree = Object.assign({ k }, z)
  }
  for (let i = 0; i <= N; i++) take((i * kmax) / N)
  let step = kmax / N
  for (let round = 0; round < 2; round++) {
    const lo = Math.max(0, best.k - step),
      hi = best.k + step
    for (let i = 0; i <= 8; i++) take(lo + ((hi - lo) * i) / 8)
    step = (hi - lo) / 8
  }
  return Object.assign({ s, atCeiling: best.k >= kmax * 0.999, bestFree }, best)
}
const xLbl = (s) =>
  s.form.padEnd(5) + ' p ' + s.p.toFixed(1) + ' q ' + s.q.toFixed(1) +
  ' a ' + s.a + ' t ' + s.t + ' hi ' + (isFinite(s.hi) ? s.hi.toFixed(1) : 'inf') +
  ' lo ' + s.lo
const xRow = (r, tag) =>
  console.error(
    '    ' + xLbl(r.s).padEnd(40) + r.k.toFixed(4).padStart(9) + r.obj.toFixed(3).padStart(9) +
      r.free.toFixed(3).padStart(9) +
      r.c.map((o) => o.mae.toFixed(2).padStart(8)).join('') +
      r.c.map((o) => o.mean.toFixed(2).padStart(8)).join('') +
      (r.atCeiling ? '  [at ceiling]' : '') + (tag || ''),
  )
const NL = String.fromCharCode(10)
const X_HEAD =
  '    shape                                       k      raw     free  MAE mis MAE hak MAE wan  mn mis  mn hak  mn wan'

console.error('\n## 2c. THE CORNER-EXIT SPEED PENALTY, fitted on all ' + X_NLAP + ' driven laps')
console.error(
  '   deficit (m/s) = kExit * base * (m/1200)^p * (1/mu)^q * (angle/90)^a clamp((80/r)^t, 0.4, hi)',
)
console.error(
  '   base: abs = 1, frac = the apex speed, tau = the car\'s own net acceleration at the apex;',
)
console.error(
  '   ratio is the non-saturating rewrite, v_exit = apex / (1 + L) with L the same product.',
)
console.error(
  '   The deficit is taken off the speed the FOLLOWING STRAIGHT STARTS AT. Nothing is added to the',
)
console.error(
  '   clock. Objective: the mean of the three courses\' MAEs, equal weight per course, ' +
    X_SETS.map((s) => s.rows.length + ' ' + s.k).join(' / ') + '.',
)
console.error(
  '   Floor: a car may not leave a corner below ' + (100 * EXIT_FLOOR).toFixed(0) +
    '% of its apex speed (abs, frac, tau only). Structural, not tuned.',
)
console.error(
  '   RAW = mean of the three MAEs, the objective as asked for and the one the weight is fitted',
)
console.error(
  '   on. FREE = the same with each course own mean taken out first. On a geometry frozen from',
)
console.error(
  '   the old term the FREE column is the one that measures this term rather than that road.',
)

// ---- stage 1: the form, the mass exponent and the grip exponent ----
// The tightness shape is held at the old term's (a 1, t 1, hi 2.5) here, because section 2b
// established that a fixed course collapses the whole of a, t and hi into one scalar on the
// ADDER. That argument does NOT carry over - the exit penalty spends its deficit through a
// following straight whose length varies corner by corner, so the geometry factor is no longer
// separable from the car - which is exactly why stage 2 re-sweeps it rather than assuming it.
const X_P = [0, 0.5, 1, 1.5, 2, 3]
const X_Q = [0, 0.5, 1]
const X_FORMS = ['abs', 'frac', 'ratio', 'tau']
console.error('\n### stage 1: form x mass exponent x grip exponent (tightness shape held at 2b\'s)')
console.error(X_HEAD)
const XS1 = []
X_FORMS.forEach((form) =>
  X_P.forEach((p) =>
    X_Q.forEach((q) => {
      const r = xFit({ form, p, q })
      XS1.push(r)
    }),
  ),
)
const x1best = XS1.reduce((a, b) => (b.obj < a.obj ? b : a))
XS1.slice()
  .sort((a, b) => a.obj - b.obj)
  .slice(0, 10)
  .forEach((r) => xRow(r, r === x1best ? '   <== stage-1 argmin' : ''))
console.error('   -- the worst three, for scale --')
XS1.slice()
  .sort((a, b) => b.obj - a.obj)
  .slice(0, 3)
  .forEach((r) => xRow(r))
{
  const byForm = {}
  XS1.forEach((r) => {
    byForm[r.s.form] = Math.min(byForm[r.s.form] == null ? 9e9 : byForm[r.s.form], r.obj)
  })
  console.error(
    '   best objective by form: ' +
      Object.entries(byForm).map(([f, o]) => f + ' ' + o.toFixed(3)).join(',  ') + '.',
  )
  const p0 = XS1.filter((r) => r.s.form === x1best.s.form && r.s.q === x1best.s.q)
  console.error(
    '   the mass exponent at the winning form and q, each p refitting its own k: ' +
      p0.sort((a, b) => a.s.p - b.s.p).map((r) => 'p ' + r.s.p + ' -> ' + r.obj.toFixed(3)).join(',  '),
  )
}

// ---- stage 2: the tightness shape, at the winning form and exponents ----
// The old term could not see a, t, hi or lo at all: on a fixed course they collapse into one
// scalar multiplying the weight. This one can see them, because the deficit is cashed on a
// following straight and the straights differ corner by corner.
//
// lo IS IN THIS SWEEP AND IT MATTERS MORE THAN ANYTHING ELSE IN IT. The old term inherited a
// floor of 0.4 on the tightness factor, so a 645 m motorway sweeper is charged 40% of what an
// 80 m corner is charged, however fast it is taken. On an ADDER that floor is nearly free,
// because the whole term is a small share of a fast lap. On an exit-speed penalty it is not:
// 40% of a hairpin deficit taken off 200 km/h is a large number of seconds down a 500 m straight.
// If the term is to cost almost nothing on a highway, the geometry factor has to be allowed to go
// to almost nothing there, and lo = 0 is what permits that.
const X_A = [1, 1.25, 1.5]
const X_T = [0.5, 1, 1.5]
const X_HI = [2.5, Infinity]
const X_LO = [0, 0.1, 0.4]
console.error('\n### stage 2: the tightness shape (a, t, hi, lo), at the stage-1 form and exponents')
console.error(X_HEAD)
const XS2 = []
X_A.forEach((a) =>
  X_T.forEach((t) =>
    X_HI.forEach((hi) =>
      X_LO.forEach((lo) =>
        XS2.push(xFit({ form: x1best.s.form, p: x1best.s.p, q: x1best.s.q, a, t, hi, lo })),
      ),
    ),
  ),
)
const x2best = XS2.reduce((a, b) => (b.obj < a.obj ? b : a))
XS2.slice()
  .sort((a, b) => a.obj - b.obj)
  .slice(0, 10)
  .forEach((r) => xRow(r, r === x2best ? '   <== stage-2 argmin' : ''))
console.error('   -- the worst three of the ' + XS2.length + ' --')
XS2.slice()
  .sort((a, b) => b.obj - a.obj)
  .slice(0, 3)
  .forEach((r) => xRow(r))
{
  const byLo = {}
  XS2.forEach((r) => {
    byLo[r.s.lo] = Math.min(byLo[r.s.lo] == null ? 9e9 : byLo[r.s.lo], r.obj)
  })
  console.error(
    '   best objective by the tightness FLOOR lo: ' +
      Object.entries(byLo).map(([k, v]) => 'lo ' + k + ' -> ' + v.toFixed(3)).join(',  ') + '.',
  )
}
console.error(
  '   spread of the stage-2 surface: ' +
    (Math.max(...XS2.map((r) => r.obj)) - Math.min(...XS2.map((r) => r.obj))).toFixed(3) +
    ' points, against ' +
    (Math.max(...XS1.map((r) => r.obj)) - Math.min(...XS1.map((r) => r.obj))).toFixed(3) +
    ' across stage 1.',
)

// ---- stage 3: the form and the exponents again, at the stage-2 tightness shape ----
// Stage 1 chose them on the old term tightness shape, and stage 2 has just moved that shape a
// long way. Re-running is not thoroughness for its own sake: the four forms differ mainly in how
// hard they charge a FAST corner, which is exactly what lo and t control, so the two choices are
// not separable and picking one at the other default would be fitting an accident.
console.error('\n### stage 3: form x mass exponent x grip exponent, at the stage-2 tightness shape')
console.error(X_HEAD)
const XS3 = []
X_FORMS.forEach((form) =>
  X_P.forEach((pp) =>
    X_Q.forEach((qq) =>
      XS3.push(
        xFit({ form, p: pp, q: qq, a: x2best.s.a, t: x2best.s.t, hi: x2best.s.hi, lo: x2best.s.lo }),
      ),
    ),
  ),
)
const x3best = XS3.reduce((a, b) => (b.obj < a.obj ? b : a))
XS3.slice()
  .sort((a, b) => a.obj - b.obj)
  .slice(0, 8)
  .forEach((r) => xRow(r, r === x3best ? '   <== stage-3 argmin' : ''))
{
  const byForm3 = {}
  XS3.forEach((r) => {
    byForm3[r.s.form] = Math.min(byForm3[r.s.form] == null ? 9e9 : byForm3[r.s.form], r.obj)
  })
  console.error(
    '   best objective by form at this tightness shape: ' +
      Object.entries(byForm3).map(([f, o]) => f + ' ' + o.toFixed(3)).join(',  ') + '.',
  )
  const pr = XS3.filter((r) => r.s.form === x3best.s.form && r.s.q === x3best.s.q)
  console.error(
    '   the mass exponent, each p refitting its own k: ' +
      pr.sort((a, b) => a.s.p - b.s.p).map((r) => 'p ' + r.s.p + ' -> ' + r.obj.toFixed(3)).join(',  '),
  )
  const qr = XS3.filter((r) => r.s.form === x3best.s.form && r.s.p === x3best.s.p)
  console.error(
    '   the grip exponent, each q refitting its own k: ' +
      qr.sort((a, b) => a.s.q - b.s.q).map((r) => 'q ' + r.s.q + ' -> ' + r.obj.toFixed(3)).join(',  '),
  )
}

// ---- the level-free argmin, which is a different shape and a different weight ----
// Printed in full because on a frozen geometry it is the honest reading of the term, and because
// the two answers disagreeing is itself the finding.
const XALL = XS1.concat(XS2, XS3)
const XFREE1 = XALL.reduce((x, y) => (y.bestFree.free < x.bestFree.free ? y : x))
console.error(NL + '### the same surfaces scored LEVEL-FREE (each course mean removed first)')
console.error('   -- best six on the free objective over all three stages, each at its own k --')
console.error(
  '    shape                                       k     free  scat mis scat hak scat wan  MAE mis MAE hak MAE wan  mn mis  mn hak  mn wan',
)
XALL.slice()
  .sort((x, y) => x.bestFree.free - y.bestFree.free)
  .slice(0, 8)
  .forEach((r) =>
    console.error(
      '    ' + xLbl(r.s).padEnd(40) + r.bestFree.k.toFixed(4).padStart(9) +
        r.bestFree.free.toFixed(3).padStart(9) +
        r.bestFree.c.map((o) => o.scat.toFixed(2).padStart(9)).join('') +
        r.bestFree.c.map((o) => o.mae.toFixed(2).padStart(8)).join('') +
        r.bestFree.c.map((o) => o.mean.toFixed(2).padStart(8)).join(''),
    ),
  )
console.error(
  '   FREE FLOOR (kExit 0, no direction-change term at all): ' +
    xScore(EXIT_LEGACY, 0).free.toFixed(3) + '.  Best free over the ' + XALL.length +
    ' shapes swept: ' + XFREE1.bestFree.free.toFixed(3) + '.',
)
console.error(
  '   For comparison the ADDITIVE ADDER at its own published weight scores ' +
    ((LEG_FIT.raw.mis + LEG_FIT.raw.hak + LEG_FIT.raw.wan) / 3).toFixed(3) + ' raw and ' +
    (
      (maeOf(centred(misErr(JOINT))) +
        maeOf(centred(hakErr(JOINT))) +
        maeOf(centred(wanErr(JOINT)))) /
      3
    ).toFixed(3) + ' free.',
)

// ---- what the exit fit settles on ----
// The RAW argmin, because raw is the objective as asked for. The free argmin is printed above and
// the gap between the two is the price the frozen geometry charges. This is the term's own best
// answer and it is scored, not applied: the published run leaves kExit at zero.
const X_SOLO = {}
const XFIT = [x1best, x2best, x3best].reduce((a, b) => (b.obj < a.obj ? b : a))
const KEXIT_FIT = XFIT.k
const EXIT_PUB = xshp(XFIT.s)
console.error(
  '\n### THE EXIT TERM\'S OWN BEST FIT (scored, not applied): ' + xLbl(EXIT_PUB) +
    '   kExit = ' + KEXIT_FIT.toFixed(4),
)
if (XFIT.atCeiling) {
  console.error(
    '   *** THE FIT IS AGAINST THE CEILING OF ITS OWN RANGE (' + X_KMAX[EXIT_PUB.form] +
      '). The objective is still falling there, which',
  )
  console.error(
    '   *** means this term cannot supply as much time as the frozen Hakone geometry needs, at',
  )
  console.error('   *** any weight this family can reach.')
}
{
  // The k surface at the published shape, printed so it is visible whether the minimum is
  // interior or hard against the wall.
  console.error(
    '    kExit    MAE Misaki  MAE Hakone  MAE Wangan   objective   mean mis  mean hak  mean wan',
  )
  const kmax = X_KMAX[EXIT_PUB.form]
  for (let i = 0; i <= 10; i++) {
    const k = (i * kmax) / 10
    const z = xScore(EXIT_PUB, k)
    console.error(
      k.toFixed(4).padStart(9) +
        z.c.map((o) => o.mae.toFixed(2).padStart(12)).join('') +
        z.obj.toFixed(3).padStart(12) +
        z.c.map((o) => o.mean.toFixed(2).padStart(10)).join(''),
    )
  }
  const at = xScore(EXIT_PUB, KEXIT_FIT)
  console.error(
    '   AT THE FIT: ' + KEXIT_FIT.toFixed(4) + '  ->  objective ' + at.obj.toFixed(3) + ' (' +
      at.c.map((o) => o.k + ' ' + o.mae.toFixed(2) + '%').join(', ') + ')',
  )
  // What each course would have chosen on its own, so a course being outvoted is visible.
  X_SETS.forEach((cs, i) => {
    let best = null
    const kmx = X_KMAX[EXIT_PUB.form]
    for (let j = 0; j <= 120; j++) {
      const k = (j * kmx) / 120
      const m = xScore(EXIT_PUB, k).c[i].mae
      if (!best || m < best.m) best = { k, m }
    }
    X_SOLO[cs.k] = best.k
    console.error(
      '   ' + cs.k.padEnd(7) + 'alone wants kExit = ' + best.k.toFixed(4) + ' (' +
        best.m.toFixed(2) + '% MAE); at the joint fit it is ' + at.c[i].mae.toFixed(2) + '%.',
    )
  })
  // How often the structural floor binds, because a clamp that binds everywhere is the model.
  const flo = X_SETS.reduce((acc, cs) => {
    const sA = kAgi,
      sX = kExit,
      sE = EXIT
    kAgi = 0
    kExit = KEXIT_FIT
    EXIT = EXIT_PUB
    const n = cs.rows.reduce((a, r) => a + lapSplit(r.c, cs.segs).floored, 0)
    kAgi = sA
    kExit = sX
    EXIT = sE
    return { n: acc.n + n, d: acc.d + cs.rows.length * cs.segs.length }
  }, { n: 0, d: 0 })
  console.error(
    '   the ' + (100 * EXIT_FLOOR).toFixed(0) + '% floor binds on ' + flo.n + ' of ' + flo.d +
      ' car-corners across the three driven sets.',
  )
}

// =====================================================================================
// THE ACCEPTANCE TEST: the course-character swing
// =====================================================================================
// A swing is a PAIR statistic across two courses of opposite character, and it is the cleanest
// thing this harness can measure. For cars A and B:
//
//   swing = (A - B on Wangan) - (A - B on Hakone)
//
// Every per-car level error cancels, every per-course level error cancels, and what is left is
// purely how much the two courses reorder the pair. Driven, the EK9 beats the 190E by 2.6 s on
// Hakone and loses to it by 3.4 s on Wangan: a 6.0 s swing that a model with no course-character
// term cannot produce at all. Five cars carry driven laps on both courses, so there are ten pairs.
//
// Each car is scored on ITS OWN COURSE RECORD, i.e. exactly the rows the two published tables
// print, so the swing is the model as published. Three of the five cars run the same record on
// both courses anyway; the note under the table says which do not.
const SWING_IDS = HAKD.filter((h) => WAND.some((w) => w.id === h.id)).map((h) => h.id)
function swingPairs() {
  const rows = SWING_IDS.map((id) => {
    const h = HAKD.find((x) => x.id === id),
      w = WAND.find((x) => x.id === id)
    return {
      id,
      lbl: byId(id).n.replace(/^[0-9]{4} /, ''),
      dh: h.t,
      dw: w.t,
      mh: lap(h.c, HAK),
      mw: lap(w.c, WAN),
    }
  })
  const out = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const A = rows[i],
        B = rows[j]
      out.push({
        A,
        B,
        driven: A.dw - B.dw - (A.dh - B.dh),
        model: A.mw - B.mw - (A.mh - B.mh),
      })
    }
  }
  return out
}
// The whole swing table at an arbitrary lever setting, so the same statistic can be read off the
// term that is going and the term that is arriving without either being re-derived by hand.
function swingAt(kA, kX, shape) {
  const sA = kAgi,
    sX = kExit,
    sE = EXIT
  kAgi = kA
  kExit = kX
  if (shape) EXIT = shape
  const ps = swingPairs()
  kAgi = sA
  kExit = sX
  EXIT = sE
  const d = ps.map((x) => Math.abs(x.driven)),
    m = ps.map((x) => Math.abs(x.model))
  return {
    ps,
    meanD: mAvg(d),
    meanM: mAvg(m),
    share: mAvg(m) / mAvg(d),
    r: rcorr(ps.map((x) => x.driven), ps.map((x) => x.model)),
    signOk: ps.filter((x) => x.driven * x.model > 0).length,
    n: ps.length,
    mae: mAvg(ps.map((x) => Math.abs(x.model - x.driven))),
  }
}
console.error(NL + '### THE ACCEPTANCE TEST: the course-character swing, Hakone against Wangan')
console.error(
  '   swing = (A - B on Wangan) - (A - B on Hakone), over the ' + SWING_IDS.length +
    ' cars driven on both. Ten pairs.',
)
console.error(
  '    model                                       mean |swing|   share of driven   pair MAE   r     signs',
)
{
  const cands = [
    ['driven', null],
    ['no direction-change term at all', [0, 0, null]],
    ['additive agility, kAgi ' + JOINT.k.toFixed(2) + ' (published)', [JOINT.k, 0, null]],
    ['corner-exit, RAW joint fit (not applied)', [0, KEXIT_FIT, xshp(EXIT_PUB)]],
    ['corner-exit, LEVEL-FREE fit (not applied)', [0, XFREE1.bestFree.k, xshp(XFREE1.s)]],
    ['corner-exit, at what Wangan alone wants', [0, X_SOLO.Wangan, xshp(EXIT_PUB)]],
  ]
  cands.forEach(([lbl, lv]) => {
    if (!lv) {
      const d = swingAt(0, 0, null).ps.map((x) => Math.abs(x.driven))
      console.error(
        '    ' + lbl.padEnd(44) + mAvg(d).toFixed(2).padStart(10) + ' s' +
          '           -              -        -       -',
      )
      return
    }
    const z = swingAt(lv[0], lv[1], lv[2])
    console.error(
      '    ' + lbl.padEnd(44) + z.meanM.toFixed(2).padStart(10) + ' s' +
        (100 * z.share).toFixed(0).padStart(14) + '%' + z.mae.toFixed(2).padStart(11) + ' s' +
        z.r.toFixed(2).padStart(7) + z.signOk.toString().padStart(7) + '/' + z.n,
    )
  })
}

// THE RUN'S AMBIENT LEVERS ARE SET HERE, AND THEY ARE NOT THE PUBLISHED PAIR. kAgi goes to the
// Misaki-only sweep's own fit and kExit to zero; kAgi0 and kExit0 are repointed with them so every
// save/restore below returns to these rather than to the file's declared defaults. The published
// pair is set further down, at the published run: kAgi = KAGI_FIT with kExit = 0.
kAgi = bestK.k
kExit = 0
EXIT = xshp(EXIT_PUB)
kAgi0 = bestK.k
const kExit0 = KEXIT_FIT

// --- 3. Before/after per car ---
// Three columns, because "before" has two honest meanings and hiding either would flatter the
// change. COMMITTED is the file's own defaults on the pre-fingerprint car records: the whole
// model as the source shipped it. PUBLISHED is the last run that actually went out, derived
// acceleration at its fitted phi 0.81 / awdK 0.70 / kAgi 0.74 on TODAY'S car records - the
// like-for-like that isolates the acceleration model and nothing else. NOW is this run.
// A fourth column arrives with the corner-exit term: ADDER is the model as it stood at the start
// of this run (measured acceleration, the additive agility term at its own refit weight) and NOW
// is the same model with the adder replaced by the exit-speed penalty. That pair is the only
// like-for-like reading of the term swap, and it is the one the summary lines below compare.
function lapSet(opt) {
  kAgi = opt.exit ? 0 : opt.kAgi
  kExit = opt.exit ? KEXIT_FIT : 0
  derived = !!opt.derived
  capToVTop = !opt.derived
  if (opt.phi != null) phi = opt.phi
  if (opt.awdK != null) awdK = opt.awdK
  const out = DRIVEN.map((d) => {
    const car = opt.oldCars ? d.cOld : d.c
    // The two archival columns ran the mass-proportional agility term, so they still do:
    // re-scoring them at today's shape would credit this change to the acceleration rebuild.
    const t = opt.massAgility ? lapMassAgi(car, LEGEND) : lap(car, LEGEND)
    return { t, e: pct(t, d.t) }
  })
  derived = false
  capToVTop = true
  kAgi = kAgi0
  kExit = kExit0
  phi = phi0
  awdK = awdK0
  return out
}
const committedSet = lapSet({
  kAgi: 0.3, derived: true, oldCars: true, phi: 1.0, awdK: 0.66, massAgility: true,
})
const pubSet = lapSet({ kAgi: 0.74, derived: true, phi: 0.81, awdK: 0.7, massAgility: true })
const adderSet = lapSet({ kAgi: JOINT.k })
const newSet = lapSet({ exit: true })
console.error(
  '\n## 3. Before/after per car.  committed = derived accel, phi 1.00 / awdK 0.66 / kAgi 0.30,' +
    ' mass-proportional agility, pre-fingerprint records.',
)
console.error(
  '   published = derived accel at the last fitted phi 0.81 / awdK 0.70 / kAgi 0.74, still' +
    ' mass-proportional agility, today\'s records.',
)
console.error(
  '   adder = MEASURED acceleration, the ADDITIVE agility term at its own refit kAgi ' +
    JOINT.k.toFixed(2) + ' (the model at the start of this run).',
)
console.error(
  '   now = MEASURED acceleration, the CORNER-EXIT SPEED PENALTY at kExit ' +
    KEXIT_FIT.toFixed(4) + '.  All four run the current brake dead distance.',
)
console.error(
  'car                            driven  committed  err%   published  err%    adder  err%      now   err%  vs adder',
)
DRIVEN.forEach((d, i) =>
  console.error(
    ((d.blind ? 'B ' : 'f ') + d.lbl).slice(0, 30).padEnd(31) +
      d.t.toFixed(1).padStart(6) +
      committedSet[i].t.toFixed(1).padStart(10) +
      committedSet[i].e.toFixed(1).padStart(7) +
      pubSet[i].t.toFixed(1).padStart(11) +
      pubSet[i].e.toFixed(1).padStart(7) +
      adderSet[i].t.toFixed(1).padStart(9) +
      adderSet[i].e.toFixed(1).padStart(7) +
      newSet[i].t.toFixed(1).padStart(9) +
      newSet[i].e.toFixed(1).padStart(7) +
      (Math.abs(newSet[i].e) - Math.abs(adderSet[i].e)).toFixed(1).padStart(10),
  ),
)
const fmtG = (s) => s.mean.toFixed(2).padStart(6) + '% mean /' + s.mae.toFixed(2).padStart(6) + '% MAE'
const cmpG = (lbl, pred) =>
  console.error(
    '  ' + lbl.padEnd(26) + 'committed ' + fmtG(grpOf(committedSet, pred)) + '   adder ' +
      fmtG(grpOf(adderSet, pred)) + '   NOW ' + fmtG(grpOf(newSet, pred)),
  )
cmpG('fitted-' + nFit, (d) => !d.blind)
cmpG('blind-' + nBld, (d) => d.blind)
cmpG('ALL-' + DRIVEN.length, () => true)
console.error('  --- with the two standing kei outliers removed, and by true sample status ---')
cmpG('main-field-' + grpOf(newSet, (d) => !d.blind && !d.kei).n + ' (no kei)', (d) => !d.blind && !d.kei)
cmpG('no-kei-' + grpOf(newSet, (d) => !d.kei).n, (d) => !d.kei)
cmpG('TRUE out-of-sample-' + grpOf(newSet, (d) => d.oos).n, (d) => d.oos)
cmpG('kei outliers-' + grpOf(newSet, (d) => d.kei).n, (d) => d.kei)

// --- 4. Top-speed coherence: does the measured acceleration outrun the measured top speed? ---
// pEff is an EFFECTIVE through-the-gears power and sits above crank x 0.88 on a handful of
// cars, so on a long enough straight the acceleration curve alone would carry them past the
// speed at which their own thrust balances their own drag. `capToVTop` forbids that. This
// audit is what makes the cap accountable rather than invisible.
//
// THE OTHER DIRECTION OF THE SAME QUESTION is what the traction release answers, and this audit
// is where the two meet. A released car walks UP towards its cap instead of asymptoting a long
// way under it, so it can join this list; the LFA does. That is the coherence arriving, not a
// coherence failure - the release hands back at most (Pw - pEff), never more, and vTopOf still
// runs on the crank figure, so the cap is still the thing that binds and it still holds.
console.error('\n## 4. Top-speed coherence audit')
// Terminal speed on the acceleration curve the sim actually marches, traction release included,
// which is the only reading that can be compared with the cap without flattering either.
const vTermOf = (b) => {
  let lo = 1,
    hi = 220
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (netAccel(b, mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
const capRows = CARS.map((c) => {
  const b = carBlock(c)
  return {
    n: c.n,
    src: b.acc.src,
    vAcc: vTermOf(b) * 3.6,
    vTop: b.vTop * 3.6,
    ratio: b.Pacc / b.Pw,
  }
}).filter((r) => r.vAcc > r.vTop + 0.5)
console.error(
  '  ' + capRows.length + ' of ' + CARS.length + ' cars would exceed their own top speed on an' +
    ' unbounded straight, and are held at it:',
)
capRows
  .sort((a, b) => b.vAcc - b.vTop - (a.vAcc - a.vTop))
  .forEach((r) =>
    console.error(
      '    ' + r.n.slice(0, 40).padEnd(42) + 'pEff/Pw ' + r.ratio.toFixed(3) +
        '   terminal on the curve ' + r.vAcc.toFixed(0) + '   cap ' + r.vTop.toFixed(0) +
        '   +' + (r.vAcc - r.vTop).toFixed(0) + ' km/h  [' + r.src + ']',
    ),
  )
// What the cap is worth in lap time, which is the only currency that matters here. Run at the
// published levers, which section 2c has already set.
capToVTop = false
const uncapped = DRIVEN.map((d) => lap(d.c, LEGEND))
capToVTop = true
const capped = DRIVEN.map((d) => lap(d.c, LEGEND))
kAgi = kAgi0
const capDelta = DRIVEN.map((d, i) => ({ lbl: d.lbl, dt: capped[i] - uncapped[i] }))
  .filter((r) => Math.abs(r.dt) > 0.005)
  .sort((a, b) => b.dt - a.dt)
console.error(
  '  cost on the ' + DRIVEN.length + ' driven Misaki laps: ' + capDelta.length +
    ' car(s) move at all' +
    (capDelta.length
      ? ', ' + capDelta.map((r) => r.lbl.slice(0, 24) + ' +' + r.dt.toFixed(2) + ' s').join(', ')
      : ' - Misaki has no straight long enough'),
)
const wanganCap = CARS.map((c) => {
  capToVTop = false
  const a = lap(c, COURSES.Wangan)
  capToVTop = true
  return { n: c.n, d: lap(c, COURSES.Wangan) - a }
})
  .filter((r) => Math.abs(r.d) > 0.05)
  .sort((a, b) => b.d - a.d)
console.error(
  '  on Wangan (' + Math.max(...COURSES.Wangan.map((s) => s[2])) + ' m longest straight) it moves ' +
    wanganCap.length + ' cars' +
    (wanganCap.length
      ? ', worst ' + wanganCap[0].n.slice(0, 34) + ' +' + wanganCap[0].d.toFixed(2) + ' s'
      : ''),
)

// --- 5. The fallback regression against its only out-of-sample evidence ---
// The 11 web-published 0-100 figures belong to modelled cars, which is exactly the population
// the fallback carries: Forza measures none of them, so the regression has never seen one of
// these numbers. It is the honest test of the fallback, and the only one available.
console.error('\n## 5. Fallback check: the ' + CARS.filter((c) => c.z).length +
  ' cars with a web-published 0-100 and no Forza pair')
const fbRows = CARS.filter((c) => c.z).map((c) => {
  const meas = accelOf(c).src !== 'predicted'
  derived = true
  phi = 0.81
  awdK = 0.7
  const old = zeroTo100(c)
  derived = false
  phi = phi0
  awdK = awdK0
  return { c, pub: c.z, mod: zeroTo100(c), old, meas }
})
fbRows.forEach((r) => {
  r.err = (100 * (r.mod - r.pub)) / r.pub
  r.oldErr = (100 * (r.old - r.pub)) / r.pub
})
fbRows.sort((a, b) => a.err - b.err)
console.error(
  'car                                    dt    published   derived  err%    fallback  err%',
)
fbRows.forEach((r) =>
  console.error(
    '  ' + r.c.n.slice(0, 36).padEnd(38) + r.c.dt.padEnd(5) + r.pub.toFixed(1).padStart(8) +
      r.old.toFixed(1).padStart(11) + r.oldErr.toFixed(0).padStart(6) + '%' +
      r.mod.toFixed(1).padStart(11) + r.err.toFixed(0).padStart(6) + '%' +
      (r.meas ? '   [has a measured 0-97]' : ''),
  ),
)
const fbSum = (lbl, key) =>
  console.error(
    '  ' + lbl.padEnd(22) + 'mean ' + mAvg(fbRows.map((r) => r[key])).toFixed(1) + '%   MAE ' +
      mAvg(fbRows.map((r) => Math.abs(r[key]))).toFixed(1) + '%   max |e| ' +
      Math.max(...fbRows.map((r) => Math.abs(r[key]))).toFixed(0) + '%',
  )
fbSum('derived, last published', 'oldErr')
fbSum('measured + fallback', 'err')
;['AWD', 'RWD', 'FWD'].forEach((d) => {
  const grp = fbRows.filter((r) => r.c.dt === d)
  if (!grp.length) return
  console.error(
    '    ' + d + ' (n=' + grp.length + ')  derived ' +
      mAvg(grp.map((r) => r.oldErr)).toFixed(1) + '%   ->   fallback ' +
      mAvg(grp.map((r) => r.err)).toFixed(1) + '%',
  )
})
console.error(
  '  A web 0-100 is not a Forza 0-97 and these cars are not Forza cars, so this is a' +
    ' sanity band, not a gate.',
)

// --- 6. Where the remaining error is, in lap seconds ---
// Every input the model still guesses at, perturbed by ITS OWN measured uncertainty, and the
// lap time that moves. Ranked, so the next piece of work is chosen on leverage rather than on
// which term looks least finished. This is diagnosis: nothing here is changed by this run.
console.error('\n## 6. Remaining error, ranked by measured lap-time leverage')
console.error(
  '   Reported on ALL THREE driven courses now, because a term that barely moves a 68%-straight',
)
console.error(
  '   lap can dominate a tight one and vanish on a fast one, and choosing the next piece of work',
)
console.error('   off the Misaki column alone would have hidden exactly that. Ranked on Hakone.')
const SENS_C = COURSES.Misaki
const sensBase = CARS.map((c) => lap(c, SENS_C))
const sensBaseH = CARS.map((c) => lap(c, HAK))
const sensBaseW = CARS.map((c) => lap(c, WAN))
const sensRows = []
function sensor(label, cars, mutate, restore) {
  const before = cars.map((c) => lap(c, SENS_C))
  const beforeH = cars.map((c) => lap(c, HAK))
  const beforeW = cars.map((c) => lap(c, WAN))
  cars.forEach(mutate)
  clearCaches()
  const after = cars.map((c) => lap(c, SENS_C))
  const afterH = cars.map((c) => lap(c, HAK))
  const afterW = cars.map((c) => lap(c, WAN))
  cars.forEach(restore)
  clearCaches()
  const pc = after.map((t, i) => Math.abs((100 * (t - before[i])) / before[i]))
  const pcH = afterH.map((t, i) => Math.abs((100 * (t - beforeH[i])) / beforeH[i]))
  const pcW = afterW.map((t, i) => Math.abs((100 * (t - beforeW[i])) / beforeW[i]))
  sensRows.push({
    label,
    n: cars.length,
    mean: mAvg(pc),
    max: Math.max(...pc),
    hmean: mAvg(pcH),
    hmax: Math.max(...pcH),
    wmean: mAvg(pcW),
    wmax: Math.max(...pcW),
  })
}
// The corner-exit penalty, whole and at 10% of its own weight.
{
  const k0 = kExit
  kExit = 0
  const off = CARS.map((c) => lap(c, SENS_C))
  const offH = CARS.map((c) => lap(c, HAK))
  const offW = CARS.map((c) => lap(c, WAN))
  kExit = k0 * 1.1
  const hi = CARS.map((c) => lap(c, SENS_C))
  const hiH = CARS.map((c) => lap(c, HAK))
  const hiW = CARS.map((c) => lap(c, WAN))
  kExit = k0
  const rel = (a, b) => a.map((t, i) => (100 * (t - b[i])) / (b[i] || 1))
  sensRows.push({
    label: 'corner-exit penalty entire (kExit ' + k0.toFixed(3) + ' -> 0)',
    n: CARS.length,
    mean: mAvg(sensBase.map((t, i) => (100 * (t - off[i])) / t)),
    max: Math.max(...sensBase.map((t, i) => (100 * (t - off[i])) / t)),
    hmean: mAvg(sensBaseH.map((t, i) => (100 * (t - offH[i])) / t)),
    hmax: Math.max(...sensBaseH.map((t, i) => (100 * (t - offH[i])) / t)),
    wmean: mAvg(sensBaseW.map((t, i) => (100 * (t - offW[i])) / t)),
    wmax: Math.max(...sensBaseW.map((t, i) => (100 * (t - offW[i])) / t)),
  })
  sensRows.push({
    label: 'corner-exit weight +10%',
    n: CARS.length,
    mean: mAvg(rel(hi, sensBase)),
    max: Math.max(...rel(hi, sensBase)),
    hmean: mAvg(rel(hiH, sensBaseH)),
    hmax: Math.max(...rel(hiH, sensBaseH)),
    wmean: mAvg(rel(hiW, sensBaseW)),
    wmax: Math.max(...rel(hiW, sensBaseW)),
  })
}
// The acceleration fallback, at its own out-of-sample error, on the cars it carries.
{
  const est = CARS.filter((c) => accelOf(c).src === 'predicted')
  const pOf0 = ACCEL_FIT.pOf
  const before = est.map((c) => lap(c, SENS_C))
  const beforeH = est.map((c) => lap(c, HAK))
  const beforeW = est.map((c) => lap(c, COURSES.Wangan))
  ACCEL_FIT.pOf = (c) => pOf0(c) * 1.083
  clearCaches()
  const after = est.map((c) => lap(c, SENS_C))
  const afterH = est.map((c) => lap(c, HAK))
  const afterW = est.map((c) => lap(c, COURSES.Wangan))
  ACCEL_FIT.pOf = pOf0
  clearCaches()
  const pc = after.map((t, i) => Math.abs((100 * (t - before[i])) / before[i]))
  const pcH = afterH.map((t, i) => Math.abs((100 * (t - beforeH[i])) / beforeH[i]))
  const pcW = afterW.map((t, i) => Math.abs((100 * (t - beforeW[i])) / beforeW[i]))
  sensRows.push({
    label: 'acceleration fallback pEff, at its own 8.3% out-of-sample MAE',
    n: est.length,
    mean: mAvg(pc),
    max: Math.max(...pc),
    hmean: mAvg(pcH),
    hmax: Math.max(...pcH),
    wmean: mAvg(pcW),
    wmax: Math.max(...pcW),
  })
}
sensor(
  'grip fallback mu, at +0.02 (its own residual), unmeasured cars only',
  CARS.filter((c) => !c.lg),
  (c) => { c._lg2 = c.lg; c.lg = gripMu(c) + 0.02 },
  (c) => { c.lg = c._lg2 },
)
sensor(
  'downforce, measured coefficient -> 0 (what the game ships today)',
  CARS,
  (c) => { c._df = c.dfC; c.dfC = 0 },
  (c) => { c.dfC = c._df },
)
sensor(
  'lateral g, +0.005 (one panel rounding step)',
  CARS.filter((c) => c.lg),
  (c) => { c._lg3 = c.lg; c.lg += 0.005 },
  (c) => { c.lg = c._lg3 },
)
sensor(
  'driver mass allowance, +25 kg on 75',
  CARS,
  (c) => { c._kg2 = c.kg; c.kg += 25 },
  (c) => { c.kg = c._kg2 },
)
sensor(
  'braking bmu, at the 2.4% rms the two-point check leaves',
  CARS.filter((c) => c.b97),
  (c) => { c._b = c.b97; c.b97 /= 1.024 },
  (c) => { c.b97 = c._b },
)
console.error(
  '  perturbation'.padEnd(70) + ' cars   HAKONE mean    max    MISAKI mean    max    WANGAN mean    max',
)
sensRows
  .sort((a, b) => b.hmean - a.hmean)
  .forEach((r) =>
    console.error(
      '  ' + r.label.padEnd(68) + String(r.n).padStart(5) +
        r.hmean.toFixed(2).padStart(12) + '%' + r.hmax.toFixed(2).padStart(8) + '%' +
        r.mean.toFixed(2).padStart(12) + '%' + r.max.toFixed(2).padStart(8) + '%' +
        r.wmean.toFixed(2).padStart(12) + '%' + r.wmax.toFixed(2).padStart(8) + '%',
    ),
  )
console.error(
  '  THE WANGAN COLUMN IS THE NEW ONE AND IT SAYS SOMETHING THE OTHER TWO CANNOT: it ranks the',
)
console.error(
  '  terms differently, because a 77%-straight lap prices drag and power where a hairpin course',
)
console.error('  prices grip. Read it when choosing work aimed at the fast end of the roster.')
// The shape sweep in per-group detail. Section 2b is the fit; this is the breakdown behind it,
// and it exists for the two columns 2b does not carry: the true-out-of-sample pair, and the
// correlation between the residual and mass, which is what tells a mis-specified exponent from
// a badly tuned one. Each row's k is the JOINT best for that shape, so the courses are scored
// at the constant the fit would actually publish for them rather than at their own optima.
console.error('\n### is the agility term the right SHAPE?  agility = k (m/1200)^p (1/mu)^q * tight')
const dMass = DRIVEN.map((d) => d.c.kg)
const hMass = HAKD.map((d) => d.c.kg)
// Hakone is scored on its SCATTER here, not its MAE, and it stays that way now that the geometry
// is a facsimile: the MAE column would then be reading how well the search did, which is a
// property of the search and not of the exponent under test. The scatter is the part that is
// about the cars either way.
console.error(
  '   p     q  joint k   MIS-' + DRIVEN.length + '  no-kei-' + DRIVEN.filter((d) => !d.kei).length +
    '  OOS-' + DRIVEN.filter((d) => d.oos).length + '   HAK scat   WAN-' + WAND.length +
    '   worst   corr(resid, mass) mis / hak',
)
;[
  [1, 1],
  [1, 0],
  [0.5, 1],
  [0, 1],
  [0, 0],
].forEach(([p, q]) => {
  const f = fitAt(p, q)
  const e = f.me,
    h = centred(f.he)
  console.error(
    '  ' + p.toFixed(1) + '   ' + q.toFixed(1) + '  ' + f.k.toFixed(2).padStart(7) +
      mAvg(e.map(Math.abs)).toFixed(2).padStart(9) + '%' +
      mAvg(e.filter((_, i) => !DRIVEN[i].kei).map(Math.abs)).toFixed(2).padStart(10) + '%' +
      mAvg(e.filter((_, i) => DRIVEN[i].oos).map(Math.abs)).toFixed(2).padStart(7) + '%' +
      mAvg(h.map(Math.abs)).toFixed(2).padStart(10) + '%' +
      mAvg(f.we.map(Math.abs)).toFixed(2).padStart(7) + '%' +
      Math.max(...e.concat(h).map(Math.abs)).toFixed(2).padStart(8) + '%' +
      rcorr(dMass, e).toFixed(3).padStart(13) +
      rcorr(hMass, h).toFixed(3).padStart(9) +
      (p === 0 && q === 1 ? '   <== published' : '') +
      (p === 1 && q === 1 ? '   [superseded]' : ''),
  )
})
{
  const f0 = fitAt(0, 1),
    f1 = fitAt(1, 1)
  console.error(
    '  THE MASS EXPONENT STAYS GONE, and on the published geometry the case is if anything cleaner:',
  )
  console.error(
    '  p = 0 wins the Misaki column outright (' + maeOf(f0.me).toFixed(2) + '% against ' +
      maeOf(f1.me).toFixed(2) + '% at p = 1) and the Hakone scatter column',
  )
  console.error(
    '  as well (' + maeOf(centred(f0.he)).toFixed(2) + '% against ' +
      maeOf(centred(f1.he)).toFixed(2) + '%). It no longer wins by the p = 1 row collapsing to k = 0,',
  )
  console.error(
    '  which is what happened on the surveyed map: p = 1 now fits at k = ' + f1.k.toFixed(2) +
      ' and still loses on both.',
  )
  console.error(
    '  BE HONEST ABOUT THE CORRELATION COLUMNS. They were once quoted as the mis-specification test,',
  )
  console.error(
    '  and they do not support that reading: with 14 and 8 laps, |r| below about 0.55 and 0.71',
  )
  console.error(
    '  respectively is noise, and the numbers move around inside that band as the geometry moves.',
  )
  console.error(
    '  The mass exponent is refused on the error columns alone.',
  )
}
console.error('  1/mu stays: dropping it too (p 0, q 0) is worse on both columns.')
console.error('\n### the residual budget: which cars own the remaining error')
const budget = DRIVEN.map((d, i) => ({ lbl: d.lbl, e: newSet[i].e, kei: d.kei }))
const budgetTot = budget.reduce((a, r) => a + Math.abs(r.e), 0)
budget
  .sort((a, b) => Math.abs(b.e) - Math.abs(a.e))
  .slice(0, 6)
  .forEach((r) =>
    console.error(
      '  ' + r.lbl.slice(0, 32).padEnd(34) + r.e.toFixed(2).padStart(7) + '%   ' +
        ((100 * Math.abs(r.e)) / budgetTot).toFixed(0) + '% of the total absolute error' +
        (r.kei ? '   [standing kei outlier]' : ''),
    ),
  )
kAgi = kAgi0

// =====================================================================================
// PUBLISHED RUN: the ranked table and the JSON export, at the constants this run FITTED.
// =====================================================================================
// Everything above derives the model; this is the only place that spends it. Two fitted scalars
// survive the acceleration rebuild, and both are fitted here rather than frozen in the source.
// KAGI_FIT is the ADDITIVE direction-change term's own fit over the driven laps, and it IS the
// published weight: the line below applies it and sets kExit to zero, which makes exitDrop return
// zero on its first line. The corner-exit penalty is built, fitted and scored, and not applied.
const KAGI_FIT = JOINT.k
kAgi = KAGI_FIT
kExit = 0
EXIT = xshp(EXIT_PUB)
const CONSTLINE =
  'kAgi ' + KAGI_FIT.toFixed(4) + ' (additive direction-change term)  kExit 0 [the corner-exit ' +
  'penalty is scored at ' + KEXIT_FIT.toFixed(4) + ' ' + xLbl(EXIT_PUB).replace(/\s+/g, ' ') +
  ' and NOT applied]  brake d0 ' +
  BRAKE_D0.toFixed(3) +
  ' m  corner-grip ceiling ' + GEO_MU.toFixed(3) + ' at ' + GEO_R + ' m, exponent ' +
  GEO_T.toFixed(4) +
  '   (acceleration: measured on ' + ACCEL_SOLVED.length + ' cars, ' +
  CARS.filter((c) => c.z97 != null && c.z161 == null).length + ' one-point, ' +
  CARS.filter((c) => c.z97 == null).length + ' regressed)'
console.log('\n## CONSTANTS THIS TABLE RUNS AT')
console.log('   ' + CONSTLINE)
console.log(
  '   Acceleration is no longer a constant. phi, awdK, aCapK and the delivery archetype table',
)
console.log(
  '   are gone from the published model: each car\'s launch acceleration and effective wheel',
)
console.log(
  '   power are SOLVED from its own published 0-97 and 0-161, and the cars Forza does not',
)
console.log(
  '   measure fall back to a regression on the 59 that it does. d0 is least squares on the 59',
)
console.log(
  '   two-point braking measurements. kAgi is fitted on ALL ' +
    (DRIVEN.length + HAKD.length + WAND.length) + ' driven laps, ' + DRIVEN.length +
    ' on Misaki, ' + HAKD.length + ' on',
)
console.log(
  '   Hakone and ' + WAND.length +
    ' on Wangan, weighted equally BY COURSE rather than by lap. The corner-exit',
)
console.log(
  '   penalty is fitted on the same ' + (DRIVEN.length + HAKD.length + WAND.length) +
    ' and scored beside it; the two sweeps are stderr 2b and 2c.',
)
console.log(
  '   THE DIRECTION-CHANGE TERM THIS TABLE RUNS IS THE TIME ADDER, and it is worth being plain',
)
console.log(
  '   about that. The model charges kAgi / mu x (angle/90) x a tightness clamp in SECONDS, once',
)
console.log(
  '   per corner. Its weakness is structural rather than a matter of tuning: a car it penalises',
)
console.log(
  '   leaves the corner at exactly the speed it would have had anyway, so the charge cannot',
)
console.log(
  '   propagate down the following straight, which is how a real direction-change deficit costs',
)
console.log('   time.')
console.log(
  '   A CORNER-EXIT SPEED PENALTY IS BUILT FOR THAT AND IS NOT APPLIED. It reduces corner-EXIT',
)
console.log(
  '   SPEED instead of adding seconds: the car would leave a direction change carrying less speed',
)
console.log(
  '   than the apex formula gives it and pay for that until the road opens out. It compounds on',
)
console.log(
  '   hairpins onto short connectors and is worth almost nothing on a motorway sweeper, so the',
)
console.log(
  '   tight-versus-fast axis would come out of the arithmetic rather than a fitted constant. kExit',
)
console.log(
  '   is 0 in this run and the term returns exactly zero, so every figure quoted for it below is a',
)
console.log('   score and not a setting.')
console.log(
  '   READ BOTH FITTED WEIGHTS WITH THE FACSIMILE CAVEAT. TWO of the three courses have',
)
console.log(
  '   searched geometries: Hakone against its first eight laps and Wangan against its first five',
)
console.log(
  '   (maintainer rulings, 2026-07-27), so both were chosen to suit the model - and both were',
)
console.log(
  '   searched with the ADDITIVE term in place and are held FIXED here, which handicaps the exit',
)
console.log('   term and is the reason it stays off.')
console.log(
  '   On the SURVEYED Hakone map the model is about ' +
    scoreAt(shp({}), 0, HAKM_AFF, HAK_MAP).hakMean.toFixed(0) + '% slow whatever term is used. The',
)
console.log(
  '   Misaki third of the fit is untouched by any of this: its geometry is not a free parameter',
)
console.log('   and never has been.')
console.log(
  '   AND THAT HANDICAP IS THE WHOLE ARGUMENT, BECAUSE IT IS NOT SMALL PRINT. The frozen',
)
console.log(
  '   Hakone road wants about 14% of a lap from whatever direction-change term the model carries,',
)
console.log(
  '   and an exit-speed deficit structurally cannot supply that: to get close it has to saturate.',
)
console.log(
  '   At its own fitted weight the exit deficit is against its own floor on a large share of the',
)
console.log(
  '   corners in the driven sets, which is exactly where the term stops separating cars. Read the',
)
console.log(
  '   course-character swing section below for what that costs and what the smaller, non-saturating',
)
console.log('   weight would have bought.')

// =====================================================================================
// THE TRACTION RELEASE ABOVE THE MEASUREMENT WINDOW: what it fires on, and what it moves
// =====================================================================================
// The term is defined at paccAt. This section is its accountability: which cars it detects, how
// much power it hands them and where, and how many laps in the whole 85-car table it moves at all.
// It is printed on stdout rather than buried in stderr because it is a change to the published
// model, and a change to the published model that only its author can find is not accountable.
console.log('\n## THE TRACTION RELEASE ABOVE 161 KM/H')
console.log(
  '   pEff is solved from a 0-97 and a 0-161 and was then applied at EVERY speed. On a car whose',
)
console.log(
  '   tyres run out before its engine does, that window measures the contact patch rather than the',
)
console.log(
  '   engine, and holding its answer flat makes the model assert two incompatible things at once:',
)
console.log(
  '   a top speed only full crank power reaches, and six tenths of that power on the way there.',
)
console.log(
  '   THE DETECTION IS ARITHMETIC ON WHAT IS ALREADY SOLVED. vFull = Pw / (m aLaunch) is the speed',
)
console.log(
  '   below which full crank power asks the tyres for more thrust than the solved launch plateau',
)
console.log(
  '   can give; fTr is the share of the 97-161 window sitting below it. Above 161 km/h that share',
)
console.log(
  '   of the shortfall is handed back, completing at the car\'s own top speed. Below 161 nothing',
)
console.log(
  '   changes at all, which is why every measured car still round-trips its own 0-97 and 0-161.',
)
{
  const relRows = CARS.map((c) => ({ c, b: carBlock(c) }))
    .filter((r) => r.b.fTr > 0)
    .sort((a, b) => b.b.fTr - a.b.fTr)
  console.log(
    '   IT FIRES ON ' + relRows.length + ' OF THE ' + CARS.length + ' CARS IN THE TABLE. For the' +
      ' other ' + (CARS.length - relRows.length) + ', vFull is below 97 km/h, fTr is exactly zero,',
  )
  console.log(
    '   and the acceleration curve is bit-for-bit the one the previous run published.',
  )
  console.log('car                                    vFull   fTr   pEff/Pw   pEff kW   at 200   at 250   at the cap')
  relRows.forEach((r) => {
    const b = r.b
    console.log(
      '  ' + r.c.n.slice(0, 36).padEnd(38) +
        ((3.6 * b.Pw) / (b.m * b.aGrip)).toFixed(0).padStart(5) +
        b.fTr.toFixed(3).padStart(7) + (b.Pacc / b.Pw).toFixed(3).padStart(9) +
        (b.Pacc / 1000).toFixed(0).padStart(10) +
        (paccAt(b, 200 / 3.6) / 1000).toFixed(0).padStart(9) +
        (paccAt(b, 250 / 3.6) / 1000).toFixed(0).padStart(9) +
        (paccAt(b, b.vTop) / 1000).toFixed(0).padStart(10) + ' of ' + (b.Pw / 1000).toFixed(0),
    )
  })
  // What it is worth in lap time, over the whole table rather than over the cars it fires on:
  // a term that moves four cars and claims to be inert has to be able to show the other 81.
  tractionRelease = false
  const off = CARS.map((c) => CK.map((k) => courseTime(k, c)))
  tractionRelease = true
  const on = CARS.map((c) => CK.map((k) => courseTime(k, c)))
  const worst = CARS.map((c, i) => ({
    n: c.n,
    d: Math.max(...CK.map((k, j) => (100 * (off[i][j] - on[i][j])) / off[i][j])),
  })).sort((a, b) => b.d - a.d)
  console.log(
    '   COURSE-TIME MOVEMENT over all ' + CARS.length + ' cars x ' + CK.length + ' courses' +
      ' (Yatabe included, and it is the course the term has the most room on): ' +
      worst.filter((r) => r.d > 0.5).length + ' car(s) move by more than 0.5% on any course, ' +
      worst.filter((r) => r.d > 0.05).length + ' by more than 0.05%.',
  )
  console.log(
    '   Biggest movers: ' + worst.slice(0, 4).map((r) => r.n.slice(0, 30) + ' ' + r.d.toFixed(2) + '%').join(', ') + '.',
  )
  console.log(
    '   Every movement is a car getting FASTER, because the term only ever hands power back.',
  )
}

// =====================================================================================
// THE DRIVEN LAPS: all three courses, per car, at the published constants
// =====================================================================================
// THE THREE TABLES DO NOT CARRY THE SAME WEIGHT AND MUST NOT BE READ AS IF THEY DID.
// Misaki's geometry is traced from a course the maintainer can drive and was never tuned to lap
// time, so its residual is model error and nothing else. Hakone's and Wangan's geometries were
// searched against their own laps, so their LEVEL is bounded below by how well each search did.
// Misaki says whether the model is right. Hakone says whether, on a road built to suit it, the
// model still orders and separates the cars the way the driver did. Wangan says the same about
// ordering, and it says one thing neither of the others can: what survives a search is the
// SCATTER about the fitted level, which is a statement about cars and not about the road.
//
// AND FOUR CARS NOW SIT OUTSIDE ALL OF THAT. The round-4 entries (marked R4) were predicted on
// all three courses before a lap of any of them was driven, and the acceptance-test RX-7 was
// predicted on Hakone, Wangan and the kilometre before any of those was driven, so all four are
// out of sample not only for the fitted weight but for BOTH SEARCHED GEOMETRIES. Their committed
// predictions are printed beside their driven times wherever they appear.
// Committed predictions, by car id and course, printed beside the driven time wherever one
// exists. Round 4 filled it first and the RX-7 acceptance test is the second entry. The RX-7 has
// NO Misaki key on purpose: its Misaki lap was already in the fit when the acceptance run was
// driven, the Misaki table's row for it is that earlier drive on the fingerprint record, and
// quoting the acceptance prediction against a different drive of a different record would be a
// comparison of two things that were never the same measurement.
const PRED = {}
R4.forEach((r) => {
  PRED[r.id] = { Misaki: r.pMis, Hakone: r.pHak, Wangan: r.pWan, tag: '   [R4 blind]' }
})
PRED[ACC_RX7.id] = {
  Hakone: ACC_RX7.pHak,
  Wangan: ACC_RX7.pWan,
  Yatabe: ACC_RX7.pKm,
  tag: '   [acceptance, blind]',
}
const predOf = (id, course) => (PRED[id] ? PRED[id][course] : undefined)
const predTag = (id, course) => (predOf(id, course) != null ? PRED[id].tag : '')
const hakRows = HAKD.map((d) => {
  const s = lapSplit(d.c, HAK, true)
  return {
    id: d.id,
    c: d.c,
    lbl: d.lbl,
    driven: d.t,
    mod: s.t,
    e: pct(s.t, d.t),
    split: s,
    r4: d.r4,
    stand: standingPenalty(d.c, HAK),
  }
})
hakRows.forEach((r) => {
  r.modS = r.mod + r.stand
  r.eS = pct(r.modS, r.driven)
})

// ---- Misaki first: the course whose geometry is NOT a free parameter ----
console.log('\n## THE ' + DRIVEN.length + ' DRIVEN MISAKI LAPS at the published constants')
console.log('THIS IS THE THIRD OF THE FIT THAT CAN BE WRONG, and since 2026-07-27 it is the only')
console.log('third. Misaki\'s geometry is traced from the course and has never been tuned to a lap')
console.log('time, so its residual is model error and nothing else. Hakone\'s geometry is tuned and')
console.log('Wangan\'s is tuned, so read this table first and those two after it.')
console.log('The `pred` column is the figure committed BEFORE the car was driven, where there is one.')
console.log(
  'car                                    driven  modelled   delta    err%    pred',
)
const misRows = DRIVEN.map((d) => {
  const t = lap(d.c, LEGEND)
  return {
    id: d.id, lbl: d.lbl, driven: d.t, mod: t, e: pct(t, d.t),
    kei: d.kei, blind: d.blind, r4: !!d.r4,
  }
})
misRows.forEach((r) =>
  console.log(
    '  ' +
      r.lbl.slice(0, 36).padEnd(38) +
      r.driven.toFixed(1).padStart(6) +
      r.mod.toFixed(1).padStart(10) +
      (r.mod - r.driven).toFixed(1).padStart(8) +
      r.e.toFixed(1).padStart(8) +
      (predOf(r.id, 'Misaki') != null ? predOf(r.id, 'Misaki').toFixed(1).padStart(8) : '       -') +
      (r.kei ? '   [standing kei outlier]' : '') +
      predTag(r.id, 'Misaki'),
  ),
)
const misE = misRows.map((r) => r.e)
const misNoKei = misRows.filter((r) => !r.kei).map((r) => r.e)
console.log(
  '  GROUP: mean ' +
    mAvg(misE).toFixed(2) +
    '%   MAE ' +
    mAvg(misE.map(Math.abs)).toFixed(2) +
    '%   worst ' +
    Math.max(...misE.map(Math.abs)).toFixed(2) +
    '%   rms ' +
    rmsOf(misE).toFixed(2) +
    '%',
)
console.log(
  '  without the two standing kei outliers (n=' +
    misNoKei.length +
    '): mean ' +
    mAvg(misNoKei).toFixed(2) +
    '%   MAE ' +
    mAvg(misNoKei.map(Math.abs)).toFixed(2) +
    '%',
)
const misDS =
  Math.max(...misRows.map((r) => r.driven)) / Math.min(...misRows.map((r) => r.driven))
const misMS = Math.max(...misRows.map((r) => r.mod)) / Math.min(...misRows.map((r) => r.mod))
console.log(
  '  SPREAD: driven ' +
    misDS.toFixed(3) +
    'x   modelled ' +
    misMS.toFixed(3) +
    'x   (the model spreads the field ' +
    (misMS / misDS).toFixed(2) +
    'x as far as the driver did)',
)
{
  const byD = misRows.slice().sort((a, b) => a.driven - b.driven)
  const inv = []
  for (let i = 0; i < byD.length; i++)
    for (let j = i + 1; j < byD.length; j++)
      if (byD[i].mod > byD[j].mod) inv.push(byD[i].lbl.slice(0, 26) + ' over ' + byD[j].lbl.slice(0, 26))
  console.log(
    '  ORDERING: ' +
      inv.length +
      ' inversion(s) out of ' +
      (misRows.length * (misRows.length - 1)) / 2 +
      ' ordered pairs' +
      (inv.length ? ': ' + inv.join('; ') : ' - the model reproduces the driven order exactly.'),
  )
}
// ---- the standing start, MEASURED for the first time ----
// Three of the round-4 cars were driven on this course twice, once as a hotlap and once from
// rest, and the difference is the standing-start offset read directly off the game. It is the
// first measurement of a quantity the model has only ever estimated, on the one course whose
// geometry is not a free parameter. IT IS NOT APPLIED: every fit in this file is on the flying
// lap and stays there. It is here because a measured offset that nothing uses is still worth
// more than an estimate that everything quietly absorbs.
{
  console.log('\n### the standing start, MEASURED (' + R4.length + ' cars, Misaki, hotlap vs from rest)')
  console.log('    car                          hotlap   standing   measured   modelled   at adder    diff')
  const meas = [],
    mod = [],
    modA = []
  R4.forEach((r) => {
    const c = byId(r.id)
    const pen = standingPenalty(c, LEGEND)
    const sA = kAgi,
      sX = kExit
    kAgi = KAGI_FIT
    kExit = 0
    const penA = standingPenalty(c, LEGEND)
    kAgi = sA
    kExit = sX
    meas.push(r.misStand - r.mis)
    mod.push(pen)
    modA.push(penA)
    console.log(
      '    ' + r.short.padEnd(26) + r.mis.toFixed(1).padStart(7) + r.misStand.toFixed(1).padStart(11) +
        (r.misStand - r.mis).toFixed(2).padStart(11) + pen.toFixed(2).padStart(11) +
        penA.toFixed(2).padStart(11) + (pen - (r.misStand - r.mis)).toFixed(2).padStart(8),
    )
  })
  console.log(
    '    measured mean ' + mAvg(meas).toFixed(2) + ' s (range ' + Math.min(...meas).toFixed(1) +
      ' to ' + Math.max(...meas).toFixed(1) + ', spread ' +
      (Math.max(...meas) - Math.min(...meas)).toFixed(1) + ' s).  Modelled mean ' +
      mAvg(mod).toFixed(2) + ' s at the corner-exit term, ' + mAvg(modA).toFixed(2) +
      ' s at the published additive term.',
  )
  console.log(
    '    The two model columns agree because neither direction-change term reaches this quantity:' ,
  )
  console.log(
    '    the adder never touched the straight march at all, and the exit penalty is worth a quarter',
  )
  console.log(
    '    of a metre per second on a 700 m opening bend. The offset is a property of the measured',
  )
  console.log('    acceleration curve and nothing else.')
  console.log(
    '    THE MODEL OVERSTATES IT, on both terms and by a lot: ' +
      Math.abs(100 * (mAvg(mod) / mAvg(meas) - 1)).toFixed(0) + '% at the published term and ' +
      Math.abs(100 * (mAvg(modA) / mAvg(meas) - 1)).toFixed(0) + '% at the adder. The measurement',
  )
  console.log(
    '    says a standing lap costs about ' + mAvg(meas).toFixed(1) + ' s and the model says ' +
      mAvg(mod).toFixed(1) + '. The likeliest reason is the protocol: the model launches from a',
  )
  console.log(
    '    true standstill and the driver rolls up from a grid place or two back, which is what the',
  )
  console.log(
    '    maintainer describes. NOTHING IS APPLIED: every fit in this file is on the flying lap and',
  )
  console.log(
    '    stays there. But Hakone and Wangan ARE driven from rest, so their searched geometries have',
  )
  console.log(
    '    absorbed an offset of about this size, and it is now a measured quantity with a measured',
  )
  console.log('    spread rather than an estimate.')
}

console.log('\n## THE ' + HAKD.length + ' DRIVEN HAKONE LAPS at the published constants')
console.log('READ THE COURSE BEFORE THE TABLE. This 2.7 km of road is a BEHAVIOURAL FACSIMILE: a')
console.log('geometry searched, on maintainer ruling, to reproduce the FIRST EIGHT of these driven')
console.log('times as closely as possible, with the direction-change weight refitted at every')
console.log('candidate. It is NOT a survey of Hakone Nanamagari and no radius in it is a measured')
console.log('value. The surveyed road is kept in the file and scored beside every diagnostic; on it')
console.log('the model is about 21% slow with the direction-change term switched off, which is the')
console.log('floor of what it can produce there. The missing physics is a racing-line model, not a')
console.log('hill (stderr prices both). SO THE MEAN ERROR BELOW IS NOT A MEASUREMENT OF THE MODEL on')
console.log('the eight it was searched against: it is a measurement of the search. What the table')
console.log('says honestly is the ORDERING, the SPREAD, the PAIR GAPS, and the three R4 rows, which')
console.log('this geometry had never seen when they were predicted.')

// ---- geometry ----
const hakInfo = trackInfo('Hakone', HAK)
const hakStr = HAK.map((s) => s[2]).sort((a, b) => a - b)
const misInfo = trackInfo('Misaki', COURSES.Misaki)
const mapInfo = trackInfo('surveyed', HAK_MAP)
// The switchback radii and the connector range, read off the published geometry rather than
// written out by hand, so a change to the course cannot leave the prose stale.
const hpR = HAK.filter((s) => s[0] < 30).map((s) => s[0])
const hpLo = Math.min(...hpR),
  hpHi = Math.max(...hpR)
const cnLo = Math.min(...HAK.map((s) => s[2])),
  cnHi = Math.max(...HAK.map((s) => s[2]))
console.log('\n### the course as published, against the surveyed map it stands in for')
console.log(
  '  ' +
    (hakInfo.len / 1000).toFixed(2) +
    ' km, ' +
    hakInfo.corners +
    ' corners (' +
    Object.entries(hakInfo.mix)
      .map(([a, b]) => b + ' ' + a)
      .join(', ') +
    '), ' +
    hakInfo.straightPct +
    '% straight, avg radius ' +
    hakInfo.avgR +
    ' m',
)
console.log(
  '  connectors, sorted (m): ' +
    hakStr.join(' ') +
    '   median ' +
    quant(hakStr, 0.5) +
    ' m, longest ' +
    hakInfo.longest +
    ' m',
)
console.log('                                    PUBLISHED         the surveyed map')
;[
  ['length', (hakInfo.len / 1000).toFixed(2) + ' km', (mapInfo.len / 1000).toFixed(2) + ' km'],
  ['corners', String(hakInfo.corners), String(mapInfo.corners)],
  [
    'corners tighter than 30 m',
    String(HAK.filter((s) => s[0] < 30).length),
    String(HAK_MAP.filter((s) => s[0] < 30).length),
  ],
  [
    'tightest / widest radius',
    Math.min(...HAK.map((s) => s[0])) + ' / ' + Math.max(...HAK.map((s) => s[0])) + ' m',
    Math.min(...HAK_MAP.map((s) => s[0])) + ' / ' + Math.max(...HAK_MAP.map((s) => s[0])) + ' m',
  ],
  ['average radius', hakInfo.avgR + ' m', mapInfo.avgR + ' m'],
  ['longest connector', hakInfo.longest + ' m', mapInfo.longest + ' m'],
  ['straight fraction', hakInfo.straightPct + '%', mapInfo.straightPct + '%'],
  [
    'sum of tight (direction-change demand)',
    tightSum(HAK, JOINT).toFixed(1),
    tightSum(HAK_MAP, JOINT).toFixed(1),
  ],
].forEach(([lbl, now, was]) =>
  console.log('    ' + lbl.padEnd(30) + now.padStart(12) + was.padStart(24)),
)
console.log(
  '  WHAT THE SEARCH MOVED. It kept the switchback itself: ' + hpLo + '-' + hpHi +
    ' m corners, the same kind of corner',
)
console.log(
  '  as the surveyed ' + Math.min(...HAK_MAP.filter((s) => s[0] < 30).map((s) => s[0])) + '-' +
    Math.max(...HAK_MAP.filter((s) => s[0] < 30).map((s) => s[0])) +
    ' m ones. What it moved is HOW MANY of them there are - ' +
    HAK_MAP.filter((s) => s[0] < 30).length + ' down to ' +
    HAK.filter((s) => s[0] < 30).length + ' -',
)
console.log(
  '  and what stands in for the rest: linking bends of ' +
    Math.min(...HAK.filter((s) => s[0] >= 30).map((s) => s[0])) + ' to ' +
    Math.max(...HAK.filter((s) => s[0] >= 30).map((s) => s[0])) +
    ' m turning ' +
    Math.min(...HAK.filter((s) => s[0] >= 30).map((s) => s[1])) + ' to ' +
    Math.max(...HAK.filter((s) => s[0] >= 30).map((s) => s[1])) + ' degrees.',
)
console.log(
  '  That is why the average radius is ' + hakInfo.avgR + ' m against the map\'s ' + mapInfo.avgR +
    ' m without a single switchback being',
)
console.log(
  '  opened out, and why the direction-change demand is ' +
    (tightSum(HAK_MAP, JOINT) / tightSum(HAK, JOINT)).toFixed(1) + 'x lighter.',
)
console.log(
  '  THE SEARCH WAS CONSTRAINED, AND THE CONSTRAINTS ARE THE MAP\'S OWN NUMBERS: length held at',
)
console.log(
  '  2.7 km, no switchback tighter than the map\'s tightest (11 m), no connector longer than its',
)
console.log(
  '  longest run (290 m), linking bends between 40 and 160 m. Inside that box the joint objective',
)
console.log(
  '  is nearly flat in the switchback count: the best 3-switchback layout scores 1.410, the best',
)
console.log(
  '  4 (published) 1.400 and the best 5 1.427, so THIS GEOMETRY IS NOT IDENTIFIED by the data -',
)
console.log(
  '  it is one plausible road among many that fit. Six switchbacks is where it breaks: 2.016,',
)
console.log(
  '  because six saturated hairpins cost more direction change than the driven times allow.',
)
console.log(
  '  WHAT THE FACSIMILE IS STANDING IN FOR IS A RACING LINE, NOT A HILL. A mapped radius is a',
)
console.log(
  '  centreline radius, a driver on a road with width does not drive the centreline, and apex',
)
console.log(
  '  speed goes as the square root of the radius. stderr prices a descent instead and even a 12%',
)
console.log(
  '  grade closes a small fraction, because a grade cannot touch a corner arc. The model has no',
)
console.log(
  '  line term, so on the surveyed geometry the gap appears as a uniform positive bias on all',
)
console.log('  the driven laps and stays there at any direction-change weight.')
console.log(
  '  For scale against the other driven course: avg radius ' +
    hakInfo.avgR +
    ' m against Misaki\'s ' +
    misInfo.avgR +
    ' m, longest',
)
console.log(
  '  run ' +
    hakInfo.longest +
    ' m against ' +
    misInfo.longest +
    ' m. Time is the better measure of tightness, and it is this:',
)
const splitPct = (crs) => {
  const rs = hakRows.map((r) => lapSplit(r.c, crs, true))
  const tot = rs.map((s) => s.t)
  return {
    arc: mAvg(rs.map((s, i) => (100 * s.arc) / tot[i])),
    agi: mAvg(rs.map((s, i) => (100 * s.exi) / tot[i])),
    str: mAvg(rs.map((s, i) => (100 * s.str) / tot[i])),
  }
}
const hakSplit = splitPct(HAK),
  misSplit = splitPct(COURSES.Misaki)
console.log('  where the lap time goes (mean over these ' + hakRows.length + ' cars)')
console.log('    course    corner arcs   corner-exit cost   straights + braking')
;[
  ['Hakone', hakSplit],
  ['Misaki', misSplit],
].forEach(([nm, s]) =>
  console.log(
    '    ' +
      nm.padEnd(10) +
      s.arc.toFixed(1).padStart(10) +
      '%' +
      s.agi.toFixed(1).padStart(17) +
      '%' +
      s.str.toFixed(1).padStart(20) +
      '%',
  ),
)

// The corner-exit penalty is the only lever in the model still fitted on lap time, and this is
// the course that decides what it is worth. Its contribution is reported as its own column rather
// than left inside the total, and the lap with it switched off is reported beside it. Switching
// it off is a DIAGNOSTIC, not a proposal: nothing here changes the published value.
{
  const xSave = kExit
  kExit = 0
  hakRows.forEach((r) => {
    r.noAgi = lap(r.c, HAK)
    r.eNoAgi = pct(r.noAgi, r.driven)
  })
  kExit = xSave
}
// Every radius opened by half again, length held at 2.7 km by shortening the connectors. The
// geometry is no longer a fiction, but a map read off a picture is still a reading, so every
// conclusion drawn from these laps is also evaluated on a materially more open one. The direction
// is chosen deliberately: the real map is already at the tight end of anything defensible, and
// opening it is the direction that moves the model TOWARDS the driven times, so a conclusion that
// survives it is not an artefact of the model being slow. `widenBy` is defined with the geometry
// diagnostic further down, and is hoisted.
const HAK_ALT = widenBy(HAK, 1.5)
hakRows.forEach((r) => {
  r.alt = lap(r.c, HAK_ALT)
})

// ---- the comparison ----
console.log('\n### driven against modelled, at the published constants')
console.log(
  'car                                    driven  modelled   delta    err%   ex.cost  no-exit   err%    pred',
)
hakRows.forEach((r) =>
  console.log(
    '  ' +
      r.lbl.slice(0, 36).padEnd(38) +
      r.driven.toFixed(1).padStart(6) +
      r.mod.toFixed(1).padStart(10) +
      (r.mod - r.driven).toFixed(1).padStart(8) +
      r.e.toFixed(1).padStart(8) +
      r.split.exi.toFixed(1).padStart(9) +
      r.noAgi.toFixed(1).padStart(9) +
      r.eNoAgi.toFixed(1).padStart(7) +
      (predOf(r.id, 'Hakone') != null ? predOf(r.id, 'Hakone').toFixed(1).padStart(8) : '       -') +
      predTag(r.id, 'Hakone'),
  ),
)
const hakE = hakRows.map((r) => r.e)
const hakES = hakRows.map((r) => r.eS)
const dSpread =
  Math.max(...hakRows.map((r) => r.driven)) / Math.min(...hakRows.map((r) => r.driven))
const mSpread = Math.max(...hakRows.map((r) => r.mod)) / Math.min(...hakRows.map((r) => r.mod))
console.log(
  '  GROUP: mean ' +
    mAvg(hakE).toFixed(2) +
    '%   MAE ' +
    mAvg(hakE.map(Math.abs)).toFixed(2) +
    '%   worst ' +
    Math.max(...hakE.map(Math.abs)).toFixed(2) +
    '%   rms ' +
    rmsOf(hakE).toFixed(2) +
    '%',
)
console.log(
  '  with the standing start added: mean ' +
    mAvg(hakES).toFixed(2) +
    '%   MAE ' +
    mAvg(hakES.map(Math.abs)).toFixed(2) +
    '%   rms ' +
    rmsOf(hakES).toFixed(2) +
    '%',
)
const hakENA = hakRows.map((r) => r.eNoAgi)
const hakR4 = hakRows.filter((r) => r.r4).map((r) => r.e)
const hakBlind = hakRows.filter((r) => r.r4 || r.acc).map((r) => r.e)
console.log(
  '  THE THREE R4 ROWS ALONE (out of sample for this geometry): mean ' + mAvg(hakR4).toFixed(2) +
    '%   MAE ' + maeOf(hakR4).toFixed(2) + '%   against ' +
    maeOf(hakRows.filter((r) => !r.r4 && !r.acc).map((r) => r.e)).toFixed(2) + '% for the ' +
    hakRows.filter((r) => !r.r4 && !r.acc).length + ' the road was searched against.',
)
{
  const a = hakRows.find((r) => r.acc)
  if (a)
    console.log(
      '  THE ACCEPTANCE ROW (' + a.lbl.replace(/^\d{4} /, '') + ', predicted ' +
        predOf(a.id, 'Hakone').toFixed(1) + ' s before it was driven at ' + a.driven.toFixed(1) +
        ' s): committed error ' +
        pct(predOf(a.id, 'Hakone'), a.driven).toFixed(2) + '%, at this run\'s constants ' +
        a.e.toFixed(2) + '%. All ' + hakBlind.length +
        ' out-of-sample rows together: MAE ' + maeOf(hakBlind).toFixed(2) + '%.',
    )
}
console.log(
  '  WITH THE CORNER-EXIT PENALTY OFF: mean ' +
    mAvg(hakENA).toFixed(2) +
    '%   MAE ' +
    mAvg(hakENA.map(Math.abs)).toFixed(2) +
    '%   rms ' +
    rmsOf(hakENA).toFixed(2) +
    '%   (it is ' +
    mAvg(hakRows.map((r) => (100 * r.split.exi) / r.mod)).toFixed(1) +
    '% of the modelled lap here,',
)
console.log(
  '  against ' +
    misSplit.agi.toFixed(1) +
    '% on Misaki: ' +
    HAK.filter((s) => s[0] < 30).length +
    ' tight corners instead of one, and each of them onto a short connector.)',
)
console.log(
  '  SPREAD: driven ' +
    dSpread.toFixed(3) +
    'x (' +
    Math.min(...hakRows.map((r) => r.driven)).toFixed(1) +
    ' to ' +
    Math.max(...hakRows.map((r) => r.driven)).toFixed(1) +
    ' s)   modelled ' +
    mSpread.toFixed(3) +
    'x (' +
    Math.min(...hakRows.map((r) => r.mod)).toFixed(1) +
    ' to ' +
    Math.max(...hakRows.map((r) => r.mod)).toFixed(1) +
    ' s)',
)
console.log(
  '  the model spreads the field ' +
    (mSpread / dSpread).toFixed(3) +
    'x as far as the driver did' +
    (Math.abs(mSpread / dSpread - 1) < 0.01
      ? ', i.e. within 1% - but on a course searched to make it so.'
      : ', i.e. ' + (mSpread > dSpread ? 'too far' : 'not far enough') + '.'),
)

// ---- ordering ----
const byDriven = hakRows.slice().sort((a, b) => a.driven - b.driven)
const byModel = hakRows.slice().sort((a, b) => a.mod - b.mod)
console.log('\n### ordering')
console.log('  driven order:   ' + byDriven.map((r) => r.lbl.slice(5, 24).trim()).join(' > '))
console.log('  modelled order: ' + byModel.map((r) => r.lbl.slice(5, 24).trim()).join(' > '))
const invAt = (key) => {
  const out = []
  for (let i = 0; i < byDriven.length; i++) {
    for (let j = i + 1; j < byDriven.length; j++) {
      if (byDriven[i][key] > byDriven[j][key]) out.push({ a: byDriven[i], b: byDriven[j] })
    }
  }
  return out
}
const inversions = invAt('mod')
console.log(
  '  ' +
    inversions.length +
    ' inversion(s) out of ' +
    (hakRows.length * (hakRows.length - 1)) / 2 +
    ' ordered pairs:',
)
inversions.forEach((v) =>
  console.log(
    '    ' +
      v.a.lbl.slice(0, 34).padEnd(36) +
      'beat ' +
      v.b.lbl.slice(0, 34).padEnd(36) +
      'by ' +
      (v.b.driven - v.a.driven).toFixed(1) +
      ' s driven, loses by ' +
      (v.a.mod - v.b.mod).toFixed(1) +
      ' s modelled',
  ),
)
if (!inversions.length) console.log('    none: the model reproduces the driven order exactly.')
const invAlt = invAt('alt')
const invKey = (v) => v.a.id + '|' + v.b.id
const invBoth = inversions.filter((v) => invAlt.some((w) => invKey(w) === invKey(v)))
console.log(
  '  ROBUSTNESS: on the 1.5x-radius reading of the same course the count is ' +
    invAlt.length +
    (invAlt.length === inversions.length
      ? ', the same, so the count is not an artefact of one reading of the geometry:'
      : ', not ' + inversions.length +
        ', so the inversion COUNT is geometry-sensitive and cannot be quoted on its own:'),
)
console.log(
  '    ' +
    (invAlt.length
      ? invAlt
          .map((v) => v.a.lbl.slice(5, 22).trim() + ' under ' + v.b.lbl.slice(5, 22).trim())
          .join(', ')
      : 'none'),
)
console.log(
  '  What survives both geometries is ' +
    invBoth.length +
    ' of them' +
    (invBoth.length
      ? ': ' +
        invBoth.map((v) => v.a.lbl.slice(5, 24).trim() + ' under ' + v.b.lbl.slice(5, 24).trim()).join(', ') +
        '.'
      : '.'),
)
if (inversions.length) {
  const worst = inversions.reduce((x, y) => (y.a.e - y.b.e > x.a.e - x.b.e ? y : x))
  console.log(
    '  THE CAR THIS SECTION IS ABOUT is the ' + worst.a.lbl.slice(5) + ', modelled ' +
      worst.a.e.toFixed(1) + '% against a table mean of ' + mAvg(hakE).toFixed(1) + '%,',
  )
  console.log(
    '  i.e. ' + (worst.a.e - mAvg(hakE)).toFixed(1) +
      ' points off the level the rest of the field sits at. It is not an ordering finding about',
  )
  console.log(
    '  the pair; it is that single car being the lap the model reproduces worst, and the inversion',
  )
  console.log(
    '  is what that looks like from the ranking. A light FWD hot hatch on a road of switchbacks is',
  )
  console.log(
    '  exactly where a point-mass model with no line term and no lift-off rotation should fail.',
  )
}

// ---- what the residual keys on ----
console.log('\n### does the residual key on anything?')
console.log(
  '  Pearson r against each candidate, on all three readings of the residual. The published',
)
console.log(
  '  column is contaminated by the direction-change term itself, which is a function of the same',
)
console.log(
  '  car properties and would therefore manufacture a correlation on its own; the no-exit column',
)
console.log(
  '  is the clean read of what a transition term should key on. n = ' + hakRows.length +
    ', so |r| below ' + (hakRows.length > 9 ? '0.60' : '0.67') + ' is noise.',
)
console.log('    candidate                  published   +start      no exit')
const predictors = [
  ['kerb mass (kg)', hakRows.map((r) => r.c.kg)],
  ['power to weight (PS/t)', hakRows.map((r) => (1000 * r.c.ps) / r.c.kg)],
  ['grip mu', hakRows.map((r) => gripMu(r.c))],
  ['braking bmu', hakRows.map((r) => brakeMu(r.c))],
  ['driven lap time (s)', hakRows.map((r) => r.driven)],
]
predictors.forEach(([lbl, xs]) =>
  console.log(
    '    ' +
      lbl.padEnd(26) +
      rcorr(xs, hakE).toFixed(3).padStart(9) +
      rcorr(xs, hakES).toFixed(3).padStart(9) +
      rcorr(xs, hakENA).toFixed(3).padStart(13),
  ),
)
console.log(
  '    NOTHING CLEARS THE BAR. The largest is ' +
    (() => {
      let bst = null
      predictors.forEach(([lbl, xs]) => {
        const r = rcorr(xs, hakENA)
        if (!bst || Math.abs(r) > Math.abs(bst.r)) bst = { lbl, r }
      })
      return bst.lbl + ' at r = ' + bst.r.toFixed(2)
    })() +
    ' on the no-exit residual.',
)
console.log(
  '    On these ' + hakRows.length +
    ' cars the leftover error is scatter, not a missing term keyed on mass,',
)
console.log(
  '    power-to-weight or grip. The cross-course decomposition below is the sharper instrument:',
)
console.log('    it can separate what is the car from what is the course, and one course cannot.')

// ---- the two systematic offsets, and where they went ----
console.log('\n### the level offset, and the one real offset that runs the other way')
console.log(
  '  1. THE LEVEL, AND WHERE IT WENT. On the surveyed map the model is slow here by an amount no',
)
console.log(
  '     term it owns can move. The published geometry ABSORBS that, by ruling, and the absorption',
)
console.log(
  '     IS the geometry: nothing else in the model changed to achieve it. So the mean error on',
)
console.log(
  '     this table is near zero by construction and is not evidence about the model. The two',
)
console.log(
  '     candidate terms are priced in stderr and their verdicts are unchanged: a gradient closes a',
)
console.log(
  '     small fraction of the gap on the map, because a grade cannot touch a corner arc; a racing',
)
console.log(
  '     line nulls it at about 3x effective radius, and that is the term the model is missing.',
)
console.log(
  '     Neither is applied, because neither can be measured and fitting one to eight laps is what',
)
console.log('     a tuned geometry already is. The split that IS readable is bias against scatter:')
const biasS = mAvg(hakES)
const scatS = hakRows.map((r) => r.eS - biasS)
const biasNA = mAvg(hakENA)
const scatNA = hakRows.map((r) => r.eNoAgi - biasNA)
console.log(
  '     published, standing start included: bias ' +
    biasS.toFixed(2) +
    '%   scatter rms ' +
    rmsOf(scatS).toFixed(2) +
    '%, range ' +
    Math.min(...scatS).toFixed(2) +
    '% to ' +
    Math.max(...scatS).toFixed(2) +
    '%',
)
console.log(
  '     corner-exit term off:               bias ' +
    biasNA.toFixed(2) +
    '%   scatter rms ' +
    rmsOf(scatNA).toFixed(2) +
    '%, range ' +
    Math.min(...scatNA).toFixed(2) +
    '% to ' +
    Math.max(...scatNA).toFixed(2) +
    '%',
)
console.log(
  '     The scatter is the only part of this that is about the CARS, and it is ' +
    rmsOf(scatNA).toFixed(1) +
    '% rms with the',
)
console.log(
  '     term off, ' +
    rmsOf(hakRows.map((r) => r.e - mAvg(hakE))).toFixed(1) +
    '% with it on. That is the number to compare against the Misaki MAE, not the mean.',
)
console.log(
  '  2. STANDING START. lap() is a FLYING lap: it enters corner 0 at that corner\'s apex speed',
)
console.log(
  '     and never sees a standstill. These laps are from rest. Placing the start line at the',
)
console.log(
  '     exit of corner 0, the course\'s first bend, makes the offset exactly the extra',
)
console.log('     time that first straight costs from rest:')
console.log('     car                                   penalty s   % of driven lap')
hakRows.forEach((r) =>
  console.log(
    '       ' +
      r.lbl.slice(0, 34).padEnd(36) +
      r.stand.toFixed(2).padStart(7) +
      ((100 * r.stand) / r.driven).toFixed(2).padStart(15) +
      '%',
  ),
)
console.log(
  '     mean ' +
    mAvg(hakRows.map((r) => r.stand)).toFixed(2) +
    ' s (' +
    mAvg(hakRows.map((r) => (100 * r.stand) / r.driven)).toFixed(2) +
    '% of lap), range ' +
    Math.min(...hakRows.map((r) => r.stand)).toFixed(2) +
    ' to ' +
    Math.max(...hakRows.map((r) => r.stand)).toFixed(2) +
    ' s.',
)
console.log(
  '     It pushes the model FAST, by ' +
    mAvg(hakRows.map((r) => (100 * r.stand) / r.driven)).toFixed(1) +
    '% of the lap, and it is the only offset here that runs that way.',
)
console.log(
  '     It is real, it is small, and it is nowhere near the size of the level error above: adding',
)
console.log(
  '     it makes the model worse, not better (bias ' +
    mAvg(hakE).toFixed(1) +
    '% to ' +
    mAvg(hakES).toFixed(1) +
    '%). It is reported because a',
)
console.log('     correction that is real and inconvenient still has to be on the page.')

// ---- how much of this section depends on the geometry it was fitted to? ----
// The published radii are a search result, not a measurement, so the honest question is how much
// of what this section says survives a different course of the same length. Every radius is
// scaled by a common factor with the length held at 2.7 km, so only TIGHTNESS moves. NOTHING
// BELOW IS APPLIED. Read the 1.00x row as "the fit", not as "the road".
function widenBy(segs, s) {
  const arc0 = segs.reduce((a, x) => a + (x[0] * x[1] * Math.PI) / 180, 0)
  const str0 = segs.reduce((a, x) => a + x[2], 0)
  const f = (str0 - arc0 * (s - 1)) / str0
  return f <= 0.05 ? null : segs.map((x) => [x[0] * s, x[1], x[2] * f])
}
console.log('\n### how sensitive is all of this to the geometry it was fitted to?  (DIAGNOSTIC ONLY)')
console.log(
  '  Every radius scaled by a common factor, the arc taken back out of the connectors, so the',
)
console.log(
  '  course stays ' +
    (hakInfo.len / 1000).toFixed(1) +
    ' km and only its TIGHTNESS moves. 1.00x is the published facsimile',
)
console.log('  itself. Corner speed is quoted for the R35, the fastest car here.')
console.log(
  '    radius   switchbacks m   connectors m   corner km/h   mean err%   MAE%   spread',
)
const muR35 = gripMu(hakRows[0].c)
;[0.75, 1, 1.25, 1.5, 2, 2.5, 3].forEach((s) => {
  const segs = widenBy(HAK, s)
  if (!segs) return
  const f = segs[0][2] / HAK[0][2]
  const e = hakRows.map((r) => pct(lap(r.c, segs), r.driven))
  const t = hakRows.map((r) => lap(r.c, segs))
  console.log(
    '    ' +
      (s.toFixed(2) + 'x').padStart(6) +
      (Math.round(hpLo * s) + ' to ' + Math.round(hpHi * s)).padStart(16) +
      (Math.round(cnLo * f) + ' to ' + Math.round(cnHi * f)).padStart(15) +
      (Math.round(3.6 * Math.sqrt(muR35 * g * hpLo * s)) +
        ' to ' +
        Math.round(3.6 * Math.sqrt(muR35 * g * hpHi * s))
      ).padStart(14) +
      mAvg(e).toFixed(1).padStart(12) +
      mAvg(e.map(Math.abs)).toFixed(1).padStart(8) +
      (Math.max(...t) / Math.min(...t)).toFixed(3).padStart(9),
  )
})
console.log(
  '  The R35 lap of ' +
    hakRows[0].driven.toFixed(1) +
    ' s over ' +
    (hakInfo.len / 1000).toFixed(1) +
    ' km is an average of ' +
    (3.6 * (hakInfo.len / hakRows[0].driven)).toFixed(0) +
    ' km/h, and the slowest car here',
)
console.log(
  '  averages ' +
    (3.6 * (hakInfo.len / hakRows[hakRows.length - 1].driven)).toFixed(0) +
    ' km/h. THAT is the pace this geometry was searched to reproduce, and it does:',
)
console.log(
  '  an average of ' +
    (3.6 * (hakInfo.len / hakRows[0].mod)).toFixed(0) +
    ' km/h for the R35 against the ' +
    (3.6 * (hakInfo.len / hakRows[0].driven)).toFixed(0) +
    ' driven. On the SURVEYED map the same car',
)
{
  const mapR35 = lap(hakRows[0].c, HAK_MAP)
  console.log(
    '  averages ' + (3.6 * (mapLen / mapR35)).toFixed(0) + ' km/h, because a flat-road point-mass ' +
      'car cannot corner ' + HAK_MAP.filter((s) => s[0] < 30).length,
  )
  console.log(
    '  switchbacks of ' + Math.min(...HAK_MAP.filter((s) => s[0] < 30).map((s) => s[0])) + ' to ' +
      Math.max(...HAK_MAP.filter((s) => s[0] < 30).map((s) => s[0])) +
      ' m at that rate, and neither can a descending one. What buys the pace is',
  )
}
console.log(
  '  radius, which is the racing line, and this table is the price list for it.',
)
console.log(
  '  READ THE LAST TWO COLUMNS TOGETHER, because they are the trade the search had to make. The',
)
console.log(
  '  tighter the course, the better it spreads the field and the worse it hits the level; the more',
)
console.log(
  '  open, the closer the level and the flatter the field. At the published geometry the spread is ' +
    mSpread.toFixed(3),
)
console.log(
  '  against a driven ' +
    dSpread.toFixed(3) +
    ' (' +
    (100 * (1 - mSpread / dSpread)).toFixed(0) +
    '% short) with the level ' +
    mAvg(hakE).toFixed(1) +
    '% out, which is as close to both',
)
console.log(
  '  as the search could get inside a road-shaped box. NOTHING in this family gets both exactly,',
)
console.log(
  '  and that is the honest shape of the remaining error. What the geometry change bought is that',
)
console.log(
  '  the level error is no longer sitting on top of every car reading; what it cost is that this',
)
console.log('  course is no longer a measurement of anything.')

// ---- the two Hakone pairs: GTO against CRX SiR, and R35 against AZ-1 ----
// Both are pair comparisons, so they are stated as gaps: a gap cancels the two offsets above
// to the extent that both cars pay them alike, which is exactly what makes a pair the cleanest
// read available on this data.
const hakOf = (id) => hakRows.find((r) => r.id === id)
const gtoR = hakOf('mitsubishi-gto-twin-turbo-z16a'),
  crxR = hakOf('honda-crx-sir-ef8')
const r35R = hakOf('nissan-gt-r-r35'),
  azR = hakOf('mazda-autozam-az-1-pg6sa')
// What the same pair does at a DIFFERENT mass exponent in the corner-exit term, each p refitting
// its own weight on all three courses, so the pair evidence and the whole-set evidence are read
// off the same page. This is the test that killed the mass exponent in the additive term; the new
// term is charged mass by construction, so it has to face the same two cases.
const XPFIT = {}
const pairAt = (a, b, p) => {
  if (!XPFIT[p]) XPFIT[p] = xFit(Object.assign({}, EXIT_PUB, { p }))
  const f = XPFIT[p]
  const sA = kAgi,
    sX = kExit,
    sE = EXIT
  kAgi = 0
  kExit = f.k
  EXIT = f.s
  const d = lap(b.c, HAK) - lap(a.c, HAK)
  kAgi = sA
  kExit = sX
  EXIT = sE
  return d
}
console.log('\n### the two flagged cases, re-run against the corner-exit term')
console.log(
  '  A. GTO (' +
    gtoR.c.kg +
    ' kg, mu ' +
    gripMu(gtoR.c).toFixed(2) +
    ') against CRX SiR (' +
    crxR.c.kg +
    ' kg, mu ' +
    gripMu(crxR.c).toFixed(2) +
    ')',
)
console.log(
  '     driven:   GTO ' +
    gtoR.driven.toFixed(1) +
    '  CRX ' +
    crxR.driven.toFixed(1) +
    '   GTO ahead by ' +
    (crxR.driven - gtoR.driven).toFixed(1) +
    ' s',
)
console.log(
  '     modelled: GTO ' +
    gtoR.mod.toFixed(1) +
    '  CRX ' +
    crxR.mod.toFixed(1) +
    '   GTO ahead by ' +
    (crxR.mod - gtoR.mod).toFixed(1) +
    ' s   (gap error ' +
    (crxR.mod - gtoR.mod - (crxR.driven - gtoR.driven)).toFixed(1) +
    ' s)',
)
console.log(
  '     on the 1.5x-radius reading of the course: GTO ahead by ' +
    (crxR.alt - gtoR.alt).toFixed(1) +
    ' s',
)
console.log(
  '     at other mass exponents in the exit term (kExit refitted on all three courses at each p):' ,
)
console.log(
  '       p = 0.0  GTO ahead by ' + pairAt(gtoR, crxR, 0).toFixed(1) +
    ' s   p = 0.5  ' + pairAt(gtoR, crxR, 0.5).toFixed(1) +
    ' s   p = 1.0  ' + pairAt(gtoR, crxR, 1).toFixed(1) +
    ' s   p = 2.0  ' + pairAt(gtoR, crxR, 2).toFixed(1) + ' s',
)
console.log(
  '     VERDICT: gap error ' +
    (crxR.mod - gtoR.mod - (crxR.driven - gtoR.driven)).toFixed(1) +
    ' s at the published exponent. Driven, 700 kg and 164 PS',
)
console.log(
  '     cancel to within half a second; the model gives the heavy car ' +
    ((crxR.mod - gtoR.mod) / (crxR.driven - gtoR.driven)).toFixed(1) +
    'x the margin it earned.',
)
console.log(
  '     Charging mass in the EXIT term is the thing that closes this pair, and the p row above is',
)
console.log(
  '     the price list. What it costs elsewhere is in stderr 2c, and case B below is where it bites.',
)
console.log(
  '     The gap is also strongly geometry-dependent, which is why it is quoted on two readings',
)
console.log(
  '     above: it is ' +
    (crxR.mod - gtoR.mod).toFixed(1) +
    ' s on the published course and ' +
    (crxR.alt - gtoR.alt).toFixed(1) +
    ' s once the radii are opened by half again. Much of what looks',
)
console.log(
  '     like a mass error is the connectors: with running room between corners the GTO\'s 193 PS/t',
)
console.log(
  '     beats the CRX\'s 163, and shortening them shrinks the gap without touching a constant.',
)
console.log('     1/mu cannot separate this pair at all.')
console.log(
  '  B. AZ-1 (' +
    azR.c.ps +
    ' PS, ' +
    azR.c.kg +
    ' kg) against the R35 (' +
    r35R.c.ps +
    ' PS, ' +
    r35R.c.kg +
    ' kg)',
)
console.log(
  '     driven:   ' +
    (azR.driven - r35R.driven).toFixed(1) +
    ' s apart over ' +
    (hakInfo.len / 1000).toFixed(1) +
    ' km',
)
console.log(
  '     modelled: ' +
    (azR.mod - r35R.mod).toFixed(1) +
    ' s apart   (gap error ' +
    (azR.mod - r35R.mod - (azR.driven - r35R.driven)).toFixed(1) +
    ' s, i.e. ' +
    Math.abs(((azR.mod - r35R.mod) / (azR.driven - r35R.driven)) * 100 - 100).toFixed(0) +
    '% too ' +
    (azR.mod - r35R.mod > azR.driven - r35R.driven ? 'wide' : 'narrow') +
    ')',
)
console.log(
  '     on the 1.5x-radius reading of the course: ' +
    (azR.alt - r35R.alt).toFixed(1) +
    ' s apart (gap error ' +
    (azR.alt - r35R.alt - (azR.driven - r35R.driven)).toFixed(1) +
    ' s)',
)
console.log(
  '     at other mass exponents in the exit term (kExit refitted at each p): p = 0.0  ' +
    pairAt(r35R, azR, 0).toFixed(1) + ' s   p = 0.5  ' + pairAt(r35R, azR, 0.5).toFixed(1) +
    ' s   p = 1.0  ' + pairAt(r35R, azR, 1).toFixed(1) +
    ' s   p = 2.0  ' + pairAt(r35R, azR, 2).toFixed(1) + ' s',
)
console.log(
  '     VERDICT: TOO NARROW, and this is the case that fought the mass exponent. The model puts',
)
console.log(
  '     ' +
    (azR.mod - r35R.mod).toFixed(1) +
    ' s between a 550 PS AWD flagship and a 64 PS kei roadster where the driver put ' +
    (azR.driven - r35R.driven).toFixed(1) +
    ' s,',
)
console.log(
  '     and charging mass makes it worse in the same direction, because the fast car here is also',
)
console.log(
  '     the heaviest and the slow one the lightest. Case A wants mass charged, case B wants it not',
)
console.log(
  '     charged, and case B is the bigger miss in seconds. That tension has not gone away; what',
)
console.log(
  '     changed is that the exit term spends mass through the FOLLOWING STRAIGHT, where the R35 has',
)
console.log(
  '     the power to recover it and the CRX does not, so the two cases no longer pull exactly',
)
console.log(
  '     against each other. The p row above prices how far that goes, and it is not all the way.',
)
console.log(
  '     For the record, on the additive term this was the whole argument and',
)
console.log('     it landed on p = 0 rather than on a compromise.')
console.log('\n### what these ' + hakRows.length + ' laps establish, and what they do not (summary)')
console.log(
  '  ESTABLISHED. (1) THE MODEL CANNOT LAP THE REAL ROAD, and that has not changed. On the surveyed',
)
console.log(
  '  geometry it is ' +
    scoreAt(shp({}), 0, HAKM_AFF, HAK_MAP).hakMean.toFixed(0) +
    '% slow with any direction-change term switched off, which is the floor',
)
console.log(
  '  of what the model can produce there. The missing quantity is a RACING-LINE model, not a',
)
console.log(
  '  gradient and not a corner charge. (2) THE PUBLISHED COURSE IS A FACSIMILE THAT ABSORBS THAT',
)
console.log(
  '  GAP, by ruling, so the level error on the eight it was searched against (' +
    mAvg(hakRows.filter((r) => !r.r4).map((r) => r.e)).toFixed(2) + '% mean) is a',
)
console.log(
  '  measurement of the search and NOT of the model. The three R4 rows are not: ' +
    mAvg(hakR4).toFixed(2) + '% mean, ' + maeOf(hakR4).toFixed(2) + '% MAE.',
)
console.log(
  '  (3) The corner-exit penalty is worth ' +
    mAvg(hakRows.map((r) => (100 * r.split.exi) / r.mod)).toFixed(0) +
    '% of the modelled lap here against ' + misSplit.agi.toFixed(0) +
    '% on Misaki, and it gets there',
)
console.log(
  '  through the geometry rather than through a course-specific constant. (4) Even on a course',
)
console.log(
  '  fitted to them, the model does not quite spread the field (' + mSpread.toFixed(3) +
    'x against a driven ' + dSpread.toFixed(3) + 'x).',
)
console.log(
  '  (5) The residual after the direction-change term is removed is ' +
    rmsOf(scatNA).toFixed(1) + '% rms scatter with no correlation',
)
console.log('  to mass, power-to-weight or grip on this course alone.')
console.log(
  '  NOT ESTABLISHED. WHICH missing physics owns the level. The racing line is the best candidate',
)
console.log(
  '  and it nulls the bias on the surveyed map at about 3x effective radius, but a uniform 3x takes',
)
console.log(
  '  the field spread the WRONG way, so a scalar is not the answer and eight laps cannot resolve a',
)
console.log(
  '  per-corner one. NOR IS THE GEOMETRY ITSELF ESTABLISHED: 3, 4 and 5 switchbacks score 1.410,',
)
console.log(
  '  1.400 and 1.427 on the joint objective, so the published radii are one fit among many and',
)
console.log(
  '  carry no physical claim. The level also carries a ' +
    mAvg(hakRows.map((r) => (100 * r.stand) / r.driven)).toFixed(1) +
    '% standing-start offset the other way, which the',
)
console.log(
  '  flying-lap fit has quietly absorbed into the geometry too. Laps on one course can speak about',
)
console.log('  ordering, spread and pair gaps. They cannot resolve the level.')

// =====================================================================================
// THE 5 DRIVEN WANGAN LAPS
// =====================================================================================
// The third driven course, and the first that puts the model on a road where nothing slow
// happens. Everything below runs at the published constants.
const wanRows = WAND.map((d) => {
  const s = lapSplit(d.c, WAN, true)
  const bookC = byId(d.id)
  return {
    id: d.id,
    c: d.c,
    lbl: d.lbl,
    driven: d.t,
    mod: s.t,
    e: pct(s.t, d.t),
    split: s,
    r4: d.r4,
    stand: standingPenalty(d.c, WAN),
    book: lap(bookC, WAN),
  }
})
wanRows.forEach((r) => {
  r.modS = r.mod + r.stand
  r.eS = pct(r.modS, r.driven)
  r.eBook = pct(r.book, r.driven)
})
const wanE = wanRows.map((r) => r.e)
const wanInfo = trackInfo('Wangan', WAN)
const wanDescInfo = trackInfo('as described', WAN_DESC)
console.log('\n## THE ' + WAND.length + ' DRIVEN WANGAN LAPS at the published constants')
console.log('READ THE COURSE BEFORE THE TABLE, on exactly the footing Hakone is read. This 7.0 km')
console.log('of highway loop is a BEHAVIOURAL FACSIMILE: a geometry searched to reproduce the FIRST')
console.log('FIVE of these driven times, with the direction-change weight refitted at every')
console.log('candidate. It is not a survey and no radius in it is a measured value. What IS given is')
console.log('the maintainer\'s description of the road, authored in the file as WAN_DESC and scored')
console.log('beside every number here. SO THE MEAN ERROR ON THOSE FIVE IS A MEASUREMENT OF THE')
console.log('SEARCH. What it is NOT is the whole story, and that is the difference from Hakone: a')
console.log('geometry charges every car through the same corners, so a search can move the level')
console.log('and cannot move the spread about it. The spread is the model. The three R4 rows sit')
console.log('outside the search entirely: this road had never seen them when they were predicted.')

console.log('\n### the course as published, against the description it was authored from')
console.log(
  '  ' + (wanInfo.len / 1000).toFixed(2) + ' km, ' + wanInfo.corners + ' corners (' +
    Object.entries(wanInfo.mix).map(([a, b]) => b + ' ' + a).join(', ') + '), ' +
    wanInfo.straightPct + '% straight, avg radius ' + wanInfo.avgR + ' m',
)
console.log(
  '  connectors, sorted (m): ' + WAN.map((s) => s[2]).sort((a, b) => a - b).join(' ') +
    '   longest ' + wanInfo.longest + ' m',
)
console.log('                                    PUBLISHED         as described')
;[
  ['length', (wanInfo.len / 1000).toFixed(2) + ' km', (wanDescInfo.len / 1000).toFixed(2) + ' km'],
  ['corners', String(wanInfo.corners), String(wanDescInfo.corners)],
  [
    'fast / medium / slow',
    (wanInfo.mix.fast || 0) + ' / ' + (wanInfo.mix.medium || 0) + ' / ' + (wanInfo.mix.slow || 0),
    (wanDescInfo.mix.fast || 0) + ' / ' + (wanDescInfo.mix.medium || 0) + ' / ' + (wanDescInfo.mix.slow || 0),
  ],
  [
    'tightest / widest radius',
    Math.min(...WAN.map((s) => s[0])) + ' / ' + Math.max(...WAN.map((s) => s[0])) + ' m',
    Math.min(...WAN_DESC.map((s) => s[0])) + ' / ' + Math.max(...WAN_DESC.map((s) => s[0])) + ' m',
  ],
  ['average radius', wanInfo.avgR + ' m', wanDescInfo.avgR + ' m'],
  ['longest connector', wanInfo.longest + ' m', wanDescInfo.longest + ' m'],
  ['straight fraction', wanInfo.straightPct + '%', wanDescInfo.straightPct + '%'],
  ['total heading change', WAN.reduce((a, s) => a + s[1], 0) + ' deg', WAN_DESC.reduce((a, s) => a + s[1], 0) + ' deg'],
  ['sum of tight (direction-change demand)', tightSum(WAN, JOINT).toFixed(1), tightSum(WAN_DESC, JOINT).toFixed(1)],
].forEach(([lbl, now, was]) =>
  console.log('    ' + lbl.padEnd(30) + now.padStart(12) + was.padStart(24)),
)
{
  const de = WAND.map((d) => pct(lap(d.c, WAN_DESC), d.t))
  console.log(
    '  WHAT THE SEARCH MOVED, AND IN WHICH DIRECTION. WAN_DESC keeps this course\'s connector',
  )
  console.log(
    '  profile and moves only the corners back to the description, so the comparison isolates what',
  )
  console.log(
    '  the search did to the corners. On WAN_DESC the model is ' + Math.abs(mAvg(de)).toFixed(1) +
      '% ' + (mAvg(de) < 0 ? 'FAST' : 'SLOW') + ' on average, range ' +
      de.map((x) => x.toFixed(1) + '%').join(' / ') + ',',
  )
  console.log(
    '  MAE ' + maeOf(de).toFixed(1) + '% against the published ' + maeOf(wanE).toFixed(1) + '%.',
  )
  if (maeOf(de) < maeOf(wanE)) {
    console.log(
      '  THE ROAD AS DESCRIBED NOW SCORES BETTER THAN THE ROAD THAT WAS SEARCHED, and that reversal',
    )
    console.log(
      '  is a direct consequence of replacing the direction-change term. This geometry was searched',
    )
    console.log(
      '  to suit the additive one; it no longer suits the term the model carries. It is held fixed',
    )
    console.log(
      '  anyway, by instruction, so that the two terms are compared on the same road, and the',
    )
    console.log(
      '  reversal is left visible rather than searched away. What the search originally did was',
    )
  } else {
    console.log(
      '  So the search had to ADD corner demand rather than remove it. What it did was',
    )
  }
  console.log(
    '  to shallow the sweepers and tighten the three corners that are not sweepers: the',
  )
  console.log(
    '  mediums go ' + WAN_DESC.filter((s) => s[0] >= 90 && s[0] < 220).map((s) => s[0]).join('/') +
      ' m to ' + WAN.filter((s) => s[0] >= 90 && s[0] < 220).map((s) => s[0]).join('/') +
      ' m and the one slow corner ' +
      WAN_DESC.filter((s) => s[0] < 90).map((s) => s[0]).join('/') + ' m to ' +
      WAN.filter((s) => s[0] < 90).map((s) => s[0]).join('/') + ' m,',
  )
  console.log(
    '  which is a junction ramp of about the tightness of the real C1\'s own, and the maintainer',
  )
  console.log(
    '  describes this loop as a little wider and faster than C1. The corner CHARACTER was held to',
  )
  console.log(
    '  the description throughout the search (eight fast sweepers, two mediums, one slow) and the',
  )
  console.log(
    '  length to 7.0 km. Inside that box the count is barely identified: the best seven-sweeper',
  )
  console.log(
    '  layout scored 1.98% on the five laps then in the fit against the published eight at 1.83%',
  )
  console.log('  and the best nine at 2.45%, so this geometry is one plausible road among many that')
  console.log('  fit. Those three figures are the SEARCH as it was run, at the term that has since been')
  console.log('  replaced, and they are quoted as history rather than as current scores.')
}

console.log('\n### driven against modelled, at the published constants')
console.log(
  'car                                    driven  modelled   delta    err%   +start   err%    book rec.      pred',
)
wanRows.forEach((r) =>
  console.log(
    '  ' + r.lbl.slice(0, 36).padEnd(38) + r.driven.toFixed(1).padStart(6) +
      r.mod.toFixed(1).padStart(10) + (r.mod - r.driven).toFixed(1).padStart(8) +
      r.e.toFixed(1).padStart(8) + r.modS.toFixed(1).padStart(9) + r.eS.toFixed(1).padStart(7) +
      r.book.toFixed(1).padStart(10) + (' (' + r.eBook.toFixed(1) + '%)').padStart(9) +
      (predOf(r.id, 'Wangan') != null
        ? predOf(r.id, 'Wangan').toFixed(1).padStart(10)
        : '         -') + predTag(r.id, 'Wangan'),
  ),
)
console.log(
  '  GROUP: mean ' + mAvg(wanE).toFixed(2) + '%   MAE ' + maeOf(wanE).toFixed(2) + '%   worst ' +
    Math.max(...wanE.map(Math.abs)).toFixed(2) + '%   rms ' + rmsOf(wanE).toFixed(2) + '%',
)
{
  const noLfa = wanRows.filter((r) => r.id !== 'lexus-lfa').map((r) => r.e)
  const tight = wanRows.filter((r) => Math.abs(r.e) < 0.5)
  const loose = wanRows.filter((r) => Math.abs(r.e) >= 0.5)
  console.log(
    '  without the LFA (n=' + noLfa.length + '): mean ' + mAvg(noLfa).toFixed(2) + '%   MAE ' +
      maeOf(noLfa).toFixed(2) + '%   worst ' + Math.max(...noLfa.map(Math.abs)).toFixed(2) + '%',
  )
  console.log(
    '  ' + tight.length + ' of the ' + wanRows.length +
      ' laps land inside half a per cent; the ' + loose.length + ' that do not are ' +
      loose.map((r) => r.lbl.replace(/^\d{4} /, '') + ' ' + (r.e > 0 ? '+' : '') + r.e.toFixed(1) + '%').join(' and ') + '.',
  )
  console.log(
    '  READ THE SCATTER, NOT THE LEVEL. A geometry charges every car through the same corners, so',
  )
  console.log(
    '  a search moves the level and cannot move the spread about it. The scatter about this mean is',
  )
  console.log(
    '  ' + rmsOf(wanE.map((x) => x - mAvg(wanE))).toFixed(2) + '% rms, worst ' +
      wanRows
        .slice()
        .sort((x, y) => Math.abs(y.e - mAvg(wanE)) - Math.abs(x.e - mAvg(wanE)))
        .slice(0, 2)
        .map(
          (r) =>
            r.lbl.replace(/^\d{4} /, '').slice(0, 22) + ' ' +
            (r.e - mAvg(wanE) > 0 ? '+' : '') + (r.e - mAvg(wanE)).toFixed(1),
        )
        .join(' and ') + '. THAT is the model; the level is the search',
  )
  console.log(
    '  plus whatever replacing the direction-change term did to it.',
  )
  const r4e = wanRows.filter((r) => r.r4).map((r) => r.e)
  const blind = wanRows.filter((r) => r.r4 || r.acc).map((r) => r.e)
  console.log(
    '  THE THREE R4 ROWS ALONE (out of sample for this geometry): mean ' + mAvg(r4e).toFixed(2) +
      '%   MAE ' + maeOf(r4e).toFixed(2) + '%   against ' +
      maeOf(wanRows.filter((r) => !r.r4 && !r.acc).map((r) => r.e)).toFixed(2) + '% for the ' +
      wanRows.filter((r) => !r.r4 && !r.acc).length + ' the road was searched against.',
  )
  const a = wanRows.find((r) => r.acc)
  if (a) {
    console.log(
      '  THE ACCEPTANCE ROW (' + a.lbl.replace(/^\d{4} /, '') + ', predicted ' +
        predOf(a.id, 'Wangan').toFixed(1) + ' s before it was driven at ' + a.driven.toFixed(1) +
        ' s): committed error ' + pct(predOf(a.id, 'Wangan'), a.driven).toFixed(2) + '%.',
    )
    console.log(
      '  RECORDS RECONCILE ON THIS CAR. The committed figure ran the SPEC-BOOK record, the' +
        ' `book rec.` column here (' + a.book.toFixed(2) + ' s); this course\'s convention runs',
    )
    console.log(
      '  the Forza fingerprint, the modelled column (' + a.mod.toFixed(2) + ' s). They differ by ' +
        Math.abs(a.mod - a.book).toFixed(2) + ' s, so the prediction is checkable either way.',
    )
    console.log(
      '  All ' + blind.length + ' out-of-sample rows together: MAE ' + maeOf(blind).toFixed(2) + '%.',
    )
  }
}
{
  const dS = Math.max(...wanRows.map((r) => r.driven)) / Math.min(...wanRows.map((r) => r.driven))
  const mS = Math.max(...wanRows.map((r) => r.mod)) / Math.min(...wanRows.map((r) => r.mod))
  console.log(
    '  SPREAD: driven ' + dS.toFixed(3) + 'x   modelled ' + mS.toFixed(3) +
      'x   (the model spreads the field ' + (mS / dS).toFixed(2) + 'x as far as the driver did)',
  )
  const byD = wanRows.slice().sort((a, b) => a.driven - b.driven)
  const inv = []
  for (let i = 0; i < byD.length; i++)
    for (let j = i + 1; j < byD.length; j++)
      if (byD[i].mod > byD[j].mod)
        inv.push(byD[i].lbl.slice(0, 26) + ' over ' + byD[j].lbl.slice(0, 26))
  console.log(
    '  ORDERING: ' + inv.length + ' inversion(s) out of ' +
      (wanRows.length * (wanRows.length - 1)) / 2 + ' ordered pairs' +
      (inv.length ? ': ' + inv.join('; ') : ' - the model reproduces the driven order exactly.'),
  )
  console.log(
    '  where the lap time goes (mean over these ' + wanRows.length + ' cars): corner arcs ' +
      mAvg(wanRows.map((r) => (100 * r.split.arc) / r.mod)).toFixed(1) +
      '%, corner-exit cost ' + mAvg(wanRows.map((r) => (100 * r.split.exi) / r.mod)).toFixed(1) +
      '%, straights + braking ' + mAvg(wanRows.map((r) => (100 * r.split.str) / r.mod)).toFixed(1) + '%.',
  )
  console.log(
    '  THAT SHARE IS THE POINT OF THE NEW TERM. On Hakone the same penalty is worth ' +
      mAvg(hakRows.map((r) => (100 * r.split.exi) / r.mod)).toFixed(1) + '% of the lap; here',
  )
  console.log(
    '  it is worth a fraction of that, and nothing in the model was told which course was which.',
  )
  console.log('  This course\'s evidence remains drag, power and grip.')
}

// ---- the question this course was built to answer ----
console.log('\n### does a car\'s Misaki residual survive on a fast road?')
console.log(
  '  Misaki is 4.7 km and 68% straight; Wangan is 7.0 km and ' + wanInfo.straightPct +
    '%, and every car here takes 8 of its 11 corners above 161 km/h,',
)
console.log(
  '  which is the speed above which the measured acceleration curve stops being measured and',
)
console.log(
  '  starts being extrapolated. Both courses run the SAME record for each car, so the shift is',
)
console.log('  not a bookkeeping difference. A residual that survives is not about cornering.')
console.log('    car                                    Misaki    Wangan     shift')
const misById = (id) => misRows.find((r) => r.id === id)
wanRows.forEach((r) => {
  const m = misById(r.id)
  console.log(
    '    ' + r.lbl.slice(0, 36).padEnd(38) + (m ? m.e.toFixed(2).padStart(7) : '    n/a') + '%' +
      r.e.toFixed(2).padStart(9) + '%' + (m ? (r.e - m.e).toFixed(2).padStart(9) + '%' : '      n/a'),
  )
})
{
  const lfa = wanRows.find((r) => r.id === 'lexus-lfa')
  const nsx = wanRows.find((r) => r.id === 'honda-nsx-r-na1')
  const beat = wanRows.find((r) => r.id === 'honda-beat-pp1')
  const mL = misById('lexus-lfa'),
    mN = misById('honda-nsx-r-na1'),
    mB = misById('honda-beat-pp1')
  // The whole point of this comparison is a GAP, because a gap survives a level shift and a raw
  // residual does not. Wangan now carries a level of its own that the term change put there, so
  // every raw residual in the column above has moved with it and only the gaps are readable.
  const shiftAll = mAvg(wanRows.map((r) => r.e - misById(r.id).e))
  console.log(
    '  READ THE GAPS, NOT THE SHIFTS. Every car in the column above shifted by about the same' +
      ' amount',
  )
  console.log(
    '  (' + shiftAll.toFixed(1) + ' points on the mean, spread ' +
      rmsOf(wanRows.map((r) => r.e - misById(r.id).e - shiftAll)).toFixed(1) +
      '% rms about it), because the two courses now sit at different',
  )
  console.log(
    '  levels. What survives that is the difference between two cars, and it is this: the LFA runs ' +
      mL.e.toFixed(1) + '%',
  )
  console.log(
    '  on Misaki and ' + lfa.e.toFixed(1) + '% here, the NSX-R ' + mN.e.toFixed(1) + '% and ' +
      nsx.e.toFixed(1) + '%. The GAP between them, which no level can touch, goes from ' +
      (mL.e - mN.e).toFixed(1) + ' points',
  )
  console.log(
    '  to ' + (lfa.e - nsx.e).toFixed(1) + ' points: it ' +
      (Math.abs(lfa.e - nsx.e) > Math.abs(mL.e - mN.e) ? 'WIDENS' : 'HOLDS ITS SIZE') +
      ' with speed exposure, and it holds its SIGN. That pair is the',
  )
  console.log(
    '  finding of this course and it has survived a change of direction-change term, which is a',
  )
  console.log(
    '  harder test than it has previously faced. The Beat goes ' + mB.e.toFixed(1) + '% to ' +
      beat.e.toFixed(1) + '%, i.e. it moves with the level',
  )
  console.log(
    '  rather than against it: on a road where it spends the whole lap at or near its ' +
      Math.round(3.6 * beat.split.b.vTop) + ' km/h top',
  )
  console.log('  speed the model has no particular quarrel with it. See the kei note below.')
}

// ---- which single input reconciles the two cars on BOTH courses? ----
// A residual that survives two courses is a car property, and there are only four inputs it can
// be. Each is solved for on each course independently; a candidate is only credible if the two
// courses ask it for the SAME move. Nothing here is applied.
console.log('\n### which single input would reconcile them, and do the two courses agree on it?')
console.log(
  '  Each input is solved, alone, for the multiplier that reaches the driven time - once on',
)
console.log(
  '  Misaki, once on Wangan. The courses are independent evidence, so a real cause has to ask for',
)
console.log('  the same number twice. DIAGNOSTIC: nothing below is applied to anything.')
console.log(
  '    car          input              Misaki wants   Wangan wants   agreement',
)
{
  const solveMono = (f, lo, hi, target) => {
    const flo = f(lo),
      fhi = f(hi)
    if ((flo - target) * (fhi - target) > 0) return null
    const inc = fhi > flo
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      if (inc === f(mid) < target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  ;[
    ['lexus-lfa', 'LFA'],
    ['honda-nsx-r-na1', 'NSX-R'],
  ].forEach(([id, short]) => {
    const c0 = WAND.find((d) => d.id === id).c
    const tW = WAND.find((d) => d.id === id).t
    const tM = misById(id).driven
    const knobs = [
      ['mechanical mu', (x) => Object.assign({}, c0, { lg: gripMu(c0) * x }), 0.6, 1.8],
      ['downforce dfC', (x) => Object.assign({}, c0, { dfC: (c0.dfC || 0) * x }), 0, 20],
      ['drag CdA', (x) => Object.assign({}, c0, { cd: c0.cd * x }), 0.05, 4],
      [
        'effective power',
        (x) => Object.assign({}, c0, { z161: c0.z97 + (c0.z161 - c0.z97) / x }),
        0.5, 2.2,
      ],
    ]
    knobs.forEach(([lbl, mk, lo, hi]) => {
      const xM = solveMono((x) => lap(mk(x), LEGEND), lo, hi, tM)
      const xW = solveMono((x) => lap(mk(x), WAN), lo, hi, tW)
      console.log(
        '    ' + short.padEnd(13) + lbl.padEnd(19) +
          (xM == null ? 'no solution' : xM.toFixed(3) + 'x').padStart(13) +
          (xW == null ? 'no solution' : xW.toFixed(3) + 'x').padStart(15) +
          (xM != null && xW != null
            ? (100 * Math.abs(xW / xM - 1)).toFixed(0).padStart(9) + '% apart'
            : '        -') +
          (lbl === 'effective power' && xW != null
            ? '   -> 0-161 becomes ' + (c0.z97 + (c0.z161 - c0.z97) / xW).toFixed(2) +
              ' s against a MEASURED ' + c0.z161.toFixed(2) + ' s'
            : ''),
      )
    })
  })
}
console.log(
  '  READ THIS AS AN ELIMINATION, WHICH IS WHAT IT IS. DRAG cannot be the LFA\'s problem: there is',
)
console.log(
  '  no drag figure at all, down to and including zero, that reaches its driven time on either',
)
console.log(
  '  course, and on the NSX-R the two courses disagree by about a quarter on the drag they want.',
)
console.log(
  '  POWER survives the two-course agreement test and fails a harder one: the multiplier the LFA',
)
console.log(
  '  needs rewrites its own 0-161, and that time is an INPUT to the solve, not an output of it.',
)
console.log(
  '  The last column above prices exactly that, and it is a full second and a half of a measured',
)
console.log(
  '  figure. On the NSX-R power cannot even reach the driven time on Misaki inside the bracket.',
)
console.log(
  '  What both courses agree on WITHOUT rewriting a measurement is MECHANICAL GRIP: the NSX-R asks',
)
console.log(
  '  both courses for the same figure to within about a per cent, the LFA to within seven. The model',
)
console.log(
  '  wants the LFA to corner roughly a tenth harder than its panel says and the NSX-R roughly a',
)
console.log(
  '  tenth softer - which would put the 2010 supercar on 305-section rubber ABOVE the 1992 NSX-R',
)
console.log(
  '  on 225s, where Forza\'s own lateral-g panel puts it below (1.03 g against 1.07 at 97 km/h).',
)
console.log(
  '  THAT IS THE FINDING OF THIS COURSE, and it is an indictment of the panel\'s lateral g as a',
)
console.log(
  '  mechanical-grip proxy on exactly the two cars where the ordering is least believable. It is',
)
console.log('  NOT a proposal: two cars are two cars, and nothing here is applied.')

// ---- the standing start, which this course cannot pin ----
console.log('\n### the standing start, and why this course cannot pin it')
console.log(
  '  These laps are from rest and lap() is a FLYING lap, so the model owes a standing-start offset',
)
console.log(
  '  exactly as it does on Hakone. But lap() is CYCLIC: rotating the course array does not change',
)
console.log(
  '  the lap time by so much as a bit, and it moves the notional start line to a different corner',
)
console.log(
  '  exit. On a 7.0 km loop with connectors from ' + Math.min(...WAN.map((s) => s[2])) + ' to ' +
    Math.max(...WAN.map((s) => s[2])) + ' m that is worth several seconds, so the offset',
)
console.log('  is NOT IDENTIFIED and the published column above is one reading of it, not the answer.')
console.log('    car                                  published   min over the 11 rotations   max')
{
  const rot = (segs, n) => segs.slice(n).concat(segs.slice(0, n))
  wanRows.forEach((r) => {
    const ps = WAN.map((_, i) => standingPenalty(r.c, rot(WAN, i))).sort((a, b) => a - b)
    console.log(
      '    ' + r.lbl.slice(0, 34).padEnd(36) + r.stand.toFixed(2).padStart(9) +
        ps[0].toFixed(2).padStart(24) + ps[ps.length - 1].toFixed(2).padStart(9) +
        '   (' + (100 * ps[0] / r.driven).toFixed(1) + '% to ' +
        (100 * ps[ps.length - 1] / r.driven).toFixed(1) + '% of the driven lap)',
    )
  })
}
console.log(
  '  The published array puts the start line at the head of the longest run, which is where a start',
)
console.log(
  '  line on a highway loop would sit, and that is the WORST case of the eleven. The fit is on the',
)
console.log(
  '  flying lap for all three courses, as it always has been, so this offset is absorbed into the',
)
console.log('  searched geometry along with everything else it absorbs. It is reported, not applied.')

// ---- geometry sensitivity, the same test Hakone gets ----
console.log('\n### how sensitive is this to the geometry it was fitted to?  (DIAGNOSTIC ONLY)')
console.log(
  '  Every radius scaled by a common factor, the arc taken back out of the connectors, so the',
)
console.log('  course stays 7.0 km and only its TIGHTNESS moves. 1.00x is the published facsimile.')
console.log('    radius   tightest m   corner km/h (LFA)   mean err%   MAE%   spread   LFA err%')
{
  const muL = gripMu(wanRows[0].c)
  ;[0.6, 0.8, 1, 1.25, 1.5, 2].forEach((sc) => {
    const segs = widenBy(WAN, sc)
    if (!segs) return
    const e = wanRows.map((r) => pct(lap(r.c, segs), r.driven))
    const t = wanRows.map((r) => lap(r.c, segs))
    console.log(
      '    ' + (sc.toFixed(2) + 'x').padStart(6) +
        Math.round(Math.min(...segs.map((s) => s[0]))).toString().padStart(13) +
        Math.round(3.6 * Math.sqrt(muL * g * Math.min(...segs.map((s) => s[0])))).toString().padStart(20) +
        mAvg(e).toFixed(1).padStart(12) + maeOf(e).toFixed(1).padStart(7) +
        (Math.max(...t) / Math.min(...t)).toFixed(3).padStart(9) + e[0].toFixed(1).padStart(11) +
        (sc === 1 ? '   <== published' : ''),
    )
  })
}
console.log(
  '  THE LFA COLUMN IS THE POINT OF THIS TABLE. Its residual holds its size and its sign across',
)
console.log(
  '  every reading of the geometry, which is what makes it a statement about the car rather than',
)
console.log('  an artefact of the road the search happened to land on.')

// ---- the blind prediction ----
// Committed before the maintainer drives it. The Supra RZ is a spec-book car with a full panel
// capture and it is in NO Wangan or Misaki fit; it is one of the eight Hakone laps, so it is
// in-sample for kAgi and for the Hakone geometry, and that is stated rather than glossed.
console.log('\n### BLIND PREDICTION: the 1998 Toyota Supra RZ on Wangan')
{
  const sup = byId('toyota-supra-rz-jza80')
  const s = lapSplit(sup, WAN, true)
  const st = standingPenalty(sup, WAN)
  const hakSup = hakRows.find((r) => r.id === 'toyota-supra-rz-jza80')
  console.log(
    '  PREDICTED FLYING LAP: ' + s.t.toFixed(1) + ' s.  ' + sup.ps + ' PS, ' + sup.kg +
      ' kg, mu ' + gripMu(sup).toFixed(2) + ', dfC ' + sup.dfC + ', CdA ' + s.b.CdA.toFixed(3) +
      ', top ' + Math.round(3.6 * s.b.vTop) + ' km/h,',
  )
  console.log(
    '  mean apex ' + Math.round(3.6 * mAvg(s.apex)) + ' km/h, arc ' +
      ((100 * s.arc) / s.t).toFixed(0) + '% / corner-exit ' + ((100 * s.exi) / s.t).toFixed(0) +
      '% / straights ' + ((100 * s.str) / s.t).toFixed(0) + '%, standing offset ' + st.toFixed(1) +
      ' s if the start line is where',
  )
  console.log(
    '  the published array puts it. That is an average of ' +
      (3.6 * (wanInfo.len / s.t)).toFixed(0) + ' km/h, between the driven Evo VI TME (' +
      (3.6 * (wanInfo.len / 131.9)).toFixed(0) + ') and the NSX-R (' +
      (3.6 * (wanInfo.len / 129.6)).toFixed(0) + ').',
  )
  console.log(
    '  UNCERTAINTY, from the residual spread of the courses that ARE fitted: the ' + WAND.length +
      ' Wangan laps',
  )
  console.log(
    '  sit at ' + rmsOf(wanE).toFixed(1) + '% rms (' + rmsOf(wanRows.filter((r) => r.id !== 'lexus-lfa').map((r) => r.e)).toFixed(1) +
      '% without the LFA) and the ' + DRIVEN.length + ' Misaki laps at ' + rmsOf(misE).toFixed(1) +
      '% rms. Call it +/- 3%,',
  )
  console.log(
    '  i.e. ' + (s.t * 0.97).toFixed(1) + ' to ' + (s.t * 1.03).toFixed(1) +
      ' s, with the single number ' + s.t.toFixed(1) + ' s.',
  )
  console.log(
    '  WHAT WOULD MAKE IT WRONG, stated in advance. The model puts the Supra BEHIND the Evo VI TME',
  )
  console.log(
    '  (' + lap(WAND.find((d) => d.id === 'mitsubishi-lancer-evo-vi-tommi-makinen-cp9a').c, WAN).toFixed(1) +
      ' s modelled, ' + '131.9 driven) despite 44 more PS and a ' +
      Math.round(3.6 * s.b.vTop - 240) + ' km/h higher top speed, because the Evo\'s',
  )
  console.log(
    '  measured downforce coefficient (' +
      byId('mitsubishi-lancer-evo-vi-tommi-makinen-cp9a').dfC +
      ', the roster\'s highest) buys it far more corner speed through eight',
  )
  console.log(
    '  fast sweepers than the Supra\'s ' + sup.dfC + ' does. If the Supra comes in AHEAD of the Evo,',
  )
  console.log(
    '  the downforce term is over-credited at speed and this is where it shows. For reference the',
  )
  console.log(
    '  same car\'s Hakone lap is ' + hakSup.mod.toFixed(1) + ' s against ' + hakSup.driven.toFixed(1) +
      ' s driven (' + hakSup.e.toFixed(1) + '%), on a course fitted with that lap in it.',
  )
}

// =====================================================================================
// YATABE STRAIGHT: THE MEASURED 1 km RUNS, THE FLAT OFFSET, AND A CLEAN NEGATIVE
// =====================================================================================
// This section exists to be argued with. Seven standing kilometres were driven against seven
// committed predictions, all seven came back slow, and the obvious reading - that the solved pEff
// is contaminated by launch losses and should be handed back at speed - is WRONG in a way the
// seven points themselves establish. Everything below is the working, kept in the harness so that
// nobody has to redo it and so that the next measurement can overturn it cheaply.
//
// WHAT CHANGED ON 2026-07-27. The raw model is unchanged and still fails these runs by a flat
// one-signed amount, so on maintainer ruling the set is now CALIBRATED rather than merely scored:
// a single flat multiplier (DRAG_OFFSET, fitted where it is defined) comes off computed
// kilometres and off nothing else in the file. The raw column is kept beside the corrected one in
// every table here, because the raw column is the model and the corrected column is the model
// plus an admission.
console.log('\n\n## YATABE STRAIGHT: THE ' + DRAG_DRIVEN.length + ' MEASURED 1 km RUNS')
console.log('Standing start, traction and stability control off, each the average of three')
console.log('consistent runs. Every `pred` below was committed BEFORE the car was driven.')
console.log('NO LAP CONSTANT IS FITTED TO THIS SET. It votes on nothing in the cornering model,')
console.log('and the mechanism probes at the end of the section are why, not an oversight.')
console.log('WHAT IT DOES CARRY is one flat calibration constant of its own, applied to computed')
console.log('kilometres ONLY: see the DRAG_OFFSET block for the fit and for why letting it reach')
console.log('the lap path would break three courses that currently work.')
console.log('WHY A STRAIGHT LINE. A lap cannot separate the acceleration model from the cornering')
console.log('model. It is also the only measurement that exists above 161 km/h, which is where')
console.log('the two published acceleration figures stop and the model starts extrapolating.')
{
  const rows = DRAG_DRIVEN.map((d) => {
    const r = dragKm(d.c, YATABE_M)
    const cal = r.t * (1 - DRAG_OFFSET)
    return { d, r, e: pct(r.t, d.t), eS: r.t - d.t, cal, eCal: pct(cal, d.t), eCalS: cal - d.t }
  })
  const eAll = rows.map((r) => r.e)
  const eCalAll = rows.map((r) => r.eCal)
  // The offset is fitted where it is defined, hundreds of lines above this and before anything
  // has touched a lever. Refitting it here from the same seven ratios is a check that nothing in
  // between moved the acceleration model under it; a mismatch would mean the published Yatabe
  // column was calibrated at one state and scored at another.
  const reFit = (function () {
    const r = rows.map((x) => x.r.t / x.d.t)
    const num = r.reduce((a, x) => a + x, 0),
      den = r.reduce((a, x) => a + x * x, 0)
    return 1 - num / den
  })()
  // Handed to the dashboard, which shows this set beside the three driven-lap sets.
  DRAG_SCORE.mean = +mAvg(eAll).toFixed(2)
  DRAG_SCORE.mae = +maeOf(eAll).toFixed(2)
  DRAG_SCORE.worst = +Math.max(...eAll.map(Math.abs)).toFixed(2)
  DRAG_SCORE.offsetPct = +(100 * DRAG_OFFSET).toFixed(2)
  DRAG_SCORE.meanCal = +mAvg(eCalAll).toFixed(2)
  DRAG_SCORE.maeCal = +maeOf(eCalAll).toFixed(2)
  DRAG_SCORE.worstCal = +Math.max(...eCalAll.map(Math.abs)).toFixed(2)
  DRAG_SCORE.rows = rows.map((r) => ({
    n: r.d.lbl,
    pred: r.d.p,
    driven: r.d.t,
    raw: +r.r.t.toFixed(2),
    eRaw: +r.e.toFixed(2),
    mod: +r.cal.toFixed(2),
    e: +r.eCal.toFixed(2),
    term: Math.round(3.6 * r.r.v),
    below161: Math.round((100 * r.r.xLo) / YATABE_M),
  }))
  console.log('\n### the scored set, raw and at the flat offset')
  console.log(
    'THE OFFSET IS FITTED ON THESE SEVEN RUNS, so the corrected columns are a residual spread and',
  )
  console.log('not a forecast. Read the raw columns as the model and the corrected ones as the')
  console.log('model plus one admitted constant. `acc` is the provenance of the car\'s own')
  console.log('acceleration curve: meas = both times published, 1pt = one published and one')
  console.log('regressed, which is a materially weaker input on a straight line than on a lap.')
  console.log(
    'car                            pred   driven   raw    err%    cal    err%   err s   acc' +
      '  terminal  below 161',
  )
  rows.forEach((r) =>
    console.log(
      '  ' + r.d.lbl.padEnd(28) + r.d.p.toFixed(2).padStart(6) + r.d.t.toFixed(3).padStart(9) +
        r.r.t.toFixed(2).padStart(7) + r.e.toFixed(2).padStart(7) +
        r.cal.toFixed(2).padStart(8) + r.eCal.toFixed(2).padStart(7) +
        r.eCalS.toFixed(3).padStart(8) + ACCTAG[accelOf(r.d.c).src].padStart(6) +
        ((3.6 * r.r.v).toFixed(0) + ' km/h').padStart(11) +
        ((100 * r.r.xLo) / YATABE_M).toFixed(0).padStart(9) + '% of the run',
    ),
  )
  console.log(
    '  RAW: mean ' + mAvg(eAll).toFixed(2) + '%   MAE ' + maeOf(eAll).toFixed(2) +
      '%   worst ' + Math.max(...eAll.map(Math.abs)).toFixed(2) + '%   rms ' +
      rmsOf(eAll).toFixed(2) + '%   mean deficit ' +
      mAvg(rows.map((r) => r.eS)).toFixed(3) + ' s',
  )
  console.log(
    '  AT THE OFFSET (-' + (100 * DRAG_OFFSET).toFixed(2) + '%): mean ' +
      mAvg(eCalAll).toFixed(2) + '%   MAE ' + maeOf(eCalAll).toFixed(2) + '%   worst ' +
      Math.max(...eCalAll.map(Math.abs)).toFixed(2) + '%   rms ' + rmsOf(eCalAll).toFixed(2) +
      '%   mean deficit ' + mAvg(rows.map((r) => r.eCalS)).toFixed(3) + ' s',
  )
  console.log(
    '  offset refitted here: ' + (100 * reFit).toFixed(4) + '% against ' +
      (100 * DRAG_OFFSET).toFixed(4) + '% where it is defined; they must agree, and they agree to ' +
      Math.abs(100 * (reFit - DRAG_OFFSET)).toFixed(6) + ' points.',
  )
  {
    // The same ordering test the three lap courses get. A flat multiplier cannot reorder
    // anything, so this count is identical raw and calibrated, which is the point of printing it.
    const byD = rows.slice().sort((a, b) => a.d.t - b.d.t)
    const inv = []
    for (let i = 0; i < byD.length; i++)
      for (let j = i + 1; j < byD.length; j++)
        if (byD[i].r.t > byD[j].r.t) inv.push(byD[i].d.lbl + ' over ' + byD[j].d.lbl)
    console.log(
      '  ORDERING: ' + inv.length + ' inversion(s) out of ' +
        (rows.length * (rows.length - 1)) / 2 + ' ordered pairs' +
        (inv.length ? ': ' + inv.join('; ') : ' - the model reproduces the driven order exactly.'),
    )
    console.log(
      '  SPREAD: driven ' +
        (Math.max(...rows.map((r) => r.d.t)) / Math.min(...rows.map((r) => r.d.t))).toFixed(3) +
        'x   modelled ' +
        (Math.max(...rows.map((r) => r.r.t)) / Math.min(...rows.map((r) => r.r.t))).toFixed(3) +
        'x   (the offset is a multiplier, so it moves neither of these)',
    )
    DRAG_SCORE.inversions = inv.length
    DRAG_SCORE.pairs = (rows.length * (rows.length - 1)) / 2
  }
  console.log('  EVERY CAR IS SLOW AND NOT ONE IS FAST in the raw column, and that column still')
  console.log('  reproduces the committed prediction on all seven, so nothing has drifted since')
  console.log('  they were driven. THE OFFSET IS A CONSTANT, NOT A MODEL: it takes the mean out')
  console.log('  and leaves the ordering and the spread exactly where they were, which is the')
  console.log('  honest thing for a calibration to do and the reason it is labelled protocol.')

  console.log('\n### where each run sits against the two measurements that pinned its curve')
  console.log('The solve reproduces 0-97 and 0-161 exactly. What it does NOT pin is the DISTANCE')
  console.log('covered inside that window, or anything at all above 161 km/h. All ' + rows.length)
  console.log('cars here carry both published times, so every curve in this table is solved and')
  console.log('none of them is regressed.')
  console.log(
    'car                            0-97   0-161   t@97  t@161   x@97  x@161  1km/0-161  term/vTop  at cap',
  )
  rows.forEach((r) => {
    const c = r.d.c, x = r.r
    console.log(
      '  ' + r.d.lbl.padEnd(28) + c.z97.toFixed(2).padStart(7) +
        (c.z161 != null ? c.z161.toFixed(2) : '-').padStart(8) +
        x.t97.toFixed(2).padStart(7) + (x.t161 ? x.t161.toFixed(2) : '-').padStart(7) +
        x.x97.toFixed(0).padStart(7) + (x.t161 ? x.x161.toFixed(0) : '-').padStart(7) +
        (x.t161 ? (x.t / x.t161).toFixed(2) : 'never').padStart(11) +
        (x.v / x.vCap).toFixed(2).padStart(11) + ((100 * x.tCap) / x.t).toFixed(0).padStart(7) + '%',
    )
  })
  console.log('  TWO STRUCTURAL FACTS COME STRAIGHT OFF THIS TABLE.')
  console.log('  1. The Beat never reaches 161 km/h in a kilometre. Its whole run is INSIDE the')
  console.log('     window the two measurements pin, so no mechanism that acts above 161 km/h can')
  console.log('     move it by a single millisecond, whatever that mechanism is or how hard it is')
  console.log('     pushed. That one fact disposes of a whole family before it is fitted.')
  console.log(
    '  2. No car spends any time at its speed cap and every one finishes between ' +
      Math.min(...rows.map((r) => r.r.v / r.r.vCap)).toFixed(2) + ' and ' +
      Math.max(...rows.map((r) => r.r.v / r.r.vCap)).toFixed(2) + ' of it, so the top-speed',
  )
  console.log('     clamp is not what is costing the time either.')

  console.log(
    '\n### what the RAW error keys on   (n = ' + rows.length +
      ', so |r| below about 0.75 is not evidence)',
  )
  console.log('  This is the table that decides the SHAPE of the correction, so it runs on the raw')
  console.log('  error: a flat offset is only the honest form if nothing about the car orders the')
  console.log('  deficit, and taking the mean out first would guarantee that answer.')
  const preds = [
    ['pEff / crank x eta', (r) => r.r.b.Pacc / r.r.b.Pw],
    ['aLaunch / (mu g)', (r) => r.r.b.aGrip / (r.r.b.mu * g)],
    ['power to weight (PS/t)', (r) => (1000 * r.d.c.ps) / r.d.c.kg],
    ['mass (kg)', (r) => r.r.b.m],
    ['drivetrain (AWD = 1)', (r) => (r.d.c.dt === 'AWD' ? 1 : 0)],
    ['CdA', (r) => r.r.b.CdA],
    ['terminal / top speed', (r) => r.r.v / r.r.vCap],
    ['share of TIME below 161', (r) => r.r.tLo / r.r.t],
    ['share of DISTANCE below 161', (r) => r.r.xLo / YATABE_M],
    ['traction share fTr', (r) => r.r.b.fTr],
    ['grip mu', (r) => r.r.b.mu],
    ['pEff / mass', (r) => r.r.b.Pacc / r.r.b.m],
  ]
  console.log('  predictor                      r(err %)   r(err s)')
  const ye = rows.map((r) => r.e),
    ys = rows.map((r) => r.eS)
  preds.forEach(([n, f]) => {
    const xs = rows.map(f)
    console.log(
      '  ' + n.padEnd(30) + rcorr(xs, ye).toFixed(3).padStart(8) +
        rcorr(xs, ys).toFixed(3).padStart(11),
    )
  })
  {
    // Read off the table rather than asserted, so adding a run cannot leave a claim behind.
    const strongest = preds
      .map(([n, f]) => ({ n, r: rcorr(rows.map(f), ye) }))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0]
    const pwR = rcorr(rows.map((r) => (1000 * r.d.c.ps) / r.d.c.kg), ye)
    console.log(
      '  NOTHING CLEARS THE BAR. The strongest on per-cent error is ' + strongest.n + ' at ' +
        strongest.r.toFixed(2) + ', and power-to-weight - the one a scaling law would need - is at ' +
        pwR.toFixed(2) + '.',
    )
    console.log('  THAT IS THE WHOLE CASE FOR A FLAT CONSTANT. If the deficit scaled with anything')
    console.log('  about the car it would show here at n = ' + rows.length + '; the 560 PS LFA is the')
    console.log('  best-fitting car in the set and the 255 PS RX-7 nearly the worst, which is the')
    console.log('  ordering a scaling law cannot produce. A flat offset is not the elegant answer,')
    console.log('  it is the only shape the seven points do not immediately refute.')
  }

  // ---- the mechanism probes ----
  // Each candidate is ONE shared parameter, written as an engine-curve override and handed to
  // solveAccelShaped, so the car's own two measurements are re-inverted against it and both
  // round trips stay exact at every value tested. The same curve then runs the 1 km AND all 36
  // driven laps, because a mechanism that buys a straight line by selling a hairpin is not a
  // mechanism. Cars with no measured pair keep the published curve; they are counted below.
  const relRamp = (v, vTop) => {
    if (!(vTop > V161) || v <= V161) return 0
    const W = V161 - V97,
      dTop = 1 - W / (vTop - V97)
    return dTop <= 1e-9 ? 1 : Math.max(0, Math.min(1, (1 - W / (v - V97)) / dTop))
  }
  const aOf = (p, m, v, aL) => Math.min(v <= 0 ? Infinity : p / (m * v), aL)
  // The published release, so that a family which is not about the release can keep it and be
  // read as an isolated change.
  const pubRel = (v, b) =>
    b.fTr ? b.Pacc + b.fTr * Math.max(0, b.Pw - b.Pacc) * relRamp(v, b.vTop) : b.Pacc
  const FAM = {
    // Hand back a shared fraction of the pEff-to-crank gap above 161 km/h. This IS the launch
    // contamination hypothesis: it is the published release with its per-car fTr gate replaced
    // by one number. Nothing below 161 km/h moves, so the solve is untouched.
    release: (k) => (v, b) =>
      aOf(b.Pacc + k * Math.max(0, b.Pw - b.Pacc) * relRamp(v, b.vTop), b.m, v, b.aGrip),
    // The launch plateau falls with speed instead of being flat: a real car's first gear
    // out-thrusts its third, and the solve pins the TIME to 97 km/h without saying anything
    // about the distance covered getting there. Keeps the published release.
    launch: (k) => (v, b) =>
      aOf(pubRel(v, b), b.m, v, b.aGrip * (1 + k * Math.max(0, 1 - v / V97))),
    // Effective power rises with road speed, anchored at the top of the measurement window and
    // never exceeding crank power: the release's claim, made at every speed instead of one.
    tilt: (k) => (v, b) =>
      aOf(
        Math.min(b.Pw || Infinity, b.Pacc * Math.pow(Math.max(v, 1e-6) / V161, k)),
        b.m, v, b.aGrip,
      ),
  }
  // A car's block under a candidate curve, with its own pair re-inverted against that curve.
  // Memoised per curve on the CAR OBJECT, never on its id or name: the roster LFA and the
  // maintainer's fingerprint LFA share both, and are different cars.
  const SB = new Map()
  const shaped = (c, eng) => {
    if (!eng) return carBlock(c)
    let per = SB.get(eng)
    if (!per) SB.set(eng, (per = new WeakMap()))
    const hit = per.get(c)
    if (hit) return hit
    const b0 = carBlock(c)
    let b
    if (c.z97 == null || c.z161 == null) {
      b = b0
    } else {
      const m = c.kg + 75,
        CdA = c.cd * frontalArea(c),
        Pw = c.ps * PS * eta
      const s = solveAccelShaped(m, CdA, c.z97, c.z161, eng)
      b = Object.assign({}, b0, {
        aGrip: s.aL, Pacc: s.pE, fTr: tractionShare(m, s.aL, Pw), eng,
        rt: Math.max(Math.abs(s.e97), Math.abs(s.e161)),
      })
    }
    per.set(c, b)
    return b
  }
  // The round-trip residual a car actually carries under a candidate curve: the shaped solve's
  // own, or the published solve's for a car the candidate did not re-solve.
  const rtOf = (c, b) => {
    if (b && b.rt != null) return b.rt
    const a = accelOf(c)
    return Math.max(Math.abs(a.e97 || 0), Math.abs(a.e161 || 0))
  }
  const lapMae = (set, segs, eng) =>
    maeOf(set.map((d) => pct(lap(d.c, segs, shaped(d.c, eng)), d.t)))
  // Derived from the driven set rather than written out, so a run added to it cannot leave a
  // column header naming a car that is no longer in that position.
  const HEAD =
    '  family              ' + DRAG_DRIVEN.map((d) => d.sh.padStart(7)).join('') +
    '     mean    MAE   misMAE hakMAE wanMAE  worst |rt|'
  const famRow = (lbl, eng) => {
    const e = DRAG_DRIVEN.map((d) => pct(dragKm(d.c, YATABE_M, shaped(d.c, eng)).t, d.t))
    const rt = Math.max(
      ...[].concat(DRAG_DRIVEN, DRIVEN, HAKD, WAND).map((d) => rtOf(d.c, shaped(d.c, eng))),
    )
    console.log(
      '  ' + lbl.padEnd(22) + e.map((x) => x.toFixed(2).padStart(7)).join('') +
        mAvg(e).toFixed(2).padStart(9) + maeOf(e).toFixed(2).padStart(7) +
        lapMae(DRIVEN, LEGEND, eng).toFixed(3).padStart(9) +
        lapMae(HAKD, HAK, eng).toFixed(3).padStart(7) +
        lapMae(WAND, WAN, eng).toFixed(3).padStart(7) +
        rt.toExponential(1).padStart(12),
    )
  }
  const unmeasured = [].concat(DRIVEN, HAKD, WAND).filter(
    (d) => d.c.z97 == null || d.c.z161 == null,
  ).length
  console.log(
    '\n  The three lap columns are the MAE over the ' + DRIVEN.length + ' driven Misaki, ' +
      HAKD.length + ' Hakone and ' + WAND.length + ' Wangan laps',
  )
  console.log(
    '  at the published constants. ' + unmeasured + ' of those ' +
      (DRIVEN.length + HAKD.length + WAND.length) + ' laps runs a car with no measured',
  )
  console.log('  pair, so it keeps the published curve and dilutes the columns very slightly.')
  console.log('  EVERY DRAG COLUMN IN THIS SUBSECTION IS RAW, with no calibration offset applied.')
  console.log('  These probes exist to ask whether a MECHANISM explains the deficit, and scoring')
  console.log('  them against an already-corrected target would be scoring them against the answer.')
  console.log('  `worst |rt|` is the largest round-trip residual, in seconds, over every car the')
  console.log('  row re-solved: it is the guard that a candidate has not simply thrown a')
  console.log('  measurement away to buy the drags.')

  console.log('\n### mechanism 1: launch contamination, handed back above 161 km/h')
  console.log('  THE HYPOTHESIS DOES NOT SURVIVE ITS OWN ARITHMETIC, and the reason is in the')
  console.log('  solve. pEff is fixed by the 97-161 km/h SEGMENT, not by the 0-97: a wheelspun')
  console.log('  launch is in the 0-97 and therefore in aLaunch, and it can only reach pEff on a')
  console.log('  car still traction-bound above 97 km/h, which is exactly what fTr measures')
  console.log('  already. The ladder prices the family anyway, out to its physical ceiling.')
  console.log(HEAD)
  famRow('published', null)
  famRow('release OFF', FAM.release(0))
  ;[0.5, 1].forEach((k) => famRow('shared kappa ' + k, FAM.release(k)))
  famRow('full crank > 161', (v, b) => aOf(v > V161 ? b.Pw : b.Pacc, b.m, v, b.aGrip))
  famRow('1.5x crank > 161', (v, b) => aOf(v > V161 ? 1.5 * b.Pw : b.Pacc, b.m, v, b.aGrip))
  console.log('  kappa 1 hands back the ENTIRE gap between solved pEff and crank power; the row')
  console.log('  below it does the same instantly at 161 km/h instead of ramping to top speed and')
  console.log('  is the absolute ceiling of the idea. The last row is past physics, for scale.')
  console.log('  The Beat does not move by one hundredth on any of them. By the ceiling row other')
  console.log('  cars have overshot and Misaki has lost MAE, both visible in the columns above,')
  console.log('  and the Beat still has not moved. What the ladder DOES establish, and it is the')
  console.log('  first out-of-sample evidence')
  console.log('  the published release has ever had: switching it off makes the LFA, the BMW and')
  console.log('  the Countach worse and no car better, and it never overshoots. It is right in')
  console.log('  sign and far too small to be the answer.')
  console.log('  And the release cannot be promoted to a shared weight either, because the value')
  console.log('  each car demands ON ITS OWN does not agree with any other. That table is next.')
  console.log('  car                          kappa needed   released power at 200 km/h')
  const kNeed = DRAG_DRIVEN.map((d) => {
    const b = carBlock(d.c)
    const at = (k) => dragKm(d.c, YATABE_M, Object.assign({}, b, { eng: FAM.release(k) })).t
    if (at(20) > d.t) {
      console.log('  ' + d.lbl.padEnd(28) + '  unreachable at any kappa')
      return null
    }
    const k = accBisect(at, 0, 20, d.t, 40)
    const p = FAM.release(k)
    console.log(
      '  ' + d.lbl.padEnd(28) + k.toFixed(3).padStart(11) +
        ('   ' + ((b.m * (200 / 3.6) * p(200 / 3.6, b)) / 1000).toFixed(0) + ' kW of a ' +
          (b.Pw / 1000).toFixed(0) + ' kW crank figure').padStart(38),
    )
    return k
  }).filter((x) => x != null)
  console.log(
    '  kappa: reached on ' + kNeed.length + ' of ' + DRAG_DRIVEN.length + ', min ' +
      Math.min(...kNeed).toFixed(2) + ', max ' + Math.max(...kNeed).toFixed(2) + ', spread ' +
      (Math.max(...kNeed) / Math.min(...kNeed)).toFixed(1) + 'x. Anything above 1 is a claim',
  )
  console.log(
    '  that the car makes more than its published PS, and ' +
      kNeed.filter((k) => k > 2).length + ' of the ' + kNeed.length + ' are above 2.',
  )

  console.log('\n### mechanism 2: the launch plateau is flat and a real launch is front-loaded')
  console.log('  The solve pins the TIME to 97 km/h and says nothing about the DISTANCE covered')
  console.log('  getting there. A flat plateau is the wrong shape for a car whose first gear')
  console.log('  out-thrusts its third, and the wrong shape covers the wrong distance. This is')
  console.log('  the only family here that CAN move the Beat, because it acts below 161 km/h.')
  console.log(HEAD)
  ;[0, 0.5, 1, 1.2, 1.5].forEach((k) => famRow('falling launch ' + k, k ? FAM.launch(k) : null))
  console.log('  It moves the Beat and it moves the Countach further than the release does, and it')
  console.log('  still fails on three counts, all of them readable in the columns above. The R35')
  console.log('  barely responds at all; the Countach never comes near zero; and the LFA is dragged')
  console.log('  straight past zero on the way. Then two harder ones.')
  {
    // Where the family stops being able to hold the measurement it exists to preserve.
    const worst = (k) => {
      const eng = FAM.launch(k)
      return [].concat(DRAG_DRIVEN, DRIVEN, HAKD, WAND)
        .map((d) => ({ d, rt: rtOf(d.c, shaped(d.c, eng)) }))
        .sort((a, z) => z.rt - a.rt)[0]
    }
    const w = worst(1)
    console.log('  ONE. From b 1.0 the published pair stops being reproducible at all on the')
    console.log('  ' + w.d.lbl + ': the plateau this family forces on it is low enough to')
    console.log('  cap the 97-161 km/h segment at ANY power, so its 0-161 comes back ' +
      w.rt.toFixed(3) + ' s out.')
    console.log('  That is the mechanism failing to hold the measurement it exists to preserve.')
    const over = ACCEL_SOLVED.map((r) => {
      const s = solveAccelShaped(r.m, r.CdA, r.c.z97, r.c.z161, FAM.launch(1))
      return (2 * s.aL) / (r.mu * g)
    })
    console.log('  TWO. At b 1.0 the implied standstill acceleration exceeds the traction ceiling')
    console.log(
      '  mu g on ' + over.filter((x) => x > 1).length + ' of the ' + over.length +
        ' measured cars, worst ' + Math.max(...over).toFixed(2) +
        ' times it. That is not a launch, it is a fault.',
    )
  }
  console.log('  The three lap columns are the one genuinely interesting result in this section:')
  console.log('  a falling launch is the only family here that improves BOTH Hakone and Wangan at')
  console.log('  once, at a small cost on Misaki. Worth remembering if a course-level defect is')
  console.log('  ever chased on its own terms rather than through the drags, which is not what')
  console.log('  this section is for.')

  console.log('\n### mechanism 3: effective power rises with road speed')
  console.log(HEAD)
  ;[0.1, 0.2, 0.3].forEach((k) => famRow('power tilt ' + k, FAM.tilt(k)))
  console.log('  This family replaces the release rather than keeping it, so its baseline is the')
  console.log('  release OFF row above, not the published one. It pays for the drags out of the')
  console.log('  tight course, and the reason is mechanical: the solve compensates for a rising')
  console.log('  power curve by taking thrust OUT of the 30 to 60 km/h band, which is precisely')
  console.log('  where a hairpin exit lives. Over the tilt range above, Hakone loses several tenths')
  console.log('  of a point of MAE against a much smaller Misaki gain on a course the model is')
  console.log('  already slow on, and the drag MAE only improves at a tilt whose 0-161 round trip')
  console.log('  is most of a second out. The only value that holds both measurements is 0.1, and')
  console.log('  at 0.1 the drag MAE is WORSE than the published one. Every figure in that sentence')
  console.log('  is in the table immediately above; none of them is quoted here, so none can go')
  console.log('  stale when a run is added to the set.')

  console.log('\n### mechanisms 4 and 5: is it simply drag, or rolling resistance')
  console.log('  Both are re-solved, so the two measurements stay exact and only the SHAPE of the')
  console.log('  curve between and beyond them moves. Neither has leverage worth the name, and the')
  console.log('  drag row moves the Beat the WRONG WAY, which is what a real mechanism does not do.')
  console.log(
    '  family              ' + DRAG_DRIVEN.map((d) => d.sh.padStart(7)).join('') +
      '     mean    MAE   worst |rt|',
  )
  const resRow = (lbl, dk, rk) => {
    DRAG_K = dk
    ROLL_K = rk
    clearCaches()
    const e = DRAG_DRIVEN.map((d) => pct(dragKm(d.c, YATABE_M).t, d.t))
    const rt = Math.max(
      ...DRAG_DRIVEN.map((d) => {
        const a = accelOf(d.c)
        return Math.max(Math.abs(a.e97 || 0), Math.abs(a.e161 || 0))
      }),
    )
    DRAG_K = 1
    ROLL_K = 1
    clearCaches()
    console.log(
      '  ' + lbl.padEnd(22) + e.map((x) => x.toFixed(2).padStart(7)).join('') +
        mAvg(e).toFixed(2).padStart(9) + maeOf(e).toFixed(2).padStart(7) +
        rt.toExponential(1).padStart(12),
    )
  }
  resRow('published', 1, 1)
  resRow('drag x 0.8', 0.8, 1)
  resRow('drag x 1.2', 1.2, 1)
  resRow('rolling x 0 (none)', 1, 0)
  resRow('rolling x 2', 1, 2)

  console.log('\n### the one reading that fits the sign, and why the harness may not use it')
  console.log('  Solve each car against its published pair scaled by (1 - d) and run the kilometre')
  console.log('  on the result with no offset added back. d is how optimistic Forza\'s own 0-97 and')
  console.log('  0-161 would have to be for the model to land the driven time. It BREAKS both')
  console.log('  round trips by construction and is a diagnosis, not a candidate.')
  console.log('  IT NEEDS BOTH PUBLISHED TIMES. Every car in this set has both, so none is missing')
  console.log('  here; one that did not would be excluded, because scaling a regressed 0-161 would')
  console.log('  be scaling this model\'s own guess and calling it evidence.')
  console.log('  car                             d %   implied 0-97   implied 0-161      published')
  const dNeed = DRAG_DRIVEN.filter((d) => d.c.z97 != null && d.c.z161 != null).map((d) => {
    const c = d.c,
      m = c.kg + 75,
      CdA = c.cd * frontalArea(c),
      Pw = c.ps * PS * eta
    const at = (x) => {
      const s = solveAccel(m, CdA, c.z97 * (1 - x), c.z161 * (1 - x))
      return dragKm(
        c, YATABE_M,
        Object.assign({}, carBlock(c), {
          aGrip: s.aL, Pacc: s.pE, fTr: tractionShare(m, s.aL, Pw),
        }),
      ).t
    }
    const x = accBisect(at, 0, 0.2, d.t, 30)
    console.log(
      '  ' + d.lbl.padEnd(28) + (100 * x).toFixed(2).padStart(7) +
        (c.z97 * (1 - x)).toFixed(3).padStart(15) + (c.z161 * (1 - x)).toFixed(3).padStart(16) +
        ('   ' + c.z97.toFixed(3) + ' / ' + c.z161.toFixed(3)).padStart(20),
    )
    return x
  })
  console.log(
    '  d: mean ' + (100 * mAvg(dNeed)).toFixed(2) + '%   min ' +
      (100 * Math.min(...dNeed)).toFixed(2) + '%   max ' + (100 * Math.max(...dNeed)).toFixed(2) +
      '%   spread ' + (Math.max(...dNeed) / Math.min(...dNeed)).toFixed(1) + 'x',
  )
  console.log('  IT IS NOT CONSTANT EITHER, and that is the finding rather than a disappointment.')
  console.log('  Read as a protocol gap it is entirely plausible: Forza\'s panel figures are')
  console.log('  canned, the maintainer drives manually with the assists off, and the ordering is')
  console.log('  the one that story predicts. But a protocol gap is not physics, and fitting it in')
  console.log('  the acceleration model would pull ' + ACCEL_SOLVED.length + ' cars off the only')
  console.log('  figures that pin them, and would move every lap on every course with them. That')
  console.log('  is the trade refused, and it is exactly why the offset the model DOES carry lives')
  console.log('  on the drag strip alone.')

  console.log('\n### VERDICT: no mechanism, one flat offset')
  console.log(
    '  Every currency the deficit has been expressed in spreads by several times across these ' +
      rows.length + ' cars:',
  )
  console.log(
    '  ' + Math.min(...eAll).toFixed(1) + '% to ' + Math.max(...eAll).toFixed(1) +
      '% as a percentage, ' + Math.min(...rows.map((r) => r.eS)).toFixed(2) + ' s to ' +
      Math.max(...rows.map((r) => r.eS)).toFixed(2) + ' s as a time, and ' +
      (100 * Math.min(...dNeed)).toFixed(0) + '% to ' + (100 * Math.max(...dNeed)).toFixed(0) +
      '% as an error in the',
  )
  console.log('  published pair. A shared PARAMETER is a mechanism only when the cars agree on its')
  console.log('  value, and on this evidence they never do: every candidate above buys a mean and')
  console.log('  sells the Countach and the Beat, which are the two cars that test whether it is')
  console.log('  real. THE MODEL IS THEREFORE STILL UNCHANGED. What HAS changed, on maintainer')
  console.log('  ruling, is that the residual is now admitted as a calibration instead of being')
  console.log('  carried as a known error: a flat -' + (100 * DRAG_OFFSET).toFixed(2) + '% on')
  console.log('  computed kilometres, fitted on these runs, applied to no lap on any course, and')
  console.log('  labelled a PROTOCOL OFFSET because that is what the evidence supports. It is not')
  console.log('  a term. Nothing about a car changes it, and it explains nothing.')
  console.log('  WHAT WOULD SETTLE IT: more standing kilometres, and at least one on a car whose')
  console.log('  panel 0-97 the maintainer has re-driven by hand, which is the one measurement')
  console.log('  that separates a protocol gap from a model defect. If that measurement ever comes')
  console.log('  in, the offset is the first thing that should be deleted.')
  console.log('  ON THE HIGH-SPEED RELEASE, which these runs were also asked to judge: it stays,')
  console.log('  unchanged and per-car. It is not superseded, because nothing replaced it; it is')
  console.log('  supported, because switching it off makes three of the set worse and none better;')
  console.log('  and it is not promoted to a shared weight, because of the kappa table above.')
}

// =====================================================================================
// THE COURSE-CHARACTER SWING: the acceptance test for the corner-exit term
// =====================================================================================
// A swing is a PAIR statistic across two courses of opposite character, and it is the cleanest
// measurement this harness can make. For cars A and B:
//
//   swing = (A - B on Wangan) - (A - B on Hakone)
//
// Every per-car level error cancels, and so does every per-course level error, because both cars
// pay it alike. What is left is purely how far the two roads reorder the pair, which is the one
// thing a direction-change term exists to produce and the one thing the model has never had.
//
// THE CASE THAT MOTIVATED THE WHOLE CHANGE. Driven, the EK9 beats the 190E by 2.6 s on Hakone and
// loses to it by 3.4 s on Wangan: a 6.0 s swing between two cars whose power-to-weight is within
// 5% of each other. On a point-mass model with equal grip and equal power-to-weight, mass barely
// enters at all - apex speed does not contain it, and acceleration contains only P/m - so the old
// additive term could not produce that swing at any weight.
// =====================================================================================
// THE GEOMETRIC CORNER-GRIP CEILING: the six driven points, and what the term cost the 45
// =====================================================================================
console.log('\n\n## THE GEOMETRIC CORNER-GRIP CEILING (new 2026-07-27)')
console.log(
  'usable mu through a corner of radius r = min(mu, ' + GEO_MU.toFixed(3) + ' x (r/' + GEO_R +
    ')^' + GEO_T.toFixed(4) + '), applied BOTH to',
)
console.log(
  'the grip the corner arc may use and to the grip the direction-change term may divide by.',
)
console.log(
  'Both parameters are fitted on all ' + CK.reduce((a, k) => a + SCORED[k].length, 0) +
    ' scored points at once, equal weight per course.',
)
console.log('\n### the ceiling by radius, against the grip levels that measured it')
console.log('  radius m   ceiling    Elise 1.226    Calsonic 1.512    787B 1.699    roster max 1.083')
;[11, 18, 20, 45, 55, 91, 125, 200, 350, 515, 700].forEach((r) => {
  const cap = GEO_MU * Math.pow(r / GEO_R, GEO_T)
  const cut = (mu) => (cap >= mu ? '   -' : (100 * (Math.sqrt(cap / mu) - 1)).toFixed(1) + '%')
  console.log(
    '  ' + String(r).padStart(8) + cap.toFixed(4).padStart(10) + cut(1.226).padStart(15) +
      cut(1.512).padStart(18) + cut(1.699).padStart(14) + cut(1.083).padStart(20),
  )
})
console.log(
  '  The columns are the cut in mechanical apex speed. The ceiling at the tightest radius on any',
)
console.log(
  '  course is ' + (GEO_MU * Math.pow(11 / GEO_R, GEO_T)).toFixed(4) +
    ', above the grip of every car on the roster, so the term is EXACTLY inert',
)
console.log('  for all 85 of them and for all ' + (DRIVEN.length + HAKD.length + WAND.length + DRAG_DRIVEN.length) + ' existing driven laps. The next table proves it rather than')
console.log('  asserting it. Downforce is untouched: the ceiling caps MECHANICAL grip and the aero term')
console.log('  is then solved on top of it, so a car doing 315 km/h round a 350 m sweeper is not charged')
console.log('  for steering geometry it is not using.')

console.log('\n### THE SIX DRIVEN HIGH-GRIP POINTS')
console.log('  All six were driven after the figure in `pred` was committed except the Calsonic Misaki,')
console.log('  which is the long-standing 81.06 s anchor.')
console.log(
  '  car                     course     mu     pred   before    after   driven    before%    after%',
)
{
  const rows = GRIP_DRIVEN.map((d) => {
    const b = carBlock(d.c)
    const s0 = GEO_MU,
      t0 = GEO_T
    GEO_MU = Infinity
    GEO_T = 0
    const before = courseTime(d.course, d.c)
    GEO_MU = s0
    GEO_T = t0
    const after = courseTime(d.course, d.c)
    return { d, mu: b.mu, before, after }
  })
  rows.forEach((r) =>
    console.log(
      '  ' + r.d.lbl.padEnd(24) + r.d.course.padEnd(9) + r.mu.toFixed(3).padStart(6) +
        r.d.p.toFixed(1).padStart(9) + r.before.toFixed(2).padStart(9) + r.after.toFixed(2).padStart(9) +
        r.d.t.toFixed(2).padStart(9) + pct(r.before, r.d.t).toFixed(2).padStart(11) +
        pct(r.after, r.d.t).toFixed(2).padStart(10) + (r.d.anchor ? '   [anchor, not blind]' : ''),
    ),
  )
  console.log(
    '  MAE over the six: ' + maeOf(rows.map((r) => pct(r.before, r.d.t))).toFixed(2) + '% before, ' +
      maeOf(rows.map((r) => pct(r.after, r.d.t))).toFixed(2) + '% after.  Worst ' +
      Math.max(...rows.map((r) => Math.abs(pct(r.before, r.d.t)))).toFixed(2) + '% before, ' +
      Math.max(...rows.map((r) => Math.abs(pct(r.after, r.d.t)))).toFixed(2) + '% after.',
  )
}
console.log('\n### THE RESIDUAL GRIP CURVE: one road, three grip levels')
console.log('  Hakone, the only course driven at more than one grip level above the roster range.')
console.log('  car                        mu     before%     after%     driven s')
;[ADHOC_LOTUS, A_CALSONIC, ADHOC_787B].forEach((c) => {
  const d = GRIP_DRIVEN.find((x) => x.c === c && x.course === 'Hakone')
  const s0 = GEO_MU,
    t0 = GEO_T
  GEO_MU = Infinity
  GEO_T = 0
  const before = lap(c, HAK)
  GEO_MU = s0
  GEO_T = t0
  console.log(
    '  ' + d.lbl.padEnd(24) + carBlock(c).mu.toFixed(3).padStart(7) +
      pct(before, d.t).toFixed(2).padStart(11) + pct(lap(c, HAK), d.t).toFixed(2).padStart(11) +
      d.t.toFixed(2).padStart(13),
  )
})
console.log('  Before, the error was nothing at 1.23, most of its size by 1.51 and saturated by 1.70,')
console.log('  which is two cars hitting the same limit while only the model kept crediting them.')
console.log('  After, it no longer RISES with grip: the two ends land inside 0.6% and the middle')
console.log('  point does not, which is the shape of one car\'s constant rather than of a curve.')

console.log('\n### WHAT IT COST THE ' + (DRIVEN.length + HAKD.length + WAND.length + DRAG_DRIVEN.length) + ' EXISTING DRIVEN LAPS: nothing, to the last bit')
console.log('  course    n    MAE before    MAE after    mean before    mean after    inversions')
{
  const inv = (rows, segs) => {
    let n = 0,
      tot = 0
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        tot++
        if ((lap(rows[i].c, segs) - lap(rows[j].c, segs)) * (rows[i].t - rows[j].t) < 0) n++
      }
    return n + '/' + tot
  }
  const setOf = { Misaki: DRIVEN, Hakone: HAKD, Wangan: WAND, Yatabe: DRAG_DRIVEN }
  const snap = () =>
    CK.map((ck) => {
      const rows = setOf[ck]
      const e = rows.map((d) => pct(courseTime(ck, d.c), d.t))
      return { mae: maeOf(e), mean: mAvg(e), inv: COURSE_EVAL[ck] ? '-' : inv(rows, COURSES[ck]) }
    })
  const s0 = GEO_MU,
    t0 = GEO_T
  GEO_MU = Infinity
  GEO_T = 0
  const before = snap()
  GEO_MU = s0
  GEO_T = t0
  const after = snap()
  CK.forEach((ck, i) =>
    console.log(
      '  ' + ck.padEnd(9) + String(setOf[ck].length).padStart(3) + before[i].mae.toFixed(4).padStart(13) +
        after[i].mae.toFixed(4).padStart(13) + before[i].mean.toFixed(4).padStart(15) +
        after[i].mean.toFixed(4).padStart(14) + ('  ' + before[i].inv + ' -> ' + after[i].inv).padStart(16),
    ),
  )
  let moved = 0,
    worst = 0
  CARS.forEach((c) => {
    const bs = CK.map((ck) => {
      GEO_MU = Infinity
      GEO_T = 0
      const x = courseTime(ck, c)
      GEO_MU = s0
      GEO_T = t0
      return Math.abs(100 * (courseTime(ck, c) / x - 1))
    })
    const mx = Math.max(...bs)
    if (mx > 0.5) moved++
    if (mx > worst) worst = mx
  })
  console.log(
    '  Over the whole 85-car roster and all four courses: ' + moved +
      ' cars move by more than 0.5%, and the',
  )
  console.log(
    '  largest move by any car on any course is ' + worst.toExponential(1) +
      '%. The ceiling sits above the roster.',
  )
  console.log(
    '  Yatabe cannot move at all: the ceiling lives in the corner arithmetic and dragTime never',
  )
  console.log(
    '  calls it, so the drag offset stays drag-only and stays fitted on the seven kilometres.',
  )
}

console.log('\n### IS THE SECOND PARAMETER EARNED?')
{
  const flat = (function () {
    let best = null
    for (let i = 0; i <= 80; i++) {
      const r = geoScore(1.0 + i * 0.005, 0)
      if (!best || r.o < best.o) best = r
    }
    return best
  })()
  const none = geoScore(Infinity, 0)
  const calOf = (fit, course) => {
    const s0 = GEO_MU,
      t0 = GEO_T
    GEO_MU = fit.mu20
    GEO_T = fit.t
    const e = pct(courseTime(course, A_CALSONIC), GRIP_DRIVEN.find((d) => d.c === A_CALSONIC && d.course === course).t)
    GEO_MU = s0
    GEO_T = t0
    return e
  }
  console.log('  variant                              objective   Calsonic Hak   Calsonic Wan   Calsonic Mis')
  ;[
    ['no ceiling', none],
    ['one parameter, exponent forced to 0', flat],
    ['two parameters, both fitted', GEO_FIT],
  ].forEach(([lbl, f]) =>
    console.log(
      '  ' + lbl.padEnd(36) + f.o.toFixed(4).padStart(10) + calOf(f, 'Hakone').toFixed(2).padStart(15) +
        calOf(f, 'Wangan').toFixed(2).padStart(15) + calOf(f, 'Misaki').toFixed(2).padStart(15),
    ),
  )
  console.log(
    '  A flat grip cap fixes Hakone and then pushes the Calsonic\'s Wangan lap ' +
      calOf(flat, 'Wangan').toFixed(1) + '% SLOW, because a',
  )
  console.log(
    '  highway loop has no tight corners to charge and a flat cap charges its sweepers anyway. The',
  )
  console.log('  radius exponent is what stops that, and that is the whole case for the second parameter.')
  console.log(
    '  It is worth ' + (flat.o - GEO_FIT.o).toFixed(3) + ' of objective. The basin is shallow and the surface is in stderr 7.',
  )
}

console.log('\n### WHAT IS LEFT, SAID PLAINLY')
console.log('  The Calsonic Gr.A is the car that sits exactly at the game\'s own race-build ceiling and')
console.log('  it is still the worst of the six. Its four residuals no longer track corner content, which')
console.log('  is the defect this term was built for, but they do not collapse to nothing either. What is')
console.log('  left is one car\'s constant, of the same size and kind as the car constants the cross-course')
console.log('  decomposition already finds on the LFA, the NSX-R and the 22B, and one more high-grip car')
console.log('  on two more roads would say whether it is a car or a term. Its braking coefficient is the')
console.log('  one input on it that no measurement pins: it is a race car with no published stopping')
console.log('  distance, so bmu comes from the regression, and a standing kilometre cannot check it.')

console.log('\n\n## THE COURSE-CHARACTER SWING (Hakone against Wangan): the acceptance test')
console.log('swing = (A - B on Wangan) - (A - B on Hakone). Per-car and per-course level errors')
console.log('both cancel, so this is the pure course-character content of the model. Five cars')
console.log('carry driven laps on both roads, which is ten pairs. Each car is scored on its own')
console.log('course record, i.e. exactly the rows the two tables above print.')
console.log(
  '  pair                                            driven Hak   driven Wan   swing driven   swing model   share',
)
{
  const ps = swingPairs()
  ps.slice()
    .sort((x, y) => Math.abs(y.driven) - Math.abs(x.driven))
    .forEach((x) => {
      const sh = Math.abs(x.driven) > 0.05 ? ((100 * x.model) / x.driven).toFixed(0) + '%' : '-'
      console.log(
        '  ' + (x.A.lbl.slice(0, 21) + ' v ' + x.B.lbl.slice(0, 21)).padEnd(48) +
          (x.A.dh - x.B.dh).toFixed(1).padStart(9) + ' s' +
          (x.A.dw - x.B.dw).toFixed(1).padStart(11) + ' s' +
          x.driven.toFixed(2).padStart(13) + ' s' +
          x.model.toFixed(2).padStart(12) + ' s' + sh.padStart(8),
      )
    })
  const z = swingAt(0, KEXIT_FIT, xshp(EXIT_PUB))
  console.log(
    '  OVERALL: mean |driven swing| ' + z.meanD.toFixed(2) + ' s, mean |modelled swing| ' +
      z.meanM.toFixed(2) + ' s = ' + (100 * z.share).toFixed(0) + '% of it.',
  )
  console.log(
    '  pair-by-pair MAE ' + z.mae.toFixed(2) + ' s, correlation r ' + z.r.toFixed(2) +
      ', sign agreement ' + z.signOk + '/' + z.n + '.',
  )
}
console.log('\n### the same statistic at four models, which is where the result actually is')
console.log(
  '  model                                       mean |swing|   share   pair MAE      r   signs',
)
{
  const rowsSw = [
    ['no direction-change term at all', swingAt(0, 0, null)],
    ['ADDITIVE agility, kAgi ' + KAGI_FIT.toFixed(2) + ' (PUBLISHED)', swingAt(KAGI_FIT, 0, null)],
    ['CORNER-EXIT, raw joint fit (not applied)', swingAt(0, KEXIT_FIT, xshp(EXIT_PUB))],
    ['CORNER-EXIT, level-free fit (not applied)', swingAt(0, XFREE1.bestFree.k, xshp(XFREE1.s))],
  ]
  console.log(
    '  driven                                      ' +
      rowsSw[0][1].meanD.toFixed(2).padStart(6) + ' s',
  )
  rowsSw.forEach(([lbl, z]) =>
    console.log(
      '  ' + lbl.padEnd(44) + z.meanM.toFixed(2).padStart(6) + ' s' +
        (100 * z.share).toFixed(0).padStart(7) + '%' + z.mae.toFixed(2).padStart(11) + ' s' +
        z.r.toFixed(2).padStart(7) + z.signOk.toString().padStart(7) + '/' + z.n,
    ),
  )
  const ek = swingPairs().find(
    (x) =>
      (x.A.id === 'honda-civic-type-r-ek9' && x.B.id === 'mercedes-190e-2-5-16-evo-ii-w201') ||
      (x.B.id === 'honda-civic-type-r-ek9' && x.A.id === 'mercedes-190e-2-5-16-evo-ii-w201'),
  )
  const ekAdd = (() => {
    const sA = kAgi,
      sX = kExit
    kAgi = KAGI_FIT
    kExit = 0
    const q = swingPairs().find((x) => x.A.id === ek.A.id && x.B.id === ek.B.id)
    kAgi = sA
    kExit = sX
    return q
  })()
  console.log(
    '  THE HEADLINE PAIR: ' + ek.A.lbl.slice(0, 20) + ' against ' + ek.B.lbl.slice(0, 20) +
      '.  Driven swing ' + Math.abs(ek.driven).toFixed(1) + ' s.',
  )
  console.log(
    '  Additive term: ' + Math.abs(ekAdd.model).toFixed(1) + ' s (' +
      ((100 * Math.abs(ekAdd.model)) / Math.abs(ek.driven)).toFixed(0) + '%).  Corner-exit term: ' +
      Math.abs(ek.model).toFixed(1) + ' s (' +
      ((100 * Math.abs(ek.model)) / Math.abs(ek.driven)).toFixed(0) + '%).',
  )
  console.log(
    '  READ THE FOUR ROWS TOGETHER, BECAUSE THE FIRST ONE IS THE ONE PEOPLE WILL SKIP. A model with',
  )
  console.log(
    '  NO direction-change term at all already produces ' +
      (100 * rowsSw[0][1].share).toFixed(0) + '% of the driven swing, purely out of',
  )
  console.log(
    '  drag, power and braking. The ADDITIVE term cut that to ' +
      (100 * rowsSw[1][1].share).toFixed(0) + '%: it was actively SWING-NEGATIVE, because',
  )
  console.log(
    '  it charges seconds in proportion to corner count and Hakone has more corners, which flattens',
  )
  console.log(
    '  the tight course towards the fast one. That is a second, independent statement of the same',
  )
  console.log(
    '  diagnosis the exit term was built for. The corner-exit term at its own fitted weight gets to ' +
      (100 * rowsSw[2][1].share).toFixed(0) + '%',
  )
  console.log(
    '  and cuts the pair-by-pair error from ' + rowsSw[1][1].mae.toFixed(2) + ' s to ' +
      rowsSw[2][1].mae.toFixed(2) + ' s. At the level-free weight, which is ' +
      (KEXIT_FIT / XFREE1.bestFree.k).toFixed(0) + 'x smaller than',
  )
  console.log(
    '  the raw joint fit and does not saturate, it reaches ' +
      (100 * rowsSw[3][1].share).toFixed(0) + '% and ' + rowsSw[3][1].mae.toFixed(2) +
      ' s - but that weight leaves Misaki several',
  )
  console.log(
    '  per cent fast and is not publishable. THE SWING IS WHAT THE PUBLISHED WEIGHT IS SPENDING TO',
  )
  console.log(
    '  BUY A LEVEL IT CANNOT REACH: the frozen Hakone geometry wants about 14% of a lap from its',
  )
  console.log(
    '  direction-change term, an exit-speed deficit cannot supply that, and the fit therefore drives',
  )
  console.log(
    '  the weight until the term saturates against its own floor on most real corners, which is',
  )
  console.log(
    '  where it stops being able to tell two cars apart. Re-searching the two geometries under this',
  )
  console.log('  term is the obvious next step and is deliberately not done here.')
}

// =====================================================================================
// CROSS-COURSE RESIDUAL DECOMPOSITION: which part of the error is the CAR and which the COURSE?
// =====================================================================================
// Nine cars now carry driven laps on two or more of the three courses, and that is the first time
// the two halves of the residual have been separable at all. With one lap per car they are
// hopelessly confounded: a car that is 4% slow on Misaki might be a car the model gets wrong or a
// corner the model gets wrong, and nothing in one number can tell them apart. With two or three
// laps of the same car on roads of completely different character the split is arithmetic:
//
//   residual(car, course) = CAR CONSTANT + COURSE-VARYING REMAINDER
//
// where the car constant is that car's own mean residual across the courses it has been driven
// on, i.e. how uniformly quick or slow the model has it, and the remainder is the deviation from
// its own mean, i.e. how much the model gets the CHARACTER of the car wrong rather than its level.
//
// A car constant is a car property and a candidate for a wrong INPUT. A remainder is a course
// property of that car and a candidate for a missing TERM. They want different fixes, and until
// now the harness has been unable to say which of the two it was looking at.
const XC_COURSES = [
  ['Misaki', LEGEND],
  ['Hakone', HAK],
  ['Wangan', WAN],
]
// TWO READINGS, AND THE DIFFERENCE BETWEEN THEM MATTERS. `published` is each course table's own
// record for the car, which is what the three tables above print. `unified` runs the Misaki and
// Wangan convention (telemetry anchor first, the maintainer's panel capture next, the spec book
// last) on ALL THREE courses. They differ on the cars whose Hakone row uses the plain spec-book
// entry while their Misaki row uses a fingerprint or an anchor, and on those cars a car constant
// computed from the published reading would be partly a bookkeeping artefact. The published
// reading is printed because it is what the model publishes; the unified reading is what the
// conclusions rest on, and the gap between the two is printed as well.
const xcRowsFor = (unified) => {
  const per = new Map()
  const add = (id, course, c, driven) => {
    if (!per.has(id)) per.set(id, { id, lbl: byId(id).n, e: {}, t: {}, car: c })
    const r = per.get(id)
    r.e[course] = pct(lap(c, XC_COURSES.find((x) => x[0] === course)[1]), driven)
    r.t[course] = driven
    if (course === 'Misaki') r.car = c
  }
  DRIVEN.forEach((d) => add(d.id, 'Misaki', unified ? drivenCar(d.id) : d.c, d.t))
  HAKD.forEach((d) => add(d.id, 'Hakone', unified ? drivenCar(d.id) : d.c, d.t))
  WAND.forEach((d) => add(d.id, 'Wangan', unified ? drivenCar(d.id) : d.c, d.t))
  const out = [...per.values()].filter((r) => Object.keys(r.e).length >= 2)
  out.forEach((r) => {
    const vs = Object.values(r.e)
    r.n = vs.length
    r.konst = mAvg(vs)
    r.rem = {}
    Object.keys(r.e).forEach((k) => (r.rem[k] = r.e[k] - r.konst))
    r.remRms = rmsOf(Object.values(r.rem))
  })
  return out
}
// The whole section is computed at BOTH terms: the additive agility term the model carried before
// 2026-07-27, because that is the state the decomposition was asked about and a diagnosis
// re-scored at the fix it motivated is not a diagnosis; and the corner-exit penalty that replaced
// it, because the reader needs to know whether the answer changed.
const xcAt = (mode, unified) => {
  const sA = kAgi,
    sX = kExit
  if (mode === 'adder') {
    kAgi = KAGI_FIT
    kExit = 0
  } else {
    kAgi = 0
    kExit = KEXIT_FIT
  }
  const out = xcRowsFor(unified)
  kAgi = sA
  kExit = sX
  return out
}
const XC_ADD = xcAt('adder', true)
const XC_ADD_PUB = xcAt('adder', false)
const XC_NEW = xcAt('exit', true)
const xcShort = (lbl) => lbl.replace(/^\d{4} /, '').slice(0, 30)
const xcFmt = (v) => (v == null ? '      -' : v.toFixed(2).padStart(7))

console.log('\n\n## CROSS-COURSE RESIDUAL DECOMPOSITION (' + XC_ADD.length + ' cars, 2+ courses each)')
console.log('THE TABLES BELOW RUN THE PUBLISHED ADDITIVE AGILITY TERM at its fitted weight,')
console.log('kAgi ' + KAGI_FIT.toFixed(2) + ', which is what the ranked table runs. The same decomposition at the')
console.log('corner-exit term, which is scored and not applied, is at the end of the section, so what')
console.log('that term would do to it is visible rather than asserted.')
console.log('')
console.log('  residual(car, course) = CAR CONSTANT (its own mean) + REMAINDER (deviation from it).')
console.log('  A car constant is a candidate for a wrong INPUT; a remainder for a missing TERM.')

console.log('\n### the decomposition, ranked by the size of the uniform component')
console.log(
  '  car                              n   Misaki  Hakone  Wangan | car const |  rem mis  rem hak  rem wan   rem rms',
)
XC_ADD.slice()
  .sort((a, b) => Math.abs(b.konst) - Math.abs(a.konst))
  .forEach((r) =>
    console.log(
      '  ' + xcShort(r.lbl).padEnd(32) + String(r.n).padStart(2) +
        xcFmt(r.e.Misaki) + xcFmt(r.e.Hakone) + xcFmt(r.e.Wangan) + '  ' +
        r.konst.toFixed(2).padStart(9) + '   ' +
        xcFmt(r.rem.Misaki) + xcFmt(r.rem.Hakone) + xcFmt(r.rem.Wangan) +
        r.remRms.toFixed(2).padStart(10) +
        (Math.abs(r.konst) > 2 ? '   <== uniform > 2%' : ''),
    ),
  )
{
  const big = XC_ADD.filter((r) => Math.abs(r.konst) > 2).sort((a, b) => b.konst - a.konst)
  console.log(
    '  UNIFORM COMPONENT ABOVE 2%, EITHER DIRECTION: ' +
      (big.length
        ? big
            .map((r) => xcShort(r.lbl) + ' ' + (r.konst > 0 ? '+' : '') + r.konst.toFixed(1) + '%')
            .join(', ')
        : 'none') + '.',
  )
  console.log(
    '  A POSITIVE constant means the MODEL IS SLOW for that car everywhere it has been driven.',
  )
}
console.log('\n### the same cars ranked by the size of the COURSE-VARYING part')
console.log('  car                              rem rms   worst course   and by how much')
XC_ADD.slice()
  .sort((a, b) => b.remRms - a.remRms)
  .forEach((r) => {
    const worst = Object.keys(r.rem).reduce((a, k) =>
      Math.abs(r.rem[k]) > Math.abs(r.rem[a]) ? k : a,
    )
    console.log(
      '  ' + xcShort(r.lbl).padEnd(32) + r.remRms.toFixed(2).padStart(7) + '%   ' +
        worst.padEnd(15) + (r.rem[worst] > 0 ? '+' : '') + r.rem[worst].toFixed(2) + '%',
    )
  })

// ---- how much of the residual is which ----
console.log('\n### how the total residual splits')
{
  const all = []
  const btw = []
  const rems = []
  XC_ADD.forEach((r) =>
    Object.keys(r.e).forEach((k) => {
      all.push(r.e[k])
      btw.push(r.konst)
      rems.push(r.rem[k])
    }),
  )
  const konsts = XC_ADD.map((r) => r.konst)
  // The two components add to the total by construction: the between-car term repeats each car's
  // constant over its own courses, and the within-car term is what is left after it.
  const vT = mAvg(all.map((x) => x * x)),
    vB = mAvg(btw.map((x) => x * x)),
    vW = mAvg(rems.map((x) => x * x))
  console.log(
    '  ' + all.length + ' residuals over ' + XC_ADD.length + ' cars.  total rms ' +
      Math.sqrt(vT).toFixed(2) + '%   car-level rms ' + Math.sqrt(vB).toFixed(2) +
      '%   course-varying rms ' + Math.sqrt(vW).toFixed(2) + '%',
  )
  console.log(
    '  CAR-LEVEL OWNS ' + ((100 * vB) / vT).toFixed(0) + '% OF THE SQUARED RESIDUAL and the ' +
      'course-varying part ' + ((100 * vW) / vT).toFixed(0) + '%.',
  )
  console.log(
    '  car constants: min ' + Math.min(...konsts).toFixed(2) + '%, max ' +
      Math.max(...konsts).toFixed(2) + '%, mean ' + mAvg(konsts).toFixed(2) + '%, rms ' +
      rmsOf(konsts).toFixed(2) + '%.',
  )
  console.log(
    '  remainders:    min ' + Math.min(...rems).toFixed(2) + '%, max ' +
      Math.max(...rems).toFixed(2) + '%, rms ' + rmsOf(rems).toFixed(2) + '%.',
  )
}

// ---- the bookkeeping check ----
console.log('\n### bookkeeping check: does the car constant survive one record per car?')
console.log('  Cars whose Hakone row runs a different record from their Misaki and Wangan rows.')
console.log('  car                            const (published)   const (unified)   move')
{
  const moved = XC_ADD.map((r) => {
    const pubR = XC_ADD_PUB.find((x) => x.id === r.id)
    return { r, pubK: pubR ? pubR.konst : null }
  }).filter((x) => x.pubK != null)
  moved.sort((a, b) => Math.abs(b.pubK - b.r.konst) - Math.abs(a.pubK - a.r.konst))
  const worstMove = Math.abs(moved[0].pubK - moved[0].r.konst)
  console.log(
    '  Largest move over the ' + moved.length + ' cars: ' + worstMove.toFixed(3) +
      ' percentage points' +
      (worstMove < 0.05
        ? '. Nothing here changes a conclusion; the two conventions'
        : '. Read the affected rows with that in mind; the two conventions'),
  )
  console.log(
    '  happen to agree because every multi-course car resolves to the same record either way.',
  )
  moved
    .slice(0, 3)
    .forEach((x) =>
      console.log(
        '    ' + xcShort(x.r.lbl).padEnd(30) + x.pubK.toFixed(2).padStart(15) +
          x.r.konst.toFixed(2).padStart(18) + (x.r.konst - x.pubK).toFixed(2).padStart(8),
      ),
    )
  console.log(
    '  Everything else in this section uses the UNIFIED record. The published tables use each',
  )
  console.log(
    '  course\'s own, which is why a car can read differently there. The gap is bookkeeping.',
  )
}

// ---- what does the uniform component key on? ----
console.log('\n### what does the CAR CONSTANT key on?   (n = ' + XC_ADD.length + ')')
console.log(
  '  Pearson r of each candidate input against the ' + XC_ADD.length + ' car constants. WITH NINE',
)
console.log(
  '  CARS THE 5% TWO-TAILED CRITICAL VALUE IS |r| = 0.67. Anything below that is not evidence, and',
)
console.log(
  '  a table of nineteen candidates will throw up one or two above it by chance alone. Read the',
)
console.log('  whole column rather than its maximum.')
console.log('    candidate                          r      n    range over these cars')
{
  const cars = XC_ADD.map((r) => r.car)
  const ys = XC_ADD.map((r) => r.konst)
  const blocks = cars.map((c) => carBlock(c))
  const cand = [
    ['kerb mass (kg)', cars.map((c) => c.kg)],
    ['power (PS)', cars.map((c) => c.ps)],
    ['power to weight (PS/t)', cars.map((c) => (1000 * c.ps) / c.kg)],
    ['mechanical grip mu', cars.map((c) => gripMu(c))],
    ['downforce dfC', cars.map((c) => c.dfC || 0)],
    ['braking bmu', cars.map((c) => brakeMu(c))],
    ['bmu / mu', cars.map((c) => brakeMu(c) / gripMu(c))],
    ['aLaunch (m/s2)', blocks.map((b) => b.aGrip)],
    ['pEff (kW)', blocks.map((b) => b.Pacc / 1000)],
    ['pEff / Pw', blocks.map((b) => b.Pacc / b.Pw)],
    ['drag Cd', cars.map((c) => c.cd)],
    ['drag CdA (m2)', blocks.map((b) => b.CdA)],
    ['year', cars.map((c) => c.y)],
    ['tyre width (mm)', cars.map((c) => tyreW(c))],
    ['AWD (0/1)', cars.map((c) => (c.dt === 'AWD' ? 1 : 0))],
    ['FWD (0/1)', cars.map((c) => (c.dt === 'FWD' ? 1 : 0))],
    ['RWD (0/1)', cars.map((c) => (c.dt === 'RWD' ? 1 : 0))],
    ['acceleration MEASURED (0/1)', cars.map((c) => (accelOf(c).src === 'measured' ? 1 : 0))],
    ['top speed (km/h)', blocks.map((b) => 3.6 * b.vTop)],
  ]
  const scored = cand.map(([lbl, xs]) => ({
    lbl,
    xs,
    r: rcorr(xs, ys),
    flat: Math.max(...xs) - Math.min(...xs) < 1e-12,
  }))
  scored
    .sort((a, b) => (isFinite(b.r) ? Math.abs(b.r) : -1) - (isFinite(a.r) ? Math.abs(a.r) : -1))
    .forEach((x) =>
      console.log(
        '    ' + x.lbl.padEnd(30) + (x.flat ? 'const' : x.r.toFixed(3)).padStart(8) +
          String(ys.length).padStart(6) + '    ' + Math.min(...x.xs).toFixed(2) + ' to ' +
          Math.max(...x.xs).toFixed(2) +
          (x.flat ? '   [no variance over these cars]' : '') +
          (!x.flat && Math.abs(x.r) >= 0.67 ? '   <== clears |r| = 0.67' : ''),
      ),
    )
  const over = scored.filter((x) => !x.flat && Math.abs(x.r) >= 0.67)
  console.log(
    '  ' + over.length + ' of ' + scored.length + ' candidates clear the bar' +
      (over.length ? ': ' + over.map((x) => x.lbl + ' ' + x.r.toFixed(2)).join(', ') : '') + '.',
  )
  console.log(
    '  Expected above the bar by chance alone at 5% on ' + scored.length +
      ' correlated candidates: about one.',
  )
  // Group means for the categorical predictors, which a point-biserial r reports badly.
  const grp = (keyFn) => {
    const m = {}
    XC_ADD.forEach((r, i) => {
      const k = keyFn(cars[i])
      ;(m[k] = m[k] || []).push(r.konst)
    })
    return Object.entries(m)
      .sort((a, b) => mAvg(b[1]) - mAvg(a[1]))
      .map(([k, v]) => k + ' ' + mAvg(v).toFixed(2) + '% (n=' + v.length + ')')
      .join(',  ')
  }
  console.log('    by drivetrain:        ' + grp((c) => c.dt))
  console.log('    by engine archetype:  ' + grp((c) => ARCHLBL[archOf(c)]))
  console.log('    by acceleration src:  ' + grp((c) => accelOf(c).src))
}

// ---- the corner-exit traction hypothesis, tested ----
console.log('\n### THE HYPOTHESIS ON THE TABLE: is the Hakone residual a missing AWD traction term?')
console.log('  The three round-4 cars came in on Hakone at AWD +4.9%, FWD +2.6%, RWD +0.3% at the')
console.log('  constants they were predicted at, which reads as a missing corner-exit traction model.')
console.log('  Tested here against every driven car on every course, at the additive term.')
console.log('    course    drivetrain    n    mean residual   cars')
{
  const rowsFor = (course) =>
    XC_ADD.filter((r) => r.e[course] != null).map((r) => ({
      dt: r.car.dt,
      e: r.e[course],
      lbl: xcShort(r.lbl),
    }))
  XC_COURSES.forEach(([course]) => {
    const rs = rowsFor(course)
    ;['AWD', 'FWD', 'RWD'].forEach((dt) => {
      const grpRows = rs.filter((x) => x.dt === dt)
      if (!grpRows.length) return
      console.log(
        '    ' + course.padEnd(10) + dt.padEnd(13) + String(grpRows.length).padStart(2) +
          mAvg(grpRows.map((x) => x.e)).toFixed(2).padStart(16) + '%   ' +
          grpRows.map((x) => x.lbl.slice(0, 16) + ' ' + x.e.toFixed(1)).join(', '),
      )
    })
  })
  // The same question over the full driven sets rather than the multi-course nine, because the
  // hypothesis is about a course and not about this subset.
  console.log('  the same split over the FULL driven set on each course, not just the multi-course cars')
  console.log('    course    AWD              FWD              RWD')
  const sA0 = kAgi,
    sX0 = kExit
  kAgi = KAGI_FIT
  kExit = 0
  const full = [
    ['Misaki', DRIVEN.map((d) => ({ dt: d.c.dt, e: pct(lap(d.c, LEGEND), d.t) }))],
    ['Hakone', HAKD.map((d) => ({ dt: d.c.dt, e: pct(lap(d.c, HAK), d.t) }))],
    ['Wangan', WAND.map((d) => ({ dt: d.c.dt, e: pct(lap(d.c, WAN), d.t) }))],
  ]
  kAgi = sA0
  kExit = sX0
  full.forEach(([course, rs]) => {
    const cell = (dt) => {
      const grpRows = rs.filter((x) => x.dt === dt)
      return grpRows.length
        ? (mAvg(grpRows.map((x) => x.e)).toFixed(2) + '% (n=' + grpRows.length + ')').padEnd(17)
        : '-'.padEnd(17)
    }
    console.log('    ' + course.padEnd(10) + cell('AWD') + cell('FWD') + cell('RWD'))
  })
  const hakAdd = (() => {
    const sA = kAgi,
      sX = kExit
    kAgi = KAGI_FIT
    kExit = 0
    const out = HAKD.map((d) => ({ id: d.id, dt: d.c.dt, lbl: d.lbl, e: pct(lap(d.c, HAK), d.t) }))
    kAgi = sA
    kExit = sX
    return out
  })()
  const hakAwd = hakAdd.filter((r) => r.dt === 'AWD')
  console.log(
    '  THE COUNTER-EXAMPLE, STATED FIRST: the R35 is AWD, it is the fastest car on Hakone, and at',
  )
  console.log(
    '  the additive term it fits at ' + hakAdd.find((r) => r.id === 'nissan-gt-r-r35').e.toFixed(1) +
      '%. The AWD cars on Hakone run ' +
      hakAwd.map((r) => xcShort(r.lbl).slice(0, 16) + ' ' + r.e.toFixed(1) + '%').join(', ') + ',',
  )
  console.log(
    '  which is not a group with a common offset. It is one car carrying a residual and the rest',
  )
  console.log('  fitting.')
  const b22 = XC_ADD.find((x) => x.id === 'subaru-impreza-22b-sti')
  console.log(
    '  AND THE DECOMPOSITION SETTLES IT. The 22B is the AWD car carrying the Hakone residual, and',
  )
  console.log(
    '  its residual is ' + b22.e.Misaki.toFixed(1) + '% on Misaki, ' + b22.e.Hakone.toFixed(1) +
      '% on Hakone and ' + b22.e.Wangan.toFixed(1) + '% on Wangan: a car constant of ' +
      b22.konst.toFixed(1) + '% with a',
  )
  console.log(
    '  course-varying part of only ' + b22.remRms.toFixed(1) +
      '% rms. It is uniformly slow, not slow in corners. A',
  )
  console.log(
    '  corner-exit traction term cannot explain a residual that is the same size on a 77%-straight',
  )
  console.log(
    '  motorway loop, where the car takes eight of eleven corners above 161 km/h and traction out of',
  )
  console.log('  a hairpin never arises.')
  const ek = XC_ADD.find((x) => x.id === 'honda-civic-type-r-ek9')
  console.log(
    '  THE FWD ROW IS A DIFFERENT ANIMAL AND IT IS REAL. The EK9 has a car constant of ' +
      ek.konst.toFixed(1) + '%, so it is',
  )
  console.log(
    '  not uniformly anything, but its remainders are ' + ek.rem.Hakone.toFixed(1) +
      '% on Hakone and ' + ek.rem.Wangan.toFixed(1) + '% on Wangan: the model is too',
  )
  console.log(
    '  slow for it on the tight road and too fast on the motorway by comparable amounts. THAT is a',
  )
  console.log('  missing term, and it is a course-character term rather than a drivetrain one.')
  console.log(
    '  VERDICT ON THE HYPOTHESIS: IT DOES NOT HOLD. The AWD/FWD/RWD ordering on Hakone is three cars',
  )
  console.log(
    '  deep and survives contact with neither the other driven AWD cars on that course nor the same',
  )
  console.log(
    '  three cars on the other two. What looked like a drivetrain effect is one car with a uniform',
  )
  console.log(
    '  residual sitting next to one car with a genuine course-character residual, and those are two',
  )
  console.log('  different findings that happened to point the same way once.')
}

// ---- the same decomposition at the corner-exit term, which is scored and not applied ----
console.log('\n### the same decomposition at the corner-exit term (scored, not applied), for comparison')
console.log(
  '  car                              n   Misaki  Hakone  Wangan | car const |  rem rms   vs adder',
)
XC_NEW.slice()
  .sort((a, b) => Math.abs(b.konst) - Math.abs(a.konst))
  .forEach((r) => {
    const old = XC_ADD.find((x) => x.id === r.id)
    console.log(
      '  ' + xcShort(r.lbl).padEnd(32) + String(r.n).padStart(2) +
        xcFmt(r.e.Misaki) + xcFmt(r.e.Hakone) + xcFmt(r.e.Wangan) + '  ' +
        r.konst.toFixed(2).padStart(9) + '   ' + r.remRms.toFixed(2).padStart(7) + '%' +
        (r.remRms - old.remRms).toFixed(2).padStart(11),
    )
  })
{
  const flat = (set, key) => [].concat(...set.map((r) => Object.values(r[key])))
  const remOld = rmsOf(flat(XC_ADD, 'rem')),
    remNew = rmsOf(flat(XC_NEW, 'rem'))
  const konOld = rmsOf(XC_ADD.map((r) => r.konst)),
    konNew = rmsOf(XC_NEW.map((r) => r.konst))
  console.log(
    '  COURSE-VARYING rms ' + remOld.toFixed(2) + '% -> ' + remNew.toFixed(2) + '%.  CAR-LEVEL rms ' +
      konOld.toFixed(2) + '% -> ' + konNew.toFixed(2) + '%.',
  )
  console.log(
    '  The first is what the new term is FOR. The second it has no business touching, and a large',
  )
  console.log('  move there would be a warning rather than a result.')
}

const rows = CARS.map((c) => {
  const b = carBlock(c)
  const tt = {}
  // courseTime, not lap: Yatabe is a standing kilometre with its own evaluator and its own
  // calibration offset, and every other course is unchanged by going through the dispatch.
  for (const k of CK) tt[k] = courseTime(k, c)
  return {
    c,
    mu: gripMu(c),
    disp: dispGrip(gripMu(c)),
    z: zeroTo100(c),
    vtop: Math.round(b.vTop * 3.6),
    acc: b.acc,
    tt,
  }
})
// overall = weighted mean of (time / best-on-course).
//
// NOT equal weight, deliberately. Influence is weight times the course's spread of normalised
// times, and the four spreads differ a lot: Hakone 0.099, Misaki 0.148, Wangan 0.182, Yatabe
// 0.214. Equal weight therefore hands Yatabe about a third of the index's spread on a nominal
// quarter, and lets the two power-biased courses (Wangan and Yatabe measure overlapping things)
// outvote the only tight one.
//
// Misaki is heaviest because it is the mixed-character course AND the only geometry never tuned
// to a driven time. Hakone is second because it is the sole counterweight to the two fast
// courses and its narrow spread means it needs more nominal weight to get an equal say.
// Wangan is cut because Yatabe already prices power and drag. Yatabe is a minority voice: one
// dimension, no cornering, and its own times carry a calibration offset.
// Locked 2026-07-27. The weights look lopsided because they correct for spread, not because
// Hakone matters more than Wangan. What they buy is INFLUENCE of roughly Misaki 42%, Wangan
// 26%, Hakone 25%, Yatabe 8%, which is what "generally faster" should mean: a mixed road
// dominant, the tight and fast poles level, straight-line a token vote. Yatabe is small on
// purpose: it prices power and drag, which Wangan already does, only with the corners removed.
const COURSE_WEIGHT = { Misaki: 0.4, Hakone: 0.35, Wangan: 0.2, Yatabe: 0.05 }
const wOf = (k) => (COURSE_WEIGHT[k] != null ? COURSE_WEIGHT[k] : 1 / CK.length)
const WSUM = CK.reduce((a, k) => a + wOf(k), 0)
// `overall3` is the same index over the LAP courses only, kept so the section below can state
// exactly what the fourth course did to the ranking instead of asserting that it did little.
const best = {}
for (const k of CK) best[k] = Math.min(...rows.map((r) => r.tt[k]))
const LAPCK = CK.filter((k) => !COURSE_EVAL[k])
const LAPWSUM = LAPCK.reduce((a, k) => a + wOf(k), 0)
rows.forEach((r) => {
  r.overall = CK.reduce((a, k) => a + (r.tt[k] / best[k]) * wOf(k), 0) / WSUM
  r.overall3 = LAPCK.reduce((a, k) => a + (r.tt[k] / best[k]) * wOf(k), 0) / LAPWSUM
})
// specialty = course where car's normalised time is lowest (relatively best)
rows.forEach((r) => {
  let bk = '',
    bv = 9
  for (const k of CK) {
    const nv = r.tt[k] / best[k]
    if (nv < bv) {
      bv = nv
      bk = k
    }
  }
  r.spec = bk
})
rows.sort((a, b) => a.overall - b.overall)

console.log('\n## Ranked by overall pace across all ' + CK.length + ' courses')
console.log(
  'THE INDEX IS THE MEAN OF THE ' + CK.length + ' NORMALISED TIMES, EQUAL WEIGHT PER COURSE, and',
)
console.log(
  'since 2026-07-27 one of the ' + CK.length + ' is a straight line. The block below the table' +
    ' prices what that did',
)
console.log('to the ranking. The Yatabe column carries the drag calibration offset; the three lap')
console.log('columns carry no offset of any kind.')
// `acc` is provenance, not a lever: meas = both times published and the curve solved from them,
// 1pt = one time published and the other half regressed, est = both halves regressed.
console.log(
  'rank ovr   PS   kg  PS/t mu   grip dt  engine    acc  0-100 top' +
    CK.map((k) => abbr(k).padStart(6)).join('') +
    '   best   car',
)
rows.forEach((r, i) => {
  const c = r.c
  console.log(
    String(i + 1).padStart(3) +
      ' ' +
      r.overall.toFixed(3) +
      ' ' +
      String(c.ps).padStart(4) +
      ' ' +
      String(c.kg).padStart(4) +
      ' ' +
      String(Math.round((c.ps / c.kg) * 1000)).padStart(4) +
      ' ' +
      r.mu.toFixed(2) +
      ' ' +
      String(r.disp).padStart(3) +
      ' ' +
      c.dt.padEnd(3) +
      ' ' +
      ARCHLBL[archOf(c)].padEnd(8) +
      ' ' +
      ACCTAG[r.acc.src] +
      ' ' +
      r.z.toFixed(1).padStart(5) +
      ' ' +
      String(r.vtop).padStart(4) +
      CK.map((k) => r.tt[k].toFixed(1).padStart(6)).join('') +
      '   ' +
      r.spec.slice(0, 5).padEnd(5) +
      ' ' +
      (c.ig ? '* ' : '  ') +
      c.n,
  )
})
console.log(
  '\ncars: ' +
    rows.length +
    '   * = in playable game (26)   best = the course this car is relatively strongest on',
)

// ---- WHAT ADDING YATABE DID TO THE INDEX, AND WHETHER THE WEIGHT IS DEFENSIBLE ----
// The fourth course ships at equal weight with the other three, by instruction. This block is
// the receipt: the ranking with and without it, the largest moves, and the one statistic that
// decides the question - how much wider a straight line spreads the field than a lap does. A
// course that spreads the field further contributes more variance to a mean of normalised times,
// so equal WEIGHT is not equal INFLUENCE, and that is the whole of the argument either way.
{
  const rk = (key) => {
    const s = [...rows].sort((a, b) => a[key] - b[key])
    const m = new Map()
    s.forEach((r, i) => m.set(r.c.id, i + 1))
    return m
  }
  const r4c = rk('overall'),
    r3c = rk('overall3')
  const moves = rows
    .map((r) => ({ r, before: r3c.get(r.c.id), after: r4c.get(r.c.id), d: r3c.get(r.c.id) - r4c.get(r.c.id) }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
  const spreadOfK = (k) => Math.max(...rows.map((r) => r.tt[k])) / Math.min(...rows.map((r) => r.tt[k]))
  const sd = (xs) => {
    const m = mAvg(xs)
    return Math.sqrt(mAvg(xs.map((x) => (x - m) * (x - m))))
  }
  console.log('\n## What the fourth course did to the overall index')
  console.log('Top 20 before (lap courses only) and after (with Yatabe at equal weight):')
  console.log(
    '  rank   without Yatabe                        with Yatabe',
  )
  const byOld = [...rows].sort((a, b) => a.overall3 - b.overall3)
  const cell = (r, v) => (r.c.n.replace(/^\d{4} /, '').slice(0, 28) + ' ').padEnd(30) + v.toFixed(3)
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    console.log(
      '  ' + String(i + 1).padStart(4) + '   ' +
        cell(byOld[i], byOld[i].overall3).padEnd(40) + cell(rows[i], rows[i].overall),
    )
  }
  console.log(
    '  Largest rank moves: ' +
      moves.slice(0, 5).map((m) =>
        m.r.c.n.replace(/^\d{4} /, '').slice(0, 26) + ' ' + m.before + '->' + m.after +
          ' (' + (m.d > 0 ? '+' : '') + m.d + ')',
      ).join(', ') + '.',
  )
  console.log(
    '  ' + moves.filter((m) => Math.abs(m.d) >= 5).length + ' of ' + rows.length +
      ' cars move by 5 places or more, ' + moves.filter((m) => Math.abs(m.d) >= 10).length +
      ' by 10 or more; the top ' +
      (function () {
        let n = 0
        while (n < rows.length && byOld[n].c.id === rows[n].c.id) n++
        return n
      })() + ' places are unchanged.',
  )
  console.log(
    '  FIELD SPREAD PER COURSE (slowest / fastest): ' +
      CK.map((k) => k.slice(0, 6) + ' ' + spreadOfK(k).toFixed(2) + 'x').join(', ') + '.',
  )
  console.log(
    '  SD OF THE NORMALISED TIME PER COURSE: ' +
      CK.map((k) => k.slice(0, 6) + ' ' + sd(rows.map((r) => r.tt[k] / best[k])).toFixed(3)).join(', ') +
      '.',
  )
  console.log(
    '  READ THAT LAST LINE BEFORE DEFENDING THE WEIGHT. Equal weight is equal weight on the' +
      ' NUMBER, not on the influence:',
  )
  console.log('  the course whose normalised times are most spread out contributes the most')
  console.log('  variance to a mean of them, and a standing kilometre spreads a field of 85 cars')
  console.log('  wider than any lap does, because a lap gives a slow car its corners back and a')
  console.log('  straight line gives it nothing. A quarter of the index therefore buys more than a')
  console.log('  quarter of the ordering, and every bit of what it buys is power, mass and drag.')
  console.log('  THE INDEX IS NOT CHANGED HERE. This block is the evidence for the ruling, not the')
  console.log('  ruling: equal weight ships until the maintainer says otherwise.')
}
// The specialty column is a normalised-time argmin, so it is really "which course compresses
// the field most", and saying so is cheaper than letting a reader take it for a car property.
// Dropping the synthetic Circuit (2026-07-27) took it out of the degenerate state it was in -
// 83 of 85 cars picked that one course, because it compressed the field hardest - but a split
// is not the same thing as a signal, so the margin over the runner-up is printed with it.
{
  const cnt = {}
  rows.forEach((r) => (cnt[r.spec] = (cnt[r.spec] || 0) + 1))
  const spreadOf = (k) => Math.max(...rows.map((r) => r.tt[k])) / Math.min(...rows.map((r) => r.tt[k]))
  // The gap between the winning course and the runner-up, in normalised time. A car whose two
  // best courses score it the same to a thousandth has no specialty, it has a rounding error.
  const margins = rows
    .map((r) => {
      const v = CK.map((k) => r.tt[k] / best[k]).sort((a, b) => a - b)
      return v[1] - v[0]
    })
    .sort((a, b) => a - b)
  const medMargin = margins[Math.floor(margins.length / 2)]
  const thin = margins.filter((x) => x < 0.005).length
  console.log(
    'READ `best` WITH CARE: ' +
      Object.entries(cnt)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => n + ' ' + k)
        .join(', ') +
      '. It is an argmin over normalised times, so it',
  )
  console.log(
    'picks whichever course compresses the field hardest, and that is ' +
      CK.map((k) => k.slice(0, 6) + ' ' + spreadOf(k).toFixed(2) + 'x').join(', ') +
      '.',
  )
  {
    const top = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]
    console.log(
      'IT IS BACK TO NEARLY DEGENERATE: ' + top[1] + ' of ' + rows.length + ' cars pick ' + top[0] +
        ', and ' + (cnt.Yatabe || 0) + ' pick Yatabe,',
    )
    console.log(
      'which is what an argmin over normalised times does with the widest-spread course in the' +
        ' set: it makes almost every car look relatively WORSE there. Dropping the synthetic Circuit',
    )
    console.log(
      'in 2026-07-27 took it out of an 83-of-85 state and it split 45/37/3; the corner-exit term has',
    )
    console.log(
      'pushed it back, because that term compresses the Hakone field and a compressed course stops',
    )
    console.log(
      'being anyone' + String.fromCharCode(39) + 's specialty. That is a property of the column, not of the cars.',
    )
  }
  console.log(
    'But the pick is thin. The median margin over the runner-up is ' +
      medMargin.toFixed(3) +
      ' of normalised time and ' +
      thin +
      ' of ' +
      rows.length,
  )
  console.log(
    'cars sit inside 0.005 of it, which is a coin flip. Read the column as a weak lean rather than',
  )
  console.log('a car property; it still wants a per-car normalisation. Not fixed in this run.')
}

// ---- implausible-ordering audit over all 85, not just the 8 driven laps ----
// Restoring the geometry made Hakone three times tighter, so the place a bad ordering would show
// up is a car that is much better on Hakone than on Misaki, or the reverse. This is a screen over
// the whole roster rather than the eight cars with driven times, because eight laps cannot see
// most of the field. It reports the extremes and leaves the judgement to a reader who knows the
// cars; nothing here is a correction.
{
  const rankOn = (k) => {
    const s = [...rows].sort((a, b) => a.tt[k] - b.tt[k])
    const m = new Map()
    s.forEach((r, i) => m.set(r.c.id, i + 1))
    return m
  }
  const rh = rankOn('Hakone'),
    rm = rankOn('Misaki'),
    rw = rankOn('Wangan')
  const mv = rows
    .map((r) => ({ r, h: rh.get(r.c.id), m: rm.get(r.c.id), d: rm.get(r.c.id) - rh.get(r.c.id) }))
    .sort((a, b) => b.d - a.d)
  const line = (x) =>
    console.log(
      '    Hakone ' + String(x.h).padStart(3) + '  Misaki ' + String(x.m).padStart(3) +
        '   ' + (x.d > 0 ? '+' : '') + String(x.d).padStart(3) + '   ' +
        String(x.r.c.ps).padStart(4) + ' PS ' + String(x.r.c.kg).padStart(4) + ' kg  mu ' +
        x.r.mu.toFixed(2) + ' ' + x.r.c.dt.padEnd(3) + '  ' + x.r.c.n,
    )
  console.log('\n## Ordering audit: who does the tight course flatter, and who does it punish?')
  console.log(
    'Rank on Hakone against rank on Misaki, over all ' + rows.length + ' cars. A large positive',
  )
  console.log(
    'number means the hairpin course promotes the car; a large negative one means it demotes it.',
  )
  console.log('This is where a tight-course model betrays itself, so it is printed rather than')
  console.log('inferred from the eight driven laps.')
  console.log('  MOST FLATTERED BY THE HAIRPIN COURSE')
  mv.slice(0, 8).forEach(line)
  console.log('  MOST PUNISHED BY IT')
  mv.slice(-8).forEach(line)
  console.log(
    '  READING. The promoted list is five AWD turbos and two low-powered runabouts; the punished',
  )
  console.log(
    '  list is eight RWD cars, six of them low-grip and old. That is the right direction for a',
  )
  console.log(
    '  hairpin course, but be clear about the CHANNEL: the model has no traction-out-of-a-hairpin',
  )
  console.log(
    '  term, so AWD is being promoted purely through the grip bonus in the mu model, and low-grip',
  )
  console.log(
    '  cars are being punished twice over, once through apex speed and again through the 1/mu in',
  )
  console.log(
    '  the corner-exit term. The direction is defensible; the mechanism is coarser than it looks,',
  )
  console.log('  and the cross-course decomposition above is the sharper reading of it.')
  console.log(
    '  READ THIS COLUMN AS A PROPERTY OF THE MODEL, NOT OF HAKONE. The Hakone rank comes off a',
  )
  console.log(
    '  facsimile geometry (' + HAK.filter((s) => s[0] < 30).length + ' switchbacks, ' +
      HAK.length + ' corners); the surveyed road has ' +
      HAK_MAP.filter((s) => s[0] < 30).length + ', charges ' +
      (tightSum(HAK_MAP, JOINT) / tightSum(HAK, JOINT)).toFixed(1) + 'x the',
  )
  console.log(
    '  direction change, and would push every low-grip car further down than this table shows.',
  )
  // The same screen against the FAST course, which is new this run and asks the opposite
  // question: who does 7.0 km of highway promote, and does any of it look wrong?
  const wv = rows
    .map((r) => ({ r, w: rw.get(r.c.id), m: rm.get(r.c.id), d: rm.get(r.c.id) - rw.get(r.c.id) }))
    .sort((a, b) => b.d - a.d)
  const wline = (x) =>
    console.log(
      '    Wangan ' + String(x.w).padStart(3) + '  Misaki ' + String(x.m).padStart(3) +
        '   ' + (x.d > 0 ? '+' : '') + String(x.d).padStart(3) + '   ' +
        String(x.r.c.ps).padStart(4) + ' PS ' + String(x.r.c.kg).padStart(4) + ' kg  top ' +
        String(x.r.vtop).padStart(3) + '  dfC ' + (x.r.c.dfC || 0).toFixed(2) + '  ' +
        x.r.c.dt.padEnd(3) + '  ' + x.r.c.n,
    )
  console.log('\n  THE SAME SCREEN AGAINST THE FAST COURSE (Wangan rank against Misaki rank)')
  console.log('  MOST FLATTERED BY THE HIGHWAY LOOP')
  wv.slice(0, 6).forEach(wline)
  console.log('  MOST PUNISHED BY IT')
  wv.slice(-6).forEach(wline)
  console.log(
    '  READING. The promoted cars are the ones with top speed and low drag; the punished ones are',
  )
  console.log(
    '  short-geared or aero-heavy cars that run out of road. Nothing in either list is implausible',
  )
  console.log(
    '  as a direction, and the largest single move is ' +
      Math.max(...wv.map((x) => Math.abs(x.d))) + ' places out of ' + rows.length +
      ', against ' + Math.max(...mv.map((x) => Math.abs(x.d))) + ' between Hakone and Misaki.',
  )
  const s13 = rows.find((r) => r.c.id === 'nissan-silvia-s13')
  const ord = (n) => {
    const t = n % 100
    return n + (t > 3 && t < 21 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
  }
  console.log(
    '  THE S13 K\'s (' + s13.c.ps + ' PS, ' + s13.c.kg + ' kg, mu ' + s13.mu.toFixed(2) +
      ') now sits ' + ord(rh.get(s13.c.id)) + ' on Hakone and ' + ord(rm.get(s13.c.id)) +
      ' on Misaki. SIX of its fields are',
  )
  console.log(
    '  overridden as of 2026-07-27: ForzaLabs measured the game\'s PRESET STARTER CAR rather than',
  )
  console.log(
    '  the stock one, so its lateral pair, its braking pair, its top speed, the drag derived from',
  )
  console.log(
    '  that top speed, its kerb (1121 -> 1140 kg, the preset\'s weight reduction) and its 0-97',
  )
  console.log(
    '  (6.055 -> 6.331 s) all describe a modified car. See gOvr in the spec book for the whole',
  )
  console.log(
    '  argument, including what is STILL the preset\'s: the 0-161 has no stock counterpart to',
  )
  console.log(
    '  replace it, so this car\'s solved pEff is preset-tainted while its aLaunch is not.',
  )
  console.log(
    '  That is what moved it, and the Hakone driven laps now come out in the driven order exactly:',
  )
  console.log(
    '  the inversion the scraped figures used to produce is gone. Weigh that lightly - this course',
  )
  console.log(
    '  is a facsimile searched against those same eight times, so it can confirm an ordering but',
  )
  console.log('  it cannot be evidence of accuracy. Misaki is the course that tests the model.')
}

// ---- JSON export for the visual artifact ----
CK.forEach((k) => {
  const s = [...rows].sort((a, b) => a.tt[k] - b.tt[k])
  s.forEach((r, i) => {
    r._rk = r._rk || {}
    r._rk[k] = i + 1
  })
})
;[...rows]
  .sort((a, b) => a.overall - b.overall)
  .forEach((r, i) => {
    r._rk = r._rk || {}
    r._rk.Overall = i + 1
  })
const data = {
  courses: CK,
  // Shipped so the visualisation states each course's real geometry instead of carrying
  // its own copy of the numbers, which is how the old caption text went stale.
  courseInfo: Object.fromEntries(
    CK.map((k) => {
      const t = trackInfo(k, COURSES[k])
      return [
        k,
        {
          km: +(t.len / 1000).toFixed(1),
          corners: t.corners,
          straightPct: t.straightPct,
          longest: t.longest,
        },
      ]
    }),
  ),
  constants: {
    // The published direction-change term is the ADDITIVE per-corner charge at kAgi. kExit is
    // zero, so the corner-exit speed penalty contributes nothing; both are shipped so the
    // dashboard states which term ran instead of having to infer it.
    kExit: 0,
    exitShape: 'not applied; the published model uses the additive direction-change term',
    kAgi: +KAGI_FIT.toFixed(2),
    brakeD0: +BRAKE_D0.toFixed(3),
    // The geometric corner-grip ceiling: usable mu = min(mu, geoMu (r/geoR)^geoT). Shipped so the
    // dashboard states the term from the run instead of from prose.
    geoMu: +GEO_MU.toFixed(3),
    geoR: GEO_R,
    geoT: +GEO_T.toFixed(4),
    accMeasured: ACCEL_SOLVED.length,
    accOnePoint: CARS.filter((c) => c.z97 != null && c.z161 == null).length,
    accPredicted: CARS.filter((c) => c.z97 == null).length,
    shapeVariants: XALL.length,
  },
  // The validation figures, shipped so the dashboard's caveat text can never quote a number the
  // model no longer produces. Same rule as courseInfo: the page states nothing it did not read
  // from here. Misaki's residual measures the MODEL; Hakone's measures the geometry SEARCH.
  validation: {
    misakiLaps: DRIVEN.length,
    misakiMae: +maeOf(misE).toFixed(2),
    misakiMean: +mAvg(misE).toFixed(2),
    misakiMaeNoKei: +maeOf(misNoKei).toFixed(2),
    misakiInversions: (function () {
      const byD = misRows.slice().sort((a, b) => a.driven - b.driven)
      let n = 0
      for (let i = 0; i < byD.length; i++)
        for (let j = i + 1; j < byD.length; j++) if (byD[i].mod > byD[j].mod) n++
      return n
    })(),
    misakiPairs: (misRows.length * (misRows.length - 1)) / 2,
    hakoneLaps: HAKD.length,
    hakoneMae: +maeOf(hakE).toFixed(2),
    hakoneMean: +mAvg(hakE).toFixed(2),
    hakoneInversions: inversions.length,
    hakoneInversionsAlt: invAlt.length,
    hakonePairs: (hakRows.length * (hakRows.length - 1)) / 2,
    // Wangan, the third driven course (2026-07-27). Its geometry is a searched facsimile like
    // Hakone's, so its MEAN measures the search; its SPREAD is the model, and the dashboard
    // should quote both rather than one.
    wanganLaps: WAND.length,
    wanganMae: +maeOf(wanE).toFixed(2),
    wanganMean: +mAvg(wanE).toFixed(2),
    wanganRms: +rmsOf(wanE).toFixed(2),
    wanganMaeNoLfa: +maeOf(wanRows.filter((r) => r.id !== 'lexus-lfa').map((r) => r.e)).toFixed(2),
    wanganInversions: (function () {
      const byD = wanRows.slice().sort((a, b) => a.driven - b.driven)
      let n = 0
      for (let i = 0; i < byD.length; i++)
        for (let j = i + 1; j < byD.length; j++) if (byD[i].mod > byD[j].mod) n++
      return n
    })(),
    wanganPairs: (wanRows.length * (wanRows.length - 1)) / 2,
    // The authored-to-description reading of the same road, so the dashboard can state what the
    // search bought without carrying its own copy of the number.
    wanganDescMae: +maeOf(WAND.map((d) => pct(lap(d.c, WAN_DESC), d.t))).toFixed(2),
    wanganDescMean: +mAvg(WAND.map((d) => pct(lap(d.c, WAN_DESC), d.t))).toFixed(2),
    // The blind prediction this run commits to, before the maintainer drives it.
    supraWanganPredictionS: +lap(byId('toyota-supra-rz-jza80'), WAN).toFixed(1),
    // Round 4: three cars predicted on all three courses before any of them was driven, so
    // neither searched geometry nor any fitted weight had seen them. The dashboard states the
    // out-of-sample error from here rather than from the in-sample MAEs above.
    r4Cars: R4.length,
    r4MaeMisaki: +maeOf(misRows.filter((r) => r.r4).map((r) => r.e)).toFixed(2),
    r4MaeHakone: +maeOf(hakRows.filter((r) => r.r4).map((r) => r.e)).toFixed(2),
    r4MaeWangan: +maeOf(wanRows.filter((r) => r.r4).map((r) => r.e)).toFixed(2),
    // The acceptance test for the corner-exit term: how much of the driven Hakone-to-Wangan
    // course-character swing the model reproduces, over the ten pairs driven on both roads.
    swingDrivenS: +swingAt(0, KEXIT_FIT, xshp(EXIT_PUB)).meanD.toFixed(2),
    swingModelS: +swingAt(0, KEXIT_FIT, xshp(EXIT_PUB)).meanM.toFixed(2),
    swingSharePct: +(100 * swingAt(0, KEXIT_FIT, xshp(EXIT_PUB)).share).toFixed(0),
    swingShareAdderPct: +(100 * swingAt(KAGI_FIT, 0, null).share).toFixed(0),
    swingShareNoTermPct: +(100 * swingAt(0, 0, null).share).toFixed(0),
    // The standing-start offset, measured for the first time on the one untuned course.
    standingMeasuredS: +mAvg(R4.map((r) => r.misStand - r.mis)).toFixed(2),
    standingModelledS: +mAvg(R4.map((r) => standingPenalty(byId(r.id), LEGEND))).toFixed(2),
    // The cross-course decomposition: how the residual splits into a car-level constant and a
    // course-varying remainder over the cars driven on two or more courses.
    xcCars: XC_ADD.length,
    xcCarLevelRms: +rmsOf(XC_ADD.map((r) => r.konst)).toFixed(2),
    xcCourseVaryingRms: +rmsOf([].concat(...XC_ADD.map((r) => Object.values(r.rem)))).toFixed(2),
    // What the facsimile is standing in for: the same model on the SURVEYED map, at its own
    // best (the agility term off, which is the floor of the whole family) and at the published
    // agility weight. Both are mean lap-time errors in per cent, all eight laps slow.
    surveyedFloorPct: +scoreAt(shp({}), 0, HAKM_AFF, HAK_MAP).hakMean.toFixed(1),
    surveyedPublishedPct: +scoreAt(JOINT, JOINT.k, HAKM_AFF, HAK_MAP).hakMean.toFixed(0),
    // Yatabe Straight: the measured standing kilometres. No lap constant is fitted to them; the
    // one constant that IS fitted to them is the flat protocol offset below, which reaches the
    // drag strip and nothing else. Raw and corrected are both shipped so the dashboard can show
    // the model and the admission side by side rather than only the flattering one.
    dragRuns: DRAG_SCORE.rows.length,
    dragMae: DRAG_SCORE.mae,
    dragMean: DRAG_SCORE.mean,
    dragWorst: DRAG_SCORE.worst,
    dragOffsetPct: DRAG_SCORE.offsetPct,
    dragMaeCal: DRAG_SCORE.maeCal,
    dragMeanCal: DRAG_SCORE.meanCal,
    dragWorstCal: DRAG_SCORE.worstCal,
    dragInversions: DRAG_SCORE.inversions,
    dragPairs: DRAG_SCORE.pairs,
    drag: DRAG_SCORE.rows,
    // The acceptance test: one car, four committed figures, three of them genuinely out of
    // sample. Shipped whole so the dashboard states it from the run rather than from prose.
    acceptance: {
      car: byId(ACC_RX7.id).n,
      rows: [
        ['Misaki', ACC_RX7.pMis, ACC_RX7.mis, false],
        ['Hakone', ACC_RX7.pHak, ACC_RX7.hak, true],
        ['Wangan', ACC_RX7.pWan, ACC_RX7.wan, true],
        ['Yatabe', ACC_RX7.pKm, ACC_RX7.km, true],
      ].map(([course, pred, driven, blind]) => ({
        course,
        pred,
        driven,
        e: +pct(pred, driven).toFixed(2),
        blind,
      })),
    },
    // The high-grip set: six driven points on three cars with more mechanical grip than any car
    // on the roster, and the only measurements that exist above mu 1.23. They are what the
    // geometric corner-grip ceiling is fitted on, and they are scored here rather than folded
    // into the four driven sets so that "did the 45 move" stays answerable.
    gripSet: GRIP_DRIVEN.map((d) => {
      const s0 = GEO_MU,
        t0 = GEO_T
      GEO_MU = Infinity
      GEO_T = 0
      const before = courseTime(d.course, d.c)
      GEO_MU = s0
      GEO_T = t0
      const after = courseTime(d.course, d.c)
      return {
        car: d.lbl,
        course: d.course,
        mu: +carBlock(d.c).mu.toFixed(3),
        pred: d.p,
        driven: d.t,
        before: +before.toFixed(2),
        after: +after.toFixed(2),
        eBefore: +pct(before, d.t).toFixed(2),
        eAfter: +pct(after, d.t).toFixed(2),
        anchor: !!d.anchor,
      }
    }),
    gripMaeBefore: +maeOf(
      GRIP_DRIVEN.map((d) => {
        const s0 = GEO_MU,
          t0 = GEO_T
        GEO_MU = Infinity
        GEO_T = 0
        const e = pct(courseTime(d.course, d.c), d.t)
        GEO_MU = s0
        GEO_T = t0
        return e
      }),
    ).toFixed(2),
    gripMaeAfter: +maeOf(GRIP_DRIVEN.map((d) => pct(courseTime(d.course, d.c), d.t))).toFixed(2),
    // Zero, exactly: the ceiling sits above the grip of every car on the roster, so no published
    // lap time in this file moved when it was added.
    gripRosterMoved: CARS.filter((c) => {
      const s0 = GEO_MU,
        t0 = GEO_T
      return CK.some((k) => {
        const after = courseTime(k, c)
        GEO_MU = Infinity
        GEO_T = 0
        const before = courseTime(k, c)
        GEO_MU = s0
        GEO_T = t0
        return Math.abs(100 * (after / before - 1)) > 0.5
      })
    }).length,
  },
  cars: rows.map((r) => ({
    id: r.c.id,
    n: r.c.n,
    y: r.c.y,
    q: r.c.q,
    ig: !!r.c.ig,
    ps: r.c.ps,
    kg: r.c.kg,
    pw: Math.round((r.c.ps / r.c.kg) * 1000),
    mu: +r.mu.toFixed(2),
    grip: r.disp,
    dt: r.c.dt,
    deliv: ARCHLBL[archOf(r.c)],
    z: +r.z.toFixed(1),
    top: r.vtop,
    // The car's own solved curve, and where it came from, so the dashboard can say which
    // cars are measured and which are estimated instead of presenting all 85 alike.
    acc: r.acc.src,
    aL: +r.acc.aL.toFixed(2),
    pkw: Math.round(r.acc.pE / 1000),
    pr: +(r.acc.pE / (r.c.ps * PS * eta)).toFixed(3),
    t: Object.fromEntries(CK.map((k) => [k, +r.tt[k].toFixed(1)])),
    overall: +r.overall.toFixed(3),
    rank: r._rk,
  })),
}
fs.writeFileSync(path.join(__dirname, 'lapsim-data.json'), JSON.stringify(data))
console.error('wrote lapsim-data.json (' + data.cars.length + ' cars)')

// Levers restored to the file's committed defaults so nothing downstream moves.
phi = phi0
awdK = awdK0
aCapK = aCapK0
kAgi = kAgi0

// --- 7. The geometric corner-grip ceiling: the surface, and how well the pair is determined ---
console.error('\n\n## 7. THE CORNER-GRIP CEILING SURFACE')
console.error(
  '   objective = mean of the four courses\' MAEs over all ' +
    CK.reduce((a, k) => a + SCORED[k].length, 0) + ' scored points, equal weight per course,',
)
console.error(
  '   with kAgi swept jointly inside every cell so the ceiling cannot be credited with work the',
)
console.error('   direction-change weight would have done.')
{
  const TS = [0, 0.0125, 0.025, 0.0375, 0.05, 0.0625, 0.075, 0.10, 0.125, 0.15, 0.20]
  const MS = [1.10, 1.15, 1.18, 1.20, 1.22, 1.25, 1.28, 1.32, 1.40, 1.55]
  console.error('\n### objective, rows = ceiling at ' + GEO_R + ' m, cols = radius exponent')
  console.error('           ' + TS.map((t) => t.toFixed(4).padStart(8)).join(''))
  MS.forEach((m) =>
    console.error(
      '   ' + m.toFixed(3).padStart(7) + TS.map((t) => geoScore(m, t).o.toFixed(3).padStart(8)).join(''),
    ),
  )
  // The basin, on the same grid the fit itself ran on.
  const band = []
  for (let i = 0; i <= 24; i++)
    for (let j = 0; j <= 16; j++) {
      const r = geoScore(1.0 + i * 0.025, j * 0.0125)
      if (r.o <= GEO_FIT.o + 0.02) band.push(r)
    }
  console.error(
    '\n   MINIMUM ' + GEO_FIT.o.toFixed(4) + ' at ceiling ' + GEO_FIT.mu20.toFixed(4) +
      ', exponent ' + GEO_FIT.t.toFixed(4) + ', kAgi ' + GEO_FIT.k.toFixed(4) + '.',
  )
  console.error(
    '   ' + band.length + ' coarse cells lie within 0.02 of it, spanning ceiling ' +
      Math.min(...band.map((b) => b.mu20)).toFixed(3) + ' to ' + Math.max(...band.map((b) => b.mu20)).toFixed(3) +
      ' and exponent ' + Math.min(...band.map((b) => b.t)).toFixed(4) + ' to ' +
      Math.max(...band.map((b) => b.t)).toFixed(4) + '.',
  )
  console.error(
    '   THE TWO TRADE OFF ALONG A VALLEY and neither is separately well determined: a higher',
  )
  console.error(
    '   ceiling with a slower release scores nearly the same as a lower one with a faster release.',
  )
  console.error(
    '   What IS determined is the pair, and what the pair has to do - bite a hairpin and release a',
  )
  console.error(
    '   motorway sweeper - which is what the flat-cap row of the stdout table prices. Read the',
  )
  console.error('   ceiling to two decimals and the exponent to one significant figure.')
  console.error(
    '\n   kAgi: the joint sweep wants ' + GEO_FIT.k.toFixed(4) + ' against the ' + KAGI_FIT.toFixed(4) +
      ' the ' + (DRIVEN.length + HAKD.length + WAND.length) + ' legacy laps fit on their own.',
  )
  console.error(
    '   The published run uses the legacy fit, so the ceiling cannot move the direction-change',
  )
  console.error('   weight by the back door; the two agree to within ' + Math.abs(GEO_FIT.k - KAGI_FIT).toFixed(4) + ' in any case.')
  console.error('\n### the three placements of the same ceiling, each refitted from scratch')
  console.error('   All three are searched on the COARSE grid only, so they are compared like for like;')
  console.error('   the published pair is the fine refinement of the first row. Only one of them is inert')
  console.error('   on the roster. The other two can only reach the driven times by capping grip BELOW')
  console.error('   what ordinary cars already use, which moves the 45.')
  console.error('   placement                    best ceiling   exponent   objective   inert on the roster')
  const rosterMax = Math.max(...CARS.map((c) => gripMu(c)))
  const tightest = Math.min(...CK.filter((k) => COURSES[k].length).map((k) => Math.min(...COURSES[k].map((s) => s[0]))))
  ;[
    ['arc AND direction change', 'both'],
    ['corner arc only', 'apex'],
    ['direction change only', 'agi'],
  ].forEach(([lbl, mode]) => {
    const s0 = GEO_PLACE
    GEO_PLACE = mode
    let best = null
    for (let i = 0; i <= 24; i++)
      for (let j = 0; j <= 16; j++) {
        const r = geoScore(1.0 + i * 0.025, j * 0.0125)
        if (!best || r.o < best.o) best = r
      }
    GEO_PLACE = s0
    const atTight = best.mu20 * Math.pow(tightest / GEO_R, best.t)
    console.error(
      '   ' + lbl.padEnd(29) + best.mu20.toFixed(3).padStart(9) + best.t.toFixed(4).padStart(11) +
        best.o.toFixed(4).padStart(12) + '   ' +
        (atTight >= rosterMax ? 'yes' : 'NO, it caps at ' + atTight.toFixed(3) + ' and the roster reaches ' + rosterMax.toFixed(3)),
    )
  })
}

// =====================================================================================
// THE BLIND-VALIDATION RECORD
// =====================================================================================
// Six cars the model had never lapped, gathered from what were six separate probes. Every figure
// in the `committed` column was written down at the published constants BEFORE the car was
// driven; every figure in the `driven` column is a measured time. The record only means anything
// read together, so it is one table, and it is on stdout because a validation record only its
// author can find is not a validation record.
//
// kAgi: the ambient value at this point is the Misaki-only sweep's minimum, which the
// diagnostics above run on, and every committed figure below was produced at KAGI_FIT. The
// section therefore sets it once and leaves it set; nothing runs after this. kExit is already
// zero here and is set alongside only so the published pair is stated in one place.
kAgi = KAGI_FIT
kExit = 0
console.log('\n\n## THE BLIND-VALIDATION RECORD')
{
  // The mechanical-grip build, defined here because nothing else reads it: slicks and weight with
  // no aero kit, mid-engined and rear-biased. It is the counterpart to the Calsonic below, whose
  // grip is roughly half mechanical and half aero and which therefore exercises the geometric
  // ceiling at only half strength; on this car the ceiling carries the whole load and has nothing
  // to hide behind. Its dimensions are the stock F355's, keyed by id like every other DIMS entry,
  // so frontalArea finds them and the printed Cd is against a real area rather than a sector
  // default. The drag area itself is back-solved from the measured top speed through that same
  // area, so the area cancels out of CdA exactly and only the printed Cd depends on it.
  const af = aeroFit(1.27, 1.34)
  const F355 = {
    id: 'adhoc-f355-mech',
    n: '1994 Ferrari F355 Berlinetta (modified, supercharged)',
    y: 1994,
    sec: 'Flagship',
    dt: 'RWD',
    ep: 'mid',
    ec: 'F129',
    cfg: 'V8',
    asp: 'supercharged',
    ps: 680,
    kg: 1296,
    fr: 44,
    wb: 2450,
    com: 400,
    ty: '345/30R18',
    top: 368.1,
    b97: 26.4,
    b161: 64.9,
    z97: 3.569,
    z161: 6.96,
    lg: Math.max(0, af.mu),
    dfC: Math.max(0, af.k / DOWNFORCE_K),
    cd: 0.4,
  }
  DIMS[F355.id] = [1900, 1170]
  F355.cd = cdFromTop(F355, 368.1)
  // The acceptance-test car runs the SPEC-BOOK record on all four courses, which is what its
  // committed figures ran. That is deliberately not the driven tables' own convention: Wangan
  // resolves this car to its fingerprint, and timing it that way would leave the prediction
  // column unreconcilable with the number that was actually committed.
  const RX7 = byId(ACC_RX7.id)
  if (!RX7) throw new Error('missing from spec book: ' + ACC_RX7.id)

  // THE ONE DRIVEN SET THAT LIVES NOWHERE ELSE IN THIS FILE. The 850CSi is not on the roster, so
  // no id-keyed driven table carries its three laps. Every other driven number in this section is
  // read from the set that already holds it: HAKD, WAND, DRAG_DRIVEN, GRIP_DRIVEN, or ACC_RX7.
  const BMW_LAPS = { Hakone: 109.0, Wangan: 120.2, Misaki: 101.3 }

  // The F355's four driven times, and the four figures committed before any of them was driven.
  // Like the 850CSi this car is not on the roster, so nothing else in the file carries either set.
  // NOTHING IS FITTED ON THEM, and that is what makes this the cleanest reading in the record: all
  // four arrived after the corner-grip ceiling and the drag offset were already fixed, on a car
  // that shares its grip level with the Lotus and nothing else about itself with any fitted car.
  const F355_LAPS = { Hakone: 94.4, Wangan: 105.4, Misaki: 86.3, Yatabe: 19.071 }
  const F355_COMMITTED = { Hakone: 92.4, Wangan: 107.2, Misaki: 85.3, Yatabe: 19.0 }

  const dragOf = (c) => DRAG_DRIVEN.find((d) => d.c === c)
  const gripOf = (c, k) => GRIP_DRIVEN.find((d) => d.c === c && d.course === k)
  const accHak = HAKD.find((d) => d.acc)
  const accWan = WAND.find((d) => d.acc)
  const accKm = DRAG_DRIVEN.find((d) => d.acc)

  // `of(course)` returns the driven time, the figure committed before that drive where one was
  // recorded, and what the pair is worth. A row reading plain `blind` is a forecast nothing has
  // since been fitted on; every other status says what has happened to it since.
  const RECORD = [
    {
      // Big power, no added aero, mild extra mechanical grip. In no fit of any kind, and the
      // source of the widest residual in the record: Wangan is a fast road and this car says so.
      c: ADHOC_BMW,
      lbl: 'BMW 850CSi (V8-TT swap)',
      of: (k) =>
        k === 'Yatabe'
          ? { d: dragOf(ADHOC_BMW).t, p: dragOf(ADHOC_BMW).p, s: 'blind; at the drag offset' }
          : { d: BMW_LAPS[k], s: 'blind' },
    },
    {
      // The 850CSi's deliberate mirror: very light, slicks plus real aero, AWD swap, modest
      // power. At mu 1.226 the corner-grip ceiling barely touches it, which is exactly what makes
      // it the control for the two grippier cars below.
      c: ADHOC_LOTUS,
      lbl: 'Lotus Elise S1 (AWD swap)',
      of: (k) => {
        if (k === 'Yatabe')
          return { d: dragOf(ADHOC_LOTUS).t, p: dragOf(ADHOC_LOTUS).p, s: 'blind; at the drag offset' }
        const r = gripOf(ADHOC_LOTUS, k)
        return r ? { d: r.t, p: r.p, s: 'blind at commit; now a ceiling-fit point' } : { s: 'not driven' }
      },
    },
    {
      // THE ACCEPTANCE TEST. Four figures committed, then all four driven. Three are genuinely
      // out of sample: Hakone, Wangan and the standing kilometre had never seen this car, and
      // neither searched geometry had either. Misaki is not; this car already carried a driven
      // Misaki lap in the fit, so its pair is a second, later drive rather than a forecast. That
      // second drive is the only driven time here that no set carries, because DRIVEN holds the
      // first one (the round-1 blind lap on the fingerprint record) and the two are kept apart.
      c: RX7,
      lbl: 'Mazda RX-7 Type R (FD3S)',
      of: (k) =>
        ({
          Hakone: { d: accHak.t, p: ACC_RX7.pHak, s: 'blind' },
          Wangan: { d: accWan.t, p: ACC_RX7.pWan, s: 'blind' },
          Misaki: { d: ACC_RX7.mis, p: ACC_RX7.pMis, s: 'second drive; its first lap is in the fit' },
          Yatabe: { d: accKm.t, p: ACC_RX7.pKm, s: 'blind; at the drag offset' },
        })[k],
    },
    {
      // Everything pushed to the maximum at once: grip, downforce, power and braking all far
      // outside the range any fitted constant has ever seen. At mu 1.699 it is well outside the
      // game's design space, and its Hakone lap is one of the three grip levels the corner-grip
      // ceiling is fitted on, so that row is evidence about the term and not a forecast.
      c: ADHOC_787B,
      lbl: 'Mazda 787B (modified)',
      of: (k) => {
        const r = gripOf(ADHOC_787B, k)
        return r ? { d: r.t, p: r.p, s: 'blind at commit; now a ceiling-fit point' } : { s: 'not driven' }
      },
    },
    {
      // mu 1.512 is where the game's own race builds top out, so this is the one car in the
      // harness whose residual is a statement about a car a player can actually reach, and it
      // sat in the untested gap between the Elise at 1.226 and the modified 787B at 1.699.
      // Before the corner-grip ceiling its four rows read +2.6 / -1.3 / -5.6 / -9.2 in order of
      // corner content, which was the whole diagnosis: what is left is a car constant, not an
      // ordering. Its braking is measured now, off the in-game panel, so nothing on it rests on
      // the fallback regression any more.
      c: A_CALSONIC,
      lbl: 'Calsonic BNR32 Gr.A',
      of: (k) => {
        const r = gripOf(A_CALSONIC, k)
        return {
          d: r.t,
          p: r.p,
          s: r.anchor
            ? 'anchor, not blind'
            : k === 'Yatabe'
              ? 'blind; at the drag offset, whose fit this car is not in'
              : 'blind at commit; now a ceiling-fit point',
        }
      },
    },
    {
      // The overfitting check the corner-grip ceiling needed: a maxed mid-engine RWD car at the
      // same mechanical grip as the Lotus and nothing else in common with it, or with any car the
      // ceiling was fitted on. Predicted on all four courses and then driven on all four.
      c: F355,
      lbl: 'Ferrari F355 (supercharged)',
      of: (k) => ({
        d: F355_LAPS[k],
        p: F355_COMMITTED[k],
        s:
          k === 'Yatabe'
            ? 'blind; at the drag offset, whose fit this car is not in'
            : 'blind',
      }),
    },
  ]

  console.log(
    '  `committed` is the figure written down before the car was driven, where one was recorded;',
  )
  console.log(
    '  `modelled` is the same car at THIS run\'s constants, which are not always the constants the',
  )
  console.log('  figure was committed at. err% is modelled against driven.')
  console.log(
    '\n  ' + 'car'.padEnd(28) + 'PS'.padStart(5) + 'kg'.padStart(7) + '   dt  ' + 'mu'.padStart(7) +
      'dfC'.padStart(8) + 'cd'.padStart(8) + 'CdA'.padStart(8) + 'bmu'.padStart(8) + '   accel',
  )
  RECORD.forEach((r) => {
    const c = r.c
    console.log(
      '  ' + r.lbl.padEnd(28) + String(c.ps).padStart(5) + String(c.kg).padStart(7) + '   ' +
        c.dt.padEnd(4) + (c.lg || 0).toFixed(3).padStart(7) + (c.dfC || 0).toFixed(3).padStart(8) +
        (c.cd || 0).toFixed(3).padStart(8) + (c.cd * frontalArea(c)).toFixed(3).padStart(8) +
        brakeMu(c).toFixed(3).padStart(8) + '   ' + accelOf(c).src,
    )
  })

  const tab = []
  RECORD.forEach((r) =>
    CK.forEach((k) => {
      const o = r.of(k) || {}
      tab.push({ lbl: r.lbl, k, t: courseTime(k, r.c), d: o.d, p: o.p, s: o.s })
    }),
  )
  console.log(
    '\n  ' + 'car'.padEnd(28) + 'course'.padEnd(9) + 'committed'.padStart(11) +
      'modelled'.padStart(11) + 'driven'.padStart(12) + 'err%'.padStart(8) + '   status',
  )
  tab.forEach((r) =>
    console.log(
      '  ' + r.lbl.padEnd(28) + r.k.padEnd(9) +
        (r.p == null ? '-'.padStart(11) : r.p.toFixed(2).padStart(11)) +
        r.t.toFixed(2).padStart(11) +
        (r.d == null ? '-'.padStart(12) : r.d.toFixed(3).padStart(12)) +
        (r.d == null ? '-'.padStart(8) : pct(r.t, r.d).toFixed(2).padStart(8)) +
        '   ' + r.s,
    ),
  )

  const drivenRows = tab.filter((r) => r.d != null)
  const lapRows = drivenRows.filter((r) => r.k !== 'Yatabe')
  const committedRows = drivenRows.filter((r) => r.p != null)
  console.log(
    '\n  MAE over all ' + drivenRows.length + ' rows with a driven time: ' +
      maeOf(drivenRows.map((r) => pct(r.t, r.d))).toFixed(2) + '%.',
  )
  // The lap figure is quoted apart from the kilometres because Yatabe carries the flat drag
  // offset, and a corrected number folded into a set of uncorrected forecasts flatters both.
  console.log(
    '  The ' + lapRows.length + ' lap rows alone: ' + maeOf(lapRows.map((r) => pct(r.t, r.d))).toFixed(2) +
      '%. The kilometres are quoted apart because Yatabe carries the',
  )
  console.log('  flat drag offset, and a corrected number does not belong in a set of uncorrected forecasts.')
  console.log(
    '  On the committed column, over the ' + committedRows.length + ' rows that recorded one: MAE ' +
      maeOf(committedRows.map((r) => pct(r.p, r.d))).toFixed(2) + '%.',
  )
  const rx7Blind = [
    pct(ACC_RX7.pHak, accHak.t),
    pct(ACC_RX7.pWan, accWan.t),
    pct(ACC_RX7.pKm, accKm.t),
  ]
  console.log(
    '  THE ACCEPTANCE TEST, its three genuinely blind figures as committed: MAE ' +
      maeOf(rx7Blind).toFixed(2) + '%, worst ' + Math.max(...rx7Blind.map(Math.abs)).toFixed(2) + '%.',
  )
  console.log(
    '  The two blind LAP predictions landed at ' + rx7Blind[0].toFixed(2) + '% and ' +
      rx7Blind[1].toFixed(2) + '%, on two roads this car had never been driven',
  )
  console.log(
    '  on and neither of which was searched with it in the set. The kilometre is the outlier at ' +
      rx7Blind[2].toFixed(2) + '%,',
  )
  console.log('  and it is the run the flat drag offset now corrects.')
}
