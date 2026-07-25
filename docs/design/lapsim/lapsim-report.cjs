/* eslint-disable -- prototype calibration harness, not production code: reads the spec book, evals its CARS array, and marches a lap sim; deliberately outside the packages lint standard */
// Full lap-time model report, all cars. Prototype/validation, not game code.
const fs = require('fs')
const path = require('path')
const h = fs.readFileSync(path.join(__dirname, '..', 'car-spec-book.html'), 'utf8')
const m = h.match(/const CARS = \[([\s\S]*?)\n\];/)
eval('global.CARS=[' + m[1] + ']')

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
  const w = tyreW(c),
    cm = eraRubber(c.y) + tierDelta(compoundOf(c))
  const we = Math.max(0.4, Math.min(1, (cm - 0.7) / 0.3))
  const wa = Math.max(-0.03, Math.min(0.045, (w - 200) / 1100)) * we
  const mu = cm + wa
  const cr = (c.com || 460) / trackOf(c)
  const tr = Math.max(0.8, Math.min(1, 1 - 0.75 * (cr - 0.27)))
  let L = 1
  const act = /RB26DETT|VR38DETT/.test(c.ec) || c.n.indexOf('Lancer') >= 0
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
// real published width x height (mm) for the 26 playable cars (two research passes)
const DIMS = {
  'Honda City E (AA)': [1570, 1470],
  'Suzuki Wagon R (CT21S)': [1395, 1680],
  'Honda Civic SiR-II (EG6)': [1695, 1350],
  'Toyota Sprinter Trueno (AE86)': [1625, 1335],
  'Nissan 180SX (RPS13)': [1690, 1290],
  'Toyota Chaser Tourer V (JZX90)': [1750, 1390],
  "Nissan Silvia K's (S14)": [1730, 1295],
  'Mazda Savanna RX-7 (FC3S)': [1690, 1265],
  'Mazda RX-7 (FD3S)': [1780, 1230],
  'Toyota Supra RZ (JZA80)': [1810, 1275],
  'Toyota Carina (AT150)': [1670, 1365],
  'Nissan Sunny (B12)': [1640, 1379],
  'Suzuki Alto Works (HA21S)': [1395, 1380],
  'Honda Beat (PP1)': [1395, 1175],
  'Honda CR-X SiR (EF8)': [1675, 1270],
  'Honda City Turbo II (AA)': [1625, 1470],
  'Toyota Sera (EXY10)': [1650, 1265],
  'Honda Prelude Si VTEC (BB4)': [1765, 1290],
  'Nissan Silvia (S13)': [1690, 1290],
  'Toyota MR2 GT-S (SW20)': [1695, 1240],
  'Nissan Cefiro (A31)': [1695, 1375],
  'Subaru Impreza WRX STI (GC8)': [1690, 1390],
  'Nissan Skyline GT-R (BNR32)': [1755, 1340],
  'Nissan Fairlady Z (Z32)': [1800, 1255],
  'Toyota Aristo 3.0V (JZS147)': [1795, 1420],
  'Toyota MR2 (AW11)': [1665, 1250],
  'Porsche 911 Turbo (930)': [1775, 1310],
  'Honda Civic Type R (EK9)': [1695, 1360],
  'Honda Integra Type R (DC2)': [1695, 1330],
  'Toyota Starlet Glanza V (EP91)': [1625, 1400],
  'Nissan Laurel (C33)': [1700, 1370],
  'Toyota Chaser Tourer V (JZX100)': [1755, 1400],
  'Nissan S-Cargo (FHK11)': [1595, 1839],
  'Subaru Alcyone SVX (CXD)': [1770, 1310],
  'Mitsubishi GTO Twin Turbo (Z16A)': [1840, 1285],
  'Mitsubishi Starion (A187A)': [1745, 1275],
  'Toyota Soarer (JZZ30)': [1790, 1340],
  'Nissan Fairlady 240ZG (HS30)': [1690, 1285],
  'Datsun 510 / Bluebird (PL510)': [1560, 1405],
  'Nissan Skyline 2000GT-X Kenmeri (KGC110)': [1595, 1375],
  'Mazda Cosmo Sport 110S (L10A)': [1595, 1165],
  'Mercedes 190E 2.5-16 Evo II (W201)': [1720, 1342],
  'BMW M3 (E30)': [1680, 1370],
  'Lancia Delta HF Integrale Evo': [1770, 1365],
  'Alfa Romeo 75 3.0 V6': [1631, 1349],
  'Ferrari Testarossa (F113)': [1976, 1130],
  'Lamborghini Countach LP5000 QV': [2000, 1070],
  'Rover Mini Cooper 1.3i': [1440, 1340],
  'Ferrari F355 Berlinetta (F129)': [1900, 1170],
  'BMW M3 (E36)': [1710, 1335],
  'Ford Escort RS Cosworth': [1738, 1405],
  'VW Golf GTI Mk2 16V': [1680, 1400],
  'Eunos Cosmo (JC)': [1795, 1305],
  'Toyota Celica GT-Four (ST205)': [1750, 1305],
  'Nissan Pulsar GTI-R (RNN14)': [1690, 1410],
  'Mazda Familia GT-R (BG8Z)': [1690, 1390],
  'Nissan 350Z (Z33)': [1815, 1315],
  'Mazda RX-8 (SE3P)': [1770, 1340],
  'Mitsubishi Lancer Evo VIII MR (CT9A)': [1770, 1450],
  'Honda Integra Type R (DC5)': [1725, 1385],
  'Daihatsu Copen (L880K)': [1475, 1245],
  'Nissan GT-R (R35)': [1895, 1370],
  'Lexus LFA': [1895, 1220],
  'Nissan Skyline GT-R V-Spec II (BNR34)': [1785, 1360],
  'Honda NSX-R (NA1)': [1810, 1170],
  'Nissan Skyline GT-R Hakosuka (KPGC10)': [1665, 1370],
  'Nissan Fairlady Z432 (PS30)': [1630, 1290],
  'Subaru Impreza 22B STi': [1770, 1390],
  'Mitsubishi Lancer Evo VI Tommi Makinen (CP9A)': [1770, 1405],
  'Toyota 2000GT (MF10)': [1600, 1160],
  'Mazda Autozam AZ-1 (PG6SA)': [1395, 1150],
  'Mazda RX-7 Spirit R (FD3S)': [1760, 1230],
  'Nissan Silvia Spec-R (S15)': [1695, 1285],
  'Autech Stagea 260RS (WGNC34)': [1755, 1510],
  'Toyota Altezza RS200 Z Edition (SXE10)': [1720, 1410],
  'Honda S2000 (AP1)': [1750, 1285],
  'Daihatsu Mira TR-XX (L70)': [1395, 1400],
  'Honda Today (JW1)': [1395, 1315],
  'Subaru Vivio RX-R (KK4)': [1395, 1375],
  'Daihatsu Mira TR-XX Avanzato R (L502S)': [1395, 1430],
  'Honda Acty (HA4)': [1395, 1745],
  'Suzuki Cappuccino (EA11R)': [1395, 1185],
  'Eunos Roadster (NA6CE)': [1675, 1235],
  'Nissan Skyline GT-R (BCNR33)': [1780, 1360],
  'Subaru Impreza WRX STI (GDB)': [1730, 1425],
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
  const d = DIMS[c.n]
  return d ? 0.82 * (d[0] / 1000) * (d[1] / 1000) : secA[c.sec] || 1.85
}
// launch-traction cap scales with the tyre's mu (a_capK * mu), not a fixed g: street rubber
// (mu ~0.88) caps ~0.62 g as before; a slick build (mu ~1.5) launches past 1 g, per the Calsonic
// telemetry (0-97 km/h in 2.5 s = 1.10 g average).
const aCapK = 0.7
function carBlock(c) {
  const m = c.kg + 75,
    Pw = c.ps * PS * eta,
    mu = gripMu(c)
  const bL = 1 - (c.fr != null ? c.fr : 55) / 100,
    cL = (c.fr != null ? c.fr : 55) / 100,
    hL = (c.com || 460) / (c.wb || 2500)
  const aCap = aCapK * mu
  let ag
  if (c.dt === 'AWD') ag = mu * 0.66
  else if (c.dt === 'RWD') ag = Math.min((mu * bL) / (1 - Math.min(0.9, mu * hL)), aCap)
  else ag = Math.min((mu * cL) / (1 + mu * hL), aCap)
  const aGrip = Math.min(mu, ag) * g
  const CdA = c.cd * frontalArea(c)
  return { m, Pw, mu, aGrip, CdA, dF: deliveryFactor(c) }
}
function straightTime(b, v_in, v_out, L) {
  let v = Math.max(v_in, 3),
    x = 0,
    t = 0
  const dv = 0.5,
    aBrake = b.mu * g,
    vFull = 33,
    fro = froll * b.m * g
  for (let i = 0; i < 100000; i++) {
    const dBrake = v > v_out ? (v * v - v_out * v_out) / (2 * aBrake) : 0
    if (x + dBrake >= L) {
      if (v > v_out) t += (v - v_out) / aBrake
      break
    }
    const aPow = b.Pw / (b.m * v),
      dRamp = b.dF + (1 - b.dF) * Math.min(1, v / vFull),
      aEng = Math.min(aPow, b.aGrip) * dRamp,
      aRes = (0.5 * rho * b.CdA * v * v + fro) / b.m,
      a = aEng - aRes
    if (a <= 0.12) {
      const cruise = L - x - dBrake
      if (cruise > 0) {
        t += cruise / v
        x += cruise
      }
      if (v > v_out) t += (v - v_out) / aBrake
      break
    }
    const dt = dv / a
    x += v * dt
    t += dt
    v += dv
  }
  return t
}
// note: cruise threshold raised to 0.12 m/s^2 so a car coasts at terminal speed
// instead of the step integrator dividing by near-zero acceleration near vmax
const COURSES = {
  Touge: [
    [15, 180, 60],
    [40, 90, 80],
    [18, 160, 50],
    [60, 70, 120],
    [25, 140, 70],
    [90, 55, 150],
    [16, 175, 55],
    [50, 80, 100],
    [22, 150, 60],
    [70, 65, 130],
    [14, 180, 50],
    [45, 85, 90],
    [30, 120, 75],
    [110, 50, 180],
    [20, 165, 60],
    [55, 75, 110],
    [17, 170, 55],
    [80, 60, 140],
    [19, 170, 55],
    [65, 70, 120],
    [24, 145, 65],
    [95, 55, 160],
    [15, 180, 50],
    [48, 80, 95],
    [28, 130, 70],
    [120, 45, 190],
  ],
  Mountain: [
    [60, 80, 200],
    [140, 60, 280],
    [22, 150, 150],
    [50, 90, 180],
    [120, 70, 250],
    [300, 40, 400],
    [55, 85, 160],
    [150, 55, 300],
    [20, 140, 120],
    [130, 60, 220],
  ],
  Wangan: [
    [400, 30, 1800],
    [150, 55, 700],
    [90, 70, 500],
    [350, 35, 1500],
    [30, 120, 350],
    [120, 60, 600],
    [250, 40, 1200],
    [45, 100, 400],
    [180, 45, 900],
  ],
  Circuit: [
    [55, 90, 200],
    [130, 70, 250],
    [20, 150, 140],
    [300, 40, 380],
    [50, 85, 180],
    [140, 60, 240],
    [280, 45, 320],
    [60, 80, 160],
  ],
}
function vTopOf(b, c) {
  let vt = 20
  for (let v = 20; v < 150; v += 0.5) {
    const aRes = (0.5 * rho * b.CdA * v * v + froll * b.m * g) / b.m
    if (b.Pw / (b.m * v) - aRes <= 0) {
      vt = v
      break
    }
    vt = v
  }
  if (c && c.top) vt = Math.min(vt, c.top / 3.6)
  return vt
}
function lap(c, segs) {
  const b = carBlock(c),
    vTop = vTopOf(b, c),
    n = segs.length,
    apex = segs.map((s) => Math.min(Math.sqrt(b.mu * g * s[0]), vTop))
  let t = 0
  const kAgi = 0.5
  for (let i = 0; i < n; i++) {
    t += (segs[i][0] * (segs[i][1] * Math.PI)) / 180 / apex[i]
    const tight = (segs[i][1] / 90) * Math.max(0.4, Math.min(2.5, 80 / segs[i][0]))
    t += ((kAgi * (b.m / 1200)) / b.mu) * tight
    t += straightTime(b, Math.min(apex[i], vTop), Math.min(apex[(i + 1) % n], vTop), segs[i][2])
  }
  return t
}
function zeroTo100(c) {
  const b = carBlock(c),
    target = 100 / 3.6
  let v = 0.5,
    t = 0
  const dv = 0.1,
    fro = froll * b.m * g
  while (v < target) {
    const aPow = b.Pw / (b.m * v),
      aEng = Math.min(aPow, b.aGrip),
      aRes = (0.5 * rho * b.CdA * v * v + fro) / b.m,
      a = aEng - aRes
    if (a <= 0) break
    t += dv / a
    v += dv
  }
  return t
}

// ---- track info ----
const cls = (r) => (r < 30 ? 'hairpin' : r < 90 ? 'slow' : r < 220 ? 'medium' : 'fast')
function trackInfo(name, segs) {
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
  ' - straights: accelerate under wheel power (the lesser of power-limited and the drivetrain',
)
console.log('   traction limit), aero drag = Cd x frontal area (0.82 x width x height), top speed')
console.log('   capped at the published figure, then grip-limited braking into the next corner')
console.log(' - torque delivery shapes corner-exit pull; a transition/agility term costs heavy,')
console.log('   low-grip cars time in tight corners. 0-100 validated against published figures.')
console.log(
  ' - PROTOTYPE: drivetrain-launch and agility constants are first-pass; frontal areas are',
)
console.log('   REAL (0.82 x width x height) for all 85 cars from published dimensions.')
console.log('')
console.log('## The four courses')
;['Touge', 'Mountain', 'Wangan', 'Circuit'].forEach((k) => {
  const t = trackInfo(k, COURSES[k])
  const mix = Object.entries(t.mix)
    .map(([a, b]) => b + ' ' + a)
    .join(', ')
  console.log(
    `- ${t.name}: ${(t.len / 1000).toFixed(1)} km, ${t.corners} corners (${mix}), ${t.straightPct}% straight, avg radius ${t.avgR} m, longest straight ${t.longest} m`,
  )
})
console.log('  Touge = tight downhill pass (short straights, hairpins) -> grip + agility.')
console.log('  Mountain = longer pass with variety -> balance.')
console.log('  Wangan = bayshore expressway (long straights, fast sweepers) -> power + low drag.')
console.log('  Circuit = club track, mixed -> all-round.')

const rows = CARS.map((c) => {
  const b = carBlock(c)
  const tt = {}
  for (const k of Object.keys(COURSES)) tt[k] = lap(c, COURSES[k])
  return {
    c,
    mu: gripMu(c),
    disp: dispGrip(gripMu(c)),
    z: zeroTo100(c),
    vtop: Math.round(vTopOf(b, c) * 3.6),
    tt,
  }
})
// overall = mean of (lap / best-on-course)
const best = {}
for (const k of Object.keys(COURSES)) best[k] = Math.min(...rows.map((r) => r.tt[k]))
rows.forEach((r) => {
  r.overall = Object.keys(COURSES).reduce((a, k) => a + r.tt[k] / best[k], 0) / 4
})
// specialty = course where car's normalized time is lowest (relatively best)
rows.forEach((r) => {
  let bk = '',
    bv = 9
  for (const k of Object.keys(COURSES)) {
    const nv = r.tt[k] / best[k]
    if (nv < bv) {
      bv = nv
      bk = k
    }
  }
  r.spec = bk
})
rows.sort((a, b) => a.overall - b.overall)

console.log('\n## Ranked by overall pace across all four courses')
console.log(
  'rank ovr   PS   kg  PS/t mu   grip dt  delivery  0-100 top  touge  mtn   wang  circ  best   car',
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
      r.z.toFixed(1).padStart(5) +
      ' ' +
      String(r.vtop).padStart(4) +
      ' ' +
      r.tt.Touge.toFixed(1).padStart(5) +
      ' ' +
      r.tt.Mountain.toFixed(1).padStart(5) +
      ' ' +
      r.tt.Wangan.toFixed(1).padStart(5) +
      ' ' +
      r.tt.Circuit.toFixed(1).padStart(5) +
      ' ' +
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

// ---- JSON export for the visual artifact ----
const CK = ['Touge', 'Mountain', 'Wangan', 'Circuit']
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
  cars: rows.map((r) => ({
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
    t: {
      Touge: +r.tt.Touge.toFixed(1),
      Mountain: +r.tt.Mountain.toFixed(1),
      Wangan: +r.tt.Wangan.toFixed(1),
      Circuit: +r.tt.Circuit.toFixed(1),
    },
    overall: +r.overall.toFixed(3),
    rank: r._rk,
  })),
}
fs.writeFileSync(path.join(__dirname, 'lapsim-data.json'), JSON.stringify(data))
console.error('wrote lapsim-data.json (' + data.cars.length + ' cars)')

// ---- Legend Island calibration (Forza Horizon 6 gold standard, ~4.715 km) ----
// first-cut geometry traced from the top-view: fast W-coast run, S-point hairpin, centre
// lollipop, fast right sweepers, long main straight. [radius m, angle deg, following straight m]
const LEGEND = [
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
]
const legLen = LEGEND.reduce((a, s) => a + (s[0] * s[1] * Math.PI) / 180 + s[2], 0)
const FORZA = {
  'Lexus LFA': 92.6,
  'Ferrari F355 Berlinetta (F129)': 101.3,
  'Honda NSX-R (NA1)': 102.9,
  'Mitsubishi Lancer Evo VI Tommi Makinen (CP9A)': 103.2,
  'BMW M3 (E30)': 112.1,
  'Toyota Altezza RS200 Z Edition (SXE10)': 113.1,
  'Toyota 2000GT (MF10)': 123.4,
  'Honda Beat (PP1)': 129.8,
  'Honda Acty (HA4)': 171.9,
}
const cmp = Object.keys(FORZA)
  .map((nm) => {
    const c = CARS.find((x) => x.n === nm)
    return c ? { nm, t: lap(c, LEGEND), f: FORZA[nm] } : null
  })
  .filter(Boolean)
console.error(
  '\n# Legend Island calibration (course length ' +
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
    n: 'Honda Integra Type R (DC2)',
    as: 'Integra Type R (DC2, US 2001)',
    ps: 198,
    tq: 176,
    kg: 1197,
    fr: 62,
  },
  { n: 'Mazda RX-7 (FD3S)', as: 'RX-7 Type R (FD3S, 1992)', ps: 256, tq: 294, kg: 1260, fr: 50 },
  {
    n: 'Nissan Skyline GT-R (BNR32)',
    as: 'Skyline GT-R (BNR32, 1992)',
    ps: 280,
    tq: 353,
    kg: 1480,
    fr: 59,
  },
]
console.error('\n# Blind predictions, Misaki International Raceway')
console.error('car                                     PS    kg   mu  0-100  top   PREDICTED')
PREDICT.forEach((p) => {
  const base = CARS.find((c) => c.n === p.n)
  if (!base) return console.error('  MISSING FROM SPEC BOOK: ' + p.n)
  const c = { ...base }
  if (p.ps != null) c.ps = p.ps
  if (p.tq != null) c.tq = p.tq
  if (p.kg != null) c.kg = p.kg
  if (p.fr != null) c.fr = p.fr
  const b = carBlock(c)
  console.error(
    (p.as || c.n).padEnd(38) +
      String(c.ps).padStart(4) +
      String(c.kg).padStart(6) +
      gripMu(c).toFixed(2).padStart(5) +
      zeroTo100(c).toFixed(1).padStart(6) +
      String(Math.round(vTopOf(b, c) * 3.6)).padStart(5) +
      lap(c, LEGEND).toFixed(1).padStart(11),
  )
})
