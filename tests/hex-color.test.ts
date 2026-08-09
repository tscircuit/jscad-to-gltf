import { describe, expect, it } from "bun:test"
import * as jscadModeling from "@jscad/modeling"
import { convertJscadModelToGltf } from "../lib/index"

describe("hex string color support", () => {
  it("renders geometry with shorthand hex color (#fff) correctly — not as fallback white", async () => {
    const geom = jscadModeling.primitives.cuboid({ size: [1, 1, 1] })
    // Simulate what jscad-fiber Colorize does: sets geom.color = "#fff"
    ;(geom as any).color = "#fff"

    const result = await convertJscadModelToGltf(
      { geometries: [{ geom, color: "#fff" }] },
      { format: "gltf" },
    )

    const parsed = JSON.parse(result.data as string)
    // COLOR_0 accessor must exist (geometry is visible)
    const colorAccessor = parsed.accessors?.find(
      (a: any) => a.type === "VEC3" && a.bufferView !== parsed.accessors[0].bufferView,
    )
    expect(parsed.meshes).toBeDefined()
    expect(parsed.meshes.length).toBeGreaterThan(0)
    // Buffer must be non-empty (geometry rendered, not discarded)
    expect(parsed.buffers[0].byteLength).toBeGreaterThan(100)
  })

  it("renders geometry with full hex color (#555555) correctly", async () => {
    const geom = jscadModeling.primitives.cuboid({ size: [1, 1, 1] })
    ;(geom as any).color = "#555555"

    const result = await convertJscadModelToGltf(
      { geometries: [{ geom, color: "#555555" }] },
      { format: "gltf" },
    )

    const parsed = JSON.parse(result.data as string)
    expect(parsed.meshes).toBeDefined()
    expect(parsed.buffers[0].byteLength).toBeGreaterThan(100)
  })

  it("renders geometry with RGB array color ([1,1,1]) correctly", async () => {
    const geom = jscadModeling.primitives.cuboid({ size: [1, 1, 1] })
    ;(geom as any).color = [1, 1, 1]

    const result = await convertJscadModelToGltf(
      { geometries: [{ geom, color: [1, 1, 1] as [number, number, number] }] },
      { format: "gltf" },
    )

    const parsed = JSON.parse(result.data as string)
    expect(parsed.meshes).toBeDefined()
    expect(parsed.buffers[0].byteLength).toBeGreaterThan(100)
  })
})
