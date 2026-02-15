import * as THREE from 'three';
import { Grenade } from './Grenade.js';

const SMOKE_RADIUS   = 4.5;
const SMOKE_DURATION = 15;

export class SmokeGrenade extends Grenade {
  constructor(config) {
    super({ ...config, type: 'smoke', fuseTime: 2.5 });
    this.smokeActive   = false;
    this.smokeTimer    = 0;
    this.smokeMesh     = null;
    this._sceneRef     = config.scene || null;
  }

  detonate(audio, scene) {
    if (this.exploded && this.smokeActive) return; // prevent double-detonate
    super.detonate(audio);
    audio?.playSmokeDeply();
    this.smokeActive = true;
    this.smokeTimer = SMOKE_DURATION;

    const s = scene || this._sceneRef;
    // Create translucent sphere
    if (s) {
      const geo = new THREE.SphereGeometry(SMOKE_RADIUS, 12, 12);
      const mat = new THREE.MeshLambertMaterial({
        color: 0xbbbbbb,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      });
      this.smokeMesh = new THREE.Mesh(geo, mat);
      this.smokeMesh.position.copy(this.position);
      s.add(this.smokeMesh);
    }
  }

  updateSmoke(dt) {
    if (!this.smokeActive) return;
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeActive = false;
      if (this.smokeMesh) {
        this.smokeMesh.parent?.remove(this.smokeMesh);
        this.smokeMesh = null;
      }
    } else if (this.smokeMesh) {
      // Fade out in last 3 seconds
      if (this.smokeTimer < 3) {
        this.smokeMesh.material.opacity = (this.smokeTimer / 3) * 0.88;
      }
    }
  }

  // Returns true if a position is inside the smoke
  blocksVision(from, to) {
    if (!this.smokeActive) return false;
    // Check if the line from→to passes through the smoke sphere
    const center = this.position.clone();
    center.y += 1.5;
    const dir = to.clone().sub(from).normalize();
    const toCenter = center.clone().sub(from);
    const proj = toCenter.dot(dir);
    if (proj < 0) return false;
    const closest = from.clone().addScaledVector(dir, proj);
    return closest.distanceTo(center) < SMOKE_RADIUS;
  }
}
