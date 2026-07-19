const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));

function loadTsModule(file) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2018,
        },
    }).outputText;
    const module = { exports: {} };
    new Function("exports", "module", "require", output)(
        module.exports,
        module,
        require,
    );
    return module.exports;
}

const moduleRoot = path.join(__dirname, "..");
const rules = loadTsModule(path.join(moduleRoot, "shared/RandomMobRules.ts"));
const dataSource = fs.readFileSync(
    path.join(moduleRoot, "datascripts/random_mobs.ts"),
    "utf8",
);
const gemsSource = fs.readFileSync(
    path.join(moduleRoot, "datascripts/gems.ts"),
    "utf8",
);
const liveSource = fs.readFileSync(
    path.join(moduleRoot, "livescripts/random_mobs.ts"),
    "utf8",
);
const localizationSource = fs.readFileSync(
    path.join(moduleRoot, "livescripts/localization.ts"),
    "utf8",
);
const entrySource = fs.readFileSync(
    path.join(moduleRoot, "livescripts/livescripts.ts"),
    "utf8",
);

// Exact probability boundaries: all rolls are independent [0, 1) samples.
assert.strictEqual(rules.RANDOM_PROC_ASSIGN_CHANCE_PERCENT, 25);
assert.strictEqual(rules.RANDOM_PROC_TRIGGER_CHANCE_PERCENT, 25);
assert.strictEqual(rules.OVERLOADED_CHANCE_PERCENT, 1);
assert.strictEqual(rules.FRANKEN_RARE_CHANCE_PERCENT, 2);
assert.strictEqual(rules.ESCAPED_LOOT_CHANCE_PERCENT, 3);
assert.strictEqual(rules.REVENGE_MIN_KILLS, 8);
assert.strictEqual(rules.REVENGE_MAX_KILLS, 12);
assert.strictEqual(rules.OVERLOADED_REWARD_MULTIPLIER, 3);
assert.strictEqual(rules.rollPercent(0, 25), true);
assert.strictEqual(rules.rollPercent(0.249999, 25), true);
assert.strictEqual(rules.rollPercent(0.25, 25), false);
assert.strictEqual(rules.rollPercent(0.009999, 1), true);
assert.strictEqual(rules.rollPercent(0.01, 1), false);

// Harmful unit spells pass. Passive, positive, destination, service and
// combo-scaled spells cannot become native creature procs.
assert.strictEqual(
    rules.canUseRandomMobProcSpell(0, 0, 0x80, true, false, false),
    true,
);
assert.strictEqual(
    rules.canUseRandomMobProcSpell(0, 0x1000, 0x2, true, false, false),
    true,
);
assert.strictEqual(
    rules.canUseRandomMobProcSpell(0x40, 0, 0x80, true, false, false),
    false,
);
assert.strictEqual(
    rules.canUseRandomMobProcSpell(0, 0, 0x2, true, false, false),
    false,
);
assert.strictEqual(
    rules.canUseRandomMobProcSpell(0, 0, 0xc0, true, false, false),
    false,
);
assert.strictEqual(
    rules.canUseRandomMobProcSpell(0, 0, 0x80, true, true, false),
    false,
);
assert.strictEqual(
    rules.canUseRandomMobProcSpell(0, 0, 0x80, true, false, true),
    false,
);
assert.strictEqual(rules.isUnsafeRandomMobAbilityEffect(5, 0), true);
assert.strictEqual(rules.isUnsafeRandomMobAbilityEffect(2, 0), false);
assert.strictEqual(rules.isUnsafeRandomMobAbilityEffect(6, 10), true);

assert.strictEqual(rules.multiplyCapped(100, 3, 0xffffffff), 300);
assert.strictEqual(
    rules.multiplyCapped(0xffffffff, 3, 0xffffffff),
    0xffffffff,
);

// Datascripts preserve the old per-ability native aura design, but use the
// modern all-damage proc row and deliberately reject triggered-proc chains.
assert.match(dataSource, /RANDOM_MOB_PROC_CHANCE_PERCENT\s*=\s*25/);
assert.match(dataSource, /PROC_DONE_HIT_MASK\s*=\s*0x00e55554/);
assert.match(dataSource, /TypeMask as any\)\.set\(PROC_TYPE_DAMAGE\)/);
assert.match(dataSource, /Tags\.add\(GEM_MODULE, RANDOM_MOB_PROC_TAG\)/);
assert.doesNotMatch(dataSource, /CAN_PROC_WITH_TRIGGERED\.set\(true\)/);
assert.match(dataSource, /MOD_MELEE_RANGED_HASTE[\s\S]*PercentBase\.set\(200\)/);
assert.match(dataSource, /MOD_DAMAGE_PERCENT_DONE[\s\S]*PercentBase\.set\(200\)/);
assert.match(gemsSource, /createRandomMobProcAura\(spellId, enName\)/);
assert.match(dataSource, /englishName \|\| payload\.Name\.enGB\.get\(\) \|\| "Spell " \+ payloadSpellId/);
assert.doesNotMatch(dataSource, /const enName\s*=.*ruRU/);

// Runtime rolls once per spawn/player combat, covers every requested field
// event, and uses build-time literal tags for the generated data.
assert.match(liveSource, /TAG\("gem-abilities", "spell\/random-mob-damage-proc"\)/);
assert.match(liveSource, /UTAG\("gem-abilities", "spell\/random-mob-overloaded"\)/);
assert.match(liveSource, /UTAG\("gem-abilities", "npc\/escaped-loot"\)/);
assert.match(liveSource, /TAG\("echoes", "item\/echo-choice"\)/);
assert.match(liveSource, /OnJustAppeared\(resetSpawnState\)/);
assert.match(liveSource, /OnJustEnteredCombat\(handleFirstPlayerCombat\)/);
assert.match(liveSource, /OnCreatureKill\(handleSpeciesKill\)/);
assert.match(liveSource, /OnGenerateLoot\(handleGeneratedLoot\)/);
assert.match(liveSource, /OnGiveXP/);
assert.match(liveSource, /if \(victim === undefined\) return/);
assert.match(liveSource, /ensureProcAuraCount\(creature, 2\)/);
assert.match(liveSource, /spawnRevengePack/);
assert.match(liveSource, /spawnEscapedLoot/);
assert.match(liveSource, /multiplyCreatureLoot/);
assert.match(liveSource, /setScaleFactorAtLeast\(creature, 1\.25\)/);
assert.match(liveSource, /\[Нестабильность\]/);
assert.match(liveSource, /loot\.SetMoney\(multiplyCapped\(/);
assert.match(localizationSource, /PrepareWorldQuery\([\s\S]*creature_template_locale/);
assert.match(localizationSource, /GetDbLocaleIndex\(\)\) != 8/);
assert.doesNotMatch(liveSource, /creature\.GetName\(\)|killed\.GetName\(\)/);
assert.match(
    liveSource,
    /spawnEscapedLoot[\s\S]*TempSummonType\.TIMED_DESPAWN/,
);
assert.match(
    entrySource,
    /RegisterLoot\(events\)[\s\S]*RegisterRandomMobs\(events\)/,
);

console.log("random field enemies and reward contracts: ok");
