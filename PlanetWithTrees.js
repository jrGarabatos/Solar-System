import * as THREE from 'three';
import { Planet } from './Planet.js';
import { TreeFactory } from './TreeFactory.js';

export class PlanetWithTrees extends Planet {
    constructor(options) {
        super(options);

        this.treeOptions = Object.assign({
            density: 0.25,                      // probability of cluster per tile
            clusterSize: [3, 10],               // trees per cluster
            heightRange: [0.00, 0.25],
            brightnessInfluence: 1.5,
            clusterRadius: 0.08,           // max cluster spread radius
            typeByHeight: (h) => {
                if (h < 0.05) return 'palm';   // 🌴 palms at low altitudes
                if (h < 0.07) return 'bushy';
                if (h < 0.09) return 'round';
                if (h < 0.11) return 'pine';
                if (h > 0.1) return 'snowyPine';
                return null;
            },
        }, options.treeOptions || {});

        // Always create the group immediately and attached to the scene
        this.treeGroup = new THREE.Group();
        this.scene.add(this.treeGroup);

        // state variables
        this.treeGroup.visible = false;
        this.treesGenerated = false;
    }

    /**
     * Generate trees once, only when high LOD is activated
     */
    generateTrees() {
        if (this.treesGenerated) return;
        console.log(`[PlanetWithTrees] Generating trees from tileData...`);

        // Prepare instanced meshes per type (trunk + leaves)
        this.treeMeshes = {};
        const types = ['palm', 'bushy', 'round', 'pine', 'snowyPine'];
        for (const type of types) {
            const { trunk, leaves } = TreeFactory.createBase(type);
            const trunkMesh = new THREE.InstancedMesh(trunk.geometry, trunk.material, 20000);
            const leavesMesh = new THREE.InstancedMesh(leaves.geometry, leaves.material, 20000);
            trunkMesh.count = leavesMesh.count = 0;
            this.treeMeshes[type] = { trunk: trunkMesh, leaves: leavesMesh };
            this.treeGroup.add(trunkMesh);
            this.treeGroup.add(leavesMesh);
        }

        const radius = this.radius;
        const tiles = this.tileData || [];

        for (const tile of tiles) {
            // expect tile = { center: Vector3, height: number, biome?: string, ... }

            const h = tile.height;
            if (h < this.treeOptions.heightRange[0] || h > this.treeOptions.heightRange[1]) continue;


            const type = this.treeOptions.typeByHeight(h);
            if (!type || !this.treeMeshes[type]) continue;

            // random chance based on density
            if (Math.random() > this.treeOptions.density) continue;
            
            const center = new THREE.Vector3(
                tile.center[0],
                tile.center[1],
                tile.center[2]
            );

            const normal = center.clone().normalize();

            // move outward by extrusion height
            const surfacePos = center.addScaledVector(normal, h); // move along normal by extrusion
            
            this.addTreeCluster(surfacePos, normal, type);
        }

        // Update matrices
        for (const { trunk, leaves } of Object.values(this.treeMeshes)) {
            trunk.instanceMatrix.needsUpdate = true;
            leaves.instanceMatrix.needsUpdate = true;
        }

        this.treesGenerated = true;
        console.log(`[PlanetWithTrees] 🌲 Trees generated from ${tiles.length} tiles.`);
    }

    /**
     * Add a random cluster of trees centered on the given position
     */
    addTreeCluster(center, normal, type) {

        /* --- Add a debug point at true center of the cluster ---
        const debugGeom = new THREE.SphereGeometry(0.05, 18, 18);
        const debugMat = new THREE.MeshBasicMaterial({ color: "red" });
        const debugPoint = new THREE.Mesh(debugGeom, debugMat);
        debugPoint.position.set(center.x, center.y,center.z); // always true center
        this.treeGroup.add(debugPoint);
        */

        const { trunk, leaves } = this.treeMeshes[type];
        const count = THREE.MathUtils.randInt(...this.treeOptions.clusterSize);
        const tangent = new THREE.Vector3().randomDirection().cross(normal).normalize();
        const bitangent = normal.clone().cross(tangent).normalize();

        for (let i = 0; i < count; i++) {
            if (trunk.count >= trunk.instanceMatrix.count) break;

            const r = Math.random() * this.treeOptions.clusterRadius;
            const theta = Math.random() * Math.PI * 2;

            const offset = tangent.clone().multiplyScalar(Math.cos(theta) * r)
                .add(bitangent.clone().multiplyScalar(Math.sin(theta) * r));

            const pos = center.clone().add(offset);
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
            const scale = THREE.MathUtils.randFloat(0.025, 0.1);

            const matrix = new THREE.Matrix4().compose(
                pos, quat, new THREE.Vector3(scale, scale, scale)
            );

            trunk.setMatrixAt(trunk.count++, matrix);
            leaves.setMatrixAt(leaves.count++, matrix);
        }
    }

    /**
     * Override LOD activation so we only generate and show trees once
     */
    setActiveLOD(lodName) {
        super.setActiveLOD(lodName);

        if (lodName === 'high') {
            if (!this.treesGenerated) this.generateTrees();
            if (this.treeGroup) this.treeGroup.visible = true;
        } else {
            if (this.treesGenerated && this.treeGroup) {
                this.treeGroup.visible = false;
            }
        }
    }
}


