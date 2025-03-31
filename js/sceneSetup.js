// js/sceneSetup.js
import * as THREE from 'three';
import NoiseGenerator from './world/Noise.js';

export function setupScene(canvas) {
    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x87CEEB); // Sky blue

    // --- Color Space and Tone Mapping ---
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Add Tone Mapping
    renderer.toneMappingExposure = 1.0; // Default exposure, can be adjusted
    // ---

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(
        80, // Field of view
        window.innerWidth / window.innerHeight, // Aspect ratio
        0.1, // Near clipping plane
        2000 // Far clipping plane (adjust based on render distance)
    );
    const startX = 8;
    const startZ = 8;
    camera.position.set(startX, NoiseGenerator.getHeight(startX, startZ) + 10, startZ);

    // Lighting
    // --- Keep Ambient Light Low ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Keep low (was 0.3)
    scene.add(ambientLight);
    // ---

    // --- Increase Directional Light slightly ---
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Increase back towards original (was 0.6, originally 0.8)
    directionalLight.position.set(50, 80, 30);
    // Optional: Add shadows (more performance cost)
    // directionalLight.castShadow = true;
    // renderer.shadowMap.enabled = true;
    scene.add(directionalLight);
    scene.add(directionalLight.target);
    // ---

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { renderer, scene, camera };
}