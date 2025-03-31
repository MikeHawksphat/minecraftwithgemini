// js/main.js
import * as THREE from 'three';
import { setupScene } from './sceneSetup.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ChunkManager, BLOCK, CHUNK_SIZE_Y } from './world/ChunkManager.js'; // Import CHUNK_SIZE_Y
import { Player } from './Player.js';
import NoiseGenerator from './world/Noise.js';
import { FPSCounter } from './utils/FPScounter.js';

// --- Initialization ---
const canvas = document.getElementById('gameCanvas');
if (!canvas) throw new Error("Canvas element with ID 'gameCanvas' not found!");

const { renderer, scene, camera } = setupScene(canvas);
const chunkManager = new ChunkManager(scene);
const clock = new THREE.Clock();
const fpsCounter = new FPSCounter();
const player = new Player(camera, chunkManager); // Player XZ defaults are set here
const controls = new PointerLockControls(camera, document.body);

// Get reference to the Coords HUD element
const coordsHUD = document.getElementById('coords-hud');
if (!coordsHUD) console.warn("Coordinates HUD element with ID 'coords-hud' not found!");

let gameLoopRunning = false; // Flag to prevent multiple animate() calls

// --- Pointer Lock / Inventory Interaction ---
canvas.addEventListener('click', () => {
    if (!player.inventory.isInventoryOpen) { controls.lock(); }
});
controls.addEventListener('lock', () => {
    console.log('Pointer Locked');
    // If inventory was open when lock was requested, close it
    if (player.inventory.isInventoryOpen) {
        player.inventory.toggleInventoryDisplay();
    }
    document.body.style.cursor = 'none'; // Hide cursor
});
controls.addEventListener('unlock', () => {
    console.log('Pointer Unlocked');
    document.body.style.cursor = 'default'; // Show cursor
});

// --- Keyboard Input Handling ---
const keys = {};
document.addEventListener('keydown', (event) => {
    // Handle 'E' for inventory toggle FIRST, regardless of lock state
    if (event.code === 'KeyE') {
        const inventoryIsNowOpen = player.inventory.toggleInventoryDisplay();
        // If inventory is opened, unlock pointer. If closed, lock pointer.
        if (inventoryIsNowOpen) {
            controls.unlock();
        } else {
            // Only lock if not already locked (might happen if 'E' is pressed while already locked)
            if (!controls.isLocked) {
                 controls.lock();
            }
        }
        event.preventDefault(); // Prevent 'e' from typing if used elsewhere
        return; // Don't process other keys if 'E' was pressed
    }

    // Process other keys only if inventory is closed
    if (!player.inventory.isInventoryOpen) {
        keys[event.code] = true;
        // Hotbar selection (digits 1-9)
        if (event.code.startsWith('Digit')) {
            const digit = parseInt(event.code.slice(5));
            if (!isNaN(digit) && digit >= 1 && digit <= 9) {
                player.inventory.setSelectedSlot(digit - 1); // 0-indexed slot
            }
        }
    }
});
document.addEventListener('keyup', (event) => {
    // Always register keyup events
    keys[event.code] = false;
});

function processInput() {
    // Determine input state based on keys pressed, ONLY if pointer is locked
    const isLocked = controls.isLocked;
    player.input.forward = isLocked && (keys['KeyW'] || false);
    player.input.backward = isLocked && (keys['KeyS'] || false);
    player.input.left = isLocked && (keys['KeyA'] || false);
    player.input.right = isLocked && (keys['KeyD'] || false);
    player.input.jump = isLocked && (keys['Space'] || false); // Check spacebar for jump
}


// --- Block Interaction ---
const raycaster = new THREE.Raycaster();
const interactionDistance = 5; // Max distance to interact with blocks

document.addEventListener('mousedown', (event) => {
    // Only interact if inventory is closed AND pointer is locked
    if (player.inventory.isInventoryOpen || !controls.isLocked) {
        return;
    }

    // Raycast from camera center
    raycaster.setFromCamera({ x: 0, y: 0 }, camera); // Center of screen

    // Get meshes from currently loaded chunks for intersection test
    const meshesToIntersect = chunkManager.getAllChunkMeshes();
    if (meshesToIntersect.length === 0) return; // No chunks loaded/visible

    const intersects = raycaster.intersectObjects(meshesToIntersect);

    if (intersects.length > 0) {
        const intersection = intersects[0]; // Closest intersection

        // Check distance and ensure face data is available
        if (intersection.distance < interactionDistance && intersection.face) {

            if (event.button === 0) { // Left click: Break block
                // Calculate position slightly inside the intersected face to get the block coords
                const breakVec = intersection.point.clone().addScaledVector(intersection.face.normal, -0.01);
                const blockX = Math.floor(breakVec.x);
                const blockY = Math.floor(breakVec.y);
                const blockZ = Math.floor(breakVec.z);

                // Get the type of block being broken
                const brokenBlockType = chunkManager.getBlock(blockX, blockY, blockZ);

                // Can't break air, add item to inventory if successful
                if (brokenBlockType !== BLOCK.AIR) {
                    const added = player.inventory.addItem(brokenBlockType); // Try to add item
                    if (added) {
                        chunkManager.setBlock(blockX, blockY, blockZ, BLOCK.AIR); // Set block to air if item added
                    } else {
                        console.log("Inventory full, cannot break block."); // Optional feedback
                    }
                }

            } else if (event.button === 2) { // Right click: Place block
                // Calculate position slightly outside the intersected face
                const placeVec = intersection.point.clone().addScaledVector(intersection.face.normal, 0.01);
                const blockX = Math.floor(placeVec.x);
                const blockY = Math.floor(placeVec.y);
                const blockZ = Math.floor(placeVec.z);

                // --- Collision Check: Prevent placing block inside player ---
                const playerBB = player.getBoundingBox();
                const placeBB = new THREE.Box3(
                    new THREE.Vector3(blockX, blockY, blockZ),
                    new THREE.Vector3(blockX + 1, blockY + 1, blockZ + 1)
                );

                 if (!playerBB.intersectsBox(placeBB)) { // Only place if no collision
                     const selectedBlockType = player.inventory.getSelectedBlockType(); // Get from hotbar
                     if (selectedBlockType !== null && selectedBlockType !== BLOCK.AIR) { // Must have a placeable block selected
                         // Try to remove one item from the selected hotbar slot
                         const removed = player.inventory.removeItem(player.inventory.selectedSlotIndex);
                         if (removed) {
                             // Place the block in the world if item was successfully removed
                             chunkManager.setBlock(blockX, blockY, blockZ, selectedBlockType);
                         }
                     }
                 } else {
                     // console.log("Cannot place block inside player."); // Optional feedback
                 }
                 // --- End Collision Check ---
            }
        }
    }
});

// --- Game Loop ---
function animate() {
    if (!gameLoopRunning) return; // Exit if loop shouldn't be running

    requestAnimationFrame(animate); // Request next frame

    const deltaTime = Math.min(0.05, clock.getDelta()); // Get time delta, clamp to prevent large jumps
    try { fpsCounter.update(); } catch (e) { console.error("FPS Counter Error:", e); }

    processInput(); // Update player input state based on keys pressed

    // Update player physics and position
    // Player update logic now handles movement constraints when inventory is open internally
    player.update(deltaTime);


    // Update Coordinates HUD if the element exists
    if (coordsHUD) {
        const x = player.position.x.toFixed(2);
        const y = player.position.y.toFixed(2); // Player's feet position
        const z = player.position.z.toFixed(2);
        coordsHUD.textContent = `XYZ: ${x} / ${y} / ${z}`;
    }


    // Update chunks based on player position (loads/unloads chunks)
    try { chunkManager.update(player.position); } catch(e) { console.error("ChunkManager Update Error:", e); }

    // Render the scene
    try { renderer.render(scene, camera); } catch (e) { console.error("Render Error:", e); }
}

// --- Start ---
try {
    console.log("Starting initialization...");
    const startX = player.position.x; // Use initial player XZ from Player constructor
    const startZ = player.position.z;

    // --- MODIFIED START SEQUENCE ---

    // 1. Get initial chunk coordinates
    const { chunkX: initialChunkX, chunkZ: initialChunkZ } = chunkManager.getChunkCoords(startX, startZ);
    const initialChunkKey = chunkManager.getChunkKey(initialChunkX, initialChunkZ);
    console.log(`Initial chunk key: ${initialChunkKey}`);

    // 2. Trigger initial chunk loading (includes the starting chunk)
    chunkManager.update(player.position);
    console.log("Initial chunk load triggered.");

    // 3. Wait for the initial chunk's data to be ready
    const checkReadyInterval = setInterval(() => {
        // console.log(`Checking if chunk ${initialChunkKey} is ready...`); // Verbose log

        // Process any completed chunk data received from the worker
        // This is crucial for the isChunkDataReady check to become true
        chunkManager.processCompletedChunks();
        chunkManager.processPendingMeshUpdates(); // Process mesh updates too if needed

        // Check if the specific starting chunk's block data is loaded
        if (chunkManager.isChunkDataReady(initialChunkX, initialChunkZ)) {
            console.log(`Chunk ${initialChunkKey} data is ready!`);
            clearInterval(checkReadyInterval); // Stop the interval timer

            // 4. Get the actual highest ground block Y at the spawn point
            const groundY = chunkManager.getHighestBlockY(startX, startZ);
            console.log(`Determined ground Y at spawn: ${groundY}`);

            if (groundY !== -1) {
                 // Position the player safely above the determined ground
                 // Ensure Y is within world bounds if needed, though getHighestBlockY should handle it
                 player.position.y = Math.min(CHUNK_SIZE_Y - player.height - 0.1, groundY + 1.0); // Place feet 1 block above ground
                 console.log(`Player spawned at Y = ${player.position.y}`);
            } else {
                // Fallback if column is empty or chunk loading failed unexpectedly
                console.warn(`Could not find ground block at ${startX}, ${startZ}. Spawning at default height.`);
                player.position.y = NoiseGenerator.groundOffset + 10; // Use a default/fallback height
            }

            // 5. Update camera position based on the final player Y position
            player.updateCameraPosition();

            // 6. Update inventory displays now that everything is set up
            player.inventory.updateHotbarDisplay();
            player.inventory.updateInventoryDisplay();

            // 7. Start the main game loop
            console.log("Starting main game loop (animate).");
            gameLoopRunning = true; // Set flag to allow loop to run
            animate();

        } else {
             // console.log(`Chunk ${initialChunkKey} data not ready yet.`); // Verbose log
             // Optionally trigger another update, though processing queues might be sufficient
             // chunkManager.update(player.position);
        }
    }, 100); // Check readiness every 100ms (adjust interval as needed)

    // --- END MODIFIED START SEQUENCE ---

    // NOTE: animate() is no longer called directly here. It's started inside the setInterval callback.

} catch (error) {
    console.error("Initialization Error:", error);
    // Display error prominently if initialization fails
    document.body.innerHTML = `<h1>Initialization Error</h1><p>Check console for details.</p><pre>${error.stack}</pre>`;
    // Ensure game loop doesn't accidentally start on error
    gameLoopRunning = false;
}