// js/utils/FPScounter.js

export class FPSCounter {
    constructor() {
        // Find the existing element instead of creating it
        this.fpsElement = document.getElementById('fps-counter');

        if (!this.fpsElement) {
            console.error("FPS Counter element with ID 'fps-counter' not found in HTML!");
            // Prevent errors if element is missing
            this.update = () => {}; // Replace update with a no-op function
            return;
        }

        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.updateInterval = 500; // Update FPS display every 500ms
        this.lastUpdateTime = performance.now();
    }

    update() {
        // Check if element exists (it might be removed dynamically, though unlikely here)
        if (!this.fpsElement) return;

        const now = performance.now();
        const delta = now - this.lastFrameTime;
        this.lastFrameTime = now;
        this.frameCount++;

        if (now - this.lastUpdateTime > this.updateInterval) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastUpdateTime));
            this.fpsElement.textContent = `FPS: ${this.fps}`;
            this.frameCount = 0;
            this.lastUpdateTime = now;
        }
    }

    // Optional: Method to hide/show the counter
    setVisible(visible) {
        if (this.fpsElement) {
            this.fpsElement.style.display = visible ? 'block' : 'none';
        }
    }
}