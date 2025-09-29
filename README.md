# jscad-to-gltf

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Usage

### From JSCAD model

```ts
import * as jscad from "@jscad/modeling"
import { convertJscadModelToGltf } from "jscad-to-gltf"

const model = jscad.csg.union(
  jscad.csg.cube({ size: [5, 5, 5] }),
  jscad.csg.cube({ size: [5, 5, 5] }).translate([10, 0, 0])
)

const result = await convertJscadModelToGltf(model, {
  format: "glb", // or "gltf"
  meshName: "MyAssembly",
  prettyJson: false,
})

await Bun.write(`model.${result.format}`, result.data)
```

### From JSON [jscad plan](https://github.com/tscircuit/jscad-planner)

```ts
import { convertJscadPlanToGltf, convertJscadModelToGltf } from "jscad-to-gltf"

const result = await convertJscadPlanToGltf(plan, {
  format: "glb", // or "gltf"
  meshName: "MyAssembly",
  prettyJson: false,
})

await Bun.write(`model.${result.format}`, result.data)
```

- `plan` is any `JscadOperation` from `jscad-planner`. Use `convertJscadModelToGltf(model, options)` if you already rendered a `JscadRenderedModel`.
- The converter preserves per-vertex colors when provided and falls back to white.

**Options**

- `format`: output as binary `glb` (default) or JSON `gltf`.
- `meshName`: base name used for generated meshes and nodes (`"JSCADMesh"` by default).
- `prettyJson`: pretty-print the `.gltf` JSON for readability.

**Result**

- `data`: an `ArrayBuffer` for `glb` or a stringified JSON document for `gltf`.
- `mimeType`: `model/gltf-binary` or `model/gltf+json` for serving the result.
- `byteLength`: number of bytes in the returned data.

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
