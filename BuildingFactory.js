import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class BuildingFactory {
  static createBase(type = 'house', options = {}) {
    const { scale = 0.5, width, height, depth } = options;
    
    const materials = {
      concrete: new THREE.MeshStandardMaterial({
        color: 0xb0b0b0,
        roughness: 0.9,
        metalness: 0.1,
      }),
      brick: new THREE.MeshStandardMaterial({
        color: 0xa0522d,
        roughness: 0.8,
        metalness: 0.2,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.4,
        metalness: 0.8,
      }),
    };

    let mesh;

    switch (type) {

      case 'skyscraper': {
        const h = (height ?? THREE.MathUtils.randFloat(3.5, 6.0)) * scale;
        const w = (width ?? THREE.MathUtils.randFloat(0.6, 1.2)) * scale;
        const d = (depth ?? w);

        console.log(h, w, d);
        
        // Shader material for procedural windows
        const buildingMaterial = new THREE.ShaderMaterial({
          defines: { USE_INSTANCING: '' },
          uniforms: {
            baseColor: { value: new THREE.Color(0x6a717b) },
            windowColor: { value: new THREE.Color(0xaac8e6) },
            lightDirection: { value: new THREE.Vector3(0.3, 1.0, 0.5).normalize() },
            ambientLight: { value: 0.45 },
            windowRows: { value: 18 },
            windowCols: { value: 10 },
            emissiveStrength: { value: 1.4 },
          },
          vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldNormal;
            varying vec3 vWorldUp;

            void main() {
              vUv = uv;

              #ifdef USE_INSTANCING
                mat4 inst = instanceMatrix;
              #else
                mat4 inst = mat4(1.0);
              #endif

              // Full world-space matrix
              mat4 world = modelMatrix * inst;
              vec4 worldPosition = world * vec4(position, 1.0);

              // World-space normal
              vWorldNormal = normalize(mat3(world) * normal);

              // Correct Y-axis extraction (local up)
              vWorldUp = normalize(vec3(world[1][0], world[1][1], world[1][2]));

              gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
          `,
          fragmentShader: `
            uniform vec3 baseColor;
            uniform vec3 windowColor;
            uniform vec3 lightDirection;
            uniform float ambientLight;
            uniform float windowRows;
            uniform float windowCols;
            uniform float emissiveStrength;

            varying vec2 vUv;
            varying vec3 vWorldNormal;
            varying vec3 vWorldUp;

            float random(vec2 st) {
              return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453);
            }

            void main() {
              vec3 N = normalize(vWorldNormal);
              vec3 up = normalize(vWorldUp);

              float vertical = dot(N, up);

              // Side wall mask: vertical close to 0
              float isWall = step(-0.7, vertical) * step(vertical, 0.7);

              // Procedural window grid
              vec2 grid = vec2(windowCols, windowRows);
              vec2 uvScaled = vUv * grid;
              vec2 cell = fract(uvScaled);
              float frame = 0.12;
              float windowMask = step(frame, cell.x) * step(cell.x, 1.0 - frame)
                              * step(frame, cell.y) * step(cell.y, 1.0 - frame);
              
              float rand = random(floor(uvScaled));
              float windowLit = step(0.4, rand);
              windowMask *= isWall * windowLit;

              // Lighting
              vec3 L = normalize(lightDirection);
              float diffuse = max(dot(N, L), 0.0);
              float brightness = ambientLight + diffuse * 0.8;
              brightness = clamp(brightness, 0.2, 1.0);

              vec3 wall = baseColor * brightness;

              // Fake reflection (Fresnel)
              float fresnel = pow(1.0 - max(dot(N, L), 0.0), 2.0);
              wall += vec3(0.1, 0.1, 0.12) * fresnel;

              // Window emissive glow
              float flicker = 0.8 + 0.3 * random(vUv * 20.0);
              vec3 windowGlow = windowColor * emissiveStrength * flicker * windowMask;

              // Combine wall + window
              vec3 color = mix(wall, windowGlow, windowMask);

              gl_FragColor = vec4(color, 1.0);
            }
          `,
        });

        // Small base color variation
        buildingMaterial.uniforms.baseColor.value.offsetHSL(
          0,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        );

        const geometry = new THREE.BoxGeometry(w, h, d);
        geometry.translate(0, h / 2, 0);

        const mesh = new THREE.Mesh(geometry, buildingMaterial);
        mesh.position.y = h / 2;

        return { mesh };
      }

      case 'house': {
        const h = (height ?? THREE.MathUtils.randFloat(1.2, 2.0)) * scale;
        const w = (width ?? THREE.MathUtils.randFloat(1.0, 1.5)) * scale;
        const d = (depth ?? THREE.MathUtils.randFloat(1.0, 1.5)) * scale;

        const base = new THREE.BoxGeometry(w, h, d);
        const roof = new THREE.ConeGeometry(w * 0.7, h * 0.5, 4);
        roof.rotateY(Math.PI / 4);
        roof.translate(0, h / 2 + h * 0.25, 0);

        const geom = BufferGeometryUtils.mergeGeometries([base, roof]);
        const material = Math.random() < 0.5 ? materials.brick.clone() : materials.concrete.clone();
        material.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);

        mesh = new THREE.Mesh(geom, material);
        mesh.position.y = h / 2;
        break;
      }

      case 'hut': {
        const h = (height ?? THREE.MathUtils.randFloat(1.0, 1.5)) * scale;
        const r = (width ?? THREE.MathUtils.randFloat(0.6, 1.0)) * scale;

        const base = new THREE.CylinderGeometry(r, r * 1.1, h, 12);
        const roof = new THREE.ConeGeometry(r * 1.2, h * 0.8, 12);
        roof.translate(0, h / 2 + h * 0.4, 0);
        roof.rotateZ(THREE.MathUtils.randFloat(-0.05, 0.05));
        roof.rotateX(THREE.MathUtils.randFloat(-0.05, 0.05));

        const geom = BufferGeometryUtils.mergeGeometries([base, roof]);
        mesh = new THREE.Mesh(geom, materials.brick.clone());
        mesh.position.y = h / 2;
        break;
      }

      case 'dome': {
        const r = (width ?? THREE.MathUtils.randFloat(1.0, 1.5)) * scale;
        const h = r * 0.6; // flattened hemisphere

        // Hemisphere geometry (top half only)
        const geom = new THREE.SphereGeometry(r, 48, 48, 0, Math.PI * 2, 0, Math.PI / 2);
        geom.translate(0, h / 2, 0);
            
        // Shader material with block lines
        const material = new THREE.ShaderMaterial({
          defines: { USE_INSTANCING: '' },
          uniforms: {
            color1: { value: new THREE.Color(0xe0f0ff) },        // ice = white
            lineColor: { value: new THREE.Color(0xb0e0ff) },     // grooves = blue
            lineWidth: { value: 0.007 },
            blocksU: { value: 10 },
            blocksV: { value: 10 },
          },
          vertexShader: `
            varying vec3 vPos;
            varying vec3 vNormal;
          
            void main() {
              vPos = position;

              #ifdef USE_INSTANCING
                mat4 inst = instanceMatrix;
              #else
                mat4 inst = mat4(1.0);
              #endif

              // Full world-space matrix
              mat4 world = modelMatrix * inst;
              vec4 worldPosition = world * vec4(position, 1.0);

              // World-space normal
              vNormal = normalize(mat3(world) * normal);

              gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
          `,
          fragmentShader: `
              uniform vec3 color1;
              uniform vec3 lineColor;
              uniform float lineWidth;
              uniform float blocksU;
              uniform float blocksV;

              varying vec3 vPos;

              // Random function based on 2D input
              float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
              }

              void main() {
                // Convert to spherical coordinates
                float u = atan(vPos.z, vPos.x) / (2.0 * 3.1415926);
                if (u < 0.0) u += 1.0;
                float v = acos(vPos.y / length(vPos)) / 3.1415926;

                // Determine which row and column we're in
                float row = floor(v * blocksV);
                float col = floor(u * blocksU);

                // Offset every other row
                if (mod(row, 2.0) == 1.0) {
                  u += 0.5 / blocksU;
                }

                // Introduce some randomness per brick
                float jitter = (random(vec2(row, col)) - 0.5) * 0.2 / blocksU;
                u += jitter;

                // Get fractional position inside brick
                float fu = fract(u * blocksU);
                float fv = fract(v * blocksV);

                // Binary line detection (crisp lines)
                float line = 0.0;
                if (fu < lineWidth || fu > 1.0 - lineWidth) line = 1.0;
                if (fv < lineWidth || fv > 1.0 - lineWidth) line = 1.0;

                // Mix color
                vec3 finalColor = mix(color1, lineColor, line);
                gl_FragColor = vec4(finalColor, 1.0);
              }
          `,
        });

        
        mesh = new THREE.Mesh(geom, material);
        //mesh = new THREE.Mesh(geom, materials.metal.clone());
      
        break;
      }

      default: {
        const s = scale;
        const geom = new THREE.BoxGeometry(s, s, s);
        mesh = new THREE.Mesh(geom, materials.concrete.clone());
        mesh.position.y = s / 2;
      }
    }

    return { mesh };
  }
}
