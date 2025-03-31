// js/CraftingRecipes.js
import { BLOCK } from './world/ChunkManager.js';

// Define ITEM constants (Using > 1000 to distinguish from blocks)
export const ITEM = {
    STICK: 1001,
    WOODEN_PICKAXE: 1002,
    OAK_PLANK: 1003, // Item representation of Oak Planks
    // No separate item for Crafting Table, use BLOCK.CRAFTING_TABLE ID (14)
};

// --- Recipes ---
// Using direct numeric IDs matching the BLOCK and ITEM enums
export const recipes = [
    // Shapeless: Log (4) -> 4 Oak Planks (1003)
    { type: 'shapeless', output: { type: 1003, count: 4 }, ingredients: [ { type: 4 /* BLOCK.LOG */, count: 1 } ] },

    // Shaped 2x2: 2 Oak Planks (1003) -> 4 Sticks (1001)
    { type: 'shaped', output: { type: 1001, count: 4 }, shape: [ ' P', ' P' ], ingredients: { 'P': 1003 /* ITEM.OAK_PLANK */ } },
    { type: 'shaped', output: { type: 1001, count: 4 }, shape: [ 'P ', 'P ' ], ingredients: { 'P': 1003 /* ITEM.OAK_PLANK */ } },

    // Shaped 2x2: 4 Oak Planks (1003) -> 1 Crafting Table (14)
    { type: 'shaped', output: { type: 14 /* BLOCK.CRAFTING_TABLE */, count: 1 }, shape: [ 'PP', 'PP' ], ingredients: { 'P': 1003 /* ITEM.OAK_PLANK */ } },

    // Shaped 3x3 (Placeholder - requires 3x3 grid)
    // { type: 'shaped', output: { type: 1002 /* ITEM.WOODEN_PICKAXE */, count: 1 }, shape: [ 'PPP', ' S ', ' S ' ], ingredients: { 'P': 1003 /* ITEM.OAK_PLANK */, 'S': 1001 /* ITEM.STICK */ } }
];

// --- Recipe Matching Logic ---

// ... (normalizeGrid, matchesShapedRecipe, matchesShapelessRecipe functions remain the same) ...
function normalizeGrid(grid, isShaped) {
    if (isShaped) {
        const size = Math.sqrt(grid.length);
        if (size !== 2 && size !== 3) return null; // Only support 2x2 or 3x3

        let minX = size, minY = size, maxX = -1, maxY = -1;
        const items = [];

        // Find bounds and store items with relative positions
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const item = grid[y * size + x];
                if (item) {
                    items.push({ x, y, type: item.type });
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        if (items.length === 0) return null; // Empty grid

        // Create compact grid based on bounds
        const normalized = [];
        const height = maxY - minY + 1;
        const width = maxX - minX + 1;

        for (let y = 0; y < height; y++) {
            let row = '';
            for (let x = 0; x < width; x++) {
                 const foundItem = items.find(item => item.x === minX + x && item.y === minY + y);
                 // Use numeric type directly in placeholder for easier matching later
                 row += foundItem ? `T${foundItem.type}` : ' ';
            }
            normalized.push(row);
        }
        // console.log("Normalized Shaped:", normalized);
        return { shape: normalized, width, height };

    } else { // Shapeless
        const itemCounts = {};
        let itemCount = 0;
        for (const item of grid) {
            if (item) {
                itemCounts[item.type] = (itemCounts[item.type] || 0) + 1;
                itemCount++;
            }
        }
        // console.log("Normalized Shapeless:", itemCounts);
        return itemCount > 0 ? itemCounts : null;
    }
}

function matchesShapedRecipe(normalizedGrid, recipe) {
    if (!normalizedGrid || !recipe.shape) return false;

    const gridShape = normalizedGrid.shape;
    const recipeShape = recipe.shape;

    // Check dimensions first
    if (gridShape.length !== recipeShape.length || normalizedGrid.width !== recipeShape[0].length) {
         // console.log("Shape mismatch: Grid H/W", gridShape.length, normalizedGrid.width, "Recipe H/W", recipeShape.length, recipeShape[0].length);
        return false;
    }

    // Compare row by row, character by character
    for (let y = 0; y < gridShape.length; y++) {
        for (let x = 0; x < gridShape[y].length; x++) {
            const gridCharPlaceholder = gridShape[y][x]; // e.g., 'T1003' or ' '
            const recipeChar = recipeShape[y][x];       // e.g., 'P' or ' '

            if (gridCharPlaceholder === ' ' && recipeChar === ' ') continue; // Both empty, ok
            if (gridCharPlaceholder === ' ' || recipeChar === ' ') return false; // One empty, one not, fail

            // recipe.ingredients uses numeric IDs directly now
            const requiredType = recipe.ingredients[recipeChar];
            const gridType = parseInt(gridCharPlaceholder.substring(1)); // Extract type from 'T{type}'

            if (requiredType === undefined || gridType !== requiredType) { // Check requiredType exists
                // console.log(`Type mismatch at ${x},${y}: Grid has T${gridType}, Recipe needs ${recipeChar}(${requiredType})`);
                return false; // Ingredient type doesn't match
            }
        }
    }
    // console.log("Shaped Match Found!");
    return true; // All elements matched
}

function matchesShapelessRecipe(normalizedGridCounts, recipe) {
    if (!normalizedGridCounts || !recipe.ingredients) return false;

    // Count required ingredients in the recipe (uses numeric IDs)
    const requiredCounts = {};
    let requiredTotalItems = 0;
    for (const req of recipe.ingredients) {
        requiredCounts[req.type] = (requiredCounts[req.type] || 0) + req.count;
        requiredTotalItems += req.count;
    }

    // Count items in the grid
    let gridTotalItems = 0;
    for (const type in normalizedGridCounts) {
        gridTotalItems += normalizedGridCounts[type];
    }

    // Check if total item counts match
    if (gridTotalItems !== requiredTotalItems) return false;

    // Check if counts for each required type match
    for (const type in requiredCounts) {
        // Use == because keys in normalizedGridCounts might be strings
        if (normalizedGridCounts[type] != requiredCounts[type]) {
            return false; // Mismatch in count for a specific type
        }
    }
     // Also check if the grid contains extra items not in the recipe
     for (const type in normalizedGridCounts) {
         if (!requiredCounts.hasOwnProperty(type)) {
             return false; // Grid has an item not required by the recipe
         }
     }
    // console.log("Shapeless Match Found!");
    return true; // All counts match
}


/**
 * Finds a matching recipe for the current crafting grid state.
 * @param {Array<object|null>} grid - The items in the crafting input grid (e.g., 4 items for 2x2).
 * @returns {object|null} The matching recipe object or null if no match.
 */
export function findRecipe(grid) {
    // console.log("Finding recipe for grid:", grid);
    if (!grid || grid.length === 0 || grid.every(slot => !slot)) {
        return null; // Grid is empty
    }

    // Try matching shaped recipes first
    const normalizedShaped = normalizeGrid(grid, true);
    for (const recipe of recipes) {
        if (recipe.type === 'shaped') {
            if (matchesShapedRecipe(normalizedShaped, recipe)) {
                // console.log("Matched shaped recipe:", recipe);
                return recipe;
            }
        }
    }

    // Try matching shapeless recipes
    const normalizedShapeless = normalizeGrid(grid, false);
     for (const recipe of recipes) {
        if (recipe.type === 'shapeless') {
            if (matchesShapelessRecipe(normalizedShapeless, recipe)) {
                 // console.log("Matched shapeless recipe:", recipe);
                 return recipe;
            }
        }
    }

    // console.log("No recipe matched.");
    return null; // No recipe found
}