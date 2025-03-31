// js/world/chunkWorker.js

console.log("WORKER: Script loaded.");

// --- Constants ---
const CHUNK_SIZE_X = 16;
const CHUNK_SIZE_Y = 256;
const CHUNK_SIZE_Z = 16;

// <<< UPDATED BLOCK ENUM (match ChunkManager and add Crafting Table) >>>
const BLOCK = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    LOG: 4,
    LEAVES: 5,
    COAL_ORE: 6,
    IRON_ORE: 7,
    GOLD_ORE: 8,
    REDSTONE_ORE: 9, // Note: Minecraft ores might have different IDs
    LAPIS_ORE: 10,
    DIAMOND_ORE: 11,
    EMERALD_ORE: 12, // Added Emerald
    COPPER_ORE: 13, // Added Copper (Example, ensure ID matches ChunkManager)
    CRAFTING_TABLE: 14 // Added Crafting Table ID
};
// <<< END UPDATED BLOCK ENUM >>>


// --- Tree constants ---
const TREE_PROBABILITY = 0.008; // Adjust probability as needed
const TREE_MIN_HEIGHT = 7; // 6 logs + 1 top leaf

// --- Vein Generation Constants ---
const VEIN_ATTEMPT_CHANCE = 0.015; // Chance to *try* starting a vein at any given stone block
const VEIN_MAX_SIZE = 8;          // <<< CHANGED: Max blocks in a vein (was 18)
const VEIN_MIN_SIZE = 1;          // <<< CHANGED: Min blocks in a vein (was 3)
const VEIN_ITERATIONS = 12;       // Adjusted slightly for smaller veins (was 24)
const VEIN_PLACEMENT_CHANCE = 0.6;// Chance to place ore at each step of vein spread (can adjust if needed)

// --- Cube Face Data ---
const CUBE_FACE_VERTICES = [ /* Vertex data... */ [1,0,1], [1,0,0], [1,1,0],  [1,0,1], [1,1,0], [1,1,1], [0,0,0], [0,0,1], [0,1,1],  [0,0,0], [0,1,1], [0,1,0], [0,1,1], [1,1,1], [1,1,0],  [0,1,1], [1,1,0], [0,1,0], [0,0,0], [1,0,0], [1,0,1],  [0,0,0], [1,0,1], [0,0,1], [0,0,1], [1,0,1], [1,1,1],  [0,0,1], [1,1,1], [0,1,1], [1,0,0], [0,0,0], [0,1,0],  [1,0,0], [0,1,0], [1,1,0], ];
const CUBE_FACE_NORMALS = [ /* Normal data... */ [ 1,0,0],[ 1,0,0],[ 1,0,0],[ 1,0,0],[ 1,0,0],[ 1,0,0], [-1,0,0],[-1,0,0],[-1,0,0],[-1,0,0],[-1,0,0],[-1,0,0], [ 0,1,0],[ 0,1,0],[ 0,1,0],[ 0,1,0],[ 0,1,0],[ 0,1,0], [ 0,-1,0],[ 0,-1,0],[ 0,-1,0],[ 0,-1,0],[ 0,-1,0],[ 0,-1,0], [ 0,0,1],[ 0,0,1],[ 0,0,1],[ 0,0,1],[ 0,0,1],[ 0,0,1], [ 0,0,-1],[ 0,0,-1],[ 0,0,-1],[ 0,0,-1],[ 0,0,-1],[ 0,0,-1], ];
const STANDARD_FACE_UVS = [ /* UV data... */ 0,0, 1,0, 1,1, 0,0, 1,1, 0,1 ];
const ROTATED_FACE_UVS = [ /* UV data... */ 0,1, 0,0, 1,0, 0,1, 1,0, 1,1 ];
const FACE_NAMES = ['right', 'left', 'top', 'bottom', 'front', 'back'];

// --- Helper Functions ---
let _blocks = null; // Reference to current chunk's block data

function getBlockLocal(x, y, z) {
    // Avoid accessing _blocks if it's null
    if (!_blocks || x < 0 || x >= CHUNK_SIZE_X || y < 0 || y >= CHUNK_SIZE_Y || z < 0 || z >= CHUNK_SIZE_Z) {
        return BLOCK.AIR;
    }
    const index = y * (CHUNK_SIZE_X * CHUNK_SIZE_Z) + z * CHUNK_SIZE_X + x;
    // Check index bounds
    if (index >= 0 && index < _blocks.length) {
        return _blocks[index];
    } else {
        return BLOCK.AIR;
    }
}

function setBlockLocal(x, y, z, type) {
     // Avoid accessing _blocks if it's null
     if (!_blocks || x < 0 || x >= CHUNK_SIZE_X || y < 0 || y >= CHUNK_SIZE_Y || z < 0 || z >= CHUNK_SIZE_Z) {
        return false;
    }
    const index = y * (CHUNK_SIZE_X * CHUNK_SIZE_Z) + z * CHUNK_SIZE_X + x;
     // Check index bounds
     if (index >= 0 && index < _blocks.length) {
        // --- Vein Protection: Don't overwrite existing ores with new veins ---
        const currentBlock = _blocks[index];
        // Allow overwriting basic terrain but not existing ores or special blocks (like crafting tables)
        const isOverwritable = [BLOCK.STONE, BLOCK.AIR, BLOCK.DIRT, BLOCK.GRASS].includes(currentBlock);
        if (!isOverwritable && type !== BLOCK.AIR) {
             return false;
        }
        // --- End Vein Protection ---

        _blocks[index] = type;
        return true;
    }
    return false;
}


function isSolid(x, y, z) {
    // Check within the current _blocks array
    const blockType = getBlockLocal(x, y, z);
    // Treat leaves and potentially other blocks as non-solid for AO calculation
    return ![BLOCK.AIR, BLOCK.LEAVES].includes(blockType);
}

// --- Ambient Occlusion Calculation ---
function calculateVertexAO(vertLocalX, vertLocalY, vertLocalZ, normalX, normalY, normalZ) {
    const vxInt = Math.floor(vertLocalX);
    const vyInt = Math.floor(vertLocalY);
    const vzInt = Math.floor(vertLocalZ);

    // Determine neighbor coordinates to check based on face normal
    let side1X = vxInt, side1Y = vyInt, side1Z = vzInt;
    let side2X = vxInt, side2Y = vyInt, side2Z = vzInt;
    let cornerX = vxInt, cornerY = vyInt, cornerZ = vzInt;

    const dx = vertLocalX - (vxInt + 0.5);
    const dy = vertLocalY - (vyInt + 0.5);
    const dz = vertLocalZ - (vzInt + 0.5);

    if (Math.abs(normalX) > 0.5) { // X face
        side1Y += dy > 0 ? 1 : -1; side2Z += dz > 0 ? 1 : -1; cornerY = side1Y; cornerZ = side2Z;
    } else if (Math.abs(normalY) > 0.5) { // Y face
        side1X += dx > 0 ? 1 : -1; side2Z += dz > 0 ? 1 : -1; cornerX = side1X; cornerZ = side2Z;
    } else { // Z face
        side1X += dx > 0 ? 1 : -1; side2Y += dy > 0 ? 1 : -1; cornerX = side1X; cornerY = side2Y;
    }

    // Check if the 3 determined neighbors are solid
    const side1Solid = isSolid(side1X, side1Y, side1Z);
    const side2Solid = isSolid(side2X, side2Y, side2Z);
    // Check corner only if both sides touching it are solid
    const cornerSolid = (side1Solid && side2Solid) ? isSolid(cornerX, cornerY, cornerZ) : false;


    // Calculate occlusion score
    let occlusion = 0;
    if (side1Solid) occlusion++;
    if (side2Solid) occlusion++;
    if (cornerSolid) occlusion++;

    // Return AO value based on score (Adjust these values for desired darkness)
    switch (occlusion) {
        case 3: return 0.5; // Strongest occlusion
        case 2: return 0.65;
        case 1: return 0.8;
        default: return 1.0; // Fully lit
    }
}
// --- End AO Calculation ---


// --- Deterministic Pseudo-Random Number Generation ---
// <<< UPDATED simpleHash to include Y coordinate >>>
function simpleHash(x, y, z, worldSeed = 0, salt = '') { // Added salt
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    let seed = Math.floor(worldSeed);

    // Incorporate salt into the seed calculation
    for (let i = 0; i < salt.length; i++) {
        seed = (seed * 31 + salt.charCodeAt(i)) | 0; // Basic hash mixing
    }

    // Combine coordinates and seed - using different primes
    let h = (x * 31 + y * 19 + z * 17 + seed * 41) & 0x7fffffff;
    // Apply hashing steps
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
}

function pseudoRandom(seed) {
  seed |= 0;
  seed = (seed + 0x6D2B79F5) | 0;
  var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // 0..1 range
}
// --- End PRNG ---

// --- Ore Generation Helpers ---
// Calculates probability multiplier based on Y level (triangular distribution)
function getYLevelProbability(currentY, minY, maxY, peakY) {
    if (currentY < minY || currentY > maxY) {
        return 0; // Outside spawn range
    }
    if (minY >= maxY) return 1.0; // Avoid division by zero if range is flat

    const peak = Math.max(minY, Math.min(maxY, peakY)); // Clamp peak within range

    if (currentY <= peak) {
        const rangeBelow = peak - minY;
        return rangeBelow > 0 ? (currentY - minY) / rangeBelow : 1.0; // Linear increase from min to peak
    } else { // currentY > peak
        const rangeAbove = maxY - peak;
        return rangeAbove > 0 ? 1.0 - ((currentY - peak) / rangeAbove) : 1.0; // Linear decrease from peak to max
    }
}

// --- VEIN GENERATION ---
function generateOreVein(startX, startY, startZ, oreType, worldSeed) {
    const veinSeed = simpleHash(startX, startY, startZ, worldSeed, `vein_${oreType}`);
    const targetVeinSize = VEIN_MIN_SIZE + Math.floor(pseudoRandom(veinSeed + 1) * (VEIN_MAX_SIZE - VEIN_MIN_SIZE + 1));
    let currentVeinSize = 0;

    let currentX = startX;
    let currentY = startY;
    let currentZ = startZ;

    // Use a simple random walk for vein shape
    for (let i = 0; i < VEIN_ITERATIONS && currentVeinSize < targetVeinSize; i++) {
        // Check and place ore at the current position if it's stone
        if (getBlockLocal(currentX, currentY, currentZ) === BLOCK.STONE) {
            if (setBlockLocal(currentX, currentY, currentZ, oreType)) {
                currentVeinSize++;
            }
        }

        // Move to a random adjacent block
        const moveSeed = veinSeed + i * 3; // Unique seed for each step
        const dir = Math.floor(pseudoRandom(moveSeed) * 6); // 0-5

        switch (dir) {
            case 0: currentX++; break;
            case 1: currentX--; break;
            case 2: currentY++; break;
            case 3: currentY--; break;
            case 4: currentZ++; break;
            case 5: currentZ--; break;
        }

        // Basic bounds check (keep walk roughly within chunk, simple approach)
        currentX = Math.max(0, Math.min(CHUNK_SIZE_X - 1, currentX));
        currentY = Math.max(0, Math.min(CHUNK_SIZE_Y - 1, currentY));
        currentZ = Math.max(0, Math.min(CHUNK_SIZE_Z - 1, currentZ));

        // Optional: Add a chance to not move, making veins denser
        // if (pseudoRandom(moveSeed + 1) < 0.2) { /* stay put */ }
    }
    // console.log(`WORKER: Generated vein of ${oreType} at ${startX},${startY},${startZ}, size: ${currentVeinSize}/${targetVeinSize}`);
}
// --- END VEIN GENERATION ---


// --- Worker Message Handler ---
self.onmessage = function(event) {
    const { type, payload } = event.data;
    // Extract worldSeed from payload for both generation and regeneration
    const { chunkX, chunkZ, blocksData, noiseData, worldSeed } = payload;

    if (type === 'generateChunk' || type === 'regenerateMesh') {
        let currentBlocks = null;
        let geometryGroups = null;
        let treeLocations = null;

        try {
            if (type === 'generateChunk') {
                 if (!noiseData) throw new Error("Missing noiseData for generateChunk");
                 const noiseArray = new Float32Array(noiseData);
                 // Pass worldSeed to generation
                 const generationResult = generateBlockData(chunkX, chunkZ, noiseArray, worldSeed);
                 if (!generationResult) throw new Error("generateBlockData returned null");
                 currentBlocks = generationResult.blocks;
                 treeLocations = generationResult.treeLocations;
            } else { // regenerateMesh
                 if (!blocksData) throw new Error("Missing blocksData for regenerateMesh");
                 currentBlocks = new Uint8Array(blocksData);
                 // When regenerating mesh only, we don't add new features like trees or ores
                 treeLocations = [];
            }

            if (!currentBlocks) throw new Error("Failed to get block data.");
            _blocks = currentBlocks; // Set global reference for meshing/AO

            // Only create geometry if there are non-air blocks
            let solidBlockCount = 0;
            for(let i = 0; i < currentBlocks.length; i++) { if(currentBlocks[i] !== BLOCK.AIR) { solidBlockCount++; break; } }

            if (solidBlockCount > 0) {
                 try {
                     geometryGroups = createGeometryGroupsWithAO(currentBlocks, chunkX, chunkZ);
                 } catch(e) {
                     console.error(`WORKER: Error during geometry creation for ${chunkX},${chunkZ}`, e);
                     geometryGroups = null; // Ensure null on error
                 }
            } else {
                geometryGroups = null; // No geometry for empty chunks
            }

            // Prepare data for transfer back to main thread
            const transferList = [];
            const blocksBuffer = currentBlocks?.buffer;
            if (blocksBuffer) {
                // Transfer block data back regardless of type, main thread expects it
                transferList.push(blocksBuffer);
             }
            if (geometryGroups) {
                 geometryGroups.forEach(group => {
                     // Transfer buffers if they exist
                     if (group.geometryData?.positions?.buffer) transferList.push(group.geometryData.positions.buffer);
                     if (group.geometryData?.normals?.buffer) transferList.push(group.geometryData.normals.buffer);
                     if (group.geometryData?.uvs?.buffer) transferList.push(group.geometryData.uvs.buffer);
                     if (group.geometryData?.colors?.buffer) transferList.push(group.geometryData.colors.buffer);
                 });
            }

            // Send result back
            self.postMessage({
                 type: 'chunkResult',
                 payload: {
                     chunkX, chunkZ,
                     blocksData: blocksBuffer || null, // Send back buffer only if exists
                     geometryGroups: geometryGroups,
                     treeLocations: treeLocations || [] // Send tree locations only on generateChunk
                 }
            }, transferList);

            _blocks = null; // Clear global reference

        } catch (e) {
            console.error(`WORKER: General error processing ${type} for ${chunkX},${chunkZ}`, e);
             // Send error result back
             self.postMessage({ type: 'chunkResult', payload: { chunkX, chunkZ, blocksData: null, geometryGroups: null, treeLocations: [] } });
             _blocks = null; // Ensure reference is cleared on error
        }
    } else {
        console.warn("WORKER: Received unknown message type:", type);
    }
};
// --- End Worker Message Handler ---


// --- Generation Logic ---
function generateBlockData(chunkX, chunkZ, noiseData, worldSeed = 0) {
    if (!noiseData || noiseData.length !== CHUNK_SIZE_X * CHUNK_SIZE_Z) {
        console.error("WORKER: Invalid noise data provided for terrain generation.");
        return null; // Indicate failure
    }
    const blocks = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z).fill(BLOCK.AIR);
    _blocks = blocks; // Set reference for helpers
    const treeLocations = [];
    let noiseIndex = 0;

    // 1. Generate Terrain Base
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            const noiseHeight = Math.floor(noiseData[noiseIndex++]);
            const topY = Math.min(CHUNK_SIZE_Y - 1, Math.max(0, noiseHeight));
            for (let y = topY; y >= 0; y--) {
                let blockType = BLOCK.STONE;
                if (y === noiseHeight) blockType = BLOCK.GRASS;
                else if (y >= noiseHeight - 3 && y < noiseHeight) blockType = BLOCK.DIRT;
                if (y === 0) blockType = BLOCK.STONE; // Bedrock equivalent (use a different ID if needed)
                setBlockLocal(x, y, z, blockType);
            }
        }
    }

    // <<< 1.5 Generate Ores (Vein Method) >>>
    // Parameters define Y-level distribution and rarity (lower baseProb = rarer)
    // Minecraft Y levels often have 64 added compared to the wiki (e.g., MC -59 is roughly our Y=5)
    const oreParams = [
        // Rarest first helps prevent denser veins overwriting rarer ones slightly
        { type: BLOCK.DIAMOND_ORE, minY: 0, maxY: 16 + 64, peakY: 5 + 64, baseProb: VEIN_ATTEMPT_CHANCE * 0.06 }, // Adjusted prob for vein attempt
        { type: BLOCK.EMERALD_ORE, minY: 48, maxY: 255, peakY: 236, baseProb: VEIN_ATTEMPT_CHANCE * 0.05 }, // Needs mountains biome check (not implemented)
        { type: BLOCK.LAPIS_ORE, minY: 0, maxY: 64 + 64, peakY: 0 + 64, baseProb: VEIN_ATTEMPT_CHANCE * 0.08 },
        { type: BLOCK.GOLD_ORE, minY: 0, maxY: 32 + 64, peakY: -16 + 64, baseProb: VEIN_ATTEMPT_CHANCE * 0.15 },
        { type: BLOCK.REDSTONE_ORE, minY: 0, maxY: 16 + 64, peakY: -59 + 64, baseProb: VEIN_ATTEMPT_CHANCE * 0.25 },
        { type: BLOCK.COPPER_ORE, minY: -16 + 64, maxY: 112 + 64, peakY: 48 + 64, baseProb: VEIN_ATTEMPT_CHANCE * 0.50 }, // Added Copper example
        { type: BLOCK.IRON_ORE, minY: 0, maxY: 255, peakY: 16 + 64, baseProb: VEIN_ATTEMPT_CHANCE * 0.60 },
        { type: BLOCK.COAL_ORE, minY: 0, maxY: 255, peakY: 96 + 64, baseProb: VEIN_ATTEMPT_CHANCE * 0.75 }, // Most common
    ];

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            for (let x = 0; x < CHUNK_SIZE_X; x++) {
                // Only check if the current block is stone
                if (getBlockLocal(x, y, z) === BLOCK.STONE) {
                    const worldX = chunkX * CHUNK_SIZE_X + x;
                    const worldY = y;
                    const worldZ = chunkZ * CHUNK_SIZE_Z + z;

                    // Use a hash for the vein *attempt* check
                    const attemptSeed = simpleHash(worldX, worldY, worldZ, worldSeed, 'vein_attempt');
                    const attemptRand = pseudoRandom(attemptSeed);

                    // Check each ore type based on rarity and Y-level
                    for (const ore of oreParams) {
                        // Calculate the probability multiplier for this Y level
                        const yProb = getYLevelProbability(worldY, ore.minY, ore.maxY, ore.peakY);
                        // Calculate the final probability *to attempt generating this ore type here*
                        const finalAttemptProb = ore.baseProb * yProb;

                        // If the random number falls within the attempt probability range
                        if (attemptRand < finalAttemptProb) {
                            // Start a vein!
                            generateOreVein(x, y, z, ore.type, worldSeed);
                            // IMPORTANT: Break *after* starting a vein.
                            // This prevents a single stone block from starting multiple veins of different types.
                            break;
                        }
                    }
                }
            }
        }
    }
    // <<< End Ore Generation >>>


    // 2. Determine Tree Locations (uses 2D hash for consistency)
    noiseIndex = 0; // Reset index for iterating noise data again
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
             const noiseHeight = Math.floor(noiseData[noiseIndex++]);
             const groundY = noiseHeight;
             // Check Y bounds before calling getBlockLocal
             if (groundY >= 0 && groundY < CHUNK_SIZE_Y) {
                 const groundBlock = getBlockLocal(x, groundY, z);
                 // Place trees only on grass and if there's enough vertical space
                 if (groundBlock === BLOCK.GRASS && (groundY + TREE_MIN_HEIGHT < CHUNK_SIZE_Y)) {
                     const worldX = chunkX * CHUNK_SIZE_X + x;
                     const worldZ = chunkZ * CHUNK_SIZE_Z + z;
                     // Use a 2D hash based on X, Z, and worldSeed for tree placement
                     // Using Y=0 ensures trees don't depend on the exact height of the column
                     const treeSeed = simpleHash(worldX, 0, worldZ, worldSeed, 'tree_placement'); // Added salt
                     const randomValue = pseudoRandom(treeSeed);
                     if (randomValue < TREE_PROBABILITY) {
                         // Store location for main thread to build later
                         treeLocations.push({ x: worldX, y: groundY + 1, z: worldZ });
                     }
                 }
             }
         }
     }

    _blocks = null; // Clear reference
    // Return object containing blocks and tree locations
    return { blocks, treeLocations };
}
// --- End Generation Logic ---


// --- Meshing Logic ---
function createGeometryGroupsWithAO(blocks, chunkX, chunkZ) {
    if (!blocks || !(blocks instanceof Uint8Array)) {
        console.error("WORKER: Missing or invalid 'blocks' array for meshing."); return null;
    }
    _blocks = blocks; // Set global reference
    const geometryDataMap = new Map();

     function getGeometryBuffers(materialKey) {
         if (!geometryDataMap.has(materialKey)) {
             geometryDataMap.set(materialKey, {
                 positions: [], normals: [], uvs: [], colors: []
             });
         }
         return geometryDataMap.get(materialKey);
     }

    // Iterate through blocks
    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            for (let x = 0; x < CHUNK_SIZE_X; x++) {
                const blockType = getBlockLocal(x, y, z);
                if (blockType === BLOCK.AIR) continue;

                const neighbors = [
                    getBlockLocal(x + 1, y, z), getBlockLocal(x - 1, y, z),
                    getBlockLocal(x, y + 1, z), getBlockLocal(x, y - 1, z),
                    getBlockLocal(x, y, z + 1), getBlockLocal(x, y, z - 1)
                ];

                // Iterate through faces
                for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
                    const neighborType = neighbors[faceIndex];

                    // Determine face visibility
                     const neighborIsTransparent = [BLOCK.AIR, BLOCK.LEAVES].includes(neighborType); // Add other transparent blocks here
                     const currentIsTransparent = [BLOCK.AIR, BLOCK.LEAVES].includes(blockType);
                     let renderFace = false;

                     if (neighborIsTransparent && !currentIsTransparent) renderFace = true;
                     else if (!neighborIsTransparent && currentIsTransparent) renderFace = true;
                     else if (neighborIsTransparent && currentIsTransparent && neighborType !== blockType) renderFace = true; // e.g. Air next to Leaves
                     else if (!neighborIsTransparent && !neighborIsTransparent) renderFace = false; // Solid next to Solid


                    if (renderFace) {
                        const faceName = FACE_NAMES[faceIndex];
                        let materialKey;

                        // Determine material key based on block type and face
                        // This uses the structure defined in ChunkManager's textureFiles
                        switch(blockType) {
                            case BLOCK.GRASS:
                                if (faceName === 'top') materialKey = `${BLOCK.GRASS}-top`;
                                else if (faceName === 'bottom') materialKey = `${BLOCK.GRASS}-bottom`; // ChunkManager resolves this to Dirt's material
                                else materialKey = `${BLOCK.GRASS}-side`;
                                break;
                            case BLOCK.LOG:
                                if (faceName === 'top' || faceName === 'bottom') materialKey = `${BLOCK.LOG}-top`;
                                else materialKey = `${BLOCK.LOG}-side`;
                                break;
                            case BLOCK.CRAFTING_TABLE: // Handle specific faces
                                 if (faceName === 'top') materialKey = `${BLOCK.CRAFTING_TABLE}-top`;
                                 else if (faceName === 'bottom') materialKey = `${BLOCK.CRAFTING_TABLE}-bottom`; // Use specific bottom key
                                 else if (faceName === 'front') materialKey = `${BLOCK.CRAFTING_TABLE}-front`; // Use specific front key
                                 else materialKey = `${BLOCK.CRAFTING_TABLE}-side`; // Use side key for back/left/right
                                break;
                            // Blocks with a single texture for all sides
                            case BLOCK.DIRT:
                            case BLOCK.STONE:
                            case BLOCK.LEAVES:
                            case BLOCK.COAL_ORE:
                            case BLOCK.IRON_ORE:
                            case BLOCK.GOLD_ORE:
                            case BLOCK.REDSTONE_ORE:
                            case BLOCK.LAPIS_ORE:
                            case BLOCK.DIAMOND_ORE:
                            case BLOCK.EMERALD_ORE:
                            case BLOCK.COPPER_ORE: // Add other 'all' texture blocks here
                                materialKey = `${blockType}-all`;
                                break;
                            default: // Fallback for unknown blocks
                                 console.warn(`WORKER: Unknown block type ${blockType} during meshing. Using stone key.`);
                                 materialKey = `${BLOCK.STONE}-all`;
                                 break;
                         }

                        const buffers = getGeometryBuffers(materialKey);
                        const vertexStartIndex = faceIndex * 6;

                        // Select UVs (includes log top/bottom rotation fix)
                        let faceUVs = STANDARD_FACE_UVS;
                        if (blockType === BLOCK.LOG && (faceName === 'top' || faceName === 'bottom')) {
                            faceUVs = ROTATED_FACE_UVS;
                        }
                        // Add specific UV handling for crafting table if needed (e.g., if side textures aren't square)

                        // Add face vertices, normals, UVs, and AO colors
                        for (let i = 0; i < 6; i++) {
                            const vertexIndex = vertexStartIndex + i;
                            const vertex = CUBE_FACE_VERTICES[vertexIndex];
                            const normal = CUBE_FACE_NORMALS[vertexIndex];
                            const vertChunkX = x + vertex[0];
                            const vertChunkY = y + vertex[1];
                            const vertChunkZ = z + vertex[2];

                            // Calculate Ambient Occlusion value for this vertex
                            const aoValue = calculateVertexAO(vertChunkX, vertChunkY, vertChunkZ, normal[0], normal[1], normal[2]);

                            buffers.positions.push(vertChunkX, vertChunkY, vertChunkZ);
                            buffers.normals.push(normal[0], normal[1], normal[2]);
                            buffers.uvs.push(faceUVs[i * 2], faceUVs[i * 2 + 1]);
                            buffers.colors.push(aoValue, aoValue, aoValue); // Use AO for vertex color tint
                        }
                    } // End if(renderFace)
                } // End face loop
            } // End x loop
        } // End z loop
    } // End y loop

    // Convert buffer arrays to TypedArrays
    const resultGroups = [];
    for (const [materialKey, buffers] of geometryDataMap.entries()) {
        if (buffers.positions.length > 0) {
            try {
                resultGroups.push({
                    materialKey: materialKey,
                    geometryData: {
                        positions: new Float32Array(buffers.positions),
                        normals: new Float32Array(buffers.normals),
                        uvs: new Float32Array(buffers.uvs),
                        colors: new Float32Array(buffers.colors)
                    }
                });
            } catch (e) {
                 console.error(`WORKER: Error creating Float32Arrays for material ${materialKey}`, e);
            }
        }
    }

    _blocks = null; // Clear global reference
    return resultGroups.length > 0 ? resultGroups : null;
}
// --- End Meshing Logic ---

// --- Worker Error Handling ---
self.onerror = function(error) {
    console.error("WORKER: Uncaught error:", error);
};
console.log("WORKER: Event listener set up.");