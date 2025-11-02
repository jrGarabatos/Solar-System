import * as THREE from 'three';
import { CameraController } from './cameraController.js';
import { PlanetWithDecorations } from './PlanetWithDecorations.js';
import { Planet } from './Planet.js';
import { TreeFactory } from './TreeFactory.js';

class SolarSystemApp {

    planets = [];

    constructor() {
        console.log('initialized');
      
        // DOM
        this.sceneWindow = document.getElementById('scene');

        // DOM elements for loading indicator, projection image, and container for the 3D scene
        this.loading = document.getElementById('loading');
        //this.sceneWindow = document.getElementById('scene');

        // resize
        window.addEventListener('resize', () => this.onResize());


        this.init();     
    }

    /**
     * Initialize the application by hiding loading,
     * preparing projection image pixel data,
     * setting up Three.js renderer, camera, scene, controls,
     * camera states, LOD groups, and starting the animation loop.
     */
    init() {
        // Hide loading indicator once everything is ready
        this.loading.style.display = 'none';

        // Setup Three.js essentials
        this.setupThree();

        // Setup Planets
        this.setUpPlanets();

        // Setup orbit controls for camera interaction
        this.setupControls();

        // Start the animation loop
        this.start();
    }

    /**
     * Initialize Three.js renderer, scene, camera, and lighting.
     */
    setupThree() {
        const width = this.sceneWindow.offsetWidth;
        const height = this.sceneWindow.offsetHeight;

        // Create renderer with anti-aliasing enabled
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.sceneWindow.appendChild(this.renderer.domElement);

        // Create perspective camera
        const fov = 60;
        const aspect = width / height;
        const near = 0.1; // the near clipping plane
        const far = 1000000; // the far clipping plane

        this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        this.camera.position.set(0, 500, 1500);  // closer and angled
        
        // Create the scene
        this.scene = new THREE.Scene();

        // Add ambient and directional lights for good shading
        const ambient = new THREE.AmbientLight(0xffffff, 1.2);
        const dir1 = new THREE.DirectionalLight(0xffffff, 0.3);
        dir1.position.set(0, 1, 0);
        const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
        dir2.position.set(1, 1, 0);
        const dir3 = new THREE.DirectionalLight(0xffffff, 0.3);
        dir3.position.set(0, 1, 1);

        this.scene.add(ambient, dir1, dir2, dir3);       
        
        // Lighting: bright sun at origin
        const sunLight = new THREE.PointLight(0xffffff, 2, 0, 2);
        sunLight.position.set(0, 0, 0);
        this.scene.add(sunLight);
    }

    /**
     * Setup the CameraController instance to handle user input for camera orbit, pan, zoom.
     */
    setupControls() {

        // Collect all planets and moons
        const focusObjects = [];
        this.planets.map(p => {
            focusObjects.push(p.planetGroup);
            //p.moons.map(m => focusObjects.push(m.planetGroup));      
        });

        this.controls = new CameraController(this.camera, this.renderer.domElement, {
            scene: this.scene,
            enableOrbit: true,
            orbitTarget: new THREE.Vector3(0, 0, 0), //look at the solar system center
            //focusObjects: this.planets.map(p => p.group), // use the actual THREE.Group from each Planet you want to cycle through
            focusObjects,
            moveSpeed: 50, //0.2,
            lookSpeed: 0.05, //0.3,
            panSpeed: 50, //0.2,
            zoomSpeed: 50, //0.2,
            toggleKey: 'KeyC', // press 'C' to toggle between camera orbit modes
            minOrbitPitch: THREE.MathUtils.degToRad(-85),
            maxOrbitPitch: THREE.MathUtils.degToRad(75),
            maxOrbitDistance: 5000,
        });

        this.controls.update();
    }

    setUpPlanets() {

        // Build planets
        const sun = new Planet({
            name: "Sun",
            textureImg: document.getElementById("sunProjection"),
            radius: 20,
            orbitRadius: 0, // fixed in center
            orbitSpeed: 0,
            orbitAngle: 0,
            parentPlanet: null,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 7, mid: 2 },
            heightScale: 0.5,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0xff4500) }, // orange-red
                    { height:  0.0, color: new THREE.Color(0xffd700) }, // golden yellow
                    { height:  1.0, color: new THREE.Color(0xffdd88) }  // white-hot
                ]
            }
        });

        const mercury = new Planet({
            name: "Mercury",
            textureImg: document.getElementById("mercuryProjection"),
            radius: 3,                 // very small
            orbitRadius: 40,           // closest orbit
            orbitSpeed: 0.015,         // fastest orbit
            orbitAngle: Math.PI / 8,   // just offset for variety
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 7, mid: 1 },
            heightScale: 0.1,          // crater-like bumps
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0x2f2f2f) }, // dark craters
                { height:  0.0, color: new THREE.Color(0x696969) }, // gray surface
                { height:  1.0, color: new THREE.Color(0xdcdcdc) }  // light highlights
                ]
            }
        });

        const venus = new Planet({
            name: "Venus",
            textureImg: document.getElementById("venusProjection"),
            radius: 7.5,               // almost Earth-sized
            orbitRadius: 70,           // between Mercury (40) and Earth (100)
            orbitSpeed: 0.012,         // slower than Mercury, faster than Earth
            orbitAngle: Math.PI / 5,   // offset for visual spread
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 1 },
            heightScale: 0.2,          // smooth clouds, not rocky
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0xcd853f) }, // tan brownish
                { height:  0.0, color: new THREE.Color(0xdeb887) }, // light brown
                { height:  0.5, color: new THREE.Color(0xffd700) }, // golden yellow
                { height:  1.0, color: new THREE.Color(0xffe4b5) }  // pale creamy clouds
                ]
            }
        });
     
        
        const earth = new PlanetWithDecorations({
            name: "Earth",
            textureImg: document.getElementById("earthProjection"),
            radius: 8,
            orbitRadius: 100,
            orbitSpeed: 0.01,
            orbitAngle: 0,       // start at +X
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 50 },
            lodDistances: { low: 5, mid: 2.5 },
            heightScale: 0.2,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0x000033) }, // deep ocean
                    { height: -0.2, color: new THREE.Color(0x1e90ff) }, // shallow water
                    { height:  0.0, color: new THREE.Color(0x228b22) }, // lowland green
                    { height:  0.5, color: new THREE.Color(0x8b4513) }, // mountains brown
                    { height:  1.0, color: new THREE.Color(0xffffff) }, // snowcaps
                ]
            },
            freezedPole: true,
        });
        
        earth.registerDecoration('trees', {
            heightRange: [0.0, 0.8],        // only spawn between 0–80% of max terrain height
            density: 0.5,                   // fraction of tiles that get a tree
            heightOffset: 0.0,              // at surface
            clusterSize: [4, 8],            // trees per cluster
            clusterRadius: 0.08,            // spread of trees in cluster

            types: [
                { type: 'round',     scale: 0.2 },
                { type: 'pine',      scale: 0.2 },
                { type: 'bushy',     scale: 0.2 },
                { type: 'snowyPine', scale: 0.2 },
                //{ type: 'palm',      scale: 0.0075, path: './models/scene.gltf',     meshNames: ['Object_192', 'Object_193'] },
                { type: 'palm',      scale: 0.0075, path: './models/scene.gltf',     meshIndices: [106, 107] },
            ],
            
            // Pick tree type based on height/latitude
            typeSelector: (h, lat) => {
                const absLat = Math.abs(lat);
                const latFactor = absLat / 90;
                const heightFactor = THREE.MathUtils.clamp(h * 5, 0, 1);
                const temperature = THREE.MathUtils.clamp(1 - (0.7 * latFactor + 0.3 * heightFactor), 0, 1);
        
                if (temperature > 0.2 && temperature < 0.5) return h > 0.05 ? 'snowyPine' : null;
                if (temperature > 0.55 && temperature < 0.7) return h < 0.05 ? 'pine' : null;
                if (temperature > 0.7 && temperature < 0.8) return h < 0.05 ? 'round' : h < 0.07 ? 'bushy' : null;
                if (temperature > 0.8 && temperature < 0.9) return h < 0.05 ? 'bushy' : h < 0.07 ? 'round' : null;
                if (temperature >= 0.9) {
                    if (h < 0.03) return 'palm';
                    if (h < 0.06) return 'bushy';
                    if (h < 0.09) return 'round';
                }
                return null;
            },
            proceduralFactory: (type, scale) => TreeFactory.createBase(type, scale),  // Use the procedural TreeFactory
            compatibility: { shareableWith: ['clouds'] } // optional
        });

        earth.registerDecoration('clouds', {
            heightRange: [-1.0, 1.0],
            density: 0.025,
            heightOffset: .5, // floats above surface
            clusterSize: [0, 1],
            clusterRadius: 1,
            types: [
                { type: 'cloud1',  scale: 0.01, path: './models/scene.gltf', meshNames: ['Object_64'] },
                { type: 'cloud2',  scale: 0.01, path: './models/scene.gltf', meshNames: ['Object_52'] },
                { type: 'cloud3',  scale: 0.01, path: './models/scene.gltf', meshNames: ['Object_76'] },
            ],
            typeSelector: () => { 
                const clouds = ['cloud1', 'cloud2', 'cloud3'];    
                // Select a random element
                return clouds[Math.floor(Math.random() * clouds.length)];
            },
            compatibility: { shareableWith: ['clouds'] } // clouds don’t mix
            //compatibility: { exclusive: true } // clouds don’t mix
        });

        earth.addMoon({
            name: "Moon",
            textureImg: document.getElementById("moonProjection"),
            radius: 0.8, 
            orbitRadius: 15,     
            orbitSpeed: 0.05,
            orbitAngle: 0,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 150, mid: 80 },
            heightScale: 0.03,
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0x2f2f2f) },
                { height:  0.0, color: new THREE.Color(0xaaaaaa) },
                { height:  1.0, color: new THREE.Color(0xffffff) }
                ]
            }
        });

        const mars = new Planet({
            name: "Mars",
            textureImg: document.getElementById("marsProjection"),
            radius: 6,
            orbitRadius: 120,
            orbitSpeed: 0.003,
            orbitAngle: Math.PI / 2,   // start at +Z (90°)
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.5,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0x2f4f4f) }, // ancient seabeds
                    { height:  0.0, color: new THREE.Color(0xb22222) }, // red plains
                    { height:  0.5, color: new THREE.Color(0xcd853f) }, // highlands ochre
                    { height:  1.0, color: new THREE.Color(0xffffff) }, // polar caps
                ]
            }
        });

        const jupiter = new Planet({
            name: "Jupiter",
            textureImg: document.getElementById("jupiterProjection"),
            radius: 15,
            orbitRadius: 250,
            orbitSpeed: 0.004,
            orbitAngle: Math.PI / 3,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 3 },
            heightScale: 0.2, // subtle "bands"
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0xffa07a) }, // light salmon
                { height:  0.0, color: new THREE.Color(0xf4a460) }, // sandy orange
                { height:  0.5, color: new THREE.Color(0xd2b48c) }, // tan
                { height:  1.0, color: new THREE.Color(0xffffff) }  // white bands
                ]
            }
        });

        const saturn = new Planet({
            name: "Saturn",
            textureImg: document.getElementById("saturnProjection"),
            radius: 13,
            orbitRadius: 350,
            orbitSpeed: 0.003,
            orbitAngle: Math.PI / 4,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.2,
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0xf5deb3) }, // wheat
                { height:  0.0, color: new THREE.Color(0xdeb887) }, // burlywood
                { height:  0.5, color: new THREE.Color(0xd2b48c) }, // tan
                { height:  1.0, color: new THREE.Color(0xffffff) }  // pale white
                ]
            }
        });

        const uranus = new Planet({
            name: "Uranus",
            textureImg: document.getElementById("uranusProjection"),
            radius: 11,
            orbitRadius: 450,
            orbitSpeed: 0.002,
            orbitAngle: Math.PI / 5,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.5,
            colorConfig: {
                gradient: [
                    //{ height: 0.0, color: new THREE.Color('red') }, // teal
                    { height: -0.2, color: new THREE.Color(0x48d1cc) }, // teal
                    { height: 0.2, color: new THREE.Color(0x00ffff) }  // cyan
                ]
            }
        });

        const neptune = new Planet({
            name: "Neptune",
            textureImg: document.getElementById("neptuneProjection"),
            radius: 11,
            orbitRadius: 550,
            orbitSpeed: 0.0015,
            orbitAngle: Math.PI / 6,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.5,
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0x000080) }, // navy
                { height:  1.0, color: new THREE.Color(0x4169e1) }  // royal blue
                ]
            }
        });

        const pluto = new Planet({
            name: "Pluto",
            textureImg: document.getElementById("plutoProjection"),
            radius: 3,
            orbitRadius: 650,
            orbitSpeed: 0.001,
            orbitAngle: Math.PI / 7,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.2,
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0x8b7d7b) }, // grey-brown
                { height:  1.0, color: new THREE.Color(0xffffff) }  // icy patches
                ]
            }
        });

        // --- Mars Moons ---
        mars.addMoon({
            name: "Phobos",
            radius: 0.8,
            orbitRadius: 10,
            orbitSpeed: 0.08,
            orbitAngle: 0,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.2,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0x2f2f2f) },
                    { height:  1.0, color: new THREE.Color(0xaaaaaa) }
                ]
            }
        });

        mars.addMoon({
            name: "Deimos",
            radius: 0.5,
            orbitRadius: 16,
            orbitSpeed: 0.06,
            orbitAngle: Math.PI / 4,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.15,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0x2f2f2f) },
                    { height:  1.0, color: new THREE.Color(0xaaaaaa) }
                ]
            }
        });

        // --- Jupiter Moons ---
        jupiter.addMoon({
            name: "Io",
            radius: 2,
            orbitRadius: 20,
            orbitSpeed: 0.06,
            orbitAngle: 0,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.3,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0xffd700) }, // sulfur yellow
                    { height:  1.0, color: new THREE.Color(0xffa500) }  // orange highlights
                ]
            }
        });

        jupiter.addMoon({
            name: "Europa",
            radius: 1.8,
            orbitRadius: 25,
            orbitSpeed: 0.05,
            orbitAngle: Math.PI / 3,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.25,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0xddddff) }, // icy blue
                    { height:  1.0, color: new THREE.Color(0xffffff) }
                ]
            }
        });

        // --- Saturn Moons ---
        saturn.addMoon({
            name: "Titan",
            radius: 2.5,
            orbitRadius: 13 * 3.5 + 2, //28,
            orbitSpeed: 0.02,
            orbitAngle: 0,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.2,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0xffdab9) }, // light brown
                    { height:  1.0, color: new THREE.Color(0xffffe0) }  // pale
                ]
            }
        });


        // --- Add rings  ---
        saturn.addRings({
            innerRadius: 13 * 1.2,
            outerRadius: 13 * 3.5, // This will define the ring’s outer edge
            hexSize: 0.2,
            gap: 0.02,
            tilt: 26.7 * Math.PI / 180,
            thickness: 0.01,
            rotationSpeed: 0.0015,
            colorBands : [
                { name: 'inner', range: [1.0, 1.3], color: 0xffaa00, rotationSpeed: 0.002 },
                { name: 'middle', range: [1.3, 2.0], color: 0xffffff, rotationSpeed: 0.001 },
                { name: 'outer', range: [2.0, 3.5], color: 0xaaaaaa, rotationSpeed: 0.005 },
            ],
            gaps: [
                { range: [2.0, 2.2] },   // Cassini division
                { range: [2.25, 2.28] }, // Encke Gap
                { range: [2.48, 2.52] }  // Keeler Gap
            ]
        });


        // --- Uranus Moons ---
        uranus.addMoon({
            name: "Titania",
            radius: 1.5,
            orbitRadius: 22,
            orbitSpeed: 0.015,
            orbitAngle: 0,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.1,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0xa0c0ff) },
                    { height:  1.0, color: new THREE.Color(0xffffff) }
                ]
            }
        });

        // --- Neptune Moons ---
        neptune.addMoon({
            name: "Triton",
            radius: 2,
            orbitRadius: 25,
            orbitSpeed: 0.02,
            orbitAngle: 0,
            detail: { low: 5, mid: 25, high: 75 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.2,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0xaaaaaa) },
                    { height:  1.0, color: new THREE.Color(0xffffff) }
                ]
            }
        });


        this.planets.push(sun, mercury, venus, earth, mars, jupiter, saturn, uranus, neptune, pluto);     

    }


    /**
     * Starts the animation loop using requestAnimationFrame.
     */
    start() {
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    /**
     * Animation loop: update morphing if active, update controls, and render scene.
     * @param {number} time Timestamp from requestAnimationFrame
     */
    animate(time) {
        const dt = 0.016; // ~60fps
        this.time += dt;

        // Update planets + moons
        this.planets.forEach(p => {
            p.updateOrbit();
            p.updateLOD(this.camera);
            p.planetGroup.visible = true;
            p.moons.forEach(m => m.planetGroup.visible = true);
            p.rings.forEach(r => r.group.visible = true);
        });

        this.controls.update();

        let closestPlanet = null;
        let closestDepth = Infinity;

        // Cone tolerance
        const coneAngle = THREE.MathUtils.degToRad(45); // increase a bit if needed

        // Ensure cameraDir is normalized
        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir).normalize();

        this.planets.forEach(p => {
            const planetPos = p.planetGroup.getWorldPosition(new THREE.Vector3());
            const toPlanet = new THREE.Vector3().subVectors(planetPos, this.camera.position);

            const depth = toPlanet.dot(cameraDir);
            if (depth <= 0) return; // behind camera

            const angle = cameraDir.angleTo(toPlanet.clone().normalize());
            if (angle < coneAngle && depth < closestDepth) {
                closestDepth = depth;
                closestPlanet = p;
            }
        });

        // --- Focus ---
        if (closestPlanet) {

            const focusThreshold = closestPlanet.radius * 2; // tweak multiplier as needed
            const inFocusMode = closestDepth < focusThreshold;

            if (inFocusMode) {
                this.planets.forEach(p => {
                    if (p.name !== closestPlanet.name) {
                        p.planetGroup.visible = false;
                    }
                    p.moons.forEach(m => m.planetGroup.visible = false);
                    p.rings.forEach(r => r.group.visible = false);
                });
            }
        } 

        // Render
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.animate);
    }

    onResize() {
        const w = this.sceneWindow.clientWidth;
        const h = this.sceneWindow.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

}

// Bootstrap example
window.addEventListener('load', () => {
    // Make sure images are loaded
    const imgs = [document.getElementById('earthProjection'), document.getElementById('marsProjection')];
    
    const ready = imgs.every(img => img && img.complete && img.naturalWidth > 0);

    if (ready) new SolarSystemApp();
    else {
        let remaining = imgs.length;
        imgs.forEach(img => {
            if (!img) return;
            if (img.complete) remaining--; 
            else img.addEventListener('load', () => { remaining--; if (remaining <= 0) new SolarSystemApp(); });
        });
    }
});



