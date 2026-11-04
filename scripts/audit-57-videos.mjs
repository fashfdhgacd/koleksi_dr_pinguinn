// Audit of the owner's 57-video list. Usage: node scripts/audit-57-videos.mjs <csv>
// Read-only: classifies each row with the real lock pipeline plus triage. Changes nothing.
import { readFileSync } from "node:fs";
import { lockedMinorReason } from "../src/lib/catalog/minor-lock.js";
import { triageLockedTitle } from "../src/lib/catalog/minor-triage.js";

const path = process.argv[2];
if (!path) {
  console.error("CSV path required");
  process.exit(2);
}
const rows = readFileSync(path, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const m = l.match(/^([^,]*),([^,]*),([^,]*),"?(.*?)"?$/);
  return { jenis: m[1], id: m[2], status: m[3], title: m[4].replace(/ - koleksidrpingu\S*$/i, "") };
});
const out = rows.map((r) => ({ ...r, lock: lockedMinorReason(r.title), ...triageLockedTitle(r.title, r.status) }));
const n = (f) => out.filter(f).length;
console.log(`rows=${out.length} claims_minor(hard)=${n((r) => r.hardBlock)} needs_verification=${n((r) => !r.hardBlock)}`);
console.log(`performer age claims: ${JSON.stringify(Object.fromEntries(["claims_minor", "claims_adult", "unknown"].map((k) => [k, n((r) => r.performerAge.claim === k)])))}`);
console.log(`fictional framing: ${n((r) => r.fictionalCharacter.framing === "fiksi/anime")}`);
for (const r of out.filter((r) => !r.hardBlock)) console.log(`VERIFY ${r.id} | ${r.title} | ${r.evidence[0]}`);
