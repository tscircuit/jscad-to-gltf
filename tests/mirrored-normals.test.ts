import { describe, test, expect } from "bun:test"
import * as jscad from "@jscad/modeling"
import { convertJscadModelToGltf } from "../lib/index"
import { renderGLTFToPNGFromGLB } from "poppygl"

describe("mirrored geometry normals repro", () => {
  test("demonstrate inverted face normals bug on mirrored JSCAD geometries in glTF", async () => {
    // 1. Create a 10x10x10 cube centered at (0,0,0)
    const cube = jscad.primitives.cuboid({ size: [10, 10, 10] })

    // 2. Mirror the cube across the X axis (X -> -X)
    const mirroredCube = jscad.transforms.mirror({ normal: [1, 0, 0] }, cube)

    // 3. Convert the mirrored geometry to glTF
    const { data } = await convertJscadModelToGltf(
      {
        geometries: [{ geom: mirroredCube, color: "#ff0000" }],
      },
      { format: "gltf", prettyJson: true },
    )

    const gltf = JSON.parse(data as string)

    // 4. Extract raw vertex positions and normals from the base64 glTF buffer
    const base64Data = gltf.buffers[0].uri.replace(
      "data:application/octet-stream;base64,",
      "",
    )
    const buffer = Buffer.from(base64Data, "base64")

    const primitive = gltf.meshes[0].primitives[0]
    const posAccessor = gltf.accessors[primitive.attributes.POSITION]
    const normAccessor = gltf.accessors[primitive.attributes.NORMAL]

    const posBufferView = gltf.bufferViews[posAccessor.bufferView]
    const normBufferView = gltf.bufferViews[normAccessor.bufferView]

    const positions = new Float32Array(
      buffer.buffer,
      buffer.byteOffset + (posBufferView.byteOffset || 0),
      posAccessor.count * 3,
    )

    const normals = new Float32Array(
      buffer.buffer,
      buffer.byteOffset + (normBufferView.byteOffset || 0),
      normAccessor.count * 3,
    )

    // 5. Inspect the triangles of the +X face (where all 3 vertices have X = +5)
    let foundPlusXTriangles = 0
    for (let i = 0; i < positions.length; i += 9) {
      const v1x = positions[i]!
      const v2x = positions[i + 3]!
      const v3x = positions[i + 6]!

      const nx = normals[i]!
      const ny = normals[i + 1]!
      const nz = normals[i + 2]!

      if (
        Math.abs(v1x - 5) < 0.001 &&
        Math.abs(v2x - 5) < 0.001 &&
        Math.abs(v3x - 5) < 0.001
      ) {
        foundPlusXTriangles++
        // ⚠️ REPRODUCE BUG:
        // On the +X face, jscad-to-gltf exported normal is [-1, 0, 0] (INWARD) instead of [+1, 0, 0] (OUTWARD)!
        expect(nx).toBe(-1)
        expect(ny).toBe(0)
        expect(nz).toBe(0)
      }
    }

    expect(foundPlusXTriangles).toBe(2)
  })

  test("visual 3D snapshot showing hollow/culled front faces on mirrored L-shape geometry", async () => {
    const base = jscad.primitives.cuboid({
      size: [10, 4, 2],
      center: [0, 0, 1],
    })
    const post = jscad.primitives.cuboid({
      size: [2, 4, 8],
      center: [-4, 0, 4],
    })
    const unionModel = jscad.booleans.union(base, post)
    const mirroredModel = jscad.transforms.mirror(
      { normal: [1, 0, 0] },
      unionModel,
    )

    const glbResult = await convertJscadModelToGltf(
      { geometries: [{ geom: mirroredModel, color: "#ff2a45" }] },
      { format: "glb" },
    )

    expect(glbResult.format).toBe("glb")

    const png = await renderGLTFToPNGFromGLB(glbResult.data as ArrayBuffer, {
      width: 600,
      height: 600,
      backgroundColor: [1, 1, 1],
      cull: true,
      camPos: [15, -20, 15],
      lookAt: [0, 0, 3],
    })

    expect(png).toMatchPngSnapshot(import.meta.path)
  })
})
