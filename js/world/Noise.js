// js/world/Noise.js

// Assumes simplex-noise.js has been loaded globally or you adjust import if using modules
const simplex = new SimplexNoise(); // Or however the library initializes

const NoiseGenerator = {
    // <<< UPDATED PARAMETERS for smoother terrain >>>
    scale: 100,         // Increased scale for broader features (was 60)
    octaves: 4,         // Keeping octaves the same for now
    persistence: 0.45,  // Decreased persistence to reduce high-frequency noise (was 0.5)
    lacunarity: 2.0,    // Keeping lacunarity the same

    heightScale: 10,    // Keeping height variation the same (was 10)
    groundOffset: 50,   // Keeping baseline the same (was 50)
    // <<< END UPDATED PARAMETERS >>>


    /**
     * Get the terrain height at a specific world (x, z) coordinate.
     * Uses multiple layers (octaves) of noise for more detail.
     * @param {number} x World X coordinate
     * @param {number} z World Z coordinate
     * @returns {number} World Y coordinate (height)
     */
    getHeight(x, z) {
        let total = 0;
        let frequency = 1.0 / this.scale;
        let amplitude = 1.0;
        let maxValue = 0; // Used for normalization to keep height range consistent

        for (let i = 0; i < this.octaves; i++) {
            // Ensure the simplex noise function is available
            if (typeof simplex?.noise2D === 'function') {
                total += simplex.noise2D(x * frequency, z * frequency) * amplitude;
            } else {
                // Fallback or error handling if noise function is missing
                console.error("Simplex noise function 'noise2D' not found!");
                return this.groundOffset; // Return base height on error
            }

            maxValue += amplitude;
            amplitude *= this.persistence; // Apply persistence for next octave
            frequency *= this.lacunarity; // Increase frequency for next octave
        }

        // Normalize the total noise value to be between roughly -1 and 1
        // Avoid division by zero if maxValue is 0 (e.g., octaves = 0 or persistence = 0)
        const normalizedHeight = maxValue === 0 ? 0 : total / maxValue;

        // Apply overall height scaling and offset
        return normalizedHeight * this.heightScale + this.groundOffset;
    }
};

export default NoiseGenerator;