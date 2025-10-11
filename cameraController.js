import * as THREE from 'three';

export class CameraController {
    constructor(camera, domElement, options = {}) {
        this.camera = camera;
        this.domElement = domElement;

        // ----------------------
        // Modes
        // ----------------------
        this.mode = options.mode || 'ORBIT'; // ORBIT | FPS | FLIGHT

        // Speeds & constraints
        this.moveSpeed = options.moveSpeed || 5;
        this.lookSpeed = options.lookSpeed || 0.002;
        this.panSpeed = options.panSpeed || 0.002;
        this.keyPanSpeed = options.keyPanSpeed || 0.002;
        this.zoomSpeed = options.zoomSpeed || 1;
        this.enableOrbit = options.enableOrbit ?? true;
        this.enableFlight = options.enableFlight ?? true;
        this.toggleKey = options.toggleKey || 'Tab';
        this.focusKey = options.focusKey || 'KeyF';
        this.minOrbitPitch = options.minOrbitPitch ?? -Math.PI / 2 + 0.01;
        this.maxOrbitPitch = options.maxOrbitPitch ?? Math.PI / 2 - 0.01;
        this.maxOrbitDistance = options.maxOrbitDistance ?? 200;
        this.dampingFactor = options.dampingFactor ?? 0.93;
        this.inertiaEnabled = options.inertia ?? true;

        // Key map
        this.keyMap = options.keyMap || {
            forward: ['KeyW', 'ArrowUp'],
            backward: ['KeyS', 'ArrowDown'],
            left: ['KeyA', 'ArrowLeft'],
            right: ['KeyD', 'ArrowRight'],
            up: ['KeyQ'],
            down: ['KeyE'],
            panLeft: ['KeyJ'],
            panRight: ['KeyL'],
            panUp: ['KeyI'],
            panDown: ['KeyK'],
        };

        // Targets
        this.orbitTarget = options.orbitTarget || new THREE.Vector3(0, 0, 0);
        this.focusObjects = options.focusObjects || [];
        this.focusIndex = -1;
        this.focusTarget = null;

        // Object info for flight
        this.objectCenter = new THREE.Vector3(0, 0, 0);
        this.objectRadius = 1;
        this.flightHeight = options.flightHeight || 10;

        // Camera spherical coords
        const offset = new THREE.Vector3().subVectors(camera.position, this.orbitTarget);
        this.distance = offset.length();
        this.pitch = Math.asin(offset.y / this.distance);
        this.yaw = Math.atan2(offset.x, offset.z);

        // Save start state for return-to-start focus
        this.startState = {
            position: camera.position.clone(),
            orbitTarget: this.orbitTarget.clone(),
            distance: this.distance,
            pitch: this.pitch,
            yaw: this.yaw,
        };

        // State
        this.yawVelocity = 0;
        this.pitchVelocity = 0;
        this.isDragging = false;
        this.dragMode = null;
        this.prevMouse = { x: 0, y: 0 };
        this.isTouching = false;
        this.prevTouchDist = 0;
        this.prevTouchMid = new THREE.Vector2();

        // Movement flags
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;
        this.moveDown = false;

        this.panLeft = false;
        this.panRight = false;
        this.panUp = false;
        this.panDown = false;

        this.orbitLeft = false;
        this.orbitRight = false;
        this.orbitUp = false;
        this.orbitDown = false;

        // Transition system
        this.transition = null;
        this._returningToStart = false;

        // Cached vectors
        this._vForward = new THREE.Vector3();
        this._vRight = new THREE.Vector3();
        this._vUp = new THREE.Vector3();
        this._vPanOffset = new THREE.Vector3();
        this._focusPanOffset = new THREE.Vector3();

        // Event listeners
        this._listeners = [];
        this.bindHandlers();
        this.initListeners();
        this.returnToStart();
    }

    // ----------------------
    // Event binding
    // ----------------------
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

    dispose() {
        for (const { target, type, fn } of this._listeners) target.removeEventListener(type, fn);
        this._listeners = [];
    }

    // ----------------------
    // Key handling
    // ----------------------
    onKeyDown(e) {
        // --- FPS controls (move freely in space) ---
        if (this.keyMap.forward.includes(e.code)) this.moveForward = true;
        if (this.keyMap.backward.includes(e.code)) this.moveBackward = true;
        if (this.keyMap.left.includes(e.code)) this.moveLeft = true;
        if (this.keyMap.right.includes(e.code)) this.moveRight = true;
        if (this.keyMap.up.includes(e.code)) this.moveUp = true;
        if (this.keyMap.down.includes(e.code)) this.moveDown = true;

        // --- Orbit controls (pan and orbit) ---
        if (this.keyMap.panLeft.includes(e.code) && (this.mode === 'ORBIT')) this.panLeft = true;
        if (this.keyMap.panRight.includes(e.code) && (this.mode === 'ORBIT')) this.panRight = true;
        if (this.keyMap.panUp.includes(e.code) && (this.mode === 'ORBIT')) this.panUp = true;
        if (this.keyMap.panDown.includes(e.code) && (this.mode === 'ORBIT')) this.panDown = true;

        if (this.keyMap.forward.includes(e.code) && (this.mode === 'ORBIT')) this.orbitUp = true;
        if (this.keyMap.backward.includes(e.code) && (this.mode === 'ORBIT')) this.orbitDown = true;
        if (this.keyMap.left.includes(e.code) && (this.mode === 'ORBIT')) this.orbitLeft = true;
        if (this.keyMap.right.includes(e.code) && (this.mode === 'ORBIT')) this.orbitRight = true;

        // --- Flight controls (locked on north pole) ---
        if (this.keyMap.forward.includes(e.code) && (this.mode === 'FLIGHT')) this.flightForward = true;
        if (this.keyMap.backward.includes(e.code) && (this.mode === 'FLIGHT')) this.flightBackward = true;
        if (this.keyMap.left.includes(e.code) && (this.mode === 'FLIGHT')) this.flightLeft = true;
        if (this.keyMap.right.includes(e.code) && (this.mode === 'FLIGHT')) this.flightRight = true;
        if (this.keyMap.up.includes(e.code) && (this.mode === 'FLIGHT')) this.flightUp = true;
        if (this.keyMap.down.includes(e.code) && (this.mode === 'FLIGHT')) this.flightDown = true;

        // --- Focus cycling ---
        if (e.code === this.focusKey && this.focusObjects.length > 0) {
            e.preventDefault();

            this.focusIndex = (this.focusIndex + 1) % (this.focusObjects.length + 1);

            if (this.focusIndex < this.focusObjects.length) {
                this.focusOn(this.focusObjects[this.focusIndex]);
            } else {
                // Return to start view at the end of focus cycle
                this._returningToStart = true;
                this.returnToStart();
            }
        }

        // --- Strict mode toggle rules ---
        if (e.code === this.toggleKey) {
            e.preventDefault();
            this.handleModeToggle();
        }
    }

    onKeyUp(e) {
        if (this.keyMap.forward.includes(e.code)) this.moveForward = this.orbitUp = this.flightForward = false;
        if (this.keyMap.backward.includes(e.code)) this.moveBackward = this.orbitDown = this.flightBackward = false;
        if (this.keyMap.left.includes(e.code)) this.moveLeft = this.orbitLeft = this.flightLeft = false;
        if (this.keyMap.right.includes(e.code)) this.moveRight = this.orbitRight = this.flightRight = false;
        if (this.keyMap.up.includes(e.code)) this.moveUp = this.flightUp = false;
        if (this.keyMap.down.includes(e.code)) this.moveDown = this.flightDown =  false;
        if (this.keyMap.panLeft.includes(e.code)) this.panLeft = false;
        if (this.keyMap.panRight.includes(e.code)) this.panRight = false;
        if (this.keyMap.panUp.includes(e.code)) this.panUp = false;
        if (this.keyMap.panDown.includes(e.code)) this.panDown = false;
    }

    // ----------------------
    // Strict toggleMode logic
    // ----------------------
    handleModeToggle() {
        if (this.mode === 'ORBIT') {
            if (this.focusTarget) this.flightOn(this.focusTarget);
            else this.mode = 'FPS';
        } else if (this.mode === 'FLIGHT') {
            this.mode = 'ORBIT';
            if (this.focusTarget) this.focusOn(this.focusTarget);
        } else if (this.mode === 'FPS') {
            this.mode = 'ORBIT';
            this.returnToStart();
        }

        console.log(`Switched to ${this.mode} mode`);
    }

    // ----------------------
    // Unified transition (robust: shortest-angle + pitch safety)
    // ----------------------

    // ----------------------
    // Update Transition (Quaternion-based)
    // ----------------------
    updateTransition(deltaTime) {
        if (!this.transition) return;

        const tObj = this.transition;
        tObj.elapsed += deltaTime;
        const t = THREE.MathUtils.clamp(tObj.elapsed / tObj.duration, 0, 1);
        const k = t * t * (3 - 2 * t); // smoothstep

        // --- Live target position ---
        const liveTarget = new THREE.Vector3();
        if (this.focusTarget instanceof THREE.Object3D) {
            this.focusTarget.getWorldPosition(liveTarget);
        } else {
            liveTarget.copy(tObj.target);
        }

        // --- Interpolate yaw, pitch, distance, lookAhead ---
        const yaw = this.lerpAngle(tObj.startYaw, tObj.endYaw, k);
        const pitch = this.lerpAngle(tObj.startPitch, tObj.endPitch, k);
        const clampedPitch = THREE.MathUtils.clamp(pitch, this.minOrbitPitch, this.maxOrbitPitch);
        const distance = THREE.MathUtils.lerp(tObj.startDistance, tObj.endDistance, k);
        const lookAheadDistance = THREE.MathUtils.lerp(tObj.startLead, tObj.endLead, k);
        const lookAheadTilt = this.lerpAngle(tObj.startLookTilt, tObj.endLookTilt, k);

        this.yaw = yaw;
        this.pitch = clampedPitch;
        this.distance = distance;
        this.lookAheadDistance = lookAheadDistance;
        this.lookAheadTilt = lookAheadTilt;

        // --- Camera position (spherical coordinates) ---
        const offset = new THREE.Vector3(
            distance * Math.cos(clampedPitch) * Math.sin(yaw),
            distance * Math.sin(clampedPitch),
            distance * Math.cos(clampedPitch) * Math.cos(yaw)
        );
        this.camera.position.copy(liveTarget.clone().add(offset));

        // --- Look-ahead point ---
        const lookOffset = new THREE.Vector3(
            lookAheadDistance * Math.cos(clampedPitch + lookAheadTilt) * Math.sin(yaw),
            lookAheadDistance * Math.sin(clampedPitch + lookAheadTilt),
            lookAheadDistance * Math.cos(clampedPitch + lookAheadTilt) * Math.cos(yaw)
        );
        const lookTarget = liveTarget.clone().add(lookOffset);

        // --- Robust up vector to avoid flipping at poles ---
        const forward = new THREE.Vector3().subVectors(lookTarget, this.camera.position).normalize();

        // Use previous up vector as reference if near poles
        let referenceUp = this.camera.up.clone();
        if (Math.abs(forward.dot(referenceUp)) > 0.99) {
            referenceUp.set(1, 0, 0); // fallback if forward is almost parallel to up
        }

        const right = new THREE.Vector3().crossVectors(forward, referenceUp).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();

        this.camera.up.copy(up);
        this.camera.lookAt(lookTarget);

        // --- End of transition ---
        if (t >= 1) {
            this.transition = null;
            this.yaw = tObj.endYaw;
            this.pitch = THREE.MathUtils.clamp(tObj.endPitch, this.minOrbitPitch, this.maxOrbitPitch);
            this.distance = tObj.endDistance;
            this.lookAheadDistance = tObj.endLead;
            this.lookAheadTilt = tObj.endLookTilt;
        }
    }


    // ----------------------
    // Unified Focus/Flight on object
    // ----------------------    
    focusOrFlightOn(
        target,
        {
            mode = 'ORBIT',
            duration = 1.0,
            distanceFactor = 1.0,
            leadDistance = 0,
            tilt = 0,
            cameraTilt = 0,
            returnToStart = false
        } = {}
    ) {
        if (!(target instanceof THREE.Object3D || target instanceof THREE.Vector3)) return;

        // --- Set mode & focus target ---
        this.mode = mode;
        this.focusTarget = target;
        this._returningToStart = returnToStart;

        // --- Get world position of target ---
        const targetPos = new THREE.Vector3();
        if (target instanceof THREE.Object3D) target.getWorldPosition(targetPos);
        else targetPos.copy(target);
        this.orbitTarget.copy(targetPos);

        // --- Initialize lastCameraUp to current camera up ---
        this.lastCameraUp = this.camera.up.clone();

        // --- Compute approximate radius (for distance fitting) ---
        let radius = 1;
        if (target instanceof THREE.Object3D) {
            const box = new THREE.Box3().setFromObject(target);
            const sphere = box.getBoundingSphere(new THREE.Sphere());
            radius = sphere.radius || 1;
        }

        // --- Compute camera distance to fit the target ---
        const fov = THREE.MathUtils.degToRad(this.camera.fov);
        const aspect = this.camera.aspect;
        const distV = radius / Math.tan(fov / 2);
        const distH = radius / (Math.tan(fov / 2) * aspect);
        const newDistance = Math.max(distV, distH) * distanceFactor;

        // --- Compute current spherical coordinates (relative to target) ---
        const offset = new THREE.Vector3().subVectors(this.camera.position, targetPos);
        const startDistance = offset.length();
        const startYaw = Math.atan2(offset.x, offset.z);
        const startPitch = this._getPitchFromOffset(offset);

        // --- Define end spherical coordinates ---
        let endYaw = startYaw;
        let endPitch = startPitch;
        let endDistance = newDistance;
        let endLead = 0;
        let endLookTilt = 0;

        if (mode === 'FLIGHT') {
            endPitch = startPitch + THREE.MathUtils.degToRad(cameraTilt);

            const logR = Math.log10(radius + 10);
            const radiusFactor = Math.pow(10, (logR - 2.0) * 1.8);

            endLead = radiusFactor * leadDistance;
            endLookTilt = THREE.MathUtils.degToRad(tilt);
        } else if (mode === 'ORBIT' && returnToStart) {
            endDistance = this.startState?.distance ?? newDistance;
        }

        // --- Capture look-ahead start values ---
        const startLead = this.lookAheadDistance ?? 0;
        const startLookTilt = this.lookAheadTilt ?? 0;

        // --- Prepare transition object ---
        this.transition = {
            type: mode === 'FLIGHT' ? 'flight' : 'focus',
            target: targetPos.clone(),
            startYaw, startPitch, startDistance,
            endYaw, endPitch, endDistance,
            startLead, endLead,
            startLookTilt, endLookTilt,
            duration, elapsed: 0
        };
    }

    // ----------------------
    // Focus on object (start a transition into ORBIT/focus)
    // ----------------------
    focusOn(target, returnToStart) {
        // Focus on a planet (orbit mode)
        this.focusOrFlightOn(target, {
            mode: 'ORBIT',
            duration: 1.2,
            distanceFactor: 1.2,
            returnToStart: returnToStart
        });
    }

    // ----------------------
    // Flight over object (start a transition into FLIGHT)
    // ----------------------
    flightOn(target) {
        // Switch to flight mode around a planet
        this.focusOrFlightOn(target, {
            mode: 'FLIGHT',
            duration: 1.0,
            distanceFactor: 0.5,
            leadDistance: 75.0,
            tilt: 45,
            cameraTilt: 0
        });
    }

    /**
     * Returns the camera to the starting position using same logic as focusOn.
     */
    returnToStart() {
        this.focusOn(this.startState.orbitTarget, true);
    }

    // ----------------------
    // Update per frame
    // ----------------------
    update(deltaTime = 1 / 60) {
        if (this.transition) {
            this.updateTransition(deltaTime);
            if (this.transition) return;
        }

        switch (this.mode) {
            case 'ORBIT': this.updateOrbit(deltaTime); break;
            case 'FPS': this.updateFPS(deltaTime); break;
            case 'FLIGHT': this.updateFlight(deltaTime); break;
        }
    }

    // ----------------------
    // Orbit, FPS, Flight updates
    // ----------------------

    // ----------------------
    // Update Orbit (Quaternion-based)
    // ----------------------
    updateOrbit(deltaTime) {
        const keyOrbitSpeed = 1.0 * this.lookSpeed;

        // --- Update yaw/pitch velocities from key input ---
        if (this.orbitLeft) this.yawVelocity -= keyOrbitSpeed * deltaTime;
        if (this.orbitRight) this.yawVelocity += keyOrbitSpeed * deltaTime;
        if (this.orbitUp) this.pitchVelocity -= keyOrbitSpeed * deltaTime;
        if (this.orbitDown) this.pitchVelocity += keyOrbitSpeed * deltaTime;

        this.yaw += this.yawVelocity;
        this.pitch += this.pitchVelocity;

        // Clamp pitch to avoid flipping
        this.pitch = THREE.MathUtils.clamp(this.pitch, this.minOrbitPitch, this.maxOrbitPitch);

        // Apply damping
        this.yawVelocity *= this.dampingFactor;
        this.pitchVelocity *= this.dampingFactor;

        // --- Dynamic target position ---
        const center = new THREE.Vector3();
        if (this.focusTarget instanceof THREE.Object3D) {
            this.focusTarget.getWorldPosition(center);
        } else {
            center.copy(this.orbitTarget);
        }
        center.add(this._focusPanOffset);

        // --- Camera position in spherical coordinates ---
        const offset = new THREE.Vector3(
            this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
            this.distance * Math.sin(this.pitch),
            this.distance * Math.cos(this.pitch) * Math.cos(this.yaw)
        );
        this.camera.position.copy(center.clone().add(offset));

        // --- Look-ahead point ---
        const lookOffset = new THREE.Vector3(
            this.lookAheadDistance * Math.cos(this.pitch + this.lookAheadTilt) * Math.sin(this.yaw),
            this.lookAheadDistance * Math.sin(this.pitch + this.lookAheadTilt),
            this.lookAheadDistance * Math.cos(this.pitch + this.lookAheadTilt) * Math.cos(this.yaw)
        );
        const lookTarget = center.clone().add(lookOffset);

        // --- Dynamic up vector (same as flight) ---
        const forward = new THREE.Vector3().subVectors(lookTarget, this.camera.position).normalize();
        let right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();

        this.camera.up.copy(up);
        this.camera.lookAt(lookTarget);
    }

    updateFPS(deltaTime) {        
        // Forward/right movement vectors
        this.camera.getWorldDirection(this._vForward);
        this._vForward.y = 0;
        this._vForward.normalize();
        
        this._vRight.crossVectors(this._vForward, this.camera.up).normalize();

        const move = new THREE.Vector3();
        if (this.moveForward) move.add(this._vForward);
        if (this.moveBackward) move.sub(this._vForward);
        if (this.moveLeft) move.sub(this._vRight);
        if (this.moveRight) move.add(this._vRight);
        if (this.moveUp) move.y += 1;
        if (this.moveDown) move.y -= 1;

        // Step size based on frame time
        move.multiplyScalar(this.moveSpeed * deltaTime);
        this.camera.position.add(move);
    }

    // add zoom
    updateFlight(deltaTime) {
        const keyOrbitSpeed = 1.0 * this.lookSpeed;
        const keyZoomSpeed  = 0.01 * this.zoomSpeed; 
        
        // --- Update angular velocities from key input ---
        if (this.flightLeft)  this.yawVelocity  -= keyOrbitSpeed * deltaTime;
        if (this.flightRight) this.yawVelocity  += keyOrbitSpeed * deltaTime;
        if (this.flightForward)  this.pitchVelocity -= keyOrbitSpeed * deltaTime;
        if (this.flightBackward) this.pitchVelocity += keyOrbitSpeed * deltaTime;

        // --- Integrate angles ---
        this.yaw += this.yawVelocity;
        this.pitch += this.pitchVelocity;

        // --- Damping ---
        this.yawVelocity   *= this.dampingFactor;
        this.pitchVelocity *= this.dampingFactor;

        // --- Zoom control (e.g. Q = zoom in, E = zoom out) ---
        if (this.flightUp)  this.distance -= keyZoomSpeed * deltaTime * this.distance;
        if (this.flightDown) this.distance += keyZoomSpeed * deltaTime * this.distance;

        // --- Compute center (planet or focus target) ---
        const center = new THREE.Vector3();
        if (this.focusTarget instanceof THREE.Object3D) {
            this.focusTarget.getWorldPosition(center);
        } else {
            center.copy(this.orbitTarget);
        }
        center.add(this._focusPanOffset);

        // --- Camera position (spherical coordinates, same as Option 2) ---
        const offset = new THREE.Vector3(
            this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
            this.distance * Math.sin(this.pitch),
            this.distance * Math.cos(this.pitch) * Math.cos(this.yaw)
        );
        const camPos = center.clone().add(offset);
        this.camera.position.copy(camPos);

        // --- Planet-based up vector ---
        const up = camPos.clone().sub(center).normalize();
        this.camera.up.copy(up);

        // --- Look-ahead target (same as Option 2) ---
        const lookOffset = new THREE.Vector3(
            this.lookAheadDistance * Math.cos(this.pitch + this.lookAheadTilt) * Math.sin(this.yaw),
            this.lookAheadDistance * Math.sin(this.pitch + this.lookAheadTilt),
            this.lookAheadDistance * Math.cos(this.pitch + this.lookAheadTilt) * Math.cos(this.yaw)
        );
        const lookTarget = center.clone().add(lookOffset);

        // --- Orient camera ---
        this.camera.lookAt(lookTarget);
    }

    // ----------------------
    // Mouse events
    // ----------------------
    /**
     * Mouse down → start dragging (rotate or pan)
     */
    onMouseDown(e) {
        console.log('mouse');
        const isRightClick = e.button === 2;
        const isLeftClick = e.button === 0 && !e.ctrlKey;
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
        } else if (this.dragMode === 'pan' && (this.mode === 'ORBIT')) {
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
     * two finger in trackpad equivalent to mouse wheel
     */
    onMouseWheel(e) {
        e.preventDefault();
        const delta = e.deltaY;
    
        if (this.mode === 'ORBIT') {
            this.distance += delta * this.zoomSpeed * 0.01;
            this.distance = Math.min(Math.max(0.5, this.distance), this.maxOrbitDistance);
        } else if (this.mode === 'FLIGHT') {
            console.log('zoom');
            this.distance += delta * this.zoomSpeed * 0.01;
            this.distance = Math.max(0.5, this.distance);
        }
        else {
            this.camera.getWorldDirection(this._vForward);
            this.camera.position.addScaledVector(this._vForward, delta * this.zoomSpeed * 0.01);
        }
    }

    // ----------------------
    // Touch events placeholders
    // ----------------------
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

            if (this.mode === 'ORBIT' || this.mode === 'FLIGHT') {
                this.distance += zoomDelta * this.zoomSpeed * 0.01;
                this.distance = Math.min(Math.max(0.5, this.distance), this.maxOrbitDistance);
            } else {
                console.log('zoom');
                this.camera.translateZ(zoomDelta * this.zoomSpeed * 0.01);
            }

            // Pan amount (move target)
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const panDX = midX - this.prevTouchMid.x;
            const panDY = midY - this.prevTouchMid.y;
            this.prevTouchMid.set(midX, midY);

            if (this.mode === 'ORBIT') {
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


    // ----------------------
    // Helper Functions
    // ----------------------
    
    // Helper: pan offset
    applyPan(dx = 1, dy = 1, speed = this.panSpeed) {
        const panX = -dx * speed * this.distance;
        const panY = dy * speed * this.distance;

        this.camera.getWorldDirection(this._vForward);
        this._vRight.crossVectors(this.camera.up, this._vForward).normalize();
        this._vUp.copy(this.camera.up).normalize();

        this._vPanOffset.set(0, 0, 0)
            .addScaledVector(this._vRight, panX)
            .addScaledVector(this._vUp, panY);

        if (this.focusTarget) this._focusPanOffset.add(this._vPanOffset);
        else this.orbitTarget.add(this._vPanOffset);
    }

    // Helper: shortest-path angle interpolation
    lerpAngle(a, b, t) {
        let diff = b - a;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return a + diff * t;
    }

    // Helper: stable pitch from offset (avoid asin pitfalls)
    _getPitchFromOffset(offset) {
        // pitch = atan2(y, horizontalRadius)
        const horiz = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
        return Math.atan2(offset.y, horiz); // range (-PI/2, PI/2)
    }

}







