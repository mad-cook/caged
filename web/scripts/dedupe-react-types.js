// Some transitive deps (react-native via wallet-adapter-mobile, wallet-adapter-react)
// install their own nested @types/react@19. Two copies of the React types make
// every JSX component fail to type-check. We use React 18, so remove the nested copies.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "node_modules");
let removed = 0;

function walk(dir, depth) {
  if (depth > 6) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.name === "node_modules" && dir !== path.dirname(root)) {
      for (const t of ["react", "react-dom"]) {
        const nested = path.join(p, "@types", t);
        if (nested !== path.join(root, "@types", t) && fs.existsSync(nested)) {
          fs.rmSync(nested, { recursive: true, force: true });
          removed++;
        }
      }
      walk(p, depth + 1);
    } else if (e.name.startsWith("@") || depth < 3) {
      walk(p, depth + 1);
    }
  }
}

if (fs.existsSync(root)) walk(root, 0);
console.log(`dedupe-react-types: removed ${removed} nested @types/react(-dom) copies`);
