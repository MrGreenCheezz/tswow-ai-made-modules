const assert = require("assert");
const fs = require("fs");
const path = require("path");

const moduleRoot = path.join(__dirname, "..");
const entrySource = fs.readFileSync(
    path.join(moduleRoot, "datascripts/datascripts.ts"),
    "utf8",
);
const gemsSource = fs.readFileSync(
    path.join(moduleRoot, "datascripts/gems.ts"),
    "utf8",
);
const generatedPool = fs.readFileSync(
    path.join(moduleRoot, "livescripts/generated_pool.ts"),
    "utf8",
);

// Ability gems plus profession actions lose reusable tool requirements, but
// unrelated stock Spell.dbc rows are never swept globally.
assert.doesNotMatch(entrySource, /RequiredTotemCategoryID/);
assert.match(
    gemsSource,
    /function createGem[\s\S]*spell\.row\.RequiredTotemCategoryID\.set\(\[0, 0\]\)/,
);
assert.match(
    gemsSource,
    /ITEM_FREE_PROFESSION_SKILLS[\s\S]*164: true[\s\S]*186: true[\s\S]*393: true[\s\S]*773: true[\s\S]*DBC\.SkillLineAbility\.queryAll[\s\S]*ITEM_FREE_PROFESSION_SKILLS\[skill\][\s\S]*STOCK_LOOT_CRAFTING_SPELLS\[spellId\][\s\S]*RequiredTotems\.clearAll\(\)/,
);

// These stock random-item profession spells own spell_loot_template entries.
// If one enters the gem catalog, Trinity will report the loot row as orphaned
// after its tool requirement is removed.
const stockLootCraftingSpells = [
    48247, 59480, 59487, 59491, 59502, 59503, 59504, 64051,
];
for (const spellId of stockLootCraftingSpells) {
    assert.match(
        gemsSource,
        new RegExp("\\b" + spellId + ": true"),
        "stock loot-crafting spell " + spellId + " must keep its tool category",
    );
    assert.doesNotMatch(
        generatedPool,
        new RegExp("^\\s*\\[" + spellId + ",", "m"),
        "stock loot-crafting spell " + spellId + " must not become an ability gem",
    );
}

console.log("profession tools are optional without breaking stock loot-crafting: ok");
