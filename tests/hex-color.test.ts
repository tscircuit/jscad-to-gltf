import { describe, expect, it } from "bun:test"
import * as jscadModeling from "@jscad/modeling"
import { convertJscadModelToGltf } from "../lib/index"

function getColorFloats(parsed: any): Float32Array {
  const primitive = parsed.meshes[0].primitives[0]
  const colorAccessorIndex = primitive.attributes["COLOR_0"]
  if (colorAccessorIndex === undefined) {
    throw new Error("No color accessor found")
  }
  const colorAccessor = parsed.accessors[colorAccessorIndex]
  const bufferView = parsed.bufferViews[colorAccessor.bufferView]
  const uri = parsed.buffers[0].uri
  const base64 = uri.split(",")[1]
  const buffer = Buffer.from(base64, "base64")

  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset + bufferView.byteOffset,
    bufferView.byteLength / 4,
  )
}

describe("hex string color support", () => {
  it("renders geometry with shorthand hex color (#fff) on vertex correctly", async () => {
    const geom = jscadModeling.primitives.cuboid({ size: [1, 1, 1] })
    if (geom.polygons) {
      for (const poly of geom.polygons) {
        for (const vertex of poly.vertices) {
          ;(vertex as any).color = "#fff"
        }
      }
    }

    const result = await convertJscadModelToGltf(
      { geometries: [{ geom }] },
      { format: "gltf" },
    )

    const parsed = JSON.parse(result.data as string)
    const colorData = getColorFloats(parsed)
    // #fff should decode to exactly [1, 1, 1]
    expect(colorData[0]).toBe(1)
    expect(colorData[1]).toBe(1)
    expect(colorData[2]).toBe(1)
  })

  it("renders geometry with full hex color (#555555) on vertex correctly", async () => {
    const geom = jscadModeling.primitives.cuboid({ size: [1, 1, 1] })
    if (geom.polygons) {
      for (const poly of geom.polygons) {
        for (const vertex of poly.vertices) {
          ;(vertex as any).color = "#555555"
        }
      }
    }

    const result = await convertJscadModelToGltf(
      { geometries: [{ geom }] },
      { format: "gltf" },
    )

    const parsed = JSON.parse(result.data as string)
    const colorData = getColorFloats(parsed)
    const expectedVal = 0.3333333333333333
    expect(colorData[0]).toBeCloseTo(expectedVal, 4)
    expect(colorData[1]).toBeCloseTo(expectedVal, 4)
    expect(colorData[2]).toBeCloseTo(expectedVal, 4)
  })

  it("renders geometry with RGB array color ([0.5, 0.5, 0.5]) correctly", async () => {
    const geom = jscadModeling.primitives.cuboid({ size: [1, 1, 1] })
    if (geom.polygons) {
      for (const poly of geom.polygons) {
        for (const vertex of poly.vertices) {
          ;(vertex as any).color = [0.5, 0.5, 0.5]
        }
      }
    }

    const result = await convertJscadModelToGltf(
      { geometries: [{ geom }] },
      { format: "gltf" },
    )

    const parsed = JSON.parse(result.data as string)
    const colorData = getColorFloats(parsed)
    expect(colorData[0]).toBe(0.5)
    expect(colorData[1]).toBe(0.5)
    expect(colorData[2]).toBe(0.5)
  })
})
