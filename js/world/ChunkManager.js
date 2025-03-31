// js/world/ChunkManager.js
import NoiseGenerator from './Noise.js';
import * as THREE from 'three';

// --- Constants ---
export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Y = 256; // Max world height is 256, bottom is 0
export const CHUNK_SIZE_Z = 16;

// <<< UPDATED BLOCK ENUM (Add OAK_PLANKS Block) >>>
export const BLOCK = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    LOG: 4,
    LEAVES: 5,
    COAL_ORE: 6,
    IRON_ORE: 7,
    GOLD_ORE: 8,
    REDSTONE_ORE: 9,
    LAPIS_ORE: 10,
    DIAMOND_ORE: 11,
    EMERALD_ORE: 12,
    COPPER_ORE: 13,
    CRAFTING_TABLE: 14,
    OAK_PLANKS: 15 // Added Oak Planks Block ID
};
// <<< END UPDATED BLOCK ENUM >>>

// Import ITEM definitions ONLY where needed (like Inventory, not here)
// We define ITEM.OAK_PLANK = 1003 in CraftingRecipes.js

export class ChunkManager {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        this.chunksGenerating = new Set();
        this.renderDistance = 8;
        this.worker = new Worker('./js/world/chunkWorker.js');

        this.textureLoader = new THREE.TextureLoader();
        this.materials = {}; // Stores materials: materials[blockType][faceName] = material
        this.materialPromises = {}; // Stores promises for material loading: materialPromises[texturePath] = promise

        // Shared error material instance
        this.errorMaterial = new THREE.MeshLambertMaterial({
            color: 0xff00ff, // Magenta
            wireframe: true,
            vertexColors: true
        });

        this.completedChunkQueue = [];
        this.pendingTreeLocations = [];
        this.chunksNeedingMeshUpdate = new Set();

        this.worldSeed = Math.random() * 1000000; // Random seed per session

        // Stores texture file paths: textureFiles[blockType][faceName] = path
        // Make sure you have the texture files for the blocks
        this.textureFiles = {
            [BLOCK.GRASS]: { top: 'textures/blocks/grass_top.png', side: 'textures/blocks/grass_side.png', bottom: 'textures/blocks/dirt.png' },
            [BLOCK.DIRT]: { all: 'textures/blocks/dirt.png' },
            [BLOCK.STONE]: { all: 'textures/blocks/stone.png' },
            [BLOCK.LOG]: { top: 'textures/blocks/log_top.png', side: 'textures/blocks/log_side.png' },
            [BLOCK.LEAVES]: { all: 'textures/blocks/leaves.png' },
            [BLOCK.COAL_ORE]: { all: 'textures/blocks/coal_ore.png' },
            [BLOCK.IRON_ORE]: { all: 'textures/blocks/iron_ore.png' },
            [BLOCK.GOLD_ORE]: { all: 'textures/blocks/gold_ore.png' },
            [BLOCK.REDSTONE_ORE]: { all: 'textures/blocks/redstone_ore.png' },
            [BLOCK.LAPIS_ORE]: { all: 'textures/blocks/lapis_ore.png' },
            [BLOCK.DIAMOND_ORE]: { all: 'textures/blocks/diamond_ore.png' },
            [BLOCK.EMERALD_ORE]: { all: 'textures/blocks/emerald_ore.png' },
            [BLOCK.COPPER_ORE]: { all: 'textures/blocks/copper_ore.png' },
            [BLOCK.CRAFTING_TABLE]: {
                 top: 'textures/blocks/crafting_table_top.png',
                 bottom: 'textures/blocks/oak_planks.png',
                 front: 'textures/blocks/crafting_table_front.png',
                 side: 'textures/blocks/crafting_table_side.png'
             },
            [BLOCK.OAK_PLANKS]: { all: 'textures/blocks/oak_planks.png' }, // Added texture for Oak Planks block
        };

        // --- Load Textures and Create Materials ---
        this.loadAndAssignMaterials();
        // --- End Texture Loading ---


        // --- Worker Setup ---
        this.worker.onmessage = (event) => {
            const { type, payload } = event.data;
            if (type === 'chunkResult') {
                const key = this.getChunkKey(payload.chunkX, payload.chunkZ);
                this.completedChunkQueue.push({ key, payload });
            }
        };
        this.worker.onerror = (error) => {
             console.error("Chunk Worker Error:", error);
             this.chunksGenerating.clear(); // Clear generating set on worker error to prevent deadlock
        };
    }

    // --- REFINED: Load Textures and Assign Materials ---
    loadAndAssignMaterials() {
        const allTexturePaths = new Set();
        // Gather all unique texture paths
        for (const blockTypeStr in this.textureFiles) {
            const faces = this.textureFiles[blockTypeStr];
            for (const faceName in faces) {
                allTexturePaths.add(faces[faceName]);
            }
        }

        // Create loading promises for each unique path
        allTexturePaths.forEach(texturePath => {
            if (!this.materialPromises[texturePath]) {
                this.materialPromises[texturePath] = new Promise((resolve) => {
                    this.textureLoader.load(
                        texturePath,
                        (tex) => { // Success
                            tex.magFilter = THREE.NearestFilter;
                            tex.minFilter = THREE.NearestFilter;
                            const isLeaves = texturePath.includes('leaves'); // Simple check

                            const newMaterial = new THREE.MeshLambertMaterial({
                                map: tex,
                                side: isLeaves ? THREE.DoubleSide : THREE.FrontSide,
                                vertexColors: true,
                                transparent: isLeaves,
                                alphaTest: isLeaves ? 0.5 : 0,
                            });
                            // console.log(`WORKER_MANAGER: Successfully loaded material for ${texturePath}`);
                            resolve({ path: texturePath, material: newMaterial });
                        },
                        undefined, // onProgress
                        (err) => { // Error
                            console.error(`WORKER_MANAGER: Error loading texture ${texturePath}:`, err);
                            // Resolve with the shared error material
                            resolve({ path: texturePath, material: this.errorMaterial });
                        }
                    );
                });
            }
        });

        // Assign materials once all promises are resolved (or rejected with error material)
        Promise.all(Object.values(this.materialPromises)).then(results => {
            const loadedMaterials = {}; // Map path -> material
            results.forEach(({ path, material }) => {
                loadedMaterials[path] = material;
            });

            // Now assign materials based on the loaded map
            for (const blockTypeStr in this.textureFiles) {
                const blockType = parseInt(blockTypeStr);
                const faces = this.textureFiles[blockTypeStr];

                if (!this.materials[blockType]) this.materials[blockType] = {};

                for (const faceName in faces) {
                    const texturePath = faces[faceName];
                    const material = loadedMaterials[texturePath] || this.errorMaterial; // Use error material if path somehow wasn't loaded

                    // Assign directly to the specific face defined in textureFiles
                    this.materials[blockType][faceName] = material;
                }
             }
             console.log("WORKER_MANAGER: All material assignments complete.");
             // console.log("Final materials object:", this.materials);
         }).catch(error => {
             console.error("WORKER_MANAGER: Error processing material promises:", error);
         });
     }
     // --- END REFINED ---

    /**
     * Gets the texture path for a given block type and face name, handling fallbacks.
     * Primarily used for UI elements like Inventory.
     * @param {number} blockType - The numerical type of the block (e.g., BLOCK.GRASS).
     * @param {string} faceName - The desired face ('top', 'bottom', 'side', 'all', 'front', 'back', 'left', 'right').
     * @returns {string|null} The texture path or null if not found.
     */
    getTexturePath(blockType, faceName) {
        const blockTexturePaths = this.textureFiles[blockType];
        if (!blockTexturePaths) return this.textureFiles[BLOCK.STONE]?.all || null; // Fallback to stone or null if block type unknown

        // 1. Direct match
        if (blockTexturePaths[faceName]) return blockTexturePaths[faceName];

        // 2. Handle sides ('front', 'back', 'left', 'right' fall back to 'side')
        if (['front', 'back', 'left', 'right'].includes(faceName) && blockTexturePaths['side']) {
            return blockTexturePaths['side'];
        }

        // 3. Handle bottom (falls back to 'top', except for Grass which uses dirt explicitly)
        if (faceName === 'bottom') {
            if (blockType === BLOCK.GRASS) {
                // Grass bottom uses the path defined in its 'bottom' property (which should point to dirt)
                return blockTexturePaths['bottom'] || this.textureFiles[BLOCK.DIRT]?.all || null;
            } else if (blockTexturePaths['top']) {
                // Other blocks fall back to 'top' if 'bottom' isn't specified
                return blockTexturePaths['top'];
            }
        }

        // 4. General fallback to 'all'
        if (blockTexturePaths['all']) return blockTexturePaths['all'];

        // 5. Final fallback (e.g., if only 'top' and 'side' are defined, and 'bottom' is requested for grass but dirt texture missing)
        // console.warn(`Texture path not found for block ${blockType} face ${faceName}. Falling back to stone.`);
        return this.textureFiles[BLOCK.STONE]?.all || null;
    }


    // --- REFINED: Material Lookup by Key ---
    /**
     * Finds the pre-loaded material based on the key generated by the worker (e.g., "1-top").
     * Applies fallback logic if a direct match isn't available.
     * @param {string} key - The material key string (e.g., "blockType-faceName").
     * @returns {THREE.Material} The found material or the shared error material.
     */
    findMaterialByKey(key) {
        const parts = key.split('-');
        if (parts.length !== 2) {
            console.error(`WORKER_MANAGER: Invalid material key format: ${key}. Using error material.`);
            return this.errorMaterial;
        }
        const blockType = parseInt(parts[0]);
        const faceName = parts[1]; // e.g., 'top', 'side', 'all', 'front'

        if (isNaN(blockType) || !this.materials[blockType]) {
             // console.warn(`WORKER_MANAGER: No materials loaded for block type ${blockType} (key: ${key}). Using error material.`);
             return this.errorMaterial;
        }

        const blockMaterials = this.materials[blockType];

        // --- Lookup Logic ---
        // 1. Direct match for the specific face
        if (blockMaterials[faceName]) {
            return blockMaterials[faceName];
        }

        // 2. Fallback for sides ('front', 'back', 'left', 'right' -> 'side')
        if (['front', 'back', 'left', 'right'].includes(faceName) && blockMaterials['side']) {
            return blockMaterials['side'];
        }

        // 3. Fallback for bottom ('bottom' -> 'top', except grass and crafting table)
        if (faceName === 'bottom') {
            if (blockType === BLOCK.GRASS) {
                 if (blockMaterials['bottom']) return blockMaterials['bottom'];
                 else return this.materials[BLOCK.DIRT]?.all || this.errorMaterial;
            } else if (blockType === BLOCK.CRAFTING_TABLE) {
                 if (blockMaterials['bottom']) return blockMaterials['bottom']; // Use explicit bottom if defined
                 // else fall through to 'top' or 'all'
            }
            if (blockMaterials['top']) { // Fallback to 'top' for most blocks
                return blockMaterials['top'];
            }
        }


        // 4. General fallback to 'all' material for the block type
        if (blockMaterials['all']) {
            return blockMaterials['all'];
        }

        // --- Final Fallback ---
        console.warn(`WORKER_MANAGER: Material key '${key}' failed all fallbacks. Using error material.`);
        return this.errorMaterial;
    }
    // --- END REFINED ---


    getChunkKey(chunkX, chunkZ) { return `${chunkX},${chunkZ}`; }

    getChunkCoords(worldX, worldZ) {
        const chunkX = Math.floor(worldX / CHUNK_SIZE_X);
        const chunkZ = Math.floor(worldZ / CHUNK_SIZE_Z);
        return { chunkX, chunkZ };
    }

    calculateNoiseForChunk(chunkX, chunkZ) {
        const noiseData = new Float32Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
        let i = 0;
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
            for (let z = 0; z < CHUNK_SIZE_Z; z++) {
                const wx = chunkX * CHUNK_SIZE_X + x;
                const wz = chunkZ * CHUNK_SIZE_Z + z;
                noiseData[i++] = NoiseGenerator.getHeight(wx, wz);
            }
        }
        return noiseData;
    }

    /**
     * Checks if the block data for a specific chunk is loaded and ready.
     * @param {number} chunkX
     * @param {number} chunkZ
     * @returns {boolean} True if the chunk data is loaded, false otherwise.
     */
    isChunkDataReady(chunkX, chunkZ) {
        const key = this.getChunkKey(chunkX, chunkZ);
        const chunkData = this.chunks.get(key);
        return !!chunkData && !!chunkData.blocks && !this.chunksGenerating.has(key);
    }

     /**
      * Gets the highest non-air block Y coordinate at specific world X, Z coordinates.
      * Assumes the relevant chunk data is already loaded (use isChunkDataReady first).
      * @param {number} worldX
      * @param {number} worldZ
      * @returns {number} The Y coordinate of the highest solid block, or -1 if the column is empty or chunk not loaded.
      */
     getHighestBlockY(worldX, worldZ) {
         const { chunkX, chunkZ } = this.getChunkCoords(worldX, worldZ);
         const key = this.getChunkKey(chunkX, chunkZ);
         const chunkData = this.chunks.get(key);

         if (!chunkData || !chunkData.blocks) {
             return -1; // Chunk not ready
         }

         const ix = Math.floor(worldX);
         const iz = Math.floor(worldZ);
         const lx = ix - chunkX * CHUNK_SIZE_X;
         const lz = iz - chunkZ * CHUNK_SIZE_Z;

         if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) {
             console.warn(`Local coordinates out of bounds in getHighestBlockY: lx=${lx}, lz=${lz}`);
             return -1;
         }

         for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
             const index = y * (CHUNK_SIZE_X * CHUNK_SIZE_Z) + lz * CHUNK_SIZE_X + lx;
             if (index >= 0 && index < chunkData.blocks.length && chunkData.blocks[index] !== BLOCK.AIR) {
                 return y;
             }
         }
         return -1; // Column appears empty
     }


    // --- Processing Queues ---
    processCompletedChunks() {
        let processed = false;
        while (this.completedChunkQueue.length > 0) {
            const { key, payload } = this.completedChunkQueue.shift();
            this.handleChunkResult(key, payload);
            processed = true;
        }
        return processed;
    }

    processPendingTrees() {
        if (this.pendingTreeLocations.length > 0) {
            const tree = this.pendingTreeLocations.shift();
            const baseBlockBelow = this.getBlock(tree.x, tree.y - 1, tree.z);
            if (baseBlockBelow === BLOCK.GRASS || baseBlockBelow === BLOCK.DIRT) {
                 this.placeTreeAtWorldCoords(tree.x, tree.y, tree.z);
            }
            return true;
        }
        return false;
    }

    processPendingMeshUpdates() {
        if (this.chunksNeedingMeshUpdate.size > 0) {
            const keyToUpdate = this.chunksNeedingMeshUpdate.values().next().value;
            if (keyToUpdate) {
                 this.chunksNeedingMeshUpdate.delete(keyToUpdate);
                 const [cx, cz] = keyToUpdate.split(',').map(Number);
                 const chunkData = this.chunks.get(keyToUpdate);
                 if (chunkData && chunkData.blocks && !this.chunksGenerating.has(keyToUpdate)) {
                    this.regenerateChunkMesh(cx, cz);
                 }
                 return true;
            }
        }
        return false;
    }
    // --- End Processing Queues ---


    update(cameraPosition) {
        let workDone = false;
        workDone = this.processCompletedChunks() || workDone;
        workDone = this.processPendingTrees() || workDone;
        workDone = this.processPendingMeshUpdates() || workDone;

        const currentChunkCoords = this.getChunkCoords(cameraPosition.x, cameraPosition.z);
        const requiredChunks = new Set();

        for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
            for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
                const distSq = x*x + z*z;
                if (distSq <= this.renderDistance * this.renderDistance) {
                     requiredChunks.add(this.getChunkKey(currentChunkCoords.chunkX + x, currentChunkCoords.chunkZ + z));
                }
            }
        }

        // --- Unload Chunks ---
        const chunksToRemove = [];
        for (const [key, chunkData] of this.chunks.entries()) {
            if (!requiredChunks.has(key) &&
                !this.chunksGenerating.has(key) &&
                !this.chunksNeedingMeshUpdate.has(key) &&
                !this.completedChunkQueue.some(item => item.key === key))
            {
                if (chunkData && chunkData.meshes) {
                    chunkData.meshes.forEach(mesh => {
                        if (mesh.geometry) mesh.geometry.dispose();
                        this.scene.remove(mesh);
                    });
                    chunkData.meshes = [];
                }
                if (chunkData) {
                     chunkData.blocks = null;
                     chunkData.treeLocations = [];
                }
                chunksToRemove.push(key);
            }
        }
        chunksToRemove.forEach(key => {
            this.chunks.delete(key);
            // console.log(`Unloaded chunk ${key}`);
        });
        // --- End Unload Chunks ---


        // --- Load New Chunks ---
        for (const key of requiredChunks) {
            const chunkData = this.chunks.get(key);
            if ((!chunkData || !chunkData.blocks) && !this.chunksGenerating.has(key)) {
                const [chunkX, chunkZ] = key.split(',').map(Number);
                const noiseData = this.calculateNoiseForChunk(chunkX, chunkZ);

                this.chunksGenerating.add(key);
                if (!chunkData) {
                    this.chunks.set(key, { meshes: [], blocks: null, generating: true, treeLocations: [] });
                } else {
                    chunkData.generating = true;
                    chunkData.blocks = null;
                    chunkData.meshes = [];
                    chunkData.treeLocations = [];
                }

                // console.log(`Requesting generation for chunk ${key}`);
                this.worker.postMessage({
                    type: 'generateChunk',
                    payload: {
                        chunkX,
                        chunkZ,
                        noiseData: noiseData.buffer,
                        worldSeed: this.worldSeed
                    }
                }, [noiseData.buffer]);
            }
        }
        // --- End Load New Chunks ---
    }


     handleChunkResult(key, payload) {
        const { chunkX, chunkZ, blocksData, geometryGroups, treeLocations } = payload;
        const currentChunkData = this.chunks.get(key);

        if (!currentChunkData || !this.chunksGenerating.has(key)) {
             // console.warn(`Received chunk result for ${key}, but it's no longer expected or generating. Discarding.`);
             this.chunksGenerating.delete(key);
            return;
        }

        // Clear existing meshes
        if (currentChunkData.meshes && currentChunkData.meshes.length > 0) {
            currentChunkData.meshes.forEach(mesh => {
                if (mesh.geometry) mesh.geometry.dispose();
                this.scene.remove(mesh);
            });
        }
        currentChunkData.meshes = [];

        // Store block data
        if (blocksData) {
            currentChunkData.blocks = new Uint8Array(blocksData);
        } else {
             console.warn(`Received null block data for chunk ${key}`);
             currentChunkData.blocks = null;
        }

        // Create meshes from geometry groups
        if (geometryGroups && geometryGroups.length > 0) {
            for (const group of geometryGroups) {
                 const { materialKey, geometryData } = group;
                 if (!geometryData || !materialKey || !geometryData.positions || geometryData.positions.length === 0) {
                      // console.warn(`Skipping invalid or empty geometry group for key ${materialKey} in chunk ${key}`);
                      continue;
                 }

                 // Find the appropriate material using the refined lookup
                 const material = this.findMaterialByKey(materialKey); // Uses refined lookup

                 // Check if the material is the error material AFTER lookup
                 if (material === this.errorMaterial) {
                      console.error(`WORKER_MANAGER: Using error material for key ${materialKey} in chunk ${key}. Creating fallback mesh.`);
                      // Optionally create a visible error mesh using the geometry data but error material
                      try {
                          const geometry = new THREE.BufferGeometry();
                          geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(geometryData.positions), 3));
                          // Only add other attributes if they exist in geometryData
                           if (geometryData.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(geometryData.normals), 3));
                           if (geometryData.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometryData.uvs), 2));
                           if (geometryData.colors) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometryData.colors), 3));
                          geometry.computeBoundingSphere();
                          const mesh = new THREE.Mesh(geometry, this.errorMaterial);
                          mesh.position.set(chunkX * CHUNK_SIZE_X, 0, chunkZ * CHUNK_SIZE_Z);
                          currentChunkData.meshes.push(mesh);
                          this.scene.add(mesh);
                      } catch(e) { console.error(`WORKER_MANAGER: Error creating ERROR mesh for chunk ${key}`, e); }
                      continue; // Skip to next group
                 }

                // Create mesh with the valid, found material
                try {
                    // Ensure material properties (redundant check, handled at load time now)
                    // material.vertexColors = true;
                    // if (material.transparent) material.alphaTest = 0.5;

                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(geometryData.positions), 3));
                    if (geometryData.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(geometryData.normals), 3));
                     else { console.warn(`WORKER_MANAGER: Missing normals for ${key} - ${materialKey}`); geometry.computeVertexNormals();} // Compute if missing
                    if (geometryData.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometryData.uvs), 2));
                     else console.warn(`WORKER_MANAGER: Missing UVs for ${key} - ${materialKey}`);
                    if (geometryData.colors) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometryData.colors), 3));
                     else { console.warn(`WORKER_MANAGER: Missing colors for ${key} - ${materialKey}`); geometry.setAttribute('color', new THREE.Float32BufferAttribute( new Float32Array(geometryData.positions.length).fill(1.0), 3));} // Add white if missing

                    geometry.computeBoundingSphere();

                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(chunkX * CHUNK_SIZE_X, 0, chunkZ * CHUNK_SIZE_Z);

                    currentChunkData.meshes.push(mesh);
                    this.scene.add(mesh);

                } catch(e) {
                     console.error(`WORKER_MANAGER: Error creating mesh for chunk ${key} with material ${materialKey}`, e);
                }
            }
        } else if(currentChunkData.blocks && currentChunkData.blocks.some(b => b !== BLOCK.AIR)){
             // console.log(`Chunk ${key} has blocks but received no geometry groups.`);
        }

        // Store tree locations
        if (treeLocations && treeLocations.length > 0) {
             currentChunkData.treeLocations = treeLocations;
             this.pendingTreeLocations.push(...treeLocations);
        } else {
            currentChunkData.treeLocations = [];
        }

        // Mark chunk as done
        currentChunkData.generating = false;
        this.chunksGenerating.delete(key);
         // console.log(`Finished processing chunk ${key}`);
    }


    getBlock(worldX, worldY, worldZ) {
        if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return BLOCK.AIR;

        const ix = Math.floor(worldX), iy = Math.floor(worldY), iz = Math.floor(worldZ);
        const chunkX = Math.floor(ix / CHUNK_SIZE_X);
        const chunkZ = Math.floor(iz / CHUNK_SIZE_Z);
        const key = this.getChunkKey(chunkX, chunkZ);
        const chunkData = this.chunks.get(key);

        if (chunkData && chunkData.blocks) {
            const lx = ix - chunkX * CHUNK_SIZE_X;
            const ly = iy;
            const lz = iz - chunkZ * CHUNK_SIZE_Z;

            if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) {
                return BLOCK.AIR;
            }

            const index = ly * (CHUNK_SIZE_X * CHUNK_SIZE_Z) + lz * CHUNK_SIZE_X + lx;

            if (index >= 0 && index < chunkData.blocks.length) {
                return chunkData.blocks[index];
            } else {
                return BLOCK.AIR;
            }
        } else {
            return BLOCK.AIR;
        }
    }

    setBlock(worldX, worldY, worldZ, blockType) {
        if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return false;

        const ix = Math.floor(worldX), iy = Math.floor(worldY), iz = Math.floor(worldZ);
        const chunkX = Math.floor(ix / CHUNK_SIZE_X);
        const chunkZ = Math.floor(iz / CHUNK_SIZE_Z);
        const key = this.getChunkKey(chunkX, chunkZ);
        const chunkData = this.chunks.get(key);

        if (chunkData && chunkData.blocks) {
            const lx = ix - chunkX * CHUNK_SIZE_X;
            const ly = iy;
            const lz = iz - chunkZ * CHUNK_SIZE_Z;

            if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) {
                return false;
            }

            const index = ly * (CHUNK_SIZE_X * CHUNK_SIZE_Z) + lz * CHUNK_SIZE_X + lx;

            if (index >= 0 && index < chunkData.blocks.length) {
                if (chunkData.blocks[index] === blockType) return false; // No change

                chunkData.blocks[index] = blockType;

                // Queue mesh updates for affected chunks
                const chunksToQueue = new Set();
                chunksToQueue.add(key);
                if (lx === 0)                   chunksToQueue.add(this.getChunkKey(chunkX - 1, chunkZ));
                if (lx === CHUNK_SIZE_X - 1)    chunksToQueue.add(this.getChunkKey(chunkX + 1, chunkZ));
                if (lz === 0)                   chunksToQueue.add(this.getChunkKey(chunkX, chunkZ - 1));
                if (lz === CHUNK_SIZE_Z - 1)    chunksToQueue.add(this.getChunkKey(chunkX, chunkZ + 1));

                chunksToQueue.forEach(updateKey => {
                    if (this.chunks.has(updateKey)) {
                        this.chunksNeedingMeshUpdate.add(updateKey);
                    }
                });

                return true;
            } else {
                 return false;
            }
        } else {
            return false; // Chunk not loaded
        }
    }


    placeTreeAtWorldCoords(baseX, baseY, baseZ) {
        if (baseY <= 0 || baseY + 6 >= CHUNK_SIZE_Y) return;

        const minChunkX = Math.floor((baseX - 2) / CHUNK_SIZE_X);
        const maxChunkX = Math.floor((baseX + 2) / CHUNK_SIZE_X);
        const minChunkZ = Math.floor((baseZ - 2) / CHUNK_SIZE_Z);
        const maxChunkZ = Math.floor((baseZ + 2) / CHUNK_SIZE_Z);

        // Check readiness of potentially affected chunks
        for (let cx = minChunkX; cx <= maxChunkX; cx++) {
            for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
                 if (!this.isChunkDataReady(cx, cz)) {
                      // console.warn(`Skipping tree placement at ${baseX},${baseY},${baseZ}: Chunk ${cx},${cz} not ready.`);
                      return;
                 }
            }
        }

        const groundBlock = this.getBlock(baseX, baseY - 1, baseZ);
        if (groundBlock !== BLOCK.GRASS && groundBlock !== BLOCK.DIRT) {
             return;
        }

        // Place Trunk
        for (let yOff = 0; yOff < 6; yOff++) {
            this.setBlock(baseX, baseY + yOff, baseZ, BLOCK.LOG);
        }
        // Place Leaves
        const leavesYBase = baseY + 3;
        for (let yOff = 0; yOff < 2; yOff++) { // Layer 1 & 2 (5x5 - corners)
            const currentY = leavesYBase + yOff; if (currentY >= CHUNK_SIZE_Y) continue;
            for (let xOff = -2; xOff <= 2; xOff++) {
                for (let zOff = -2; zOff <= 2; zOff++) {
                    if (Math.abs(xOff) === 2 && Math.abs(zOff) === 2) continue;
                    if (xOff === 0 && zOff === 0 && currentY < baseY + 6) continue; // Don't replace trunk
                    if(this.getBlock(baseX + xOff, currentY, baseZ + zOff) === BLOCK.AIR) {
                        this.setBlock(baseX + xOff, currentY, baseZ + zOff, BLOCK.LEAVES);
                    }
                }
            }
        }
        const y3 = leavesYBase + 2; // Layer 3 (3x3 - center)
        if (y3 < CHUNK_SIZE_Y) {
            for (let xOff = -1; xOff <= 1; xOff++) {
                for (let zOff = -1; zOff <= 1; zOff++) {
                    if (xOff === 0 && zOff === 0) continue;
                     if(this.getBlock(baseX + xOff, y3, baseZ + zOff) === BLOCK.AIR) {
                        this.setBlock(baseX + xOff, y3, baseZ + zOff, BLOCK.LEAVES);
                     }
                }
            }
        }
         const y4 = leavesYBase + 3; // Layer 4 (+)
         if (y4 < CHUNK_SIZE_Y) {
              if(this.getBlock(baseX, y4, baseZ) === BLOCK.AIR) this.setBlock(baseX, y4, baseZ, BLOCK.LEAVES);
              if(this.getBlock(baseX + 1, y4, baseZ) === BLOCK.AIR) this.setBlock(baseX + 1, y4, baseZ, BLOCK.LEAVES);
              if(this.getBlock(baseX - 1, y4, baseZ) === BLOCK.AIR) this.setBlock(baseX - 1, y4, baseZ, BLOCK.LEAVES);
              if(this.getBlock(baseX, y4, baseZ + 1) === BLOCK.AIR) this.setBlock(baseX, y4, baseZ + 1, BLOCK.LEAVES);
              if(this.getBlock(baseX, y4, baseZ - 1) === BLOCK.AIR) this.setBlock(baseX, y4, baseZ - 1, BLOCK.LEAVES);
         }
    }


    regenerateChunkMesh(chunkX, chunkZ) {
         const key = this.getChunkKey(chunkX, chunkZ);
         const chunkData = this.chunks.get(key);

         if (!chunkData || !chunkData.blocks || this.chunksGenerating.has(key)) {
              return;
         }

         // Defensively remove from other queues
         this.completedChunkQueue = this.completedChunkQueue.filter(item => item.key !== key);
         this.chunksNeedingMeshUpdate.delete(key);

         this.chunksGenerating.add(key);
         chunkData.generating = true;
         // console.log(`Regenerating mesh for chunk ${key}`);

         try {
             const blocksCopyBuffer = chunkData.blocks.buffer.slice(0);
             this.worker.postMessage({
                 type: 'regenerateMesh',
                 payload: {
                     chunkX, chunkZ,
                     blocksData: blocksCopyBuffer,
                     worldSeed: this.worldSeed
                 }
             }, [blocksCopyBuffer]);
         } catch (error) {
              console.error(`Error copying buffer or posting message for chunk ${key} regeneration:`, error);
              chunkData.generating = false;
              this.chunksGenerating.delete(key);
         }
    }


    getAllChunkMeshes() {
        const meshes = [];
        for (const chunkData of this.chunks.values()) {
            if (chunkData?.meshes?.length > 0 && !chunkData.generating) {
                 const validMeshes = chunkData.meshes.filter(mesh => mesh instanceof THREE.Mesh && mesh.geometry);
                 meshes.push(...validMeshes);
            }
        }
        return meshes;
    }

    disposeAll() {
        console.log("Disposing ChunkManager...");
        this.worker.terminate();
        this.completedChunkQueue = [];
        this.pendingTreeLocations = [];
        this.chunksNeedingMeshUpdate.clear();
        this.chunksGenerating.clear();

        for (const [key, chunkData] of this.chunks.entries()) {
            if (chunkData?.meshes) {
                chunkData.meshes.forEach(mesh => {
                    if (mesh.geometry) mesh.geometry.dispose();
                    this.scene.remove(mesh);
                });
            }
        }
        this.chunks.clear();

        // Dispose materials and textures
        Object.values(this.materials).forEach(blockMats => {
            Object.values(blockMats).forEach(mat => {
                if (mat && mat !== this.errorMaterial) { // Don't dispose shared error material multiple times
                    if (mat.map) mat.map.dispose();
                    mat.dispose();
                }
            });
        });
         if(this.errorMaterial.map) this.errorMaterial.map.dispose(); // Dispose error mat texture once
         this.errorMaterial.dispose(); // Dispose error mat once

        this.materials = {};
        this.materialPromises = {};


        console.log("ChunkManager disposed.");
    }

} // End of ChunkManager class