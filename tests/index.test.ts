import { describe, expect, it } from "bun:test"

import { convertJscadPlanToGltf, type JscadOperation } from "../lib/index"

const cubePlan: JscadOperation = {
  type: "cuboid",
  size: [10, 10, 10],
}

describe("convertJscadPlanToGltf", () => {
  it("converts a simple cube plan to a GLB buffer", async () => {
    const result = await convertJscadPlanToGltf(cubePlan)

    expect(result.format).toBe("glb")
    expect(result.mimeType).toBe("model/gltf-binary")
    expect(result.byteLength).toBeGreaterThan(0)

    const buffer = result.data as ArrayBuffer
    const header = new TextDecoder().decode(new Uint8Array(buffer).slice(0, 4))
    expect(header).toBe("glTF")
  })

  it("supports exporting GLTF JSON", async () => {
    const result = await convertJscadPlanToGltf(cubePlan, {
      format: "gltf",
      prettyJson: true,
    })

    expect(result.format).toBe("gltf")
    expect(result.mimeType).toBe("model/gltf+json")
    expect(typeof result.data).toBe("string")

    const parsed = JSON.parse(result.data as string)
    expect(parsed.meshes).toBeDefined()
    expect(parsed.scenes).toBeDefined()
  })

  it("throws when the plan does not produce a geometry", async () => {
    const volumePlan: JscadOperation = {
      type: "measureVolume",
      shape: cubePlan,
    }

    await expect(convertJscadPlanToGltf(volumePlan)).rejects.toThrow(
      /did not return a supported geometry/i,
    )
  })
})
