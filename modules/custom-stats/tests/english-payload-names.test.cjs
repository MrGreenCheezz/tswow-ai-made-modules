const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
    path.join(__dirname, "..", "datascripts", "datascripts.ts"),
    "utf8",
);
const masterySource = fs.readFileSync(
    path.join(__dirname, "..", "livescripts", "mastery.ts"),
    "utf8",
);
const tiers = source.slice(
    source.indexOf("const MELEE_TIERS"),
    source.indexOf("const PAYLOAD_ENGLISH_NAMES"),
);
const payloadIds = [];
for (const match of tiers.matchAll(/(?:harmful|helpful)\(([^)]*)\)/g)) {
    const values = match[1].match(/\d+/g).map(Number);
    payloadIds.push(...values.slice(1));
}
const uniquePayloadIds = [...new Set(payloadIds)];
assert.equal(uniquePayloadIds.length, 113);

const mapBody = source.match(
    /const PAYLOAD_ENGLISH_NAMES: \{ \[spellId: number\]: string \} = \{([\s\S]*?)\n\};/,
)[1];
const englishNames = new Map(
    [...mapBody.matchAll(/^\s+(\d+): ("(?:[^"\\]|\\.)*"),$/gm)]
        .map(match => [Number(match[1]), JSON.parse(match[2])]),
);
assert.equal(englishNames.size, 113);
for (const id of uniquePayloadIds) {
    assert.ok(englishNames.has(id), `Missing English payload name for spell ${id}`);
    assert.doesNotMatch(englishNames.get(id), /[\u0400-\u04ff]/);
}

const enNameExpression = source.match(/const enName = ([^;]+);/)[1];
assert.doesNotMatch(enNameExpression, /ruRU/);
assert.equal(
    enNameExpression,
    'PAYLOAD_ENGLISH_NAMES[effect.spell] || payload.Name.enGB.get() || "Spell " + effect.spell',
);
assert.match(source, /const enDescription = effect\.kind == "damage"[\s\S]*?enName \+ "\.";/);
assert.match(masterySource, /PrepareWorldQuery\([\s\S]*item_template_locale/);
assert.match(masterySource, /GetDbLocaleIndex\(\)\) != 8/);
assert.doesNotMatch(masterySource, /\$\{template\.GetName\(\)\}/);

console.log("custom-stats English payload name checks passed");
