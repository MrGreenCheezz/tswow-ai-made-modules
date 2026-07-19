/**
 * Base-building — персистентность (per-character).
 *
 * Эти строки — источник истины о владельце, координатах и текущем runtime GUID.
 * После рестарта runtime GUID устаревает, а livescript восстанавливает объект из
 * сохранённых координат и записывает новый GUID.
 */

@CharactersTable
export class BaseFlag extends DBEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    hasFlag: uint32 = 0;
    @DBField
    mapId: uint32 = 0;
    @DBField
    x: float = 0;
    @DBField
    y: float = 0;
    @DBField
    z: float = 0;
    @DBField
    o: float = 0;
    @DBField
    phaseMask: uint32 = 0;
    @DBField
    spawnGuid: uint32 = 0; // runtime lowguid текущего флага
    @DBField
    lastSupply: uint64 = 0; // unix-время последнего сбора припасов. НЕ МЕНЯТЬ ТИП:
    @DBField                // колонка создана BIGINT, миграция типы не правит,
    baseLevel: uint32 = 0;  // несовпадение = ассерт Field::GetUInt32 при чтении
    @DBField
    lastRaid: uint64 = 0;   // unix-время последнего набега на базу
    @DBField
    lastSmelt: uint64 = 0;  // unix-время последнего цикла плавильни (uint64 — тип не менять)
    @DBField
    lastBrew: uint64 = 0;   // unix-время последнего цикла алхимического стола
    @DBField
    lastCook: uint64 = 0;   // unix-время последнего цикла кухонного стола
    @DBField
    lastLeather: uint64 = 0;
    @DBField
    lastWeave: uint64 = 0;
    @DBField
    lastInk: uint64 = 0;
    @DBField
    lastStone: uint64 = 0;
    @DBField
    lastEngineer: uint64 = 0;
    @DBField
    lastButcher: uint64 = 0;
    @DBField
    lastLeatherArmor: uint64 = 0;
    @DBField
    lastPlateArmor: uint64 = 0;
    @DBField
    lastClothArmor: uint64 = 0;
    @DBField
    lastWeaponForge: uint64 = 0;
    @DBField
    lastJewelry: uint64 = 0;
    @DBField
    lastRestore: uint64 = 0; // unix-время последнего использования алтаря восстановления
    @DBField
    lastCleanse: uint64 = 0; // купель очищения
    @DBField
    lastRepair: uint64 = 0; // бесплатная ремонтная стойка
    @DBField
    lastPortal: uint64 = 0; // успешный переход через навигационный портал
    @DBField
    lastPracticeRaid: uint64 = 0; // запуск учебного набега с тактического стола
    @DBField
    smelterLevel: uint32 = 0; // уровни станций 0..2; общие для всех станков типа
    @DBField
    labLevel: uint32 = 0;
    @DBField
    cookLevel: uint32 = 0;
    @DBField
    leatherLevel: uint32 = 0;
    @DBField
    weaveLevel: uint32 = 0;
    @DBField
    inkLevel: uint32 = 0;
    @DBField
    stoneLevel: uint32 = 0;
    @DBField
    engineerLevel: uint32 = 0;
    @DBField
    butcherLevel: uint32 = 0;
    @DBField
    leatherArmorLevel: uint32 = 0;
    @DBField
    plateArmorLevel: uint32 = 0;
    @DBField
    clothArmorLevel: uint32 = 0;
    @DBField
    weaponForgeLevel: uint32 = 0;
    @DBField
    jewelryLevel: uint32 = 0;
    @DBField
    pendingPatchEntry: uint32 = 0; // выбранная одноразовая установка из полного patch-каталога
    @DBField
    pendingGeneratorKey: uint32 = 0; // выбранный точный ресурс универсального чертежа генератора
    @DBField
    nextBuildingId: uint32 = 1; // стабильный локальный id следующей постройки
    @DBField
    nextCraftedOutputId: uint32 = 1; // стабильный id следующего поштучного результата
    @DBField
    workforceRevision: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): BaseFlag {
        return player.GetObject("BaseFlag", LoadDBEntry(new BaseFlag(player.GetGUIDLow())));
    }
}

/**
 * Пул предметов станции хранения (кухня/склад/плавильня/алхимический стол).
 * Один ряд = один вид предмета в пуле игрока для конкретной станции.
 * Пул общий на игрока и тип станции: все склады игрока открывают один пул.
 */
@CharactersTable
export class BaseStorageItem extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    station: uint32 = 0;    // catKey станции из каталога (12/82..90)
    @DBField
    itemEntry: uint32 = 0;
    @DBField
    itemCount: uint32 = 0;  // не `count`: не рискуем зарезервированными словами MySQL
    @DBField
    bucket: uint32 = 0;     // 0 = сырьё/обычный склад, 1 = готовый результат

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<BaseStorageItem> {
        return player.GetObject("BaseStorage", LoadDBArrayEntry(BaseStorageItem, player.GetGUIDLow()));
    }
}

@CharactersTable
export class BaseBuilding extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    catKey: uint32 = 0;   // key обычной постройки либо exact patch entry (цена/возврат). НЕ `key` — reserved MySQL
    @DBField
    buildingId: uint32 = 0; // стабильный per-player id; spawnGuid меняется после рестарта
    @DBField
    entry: uint32 = 0;    // gameobject_template.entry
    @DBField
    mapId: uint32 = 0;
    @DBField
    x: float = 0;
    @DBField
    y: float = 0;
    @DBField
    z: float = 0;
    @DBField
    o: float = 0;
    @DBField
    phaseMask: uint32 = 0;
    @DBField
    spawnGuid: uint32 = 0;
    @DBField
    lastHarvest: uint64 = 0; // unix-время последнего сбора (произв. постройки). Тип не менять (BIGINT в БД)
    @DBField
    readyEffectGuid: uint32 = 0; // runtime lowguid декоративного свечения готового генератора

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<BaseBuilding> {
        return player.GetObject("BaseBuildings", LoadDBArrayEntry(BaseBuilding, player.GetGUIDLow()));
    }
}

/**
 * Одна строка на спутника, включая временно неназначенных: так pending XP и
 * суточный лимит не сбрасываются снятием/повторным назначением.
 */
@CharactersTable
export class BaseWorkerAssignment extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    workerId: uint32 = 0;
    @DBField
    targetKind: uint32 = 0; // 0 reserve, 1 shared station, 2 exact generator
    @DBField
    targetId: uint32 = 0; // station key or BaseBuilding.buildingId
    @DBField
    station: uint32 = 0;
    @DBField
    generatorCategory: uint32 = 0;
    @DBField
    revision: uint32 = 0;
    @DBField
    workerRevision: uint32 = 0;
    @DBField
    workerEntry: uint32 = 0;
    @DBField
    profession: uint32 = 0;
    @DBField
    trait: uint32 = 0;
    @DBField
    rank: uint32 = 0;
    @DBField
    periodBps: uint32 = 0;
    @DBField
    saveBps: uint32 = 0;
    @DBField
    bonusBps: uint32 = 0;
    @DBField
    bias: uint32 = 0;
    @DBField
    markBps: uint32 = 0;
    @DBField
    markProperty: uint32 = 0;
    @DBField
    pendingXP: uint32 = 0;
    @DBField
    queuedXP: uint32 = 0; // earned while pendingXP awaits its exact persisted ack
    @DBField
    xpRevision: uint32 = 0;
    @DBField
    xpWindowStart: uint64 = 0;
    @DBField
    xpWindowEarned: uint32 = 0;
    @DBField
    visualGuid: uint32 = 0;
    @DBField
    visualMapId: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<BaseWorkerAssignment> {
        return player.GetObject(
            "BaseWorkerAssignments",
            LoadDBArrayEntry(BaseWorkerAssignment, player.GetGUIDLow()),
        );
    }
}

/** New equipment outputs are stored per unit so maker properties cannot drift. */
@CharactersTable
export class BaseCraftedOutput extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    outputId: uint32 = 0;
    @DBField
    station: uint32 = 0;
    @DBField
    itemEntry: uint32 = 0;
    @DBField
    makerWorkerId: uint32 = 0;
    @DBField
    makerEntry: uint32 = 0;
    @DBField
    makerProfession: uint32 = 0;
    @DBField
    makerTrait: uint32 = 0;
    @DBField
    makerRank: uint32 = 0;
    @DBField
    propertyId: uint32 = 0;
    @DBField
    value1: uint32 = 0;
    @DBField
    value2: uint32 = 0;
    @DBField
    sourceNonce: uint32 = 0;
    @DBField
    createdAt: uint64 = 0;
    @DBField
    claimState: uint32 = 0; // 0 ready, 1 claiming, 2 property pending, 3 quarantined
    @DBField
    claimedItemGuid: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<BaseCraftedOutput> {
        return player.GetObject(
            "BaseCraftedOutputs",
            LoadDBArrayEntry(BaseCraftedOutput, player.GetGUIDLow()),
        );
    }
}

export function ensureStableBuildingIds(player: TSPlayer): void {
    const flag = BaseFlag.get(player);
    const rows = BaseBuilding.get(player);
    let next = Math.max(1, Number(flag.nextBuildingId));
    const missing: BaseBuilding[] = [];
    rows.forEach(row => {
        if (row.buildingId >= next) next = row.buildingId + 1;
        if (row.buildingId == 0) missing.push(row);
    });
    let changed = false;
    while (missing.length > 0) {
        let best = 0;
        for (let i = 1; i < missing.length; i++) {
            if (legacyBuildingBefore(missing[i], missing[best])) best = i;
        }
        const row = missing[best];
        missing.splice(best, 1);
        row.buildingId = next++;
        row.MarkDirty();
        changed = true;
    }
    if (changed) rows.Save();
    if (flag.nextBuildingId != next) {
        flag.nextBuildingId = next;
        flag.Save();
    }
}

function legacyBuildingBefore(a: BaseBuilding, b: BaseBuilding): boolean {
    if (a.mapId != b.mapId) return a.mapId < b.mapId;
    if (a.catKey != b.catKey) return a.catKey < b.catKey;
    if (a.entry != b.entry) return a.entry < b.entry;
    if (a.x != b.x) return a.x < b.x;
    if (a.y != b.y) return a.y < b.y;
    if (a.z != b.z) return a.z < b.z;
    if (a.o != b.o) return a.o < b.o;
    return a.spawnGuid < b.spawnGuid;
}

export function allocateBuildingId(player: TSPlayer): number {
    ensureStableBuildingIds(player);
    const flag = BaseFlag.get(player);
    const result = Math.max(1, Number(flag.nextBuildingId));
    flag.nextBuildingId = result + 1;
    flag.Save();
    return result;
}

export function allocateCraftedOutputId(player: TSPlayer): number {
    ensureCraftedOutputCounter(player);
    const flag = BaseFlag.get(player);
    const result = Math.max(1, Number(flag.nextCraftedOutputId));
    flag.nextCraftedOutputId = result + 1;
    flag.Save();
    return result;
}

export function ensureCraftedOutputCounter(player: TSPlayer): void {
    if (Number(player.GetUInt("base-building:crafted-counter-ready", 0)) == 1) return;
    const flag = BaseFlag.get(player);
    let next = Math.max(1, Number(flag.nextCraftedOutputId));
    BaseCraftedOutput.get(player).forEach(row => {
        if (row.outputId >= next) next = row.outputId + 1;
    });
    if (flag.nextCraftedOutputId != next) {
        flag.nextCraftedOutputId = next;
        flag.Save();
    }
    player.SetUInt("base-building:crafted-counter-ready", 1);
}
