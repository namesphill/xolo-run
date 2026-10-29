// PLACEHOLDER (replaced by subagent module)
import * as THREE from 'three';
import { OB } from './planner.js';
const C = { crate: 0x9b6a3e, pots: 0xc8643c, fence: 0x8e5f36, ofrenda: 0x8d2bb3, tower: 0xa8774a, stall: 0xe8177d };
const box = (w, h, d, color, y0 = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color })); m.position.y = y0 + h / 2; return m; };
export function makeObstacle(kind, variant = 0, len) { const o = OB[kind]; const g = new THREE.Group(); g.add(box(o.w, o.h, len || o.len, C[kind])); return g; }
export function makeTrajinera({ len = 8, palette = 0, name = '', style = 'deck' }) {
  const g = new THREE.Group();
  if (style === 'deck') g.add(box(1.9, 2.15, len, 0x2d7be0, -1));
  else if (style === 'small') g.add(box(3.4, 1.3, 1.3, 0xe8177d, -0.4));
  else g.add(box(2.4, 1, len, 0x12b5b0, -0.9));
  return g;
}
export function makeSkullAssets() { return { geometries: [new THREE.SphereGeometry(0.25, 12, 10)], materials: [new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x332222 })] }; }
export function makeTreeAssets() { return { trunkGeo: new THREE.CylinderGeometry(0.12, 0.22, 4).translate(0, 2, 0), foliageGeo: new THREE.SphereGeometry(1, 10, 12).scale(1.1, 4.6, 1.1).translate(0, 6.5, 0), trunkMat: new THREE.MeshStandardMaterial({ color: 0x5a3b22 }), foliageMat: new THREE.MeshStandardMaterial({ color: 0x6f9a3a }) }; }
export function makeFlowerAssets() { return { flowerGeo: new THREE.IcosahedronGeometry(0.15, 0), flowerMat: new THREE.MeshStandardMaterial({ color: 0xffffff }), bushGeo: new THREE.IcosahedronGeometry(0.5, 0), bushMat: new THREE.MeshStandardMaterial({ color: 0x3f6a20 }) }; }
export function makeFlowerArch(width = 9) { const g = new THREE.Group(); for (const s of [-1, 1]) { const p = box(0.4, 6, 0.4, 0xff9a1f); p.position.x = s * width / 2; g.add(p); } const t = box(width, 0.5, 0.4, 0xff9a1f, 5.6); g.add(t); return g; }
export function makePapelString(width = 12) { const g = new THREE.Group(); const t = box(width, 0.05, 0.05, 0xe8177d, 5); g.add(t); g.userData.update = () => {}; return g; }
export function makeHouse() { return new THREE.Group().add(box(3, 2.5, 3, 0x12b5b0)); }
export function makeCandle() { return new THREE.Group(); }
export const MODEL_LIST = [];
export function makeReedAssets() { return { geometry: new THREE.ConeGeometry(0.25, 1.9, 5, 1, true).translate(0, 0.95, 0), material: new THREE.MeshStandardMaterial({ color: 0x7a9a35, side: THREE.DoubleSide }) }; }
export function makeLilyAssets() { return { geometry: new THREE.CylinderGeometry(0.6, 0.6, 0.04, 10).translate(0, 0.02, 0), material: new THREE.MeshStandardMaterial({ color: 0x3f8a2a }) }; }
