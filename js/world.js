// PLACEHOLDER (replaced by subagent module)
import * as THREE from 'three';
export function createWorld(renderer, scene, { quality = 'high' } = {}) {
  scene.background = new THREE.Color(0xf6b37a);
  scene.fog = new THREE.Fog(0xf6b37a, 40, 160);
  const hemi = new THREE.HemisphereLight(0xffe0b0, 0x4a5a2a, 1.4); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc27a, 2.2); sun.position.set(6, 10, -8); scene.add(sun, sun.target);
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6f62, roughness: 0.2 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), waterMaterial); water.rotation.x = -Math.PI / 2; water.position.y = -0.55; scene.add(water);
  return {
    sunDir: new THREE.Vector3(0.35, 0.18, -1).normalize(), fogColor: scene.fog.color, waterMaterial,
    makeFordWaterMaterial: () => new THREE.MeshStandardMaterial({ color: 0x4f9f8f, transparent: true, opacity: 0.7, roughness: 0.1 }),
    update(dt, t, focus) { water.position.set(Math.round(focus.x), -0.55, Math.round(focus.z)); sun.position.set(focus.x + 6, 10, focus.z - 8); sun.target.position.copy(focus); },
    burst() {}, setQuality() {},
  };
}
