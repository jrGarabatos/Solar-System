/* -----------------------------
   Tree Factory
   ----------------------------- */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class TreeFactory {
    /**
     * Create a tree type as two geometries: trunk + leaves
     * @param {'round'|'pine'|'bushy'|'palm'} type 
     * @param {number} scale - overall scale multiplier for tree size
     */
    static createBase(type = 'round', scale = 0.5) {

        let trunkGeo, trunkMat, leavesGeo, leavesMat;

        // === Common Trunk Material ===
        trunkMat = new THREE.MeshStandardMaterial({
            color: 0x8b5a2b,
            side: THREE.DoubleSide,
            flatShading: true
        });

        // === Common Leaf Material (default green) ===
        leavesMat = new THREE.MeshStandardMaterial({
            color: 0x228b22,
            side: THREE.DoubleSide,
            flatShading: true
        });

        switch (type) {

            /* 🌲 Pine Tree */
            case 'pine': {
                trunkGeo = new THREE.CylinderGeometry(0.05 * scale, 0.1 * scale, 0.6 * scale, 6);
                trunkGeo.translate(0, 0.3 * scale, 0);

                const leaves = [];
                for (let i = 0; i < 3; i++) {
                    const g = new THREE.ConeGeometry(0.5 - i * 0.1, 0.7, 8);
                    g.translate(0, 0.6 + i * 0.3, 0);
                    g.scale(scale, scale, scale);
                    leaves.push(g);
                }
                leavesGeo = BufferGeometryUtils.mergeGeometries(leaves, false);
                leavesMat = new THREE.MeshStandardMaterial({
                    color: 0x006400,
                    side: THREE.DoubleSide,
                    flatShading: true
                });
                break;
            }

            /* 🌿 Bushy Tree */
            case 'bushy': {
                trunkGeo = new THREE.CylinderGeometry(0.07 * scale, 0.12 * scale, 0.4 * scale, 6);
                trunkGeo.translate(0, 0.2 * scale, 0);

                const leaves = [];
                for (let i = 0; i < 3; i++) {
                    const g = new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.1);
                    g.translate(
                        (Math.random() - 0.5) * 0.2,
                        0.5 + Math.random() * 0.3,
                        (Math.random() - 0.5) * 0.2
                    );
                    g.scale(scale, scale, scale);
                    leaves.push(g);
                }
                leavesGeo = BufferGeometryUtils.mergeGeometries(leaves, false);
                leavesMat = new THREE.MeshStandardMaterial({
                    color: 0x2e8b57,
                    side: THREE.DoubleSide,
                    flatShading: true
                });
                break;
            }

            /* 🌴 Palm Tree (realistic bend + drooping fronds) */          
            case 'palm': {
                // Customizable parameters
                const trunkHeight = scale;
                const trunkBendX = 0.2;
                const trunkBendZ = 0.1;
                const frondCount = 6;
                const frondLengthBase = 1.2 * scale;
                const frondWidthBase = 0.4 * scale;
                const frondTiltDegBase = 100;
                const frondDroopBase = 0.2;

                // === TRUNK ===
                const trunkGeo = new THREE.CylinderGeometry(0.08 * scale, 0.15 * scale, trunkHeight, 8, 10, true);
                trunkGeo.translate(0, trunkHeight / 2, 0);

                const pos = trunkGeo.attributes.position;
                const v = new THREE.Vector3();
                for (let i = 0; i < pos.count; i++) {
                    v.fromBufferAttribute(pos, i);
                    const t = v.y / trunkHeight;
                    v.x += Math.sin(t * Math.PI * 0.5) * trunkBendX * scale;
                    v.z += Math.sin(t * Math.PI * 0.25) * trunkBendZ * scale;
                    pos.setXYZ(i, v.x, v.y, v.z);
                }
                pos.needsUpdate = true;
                trunkGeo.computeVertexNormals();

                const trunkMat = new THREE.MeshStandardMaterial({
                    color: 0x8b5a2b,
                    flatShading: true,
                });

                // === FIND TOP OF CURVED TRUNK ===
                let topX = 0, topZ = 0, count = 0;
                for (let i = 0; i < pos.count; i++) {
                    if (Math.abs(pos.getY(i) - trunkHeight) < 0.01) {
                        topX += pos.getX(i);
                        topZ += pos.getZ(i);
                        count++;
                    }
                }
                topX /= count;
                topZ /= count;
                const topPosition = new THREE.Vector3(topX, trunkHeight, topZ);

                // === FRONDS ===
                const frondGeometries = [];

                for (let i = 0; i < frondCount; i++) {
                    // Random scale for each frond
                    const frondScale = 0.8 + Math.random() * 0.4; // 0.8–1.2
                    const frondLength = frondLengthBase * frondScale;
                    const frondWidth = frondWidthBase * frondScale;

                    const g = new THREE.PlaneGeometry(frondWidth, frondLength, 1, 16);
                    g.translate(0, frondLength / 2, 0);

                    const pa = g.attributes.position;
                    const tmp = new THREE.Vector3();

                    // Random bend multiplier
                    const bendFactor = 0.7 + Math.random() * 0.4; // 0.7–1.1

                    for (let j = 0; j < pa.count; j++) {
                        tmp.fromBufferAttribute(pa, j);
                        const t = tmp.y / frondLength;

                        // Bend downward with variation
                        tmp.z -= Math.sin(t * Math.PI) * frondDroopBase * scale * bendFactor;

                        // Thin at base and tip
                        const widthScale = Math.sin(t * Math.PI);
                        tmp.x *= widthScale * 0.8;

                        // Gentle curve along Y
                        tmp.y += Math.sin(t * Math.PI) * 0.05 * scale;

                        // Slight twist
                        tmp.z += Math.sin(t * Math.PI * 2) * 0.02 * scale;

                        pa.setXYZ(j, tmp.x, tmp.y, tmp.z);
                    }
                    pa.needsUpdate = true;
                    g.computeVertexNormals();

                    // Radial placement with variation
                    const angle = (i / frondCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
                    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);

                    // Tilt with per-frond variation
                    const tiltDeg = frondTiltDegBase * (0.9 + Math.random() * 0.2);
                    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(tiltDeg));
                    q.multiply(tilt);

                    const m = new THREE.Matrix4();
                    m.compose(topPosition, q, new THREE.Vector3(1, 1, 1));
                    g.applyMatrix4(m);

                    frondGeometries.push(g);
                }

                const leavesGeo = BufferGeometryUtils.mergeGeometries(frondGeometries);
                const leavesMat = new THREE.MeshStandardMaterial({
                    color: 0x1f8b3a,
                    side: THREE.DoubleSide,
                    flatShading: true,
                });

                return {
                    trunk: { geometry: trunkGeo, material: trunkMat, partName: 'trunk' },
                    leaves: { geometry: leavesGeo, material: leavesMat, partName: 'leaves' },
                };
            }

            case 'snowyPine': {
                const trunkHeight = 1 * scale;
                const trunkRadiusTop = 0.05 * scale;
                const trunkRadiusBottom = 0.12 * scale;

                trunkGeo = new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkHeight, 8, 10, true);
                trunkGeo.translate(0, trunkHeight / 2, 0);

                trunkMat = new THREE.MeshStandardMaterial({
                    color: 0x8b5a2b,
                    flatShading: true
                });

                const leaves = [];
                const coneCount = 5; // more layers for snowy look
                for (let i = 0; i < coneCount; i++) {
                    const radius = 0.5 - i * 0.08;
                    const height = 0.6 - i * 0.05;
                    const g = new THREE.ConeGeometry(radius * scale, height * scale, 8, 1, true);

                    // Place each cone along trunk
                    const yOffset = 0.5 + i * 0.25;
                    g.translate(0, yOffset * scale, 0);

                    // Slight droop for snow weight
                    const posAttr = g.attributes.position;
                    const tmp = new THREE.Vector3();
                    for (let j = 0; j < posAttr.count; j++) {
                        tmp.fromBufferAttribute(posAttr, j);
                        tmp.z -= Math.sin((tmp.y / height) * Math.PI) * 0.05 * scale; // slight downward bend
                        posAttr.setXYZ(j, tmp.x, tmp.y, tmp.z);
                    }
                    posAttr.needsUpdate = true;
                    g.computeVertexNormals();

                    leaves.push(g);
                }

                leavesGeo = BufferGeometryUtils.mergeGeometries(leaves, false);
                leavesMat = new THREE.MeshStandardMaterial({
                    color: 'white', //0x045d27, // darker green
                    side: THREE.DoubleSide,
                    flatShading: true
                });

                break;
            }


            /* 🍃 Round Tree (default) */
            default: {

                trunkGeo = new THREE.CylinderGeometry(0.07 * scale, 0.12 * scale, 0.4 * scale, 6);
                trunkGeo.translate(0, 0.2 * scale, 0);

                const leaves = [];
                for (let i = 0; i < 3; i++) {
                    const g = new THREE.SphereGeometry(0.35 + Math.random() * 0.05, 8, 8);
                    g.translate(
                        (Math.random() - 0.5) * 0.2,
                        0.5 + i * 0.15,
                        (Math.random() - 0.5) * 0.2
                    );
                    g.scale(scale, scale, scale);
                    leaves.push(g);
                }
                leavesGeo = BufferGeometryUtils.mergeGeometries(leaves, false);
                break;
            }
        }

        return {
            trunk: { geometry: trunkGeo, material: trunkMat, partName: 'trunk' },
            leaves: { geometry: leavesGeo, material: leavesMat, partName: 'leaves' }
        };
    }
}


