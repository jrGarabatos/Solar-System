export class hexasphere {

    t = (1 + Math.sqrt(5)) / 2;
    
    // 12 vertices of the original icosahedron
    basePositions = [
    [-1,  this.t,  0], [ 1,   this.t,  0], [-1, - this.t,  0], [ 1, - this.t,  0],
    [ 0, -1,   this.t], [ 0,  1,   this.t], [ 0, -1, - this.t], [ 0,  1, - this.t],
    [  this.t,  0, -1], [  this.t,  0,  1], [- this.t,  0, -1], [- this.t,  0,  1],
    ].map(v => {
        const len = Math.hypot(...v);
        return [v[0] / len, v[1] / len, v[2] / len];
    });

    // 20  faces of the original icosahedron
    baseIndices = new Uint16Array([
        0,11,5,  0,5,1,  0,1,7,  0,7,10, 0,10,11,
        1,5,9,   5,11,4, 11,10,2, 10,7,6, 7,1,8,
        3,9,4,   3,4,2,  3,2,6,  3,6,8,  3,8,9,
        4,9,5,   2,4,11, 6,2,10, 8,6,7,  9,8,1
    ]);    


    constructor(order, frequency = false, uv = false, radius = 1) {
        
        this.order = order;
        this.radius = radius;

        if (!frequency) {
            [this.positions, this.indices] = this.order > 0 
                ? this.subdivideFaces(this.basePositions, this.baseIndices, this.order) 
                : [new Float32Array(this.basePositions.flat()), this.baseIndices];
        }
        else {
            [this.positions, this.indices] = this.order > 1 
                ? this.subdivideFacesFrequencyDeduplicated(this.basePositions, this.baseIndices, this.order) 
                : [new Float32Array(this.basePositions.flat()), this.baseIndices];
        }

        // Scale vertices to match desired radius
        for (let i = 0; i < this.positions.length; i++) {
            this.positions[i] *= this.radius;
        }

        [this.dualVertices, this.vertexToFaces] = this.computeDual(this.positions, this.indices);
        this.dualFaces = this.buildDualFacesByAdjacency(this.indices, this.vertexToFaces);

        if (uv) {
            this.uvs = this.buildUVMap(this.dualFaces, this.dualVertices);
        }
    }

    /**
     * Subdivide triangle faces on a unit sphere, deduplicating to share vertices across adjacent faces.
     *
     * @param {Array<[number, number, number]>} verts - Original vertex positions
     * @param {Uint16Array|Uint32Array} indices - Triangle indices
     * @param {number} frequency - Subdivision frequency >= 1
     * @param {number} tolerance - Positional merge tolerance (default 1e-6)
     * @returns {[Float32Array, Uint32Array]} [positions, indices]
     */
    subdivideFacesFrequencyDeduplicated(verts, indices, frequency, tolerance = 1e-6) {
        if (frequency < 1) throw new Error("Frequency must be >= 1");

        const rawPositions = [];
        const rawIndices = [];

        for (let i = 0; i < indices.length; i += 3) {
            const ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
            const a = verts[ia], b = verts[ib], c = verts[ic];

            // Create barycentric grid
            const grid = [];

            for (let row = 0; row <= frequency; row++) {
                const rowIndices = [];

                for (let col = 0; col <= row; col++) {
                    const u = row / frequency;
                    const v = col / row || 0;

                    // Interpolate on triangle
                    let p;
                    if (row === 0) {
                        p = a;
                    } else {
                        const ab = [
                            (1 - u) * a[0] + u * b[0],
                            (1 - u) * a[1] + u * b[1],
                            (1 - u) * a[2] + u * b[2],
                        ];
                        const ac = [
                            (1 - u) * a[0] + u * c[0],
                            (1 - u) * a[1] + u * c[1],
                            (1 - u) * a[2] + u * c[2],
                        ];

                        p = [
                            (1 - v) * ac[0] + v * ab[0],
                            (1 - v) * ac[1] + v * ab[1],
                            (1 - v) * ac[2] + v * ab[2],
                        ];
                    }

                    // Project to sphere
                    const len = Math.hypot(p[0], p[1], p[2]);
                    p = [p[0] / len, p[1] / len, p[2] / len];

                    const idx = rawPositions.length;
                    rawPositions.push(p);
                    rowIndices.push(idx);
                }

                grid.push(rowIndices);
            }

            // Create triangle faces
            for (let row = 0; row < frequency; row++) {
                for (let col = 0; col <= row; col++) {
                    const i0 = grid[row][col];
                    const i1 = grid[row + 1][col];
                    const i2 = grid[row + 1][col + 1];
                    rawIndices.push(i0, i1, i2);

                    if (col < row) {
                        const i3 = grid[row][col + 1];
                        rawIndices.push(i0, i2, i3);
                    }
                }
            }
        }

        // Deduplicate positions using spatial hash
        const dedupMap = new Map();
        const posArray = [];
        const remap = new Uint32Array(rawPositions.length);

        const makeKey = (p) => {
            const x = Math.round(p[0] / tolerance);
            const y = Math.round(p[1] / tolerance);
            const z = Math.round(p[2] / tolerance);
            return `${x},${y},${z}`;
        };

        for (let i = 0; i < rawPositions.length; i++) {
            const p = rawPositions[i];
            const key = makeKey(p);

            if (dedupMap.has(key)) {
                remap[i] = dedupMap.get(key);
            } else {
                const newIdx = posArray.length;
                posArray.push(p);
                dedupMap.set(key, newIdx);
                remap[i] = newIdx;
            }
        }

        // Remap indices
        const dedupedIndices = new Uint32Array(rawIndices.length);
        for (let i = 0; i < rawIndices.length; i++) {
            dedupedIndices[i] = remap[rawIndices[i]];
        }

        // Flatten position array
        const dedupedPositions = new Float32Array(posArray.length * 3);
        for (let i = 0; i < posArray.length; i++) {
            dedupedPositions[i * 3 + 0] = posArray[i][0];
            dedupedPositions[i * 3 + 1] = posArray[i][1];
            dedupedPositions[i * 3 + 2] = posArray[i][2];
        }

        return [dedupedPositions, dedupedIndices];
    }

    /*  Create a a geodesic-like spherical               */
    buildDualFacesByAdjacency(indices, vertexToFaces) {
        const faceCount = indices.length / 3;

        // 1. Collect edges as flat array: [vMin, vMax, faceIndex]
        const edgeList = new Uint32Array(faceCount * 3 * 3);
        let ei = 0;

        for (let i = 0; i < indices.length; i += 3) {
            const f = i / 3;
            const a = indices[i], b = indices[i + 1], c = indices[i + 2];

            const edges = [
                [Math.min(a, b), Math.max(a, b)],
                [Math.min(b, c), Math.max(b, c)],
                [Math.min(c, a), Math.max(c, a)]
            ];

            for (const [v0, v1] of edges) {
                edgeList[ei++] = v0;
                edgeList[ei++] = v1;
                edgeList[ei++] = f;
            }
        }

        const edgeEntryCount = edgeList.length / 3;

        // 2. Sort edges lex by (vMin, vMax)
        const indicesArray = new Uint32Array(edgeEntryCount);
        for (let i = 0; i < edgeEntryCount; i++) indicesArray[i] = i;

        indicesArray.sort((i, j) => {
            const i0 = edgeList[i * 3], i1 = edgeList[i * 3 + 1];
            const j0 = edgeList[j * 3], j1 = edgeList[j * 3 + 1];
            return i0 - j0 || i1 - j1;
        });

        // 3. Build face neighbors
        const faceNeighbors = Array.from({ length: faceCount }, () => []);

        for (let k = 1; k < edgeEntryCount; k++) {
            const i = indicesArray[k - 1];
            const j = indicesArray[k];

            const vi0 = edgeList[i * 3], vi1 = edgeList[i * 3 + 1];
            const vj0 = edgeList[j * 3], vj1 = edgeList[j * 3 + 1];

            if (vi0 === vj0 && vi1 === vj1) {
                const f1 = edgeList[i * 3 + 2];
                const f2 = edgeList[j * 3 + 2];
                faceNeighbors[f1].push(f2);
                faceNeighbors[f2].push(f1);
            }
        }

        // 4. Build dual faces
        const dualFaces = [];

        const visited = new Uint8Array(faceCount);

        for (let vi = 0; vi < vertexToFaces.length; vi++) {
            const faces = vertexToFaces[vi];
            if (faces.length < 3) continue;

            // Clear visited per vertex
            for (let k = 0; k < faces.length; k++) {
                visited[faces[k]] = 0;
            }

            const ring = [];

            let current = faces[0];
            ring.push(current);
            visited[current] = 1;

            // Walk forward
            while (true) {
                const neighbors = faceNeighbors[current];
                let next = -1;
                for (let ni = 0; ni < neighbors.length; ni++) {
                    const f = neighbors[ni];
                    if (!visited[f] && faces.includes(f)) {
                        next = f;
                        break;
                    }
                }
                if (next === -1) break;
                ring.push(next);
                visited[next] = 1;
                current = next;
            }

            // Walk backward
            current = faces[0];
            while (true) {
                const neighbors = faceNeighbors[current];
                let next = -1;
                for (let ni = 0; ni < neighbors.length; ni++) {
                    const f = neighbors[ni];
                    if (!visited[f] && faces.includes(f)) {
                        next = f;
                        break;
                    }
                }
                if (next === -1) break;
                ring.unshift(next);
                visited[next] = 1;
                current = next;
            }

            if (ring.length >= 3) {
                dualFaces.push(ring);
            }
        }

        return dualFaces;
    }

    computeDual(positions, indices) {
        const faceCenters = new Float32Array((indices.length / 3) * 3);
        const vertexToFaces = new Array(positions.length / 3);

        for (let i = 0; i < vertexToFaces.length; i++) {
            vertexToFaces[i] = [];
        }

        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i], b = indices[i + 1], c = indices[i + 2];
            const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
            const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
            const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];

            let cxn = (ax + bx + cx) / 3;
            let cyn = (ay + by + cy) / 3;
            let czn = (az + bz + cz) / 3;
            const len = Math.hypot(cxn, cyn, czn);
            //cxn /= len; cyn /= len; czn /= len;
            cxn = (cxn / len) * this.radius;
            cyn = (cyn / len) * this.radius;
            czn = (czn / len) * this.radius;

            const fi = i / 3;
            faceCenters[fi * 3] = cxn;
            faceCenters[fi * 3 + 1] = cyn;
            faceCenters[fi * 3 + 2] = czn;

            vertexToFaces[a].push(fi);
            vertexToFaces[b].push(fi);
            vertexToFaces[c].push(fi);
        }

        return [faceCenters, vertexToFaces];
    }


    /*                               UV Mapping                                           */

    // Convert vertex [x, y, z] to spherical coordinates
    toLatLon(x, y, z) {
        const r = Math.sqrt(x * x + y * y + z * z);
        const lat = Math.asin(y / r); // in radians
        const lon = Math.atan2(z, x); // in radians
        return { lat, lon };
    }


    // Convert spherical coords to UV
    toUV(lat, lon) {
        const u = 0.5 + lon / (2 * Math.PI);      // range [0, 1]
        const v = 0.5 - lat / Math.PI;            // range [0, 1]
        return { u, v };
    }

    // Build uvs[] for each vertex of each dual face
   
    buildUVMap(dualFaces, dualVertices) {
        const uvs = [];
        for (const face of dualFaces) {
            const verts = face.map(i => [
                dualVertices[i * 3],
                dualVertices[i * 3 + 1],
                dualVertices[i * 3 + 2]
            ]);

           const faceUVs = verts.map(([x, y, z]) => {
                const { lat, lon } = this.toLatLon(x, y, z);
                const { u, v } = this.toUV(lat, lon);
                return [u, v];
            });

            for (let i = 1; i < faceUVs.length - 1; i++) {
                uvs.push(...faceUVs[0], ...faceUVs[i], ...faceUVs[i + 1]);
            }
        }
        return uvs;
    }

}
