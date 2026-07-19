const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));

function loadTsModule(file, moduleMocks = {}) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
    }).outputText;
    const module = { exports: {} };
    const localRequire = request => Object.prototype.hasOwnProperty.call(moduleMocks, request)
        ? moduleMocks[request]
        : require(request);
    new Function("exports", "module", "require", output)(module.exports, module, localRequire);
    return module.exports;
}

const moduleRoot = path.join(__dirname, "..");
const progression = loadTsModule(path.join(moduleRoot, "shared/CompanionProgression.ts"));
const training = loadTsModule(path.join(moduleRoot, "shared/CompanionTraining.ts"), {
    "./CompanionProgression": progression,
});
const expeditions = loadTsModule(path.join(moduleRoot, "shared/CompanionExpeditions.ts"));
const runtimeSource = fs.readFileSync(
    path.join(moduleRoot, "livescripts/companion-progression.ts"), "utf8",
);
const mainSource = fs.readFileSync(path.join(moduleRoot, "livescripts/livescripts.ts"), "utf8");
const dbSource = fs.readFileSync(path.join(moduleRoot, "livescripts/companion-db.ts"), "utf8");
const dataSource = fs.readFileSync(path.join(moduleRoot, "datascripts/datascripts.ts"), "utf8");
const dataCatalog = loadTsModule(path.join(moduleRoot, "datascripts/TrainingCatalog.ts"));

assert.strictEqual(progression.COMPANION_PROFESSIONS.length, 10);
assert.deepStrictEqual(
    progression.COMPANION_PROFESSIONS.map(value => value.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
);
assert.ok(progression.COMPANION_PROFESSIONS.every(
    value => value.familyMask === progression.COMPANION_FAMILY_ALL,
));
assert.deepStrictEqual(
    Array.from({ length: 10 }, (_, index) => progression.companionProfessionForSeed(1, index)),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "saved profession roll must be uniform across all ten professions",
);
assert.strictEqual(
    progression.companionFamilyForCreatureType(0),
    progression.COMPANION_FAMILY_TACTICAL,
    "hostile type-NONE captures need a usable fallback training family",
);

assert.strictEqual(progression.COMPANION_TRAITS.length, 40);
for (const profession of progression.COMPANION_PROFESSIONS) {
    const first = (profession.id - 1) * 4 + 1;
    const traits = progression.COMPANION_TRAITS.filter(value => (
        value.id >= first && value.id < first + 4
    ));
    assert.strictEqual(traits.length, 4);
    for (let seed = 0; seed < 4; seed++) {
        assert.strictEqual(progression.companionTraitForProfession(profession.id, seed), first + seed);
    }
    const insight = traits[3];
    const canMarkEquipment = [5, 6, 8, 9, 10].includes(profession.id);
    assert.strictEqual(insight.bonusBps, 400);
    assert.strictEqual(insight.markProperty > 0, canMarkEquipment);
    assert.strictEqual(insight.descriptionRu.includes("клеймо"), canMarkEquipment);
    assert.ok(insight.descriptionRu.includes("4 п.п."));
}
assert.deepStrictEqual(
    progression.COMPANION_SERVICE_RANKS.map(value => value.minimumXp),
    [0, 100, 600, 2400, 8000],
);
assert.deepStrictEqual(
    progression.COMPANION_SERVICE_RANKS.map(value => value.expeditionPeriodBps),
    [500, 800, 1200, 1600, 2000],
);

assert.strictEqual(training.COMPANION_COMBAT_MANUALS.length, 50);
assert.strictEqual(training.COMPANION_PROFESSION_TOOLS.length, 30);
assert.strictEqual(training.COMPANION_TRAINING_FEATURES.length, 80);
assert.strictEqual(dataCatalog.DATASCRIPT_TRAINING_FEATURES.length, 80);
for (let i = 0; i < training.COMPANION_TRAINING_FEATURES.length; i++) {
    const shared = training.COMPANION_TRAINING_FEATURES[i];
    const data = dataCatalog.DATASCRIPT_TRAINING_FEATURES[i];
    for (const field of [
        "id", "key", "kind", "name", "nameRu", "description",
        "descriptionRu", "icon", "payload",
    ]) assert.strictEqual(data[field], shared[field], `datascript catalog ${i + 1}.${field}`);
    assert.ok(shared.description.length <= 255,
        `item description ${i + 1} exceeds varchar(255): ${shared.description.length}`);
    assert.ok(shared.descriptionRu.length <= 255,
        `localized item description ${i + 1} exceeds varchar(255): ${shared.descriptionRu.length}`);
}
assert.deepStrictEqual(
    training.COMPANION_SLOT_COSTS,
    [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 7, 10, 14, 20],
);
const active = training.COMPANION_COMBAT_MANUALS.slice(0, 42);
assert.strictEqual(new Set(active.map(value => value.description)).size, 7);
assert.strictEqual(new Set(active.map(value => value.descriptionRu)).size, 7);
assert.ok(active.every(value => (
    value.description.includes("Cooldown:") && value.descriptionRu.includes("Перезарядка:")
)));
const scaledActive = active.filter(value => (
    value.payload === training.TRAINING_PAYLOAD_ENEMY_DAMAGE
    || value.payload === training.TRAINING_PAYLOAD_OWNER_HEAL
    || value.payload === training.TRAINING_PAYLOAD_SELF_HEAL
));
assert.ok(scaledActive.every(value => (
    value.description.includes("1.00/1.25/1.50")
    && value.descriptionRu.includes("1,00/1,25/1,50")
)));
const controlActive = active.filter(value => (
    value.payload === training.TRAINING_PAYLOAD_INTERRUPT
    || value.payload === training.TRAINING_PAYLOAD_TAUNT
));
assert.ok(controlActive.every(value => (
    value.description.includes("do not improve")
    && value.descriptionRu.includes("не усиливают")
)));
for (const family of [1, 2, 4, 8, 16, 32]) {
    const compatible = active.filter(value => progression.companionMaskHas(
        value.familyMask, family,
    )).length;
    assert.ok(compatible === 15 || compatible === 16, `family ${family}: ${compatible}`);
}
const passives = training.COMPANION_COMBAT_MANUALS.slice(42);
assert.strictEqual(passives.length, 8);
assert.strictEqual(new Set(passives.map(value => value.description)).size, 8);
assert.strictEqual(new Set(passives.map(value => value.descriptionRu)).size, 8);
assert.ok(passives.every(value => (
    value.description.includes("I/II/III") && value.descriptionRu.includes("I/II/III")
)));
assert.ok(passives.every(value => value.familyMask === progression.COMPANION_FAMILY_ALL));
for (const passive of passives) {
    const amounts = [1, 2, 3].map(rank => training.companionPassiveAmount(passive.payload, rank));
    assert.ok(amounts.every(value => value !== 0));
    assert.strictEqual(new Set(amounts).size, 3, `${passive.key} must scale at I-III`);
}
for (const profession of progression.COMPANION_PROFESSIONS) {
    const tools = training.COMPANION_PROFESSION_TOOLS.filter(
        value => value.professionId === profession.id,
    );
    assert.strictEqual(tools.length, 3);
    assert.ok(tools.every(value => value.familyMask === progression.COMPANION_FAMILY_ALL));
    for (const tool of tools) {
        assert.ok(tool.lootFamilyMask > 0);
        for (const family of [1, 2, 4, 8, 16, 32]) {
            assert.strictEqual(training.companionTrainingCompatible(tool, family, profession.id), true);
            assert.strictEqual(
                training.companionTrainingCompatible(tool, family, profession.id % 10 + 1),
                false,
            );
        }
    }
}
for (const family of [1, 2, 4, 8, 16, 32]) {
    const thematicTools = training.COMPANION_PROFESSION_TOOLS.filter(value => (
        progression.companionMaskHas(value.lootFamilyMask, family)
    ));
    assert.ok(thematicTools.length >= 9 && thematicTools.length <= 21,
        `family ${family} thematic tool pool: ${thematicTools.length}`);
}
assert.ok(training.COMPANION_COMBAT_MANUALS
    .filter(value => value.payload === training.TRAINING_PAYLOAD_TAUNT)
    .every(value => value.cooldownMs >= 18000));
assert.strictEqual(new Set(
    training.COMPANION_PROFESSION_TOOLS.map(value => value.description),
).size, 4);
assert.ok(training.COMPANION_PROFESSION_TOOLS.every(value => (
    value.description.includes("2.5/5/7.5")
    && value.descriptionRu.includes("2,5/5/7,5")
)));
const foresterSaving = training.COMPANION_PROFESSION_TOOLS.find(value => (
    value.professionId === 3 && value.payload === training.TRAINING_PAYLOAD_TOOL_SAVE
));
assert.ok(foresterSaving);
assert.ok(foresterSaving.description.includes("no station target"));
assert.ok(foresterSaving.descriptionRu.includes("нет цели-станка"));

const firstBatch = progression.companionWorkXpDecision(0, 17, 60);
assert.deepStrictEqual(firstBatch, { commit: true, amount: 60, nextRevision: 17 });
assert.deepStrictEqual(
    progression.companionWorkXpDecision(0, 17, 60),
    firstBatch,
    "a crash before persistence must replay the still-uncommitted batch",
);
assert.deepStrictEqual(
    progression.companionWorkXpDecision(firstBatch.nextRevision, 17, 60),
    { commit: false, amount: 0, nextRevision: 17 },
    "relogin after persistence but before transient ack must not double-grant",
);
assert.strictEqual(progression.companionWorkXpDecision(17, 18, 4).amount, 4);
assert.strictEqual(progression.companionGreyLevel(80), 71);
assert.strictEqual(progression.companionKillIsGrey(80, 71), true);
assert.strictEqual(progression.companionKillIsGrey(80, 72), false);
assert.strictEqual(progression.companionKillIsGrey(20, 13), true);
assert.strictEqual(progression.companionKillIsGrey(20, 14), false);
assert.match(dbSource, /lastWorkXpRevision:\s*uint32\s*=\s*0/);
const workforceBlock = runtimeSource.slice(
    runtimeSource.indexOf("export function syncCompanionWorkforce("),
    runtimeSource.indexOf("export function clearCompanionWorkforceReady("),
);
assert.ok(workforceBlock.indexOf("if (changed) collection.Save();")
    < workforceBlock.indexOf('"xp-ack-revision"'));
assert.match(workforceBlock, /lastWorkXpRevision/);
const snapshotBlock = runtimeSource.slice(
    runtimeSource.indexOf("function publishWorkforceSnapshot("),
    runtimeSource.indexOf("export function syncCompanionWorkforce("),
);
assert.ok(snapshotBlock.indexOf('workerKey(companionId, "mark-property")')
    < snapshotBlock.indexOf('player.SetUInt(workerKey(companionId, "revision")'),
"worker revision must be the final transient snapshot commit marker");
assert.match(snapshotBlock, /GetCreatureTemplate\(Number\(companion\.entry\)\) !== undefined/);
assert.match(snapshotBlock, /workerKey\(companionId, "eligible"\)/);
assert.ok(snapshotBlock.indexOf('workerKey(companionId, "eligible")')
    < snapshotBlock.indexOf('workerKey(companionId, "available")'));

const identityNormalization = runtimeSource.slice(
    runtimeSource.indexOf("function normalizeIdentity("),
    runtimeSource.indexOf("function normalizeTrainingRows("),
);
assert.match(identityNormalization, /const previousRevision = Number\(row\.trainingRevision\)/);
assert.match(identityNormalization, /row\.trainingRevision = previousRevision \+ 1/);
const trainingNormalization = runtimeSource.slice(
    runtimeSource.indexOf("function normalizeTrainingRows("),
    runtimeSource.indexOf("export function normalizeCompanionProgression("),
);
assert.ok(trainingNormalization.indexOf("duplicate.Delete();")
    < trainingNormalization.indexOf("const mergedSlot = clampInt("),
"merged duplicate slots must be revalidated after deduplication");
assert.match(trainingNormalization, /mergedSlot <= Number\(companion\.trainingCapacity\) && compatible/);

assert.match(runtimeSource, /const SERVICE_XP_PER_EXPEDITION = 25;/);
assert.match(runtimeSource, /if \(rank == 2 \|\| rank == 4\) return 10;/);
assert.match(runtimeSource, /if \(rank == 1\) return 3;/);
assert.match(runtimeSource, /if \(rank == 0\) return 1;/);
assert.match(runtimeSource, /const PERIOD_BPS_BY_RANK = \[500, 800, 1200, 1600, 2000\]/);
assert.match(runtimeSource, /Math\.min\(3500,/);
assert.match(runtimeSource, /Math\.min\(2500,/);
assert.match(runtimeSource, /Math\.min\(2000,/);
assert.match(runtimeSource, /trait\.markProperty >= 1001 && trait\.markProperty <= 1007/);
assert.doesNotMatch(runtimeSource, /clampInt\(trait\.markProperty, 0, 4\)/);
assert.doesNotMatch(runtimeSource, /markBase \+ \(trait \? trait\.markBps/);

assert.match(dataSource, /function createPassiveHelper/);
assert.doesNotMatch(
    dataSource,
    /\.\.\/shared/,
    "TSWoW's isolated data compiler cannot load static imports from ../shared",
);
assert.match(dataSource, /spell\.Attributes\.IS_PASSIVE\.set\(true\)/);
assert.match(dataSource, /spell\.Attributes\.HIDE_FROM_AURA_BAR\.set\(true\)/);
assert.match(dataSource, /item\.Price\.setAsGold\(0, 0, 1\)/);
assert.match(
    dataSource,
    /__dirname,\s*"\.\.",\s*"\.\.",\s*"livescripts",\s*"generated_companion_training\.ts"/,
    "compiled datascripts must emit the runtime catalog into the module livescripts directory",
);
for (const name of [
    "PASSIVE_DAMAGE", "PASSIVE_HEALING", "PASSIVE_HEALTH", "PASSIVE_DEFENSE",
    "PASSIVE_HASTE", "PASSIVE_CRIT", "PASSIVE_SUPPORT", "PASSIVE_THREAT",
]) assert.match(dataSource, new RegExp(`TRAINING_PAYLOAD_${name}`));
const passiveRuntimeBlock = runtimeSource.slice(
    runtimeSource.indexOf("export function syncInstalledTrainingPassives("),
    runtimeSource.indexOf("function dispatchPhaseForPayload("),
);
assert.match(passiveRuntimeBlock, /Number\(learned\.installedSlot\) > 0/);
assert.match(passiveRuntimeBlock, /companionPassiveAmount\(feature\.payload, Number\(learned\.rank\)\)/);
assert.match(passiveRuntimeBlock, /companion\.RemoveAura\(spellId\)/,
    "uninstall/revision refresh must remove stale passive auras before recalculation");

const dispatcherBlock = mainSource.slice(
    mainSource.indexOf("function startActionDispatcher("),
    mainSource.indexOf("function applyCombatMode("),
);
const phases = [
    "TRAINING_DISPATCH_EMERGENCY",
    "TRAINING_DISPATCH_INTERRUPT",
    "TRAINING_DISPATCH_TAUNT",
    "tryTankTaunt",
    "trySupportOwner",
    "TRAINING_DISPATCH_OFFENSE",
].map(value => dispatcherBlock.indexOf(value));
assert.ok(phases.every(value => value >= 0));
for (let i = 1; i < phases.length; i++) assert.ok(phases[i - 1] < phases[i]);
assert.doesNotMatch(mainSource, /startSupportTimer/);

const startExpeditionBlock = mainSource.slice(
    mainSource.indexOf("function startExpedition("),
    mainSource.indexOf("function clearExpedition("),
);
assert.ok(startExpeditionBlock.indexOf("container.Save();")
    < startExpeditionBlock.indexOf("synchronizeCompanionWorkforce(player);"));
assert.ok(startExpeditionBlock.indexOf("synchronizeCompanionWorkforce(player);")
    < startExpeditionBlock.indexOf("sendState(player);"),
"expedition must publish unavailable before its handler returns");

assert.match(mainSource, /events\.Creature\.OnGenerateLoot\(\(creature, _killer\)/);
assert.match(runtimeSource, /const player = creature\.GetLootRecipient\(\)/);
assert.match(runtimeSource, /companionKillIsGrey\(Number\(player\.GetLevel\(\)\), Number\(creature\.GetLevel\(\)\)\)/);
assert.match(runtimeSource, /creature\.IsFriendlyTo\(player\) \|\| player\.IsFriendlyTo\(creature\)/);
const trainingLootBlock = runtimeSource.slice(
    runtimeSource.indexOf("export function tryGenerateCompanionTrainingLoot("),
    runtimeSource.indexOf("export function trainingDispatchCooldownMs("),
);
assert.match(trainingLootBlock, /map\.IsDungeon\(\)/);
assert.match(trainingLootBlock, /map\.IsArena\(\)/);
assert.match(trainingLootBlock, /map\.IsBG\(\)/);
assert.doesNotMatch(
    trainingLootBlock,
    /map\.IsRaid\(\)/,
    "TSMap.IsRaid is not exported; IsDungeon already includes raids",
);
assert.match(runtimeSource, /creature\.GetLoot\(\)\.AddItem\(/);
assert.match(runtimeSource, /companionMaskHas\(feature\.lootFamilyMask, family\)/);
assert.doesNotMatch(runtimeSource, /SetLootOwner/);
assert.match(mainSource, /isBaseWorkforceVisual\(killed\)\) return;/);
assert.match(mainSource, /companionKillIsGrey\(Number\(player\.GetLevel\(\)\), Number\(killed\.GetLevel\(\)\)\)/);

assert.strictEqual(expeditions.EXPEDITION_SPECIALTY_WOOD, 4);
assert.strictEqual(expeditions.EXPEDITION_SPECIALTY_FISH, 5);
assert.strictEqual(
    expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_FISH, 80),
    41813,
);
assert.strictEqual(
    expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_WOOD, 80),
    0,
);
assert.match(mainSource, /UTAG\("base-building", "item\/wood-tier-1"\)/);
assert.match(mainSource, /UTAG\("base-building", "item\/wood-tier-6"\)/);

const actionBlock = runtimeSource.slice(
    runtimeSource.indexOf("export function applyCompanionTrainingAction("),
    runtimeSource.indexOf("export function addCompanionServiceXp("),
);
assert.match(runtimeSource, /Number\(player\.GetDbcLocale\(\)\) == 8/);
assert.match(runtimeSource, /export function companionText\(/);
assert.match(actionBlock, /requiresCompatibility = request\.action == COMPANION_ACTION_LEARN_OR_RANK/);
assert.match(actionBlock, /\|\| request\.action == COMPANION_ACTION_INSTALL/);
assert.doesNotMatch(actionBlock, /requiresCompatibility[^;]*COMPANION_ACTION_STUDY/);
assert.doesNotMatch(
    actionBlock,
    /isCompanionWorkforceAssigned/,
    "assigned workers support safe hot-reloading of learned and installed effects",
);
const learnBranch = actionBlock.slice(
    actionBlock.indexOf("if (request.action == COMPANION_ACTION_LEARN_OR_RANK)"),
    actionBlock.indexOf("} else if (request.action == COMPANION_ACTION_STUDY)"),
);
const studyBranch = actionBlock.slice(
    actionBlock.indexOf("} else if (request.action == COMPANION_ACTION_STUDY)"),
    actionBlock.indexOf("} else if (request.action == COMPANION_ACTION_INSTALL)"),
);
const installBranch = actionBlock.slice(
    actionBlock.indexOf("} else if (request.action == COMPANION_ACTION_INSTALL)"),
    actionBlock.indexOf("} else if (request.action == COMPANION_ACTION_UNINSTALL)"),
);
assert.match(learnBranch, /consumeTrainingItem\(/);
assert.match(studyBranch, /consumeTrainingItem\(/);
assert.doesNotMatch(
    installBranch,
    /consumeTrainingItem|HasItem|RemoveItem|inventory/i,
    "installing a learned feature must remain free",
);

console.log("companion progression, catalog, dispatch, loot and workforce contracts: ok");
