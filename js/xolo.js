// PLACEHOLDER (replaced by subagent module)
import * as THREE from 'three';
export function createXolo(params = {}) {
  const root = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x1c1c21, roughness: 0.3, clearcoat: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 10), mat);
  body.rotation.x = Math.PI / 2; body.position.y = 0.55; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat); head.position.set(0, 0.8, -0.45); root.add(head);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), mat); e.position.set(s * 0.1, 1.05, -0.42); root.add(e); }
  for (const [x, z] of [[-0.12, -0.3], [0.12, -0.3], [-0.12, 0.3], [0.12, 0.3]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45), mat); l.position.set(x, 0.22, z); root.add(l); }
  let t = 0;
  return {
    root, params, rebuild() {}, reset() { root.rotation.set(0, 0, 0); body.scale.set(1, 1, 1); },
    update(dt, s) { t += dt * (s.speed || 2) * 0.8; if (s.mode !== 'dead') body.position.y = 0.55 + (s.grounded ? Math.abs(Math.sin(t)) * 0.06 : 0); },
    onJump() {}, onLand() {}, onLane() {}, onStumble() {},
    onDeath() { root.rotation.z = Math.PI / 2; }, setShadow(b) { root.traverse((o) => { if (o.isMesh) o.castShadow = b; }); },
  };
}
