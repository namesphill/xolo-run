// World ambience for Xolo Run: Van Gogh-style swirling blue sky dome + PMREM environment, bright afternoon
// lights with stable shadows, jade Xochimilco canal water (the running surface), ripples/splashes,
// whirlpool + ford materials, floating marigold / bougainvillea petals, pooled GPU particles.
import * as THREE from 'three';

const SUN_DIR = new THREE.Vector3(0.4, 0.42, -1).normalize();      // visible sun: front-right, mid-afternoon
const LIGHT_DIR = new THREE.Vector3(0.22, 1.0, -0.55).normalize();  // shadow light: steeper so tall banks don't swallow the lanes

const COLORS = {
  uHorizon: '#7fbcf0', uCerulean: '#3d8fe0', uCobalt: '#1d4fbf', uDeepBlue: '#14318f', uSkyLight: '#8cc6f5',
  uCream: '#fff3d0', uYellow: '#ffd23a', uSunGlow: '#ffe7a8', uSunColor: '#fff6dc',
  uMount: '#4f63a8', uSnow: '#f2f6ff', uHill: '#3f6a86', uSmoke: '#a9c4ea',
  uDeep: '#0b3a2e', uShallow: '#1f7558', uJade: '#3fa57c', uMurk: '#4f5a22', uAbyss: '#03140f',
};

// ---------- GLSL shared by sky / water / ford / whirlpool ----------
const GLSL_COMMON = /* glsl */`
uniform vec3 uSunDir; uniform float uTime;
uniform vec3 uHorizon, uCerulean, uCobalt, uSkyLight, uSunGlow, uSunColor;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
// Cheap analytic sky for reflections (linear HDR).
vec3 skyGradient(vec3 dir, float glow){
  float e = max(dir.y, 0.0);
  vec3 c = mix(uHorizon, uSkyLight, smoothstep(0.0, 0.12, e));
  c = mix(c, uCerulean, smoothstep(0.08, 0.4, e));
  c = mix(c, uCobalt, smoothstep(0.35, 0.95, e));
  float sd = max(dot(dir, uSunDir), 0.0);
  c += uSunGlow * (pow(sd, 24.0) * 0.5 + pow(sd, 300.0) * 2.0) * glow;
  return c;
}
`;

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAG = /* glsl */`
${GLSL_COMMON}
uniform vec3 uDeepBlue, uCream, uYellow, uMount, uSnow, uHill, uSmoke;
uniform float uSunBoost;
varying vec3 vDir;
#define POPO -0.42
#define IZTA -0.98
vec2 swirl(vec2 p, vec2 c, float r, float k){
  vec2 d = p - c; float l2 = dot(d, d);
  float a = k * exp(-l2 / (r * r));
  float s = sin(a), co = cos(a);
  return c + mat2(co, s, -s, co) * d;
}
float spiral(vec2 p, vec2 c, float r, float dirn){
  vec2 d = p - c; float l = length(d);
  float s = sin(atan(d.y, d.x) * 2.0 * dirn + l * 22.0 / r - uTime * 0.35 * dirn);
  return smoothstep(0.55, 0.95, s) * exp(-l * l / (r * r)) * smoothstep(0.03 * r, 0.2 * r, l);
}
float izta(float a){
  float h = 0.04 * exp(-pow((a - IZTA) / 0.26, 2.0));
  h = max(h, 0.066 * exp(-pow((a - (IZTA - 0.15)) / 0.04, 2.0)));
  h = max(h, 0.08 * exp(-pow((a - (IZTA - 0.06)) / 0.055, 2.0)));
  h = max(h, 0.07 * exp(-pow((a - (IZTA + 0.04)) / 0.05, 2.0)));
  h = max(h, 0.074 * exp(-pow((a - (IZTA + 0.12)) / 0.04, 2.0)));
  h = max(h, 0.055 * exp(-pow((a - (IZTA + 0.21)) / 0.045, 2.0)));
  return h;
}
void main(){
  vec3 dir = normalize(vDir);
  float e = max(dir.y, 0.0);
  float sd = max(dot(dir, uSunDir), 0.0);
  float el = asin(clamp(dir.y, -1.0, 1.0));
  float az = atan(dir.x, -dir.z);

  // --- Van Gogh brushwork: swirl-warped flow field, banded palette, bristle grain ---
  vec2 p = dir.xz / (dir.y + 0.32) * 1.15;
  p = swirl(p, vec2(-1.5, -2.1), 0.95, 2.8);
  p = swirl(p, vec2(1.6, -0.9), 0.7, -2.4);
  p = swirl(p, vec2(-0.3, 0.6), 1.2, 2.1);
  vec2 w = vec2(vnoise(p * 1.25 + uTime * 0.025), vnoise(p * 1.25 + 7.7 - uTime * 0.02));
  vec2 q = p + (w - 0.5) * 0.85;
  float field = vnoise(q * 1.7) * 0.65;
  #ifdef HQ
    field += vnoise(q * 3.6 + 2.0) * 0.35;
    float grain = vnoise(vec2(q.x * 9.0 + q.y * 2.0, q.y * 46.0 - q.x * 8.0));
  #else
    field += 0.17;
    float grain = 0.5;
  #endif
  float stripes = sin(q.y * 24.0 + q.x * 5.0 + field * 13.0);
  float b = field + stripes * 0.1 + (grain - 0.5) * 0.3 + (0.22 - e) * 0.75;
  vec3 c = mix(uDeepBlue, uCobalt, smoothstep(0.0, 0.18, b));
  c = mix(c, uCerulean, smoothstep(0.26, 0.38, b));
  c = mix(c, uSkyLight, smoothstep(0.5, 0.6, b));
  c = mix(c, uCream, smoothstep(0.74, 0.84, b) * 0.85);
  // explicit spiral strokes (cream) around the swirl centres
  float sp = spiral(p, vec2(-1.5, -2.1), 0.95, 1.0) + spiral(p, vec2(1.6, -0.9), 0.7, -1.0) * 0.8;
  c = mix(c, mix(uCream, uSkyLight, 0.35 + 0.3 * stripes), clamp(sp, 0.0, 1.0) * 0.75 * smoothstep(0.03, 0.12, e));

  // --- stylized sun: cream disc + concentric yellow impasto rings ---
  float ang = acos(clamp(sd, -1.0, 1.0));
  float rings = 0.5 + 0.5 * sin(ang * 95.0 - field * 7.0 + grain * 2.0 - uTime * 0.6);
  float halo = exp(-ang * 7.0);
  vec3 sunCol = mix(uYellow, uCream, rings);
  c = mix(c, sunCol * 1.15, clamp(halo * (0.55 + 0.45 * rings) * 1.25, 0.0, 0.92));
  float disc = smoothstep(0.075, 0.06, ang);
  c = mix(c, uSunColor * uSunBoost, disc);

  // --- distant volcanoes + hills in blue haze ---
  const float POPO_TOP = 0.112;
  float rise = el - POPO_TOP;
  if (rise > 0.0 && rise < 0.16) {
    float cx = POPO + rise * 1.1 + 0.012 * sin(rise * 50.0 - uTime * 0.25);
    float wd = 0.007 + rise * 0.3;
    float dd = exp(-pow((az - cx) / wd, 2.0)) * exp(-rise * 11.0) * smoothstep(0.0, 0.006, rise);
    c = mix(c, uSmoke, clamp(dd, 0.0, 0.8));
  }
  float tp = max(0.0, 1.0 - abs(az - POPO) / 0.3);
  float hM = max(0.12 * min(pow(tp, 1.35), 0.935), izta(az));
  hM += (vnoise(vec2(az * 70.0, 1.7)) - 0.5) * 0.0025 * step(0.004, hM);
  float m = smoothstep(hM + 0.0012, hM - 0.0012, el) * step(0.0005, hM);
  if (m > 0.0) {
    float rel = clamp(el / max(hM, 0.001), 0.0, 1.0);
    float sn = smoothstep(hM - 0.04 - 0.014 * vnoise(vec2(az * 55.0, el * 90.0)), hM - 0.026, el) * smoothstep(0.035, 0.06, hM);
    vec3 mc = mix(uMount, uSnow, sn * 0.9);
    mc = mix(mc, uHorizon, 0.2 + 0.6 * pow(1.0 - rel, 1.6));
    c = mix(c, mc, m);
  }
  float hills = 0.013 + 0.008 * sin(az * 6.0 + 1.3) + 0.005 * sin(az * 13.0 + 0.4) + 0.003 * sin(az * 29.0 + 2.0)
              + 0.0025 * vnoise(vec2(az * 140.0, 0.5));
  float hm = smoothstep(hills + 0.0012, hills - 0.0012, el);
  c = mix(c, mix(uHill, uHorizon, 0.4 + 0.4 * (1.0 - clamp(el / hills, 0.0, 1.0))), hm);

  // horizon haze -> exactly the fog colour at/below the horizon
  c = mix(c, uHorizon, smoothstep(0.03, -0.01, el));

  gl_FragColor = vec4(c, 1.0);
  #ifndef ENV_PASS
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  #endif
}`;

const WORLD_VERT = /* glsl */`
varying vec3 vWorld; varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_VERT = /* glsl */`
#include <common>
#include <shadowmap_pars_vertex>
#include <fog_pars_vertex>
varying vec3 vWorld; varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  vec3 transformedNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <shadowmap_vertex>
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */`
#include <common>
#include <packing>
uniform bool receiveShadow;
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${GLSL_COMMON}
uniform vec3 uDeep, uShallow, uJade, uMurk;
varying vec3 vWorld; varying vec2 vUv;
#include <fog_pars_fragment>
void wave(inout vec2 g, vec2 p, vec2 d, float f, float a, float s){ g += d * (f * a * cos(dot(d, p) * f + uTime * s)); }
void main(){
  vec2 p = vWorld.xz;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float lod = 1.0 / (1.0 + dist * 0.03);
  vec2 g = vec2(0.0);
  wave(g, p, vec2(0.0, 1.0), 0.6, 0.05, 1.2);
  wave(g, p, vec2(0.8, 0.6), 1.0, 0.03, 1.6);
  wave(g, p, vec2(-0.7, 0.71), 1.7, 0.018, 2.2);
  #ifdef HQ
  wave(g, p, vec2(0.3, -0.95), 2.9, 0.01, 3.0);
  wave(g, p, vec2(-0.95, -0.3), 4.6, 0.006, 3.9);
  #endif
  // stylized ripple strokes: contour lines of a slow flow field, stretched along the canal (z)
  vec2 fq = vec2(p.x * 0.75, p.y * 0.3) + vec2(sin(uTime * 0.2) * 0.3, uTime * 0.22);
  float rf = vnoise(fq) * 0.62 + vnoise(fq * 2.3 + vec2(-uTime * 0.18, 3.1)) * 0.38;
  float band = abs(fract(rf * 4.0) - 0.5);
  float stroke = (1.0 - smoothstep(0.025, 0.075 + 0.1 * (1.0 - lod), band)) * lod;
  g += vec2(0.0, (band - 0.25) * 0.12) * lod;
  g *= lod;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  fres = min(mix(fres, 1.0, smoothstep(30.0, 140.0, dist) * 0.4), 0.5) * 0.8;
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 refl = skyGradient(R, 0.15) * 0.85;
  // murky swampy jade body: algae patches + green depth tint
  float algae = vnoise(p * 0.12 + 3.0) * 0.6 + vnoise(p * 0.45 - uTime * 0.01) * 0.4;
  vec3 body = mix(uDeep, uShallow, 0.45 + 0.4 * (1.0 - ndv));
  body = mix(body, uMurk, smoothstep(0.55, 0.85, algae) * 0.45);
  body = mix(body, uJade, smoothstep(0.25, 0.05, algae) * 0.35);
  body *= 0.85 + 0.3 * max(dot(N, uSunDir), 0.0);
  float shadow = getShadowMask();
  body *= mix(0.62, 1.0, shadow);   // keep shaded lanes readable under tall banks
  vec3 col = mix(body, refl * mix(0.8, 1.0, shadow), fres);
  // brushy highlight strokes: catch the sky and a bit of cream
  col = mix(col, mix(refl, vec3(1.0, 0.97, 0.88), 0.2) * 0.9, stroke * 0.3);
  float rs = max(dot(R, uSunDir), 0.0);
  col += uSunColor * (pow(rs, 900.0) * 1.4 + pow(rs, 140.0) * 0.06) * shadow;
  #ifdef HQ
  vec2 cell = p * 5.0; float spark = step(0.92, hash12(floor(cell) + floor(uTime * 6.0))) * (1.0 - smoothstep(0.05, 0.15, length(fract(cell) - 0.5)));
  col += uSunColor * spark * pow(rs, 30.0) * 2.5;
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const FORD_FRAG = /* glsl */`
${GLSL_COMMON}
uniform vec3 uDeep, uShallow;
uniform vec2 uFlow;
uniform float uOpacity;
varying vec3 vWorld; varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  vec2 p = vWorld.xz;
  vec2 fd = normalize(uFlow);
  vec2 fp = vec2(dot(p, fd), dot(p, vec2(-fd.y, fd.x)));
  float t = uTime;
  float ph1 = fp.x * 5.0 - t * 3.2 + sin(fp.y * 2.3 + t) * 0.9;
  float ph2 = fp.x * 9.0 + fp.y * 3.0 - t * 4.7;
  float ph3 = fp.y * 7.0 + fp.x * 2.0 - t * 2.1;
  vec2 g = fd * (cos(ph1) * 0.09 + cos(ph2) * 0.05) + vec2(-fd.y, fd.x) * cos(ph3) * 0.04;
  vec2 q = fp * vec2(2.2, 3.0) - vec2(t * 1.6, 0.0);
  float n = vnoise(q) * 0.6 + vnoise(q * 2.3 + 5.0) * 0.4;
  g += (vec2(vnoise(q + 3.7), vnoise(q - 9.1)) - 0.5) * 0.15;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 col = mix(mix(uShallow, uDeep, 0.3) * 1.2, skyGradient(R, 1.0), fres * 0.8);
  float rs = max(dot(R, uSunDir), 0.0);
  col += uSunColor * (pow(rs, 160.0) * 3.0 + pow(rs, 16.0) * 0.15);
  float foam = smoothstep(0.62, 0.8, n) * (0.55 + 0.45 * sin(ph1));
  col = mix(col, vec3(1.0, 0.98, 0.94), foam * 0.55);
  float a = clamp(uOpacity + fres * 0.35 + foam * 0.3, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const WHIRL_FRAG = /* glsl */`
${GLSL_COMMON}
uniform vec3 uDeep, uShallow, uJade, uAbyss;
uniform vec2 uSize; uniform float uSpin;
varying vec3 vWorld; varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  vec2 p = (vUv - 0.5) * uSize;
  vec2 hs = uSize * 0.5;
  // capsule-ish elliptical distance so long whirlpools stay round-ended
  float lx = max(0.0, hs.y - hs.x);
  vec2 pc = vec2(p.x, sign(p.y) * max(abs(p.y) - lx, 0.0));
  float d = length(pc) / hs.x;                 // 0 centre .. 1 rim
  float a = atan(p.y, p.x);
  float t = uTime * uSpin;
  float sw = a * 3.0 + 3.2 / (d + 0.12) - t * 3.0 + p.y * 0.25;
  float n = vnoise(vec2(sw * 0.8, d * 6.0 - t)) ;
  float arms = smoothstep(0.35, 0.95, sin(sw + n * 2.5));
  float foam = smoothstep(0.82, 0.98, sin(sw * 2.0 + n * 4.0)) * smoothstep(0.12, 0.4, d) * (1.0 - smoothstep(0.7, 1.0, d));
  float depth = 1.0 - smoothstep(0.0, 0.95, d);
  vec3 col = mix(uShallow, uDeep, 0.5 + 0.5 * depth);
  col = mix(col, uAbyss, smoothstep(0.35, 1.0, depth));
  col = mix(col, uJade * 1.1, arms * 0.45 * (1.0 - depth * 0.6));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vec3(-p.x * 0.15 * depth, 1.0, -p.y * 0.05 * depth));
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  float fres = 0.04 + 0.6 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col = mix(col, skyGradient(R, 1.0), fres * (0.3 + 0.7 * arms));
  col = mix(col, vec3(0.92, 0.98, 0.95), foam * 0.7);
  float eye = smoothstep(0.16, 0.0, d);
  col = mix(col, uAbyss * 0.4, eye);
  float alpha = 1.0 - smoothstep(0.8, 1.0, d);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ---------- ripple ring decals ----------
const RING_VERT = /* glsl */`
attribute vec4 aR; // x, z, birth, strength
uniform float uTime, uWaterY;
varying vec2 vLocal; varying float vK; varying float vS;
void main(){
  float life = 0.9 + 0.7 * aR.w;
  float age = uTime - aR.z;
  vK = age / life; vS = aR.w;
  if (age < 0.0 || vK >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float R = 0.35 + 1.5 * sqrt(aR.w);
  vLocal = position.xy * 2.0;
  vec3 wp = vec3(aR.x + position.x * 2.0 * R, uWaterY + 0.012, aR.y - position.y * 2.0 * R);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const RING_FRAG = /* glsl */`
varying vec2 vLocal; varying float vK; varying float vS;
void main(){
  float r = length(vLocal);
  float k = vK;
  float R1 = 1.0 - pow(1.0 - k, 2.2);
  float R2 = R1 * 0.62;
  float w = 0.05 + 0.05 * k;
  float ring = exp(-pow((r - R1) / w, 2.0)) + 0.6 * exp(-pow((r - R2) / (w * 0.8), 2.0)) * step(0.08, k);
  float a = ring * (1.0 - k) * clamp(0.45 + 0.55 * vS, 0.0, 1.0) * 0.8;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.92, 0.98, 1.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}`;

// ---------- particles ----------
const KIND = { confetti: 0, dust: 1, splash: 2, sparkle: 3 };
const BURST_DEFAULTS = {
  confetti: { count: 28, colors: [0xff1f8e, 0xffd000, 0x00c2c7, 0xff7a00, 0x9b2fd6, 0x22c04a], speed: 5.0, life: 1.4, size: 0.17, gravity: 7 },
  dust: { count: 14, colors: [0xc9a27a, 0xe8cfa8, 0xb38a60], speed: 1.8, life: 0.75, size: 0.38, gravity: -0.6 },
  splash: { count: 30, colors: [0xeafff8, 0xbdf0e0, 0xffffff, 0x9fdcc8], speed: 4.5, life: 0.9, size: 0.13, gravity: 13 },
  sparkle: { count: 14, colors: [0xfff1a8, 0xffd34d, 0xffffff], speed: 2.4, life: 0.65, size: 0.34, gravity: 0 },
};

const PART_VERT = /* glsl */`
attribute vec4 aP0; attribute vec4 aV; attribute vec4 aP; attribute vec3 aC;
uniform float uTime, uWaterY; uniform vec3 uSunDir;
varying vec2 vUv; varying vec3 vColor; varying float vKind; varying float vFade;
mat3 rotAxis(vec3 a, float r){ float s = sin(r), c = cos(r), oc = 1.0 - c;
  return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
              oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
              oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c); }
void main(){
  float age = uTime - aP0.w;
  float k = age / aV.w;
  vUv = uv; vColor = aC; vKind = aP.z; vFade = 1.0;
  if (age < 0.0 || k >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float kind = aP.z, seed = aP.w;
  float drag = kind < 0.5 ? 2.2 : (kind < 1.5 ? 3.5 : (kind < 2.5 ? 0.5 : 2.5));
  vec3 pos = aP0.xyz + aV.xyz * (1.0 - exp(-drag * age)) / drag;
  float grav = aP.y;
  if (kind < 0.5) {
    pos.y -= grav * (age - (1.0 - exp(-2.5 * age)) / 2.5) / 2.5;
    pos.x += sin(age * 7.0 + seed * 6.28) * 0.18 * k;
    pos.z += cos(age * 6.0 + seed * 9.0) * 0.12 * k;
  } else {
    pos.y -= 0.5 * grav * age * age;
  }
  float s = aP.x;
  if (kind < 0.5) s *= 1.0 - smoothstep(0.75, 1.0, k);
  else if (kind < 1.5) { s *= 0.5 + 1.6 * k; vFade = (1.0 - k) * smoothstep(0.0, 0.12, k); }
  else if (kind < 2.5) { s *= 1.0 - 0.5 * k; vFade = 1.0 - smoothstep(0.7, 1.0, k); if (pos.y < uWaterY - 0.03 && age > 0.05) s = 0.0; }
  else { s *= sin(3.14159 * k) * (0.75 + 0.25 * sin(age * 40.0 + seed * 20.0)); }
  vec4 mv;
  if (kind < 0.5) {
    vec3 axis = normalize(vec3(fract(seed * 3.7) - 0.5, fract(seed * 7.1) - 0.5, fract(seed * 11.3) - 0.5) + 0.001);
    mat3 R = rotAxis(axis, age * (6.0 + 8.0 * fract(seed * 5.3)) + seed * 10.0);
    vec3 off = R * vec3(position.x * s, position.y * s * 0.6, 0.0);
    vec3 nrm = R * vec3(0.0, 0.0, 1.0);
    vColor *= 0.6 + 0.6 * abs(dot(nrm, uSunDir)) + 0.15 * abs(nrm.y);
    mv = viewMatrix * vec4(pos + off, 1.0);
  } else {
    mv = viewMatrix * vec4(pos, 1.0);
    vec2 o = position.xy * s;
    if (kind > 1.5 && kind < 2.5) { o.y *= 1.5; }   // droplets: upright, slightly elongated
    else { float r = seed * 6.28 + (kind > 2.5 ? age * 2.0 : 0.0); o = mat2(cos(r), sin(r), -sin(r), cos(r)) * o; }
    mv.xy += o;
  }
  gl_Position = projectionMatrix * mv;
}`;

const PART_FRAG = /* glsl */`
varying vec2 vUv; varying vec3 vColor; varying float vKind; varying float vFade;
void main(){
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float a; float add = 0.0; vec3 col = vColor;
  if (vKind < 0.5) { a = 1.0; }
  else if (vKind < 1.5) { a = (1.0 - smoothstep(0.15, 1.0, r)) * 0.55; }
  else if (vKind < 2.5) { a = (1.0 - smoothstep(0.5, 1.0, r)) * 0.95; col *= 1.15 + 0.35 * (1.0 - r); }
  else {
    float star = max(0.0, 1.0 - abs(uv.x * uv.y) * 18.0) * (1.0 - r);
    a = clamp(pow(max(0.0, 1.0 - r), 3.0) + star * 1.4, 0.0, 1.0);
    col *= 2.4; add = 1.0;
  }
  a *= vFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - add));
}`;

// ---------- helpers ----------
function acesFilmic(c, exposure) {
  const v = [c.r, c.g, c.b].map((x) => x * exposure / 0.6);
  const i = [
    0.59719 * v[0] + 0.35458 * v[1] + 0.04823 * v[2],
    0.07600 * v[0] + 0.90834 * v[1] + 0.01566 * v[2],
    0.02840 * v[0] + 0.13383 * v[1] + 0.83777 * v[2],
  ].map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081));
  const o = [
    1.60475 * i[0] - 0.53108 * i[1] - 0.07367 * i[2],
    -0.10208 * i[0] + 1.10813 * i[1] - 0.00605 * i[2],
    -0.00327 * i[0] - 0.07276 * i[1] + 1.07602 * i[2],
  ].map((x) => Math.min(1, Math.max(0, x)));
  return new THREE.Color(o[0], o[1], o[2]);   // linear; three converts to sRGB for the fog uniform
}

function makePetalGeometry() {
  const g = new THREE.CircleGeometry(0.5, 7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 0.15, y = p.getY(i) * 0.085;
    p.setXYZ(i, x, y, (x * x) * 6.0 - Math.abs(y) * 0.4);
  }
  g.computeVertexNormals();
  return g;
}

const MARIGOLD = [0xff8a00, 0xffa600, 0xff6a00, 0xffc21a, 0xff9a10];
const BOUGAINVILLEA = [0xe3127f, 0xff2fa0, 0xc40f7a, 0xb5179e];

// ---------- main ----------
export function createWorld(renderer, scene, { quality = 'high', waterY = 0, shadowBox } = {}) {
  const hq = quality !== 'low';
  const shared = { uSunDir: { value: SUN_DIR.clone() }, uTime: { value: 0 }, uWaterY: { value: waterY } };
  for (const [k, hex] of Object.entries(COLORS)) shared[k] = { value: new THREE.Color(hex) };

  const exposure = renderer.toneMappingExposure ?? 1;
  const fogColor = renderer.toneMapping === THREE.ACESFilmicToneMapping
    ? acesFilmic(shared.uHorizon.value, exposure) : shared.uHorizon.value.clone();
  scene.fog = new THREE.Fog(fogColor, 45, 170);
  renderer.setClearColor(fogColor, 1);

  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  // ----- sky dome -----
  const skyGeo = new THREE.SphereGeometry(1, 48, 24);
  const makeSkyMat = (env) => new THREE.ShaderMaterial({
    name: env ? 'SkyEnv' : 'Sky',
    uniforms: { ...shared, uSunBoost: { value: env ? 30 : 2.2 } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    defines: env ? { ENV_PASS: 1, HQ: 1 } : (hq ? { HQ: 1 } : {}),
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const skyMat = makeSkyMat(false);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.name = 'sky';
  group.add(sky);

  // ----- environment: PMREM of the same sky with an HDR sun -----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(skyGeo, makeSkyMat(true));
  envSky.frustumCulled = false;
  envScene.add(envSky);
  const envRT = pmrem.fromScene(envScene, 0, 0.1, 10);
  envSky.material.dispose();
  pmrem.dispose();
  scene.environment = envRT.texture;

  // ----- lights -----
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5f9c6a, 1.15);
  const sun = new THREE.DirectionalLight(0xfff0d6, 3.0);
  sun.name = 'sun';
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  const fill = new THREE.DirectionalLight(0xffe2c4, 0.6);   // warm bounce from behind the camera, lifts shadowed lanes
  fill.name = 'fill';
  group.add(hemi, sun, sun.target, fill, fill.target);
  const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LIGHT_DIR).normalize();
  const lightUp = new THREE.Vector3().crossVectors(LIGHT_DIR, lightRight).normalize();
  const LIGHT_DIST = 70;
  const sb = { halfWidth: 12, ahead: 40, behind: 10, height: 16, ...shadowBox };
  const sbCenter = new THREE.Vector3();
  function fitShadowBox() {
    // light-space bounds of the world box around the player (x ±halfWidth, y 0..height, z +behind .. -ahead)
    sbCenter.set(0, sb.height / 2, (sb.behind - sb.ahead) / 2);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    const c = new THREE.Vector3();
    for (const x of [-sb.halfWidth, sb.halfWidth]) for (const y of [0, sb.height]) for (const z of [sb.behind, -sb.ahead]) {
      c.set(x, y, z).sub(sbCenter);
      const u = c.dot(lightRight), v = c.dot(lightUp), w = c.dot(LIGHT_DIR);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); w0 = Math.min(w0, w); w1 = Math.max(w1, w);
    }
    const cam = sun.shadow.camera;
    // shadow camera (lookAt from +LIGHT_DIR, up=+Y) has +x = lightRight, +y = lightUp
    cam.left = u0; cam.right = u1; cam.bottom = v0; cam.top = v1;
    cam.near = Math.max(0.5, LIGHT_DIST - w1 - 4); cam.far = LIGHT_DIST - w0 + 4;
    cam.updateProjectionMatrix();
  }

  // ----- water (the running surface) -----
  const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const makeWaterMaterial = (hqWater = world.quality === 'high') => new THREE.ShaderMaterial({
    name: 'CanalWater', uniforms: { ...fogUniforms(), ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights), ...shared },
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    defines: hqWater ? { HQ: 1 } : {}, fog: true, lights: true,
  });
  const world = { quality: hq ? 'high' : 'low' };
  const waterMaterial = makeWaterMaterial(hq);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = waterY;
  water.name = 'water';
  water.receiveShadow = true;
  water.frustumCulled = false;
  group.add(water);

  function makeFordWaterMaterial({ flow = [1, 0], opacity = 0.42 } = {}) {
    return new THREE.ShaderMaterial({
      name: 'FordWater',
      uniforms: { ...fogUniforms(), ...shared, uFlow: { value: new THREE.Vector2(flow[0], flow[1]) }, uOpacity: { value: opacity } },
      vertexShader: WORLD_VERT, fragmentShader: FORD_FRAG,
      transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
  }

  // For a PlaneGeometry(width, length) rotated -PI/2 on X, placed at waterY + ~0.015.
  function makeWhirlpoolMaterial({ width = 6.6, length = 8, spin = 1 } = {}) {
    const m = new THREE.ShaderMaterial({
      name: 'Whirlpool',
      uniforms: { ...fogUniforms(), ...shared, uSize: { value: new THREE.Vector2(width, length) }, uSpin: { value: spin } },
      vertexShader: WORLD_VERT, fragmentShader: WHIRL_FRAG,
      transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    m.setSize = (w, l) => m.uniforms.uSize.value.set(w, l);
    return m;
  }

  // ----- petals: drifting in the air + floating on the water -----
  const PETAL_MAX = 260;
  const petalBox = new THREE.Vector3(13, 4.5, 24);
  const petalUniforms = { uTime: shared.uTime, uWaterY: shared.uWaterY, uCenter: { value: new THREE.Vector3() }, uBox: { value: petalBox } };
  const petalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.0,
  });
  petalMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, petalUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aSeed; attribute vec2 aKind; uniform float uTime, uWaterY; uniform vec3 uCenter; uniform vec3 uBox;
        mat3 rotAxis(vec3 a, float r){ float s = sin(r), c = cos(r), oc = 1.0 - c;
          return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
                      oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
                      oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c); }`)
      .replace('#include <beginnormal_vertex>', `
        float sd = aSeed.w;
        bool floating = aKind.y > 0.5;
        mat3 pR;
        if (floating) {
          float yaw = sd * 40.0 + uTime * 0.15 * (fract(sd * 7.7) - 0.5);
          mat3 lay = mat3(1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0);
          pR = rotAxis(vec3(0.0, 1.0, 0.0), yaw) * lay;
        } else {
          vec3 pAxis = normalize(vec3(fract(sd * 3.1) - 0.5, fract(sd * 5.7) - 0.2, fract(sd * 9.2) - 0.5));
          pR = rotAxis(pAxis, uTime * (0.9 + 1.8 * fract(sd * 7.3)) + sd * 20.0);
        }
        vec3 objectNormal = pR * normal;`)
      .replace('#include <begin_vertex>', `
        vec3 pv = floating ? vec3(0.08 * (fract(sd * 2.3) - 0.5), 0.0, 0.25 * fract(sd * 4.9))
                           : vec3(0.6 + 0.5 * fract(sd * 2.3), -(0.25 + 0.3 * fract(sd * 13.1)), 0.9 + 0.8 * fract(sd * 4.9));
        vec3 pp = aSeed.xyz * 2.0 * uBox + pv * uTime;
        if (!floating) { pp.x += sin(uTime * 0.7 + sd * 30.0) * 0.6; pp.y += sin(uTime * 1.1 + sd * 17.0) * 0.25; }
        vec3 rel = mod(pp - uCenter + uBox, 2.0 * uBox) - uBox;
        float edge = 1.0 - smoothstep(0.75, 1.0, max(abs(rel.x) / uBox.x, abs(rel.z) / uBox.z));
        if (!floating) edge *= 1.0 - smoothstep(0.8, 1.0, abs(rel.y) / uBox.y);
        vec3 wpos = uCenter + rel;
        if (floating) wpos.y = uWaterY + 0.03 + 0.012 * sin(uTime * 2.0 + sd * 30.0);
        float near = smoothstep(0.6, 2.2, distance(wpos, cameraPosition));
        vec3 transformed = pR * position * aKind.x * (0.75 + 0.5 * fract(sd * 21.7)) * edge * near + wpos;`);
  };
  const petalGeo = makePetalGeometry();
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, PETAL_MAX);
  {
    const seeds = new Float32Array(PETAL_MAX * 4), kinds = new Float32Array(PETAL_MAX * 2);
    const col = new THREE.Color();
    for (let i = 0; i < PETAL_MAX; i++) {
      seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      const bougain = Math.random() < 0.28;
      const floating = (i % 3) === 0;          // every third petal floats on the canal
      kinds.set([bougain ? 1.45 : 1.0, floating ? 1 : 0], i * 2);
      const pal = bougain ? BOUGAINVILLEA : MARIGOLD;
      col.setHex(pal[(Math.random() * pal.length) | 0]);
      petals.setColorAt(i, col);
    }
    petalGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    petalGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 2));
  }
  petals.frustumCulled = false;
  petals.name = 'petals';
  group.add(petals);

  // ----- particle pool (one draw call, motion on GPU) -----
  const POOL = 1024;
  const quad = new THREE.PlaneGeometry(1, 1);
  const pGeo = new THREE.InstancedBufferGeometry();
  pGeo.index = quad.index;
  pGeo.setAttribute('position', quad.attributes.position);
  pGeo.setAttribute('uv', quad.attributes.uv);
  const mk = (n, count = POOL) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(count * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const aP0 = mk(4), aV = mk(4), aP = mk(4), aC = mk(3);
  for (let i = 0; i < POOL; i++) aP0.array[i * 4 + 3] = -1e6;
  pGeo.setAttribute('aP0', aP0); pGeo.setAttribute('aV', aV); pGeo.setAttribute('aP', aP); pGeo.setAttribute('aC', aC);
  pGeo.instanceCount = POOL;
  const premulBlend = {
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  };
  const partMat = new THREE.ShaderMaterial({
    name: 'Particles', uniforms: { uTime: shared.uTime, uSunDir: shared.uSunDir, uWaterY: shared.uWaterY },
    vertexShader: PART_VERT, fragmentShader: PART_FRAG, side: THREE.DoubleSide, ...premulBlend,
  });
  const particles = new THREE.Mesh(pGeo, partMat);
  particles.frustumCulled = false;
  particles.renderOrder = 10;
  particles.visible = false;
  particles.name = 'particles';
  group.add(particles);
  let cursor = 0, poolLimit = POOL, aliveUntil = -1, dirty = false;
  const tmpC = new THREE.Color();

  // ----- ripple rings (one draw call) -----
  const RINGS = 48;
  const rGeo = new THREE.InstancedBufferGeometry();
  rGeo.index = quad.index;
  rGeo.setAttribute('position', quad.attributes.position);
  const aR = mk(4, RINGS);
  for (let i = 0; i < RINGS; i++) aR.array[i * 4 + 2] = -1e6;
  rGeo.setAttribute('aR', aR);
  rGeo.instanceCount = RINGS;
  const ringMat = new THREE.ShaderMaterial({
    name: 'Ripples', uniforms: { uTime: shared.uTime, uWaterY: shared.uWaterY },
    vertexShader: RING_VERT, fragmentShader: RING_FRAG, side: THREE.DoubleSide, ...premulBlend,
  });
  const ripples = new THREE.Mesh(rGeo, ringMat);
  ripples.frustumCulled = false;
  ripples.renderOrder = 5;
  ripples.visible = false;
  ripples.name = 'ripples';
  group.add(ripples);
  let ringCursor = 0, ringsUntil = -1, ringsDirty = false;

  Object.assign(world, {
    group, sky, water, petals, particles, ripples,
    sunDir: SUN_DIR.clone(), lightDir: LIGHT_DIR.clone(), fogColor, waterY,
    lights: { hemi, sun, fill }, envMap: envRT.texture,
    waterMaterial, makeWaterMaterial, makeFordWaterMaterial, makeWhirlpoolMaterial,
    uniforms: shared,

    burst(pos, opts = {}) {
      const kindName = opts.kind && KIND[opts.kind] !== undefined ? opts.kind : 'confetti';
      const d = BURST_DEFAULTS[kindName];
      const kind = KIND[kindName];
      let count = Math.round(opts.count ?? d.count);
      if (world.quality === 'low') count = Math.ceil(count * 0.6);
      const colors = opts.colors ?? d.colors, speed = opts.speed ?? d.speed, life = opts.life ?? d.life;
      const size = opts.size ?? d.size, gravity = opts.gravity ?? d.gravity;
      const vel = opts.vel, t = shared.uTime.value;
      for (let n = 0; n < count; n++) {
        const i = cursor; cursor = (cursor + 1) % poolLimit;
        let vx, vy, vz;
        const a = Math.random() * Math.PI * 2;
        if (kind === 0) { const r = 0.35 + Math.random() * 0.65; vx = Math.cos(a) * r; vz = Math.sin(a) * r; vy = 0.7 + Math.random() * 0.8; }
        else if (kind === 1) { const r = 0.6 + Math.random() * 0.4; vx = Math.cos(a) * r; vz = Math.sin(a) * r; vy = 0.1 + Math.random() * 0.35; }
        else if (kind === 2) { const r = 0.2 + Math.random() * 0.55; vx = Math.cos(a) * r; vz = Math.sin(a) * r; vy = 0.6 + Math.random() * 0.7; }
        else { const u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u); vx = Math.cos(a) * s; vz = Math.sin(a) * s; vy = u; }
        const sp = speed * (0.6 + Math.random() * 0.5);
        const jit = kind === 1 ? 0.25 : 0.12;
        aP0.array.set([pos.x + (Math.random() - 0.5) * jit, pos.y + (Math.random() - 0.5) * jit * 0.5, pos.z + (Math.random() - 0.5) * jit, t], i * 4);
        const l = life * (0.7 + Math.random() * 0.5);
        aV.array.set([vx * sp + (vel?.x ?? 0), vy * sp + (vel?.y ?? 0), vz * sp + (vel?.z ?? 0), l], i * 4);
        aP.array.set([size * (0.7 + Math.random() * 0.6), gravity, kind, Math.random()], i * 4);
        tmpC.set(colors[(Math.random() * colors.length) | 0]);
        aC.array.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
        aliveUntil = Math.max(aliveUntil, t + l);
      }
      dirty = true;
      particles.visible = true;
    },

    // Expanding ring ripple on the water surface at pos.x/pos.z. strength ~0.2 (paw) .. 1.5 (big landing).
    ripple(pos, strength = 1) {
      const t = shared.uTime.value;
      aR.array.set([pos.x, pos.z, t, strength], ringCursor * 4);
      ringCursor = (ringCursor + 1) % RINGS;
      ringsUntil = Math.max(ringsUntil, t + 0.9 + 0.7 * strength);
      ringsDirty = true;
      ripples.visible = true;
    },

    // Footfall / jump / landing splash: droplets + ring ripple. strength 0.2 (paw) .. 1.5 (big landing).
    splash(pos, strength = 1, opts = {}) {
      const s = Math.max(0.05, strength);
      const p = _s.set(pos.x, waterY + 0.02, pos.z);
      world.burst(p, {
        kind: 'splash', count: Math.round(4 + 18 * s), speed: 1.6 + 2.6 * Math.sqrt(s),
        size: 0.07 + 0.06 * Math.min(s, 1.5), life: 0.45 + 0.35 * Math.min(s, 1.5), gravity: 12, vel: opts.vel,
      });
      world.ripple(p, s);
      if (s > 0.7) setTimeout(() => world.ripple(p, s * 0.6), 120);
    },

    update(dt, time, focus, camera) {
      shared.uTime.value = time;
      if (camera) sky.position.copy(camera.position);
      if (focus) {
        water.position.x = Math.round(focus.x / 8) * 8;
        water.position.z = Math.round(focus.z / 8) * 8;
        // shadow box around the player, snapped to shadow texels in light space to avoid shimmer
        const f = _v.set(sbCenter.x, sbCenter.y, focus.z + sbCenter.z);
        const cam = sun.shadow.camera;
        const tu = (cam.right - cam.left) / sun.shadow.mapSize.x, tv = (cam.top - cam.bottom) / sun.shadow.mapSize.y;
        const u = Math.round(f.dot(lightRight) / tu) * tu;
        const v = Math.round(f.dot(lightUp) / tv) * tv;
        const w = f.dot(LIGHT_DIR);
        sun.target.position.copy(lightRight).multiplyScalar(u).addScaledVector(lightUp, v).addScaledVector(LIGHT_DIR, w);
        sun.position.copy(sun.target.position).addScaledVector(LIGHT_DIR, LIGHT_DIST);
        fill.target.position.copy(focus);
        fill.position.set(-0.3, 0.6, 1).normalize().multiplyScalar(50).add(focus);
      }
      const cam = camera ? camera.position : focus;
      if (cam) petalUniforms.uCenter.value.set(cam.x, waterY + petalBox.y + 0.3, cam.z - petalBox.z * 0.55);
      if (dirty) { aP0.needsUpdate = aV.needsUpdate = aP.needsUpdate = aC.needsUpdate = true; dirty = false; }
      if (ringsDirty) { aR.needsUpdate = true; ringsDirty = false; }
      if (particles.visible && time > aliveUntil) particles.visible = false;
      if (ripples.visible && time > ringsUntil) ripples.visible = false;
    },

    setShadowBox(box) { Object.assign(sb, box); fitShadowBox(); },

    setQuality(q) {
      const h = q !== 'low';
      world.quality = h ? 'high' : 'low';
      sun.castShadow = h;
      if (h) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const size = Math.min(2048, renderer.capabilities.maxTextureSize);
        if (sun.shadow.mapSize.x !== size) {
          sun.shadow.mapSize.set(size, size);
          if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        }
      }
      for (const m of [skyMat, waterMaterial]) {
        if (('HQ' in m.defines) !== h) { if (h) m.defines.HQ = 1; else delete m.defines.HQ; m.needsUpdate = true; }
      }
      petals.count = h ? PETAL_MAX : 110;
      poolLimit = h ? POOL : 512;
      cursor %= poolLimit;
    },

    dispose() {
      scene.remove(group);
      skyGeo.dispose(); skyMat.dispose(); waterMaterial.dispose(); water.geometry.dispose();
      petalGeo.dispose(); petalMat.dispose(); pGeo.dispose(); partMat.dispose(); rGeo.dispose(); ringMat.dispose(); quad.dispose();
      envRT.dispose();
      if (scene.environment === envRT.texture) scene.environment = null;
    },
  });
  const _v = new THREE.Vector3(), _s = new THREE.Vector3();
  fitShadowBox();
  world.setQuality(hq ? 'high' : 'low');
  world.update(0, 0, new THREE.Vector3(), null);
  return world;
}

export function createWaterMaterial(world, hq) { return world.makeWaterMaterial(hq); }
