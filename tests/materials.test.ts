import { expect, test } from "bun:test"
import jscad from "@jscad/modeling"
import { convertJscadModelToGltf, convertJscadPlanToGltf } from "../lib"

const decode = (data: string | ArrayBuffer) =>
  typeof data === "string"
    ? JSON.parse(data)
    : JSON.parse(
        new TextDecoder().decode(
          new Uint8Array(data, 20, new DataView(data).getUint32(12, true)),
        ),
      )

test.each(["gltf", "glb"] as const)(
  "preserves per-part materials in %s without multiplying authored color by vertex color",
  async (format) => {
    const geom = jscad.primitives.cuboid({ size: [2, 2, 2] })
    const before = JSON.stringify(geom)
    const result = await convertJscadModelToGltf(
      {
        geometries: [
          {
            geom,
            color: "red",
            material: { color: "silver", metalness: 1, roughness: 0.3 },
          },
          {
            geom: {
              ...geom,
              material: {
                metalness: 0,
                roughness: 0.8,
                opacity: 0.4,
                emissive: [0, 0.2, 0],
                emissiveIntensity: 2,
              },
            },
            color: "black",
          },
        ],
      },
      { format },
    )
    const gltf = decode(result.data)
    const [metal, plastic] = gltf.materials
    expect(metal.pbrMetallicRoughness.metallicFactor).toBe(1)
    expect(metal.pbrMetallicRoughness.baseColorFactor[0]).toBeCloseTo(0.527115)
    expect(gltf.meshes[0].primitives[0].attributes.COLOR_0).toBeUndefined()
    expect(gltf.meshes[1].primitives[0].attributes.COLOR_0).toBeNumber()
    expect(plastic.pbrMetallicRoughness.metallicFactor).toBe(0)
    expect(plastic.pbrMetallicRoughness.baseColorFactor[3]).toBe(0.4)
    expect(plastic.alphaMode).toBe("BLEND")
    expect(plastic.emissiveFactor).toEqual([0, 0.2, 0])
    expect(
      plastic.extensions.KHR_materials_emissive_strength.emissiveStrength,
    ).toBe(2)
    expect(gltf.extensionsUsed).toContain("KHR_materials_emissive_strength")
    expect(JSON.stringify(geom)).toBe(before)
  },
)

test("material nodes survive plan execution and explicit zero values", async () => {
  const result = await convertJscadPlanToGltf(
    {
      type: "applyMaterial",
      material: {
        metalness: 0,
        roughness: 0,
        opacity: 0,
        transparent: false,
        emissiveIntensity: 0,
      },
      shape: { type: "cube", size: 2 },
    },
    { format: "gltf" },
  )
  const material = decode(result.data).materials[0]
  expect(material.pbrMetallicRoughness).toEqual({
    baseColorFactor: [1, 1, 1, 0],
    metallicFactor: 0,
    roughnessFactor: 0,
  })
  expect(material.alphaMode).toBe("OPAQUE")
  expect(
    material.extensions.KHR_materials_emissive_strength.emissiveStrength,
  ).toBe(0)
})
