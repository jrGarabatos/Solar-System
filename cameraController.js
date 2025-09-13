import * as THREE from 'three';

/**
 * CameraController
 * ----------------
 * Combines Orbit + FPS camera modes with smooth transitions, pan/zoom, inertia, and touch support.
 * Supports two modes:
 *   - Orbit Mode: rotate around a target point
 *   - FPS Mode: free movement using WASD + mouse look
 * Features:
 * - Frame-rate independent movement (deltaTime based)
 * - Smoothed pan scaling (clamped by distance)
 * - Pitch stabilization with easing
 * - Optional Pointer Lock API for FPS mode
 * - Bound event handlers for safe disposal
 * - Smooth focus-on-object helper
 * - Smooth inertia/damping for rotation
 * - Orbit panning, zooming, and pitch clamping
 * - Proper event cleanup (dispose)
 * - Touch gesture support (rotate, pan, pinch zoom)
 * - Mode toggle (default = Tab key)
 */
export class CameraController {
    constructor(camera, domElement, options = {}) {
        this.camera = camera;
        this.domElement = domElement;
        this.scene = options.scene;

        console.log(this.scene);

        // ----------------------
        // Configurable options
        // ----------------------
        this.moveSpeed = options.moveSpeed  || 5;             // Units per second for FPS movement
        this.lookSpeed = options.lookSpeed  || 0.002;         // Sensitivity for mouse look
        this.panSpeed = options.panSpeed    || 0.002;           // Panning speed factor
        this.zoomSpeed = options.zoomSpeed  || 1;             // Scroll/pinch zoom speed
        this.enableOrbit = options.enableOrbit ?? true;      // Start in orbit mode (true) or FPS mode (false)
        this.toggleKey = options.toggleKey  || 'Tab';         // Key to toggle between modes

        // Orbit constraints
        this.minOrbitPitch = options.minOrbitPitch ?? -Math.PI / 2 + 0.01;  // Prevent flip
        this.maxOrbitPitch = options.maxOrbitPitch ?? Math.PI / 2 - 0.01;
        this.maxOrbitDistance = options.maxOrbitDistance ?? 200;            // Clamp zoom-out
        this.pitchCorrectionSpeed = options.pitchCorrectionSpeed ?? 0.05;   // Auto-leveling (not always used)

        // Inertia / damping
        this.inertiaEnabled = options.inertia ?? true;       // Keep spinning after drag
        this.dampingFactor = options.dampingFactor ?? 0.93;  // How quickly spin slows down

        // Customizable key map
        this.keyMap = options.keyMap || {
            forward:    ['KeyW', 'ArrowUp'],
            backward:   ['KeyS', 'ArrowDown'],
            left:       ['KeyA', 'ArrowLeft'],
            right:      ['KeyD', 'ArrowRight'],
            up:         ['KeyQ'],
            down:       ['KeyE'],
        };

        // Target point for orbit mode (center of rotation)
        this.orbitTarget = options.orbitTarget || new THREE.Vector3(0, 0, 0);

        // ----------------------
        // Camera orientation setup
        // ----------------------
        const offset = new THREE.Vector3().subVectors(this.camera.position, this.orbitTarget);
        this.distance = offset.length();                          // Orbit distance from target
        this.pitch = Math.asin(offset.y / this.distance);         // Vertical angle
        this.yaw = Math.atan2(offset.x, offset.z);                // Horizontal angle

        // ----------------------
        // State variables
        // ----------------------
        this.yawVelocity = 0;
        this.pitchVelocity = 0;
        this.isDragging = false;                                  // Mouse drag state
        this.dragMode = null;                                     // 'rotate' | 'pan'
        this.prevMouse = { x: 0, y: 0 };

        this.isTouching = false;                                  // Single-touch rotate
        this.prevTouchDist = 0;                                   // Pinch zoom distance
        this.prevTouchMid = new THREE.Vector2();                  // Midpoint for panning

        // Movement flags for FPS mode
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;
        this.moveDown = false;

        // Focus-on-object state
        this.focusLerp = 0;
        this.focusDuration = 1.0;
        this.focusStart = null;
        this.focusEnd = null;

        this.focusKey = options.focusKey || 'KeyF';                 // key to cycle focus
        this.focusObjects = options.focusObjects || [];             // array of THREE.Object3D
        this.focusIndex =  -1;                                        // current focused object index
        this.focusDistance = this.distance;                         // target distance when focusing    
        this.focusTarget = null;                                    // currently tracked object (if any)

        // Save starting camera + orbit state
        const { pitch, yaw, distance } = this.computePitchYawDistance(
            this.camera.position,
            this.orbitTarget
        );


        // Save starting camera state
        this.startState = {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone(),
            orbitTarget: this.orbitTarget.clone(),
            distance,
            pitch,
            yaw
        };

        // Cached vectors for reuse (avoid garbage collection)
        this._vForward = new THREE.Vector3();
        this._vRight = new THREE.Vector3();
        this._vUp = new THREE.Vector3();
        this._vPanOffset = new THREE.Vector3();

        this._listeners = [];
        this.bindHandlers(); // Bind all event handlers
        this.initListeners(); // Attach all input listeners
    }

    /**
     * Bind all event handlers to preserve references (important for disposal)
     */
    bindHandlers() {
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseWheel = this.onMouseWheel.bind(this);
        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);
    }

    /**
     * Attach event listeners
     */
    initListeners() {
        const add = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            this._listeners.push({ target, type, fn });
        };

        // Keyboard
        add(window, 'keydown', this.onKeyDown);
        add(window, 'keyup', this.onKeyUp);

        // Mouse
        add(this.domElement, 'mousedown', this.onMouseDown);
        add(window, 'mousemove', this.onMouseMove);
        add(window, 'mouseup', this.onMouseUp);
        add(this.domElement, 'contextmenu', (e) => e.preventDefault()); // Disable right-click menu

        // Touch
        add(this.domElement, 'touchstart', this.onTouchStart, { passive: false });
        add(this.domElement, 'touchmove', this.onTouchMove, { passive: false });
        add(this.domElement, 'touchend', this.onTouchEnd);

        // Wheel zoom
        add(this.domElement, 'wheel', this.onMouseWheel, { passive: false });
    }

    /**
     * Clean up listeners (call when destroying controller)
     */
    dispose() {
        for (const { target, type, fn } of this._listeners) {
            target.removeEventListener(type, fn);
        }
        this._listeners = [];
    }

    // --------------------------------------------------------
    // INPUT HANDLERS
    // --------------------------------------------------------

    /**
     * Handle key press
     */
    onKeyDown(e) {
        if (this.keyMap.forward.includes(e.code)) this.moveForward = true;
        if (this.keyMap.backward.includes(e.code)) this.moveBackward = true;
        if (this.keyMap.left.includes(e.code)) this.moveLeft = true;
        if (this.keyMap.right.includes(e.code)) this.moveRight = true;
        if (this.keyMap.up.includes(e.code)) this.moveUp = true;
        if (this.keyMap.down.includes(e.code)) this.moveDown = true;

        // Cycle focus between objects + res
        if (e.code === this.focusKey && this.focusObjects.length > 0) {
            e.preventDefault();

            this.focusIndex = (this.focusIndex + 1) % (this.focusObjects.length + 1);

            if (this.focusIndex < this.focusObjects.length) {
                // Focus on a specific moving object
                const obj = this.focusObjects[this.focusIndex];
                this.focusTarget = obj;   // track it
                this.focusOn(obj, 1.0, 1.2); // smooth transition to start tracking
            } else {
                // Return to starting view
                console.log("return to start view");
                this.focusTarget = null;  // stop tracking
                this.focusOn(this.startState.orbitTarget, 1.2, 1.0, true); // back to initial state
            }
        }

        // Toggle orbit / FPS mode
        if (e.code === this.toggleKey) {
            e.preventDefault();
            this.enableOrbit = !this.enableOrbit;

            if (!this.enableOrbit) {
                // Switching to FPS mode → extract orientation from camera quaternion
                const { pitch, yaw } = this.getPitchYawFromQuaternion(this.camera.quaternion);
                this.pitch = pitch;
                this.yaw = yaw;
            } else {
                // Switching to Orbit mode → recompute spherical coords
                const { pitch, yaw, distance } = this.computePitchYawDistance(
                    this.camera.position,
                    this.orbitTarget
                );
                this.pitch = pitch;
                this.yaw = yaw;
                this.distance = distance;
            }
        }
    }

        
    /**
     * Handle key release
     */
    onKeyUp(e) {
        if (this.keyMap.forward.includes(e.code)) this.moveForward = false;
        if (this.keyMap.backward.includes(e.code)) this.moveBackward = false;
        if (this.keyMap.left.includes(e.code)) this.moveLeft = false;
        if (this.keyMap.right.includes(e.code)) this.moveRight = false;
        if (this.keyMap.up.includes(e.code)) this.moveUp = false;
        if (this.keyMap.down.includes(e.code)) this.moveDown = false;
    }

    /**
     * Mouse down → start dragging (rotate or pan)
     */
    onMouseDown(e) {
        const isRightClick = e.button === 2;
        const isCtrlLeftClick = e.button === 0 && e.ctrlKey;
        const isMiddleClick = e.button === 1;

        if (isRightClick || isCtrlLeftClick) {
            this.isDragging = true;
            this.dragMode = 'rotate';
        }

        if (isMiddleClick) {
            this.isDragging = true;
            this.dragMode = 'pan';
        }

        this.prevMouse.x = e.clientX;
        this.prevMouse.y = e.clientY;
    }

    /**
     * Mouse move → update yaw/pitch or pan
     */
    onMouseMove(e) {
        if (!this.isDragging) return;

        const dx = e.clientX - this.prevMouse.x;
        const dy = e.clientY - this.prevMouse.y;
        this.prevMouse.x = e.clientX;
        this.prevMouse.y = e.clientY;

        if (this.dragMode === 'rotate') {
            this.yawVelocity = -dx * this.lookSpeed;
            this.pitchVelocity = -dy * this.lookSpeed;
        } else if (this.dragMode === 'pan' && this.enableOrbit) {
            this.applyPan(dx, dy);
        }
    }

    /**
     * Mouse up → stop dragging
     */
    onMouseUp() {
        this.isDragging = false;
        this.dragMode = null;

        if (!this.inertiaEnabled) {
            this.yawVelocity = 0;
            this.pitchVelocity = 0;
        }
    }

    /**
     * Mouse wheel → zoom
     */
    onMouseWheel(e) {
        e.preventDefault();
        const delta = e.deltaY;

        if (this.enableOrbit) {
            this.distance += delta * this.zoomSpeed * 0.01;
            this.distance = Math.min(Math.max(0.5, this.distance), this.maxOrbitDistance);
        } else {
            this.camera.getWorldDirection(this._vForward);
            this.camera.position.addScaledVector(this._vForward, delta * this.zoomSpeed * 0.01);
        }
    }

    /**
     * Touch start → distinguish between rotate (1 finger) or zoom/pan (2 fingers)
     */
    onTouchStart(e) {
        if (e.touches.length === 1) {
            this.isTouching = true;
            this.prevMouse.x = e.touches[0].clientX;
            this.prevMouse.y = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            this.isTouching = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this.prevTouchDist = Math.sqrt(dx * dx + dy * dy);
            this.prevTouchMid.set(
                (e.touches[0].clientX + e.touches[1].clientX) / 2,
                (e.touches[0].clientY + e.touches[1].clientY) / 2
            );
        }
    }

    /**
     * Touch move → rotate, pinch zoom, or pan
     */
    onTouchMove(e) {
        if (this.isTouching && e.touches.length === 1) {
            // Single finger drag = rotate
            e.preventDefault();
            const dx = e.touches[0].clientX - this.prevMouse.x;
            const dy = e.touches[0].clientY - this.prevMouse.y;
            this.prevMouse.x = e.touches[0].clientX;
            this.prevMouse.y = e.touches[0].clientY;

            this.yawVelocity = -dx * this.lookSpeed;
            this.pitchVelocity = -dy * this.lookSpeed;
        } else if (e.touches.length === 2) {
            // Pinch zoom + pan
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Zoom amount
            const zoomDelta = this.prevTouchDist - dist;
            this.prevTouchDist = dist;

            if (this.enableOrbit) {
                this.distance += zoomDelta * this.zoomSpeed * 0.01;
                this.distance = Math.min(Math.max(0.5, this.distance), this.maxOrbitDistance);
            } else {
                this.camera.translateZ(zoomDelta * this.zoomSpeed * 0.01);
            }

            // Pan amount (move target)
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const panDX = midX - this.prevTouchMid.x;
            const panDY = midY - this.prevTouchMid.y;
            this.prevTouchMid.set(midX, midY);

            if (this.enableOrbit) {
                this.applyPan(panDX, panDY);
            }
        }
    }

    /**
     * Touch end → stop rotation/zoom inertia
     */
    onTouchEnd() {
        this.isTouching = false;
        if (!this.inertiaEnabled) {
            this.yawVelocity = 0;
            this.pitchVelocity = 0;
        }
    }

    // --------------------------------------------------------
    // CORE UPDATE LOOP
    // --------------------------------------------------------

    /**
     * Update per frame
     */
    update(deltaTime = 1 / 60) {
        if (this.enableOrbit) {
            this.orbitUpdate(deltaTime);
        } else {
            this.fpsUpdate(deltaTime);
        }

        this.updateFocus(deltaTime);
    }

    // ----------------------
    // Focus-on-object logic
    // ----------------------
    
    
    /**
     * Smoothly move orbit target and distance to focus on an object or point.
     * Works with any Object3D (Group, Mesh, etc.) or Vector3.
     * @param {THREE.Object3D|THREE.Vector3} target - Object or position to focus on
     * @param {number} duration - Transition duration in seconds
     * @param {number} distanceFactor - Padding multiplier for object size
     * @param {boolean} returnToStart - If true, interpolate back to starting view
     */
 /**
     * Update per frame
     */
    update(deltaTime = 1 / 60) {
        if (this.enableOrbit) {
            this.orbitUpdate(deltaTime);
        } else {
            this.fpsUpdate(deltaTime);
        }

        this.updateFocus(deltaTime);
    }

    // ----------------------
    // Focus-on-object logic
    // ----------------------
    
    
    /**
     * Smoothly move orbit target and distance to focus on an object or point.
     * Works with any Object3D (Group, Mesh, etc.) or Vector3.
     * @param {THREE.Object3D|THREE.Vector3} target - Object or position to focus on
     * @param {number} duration - Transition duration in seconds
     * @param {number} distanceFactor - Padding multiplier for object size
     * @param {boolean} returnToStart - If true, interpolate back to starting view
     */
    focusOn_1(target, duration = 1.0, distanceFactor = 1.2, returnToStart = false) {        
        let targetPos, radius;

        if (target instanceof THREE.Object3D) {
            // Compute bounding sphere (center + radius) for the object/group
            const box = new THREE.Box3().setFromObject(target);
            const sphere = box.getBoundingSphere(new THREE.Sphere());

            // Store the sphere’s center relative to the object’s local space
            this.focusLocalCenter = target.worldToLocal(sphere.center.clone());

            // Store the object’s approximate radius once
            this.focusRadius = sphere.radius || 1;

            // Initial world position for interpolation
            targetPos = sphere.center.clone();
            
        } else if (target instanceof THREE.Vector3) {
            targetPos = target.clone();
            this.focusRadius = 1;
        } else {
            console.warn('focusOn: target must be Object3D or Vector3');
            return;
        }

        // Compute distance required to fit object in view
        const fov = THREE.MathUtils.degToRad(this.camera.fov);
        const aspect = this.camera.aspect;
        const halfFovV = Math.tan(fov / 2);
        const halfFovH = halfFovV * aspect;

        const distV = this.focusRadius / halfFovV;
        const distH = this.focusRadius / halfFovH;
        const newDistance = Math.max(distV, distH) * distanceFactor;

        // Save start & end states
        this.focusStart = {
            orbitTarget: this.orbitTarget.clone(),
            distance: this.distance,
            pitch: this.pitch,
            yaw: this.yaw,
        };

        if (returnToStart) {
            this.focusEnd = {
                orbitTarget: this.startState.orbitTarget.clone(),
                distance: this.startState.distance,
                pitch: this.startState.pitch,
                yaw: this.startState.yaw,
            };
            this._returningToStart = true;
        } else {
            this.focusEnd = {
                orbitTarget: targetPos,
                distance: newDistance,
                pitch: this.pitch, // keep current orientation
                yaw: this.yaw,
            };
            this._returningToStart = false;
            this.focusTarget = target; // keep tracking if it's an Object3D
        }

        this.focusDuration = duration;
        this.focusLerp = 0;
    }

    updateFocus_1(deltaTime) {
        // Transition interpolation
        if (this.focusEnd && this.focusLerp < 1) {
            this.focusLerp += deltaTime / this.focusDuration;
            const t = THREE.MathUtils.clamp(this.focusLerp, 0, 1);
            const k = t * t * (3 - 2 * t);

            this.orbitTarget.lerpVectors(this.focusStart.orbitTarget, this.focusEnd.orbitTarget, k);
            this.distance = THREE.MathUtils.lerp(this.focusStart.distance, this.focusEnd.distance, k);

            if (this._returningToStart) {
                this.pitch = THREE.MathUtils.lerp(this.focusStart.pitch, this.focusEnd.pitch, k);
                this.yaw = THREE.MathUtils.lerp(this.focusStart.yaw, this.focusEnd.yaw, k);
            }

            if (t >= 1) {
                this.focusStart = null;
                this.focusEnd = null;
                this._returningToStart = false;
            }
        }

        if (this.focusTarget && this.focusTarget instanceof THREE.Object3D && !this._returningToStart) {
            const worldCenter = new THREE.Vector3();
            this.focusTarget.getWorldPosition(worldCenter);

            // Sync orbit target
            this.orbitTarget.copy(worldCenter);

            // Camera offset relative to orbital center
            const offset = new THREE.Vector3(
                this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
                this.distance * Math.sin(this.pitch),
                this.distance * Math.cos(this.pitch) * Math.cos(this.yaw)
            );

            // Apply offset in planet-centered space
            this.camera.position.copy(worldCenter).add(offset);

            // Orient camera so forward vector exactly points to planet center
            this.camera.quaternion.setFromRotationMatrix(
                new THREE.Matrix4().lookAt(this.camera.position, worldCenter, this.camera.up)
            );
        }


    }

    // ====================================0

focusOn(target, duration = 1.0, distanceFactor = 1.2) {
    if (!(target instanceof THREE.Object3D)) return;

    this.focusTarget = target;

    // Compute stable center relative to the planet itself
    const box = new THREE.Box3().setFromObject(target);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.focusRadius = sphere.radius || 1;

    // Store offset from the planet's local center
    this.focusLocalOffset = sphere.center.clone().sub(target.position);

    // Compute camera distance
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = this.camera.aspect;
    const halfFovV = Math.tan(fov / 2);
    const halfFovH = halfFovV * aspect;
    const distV = this.focusRadius / halfFovV;
    const distH = this.focusRadius / halfFovH;
    this.focusDistance = Math.max(distV, distH) * distanceFactor;

    // Save start & end states for smooth transition
    this.focusStart = {
        orbitTarget: this.orbitTarget.clone(),
        distance: this.distance,
        pitch: this.pitch,
        yaw: this.yaw,
    };
    this.focusEnd = {
        orbitTarget: target.getWorldPosition(new THREE.Vector3()),
        distance: this.focusDistance,
        pitch: this.pitch,
        yaw: this.yaw,
    };
    this.focusDuration = Math.max(0.001, duration);
    this.focusLerp = 0;

    // Create a red sphere once (1 unit radius, small)
    if (!this.focusDebugPoint) {
        const geometry = new THREE.SphereGeometry(0.05, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.focusDebugPoint = new THREE.Mesh(geometry, material);
        this.scene.add(this.focusDebugPoint);
    }

}


updateFocus(deltaTime) {
    // Smooth transition
    if (this.focusEnd && this.focusLerp < 1) {
        this.focusLerp += deltaTime / this.focusDuration;
        const t = THREE.MathUtils.clamp(this.focusLerp, 0, 1);
        const k = t * t * (3 - 2 * t);

        this.orbitTarget.lerpVectors(this.focusStart.orbitTarget, this.focusEnd.orbitTarget, k);
        this.distance = THREE.MathUtils.lerp(this.focusStart.distance, this.focusEnd.distance, k);
        this.pitch = THREE.MathUtils.lerp(this.focusStart.pitch, this.focusEnd.pitch, k);
        this.yaw = THREE.MathUtils.lerp(this.focusStart.yaw, this.focusEnd.yaw, k);

        if (t >= 1) {
            this.focusStart = null;
            this.focusEnd = null;
        }
    }

    // Planet tracking
    if (this.focusTarget) {
        // Get current world position of the planet
        const planetWorldPos = this.focusTarget.getWorldPosition(new THREE.Vector3());

        // Add the stored offset from mesh local center
        const stableCenter = planetWorldPos.clone().add(this.focusLocalOffset);

        // Set orbit target
        this.orbitTarget.copy(stableCenter);

        // Compute camera offset from target
        const offset = new THREE.Vector3(
            this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
            this.distance * Math.sin(this.pitch),
            this.distance * Math.cos(this.pitch) * Math.cos(this.yaw)
        );

        this.camera.position.copy(this.orbitTarget).add(offset);

        // Look at planet center
        this.camera.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().lookAt(this.camera.position, this.orbitTarget, this.camera.up)
        );
    }

    if (this.focusDebugPoint) {
        this.focusDebugPoint.position.copy(this.orbitTarget);
    }

}

    // ======================================0

    /**
     * FPS mode update → WASD + free look
     */
    fpsUpdate(deltaTime) {
        // Apply yaw & pitch to camera quaternion
        const quat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')
        );
        this.camera.quaternion.copy(quat);

        // Forward/right movement vectors
        this.camera.getWorldDirection(this._vForward);
        this._vForward.y = 0;
        this._vForward.normalize();
        this._vRight.crossVectors(this._vForward, this.camera.up).normalize();

        // Step size based on frame time
        const moveStep = this.moveSpeed * deltaTime;

        if (this.moveForward) this.camera.position.addScaledVector(this._vForward, moveStep);
        if (this.moveBackward) this.camera.position.addScaledVector(this._vForward, -moveStep);
        if (this.moveLeft) this.camera.position.addScaledVector(this._vRight, -moveStep);
        if (this.moveRight) this.camera.position.addScaledVector(this._vRight, moveStep);
        if (this.moveUp) this.camera.position.y += moveStep;
        if (this.moveDown) this.camera.position.y -= moveStep;
    }

    /**
     * Orbit mode update → spherical coords around target
     */
    orbitUpdate(deltaTime) {
        // Apply rotation velocities
        this.yaw += this.yawVelocity;
        this.pitch += this.pitchVelocity;

        // Apply damping (inertia)
        this.yawVelocity *= this.dampingFactor;
        this.pitchVelocity *= this.dampingFactor;

        // Clamp vertical rotation
        this.pitch = THREE.MathUtils.clamp(this.pitch, this.minOrbitPitch, this.maxOrbitPitch);

        // Convert spherical coords to world position
        const x = this.orbitTarget.x + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw);
        const y = this.orbitTarget.y + this.distance * Math.sin(this.pitch);
        const z = this.orbitTarget.z + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw);

        // Apply camera position and orientation
        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.orbitTarget);
    }

    // --------------------------------------------------------
    // HELPERS
    // --------------------------------------------------------

    /**
     * Apply panning offset to orbit target
     */
    applyPan(dx, dy) {
        const panX = -dx * this.panSpeed * this.distance;
        const panY = dy * this.panSpeed * this.distance;

        this.camera.getWorldDirection(this._vForward);
        this._vRight.crossVectors(this.camera.up, this._vForward).normalize();
        this._vUp.copy(this.camera.up).normalize();

        this._vPanOffset.set(0, 0, 0)
            .addScaledVector(this._vRight, panX)
            .addScaledVector(this._vUp, panY);

        this.orbitTarget.add(this._vPanOffset);
    }

    /**
     * Compute pitch/yaw from camera forward vector
     */
    computePitchYaw(camera) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.normalize();
        const pitch = Math.asin(dir.y);
        const yaw = Math.atan2(dir.x, dir.z);
        return { pitch, yaw };
    }

    /**
     * Compute pitch/yaw/distance from position & target
     */
    computePitchYawDistance(cameraPos, targetPos) {
        const offset = new THREE.Vector3().subVectors(cameraPos, targetPos);
        const distance = offset.length();
        const dir = offset.clone().normalize();
        const pitch = Math.asin(dir.y);
        const yaw = Math.atan2(dir.x, dir.z);
        return { pitch, yaw, distance };
    }

    /**
     * Extract pitch/yaw from quaternion
     */
    getPitchYawFromQuaternion(quaternion) {
        const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
        return { pitch: euler.x, yaw: euler.y };
    }
}
