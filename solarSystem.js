import * as THREE from 'three';
import { CameraController } from './cameraController.js';
import { Planet } from './Planet_2.js';

class SolarSystemApp {

    planets = [];

    solarSystemData = {
    sun: { 
        name: "Sun", 
        radius: 696,    // 696,340 km
        order: 5 
    },
    mercury: { 
        name: "Mercury", 
        radius: 2.44,   // 2,440 km
        order: 3 
    },
    venus: { 
        name: "Venus", 
        radius: 6.05,   // 6,052 km
        order: 3 
    },
    earth: { 
        name: "Earth", 
        radius: 6.37,   // 6,371 km
        order: 4,
        moons: [
        { 
            name: "Moon", 
            radius: 1.74,  // 1,737 km
            order: 3 
        }
        ]
    },
    mars: { 
        name: "Mars", 
        radius: 3.39,   // 3,389 km
        order: 3,
        moons: [
        { name: "Phobos", radius: 0.011, order: 2 }, // 11 km
        { name: "Deimos", radius: 0.006, order: 2 }  // 6 km
        ]
    },
    jupiter: { 
        name: "Jupiter", 
        radius: 69.9,   // 69,911 km
        order: 5,
        moons: [
        { name: "Io", radius: 1.82, order: 3 },
        { name: "Europa", radius: 1.56, order: 3 },
        { name: "Ganymede", radius: 2.63, order: 3 },
        { name: "Callisto", radius: 2.41, order: 3 }
        ]
    },
    saturn: { 
        name: "Saturn", 
        radius: 58.2,   // 58,232 km
        order: 5,
        moons: [
        { name: "Titan", radius: 2.57, order: 3 },
        { name: "Enceladus", radius: 0.25, order: 2 }
        ]
    },
    uranus: { 
        name: "Uranus", 
        radius: 25.4,   // 25,362 km
        order: 4,
        moons: [
        { name: "Titania", radius: 0.79, order: 2 },
        { name: "Oberon", radius: 0.76, order: 2 }
        ]
    },
    neptune: { 
        name: "Neptune", 
        radius: 24.6,   // 24,622 km
        order: 4,
        moons: [
        { name: "Triton", radius: 1.35, order: 3 }
        ]
    }
    };

    constructor() {
        console.log('initialized');
      
        // DOM
        this.sceneWindow = document.getElementById('scene');

        // DOM elements for loading indicator, projection image, and container for the 3D scene
        this.loading = document.getElementById('loading');
        this.sceneWindow = document.getElementById('scene');

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
            p.moons.map(m => focusObjects.push(m.planetGroup));      
        });

        this.controls = new CameraController(this.camera, this.renderer.domElement, {
            scene: this.scene,
            enableOrbit: true,
            orbitTarget: new THREE.Vector3(0, 0, 0), //look at the solar system center
            //focusObjects: this.planets.map(p => p.group), // use the actual THREE.Group from each Planet you want to cycle through
            focusObjects,
            moveSpeed: 250, //0.2,
            lookSpeed: 250, //0.3,
            panSpeed: 250, //0.2,
            zoomSpeed: 250, //0.2,
            toggleKey: 'KeyC', // press 'C' to toggle between camera orbit modes
            minOrbitPitch: THREE.MathUtils.degToRad(-45),
            maxOrbitPitch: THREE.MathUtils.degToRad(45),
            maxOrbitDistance: 5000,
        });

        this.controls.update();
    }

    setUpPlanets() {
        // Build planets
        const sun = new Planet({
            name: "Sun",
            radius: 20,
            orbitRadius: 0, // fixed in center
            orbitSpeed: 0,
            orbitAngle: 0,
            parentPlanet: null,
            scene: this.scene,
            detail: { low: 30, mid: 40, high: 50 },
            lodDistances: { low: 500, mid: 300 },
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
            radius: 3,                 // very small
            orbitRadius: 40,           // closest orbit
            orbitSpeed: 0.015,         // fastest orbit
            orbitAngle: Math.PI / 8,   // just offset for variety
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 24, mid: 32, high: 40 },
            lodDistances: { low: 200, mid: 100 },
            heightScale: 0.4,          // crater-like bumps
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
            radius: 7.5,               // almost Earth-sized
            orbitRadius: 70,           // between Mercury (40) and Earth (100)
            orbitSpeed: 0.012,         // slower than Mercury, faster than Earth
            orbitAngle: Math.PI / 5,   // offset for visual spread
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 30, mid: 40, high: 50 },
            lodDistances: { low: 250, mid: 120 },
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
    
        const earth = new Planet({
            name: "Earth",
            textureImg: document.getElementById("earthProjection"),
            radius: 8,
            orbitRadius: 100,
            orbitSpeed: 0.01,
            orbitAngle: 0,       // start at +X
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 16, mid: 36, high: 76 },
            //lodDistances: { low: 300, mid: 150 },
            lodDistances: { low: 5, mid: 2 },
            heightScale: 0.1,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0x000033) }, // deep ocean
                    { height: -0.2, color: new THREE.Color(0x1e90ff) }, // shallow water
                    { height:  0.0, color: new THREE.Color(0x228b22) }, // lowland green
                    { height:  0.5, color: new THREE.Color(0x8b4513) }, // mountains brown
                    { height:  1.0, color: new THREE.Color(0xffffff) }, // snowcaps
                ]
            }
        });
        
        earth.addMoon({
            name: "Moon",
            radius: 0.8, 
            orbitRadius: 15,     
            orbitSpeed: 0.05,
            orbitAngle: 0,
            detail: { low: 20, mid: 30, high: 40 },
            lodDistances: { low: 150, mid: 80 },
            heightScale: 0.3,
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
            detail: { low: 30, mid: 40, high: 50 },
            lodDistances: { low: 350, mid: 200 },
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
            radius: 15,
            orbitRadius: 250,
            orbitSpeed: 0.004,
            orbitAngle: Math.PI / 3,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 40, mid: 50, high: 60 },
            lodDistances: { low: 500, mid: 300 },
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
            radius: 13,
            orbitRadius: 350,
            orbitSpeed: 0.003,
            orbitAngle: Math.PI / 4,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 40, mid: 50, high: 60 },
            lodDistances: { low: 600, mid: 400 },
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
            radius: 11,
            orbitRadius: 450,
            orbitSpeed: 0.002,
            orbitAngle: Math.PI / 5,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 35, mid: 45, high: 55 },
            lodDistances: { low: 700, mid: 500 },
            heightScale: 0.1,
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0x48d1cc) }, // teal
                { height:  1.0, color: new THREE.Color(0x00ffff) }  // cyan
                ]
            }
        });

        const neptune = new Planet({
            name: "Neptune",
            radius: 11,
            orbitRadius: 550,
            orbitSpeed: 0.0015,
            orbitAngle: Math.PI / 6,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 35, mid: 45, high: 55 },
            lodDistances: { low: 750, mid: 550 },
            heightScale: 0.1,
            colorConfig: {
                gradient: [
                { height: -1.0, color: new THREE.Color(0x000080) }, // navy
                { height:  1.0, color: new THREE.Color(0x4169e1) }  // royal blue
                ]
            }
        });

        const pluto = new Planet({
            name: "Pluto",
            radius: 3,
            orbitRadius: 650,
            orbitSpeed: 0.001,
            orbitAngle: Math.PI / 7,
            parentPlanet: sun,
            scene: this.scene,
            detail: { low: 20, mid: 30, high: 40 },
            lodDistances: { low: 900, mid: 650 },
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
            detail: { low: 16, mid: 24, high: 32 },
            lodDistances: { low: 100, mid: 60 },
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
            detail: { low: 12, mid: 20, high: 28 },
            lodDistances: { low: 80, mid: 50 },
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
            detail: { low: 20, mid: 30, high: 40 },
            lodDistances: { low: 150, mid: 100 },
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
            detail: { low: 18, mid: 28, high: 36 },
            lodDistances: { low: 140, mid: 90 },
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
            orbitRadius: 28,
            orbitSpeed: 0.02,
            orbitAngle: 0,
            detail: { low: 20, mid: 30, high: 40 },
            lodDistances: { low: 160, mid: 100 },
            heightScale: 0.2,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0xffdab9) }, // light brown
                    { height:  1.0, color: new THREE.Color(0xffffe0) }  // pale
                ]
            }
        });

        // --- Uranus Moons ---
        uranus.addMoon({
            name: "Titania",
            radius: 1.5,
            orbitRadius: 22,
            orbitSpeed: 0.015,
            orbitAngle: 0,
            detail: { low: 16, mid: 24, high: 32 },
            lodDistances: { low: 120, mid: 80 },
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
            detail: { low: 18, mid: 28, high: 36 },
            lodDistances: { low: 130, mid: 90 },
            heightScale: 0.2,
            colorConfig: {
                gradient: [
                    { height: -1.0, color: new THREE.Color(0xaaaaaa) },
                    { height:  1.0, color: new THREE.Color(0xffffff) }
                ]
            }
        });

        this.planets.push(sun, mercury, venus, earth, mars, jupiter, saturn, neptune, pluto, uranus);
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
        // simple circular orbits
        const dt = 0.016; // ~60fps
        this.time += dt;
        const ex = Math.cos(this.time * this.earthOmega) * this.earthOrbitRadius;
        const ez = Math.sin(this.time * this.earthOmega) * this.earthOrbitRadius;
        const mx = Math.cos(this.time * this.marsOmega) * this.marsOrbitRadius;
        const mz = Math.sin(this.time * this.marsOmega) * this.marsOrbitRadius;

        // update planet group positions and LOD (so LOD center stays correct)
        this.planets.forEach(p => {
            p.updateOrbit();   // move in orbit
            p.updateLOD(this.camera);
        });

        // Update camera controls
        this.controls.update();

        // Render the scene
        this.renderer.render(this.scene, this.camera);

        // Continue animation loop
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





