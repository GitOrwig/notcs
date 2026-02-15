import * as THREE from 'three';

// Mirage map built from box geometry
// All dimensions in world units (1 unit ≈ 1 meter)

const MAT = {
  ground:    new THREE.MeshLambertMaterial({ color: 0xc4a96b }),
  wall:      new THREE.MeshLambertMaterial({ color: 0x8b7355 }),
  ctSide:    new THREE.MeshLambertMaterial({ color: 0x4a6fa5 }),
  tSide:     new THREE.MeshLambertMaterial({ color: 0xa55a4a }),
  site:      new THREE.MeshLambertMaterial({ color: 0xd4b896 }),
  accent:    new THREE.MeshLambertMaterial({ color: 0x6b8b6b }),
  dark:      new THREE.MeshLambertMaterial({ color: 0x3d3d3d }),
  sky:       new THREE.MeshLambertMaterial({ color: 0x3b4d6b, side: THREE.BackSide }),
  bombA:     new THREE.MeshLambertMaterial({ color: 0xff4444, transparent: true, opacity: 0.5 }),
  bombB:     new THREE.MeshLambertMaterial({ color: 0xff4444, transparent: true, opacity: 0.5 }),
};

function box(w, h, d, mat, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class GameMap {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.collidables = []; // { min, max } AABBs for collision
    this.bombSiteA = null; // { min, max }
    this.bombSiteB = null;
    this.spawnsCT = [];
    this.spawnsT = [];
    this.waypointsAll = [];

    this._build();
    scene.add(this.group);
  }

  _add(mesh, collidable = true) {
    this.group.add(mesh);
    if (collidable) {
      const bbox = new THREE.Box3().setFromObject(mesh);
      this.collidables.push({ min: bbox.min.clone(), max: bbox.max.clone() });
    }
  }

  _floor(w, d, mat, x, y, z) {
    // Floor panels (thin, collidable from above)
    const m = box(w, 0.3, d, mat, x, y - 0.15, z);
    this.group.add(m);
    const bbox = new THREE.Box3().setFromObject(m);
    this.collidables.push({ min: bbox.min.clone(), max: bbox.max.clone() });
    return m;
  }

  _wall(w, h, d, mat, x, y, z) {
    const m = box(w, h, d, mat, x, y + h/2, z);
    this._add(m);
    return m;
  }

  _build() {
    // ── Sky box ──────────────────────────────────────────────
    const sky = new THREE.Mesh(new THREE.BoxGeometry(300, 80, 300), MAT.sky);
    sky.position.set(0, 15, 0);
    this.group.add(sky);

    // Ambient floor (large ground plane, no collision needed, it's the base)
    const globalFloor = box(300, 0.5, 300, MAT.ground, 0, -0.25, 0);
    globalFloor.receiveShadow = true;
    this.group.add(globalFloor);
    this.collidables.push({ min: new THREE.Vector3(-150, -0.5, -150), max: new THREE.Vector3(150, 0, 150) });

    // ── T SPAWN ──────────────────────────────────────────────  z: 50-65
    this._floor(30, 15, MAT.tSide,   0, 0, 57);
    // Walls
    this._wall(30, 3, 0.5, MAT.wall, 0, 0, 64.75);
    this._wall(0.5, 3, 15, MAT.wall, -15, 0, 57);
    this._wall(0.5, 3, 15, MAT.wall, 15, 0, 57);

    // T spawns
    for (let i = -2; i <= 2; i++) {
      this.spawnsT.push(new THREE.Vector3(i * 4, 0, 55));
    }

    // ── T-SIDE RAMP → A ──────────────────────────────────────  T goes right → A site
    // Long corridor: z 35-55, x 15-25
    this._floor(10, 20, MAT.ground,  20, 0, 45);
    this._wall(0.5, 4, 20, MAT.wall, 15, 0, 45); // left wall
    this._wall(0.5, 4, 20, MAT.wall, 25, 0, 45); // right wall

    // ── A SITE ────────────────────────────────────────────────  x: 10-40, z: -5-25
    this._floor(30, 30, MAT.site,   25, 0, 10);
    this._wall(30, 4, 0.5, MAT.wall, 25, 0, -5);   // back wall
    this._wall(0.5, 4, 30, MAT.wall, 40, 0, 10);   // far right wall
    this._wall(0.5, 4, 5,  MAT.wall, 10, 0, 20);   // CT side partial

    // A site bomb zone marker
    const aSite = box(14, 0.05, 14, MAT.bombA, 28, 0.03, 8);
    this.group.add(aSite);
    this.bombSiteA = { min: new THREE.Vector3(21, -1, 1), max: new THREE.Vector3(35, 3, 15) };

    // Boxes on A site (cover)
    this._wall(3, 2, 3, MAT.dark,   24, 0, 12);
    this._wall(3, 2, 3, MAT.dark,   30, 0, 5);
    this._wall(2, 3, 2, MAT.dark,   33, 0, 10);

    // ── CT SPAWN ─────────────────────────────────────────────  x: -20 to 10, z: -20 to -5
    this._floor(30, 15, MAT.ctSide, -5, 0, -12);
    this._wall(30, 3, 0.5, MAT.wall, -5, 0, -19.75);
    this._wall(0.5, 3, 15, MAT.wall, -20, 0, -12);
    this._wall(0.5, 3, 15, MAT.wall, 10, 0, -12);

    // CT spawns
    for (let i = -2; i <= 2; i++) {
      this.spawnsCT.push(new THREE.Vector3(i * 4, 0, -14));
    }

    // ── CT MID (SHORT) ───────────────────────────────────────  z: -5 to 15, x: 0-15
    this._floor(15, 20, MAT.ground,  7.5, 0, 5);
    this._wall(0.5, 4, 20, MAT.wall,  0, 0, 5);
    this._wall(0.5, 4, 20, MAT.wall, 15, 0, 5);

    // ── MID CONNECTOR ────────────────────────────────────────  z: 15-35, x: -15 to 5
    this._floor(20, 20, MAT.ground, -5, 0, 25);
    this._wall(0.5, 4, 20, MAT.wall, -15, 0, 25);
    this._wall(0.5, 4, 20, MAT.wall,  5, 0, 25);
    // Window room — elevated platform
    const windowBox = box(6, 2, 4, MAT.dark, -8, 1, 32);
    this._add(windowBox);

    // ── T RAMP → B ───────────────────────────────────────────  x: -15 to -5, z: 35-55
    this._floor(10, 20, MAT.ground, -10, 0, 45);
    this._wall(0.5, 4, 20, MAT.wall, -15, 0, 45);
    this._wall(0.5, 4, 20, MAT.wall,  -5, 0, 45);

    // ── B APPS (apartments) ──────────────────────────────────  x: -40 to -15, z: 35-55
    this._floor(25, 20, MAT.ground, -27.5, 0, 45);
    this._wall(25, 4, 0.5, MAT.wall, -27.5, 0, 55);
    this._wall(0.5, 4, 20, MAT.wall, -40, 0, 45);
    // Interior divider (window to B)
    this._wall(0.5, 4, 10, MAT.wall, -20, 0, 40);
    // Balcony boxes
    this._wall(3, 2, 3, MAT.dark, -25, 0, 38);
    this._wall(3, 2, 3, MAT.dark, -30, 0, 50);

    // ── B SITE ───────────────────────────────────────────────  x: -40 to -15, z: 5-35
    this._floor(25, 30, MAT.site,  -27.5, 0, 20);
    this._wall(25, 4, 0.5, MAT.wall, -27.5, 0, 5);    // back wall
    this._wall(0.5, 4, 30, MAT.wall, -40, 0, 20);     // far left
    this._wall(0.5, 4, 10, MAT.wall, -15, 0, 10);     // CT side

    // B site bomb zone marker
    const bSite = box(12, 0.05, 12, MAT.bombB, -28, 0.03, 20);
    this.group.add(bSite);
    this.bombSiteB = { min: new THREE.Vector3(-34, -1, 14), max: new THREE.Vector3(-22, 3, 26) };

    // B site boxes
    this._wall(3, 2, 3, MAT.dark, -32, 0, 22);
    this._wall(2, 3, 2, MAT.dark, -24, 0, 17);
    this._wall(3, 2, 3, MAT.dark, -27, 0, 25);

    // ── CT → B SHORT ─────────────────────────────────────────  x: -20 to -5, z: -5 to 15
    this._floor(15, 20, MAT.ground, -12.5, 0, 5);
    this._wall(0.5, 4, 20, MAT.wall, -20, 0, 5);
    this._wall(0.5, 4, 20, MAT.wall,  -5, 0, 5);

    // Van (big cover box at mid)
    this._wall(6, 3.5, 3, MAT.dark, -2, 0, 22);

    // ── Waypoints ────────────────────────────────────────────
    this.waypointsAll = [
      // T push A
      new THREE.Vector3(0, 0.5, 55),
      new THREE.Vector3(20, 0.5, 50),
      new THREE.Vector3(20, 0.5, 35),
      new THREE.Vector3(25, 0.5, 15),
      new THREE.Vector3(28, 0.5, 8),  // A site
      // T push B
      new THREE.Vector3(0, 0.5, 55),
      new THREE.Vector3(-10, 0.5, 50),
      new THREE.Vector3(-10, 0.5, 38),
      new THREE.Vector3(-28, 0.5, 35),
      new THREE.Vector3(-28, 0.5, 20), // B site
      // CT hold A
      new THREE.Vector3(-5, 0.5, -14),
      new THREE.Vector3(7, 0.5, 5),
      new THREE.Vector3(12, 0.5, 15),
      new THREE.Vector3(22, 0.5, 10), // A site
      // CT hold B
      new THREE.Vector3(-5, 0.5, -14),
      new THREE.Vector3(-12, 0.5, 5),
      new THREE.Vector3(-18, 0.5, 15),
      new THREE.Vector3(-28, 0.5, 20), // B site
      // Mid
      new THREE.Vector3(-2, 0.5, 22),
      new THREE.Vector3(-5, 0.5, 30),
    ];
  }

  // Returns list of AABB for rendering nav
  getWaypointsForTeam(team, route) {
    if (team === 't') {
      return route === 'A'
        ? this.waypointsAll.slice(0, 5)
        : this.waypointsAll.slice(5, 10);
    } else {
      return route === 'A'
        ? this.waypointsAll.slice(10, 14)
        : this.waypointsAll.slice(14, 18);
    }
  }

  getMidWaypoints() {
    return this.waypointsAll.slice(18);
  }

  isInBombSite(position) {
    const inA = this._inAABB(position, this.bombSiteA);
    const inB = this._inAABB(position, this.bombSiteB);
    return inA ? 'A' : inB ? 'B' : null;
  }

  _inAABB(pos, box) {
    if (!box) return false;
    return pos.x >= box.min.x && pos.x <= box.max.x &&
           pos.z >= box.min.z && pos.z <= box.max.z;
  }

  // ── Collision resolution ──────────────────────────────────
  resolvePlayer(player) {
    const hw = player.halfW;
    const hh = player.halfHeight;
    const hd = player.halfD;

    for (const col of this.collidables) {
      const pMin = new THREE.Vector3(player.position.x - hw, player.position.y - hh, player.position.z - hd);
      const pMax = new THREE.Vector3(player.position.x + hw, player.position.y + hh, player.position.z + hd);

      // Overlap check
      if (pMin.x < col.max.x && pMax.x > col.min.x &&
          pMin.y < col.max.y && pMax.y > col.min.y &&
          pMin.z < col.max.z && pMax.z > col.min.z) {

        // Find smallest overlap axis
        const ox = Math.min(pMax.x - col.min.x, col.max.x - pMin.x);
        const oy = Math.min(pMax.y - col.min.y, col.max.y - pMin.y);
        const oz = Math.min(pMax.z - col.min.z, col.max.z - pMin.z);

        if (oy <= ox && oy <= oz) {
          // Push out Y (mostly floors/ceilings)
          if (player.position.y > (col.min.y + col.max.y) / 2) {
            player.position.y += oy;
            if (player.velocity.y < 0) player.velocity.y = 0;
          } else {
            player.position.y -= oy;
            if (player.velocity.y > 0) player.velocity.y = 0;
          }
        } else if (ox <= oz) {
          if (player.position.x > (col.min.x + col.max.x) / 2) player.position.x += ox;
          else player.position.x -= ox;
        } else {
          if (player.position.z > (col.min.z + col.max.z) / 2) player.position.z += oz;
          else player.position.z -= oz;
        }
      }
    }
  }

  checkGround(player) {
    const hw = player.halfW * 0.9;
    const hd = player.halfD * 0.9;
    const feet = player.position.y - player.halfHeight;
    const GROUND_THRESHOLD = 0.12;

    for (const col of this.collidables) {
      if (player.position.x + hw < col.min.x || player.position.x - hw > col.max.x) continue;
      if (player.position.z + hd < col.min.z || player.position.z - hd > col.max.z) continue;
      if (feet <= col.max.y + GROUND_THRESHOLD && feet >= col.max.y - 0.3) {
        player.position.y = col.max.y + player.halfHeight;
        return true;
      }
    }
    return false;
  }

  // Ray vs all collidables
  raycast(origin, direction, maxDist) {
    const ray = new THREE.Ray(origin, direction.clone().normalize());
    let closest = Infinity;
    let hitPoint = null;

    for (const col of this.collidables) {
      const box3 = new THREE.Box3(col.min, col.max);
      const target = new THREE.Vector3();
      const hit = ray.intersectBox(box3, target);
      if (hit) {
        const d = origin.distanceTo(target);
        if (d < closest && d <= maxDist) {
          closest = d;
          hitPoint = target.clone();
        }
      }
    }
    return hitPoint ? { point: hitPoint, distance: closest } : null;
  }
}
