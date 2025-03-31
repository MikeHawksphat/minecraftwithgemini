// js/Player.js
import * as THREE from 'three';
import { Inventory } from './Inventory.js';
import { BLOCK } from './world/ChunkManager.js';

export class Player {
    constructor(camera, world) {
        this.camera = camera;
        this.world = world;

        this.position = new THREE.Vector3(8, 100, 8); // Start position (adjust Y in main.js based on terrain)
        this.velocity = new THREE.Vector3();

        // Player dimensions
        this.height = 1.8;
        this.width = 0.6;
        this.eyeLevel = 1.6; // Camera height offset from player base

        // --- Tuned Physics Constants (Minecraft-like feel) ---
        this.gravity = 32.0;
        this.maxSpeed = 5.5; // Reference speed, but not strictly enforced
        this.jumpVelocity = 9;
        this.groundAccel = 120.0;
        this.airAccel = 35.0;
        this.groundFriction = 12.0;
        this.airFriction = 2; // Keep air momentum
        // --- End Tuned Constants ---

        // State variables
        this.onGround = false;
        this.input = {
            forward: false, backward: false, left: false, right: false, jump: false
        };

        this.inventory = new Inventory(world);

        // Reusable vectors for calculations
        this._worldDirection = new THREE.Vector3();
        this._rightDirection = new THREE.Vector3(); // Stores the calculated LEFT vector
        this._wishDir = new THREE.Vector3();
        this._horizontalVelocity = new THREE.Vector3();
    }

    getBoundingBox() {
        const halfWidth = this.width / 2;
        return new THREE.Box3(
            new THREE.Vector3(this.position.x - halfWidth, this.position.y, this.position.z - halfWidth),
            new THREE.Vector3(this.position.x + halfWidth, this.position.y + this.height, this.position.z + halfWidth)
        );
    }

    isSolidBlock(x, y, z) {
        const blockType = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        return blockType !== BLOCK.AIR && blockType !== BLOCK.LEAVES;
    }

    update(deltaTime) {
        this.velocity.y -= this.gravity * deltaTime;
        if (this.input.jump && this.onGround) {
            this.velocity.y = this.jumpVelocity;
            this.onGround = false;
        }
        this.calculateWishDirection();
        this.applyHorizontalMovement(deltaTime);
        this.applyVelocityAndCollide(deltaTime);
        this.updateCameraPosition();
    }

    calculateWishDirection() {
        this.camera.getWorldDirection(this._worldDirection);
        this._worldDirection.y = 0;
        this._worldDirection.normalize();

        // Calculate camera's LEFT direction
        this._rightDirection.crossVectors(this.camera.up, this._worldDirection).normalize();

        this._wishDir.set(0, 0, 0);
        if (this.input.forward) this._wishDir.add(this._worldDirection);
        if (this.input.backward) this._wishDir.sub(this._worldDirection);

        // Apply the calculated LEFT vector correctly
        if (this.input.right) this._wishDir.sub(this._rightDirection);
        if (this.input.left) this._wishDir.add(this._rightDirection);

        if (this.input.forward || this.input.backward || this.input.left || this.input.right) {
            if (this._wishDir.lengthSq() > 1e-6) {
                 this._wishDir.normalize();
            }
        }
    }

    applyHorizontalMovement(deltaTime) {
        this._horizontalVelocity.set(this.velocity.x, 0, this.velocity.z);
        const currentSpeed = this._horizontalVelocity.length();
        const friction = this.onGround ? this.groundFriction : this.airFriction;

        // --- Apply Friction (Using original logic's style for consistency) ---
        let control = Math.max(0, currentSpeed * friction * deltaTime);
        let drop = currentSpeed < control ? currentSpeed : control;
        if (currentSpeed > 1e-6) { // Avoid division by zero
             this._horizontalVelocity.multiplyScalar(Math.max(0, currentSpeed - drop) / currentSpeed);
        } else {
             this._horizontalVelocity.set(0,0,0); // Ensure it stops if very slow
        }
        // ---

        const accel = this.onGround ? this.groundAccel : this.airAccel;
        // Check if there is input direction
        if (this._wishDir.lengthSq() > 1e-6) {
             const currentSpeedInWishDir = this._horizontalVelocity.dot(this._wishDir);
             const addSpeed = this.maxSpeed - currentSpeedInWishDir; // How much speed is "needed" relative to maxSpeed

             if (addSpeed > 0) {
                 // --- Restored Original Acceleration Calculation ---
                 // Calculate potential acceleration amount based on accel, maxSpeed, and time
                 let accelSpeed = accel * deltaTime;
                 // Limit by the "needed" speed (prevents overshooting maxSpeed too quickly in one frame)
                 accelSpeed = Math.min(accelSpeed, addSpeed);
                 // ---

                 // Add acceleration in the wish direction
                 this._horizontalVelocity.addScaledVector(this._wishDir, accelSpeed);
             }
        }

        // Speed cap remains removed

        this.velocity.x = this._horizontalVelocity.x;
        this.velocity.z = this._horizontalVelocity.z;
    }


    applyVelocityAndCollide(deltaTime) {
        const numIterations = 4;
        let remainingTime = deltaTime;
        this.onGround = false;
        const collisionEpsilon = 1e-6;

        for (let i = 0; i < numIterations && remainingTime > collisionEpsilon; i++) {
            const timeStep = remainingTime / (numIterations - i);

            // --- Y Collision ---
            let moveY = this.velocity.y * timeStep;
            if (Math.abs(moveY) > collisionEpsilon) {
                const playerBox = this.getBoundingBox();
                const targetYMin = playerBox.min.y + moveY;
                const targetYMax = playerBox.max.y + moveY;
                let collidedY = false;
                for (let y = Math.floor(targetYMin); y <= Math.floor(targetYMax); y++) {
                    for (let x = Math.floor(playerBox.min.x); x <= Math.floor(playerBox.max.x); x++) {
                        for (let z = Math.floor(playerBox.min.z); z <= Math.floor(playerBox.max.z); z++) {
                            if (this.isSolidBlock(x, y, z)) {
                                const blockTop = y + 1, blockBottom = y;
                                if (moveY > 0 && playerBox.max.y <= blockBottom && targetYMax > blockBottom) {
                                    moveY = Math.max(0, blockBottom - playerBox.max.y - collisionEpsilon); this.velocity.y = 0; collidedY = true;
                                } else if (moveY < 0 && playerBox.min.y >= blockTop && targetYMin < blockTop) {
                                    moveY = Math.min(0, blockTop - playerBox.min.y + collisionEpsilon); this.velocity.y = 0; this.onGround = true; collidedY = true;
                                } if (collidedY) break;
                            }
                        } if (collidedY) break;
                    } if (collidedY) break;
                } this.position.y += moveY;
            }

            // --- X Collision ---
            let moveX = this.velocity.x * timeStep;
             if (Math.abs(moveX) > collisionEpsilon) {
                 const playerBox = this.getBoundingBox();
                 const targetXMin = playerBox.min.x + moveX;
                 const targetXMax = playerBox.max.x + moveX;
                 let collidedX = false;
                 for (let x = Math.floor(targetXMin); x <= Math.floor(targetXMax); x++) {
                     for (let y = Math.floor(playerBox.min.y); y <= Math.floor(playerBox.max.y); y++) {
                         for (let z = Math.floor(playerBox.min.z); z <= Math.floor(playerBox.max.z); z++) {
                             if (this.isSolidBlock(x, y, z)) {
                                 const blockRight = x + 1, blockLeft = x;
                                 if (moveX > 0 && playerBox.max.x <= blockLeft && targetXMax > blockLeft) {
                                     moveX = Math.max(0, blockLeft - playerBox.max.x - collisionEpsilon); this.velocity.x = 0; collidedX = true;
                                 } else if (moveX < 0 && playerBox.min.x >= blockRight && targetXMin < blockRight) {
                                     moveX = Math.min(0, blockRight - playerBox.min.x + collisionEpsilon); this.velocity.x = 0; collidedX = true;
                                 } if (collidedX) break;
                             }
                         } if (collidedX) break;
                     } if (collidedX) break;
                 } this.position.x += moveX;
            }

            // --- Z Collision ---
            let moveZ = this.velocity.z * timeStep;
             if (Math.abs(moveZ) > collisionEpsilon) {
                 const playerBox = this.getBoundingBox();
                 const targetZMin = playerBox.min.z + moveZ;
                 const targetZMax = playerBox.max.z + moveZ;
                 let collidedZ = false;
                 for (let z = Math.floor(targetZMin); z <= Math.floor(targetZMax); z++) {
                     for (let y = Math.floor(playerBox.min.y); y <= Math.floor(playerBox.max.y); y++) {
                         for (let x = Math.floor(playerBox.min.x); x <= Math.floor(playerBox.max.x); x++) {
                             if (this.isSolidBlock(x, y, z)) {
                                 const blockBack = z + 1, blockFront = z;
                                if (moveZ > 0 && playerBox.max.z <= blockFront && targetZMax > blockFront) {
                                     moveZ = Math.max(0, blockFront - playerBox.max.z - collisionEpsilon); this.velocity.z = 0; collidedZ = true;
                                 } else if (moveZ < 0 && playerBox.min.z >= blockBack && targetZMin < blockBack) {
                                     moveZ = Math.min(0, blockBack - playerBox.min.z + collisionEpsilon); this.velocity.z = 0; collidedZ = true;
                                } if (collidedZ) break;
                             }
                         } if (collidedZ) break;
                     } if (collidedZ) break;
                 } this.position.z += moveZ;
            }

            remainingTime -= timeStep;
        }
    }

    updateCameraPosition() {
        this.camera.position.set(
            this.position.x,
            this.position.y + this.eyeLevel,
            this.position.z
        );
    }
} // End Player Class