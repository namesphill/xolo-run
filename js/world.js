// PLACEHOLDER (replaced by subagent module)
import * as THREE from 'three';
export function createWorld(renderer, scene, { quality = 'high' } = {}) {
  scene.background = new THREE.Color(0x3d8fe6);
  scene.fog = new THREE.Fog(0x9fd0f5, 50, 170);
  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x4a6a2a, 1.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6); sun.position.set(6, 10, -8); scene.add(sun, sun.target);
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x1f8a7a, roughness: 0.15 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), waterMaterial); water.rotation.x = -Math.PI / 2; water.position.y = -0.03; scene.add(water);
  return {
    sunDir: new THREE.Vector3(0.35, 0.18, -1).normalize(), fogColor: scene.fog.color, waterMaterial,
    makeFordWaterMaterial: () => new THREE.MeshStandardMaterial({ color: 0x4f9f8f, transparent: true, opacity: 0.7, roughness: 0.1 }),
    update(dt, t, focus) { water.position.set(Math.round(focus.x), -0.03, Math.round(focus.z)); water.position.y = -0.03; sun.position.set(focus.x + 6, 10, focus.z - 8); sun.target.position.copy(focus); },
    burst() {}, setQuality() {},
  };
}
