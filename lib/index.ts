import jscad from "@jscad/modeling"
import type { JscadOperation } from "jscad-planner"
import { executeJscadOperations } from "jscad-planner"
import { Buffer } from "node:buffer"

export type { JscadOperation }

export interface ConvertJscadPlanToGltfOptions {
  format?: "glb" | "gltf"
  meshName?: string
  prettyJson?: boolean
}

export interface ConvertJscadPlanToGltfResult {
  data: ArrayBuffer | string
  format: "glb" | "gltf"
  mimeType: "model/gltf-binary" | "model/gltf+json"
  byteLength: number
}

type ColorTuple = [number, number, number]
type Vec3 = [number, number, number]

interface CsgLike {
  polygons?: Array<{ vertices: any[] }>
  sides?: any[]
  color?: ColorTuple
  transforms?: number[]
}

interface GeometryData {
  name: string
  positions: Float32Array
  normals?: Float32Array
  colors?: Float32Array
  mode: number
}

interface BufferView {
  buffer: number
  byteOffset: number
  byteLength: number
  target?: number
}

interface Accessor {
  bufferView: number
  componentType: number
  count: number
  type: string
  min?: number[]
  max?: number[]
  normalized?: boolean
}

const GLTF_MODE_TRIANGLES = 4
const GLTF_MODE_LINES = 1
const GLTF_COMPONENT_FLOAT = 5126
const GLTF_COMPONENT_UINT32 = 5125
const GLTF_TYPE_VEC3 = "VEC3"
const GLTF_TYPE_SCALAR = "SCALAR"

const align = (value: number, multiple: number) => {
  const remainder = value % multiple
  return remainder === 0 ? value : value + multiple - remainder
}

const toColorTuple = (value: unknown, fallback: ColorTuple): ColorTuple => {
  if (Array.isArray(value) && value.length >= 3) {
    const r = Number(value[0])
    const g = Number(value[1])
    const b = Number(value[2])
    return [Number.isFinite(r) ? r : fallback[0], Number.isFinite(g) ? g : fallback[1], Number.isFinite(b) ? b : fallback[2]]
  }
  return fallback
}

const extractVertexPosition = (vertex: any): Vec3 => {
  if (!vertex) return [0, 0, 0]
  if (Array.isArray(vertex) && vertex.length >= 3) {
    return [Number(vertex[0]) || 0, Number(vertex[1]) || 0, Number(vertex[2]) || 0]
  }
  if (vertex.pos && Array.isArray(vertex.pos) && vertex.pos.length >= 3) {
    return [Number(vertex.pos[0]) || 0, Number(vertex.pos[1]) || 0, Number(vertex.pos[2]) || 0]
  }
  if (Array.isArray(vertex.position) && vertex.position.length >= 3) {
    return [Number(vertex.position[0]) || 0, Number(vertex.position[1]) || 0, Number(vertex.position[2]) || 0]
  }
  return [0, 0, 0]
}

const extractVertexColor = (vertex: any, defaultColor: ColorTuple): ColorTuple => {
  if (vertex?.color) return toColorTuple(vertex.color, defaultColor)
  return defaultColor
}

const applyTransform = (vector: Vec3, matrix?: number[]): Vec3 => {
  if (!Array.isArray(matrix) || matrix.length !== 16) return vector
  const [x, y, z] = vector
  const nx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]
  const ny = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]
  const nz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  if (w && w !== 1) {
    return [nx / w, ny / w, nz / w]
  }
  return [nx, ny, nz]
}

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2])
  if (!length) return [0, 0, 1]
  return [v[0] / length, v[1] / length, v[2] / length]
}

const convertPolygonGeometry = (csg: CsgLike, name: string): GeometryData => {
  if (!csg.polygons || csg.polygons.length === 0) {
    throw new Error("Expected polygon data in JSCAD geometry")
  }

  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const defaultColor: ColorTuple = csg.color ? toColorTuple(csg.color, [1, 1, 1]) : [1, 1, 1]

  for (const polygon of csg.polygons) {
    if (!polygon?.vertices || polygon.vertices.length < 3) continue

    const transformedVertices = polygon.vertices.map((vertex: any) => {
      const position = extractVertexPosition(vertex)
      return applyTransform(position, csg.transforms)
    })

    const vertexColors = polygon.vertices.map((vertex: any) => extractVertexColor(vertex, defaultColor))

    for (let i = 1; i < transformedVertices.length - 1; i++) {
      const a = transformedVertices[0]
      const b = transformedVertices[i]
      const c = transformedVertices[i + 1]

      const ab = subtract(b, a)
      const ac = subtract(c, a)
      const normal = normalize(cross(ab, ac))

      positions.push(...a, ...b, ...c)
      normals.push(...normal, ...normal, ...normal)

      const colorA = vertexColors[0]
      const colorB = vertexColors[i]
      const colorC = vertexColors[i + 1]
      colors.push(...colorA, ...colorB, ...colorC)
    }
  }

  if (positions.length === 0) {
    throw new Error("Unable to build triangle mesh from JSCAD polygons")
  }

  return {
    name,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: colors.length ? new Float32Array(colors) : undefined,
    mode: GLTF_MODE_TRIANGLES,
  }
}

const convertSideGeometry = (csg: CsgLike, name: string): GeometryData => {
  if (!csg.sides || csg.sides.length === 0) {
    throw new Error("Expected side data in JSCAD 2D geometry")
  }

  const positions: number[] = []
  const colors: number[] = []
  const defaultColor: ColorTuple = csg.color ? toColorTuple(csg.color, [1, 1, 1]) : [1, 1, 1]

  for (const side of csg.sides) {
    if (!Array.isArray(side) || side.length < 2) continue
    const startRaw = side[0]
    const endRaw = side[side.length - 1]

    const start = applyTransform(
      [Number(startRaw[0]) || 0, Number(startRaw[1]) || 0, Number(startRaw[2]) || 0],
      csg.transforms,
    )
    const end = applyTransform(
      [Number(endRaw[0]) || 0, Number(endRaw[1]) || 0, Number(endRaw[2]) || 0],
      csg.transforms,
    )

    positions.push(...start, ...end)
    colors.push(...defaultColor, ...defaultColor)
  }

  if (positions.length === 0) {
    throw new Error("Unable to build line geometry from JSCAD sides")
  }

  return {
    name,
    positions: new Float32Array(positions),
    colors: colors.length ? new Float32Array(colors) : undefined,
    mode: GLTF_MODE_LINES,
  }
}

const collectGeometries = (csg: CsgLike | CsgLike[], name: string): GeometryData[] => {
  if (Array.isArray(csg)) {
    return csg.flatMap((child, index) => collectGeometries(child, `${name}_${index}`))
  }

  if (csg?.polygons) {
    return [convertPolygonGeometry(csg, name)]
  }

  if (csg?.sides) {
    return [convertSideGeometry(csg, name)]
  }

  throw new Error(
    "JSCAD plan evaluation did not return a supported geometry (expected geom2 or geom3)",
  )
}

const addBufferView = (
  chunks: Buffer[],
  bufferViews: BufferView[],
  data: ArrayBufferView,
  currentLength: number,
  target?: number,
): { bufferViewIndex: number; newLength: number } => {
  const offset = align(currentLength, 4)
  const padding = offset - currentLength
  if (padding > 0) {
    chunks.push(Buffer.alloc(padding))
  }
  const arrayBuffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  chunks.push(arrayBuffer)
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, target })
  return { bufferViewIndex: bufferViews.length - 1, newLength: offset + data.byteLength }
}

const computeMinMax = (values: Float32Array): { min: number[]; max: number[] } => {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]

  for (let i = 0; i < values.length; i += 3) {
    const x = values[i]
    const y = values[i + 1]
    const z = values[i + 2]
    if (x < min[0]) min[0] = x
    if (y < min[1]) min[1] = y
    if (z < min[2]) min[2] = z
    if (x > max[0]) max[0] = x
    if (y > max[1]) max[1] = y
    if (z > max[2]) max[2] = z
  }

  return { min, max }
}

const buildGltfCore = (geometries: GeometryData[]) => {
  const bufferChunks: Buffer[] = []
  const bufferViews: BufferView[] = []
  const accessors: Accessor[] = []
  const meshes: Array<{ name: string; primitives: any[] }> = []
  const nodes: Array<{ name: string; mesh: number }> = []
  let bufferLength = 0

  geometries.forEach((geometry, index) => {
    const primitiveAttributes: Record<string, number> = {}

    const positionResult = addBufferView(
      bufferChunks,
      bufferViews,
      geometry.positions,
      bufferLength,
      34962,
    )
    bufferLength = positionResult.newLength
    const { min, max } = computeMinMax(geometry.positions)
    const positionAccessorIndex = accessors.length
    accessors.push({
      bufferView: positionResult.bufferViewIndex,
      componentType: GLTF_COMPONENT_FLOAT,
      count: geometry.positions.length / 3,
      type: GLTF_TYPE_VEC3,
      min,
      max,
    })
    primitiveAttributes.POSITION = positionAccessorIndex

    if (geometry.normals) {
      const normalResult = addBufferView(
        bufferChunks,
        bufferViews,
        geometry.normals,
        bufferLength,
        34962,
      )
      bufferLength = normalResult.newLength
      const normalAccessorIndex = accessors.length
      accessors.push({
        bufferView: normalResult.bufferViewIndex,
        componentType: GLTF_COMPONENT_FLOAT,
        count: geometry.normals.length / 3,
        type: GLTF_TYPE_VEC3,
      })
      primitiveAttributes.NORMAL = normalAccessorIndex
    }

    if (geometry.colors) {
      const colorResult = addBufferView(
        bufferChunks,
        bufferViews,
        geometry.colors,
        bufferLength,
        34962,
      )
      bufferLength = colorResult.newLength
      const colorAccessorIndex = accessors.length
      accessors.push({
        bufferView: colorResult.bufferViewIndex,
        componentType: GLTF_COMPONENT_FLOAT,
        count: geometry.colors.length / 3,
        type: GLTF_TYPE_VEC3,
      })
      primitiveAttributes["COLOR_0"] = colorAccessorIndex
    }

    meshes.push({
      name: geometry.name,
      primitives: [
        {
          attributes: primitiveAttributes,
          mode: geometry.mode,
        },
      ],
    })

    nodes.push({
      name: geometry.name,
      mesh: index,
    })
  })

  const alignedLength = align(bufferLength, 4)
  if (alignedLength > bufferLength) {
    bufferChunks.push(Buffer.alloc(alignedLength - bufferLength))
    bufferLength = alignedLength
  }

  const binary = Buffer.concat(bufferChunks, bufferLength)

  const json: Record<string, any> = {
    asset: { version: "2.0", generator: "jscad-plan-to-gltf" },
    buffers: [{ byteLength: bufferLength }],
    bufferViews,
    accessors,
    meshes,
    nodes: nodes.map((node, idx) => ({ ...node, mesh: idx })),
    scenes: [{ name: "Scene", nodes: nodes.map((_, idx) => idx) }],
    scene: 0,
  }

  return { json, binary }
}

const buildGlb = (json: Record<string, any>, binary: Buffer): ArrayBuffer => {
  const jsonString = JSON.stringify(json)
  const jsonBuffer = Buffer.from(jsonString, "utf8")
  const jsonPadding = align(jsonBuffer.length, 4) - jsonBuffer.length
  const paddedJson = jsonPadding > 0 ? Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]) : jsonBuffer

  const binPadding = align(binary.length, 4) - binary.length
  const paddedBinary = binPadding > 0 ? Buffer.concat([binary, Buffer.alloc(binPadding)]) : binary

  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0) // 'glTF'
  header.writeUInt32LE(2, 4)
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBinary.length
  header.writeUInt32LE(totalLength, 8)

  const jsonChunkHeader = Buffer.alloc(8)
  jsonChunkHeader.writeUInt32LE(paddedJson.length, 0)
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4) // 'JSON'

  const binChunkHeader = Buffer.alloc(8)
  binChunkHeader.writeUInt32LE(paddedBinary.length, 0)
  binChunkHeader.writeUInt32LE(0x004e4942, 4) // 'BIN\0'

  const glbBuffer = Buffer.concat([
    header,
    jsonChunkHeader,
    paddedJson,
    binChunkHeader,
    paddedBinary,
  ])

  return glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength)
}

export const convertJscadPlanToGltf = async (
  plan: JscadOperation,
  options: ConvertJscadPlanToGltfOptions = {},
): Promise<ConvertJscadPlanToGltfResult> => {
  const format = options.format ?? "glb"
  const meshName = options.meshName ?? "JSCADMesh"

  const csgResult = executeJscadOperations(jscad as any, plan) as CsgLike | CsgLike[]

  if (!csgResult) {
    throw new Error("JSCAD plan execution returned no geometry")
  }

  const geometries = collectGeometries(csgResult, meshName)

  if (geometries.length === 0) {
    throw new Error("JSCAD plan execution returned no geometry")
  }

  const { json, binary } = buildGltfCore(geometries)

  if (format === "glb") {
    const arrayBuffer = buildGlb(json, binary)
    return {
      data: arrayBuffer,
      format,
      mimeType: "model/gltf-binary",
      byteLength: arrayBuffer.byteLength,
    }
  }

  const jsonDoc = JSON.parse(JSON.stringify(json))
  jsonDoc.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString("base64")}`
  const jsonString = JSON.stringify(jsonDoc, null, options.prettyJson ? 2 : 0)
  const byteLength = Buffer.byteLength(jsonString, "utf8")

  return {
    data: jsonString,
    format,
    mimeType: "model/gltf+json",
    byteLength,
  }
}

export default convertJscadPlanToGltf
