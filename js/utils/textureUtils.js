// js/utils/textureUtils.js
// Centralized place to get texture paths for blocks and items.

// Use direct numeric values matching the ENUMS
const CRAFTING_TABLE_ID = 14; // Use the ID defined in the BLOCK enum

const texturePaths = {
    // Blocks (Use numeric BLOCK IDs)
    1: 'textures/blocks/grass_side.png',    // GRASS
    2: 'textures/blocks/dirt.png',          // DIRT
    3: 'textures/blocks/stone.png',         // STONE
    4: 'textures/blocks/log_side.png',      // LOG
    5: 'textures/blocks/leaves.png',        // LEAVES
    6: 'textures/blocks/coal_ore.png',      // COAL_ORE
    7: 'textures/blocks/iron_ore.png',      // IRON_ORE
    8: 'textures/blocks/gold_ore.png',      // GOLD_ORE
    9: 'textures/blocks/redstone_ore.png',  // REDSTONE_ORE
    10: 'textures/blocks/lapis_ore.png',    // LAPIS_ORE
    11: 'textures/blocks/diamond_ore.png', // DIAMOND_ORE
    12: 'textures/blocks/emerald_ore.png', // EMERALD_ORE
    [CRAFTING_TABLE_ID]: 'textures/blocks/crafting_table_front.png', // CRAFTING_TABLE icon (ID 14)
    13: 'textures/blocks/copper_ore.png',   // COPPER_ORE (Add if texture exists)

    // Items (Use numeric ITEM IDs)
    1001: 'textures/items/stick.png',              // STICK
    1002: 'textures/items/wooden_pickaxe.png',    // WOODEN_PICKAXE
    1003: 'textures/blocks/oak_planks.png',        // OAK_PLANK (Using block texture)
};

/**
 * Gets the representative texture path for a given block or item ID.
 * Used primarily for Inventory/UI display.
 * @param {number} id - The BLOCK or ITEM ID (numeric value).
 * @returns {string|null} The texture path or null if not found.
 */
export function getTexturePathForBlockOrItem(id) {
    if (texturePaths.hasOwnProperty(id)) {
        return texturePaths[id];
    }
    // Fallback
    if (id < 1000) { // Basic check if it might be a block ID
       return texturePaths[3] || null; // Fallback to stone (ID 3)
    }
    return null; // No texture found
}