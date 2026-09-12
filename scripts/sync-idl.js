// Copies the freshly built IDL + TS types into web/idl so the frontend always
// matches the program. Run after `anchor build`.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = {
  json: path.join(root, "target", "idl", "holder_locker.json"),
  ts: path.join(root, "target", "types", "holder_locker.ts"),
};
const dstDir = path.join(root, "web", "idl");
fs.mkdirSync(dstDir, { recursive: true });
for (const [k, p] of Object.entries(src)) {
  if (!fs.existsSync(p)) {
    console.error(`missing ${p} - run anchor build first`);
    process.exit(1);
  }
  const dst = path.join(dstDir, path.basename(p));
  fs.copyFileSync(p, dst);
  console.log(`copied ${k} -> ${path.relative(root, dst)}`);
}
