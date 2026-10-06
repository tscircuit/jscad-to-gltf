import { expect, test } from "bun:test"
import jscad from "@jscad/modeling"
import { getJscadModelForFootprint } from "jscad-electronics/vanilla"
import { convertJscadModelToGltf } from "../lib"

interface GltfDocument {
  accessors: {
    count: number
    type: string
    min?: number[]
    max?: number[]
  }[]
  meshes: {
    primitives: {
      attributes: { POSITION: number; COLOR_0?: number }
      material?: number
      mode: number
    }[]
  }[]
  materials: {
    pbrMetallicRoughness: { metallicFactor: number; roughnessFactor: number }
  }[]
  scenes: { nodes: number[] }[]
}

test("exports registered and legacy models with their triangles and materials", async () => {
  for (const footprint of [
    "nema17_nowires_plainbackface",
    "soic8",
    "0402_color(red)",
  ]) {
    const model = getJscadModelForFootprint(footprint, jscad)
    const before = JSON.stringify(model)
    const expectedTriangles = model.geometries.map(({ geom }) => {
      if (!jscad.geometries.geom3.isA(geom)) {
        throw new Error("Expected solid geometry")
      }
      return jscad.geometries.geom3
        .toPolygons(structuredClone(geom))
        .reduce((count, polygon) => count + polygon.vertices.length - 2, 0)
    })
    expect(expectedTriangles.every((count) => count > 0)).toBe(true)

    for (const format of ["gltf", "glb"] as const) {
      const result = await convertJscadModelToGltf(model, { format })
      expect(result.format).toBe(format)
      expect(result.byteLength).toBeGreaterThan(0)

      let document: GltfDocument
      if (typeof result.data === "string") {
        document = JSON.parse(result.data)
      } else {
        const header = new DataView(result.data)
        expect(header.getUint32(0, true)).toBe(0x46546c67)
        expect(header.getUint32(4, true)).toBe(2)
        expect(header.getUint32(8, true)).toBe(result.data.byteLength)
        expect(header.getUint32(16, true)).toBe(0x4e4f534a)
        document = JSON.parse(
          new TextDecoder().decode(
            new Uint8Array(result.data, 20, header.getUint32(12, true)),
          ),
        )
      }

      expect(document.meshes.length).toBe(model.geometries.length)
      expect(document.scenes[0]?.nodes.length).toBe(model.geometries.length)
      for (const [index, mesh] of document.meshes.entries()) {
        const primitive = mesh.primitives[0]
        if (!primitive) throw new Error("Missing exported primitive")
        const position = document.accessors[primitive.attributes.POSITION]
        if (!position) throw new Error("Missing exported positions")
        expect(primitive.mode).toBe(4)
        expect(position.type).toBe("VEC3")
        expect(position.count).toBe(expectedTriangles[index]! * 3)
        expect(position.min?.every(Number.isFinite)).toBe(true)
        expect(position.max?.every(Number.isFinite)).toBe(true)
        expect(primitive.attributes.COLOR_0).toBeNumber()

        const authored = model.geometries[index]?.material
        if (!authored || primitive.material === undefined) {
          throw new Error("Missing authored material")
        }
        const material = document.materials[primitive.material]
        if (!material) throw new Error("Missing exported material")
        expect(material.pbrMetallicRoughness.metallicFactor).toBe(
          authored.metalness,
        )
        expect(material.pbrMetallicRoughness.roughnessFactor).toBe(
          authored.roughness,
        )
      }
    }
    expect(JSON.stringify(model)).toBe(before)
  }
})
