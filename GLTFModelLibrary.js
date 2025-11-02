// GLTFModelLibrary.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * GLTFModelLibrary
 * ----------------
 * Handles GLTF model loading and caching.
 * - Extracts mesh geometries and materials for instanced rendering.
 * - Caches results to avoid redundant network loads.
 * - Optionally visualizes bounding boxes and axes for debugging.
 */
export class GLTFModelLibrary {
  /**
   * @param {Object} [options={}]
   * @param {boolean} [options.debug=false] - Enable visual debugging.
   * @param {THREE.Scene} [options.debugScene=null] - Scene to place debug helpers into.
   */
  constructor(options = {}) {
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.debug = !!options.debug;
    this.debugScene = this.debug ? options.debugScene || null : null;
  }

  /**
   * Loads a GLTF model and returns a mapping of mesh data.
   * Caches previously loaded models for performance.
   *
   * @param {string} path - Path or URL to the GLTF model.
   * @returns {Promise<Object>} - Resolves to { meshName: { geometry, material, localMatrix, bottomOffset } }
   */
  async load(path) {
    const cached = this.cache.get(path);
    if (cached?.isLoaded) return cached.meshMap;
    if (cached?.loadingPromise) return cached.loadingPromise;

    // Promise to ensure concurrent calls to the same model share one load
    const loadingPromise = new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);

          const meshMap = {};
          let unnamedCounter = 0;

          // Traverse scene and collect meshes
          gltf.scene.traverse(child => {
            if (!child.isMesh || !child.geometry) return;

            
            const key = child.name?.trim() || `mesh_${unnamedCounter++}`;
            const geometry = child.geometry.clone();
            const material = child.material.clone();

            // Compute bottom offset (lowest Y point)
            geometry.computeBoundingBox();
            const bottomOffset = geometry.boundingBox?.min.y ?? 0;

            // Store mesh entry with identity matrix (no local transform preserved)
            meshMap[key] = {
              geometry,
              material,
              localMatrix: new THREE.Matrix4(), // Always identity
              bottomOffset
            };

            console.log(child.name, Object.keys(meshMap).length);

            // Optional debug visualization
            if (this.debug && this.debugScene) this._addDebugHelpers(geometry);
          });

          // Cache and resolve
          this.cache.set(path, { meshMap, isLoaded: true });
          resolve(meshMap);
        },
        undefined,
        (err) => reject(err)
      );
    });

    this.cache.set(path, { loadingPromise, isLoaded: false });
    return loadingPromise;
  }

  /**
   * Adds debug helpers to visualize bounding box centers, bottoms, and axes.
   * Only runs if debug mode is active.
   * @private
   */
  _addDebugHelpers(geometry) {
    if (!this.debugScene) return;

    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const center = bbox.getCenter(new THREE.Vector3());
    const bottom = bbox.min.clone();

    // Blue sphere = center
    const sphereCenter = new THREE.Mesh(
      new THREE.SphereGeometry(0.02),
      new THREE.MeshBasicMaterial({ color: 0x0000ff })
    );
    sphereCenter.position.copy(center);
    this.debugScene.add(sphereCenter);

    // Yellow sphere = bottom
    const sphereBottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.005),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    sphereBottom.position.copy(bottom);
    this.debugScene.add(sphereBottom);

    // Axes helper at center
    const axes = new THREE.AxesHelper(0.05);
    axes.position.copy(center);
    this.debugScene.add(axes);
  }
}
