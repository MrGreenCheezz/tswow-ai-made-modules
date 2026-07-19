const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const moduleRoot = path.resolve(__dirname, "..");
const typescript = require(path.resolve(moduleRoot, "..", "..", "node_modules", "typescript"));
const tstl = require(path.resolve(moduleRoot, "..", "..", "node_modules", "typescript-to-lua"));

const previousTsLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    const output = typescript.transpileModule(source, {
        compilerOptions: {
            module: typescript.ModuleKind.CommonJS,
            target: typescript.ScriptTarget.ES2018,
            esModuleInterop: true,
        },
        fileName: filename,
    }).outputText;
    module._compile(output, filename);
};

const echoDefsPath = path.join(moduleRoot, "datascripts", "shared", "EchoDefs.ts");
assert.ok(fs.existsSync(echoDefsPath), "EchoDefs must stay under datascripts/shared for both builders");
const { ECHOES } = require(echoDefsPath);
const collectionDefsPath = path.join(moduleRoot, "datascripts", "shared", "CollectionEchoDefs.ts");
assert.ok(fs.existsSync(collectionDefsPath), "collection catalog must stay under datascripts/shared");
const { COLLECTION_ECHOES } = require(collectionDefsPath);
const {
    rollEchoOffer,
    validateEchoChoice,
} = require(path.join(moduleRoot, "shared", "EchoRoll.ts"));

const expectedKeys = [
    "strength-training", "agility-boost", "mind-expansion", "spiritual-fortitude",
    "iron-constitution", "mana-regeneration", "reinforced-shielding", "mystic-potency",
    "brutal-might", "warm-blooded", "hardened-skin", "hardened-resolve", "swift-step",
    "enhanced-recovery", "keen-aim", "crushing-force", "quick-hands", "armor-penetration",
    "expertise-drills", "mana-reservoir", "steady-channeling", "steady-casting",
    "subtle-presence", "provoking-presence", "efficient-casting", "glass-canon", "leadfoot",
    "fortress-soul", "the-last-wall", "overwhelming-restoration",
];
const expectedCollectionKeys = [
    "blade-tempest", "broodmothers-fury", "call-of-the-lich-king",
    "chill-of-the-bone-wyrm", "frostfire-paradox", "frostguard-carapace",
    "mutagenic-fumes", "nether-lords-command", "overwhelming-restoration",
    "sanctum-sentries", "spellweave", "twin-casting",
    "blighted-sky", "brittle-forging", "broodmothers-webbing",
    "champions-rally", "cinders-of-the-sanctum", "constellations",
    "curse-of-the-plaguebringer", "dark-nucleus", "deathwhispers-barrier",
    "defile", "demonic-awakening", "scorched-path", "slime-spray",
    "slimebound-husk", "static-overflow", "stone-shatter",
    "storm-conductor", "twilight-combustion", "twilight-equilibrium",
    "widows-venom",
];
const expectedAdvancedCollectionKeys = expectedCollectionKeys.slice(12);

assert.equal(ECHOES.length, 30);
assert.deepEqual(ECHOES.map(echo => echo.key), expectedKeys, "persisted catalog order changed");
assert.equal(new Set(ECHOES.map(echo => echo.key)).size, 30);
assert.equal(new Set(ECHOES.map(echo => echo.sourceId)).size, 30);
assert.equal(new Set(ECHOES.map(echo => echo.groupId)).size, 30);
assert.ok(ECHOES.every(echo => echo.sourceClassMask > 0 && echo.sourceClassMask <= 1535));
assert.ok(ECHOES.every(echo => !("classMask" in echo)), "operational class gates break custom HERO classes");
assert.deepEqual(
    [0, 1, 2, 3].map(quality => ECHOES.filter(echo => echo.quality === quality).length),
    [20, 5, 4, 1],
);
assert.equal(ECHOES.filter(echo => echo.sourceRequiredSpell !== 0).length, 6);
assert.equal(ECHOES.reduce((count, echo) => count + echo.effects.length, 0), 38);
assert.ok(ECHOES.every(echo => echo.maxStack > 0 && echo.maxStack <= 80));
assert.ok(ECHOES.every(echo => echo.nameRu && echo.descriptionRu));
assert.ok(ECHOES.every(echo => echo.nameRu !== echo.name && echo.descriptionRu !== echo.description));
assert.equal(ECHOES.find(echo => echo.key === "efficient-casting").maxStack, 10);
assert.ok(ECHOES.flatMap(echo => echo.effects).every(effect => !effect.aura.includes("DUMMY")));
assert.equal(COLLECTION_ECHOES.length, 32);
assert.deepEqual(COLLECTION_ECHOES.map(echo => echo.key), expectedCollectionKeys,
    "persisted collection catalog order changed");
assert.deepEqual(
    COLLECTION_ECHOES.map(echo => echo.catalogNumber),
    [
        70, 79, 87, 93, 246, 247, 316, 325, 332, 388, 415, 509,
        72, 78, 80, 91, 95, 97, 138, 141, 142, 143, 150, 393,
        412, 413, 425, 433, 466, 507, 508, 545,
    ],
);
assert.equal(new Set(COLLECTION_ECHOES.map(echo => echo.sourceId)).size, 32);
assert.ok(COLLECTION_ECHOES.every(echo => echo.nameRu && echo.descriptionRu));
const lichKing = COLLECTION_ECHOES.find(echo => echo.key === "call-of-the-lich-king");
const sanctumSentries = COLLECTION_ECHOES.find(echo => echo.key === "sanctum-sentries");
const netherLord = COLLECTION_ECHOES.find(echo => echo.key === "nether-lords-command");
const staticOverflow = COLLECTION_ECHOES.find(echo => echo.key === "static-overflow");
assert.match(lichKing.description, /visible servant with its own 30 sec duration/i);
assert.doesNotMatch(lichKing.description, /shared duration/i);
assert.match(sanctumSentries.description, /two visible sentries/i);
assert.match(netherLord.description, /another proc cannot create, refresh, or relocate it/i);
assert.doesNotMatch(netherLord.description, /new proc refreshes and relocates/i);
assert.match(staticOverflow.description, /after charging for 10 sec in combat/i);
assert.match(staticOverflow.description, /begins the next 10 sec charge/i);

const iconDirectory = path.join(moduleRoot, "assets", "Interface", "Icons");
const iconFiles = fs.readdirSync(iconDirectory).filter(name => name.toLowerCase().endsWith(".blp"));
const allIconPaths = new Set([...ECHOES, ...COLLECTION_ECHOES].map(echo => echo.icon.toLowerCase()));
assert.ok(iconFiles.length >= allIconPaths.size);
assert.equal(new Set(ECHOES.map(echo => echo.icon.toLowerCase())).size, 30);
for (const echo of [...ECHOES, ...COLLECTION_ECHOES]) {
    assert.match(echo.icon, /^Interface\\Icons\\/i);
    const filename = `${echo.icon.replace(/^Interface\\Icons\\/i, "")}.blp`;
    const bytes = fs.readFileSync(path.join(iconDirectory, filename));
    assert.ok(bytes.length >= 20);
    assert.ok(["BLP1", "BLP2"].includes(bytes.subarray(0, 4).toString()), filename);
}

const emptyRanks = ECHOES.map(() => 0);
const firstOffer = rollEchoOffer(emptyRanks, () => 0, 3);
assert.equal(firstOffer.length, 3);
assert.equal(new Set(firstOffer).size, 3);
assert.ok(firstOffer.every(index => validateEchoChoice(emptyRanks, firstOffer, index)));

const eligibleOutsideOffer = ECHOES.findIndex((echo, index) => !firstOffer.includes(index));
assert.ok(eligibleOutsideOffer >= 0);
assert.equal(validateEchoChoice(emptyRanks, firstOffer, eligibleOutsideOffer), false);
assert.equal(validateEchoChoice(emptyRanks, firstOffer, -1), false);
assert.equal(validateEchoChoice(emptyRanks, firstOffer, 0.5), false);

const cappedRanks = emptyRanks.slice();
cappedRanks[firstOffer[0]] = ECHOES[firstOffer[0]].maxStack;
assert.equal(validateEchoChoice(cappedRanks, firstOffer, firstOffer[0]), false);
assert.ok(!rollEchoOffer(cappedRanks, () => 0, 3).includes(firstOffer[0]));

const lastEligibleRanks = ECHOES.map(echo => echo.maxStack);
lastEligibleRanks[0]--;
assert.deepEqual(rollEchoOffer(lastEligibleRanks, () => 0, 3), [0]);

const simulatedRanks = emptyRanks.slice();
let randomState = 0x5eed1234;
const deterministicRandom = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
};
for (let pick = 0; pick < 79; pick++) {
    const offer = rollEchoOffer(simulatedRanks, deterministicRandom, 3);
    assert.equal(offer.length, 3, `pick ${pick + 1} did not have three choices`);
    assert.equal(new Set(offer).size, 3);
    const selected = offer[pick % 3];
    assert.ok(validateEchoChoice(simulatedRanks, offer, selected));
    simulatedRanks[selected]++;
    assert.ok(simulatedRanks[selected] <= ECHOES[selected].maxStack);
}
assert.equal(simulatedRanks.reduce((sum, rank) => sum + rank, 0), 79);

const dataSource = fs.readFileSync(path.join(moduleRoot, "datascripts", "datascripts.ts"), "utf8");
assert.match(dataSource, /from "\.\/shared\/EchoDefs"/);
assert.doesNotMatch(dataSource, /\.\.\/shared\/EchoDefs/);
assert.match(
    dataSource,
    /function suppressPassiveProcAnimation[\s\S]*?Visual\.get\(\) == 0[\s\S]*?Visual\.getRefCopy\(\)[\s\S]*?PrecastKit\.set\(0\)[\s\S]*?CastKit\.set\(0\)/,
    "passive player procs must clone their visual and remove only caster animation kits",
);
const damageSpellFactory = dataSource.match(
    /function createDamageSpell[\s\S]*?function createAreaDamageSpell/,
)[0];
assert.match(
    damageSpellFactory,
    /passivePlayerCast[\s\S]*?if \(passivePlayerCast\) suppressPassiveProcAnimation\(spell\)/,
    "damage helpers need an explicit animationless player-cast path",
);
for (const key of [
    "collection-blade-tempest-hit",
    "collection-deep-breath-hit",
    "collection-frost-breath-hit",
    "collection-frostfire-shatter-hit",
    "collection-mutagenic-hit",
]) {
    assert.match(
        dataSource,
        new RegExp(`create(?:Area)?DamageSpell\\("${key}"[^;\\n]*, true\\)`),
        `${key} must not animate the player when it procs`,
    );
}
assert.match(
    dataSource,
    /function createAdvancedDamage[\s\S]*?createDamageSpell\([^;]*?, true\)/,
    "all advanced damage procs must use the animationless helper path",
);
assert.match(dataSource, /function createAreaVisualSpell[\s\S]*?suppressPassiveProcAnimation\(spell\)/);
assert.match(dataSource, /function createAdvancedStun[\s\S]*?suppressPassiveProcAnimation\(spell\)/);
assert.match(dataSource, /function createAdvancedHeal[\s\S]*?suppressPassiveProcAnimation\(spell\)/);
assert.match(dataSource, /netherFlamesTick\.Visual\.set\(10379\);\s*suppressPassiveProcAnimation\(netherFlamesTick\)/);
assert.match(dataSource, /suppressPassiveProcAnimation\(deathwhisperBarrier\)/);
assert.match(dataSource, /suppressPassiveProcAnimation\(scorchedSlow\)/);
assert.doesNotMatch(
    dataSource,
    /create(?:Area)?DamageSpell\("collection-(?:lich-servant|sanctum-sentry|nether-lightning|nether-flamestrike)-hit"[^;\n]*, true\)/,
    "NPC proc casters must keep their own cast animation",
);
assert.match(dataSource, /PointsBase\.set\(definition\.pointsBase\)/);
assert.match(dataSource, /IS_HIDDEN_IN_SPELLBOOK\.set\(true\)/);
assert.match(dataSource, /Tags\.addUnique\(MODULE, "spell\/" \+ definition\.key\)/);
assert.match(dataSource, /Name\.ruRU\.set\(definition\.nameRu\)/);
assert.match(dataSource, /Tags\.addUnique\(MODULE, "item\/echo-choice"\)/);
assert.match(dataSource, /Tags\.addUnique\(MODULE, "item\/echo-reset"\)/);
assert.match(dataSource, /Charges\.set\(1, "DELETE_ITEM"\)/);
assert.match(dataSource, /choiceItem\.Price\.setAsGold\(0, 5, 1\)/);
assert.match(dataSource, /resetItem\.Price\.setAsGold\(0, 10, 1\)/);
assert.match(dataSource, /CreatureTemplates\.create\(MODULE, "echo-vendor", 5193\)/);
assert.match(dataSource, /NPCFlags\.VENDOR\.set\(true\)/);
assert.match(dataSource, /Vendor\.add\(choiceItem\.ID\)/);
assert.match(dataSource, /Vendor\.add\(resetItem\.ID\)/);
assert.match(dataSource, /collectionSlotItem\.Price\.setAsGold\(0, 30000, 1\)/);
assert.match(dataSource, /collectionSlotItem\.MaxStack\.set\(128\)/);
assert.match(dataSource, /collectionSlotItem\.Bonding\.BINDS_ON_PICKUP\.set\(\)/);
assert.match(dataSource, /collectionSlotItem\.Spells\.clearAll\(\)/);
assert.match(dataSource, /Vendor\.add\(collectionSlotItem\.ID\)/);
assert.match(dataSource, /Tags\.addUnique\(MODULE, "item\/collection-slot-expand"\)/);
assert.match(dataSource, /echoVendor\.NPCFlags\.GOSSIP\.set\(true\)/);
assert.match(dataSource, /Tags\.addUnique\(MODULE, "npc\/echo-vendor"\)/);
assert.match(dataSource, /from "\.\/shared\/CollectionEchoDefs"/);
assert.match(dataSource, /"collection-book-" \+ definition\.key/);
assert.match(dataSource, /"spell\/collection-" \+ definition\.key/);
assert.match(
    dataSource,
    /createDummyAura\("collection-plaguebringer-curse"[\s\S]*?8000, 0, 2000, true\)/,
    "the jumping curse must deal its tick before moving instead of removing a native DoT early",
);
assert.match(dataSource, /createAdvancedDamage\("collection-plaguebringer-curse-hit"/);
assert.doesNotMatch(dataSource, /collection-slime-spray-icd/,
    "Slime Spray's documented per-target 15% proc must not have a hidden global cooldown");
assert.match(
    dataSource,
    /function createAdvancedHeal[\s\S]*?CANT_TRIGGER_PROC\.set\(true\);[\s\S]*?CANT_CRIT\.set\(true\);/,
    "scripted percentage heals must not randomly crit",
);
const explicitAdvancedHelperKeys = [
    ...dataSource.matchAll(
        /(?:createDummyAura|createAdvanced(?:Damage|Dot|Buff|Heal|Stun))\(\s*"([^"]+)"/g,
    ),
    ...dataSource.matchAll(/std\.Spells\.create\(MODULE,\s*"([^"]+)"/g),
].map(match => match[1]);
assert.deepEqual(
    explicitAdvancedHelperKeys.filter(key =>
        expectedAdvancedCollectionKeys.includes(key.replace(/^collection-/, ""))),
    [],
    "advanced helper IDs must not collide with collection controller IDs",
);
assert.match(dataSource, /"npc\/collection-lich-servant"/);
assert.match(dataSource, /"npc\/collection-sanctum-sentry"/);
assert.match(dataSource, /"collection-nether-portal",\s*24961/);
assert.match(dataSource, /"npc\/collection-nether-portal"/);
assert.match(
    dataSource,
    /netherPortalCreature\.UnitFlags\.set\(\[\s*"IMMUNE_TO_PC",\s*"IMMUNE_TO_NPC",\s*"NOT_SELECTABLE"\s*\]\)/,
    "the portal must be inert before it is added to the map",
);
assert.match(dataSource, /netherLightningHit\.Visual\.set\(8312\)/);
assert.match(dataSource, /netherLightningHit\.Speed\.set\(12\)/);
assert.match(dataSource, /netherFlamestrikeHit\.Visual\.set\(8394\)/);
assert.match(dataSource, /netherFlamestrikeHit\.Effects\.get\(0\)\.Type\.DUMMY\.set\(\)/);

function collectionSpellDeclaration(key) {
    const marker = `"${key}"`;
    const start = dataSource.indexOf(marker);
    assert.ok(start >= 0, `${key} helper spell is missing`);
    const next = dataSource.indexOf('"collection-', start + marker.length);
    return dataSource.slice(start, next < 0 ? dataSource.length : next);
}

function hasCollectionSpellSetting(key, setting) {
    return setting.test(collectionSpellDeclaration(key))
        || new RegExp(`key == "${key}"[\\s\\S]{0,500}?${setting.source}`).test(dataSource);
}

const expectedSpellVisuals = new Map([
    ["collection-blade-tempest-hit", 10384],
    ["collection-deep-breath-hit", 8256],
    ["collection-lich-servant-hit", 10755],
    ["collection-sanctum-sentry-hit", 9882],
    ["collection-frost-breath-hit", 7862],
    ["collection-frostfire-shatter-hit", 11612],
    ["collection-frostguard-buff", 11151],
    ["collection-mutagenic-hit", 10381],
    ["collection-blighted-sky-hit", 7732],
    ["collection-brittle-shatter-hit", 963],
    ["collection-webbing-hit", 6596],
    ["collection-advanced-stun-3", 5920],
    ["collection-sanctum-cyclone-hit", 143],
    ["collection-falling-star-hit", 1264],
    ["collection-big-bang-hit", 965],
    ["collection-plaguebringer-curse-hit", 11624],
    ["collection-dark-lance-hit", 64],
    ["collection-deathwhisper-pulse", 8069],
    ["collection-defile-hit", 8069],
    ["collection-demonic-form", 12118],
    ["collection-demonic-cleave", 7684],
    ["collection-scorched-path-hit", 143],
    ["collection-mutated-infection", 8197],
    ["collection-mutated-plague", 8197],
    ["collection-sticky-slime-hit", 6596],
    ["collection-poison-slime-hit", 6596],
    ["collection-static-overflow-hit", 36],
    ["collection-stone-shatter-hit", 12594],
    ["collection-storm-conductor-hit", 36],
    ["collection-burning-combustion", 2638],
    ["collection-soul-consumption", 8629],
    ["collection-equilibrium-shadow-hit", 7732],
    ["collection-equilibrium-holy-hit", 3643],
    ["collection-widows-volley-hit", 6596],
    ["collection-widows-venom-dot", 8197],
]);
for (const [key, visual] of expectedSpellVisuals) {
    assert.ok(
        hasCollectionSpellSetting(key, new RegExp(`Visual\\.set\\(${visual}\\)`)),
        `${key} must keep its explicit client visual`,
    );
}
assert.ok(hasCollectionSpellSetting("collection-lich-servant-hit", /Speed\.set\(24\)/));
assert.ok(hasCollectionSpellSetting("collection-dark-lance-hit", /Speed\.set\(20\)/));
assert.ok(hasCollectionSpellSetting("collection-stone-shatter-hit", /Speed\.set\(60\)/));

assert.match(
    dataSource,
    /function createAreaVisualSpell[\s\S]*?TargetType\.DEST_LOCATION\.set\(true\)[\s\S]*?Visual\.set\(visual\)[\s\S]*?Type\.DUMMY\.set\(\)[\s\S]*?ImplicitTargetA\.DEST_DEST\.set\(\)/,
    "ground visuals must be destination-only dummy casts",
);
const expectedAreaVisuals = new Map([
    ["collection-sanctum-cyclone-visual", 10379],
    ["collection-defile-visual", 10406],
    ["collection-scorched-path-visual", 11498],
    ["collection-sticky-slime-visual", 8964],
    ["collection-poison-slime-visual", 8699],
    ["collection-twilight-rift-visual", 9166],
]);
for (const [key, visual] of expectedAreaVisuals) {
    assert.match(
        dataSource,
        new RegExp(`createAreaVisualSpell\\(\\s*"${key}"[^;]*?${visual}\\s*\\)`),
        `${key} destination visual is missing`,
    );
}
const mutagenicVisualDeclaration = collectionSpellDeclaration("collection-mutagenic-visual");
assert.match(dataSource, /std\.Spells\.create\(MODULE, "collection-mutagenic-visual", 38718\)/);
assert.match(mutagenicVisualDeclaration, /Type\.PERSISTENT_AREA_AURA\.set\(\)/);
assert.match(mutagenicVisualDeclaration, /Aura\.PERIODIC_DUMMY\.set\(\)/);
assert.match(mutagenicVisualDeclaration, /Radius\.setSimple\(10\)/);
assert.match(mutagenicVisualDeclaration, /Scale\.Scale\.set\(1\)/);

const spellEffectApi = fs.readFileSync(
    path.resolve(moduleRoot, "..", "..", "node_modules", "wow", "wotlk", "std", "Spell", "SpellEffect.js"),
    "utf8",
);
assert.match(spellEffectApi, /PointsDieSides\.get\(\) > 0[\s\S]*STORED_AS_MINUS_ONE/);

const runtimeSource = fs.readFileSync(path.join(moduleRoot, "livescripts", "echoes.ts"), "utf8");
const advancedRuntimeSource = fs.readFileSync(
    path.join(moduleRoot, "livescripts", "advanced-echoes.ts"),
    "utf8",
);
assert.match(
    runtimeSource,
    /const MUTAGENIC_VISUAL = UTAG\("echoes", "spell\/collection-mutagenic-visual"\)/,
    "Mutagenic Fumes must resolve its dedicated destination visual",
);
const mutagenicTickBlock = runtimeSource.match(
    /function onMutagenicCloudTick[\s\S]*?function onNetherPortalTick/,
)[0];
assert.match(
    mutagenicTickBlock,
    /CastSpellAoF\([^;]*?MUTAGENIC_VISUAL, true\);\s*player\.CastSpellAoF\([^;]*?MUTAGENIC_HIT, true\)/,
    "Mutagenic Fumes must show its ground visual before applying each damage tick",
);
const livescriptEntrySource = fs.readFileSync(
    path.join(moduleRoot, "livescripts", "livescripts.ts"),
    "utf8",
);
const databaseSource = fs.readFileSync(path.join(moduleRoot, "livescripts", "echo-db.ts"), "utf8");
function topLevelLuaLocals(source) {
    const lua = tstl.transpileString(source, {
        luaTarget: tstl.LuaTarget.Lua51,
        noImplicitSelf: true,
    }).file.lua;
    return lua.split(/\r?\n/)
        .filter(line => line.startsWith("local "))
        .reduce((count, line) => count + (
            line.startsWith("local function ")
                ? 1
                : line.slice(6).split("=")[0].split(",").length
        ), 0);
}
assert.ok(topLevelLuaLocals(runtimeSource) <= 190,
    "echoes.ts must leave headroom below Lua 5.1's 200-active-local limit");
assert.ok(topLevelLuaLocals(advancedRuntimeSource) <= 190,
    "advanced-echoes.ts must leave headroom below Lua 5.1's 200-active-local limit");
assert.doesNotMatch(runtimeSource, /EmptyGUID\(/,
    "EmptyGUID is declared in TypeScript but is not exported by the Lua runtime");
assert.doesNotMatch(advancedRuntimeSource, /EmptyGUID\(/,
    "advanced Echoes must not call the unexported EmptyGUID runtime helper");
const syncCollectionAuraBlock = runtimeSource.match(
    /function syncCollectionAura[\s\S]*?function reconcileCollection/,
)[0];
assert.match(syncCollectionAuraBlock, /LearnSpell\(spellId\)/,
    "active passive controllers must have a durable learned-spell owner");
assert.match(syncCollectionAuraBlock, /RemoveSpell\(spellId, false, false\)/,
    "deactivating a collection entry must remove its learned controller spell");
const collectionActiveBlock = runtimeSource.match(
    /function isCollectionActive[\s\S]*?function isCollectionDamageHelper/,
)[0];
assert.match(collectionActiveBlock, /collectionRow\(player, echoIndex\)/);
assert.match(collectionActiveBlock, /syncCollectionAura\(player, echoIndex, true\)/,
    "persisted active slots must repair a missing controller aura on demand");
assert.match(runtimeSource, /frostTargetGUIDs: TSArray<TSGUID> = \[\]/);
const collectionCleanupBlock = runtimeSource.match(
    /function removeCollectionRuntimeAuras[\s\S]*?function resetCollectionMapRuntime/,
)[0];
assert.match(
    collectionCleanupBlock,
    /echoIndex == 3[\s\S]{0,250}?removeTrackedFrostDebuff\(player, BRITTLE\)[\s\S]{0,150}?echoIndex == 4[\s\S]{0,150}?removeTrackedFrostDebuff\(player, BITING_COLD\)/,
    "disabling Chill or Frostfire must remove its persisted target debuffs",
);
assert.ok(
    (runtimeSource.match(/rememberFrostTarget\(player, target\)/g) || []).length >= 2,
    "Brittle and Biting Cold targets must both enter the cleanup tracker",
);
const advancedActiveBlock = advancedRuntimeSource.match(
    /function advancedActive[\s\S]*?function sameGUID/,
)[0];
assert.match(advancedActiveBlock, /EchoCollectionRow\.get\(player\)/);
assert.match(advancedActiveBlock, /LearnSpell\(spellId\)/);
assert.match(advancedActiveBlock, /AddAura\(spellId, player\)/,
    "advanced Echoes must share the collection controller self-repair path");
const runtimeTags = [...runtimeSource.matchAll(/UTAG\("echoes", "spell\/([^"]+)"\)/g)]
    .map(match => match[1])
    .filter(key => expectedKeys.includes(key));
assert.deepEqual(runtimeTags, expectedKeys);
assert.match(runtimeSource, /echoClient\(player\)\.ready = true/);
assert.match(runtimeSource, /offer\.Save\(\);[\s\S]*return true;/);
assert.match(runtimeSource, /indices\[i\] == indices\[j\]/, "stored duplicate offers must be rejected");
assert.match(runtimeSource, /OnCheckCast\(ECHO_CHOICE_USE_SPELL/);
assert.match(runtimeSource, /OnEffect\(ECHO_RESET_USE_SPELL/);
assert.match(runtimeSource, /offerMarker: 0x40000000/);
assert.match(runtimeSource, /offer\.offerForPick = RULES\.offerMarker \+ nextPick/);
assert.match(runtimeSource, /container\.forEach\(row => row\.Delete\(\)\);[\s\S]*clearOffer\(EchoOfferState\.get\(player\)\)/);
assert.doesNotMatch(runtimeSource, /earnedEchoPicks/);
assert.doesNotMatch(runtimeSource, /AddTimer|setTimeout/);
assert.match(runtimeSource, /function offerRandom[\s\S]*seed = \(seed \* 48271\) % modulus/);
const offerRandomSource = runtimeSource.match(/function offerRandom[\s\S]*?function currentOffer/)[0];
assert.doesNotMatch(offerRandomSource, /Math\.random/,
    "persisted card offers must not use the ambient random stream");
const collectionControllerBlock = runtimeSource.match(
    /const COLLECTION_SPELL_IDS[\s\S]*?const COLLECTION_BOOK_USE_SPELL_IDS/,
)[0];
const collectionRuntimeTags = [...collectionControllerBlock.matchAll(
    /UTAG\("echoes", "spell\/collection-([^\"]+)"\)/g,
)].map(match => match[1]);
assert.deepEqual(collectionRuntimeTags, expectedCollectionKeys);
const collectionBookUseBlock = runtimeSource.match(
    /const COLLECTION_BOOK_USE_SPELL_IDS[\s\S]*?const COLLECTION_BOOK_ITEM_IDS/,
)[0];
const collectionBookUseTags = [...collectionBookUseBlock.matchAll(
    /UTAG\("echoes", "spell\/collection-book-use-([^\"]+)"\)/g,
)].map(match => match[1]);
assert.deepEqual(collectionBookUseTags, expectedCollectionKeys,
    "book use-spell IDs must follow the persisted collection order");
const collectionBookItemBlock = runtimeSource.match(
    /const COLLECTION_BOOK_ITEM_IDS[\s\S]*?const BLADE_ZONE/,
)[0];
const collectionBookItemTags = [...collectionBookItemBlock.matchAll(
    /UTAG\("echoes", "item\/collection-book-([^\"]+)"\)/g,
)].map(match => match[1]);
assert.deepEqual(collectionBookItemTags, expectedCollectionKeys,
    "book item IDs must follow the persisted collection order");

const advancedControllerBlock = advancedRuntimeSource.match(
    /const ADVANCED_CONTROLLER_IDS[\s\S]*?const BLIGHT =/,
)[0];
const advancedControllerTags = [...advancedControllerBlock.matchAll(
    /UTAG\("echoes", "spell\/collection-([^\"]+)"\)/g,
)].map(match => match[1]);
assert.deepEqual(advancedControllerTags, expectedAdvancedCollectionKeys,
    "advanced controller IDs must match appended collection entries");
const expectedAreaRuntimeTags = new Map([
    ["CINDER_VISUAL", "collection-sanctum-cyclone-visual"],
    ["DEFILE_VISUAL", "collection-defile-visual"],
    ["SCORCHED_VISUAL", "collection-scorched-path-visual"],
    ["STICKY_SLIME_VISUAL", "collection-sticky-slime-visual"],
    ["POISON_SLIME_VISUAL", "collection-poison-slime-visual"],
    ["TWILIGHT_RIFT_VISUAL", "collection-twilight-rift-visual"],
]);
for (const [constant, key] of expectedAreaRuntimeTags) {
    assert.match(
        advancedRuntimeSource,
        new RegExp(`const ${constant} = UTAG\\("echoes", "spell/${key}"\\)`),
        `${key} must be resolved by a literal build-time tag`,
    );
    assert.ok(
        (advancedRuntimeSource.match(new RegExp(`\\b${constant}\\b`, "g")) || []).length >= 2,
        `${constant} must be used after it is declared`,
    );
}
const timedZoneTickBlock = advancedRuntimeSource.match(
    /function tickTimedZones[\s\S]*?function controllerLocalIndex/,
)[0];
assert.match(timedZoneTickBlock, /CastSpellAoF\([\s\S]{0,200}?visualId, true\)/,
    "timed ground zones must cast their visual even when no enemy is inside");
const advancedControllerTickBlock = advancedRuntimeSource.match(
    /function tickController[\s\S]*?function tickDarkNucleus/,
)[0];
assert.match(advancedControllerTickBlock, /ADV_CINDERS[\s\S]{0,800}?CastSpellAoF\([\s\S]{0,200}?CINDER_VISUAL/);
assert.match(advancedControllerTickBlock, /ADV_DEFILE[\s\S]{0,900}?CastSpellAoF\([\s\S]{0,200}?DEFILE_VISUAL/);
assert.match(advancedControllerTickBlock, /ADV_SLIMEBOUND[\s\S]{0,800}?CastSpellAoF\([\s\S]{0,200}?POISON_SLIME_VISUAL/);
assert.match(advancedControllerTickBlock, /tickTimedZones\([\s\S]{0,300}?SCORCHED_VISUAL/);
assert.match(advancedControllerTickBlock, /tickTimedZones\([\s\S]{0,300}?STICKY_SLIME_VISUAL/);
assert.match(advancedControllerTickBlock, /tickTimedZones\([\s\S]{0,300}?TWILIGHT_RIFT_VISUAL/);
assert.match(
    advancedControllerTickBlock,
    /ADV_STATIC_OVERFLOW[\s\S]{0,500}?!owner\.IsInCombat\(\)[\s\S]{0,200}?staticChargeTicks = 0[\s\S]{0,200}?staticChargeTicks < 10[\s\S]{0,100}?staticChargeTicks\+\+/,
    "Static Overflow must earn its first charge from ten controller ticks in combat",
);
assert.match(advancedRuntimeSource, /const ADVANCED_START_INDEX = 12/);
assert.match(advancedRuntimeSource, /const MAX_TIMED_ZONES = 24/);
assert.match(advancedRuntimeSource, /const MAX_TRACKED_TARGETS = 256/);
assert.match(advancedRuntimeSource, /component == 0/,
    "ordinary melee damage is stored in component zero");
assert.doesNotMatch(advancedRuntimeSource, /component == 1\) handleIncomingDamage/);
const advancedPeriodicBlock = advancedRuntimeSource.match(
    /events\.Spell\.OnPeriodicDamage[\s\S]*?events\.Unit\.OnMeleeDamageLate/,
)[0];
assert.doesNotMatch(
    advancedPeriodicBlock,
    /handleIncomingDamage/,
    "pre-mitigation periodic hooks must not drive direct-hit threshold defenses",
);
const collectionPeriodicBlock = runtimeSource.match(
    /events\.Spell\.OnPeriodicDamage[\s\S]*?events\.Unit\.OnMeleeDamageLate/,
)[0];
assert.ok(
    collectionPeriodicBlock.indexOf("outgoingDamageMultiplier")
        < collectionPeriodicBlock.indexOf("if (!helperDamage"),
    "periodic helper damage must receive owner multipliers before its proc guard",
);
const rallyCryBlock = advancedRuntimeSource.match(
    /function hasEncouragingCry[\s\S]*?function handleHeal/,
)[0];
assert.match(rallyCryBlock, /advancedRuntime\(player\)\.trackedTargets/);
assert.match(rallyCryBlock, /ownAura\(player, target, ENCOURAGING_CRY\)/,
    "Rally must remain active while the owner's Cry is on any tracked target");
assert.match(advancedRuntimeSource, /function handleHeal[\s\S]{0,500}?hasEncouragingCry\(player, target\)/);
const markedDeathBlock = advancedRuntimeSource.match(
    /function handleMarkedDeath[\s\S]*?function tickInfection/,
)[0];
assert.match(
    markedDeathBlock,
    /auraId == MUTATED_INFECTION[\s\S]{0,200}?GetDuration\(\)\) > 0[\s\S]{0,200}?addSlimePool/,
    "a lethal final Infection tick must not create the same pool twice",
);
const defileKillBlock = advancedRuntimeSource.match(
    /function handleCreatureKill[\s\S]*?function advancedPlayerForKiller/,
)[0];
assert.match(
    defileKillBlock,
    /if \(runtime\.defileGrowth < 5\) \{\s*runtime\.defileGrowth\+\+;\s*runtime\.defileTicks \+= 2;/,
    "Defile growth and duration extension must share the five-kill cap",
);
const staticOverflowBlock = advancedRuntimeSource.match(
    /function triggerStaticOverflow[\s\S]*?function triggerStoneShatter/,
)[0];
assert.match(staticOverflowBlock, /staticChargeTicks < 10/);
assert.match(staticOverflowBlock, /staticChargeTicks = 0;[\s\S]{0,120}?STATIC_OVERFLOW_ICD/,
    "consuming Static Overflow must start its next ten-second charge");
assert.match(advancedRuntimeSource, /OnDeathEarly\([\s\S]*?handleMarkedDeath/,
    "death effects must work when an ally lands the killing blow");
assert.match(advancedRuntimeSource, /GetDuration\(\)\) <= 0/,
    "duration-driven mechanics must wait for their final scheduled tick");
assert.match(livescriptEntrySource, /import \{ RegisterAdvancedEchoes \} from "\.\/advanced-echoes"/);
assert.match(livescriptEntrySource, /import \{ isCollectionDamageHelper, RegisterEchoes \} from "\.\/echoes"/);
assert.match(
    livescriptEntrySource,
    /RegisterEchoes\(events\);\s*RegisterAdvancedEchoes\(events, isCollectionDamageHelper\);/,
);
assert.match(
    advancedRuntimeSource,
    /export function RegisterAdvancedEchoes\([\s\S]*?isCollectionDamageHelper: \(spellId: number\) => boolean/,
);
assert.match(advancedRuntimeSource, /const ADVANCED_DAMAGE_HELPERS: TSArray<number> = \[/);
assert.match(
    advancedRuntimeSource,
    /export function isAdvancedEchoDamageHelper[\s\S]*ADVANCED_DAMAGE_HELPERS/,
);
assert.match(
    runtimeSource,
    /function isCollectionDamageHelper[\s\S]*isAdvancedEchoDamageHelper\(spellId\)/,
    "legacy collection hooks must reject advanced helper damage",
);
assert.match(advancedRuntimeSource, /OnDamageLate[\s\S]*?!isCollectionDamageHelper\(spellId\)/,
    "advanced direct-damage hooks must reject every collection helper spell");
assert.match(
    advancedRuntimeSource,
    /function castDamage[\s\S]*if \(!enemyTarget\(player, target\)\) return;[\s\S]*CastCustomSpell/,
    "advanced helper casts must not report failures against targets killed by an earlier proc",
);
assert.match(
    runtimeSource,
    /stack < stacks && !target\.IsDead\(\)[\s\S]*stack < stacks && !unit\.IsDead\(\)/,
    "multi-hit Frostfire helpers must stop once their target dies",
);
assert.match(
    runtimeSource,
    /const target = targetObject\.ToUnit\(\);\s*if \(!target \|\| target\.IsDead\(\)\) return;/,
    "Twin Casting must not start a triggered cast against a target that died on the original cast",
);
assert.match(
    advancedRuntimeSource,
    /OnPeriodicDamage[\s\S]*isCollectionDamageHelper\(auraId\)/,
    "base and advanced periodic helpers must not re-enter collection procs",
);
assert.match(runtimeSource, /UTAG\("echoes", "npc\/collection-lich-servant"\)/);
assert.match(runtimeSource, /UTAG\("echoes", "npc\/collection-sanctum-sentry"\)/);
assert.match(runtimeSource, /UTAG\("echoes", "npc\/collection-nether-portal"\)/);
assert.doesNotMatch(runtimeSource, /events\.Player\.OnCreatureKill/,
    "collection kill credit must include owner-controlled summons");
assert.doesNotMatch(advancedRuntimeSource, /events\.Player\.OnCreatureKill/,
    "advanced kill credit must include owner-controlled summons");
assert.match(runtimeSource, /killer\.ToPlayer\(\)[\s\S]{0,400}?killer\.GetController\(\)/);
assert.match(advancedRuntimeSource, /killer\.ToPlayer\(\)[\s\S]{0,400}?killer\.GetController\(\)/);
assert.match(runtimeSource, /events\.Unit\.OnDeath\([\s\S]{0,700}?onCollectionCreatureKill/);
assert.match(advancedRuntimeSource, /events\.Unit\.OnDeath\([\s\S]{0,700}?handleCreatureKill/);
assert.match(runtimeSource, /\.SpawnCreature\s*\(/);
assert.match(runtimeSource, /\.SetOwnerGUID\s*\(/);
assert.match(runtimeSource, /\.SetCreatorGUID\s*\(/);
assert.match(runtimeSource, /configureEchoMinion\(minion, player, followAngle, true\)/);
assert.match(runtimeSource, /configureEchoMinion\(portal, player, 0, false\)/,
    "the portal must not inherit player level, appearance, or follow movement");
assert.match(runtimeSource, /\.CastCustomSpell\s*\(\s*target\s*,\s*LICH_SERVANT_HIT\b/);
assert.match(runtimeSource, /\.CastSpell\s*\(\s*target\s*,\s*SANCTUM_MARK\b/);
assert.match(runtimeSource, /\.CastCustomSpell\s*\(\s*target\s*,\s*SANCTUM_SENTRY_HIT\b/);
assert.match(runtimeSource, /portal\.SetFacingToObject\(target\)/);
assert.match(runtimeSource, /portal\.CastCustomSpell\s*\([\s\S]*?NETHER_LIGHTNING_HIT,\s*false,\s*lightningDamage/);
assert.match(runtimeSource, /Number\(lightningResult\) != SpellCastResult\.FAILED_SUCCESS[\s\S]*?SpellSchools\.SHADOW,\s*NETHER_LIGHTNING_HIT/);
assert.match(runtimeSource, /portal\.CastSpellAoF\s*\([\s\S]*?NETHER_FLAMESTRIKE_HIT,\s*true/);
assert.match(runtimeSource, /portal\.DealDamage\s*\([\s\S]*?SpellSchools\.FIRE,\s*NETHER_FLAMESTRIKE_HIT/);
assert.match(runtimeSource, /target\.GetUnitsInRange\(5, 0, 1\)/);
assert.doesNotMatch(runtimeSource, /spellId == NETHER_(?:LIGHTNING|FLAMESTRIKE)_HIT[\s\S]*?damage\.set/);
assert.doesNotMatch(runtimeSource, /player\.CastSpell\s*\(\s*target\s*,\s*NETHER_LIGHTNING_HIT\b/);
assert.match(runtimeSource, /playerSpellPower\(player\) \* 0\.025 \+ playerAttackPower\(player\) \* 0\.0125/);
assert.doesNotMatch(runtimeSource, /player\.Cast(?:Custom)?Spell\s*\(\s*target\s*,\s*LICH_SERVANT_HIT\b/);
assert.doesNotMatch(runtimeSource, /player\.Cast(?:Custom)?Spell\s*\(\s*target\s*,\s*SANCTUM_SENTRY_HIT\b/);
assert.doesNotMatch(runtimeSource, /refreshedAura\s*\(\s*player\s*,\s*target\s*,\s*SANCTUM_MARK\b/);
const netherTriggerBlock = runtimeSource.match(
    /function triggerNetherPortal[\s\S]*?function processOutgoingDirectDamage/,
)[0];
assert.match(netherTriggerBlock, /player\.HasAura\(NETHER_PORTAL\)/,
    "an open portal must not be refreshed or relocated by another proc");
assert.match(runtimeSource, /function onNetherPortalRemoved[\s\S]{0,500}?despawnNetherPortal\(/);
assert.match(runtimeSource, /events\.Spell\.OnRemove\(NETHER_PORTAL, onNetherPortalRemoved\)/,
    "removing the controller aura must immediately clean up the portal creature");
assert.match(runtimeSource, /bookDropChance: 0\.02/);
assert.match(runtimeSource, /OnGenerateLoot/);
assert.match(runtimeSource, /OP_ECHO_COLLECTION_SET_ACTIVE/);
assert.match(runtimeSource, /minSlots: 2/);
assert.match(runtimeSource, /maxSlots: 10/);
assert.match(runtimeSource, /crystalGold: 30000/);
assert.match(runtimeSource, /return 1 << \(slotLimit - RULES\.minSlots\)/);
assert.match(runtimeSource, /if \(limit >= RULES\.maxSlots\)[\s\S]*?return reject/);
assert.match(runtimeSource, /GetItemCount\(COLLECTION_SLOT_EXPAND_ITEM, false\)/);
assert.match(runtimeSource, /OnGossipHello\(ECHO_VENDOR/);
assert.match(runtimeSource, /OnGossipSelect\(ECHO_VENDOR/);
assert.match(runtimeSource, /SendListInventory\(creature\)/);
assert.match(runtimeSource, /RemoveItemByEntry\(COLLECTION_SLOT_EXPAND_ITEM, crystals\)/);
assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => 1 << index),
    [1, 2, 4, 8, 16, 32, 64, 128],
);
assert.match(databaseSource, /GetObject\(RANKS_KEY, RANKS_FALLBACK\)[\s\S]*cached != RANKS_FALLBACK[\s\S]*LoadDBArrayEntry/);
assert.match(databaseSource, /GetObject\(OFFER_KEY, OFFER_FALLBACK\)[\s\S]*cached != OFFER_FALLBACK[\s\S]*LoadDBEntry/);
assert.doesNotMatch(databaseSource, /HasObject\(/,
    "Lua HasObject checks compiled-object storage, not the table used by GetObject");
assert.doesNotMatch(databaseSource, /GetObject\(\s*(?:RANKS_KEY|OFFER_KEY)\s*,\s*LoadDB/,
    "cached getters must not eagerly query Characters DB");
assert.match(databaseSource, /class EchoCollectionRow extends DBArrayEntry/);
assert.match(databaseSource, /class EchoCollectionProfile extends DBEntry/);

const addonSource = fs.readFileSync(path.join(moduleRoot, "addon", "echo-ui.ts"), "utf8");
assert.doesNotMatch(addonSource, /PLAYER_LEVEL_UP/);
assert.doesNotMatch(addonSource, /\bcontinue\b/, "Lua 5.1 addon cannot use continue");
assert.match(addonSource, /definition\.descriptionRu/);
assert.match(addonSource, /SLASH_ECHOCOLLECTION1/);
assert.match(addonSource, /EchoCollectionMinimapButton/);
assert.match(addonSource, /PLAYER_ENTERING_WORLD[\s\S]*ensureCollectionMenuButton\(\)/);
assert.match(addonSource, /staleCollectionReply[\s\S]*next\.collectionActiveSlots = state\.collectionActiveSlots/);
assert.match(addonSource, /const COLLECTION_PAGE_SIZE = 12/);
assert.match(
    addonSource,
    /for \(let i = 0; i < COLLECTION_PAGE_SIZE; i\+\+\)[\s\S]*createCollectionCard/,
    "collection UI should allocate one reusable page of cards",
);
assert.match(
    addonSource,
    /Math\.ceil\(visible\.length \/ COLLECTION_PAGE_SIZE\)/,
    "collection page count must follow the filtered catalog size",
);
assert.match(addonSource, /const pageStart = collectionPage \* COLLECTION_PAGE_SIZE/);
assert.match(addonSource, /visible\[pageStart \+ slot\]/);
assert.match(addonSource, /Все ауры/);
assert.match(addonSource, /Активные/);

const writes = [];
global.CreateCustomPacket = (opcode, size) => {
    const packet = {
        opcode,
        size,
        values: [],
        WriteDouble(value) { this.values.push(["number", value]); return this; },
        WriteString(value) { this.values.push(["string", value]); return this; },
    };
    writes.push(packet);
    return packet;
};
const messages = require(path.join(moduleRoot, "shared", "EchoMessages.ts"));

function readerFor(packet) {
    let cursor = 0;
    return {
        ReadDouble(fallback = 0) {
            const value = packet.values[cursor++];
            return value && value[0] === "number" ? value[1] : fallback;
        },
        ReadString(fallback = "") {
            const value = packet.values[cursor++];
            return value && value[0] === "string" ? value[1] : fallback;
        },
    };
}

const outgoingState = new messages.EchoStateMsg();
outgoingState.level = 17;
outgoingState.earned = 16;
outgoingState.picked = 14;
outgoingState.pending = 2;
outgoingState.offerToken = 73;
outgoingState.spellIds = [101, 102];
outgoingState.ranks = [4, 5];
outgoingState.offers = [new messages.EchoOfferEntry(1), new messages.EchoOfferEntry(7)];
outgoingState.collectionSlotLimit = 4;
outgoingState.collectionSpellIds = [501, 502, 503];
outgoingState.collectionUnlocked = [1, 0, 1];
outgoingState.collectionActiveSlots = [2, 0, 1];
outgoingState.collectionAckToken = 88;
const statePacket = outgoingState.write();
assert.equal(statePacket.opcode, messages.OP_ECHO_STATE);
const incomingState = new messages.EchoStateMsg();
incomingState.read(readerFor(statePacket));
assert.deepEqual(
    {
        level: incomingState.level,
        earned: incomingState.earned,
        picked: incomingState.picked,
        pending: incomingState.pending,
        offerToken: incomingState.offerToken,
        spellIds: incomingState.spellIds,
        ranks: incomingState.ranks,
        offers: incomingState.offers.map(offer => offer.echoIndex),
        collectionSlotLimit: incomingState.collectionSlotLimit,
        collectionSpellIds: incomingState.collectionSpellIds,
        collectionUnlocked: incomingState.collectionUnlocked,
        collectionActiveSlots: incomingState.collectionActiveSlots,
        collectionAckToken: incomingState.collectionAckToken,
    },
    {
        level: 17, earned: 16, picked: 14, pending: 2, offerToken: 73,
        spellIds: [101, 102], ranks: [4, 5], offers: [1, 7],
        collectionSlotLimit: 4,
        collectionSpellIds: [501, 502, 503],
        collectionUnlocked: [1, 0, 1],
        collectionActiveSlots: [2, 0, 1],
        collectionAckToken: 88,
    },
);

const choosePacket = new messages.EchoChooseRequest(91, 12).write();
const incomingChoose = new messages.EchoChooseRequest(0, 0);
incomingChoose.read(readerFor(choosePacket));
assert.deepEqual([incomingChoose.offerToken, incomingChoose.echoIndex], [91, 12]);

const collectionPacket = new messages.EchoCollectionSetActiveRequest(7, 1, 42).write();
assert.equal(collectionPacket.opcode, messages.OP_ECHO_COLLECTION_SET_ACTIVE);
const incomingCollection = new messages.EchoCollectionSetActiveRequest(0, 0, 0);
incomingCollection.read(readerFor(collectionPacket));
assert.deepEqual(
    [incomingCollection.echoIndex, incomingCollection.active, incomingCollection.requestToken],
    [7, 1, 42],
);

const errorPacket = new messages.EchoErrorMsg(
    "collection error",
    messages.ECHO_ERROR_CONTEXT_COLLECTION,
).write();
const incomingError = new messages.EchoErrorMsg("");
incomingError.read(readerFor(errorPacket));
assert.deepEqual(
    [incomingError.message, incomingError.context],
    ["collection error", messages.ECHO_ERROR_CONTEXT_COLLECTION],
);

if (previousTsLoader) require.extensions[".ts"] = previousTsLoader;
else delete require.extensions[".ts"];

console.log("Echo catalog, roll, protocol, and source contracts OK");
