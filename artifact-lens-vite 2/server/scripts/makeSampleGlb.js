// Generates a small valid GLB (procedural lathe urn) for testing the 3D pipeline
// without requiring the Hunyuan3D engine. Usage: node server/scripts/makeSampleGlb.js [outPath]
const fs = require('fs');
const path = require('path');

function buildUrn() {
  // Lathe profile (radius, height) of a small urn.
  const profile = [
    [0.0, 0.0],
    [0.32, 0.0],
    [0.38, 0.06],
    [0.42, 0.25],
    [0.36, 0.55],
    [0.22, 0.75],
    [0.2, 0.9],
    [0.26, 1.0],
    [0.28, 1.06],
  ];
  const SEG = 24;
  const positions = [];
  const normals = [];
  const indices = [];
  const ringStart = [];
  for (let i = 0; i < profile.length; i += 1) {
    ringStart.push(positions.length / 3);
    const [r, y] = profile[i];
    // Profile tangent for an approximate normal.
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(profile.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // Outward normal perpendicular to tangent in the profile plane.
    const nx = ty;
    const ny = -tx;
    for (let s = 0; s <= SEG; s += 1) {
      const a = (s / SEG) * Math.PI * 2;
      const cx = Math.cos(a);
      const sx = Math.sin(a);
      positions.push(r * cx, y, r * sx);
      const nl = Math.hypot(nx, ny) || 1;
      normals.push((nx / nl) * cx, ny / nl, (nx / nl) * sx);
    }
  }
  for (let i = 0; i < profile.length - 1; i += 1) {
    for (let s = 0; s < SEG; s += 1) {
      const a = ringStart[i] + s;
      const b = ringStart[i] + s + 1;
      const c = ringStart[i + 1] + s;
      const d = ringStart[i + 1] + s + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

function buildGlb() {
  const { positions, normals, indices } = buildUrn();
  const posBytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const normBytes = Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength);
  const idxBytes = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);
  const bin = Buffer.concat([posBytes, normBytes, idxBytes]);

  const gltf = {
    asset: { version: '2.0', generator: 'artifact-lens-sample' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'urn-clay',
        pbrMetallicRoughness: { baseColorFactor: [0.85, 0.64, 0.25, 1.0], metallicFactor: 0.1, roughnessFactor: 0.7 },
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', max: [0.42, 1.06, 0.42], min: [-0.42, 0.0, -0.42] },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: normBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length + normBytes.length, byteLength: idxBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  const jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); // 'glTF'
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let o = 12;
  out.writeUInt32LE(jsonChunk.length, o);
  out.writeUInt32LE(0x4e4f534a, o + 4); // 'JSON'
  jsonChunk.copy(out, o + 8);
  o += 8 + jsonChunk.length;
  out.writeUInt32LE(bin.length, o);
  out.writeUInt32LE(0x004e4942, o + 4); // 'BIN\0'
  bin.copy(out, o + 8);
  return out;
}

function validateGlb(buf) {
  if (buf.slice(0, 4).toString('ascii') !== 'glTF') throw new Error('bad magic');
  if (buf.readUInt32LE(4) !== 2) throw new Error('bad version');
  const total = buf.readUInt32LE(8);
  if (total !== buf.length) throw new Error('length mismatch');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8').trim());
  if (!json.meshes || !json.accessors || json.accessors.length !== 3) throw new Error('bad mesh');
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const binStart = 20 + jsonLen + 8;
  if (binStart + binLen !== total) throw new Error('bin mismatch');
  const idxCount = json.accessors[2].count;
  const idxOff = binStart + json.bufferViews[2].byteOffset;
  let maxIdx = 0;
  for (let i = 0; i < idxCount; i += 1) {
    const v = buf.readUInt16LE(idxOff + i * 2);
    if (v > maxIdx) maxIdx = v;
  }
  if (maxIdx >= json.accessors[0].count) throw new Error('index out of range');
  return { vertices: json.accessors[0].count, triangles: idxCount / 3 };
}

if (require.main === module) {
  const outPath = process.argv[2] || path.join(__dirname, '..', '..', 'storage', 'models', 'sample.glb');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const glb = buildGlb();
  fs.writeFileSync(outPath, glb);
  const info = validateGlb(glb);
  console.log(`[sample-glb] wrote ${outPath} (${glb.length} bytes, ${info.vertices} verts, ${info.triangles} tris) — valid GLB`);
}

module.exports = { buildGlb, validateGlb };
