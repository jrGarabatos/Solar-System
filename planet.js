import * as THREE from 'three';
import { hexasphere } from './hexasphere.js';
import { Rings } from './ring.js';


export class Planet {

    /**
     * Create a new planet with multiple LODs and orbital movement.
     * 
     * @param {Object} options - Configuration for this planet
     * @param {string} options.name - Name of the planet (e.g., "Earth")
     * @param {HTMLImageElement} options.textureImg - Projection image used for tile coloring/height
     * @param {number} options.radius - Planet radius (controls tile scaling)
     * @param {number} options.orbitRadius - Distance of orbit from the sun
     * @param {number} options.orbitSpeed - Speed of orbit (radians per frame)
     * @param {number} options.orbitAngle - Starting angle on orbit path (0 = +X axis, PI/2 = +Z axis)
     * @param {THREE.Scene} options.scene - Three.js scene where planet will be added
     * @param {Object} options.detail - Detail levels for LOD {low, mid, high}
     * @param {Object} options.lodDistances - Distances for switching LOD {low, mid}
     * @param {Object} options.colorConfig - colors to be used in the planet at each altitude
     * @param {number} options.heightScale - multiplier for terrain displacement
     * @param {number} options.freezedPole - flag for a freezed pole
     */
    constructor({ name, textureImg, radius, orbitRadius, orbitSpeed, orbitAngle, parentPlanet, 
                  scene, detail, lodDistances, heightScale, colorConfig, freezedPole = false }) {
        // Basic properties
        console.log(name);
        this.name = name;
        this.radius = radius;
        this.heightScale = heightScale;
        this.colorConfig = Object.assign({
            gradient: [
                { height: -1.0, color: new THREE.Color(0x000033) }, // deep water
                { height: -0.2, color: new THREE.Color(0x0000ff) }, // shallow water
                { height:  0.0, color: new THREE.Color(0x228b22) }, // sea level → green land
                { height:  0.5, color: new THREE.Color(0x8b4513) }, // mountains → brown
                { height:  1.0, color: new THREE.Color(0xffffff) }, // highest peaks → white
            ]
        }, colorConfig || {});
        this.freezedPole = freezedPole;

        // Orbital properties
        this.parentPlanet = parentPlanet; 
        this.orbitRadius = orbitRadius;
        this.orbitSpeed = orbitSpeed;
        this.orbitAngle = orbitAngle;
        this.position = new THREE.Vector3(); // will be updated each frame

        // Allow the presence of moons
        this.moons = [];

        // Allow the presence of rings (if any)
        this.rings = [];
    
        // Reusable dummy object for instancing transforms        
        this._dummy = new THREE.Object3D();
        
        // per-planet caches
        this.polygonGeometryCache = new Map();

        // tile data cache
        this.tileData = [];

        this.geospheres = {
            low:  new hexasphere(detail.low, true, false, this.radius),
            mid:  new hexasphere(detail.mid, true, false, this.radius),
            high: new hexasphere(detail.high, true, false, this.radius),
        };

        // LOD mesh groups
        this.lodGroups = {};
        this.currentLOD = null;

        // Projection image -> pixel data (for tile colors/heights)
        this.textureImg = textureImg || null;
        this.preparePixelData();

        // Build meshes for each LOD
        this.lodGroups.low = this.buildLODGroup(this.geospheres.low);
        this.lodGroups.mid = this.buildLODGroup(this.geospheres.mid);
        this.lodGroups.high = this.buildLODGroup(this.geospheres.high);

        //scene
        this.scene = scene;

        // --- Create a planet group that holds all LOD meshes ---
        this.planetGroup = new THREE.Group();

        /*
        // --- Add a debug point at true center of planet ---
        const debugGeom = new THREE.SphereGeometry(0.05, 18, 18);
        const debugMat = new THREE.MeshBasicMaterial({ color: "red" });
        const debugPoint = new THREE.Mesh(debugGeom, debugMat);
        debugPoint.position.set(0, 0, 0); // always true center
        this.planetGroup.add(debugPoint);
        */

        // Add LODs to the  
        Object.values(this.lodGroups).forEach(g => {
            g.visible = false;       // start invisible, we'll toggle LOD
            this.planetGroup.add(g);
        });

        // --- Create orbit group that will handle orbital motion ---
        this.orbitGroup = new THREE.Group();
        this.orbitGroup.add(this.planetGroup);

        // --- Set initial orbit position relative to parent or origin ---
        let center = new THREE.Vector3(0, 0, 0);
        if (this.parentPlanet) {
            center.copy(this.parentPlanet.orbitGroup.position);
        }
        this.orbitGroup.position.set(
            center.x + Math.cos(this.orbitAngle) * this.orbitRadius,
            0,
            center.z + Math.sin(this.orbitAngle) * this.orbitRadius
        );

        // --- Add orbit group to the scene ---
        this.scene.add(this.orbitGroup);

        // --- Activate initial LOD ---
        this.setActiveLOD("low");

        // Apply initial orbit position
        this.updateOrbit();

        //Store thresholds for LOD switching (multiply by planet radius so big planets switch earlier)
        this.lodDistances = {
            low: lodDistances?.low ?? 20, // > low => low LOD
            mid: lodDistances?.mid ?? 10  // > mid => mid LOD, else high
        };

        this.scaledLow  = this.lodDistances.low * this.radius;
        this.scaledMid  = this.lodDistances.mid * this.radius;
    }

    addMoon(moonConfig) {
        const moon = new Planet({
            ...moonConfig,
            scene: this.scene,        // still add to same scene
            parentPlanet: this        // orbit around this planet ✅
        });
        this.moons.push(moon);
        return moon;
    }

     /**
     * Attach a ring system to this planet.
     * @param {Object} config - Ring configuration (passed to Rings class)
     */
    addRings(config = {}) {
        const ring = new Rings({ 
            planet: this, 
            ...config });
        this.rings.push(ring);
        return ring;
    }


    /**
     * Builds a THREE.Group containing instanced tile meshes for a given geosphere LOD.
     * - Groups faces by polygon type (pentagon, hexagon, etc.) so they can share geometry/material.
     * - Computes transform, scale, and color for each tile based on heightmap and land/water classification. 
     * @param {hexasphere} geosphere - Hexasphere instance (already subdivided to desired LOD)
     * @returns {THREE.Group} Group containing instanced meshes, ready to be added to the scene.
     */

    buildLODGroup(geosphere) {
        const group = new THREE.Group();

        // --- Dual polyhedron data ---
        const dualFaces = geosphere.dualFaces;               // Array of face indices (each face is an array of vertex indices)
        const dualVertices = Planet.toVectorArray(geosphere.dualVertices); // Vertex positions [x, y, z]

        // --- Collect tiles by polygon side count ---
        const tileGroups = {};  
        for (let i = 0; i < dualFaces.length; i++) {
            const face = dualFaces[i];
            const sides = face.length;
            const key = `${sides}`;
            if (!tileGroups[key]) tileGroups[key] = [];
            tileGroups[key].push(i);
        }

        // --- Build instanced meshes for each polygon type ---
        for (const key in tileGroups) {
            const sides = parseInt(key);
            const indices = tileGroups[key];

            const geometry = this.createTileGeometry(sides, 1, 1);
            const material = new THREE.MeshStandardMaterial({
                flatShading: true,
                side: THREE.DoubleSide,
                vertexColors: false // we'll use instance colors
            });

            const instancedMesh = new THREE.InstancedMesh(geometry, material, indices.length);

            for (let i = 0; i < indices.length; i++) {
                const faceIndex = indices[i];
                const face = dualFaces[faceIndex];
                const tileVertices = face.map(idx => dualVertices[idx]);

                // --- Tile center ---
                const center = Planet.avg(tileVertices);

                // --- Radius from geometry ---
                const radius = tileVertices.reduce((sum, v) =>
                    sum + Math.hypot(...v.map((c, j) => c - center[j])), 0
                ) / sides;

                // --- Normal + local frame ---
                const normal = Planet.normalize(center);
                const edgeVec = [
                    tileVertices[0][0] - center[0],
                    tileVertices[0][1] - center[1],
                    tileVertices[0][2] - center[2]
                ];
                const dot = edgeVec[0] * normal[0] + edgeVec[1] * normal[1] + edgeVec[2] * normal[2];
                const proj = [
                    edgeVec[0] - dot * normal[0],
                    edgeVec[1] - dot * normal[1],
                    edgeVec[2] - dot * normal[2]
                ];
                const xAxis = Planet.normalize(proj);
                const zAxis = normal;
                const yAxis = Planet.cross(zAxis, xAxis);

                const sphereMatrix = new THREE.Matrix4().makeBasis(
                    new THREE.Vector3(...xAxis),
                    new THREE.Vector3(...yAxis),
                    new THREE.Vector3(...zAxis)
                );

                // --- Height from texture ---
                const latLon = Planet.cartesianToLatLonDegrees(center);
                const brightness = this.textureImg ? this.brightness(latLon[0], latLon[1]) : 1;
                const minHeight = -1;
                const maxHeight = 1;
                const height = minHeight + (maxHeight - minHeight) * brightness;

                // --- Apply scaling ---
                const scalingMatrix = new THREE.Matrix4().makeScale(radius, radius, height * this.heightScale);
                sphereMatrix.multiply(scalingMatrix);
                sphereMatrix.setPosition(...center);

                
                // --- Color ---
                if (this.freezedPole) {
                    const color = this.getColorForHeightLatitude(height, latLon[0]);
                    instancedMesh.setColorAt(i, color);
                }
                else {
                    const color = this.getColorForHeight(height);
                    instancedMesh.setColorAt(i, color);
                }
                
                // --- Apply transform ---
                this._dummy.matrixAutoUpdate = false;
                this._dummy.matrix.copy(sphereMatrix);
                this._dummy.rotation.setFromRotationMatrix(sphereMatrix);
                instancedMesh.setMatrixAt(i, this._dummy.matrix);

                this.tileData.push({
                    instanceIndex: i,
                    mesh: instancedMesh,
                    center: center,
                    height: height * this.heightScale
                });
            }

            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.instanceColor.needsUpdate = true;
            group.add(instancedMesh);
        }

        return group;
    }

    /**
     * Creates (and caches) a polygon geometry for a tile face.
     * - Geometry is created at unit scale and later transformed per-tile.
     * - Cached by sides/radius/height so it can be reused for all matching tiles.
     *
     * @param {number} sides  Number of polygon sides (e.g., 5 for pentagon, 6 for hexagon)
     * @param {number} radius Radius of polygon in its local 2D space (before scaling in world)
     * @param {number} height Extrusion height (thickness) of the tile (default: 0.01)
     * @returns {THREE.ExtrudeGeometry} Polygon mesh geometry
     */
    createTileGeometry(sides, radius, height = 1) {
        // STEP 1 — Cache key to avoid rebuilding identical geometry
        const key = `${sides}-${radius}-${height}`;
        if (this.polygonGeometryCache.has(key)) {
            return this.polygonGeometryCache.get(key);
        }

        // STEP 2 — Create a flat 2D shape for the polygon
        // Vertices are placed evenly around a circle using polar coordinates
        const shape = new THREE.Shape();
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2; // angle in radians
            const x = Math.cos(angle) * radius;      // X coordinate
            const y = Math.sin(angle) * radius;      // Y coordinate
            if (i === 0) {
                shape.moveTo(x, y);  // First vertex
            } else  {
                shape.lineTo(x, y);  // Subsequent vertices
            }
        }
        shape.closePath(); // Ensure the polygon is closed

        // STEP 3 — Extrude the flat polygon shape into 3D geometry
        // Note: Depth is set to 1 (unit height) and scaled later in `buildLODGroup`
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: height, // always 1 here, since we scale later
            bevelEnabled: false, // Keep perfectly vertical sides
        });

        // STEP 4 — Store geometry in cache and return
        this.polygonGeometryCache.set(key, geometry);
        return geometry;
    }

    getColorForHeight(height) {
        const stops = this.colorConfig.gradient;

        // Clamp height
        if (height <= stops[0].height) return stops[0].color.clone();
        if (height >= stops[stops.length - 1].height) return stops[stops.length - 1].color.clone();

        // Find the two gradient stops this height lies between
        for (let i = 0; i < stops.length - 1; i++) {
            const a = stops[i];
            const b = stops[i + 1];
            if (height >= a.height && height <= b.height) {
                const t = (height - a.height) / (b.height - a.height);
                return a.color.clone().lerp(b.color, t);
            }
        }
    }

    getColorForHeightLatitude(height, lat) {
        const baseColor = this.getColorForHeight(height); // existing gradient
        const absLat = Math.abs(lat);
        if (absLat > 75) return new THREE.Color(0xffffff).lerp(baseColor, 0.2); // snowy tint
        if (absLat > 68) return new THREE.Color(0xb0c4de).lerp(baseColor, 0.2); // cold bluish tint
        if (absLat > 58) return new THREE.Color(0xb0c4de).lerp(baseColor, 0.4); // cold bluish tint
        return baseColor;
    }

    // === Orbit ====
    updateOrbit() {
        this.orbitAngle += this.orbitSpeed;

        //orbit around the sun at position 0,0,0
        let centerX = 0;
        let centerZ = 0;

        if (this.parentPlanet) {
            // orbit around parent planet
            centerX = this.parentPlanet.orbitGroup.position.x;
            centerZ = this.parentPlanet.orbitGroup.position.z;
        }

        this.position.set(
            centerX + Math.cos(this.orbitAngle) * this.orbitRadius,
            0,
            centerZ + Math.sin(this.orbitAngle) * this.orbitRadius
        );

        this.orbitGroup.position.copy(this.position);

        // Update moons
        this.moons.forEach(moon => moon.updateOrbit());

        // Update rings if present
        this.rings.forEach(ring => ring.updateOrbit());
    }

    // === LOD Helpers ===
    updateLOD(camera) {
        this.updateLODdistanceToCamera(camera)
        //this. updateLODscreenSize(camera); 
       
        // Update moons
        this.moons.forEach(moon => moon.updateLOD(camera));

        // Update rings if present
        this.rings.forEach(ring => ring.updateLOD(camera));
    }

    /**
     * Sets the active LOD group to be visible in the scene, removing previous.
     * @param {'low'|'mid'|'high'} lodName
     */
    async setActiveLOD(lodName) {
        if (this.currentLOD === lodName) return;
    
        if (this.currentLOD) this.lodGroups[this.currentLOD].visible = false;
    
        this.lodGroups[lodName].visible = true;
        this.currentLOD = lodName;
    }

    /**
     * Update LOD based on screen-space tile size 
     * 
     * */
    updateLODscreenSize(camera) {
        // We will test with the first tile in the low-res LOD group
        const testTile = this.tileData[0];  // Assuming you have an array of tile data

        if (testTile) {
            const matrix = new THREE.Matrix4();
            testTile.mesh.getMatrixAt(testTile.instanceIndex, matrix);  // Get the world matrix for the tile
        
            const worldCenter = new THREE.Vector3().setFromMatrixPosition(matrix); // Get world position of tile center
            const worldEdge = worldCenter.clone().add(new THREE.Vector3(0.02, 0, 0).applyMatrix4(matrix)); // Approximate edge

            // Get the screen space coordinates (NDC - normalized device coordinates)
            const width = window.innerWidth;  // Use window size for screen dimensions
            const height = window.innerHeight;

            const ndcCenter = worldCenter.clone().project(camera);  // Project world position to NDC space
            const ndcEdge = worldEdge.clone().project(camera); // Project edge to NDC space

            // Convert NDC to screen space (pixels)
            const screenCenter = {
                x: (ndcCenter.x * 0.5 + 0.5) * width,
                y: (ndcCenter.y * -0.5 + 0.5) * height,
            };

            const screenEdge = {
                x: (ndcEdge.x * 0.5 + 0.5) * width,
                y: (ndcEdge.y * -0.5 + 0.5) * height,
            };

            // Calculate the screen size of the tile using the distance between the center and the edge
            const screenTileSize = Math.hypot(screenEdge.x - screenCenter.x, screenEdge.y - screenCenter.y);

            // Use this screen size to determine LOD
            if (screenTileSize < 100) {
                this.setActiveLOD('low');  // Small screen size -> low LOD
            } else if (screenTileSize < 200) {
                this.setActiveLOD('mid');  // Medium screen size -> mid LOD
            } else {
                this.setActiveLOD('high');  // Large screen size -> high LOD
            }
        }
    }

    
    /**
     *  Update LOD visibility based on distance 
     */
    updateLODdistanceToCamera(camera) {
        const dist = camera.position.distanceTo(this.position);
        
        // Lazy load LOD groups
        if (dist >= this.scaledLow) {
            this.setActiveLOD('low');
        } else if (dist >= this.scaledMid) {
            this.setActiveLOD('mid');
        } else {
            this. setActiveLOD('high');
        }
    }
    
    // === PIXEL DATA HELPERS ===/
    preparePixelData() {
        if (!this.textureImg) return;

        // Create an offscreen canvas
        const canvas = document.createElement('canvas');
        canvas.width = this.textureImg.width;
        canvas.height = this.textureImg.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.textureImg, 0, 0);

        // Extract pixel data
        this.pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }


    isLand(lat, lon) {
        const b = this.brightness(lat, lon);
        return b > 0.45; // tweak per-planet if desired
    }

    brightness(lat, lon) {
        if (!this.pixelData) return 1;

        const { width, height, data } = this.pixelData;
        
        // convert lat/lon to normalized equirect coords (u,v)
        const u = 1 - (lon + 180) / 360; // invert x
        const v = 1 - (lat + 90) / 180;  // invert y
        let x = Math.floor(u * width);
        let y = Math.floor(v * height);
        x = Math.min(Math.max(x, 0), width - 1);
        y = Math.min(Math.max(y, 0), height - 1);
        const idx = (y * width + x) * 4; // RGBA
        return data[idx] / 255; // red channel
    }


    // === STATIC HELPERS ===

    /**
     * Helper to convert array of arrays [ [x,y,z], ... ] to array of THREE.Vector3
     * @param {Array} arr Array of [x,y,z]
     * @returns {Array<THREE.Vector3>}
     */
    static toVectorArrayTHREE(arr) {
        return arr.map(v => new THREE.Vector3(v[0], v[1], v[2]));
    }

    /**
     * Helper to convert array of arrays [ [x,y,z], ... ] to an array [x,y,z, ...]
     * @param {Array} arr Array of [x,y,z]
     * @returns {Array} [x,y,z]
     */
    static toVectorArray(array, stride = 3) {
        
        //Input must be a flat array with length divisible by stride, if not do nothing
        if (Array.isArray(array) || array.length % stride !== 0) return array;

        const out = [];
        for (let i = 0; i < array.length; i += stride) {
            out.push(array.slice(i, i + stride));
        }
        return out;
    }

    /**
     * Helper: calculates average position of an array of THREE.Vector3 or arrays [x,y,z]
     * @param {Array} arr
     * @returns {Array} [x,y,z] average position
     */
    static avg(arr) {
        let sum = [0, 0, 0];
        for (const v of arr) {
        sum[0] += v.x !== undefined ? v.x : v[0];
        sum[1] += v.y !== undefined ? v.y : v[1];
        sum[2] += v.z !== undefined ? v.z : v[2];
        }
        return sum.map(s => s / arr.length);
    }

    /**
     * Normalize a 3D vector represented as array [x,y,z]
     * @param {Array} v
     * @returns {Array} normalized vector
     */
    static normalize(v) {
        const length = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        if (length === 0) return [0, 0, 0];
        return [v[0]/length, v[1]/length, v[2]/length];
    }

    /**
     * Cross product of two 3D vectors (arrays)
     * @param {Array} a
     * @param {Array} b
     * @returns {Array} cross product vector
     */
    static cross(a, b) {
        return [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
        ];
    }

    /**
     * Converts Cartesian coordinates to latitude and longitude in degrees.
     * @param {Array|THREE.Vector3} v
     * @returns {[number, number]} [latitude, longitude]
     */
    static cartesianToLatLonDegrees(v) {
        // Support both Vector3 and [x,y,z] array formats
        const x = v.x !== undefined ? v.x : v[0];
        const y = v.y !== undefined ? v.y : v[1];
        const z = v.z !== undefined ? v.z : v[2];

        
        // Radius (magnitude of the vector)
        const r = Math.sqrt(x * x + y * y + z * z);
        if (r === 0) return [0, 0]; // avoid division by zero

        // Latitude: arcsin(y / r) → degrees
        const lat = Math.asin(Math.min(Math.max(y / r, -1), 1)) * (180 / Math.PI);

        // Longitude: atan2(z, x) → degrees
        let lon = Math.atan2(z, x) * (180 / Math.PI);

        // Normalize longitude to [-180, 180]
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;


        return [lat, lon];
    }

    /**
     * Converts Cartesian coordinates to latitude and longitude in radians.
     * @param {Array|THREE.Vector3} v
     * @returns {[number, number]} [latitude, longitude]
     */
    static cartesianToLatLonRadians(v) {
        // Support both Vector3 and [x,y,z] array formats
        const x = v.x !== undefined ? v.x : v[0];
        const y = v.y !== undefined ? v.y : v[1];
        const z = v.z !== undefined ? v.z : v[2];

        const r = Math.sqrt(x * x + y * y + z * z);
        if (r === 0) return { lat: 0, lon: 0 }; // avoid division by zero

        // Clamp y/r to [-1, 1] to prevent NaN from floating point drift
        const lat = Math.asin(Math.min(Math.max(y / r, -1), 1));
        let lon = Math.atan2(z, x);

        // Normalize longitude to range [-π, π]
        if (lon > Math.PI) lon -= 2 * Math.PI;
        if (lon < -Math.PI) lon += 2 * Math.PI;

        return { lat, lon }; // still in radians
    }

}
