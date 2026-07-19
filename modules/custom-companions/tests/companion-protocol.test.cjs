const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));

function loadTsModule(file, globals = {}, moduleMocks = {}) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
    }).outputText;
    const module = { exports: {} };
    const localRequire = request => Object.prototype.hasOwnProperty.call(moduleMocks, request)
        ? moduleMocks[request]
        : require(request);
    const names = ["exports", "module", "require", ...Object.keys(globals)];
    const values = [module.exports, module, localRequire, ...Object.values(globals)];
    new Function(...names, output)(...values);
    return module.exports;
}

function createPacket(opcode) {
    return {
        opcode,
        values: [],
        WriteDouble(value) { this.values.push(["number", value]); },
        WriteString(value) { this.values.push(["string", value]); },
    };
}

function packetReader(values) {
    let index = 0;
    return {
        ReadDouble() {
            const value = values[index++];
            assert.strictEqual(value[0], "number");
            return value[1];
        },
        ReadString() {
            const value = values[index++];
            assert.strictEqual(value[0], "string");
            return value[1];
        },
        consumed() { return index; },
    };
}

const messages = loadTsModule(path.join(__dirname, "../shared/CompanionMessages.ts"), {
    CreateCustomPacket: createPacket,
});
const progressionMessages = loadTsModule(path.join(
    __dirname, "../shared/CompanionProgressionMessages.ts",
), {
    CreateCustomPacket: createPacket,
}, {
    "./CompanionTraining": { COMPANION_TRAINING_CATALOG_VERSION: 1 },
});
const expeditions = loadTsModule(path.join(__dirname, "../shared/CompanionExpeditions.ts"));
const rules = loadTsModule(path.join(__dirname, "../shared/CompanionRules.ts"));
const gemAbilities = loadTsModule(path.join(
    __dirname, "../../gem-abilities/datascripts/pool_data.ts",
));
const livescriptSource = fs.readFileSync(path.join(
    __dirname, "../livescripts/livescripts.ts",
), "utf8");
const addonSource = fs.readFileSync(path.join(__dirname, "../addon/addon.ts"), "utf8");

const newOpcodeSources = [
    path.join(__dirname, "../shared/CompanionMessages.ts"),
    path.join(__dirname, "../shared/CompanionProgressionMessages.ts"),
    path.join(__dirname, "../../base-building/shared/BaseMessages.ts"),
    path.join(__dirname, "../../custom-stats/shared/StatMessages.ts"),
].map(file => fs.readFileSync(file, "utf8")).join("\n");
const newOpcodes = Array.from(
    newOpcodeSources.matchAll(/export const OP_[A-Z0-9_]+\s*=\s*(9[1-9]|100)\b/g),
    match => Number(match[1]),
).sort((a, b) => a - b);
assert.deepStrictEqual(newOpcodes, [91, 92, 93, 94, 95, 96, 97, 98, 99, 100]);
assert.strictEqual(new Set(newOpcodes).size, 10, "new cross-module opcodes must remain unique");

const bootstrapBlock = addonSource.slice(
    addonSource.indexOf("const bootstrap"),
    addonSource.indexOf("(_G as any).SLASH_CUSTOMCOMPANIONS1"),
);
assert.match(
    bootstrapBlock,
    /sendPacket\(new CompanionStateRequest\(\)\.write\(\),/,
    "client must negotiate its packet version on every world entry",
);
assert.strictEqual(
    (livescriptSource.match(/\.ready = true;/g) || []).length,
    1,
    "only the versioned state request may mark the companion client ready",
);

const randomCastBlock = livescriptSource.slice(
    livescriptSource.indexOf("function castRandomGemAbility("),
    livescriptSource.indexOf("function handleRandomOffenseProc("),
);
const supportCastBlock = livescriptSource.slice(
    livescriptSource.indexOf("function trySupportOwner("),
    livescriptSource.indexOf("function startActionDispatcher("),
);
assert.match(
    randomCastBlock,
    /castGemAbility\([^;]+\) == SpellCastResult\.CAST_OK/,
    "random proc must stop after the first successful cast",
);
assert.match(
    supportCastBlock,
    /CastSpell\(player, spellId, false\)\) == SpellCastResult\.CAST_OK/,
    "support rotation must stop and arm its delay after a successful cast",
);
assert.doesNotMatch(
    randomCastBlock + supportCastBlock,
    /(?:castGemAbility|CastSpell)\([^;]+\)\s*==\s*0/,
    "SpellCastResult success must not be compared with zero",
);

assert.strictEqual(gemAbilities.ABILITY_POOL.length, 90);
assert.strictEqual(new Set(gemAbilities.ABILITY_POOL).size, 90);
assert.ok(gemAbilities.ABILITY_POOL.includes(133));  // Fireball
assert.ok(gemAbilities.ABILITY_POOL.includes(2061)); // Flash Heal

const state = new messages.CompanionState();
state.activeId = 3;
state.companions.push(new messages.CompanionStateEntry(
    3,
    12345,
    "Test Companion",
    0.75,
    messages.COMPANION_MODE_PASSIVE,
    expeditions.EXPEDITION_SPECIALTY_ORE,
    3600,
));

const statePacket = state.write(messages.COMPANION_PROTOCOL_EXPEDITIONS_VERSION);
const stateReader = packetReader(statePacket.values);
const decodedState = new messages.CompanionState();
decodedState.read(stateReader, messages.COMPANION_PROTOCOL_EXPEDITIONS_VERSION);
assert.deepStrictEqual(decodedState, state);
assert.strictEqual(statePacket.opcode, messages.OP_COMPANION_STATE);
assert.strictEqual(stateReader.consumed(), statePacket.values.length);

const legacyStatePacket = state.write(0);
assert.deepStrictEqual(legacyStatePacket.values.slice(-5), [
    ["number", 3],
    ["number", 12345],
    ["string", "Test Companion"],
    ["number", 0.75],
    ["number", messages.COMPANION_MODE_PASSIVE],
]);

const v3State = new messages.CompanionState();
v3State.selectedProtocolVersion = messages.COMPANION_PROTOCOL_VERSION;
v3State.activeId = 17;
v3State.companions.push(new messages.CompanionStateEntry(
    17,
    54321,
    "Progression Companion",
    0.5,
    messages.COMPANION_MODE_TANK,
    expeditions.EXPEDITION_SPECIALTY_ORE,
    120,
    7,
    9,
    1234,
    3,
    15,
    6,
    88,
    10,
));
const v3Packet = v3State.write();
assert.strictEqual(v3Packet.opcode, messages.OP_COMPANION_SUMMARY_V3);
assert.deepStrictEqual(v3Packet.values, [
    ["number", messages.COMPANION_PROTOCOL_VERSION],
    ["number", 17],
    ["number", 1],
    ["number", 17],
    ["number", 54321],
    ["string", "Progression Companion"],
    ["number", 0.5],
    ["number", messages.COMPANION_MODE_TANK],
    ["number", expeditions.EXPEDITION_SPECIALTY_ORE],
    ["number", 120],
    ["number", 7],
    ["number", 9],
    ["number", 1234],
    ["number", 3],
    ["number", 15],
    ["number", 6],
    ["number", 88],
    ["number", 10],
]);
const v3Reader = packetReader(v3Packet.values);
const decodedV3 = new messages.CompanionState();
decodedV3.read(v3Reader, messages.COMPANION_PROTOCOL_VERSION);
assert.deepStrictEqual(decodedV3, v3State);
assert.strictEqual(v3Reader.consumed(), v3Packet.values.length);

const detail = new progressionMessages.CompanionDetailState();
detail.ackToken = 1000000001;
detail.companionId = 17;
detail.revision = 88;
detail.catalogVersion = 1;
detail.family = 4;
detail.professionId = 7;
detail.innateTraitId = 9;
detail.serviceXp = 1234;
detail.serviceRank = 3;
detail.capacity = 15;
detail.progress = 6;
detail.nextSlotCost = 0;
detail.features.push(new progressionMessages.CompanionDetailFeatureState(12, 2, 1, 4, 3));
const detailPacket = detail.write();
assert.strictEqual(detailPacket.opcode, progressionMessages.OP_COMPANION_DETAIL);
assert.deepStrictEqual(detailPacket.values, [
    ["number", 1000000001],
    ["number", 17],
    ["number", 88],
    ["number", 1],
    ["number", 4],
    ["number", 7],
    ["number", 9],
    ["number", 1234],
    ["number", 3],
    ["number", 15],
    ["number", 6],
    ["number", 0],
    ["number", 1],
    ["number", 12],
    ["number", 2],
    ["number", 1],
    ["number", 4],
    ["number", 3],
]);
const detailReader = packetReader(detailPacket.values);
const decodedDetail = new progressionMessages.CompanionDetailState();
decodedDetail.read(detailReader);
assert.deepStrictEqual(decodedDetail, detail);
assert.strictEqual(detailReader.consumed(), detailPacket.values.length);

const trainingAction = new progressionMessages.CompanionTrainingActionRequest(
    1000000002,
    88,
    1,
    17,
    progressionMessages.COMPANION_ACTION_INSTALL,
    12,
    4,
);
const trainingPacket = trainingAction.write();
assert.strictEqual(trainingPacket.opcode, progressionMessages.OP_COMPANION_TRAINING_ACTION);
assert.deepStrictEqual(trainingPacket.values, [
    ["number", 1000000002],
    ["number", 88],
    ["number", 1],
    ["number", 17],
    ["number", progressionMessages.COMPANION_ACTION_INSTALL],
    ["number", 12],
    ["number", 4],
]);
const decodedTraining = new progressionMessages.CompanionTrainingActionRequest();
decodedTraining.read(packetReader(trainingPacket.values));
assert.deepStrictEqual(decodedTraining, trainingAction);
assert.deepStrictEqual(
    [
        progressionMessages.OP_COMPANION_DETAIL_REQUEST,
        progressionMessages.OP_COMPANION_DETAIL,
        progressionMessages.OP_COMPANION_TRAINING_ACTION,
    ],
    [92, 93, 94],
);

const stateRequestPacket = new messages.CompanionStateRequest().write();
assert.deepStrictEqual(stateRequestPacket.values, [["number", messages.COMPANION_PROTOCOL_VERSION]]);

assert.deepStrictEqual(
    [
        messages.COMPANION_MODE_DEFENSE,
        messages.COMPANION_MODE_PASSIVE,
        messages.COMPANION_MODE_TANK,
    ],
    [0, 1, 2],
);

const request = new messages.CompanionModeRequest(3, messages.COMPANION_MODE_TANK);
const requestPacket = request.write();
const decodedRequest = new messages.CompanionModeRequest(0, messages.COMPANION_MODE_PASSIVE);
decodedRequest.read(packetReader(requestPacket.values));
assert.deepStrictEqual(decodedRequest, request);
assert.strictEqual(requestPacket.opcode, 75);
assert.strictEqual(messages.OP_COMPANION_MODE, 75);

const attackRequest = new messages.CompanionAttackRequest(3);
const attackPacket = attackRequest.write();
const decodedAttack = new messages.CompanionAttackRequest(0);
decodedAttack.read(packetReader(attackPacket.values));
assert.deepStrictEqual(decodedAttack, attackRequest);
assert.deepStrictEqual(attackPacket.values, [["number", 3]]);
assert.strictEqual(attackPacket.opcode, 84);
assert.strictEqual(messages.OP_COMPANION_ATTACK, 84);
assert.deepStrictEqual(
    new messages.CompanionAttackRequest(0).write().values,
    [["number", 0]],
);

const expeditionRequest = new messages.CompanionExpeditionRequest(
    3,
    messages.COMPANION_EXPEDITION_START,
);
const expeditionPacket = expeditionRequest.write();
const decodedExpedition = new messages.CompanionExpeditionRequest(0, 0);
decodedExpedition.read(packetReader(expeditionPacket.values));
assert.deepStrictEqual(decodedExpedition, expeditionRequest);
assert.strictEqual(expeditionPacket.opcode, 78);
assert.strictEqual(messages.OP_COMPANION_EXPEDITION, 78);
const claimRequest = new messages.CompanionExpeditionRequest(
    3,
    messages.COMPANION_EXPEDITION_CLAIM,
);
const claimPacket = claimRequest.write();
const decodedClaim = new messages.CompanionExpeditionRequest(0, 0);
decodedClaim.read(packetReader(claimPacket.values));
assert.deepStrictEqual(decodedClaim, claimRequest);
assert.deepStrictEqual(
    [messages.COMPANION_EXPEDITION_START, messages.COMPANION_EXPEDITION_CLAIM],
    [1, 2],
);

const defaultEntry = new messages.CompanionStateEntry(4, 67890, "Default", 1);
assert.strictEqual(defaultEntry.combatMode, messages.COMPANION_MODE_DEFENSE);
assert.strictEqual(defaultEntry.expeditionRemainingS, expeditions.EXPEDITION_NONE);

assert.strictEqual(
    expeditions.expeditionSpecialtyForCreatureType(1),
    expeditions.EXPEDITION_SPECIALTY_LEATHER,
);
assert.strictEqual(
    expeditions.expeditionSpecialtyForCreatureType(7),
    expeditions.EXPEDITION_SPECIALTY_CLOTH,
);
assert.strictEqual(
    expeditions.expeditionSpecialtyForCreatureType(4),
    expeditions.EXPEDITION_SPECIALTY_ORE,
);
assert.strictEqual(
    expeditions.expeditionSpecialtyName(expeditions.EXPEDITION_SPECIALTY_ORE),
    "Старатель — руда",
);
assert.strictEqual(
    expeditions.expeditionSpecialtyName(expeditions.EXPEDITION_SPECIALTY_ORE, false),
    "Prospector — ore",
);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_ORE, 15), 2770);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_ORE, 16), 2771);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_ORE, 65), 23424);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_ORE, 67), 23424);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_ORE, 68), 36909);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_ORE, 72), 36909);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_ORE, 73), 36912);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_LEATHER, 1), 2318);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_LEATHER, 80), 33568);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_CLOTH, 1), 2589);
assert.strictEqual(expeditions.expeditionRewardItem(expeditions.EXPEDITION_SPECIALTY_CLOTH, 80), 33470);
assert.strictEqual(expeditions.expeditionRewardCount(1), 2);
assert.strictEqual(expeditions.expeditionRewardCount(20), 2);
assert.strictEqual(expeditions.expeditionRewardCount(21), 3);
assert.strictEqual(expeditions.expeditionRewardCount(80), 5);
assert.strictEqual(expeditions.expeditionRewardCount(999), 5);
assert.strictEqual(expeditions.expeditionRemainingSeconds(0, 1000), expeditions.EXPEDITION_NONE);
assert.strictEqual(expeditions.expeditionRemainingSeconds(Number.NaN, 1000), expeditions.EXPEDITION_NONE);
assert.strictEqual(expeditions.expeditionRemainingSeconds(1000, 1000), 0);
assert.strictEqual(expeditions.expeditionRemainingSeconds(2501, 1000), 2);

assert.strictEqual(rules.canCommandCompanionAttack(false, false, true, false), true);
assert.strictEqual(rules.canCommandCompanionAttack(false, false, false, true), true);
assert.strictEqual(rules.canCommandCompanionAttack(false, false, false, false), false);
assert.strictEqual(rules.canCommandCompanionAttack(false, true, true, true), false);
assert.strictEqual(rules.canCommandCompanionAttack(true, false, true, true), false);
assert.strictEqual(rules.canRecruitCompanionTarget(false), true);
assert.strictEqual(rules.canRecruitCompanionTarget(true), false);
assert.strictEqual(rules.shouldSyncCompanionTalents(2, 1, false), true);
assert.strictEqual(rules.shouldSyncCompanionTalents(1, 1, true), true);
assert.strictEqual(rules.shouldSyncCompanionTalents(1, 1, false), false);
assert.strictEqual(rules.isTankOnlySpellEffect(63, 0), true);
assert.strictEqual(rules.isTankOnlySpellEffect(91, 0), true);
assert.strictEqual(rules.isTankOnlySpellEffect(114, 0), true);
assert.strictEqual(rules.isTankOnlySpellEffect(125, 0), true);
assert.strictEqual(rules.isTankOnlySpellEffect(130, 0), true);
assert.strictEqual(rules.isTankOnlySpellEffect(6, 10), true);
assert.strictEqual(rules.isTankOnlySpellEffect(6, 11), true);
assert.strictEqual(rules.isTankOnlySpellEffect(6, 103), true);
assert.strictEqual(rules.isTankOnlySpellEffect(2, 0), false);
assert.strictEqual(rules.isUnsafeRandomGemAbilityEffect(2, 0), false);
assert.strictEqual(rules.isUnsafeRandomGemAbilityEffect(28, 0), true);
assert.strictEqual(rules.isUnsafeRandomGemAbilityEffect(6, 2), true);
assert.strictEqual(rules.isUnsafeRandomGemAbilityEffect(6, 12), false);
assert.strictEqual(rules.canUseRandomGemAbility(0, 0x80, true, false), true);
assert.strictEqual(rules.canUseRandomGemAbility(0x40, 0x80, true, false), false);
assert.strictEqual(rules.canUseRandomGemAbility(0, 0x10, true, false), false);
assert.strictEqual(rules.canUseRandomGemAbility(0, 0x80, true, true), false);
assert.strictEqual(rules.canUseRandomGemAbility(0, 0x80, false, false), false);

console.log("companion protocols, expedition, combat, tank and talent-sync rules: ok");
