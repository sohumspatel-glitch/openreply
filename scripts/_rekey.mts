import fs from "node:fs"; import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const { prisma } = await import("../lib/db/client");
const apply = process.argv.includes("--apply");

// Singular, one word, easy to type. Matching is case-insensitive and strips
// emoji, so casing variants are wasted; the variations here are the other
// words somebody might plausibly type instead.
const rekey: Record<string, { name: string; keywords: string[] }> = {
  "Carousel D4":  { name: "DM",     keywords: ["dm", "dms"] },
  "Carousel D6":  { name: "OP",     keywords: ["op", "ops"] },
  "Carousel D7":  { name: "FOLDER", keywords: ["folder", "skills"] },
  "Carousel D8":  { name: "NUMBER", keywords: ["number", "numbers", "data"] },
  "Carousel D9":  { name: "WINNER", keywords: ["winner", "winners"] },
};

for (const [prefix, cfg] of Object.entries(rekey)) {
  const a = await prisma.automation.findFirst({ where: { name: { startsWith: prefix + " " } } });
  if (!a) { console.log(`  ${prefix}: not found`); continue; }
  const newName = a.name.replace(/\(([A-Z]+)\)$/, `(${cfg.name})`);
  console.log(`  ${prefix}: ${a.keywords.join(",")} -> ${cfg.keywords.join(",")}`);
  if (apply) {
    await prisma.automation.update({
      where: { id: a.id },
      data: { keywords: cfg.keywords, name: newName },
    });
  }
}
if (!apply) console.log("\n(dry run - pass --apply)");
await prisma.$disconnect(); process.exit(0);
