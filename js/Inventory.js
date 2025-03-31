// js/Inventory.js
import { BLOCK } from './world/ChunkManager.js';
import { recipes, findRecipe, ITEM } from './CraftingRecipes.js'; // Import recipes and matching function
import { getTexturePathForBlockOrItem } from './utils/textureUtils.js'; // Import centralized helper

const MAX_STACK = 64;
const HOTBAR_SIZE = 9;
const INVENTORY_ROWS = 3;
const INVENTORY_COLS = 9;
const INVENTORY_SIZE = INVENTORY_ROWS * INVENTORY_COLS;
const CRAFTING_GRID_SIZE = 4; // 2x2

export class Inventory {
    constructor(world) {
        this.world = world;
        this.hotbarSlots = Array(HOTBAR_SIZE).fill(null);
        this.inventorySlots = Array(INVENTORY_SIZE).fill(null);
        this.craftingInputSlotsData = Array(CRAFTING_GRID_SIZE).fill(null); // Data for crafting grid
        this.craftingOutputSlotData = null; // Data for crafting output

        this.selectedSlotIndex = 0;
        this.maxStack = MAX_STACK;
        this.isInventoryOpen = false;
        this.heldItem = null; // { type: number, count: number }

        // DOM Elements
        this.hotbarElement = document.getElementById('hotbar');
        this.inventoryUIElement = document.getElementById('inventory-ui');
        this.inventoryGridElement = document.getElementById('inventory-grid');
        this.hotbarProxyElement = document.getElementById('hotbar-proxy');
        this.heldItemVisualElement = document.getElementById('held-item-visual');
        this.heldItemIconElement = this.heldItemVisualElement?.querySelector('.item-icon');
        this.heldItemCountElement = this.heldItemVisualElement?.querySelector('.item-count');

        // Crafting DOM Elements
        this.craftingGridInputElement = document.getElementById('crafting-grid-input');
        this.craftingOutputElement = document.getElementById('crafting-grid-output');
        this.craftingInputSlotElements = []; // Array of { slotDiv, iconDiv, countSpan }
        this.craftingOutputSlotElement = null; // Single { slotDiv, iconDiv, countSpan }

        this.hotbarSlotElements = [];
        this.inventorySlotElements = [];
        this.hotbarProxySlotElements = [];

        // Basic check for essential elements
        if (!this.hotbarElement || !this.inventoryUIElement || !this.inventoryGridElement || !this.hotbarProxyElement || !this.heldItemVisualElement || !this.craftingGridInputElement || !this.craftingOutputElement) {
            console.error("Inventory HTML elements not found! Inventory/Crafting will be broken.");
            // Disable updates if elements are missing
            this.updateHotbarDisplay = () => {};
            this.updateInventoryDisplay = () => {};
            this.updateCraftingGridDisplay = () => {};
            return;
        }

        this._createHotbarElements();
        this._createInventoryElements();
        this._createCraftingElements(); // Create crafting grid UI

        // Bind mouse move handler once
        this._boundUpdateHeldItemPosition = this._updateHeldItemPosition.bind(this);

        this.updateAllDisplays(); // Initial UI setup
        this._updateHeldItemVisual();
    }

    // --- Element Creation (with Click/Context Listeners) ---
    _createSlotElements(parentElement, size, elementArray, slotClass, slotType, startIndex = 0) {
        // Clear if reusing parent element (like for hotbar proxy)
        if (startIndex === 0) parentElement.innerHTML = '';
        elementArray.length = 0; // Clear target array

        for (let i = 0; i < size; i++) {
            const globalIndex = i + startIndex; // Actual index in the data array
            const slotDiv = document.createElement('div');
            slotDiv.classList.add('slot', slotClass);
            slotDiv.dataset.index = globalIndex; // Use global index for data lookup
            slotDiv.dataset.type = slotType;

            const iconDiv = document.createElement('div'); iconDiv.classList.add('item-icon');
            const countSpan = document.createElement('span'); countSpan.classList.add('item-count');
            slotDiv.appendChild(iconDiv); slotDiv.appendChild(countSpan);
            parentElement.appendChild(slotDiv);

            const slotElements = { slotDiv, iconDiv, countSpan };
            elementArray.push(slotElements);

            // Add Left Click Listener (for all interactive slots)
            slotDiv.addEventListener('click', (event) => {
                if (this.isInventoryOpen) {
                    this._handleSlotClick(event, slotType, globalIndex);
                }
            });

             // Add Right Click (Context Menu) Listener
             slotDiv.addEventListener('contextmenu', (event) => {
                 event.preventDefault(); // Prevent browser context menu
                 if (this.isInventoryOpen) {
                     this._handleSlotClick(event, slotType, globalIndex);
                 }
             });

            // Special listener for crafting output
             if (slotType === 'crafting_output') {
                slotDiv.removeEventListener('contextmenu', slotDiv.listeners?.contextmenu?.[0]); // Remove right-click for output
                // Overwrite left-click specifically for taking crafted items
                 slotDiv.removeEventListener('click', slotDiv.listeners?.click?.[0]);
                 slotDiv.addEventListener('click', (event) => {
                     if (this.isInventoryOpen) {
                        this._handleCraftingOutputClick();
                     }
                 });
                 this.craftingOutputSlotElement = slotElements; // Store reference
             }
        }
    }

    _createHotbarElements() {
        this._createSlotElements(this.hotbarElement, HOTBAR_SIZE, this.hotbarSlotElements, 'hotbar-slot', 'hotbar-display'); // Non-interactive display
        this._createSlotElements(this.hotbarProxyElement, HOTBAR_SIZE, this.hotbarProxySlotElements, 'hotbar-proxy-slot', 'hotbar'); // Interactive proxy
    }
    _createInventoryElements() {
        this._createSlotElements(this.inventoryGridElement, INVENTORY_SIZE, this.inventorySlotElements, 'inventory-slot', 'inventory');
    }
    _createCraftingElements() {
        this._createSlotElements(this.craftingGridInputElement, CRAFTING_GRID_SIZE, this.craftingInputSlotElements, 'crafting-input-slot', 'crafting_input');
        // Output slot (only one)
        this.craftingOutputElement.innerHTML = ''; // Clear previous if any
        this._createSlotElements(this.craftingOutputElement, 1, [], 'crafting-output-slot', 'crafting_output'); // Use temp array, store ref in listener setup
    }

    // --- Held Item Visual Logic ---
    _updateHeldItemVisual() {
        if (!this.heldItemVisualElement || !this.heldItemIconElement || !this.heldItemCountElement) return;

        if (this.heldItem) {
            const texturePath = getTexturePathForBlockOrItem(this.heldItem.type); // Use central util
            if (texturePath) {
                this.heldItemIconElement.style.backgroundImage = `url(${texturePath})`;
                this.heldItemIconElement.style.backgroundColor = '';
            } else {
                this.heldItemIconElement.style.backgroundImage = 'none';
                this.heldItemIconElement.style.backgroundColor = '#ff00ff'; // Error color
            }
            this.heldItemCountElement.textContent = this.heldItem.count > 1 ? this.heldItem.count : '';
            this.heldItemVisualElement.style.display = 'flex';
        } else {
            this.heldItemVisualElement.style.display = 'none';
        }
    }

    _updateHeldItemPosition(event) {
        if (this.heldItem && this.heldItemVisualElement) {
            const x = event.clientX - this.heldItemVisualElement.offsetWidth / 2;
            const y = event.clientY - this.heldItemVisualElement.offsetHeight / 2;
            this.heldItemVisualElement.style.left = `${x}px`;
            this.heldItemVisualElement.style.top = `${y}px`;
        }
    }

    // --- Slot Click Handling (Refactored for Right-Click) ---
    _handleSlotClick(event, slotType, index) {
        const isRightClick = event.button === 2;
        let clickedSlotArray;
        let isCraftingInput = false;

        // Determine which array holds the data for the clicked slot
        switch (slotType) {
            case 'hotbar':          clickedSlotArray = this.hotbarSlots; break;
            case 'inventory':       clickedSlotArray = this.inventorySlots; break;
            case 'crafting_input':  clickedSlotArray = this.craftingInputSlotsData; isCraftingInput = true; break;
            // crafting_output handled separately in _handleCraftingOutputClick
            default: console.warn("Unhandled slot type:", slotType); return;
        }

        let clickedSlotData = clickedSlotArray[index];

        // --- Logic ---
        if (this.heldItem) {
            // --- Right Click Logic (Placing One Item) ---
            if (isRightClick) {
                if (!clickedSlotData) { // Place one in empty slot
                    clickedSlotArray[index] = { type: this.heldItem.type, count: 1 };
                    this.heldItem.count--;
                } else if (clickedSlotData.type === this.heldItem.type && clickedSlotData.count < this.maxStack) { // Add one to existing stack
                    clickedSlotData.count++;
                    this.heldItem.count--;
                }
                // If stack is different type or full, do nothing on right click

                if (this.heldItem.count <= 0) {
                    this.heldItem = null; // Clear held item if stack depleted
                }
            }
            // --- Left Click Logic (Placing/Swapping Full Stack) ---
            else {
                if (!clickedSlotData) { // Place whole stack in empty slot
                    clickedSlotArray[index] = this.heldItem;
                    this.heldItem = null;
                } else if (clickedSlotData.type === this.heldItem.type && clickedSlotData.count < this.maxStack) { // Merge stacks
                    const canAccept = this.maxStack - clickedSlotData.count;
                    const toTransfer = Math.min(canAccept, this.heldItem.count);
                    clickedSlotData.count += toTransfer;
                    this.heldItem.count -= toTransfer;
                    if (this.heldItem.count <= 0) { this.heldItem = null; }
                } else { // Swap different items
                    const temp = clickedSlotArray[index];
                    clickedSlotArray[index] = this.heldItem;
                    this.heldItem = temp;
                }
            }
        } else if (clickedSlotData) { // Picking up item (Held item is null)
             // --- Right Click Logic (Picking Up Half) ---
             if (isRightClick) {
                const amountToTake = Math.ceil(clickedSlotData.count / 2);
                this.heldItem = { type: clickedSlotData.type, count: amountToTake };
                clickedSlotData.count -= amountToTake;
                if (clickedSlotData.count <= 0) {
                    clickedSlotArray[index] = null; // Clear slot if empty
                }
            }
            // --- Left Click Logic (Picking Up Full Stack) ---
            else {
                this.heldItem = clickedSlotData;
                clickedSlotArray[index] = null;
            }
        }

        // Update UI
        this.updateAllDisplays(); // Update everything including crafting grid potentially
        this._updateHeldItemVisual();

        // If crafting input changed, update recipe check
        if (isCraftingInput) {
            this._updateCraftingResult();
        }
    }

    // --- Crafting Logic ---
    _updateCraftingResult() {
        const currentRecipe = findRecipe(this.craftingInputSlotsData);
        if (currentRecipe) {
            this.craftingOutputSlotData = { type: currentRecipe.output.type, count: currentRecipe.output.count };
        } else {
            this.craftingOutputSlotData = null;
        }
        this.updateCraftingGridDisplay(); // Update visual of output slot
    }

     _handleCraftingOutputClick() {
        if (!this.craftingOutputSlotData) return; // Nothing to craft

        const outputItem = this.craftingOutputSlotData;
        const currentRecipe = findRecipe(this.craftingInputSlotsData); // Re-check recipe just in case

        if (!currentRecipe || currentRecipe.output.type !== outputItem.type) {
            console.error("Crafting output mismatch!");
            this.craftingOutputSlotData = null; // Clear invalid output
            this.updateCraftingGridDisplay();
            return;
        }

        // Check if held item can accept the output (or if it's null)
        if (this.heldItem && (this.heldItem.type !== outputItem.type || this.heldItem.count + outputItem.count > this.maxStack)) {
            return; // Cannot pick up - output slot is blocked by held item
        }

        // Consume ingredients
        // For shaped recipes, need to track which slots were used
        // For shapeless, just decrement counts based on recipe.ingredients array
        if (currentRecipe.type === 'shaped') {
             const size = Math.sqrt(this.craftingInputSlotsData.length); // Assume 2x2 or 3x3
             for (let y = 0; y < size; y++) {
                 for (let x = 0; x < size; x++) {
                    // This part needs careful implementation based on how normalized shape matches recipe shape
                    // For simplicity here, just decrement any slot that has an item
                    const index = y * size + x;
                     if (this.craftingInputSlotsData[index]) {
                         this.craftingInputSlotsData[index].count--;
                         if (this.craftingInputSlotsData[index].count <= 0) {
                             this.craftingInputSlotsData[index] = null;
                         }
                     }
                 }
             }
             // A more robust implementation would map the normalized grid back to original indices
             // or iterate through the recipe's ingredients.
        } else { // Shapeless
            for (const required of currentRecipe.ingredients) {
                let remainingToConsume = required.count;
                for (let i = 0; i < this.craftingInputSlotsData.length && remainingToConsume > 0; i++) {
                    const slot = this.craftingInputSlotsData[i];
                    if (slot && slot.type === required.type) {
                        const consumed = Math.min(remainingToConsume, slot.count);
                        slot.count -= consumed;
                        remainingToConsume -= consumed;
                        if (slot.count <= 0) {
                            this.craftingInputSlotsData[i] = null;
                        }
                    }
                }
            }
        }


        // Add output to held item (or create new held item)
        if (this.heldItem) {
            this.heldItem.count += outputItem.count;
        } else {
            this.heldItem = { type: outputItem.type, count: outputItem.count };
        }

        // Clear output slot data (visual update happens in updateAllDisplays)
        this.craftingOutputSlotData = null;

        // Update recipe check and UI
        this._updateCraftingResult(); // Check if new recipe is formed
        this.updateAllDisplays();
        this._updateHeldItemVisual();
    }


    // --- Item Management Logic ---
    _getBlockIconFaceName(blockType) { /* ... unchanged ... */ switch(blockType){case BLOCK.GRASS:return'top';case BLOCK.LOG:return'top';default:return'side';}}

    _updateSlotVisuals(slotUI, slotData, isSelected = false) {
         if (!slotUI) return;
         if (slotData) {
             const texturePath = getTexturePathForBlockOrItem(slotData.type); // Use central util
             if (texturePath) {
                 slotUI.iconDiv.style.backgroundImage = `url(${texturePath})`;
                 slotUI.iconDiv.style.backgroundColor = '';
             } else {
                 slotUI.iconDiv.style.backgroundImage = 'none';
                 slotUI.iconDiv.style.backgroundColor = '#ff00ff'; // Error color if texture missing
             }
             slotUI.countSpan.textContent = slotData.count > 1 ? slotData.count : '';
             slotUI.slotDiv.style.opacity = '1';
         } else {
             slotUI.iconDiv.style.backgroundImage = 'none';
             slotUI.iconDiv.style.backgroundColor = '';
             slotUI.countSpan.textContent = '';
             slotUI.slotDiv.style.opacity = '0.5'; // Make empty slots slightly transparent
         }

         // Handle hotbar selection highlight
         // Check if the slot is part of the hotbar display OR the hotbar proxy
         const isHotbar = slotUI.slotDiv.classList.contains('hotbar-slot') || slotUI.slotDiv.classList.contains('hotbar-proxy-slot');
          if (isHotbar) {
             // Check if the DATA index matches the selected index
             const slotIndex = parseInt(slotUI.slotDiv.dataset.index); // Assumes dataset.index is set correctly
             if (isSelected && slotIndex === this.selectedSlotIndex) {
                  slotUI.slotDiv.classList.add('selected');
             } else {
                  slotUI.slotDiv.classList.remove('selected');
             }
         }
     }

    updateHotbarDisplay() {
        if (!this.hotbarSlotElements || !this.hotbarProxySlotElements || this.hotbarSlotElements.length !== HOTBAR_SIZE || this.hotbarProxySlotElements.length !== HOTBAR_SIZE) return;
        for (let i = 0; i < HOTBAR_SIZE; i++) {
            const slotData = this.hotbarSlots[i];
            const isSelected = (i === this.selectedSlotIndex);
            this._updateSlotVisuals(this.hotbarSlotElements[i], slotData, isSelected); // Update gameplay hotbar
            this._updateSlotVisuals(this.hotbarProxySlotElements[i], slotData, isSelected); // Update inventory proxy hotbar
        }
    }
    updateInventoryDisplay() {
        if (!this.inventorySlotElements || this.inventorySlotElements.length !== INVENTORY_SIZE) return;
        for (let i = 0; i < INVENTORY_SIZE; i++) {
            this._updateSlotVisuals(this.inventorySlotElements[i], this.inventorySlots[i]);
        }
    }
    updateCraftingGridDisplay() {
        // Update input grid
        if (!this.craftingInputSlotElements || this.craftingInputSlotElements.length !== CRAFTING_GRID_SIZE) return;
        for (let i = 0; i < CRAFTING_GRID_SIZE; i++) {
            this._updateSlotVisuals(this.craftingInputSlotElements[i], this.craftingInputSlotsData[i]);
        }
        // Update output slot
        if (!this.craftingOutputSlotElement) return;
        this._updateSlotVisuals(this.craftingOutputSlotElement, this.craftingOutputSlotData);
    }

    updateAllDisplays() {
        this.updateHotbarDisplay();
        this.updateInventoryDisplay();
        this.updateCraftingGridDisplay();
    }


    // --- Add/Remove Items ---
    /**
     * Attempts to add an item (block or item type) to the inventory.
     * Prioritizes stacking in hotbar, then inventory. Finds first empty slot otherwise.
     * @param {number} itemType - BLOCK or ITEM constant.
     * @param {number} count - Number of items to add (default: 1).
     * @returns {boolean} True if the entire count was added successfully, false otherwise.
     */
    addItem(itemType, count = 1) {
        if (itemType === BLOCK.AIR || count <= 0) return false;

        let remainingCount = count;

        // 1. Try stacking in Hotbar
        for (let i = 0; i < HOTBAR_SIZE && remainingCount > 0; i++) {
            const slot = this.hotbarSlots[i];
            if (slot && slot.type === itemType && slot.count < this.maxStack) {
                const canAccept = this.maxStack - slot.count;
                const toAdd = Math.min(canAccept, remainingCount);
                slot.count += toAdd;
                remainingCount -= toAdd;
            }
        }

        // 2. Try stacking in Inventory
        for (let i = 0; i < INVENTORY_SIZE && remainingCount > 0; i++) {
            const slot = this.inventorySlots[i];
            if (slot && slot.type === itemType && slot.count < this.maxStack) {
                const canAccept = this.maxStack - slot.count;
                const toAdd = Math.min(canAccept, remainingCount);
                slot.count += toAdd;
                remainingCount -= toAdd;
            }
        }

        // 3. Find empty slot in Hotbar
        for (let i = 0; i < HOTBAR_SIZE && remainingCount > 0; i++) {
            if (!this.hotbarSlots[i]) {
                const toAdd = Math.min(this.maxStack, remainingCount);
                this.hotbarSlots[i] = { type: itemType, count: toAdd };
                remainingCount -= toAdd;
            }
        }

        // 4. Find empty slot in Inventory
        for (let i = 0; i < INVENTORY_SIZE && remainingCount > 0; i++) {
            if (!this.inventorySlots[i]) {
                const toAdd = Math.min(this.maxStack, remainingCount);
                this.inventorySlots[i] = { type: itemType, count: toAdd };
                remainingCount -= toAdd;
            }
        }

        this.updateAllDisplays(); // Update UI after potential changes

        if (remainingCount > 0) {
            console.log(`Inventory full! Could not add ${remainingCount} of ${this._getItemName(itemType)}.`);
            return false; // Not all items were added
        }
        return true; // All items added successfully
    }


    /**
     * Removes one item from the specified hotbar slot index.
     * @param {number} slotIndex - The index in the hotbar (0-8).
     * @returns {boolean} True if an item was removed, false otherwise.
     */
    removeItem(slotIndex) {
        if (slotIndex < 0 || slotIndex >= HOTBAR_SIZE) return false;

        const slot = this.hotbarSlots[slotIndex];
        if (slot && slot.count > 0) {
            slot.count--;
            if (slot.count <= 0) {
                this.hotbarSlots[slotIndex] = null; // Clear slot if empty
            }
            this.updateHotbarDisplay();
            return true;
        }
        return false;
    }

    getSelectedItem() {
        return this.hotbarSlots[this.selectedSlotIndex];
    }
    getSelectedBlockType() { // Keep this for placing blocks
        const item = this.getSelectedItem();
        // Only return if the item type corresponds to a placeable block ID
        // This prevents trying to place "Items" like sticks
        if (item && Object.values(BLOCK).includes(item.type)) {
             return item.type;
        }
        return null; // Not a placeable block or slot empty
    }

    setSelectedSlot(index) {
        if (index >= 0 && index < HOTBAR_SIZE) {
            this.selectedSlotIndex = index;
            this.updateHotbarDisplay();
        }
    }

    // --- Toggle Inventory ---
    toggleInventoryDisplay() {
        this.isInventoryOpen = !this.isInventoryOpen;
        if (this.inventoryUIElement) {
            if (this.isInventoryOpen) {
                this.inventoryUIElement.classList.add('inventory-visible');
                this.updateAllDisplays(); // Refresh all relevant UI parts
                document.addEventListener('mousemove', this._boundUpdateHeldItemPosition);
            } else {
                this.inventoryUIElement.classList.remove('inventory-visible');
                document.removeEventListener('mousemove', this._boundUpdateHeldItemPosition);
                // --- Return held item and clear crafting grid on close ---
                if (this.heldItem) {
                    const added = this.addItem(this.heldItem.type, this.heldItem.count); // Try adding back
                    if (!added) {
                        console.warn("Could not place held item back on inventory close. Item lost!");
                         // Ideally, drop the item in the world here
                    }
                    this.heldItem = null;
                    this._updateHeldItemVisual();
                }
                // Return crafting grid items
                for (let i = 0; i < this.craftingInputSlotsData.length; i++) {
                     if (this.craftingInputSlotsData[i]) {
                         const added = this.addItem(this.craftingInputSlotsData[i].type, this.craftingInputSlotsData[i].count);
                         if (!added) {
                             console.warn(`Could not return crafting item ${this._getItemName(this.craftingInputSlotsData[i].type)} on close. Lost!`);
                             // Ideally, drop item
                         }
                         this.craftingInputSlotsData[i] = null;
                     }
                 }
                 this.craftingOutputSlotData = null; // Clear output too
                 this.updateCraftingGridDisplay(); // Update display after clearing
                 // --- End Return/Clear ---
            }
        }
        return this.isInventoryOpen;
    }

    // Helper to get a display name (replace with better mapping if needed)
    _getItemName(itemType) {
        const blockName = Object.keys(BLOCK).find(key => BLOCK[key] === itemType);
        if (blockName) return blockName;
        const itemName = Object.keys(ITEM).find(key => ITEM[key] === itemType);
        if (itemName) return itemName;
        return `Unknown (${itemType})`;
    }
}