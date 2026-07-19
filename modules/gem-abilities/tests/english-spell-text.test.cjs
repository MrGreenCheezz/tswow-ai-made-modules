const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const moduleRoot = path.join(__dirname, "..");
const poolSource = fs.readFileSync(
    path.join(moduleRoot, "livescripts/generated_pool.ts"),
    "utf8",
);
const mapSource = fs.readFileSync(
    path.join(moduleRoot, "datascripts/english_spell_text.ts"),
    "utf8",
);
const gemsSource = fs.readFileSync(
    path.join(moduleRoot, "datascripts/gems.ts"),
    "utf8",
);

function poolIds(name) {
    const section = poolSource.split("export const " + name)[1];
    assert(section, "missing generated section " + name);
    return [...section.split("];", 1)[0].matchAll(/^\s*\[(\d+)\s*,/gm)]
        .map(match => Number(match[1]));
}

const currentIds = poolIds("GEN_POOL").concat(poolIds("GEN_EXOTIC"));
const mapRows = [...mapSource.matchAll(/^\s*(\d+):\s*(\[.*\]),\s*$/gm)]
    .map(match => [Number(match[1]), JSON.parse(match[2])]);
const mapIds = mapRows.map(row => row[0]);

assert.equal(currentIds.length, 2287);
assert.equal(new Set(currentIds).size, currentIds.length);
assert.equal(new Set(mapIds).size, mapIds.length);
assert.deepStrictEqual(mapIds, currentIds, "English map must follow every generated gem ID in order");
assert.equal(
    crypto.createHash("sha256").update(currentIds.join(",")).digest("hex"),
    "ee0e3838c0356e52938e60874eb3ce2fe884d4c38970afb2fffc56c8012030a7",
    "generated spell IDs/order changed; refresh and review the English map",
);

for (const [id, text] of mapRows) {
    assert.equal(text.length, 2, "spell " + id + " must have name and description");
    assert.equal(typeof text[0], "string");
    assert.equal(typeof text[1], "string");
    assert(text[0], "spell " + id + " must have an English name");
    assert.doesNotMatch(text[0] + text[1], /[\u0400-\u04ff]/, "Cyrillic in English spell " + id);
}
assert.equal(mapRows.filter(row => row[1][1] === "").length, 47);

assert.match(gemsSource, /const english = ENGLISH_SPELL_TEXT\[spellId\]/);
assert.match(gemsSource, /const enName = english \? english\[0\] : \(enNameRaw \|\| "Spell " \+ spellId\)/);
assert.match(gemsSource, /const enDesc = clip\(english \? english\[1\] : \(spell\.Description\.enGB\.get\(\) \|\| ""\)\)/);
assert.match(gemsSource, /english: \{ missingMap: 0, genericSamples: \[\] as number\[\] \}/);
assert.doesNotMatch(gemsSource, /const enName\s*=.*ruName/);
assert.doesNotMatch(gemsSource, /const enDesc\s*=.*ruRU/);

console.log("2,287 ability gems have stable, non-Cyrillic official English text: ok");
