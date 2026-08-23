import { describe, test, expect } from "bun:test"
import * as jscad from "@jscad/modeling"
import { convertJscadModelToGltf } from "../lib/index"
import { renderGLTFToPNGFromGLB } from "poppygl"

describe("mirrored geometry normals", () => {
  test("reproduce inverted face normals bug on mirrored JSCAD geometries in glTF", async () => {
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
        // Correct outward-facing normal on +X face MUST be [+1, 0, 0]
        expect(nx).toBe(1)
        expect(ny).toBe(0)
        expect(nz).toBe(0)
      }
    }

    expect(foundPlusXTriangles).toBe(2)
  })

  test("visual 3D snapshot of mirrored L-shape geometry", async () => {
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

  test("mirror BEFORE union: reflected piece keeps correct outward normal after boolean op", async () => {
    // Cube A will be mirrored, then unioned with B — the ordering your
    // existing tests don't cover (both existing tests union first, mirror second).
    const cubeA = jscad.primitives.cuboid({ size: [4, 4, 4], center: [-8, 0, 0] }) // spans x:[-10,-6]
    const mirroredA = jscad.transforms.mirror({ normal: [1, 0, 0] }, cubeA)        // spans x:[6,10]
    const cubeB = jscad.primitives.cuboid({ size: [4, 4, 4], center: [0, 0, 0] })  // spans x:[-2,2], disjoint
    const unionModel = jscad.booleans.union(mirroredA, cubeB)

    const { data } = await convertJscadModelToGltf(
      { geometries: [{ geom: unionModel, color: "#00ff00" }] },
      { format: "gltf", prettyJson: true },
    )
    const gltf = JSON.parse(data as string)
    const base64Data = gltf.buffers[0].uri.replace("data:application/octet-stream;base64,", "")
    const buffer = Buffer.from(base64Data, "base64")
    const primitive = gltf.meshes[0].primitives[0]
    const posAcc = gltf.accessors[primitive.attributes.POSITION]
    const normAcc = gltf.accessors[primitive.attributes.NORMAL]
    const positions = new Float32Array(buffer.buffer, buffer.byteOffset + gltf.bufferViews[posAcc.bufferView].byteOffset, posAcc.count * 3)
    const normals = new Float32Array(buffer.buffer, buffer.byteOffset + gltf.bufferViews[normAcc.bufferView].byteOffset, normAcc.count * 3)

    // The face at x=10 is mirroredA's original -X face — after union, its
    // outward normal MUST still be [+1,0,0]. If the union baked the mirror
    // without correcting winding, this comes back [-1,0,0] instead.
    let checked = 0
    for (let i = 0; i < positions.length; i += 9) {
      if ([0, 3, 6].every(o => Math.abs(positions[i + o]! - 10) < 0.001)) {
        checked++
        expect(normals[i]!).toBeCloseTo(1, 2)
        expect(normals[i + 1]!).toBeCloseTo(0, 2)
        expect(normals[i + 2]!).toBeCloseTo(0, 2)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  test("visual 3D snapshot side-by-side: unmirrored reference vs mirrored geometry", async () => {
    // Original unmirrored L-shape on the left (blue)
    const baseLeft = jscad.primitives.cuboid({ size: [10, 4, 2], center: [-7, 0, 1] })
    const postLeft = jscad.primitives.cuboid({ size: [2, 4, 8], center: [-11, 0, 4] })
    const originalLeft = jscad.booleans.union(baseLeft, postLeft)

    // Mirrored L-shape on the right (red)
    const base = jscad.primitives.cuboid({ size: [10, 4, 2], center: [0, 0, 1] })
    const post = jscad.primitives.cuboid({ size: [2, 4, 8], center: [-4, 0, 4] })
    const unionModel = jscad.booleans.union(base, post)
    const mirroredRight = jscad.transforms.translate(
      [7, 0, 0],
      jscad.transforms.mirror({ normal: [1, 0, 0] }, unionModel),
    )

    const glbResult = await convertJscadModelToGltf(
      {
        geometries: [
          { geom: originalLeft, color: "#3498db" },
          { geom: mirroredRight, color: "#e74c3c" },
        ],
      },
      { format: "glb" },
    )

    expect(glbResult.format).toBe("glb")

    const png = await renderGLTFToPNGFromGLB(glbResult.data as ArrayBuffer, {
      width: 800,
      height: 600,
      backgroundColor: [1, 1, 1],
      cull: true,
      camPos: [0, -25, 15],
      lookAt: [0, 0, 3],
    })

    expect(png).toMatchPngSnapshot(
      import.meta.path,
      "mirrored-normals-side-by-side",
    )
  })
})
