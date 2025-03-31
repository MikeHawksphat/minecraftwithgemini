// js/world/Chunk.js
import * as THREE from 'three';
import NoiseGenerator from './Noise.js';

export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Y = 256; // Max world height
export const CHUNK_SIZE_Z = 16;

const BLOCK = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
};

const blockColors = {
    [BLOCK.GRASS]: new THREE.Color(0x00ff00),
    [BLOCK.DIRT]: new THREE.Color(0x8b4513),
    [BLOCK.STONE]: new THREE.Color(0x808080),
};

// --- DIAGNOSTIC CHANGE HERE ---
// Single material using vertex colors for the entire chunk mesh
const chunkMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true, // Enable vertex colors
    side: THREE.DoubleSide // <<< ADD THIS LINE TO RENDER BOTH SIDES
    // wireframe: true, // Optional: for debugging mesh generation
});
// --- END DIAGNOSTIC CHANGE ---


// --- Helper Data for Cube Faces ---
// (CUBE_FACE_VERTICES and CUBE_FACE_NORMALS remain the same)
const CUBE_FACE_VERTICES = [
  // +x face
  [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 1, 1], [1, 0, 1], [1, 0, 0],
  // -x face
  [0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 1, 0], [0, 0, 0], [0, 0, 1],
  // +y face
  [0, 1, 1], [1, 1, 1], [1, 1, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1],
  // -y face
  [0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 0, 1], [0, 0, 1], [0, 0, 0],
  // +z face
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1],
  // -z face
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0],
];

const CUBE_FACE_NORMALS = [
  // +x
  [ 1,  0,  0], [ 1,  0,  0], [ 1,  0,  0], [ 1,  0,  0], [ 1,  0,  0], [ 1,  0,  0],
  // -x
  [-1,  0,  0], [-1,  0,  0], [-1,  0,  0], [-1,  0,  0], [-1,  0,  0], [-1,  0,  0],
  // +y
  [ 0,  1,  0], [ 0,  1,  0], [ 0,  1,  0], [ 0,  1,  0], [ 0,  1,  0], [ 0,  1,  0],
  // -y
  [ 0, -1,  0], [ 0, -1,  0], [ 0, -1,  0], [ 0, -1,  0], [ 0, -1,  0], [ 0, -1,  0],
  // +z
  [ 0,  0,  1], [ 0,  0,  1], [ 0,  0,  1], [ 0,  0,  1], [ 0,  0,  1], [ 0,  0,  1],
  // -z
  [ 0,  0, -1], [ 0,  0, -1], [ 0,  0, -1], [ 0,  0, -1], [ 0,  0, -1], [ 0,  0, -1],
];


// --- Chunk Class ---
export class Chunk {
    // (Constructor remains the same)
     constructor(scene, chunkX, chunkZ) {
        this.scene = scene;
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.blocks = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z).fill(BLOCK.AIR);
        this.mesh = null;
        this.isGenerated = false;
    }


    // (getBlockIndex, getBlock, setBlock, getWorldCoords remain the same)
     getBlockIndex(localX, y, localZ) {
        if (y < 0 || y >= CHUNK_SIZE_Y) return -1;
        return y * (CHUNK_SIZE_X * CHUNK_SIZE_Z) + localZ * CHUNK_SIZE_X + localX;
    }

    getBlock(localX, y, localZ) {
        if (localX < 0 || localX >= CHUNK_SIZE_X ||
            localZ < 0 || localZ >= CHUNK_SIZE_Z ||
            y < 0 || y >= CHUNK_SIZE_Y ) {
            return BLOCK.AIR;
        }
        const index = this.getBlockIndex(localX, y, localZ);
        if (index === -1) { return BLOCK.AIR; }
        return this.blocks[index] || BLOCK.AIR;
    }

     setBlock(localX, y, localZ, type) {
         if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) {
            return;
         }
        const index = this.getBlockIndex(localX, y, localZ);
        if (index !== -1) {
            this.blocks[index] = type;
        }
    }

    getWorldCoords(localX, localZ) {
        return {
            x: this.chunkX * CHUNK_SIZE_X + localX,
            z: this.chunkZ * CHUNK_SIZE_Z + localZ,
        };
    }


    // (generate function remains the same)
     generate() {
        if (this.isGenerated) return;
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
            for (let z = 0; z < CHUNK_SIZE_Z; z++) {
                const worldCoords = this.getWorldCoords(x, z);
                const noiseHeight = Math.floor(NoiseGenerator.getHeight(worldCoords.x, worldCoords.z));
                const topY = Math.max(0, noiseHeight);
                for (let y = topY; y >= 0; y--) {
                     if (y >= CHUNK_SIZE_Y) continue;
                    let blockType = BLOCK.STONE;
                    if (y === noiseHeight) { blockType = BLOCK.GRASS; }
                     else if (y >= noiseHeight - 3) { blockType = BLOCK.DIRT; }
                    if (y === 0) { blockType = BLOCK.STONE; }
                     if (y < 3 && y < noiseHeight) {
                       if (y >= noiseHeight - 3) { blockType = BLOCK.DIRT; }
                       else { blockType = BLOCK.STONE; }
                    }
                     if (y === 0 && noiseHeight > 0) { blockType = BLOCK.STONE;}
                     else if (y === 0 && noiseHeight <= 0) { blockType = BLOCK.STONE;}
                    this.setBlock(x, y, z, blockType);
                }
            }
        }
        this.isGenerated = true;
    }


    // (createMesh function remains the same)
     createMesh() {
        if (this.mesh) { this.disposeMesh(); }
        if (!this.isGenerated) { this.generate(); }
        const positions = [];
        const normals = [];
        const colors = [];
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
            for (let z = 0; z < CHUNK_SIZE_Z; z++) {
                for (let x = 0; x < CHUNK_SIZE_X; x++) {
                    const blockType = this.getBlock(x, y, z);
                    if (blockType === BLOCK.AIR) continue;
                    const blockColor = blockColors[blockType] || new THREE.Color(0xff00ff);
                    const neighbors = [
                        this.getBlock(x + 1, y, z), this.getBlock(x - 1, y, z),
                        this.getBlock(x, y + 1, z), this.getBlock(x, y - 1, z),
                        this.getBlock(x, y, z + 1), this.getBlock(x, y, z - 1)
                    ];
                    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
                        if (neighbors[faceIndex] === BLOCK.AIR) {
                            const faceVertices = CUBE_FACE_VERTICES.slice(faceIndex * 6, faceIndex * 6 + 6);
                            const faceNormals = CUBE_FACE_NORMALS.slice(faceIndex * 6, faceIndex * 6 + 6);
                            for (let i = 0; i < 6; i++) {
                                const vertex = faceVertices[i];
                                const normal = faceNormals[i];
                                positions.push(vertex[0] + x, vertex[1] + y, vertex[2] + z);
                                normals.push(normal[0], normal[1], normal[2]);
                                colors.push(blockColor.r, blockColor.g, blockColor.b);
                            }
                        }
                    }
                }
            }
        }
        if (positions.length === 0) { this.mesh = null; return; }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();
        this.mesh = new THREE.Mesh(geometry, chunkMaterial); // Uses the updated material
        this.mesh.position.set(this.chunkX * CHUNK_SIZE_X, 0, this.chunkZ * CHUNK_SIZE_Z);
        this.scene.add(this.mesh);
    }


    // (disposeMesh and dispose remain the same)
     disposeMesh() {
        if (this.mesh) {
            if (this.mesh.geometry) { this.mesh.geometry.dispose(); }
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
    }
    dispose() {
        this.disposeMesh();
        this.blocks = null;
    }
}