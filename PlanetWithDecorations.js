import * as THREE from 'three';
import { Planet } from './Planet.js';
import { GLTFModelLibrary } from './GLTFModelLibrary.js';

/**
 * PlanetWithDecorations
 * ----------------------
 * Extends the base Planet class with support for:
 * - Registering decorative assets (GLTF or procedural)
 * - Generating decorations based on terrain tiles
 * - Managing instanced meshes for performance
 * - Controlling which decorations can share tiles
 * - Adjusting object height relative to the planet surface
 */
export class PlanetWithDecorations extends Planet {
  constructor(options = {}) {
    super(options);

    this.modelLibrary = new GLTFModelLibrary({ debug: false });

    // Decoration metadata
    this.decorations = {};        // name → config
    this.decorationGroups = {};   // name → THREE.Group for instanced meshes
    this.decorationMeshes = {};   // name → { type → multipart data }
    this.generated = {};          // name → boolean (if already generated)
    this.generating = {};         // name → Promise (if currently generating)
  }

  /**
   * Registers a new decoration type.
   * @param {string} name - Unique identifier for the decoration type.
   * @param {object} config - Configuration object describing assets and placement.
   * @param {number} [config.heightOffset=0] - Vertical offset relative to surface (0 = on surface, >0 above).
   * @param {object} [config.compatibility] - Rules for tile sharing.
   */
  registerDecoration(name, config) {
    this.decorations[name] = config;
    this.generated[name] = false;

    const group = new THREE.Group();
    group.visible = false;
    this.planetGroup.add(group);

    this.decorationGroups[name] = group;
  }

  // ======================================================
  // =============== INTERNAL HELPERS =====================
  // ======================================================

  _createMultiPartInstance(meshAssets, chosenKeys, group, scale = 1) {
    const instancedParts = [];
    let globalMinY = Infinity;

    for (const key of chosenKeys) {
      const meshData = meshAssets[key];
      if (!meshData?.geometry) continue;

      const geometry = meshData.geometry;
      const material = meshData.material || new THREE.MeshStandardMaterial();

      geometry.computeBoundingBox();
      globalMinY = Math.min(globalMinY, geometry.boundingBox?.min.y ?? 0);

      const instancedMesh = new THREE.InstancedMesh(geometry, material, 20000);
      instancedMesh.count = 0;
      instancedMesh.castShadow = instancedMesh.receiveShadow = true;
      group.add(instancedMesh);

      instancedParts.push({ key, instancedMesh, geometry, material });
    }

    return { scale, instancedParts, globalMinY };
  }

  // ======================================================
  // =============== MAIN DECORATION GENERATION ============
  // ======================================================

  async generateDecoration(name) {
    const config = this.decorations[name];
    if (!config || this.generated[name]) return;

    if (this.generating[name]) {
      await this.generating[name];
      return;
    }

    let resolveGeneration;
    this.generating[name] = new Promise(resolve => (resolveGeneration = resolve));

    try {
      const meshMap = {};
      const group = this.decorationGroups[name];
      const tiles = this.tileData || [];

      // --- 1️⃣ Load GLTF models if available ---
      for (const entry of config.types) {
        const { type, scale = 1, path, meshName, meshIndex, meshNames, meshIndices } = entry;
        if (meshMap[type] || !path) continue;

        const meshAssets = await this.modelLibrary.load(path);
        const keys = Object.keys(meshAssets);

        let chosenKeys = [];
        if (Array.isArray(meshNames)) {
            chosenKeys = meshNames.filter(n => keys.includes(n));
        }
        else if (Array.isArray(meshIndices)) {
            chosenKeys = meshIndices.map(i => keys[i]).filter(Boolean); 
        }
        else if (meshName && keys.includes(meshName)) {
            chosenKeys = [meshName];
        }
        else if (meshIndex !== undefined && keys[meshIndex]) {
            chosenKeys = [keys[meshIndex]];
        }
        else chosenKeys = keys;

        if (chosenKeys.length === 0) continue;
        meshMap[type] = this._createMultiPartInstance(meshAssets, chosenKeys, group, scale);
      }

      // --- 2️⃣ Procedural fallback ---
      for (const entry of config.types) {
        if (entry.path) continue;
        const { type, scale = 1 } = entry;
        if (meshMap[type]) continue;

        const result = config.proceduralFactory?.(type, scale);
        if (!result) continue;

        const meshDefs = Array.isArray(result)
          ? result
          : result.geometry && result.material
            ? [result]
            : Object.values(result);

        const meshAssets = {};
        meshDefs.forEach((def, i) => {
          meshAssets[`procedural_${i}`] = { geometry: def.geometry, material: def.material };
        });

        const chosenKeys = Object.keys(meshAssets);
        meshMap[type] = this._createMultiPartInstance(meshAssets, chosenKeys, group, scale);
      }

      this.decorationMeshes[name] = meshMap;

      // --- 3️⃣ Place decorations across planet tiles ---
      for (const tile of tiles) {
        const h = tile.height;
        if (h < config.heightRange[0] || h > config.heightRange[1]) continue;
        if (!tile.decorationTypes) tile.decorationTypes = new Set();

        const [lat] = Planet.cartesianToLatLonDegrees(tile.center);
        const type = config.typeSelector(h, lat);
        const entry = meshMap[type];
        if (!type || !entry) continue;
        if (Math.random() > config.density) continue;

        // Skip if incompatible with existing decorations
        if (!this._canShareTile(tile, name, type)) continue;

        const center = new THREE.Vector3(...tile.center);
        const normal = center.clone().normalize();

        // ✅ NEW: Apply configurable height offset (relative to surface)
        const offset = config.heightOffset ?? 0;
        const surfacePos = center.clone().addScaledVector(normal, h + offset);

        this._addCluster(surfacePos, normal, type, name, tile);

        tile.decorationTypes.add(type);
      }

      // --- 4️⃣ Update instance matrices ---
      for (const entry of Object.values(meshMap)) {
        for (const part of entry.instancedParts) {
          part.instancedMesh.instanceMatrix.needsUpdate = true;
        }
      }

      this.generated[name] = true;
      console.info(`[${name}] Decoration generation complete.`);
    } catch (err) {
      console.error(`[${name}] Failed to generate decoration:`, err);
    } finally {
      resolveGeneration();
      delete this.generating[name];
    }
  }

  // ======================================================
  // =============== TILE COMPATIBILITY LOGIC ==============
  // ======================================================

  _canShareTile(tile, decorationName, type) {
    const config = this.decorations[decorationName];
    const compat = config.compatibility || {};
    const existing = tile.decorationTypes || new Set();

    if (compat.exclusive && existing.size > 0) return false;

    for (const existingType of existing) {
      const existingConfig = Object.values(this.decorations).find(d =>
        d.types.some(t => t.type === existingType)
      );
      const existingCompat = existingConfig?.compatibility || {};

      const mutualExclusion =
        !(compat.shareableWith?.includes(existingType)) &&
        !(existingCompat.shareableWith?.includes(type));

      if (mutualExclusion) return false;
    }

    return true;
  }

  // ======================================================
  // =============== CLUSTER PLACEMENT =====================
  // ======================================================

  _applyMultipartTransform(part, position, rotationQuat, bottomOffset, scale = 1, normal = new THREE.Vector3(0, 1, 0)) {
    const transform = new THREE.Matrix4();

    transform
      .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .premultiply(new THREE.Matrix4().makeRotationFromQuaternion(rotationQuat))
      .premultiply(
        new THREE.Matrix4().makeTranslation(
          position.x + normal.x * bottomOffset * scale,
          position.y + normal.y * bottomOffset * scale,
          position.z + normal.z * bottomOffset * scale
        )
      );

    return transform;
  }

  _addCluster(center, normal, type, name, tile, debug = false) {
    const config = this.decorations[name];
    const entry = this.decorationMeshes[name]?.[type];
    if (!entry) return;

    const count = THREE.MathUtils.randInt(...config.clusterSize);
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < count; i++) {
      const r = Math.random() * config.clusterRadius;
      const theta = Math.random() * Math.PI * 2;

      let tangent = new THREE.Vector3().crossVectors(up, normal).normalize();
      if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0).cross(normal).normalize();
      const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

      const offset = tangent.multiplyScalar(Math.cos(theta) * r)
                            .add(bitangent.multiplyScalar(Math.sin(theta) * r));
      const surfacePos = center.clone().add(offset);

      const alignQuat = new THREE.Quaternion().setFromUnitVectors(up, normal);
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(normal, THREE.MathUtils.degToRad(Math.random() * 360));
      const finalQuat = new THREE.Quaternion().multiplyQuaternions(yawQuat, alignQuat);

      const yOffset = -(entry.globalMinY ?? 0);
      for (const part of entry.instancedParts) {
        const index = part.instancedMesh.count++;
        const transform = this._applyMultipartTransform(part, surfacePos, finalQuat, yOffset, entry.scale, normal);
        part.instancedMesh.setMatrixAt(index, transform);
      }
    }

    if (debug) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
      sphere.position.copy(center);
      this.scene.add(sphere);
      this.scene.add(new THREE.ArrowHelper(normal, center, 1, 0x00ff00));
    }
  }

  // ======================================================
  // =============== LOD HANDLING ==========================
  // ======================================================

  async setActiveLOD(lodName) {
    await super.setActiveLOD(lodName);

    for (const name of Object.keys(this.decorations)) {
      const group = this.decorationGroups[name];

      if (lodName === 'high') {
        await this.generateDecoration(name);
        group.visible = true;
      } else {
        group.visible = false;
      }
    }
  }
}
