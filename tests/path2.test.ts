import { describe, expect, it } from "bun:test"
import * as jscadModeling from "@jscad/modeling"
import { convertJscadModelToGltf, convertJscadPlanToGltf } from "../lib/index"

const getPositionFloats = (parsed: any): Float32Array => {
  const primitive = parsed.meshes[0].primitives[0]
  const positionAccessor = parsed.accessors[primitive.attributes.POSITION]
  const bufferView = parsed.bufferViews[positionAccessor.bufferView]
  const base64 = parsed.buffers[0].uri.split(",")[1]
  const buffer = Buffer.from(base64, "base64")

  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset + bufferView.byteOffset,
    bufferView.byteLength / 4,
  )
}

describe("path2 conversion", () => {
  it("converts createPath2 operations to line segments", async () => {
    const result = await convertJscadPlanToGltf(
      {
        type: "createPath2",
        points: [
          [0, 0],
          [2, 0],
          [2, 3],
        ],
      },
      { format: "gltf" },
    )

    const parsed = JSON.parse(result.data as string)
    const primitive = parsed.meshes[0].primitives[0]
    const positionAccessor = parsed.accessors[primitive.attributes.POSITION]
    expect(primitive.mode).toBe(1)
    expect(positionAccessor.count).toBe(4)
    expect(Array.from(getPositionFloats(parsed))).toEqual([
      0, 0, 0, 2, 0, 0, 2, 0, 0, 2, 3, 0,
    ])
  })

  it("closes closed path2 geometry back to its first point", async () => {
    const path = jscadModeling.geometries.path2.close(
      jscadModeling.geometries.path2.create([
        [0, 0],
        [2, 0],
        [2, 3],
      ]),
    )

    const result = await convertJscadModelToGltf(
      { geometries: [{ geom: path }] },
      { format: "gltf" },
    )

    const parsed = JSON.parse(result.data as string)
    const primitive = parsed.meshes[0].primitives[0]
    const positionAccessor = parsed.accessors[primitive.attributes.POSITION]
    expect(positionAccessor.count).toBe(6)
    expect(Array.from(getPositionFloats(parsed).slice(-6))).toEqual([
      2, 3, 0, 0, 0, 0,
    ])
  })
})
