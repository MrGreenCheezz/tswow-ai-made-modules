const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));

const datascriptPath = path.join(__dirname, "../datascripts/datascripts.ts");
const datascriptSource = fs.readFileSync(datascriptPath, "utf8");
assert.match(
    datascriptSource,
    /function suppressPassiveProcAnimation[\s\S]{0,300}getRefCopy\(\)[\s\S]{0,100}\.PrecastKit\.set\(0\)[\s\S]{0,100}\.CastKit\.set\(0\)/,
    "passive player procs must clear cloned caster animation kits",
);
assert.match(
    datascriptSource,
    /suppressCasterAnimation: boolean = true[\s\S]{0,500}if \(suppressCasterAnimation\) suppressPassiveProcAnimation\(spell\)/,
    "all player talent triggers must suppress inherited caster animations",
);
assert.match(
    datascriptSource,
    /function makeCompanionTrigger[\s\S]{0,500}}, false\);[\s\S]*const companionBleedIds[\s\S]{0,500}}, false,/,
    "companion-triggered effects must preserve creature animations",
);
assert.doesNotMatch(
    datascriptSource,
    /\.Aura\.MOD_THREAT\.set\(\)[\s\S]{0,180}\.School\./,
    "MOD_THREAT has no fluent .School field; use EffectMiscValueA",
);
assert.match(
    datascriptSource,
    /companionTankThreat\.MiscValueA\.set\(127\)/,
    "companion threat aura must cover all seven damage schools",
);
assert.strictEqual(
    (datascriptSource.match(/\.BonusData\.DirectBonus\.set\(/g) || []).length,
    3,
    "three direct damage/heal payloads must scale from spell power",
);
assert.strictEqual(
    (datascriptSource.match(/\.BonusData\.DotBonus\.set\(/g) || []).length,
    2,
    "two periodic payloads must scale from spell power",
);
assert.strictEqual(
    (datascriptSource.match(/\.BonusData\.APBonus\.set\(/g) || []).length,
    1,
    "weapon shockwave must scale from attack power",
);
assert.strictEqual(
    (datascriptSource.match(/\.BonusData\.APDotBonus\.set\(/g) || []).length,
    1,
    "deep wounds must scale from attack power",
);
assert.strictEqual(
    (datascriptSource.match(/\.PointsPerLevel\.set\(/g) || []).length,
    4,
    "armor and absorb payloads must scale from caster level",
);
assert.match(
    datascriptSource,
    /const clarityIds = \[1, 2, 3\][\s\S]{0,500}\.Type\.ENERGIZE_PCT\.set\(\)/,
    "enlightenment must restore a percentage of maximum mana",
);
const playerProcBlock = datascriptSource.slice(
    datascriptSource.indexOf("for (const proc of PROCS)"),
    datascriptSource.indexOf("const COMPANION_PROCS"),
);
const procChanceWrite = playerProcBlock.indexOf("p.Chance.set(");
const procSqlWrite = playerProcBlock.indexOf("p.ProcsPerMinute.set(0);");
const procPhaseWrite = playerProcBlock.indexOf("p.PhaseMask.HIT.set(true);");
assert.ok(
    procChanceWrite >= 0 && procChanceWrite < procSqlWrite && procSqlWrite < procPhaseWrite,
    "player procs must create spell_proc after DBC fields and before SQL-only phase filters",
);
const companionProcBlock = datascriptSource.slice(
    datascriptSource.indexOf("for (const proc of COMPANION_PROCS)"),
    datascriptSource.indexOf("/* ------------------------------ активки МАГИИ"),
);
const companionProcChanceWrite = companionProcBlock.indexOf("p.Chance.set(");
const companionProcSqlWrite = companionProcBlock.indexOf("p.ProcsPerMinute.set(0);");
const companionProcPhaseWrite = companionProcBlock.indexOf("p.PhaseMask.HIT.set(true);");
assert.ok(
    companionProcChanceWrite >= 0
        && companionProcChanceWrite < companionProcSqlWrite
        && companionProcSqlWrite < companionProcPhaseWrite,
    "companion procs must create spell_proc after DBC fields and before SQL-only phase filters",
);

function loadTsModule(file, requireFn = require) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
    }).outputText;
    const module = { exports: {} };
    new Function("exports", "module", "require", "__dirname", output)(
        module.exports,
        module,
        requireFn,
        path.join(path.dirname(file), "build"),
    );
    return module.exports;
}

const defs = loadTsModule(path.join(__dirname, "../datascripts/shared/TalentDefs.ts"));
const trees = [
    defs.CORE_TREE,
    defs.FIRE_TREE,
    defs.WEAPON_TREE,
    defs.VITALITY_TREE,
    defs.COMPANION_TREE,
];
const expectedMetrics = new Map([
    [defs.TREE_CORE, [12, 42]],
    [defs.TREE_FIRE, [15, 40]],
    [defs.TREE_WEAPON, [15, 39]],
    [defs.TREE_VITALITY, [12, 37]],
    [defs.TREE_COMPANION, [14, 39]],
]);

assert.strictEqual(new Set(trees.map(tree => tree.treeId)).size, trees.length);
assert.strictEqual(defs.classPointsAt(80), 36);
assert.strictEqual(defs.specPointsAt(80), 35);

const allRankKeys = new Set();
const currentRankKeys = new Set();
for (const tree of trees) {
    assert.strictEqual(defs.getTree(tree.treeId), tree);
    const nodeIds = new Set(tree.nodes.map(node => node.id));
    assert.strictEqual(nodeIds.size, tree.nodes.length, `${tree.name}: duplicate node id`);

    let rankTotal = 0;
    for (const node of tree.nodes) {
        const englishName = defs.talentName(tree.treeId, node, false);
        const englishDescription = defs.talentDescription(tree.treeId, node, false);
        assert.doesNotMatch(englishName, /[А-Яа-яЁё]/, `${tree.name}/${node.name}: missing English name`);
        assert.doesNotMatch(englishDescription, /[А-Яа-яЁё]/, `${tree.name}/${node.name}: missing English description`);
        assert.ok(node.ranks.length > 0, `${tree.name}/${node.name}: no ranks`);
        assert.ok(Number.isInteger(node.gate) && node.gate >= 0, `${tree.name}/${node.name}: invalid gate`);
        for (const requirement of node.requires) {
            assert.ok(nodeIds.has(requirement), `${tree.name}/${node.name}: missing requirement ${requirement}`);
            assert.notStrictEqual(requirement, node.id, `${tree.name}/${node.name}: self requirement`);
        }
        for (const rank of node.ranks) {
            const key = `${typeof rank}:${rank}`;
            assert.strictEqual(allRankKeys.has(key), false, `duplicate rank key ${rank}`);
            allRankKeys.add(key);
            if (typeof rank === "string") currentRankKeys.add(rank);
        }
        rankTotal += node.ranks.length;
    }

    assert.deepStrictEqual(
        [tree.nodes.length, rankTotal],
        expectedMetrics.get(tree.treeId),
        `${tree.name}: unexpected node/rank totals`,
    );
    if (defs.isSpecTree(tree.treeId)) {
        assert.ok(rankTotal >= defs.specPointsAt(80), `${tree.name}: cannot spend all specialization points`);
        for (const node of tree.nodes) {
            assert.ok(node.gate < defs.specPointsAt(80), `${tree.name}/${node.name}: unreachable gate`);
        }
    } else {
        assert.ok(rankTotal >= defs.classPointsAt(80), `${tree.name}: cannot spend all core points`);
    }
}

assert.deepStrictEqual(defs.findNode(defs.CORE_TREE, 4).requires, [7]);
assert.deepStrictEqual(defs.findNode(defs.CORE_TREE, 8).requires, [2]);
assert.deepStrictEqual(defs.findNode(defs.FIRE_TREE, 9).requires, [1]);
assert.deepStrictEqual(defs.findNode(defs.VITALITY_TREE, 9).requires, [5]);
const ignite = defs.findNode(defs.FIRE_TREE, 37);
assert.match(ignite.desc, /Критический урон заклинанием/);
assert.doesNotMatch(ignite.desc, /Критические эффекты/);

const companion = defs.getTree(defs.TREE_COMPANION);
assert.ok(companion);
assert.strictEqual(companion, defs.COMPANION_TREE);
assert.strictEqual(companion.name, "СПУТНИКИ");
assert.strictEqual(defs.isSpecTree(defs.TREE_COMPANION), true);
assert.strictEqual(
    crypto.createHash("sha256").update(JSON.stringify(companion)).digest("hex"),
    "a6535dc6a01d6316cb3ff98d1d171ead83b2af7d763927316424561b63c5a34d",
    "companion tree changed during the player-tree revision",
);
const randomMagic = companion.nodes.find(node => node.id === 9);
assert.match(randomMagic.desc, /классовую способность из набора камней/);
assert.doesNotMatch(randomMagic.desc, /шести школ/);

// Execute the datascript against a no-op fluent registry. This does not build
// data or write files, but proves that every visible and legacy rank is put in
// GEN_TALENTS and that no module/string id is created twice.
function fluentEntity(id) {
    let proxy;
    const callable = function () {};
    proxy = new Proxy(callable, {
        get(target, property) {
            if (property === "ID") return id;
            if (property === "length") return 0;
            if (property === "HasSQL") return () => true;
            if (property === "getSQL") return () => proxy;
            if (property === Symbol.toPrimitive) return () => id;
            return proxy;
        },
        apply() { return proxy; },
    });
    return proxy;
}

const createdSpellKeys = new Set();
const generatedWrites = new Map();
let nextSpellId = 1000;
const fakeStd = {
    Spells: {
        create(moduleName, key) {
            const fullKey = `${moduleName}:${key}`;
            assert.strictEqual(createdSpellKeys.has(fullKey), false, `duplicate datascript spell key ${fullKey}`);
            createdSpellKeys.add(fullKey);
            return fluentEntity(nextSpellId++);
        },
    },
};
loadTsModule(datascriptPath, id => {
    if (id === "wow/wotlk") return { std: fakeStd };
    if (id === "./shared/TalentDefs") return defs;
    if (id === "fs") {
        return {
            mkdirSync() {},
            writeFileSync(file, contents) { generatedWrites.set(file, contents); },
        };
    }
    if (id === "path") return path;
    throw new Error(`unexpected datascript import ${id}`);
});
const generatedTalentSource = [...generatedWrites.entries()]
    .find(([file]) => /retail-talents[\\/]livescripts[\\/]generated_talents\.ts$/.test(file));
assert.ok(generatedTalentSource, "datascript did not produce the talent bridge");
const generatedRankKeys = new Set(
    [...generatedTalentSource[1].matchAll(/\["([^"]+)"\]:/g)].map(match => match[1]),
);
for (const key of currentRankKeys) {
    assert.ok(generatedRankKeys.has(key), `visible talent rank missing from GEN_TALENTS: ${key}`);
}
const legacyRanks = [
    ["magic-power", 4, 5], ["magic-crit", 4, 5], ["magic-cost", 4, 5],
    ["magic-school-resonance", 4, 5], ["magic-force-flow", 4, 5],
    ["magic-crit-damage", 1, 3], ["magic-clarity", 1, 3],
    ["magic-stability", 1, 3], ["magic-inner-spark", 1, 3],
    ["magic-bright-channel", 1, 3], ["magic-clean-formula", 1, 3],
    ["magic-quiet-weave", 1, 2], ["magic-astral-focus", 1, 5],
    ["magic-fast-formula", 1, 3], ["magic-free-pulse", 1, 3],
    ["magic-absolute-hit", 1, 3], ["magic-great-flare", 1, 3],
    ["magic-great-heal", 1, 3], ["magic-quick-will", 1, 2],
    ["magic-energy-cascade", 1, 3], ["magic-stable-mana", 1, 3],
    ["magic-focus-limit", 1, 2], ["magic-archmage", 1, 5],
    ["magic-high-healer", 1, 5], ["magic-superconductivity", 1, 3],
    ["magic-perfect-formula", 1, 3],
];
for (const [base, first, last] of legacyRanks) {
    for (let rank = first; rank <= last; rank++) {
        assert.ok(generatedRankKeys.has(`${base}-${rank}`), `legacy rank missing from bridge: ${base}-${rank}`);
    }
}
assert.ok(generatedRankKeys.has("magic-swiftness"), "legacy active missing from bridge");

const rows = [
    { treeId: defs.TREE_CORE, nodeId: 1, rank: 1 },
    { treeId: defs.TREE_FIRE, nodeId: 1, rank: 1 },
    { treeId: defs.TREE_WEAPON, nodeId: 1, rank: 1 },
    { treeId: defs.TREE_VITALITY, nodeId: 1, rank: 1 },
    { treeId: defs.TREE_COMPANION, nodeId: 1, rank: 1 },
];
for (const row of rows) row.Delete = function () { this.deleted = true; };
const container = {
    saves: 0,
    forEach(callback) { rows.filter(row => !row.deleted).forEach(callback); },
    Save() { this.saves++; },
};
const revision = { revision: 1, saves: 0, Save() { this.saves++; } };
const generated = {
    "core-toughness-1": 101,
    "magic-power-1": 102,
    "weapon-mastery-1": 103,
    "vital-gift-1": 104,
    "companion-damage-1": 105,
};
const runtime = loadTsModule(path.join(__dirname, "../livescripts/talents.ts"), id => {
    if (id === "../datascripts/shared/TalentDefs") return defs;
    if (id === "../shared/TalentMessages") {
        return { OP_STATE_REQUEST: 1, OP_LEARN: 2, OP_RESET: 3 };
    }
    if (id === "./talent-db") {
        return {
            RetailTalentRow: { get: () => container },
            RetailTalentRevision: { get: () => revision },
        };
    }
    if (id === "./generated_talents") return { GEN_TALENTS: generated };
    throw new Error(`unexpected import ${id}`);
});
let onLogin;
runtime.RegisterRetailTalents({
    CustomPacket: { OnReceive() {} },
    Player: {
        OnCommand() {},
        OnLogin(callback) { onLogin = callback; },
        OnLevelChanged() {},
        OnSave() {},
    },
});
const learned = new Set(Object.values(generated));
const removed = [];
const messages = [];
const player = {
    GetGUIDLow: () => 1,
    HasSpell: id => learned.has(id),
    RemoveSpell(id) { removed.push(id); learned.delete(id); },
    LearnSpell: id => learned.add(id),
    SendBroadcastMessage: message => messages.push(message),
    GetUInt: () => 0,
    SetUInt() {},
};
onLogin(player, false);
onLogin(player, false);
assert.deepStrictEqual(removed.sort((a, b) => a - b), [101, 102, 103, 104]);
assert.deepStrictEqual(rows.filter(row => !row.deleted).map(row => row.treeId), [defs.TREE_COMPANION]);
assert.strictEqual(learned.has(105), true);
assert.strictEqual(revision.revision, 2);
assert.strictEqual(revision.saves, 1);
assert.strictEqual(messages.filter(message => /таланты персонажа обновлены/i.test(message)).length, 1);

console.log("talent definitions and revision migration: ok");
