import { readFileSync } from "node:fs";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";

const idlPath = "anchor/target/idl/termin.json";
const outDir = "app/generated/termin";

const idl = JSON.parse(readFileSync(idlPath, "utf8"));
const codama = createFromRoot(rootNodeFromAnchor(idl));
await codama.accept(renderVisitor(outDir));

console.log(`Generated client into ${outDir}`);
