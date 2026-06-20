import { test, expect } from "bun:test"
import { getJscadModelForFootprint } from "jscad-electronics/vanilla"
import { renderGLTFToPNGFromGLB } from "poppygl"
import * as jscadModeling from "@jscad/modeling"

import { convertJscadModelToGltf } from "../../lib/index"

test("jscad-electronics-example01-flat (with axis transformation)", async () => {
  const model = getJscadModelForFootprint("soic8", jscadModeling as any)

  const glbResult = await convertJscadModelToGltf(model, {
    meshName: "soic8",
    axisTransform: "jscad_y+ -> gltf_z+", // Make the object lie flat
  })

  expect(glbResult.format).toBe("glb")
  expect(glbResult.mimeType).toBe("model/gltf-binary")
  expect(glbResult.byteLength).toBeGreaterThan(0)

  const gltfResult = await convertJscadModelToGltf(model, {
    format: "gltf",
    prettyJson: true,
    axisTransform: "jscad_y+ -> gltf_z+",
  })

  expect(typeof gltfResult.data).toBe("string")

  const parsed = JSON.parse(gltfResult.data as string)
  expect(parsed.meshes?.length).toBeGreaterThan(0)
  expect(parsed.meshes?.[0]?.primitives?.[0]?.attributes?.COLOR_0).toBeDefined()

  expect(
    renderGLTFToPNGFromGLB(glbResult.data as ArrayBuffer),
  ).toMatchPngSnapshot(import.meta.path)
})
