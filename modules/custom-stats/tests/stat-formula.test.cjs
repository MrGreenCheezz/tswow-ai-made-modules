const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require(path.resolve(__dirname, "../../../node_modules/typescript"));

function loadTypeScriptModule(file) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    Function("module", "exports", "require", output)(module, module.exports, require);
    return module.exports;
}

const formula = loadTypeScriptModule(path.resolve(__dirname, "../shared/StatFormula.ts"));
const messages = loadTypeScriptModule(path.resolve(__dirname, "../shared/StatMessages.ts"));
assert.deepEqual(
    [messages.OP_STATS_REQUEST, messages.OP_STATS, messages.OP_AFFIX_REQUEST, messages.OP_AFFIX],
    [50, 51, 76, 77],
);
assert.equal(formula.isAffixEligible(4, 23, 80), true, "caster offhands are eligible gear");

const first = formula.rollItemAffix(123456, 19019, 2, 17, 80, 4);
const second = formula.rollItemAffix(123456, 19019, 2, 17, 80, 4);
assert.deepEqual(first, second, "the same item instance must never reroll");

assert.deepEqual(
    formula.rollItemAffix(123456, 2770, 7, 0, 10, 1),
    { kind: formula.AFFIX_NONE, value: 0 },
    "resources are not affix-eligible gear",
);

let passingGuid = 0;
for (let guid = 1; guid <= 10000; guid++) {
    if (formula.rollItemAffix(guid, 19019, 2, 17, 20, 3).kind !== formula.AFFIX_NONE) {
        passingGuid = guid;
        break;
    }
}
assert.ok(passingGuid > 0, "fixed sample should contain an affixed item");
const low = formula.rollItemAffix(passingGuid, 19019, 2, 17, 20, 3);
const high = formula.rollItemAffix(passingGuid, 19019, 2, 17, 200, 3);
assert.equal(low.kind, high.kind, "item level must not change the rolled affix kind");
assert.ok(high.value >= low.value, "higher item level must not lower the affix value");

// A normal full set (14 armour/accessory + 2 weapon slots) of same-level
// levelling gear targets 82.5% at every stage of levelling.
for (const level of [10, 40, 80]) {
    for (const quality of [1, 2]) {
        const rating = 16 * formula.itemStatValue(formula.STAT_VAMPIRISM, level, quality);
        for (const convert of [formula.vampirismPct, formula.thornsPct, formula.masteryPct]) {
            const pct = convert(rating, level);
            assert.ok(pct >= 80 && pct <= 85, `level ${level} full-set effect drifted: ${pct}`);
            assert.ok(convert(rating, level * 2) < pct, "levelling past equipment must weaken its effect");
            assert.equal(convert(rating, Math.max(1, Math.floor(level / 2))), 85, "over-level gear must respect the cap");
        }
    }
}

let affixed = 0;
const sample = 20000;
for (let guid = 1; guid <= sample; guid++) {
    if (formula.rollItemAffix(guid, 19019, 2, 17, 80, 3).kind !== formula.AFFIX_NONE) affixed++;
}
const rate = affixed / sample;
assert.ok(rate > 0.32 && rate < 0.38, `rare affix rate drifted: ${rate}`);

const combatSource = fs.readFileSync(path.resolve(__dirname, "../livescripts/combat-stats.ts"), "utf8");
assert.match(combatSource, /CastCustomSpell\([^\n]+VAMPIRISM_HEAL_SPELL[^\n]+true/);
assert.match(combatSource, /CastCustomSpell\([^\n]+THORNS_REFLECT_SPELL[^\n]+true/);
assert.doesNotMatch(combatSource, /DealHeal\(|DealDamage\(/, "manual combat events bypass native procs");
assert.match(combatSource, /OnProc\(PERIODIC_TRACKER_SPELL/);
assert.doesNotMatch(combatSource, /OnPeriodicDamage\(/, "raw pre-mitigation periodic damage must not drive stats");

const dataSource = fs.readFileSync(path.resolve(__dirname, "../datascripts/datascripts.ts"), "utf8");
assert.match(dataSource, /TriggerMask\.set\(0x000c0000\)/);
assert.match(dataSource, /TypeMask\.set\(0x1\)/);
assert.match(dataSource, /patch\(CUSTOM_STATS_MODULE/);
assert.match(dataSource, /const PROC_DONE_HIT_MASK = 0x00e55554/);
const doneHitMask = Number(dataSource.match(/const PROC_DONE_HIT_MASK = (0x[\da-f]+)/i)[1]);
assert.equal(doneHitMask & 0x00040000, 0x00040000, "DoT/HoT ticks must remain proc sources");
const spellMgrSource = fs.readFileSync(path.resolve(
    __dirname,
    "../../../../tswow/cores/TrinityCore/src/server/game/Spells/SpellMgr.h",
), "utf8");
assert.match(spellMgrSource, /PROC_FLAG_DONE_PERIODIC\s*=\s*0x00040000/);
const auraEffectsSource = fs.readFileSync(path.resolve(
    __dirname,
    "../../../../tswow/cores/TrinityCore/src/server/game/Spells/Auras/SpellAuraEffects.cpp",
), "utf8");
assert.match(
    auraEffectsSource,
    /ProcSkillsAndAuras\(caster, target, procAttacker, procVictim, PROC_SPELL_TYPE_DAMAGE, PROC_SPELL_PHASE_HIT/,
);
assert.match(
    auraEffectsSource,
    /ProcSkillsAndAuras\(caster, (?:caster|target), PROC_FLAG_DONE_PERIODIC, PROC_FLAG_TAKEN_PERIODIC, PROC_SPELL_TYPE_HEAL, PROC_SPELL_PHASE_HIT/,
);
assert.match(dataSource, /const PROC_TYPE_DAMAGE = 0x1/);
assert.match(dataSource, /const PROC_TYPE_HEAL = 0x2/);
assert.match(dataSource, /const PROC_PHASE_HIT = 0x2/);
assert.doesNotMatch(dataSource, /PROC_ATTR_CANT_PROC_FROM_ITEM_CAST/);
assert.match(dataSource, /VAMPIRISM_HEAL\.Attributes\.TRIGGER_CAN_TRIGGER_PROC\.set\(true\)/);
assert.match(dataSource, /THORNS_REFLECT\.Attributes\.TRIGGER_CAN_TRIGGER_PROC\.set\(true\)/);
assert.match(dataSource, /std\.Spells\.create\(CUSTOM_STATS_MODULE, "vampirism-heal", 2061, false\)/);
assert.match(dataSource, /VAMPIRISM_HEAL\.row\.SpellVisualID\.set\(\[0, 0\]\)/);
assert.match(dataSource, /std\.Spells\.create\(CUSTOM_STATS_MODULE, "thorns-reflect", 12654, false\)/);
assert.match(dataSource, /VAMPIRISM_HEAL\.Attributes\.clearAll\(\)/);
assert.match(dataSource, /THORNS_REFLECT\.Attributes\.clearAll\(\)/);
assert.match(dataSource, /VAMPIRISM_HEAL_EFFECT\.BonusMultiplier\.set\(0\)/);
assert.match(dataSource, /THORNS_REFLECT_EFFECT\.BonusMultiplier\.set\(0\)/);
assert.match(dataSource, /\.Aura\.PROC_TRIGGER_SPELL\.set\(\)/);
assert.match(dataSource, /driver\.Attributes\.clearAll\(\)/);
assert.match(dataSource, /driver\.Attributes\.CAN_PROC_WITH_TRIGGERED\.set\(true\)/);
assert.match(dataSource, /\(proc\.TriggerMask as any\)\.set\(PROC_DONE_HIT_MASK\)/);
assert.match(dataSource, /\(proc\.TypeMask as any\)\.set\(effect\.kind == "damage" \? PROC_TYPE_DAMAGE : PROC_TYPE_HEAL\)/);
assert.match(dataSource, /\(proc\.PhaseMask as any\)\.set\(PROC_PHASE_HIT\)/);
assert.match(dataSource, /proc\.AttributesMask\.clearAll\(\)/);
assert.match(dataSource, /itemSpell\.Trigger\.set\(ON_EQUIP\)/);
assert.match(dataSource, /itemSpell\.Trigger\.get\(\)\) == CHANCE_ON_HIT/);
assert.match(dataSource, /spell\.Proc\.exists\(\)/);
assert.match(dataSource, /spell\.Proc\.TriggerMask\.get\(\)/);
assert.match(dataSource, /return tier\.choices\[itemEntry % tier\.choices\.length\]/);
assert.match(dataSource, /std\.Spells\.create\([\s\S]*?PROC_DRIVER_BASE,[\s\S]*?false,[\s\S]*?\)/);
assert.ok((dataSource.match(/maxItemLevel:/g) || []).length >= 20, "weapon effects must keep several power tiers");
for (const [start, end] of [
    ["const MELEE_TIERS", "const RANGED_TIERS"],
    ["const RANGED_TIERS", "const CASTER_TIERS"],
    ["const CASTER_TIERS", "const HEALER_TIERS"],
]) {
    const section = dataSource.slice(dataSource.indexOf(start), dataSource.indexOf(end));
    assert.match(section, /harmful\(/, `${start} lost damage-triggered effects`);
    assert.match(section, /helpful\(/, `${start} lost intentional hybrid healing-triggered effects`);
}

const spellDbc = fs.readFileSync(path.resolve(
    __dirname,
    "../../default/datasets/dataset/dbc_source/Spell.dbc",
));
const spellRows = spellDbc.readUInt32LE(4);
const spellRowSize = spellDbc.readUInt32LE(12);
const spellOffsets = new Map();
for (let i = 0; i < spellRows; i++) {
    const offset = 20 + i * spellRowSize;
    spellOffsets.set(spellDbc.readUInt32LE(offset), offset);
}
const catalogCall = /\b(harmful|helpful)\(\s*(\d+)\s*,\s*([^)]+)\)/g;
const harmfulIds = new Set();
const helpfulIds = new Set();
const configuredChances = new Map();
let match;
while ((match = catalogCall.exec(dataSource))) {
    const kind = match[1];
    const chance = Number(match[2]);
    assert.ok([2, 5, 10].includes(chance), `unsupported ${kind} proc chance: ${chance}`);
    const ids = match[3].match(/\d+/g) || [];
    for (const spellId of ids.map(Number)) {
        const targetSet = kind == "harmful" ? harmfulIds : helpfulIds;
        targetSet.add(spellId);
        const key = `${kind}-${spellId}`;
        assert.ok(
            !configuredChances.has(key) || configuredChances.get(key) == chance,
            `${key} is configured with conflicting proc chances`,
        );
        configuredChances.set(key, chance);
        const offset = spellOffsets.get(spellId);
        assert.ok(offset, `weapon effect spell ${spellId} is missing from Spell.dbc`);
        assert.ok(
            [0, 1, 2].some(effect => spellDbc.readUInt32LE(offset + 284 + effect * 4) != 0),
            `weapon effect spell ${spellId} has no effect`,
        );
        assert.equal(
            [0, 1, 2].some(effect =>
                spellDbc.readUInt32LE(offset + 284 + effect * 4) == 6
                && spellDbc.readUInt32LE(offset + 380 + effect * 4) == 42),
            false,
            `weapon effect spell ${spellId} is itself a proc driver`,
        );
        assert.equal(
            [0, 1, 2].some(effect => spellDbc.readUInt32LE(offset + 284 + effect * 4) == 19),
            false,
            `weapon effect spell ${spellId} creates recursive autoattacks`,
        );
        assert.equal(
            [0, 1, 2].some(effect =>
                [3, 8, 23, 53, 62, 89].includes(spellDbc.readUInt32LE(offset + 380 + effect * 4))),
            false,
            `weapon effect spell ${spellId} creates recursive periodic events`,
        );
        assert.equal(
            spellDbc.readUInt32LE(offset + 24) & 0x40000000,
            0,
            `weapon effect spell ${spellId} can recursively trigger direct procs`,
        );
        assert.equal(
            spellDbc.readUInt32LE(offset + 28) & 0x00000200,
            0,
            `weapon effect spell ${spellId} can recursively trigger direct procs`,
        );
    }
}
assert.ok(harmfulIds.size >= 53, `harmful weapon-effect pool lost variety: ${harmfulIds.size} spells`);
assert.ok(helpfulIds.size >= 60, `helpful weapon-effect pool lost variety: ${helpfulIds.size} spells`);
assert.ok(
    new Set([...harmfulIds, ...helpfulIds]).size >= 113,
    "weapon-effect catalog must remain larger than the former 93-spell pool",
);
assert.deepEqual(
    [...harmfulIds].filter(spellId => helpfulIds.has(spellId)),
    [],
    "a payload cannot be both damage-triggered and healing-triggered",
);
const addedHarmfulTargeted = [
    11374, 13490, 13524, 15848, 17230, 11960, 16871,
    17505, 19755, 31604, 12541, 31552, 30113,
];
for (const spellId of [
    13528, 11791, 16908, 16928, 60431, 60432, 60433, 36482,
    ...addedHarmfulTargeted,
]) {
    assert.ok(harmfulIds.has(spellId), `new harmful effect ${spellId} is missing`);
}
const addedHelpfulTargeted = [
    21153, 28093, 28866, 30470, 32600, 34775, 40480, 60064,
    60302, 60437, 64741, 65019, 67669, 67671, 71568, 71872,
];
for (const spellId of [
    21970, 10342, 52419, 43738, 52021, 35078, 45058, 40408,
    60229, 60233, 60234, 64951, 67371, 67378, 71633, 75477,
    ...addedHelpfulTargeted,
]) {
    assert.ok(helpfulIds.has(spellId), `new helpful effect ${spellId} is missing`);
}
for (const [ids, implicitTarget, kind] of [
    [addedHarmfulTargeted, 6, "harmful"],
    [addedHelpfulTargeted, 1, "helpful"],
]) {
    for (const spellId of ids) {
        const offset = spellOffsets.get(spellId);
        for (let effect = 0; effect < 3; effect++) {
            if (spellDbc.readUInt32LE(offset + 284 + effect * 4) == 0) continue;
            assert.equal(
                spellDbc.readUInt32LE(offset + 344 + effect * 4),
                implicitTarget,
                `${kind} effect ${spellId} has an unsafe implicit target`,
            );
        }
    }
}
for (const scriptBoundDriver of [37705, 60510, 37657, 54841, 67712, 40971, 64415, 71880, 71892, 71903]) {
    assert.doesNotMatch(dataSource, new RegExp(`\\b${scriptBoundDriver}\\b`));
}

const masterySource = fs.readFileSync(path.resolve(__dirname, "../livescripts/mastery.ts"), "utf8");
assert.match(masterySource, /GetLootType\(\)/);
assert.match(masterySource, /GameObject\.OnGenerateLoot/);
assert.match(masterySource, /Creature\.OnGenerateSkinningLoot/);
assert.doesNotMatch(masterySource, /GetLootOwnerGUID\(\)/);

const itemAffixSource = fs.readFileSync(path.resolve(__dirname, "../livescripts/item-affixes.ts"), "utf8");
assert.match(itemAffixSource, /BANK_CONTAINER = -1/);
assert.match(itemAffixSource, /BANK_BAG_CLIENT_END = 11/);

const livescriptMain = fs.readFileSync(path.resolve(__dirname, "../livescripts/livescripts.ts"), "utf8");
assert.doesNotMatch(livescriptMain, /WeaponPassives|weapon-passives/);
assert.equal(fs.existsSync(path.resolve(__dirname, "../livescripts/weapon-passives.ts")), false);
const addonSource = fs.readFileSync(path.resolve(__dirname, "../addon/stats-ui.ts"), "utf8");
assert.doesNotMatch(addonSource, /PASSIVE_COLOR|addWeaponPassive|OnTooltipSetItem/);
const formulaSource = fs.readFileSync(path.resolve(__dirname, "../shared/StatFormula.ts"), "utf8");
assert.doesNotMatch(formulaSource, /WEAPON_PASSIVE|weaponPassiveKind/);

console.log("custom-stats formula/protocol/weapon-effect invariants: ok");
