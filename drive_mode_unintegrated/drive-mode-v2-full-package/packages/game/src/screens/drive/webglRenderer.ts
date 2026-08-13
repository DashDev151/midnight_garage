/**
 * The pixel-art WebGL renderer: the artifact's pipeline as a module.
 * Flat-shaded low-poly triangles, one directional light, depth fog into
 * a violet night, rendered into a 300 px tall NEAREST framebuffer and
 * upscaled for chunky pixels, with posterised colour and a light
 * interleaved-gradient dither.
 *
 * Deliberately dependency-free: raw WebGL 1, one interleaved vertex
 * format (position 3, normal 3, colour 3). Meshes are plain
 * Float32Arrays built by the push helpers; the road world arrives as
 * one VBO per generated chunk so chunks can be freed as they fall
 * behind the car.
 *
 * Excluded from unit coverage: everything here needs a GPU. The
 * geometry it draws is exercised in roadGen tests, and the repo's
 * tools/drive-preview rasteriser renders these exact meshes to PNG for
 * visual QA without a GPU.
 */
import type { DriveParams } from '@midnight-garage/sim'
import type { Zone, Road, RoadSample } from './roadGen'
import { CHUNK_SAMPLES, ROAD_HALF_WIDTH_M, SAMPLE_SPACING_M, ZONE_LENGTH_M, hash01 } from './roadGen'

export interface CarPose {
  xM: number
  yM: number
  zM: number
  headingRad: number
  pitchRad: number
  rollRad: number
  steerRad: number
  sliding: boolean
}

export interface SkidMark {
  xM: number
  yM: number
  zM: number
}

const DITHER_GLSL = `float ign(vec2 p){return fract(52.9829189*fract(0.06711056*p.x+0.00583715*p.y));}
vec3 pixelate(vec3 c,vec2 fc){float d=ign(floor(fc));return floor(c*18.0+vec3(d-0.5)*0.06)/18.0;}`

const SCENE_VS = `attribute vec3 aPos;attribute vec3 aNrm;attribute vec3 aCol;
uniform mat4 uVP;uniform mat4 uModel;uniform float uSlide;
varying vec3 vAlb;varying vec3 vNrm;varying vec3 vWorld;varying float vDep;varying float vEm;
void main(){
  vec4 wp=uModel*vec4(aPos,1.0);
  gl_Position=uVP*wp;
  vDep=gl_Position.w;
  vWorld=wp.xyz;
  vEm=step(dot(aNrm,aNrm),0.1);
  vNrm=mat3(uModel[0].xyz,uModel[1].xyz,uModel[2].xyz)*aNrm;
  vAlb=mix(aCol,vec3(1.0,0.54,0.24),uSlide*0.45);
}`

const SCENE_FS = `precision mediump float;
varying vec3 vAlb;varying vec3 vNrm;varying vec3 vWorld;varying float vDep;varying float vEm;
uniform vec3 uFog;
uniform vec4 uLp[10];uniform vec3 uLc[10];
uniform vec3 uHp;uniform vec3 uHd;uniform float uFogN;
uniform float uAmb;uniform float uEmi;uniform float uWet;uniform float uCamZ;
${DITHER_GLSL}
void main(){
  vec3 n=vEm>0.5?vec3(0.0,0.0,1.0):normalize(vNrm);
  vec3 L=normalize(vec3(-0.35,0.45,0.82));
  vec3 c=vAlb*(0.62+0.45*max(dot(n,L),0.0))*uAmb;
  for(int j=0;j<10;j++){
    float rad=uLp[j].w;
    if(rad>0.5){
      vec3 dv=uLp[j].xyz-vWorld;
      float dist=length(dv);
      float att=max(0.0,1.0-dist/rad);
      float lam=max(dot(n,dv/max(dist,0.01)),0.0)*0.5+0.5;
      c+=vAlb*uLc[j]*att*att*lam;
    }
  }
  vec3 hv=vWorld-uHp;
  float hd=length(hv);
  vec3 hn=hv/max(hd,0.01);
  float cone=smoothstep(0.83,0.955,max(dot(hn,uHd),0.0));
  float hatt=max(0.0,1.0-hd/34.0);
  c+=vAlb*vec3(1.0,0.93,0.72)*cone*hatt*hatt*1.6*max(dot(n,-hn)*0.5+0.5,0.2);
  c=mix(c,vAlb*uEmi,vEm);
  c=mix(c,c*vec3(0.48,0.56,0.76),uWet*(1.0-vEm)*0.62);
  c*=1.0+uWet*vEm*0.6;
  float hf=exp(-max(0.0,vWorld.z-uCamZ+2.0)*0.045);
  float f=(1.0-exp(-max(0.0,vDep-uFogN*0.55)*(1.35/uFogN)))*mix(0.55,1.0,hf);
  f=min(f,0.88);
  gl_FragColor=vec4(pixelate(mix(c,uFog,f),gl_FragCoord.xy),1.0);
}`

const SKY_VS = `attribute vec2 aP;varying vec2 vUV;
void main(){vUV=aP*0.5+0.5;gl_Position=vec4(aP,0.999,1.0);}`

const SKY_FS = `precision mediump float;varying vec2 vUV;
uniform vec3 uSkyT;uniform vec3 uSkyM;uniform vec3 uSkyL;
${DITHER_GLSL}
void main(){
  vec3 c=vUV.y>0.45?mix(uSkyM,uSkyT,(vUV.y-0.45)/0.55):mix(uSkyL,uSkyM,vUV.y/0.45);
  gl_FragColor=vec4(pixelate(c,gl_FragCoord.xy),1.0);
}`

const POST_VS = `attribute vec2 aP;varying vec2 vUV;
void main(){vUV=aP*0.5+0.5;gl_Position=vec4(aP,0.0,1.0);}`

const POST_FS = `precision mediump float;varying vec2 vUV;uniform sampler2D uTex;uniform float uSpd;
void main(){
  vec3 c=texture2D(uTex,vUV).rgb;
  vec2 d=vUV-vec2(0.5);
  float edge=smoothstep(0.28,0.62,length(d));
  if(uSpd*edge>0.001){
    vec3 s1=texture2D(uTex,vUV-d*0.012).rgb;
    vec3 s2=texture2D(uTex,vUV-d*0.026).rgb;
    c=mix(c,(c+s1+s2)/3.0,min(0.24,uSpd*edge*0.24));
  }
  gl_FragColor=vec4(c,1.0);
}`

/* ---- Matrices (column-major, WebGL convention) ---- */
export function m4Perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0])
}

export function m4LookAt(
  ex: number, ey: number, ez: number,
  cx: number, cy: number, cz: number,
): Float32Array {
  let zx = ex - cx
  let zy = ey - cy
  let zz = ez - cz
  const zl = Math.hypot(zx, zy, zz)
  zx /= zl; zy /= zl; zz /= zl
  let xx = 1 * zz - 0 * zy
  let xy = 0 * zx - 0 * zz
  let xz = 0 * zy - 1 * zx
  xx = 0 * zz - 1 * zy
  xy = 1 * zx - 0 * zz
  xz = 0 * zy - 0 * zx
  const xl = Math.hypot(xx, xy, xz)
  xx /= xl; xy /= xl; xz /= xl
  const yx = zy * xz - zz * xy
  const yy = zz * xx - zx * xz
  const yz = zx * xy - zy * xx
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1,
  ])
}

export function m4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!
    }
  }
  return o
}

/** Yaw about world z, then nose-up pitch about the local y axis. */
export function m4ModelYPR(x: number, y: number, z: number, yaw: number, pitchUp: number, roll: number): Float32Array {
  const ch = Math.cos(yaw)
  const sh = Math.sin(yaw)
  const cp = Math.cos(pitchUp)
  const sp = Math.sin(pitchUp)
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  const f = [ch * cp, sh * cp, sp]
  const l = [-sh, ch, 0]
  const u = [-ch * sp, -sh * sp, cp]
  return new Float32Array([
    f[0]!, f[1]!, f[2]!, 0,
    l[0]! * cr + u[0]! * sr, l[1]! * cr + u[1]! * sr, l[2]! * cr + u[2]! * sr, 0,
    -l[0]! * sr + u[0]! * cr, -l[1]! * sr + u[1]! * cr, -l[2]! * sr + u[2]! * cr, 0,
    x, y, z, 1,
  ])
}

export function m4ModelYP(x: number, y: number, z: number, yaw: number, pitchUp: number): Float32Array {
  const ch = Math.cos(yaw)
  const sh = Math.sin(yaw)
  const cp = Math.cos(pitchUp)
  const sp = Math.sin(pitchUp)
  return new Float32Array([ch * cp, sh * cp, sp, 0, -sh, ch, 0, 0, -ch * sp, -sh * sp, cp, 0, x, y, z, 1])
}

const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/* ---- Mesh building ---- */
type V3 = readonly [number, number, number]

export function pushQuad(arr: number[], p1: V3, p2: V3, p3: V3, p4: V3, col: V3): void {
  const ux = p2[0] - p1[0]
  const uy = p2[1] - p1[1]
  const uz = p2[2] - p1[2]
  const vx = p4[0] - p1[0]
  const vy = p4[1] - p1[1]
  const vz = p4[2] - p1[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const nl = Math.hypot(nx, ny, nz) || 1
  nx /= nl; ny /= nl; nz /= nl
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz }
  for (const p of [p1, p2, p3, p1, p3, p4]) arr.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2])
}

export function pushWall(arr: number[], p1: V3, p2: V3, p3: V3, p4: V3, col: V3): void {
  const ux = p2[0] - p1[0]
  const uy = p2[1] - p1[1]
  const uz = p2[2] - p1[2]
  const vx = p4[0] - p1[0]
  const vy = p4[1] - p1[1]
  const vz = p4[2] - p1[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const nl = Math.hypot(nx, ny, nz) || 1
  nx /= nl; ny /= nl; nz /= nl
  for (const p of [p1, p2, p3, p1, p3, p4]) arr.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2])
}

/** Zero-length normal marks the surface EMISSIVE for the scene shader:
 * lit at full albedo, still fogged. Lamp heads, reflectors, car lamps. */
export function pushEmissive(arr: number[], p1: V3, p2: V3, p3: V3, p4: V3, col: V3): void {
  for (const p of [p1, p2, p3, p1, p3, p4]) arr.push(p[0], p[1], p[2], 0, 0, 0, col[0], col[1], col[2])
}

const C = {
  roadA: [0.153, 0.161, 0.196] as V3,
  roadB: [0.165, 0.173, 0.208] as V3,
  verge: [0.086, 0.128, 0.096] as V3,
  hill: [0.075, 0.114, 0.088] as V3,
  valley: [0.055, 0.088, 0.07] as V3,
  edge: [0.72, 0.72, 0.78] as V3,
  edgeHalo: [0.3, 0.31, 0.36] as V3,
  dash: [0.32, 0.32, 0.38] as V3,
  post: [0.486, 0.518, 0.58] as V3,
  postTop: [1.0, 0.72, 0.3] as V3,
  trunk: [0.16, 0.12, 0.1] as V3,
  leafA: [0.1, 0.22, 0.16] as V3,
  leafB: [0.13, 0.19, 0.24] as V3,
  glass: [0.05, 0.07, 0.11] as V3,
  tail: [0.95, 0.12, 0.2] as V3,
  head: [1.0, 0.95, 0.78] as V3,
  wheel: [0.04, 0.04, 0.06] as V3,
  skid: [0.045, 0.05, 0.06] as V3,
  pole: [0.3, 0.32, 0.4] as V3,
  sodium: [1.0, 0.62, 0.22] as V3,
  wall: [0.155, 0.145, 0.19] as V3,
  roof: [0.115, 0.105, 0.145] as V3,
  window: [1.0, 0.8, 0.45] as V3,
  sand: [0.3, 0.26, 0.21] as V3,
  bank: [0.17, 0.16, 0.14] as V3,
  water: [0.045, 0.075, 0.135] as V3,
  glint: [0.42, 0.5, 0.68] as V3,
  rock: [0.29, 0.29, 0.335] as V3,
  cliff: [0.185, 0.175, 0.225] as V3,
  ridge: [0.105, 0.1, 0.155] as V3,
  ridge2: [0.085, 0.082, 0.13] as V3,
}


function pushTree(a: number[], x: number, y: number, z: number, r: number, leaf: V3, jit = 0.5): void {
  // Per-tree hue jitter so a forest is a crowd, not a stamp.
  leaf = [Math.max(0, leaf[0]! * (0.8 + jit * 0.45)), Math.max(0, leaf[1]! * (0.84 + jit * 0.36)), Math.max(0, leaf[2]! * (0.8 + jit * 0.45))] as V3
  pushWall(a, [x - 0.14, y, z], [x + 0.14, y, z], [x + 0.14, y, z + r * 0.55], [x - 0.14, y, z + r * 0.55], C.trunk)
  pushWall(a, [x, y - 0.14, z], [x, y + 0.14, z], [x, y + 0.14, z + r * 0.55], [x, y - 0.14, z + r * 0.55], C.trunk)
  // Two canopy tiers, the lower one darker: reads as a pine at any
  // distance instead of a lone triangle.
  const leaf2: V3 = [leaf[0] * 0.8, leaf[1] * 0.82, leaf[2] * 0.8]
  const b1 = z + r * 0.42
  const t1 = z + r * 1.2
  const b2 = z + r * 0.95
  const t2 = z + r * 1.95
  pushWall(a, [x - r * 0.82, y, b1], [x + r * 0.82, y, b1], [x + r * 0.28, y, t1], [x - r * 0.28, y, t1], leaf2)
  pushWall(a, [x, y - r * 0.82, b1], [x, y + r * 0.82, b1], [x, y + r * 0.28, t1], [x, y - r * 0.28, t1], leaf2)
  pushWall(a, [x - r * 0.55, y, b2], [x + r * 0.55, y, b2], [x, y, t2], [x, y, t2], leaf)
  pushWall(a, [x, y - r * 0.55, b2], [x, y + r * 0.55, b2], [x, y, t2], [x, y, t2], leaf)
}

/** One chunk's world geometry plus its lamp registry: road, terrain
 * skirts, coplanar edge lines, posts, dashes, trees and sodium lamps in
 * lit zones. Pure; also consumed by the offline preview tool. */
export interface ChunkGeometry {
  mesh: Float32Array
  lights: SkidMark[]
}

/* Rest stops: every so often, somewhere to pull over. A petrol
 * canopy, a kiosk with a lit shopfront, parking bays, sometimes a
 * parked car, always the view. Deterministic per cell; on coasts the
 * stop always takes the land side. */
export function restStopAt(road: Road, s: number): { c: number; side: number; kind: number } | null {
  const cell = Math.floor(s / 1900)
  if (hash01(road.seed ^ 0x9c31, cell) >= 0.3) return null
  const c = cell * 1900 + 480 + hash01(road.seed ^ 0x77, cell) * 820
  if (Math.abs(s - c) > 26) return null
  const zn = road.zoneAt(c)
  let side = hash01(road.seed ^ 0x513, cell) > 0.5 ? 1 : -1
  if (zn.kind === 3) side = -zn.waterSide
  // Three layouts: 0 = full station, 1 = lookout (bays and a low
  // wall, somewhere to stand), 2 = konbini-forward (big lit shop).
  const kind = Math.floor(hash01(road.seed ^ 0x6e5, cell) * 3)
  return { c, side, kind }
}

function stationSample(road: Road, stn: number): { x: number; y: number; z: number; h: number } {
  const sm = road.samples
  const first = sm[0]!
  const last = sm[sm.length - 1]!
  if (stn <= first.stationM) return { x: first.xM, y: first.yM, z: first.zM, h: first.headingRad }
  if (stn >= last.stationM) return { x: last.xM, y: last.yM, z: last.zM, h: last.headingRad }
  let lo = 0
  let hi = sm.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (sm[mid]!.stationM <= stn) lo = mid
    else hi = mid
  }
  const a = sm[lo]!
  const b = sm[hi]!
  const t = (stn - a.stationM) / Math.max(0.01, b.stationM - a.stationM)
  return { x: a.xM + (b.xM - a.xM) * t, y: a.yM + (b.yM - a.yM) * t, z: a.zM + (b.zM - a.zM) * t, h: a.headingRad + (b.headingRad - a.headingRad) * t }
}

/** Rest-stop bloom, VARIANT-AWARE: glow belongs only to structures
 * that exist. Full stations bloom canopy + sign + vending; konbini
 * stops bloom sign + vending; lookouts stay dark and quiet - that is
 * their whole point. One implementation for every host. */
export function restStopAccents(road: Road, playerStationM: number): { x: number; y: number; z: number; r: number; col: readonly number[] }[] {
  const out: { x: number; y: number; z: number; r: number; col: readonly number[] }[] = []
  const c0 = Math.floor(playerStationM / 1900)
  for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
    const rs = restStopAt(road, cc * 1900 + 480 + hash01(road.seed ^ 0x77, cc) * 820)
    if (!rs) continue
    if (Math.abs(rs.c - playerStationM) > 340) continue
    if (rs.c < road.samples[0]!.stationM + 4 || rs.c > road.samples[road.samples.length - 1]!.stationM - 4) continue
    if (rs.kind === 1) continue
    const ls = stationSample(road, rs.c)
    const nx = -Math.sin(ls.h)
    const ny = Math.cos(ls.h)
    const tx = Math.cos(ls.h)
    const ty = Math.sin(ls.h)
    const at = (lat: number, along: number, z2: number): [number, number, number] => [ls.x + nx * lat * rs.side + tx * along, ls.y + ny * lat * rs.side + ty * along, ls.z + z2]
    if (rs.kind === 0) {
      const cp = at(12.4, -4.2, 2.6)
      out.push({ x: cp[0], y: cp[1], z: cp[2], r: 5.2, col: [0.42, 0.38, 0.22] })
    }
    const sg = at(8.2, -12.5, 4.7)
    out.push({ x: sg[0], y: sg[1], z: sg[2], r: 2, col: [0.5, 0.08, 0.05] })
    const vd = at(11.3, 3.3, 1.2)
    out.push({ x: vd[0], y: vd[1], z: vd[2], r: 1.5, col: [0.12, 0.2, 0.34] })
  }
  return out
}

export function buildChunkMesh(road: Road, startIdx: number): ChunkGeometry {
  const a: number[] = []
  const lights: SkidMark[] = []
  const s = road.samples
  const hw = ROAD_HALF_WIDTH_M
  const end = Math.min(s.length - 1, startIdx + CHUNK_SAMPLES)
  // Band edge heights are per SAMPLE (global index), never per segment,
  // so adjacent segments share corners exactly: no tears, no streaks.
  // Strictly relative and descending: skirts always sit BELOW their own
  // road, so no stretch's terrain can rise over another stretch.
  const bh = (gi: number, sd: number, z: number): number =>
    z - 2.2 - hash01(road.seed, gi * 7 + sd) * 1.8
  // Signed cross-slope height at a lateral distance: zero across the
  // road and shoulder, then a steep climb (or fall on the far side).
  const tzf = (zn2: Zone, stationM: number, lat: number, sd: number): number => {
    if (zn2.kind === 3 && sd === zn2.waterSide) return 0
    const r = lat <= 11 ? 0 : lat <= 40 ? (lat - 11) * 1.05 : 30.45 + (lat - 40) * 0.65
    return road.tiltAt(stationM) * sd * r
  }
  for (let i = startIdx; i < end; i++) {
    const p = s[i]!
    const q = s[i + 1]!
    const gi = i + road.samplesDropped
    const gj = gi + 1
    const zn = road.zoneAt(p.stationM)
    const nPx = -Math.sin(p.headingRad)
    const nPy = Math.cos(p.headingRad)
    const nQx = -Math.sin(q.headingRad)
    const nQy = Math.cos(q.headingRad)
    const E = (pp: RoadSample, nx: number, ny: number, d: number, z: number): V3 => [pp.xM + nx * d, pp.yM + ny * d, z]
    pushQuad(a, E(p, nPx, nPy, hw, p.zM), E(q, nQx, nQy, hw, q.zM), E(q, nQx, nQy, -hw, q.zM), E(p, nPx, nPy, -hw, p.zM), (gi & 4) ? C.roadA : C.roadB)
    for (const sd of [1, -1]) {
      // Edge line as bright core over a wide soft halo: the halo keeps
      // catching pixels when the core goes sub-pixel with distance,
      // so the line never breaks into dots under NEAREST sampling.
      pushQuad(a, E(p, nPx, nPy, (hw - 0.15) * sd, p.zM + 0.008), E(q, nQx, nQy, (hw - 0.15) * sd, q.zM + 0.008), E(q, nQx, nQy, (hw + 1.05) * sd, q.zM + 0.008), E(p, nPx, nPy, (hw + 1.05) * sd, p.zM + 0.008), C.edgeHalo)
      pushEmissive(a, E(p, nPx, nPy, (hw + 0.05) * sd, p.zM + 0.016), E(q, nQx, nQy, (hw + 0.05) * sd, q.zM + 0.016), E(q, nQx, nQy, (hw + 0.5) * sd, q.zM + 0.016), E(p, nPx, nPy, (hw + 0.5) * sd, p.zM + 0.016), [0.62, 0.64, 0.7])
      if (zn.kind === 3 && sd === zn.waterSide) {
        const seaZ = zn.cliff ? -22 : -5.5
        if (zn.cliff) {
          // Sheer cliff: narrow shoulder, then a face straight down.
          pushQuad(a, E(p, nPx, nPy, (hw + 0.5) * sd, p.zM - 0.02), E(q, nQx, nQy, (hw + 0.5) * sd, q.zM - 0.02), E(q, nQx, nQy, (hw + 2) * sd, q.zM - 0.06), E(p, nPx, nPy, (hw + 2) * sd, p.zM - 0.06), C.verge)
          pushWall(a, E(p, nPx, nPy, (hw + 2) * sd, p.zM - 22), E(q, nQx, nQy, (hw + 2) * sd, q.zM - 22), E(q, nQx, nQy, (hw + 2) * sd, q.zM - 0.06), E(p, nPx, nPy, (hw + 2) * sd, p.zM - 0.06), C.cliff)
          pushQuad(a, E(p, nPx, nPy, (hw + 2.2) * sd, p.zM - 22), E(q, nQx, nQy, (hw + 2.2) * sd, q.zM - 22), E(q, nQx, nQy, (hw + 92) * sd, q.zM - 22), E(p, nPx, nPy, (hw + 92) * sd, p.zM - 22), C.water)
        } else {
          // Beach coast: sand, bank and the sea.
          pushQuad(a, E(p, nPx, nPy, (hw + 0.5) * sd, p.zM - 0.02), E(q, nQx, nQy, (hw + 0.5) * sd, q.zM - 0.02), E(q, nQx, nQy, (hw + 7) * sd, q.zM - 1.3), E(p, nPx, nPy, (hw + 7) * sd, p.zM - 1.3), C.sand)
          pushQuad(a, E(p, nPx, nPy, (hw + 7) * sd, p.zM - 1.3), E(q, nQx, nQy, (hw + 7) * sd, q.zM - 1.3), E(q, nQx, nQy, (hw + 10) * sd, q.zM - 5.5), E(p, nPx, nPy, (hw + 10) * sd, p.zM - 5.5), C.bank)
          pushQuad(a, E(p, nPx, nPy, (hw + 10) * sd, p.zM - 5.5), E(q, nQx, nQy, (hw + 10) * sd, q.zM - 5.5), E(q, nQx, nQy, (hw + 92) * sd, q.zM - 5.5), E(p, nPx, nPy, (hw + 92) * sd, p.zM - 5.5), C.water)
        }
        if (gi % 9 === 0) {
          const gl = hw + (zn.cliff ? 8 : 14) + hash01(road.seed, gi * 67) * 58
          const gx = p.xM + nPx * gl * sd
          const gy = p.yM + nPy * gl * sd
          const gz = p.zM + seaZ + 0.06
          pushEmissive(a, [gx - 0.5, gy - 0.14, gz], [gx + 0.5, gy - 0.14, gz], [gx + 0.5, gy + 0.14, gz], [gx - 0.5, gy + 0.14, gz], C.glint)
        }
      } else {
        pushQuad(a, E(p, nPx, nPy, (hw + 0.5) * sd, p.zM - 0.02), E(q, nQx, nQy, (hw + 0.5) * sd, q.zM - 0.02), E(q, nQx, nQy, (hw + 10) * sd, q.zM - 0.4), E(p, nPx, nPy, (hw + 10) * sd, p.zM - 0.4), C.verge)
        pushQuad(a, E(p, nPx, nPy, (hw + 10) * sd, p.zM - 0.4), E(q, nQx, nQy, (hw + 10) * sd, q.zM - 0.4), E(q, nQx, nQy, (hw + 40) * sd, bh(gj, sd, q.zM) + tzf(zn, q.stationM, 40, sd)), E(p, nPx, nPy, (hw + 40) * sd, bh(gi, sd, p.zM) + tzf(zn, p.stationM, 40, sd)), C.hill)
        const vdrop = zn.kind === 4 ? -26 : -9
        pushQuad(a, E(p, nPx, nPy, (hw + 40) * sd, bh(gi, sd, p.zM) + tzf(zn, p.stationM, 40, sd)), E(q, nQx, nQy, (hw + 40) * sd, bh(gj, sd, q.zM) + tzf(zn, q.stationM, 40, sd)), E(q, nQx, nQy, (hw + 92) * sd, q.zM + vdrop + tzf(zn, q.stationM, 92, sd)), E(p, nPx, nPy, (hw + 92) * sd, p.zM + vdrop + tzf(zn, p.stationM, 92, sd)), C.valley)
      }
      // Distant ridge silhouettes: two layered dark walls whose top
      // edges undulate. Beyond the fog midfield they read as
      // mountains; skipped over open sea.
      if (!(zn.kind === 3 && sd === zn.waterSide)) {
        const rt = tzf(zn, p.stationM, 92, sd) * 0.72
        const rtq = tzf(zn, q.stationM, 92, sd) * 0.72
        const r1p = p.zM * 0.25 + road.ridgeAt(p.stationM, 0) + rt
        const r1q = q.zM * 0.25 + road.ridgeAt(q.stationM, 0) + rtq
        pushWall(a, E(p, nPx, nPy, 205 * sd, p.zM - 24 + rt), E(q, nQx, nQy, 205 * sd, q.zM - 24 + rtq), E(q, nQx, nQy, 205 * sd, r1q), E(p, nPx, nPy, 205 * sd, r1p), C.ridge)
        const r2p = p.zM * 0.25 + road.ridgeAt(p.stationM, 1) + rt
        const r2q = q.zM * 0.25 + road.ridgeAt(q.stationM, 1) + rtq
        pushWall(a, E(p, nPx, nPy, 330 * sd, p.zM - 30 + rt), E(q, nQx, nQy, 330 * sd, q.zM - 30 + rtq), E(q, nQx, nQy, 330 * sd, r2q), E(p, nPx, nPy, 330 * sd, r2p), C.ridge2)
      }
    }
    // REST STOP: apron, canopy, kiosk, bays, life.
    {
      const rs = restStopAt(road, p.stationM)
      if (rs && Math.abs(p.stationM - rs.c) < 17) {
        const sd = rs.side
        pushQuad(a, E(p, nPx, nPy, (hw + 0.4) * sd, p.zM - 0.015), E(q, nQx, nQy, (hw + 0.4) * sd, q.zM - 0.015), E(q, nQx, nQy, (hw + 8.2) * sd, q.zM - 0.03), E(p, nPx, nPy, (hw + 8.2) * sd, p.zM - 0.03), C.roadB)
        if (Math.abs(p.stationM - rs.c) < SAMPLE_SPACING_M * 0.51) {
          const tx2 = Math.cos(p.headingRad)
          const ty2 = Math.sin(p.headingRad)
          const at = (lat: number, along: number, z2: number): [number, number, number] => [p.xM + nPx * lat * sd + tx2 * along, p.yM + nPy * lat * sd + ty2 * along, p.zM + z2]
          // Double-sided emissive WITHOUT z-fighting: the twins are
          // separated along the face normal, so neither fights the
          // other nor the wall behind them.
          const emiBoth = (A: V3, B: V3, C2: V3, D: V3, col: V3): void => {
            const ux2 = B[0] - A[0]
            const uy2 = B[1] - A[1]
            const uz2 = B[2] - A[2]
            const vx2 = D[0] - A[0]
            const vy2 = D[1] - A[1]
            const vz2 = D[2] - A[2]
            let nx3 = uy2 * vz2 - uz2 * vy2
            let ny3 = uz2 * vx2 - ux2 * vz2
            let nz3 = ux2 * vy2 - uy2 * vx2
            const nl = Math.hypot(nx3, ny3, nz3) || 1
            nx3 /= nl
            ny3 /= nl
            nz3 /= nl
            const e = 0.035
            const off = (P2: V3, k2: number): V3 => [P2[0] + nx3 * e * k2, P2[1] + ny3 * e * k2, P2[2] + nz3 * e * k2]
            pushEmissive(a, off(A, 1), off(B, 1), off(C2, 1), off(D, 1), col)
            pushEmissive(a, off(D, -1), off(C2, -1), off(B, -1), off(A, -1), col)
          }
          const boxOn = (lat: number, along: number, hw2: number, hl: number, zb: number, zt: number, col: V3, capCol?: V3): void => {
            const A = at(lat - hw2, along - hl, 0)
            const B = at(lat + hw2, along - hl, 0)
            const C2 = at(lat + hw2, along + hl, 0)
            const D = at(lat - hw2, along + hl, 0)
            pushWall(a, [A[0], A[1], p.zM + zb], [B[0], B[1], p.zM + zb], [B[0], B[1], p.zM + zt], [A[0], A[1], p.zM + zt], col)
            pushWall(a, [D[0], D[1], p.zM + zb], [C2[0], C2[1], p.zM + zb], [C2[0], C2[1], p.zM + zt], [D[0], D[1], p.zM + zt], col)
            pushWall(a, [A[0], A[1], p.zM + zb], [D[0], D[1], p.zM + zb], [D[0], D[1], p.zM + zt], [A[0], A[1], p.zM + zt], col)
            pushWall(a, [B[0], B[1], p.zM + zb], [C2[0], C2[1], p.zM + zb], [C2[0], C2[1], p.zM + zt], [B[0], B[1], p.zM + zt], col)
            pushQuad(a, [A[0], A[1], p.zM + zt], [B[0], B[1], p.zM + zt], [C2[0], C2[1], p.zM + zt], [D[0], D[1], p.zM + zt], capCol ?? col)
          }
          const C_STEEL: V3 = [0.3, 0.31, 0.34]
          const C_FASCIA: V3 = [0.24, 0.25, 0.29]
          const variant = rs.kind
          if (variant === 1) {
            // LOOKOUT: a low parapet at the edge, and the view.
            for (let wseg = -6; wseg < 8; wseg++) {
              const w1 = at(8.6, wseg * 2, 0)
              const w2 = at(8.6, wseg * 2 + 1.7, 0)
              pushWall(a, [w1[0], w1[1], w1[2] - 0.3], [w2[0], w2[1], w2[2] - 0.3], [w2[0], w2[1], w2[2] + 0.85], [w1[0], w1[1], w1[2] + 0.85], [0.34, 0.33, 0.35])
            }
          }
          if (variant === 0) {
          const cpLat = 12.4
          const cpA = -4.2
          const cpHW = 3.4
          const cpHL = 4.4
          const cpZ = 3.55
          const cpT = 0.62
          for (const [pl, pa] of [[cpLat - 2.1, cpA - 2.9], [cpLat + 2.1, cpA - 2.9], [cpLat - 2.1, cpA + 2.9], [cpLat + 2.1, cpA + 2.9]] as const) {
            boxOn(pl, pa, 0.17, 0.17, -0.3, cpZ, C_STEEL)
          }
          const r1 = at(cpLat - cpHW, cpA - cpHL, 0)
          const r2 = at(cpLat + cpHW, cpA - cpHL, 0)
          const r3 = at(cpLat + cpHW, cpA + cpHL, 0)
          const r4 = at(cpLat - cpHW, cpA + cpHL, 0)
          pushEmissive(a, [r1[0], r1[1], p.zM + cpZ], [r2[0], r2[1], p.zM + cpZ], [r3[0], r3[1], p.zM + cpZ], [r4[0], r4[1], p.zM + cpZ], [0.8, 0.82, 0.74])
          const fz1 = p.zM + cpZ
          const fz2 = p.zM + cpZ + cpT
          for (const [Fa, Fb] of [[r1, r2], [r2, r3], [r3, r4], [r4, r1]] as const) {
            pushWall(a, [Fa[0], Fa[1], fz1], [Fb[0], Fb[1], fz1], [Fb[0], Fb[1], fz2], [Fa[0], Fa[1], fz2], C_FASCIA)
            emiBoth([Fa[0], Fa[1], fz1 + 0.16], [Fb[0], Fb[1], fz1 + 0.16], [Fb[0], Fb[1], fz1 + 0.4], [Fa[0], Fa[1], fz1 + 0.4], [1, 0.9, 0.42])
            emiBoth([Fa[0], Fa[1], fz1 + 0.44], [Fb[0], Fb[1], fz1 + 0.44], [Fb[0], Fb[1], fz1 + 0.55], [Fa[0], Fa[1], fz1 + 0.55], [0.98, 0.12, 0.07])
          }
          pushQuad(a, [r1[0], r1[1], fz2], [r2[0], r2[1], fz2], [r3[0], r3[1], fz2], [r4[0], r4[1], fz2], C.roof)
          // Warm light pooling on the forecourt tarmac beneath.
          pushEmissive(a, [r1[0], r1[1], p.zM + 0.012], [r2[0], r2[1], p.zM + 0.012], [r3[0], r3[1], p.zM + 0.012], [r4[0], r4[1], p.zM + 0.012], [0.13, 0.115, 0.055])
          for (const pa2 of [cpA - 1.6, cpA + 1.6]) {
            boxOn(cpLat, pa2, 1.5, 0.55, -0.3, -0.12, [0.42, 0.43, 0.46])
            const k1 = at(cpLat - 1.52, pa2 - 0.57, -0.16)
            const k2 = at(cpLat + 1.52, pa2 - 0.57, -0.16)
            const k3 = at(cpLat + 1.52, pa2 - 0.57, -0.11)
            const k4 = at(cpLat - 1.52, pa2 - 0.57, -0.11)
            emiBoth(k1, k2, k3, k4, [0.85, 0.14, 0.1])
            boxOn(cpLat, pa2, 0.34, 0.3, -0.12, 1.35, [0.55, 0.2, 0.16])
            const sc1 = at(cpLat - 0.36, pa2 - 0.22, 0.72)
            const sc2 = at(cpLat - 0.36, pa2 + 0.22, 0.72)
            const sc3 = at(cpLat - 0.36, pa2 + 0.22, 1.12)
            const sc4 = at(cpLat - 0.36, pa2 - 0.22, 1.12)
            emiBoth(sc1, sc2, sc3, sc4, [0.35, 0.9, 0.5])
          }
          }
          if (variant !== 1) {
          const kLat = 15.6
          const kA = 5.4
          const kHW = 3.1
          const kHL = 4
          const kH = 3
          boxOn(kLat, kA, kHW, kHL, -0.3, kH, C.wall)
          {
            const oA = at(kLat - kHW - 0.5, kA - kHL - 0.5, 0)
            const oB = at(kLat + kHW + 0.3, kA - kHL - 0.5, 0)
            const oC = at(kLat + kHW + 0.3, kA + kHL + 0.5, 0)
            const oD = at(kLat - kHW - 0.5, kA + kHL + 0.5, 0)
            pushQuad(a, [oA[0], oA[1], p.zM + kH], [oB[0], oB[1], p.zM + kH], [oC[0], oC[1], p.zM + kH + 0.28], [oD[0], oD[1], p.zM + kH + 0.28], C.roof)
            pushQuad(a, [oA[0], oA[1], p.zM + kH + 0.28], [oD[0], oD[1], p.zM + kH + 0.28], [oC[0], oC[1], p.zM + kH + 0.28], [oB[0], oB[1], p.zM + kH + 0.28], C.roof)
          }
          {
            const f1 = at(kLat - kHW - 0.02, kA - kHL + 0.5, 0.55)
            const f2 = at(kLat - kHW - 0.02, kA + kHL - 1.6, 0.55)
            const f3 = at(kLat - kHW - 0.02, kA + kHL - 1.6, 2.25)
            const f4 = at(kLat - kHW - 0.02, kA - kHL + 0.5, 2.25)
            emiBoth(f1, f2, f3, f4, [0.55, 0.76, 0.88])
            const g1 = at(kLat - kHW - 0.02, kA + kHL - 1.5, 2.35)
            const g2 = at(kLat - kHW - 0.02, kA + kHL - 0.4, 2.35)
            const g3 = at(kLat - kHW - 0.02, kA + kHL - 0.4, 2.6)
            const g4 = at(kLat - kHW - 0.02, kA + kHL - 1.5, 2.6)
            emiBoth(g1, g2, g3, g4, [0.16, 0.92, 0.38])
            const d1 = at(kLat - kHW - 0.02, kA + kHL - 1.4, 0)
            const d2 = at(kLat - kHW - 0.02, kA + kHL - 0.5, 0)
            const d3 = at(kLat - kHW - 0.02, kA + kHL - 0.5, 2.1)
            const d4 = at(kLat - kHW - 0.02, kA + kHL - 1.4, 2.1)
            emiBoth(d1, d2, d3, d4, [0.34, 0.4, 0.44])
          }
          for (const [vLat, vA, vc] of [[11.3, 2.2, [0.16, 0.46, 0.96]], [11.3, 3.35, [0.96, 0.16, 0.12]], [11.3, 4.5, [0.16, 0.85, 0.36]]] as [number, number, V3][]) {
            boxOn(vLat, vA, 0.42, 0.36, -0.3, 1.85, [0.2, 0.21, 0.25])
            const v1 = at(vLat - 0.44, vA - 0.3, 0.25)
            const v2 = at(vLat - 0.44, vA + 0.3, 0.25)
            const v3 = at(vLat - 0.44, vA + 0.3, 1.7)
            const v4 = at(vLat - 0.44, vA - 0.3, 1.7)
            emiBoth(v1, v2, v3, v4, vc)
          }
          boxOn(8.2, -12.5, 0.13, 0.13, -0.3, 3.5, C_STEEL)
          {
            const p1 = at(8.2, -12.5 - 0.95, 3.5)
            const p2 = at(8.2, -12.5 + 0.95, 3.5)
            const p3 = at(8.2, -12.5 + 0.95, 5.4)
            const p4 = at(8.2, -12.5 - 0.95, 5.4)
            emiBoth([p1[0], p1[1], p1[2] + 1.05], [p2[0], p2[1], p2[2] + 1.05], p3, p4, [0.96, 0.1, 0.06])
            emiBoth(p1, p2, [p3[0], p3[1], p3[2] - 0.9], [p4[0], p4[1], p4[2] - 0.9], [0.98, 0.84, 0.28])
          }
          }
          for (let bi = 0; bi < 4; bi++) {
            const bA = 9.5 + bi * 2.6
            const l1 = at(5.4, bA, 0.012)
            const l2 = at(8.6, bA, 0.012)
            pushEmissive(a, [l1[0] - tx2 * 0.07, l1[1] - ty2 * 0.07, l1[2]], [l1[0] + tx2 * 0.07, l1[1] + ty2 * 0.07, l1[2]], [l2[0] + tx2 * 0.07, l2[1] + ty2 * 0.07, l2[2]], [l2[0] - tx2 * 0.07, l2[1] - ty2 * 0.07, l2[2]], [0.42, 0.43, 0.47])
          }
          if (hash01(road.seed ^ 0x2b7, Math.floor(rs.c)) < 0.65) {
            const ba = 9.5 + 1.3 + (hash01(road.seed ^ 0x991, Math.floor(rs.c)) < 0.5 ? 0 : 2.6)
            boxOn(7, ba, 0.8, 1.85, 0.18, 0.62, [0.22, 0.23, 0.27])
            boxOn(7, ba, 0.72, 1.05, 0.62, 1.06, [0.15, 0.16, 0.19])
            for (const [wl, wa] of [[6.35, ba - 1.15], [7.65, ba - 1.15], [6.35, ba + 1.15], [7.65, ba + 1.15]] as const) {
              boxOn(wl, wa, 0.12, 0.3, 0, 0.42, [0.08, 0.08, 0.09])
            }
          }
          lights.push({ xM: p.xM + nPx * 12.4 * sd, yM: p.yM + nPy * 12.4 * sd, zM: p.zM + 3.3 })
          lights.push({ xM: p.xM + nPx * 13 * sd + tx2 * 7, yM: p.yM + nPy * 13 * sd + ty2 * 7, zM: p.zM + 3.6 })
        }
      }
    }
    // VILLAGE: small houses with warm windows near the road. Stretches
    // never come within 100 m of each other, so anything this close to
    // its own road can never touch another stretch.
    if (zn.kind === 2 && gi % 6 === 0 && !restStopAt(road, p.stationM)) {
      const sd = hash01(road.seed, gi * 17) > 0.5 ? 1 : -1
      const bhh = 2.6 + hash01(road.seed, gi * 23) * 1.8
      const bw = 2.1 + hash01(road.seed, gi * 41) * 1.5
      const bd = hw + 9 + hash01(road.seed, gi * 53) * 4.5
      const bx = p.xM + nPx * bd * sd
      const by = p.yM + nPy * bd * sd
      const bz = p.zM - 0.35
      const tx = Math.cos(p.headingRad)
      const ty = Math.sin(p.headingRad)
      const c1 = [bx - tx * bw, by - ty * bw] as const
      const c2 = [bx + tx * bw, by + ty * bw] as const
      const o1 = [c1[0] + nPx * sd * bw * 2, c1[1] + nPy * sd * bw * 2] as const
      const o2 = [c2[0] + nPx * sd * bw * 2, c2[1] + nPy * sd * bw * 2] as const
      pushWall(a, [c1[0], c1[1], bz], [c2[0], c2[1], bz], [c2[0], c2[1], bz + bhh], [c1[0], c1[1], bz + bhh], C.wall)
      pushWall(a, [o1[0], o1[1], bz], [o2[0], o2[1], bz], [o2[0], o2[1], bz + bhh], [o1[0], o1[1], bz + bhh], C.wall)
      pushWall(a, [c1[0], c1[1], bz], [o1[0], o1[1], bz], [o1[0], o1[1], bz + bhh], [c1[0], c1[1], bz + bhh], C.wall)
      pushWall(a, [c2[0], c2[1], bz], [o2[0], o2[1], bz], [o2[0], o2[1], bz + bhh], [c2[0], c2[1], bz + bhh], C.wall)
      // Pitched roof: ridge along the road tangent, two slopes and
      // two gable triangles.
      const rg = bz + bhh + bw * 0.62
      const m1 = [(c1[0] + o1[0]) / 2, (c1[1] + o1[1]) / 2] as const
      const m2 = [(c2[0] + o2[0]) / 2, (c2[1] + o2[1]) / 2] as const
      pushWall(a, [c1[0], c1[1], bz + bhh], [c2[0], c2[1], bz + bhh], [m2[0], m2[1], rg], [m1[0], m1[1], rg], C.roof)
      pushWall(a, [o1[0], o1[1], bz + bhh], [o2[0], o2[1], bz + bhh], [m2[0], m2[1], rg], [m1[0], m1[1], rg], C.roof)
      pushWall(a, [c1[0], c1[1], bz + bhh], [o1[0], o1[1], bz + bhh], [m1[0], m1[1], rg], [m1[0], m1[1], rg], C.wall)
      pushWall(a, [c2[0], c2[1], bz + bhh], [o2[0], o2[1], bz + bhh], [m2[0], m2[1], rg], [m2[0], m2[1], rg], C.wall)
      if (hash01(road.seed, gi * 71) < 0.4) {
        const chx = m1[0] + (m2[0] - m1[0]) * 0.72
        const chy = m1[1] + (m2[1] - m1[1]) * 0.72
        pushWall(a, [chx - 0.24, chy - 0.24, rg - 0.3], [chx + 0.24, chy - 0.24, rg - 0.3], [chx + 0.24, chy - 0.24, rg + 0.8], [chx - 0.24, chy - 0.24, rg + 0.8], C.wall)
        pushWall(a, [chx - 0.24, chy + 0.24, rg - 0.3], [chx + 0.24, chy + 0.24, rg - 0.3], [chx + 0.24, chy + 0.24, rg + 0.8], [chx - 0.24, chy + 0.24, rg + 0.8], C.wall)
        pushWall(a, [chx - 0.24, chy - 0.24, rg - 0.3], [chx - 0.24, chy + 0.24, rg - 0.3], [chx - 0.24, chy + 0.24, rg + 0.8], [chx - 0.24, chy - 0.24, rg + 0.8], C.wall)
        pushWall(a, [chx + 0.24, chy - 0.24, rg - 0.3], [chx + 0.24, chy + 0.24, rg - 0.3], [chx + 0.24, chy + 0.24, rg + 0.8], [chx + 0.24, chy - 0.24, rg + 0.8], C.wall)
      }
      {
        // A door on the road-facing wall, between the windows.
        const dx = bx - nPx * sd * 0.05
        const dy = by - nPy * sd * 0.05
        const hx3 = tx * 0.4
        const hy3 = ty * 0.4
        pushWall(a, [dx - hx3, dy - hy3, bz], [dx + hx3, dy + hy3, bz], [dx + hx3, dy + hy3, bz + 1.7], [dx - hx3, dy - hy3, bz + 1.7], C.trunk)
      }
      if (hash01(road.seed, gi * 61) < 0.8) {
        const wxo = -nPx * sd * 0.04
        const wyo = -nPy * sd * 0.04
        for (const off of [-0.8, 0.8]) {
          const qx = bx + tx * off + wxo
          const qy = by + ty * off + wyo
          const hx2 = tx * 0.32
          const hy2 = ty * 0.32
          pushEmissive(a, [qx - hx2, qy - hy2, bz + 0.9], [qx + hx2, qy + hy2, bz + 0.9], [qx + hx2, qy + hy2, bz + 1.55], [qx - hx2, qy - hy2, bz + 1.55], C.window)
        }
      }
    }
    // A torii now and then, forest and village cells only: two
    // vermillion pillars, double lintel, black caps, standing beside
    // the road with a warm uplight at each base.
    {
      const cellT = Math.floor(p.stationM / ZONE_LENGTH_M)
      const znT = road.zoneAt(p.stationM)
      if ((znT.kind === 1 || znT.kind === 2) && hash01(road.seed ^ 0x715, cellT) < 0.12) {
        const tS = cellT * ZONE_LENGTH_M + 80 + hash01(road.seed ^ 0x716, cellT) * 600
        if (Math.abs(p.stationM - tS) < SAMPLE_SPACING_M * 0.51) {
          const sdT = hash01(road.seed ^ 0x717, cellT) > 0.5 ? 1 : -1
          const VERM: V3 = [0.62, 0.13, 0.1]
          const tx3 = Math.cos(p.headingRad)
          const ty3 = Math.sin(p.headingRad)
          const post = (lat: number): [number, number] => [p.xM + nPx * lat * sdT, p.yM + nPy * lat * sdT]
          for (const lat of [6.2, 10.2]) {
            const [px2, py2] = post(lat)
            pushWall(a, [px2 - tx3 * 0.26, py2 - ty3 * 0.26, p.zM - 0.35], [px2 + tx3 * 0.26, py2 + ty3 * 0.26, p.zM - 0.35], [px2 + tx3 * 0.2, py2 + ty3 * 0.2, p.zM + 4.2], [px2 - tx3 * 0.2, py2 - ty3 * 0.2, p.zM + 4.2], VERM)
            pushWall(a, [px2, py2 - 0.26, p.zM - 0.35], [px2, py2 + 0.26, p.zM - 0.35], [px2, py2 + 0.2, p.zM + 4.2], [px2, py2 - 0.2, p.zM + 4.2], VERM)
            pushEmissive(a, [px2 - tx3 * 0.5, py2 - ty3 * 0.5, p.zM + 0.02], [px2 + tx3 * 0.5, py2 + ty3 * 0.5, p.zM + 0.02], [px2 + tx3 * 0.5, py2 + ty3 * 0.5, p.zM + 0.4], [px2 - tx3 * 0.5, py2 - ty3 * 0.5, p.zM + 0.4], [0.4, 0.22, 0.08])
          }
          const [i1x, i1y] = post(5.2)
          const [i2x, i2y] = post(11.2)
          // Kasagi: the top beam, wider than the span, with a cap.
          pushWall(a, [i1x - tx3 * 0.22, i1y - ty3 * 0.22, p.zM + 4.35], [i2x + tx3 * 0.22, i2y + ty3 * 0.22, p.zM + 4.35], [i2x + tx3 * 0.22, i2y + ty3 * 0.22, p.zM + 4.85], [i1x - tx3 * 0.22, i1y - ty3 * 0.22, p.zM + 4.85], VERM)
          pushWall(a, [i1x - tx3 * 0.3, i1y - ty3 * 0.3, p.zM + 4.85], [i2x + tx3 * 0.3, i2y + ty3 * 0.3, p.zM + 4.85], [i2x + tx3 * 0.3, i2y + ty3 * 0.3, p.zM + 5.05], [i1x - tx3 * 0.3, i1y - ty3 * 0.3, p.zM + 5.05], [0.1, 0.1, 0.11])
          // Nuki: the lower tie beam through the posts.
          const [n1x, n1y] = post(5.8)
          const [n2x, n2y] = post(10.6)
          pushWall(a, [n1x, n1y, p.zM + 3.35], [n2x, n2y, p.zM + 3.35], [n2x, n2y, p.zM + 3.7], [n1x, n1y, p.zM + 3.7], VERM)
        }
      }
    }
    // A lighthouse on each cliff cell, standing at the edge.
    if (zn.kind === 3 && zn.cliff && Math.abs((p.stationM % ZONE_LENGTH_M) - 140) < SAMPLE_SPACING_M * 0.51) {
      const lhx = p.xM + nPx * (hw + 3.4) * zn.waterSide
      const lhy = p.yM + nPy * (hw + 3.4) * zn.waterSide
      pushWall(a, [lhx - 0.9, lhy, p.zM], [lhx + 0.9, lhy, p.zM], [lhx + 0.55, lhy, p.zM + 9], [lhx - 0.55, lhy, p.zM + 9], [0.62, 0.6, 0.62])
      pushWall(a, [lhx, lhy - 0.9, p.zM], [lhx, lhy + 0.9, p.zM], [lhx, lhy + 0.55, p.zM + 9], [lhx, lhy - 0.55, p.zM + 9], [0.62, 0.6, 0.62])
      pushWall(a, [lhx - 0.6, lhy, p.zM + 9], [lhx + 0.6, lhy, p.zM + 9], [lhx + 0.6, lhy, p.zM + 10.3], [lhx - 0.6, lhy, p.zM + 10.3], [0.55, 0.16, 0.14])
      pushWall(a, [lhx, lhy - 0.6, p.zM + 9], [lhx, lhy + 0.6, p.zM + 9], [lhx, lhy + 0.6, p.zM + 10.3], [lhx, lhy - 0.6, p.zM + 10.3], [0.55, 0.16, 0.14])
    }
    // SUMMIT: bare rock cones instead of trees.
    if (zn.kind === 4 && gi % 7 === 0) {
      for (const sd of [1, -1]) {
        const h2 = hash01(road.seed, gi * 19 + sd * 5)
        if (h2 < 0.6) {
          const rd = hw + 8 + h2 * 20
          pushTree(a, p.xM + nPx * rd * sd, p.yM + nPy * rd * sd, p.zM - 0.5 + tzf(zn, p.stationM, rd - hw, sd), 1.1 + h2 * 1.6, C.rock, h2)
        }
      }
    }
    if ((gi & 3) === 0) pushQuad(a, E(p, nPx, nPy, 0.15, p.zM + 0.03), E(q, nQx, nQy, 0.15, (p.zM + q.zM) / 2 + 0.03), E(q, nQx, nQy, -0.15, (p.zM + q.zM) / 2 + 0.03), E(p, nPx, nPy, -0.15, p.zM + 0.03), C.dash)
    const litHere = zn.lampMode === 1 ? true : zn.lampMode === -1 ? false : road.litAt(p.stationM)
    if ((gi & 15) === 0 && !litHere) {
      for (const sd of [1, -1]) {
        const bx = p.xM + nPx * (hw + 1.3) * sd
        const by = p.yM + nPy * (hw + 1.3) * sd
        for (const [ox, oy] of [[0.08, 0], [0, 0.08]] as const) {
          pushWall(a, [bx - ox, by - oy, p.zM], [bx + ox, by + oy, p.zM], [bx + ox, by + oy, p.zM + 1.0], [bx - ox, by - oy, p.zM + 1.0], C.post)
          pushEmissive(a, [bx - ox, by - oy, p.zM + 1.0], [bx + ox, by + oy, p.zM + 1.0], [bx + ox, by + oy, p.zM + 1.16], [bx - ox, by - oy, p.zM + 1.16], C.postTop)
        }
      }
    }
    // Sodium segments: lamps every 16 m, alternating sides.
    if (litHere && gi % (zn.lampMode === 1 ? 5 : 8) === 0) {
      const sd = ((gi >> 3) & 1) ? 1 : -1
      const bx = p.xM + nPx * (hw + 0.9) * sd
      const by = p.yM + nPy * (hw + 0.9) * sd
      const bz = p.zM
      for (const [ox, oy] of [[0.09, 0], [0, 0.09]] as const) {
        pushWall(a, [bx - ox, by - oy, bz], [bx + ox, by + oy, bz], [bx + ox, by + oy, bz + 4.6], [bx - ox, by - oy, bz + 4.6], C.pole)
      }
      const ax2 = bx - nPx * sd * 1.1
      const ay2 = by - nPy * sd * 1.1
      pushWall(a, [bx, by, bz + 4.6], [ax2, ay2, bz + 4.6], [ax2, ay2, bz + 4.45], [bx, by, bz + 4.45], C.pole)
      pushEmissive(a, [ax2 - 0.28, ay2 - 0.28, bz + 4.42], [ax2 + 0.28, ay2 - 0.28, bz + 4.42], [ax2 + 0.28, ay2 + 0.28, bz + 4.42], [ax2 - 0.28, ay2 + 0.28, bz + 4.42], C.sodium)
      for (const [dx1, dy1, dx2, dy2] of [[-0.28, -0.28, 0.28, -0.28], [0.28, -0.28, 0.28, 0.28], [0.28, 0.28, -0.28, 0.28], [-0.28, 0.28, -0.28, -0.28]] as const) {
        pushEmissive(a, [ax2 + dx1, ay2 + dy1, bz + 4.42], [ax2 + dx2, ay2 + dy2, bz + 4.42], [ax2 + dx2, ay2 + dy2, bz + 4.62], [ax2 + dx1, ay2 + dy1, bz + 4.62], C.sodium)
      }
      lights.push({ xM: ax2, yM: ay2, zM: bz + 4.35 })
    }
    if (gi % (zn.kind === 1 ? 3 : 9) === 0 && zn.kind !== 4) {
      for (const sd of [1, -1]) {
        if (zn.kind === 3 && sd === zn.waterSide) continue
        const h1 = hash01(road.seed, gi * 13 + sd * 3)
        if (h1 < 0.55 * Math.min(1, zn.treeMult) || (zn.kind === 1 && h1 < 0.85)) {
          const dist = zn.kind === 1 ? hw + 8.5 + h1 * 10 : hw + 11 + h1 * 24
          const tx = p.xM + nPx * dist * sd
          const ty = p.yM + nPy * dist * sd
          // Skip the tree if it lands inside ANY generated stretch of
          // road: the corridor crosses itself on winding sections.
          // Presence is per segment, never shared, so the window test
          // cannot tear shared geometry.
          let clear = true
          for (let k2 = 0; k2 < s.length; k2 += 3) {
            const o = s[k2]!
            const dx = o.xM - tx
            const dy = o.yM - ty
            if (dx * dx + dy * dy < (hw + 8) * (hw + 8) && Math.abs(o.stationM - p.stationM) > 40) {
              clear = false
              break
            }
          }
          const rsT = restStopAt(road, p.stationM)
          if (rsT && sd === rsT.side && dist < hw + 18) clear = false
          if (clear) {
            const tz = p.zM - 0.4 + (dist > hw + 10 ? (bh(gi, sd, p.zM) - (p.zM - 0.4)) * Math.min(1, (dist - hw - 10) / 30) : 0) + tzf(zn, p.stationM, dist - hw, sd)
            const r = 1.6 + hash01(road.seed, gi * 29 + sd) * 2.6
            pushTree(a, tx, ty, tz - 0.3, r, h1 < 0.3 ? C.leafA : C.leafB, hash01(road.seed, gi * 29 + sd * 7))
          }
        }
      }
    }
  }
  return { mesh: new Float32Array(a), lights }
}

/** The readable pixel-scale coupe: low body, glass cabin, sloped
 * screens, exposed wheels, bright lamps, spoiler on RWD and AWD. */
export function buildCarMesh(params: DriveParams, tone: V3, dark: V3): Float32Array {
  const a: number[] = []
  const nose = params.aM + 0.62
  const tail = -(params.bM + 0.55)
  const W2 = 0.86
  const roof: V3 = [Math.min(1, tone[0] * 1.12), Math.min(1, tone[1] * 1.12), Math.min(1, tone[2] * 1.12)]
  const box = (x1: number, x2: number, y1: number, y2: number, z1: number, z2: number, c: V3, cTop?: V3): void => {
    pushWall(a, [x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2], cTop ?? c)
    pushWall(a, [x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2], c)
    pushWall(a, [x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2], c)
    pushWall(a, [x2, y1, z1], [x2, y2, z1], [x2, y2, z2], [x2, y1, z2], c)
    pushWall(a, [x1, y1, z1], [x1, y2, z1], [x1, y2, z2], [x1, y1, z2], dark)
  }
  // Lower body with a wedge nose: main volume, then a lower nose
  // section joined by a sloped bonnet.
  const noseB = nose - 0.55
  box(tail, noseB, -W2, W2, 0.3, 0.74, tone)
  box(noseB, nose, -W2, W2, 0.3, 0.58, tone)
  pushWall(a, [noseB, -W2, 0.74], [noseB, W2, 0.74], [nose, W2, 0.58], [nose, -W2, 0.58], tone)
  // Dark bumpers front and rear finish the silhouette.
  box(nose - 0.05, nose + 0.1, -0.84, 0.84, 0.28, 0.44, dark, dark)
  box(tail - 0.12, tail + 0.05, -0.84, 0.84, 0.28, 0.46, dark, dark)
  pushWall(a, [noseB, -W2, 0.74], [nose, -W2, 0.58], [nose, -W2, 0.58], [noseB, -W2, 0.58], dark)
  pushWall(a, [noseB, W2, 0.74], [nose, W2, 0.58], [nose, W2, 0.58], [noseB, W2, 0.58], dark)
  // Rocker line: a darker sill grounds the body visually.
  pushWall(a, [tail + 0.1, -W2 - 0.01, 0.3], [nose - 0.2, -W2 - 0.01, 0.3], [nose - 0.2, -W2 - 0.01, 0.4], [tail + 0.1, -W2 - 0.01, 0.4], dark)
  pushWall(a, [tail + 0.1, W2 + 0.01, 0.3], [nose - 0.2, W2 + 0.01, 0.3], [nose - 0.2, W2 + 0.01, 0.4], [tail + 0.1, W2 + 0.01, 0.4], dark)
  const cabB = tail + 0.72
  const cabF = tail + 0.72 + (nose - tail) * 0.44
  const cabT = 1.26
  box(cabB, cabF, -0.7, 0.7, 0.74, cabT, C.glass, roof)
  pushWall(a, [cabF, -0.66, cabT], [cabF, 0.66, cabT], [cabF + 0.78, 0.78, 0.74], [cabF + 0.78, -0.78, 0.74], C.glass)
  pushWall(a, [cabB, -0.66, cabT], [cabB, 0.66, cabT], [cabB - 0.5, 0.78, 0.74], [cabB - 0.5, -0.78, 0.74], C.glass)
  pushEmissive(a, [tail - 0.02, -0.72, 0.46], [tail - 0.02, -0.28, 0.46], [tail - 0.02, -0.28, 0.64], [tail - 0.02, -0.72, 0.64], C.tail)
  pushEmissive(a, [tail - 0.02, 0.28, 0.46], [tail - 0.02, 0.72, 0.46], [tail - 0.02, 0.72, 0.64], [tail - 0.02, 0.28, 0.64], C.tail)
  pushEmissive(a, [nose + 0.02, -0.66, 0.42], [nose + 0.02, -0.34, 0.42], [nose + 0.02, -0.34, 0.54], [nose + 0.02, -0.66, 0.54], C.head)
  pushEmissive(a, [nose + 0.02, 0.34, 0.42], [nose + 0.02, 0.66, 0.42], [nose + 0.02, 0.66, 0.54], [nose + 0.02, 0.34, 0.54], C.head)
  if (params.drivetrain !== 'FWD') box(tail - 0.06, tail + 0.16, -0.8, 0.8, 1.0, 1.1, dark)
  return new Float32Array(a)
}

export function buildWheelMesh(): Float32Array {
  const a: number[] = []
  const wl = 0.35
  const ww = 0.13
  const z2 = 0.66
  pushWall(a, [-wl, -ww, 0], [wl, -ww, 0], [wl, -ww, z2], [-wl, -ww, z2], C.wheel)
  pushWall(a, [-wl, ww, 0], [wl, ww, 0], [wl, ww, z2], [-wl, ww, z2], C.wheel)
  pushWall(a, [-wl, -ww, z2], [wl, -ww, z2], [wl, ww, z2], [-wl, ww, z2], C.wheel)
  pushWall(a, [wl, -ww, 0], [wl, ww, 0], [wl, ww, z2], [wl, -ww, z2], C.wheel)
  pushWall(a, [-wl, -ww, 0], [-wl, ww, 0], [-wl, ww, z2], [-wl, -ww, z2], C.wheel)
  return new Float32Array(a)
}

export const CAR_TONES: Record<string, { tone: V3; dark: V3 }> = {
  FWD: { tone: [0.21, 0.82, 0.88], dark: [0.12, 0.56, 0.61] },
  RWD: { tone: [1.0, 0.37, 0.45], dark: [0.71, 0.23, 0.3] },
  AWD: { tone: [0.6, 0.45, 0.91], dark: [0.42, 0.31, 0.64] },
}

interface ChunkBuffer {
  buf: WebGLBuffer
  count: number
}

/** Owns the GL context, programs, framebuffer and buffers. */
export class DriveRenderer {
  private readonly gl: WebGLRenderingContext
  private scene!: WebGLProgram
  private sky!: WebGLProgram
  private post!: WebGLProgram
  private loc!: {
    pos: number; nrm: number; col: number
    vp: WebGLUniformLocation | null; model: WebGLUniformLocation | null
    slide: WebGLUniformLocation | null; fog: WebGLUniformLocation | null
    lp: WebGLUniformLocation | null; lc: WebGLUniformLocation | null
    hp: WebGLUniformLocation | null; hd: WebGLUniformLocation | null
    fogn: WebGLUniformLocation | null
    amb: WebGLUniformLocation | null
    emi: WebGLUniformLocation | null
    wet: WebGLUniformLocation | null
    camz: WebGLUniformLocation | null
    skyT: WebGLUniformLocation | null
    skyM: WebGLUniformLocation | null
    skyL: WebGLUniformLocation | null
    skyP: number; postP: number; postTex: WebGLUniformLocation | null
  }
  private quad!: WebGLBuffer
  private glowBuf!: WebGLBuffer
  private readonly chunkBufs: ChunkBuffer[] = []
  private readonly chunkLights: SkidMark[][] = []
  private carBuf: ChunkBuffer | null = null
  private trafBufs: ChunkBuffer[] = []
  private wheelBuf: ChunkBuffer | null = null
  /** CPU copies of live chunk meshes so a lost GL context can be
   * repopulated; Android loses contexts under memory pressure. */
  private chunkMeshes: Float32Array[] = []
  private lastCarParams: DriveParams | null = null
  private ctxLost = false
  private watchFrames = 0
  /** The world mood: fog, sky triad, ambient/emissive scale, wetness. */
  private camLag = 0
  private fovNow = (62 * Math.PI) / 180
  private mood = {
    fog: [0.1, 0.095, 0.158] as readonly number[],
    skyT: [0.055, 0.055, 0.105] as readonly number[],
    skyM: [0.16, 0.12, 0.26] as readonly number[],
    skyL: [0.36, 0.2, 0.24] as readonly number[],
    amb: 1,
    emi: 1,
    wet: 0,
  }
  /** Per-frame effect payload from the screen: smoke, rain, beams. */
  fx: {
    timeS: number
    wet: number
    axF: number
    speed: number
    camBack: number
    camH: number
    camAhead: number
    camLookH: number
    carX: number
    carY: number
    carH: number
    groundZ: number
    smoke: readonly { x: number; y: number; z: number; age: number }[]
    lighthouses: readonly { x: number; y: number; z: number; phase: number }[]
    windows: readonly { x: number; y: number; z: number; phase: number; rate: number; blue: boolean }[]
    accents: readonly { x: number; y: number; z: number; r: number; col: readonly number[] }[]
    traffic: { x: number; y: number; z: number; heading: number; kind: number; hx: number; hy: number; hz: number; nx: number; ny: number } | null
  } | null = null
  private skidBuf!: WebGLBuffer
  private fb: WebGLFramebuffer | null = null
  private fbTex: WebGLTexture | null = null
  private fbDepth: WebGLRenderbuffer | null = null
  private iw = 0
  private ih = 0
  private readonly fog = [0.16, 0.12, 0.26] as const

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
    if (!gl) throw new Error('WebGL unavailable')
    this.gl = gl
    this.initGl()
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.ctxLost = true
    })
    canvas.addEventListener('webglcontextrestored', () => {
      this.ctxLost = false
      this.rebuildAfterLoss()
    })
  }

  /** Compiles programs and creates every static GL resource. Runs at
   * construction and again after a context restore. */
  private initGl(): void {
    const gl = this.gl
    const mk = (t: number, src: string): WebGLShader => {
      const s = gl.createShader(t)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = (vs: string, fs: string): WebGLProgram => {
      const p = gl.createProgram()!
      gl.attachShader(p, mk(gl.VERTEX_SHADER, vs))
      gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs))
      gl.linkProgram(p)
      return p
    }
    this.scene = prog(SCENE_VS, SCENE_FS)
    this.sky = prog(SKY_VS, SKY_FS)
    this.post = prog(POST_VS, POST_FS)
    this.loc = {
      pos: gl.getAttribLocation(this.scene, 'aPos'),
      nrm: gl.getAttribLocation(this.scene, 'aNrm'),
      col: gl.getAttribLocation(this.scene, 'aCol'),
      vp: gl.getUniformLocation(this.scene, 'uVP'),
      model: gl.getUniformLocation(this.scene, 'uModel'),
      slide: gl.getUniformLocation(this.scene, 'uSlide'),
      fog: gl.getUniformLocation(this.scene, 'uFog'),
      lp: gl.getUniformLocation(this.scene, 'uLp[0]'),
      lc: gl.getUniformLocation(this.scene, 'uLc[0]'),
      hp: gl.getUniformLocation(this.scene, 'uHp'),
      hd: gl.getUniformLocation(this.scene, 'uHd'),
      fogn: gl.getUniformLocation(this.scene, 'uFogN'),
      amb: gl.getUniformLocation(this.scene, 'uAmb'),
      emi: gl.getUniformLocation(this.scene, 'uEmi'),
      wet: gl.getUniformLocation(this.scene, 'uWet'),
      camz: gl.getUniformLocation(this.scene, 'uCamZ'),
      skyT: gl.getUniformLocation(this.sky, 'uSkyT'),
      skyM: gl.getUniformLocation(this.sky, 'uSkyM'),
      skyL: gl.getUniformLocation(this.sky, 'uSkyL'),
      skyP: gl.getAttribLocation(this.sky, 'aP'),
      postP: gl.getAttribLocation(this.post, 'aP'),
      postTex: gl.getUniformLocation(this.post, 'uTex'),
    }
    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.skidBuf = gl.createBuffer()!
    this.glowBuf = gl.createBuffer()!
    gl.disable(gl.CULL_FACE)
    this.resize()
  }

  resize(): void {
    const gl = this.gl
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr))
    this.canvas.width = w
    this.canvas.height = h
    // Integer upscale only: the internal buffer must never be LARGER
    // than the canvas, or NEAREST minification eats thin lines and
    // streaks the far field.
    const scale = Math.max(2, Math.round(h / 330))
    this.ih = Math.ceil(h / scale)
    this.iw = Math.ceil(w / scale)
    if (this.fb) {
      gl.deleteFramebuffer(this.fb)
      gl.deleteTexture(this.fbTex)
      gl.deleteRenderbuffer(this.fbDepth)
    }
    this.fbTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.iw, this.ih, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.fbDepth = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.fbDepth)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.iw, this.ih)
    this.fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTex, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.fbDepth)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  setCar(params: DriveParams): void {
    this.lastCarParams = params
    const tones = CAR_TONES[params.drivetrain] ?? CAR_TONES['RWD']!
    if (this.carBuf) this.gl.deleteBuffer(this.carBuf.buf)
    this.carBuf = this.upload(buildCarMesh(params, tones.tone, tones.dark))
    for (const b of this.trafBufs) this.gl.deleteBuffer(b.buf)
    // The oncoming strangers: three quiet paint jobs.
    this.trafBufs = [
      this.upload(buildCarMesh(params, [0.3, 0.31, 0.36], [0.16, 0.165, 0.2])),
      this.upload(buildCarMesh(params, [0.2, 0.24, 0.4], [0.12, 0.14, 0.22])),
      this.upload(buildCarMesh(params, [0.38, 0.2, 0.2], [0.2, 0.12, 0.12])),
    ]
    if (!this.wheelBuf) this.wheelBuf = this.upload(buildWheelMesh())
  }

  /** Full recovery from a lost context: programs, framebuffers, car
   * and every live chunk buffer, re-uploaded from the CPU copies. */
  private rebuildAfterLoss(): void {
    this.initGl()
    this.carBuf = null
    this.wheelBuf = null
    if (this.lastCarParams) this.setCar(this.lastCarParams)
    this.reuploadChunks()
  }

  private reuploadChunks(): void {
    this.chunkBufs.length = 0
    for (const mesh of this.chunkMeshes) this.chunkBufs.push(this.upload(mesh))
  }

  /** Repairs dead chunk buffers on a LIVE context. Never runs while
   * the context is lost: isBuffer is false for everything then, and a
   * rebuild would fill the list with null handles that persist if the
   * restore event never fires (a known Android browser behaviour). An
   * empty list with retained meshes counts as damage too. */
  private watchdog(): void {
    if (this.ctxLost) return
    if (++this.watchFrames < 120) return
    this.watchFrames = 0
    const gl = this.gl
    const n = this.chunkBufs.length
    const dead =
      (n === 0 && this.chunkMeshes.length > 0) ||
      (n > 0 && (!gl.isBuffer(this.chunkBufs[0]!.buf) || !gl.isBuffer(this.chunkBufs[n - 1]!.buf)))
    if (dead) this.reuploadChunks()
  }

  addChunk(chunk: ChunkGeometry): void {
    this.chunkBufs.push(this.upload(chunk.mesh))
    this.chunkLights.push(chunk.lights)
    this.chunkMeshes.push(chunk.mesh)
  }

  dropOldestChunk(): void {
    const old = this.chunkBufs.shift()
    if (old) this.gl.deleteBuffer(old.buf)
    this.chunkLights.shift()
    this.chunkMeshes.shift()
  }

  clearChunks(): void {
    for (const c of this.chunkBufs) this.gl.deleteBuffer(c.buf)
    this.chunkBufs.length = 0
    this.chunkLights.length = 0
    this.chunkMeshes.length = 0
  }

  private upload(data: Float32Array): ChunkBuffer {
    const gl = this.gl
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    return { buf, count: data.length / 9 }
  }

  private drawBuf(buf: ChunkBuffer, model: Float32Array, slide: number): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.buf)
    gl.vertexAttribPointer(this.loc.pos, 3, gl.FLOAT, false, 36, 0)
    gl.vertexAttribPointer(this.loc.nrm, 3, gl.FLOAT, false, 36, 12)
    gl.vertexAttribPointer(this.loc.col, 3, gl.FLOAT, false, 36, 24)
    gl.enableVertexAttribArray(this.loc.pos)
    gl.enableVertexAttribArray(this.loc.nrm)
    gl.enableVertexAttribArray(this.loc.col)
    gl.uniformMatrix4fv(this.loc.model, false, model)
    gl.uniform1f(this.loc.slide, slide)
    gl.drawArrays(gl.TRIANGLES, 0, buf.count)
  }

  /** Distance from a point to the nearest active lamp, for audio. */
  nearestLampM(x: number, y: number): number {
    let best = Infinity
    for (const ls of this.chunkLights) {
      for (const l of ls) {
        const d = (l.xM - x) * (l.xM - x) + (l.yM - y) * (l.yM - y)
        if (d < best) best = d
      }
    }
    return Math.sqrt(best)
  }

  render(pose: CarPose, params: DriveParams, camEyeZ: number, camLookZ: number, skids: readonly SkidMark[], fogNearM = 140, mood?: typeof this.mood): void {
    if (this.ctxLost) return
    this.watchdog()
    if (mood) this.mood = mood
    const gl = this.gl
    const fx = Math.cos(pose.headingRad)
    const fy = Math.sin(pose.headingRad)
    // Sense of speed, restrained: the follow distance breathes with
    // acceleration and the FOV widens a little with speed.
    const fxp = this.fx
    const lagT = Math.max(-0.55, Math.min(0.8, (fxp?.axF ?? 0) * 0.085))
    this.camLag += (lagT - this.camLag) * Math.min(1, 0.016 / 0.28)
    const fovT = (62 * Math.PI) / 180 + (9 * Math.PI) / 180 * Math.min(1, (fxp?.speed ?? 0) / 52)
    this.fovNow += (fovT - this.fovNow) * Math.min(1, 0.016 / 0.5)
    const back = (fxp?.camBack ?? 9) + this.camLag
    const eye = [pose.xM - fx * back, pose.yM - fy * back, camEyeZ + (fxp?.camH ?? 4.2)] as const
    const look = [pose.xM + fx * (fxp?.camAhead ?? 8), pose.yM + fy * (fxp?.camAhead ?? 8), camLookZ + (fxp?.camLookH ?? 1.1)] as const
    const vp = m4Mul(
      m4Perspective(this.fovNow, this.iw / this.ih, 0.7, 460),
      m4LookAt(eye[0], eye[1], eye[2], look[0], look[1], look[2]),
    )
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb)
    gl.viewport(0, 0, this.iw, this.ih)
    gl.clearColor(this.fog[0], this.fog[1], this.fog[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(this.sky)
    const md = this.mood
    gl.uniform3f(this.loc.skyT, md.skyT[0]!, md.skyT[1]!, md.skyT[2]!)
    gl.uniform3f(this.loc.skyM, md.skyM[0]!, md.skyM[1]!, md.skyM[2]!)
    gl.uniform3f(this.loc.skyL, md.skyL[0]!, md.skyL[1]!, md.skyL[2]!)
    gl.disable(gl.DEPTH_TEST)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.vertexAttribPointer(this.loc.skyP, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(this.loc.skyP)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.enable(gl.DEPTH_TEST)
    gl.useProgram(this.scene)
    gl.uniformMatrix4fv(this.loc.vp, false, vp)
    gl.uniform1f(this.loc.fogn, fogNearM * (1 - 0.4 * md.wet))
    gl.uniform3f(this.loc.fog, md.fog[0]!, md.fog[1]!, md.fog[2]!)
    gl.uniform1f(this.loc.amb, md.amb)
    gl.uniform1f(this.loc.emi, md.emi)
    gl.uniform1f(this.loc.wet, md.wet)
    gl.uniform1f(this.loc.camz, camEyeZ + 4.2)
    // The nearest ten sodium lamps, as point lights.
    const lp = new Float32Array(40)
    const lc = new Float32Array(30)
    const activeLamps: SkidMark[] = []
    {
      const all: [number, SkidMark][] = []
      for (const ls of this.chunkLights) {
        for (const l of ls) {
          const dx = l.xM - pose.xM
          const dy = l.yM - pose.yM
          all.push([dx * dx + dy * dy, l])
        }
      }
      all.sort((u, v) => u[0] - v[0])
      for (let j = 0; j < Math.min(8, all.length); j++) {
        const l = all[j]![1]
        lp[j * 4] = l.xM
        lp[j * 4 + 1] = l.yM
        lp[j * 4 + 2] = l.zM
        lp[j * 4 + 3] = 30
        lc[j * 3] = 2.1
        lc[j * 3 + 1] = 1.22
        lc[j * 3 + 2] = 0.38
        activeLamps.push(l)
      }
    }
    // The oncoming car's headlights take the last two light slots.
    if (this.fx?.traffic) {
      const t = this.fx.traffic
      for (const [slot, off] of [[8, -0.5], [9, 0.5]] as const) {
        lp[slot * 4] = t.hx + t.nx * off
        lp[slot * 4 + 1] = t.hy + t.ny * off
        lp[slot * 4 + 2] = t.hz
        lp[slot * 4 + 3] = 24
        lc[slot * 3] = 1.35
        lc[slot * 3 + 1] = 1.35
        lc[slot * 3 + 2] = 1.6
      }
    }
    gl.uniform4fv(this.loc.lp, lp)
    gl.uniform3fv(this.loc.lc, lc)
    const hb = m4ModelYP(0, 0, 0, pose.headingRad, pose.pitchRad)
    gl.uniform3f(
      this.loc.hp,
      pose.xM + hb[0]! * (params.aM + 0.7),
      pose.yM + hb[1]! * (params.aM + 0.7),
      pose.zM + hb[2]! * (params.aM + 0.7) + 0.42,
    )
    gl.uniform3f(this.loc.hd, hb[0]!, hb[1]!, hb[2]!)
    for (const c of this.chunkBufs) this.drawBuf(c, IDENT, 0)
    if (skids.length > 0) {
      const arr: number[] = []
      for (const s of skids) {
        pushQuad(arr, [s.xM - 0.14, s.yM - 0.14, s.zM + 0.025], [s.xM + 0.14, s.yM - 0.14, s.zM + 0.025], [s.xM + 0.14, s.yM + 0.14, s.zM + 0.025], [s.xM - 0.14, s.yM + 0.14, s.zM + 0.025], C.skid)
      }
      const f32 = new Float32Array(arr)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skidBuf)
      gl.bufferData(gl.ARRAY_BUFFER, f32, gl.DYNAMIC_DRAW)
      gl.vertexAttribPointer(this.loc.pos, 3, gl.FLOAT, false, 36, 0)
      gl.vertexAttribPointer(this.loc.nrm, 3, gl.FLOAT, false, 36, 12)
      gl.vertexAttribPointer(this.loc.col, 3, gl.FLOAT, false, 36, 24)
      gl.uniformMatrix4fv(this.loc.model, false, IDENT)
      gl.uniform1f(this.loc.slide, 0)
      gl.drawArrays(gl.TRIANGLES, 0, f32.length / 9)
    }
    if (this.carBuf && this.wheelBuf) {
      const body = m4ModelYPR(pose.xM, pose.yM, pose.zM, pose.headingRad, pose.pitchRad, pose.rollRad)
      this.drawBuf(this.carBuf, body, pose.sliding ? 1 : 0)
      const wheelAt = (lx: number, ly: number, steer: number): void => {
        const wx = pose.xM + body[0]! * lx + body[4]! * ly
        const wy = pose.yM + body[1]! * lx + body[5]! * ly
        const wz = pose.zM + body[2]! * lx
        this.drawBuf(this.wheelBuf!, m4ModelYPR(wx, wy, wz, pose.headingRad + steer, pose.pitchRad, pose.rollRad), 0)
      }
      wheelAt(params.aM, -0.74, pose.steerRad)
      wheelAt(params.aM, 0.74, pose.steerRad)
      wheelAt(-params.bM, -0.74, 0)
      wheelAt(-params.bM, 0.74, 0)
    }
    if (this.fx?.traffic && this.trafBufs.length) {
      const t = this.fx.traffic
      const buf = this.trafBufs[t.kind % this.trafBufs.length]!
      this.drawBuf(buf, m4ModelYPR(t.x, t.y, t.z, t.heading + Math.PI, 0, 0), 0)
    }
    // Glow halos on the active lamps: camera-facing additive quads make
    // the sources bloom, which is most of what reads as "light".
    {
      let fwx = look[0] - eye[0]
      let fwy = look[1] - eye[1]
      let fwz = look[2] - eye[2]
      const fl = Math.hypot(fwx, fwy, fwz) || 1
      fwx /= fl
      fwy /= fl
      fwz /= fl
      let rx = fwy
      let ry = -fwx
      const rl = Math.hypot(rx, ry) || 1
      rx /= rl
      ry /= rl
      const ux = ry * fwz
      const uy = -rx * fwz
      const uz = rx * fwy - ry * fwx
      const g: number[] = []
      for (const l of activeLamps) {
        const r = 1.5
        const cz = l.zM + 0.1
        // Radial fan: bright centre, black rim; additive blending turns
        // the interpolation into a soft halo with no box edge.
        for (let k3 = 0; k3 < 8; k3++) {
          const a1 = (k3 * Math.PI) / 4
          const a2 = ((k3 + 1) * Math.PI) / 4
          g.push(l.xM, l.yM, cz, 0, 0, 0, 0.5, 0.3, 0.09)
          g.push(l.xM + (rx * Math.cos(a1) + ux * Math.sin(a1)) * r, l.yM + (ry * Math.cos(a1) + uy * Math.sin(a1)) * r, cz + uz * Math.sin(a1) * r, 0, 0, 0, 0, 0, 0)
          g.push(l.xM + (rx * Math.cos(a2) + ux * Math.sin(a2)) * r, l.yM + (ry * Math.cos(a2) + uy * Math.sin(a2)) * r, cz + uz * Math.sin(a2) * r, 0, 0, 0, 0, 0, 0)
        }
      }
      const fan = (cx: number, cy: number, cz: number, r: number, col: readonly number[]): void => {
        for (let k3 = 0; k3 < 8; k3++) {
          const a1 = (k3 * Math.PI) / 4
          const a2 = ((k3 + 1) * Math.PI) / 4
          g.push(cx, cy, cz, 0, 0, 0, col[0]!, col[1]!, col[2]!)
          g.push(cx + (rx * Math.cos(a1) + ux * Math.sin(a1)) * r, cy + (ry * Math.cos(a1) + uy * Math.sin(a1)) * r, cz + uz * Math.sin(a1) * r, 0, 0, 0, 0, 0, 0)
          g.push(cx + (rx * Math.cos(a2) + ux * Math.sin(a2)) * r, cy + (ry * Math.cos(a2) + uy * Math.sin(a2)) * r, cz + uz * Math.sin(a2) * r, 0, 0, 0, 0, 0, 0)
        }
      }
      const fx = this.fx
      if (fx) {
        const tnow = fx.timeS
        for (const sm of fx.smoke) {
          const k = sm.age / 0.85
          const al = (1 - k) * 0.16
          fan(sm.x, sm.y, sm.z, 0.35 + k * 1.7, [0.1 * al * 6, 0.105 * al * 6, 0.115 * al * 6])
        }
        if (fx.wet > 0.03) {
          // Continuous rain: each drop keeps a STABLE phase and speed,
          // and re-rolls its position only at the instant it wraps, so
          // the field never falls as a synchronised curtain.
          const nStr = Math.floor(100 * fx.wet)
          const span = 10
          for (let i2 = 0; i2 < nStr; i2++) {
            const hh = hash01(1913, i2 * 13)
            const spd = 11 + hh * 5
            const tt = tnow * spd + hh * 97
            const cyc = Math.floor(tt / span)
            const drop = tt - cyc * span
            const ox = (hash01(3121, i2 * 29 + cyc * 101) - 0.5) * 20
            const oy = hash01(517, i2 * 7 + cyc * 61) * 18
            const bx2 = fx.carX + Math.cos(fx.carH) * (4 + oy) + -Math.sin(fx.carH) * ox
            const by2 = fx.carY + Math.sin(fx.carH) * (4 + oy) + Math.cos(fx.carH) * ox
            const zTop = fx.groundZ + 9.5 - drop
            const edge = Math.min(1, drop, span - drop)
            const a3 = 0.17 * fx.wet * edge
            g.push(bx2, by2, zTop, 0, 0, 0, a3, a3, a3 * 1.3)
            g.push(bx2 + 0.16 - Math.cos(fx.carH) * 0.3, by2 - Math.sin(fx.carH) * 0.3, zTop - 1.5, 0, 0, 0, 0, 0, 0)
            g.push(bx2 - 0.16 - Math.cos(fx.carH) * 0.3, by2 - Math.sin(fx.carH) * 0.3, zTop - 1.5, 0, 0, 0, 0, 0, 0)
          }
        }
        for (const lh of fx.lighthouses) {
          const fl2 = Math.max(0.1, Math.pow(Math.max(0, Math.sin(tnow * 0.9 + lh.phase)), 24))
          fan(lh.x, lh.y, lh.z, 2.6 * fl2 + 0.7, [1.5 * fl2, 1.35 * fl2, 1.0 * fl2])
          const ba = tnow * 0.5 + lh.phase
          g.push(lh.x, lh.y, lh.z, 0, 0, 0, 0.5 * fl2 + 0.12, 0.45 * fl2 + 0.11, 0.34 * fl2 + 0.08)
          g.push(lh.x + Math.cos(ba) * 46, lh.y + Math.sin(ba) * 46, lh.z + 2, 0, 0, 0, 0, 0, 0)
          g.push(lh.x + Math.cos(ba) * 46, lh.y + Math.sin(ba) * 46, lh.z - 2, 0, 0, 0, 0, 0, 0)
        }
        for (const ac of fx.accents) {
          const half: number[] = [ac.col[0]! * 0.6, ac.col[1]! * 0.6, ac.col[2]! * 0.6]
          fan(ac.x, ac.y, ac.z, ac.r, half)
          fan(ac.x, ac.y, ac.z, ac.r * 0.55, half)
        }
        for (const w of fx.windows) {
          const fl2 = 0.35 + 0.65 * Math.abs(Math.sin(tnow * w.rate + w.phase))
          fan(w.x, w.y, w.z, 0.8, w.blue ? [0.2 * fl2, 0.3 * fl2, 0.55 * fl2] : [0.5 * fl2, 0.33 * fl2, 0.12 * fl2])
        }
        if (fx.traffic) {
          for (const off of [-0.5, 0.5]) {
            fan(fx.traffic.hx + fx.traffic.nx * off, fx.traffic.hy + fx.traffic.ny * off, fx.traffic.hz, 0.85, [0.9, 0.9, 1.05])
          }
        }
      }
      const gf = new Float32Array(g)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.depthMask(false)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glowBuf)
      gl.bufferData(gl.ARRAY_BUFFER, gf, gl.DYNAMIC_DRAW)
      gl.vertexAttribPointer(this.loc.pos, 3, gl.FLOAT, false, 36, 0)
      gl.vertexAttribPointer(this.loc.nrm, 3, gl.FLOAT, false, 36, 12)
      gl.vertexAttribPointer(this.loc.col, 3, gl.FLOAT, false, 36, 24)
      gl.uniformMatrix4fv(this.loc.model, false, IDENT)
      gl.uniform1f(this.loc.slide, 0)
      gl.drawArrays(gl.TRIANGLES, 0, gf.length / 9)
      gl.depthMask(true)
      gl.disable(gl.BLEND)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(this.post)
    gl.uniform1f(gl.getUniformLocation(this.post, 'uSpd'), Math.min(1, (this.fx?.speed ?? 0) / 50))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex)
    gl.uniform1i(this.loc.postTex, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.vertexAttribPointer(this.loc.postP, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(this.loc.postP)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.enable(gl.DEPTH_TEST)
  }
}
