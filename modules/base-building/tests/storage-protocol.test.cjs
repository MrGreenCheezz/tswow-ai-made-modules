const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));

function loadTsModule(file, globals = {}, moduleRequire = require) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
    }).outputText;
    const module = { exports: {} };
    const names = ["exports", "module", "require", ...Object.keys(globals)];
    const values = [module.exports, module, moduleRequire, ...Object.values(globals)];
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
        ReadDouble(def = 0) {
            if (index >= values.length) return def;
            const value = values[index++];
            assert.strictEqual(value[0], "number");
            return value[1];
        },
        ReadString(def = "") {
            if (index >= values.length) return def;
            const value = values[index++];
            assert.strictEqual(value[0], "string");
            return value[1];
        },
        consumed() { return index; },
    };
}

const sharedDir = path.join(__dirname, "../shared");
const addonLocaleSource = fs.readFileSync(path.join(__dirname, "../addon/locale.ts"), "utf8");
const baseLivescriptSource = fs.readFileSync(path.join(__dirname, "../livescripts/base.ts"), "utf8");
assert(addonLocaleSource.includes('GetLocale() == "ruRU"'));
assert(baseLivescriptSource.includes("Number(player.GetDbcLocale()) == LocaleConstant.ruRU"));
const workforceLocaleSource = fs.readFileSync(path.join(__dirname, "../livescripts/workforce.ts"), "utf8");
for (const wireText of [
    "Состояние работников изменилось; список обновлён.",
    "Коллекция спутников ещё загружается.",
    "Выбранное рабочее место больше не существует.",
    "Это рабочее место уже занято.",
    "Спутник активен, находится в экспедиции или недоступен.",
    "Профессия спутника несовместима с этим рабочим местом.",
    "Некорректный запрос работника.",
    "Неизвестное действие работника.",
]) {
    assert(workforceLocaleSource.includes(`sendWorkforceError(player, msg, "${wireText}")`));
}
const messages = loadTsModule(path.join(sharedDir, "BaseMessages.ts"), {
    CreateCustomPacket: createPacket,
});
assert.strictEqual(messages.COMPANION_WORKFORCE_TOKEN_MIN, 1000000000);
const resourceGenerators = loadTsModule(path.join(sharedDir, "ResourceGenerators.ts"));
const woodItemIds = [900001, 900002, 900003, 900004, 900005, 900006];
const catalog = loadTsModule(
    path.join(sharedDir, "BaseCatalog.ts"),
    {},
    request => request === "./ResourceGenerators" ? resourceGenerators : require(request),
);
const orders = loadTsModule(
    path.join(sharedDir, "BaseOrders.ts"),
    { CreateCustomPacket: createPacket },
    request => request === "./BaseCatalog" ? catalog : require(request),
);
const craftStationLogic = loadTsModule(path.join(sharedDir, "CraftStationLogic.ts"));
const stationBudgetLogic = loadTsModule(path.join(sharedDir, "StationBudgetLogic.ts"));
const workforceXPLogic = loadTsModule(path.join(sharedDir, "WorkforceXPLogic.ts"));
assert.deepStrictEqual(catalog.BUILDING_WOOD_ITEMS, []);
catalog.setBuildingWoodItems(woodItemIds);
resourceGenerators.hydrateResourceGeneratorWoodItems(woodItemIds);
const gallery = loadTsModule(
    path.join(__dirname, "../livescripts/gallery.ts"),
    {},
    request => request === "./base"
        ? { baseText: (_player, english) => english }
        : require(request),
);
const woodProfessionTags = new Map([
    ["spell/woodcutting-rank-1", 910001],
    ["spell/woodcutting-rank-2", 910002],
    ["spell/woodcutting-rank-3", 910003],
    ["spell/woodcutting-rank-4", 910004],
    ["spell/woodcutting-rank-5", 910005],
    ["spell/woodcutting-rank-6", 910006],
    ["spell/woodcutting-gather", 910099],
]);
const woodcuttingSkillId = 920001;
const professionLogic = loadTsModule(
    path.join(__dirname, "../../gem-abilities/livescripts/professions.ts"),
    {
        GetID(table, mod, id) {
            assert.deepStrictEqual([table, mod, id], ["SkillLine", "base-building", "woodcutting"]);
            return woodcuttingSkillId;
        },
        UTAG(mod, tag) {
            assert.strictEqual(mod, "base-building");
            assert(woodProfessionTags.has(tag), `Unexpected profession tag ${tag}`);
            return woodProfessionTags.get(tag);
        },
    },
    request => request === "./localization"
        ? { playerText: (_player, english) => english }
        : require(request),
);

const baseState = new messages.BaseState();
baseState.hasFlag = 1;
baseState.count = 17;
baseState.max = 45;
baseState.woodItems = woodItemIds;
const baseStatePacket = baseState.write();
const baseStateReader = packetReader(baseStatePacket.values);
const decodedBaseState = new messages.BaseState();
decodedBaseState.read(baseStateReader);
assert.deepStrictEqual(decodedBaseState, baseState);
assert.strictEqual(baseStateReader.consumed(), baseStatePacket.values.length);

const knownProfessionSpells = new Set([
    woodProfessionTags.get("spell/woodcutting-rank-1"),
]);
const professionSkills = new Map();
const setSkillCalls = [];
const professionPlayer = {
    HasSpell(id) { return knownProfessionSpells.has(id); },
    HasSkill(id) { return professionSkills.has(id); },
    LearnSpell(id) { knownProfessionSpells.add(id); },
    RemoveSpell(id) { knownProfessionSpells.delete(id); },
    GetSkillValue(id) { return professionSkills.get(id) || 0; },
    SetSkill(id, step, value, max) {
        setSkillCalls.push([id, step, value, max]);
        professionSkills.set(id, value);
    },
    SendBroadcastMessage() {},
};
professionLogic.initCustomProfessions();
professionLogic.initCustomProfessions(); // повторная инициализация после reload не дублирует цепочку
professionLogic.grantAllProfessions(professionPlayer);
assert(knownProfessionSpells.has(woodProfessionTags.get("spell/woodcutting-rank-1")));
assert(knownProfessionSpells.has(woodProfessionTags.get("spell/woodcutting-gather")));
assert.strictEqual(professionSkills.get(woodcuttingSkillId), 1);
assert(setSkillCalls.some(call =>
    call[0] == woodcuttingSkillId && call[1] == 1 && call[2] == 1 && call[3] == 75
));
professionSkills.set(woodcuttingSkillId, 75);
professionLogic.maybeUpgradeProfessions(professionPlayer);
assert(knownProfessionSpells.has(woodProfessionTags.get("spell/woodcutting-rank-2")));

const state = new messages.StorageState();
state.station = catalog.SMELTER_KEY;
state.openWindow = 1;
state.nextCycleS = 123;
state.working = 1;
state.level = 2;
state.periodS = 180;
state.batch = 12;
state.upgradeAvailable = 0;
state.pendingProperties = 2;
state.quarantinedOutputs = 1;
state.acceptedInputs = [2770, 2771, 3858];
state.items.push(new messages.StorageEntry(2770, 9, messages.STORAGE_BUCKET_INPUT, "Медная руда"));
state.items.push(new messages.StorageEntry(2840, 4, messages.STORAGE_BUCKET_OUTPUT, "Медный слиток"));

const statePacket = state.write();
const stateReader = packetReader(statePacket.values);
const decodedState = new messages.StorageState();
decodedState.read(stateReader);
assert.deepStrictEqual(decodedState, state);
assert.strictEqual(stateReader.consumed(), statePacket.values.length);
// Pending/quarantine counters are a trailing optional extension: the old wire
// prefix remains byte-for-byte intact, and a new reader defaults old packets.
assert.deepStrictEqual(statePacket.values.slice(-2), [["number", 2], ["number", 1]]);
const legacyStateReader = packetReader(statePacket.values.slice(0, -2));
const decodedLegacyState = new messages.StorageState();
decodedLegacyState.read(legacyStateReader);
assert.strictEqual(decodedLegacyState.pendingProperties, 0);
assert.strictEqual(decodedLegacyState.quarantinedOutputs, 0);
assert.strictEqual(legacyStateReader.consumed(), statePacket.values.length - 2);

const workforceRequest = new messages.WorkforceRequest(
    messages.WORKFORCE_ACTION_ASSIGN,
    17,
    messages.WORKFORCE_TARGET_GENERATOR,
    44,
    9,
    1234,
);
const workforceRequestPacket = workforceRequest.write();
assert.strictEqual(workforceRequestPacket.opcode, messages.OP_WORKFORCE_REQUEST);
const decodedWorkforceRequest = new messages.WorkforceRequest();
decodedWorkforceRequest.read(packetReader(workforceRequestPacket.values));
assert.deepStrictEqual(decodedWorkforceRequest, workforceRequest);
const companionWorkforceError = new messages.ErrorMsg("Ошибка работника")
    .write(messages.OP_COMPANION_WORKFORCE_ERROR);
assert.strictEqual(companionWorkforceError.opcode, messages.OP_COMPANION_WORKFORCE_ERROR);

const workforceTarget = new messages.WorkforceTarget();
Object.assign(workforceTarget, {
    targetKind: messages.WORKFORCE_TARGET_GENERATOR,
    targetId: 44,
    catKey: 202,
    generatorCategory: 1,
    name: "Генератор",
    workerId: 17,
    workerEntry: 123,
    profession: 1,
    trait: 4,
    rank: 3,
    periodBps: 1200,
    saveBps: 800,
    bonusBps: 1000,
    bias: 2,
    markBps: 500,
    markProperty: 7001,
    pendingXP: 12,
});
const workforceState = new messages.WorkforceState();
workforceState.revision = 9;
workforceState.requestToken = 1234;
workforceState.targets = [workforceTarget];
const workforcePacket = workforceState.write();
assert.strictEqual(workforcePacket.opcode, messages.OP_WORKFORCE_STATE);
const companionWorkforcePacket = workforceState.write(messages.OP_COMPANION_WORKFORCE_STATE);
assert.strictEqual(companionWorkforcePacket.opcode, messages.OP_COMPANION_WORKFORCE_STATE);
assert.deepStrictEqual(companionWorkforcePacket.values, workforcePacket.values);
const decodedWorkforceState = new messages.WorkforceState();
const workforceReader = packetReader(workforcePacket.values);
decodedWorkforceState.read(workforceReader);
assert.deepStrictEqual(decodedWorkforceState, workforceState);
assert.strictEqual(workforceReader.consumed(), workforcePacket.values.length);

// The published batch is immutable until its exact persisted acknowledgement.
// Grants made after a crash/relog stay queued behind the same revision.
const xpBatch = { pendingXP: 0, queuedXP: 0, xpRevision: 0 };
assert.strictEqual(workforceXPLogic.queueWorkXP(xpBatch, 5), true);
assert.deepStrictEqual(xpBatch, { pendingXP: 5, queuedXP: 0, xpRevision: 1 });
assert.strictEqual(workforceXPLogic.queueWorkXP(xpBatch, 3), true);
assert.strictEqual(workforceXPLogic.queueWorkXP(xpBatch, 2), true);
assert.deepStrictEqual(xpBatch, { pendingXP: 5, queuedXP: 5, xpRevision: 1 });
assert.strictEqual(workforceXPLogic.acknowledgeWorkXP(xpBatch, 0), false);
assert.deepStrictEqual(xpBatch, { pendingXP: 5, queuedXP: 5, xpRevision: 1 });
assert.strictEqual(workforceXPLogic.acknowledgeWorkXP(xpBatch, 1), true);
assert.deepStrictEqual(xpBatch, { pendingXP: 5, queuedXP: 0, xpRevision: 2 });
assert.strictEqual(workforceXPLogic.acknowledgeWorkXP(xpBatch, 1), false);
assert.deepStrictEqual(xpBatch, { pendingXP: 5, queuedXP: 0, xpRevision: 2 });
assert.strictEqual(workforceXPLogic.acknowledgeWorkXP(xpBatch, 2), true);
assert.deepStrictEqual(xpBatch, { pendingXP: 0, queuedXP: 0, xpRevision: 2 });
assert.strictEqual(workforceXPLogic.acknowledgeWorkXP(xpBatch, 2), false);

const move = new messages.StorageMoveMsg(
    messages.OP_STORE_WITHDRAW,
    catalog.SMELTER_KEY,
    2840,
    1,
    messages.STORAGE_BUCKET_OUTPUT,
);
const movePacket = move.write();
const decodedMove = new messages.StorageMoveMsg(messages.OP_STORE_WITHDRAW, 0, 0, 0, 0);
decodedMove.read(packetReader(movePacket.values));
assert.strictEqual(decodedMove.station, move.station);
assert.strictEqual(decodedMove.itemEntry, move.itemEntry);
assert.strictEqual(decodedMove.count, move.count);
assert.strictEqual(decodedMove.bucket, move.bucket);

const manageState = new messages.ManageState(
    101,
    4001001,
    Array.from({ length: 12 }, (_, index) => new messages.ManageEntry(
        101 + index,
        4001001 + index,
        index == 0 ? 12 : 4001001 + index,
        1.25 + index,
    )),
);
const managePacket = manageState.write();
const manageReader = packetReader(managePacket.values);
const decodedManage = new messages.ManageState(0, 0, []);
decodedManage.read(manageReader);
assert.deepStrictEqual(decodedManage, manageState);
assert.strictEqual(managePacket.opcode, messages.OP_BASE_MANAGE_STATE);
assert.strictEqual(manageReader.consumed(), managePacket.values.length);

const selection = new messages.SelectMsg(202, 4001002);
const decodedSelection = new messages.SelectMsg();
decodedSelection.read(packetReader(selection.write().values));
assert.deepStrictEqual(decodedSelection, selection);

const baseMove = new messages.MoveMsg(messages.MOVE_AXIS_Z, -1, 0.25);
const decodedBaseMove = new messages.MoveMsg(messages.MOVE_AXIS_X, 1, 0);
const baseMovePacket = baseMove.write();
decodedBaseMove.read(packetReader(baseMovePacket.values));
assert.deepStrictEqual(decodedBaseMove, baseMove);
assert.strictEqual(baseMovePacket.opcode, messages.OP_BASE_MOVE);

const orderState = new orders.OrderStateMsg();
orderState.openWindow = 1;
orderState.cycleToken = 12345;
orderState.refreshSeconds = 4321;
orderState.acceptedThisCycle = 0;
orderState.activeToken = 67890;
orderState.activeSlot = 3;
orderState.activeType = orders.ORDER_KILL;
orderState.activeTier = 4;
orderState.activeTarget = 123;
orderState.activeRequired = 9;
orderState.activeProgress = 4;
orderState.activeDeposited = 2;
orderState.activeMoney = 500000;
orderState.activeName = "Test target";
orderState.offers.push(new orders.OrderOfferView(1, orders.ORDER_MATERIAL, 2, 2771, 12, 50000, "Tin Ore"));
orderState.offers.push(new orders.OrderOfferView(2, orders.ORDER_CRAFT, 3, 999, 1, 225000, "Crafted item"));
const orderPacket = orderState.write();
const orderReader = packetReader(orderPacket.values);
const decodedOrderState = new orders.OrderStateMsg();
decodedOrderState.read(orderReader);
assert.deepStrictEqual(decodedOrderState, orderState);
assert.strictEqual(orderPacket.opcode, orders.OP_ORDER_STATE);
assert.strictEqual(orderReader.consumed(), orderPacket.values.length);

const acceptOrder = new orders.OrderAcceptMsg(12345, 2);
const decodedAcceptOrder = new orders.OrderAcceptMsg();
decodedAcceptOrder.read(packetReader(acceptOrder.write().values));
assert.deepStrictEqual(decodedAcceptOrder, acceptOrder);
const turnInOrder = new orders.OrderTurnInMsg(67890);
const decodedTurnInOrder = new orders.OrderTurnInMsg();
decodedTurnInOrder.read(packetReader(turnInOrder.write().values));
assert.deepStrictEqual(decodedTurnInOrder, turnInOrder);
const abandonOrder = new orders.OrderAbandonMsg(67890);
const decodedAbandonOrder = new orders.OrderAbandonMsg();
decodedAbandonOrder.read(packetReader(abandonOrder.write().values));
assert.deepStrictEqual(decodedAbandonOrder, abandonOrder);
assert.deepStrictEqual(
    [orders.OP_ORDER_STATE, orders.OP_ORDER_REQUEST, orders.OP_ORDER_ACCEPT, orders.OP_ORDER_TURN_IN, orders.OP_ORDER_ABANDON],
    [79, 80, 81, 82, 83],
);
assert.deepStrictEqual([1, 20, 21, 35, 36, 50, 51, 68, 69, 80].map(orders.maxOrderTier), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
for (let tier = 1; tier <= 5; tier++) {
    assert(orders.materialOrderCount(tier, 0) > 0);
    assert(orders.killOrderCount(tier, 0.999) >= orders.killOrderCount(tier, 0));
    if (tier > 1) assert(orders.orderRewardMoney(orders.ORDER_MATERIAL, tier) > orders.orderRewardMoney(orders.ORDER_MATERIAL, tier - 1));
}

assert.strictEqual(catalog.PROCESS_PERIOD_BY_LEVEL.length, catalog.STATION_MAX_LEVEL + 1);
assert.strictEqual(catalog.PROCESS_BATCH_BY_LEVEL.length, catalog.STATION_MAX_LEVEL + 1);
assert.strictEqual(catalog.PROCESS_OFFLINE_CAP_S, 8 * 60 * 60);
assert.strictEqual(catalog.GO_COOKING_ENTRY, 12665);
assert.strictEqual(catalog.buildingByKey(catalog.COOKING_KEY).entry, catalog.GO_COOKING_ENTRY);
assert(catalog.STATION_KEYS.includes(catalog.COOKING_KEY));
const addedStations = [
    catalog.LEATHERWORKING_KEY,
    catalog.LOOM_KEY,
    catalog.INSCRIPTION_KEY,
    catalog.STONECUTTING_KEY,
    catalog.ENGINEERING_KEY,
    catalog.BUTCHER_KEY,
];
assert.deepStrictEqual(addedStations, [85, 86, 87, 88, 89, 90]);
const addedEntries = [
    catalog.GO_LEATHERWORKING_ENTRY,
    catalog.GO_LOOM_ENTRY,
    catalog.GO_INSCRIPTION_ENTRY,
    catalog.GO_STONECUTTING_ENTRY,
    catalog.GO_ENGINEERING_ENTRY,
    catalog.GO_BUTCHER_ENTRY,
];
assert.strictEqual(new Set(addedEntries).size, addedEntries.length);
for (let i = 0; i < addedStations.length; i++) {
    const station = addedStations[i];
    assert(catalog.STATION_KEYS.includes(station));
    assert(catalog.buildingByKey(station), `Station ${station} must be present in the building catalog`);
    assert.strictEqual(catalog.buildingByKey(station).entry, addedEntries[i]);
}
assert.deepStrictEqual(
    [catalog.TRAINING_DUMMY_KEY, catalog.RESTORATION_ALTAR_KEY],
    [91, 92],
);
assert.strictEqual(catalog.buildingByKey(catalog.TRAINING_DUMMY_KEY).kind, "npc");
assert.strictEqual(
    catalog.buildingByKey(catalog.RESTORATION_ALTAR_KEY).entry,
    catalog.GO_RESTORATION_ALTAR_ENTRY,
);
assert.strictEqual(catalog.restorationWaitSeconds(1000, 1000), catalog.RESTORATION_COOLDOWN_S);
assert.strictEqual(catalog.restorationWaitSeconds(1000, 1150), 150);
assert.strictEqual(catalog.restorationWaitSeconds(1000, 1300), 0);
const randomStations = [
    catalog.LEATHER_ARMOR_KEY,
    catalog.PLATE_ARMOR_KEY,
    catalog.CLOTH_ARMOR_KEY,
    catalog.WEAPON_FORGE_KEY,
    catalog.JEWELRY_KEY,
];
assert.deepStrictEqual(randomStations, [93, 94, 95, 96, 97]);
for (const station of randomStations) {
    assert(catalog.STATION_KEYS.includes(station));
    assert(catalog.buildingByKey(station));
}
assert.strictEqual(catalog.ORDERS_BOARD_KEY, 99);
assert(catalog.buildingByKey(catalog.ORDERS_BOARD_KEY));
assert.deepStrictEqual(
    [
        catalog.HEALING_DUMMY_KEY,
        catalog.CLEANSING_FONT_KEY,
        catalog.REPAIR_STATION_KEY,
        catalog.CAPITAL_PORTAL_KEY,
        catalog.BASE_HERALD_KEY,
        catalog.TACTICAL_TABLE_KEY,
        catalog.ECHO_VENDOR_KEY,
    ],
    [100, 101, 102, 103, 104, 105, 112],
);
assert.deepStrictEqual(catalog.SERVICE_EXPANSION_KEYS, [100, 101, 102, 103, 104, 105, 112]);
assert.deepStrictEqual(
    [
        catalog.SHIELDBEARER_KEY,
        catalog.BATTLE_MAGE_KEY,
        catalog.BALLISTA_KEY,
        catalog.FROST_TRAP_KEY,
        catalog.RUNIC_OBELISK_KEY,
        catalog.WATCH_GONG_KEY,
    ],
    [106, 107, 108, 109, 110, 111],
);
assert.deepStrictEqual(catalog.DEFENSE_EXPANSION_KEYS, [106, 107, 108, 109, 110, 111]);
assert.deepStrictEqual(catalog.GUARD_KEYS, [78, 79, 81, 106, 107, 108]);
assert.deepStrictEqual(catalog.DEFENSE_BUILDING_KEYS, [78, 79, 80, 81, 106, 107, 108, 109, 110, 111]);
for (const key of [109, 110, 111]) assert(!catalog.GUARD_KEYS.includes(key));
const expansionBuildingKeys = [...catalog.SERVICE_EXPANSION_KEYS, ...catalog.DEFENSE_EXPANSION_KEYS];
assert.strictEqual(catalog.BUILDINGS.length, 164);
assert.strictEqual(new Set(catalog.BUILDINGS.map(building => building.key)).size, catalog.BUILDINGS.length);
for (const key of expansionBuildingKeys) {
    const building = catalog.buildingByKey(key);
    assert(building, `Expansion building ${key} must be present in the catalog`);
    assert(!catalog.isDecorativeBuildingKey(key), `Expansion building ${key} must remain functional`);
    assert(catalog.buildingMaterialCost(key).length > 0, `Expansion building ${key} must have a price`);
    assert.strictEqual(catalog.maxBuildingCopies(key), key == 108 || key == 109 ? 2 : 1);
}
for (const key of [0, 57, 78, 99, 200]) assert.strictEqual(catalog.maxBuildingCopies(key), 0);
assert.strictEqual(catalog.cooldownWaitSeconds(1000, 1000, 300), 300);
assert.strictEqual(catalog.cooldownWaitSeconds(1000, 1150, 300), 150);
assert.strictEqual(catalog.cooldownWaitSeconds(1000, 1300, 300), 0);
assert.strictEqual(catalog.BUILDINGS.filter(row => catalog.isDecorativeBuildingKey(row.key)).length, 56);
for (let key = 0; key <= 11; key++) assert(catalog.isDecorativeBuildingKey(key));
for (let key = 13; key <= 56; key++) assert(catalog.isDecorativeBuildingKey(key));
for (const key of [12, 57, 58, 59, 60, 61, 75, 76, 80, 82, 83, 84, ...addedStations, 91, 92]) {
    assert(!catalog.isDecorativeBuildingKey(key), `Functional building ${key} must remain selectable`);
}
assert.deepStrictEqual(
    catalog.BUILDING_ORE_ITEMS,
    [2770, 2771, 2772, 3858, 10620, 23424, 36909, 36912],
);
assert.deepStrictEqual(
    catalog.BUILDING_HERB_ITEMS,
    [2447, 2450, 3356, 3821, 8838, 22785, 36901, 36906],
);
assert.deepStrictEqual(catalog.BUILDING_CLOTH_ITEMS, [2589, 2592, 4306, 4338, 14047, 21877, 33470]);
assert.deepStrictEqual(catalog.BUILDING_LEATHER_ITEMS, [2318, 2319, 4234, 4304, 8170, 21887, 33568]);
assert.deepStrictEqual(catalog.BUILDING_STONE_ITEMS, [2835, 2836, 2838, 7912, 12365]);
assert.deepStrictEqual(catalog.BUILDING_WOOD_ITEMS, woodItemIds);
const resourcePools = [
    catalog.BUILDING_ORE_ITEMS,
    catalog.BUILDING_HERB_ITEMS,
    catalog.BUILDING_CLOTH_ITEMS,
    catalog.BUILDING_LEATHER_ITEMS,
    catalog.BUILDING_STONE_ITEMS,
    catalog.BUILDING_WOOD_ITEMS,
];
for (let i = 0; i < resourcePools.length; i++) {
    for (let j = i + 1; j < resourcePools.length; j++) {
        assert.deepStrictEqual(resourcePools[i].filter(entry => resourcePools[j].includes(entry)), []);
    }
}
const functionalMaterialRecipes = new Set();
const materialNames = new Set();
for (const building of catalog.BUILDINGS) {
    assert(!/[А-Яа-яЁё]/.test(catalog.buildingName(building, false)), `Building ${building.key} needs an English name`);
    assert(!/[А-Яа-яЁё]/.test(catalog.buildingHint(building, false)), `Building ${building.key} needs an English hint`);
    const cost = catalog.buildingMaterialCost(building.key);
    assert(cost.length > 0, `Building ${building.key} must have a material cost`);
    for (const material of cost) {
        materialNames.add(material.name);
        assert(!/[А-Яа-яЁё]/.test(material.nameEn), `Material ${material.name} needs an English name`);
        assert(Number.isInteger(material.count) && material.count > 0);
        assert(material.entries.length > 0);
        assert.strictEqual(new Set(material.entries).size, material.entries.length);
    }
    if (catalog.isDecorativeBuildingKey(building.key)) {
        assert.deepStrictEqual(cost, catalog.DECORATION_MATERIAL_COST);
    } else {
        functionalMaterialRecipes.add(catalog.materialCostText(cost));
    }
}
assert.strictEqual(catalog.warehouseRejectReason(12, 0, false, false), "Quest items cannot be stored.");
assert.strictEqual(catalog.warehouseRejectReason(12, 0, false, true), "Квестовые предметы хранить нельзя.");
assert(functionalMaterialRecipes.size >= 8, "Functional buildings should use varied recipes");
for (const aggregate of ["Любая древесина", "Любая кожа", "Любая руда", "Любая ткань", "Любая трава", "Любой камень"]) {
    assert(materialNames.has(aggregate));
}
assert.deepStrictEqual(catalog.buildingMaterialCost(75), [{
    name: "Медная руда", nameEn: "Copper Ore", entries: [2770], count: 40,
}]);
assert.deepStrictEqual(catalog.buildingMaterialCost(76), [{
    name: "Мироцвет", nameEn: "Peacebloom", entries: [2447], count: 40,
}]);
assert.strictEqual(
    catalog.materialCostText(catalog.buildingMaterialCost(77)),
    "20 × Любая руда + 20 × Любой камень + 10 × Любая древесина",
);
assert.strictEqual(
    catalog.materialCostText(catalog.buildingMaterialCost(77), false),
    "20 × Any Ore + 20 × Any Stone + 10 × Any Wood",
);
assert.deepStrictEqual(catalog.DECORATION_MATERIAL_COST, [{
    name: "Любая древесина", nameEn: "Any Wood", entries: catalog.BUILDING_WOOD_ITEMS, count: 5,
}]);
assert.deepStrictEqual(
    catalog.stationUpgradeMaterialCost(catalog.SMELTER_KEY, 0),
    catalog.buildingMaterialCost(catalog.SMELTER_KEY),
);
assert.deepStrictEqual(
    catalog.stationUpgradeMaterialCost(catalog.LAB_KEY, 1).map(row => row.count),
    catalog.buildingMaterialCost(catalog.LAB_KEY).map(row => row.count * 2),
);
assert.deepStrictEqual(catalog.stationUpgradeMaterialCost(catalog.SMELTER_KEY, 2), []);
for (let level = 1; level <= catalog.STATION_MAX_LEVEL; level++) {
    assert(catalog.PROCESS_PERIOD_BY_LEVEL[level] < catalog.PROCESS_PERIOD_BY_LEVEL[level - 1]);
    assert(catalog.PROCESS_BATCH_BY_LEVEL[level] > catalog.PROCESS_BATCH_BY_LEVEL[level - 1]);
}
assert.deepStrictEqual(catalog.CRAFT_PERIOD_BY_LEVEL, [1800, 1200, 900]);
assert.deepStrictEqual(catalog.WEAPON_CRAFT_PERIOD_BY_LEVEL, [3600, 2400, 1800]);

const stationFixture = [
    [1, 1001, 2001, 165, 1, 1, 2318, 2],
    [1, 1002, 2002, 165, 150, 3, 4234, 4],
    [1, 1003, 2003, 165, 150, 3, 4234, 5],
    [1, 1004, 2004, 165, 75, 2, 2319, 3],
];
assert.strictEqual(craftStationLogic.selectHighestTierCraftRecipe(stationFixture, 0), stationFixture[1]);
assert.strictEqual(craftStationLogic.selectHighestTierCraftRecipe(stationFixture, 0.999), stationFixture[2]);
assert.strictEqual(craftStationLogic.selectHighestTierCraftRecipe(stationFixture, 0.7, 3), stationFixture[1]);
assert.strictEqual(craftStationLogic.selectHighestTierCraftRecipe([], 0.5), undefined);
const roundRobinHits = [];
assert.strictEqual(stationBudgetLogic.runRoundRobinStationBudget(
    3, 7, 0, index => { roundRobinHits.push(index); return true; },
), 7);
assert.deepStrictEqual(roundRobinHits, [0, 1, 2, 0, 1, 2, 0]);
const sparseAttempts = [];
assert.strictEqual(stationBudgetLogic.runRoundRobinStationBudget(
    3, 4, 1, index => { sparseAttempts.push(index); return index == 0; },
), 4);
assert.deepStrictEqual(sparseAttempts.filter(index => index == 0), [0, 0, 0, 0]);
let unavailableAttempts = 0;
assert.strictEqual(stationBudgetLogic.runRoundRobinStationBudget(
    4, 100, 2, _index => { unavailableAttempts++; return false; },
), 0);
assert.strictEqual(unavailableAttempts, 4);

assert.strictEqual(resourceGenerators.RESOURCE_GENERATORS.length, 52);
assert.deepStrictEqual(resourceGenerators.validateResourceGeneratorCatalog(), []);
const generatorVisualSource = fs.readFileSync(
    path.join(__dirname, "../datascripts/resource-generators.ts"),
    "utf8",
);
assert.deepStrictEqual(
    [...generatorVisualSource.matchAll(/\{ id: "([^"]+)"/g)].map(match => match[1]),
    resourceGenerators.RESOURCE_GENERATORS.map(generator => generator.id),
);
const generatorHydrationSource = fs.readFileSync(path.join(__dirname, "../livescripts/base.ts"), "utf8");
assert.deepStrictEqual(
    [...generatorHydrationSource.matchAll(/go\/resource-generator-([^"]+)"\)/g)]
        .map(match => match[1])
        .filter(id => id !== "ready-effect"),
    resourceGenerators.RESOURCE_GENERATORS.map(generator => generator.id),
);
assert.deepStrictEqual(
    resourceGenerators.RESOURCE_GENERATORS
        .filter(generator => generator.category === "junk")
        .map(generator => [generator.id, generator.requiredSkill, generator.sourceEntry, generator.cost.item.entry]),
    [
        ["salvage-puddle", 1, 180655, 6291],
        ["schooner-wreckage", 75, 180662, 6361],
        ["waterlogged-wreckage", 150, 180685, 6362],
        ["floating-wreckage", 225, 180751, 13758],
        ["bloodsail-wreckage", 225, 180901, 8365],
        ["steam-pump-flotsam", 325, 182952, 27422],
    ],
);
for (const generator of resourceGenerators.RESOURCE_GENERATORS) {
    const cost = catalog.buildingMaterialCost(generator.key);
    assert.strictEqual(cost.length, 1);
    assert.strictEqual(cost[0].count, 40);
    assert.deepStrictEqual(cost[0].entries, [generator.cost.item.entry]);
    assert(catalog.buildingByKey(generator.key));
}

for (const station of [catalog.SMELTER_KEY, catalog.LAB_KEY, catalog.COOKING_KEY]) {
    const recipes = catalog.recipesFor(station);
    const inputs = new Set(recipes.map(recipe => recipe.input));
    for (const recipe of recipes) {
        assert(!inputs.has(recipe.output), `Station ${station}: output ${recipe.output} is also an input`);
    }
}

for (const station of catalog.STATION_KEYS.filter(key =>
    key !== catalog.STORAGE_KEY && !catalog.RANDOM_CRAFT_STATION_KEYS.includes(key)
)) {
    const recipes = catalog.recipesFor(station);
    assert(recipes.length > 0, `Station ${station} must have recipes`);
    const inputs = new Set();
    for (const recipe of recipes) {
        assert(recipe.inCount > 0 && recipe.outCount > 0, `Station ${station} has an empty recipe`);
        assert(!inputs.has(recipe.input), `Station ${station} has duplicate input ${recipe.input}`);
        inputs.add(recipe.input);
        assert.strictEqual(catalog.recipeByInput(station, recipe.input), recipe);
    }
}

assert.strictEqual(catalog.warehouseRejectReason(7, 0, false), undefined);
assert.strictEqual(catalog.warehouseRejectReason(15, 0, false), undefined); // чертежи/одиночные предметы
assert.match(catalog.warehouseRejectReason(12, 0, false), /Квестовые/);
assert.match(catalog.warehouseRejectReason(2, 13, false), /Экипировку/);
assert.match(catalog.warehouseRejectReason(0, 0, true), /Сотворённые/);

assert.strictEqual(catalog.masteryExtraCopy(0, 0), 0);
assert.strictEqual(catalog.masteryExtraCopy(2500, 0.2499), 1);
assert.strictEqual(catalog.masteryExtraCopy(2500, 0.25), 0);
assert.strictEqual(catalog.masteryExtraCopy(20000, 0.9999), 1);
const baseSource = fs.readFileSync(path.join(__dirname, "../livescripts/base.ts"), "utf8");
const cityAreaMatch = baseSource.match(/const CITY_AREA_IDS[^=]*= \[([\s\S]*?)\];/);
assert(cityAreaMatch, "city area list must remain explicit in the authoritative livescript");
const cityAreaIds = (cityAreaMatch[1].match(/\d+/g) || []).map(Number);
const areaTablePath = path.join(
    __dirname,
    "../../default/datasets/dataset/dbc/AreaTable.dbc",
);
const areaTable = fs.readFileSync(areaTablePath);
assert.strictEqual(areaTable.subarray(0, 4).toString(), "WDBC");
const areaCount = areaTable.readUInt32LE(4);
const areaRecordSize = areaTable.readUInt32LE(12);
const areaRows = [];
for (let index = 0; index < areaCount; index++) {
    const offset = 20 + index * areaRecordSize;
    areaRows.push({
        id: areaTable.readUInt32LE(offset),
        parent: areaTable.readUInt32LE(offset + 8),
        flags: areaTable.readUInt32LE(offset + 16),
    });
}
const areaById = new Map(areaRows.map(row => [row.id, row]));
const isCityRow = row => {
    let current = row;
    for (let depth = 0; current && depth < 20; depth++) {
        if ((current.flags & 0x300) != 0) return true;
        current = areaById.get(current.parent);
    }
    return false;
};
assert.deepStrictEqual(
    cityAreaIds,
    areaRows.filter(isCityRow).map(row => row.id),
    "CITY_AREA_IDS must match CAPITAL/CITY AreaTable flags and child districts",
);
const baseDbSource = fs.readFileSync(path.join(__dirname, "../livescripts/base-db.ts"), "utf8");
const raidsSource = fs.readFileSync(path.join(__dirname, "../livescripts/raids.ts"), "utf8");
const servicesSource = fs.readFileSync(path.join(__dirname, "../livescripts/services.ts"), "utf8");
const storageSource = fs.readFileSync(path.join(__dirname, "../livescripts/storage.ts"), "utf8");
const workforceSource = fs.readFileSync(path.join(__dirname, "../livescripts/workforce.ts"), "utf8");
const workforceXPSource = fs.readFileSync(path.join(__dirname, "../shared/WorkforceXPLogic.ts"), "utf8");
const generatorRuntimeSource = fs.readFileSync(path.join(__dirname, "../livescripts/resource-generators.ts"), "utf8");
const ordersRuntimeSource = fs.readFileSync(path.join(__dirname, "../livescripts/orders.ts"), "utf8");
const galleryRuntimeSource = fs.readFileSync(path.join(__dirname, "../livescripts/gallery.ts"), "utf8");
const livescriptsEntrySource = fs.readFileSync(path.join(__dirname, "../livescripts/livescripts.ts"), "utf8");
const addonSource = fs.readFileSync(path.join(__dirname, "../addon/base-ui.ts"), "utf8");
const workforceAddonSource = fs.readFileSync(path.join(__dirname, "../addon/workforce-ui.ts"), "utf8");
const ordersAddonSource = fs.readFileSync(path.join(__dirname, "../addon/orders-ui.ts"), "utf8");
const catalogSource = fs.readFileSync(path.join(__dirname, "../shared/BaseCatalog.ts"), "utf8");
const datascriptSource = fs.readFileSync(path.join(__dirname, "../datascripts/datascripts.ts"), "utf8");
const functionalBuildingDatascriptSource = fs.readFileSync(
    path.join(__dirname, "../datascripts/functional-buildings.ts"),
    "utf8",
);
const echoDatascriptSource = fs.readFileSync(
    path.join(__dirname, "../../echoes/datascripts/datascripts.ts"),
    "utf8",
);
const patchDatascriptSource = fs.readFileSync(path.join(__dirname, "../datascripts/patch-buildings.ts"), "utf8");
const woodcuttingSource = fs.readFileSync(path.join(__dirname, "../datascripts/woodcutting.ts"), "utf8");
const generatorDatascriptSource = fs.readFileSync(path.join(__dirname, "../datascripts/resource-generators.ts"), "utf8");
const ordersDatascriptSource = fs.readFileSync(path.join(__dirname, "../datascripts/orders.ts"), "utf8");
const resourceDensitySource = fs.readFileSync(path.join(__dirname, "../datascripts/resource-density.ts"), "utf8");
const manageListSource = baseSource.slice(
    baseSource.indexOf("function ownedOnCurrentMap"),
    baseSource.indexOf("function clearSelectionMarker"),
);
assert.match(manageListSource, /row\.spawnGuid != 0 && row\.mapId == mapId/);
assert.doesNotMatch(manageListSource, /MANAGE_RANGE|MANAGE_LIST_SIZE|rows\.pop/);
const selectedOwnedSource = baseSource.slice(
    baseSource.indexOf("function selectedOwned"),
    baseSource.indexOf("function sendManageState"),
);
assert.match(selectedOwnedSource, /row\.mapId == mapId/);
assert.doesNotMatch(selectedOwnedSource, /MANAGE_RANGE|distanceFromPlayer2/);
const moveBoundarySource = baseSource.slice(
    baseSource.indexOf("function canMoveSelectedTo"),
    baseSource.indexOf("/* --------------------------- спелл: флаг базы"),
);
assert.match(moveBoundarySource, /requireNonCityPlacement\(player, x, y, z\)/);
assert.match(moveBoundarySource, /dist2\(x, y, flag\.x, flag\.y\) > radius \* radius/);
assert.doesNotMatch(moveBoundarySource, /player\.GetX|player\.GetY|player\.GetZ|MANAGE_RANGE/);
const flagPlacementSource = baseSource.slice(
    baseSource.indexOf("function canPlaceFlag"),
    baseSource.indexOf("function placeFlag"),
);
assert.match(flagPlacementSource, /requireNonCityPlacement\(player, dest\.x, dest\.y, dest\.z\)/);
const basePlacementSource = baseSource.slice(
    baseSource.indexOf("function canPlaceAtBase"),
    baseSource.indexOf("function canPlaceBuilding"),
);
assert.match(basePlacementSource, /requireNonCityPlacement\(player, dest\.x, dest\.y, dest\.z\)/);
assert.match(baseSource, /OnCheckCast\(FLAG_SPELL_ID[\s\S]*?canPlaceFlag\(player, spell\.GetTargetDest\(\)\)/);
assert.match(baseSource, /function placeCheckedBuilding[\s\S]*?canPlaceAtBase\(player, dest\)/);
assert.match(baseSource, /function placeCheckedPatchBuilding[\s\S]*?canPlaceAtBase\(player, dest\)/);
assert.match(addonSource, /const MANAGE_PAGE_SIZE = 5/);
assert.match(addonSource, /Math\.ceil\(manageSt\.items\.length \/ MANAGE_PAGE_SIZE\)/);
assert.match(addonSource, /managePage \* MANAGE_PAGE_SIZE \+ index/);
assert.deepStrictEqual(
    Array.from({ length: Math.ceil(12 / 5) }, (_, page) =>
        Array.from({ length: 12 }).slice(page * 5, page * 5 + 5).length),
    [5, 5, 2],
);
const densityCell = value => ({
    get() { return value; },
    set(next) { value = next; },
});
const densityLimits = new Map([[10, densityCell(1)], [20, densityCell(10)], [30, densityCell(1)]]);
const densityMembers = [
    { type: densityCell(1), spawnId: densityCell(100), poolSpawnId: densityCell(10) },
    ...Array.from({ length: 20 }, (_, index) => ({
        type: densityCell(2),
        spawnId: densityCell(index == 0 ? 10 : 1000 + index),
        poolSpawnId: densityCell(20),
    })),
    { type: densityCell(1), spawnId: densityCell(101), poolSpawnId: densityCell(30) },
];
const resourceDensity = loadTsModule(
    path.join(__dirname, "../datascripts/resource-density.ts"),
    {},
    request => {
        assert.strictEqual(request, "wow/wotlk");
        return { SQL: {
            pool_members: { queryAll: () => densityMembers },
            gameobject: { query: ({ guid }) => ({ id: densityCell(guid == 100 ? 1731 : 1617), map: densityCell(0) }) },
            pool_template: { query: ({ entry }) => densityLimits.has(entry) ? { max_limit: densityLimits.get(entry) } : undefined },
        } };
    },
);
resourceDensity.increaseVanillaResourceDensity();
assert.strictEqual(densityLimits.get(10).get(), 1, "inner variant pool must stay at one active node");
assert.strictEqual(densityLimits.get(20).get(), 15, "top resource pool must gain 50% active slots");
assert.strictEqual(densityLimits.get(30).get(), 1, "unparented one-slot pool must not overlap nodes");
const professionSource = fs.readFileSync(path.join(__dirname, "../../gem-abilities/livescripts/professions.ts"), "utf8");
const masterySource = fs.readFileSync(path.join(__dirname, "../../custom-stats/livescripts/mastery.ts"), "utf8");
const craftAllDatascriptSource = fs.readFileSync(path.join(__dirname, "../../craft-all/datascripts/datascripts.ts"), "utf8");
const gemDatascriptSource = fs.readFileSync(path.join(__dirname, "../../gem-abilities/datascripts/gems.ts"), "utf8");
for (const key of addedStations) {
    assert(baseSource.includes(`base-building-spell-${key}`));
    assert(baseSource.includes(`base-building-item-${key}`));
    assert(datascriptSource.includes(`{ key: ${key},`));
}
for (const key of [catalog.TRAINING_DUMMY_KEY, catalog.RESTORATION_ALTAR_KEY]) {
    assert(baseSource.includes(`base-building-spell-${key}`));
    assert(baseSource.includes(`base-building-item-${key}`));
    assert(datascriptSource.includes(`{ key: ${key},`));
}
for (const key of [...randomStations, catalog.ORDERS_BOARD_KEY]) {
    assert(baseSource.includes(`base-building-spell-${key}`));
    assert(baseSource.includes(`base-building-item-${key}`));
    assert(datascriptSource.includes(`{ key: ${key},`));
}
for (const key of expansionBuildingKeys) {
    assert(baseSource.includes(`base-building-spell-${key}`));
    assert(baseSource.includes(`base-building-item-${key}`));
    assert(datascriptSource.includes(`{ key: ${key},`));
    assert(addonSource.includes(`${key}: "Interface\\\\Icons\\\\`));
}
assert.match(addonSource, /\.\.\.SERVICE_EXPANSION_KEYS/);
assert.match(addonSource, /\.\.\.DEFENSE_EXPANSION_KEYS/);
const expansionTemplateTags = [
    "npc/base-healing-dummy",
    "go/base-cleansing-font",
    "go/base-repair-station",
    "go/base-capital-portal",
    "npc/base-herald",
    "go/base-tactical-table",
    "npc/base-shieldbearer",
    "npc/base-battle-mage",
    "npc/base-ballista",
    "go/base-frost-trap",
    "go/base-runic-bulwark",
    "go/base-watch-gong",
];
for (const tag of expansionTemplateTags) {
    assert(functionalBuildingDatascriptSource.includes(tag), `Datascript must create tagged expansion template ${tag}`);
    assert(baseSource.includes(tag), `Livescript must resolve expansion template ${tag}`);
}
assert.match(echoDatascriptSource, /Tags\.addUnique\(MODULE, "npc\/echo-vendor"\)/);
assert.match(baseSource, /UTAG\("echoes", "npc\/echo-vendor"\)/);
const echoVendorTagIndex = baseSource.indexOf('UTAG("echoes", "npc/echo-vendor")');
assert(echoVendorTagIndex > baseSource.indexOf('UTAG("base-building", "go/base-tactical-table")'));
assert(echoVendorTagIndex < baseSource.indexOf('UTAG("base-building", "npc/base-shieldbearer")'));
assert.match(functionalBuildingDatascriptSource, /creature\.Stats\.set\(healthMod, 1, armorMod, damageMod, 1\)/);
for (const source of [functionalBuildingDatascriptSource, echoDatascriptSource]) {
    for (const mode of ["Heroic5Man", "Heroic10Man", "Heroic25Man"]) {
        assert(source.includes(`creature.Difficulty.${mode}.set(0)`));
    }
}
assert.match(functionalBuildingDatascriptSource, /BASE_HEALING_DUMMY\.Stats\.set\(10, 1, 1, 0, 1\)/);
assert.match(functionalBuildingDatascriptSource, /BASE_BALLISTA\.Vehicle\.set\(0\)/);
const shieldbearerTemplateSource = functionalBuildingDatascriptSource.slice(
    functionalBuildingDatascriptSource.indexOf("export const BASE_SHIELDBEARER"),
    functionalBuildingDatascriptSource.indexOf("BASE_SHIELDBEARER.Weapons"),
);
assert.match(shieldbearerTemplateSource, /"npc\/base-shieldbearer",\s*2\.5,\s*2\.0,\s*0\.6,/);
for (const tag of [
    "spell/base-battle-mage-bolt",
    "spell/base-ballista-shot",
    "spell/base-frost-trap-slow",
    "spell/base-runic-bulwark",
]) {
    assert(functionalBuildingDatascriptSource.includes(tag), `Datascript must create tagged defense spell ${tag}`);
    assert(raidsSource.includes(tag), `Raid runtime must resolve defense spell ${tag}`);
}
for (const field of ["lastCleanse", "lastRepair", "lastPortal", "lastPracticeRaid"]) {
    assert.match(baseDbSource, new RegExp(`${field}: uint64`));
}
assert.match(livescriptsEntrySource, /import \{ RegisterBaseServices \} from "\.\/services"/);
assert.match(livescriptsEntrySource, /RegisterBaseServices\(events\)/);
for (const tag of [
    "go/base-cleansing-font",
    "go/base-repair-station",
    "go/base-capital-portal",
    "go/base-tactical-table",
]) {
    assert(servicesSource.includes(tag), `Service runtime must resolve tagged object ${tag}`);
}
assert.match(servicesSource, /function canUseOwnedService/);
assert.match(servicesSource, /ownedRowAtObject\(player, obj, key\)/);
assert.match(servicesSource, /Number\(row\.spawnGuid\) == guid/);
assert.match(servicesSource, /fallbackCount == 1 \? fallback : undefined/);
assert.match(servicesSource, /GetDistance\(obj\).*SERVICE_USE_RANGE/);
assert.match(servicesSource, /function requireOutOfCombat[\s\S]*IsInCombat\(\)/);
assert.match(servicesSource, /lastCleanse[\s\S]*CastSpell\(player, SPELL_PURIFY_DISEASE_POISON, true\)/);
assert.match(servicesSource, /CastSpell\(player, SPELL_REMOVE_CURSE, true\)[\s\S]*lastCleanse = nowUnix\(\)/);
assert.match(servicesSource, /lastRepair[\s\S]*DurabilityRepairAll\(false, 1, false\)[\s\S]*lastRepair = nowUnix\(\)/);
assert.match(servicesSource, /lastPortal[\s\S]*portalDestination\(player, Number\(selection\)\)/);
assert.match(servicesSource, /if \(!player\.Teleport\(destination\.map[\s\S]*return;[\s\S]*lastPortal = nowUnix\(\)/);
assert.match(servicesSource, /raidStatusText\(player\)/);
assert.match(servicesSource, /stopPracticeRaid\(player\)/);
assert.match(servicesSource, /lastPracticeRaid[\s\S]*startPracticeRaid\(player\)/);
assert.doesNotMatch(servicesSource, /lastPracticeRaid = nowUnix\(\)/);
assert.match(raidsSource, /if \(st\.practice\) \{[\s\S]*lastPracticeRaid = nowUnix\(\)/);
assert.match(datascriptSource, /npc_training_dummy/);
assert.match(baseSource, /restorationWaitSeconds\(Number\(flag\.lastRestore\), now\)/);
assert.doesNotMatch(baseSource, /GetPowerType\(\)/);
assert.match(baseSource, /SetPower\(-1, Number\(player\.GetMaxPower\(-1\)\)\)/);
assert.match(baseSource, /function refreshHealingDummies/);
assert.match(baseSource, /row\.catKey != HEALING_DUMMY_KEY/);
assert.match(baseSource, /SetHealth\(Math\.max\(1, Math\.floor\(Number\(dummy\.GetMaxHealth\(\)\) \* 0\.5\)\)\)/);
for (const role of [
    "BATTLE_MAGE_KEY",
    "BALLISTA_KEY",
    "FROST_TRAP_KEY",
    "RUNIC_OBELISK_KEY",
    "WATCH_GONG_KEY",
]) {
    assert(raidsSource.includes(role), `Raid runtime must handle defense role ${role}`);
}
assert.match(baseSource, /SHIELDBEARER_KEY/);
assert.match(raidsSource, /export function startPracticeRaid\(player: TSPlayer\): boolean/);
assert.match(raidsSource, /export function stopPracticeRaid\(player: TSPlayer\): boolean/);
assert.match(raidsSource, /export function raidStatusText\(player: TSPlayer\): string/);
assert.match(raidsSource, /const RAIDER_SAFETY_DURATION_MS = 10 \* 60 \* 1000/);
const spawnWaveSource = raidsSource.slice(
    raidsSource.indexOf("function spawnWave"),
    raidsSource.indexOf("function forEachAliveRaiderOnMap"),
);
assert.match(spawnWaveSource, /SpawnCreature\([\s\S]*RAIDER_SAFETY_DURATION_MS/);
assert.match(raidsSource, /mapId: number = 0/);
assert.match(raidsSource, /instanceId: number = 0/);
assert.match(raidsSource, /events\.Map\.OnPlayerLeave\(\(map, player\) => clearRaidOnMap\(map, player\)\)/);
assert.match(raidsSource, /events\.Player\.OnLogout\(player => clearRaidOnMap\(player\.GetMap\(\), player\)\)/);
assert.match(raidsSource, /if \(!isRaidOnMap\(player\.GetMap\(\), st\)\) \{\s*resetRaidState\(st\);\s*return;/);
const raidFightSource = raidsSource.slice(
    raidsSource.indexOf("// PHASE_FIGHT"),
    raidsSource.indexOf("const RAID_REENGAGE_RANGE"),
);
assert.ok(raidFightSource.indexOf("siegeFlag.hasFlag == 0")
    < raidFightSource.indexOf("engageSiege(player, siegeFlag"));
const missingBaseDespawn = raidFightSource.indexOf("despawnRemaining(player, st)");
const missingBaseReset = raidFightSource.indexOf("resetRaidState(st)", missingBaseDespawn);
const missingBaseReturn = raidFightSource.indexOf("return;", missingBaseReset);
assert(missingBaseDespawn >= 0
    && missingBaseDespawn < missingBaseReset
    && missingBaseReset < missingBaseReturn,
"removing a base during a raid must cancel the wave without loot or rewards");
const buffTimerStart = baseSource.indexOf("player.AddTimer(BUFF_CHECK_INTERVAL");
const buffTimerSource = baseSource.slice(buffTimerStart, baseSource.indexOf("        });", buffTimerStart) + 11);
assert(buffTimerStart >= 0);
assert.match(buffTimerSource, /owner\.ToPlayer\(\)/);
assert.doesNotMatch(buffTimerSource, /applyProximityBuffs\(player\)/);
const raidTimerStart = raidsSource.indexOf("player.AddTimer(PUMP_INTERVAL_MS");
const raidTimerSource = raidsSource.slice(raidTimerStart, raidsSource.indexOf("        });", raidTimerStart) + 11);
assert(raidTimerStart >= 0);
assert.match(raidTimerSource, /owner\.ToPlayer\(\)/);
assert.doesNotMatch(raidTimerSource, /pump\(player\)/);
assert.match(storageSource, /Number\(tpl\.GetFlags\(\)\) & 0x2/);
assert.match(storageSource, /function selectCraftRecipe/);
assert.match(storageSource, /selectHighestTierCraftRecipe\(executable/);
assert.match(baseDbSource, /buildingId: uint32/);
assert.match(baseDbSource, /nextBuildingId: uint32/);
assert.match(baseDbSource, /class BaseWorkerAssignment/);
assert.match(baseDbSource, /class BaseCraftedOutput/);
assert.match(baseDbSource, /function legacyBuildingBefore/);
assert.match(baseDbSource, /queuedXP: uint32/);
assert.match(baseDbSource, /function ensureCraftedOutputCounter/);
assert.match(workforceSource, /WORKFORCE_TARGET_STATION/);
assert.match(workforceSource, /WORKFORCE_TARGET_GENERATOR/);
assert.match(workforceSource, /if \(profession == 3\) return category == 4/);
assert.doesNotMatch(workforceSource, /profession == 3\) return station == WEAPON_FORGE_KEY/);
const settleTargetSource = workforceSource.slice(
    workforceSource.indexOf("function settleTarget("),
    workforceSource.indexOf("function bumpRevision("),
);
assert.ok(settleTargetSource.indexOf("!targetExists(player, targetKind, targetId)")
    < settleTargetSource.indexOf("settleStation(player"),
"a removed target must never run offline settlement");
const snapshotRefreshSource = workforceSource.slice(
    workforceSource.indexOf("function refreshSnapshots("),
    workforceSource.indexOf("function fillTargetSnapshot("),
);
assert.match(snapshotRefreshSource, /applySnapshot\(row, snapshot\)/);
assert.doesNotMatch(
    snapshotRefreshSource,
    /else\s*\{\s*bumpRevision\(player, row\)/,
    "effect/XP snapshots must not invalidate the workforce topology revision",
);
const assignWorkerSource = workforceSource.slice(
    workforceSource.indexOf("function assignWorker("),
    workforceSource.indexOf("function unassignWorker("),
);
assert.match(assignWorkerSource, /companionKey\(msg\.workerId, "eligible"\)/);
assert.doesNotMatch(assignWorkerSource, /alreadyAssigned|companionKey\(msg\.workerId, "available"\)/);
assert.ok(assignWorkerSource.indexOf("workerCompatible(profession")
    < assignWorkerSource.indexOf("rows.Add(new BaseWorkerAssignment"),
"a rejected incompatible assignment must not leave an empty persisted worker row");
assert.match(workforceSource, /setBaseBuildingRemovalHandler/);
assert.match(workforceSource, /function deactivateBuildingWorker/);
assert.match(workforceSource, /other\.buildingId\) == removedBuildingId/);
const removeBuildingSource = baseSource.slice(
    baseSource.indexOf("events.CustomPacket.OnReceive(OP_BASE_REMOVE"),
    baseSource.indexOf("events.CustomPacket.OnReceive(OP_BASE_CLEAR"),
);
assert.ok(removeBuildingSource.indexOf("prepareBuildingRemoval(player, row)")
    < removeBuildingSource.indexOf("row.Delete()"));
const clearBaseSource = baseSource.slice(
    baseSource.indexOf("function clearBase("),
    baseSource.indexOf("/* ------------------ производственные постройки"),
);
assert.ok(clearBaseSource.indexOf("container.Save()")
    < clearBaseSource.indexOf("flag.hasFlag = 0"),
"building deletions must be durable before the flag is cleared");
assert.match(baseSource, /const firstCopy = buildingCopyCount\(player, key\) == 0/);
assert.match(baseSource, /finishBuildingPlacement\(player, row, firstCopy\)/);
const buildingPlacementSource = baseSource.slice(
    baseSource.indexOf("function placeCheckedBuilding("),
    baseSource.indexOf("function placeCheckedPatchBuilding("),
);
assert.ok(buildingPlacementSource.indexOf("finishBuildingPlacement(player, row, firstCopy)")
    < buildingPlacementSource.indexOf("container.Save()"));
assert.match(storageSource, /setBaseBuildingPlacementHandler/);
assert.match(storageSource, /if \(firstCopy\) startFreshStationClock/);
const raidBuildingRemovalSource = raidsSource.slice(
    raidsSource.indexOf("function lootBase("),
    raidsSource.indexOf("export function startPracticeRaid("),
);
assert.ok(raidBuildingRemovalSource.indexOf("prepareBuildingRemoval(player, row)")
    < raidBuildingRemovalSource.indexOf("row.Delete()"));
assert.match(workforceSource, /custom-companions:workforce-ready/);
assert.match(workforceSource, /base-building:workforce-visual/);
assert.match(workforceSource, /base-building:worker-owner/);
assert.match(workforceSource, /UNIT_FLAG_NON_ATTACKABLE \| UNIT_FLAG_NOT_SELECTABLE/);
assert.match(workforceSource, /creature\.EmoteState\(WORKER_EMOTE_STATE\)/);
assert.match(workforceSource, /GetUInt\(WORKER_VISUAL_MARKER, 0\)/);
assert.match(workforceSource, /GetUInt\(WORKER_VISUAL_OWNER, 0\).*Number\(row\.playerGUID\)/s);
assert.match(workforceSource, /function validUInt/);
assert.match(workforceSource, /xp-ack-revision/);
const workforceLoginSource = workforceSource.slice(
    workforceSource.indexOf("events.Player.OnLogin"),
);
assert(
    workforceLoginSource.indexOf("forEach(row => publishAssignment(player, row))")
        < workforceLoginSource.indexOf("player.SetUInt(BASE_READY, 1)"),
);
assert.match(workforceSource, /queueWorkXP\(batch, granted\)/);
assert.match(workforceSource, /acknowledgeWorkXP\(batch, ack\)/);
assert.match(workforceXPSource, /batch\.queuedXP.*\+ granted/);
assert.match(workforceXPSource, /batch\.xpRevision = nextXPRevision/);
assert.match(workforceSource, /DAILY_WORK_XP_CAP = 100/);
assert.match(workforceSource, /events\.Map\.OnPlayerLeave/);
assert.match(workforceSource, /removeWorkerVisualFromMap\(map, row\)/);
assert.match(workforceSource, /events\.Player\.OnLogout[\s\S]*removeWorkerVisualFromMap\(player\.GetMap\(\), row\)/);
assert.match(workforceSource, /row\.visualMapId = target\.mapId/);
assert.doesNotMatch(workforceSource, /GUARD_KEY|raid|defen/i);
assert.match(storageSource, /const CRAFT_RECIPES_BY_CODE/);
assert.match(storageSource, /function craftRecipesForStation/);
assert.match(storageSource, /const input = Math\.floor\(recipe\[6\]\)/);
assert.match(storageSource, /const inputCount = Math\.floor\(recipe\[7\]\)/);
assert.match(storageSource, /station == WEAPON_FORGE_KEY.*WEAPON_CRAFT_PERIOD_BY_LEVEL/);
assert.match(storageSource, /cycles \* batch/);
assert.match(storageSource, /workerSavedInput\(worker\)/);
assert.match(storageSource, /workerBonusOutput\(worker\)/);
assert.match(storageSource, /runRoundRobinStationBudget/);
assert.match(storageSource, /const operationBudget = cycles \* batch/);
assert.match(storageSource, /Math\.floor\(last \/ period\) % recipes\.length/);
assert.doesNotMatch(storageSource, /const ops = cycles \* batch/);
assert.doesNotMatch(storageSource, /Math\.floor\(inRow\.itemCount \/ rec\.inCount\)/);
assert.match(storageSource, /allocateCraftedOutputId\(player\)/);
assert.match(storageSource, /CRAFT_PROPERTY_PENDING/);
assert.match(storageSource, /st\.pendingProperties\+\+/);
assert.match(storageSource, /st\.quarantinedOutputs\+\+/);
assert.match(storageSource, /custom-stats:property-request:nonce/);
assert.match(storageSource, /custom-stats:property-request:ack-nonce/);
const propertyPublishSource = storageSource.slice(
    storageSource.indexOf("function publishPropertyRequest"),
    storageSource.indexOf("export function reconcileCraftedPropertyRequest"),
);
assert(
    propertyPublishSource.lastIndexOf("custom-stats:property-request:nonce")
        > propertyPublishSource.lastIndexOf("custom-stats:property-request:source-owner"),
);
assert.match(storageSource, /claimedItemGuid = item\.GetGUIDLow\(\)/);
assert.match(storageSource, /PROPERTY_SOURCE_BASE_CRAFT = 2/);
assert.match(storageSource, /makerMarkValue\(output, worker\.rank\)/);
assert.match(storageSource, /legacy aggregate|BaseStorageItem/i);
assert.match(storageSource, /st\.acceptedInputs\.push/);
const stationUpgradeSource = storageSource.slice(
    storageSource.indexOf("function handleUpgrade"),
    storageSource.indexOf("function handleStationClick"),
);
assert.match(stationUpgradeSource, /stationUpgradeMaterialCost\(msg\.station, level\)/);
assert.match(stationUpgradeSource, /if \(!consumeMaterialCost\(player, cost\)\) return/);
assert.doesNotMatch(stationUpgradeSource, /GetMoney\(\)|ModifyMoney\(/);
const storageWithdrawSource = storageSource.slice(
    storageSource.indexOf("function handleWithdraw"),
    storageSource.indexOf("function handleUpgrade"),
);
const storageDepositSource = storageSource.slice(
    storageSource.indexOf("function handleDeposit"),
    storageSource.indexOf("function handleWithdraw"),
);
assert.match(baseSource, /function removeCarriedItems[\s\S]*GetItemByPos\(INVENTORY_SLOT_BAG_0, slot\)/);
assert.match(baseSource, /GetItemByPos\(bag, slot\)/);
assert.match(baseSource, /item\.IsInTrade\(\)/);
assert.match(storageDepositSource, /const removed = removeCarriedItems\(player, entry, count\)/);
assert.doesNotMatch(storageDepositSource, /RemoveItemByEntry/);
assert.match(storageDepositSource, /row\.itemCount = row\.itemCount \+ removed/);
assert.doesNotMatch(storageDepositSource, /row\.itemCount = row\.itemCount \+ count/);
assert.match(storageWithdrawSource, /const before = Number\(player\.GetItemCount\(entry, false\)\)/);
assert.match(storageWithdrawSource, /Math\.max\(0, Number\(player\.GetItemCount\(entry, false\)\) - before\)/);
assert.match(storageWithdrawSource, /row\.itemCount = row\.itemCount - added/);
assert.doesNotMatch(storageWithdrawSource, /row\.itemCount = row\.itemCount - count/);
assert.match(addonSource, /materialWatcher\.RegisterEvent\("BAG_UPDATE"\)/);
assert.match(addonSource, /if \(frame && frame\.IsShown\(\)\) refresh\(\)/);
assert.match(addonSource, /setBuildingWoodItems\(st\.woodItems\)/);
assert.match(addonSource, /import \* as WorkforceUI from "\.\/workforce-ui"/);
assert.match(addonSource, /WorkforceUI\.initWorkforceUI\(refreshStorage\)/);
assert.match(addonSource, /storageSt\.pendingProperties > 0/);
assert.match(addonSource, /storageSt\.quarantinedOutputs > 0/);
assert.match(workforceAddonSource, /OnCustomPacket\(OP_WORKFORCE_STATE/);
assert.match(workforceAddonSource, /WORKFORCE_ACTION_UNASSIGN/);
assert.match(workforceAddonSource, /next\.requestToken != pendingRequestToken/);
assert.match(workforceAddonSource, /next\.revision < state\.revision/);
assert.match(workforceAddonSource, /requestToken >= 999999999 \? 1/);
assert.match(workforceSource, /requestToken >= COMPANION_WORKFORCE_TOKEN_MIN/);
assert.match(workforceSource, /\? OP_COMPANION_WORKFORCE_STATE/);
assert.match(workforceSource, /state\.write\(responseOpcode\)\.SendToPlayer\(player\)/);
assert.match(workforceSource, /new ErrorMsg\(message\)\.write\(OP_COMPANION_WORKFORCE_ERROR\)/);
assert.match(workforceSource, /if \(msg\.requestToken >= COMPANION_WORKFORCE_TOKEN_MIN\)[\s\S]*else \{[\s\S]*sendError\(player, message\)/);
assert.match(workforceSource, /sendWorkforceError\(player, msg,/);
assert.doesNotMatch(catalogSource, /UTAG\(/);
assert.match(baseSource, /setBuildingWoodItems\(\[[\s\S]*item\/wood-tier-6/);
assert.match(baseSource, /st\.woodItems = BUILDING_WOOD_ITEMS/);
assert.doesNotMatch(addonSource, /fmtGold/);
assert.doesNotMatch(storageSource, /GetIsConjuredConsumable\(\)/);
assert.doesNotMatch(storageSource, /GetStackable\(\)/);
assert.match(patchDatascriptSource, /const DECORATIVE_GO_TYPE = 6/);
assert.match(patchDatascriptSource, /type: DECORATIVE_GO_TYPE/);
assert.match(patchDatascriptSource, /row\[`Data\$\{i\}`\] = 0/);
assert.match(datascriptSource, /go\.Type\.TRAP\.set\(\)/);
assert.match(baseSource, /const GO_FLAGS_DECORATIVE = 0x04 \| 0x10/);
assert.match(baseSource, /function consumeMaterialCost[\s\S]*removeCarriedItems\(player, entry, take\)/);
assert.doesNotMatch(baseSource, /GetLiquidStatus\(\)/);
assert.match(baseSource, /remaining -= removed/);
assert.match(baseSource, /refundMaterialPayment\(player, payment\)/);
const normalPlacementSource = baseSource.slice(
    baseSource.indexOf("function canPlaceBuilding"),
    baseSource.indexOf("function placeCheckedPatchBuilding"),
);
assert.match(normalPlacementSource, /requireMaterialCost\(player, buildingMaterialCost\(key\)\)/);
assert.match(normalPlacementSource, /consumeMaterialCost\(player, cost\)[\s\S]*spawnBuildingVisible/);
assert.match(normalPlacementSource, /refundMaterialPayment\(player, payment\)/);
assert.doesNotMatch(normalPlacementSource, /GetMoney\(\)|ModifyMoney\(/);
const patchPlacementSource = baseSource.slice(
    baseSource.indexOf("function canPlacePatchBuilding"),
    baseSource.indexOf("function clearBase"),
);
assert.match(patchPlacementSource, /requireMaterialCost\(player, DECORATION_MATERIAL_COST\)/);
assert.match(patchPlacementSource, /consumeMaterialCost\(player, DECORATION_MATERIAL_COST\)[\s\S]*spawnDecorativeVisible/);
assert.match(patchPlacementSource, /refundMaterialPayment\(player, payment\)/);
assert.doesNotMatch(patchPlacementSource, /GetMoney\(\)|ModifyMoney\(/);
assert.match(datascriptSource, /Tags\.addUnique\(MODNAME, `go\/base-decoration-\$\{key\}`\)/);
for (let key = 0; key <= 11; key++) {
    assert(datascriptSource.includes(`[${key},`));
    assert(baseSource.includes(`go/base-decoration-${key}`));
}
assert(datascriptSource.includes('[13,'));
assert(baseSource.includes("go/base-decoration-13"));
assert.match(generatorRuntimeSource, /GetUInt\("custom-stats:mastery-bps", 0\)/);
assert.match(generatorRuntimeSource, /masteryExtraCopy\(masteryBps, Math\.random\(\)\)/);
assert.match(generatorRuntimeSource, /effectiveWorkerPeriod\(def\.doubleReadyS, worker\)/);
assert.match(generatorRuntimeSource, /workerForGenerator\(player, row\.buildingId\)/);
assert.match(generatorRuntimeSource, /awardWorkerServiceXP\(player, workerForGenerator/);
assert.match(generatorRuntimeSource, /player\.CastSpell\(object, GATHER_SPELL, false\)/);
assert.match(generatorRuntimeSource, /OnGenerateFishLoot/);
assert.match(generatorRuntimeSource, /readyFishingGeneratorNear/);
assert.match(generatorRuntimeSource, /salvageOutput\(def\.requiredSkill\)/);
assert.match(generatorRuntimeSource, /loot\.SetGeneratesNormally\(false\)/);
assert.match(generatorRuntimeSource, /const rolledBack = added > 0 \? removeCarriedItems\(player, roll\.item, added\) : 0/);
assert.match(generatorRuntimeSource, /if \(rolledBack != added\)[\s\S]*consumeGeneratorReadiness/);
assert.match(generatorRuntimeSource, /row\.lastHarvest = now/);
assert.match(generatorRuntimeSource, /readyEffectGuid/);
assert.match(generatorDatascriptSource, /hole\.Type\.TRAP\.set\(\)/);
assert.doesNotMatch(generatorDatascriptSource, /GameObjectTemplates\.FishingHoles/);
assert.match(generatorDatascriptSource, /ImplicitTargetA\.GAMEOBJECT_TARGET\.set\(\)/);
assert.match(generatorDatascriptSource, /spell\.Range\.setSimple\(0, GENERATOR_USE_RANGE\)/);
assert.match(generatorDatascriptSource, /READY_GLOW_DISPLAY = 230/);
assert.doesNotMatch(baseSource, /function handleHarvest/);
assert.match(ordersRuntimeSource, /acceptedCycleToken == state\.cycleToken/);
assert.match(ordersRuntimeSource, /state\.activeGemItem = gem/);
assert.match(ordersRuntimeSource, /state\.turnInConsumed \+= result\[0\]/);
assert.match(ordersRuntimeSource, /removeCarriedItems\(player, entry, requested\)/);
assert.match(ordersRuntimeSource, /state\.gemDelivered == 0/);
assert.match(ordersRuntimeSource, /function abandonOrder/);
assert.match(ordersRuntimeSource, /targetFaction\.IsFriendlyTo\(playerFaction\)/);
assert.match(ordersRuntimeSource, /events\.Player\.OnCreatureKill/);
assert.match(ordersRuntimeSource, /events\.Player\.OnSpellCast/);
assert.match(ordersRuntimeSource, /Number\(player\.GetItemCount\(state\.activeTarget, false\)\) - watch\.beforeCount/);
assert.match(ordersDatascriptSource, /creature\.Rank\.get\(\) == 3/);
assert.match(ordersDatascriptSource, /CREATURE_TYPE_FLAG_QUEST_BOSS/);
assert.match(ordersDatascriptSource, /npc\/orders-tier-/);
assert.match(ordersAddonSource, /OnCustomPacket\(OP_ORDER_STATE/);
assert.match(ordersAddonSource, /new OrderAcceptMsg\(state\.cycleToken, slot\)/);
assert.match(ordersAddonSource, /new OrderTurnInMsg\(state\.activeToken\)/);
assert.match(ordersAddonSource, /new OrderAbandonMsg\(state\.activeToken\)/);
assert.match(ordersAddonSource, /state\.activeDeposited \+ GetItemCount/);
assert.match(livescriptsEntrySource, /!CRAFT_STATION_CATALOG_READY \|\| CRAFT_STATION_RECIPES\.length == 0/);
assert.match(livescriptsEntrySource, /!ORDER_REWARD_GEM_CATALOG_READY \|\| ORDER_REWARD_GEMS\.length == 0/);
assert.match(livescriptsEntrySource, /CRAFT_STATION_CATALOG_VERSION != 2/);
assert.match(livescriptsEntrySource, /ORDER_REWARD_GEM_CATALOG_VERSION != 1/);
assert.match(craftAllDatascriptSource, /export const CRAFT_STATION_CATALOG_VERSION: number = 2/);
assert.match(craftAllDatascriptSource, /export const CRAFT_STATION_CATALOG_READY = true/);
assert.match(craftAllDatascriptSource, /Base station recipe catalog has no rows for station/);
assert.match(craftAllDatascriptSource, /info\.itemClass == 7 \|\| info\.itemClass == 3/);
assert.match(craftAllDatascriptSource, /station == STATION_ALCHEMY && info\.itemClass == 0/);
assert.match(craftAllDatascriptSource, /isSecondaryReagent\(info\)/);
assert.match(craftAllDatascriptSource, /professionFor\(outClass, outSub, outInv\) == profId/);
assert.match(craftAllDatascriptSource, /materialSamplesByStation\[profId\]\[stationFor\(cls, sub, inv\)\]/);
assert.match(craftAllDatascriptSource, /spell\.Reagents\.clearAll\(\)/);
assert.match(craftAllDatascriptSource, /spell\.Reagents\.add\(material\.dominantItem, scaled\)/);
assert.doesNotMatch(craftAllDatascriptSource, /s\.reagents|s\.counts/);
assert.match(gemDatascriptSource, /export const ORDER_REWARD_GEM_CATALOG_VERSION: number = 1/);
assert.match(gemDatascriptSource, /export const ORDER_REWARD_GEM_CATALOG_READY = true/);
const dailySupplySource = baseSource.slice(baseSource.indexOf("function grantDailySupply"));
assert.doesNotMatch(dailySupplySource, /masteryExtraCopy/);
assert.match(dailySupplySource, /GetFreeInventorySpace\(\)/);
assert(
    dailySupplySource.indexOf("GetFreeInventorySpace()") < dailySupplySource.indexOf("flag.lastSupply = now"),
    "Daily supply must validate bag capacity before starting its cooldown",
);
assert.match(baseSource, /AddItem\(BUILDING_WOOD_ITEMS\[0\], SUPPLY_RESOURCE_COUNT\)/);
assert.match(woodcuttingSource, /std\.Professions\.create\(MODNAME, "woodcutting"\)/);
assert.strictEqual((woodcuttingSource.match(/WOODCUTTING\.Ranks\.addGet/g) || []).length, 6);
assert.strictEqual((woodcuttingSource.match(/"item\/wood-tier-[1-6]"/g) || []).length, 6);
assert.strictEqual((woodcuttingSource.match(/WOODCUTTING\.GatheringNodes\.addGet/g) || []).length, 1);
assert.match(woodcuttingSource, /HERB_SAMPLE_STRIDE = 4/);
assert.match(woodcuttingSource, /node\.Spawns\.add\(/);
const treeDisplays = Array.from(
    woodcuttingSource.matchAll(/treeDisplay: (\d+), treeSize:/g),
    match => Number(match[1]),
);
assert.deepStrictEqual(treeDisplays, [7459, 967, 702, 7321, 7288, 7801]);
assert.strictEqual(new Set(treeDisplays).size, 6);
assert.match(woodcuttingSource, /node\.Display\.set\(tier\.treeDisplay\)/);
assert.doesNotMatch(woodcuttingSource, /GameObjectTemplates\.Traps\.load\(tier\.treeTemplate\)/);
const woodcuttingGrantSource = baseSource.slice(
    baseSource.indexOf("function grantWoodcutting"),
    baseSource.indexOf("/* -------------------------"),
);
assert.match(woodcuttingGrantSource, /HasSpell\(WOODCUTTING_APPRENTICE_SPELL\).*LearnSpell\(WOODCUTTING_APPRENTICE_SPELL\)/);
assert.match(woodcuttingGrantSource, /HasSpell\(WOODCUTTING_GATHER_SPELL\).*LearnSpell\(WOODCUTTING_GATHER_SPELL\)/);
assert.match(baseSource, /OnLogin\(\(player, firstLogin\) => \{\s*grantWoodcutting\(player\)/);
assert.match(datascriptSource, /increaseVanillaResourceDensity\(\)/);
assert.match(resourceDensitySource, /while \(parentByChild\[poolId\] !== undefined\)/);
assert.match(resourceDensitySource, /pool\.max_limit\.set\(increasedPoolLimit\(/);
assert.doesNotMatch(woodcuttingSource, /SpawnTimeSecs\.set\(/);
assert.match(professionSource, /GetID\("SkillLine", "base-building", "woodcutting"\)/);
assert.match(professionSource, /spell\/woodcutting-gather/);
assert.match(masterySource, /\[4, 7, 9, 10, 11\]/);
for (const table of ["item_template_locale", "creature_template_locale", "gameobject_template_locale"]) {
    assert(baseSource.includes(table), `Missing stock-name locale lookup for ${table}`);
}
assert.match(baseSource, /GetDbLocaleIndex\(\)\) != 8/);
assert.match(storageSource, /localizedTemplateNames\.item\(player, entry\)/);
assert.match(generatorRuntimeSource, /localizedTemplateNames\.item\(player, roll\.item\)/);
assert.match(ordersRuntimeSource, /localizedTemplateNames\.creature\(player, state\.killTarget\)/);
assert.match(galleryRuntimeSource, /localizedTemplateNames\.gameObject\(player, row\.entry, row\.name\)/);

assert.strictEqual(gallery.sanitizeGalleryFilter("house%' OR 1=1"), "house OR 11");
assert.strictEqual(gallery.sanitizeGalleryFilter("x".repeat(50)).length, 40);
assert.deepStrictEqual(gallery.gallerySlot(0), [0, 0]);
assert.deepStrictEqual(gallery.gallerySlot(15), [3, 3]);

console.log("base/storage protocols, building material costs, station recipes, and helpers: ok");
