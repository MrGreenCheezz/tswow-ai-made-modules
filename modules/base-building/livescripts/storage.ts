/**
 * Base-building — хранилище и переработка ресурсов.
 *
 * Каждая станция (кухня 12 / склад 82 / производственные станки 83..97) даёт игроку
 * общий набор пулов на тип станции (все одинаковые станки игрока открывают
 * одни и те же секции сырья/результата). Пулы хранит BaseStorageItem.bucket.
 *
 * Переработка — оффлайн catch-up по отдельному таймстампу станции на BaseFlag.
 * Старые станки используют точные рецепты, а профмастерские выбирают случайный
 * выполнимый рецепт самого высокого тира и расходуют только доминирующий материал.
 * Алхимический стол работает по тем же случайным правилам, но сохраняет быстрые
 * циклы и размер партии старого процессора.
 *
 * Как и с lastHarvest у жилы/сада, при любом обращении к станции
 * считаем прошедшие циклы; период и размер партии зависят от уровня станка.
 * Пустые циклы сгорают — «банка» циклов
 * под свежезаложенное сырьё не копится.
 *
 * Класть/забирать можно только в STATION_USE_RANGE от СВОЕЙ станции этого типа.
 */

import {
    STORAGE_KEY, SMELTER_KEY, LAB_KEY, COOKING_KEY,
    LEATHERWORKING_KEY, LOOM_KEY, INSCRIPTION_KEY,
    STONECUTTING_KEY, ENGINEERING_KEY, BUTCHER_KEY, STATION_KEYS,
    LEATHER_ARMOR_KEY, PLATE_ARMOR_KEY, CLOTH_ARMOR_KEY,
    WEAPON_FORGE_KEY, JEWELRY_KEY,
    STORAGE_MAX_SLOTS, STORAGE_MAX_PER_SLOT,
    STATION_MAX_LEVEL, PROCESS_PERIOD_BY_LEVEL, PROCESS_BATCH_BY_LEVEL,
    CRAFT_PERIOD_BY_LEVEL, WEAPON_CRAFT_PERIOD_BY_LEVEL,
    PROCESS_OFFLINE_CAP_S, STATION_USE_RANGE, stationUpgradeMaterialCost,
    GO_STORAGE_ENTRY, GO_SMELTER_ENTRY, GO_LAB_ENTRY, GO_COOKING_ENTRY,
    GO_LEATHERWORKING_ENTRY, GO_LOOM_ENTRY, GO_INSCRIPTION_ENTRY,
    GO_STONECUTTING_ENTRY, GO_ENGINEERING_ENTRY, GO_BUTCHER_ENTRY,
    GO_LEATHER_ARMOR_ENTRY, GO_PLATE_ARMOR_ENTRY, GO_CLOTH_ARMOR_ENTRY,
    GO_WEAPON_FORGE_ENTRY, GO_JEWELRY_ENTRY,
    recipesFor, recipeByInput, buildingByKey, buildingName, warehouseRejectReason,
} from "../shared/BaseCatalog";
import {
    CRAFT_STATION_LEATHER_ARMOR, CRAFT_STATION_METAL_ARMOR,
    CRAFT_STATION_CLOTH_ARMOR, CRAFT_STATION_JEWELRY,
    CRAFT_STATION_WEAPON, CRAFT_STATION_ALCHEMY,
    CRAFT_STATION_RECIPES,
} from "../shared/generated/CraftStationRecipes";
import { selectHighestTierCraftRecipe } from "../shared/CraftStationLogic";
import { runRoundRobinStationBudget } from "../shared/StationBudgetLogic";
import {
    OP_STORE_REQUEST, OP_STORE_DEPOSIT, OP_STORE_WITHDRAW, OP_STORE_UPGRADE,
    STORAGE_BUCKET_INPUT, STORAGE_BUCKET_OUTPUT,
    StorageState, StorageEntry, StorageRequest, StorageMoveMsg, StorageUpgradeMsg,
} from "../shared/BaseMessages";
import {
    BaseFlag, BaseBuilding, BaseStorageItem, BaseCraftedOutput,
    BaseWorkerAssignment, allocateCraftedOutputId,
} from "./base-db";
import {
    baseClient, baseText, isRussianClient, localizedTemplateNames, sendError, nowUnix, normTime, dist2,
    consumeMaterialCost, removeCarriedItems, setBaseBuildingPlacementHandler,
} from "./base";
import {
    awardWorkerServiceXP, effectiveWorkerPeriod, workerBonusOutput,
    workerForStation, workerSavedInput,
} from "./workforce";

function stationByEntry(entry: number): number {
    if (entry == GO_STORAGE_ENTRY) return STORAGE_KEY;
    if (entry == GO_SMELTER_ENTRY) return SMELTER_KEY;
    if (entry == GO_LAB_ENTRY) return LAB_KEY;
    if (entry == GO_COOKING_ENTRY) return COOKING_KEY;
    if (entry == GO_LEATHERWORKING_ENTRY) return LEATHERWORKING_KEY;
    if (entry == GO_LOOM_ENTRY) return LOOM_KEY;
    if (entry == GO_INSCRIPTION_ENTRY) return INSCRIPTION_KEY;
    if (entry == GO_STONECUTTING_ENTRY) return STONECUTTING_KEY;
    if (entry == GO_ENGINEERING_ENTRY) return ENGINEERING_KEY;
    if (entry == GO_BUTCHER_ENTRY) return BUTCHER_KEY;
    if (entry == GO_LEATHER_ARMOR_ENTRY) return LEATHER_ARMOR_KEY;
    if (entry == GO_PLATE_ARMOR_ENTRY) return PLATE_ARMOR_KEY;
    if (entry == GO_CLOTH_ARMOR_ENTRY) return CLOTH_ARMOR_KEY;
    if (entry == GO_WEAPON_FORGE_ENTRY) return WEAPON_FORGE_KEY;
    if (entry == GO_JEWELRY_ENTRY) return JEWELRY_KEY;
    return 0;
}

function isStation(station: number): boolean {
    for (let i = 0; i < STATION_KEYS.length; i++) {
        if (STATION_KEYS[i] == station) return true;
    }
    return false;
}

/** Игрок стоит рядом со СВОЕЙ станцией этого типа. */
function nearOwnStation(player: TSPlayer, station: number): boolean {
    const mapId = player.GetMapID();
    const px = player.GetX();
    const py = player.GetY();
    const r2 = STATION_USE_RANGE * STATION_USE_RANGE;
    let near = false;
    BaseBuilding.get(player).forEach(row => {
        if (near || row.catKey != station || row.mapId != mapId) return;
        if (dist2(row.x, row.y, px, py) <= r2) near = true;
    });
    return near;
}

function findRow(
    container: DBContainer<BaseStorageItem>,
    station: number,
    itemEntry: number,
    bucket: number,
): BaseStorageItem | undefined {
    let found: BaseStorageItem | undefined = undefined;
    container.forEach(row => {
        if (found || row.station != station || row.itemEntry != itemEntry || row.bucket != bucket) return;
        if (row.itemCount > 0) found = row;
    });
    return found;
}

function slotsUsed(container: DBContainer<BaseStorageItem>, station: number, bucket: number): number {
    let used = 0;
    container.forEach(row => {
        if (row.station == station && row.bucket == bucket && row.itemCount > 0) used++;
    });
    return used;
}

function craftCodeForStation(station: number): number {
    if (station == LEATHER_ARMOR_KEY) return CRAFT_STATION_LEATHER_ARMOR;
    if (station == PLATE_ARMOR_KEY) return CRAFT_STATION_METAL_ARMOR;
    if (station == CLOTH_ARMOR_KEY) return CRAFT_STATION_CLOTH_ARMOR;
    if (station == JEWELRY_KEY) return CRAFT_STATION_JEWELRY;
    if (station == WEAPON_FORGE_KEY) return CRAFT_STATION_WEAPON;
    if (station == LAB_KEY) return CRAFT_STATION_ALCHEMY;
    return 0;
}

// The generated catalog can contain tens of thousands of outputs. Build the
// small per-station indexes once; offline catch-up must never rescan unrelated
// armor/weapon rows for every individual operation.
const CRAFT_RECIPES_BY_CODE: number[][][] = [[], [], [], [], [], [], []];
for (let i = 0; i < CRAFT_STATION_RECIPES.length; i++) {
    const row = CRAFT_STATION_RECIPES[i];
    if (row.length < 8) continue;
    const code = Math.floor(row[0]);
    if (code > 0 && code < CRAFT_RECIPES_BY_CODE.length) {
        CRAFT_RECIPES_BY_CODE[code].push(row);
    }
}

function craftRecipesForStation(station: number): number[][] {
    const code = craftCodeForStation(station);
    return code > 0 && code < CRAFT_RECIPES_BY_CODE.length
        ? CRAFT_RECIPES_BY_CODE[code]
        : [];
}

function isEquipmentStation(station: number): boolean {
    const code = craftCodeForStation(station);
    return code > 0 && code != CRAFT_STATION_ALCHEMY;
}

function makerMarkValue(itemEntry: number, rank: number): number {
    const percentages = [5, 8, 12, 16, 20];
    const index = Math.max(0, Math.min(percentages.length - 1, Math.floor(rank) - 1));
    const template = GetItemTemplate(itemEntry);
    const itemLevel = template ? Number(template.GetItemLevel()) : 1;
    return Math.max(1, Math.floor(itemLevel * percentages[index] / 100));
}

function craftedReadyCount(
    crafted: DBContainer<BaseCraftedOutput>,
    station: number,
    itemEntry: number,
): number {
    let count = 0;
    crafted.forEach(row => {
        if (row.claimState == 0 && row.station == station && row.itemEntry == itemEntry) count++;
    });
    return count;
}

function equipmentOutputSlotsUsed(
    container: DBContainer<BaseStorageItem>,
    crafted: DBContainer<BaseCraftedOutput>,
    station: number,
): number {
    const entries: number[] = [];
    container.forEach(row => {
        if (row.station == station && row.bucket == STORAGE_BUCKET_OUTPUT && row.itemCount > 0
            && entries.indexOf(row.itemEntry) < 0) entries.push(row.itemEntry);
    });
    crafted.forEach(row => {
        if (row.station == station && row.claimState == 0 && entries.indexOf(row.itemEntry) < 0) {
            entries.push(row.itemEntry);
        }
    });
    return entries.length;
}

interface EquipmentCapacity {
    entries: number[];
    counts: number[];
}

function equipmentCapacity(
    container: DBContainer<BaseStorageItem>,
    crafted: DBContainer<BaseCraftedOutput>,
    station: number,
): EquipmentCapacity {
    const result: EquipmentCapacity = { entries: [], counts: [] };
    container.forEach(row => {
        if (row.station != station || row.bucket != STORAGE_BUCKET_OUTPUT || row.itemCount <= 0) return;
        const index = result.entries.indexOf(row.itemEntry);
        if (index < 0) {
            result.entries.push(row.itemEntry);
            result.counts.push(row.itemCount);
        } else {
            result.counts[index] += row.itemCount;
        }
    });
    crafted.forEach(row => {
        if (row.station != station || row.claimState != 0) return;
        const index = result.entries.indexOf(row.itemEntry);
        if (index < 0) {
            result.entries.push(row.itemEntry);
            result.counts.push(1);
        } else {
            result.counts[index]++;
        }
    });
    return result;
}

function equipmentCapacityHasSpace(capacity: EquipmentCapacity, output: number): boolean {
    const index = capacity.entries.indexOf(output);
    return index >= 0
        ? capacity.counts[index] < STORAGE_MAX_PER_SLOT
        : capacity.entries.length < STORAGE_MAX_SLOTS;
}

function outputHasSpace(
    container: DBContainer<BaseStorageItem>,
    crafted: DBContainer<BaseCraftedOutput>,
    station: number,
    output: number,
): boolean {
    const row = findRow(container, station, output, STORAGE_BUCKET_OUTPUT);
    if (isEquipmentStation(station)) {
        const count = (row ? row.itemCount : 0) + craftedReadyCount(crafted, station, output);
        if (count > 0) return count < STORAGE_MAX_PER_SLOT;
        return equipmentOutputSlotsUsed(container, crafted, station) < STORAGE_MAX_SLOTS;
    }
    if (row) return row.itemCount < STORAGE_MAX_PER_SLOT;
    return slotsUsed(container, station, STORAGE_BUCKET_OUTPUT) < STORAGE_MAX_SLOTS;
}

function craftRecipeExecutable(
    container: DBContainer<BaseStorageItem>,
    crafted: DBContainer<BaseCraftedOutput>,
    station: number,
    row: number[],
    capacity?: EquipmentCapacity,
): boolean {
    if (row.length < 8 || row[0] != craftCodeForStation(station)) return false;
    const output = Math.floor(row[1]);
    const input = Math.floor(row[6]);
    const count = Math.floor(row[7]);
    if (output <= 0 || input <= 0 || count <= 0) return false;
    const inputRow = findRow(container, station, input, STORAGE_BUCKET_INPUT);
    return inputRow !== undefined
        && inputRow.itemCount >= count
        && (capacity
            ? equipmentCapacityHasSpace(capacity, output)
            : outputHasSpace(container, crafted, station, output));
}

/** Лучший доступный тир; среди рецептов одного тира — равномерный случайный выбор. */
function selectCraftRecipe(
    container: DBContainer<BaseStorageItem>,
    crafted: DBContainer<BaseCraftedOutput>,
    station: number,
    randomize: boolean,
    bias: number = 0,
): number[] | undefined {
    const executable: number[][] = [];
    const recipes = craftRecipesForStation(station);
    const capacity = isEquipmentStation(station)
        ? equipmentCapacity(container, crafted, station)
        : undefined;
    for (let i = 0; i < recipes.length; i++) {
        const row = recipes[i];
        if (craftRecipeExecutable(container, crafted, station, row, capacity)) executable.push(row);
    }
    return selectHighestTierCraftRecipe(executable, randomize ? Math.random() : 0, bias);
}

function pushUnique(values: number[], value: number): void {
    if (value <= 0) return;
    for (let i = 0; i < values.length; i++) {
        if (values[i] == value) return;
    }
    values.push(value);
}

function acceptedInputsFor(station: number): number[] {
    const result: number[] = [];
    const craftCode = craftCodeForStation(station);
    if (craftCode != 0) {
        const recipes = craftRecipesForStation(station);
        for (let i = 0; i < recipes.length; i++) {
            pushUnique(result, Math.floor(recipes[i][6]));
        }
        return result;
    }
    const recipes = recipesFor(station);
    for (let i = 0; i < recipes.length; i++) pushUnique(result, recipes[i].input);
    return result;
}

function stationAcceptsInput(station: number, entry: number): boolean {
    if (station == STORAGE_KEY) return true;
    const craftCode = craftCodeForStation(station);
    if (craftCode != 0) {
        const recipes = craftRecipesForStation(station);
        for (let i = 0; i < recipes.length; i++) {
            if (recipes[i][6] == entry) return true;
        }
        return false;
    }
    return recipeByInput(station, entry) !== undefined;
}

function stationWorking(
    player: TSPlayer,
    container: DBContainer<BaseStorageItem>,
    station: number,
): boolean {
    if (craftCodeForStation(station) != 0) {
        return selectCraftRecipe(container, BaseCraftedOutput.get(player), station, false) !== undefined;
    }
    const recipes = recipesFor(station);
    for (let i = 0; i < recipes.length; i++) {
        const rec = recipes[i];
        const input = findRow(container, station, rec.input, STORAGE_BUCKET_INPUT);
        if (input && input.itemCount >= rec.inCount) {
            const output = findRow(container, station, rec.output, STORAGE_BUCKET_OUTPUT);
            if (output) {
                if (output.itemCount + rec.outCount <= STORAGE_MAX_PER_SLOT) return true;
            } else if (slotsUsed(container, station, STORAGE_BUCKET_OUTPUT) < STORAGE_MAX_SLOTS) {
                return true;
            }
        }
    }
    return false;
}

function getLevel(flag: BaseFlag, station: number): number {
    let level = 0;
    if (station == SMELTER_KEY) level = flag.smelterLevel;
    else if (station == LAB_KEY) level = flag.labLevel;
    else if (station == COOKING_KEY) level = flag.cookLevel;
    else if (station == LEATHERWORKING_KEY) level = flag.leatherLevel;
    else if (station == LOOM_KEY) level = flag.weaveLevel;
    else if (station == INSCRIPTION_KEY) level = flag.inkLevel;
    else if (station == STONECUTTING_KEY) level = flag.stoneLevel;
    else if (station == ENGINEERING_KEY) level = flag.engineerLevel;
    else if (station == BUTCHER_KEY) level = flag.butcherLevel;
    else if (station == LEATHER_ARMOR_KEY) level = flag.leatherArmorLevel;
    else if (station == PLATE_ARMOR_KEY) level = flag.plateArmorLevel;
    else if (station == CLOTH_ARMOR_KEY) level = flag.clothArmorLevel;
    else if (station == WEAPON_FORGE_KEY) level = flag.weaponForgeLevel;
    else if (station == JEWELRY_KEY) level = flag.jewelryLevel;
    if (level > STATION_MAX_LEVEL) return STATION_MAX_LEVEL;
    return level;
}

function setLevel(flag: BaseFlag, station: number, level: number): void {
    if (station == SMELTER_KEY) flag.smelterLevel = level;
    else if (station == LAB_KEY) flag.labLevel = level;
    else if (station == COOKING_KEY) flag.cookLevel = level;
    else if (station == LEATHERWORKING_KEY) flag.leatherLevel = level;
    else if (station == LOOM_KEY) flag.weaveLevel = level;
    else if (station == INSCRIPTION_KEY) flag.inkLevel = level;
    else if (station == STONECUTTING_KEY) flag.stoneLevel = level;
    else if (station == ENGINEERING_KEY) flag.engineerLevel = level;
    else if (station == BUTCHER_KEY) flag.butcherLevel = level;
    else if (station == LEATHER_ARMOR_KEY) flag.leatherArmorLevel = level;
    else if (station == PLATE_ARMOR_KEY) flag.plateArmorLevel = level;
    else if (station == CLOTH_ARMOR_KEY) flag.clothArmorLevel = level;
    else if (station == WEAPON_FORGE_KEY) flag.weaponForgeLevel = level;
    else if (station == JEWELRY_KEY) flag.jewelryLevel = level;
}

function periodFor(flag: BaseFlag, station: number): number {
    if (station == WEAPON_FORGE_KEY) return WEAPON_CRAFT_PERIOD_BY_LEVEL[getLevel(flag, station)];
    if (station == LEATHER_ARMOR_KEY || station == PLATE_ARMOR_KEY
        || station == CLOTH_ARMOR_KEY || station == JEWELRY_KEY) {
        return CRAFT_PERIOD_BY_LEVEL[getLevel(flag, station)];
    }
    return PROCESS_PERIOD_BY_LEVEL[getLevel(flag, station)];
}

function periodForBps(flag: BaseFlag, station: number, periodBps: number): number {
    const basePeriod = periodFor(flag, station);
    return Math.max(1, Math.floor(basePeriod * (10000 - Math.max(0, Math.min(3500, periodBps))) / 10000));
}

function stationPeriodFor(player: TSPlayer, flag: BaseFlag, station: number): number {
    return effectiveWorkerPeriod(periodFor(flag, station), workerForStation(player, station));
}

function batchFor(flag: BaseFlag, station: number): number {
    if (station == LEATHER_ARMOR_KEY || station == PLATE_ARMOR_KEY
        || station == CLOTH_ARMOR_KEY || station == WEAPON_FORGE_KEY
        || station == JEWELRY_KEY) return 1;
    return PROCESS_BATCH_BY_LEVEL[getLevel(flag, station)];
}

/** До разделения пулов готовые предметы лежали вместе с сырьём. */
function migrateLegacyOutputs(container: DBContainer<BaseStorageItem>, station: number): void {
    if (station == STORAGE_KEY) return;
    const recipes = recipesFor(station);
    let changed = false;
    container.forEach(row => {
        if (row.station != station || row.bucket != STORAGE_BUCKET_INPUT || row.itemCount <= 0) return;
        let isInput = false;
        let isOutput = false;
        for (let i = 0; i < recipes.length; i++) {
            if (recipes[i].input == row.itemEntry) isInput = true;
            if (recipes[i].output == row.itemEntry) isOutput = true;
        }
        if (!isOutput || isInput) return;
        row.bucket = STORAGE_BUCKET_OUTPUT;
        row.MarkDirty();
        changed = true;
    });
    if (changed) container.Save();
}

function getStamp(flag: BaseFlag, station: number): number {
    if (station == SMELTER_KEY) return normTime(Number(flag.lastSmelt));
    if (station == LAB_KEY) return normTime(Number(flag.lastBrew));
    if (station == COOKING_KEY) return normTime(Number(flag.lastCook));
    if (station == LEATHERWORKING_KEY) return normTime(Number(flag.lastLeather));
    if (station == LOOM_KEY) return normTime(Number(flag.lastWeave));
    if (station == INSCRIPTION_KEY) return normTime(Number(flag.lastInk));
    if (station == STONECUTTING_KEY) return normTime(Number(flag.lastStone));
    if (station == ENGINEERING_KEY) return normTime(Number(flag.lastEngineer));
    if (station == BUTCHER_KEY) return normTime(Number(flag.lastButcher));
    if (station == LEATHER_ARMOR_KEY) return normTime(Number(flag.lastLeatherArmor));
    if (station == PLATE_ARMOR_KEY) return normTime(Number(flag.lastPlateArmor));
    if (station == CLOTH_ARMOR_KEY) return normTime(Number(flag.lastClothArmor));
    if (station == WEAPON_FORGE_KEY) return normTime(Number(flag.lastWeaponForge));
    if (station == JEWELRY_KEY) return normTime(Number(flag.lastJewelry));
    return 0;
}

function setStamp(flag: BaseFlag, station: number, value: number): void {
    if (station == SMELTER_KEY) flag.lastSmelt = value;
    else if (station == LAB_KEY) flag.lastBrew = value;
    else if (station == COOKING_KEY) flag.lastCook = value;
    else if (station == LEATHERWORKING_KEY) flag.lastLeather = value;
    else if (station == LOOM_KEY) flag.lastWeave = value;
    else if (station == INSCRIPTION_KEY) flag.lastInk = value;
    else if (station == STONECUTTING_KEY) flag.lastStone = value;
    else if (station == ENGINEERING_KEY) flag.lastEngineer = value;
    else if (station == BUTCHER_KEY) flag.lastButcher = value;
    else if (station == LEATHER_ARMOR_KEY) flag.lastLeatherArmor = value;
    else if (station == PLATE_ARMOR_KEY) flag.lastPlateArmor = value;
    else if (station == CLOTH_ARMOR_KEY) flag.lastClothArmor = value;
    else if (station == WEAPON_FORGE_KEY) flag.lastWeaponForge = value;
    else if (station == JEWELRY_KEY) flag.lastJewelry = value;
}

function startFreshStationClock(player: TSPlayer, station: number): void {
    if (station == STORAGE_KEY || !isStation(station)) return;
    const flag = BaseFlag.get(player);
    setStamp(flag, station, nowUnix());
    flag.Save();
}

function processRandomCrafts(
    player: TSPlayer,
    container: DBContainer<BaseStorageItem>,
    station: number,
    operations: number,
): boolean {
    const crafted = BaseCraftedOutput.get(player);
    const worker = workerForStation(player, station);
    let changed = false;
    let completed = 0;
    for (let i = 0; i < operations; i++) {
        const recipe = selectCraftRecipe(container, crafted, station, true, worker ? worker.bias : 0);
        if (!recipe) break;

        const output = Math.floor(recipe[1]);
        const input = Math.floor(recipe[6]);
        const inputCount = Math.floor(recipe[7]);
        const inputRow = findRow(container, station, input, STORAGE_BUCKET_INPUT);
        if (!inputRow || inputRow.itemCount < inputCount) break;
        if (!outputHasSpace(container, crafted, station, output)) break;

        if (!workerSavedInput(worker)) {
            inputRow.itemCount = inputRow.itemCount - inputCount;
            inputRow.MarkDirty();
        }

        let outputCount = 1;
        if (workerBonusOutput(worker)) outputCount++;
        for (let copy = 0; copy < outputCount; copy++) {
            if (!outputHasSpace(container, crafted, station, output)) break;
            if (isEquipmentStation(station)) {
                const craftedRow = crafted.Add(new BaseCraftedOutput(player.GetGUIDLow()));
                craftedRow.outputId = allocateCraftedOutputId(player);
                craftedRow.station = station;
                craftedRow.itemEntry = output;
                craftedRow.makerWorkerId = worker ? worker.workerId : 0;
                craftedRow.makerEntry = worker ? worker.workerEntry : 0;
                craftedRow.makerProfession = worker ? worker.profession : 0;
                craftedRow.makerTrait = worker ? worker.trait : 0;
                craftedRow.makerRank = worker ? worker.rank : 0;
                const marked = worker !== undefined && worker.markProperty > 0
                    && Math.random() * 10000 < Math.min(2000, worker.markBps);
                craftedRow.propertyId = marked && worker ? worker.markProperty : 0;
                craftedRow.value1 = marked && worker ? makerMarkValue(output, worker.rank) : 0;
                craftedRow.value2 = 0;
                craftedRow.sourceNonce = craftedRow.outputId;
                craftedRow.createdAt = nowUnix();
                craftedRow.claimState = 0;
                craftedRow.MarkDirty();
            } else {
                let outputRow = findRow(container, station, output, STORAGE_BUCKET_OUTPUT);
                if (!outputRow) {
                    outputRow = container.Add(new BaseStorageItem(player.GetGUIDLow()));
                    outputRow.station = station;
                    outputRow.itemEntry = output;
                    outputRow.itemCount = 0;
                    outputRow.bucket = STORAGE_BUCKET_OUTPUT;
                }
                outputRow.itemCount = outputRow.itemCount + 1;
                outputRow.MarkDirty();
            }
        }
        if (inputRow.itemCount == 0) inputRow.Delete();
        changed = true;
        completed++;
    }
    if (changed && isEquipmentStation(station)) crafted.Save();
    awardWorkerServiceXP(player, worker, completed);
    return changed;
}

/** Прогнать накопившиеся циклы переработки станции (склад не перерабатывает). */
export function processStation(player: TSPlayer, station: number): void {
    if (station == STORAGE_KEY) return;
    const flag = BaseFlag.get(player);
    const container = BaseStorageItem.get(player);
    migrateLegacyOutputs(container, station);
    const now = nowUnix();
    let last = getStamp(flag, station);
    if (last == 0 || last > now) {
        setStamp(flag, station, now);
        flag.Save();
        return;
    }
    const period = stationPeriodFor(player, flag, station);
    const batch = batchFor(flag, station);
    let cycles = Math.floor((now - last) / period);
    if (cycles <= 0) return;
    const maxCycles = Math.floor(PROCESS_OFFLINE_CAP_S / period);
    const capped = cycles > maxCycles;
    if (capped) cycles = maxCycles;

    let changed = false;
    if (craftCodeForStation(station) != 0) {
        changed = processRandomCrafts(player, container, station, cycles * batch);
    } else {
        const worker = workerForStation(player, station);
        const recipes = recipesFor(station);
        const operationBudget = cycles * batch;
        const startCursor = recipes.length > 0 ? Math.floor(last / period) % recipes.length : 0;
        const completed = runRoundRobinStationBudget(
            recipes.length,
            operationBudget,
            startCursor,
            recipeIndex => {
                const rec = recipes[recipeIndex];
                const inRow = findRow(container, station, rec.input, STORAGE_BUCKET_INPUT);
                if (!inRow || inRow.itemCount < rec.inCount) return false;
                let outRow = findRow(container, station, rec.output, STORAGE_BUCKET_OUTPUT);
                if (!outRow
                    && slotsUsed(container, station, STORAGE_BUCKET_OUTPUT) >= STORAGE_MAX_SLOTS) {
                    return false;
                }
                const outCur = outRow ? outRow.itemCount : 0;
                if (outCur + rec.outCount > STORAGE_MAX_PER_SLOT) return false;
                if (!workerSavedInput(worker)) {
                    inRow.itemCount = inRow.itemCount - rec.inCount;
                    inRow.MarkDirty();
                }
                if (!outRow) {
                    outRow = container.Add(new BaseStorageItem(player.GetGUIDLow()));
                    outRow.station = station;
                    outRow.itemEntry = rec.output;
                    outRow.itemCount = 0;
                    outRow.bucket = STORAGE_BUCKET_OUTPUT;
                }
                outRow.itemCount = outRow.itemCount + rec.outCount;
                if (workerBonusOutput(worker)
                    && outRow.itemCount + rec.outCount <= STORAGE_MAX_PER_SLOT) {
                    outRow.itemCount = outRow.itemCount + rec.outCount;
                }
                outRow.MarkDirty();
                changed = true;
                if (inRow.itemCount == 0) inRow.Delete();
                return true;
            },
        );
        awardWorkerServiceXP(player, worker, completed);
    }

    // Сдвигаем метку всегда: простой станции не копит «банк» циклов.
    setStamp(flag, station, capped ? now : last + cycles * period);
    flag.Save();
    if (changed) container.Save();
}

/** Finish old cycles, then preserve the fractional remainder under the new speed. */
export function settleStationWorkerChange(
    player: TSPlayer,
    station: number,
    oldPeriodBps: number,
    newPeriodBps: number,
): void {
    processStation(player, station);
    const flag = BaseFlag.get(player);
    const now = nowUnix();
    const last = getStamp(flag, station);
    if (last <= 0 || last > now) return;
    const oldPeriod = periodForBps(flag, station, oldPeriodBps);
    const newPeriod = periodForBps(flag, station, newPeriodBps);
    const progress = Math.min(1, Math.max(0, (now - last) / oldPeriod));
    setStamp(flag, station, now - Math.floor(progress * newPeriod));
    flag.Save();
}

function itemName(player: TSPlayer, entry: number): string {
    return localizedTemplateNames.item(player, entry);
}

const CRAFT_CLAIM_READY = 0;
const CRAFT_CLAIMING = 1;
const CRAFT_PROPERTY_PENDING = 2;
const CRAFT_CLAIM_QUARANTINED = 3;
const PROPERTY_SOURCE_BASE_CRAFT = 2;

function publishPropertyRequest(player: TSPlayer, row: BaseCraftedOutput): void {
    player.SetUInt("custom-stats:property-request:item-guid", row.claimedItemGuid);
    player.SetUInt("custom-stats:property-request:item-entry", row.itemEntry);
    player.SetUInt("custom-stats:property-request:property-id", row.propertyId);
    player.SetUInt("custom-stats:property-request:value1", row.value1);
    player.SetUInt("custom-stats:property-request:value2", row.value2);
    player.SetUInt("custom-stats:property-request:source-kind", PROPERTY_SOURCE_BASE_CRAFT);
    player.SetUInt("custom-stats:property-request:source-id", row.makerWorkerId);
    player.SetUInt("custom-stats:property-request:source-entry", row.makerEntry);
    player.SetUInt("custom-stats:property-request:source-owner", player.GetGUIDLow());
    // Commit marker last: a polling consumer can never observe a new nonce
    // paired with the previous request's payload.
    player.SetUInt("custom-stats:property-request:nonce", row.sourceNonce);
}

/** Replays the one persisted cross-module request and never re-grants its item. */
export function reconcileCraftedPropertyRequest(player: TSPlayer): void {
    const rows = BaseCraftedOutput.get(player);
    let pending: BaseCraftedOutput | undefined = undefined;
    rows.forEach(row => {
        if ((row.claimState == CRAFT_CLAIMING || row.claimState == CRAFT_PROPERTY_PENDING)
            && (!pending || row.outputId < pending.outputId)) pending = row;
    });
    const active = pending as BaseCraftedOutput | undefined;
    if (!active) return;
    if (active.claimedItemGuid == 0) {
        // Cross-DB inventory creation cannot be atomic. Never guess/re-grant after
        // a crash between AddItem and GUID persistence: quarantine for inspection.
        active.claimState = CRAFT_CLAIM_QUARANTINED;
        active.MarkDirty();
        rows.Save();
        return;
    }
    if (active.propertyId == 0) {
        active.Delete();
        rows.Save();
        return;
    }
    const ackNonce = Number(player.GetUInt("custom-stats:property-request:ack-nonce", 0));
    if (active.claimState == CRAFT_PROPERTY_PENDING && ackNonce == active.sourceNonce) {
        const status = Number(player.GetUInt("custom-stats:property-request:ack-status", 0));
        if (status == 1) {
            active.Delete();
        } else if (status == 2) {
            active.claimState = CRAFT_CLAIM_QUARANTINED;
            active.MarkDirty();
            player.SendBroadcastMessage(baseText(
                player,
                `Item #${active.itemEntry} was granted, but its maker's mark was rejected; the result was saved for inspection.`,
                `Предмет #${active.itemEntry} выдан, но клеймо отклонено; результат сохранён для проверки.`,
            ));
        }
        rows.Save();
        if (status == 1 || status == 2) return;
    }
    active.claimState = CRAFT_PROPERTY_PENDING;
    active.MarkDirty();
    rows.Save();
    publishPropertyRequest(player, active);
}

function craftedClaimInFlight(player: TSPlayer): boolean {
    let found = false;
    BaseCraftedOutput.get(player).forEach(row => {
        if (row.claimState == CRAFT_CLAIMING || row.claimState == CRAFT_PROPERTY_PENDING) found = true;
    });
    return found;
}

function readyCraftedOutput(
    player: TSPlayer,
    station: number,
    itemEntry: number,
): BaseCraftedOutput | undefined {
    let found: BaseCraftedOutput | undefined = undefined;
    BaseCraftedOutput.get(player).forEach(row => {
        if (row.claimState == CRAFT_CLAIM_READY
            && row.station == station && row.itemEntry == itemEntry
            && (!found || row.outputId < found.outputId)) found = row;
    });
    return found;
}

function handleCraftedWithdraw(player: TSPlayer, station: number, itemEntry: number): boolean {
    const row = readyCraftedOutput(player, station, itemEntry);
    if (!row) return false;
    reconcileCraftedPropertyRequest(player);
    if (craftedClaimInFlight(player)) {
        sendError(player, baseText(player, "Wait for the previous item's maker's mark to be confirmed.", "Дождитесь подтверждения клейма предыдущего предмета."));
        return true;
    }
    const rows = BaseCraftedOutput.get(player);
    row.claimState = CRAFT_CLAIMING;
    row.MarkDirty();
    rows.Save();
    const item = player.AddItem(itemEntry, 1);
    if (!item) {
        row.claimState = CRAFT_CLAIM_READY;
        row.MarkDirty();
        rows.Save();
        sendError(player, baseText(player, "Free some space in your bags.", "Освободите место в сумках."));
        return true;
    }
    row.claimedItemGuid = item.GetGUIDLow();
    if (row.propertyId == 0) {
        row.Delete();
        rows.Save();
    } else {
        row.claimState = CRAFT_PROPERTY_PENDING;
        row.MarkDirty();
        rows.Save();
        publishPropertyRequest(player, row);
    }
    player.SendBroadcastMessage(baseText(
        player,
        `Received from the workshop: ${itemName(player, itemEntry)} x1.`,
        `Получено из мастерской: ${itemName(player, itemEntry)} x1.`,
    ));
    return true;
}

function storageStateEntry(
    state: StorageState,
    itemEntry: number,
    bucket: number,
): StorageEntry | undefined {
    for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        if (item.itemEntry == itemEntry && item.bucket == bucket) return item;
    }
    return undefined;
}

function sendStorageState(player: TSPlayer, station: number, openWindow: boolean): void {
    if (!baseClient(player).ready) return;
    reconcileCraftedPropertyRequest(player);
    const st = new StorageState();
    const container = BaseStorageItem.get(player);
    st.station = station;
    st.openWindow = openWindow ? 1 : 0;
    st.nextCycleS = 0;
    if (station != STORAGE_KEY) {
        const flag = BaseFlag.get(player);
        st.level = getLevel(flag, station);
        st.periodS = stationPeriodFor(player, flag, station);
        st.batch = batchFor(flag, station);
        st.upgradeAvailable = st.level < STATION_MAX_LEVEL ? 1 : 0;
        st.working = stationWorking(player, container, station) ? 1 : 0;
        const last = getStamp(flag, station);
        if (last > 0) {
            const passed = nowUnix() - last;
            st.nextCycleS = passed >= st.periodS ? 0 : st.periodS - passed;
        }
    }
    const accepted = acceptedInputsFor(station);
    for (let i = 0; i < accepted.length; i++) st.acceptedInputs.push(accepted[i]);
    container.forEach(row => {
        if (row.station != station || row.itemCount <= 0) return;
        const bucket = row.bucket == STORAGE_BUCKET_OUTPUT ? STORAGE_BUCKET_OUTPUT : STORAGE_BUCKET_INPUT;
        st.items.push(new StorageEntry(row.itemEntry, row.itemCount, bucket, itemName(player, row.itemEntry)));
    });
    const previewEntries: number[] = [];
    const previewRows: BaseCraftedOutput[] = [];
    BaseCraftedOutput.get(player).forEach(row => {
        if (row.station != station) return;
        if (row.claimState == CRAFT_CLAIMING || row.claimState == CRAFT_PROPERTY_PENDING) {
            st.pendingProperties++;
            return;
        }
        if (row.claimState == CRAFT_CLAIM_QUARANTINED) {
            st.quarantinedOutputs++;
            return;
        }
        if (row.claimState != CRAFT_CLAIM_READY) return;
        let entry = storageStateEntry(st, row.itemEntry, STORAGE_BUCKET_OUTPUT);
        if (!entry) {
            entry = new StorageEntry(row.itemEntry, 0, STORAGE_BUCKET_OUTPUT, itemName(player, row.itemEntry));
            st.items.push(entry);
        }
        entry.count++;
        const previewIndex = previewEntries.indexOf(row.itemEntry);
        if (previewIndex < 0) {
            previewEntries.push(row.itemEntry);
            previewRows.push(row);
        } else if (row.outputId < previewRows[previewIndex].outputId) {
            previewRows[previewIndex] = row;
        }
    });
    for (let i = 0; i < previewRows.length; i++) {
        const row = previewRows[i];
        const entry = storageStateEntry(st, row.itemEntry, STORAGE_BUCKET_OUTPUT);
        if (!entry) continue;
        const maker = row.makerWorkerId > 0
            ? baseText(player, `crafter #${row.makerWorkerId}; `, `мастер #${row.makerWorkerId}; `)
            : "";
        const preview = row.propertyId > 0
            ? baseText(
                player,
                `next: ${maker}mark #${row.propertyId}, power ${row.value1}`,
                `следующее: ${maker}клеймо #${row.propertyId}, сила ${row.value1}`,
            )
            : baseText(player, `next: ${maker}no mark`, `следующее: ${maker}без клейма`);
        entry.name = `${entry.name} · ${preview}`;
    }
    st.write().SendToPlayer(player);
}

function stationName(player: TSPlayer, station: number): string {
    const b = buildingByKey(station);
    return b ? buildingName(b, isRussianClient(player)) : baseText(player, "station", "станция");
}

function requireStation(player: TSPlayer, station: number): boolean {
    if (!isStation(station)) {
        sendError(player, baseText(player, "Unknown storage station.", "Неизвестная станция хранения."));
        return false;
    }
    if (BaseFlag.get(player).hasFlag == 0) {
        sendError(player, baseText(player, "Place your base flag first.", "Сначала поставьте флаг базы."));
        return false;
    }
    if (!nearOwnStation(player, station)) {
        sendError(player, baseText(
            player,
            `Move closer to your ${stationName(player, station)}.`,
            `Подойдите к своей постройке «${stationName(player, station)}».`,
        ));
        return false;
    }
    return true;
}

function handleDeposit(player: TSPlayer, msg: StorageMoveMsg): void {
    if (!requireStation(player, msg.station)) return;
    if (msg.bucket != STORAGE_BUCKET_INPUT) {
        sendError(player, baseText(player, "Items can only be deposited into the materials section.", "Предметы можно класть только в секцию сырья."));
        return;
    }
    processStation(player, msg.station);

    const entry = Math.floor(msg.itemEntry);
    const tpl = GetItemTemplate(entry);
    if (!tpl) {
        sendError(player, baseText(player, "That item does not exist.", "Такого предмета не существует."));
        return;
    }
    if (msg.station == STORAGE_KEY) {
        const reject = warehouseRejectReason(
            Number(tpl.GetClass()),
            Number(tpl.GetInventoryType()),
            (Number(tpl.GetFlags()) & 0x2) != 0,
            isRussianClient(player),
        );
        if (reject) {
            sendError(player, reject);
            return;
        }
    }
    if (!stationAcceptsInput(msg.station, entry)) {
        if (msg.station == SMELTER_KEY) sendError(player, baseText(player, "The smelter accepts only ore.", "Плавильня принимает только руду."));
        else if (msg.station == LAB_KEY) sendError(player, baseText(player, "The alchemy table accepts only herbs.", "Алхимический стол принимает только травы."));
        else if (msg.station == COOKING_KEY) sendError(player, baseText(player, "The cooking table accepts only raw fish listed in its recipes.", "Кухонный стол принимает только сырую рыбу из списка рецептов."));
        else if (msg.station == LEATHERWORKING_KEY) sendError(player, baseText(player, "The tanning bench accepts only leather listed in its recipes.", "Дубильный верстак принимает только кожу из списка рецептов."));
        else if (msg.station == LOOM_KEY) sendError(player, baseText(player, "The loom accepts only cloth listed in its recipes.", "Ткацкий станок принимает только ткань из списка рецептов."));
        else if (msg.station == INSCRIPTION_KEY) sendError(player, baseText(player, "The scribe's table accepts only pigments listed in its recipes.", "Стол начертателя принимает только пигменты из списка рецептов."));
        else if (msg.station == STONECUTTING_KEY) sendError(player, baseText(player, "The grinding wheel accepts only stone listed in its recipes.", "Точильный круг принимает только камень из списка рецептов."));
        else if (msg.station == ENGINEERING_KEY) sendError(player, baseText(player, "The engineering bench accepts only materials listed in its recipes.", "Инженерный станок принимает только сырьё из списка рецептов."));
        else if (msg.station == BUTCHER_KEY) sendError(player, baseText(player, "The butcher's table accepts only raw meat listed in its recipes.", "Разделочный стол принимает только сырое мясо из списка рецептов."));
        else sendError(player, baseText(player, "This station does not accept that item.", "Эта станция не принимает данный предмет."));
        return;
    }

    const inBags = Number(player.GetItemCount(entry, false));
    let count = msg.count <= 0 ? inBags : Math.min(Math.floor(msg.count), inBags);
    if (count <= 0) {
        sendError(player, baseText(player, "You do not have that item in your bags.", "В сумках нет этого предмета."));
        return;
    }

    const container = BaseStorageItem.get(player);
    let row = findRow(container, msg.station, entry, STORAGE_BUCKET_INPUT);
    const current = row ? row.itemCount : 0;
    if (!row && slotsUsed(container, msg.station, STORAGE_BUCKET_INPUT) >= STORAGE_MAX_SLOTS) {
        sendError(player, baseText(player, `All ${STORAGE_MAX_SLOTS} station slots are occupied.`, `Все ${STORAGE_MAX_SLOTS} слота станции заняты.`));
        return;
    }
    if (count > STORAGE_MAX_PER_SLOT - current) count = STORAGE_MAX_PER_SLOT - current;
    if (count <= 0) {
        sendError(player, baseText(player, "This item's slot is full.", "Слот этого предмета заполнен."));
        return;
    }

    const removed = removeCarriedItems(player, entry, count);
    if (removed <= 0) {
        sendError(player, baseText(player, "Could not remove the item from your bags. Close the trade window and try again.", "Не удалось забрать предмет из сумок. Закройте обмен и попробуйте снова."));
        return;
    }
    if (!row) {
        row = container.Add(new BaseStorageItem(player.GetGUIDLow()));
        row.station = msg.station;
        row.itemEntry = entry;
        row.itemCount = 0;
        row.bucket = STORAGE_BUCKET_INPUT;
    }
    row.itemCount = row.itemCount + removed;
    row.MarkDirty();
    container.Save();

    sendStorageState(player, msg.station, false);
    if (removed < count) {
        player.SendBroadcastMessage(baseText(
            player,
            `Stored: ${itemName(player, entry)} x${removed}. Some items are currently unavailable.`,
            `Убрано на хранение: ${itemName(player, entry)} x${removed}. Часть предметов сейчас недоступна.`,
        ));
    } else {
        player.SendBroadcastMessage(baseText(player, `Stored: ${itemName(player, entry)} x${removed}.`, `Убрано на хранение: ${itemName(player, entry)} x${removed}.`));
    }
}

function handleWithdraw(player: TSPlayer, msg: StorageMoveMsg): void {
    if (!requireStation(player, msg.station)) return;
    processStation(player, msg.station);

    const entry = Math.floor(msg.itemEntry);
    const container = BaseStorageItem.get(player);
    if (msg.bucket != STORAGE_BUCKET_INPUT &&
        (msg.station == STORAGE_KEY || msg.bucket != STORAGE_BUCKET_OUTPUT)) {
        sendError(player, baseText(player, "Unknown station section.", "Неизвестная секция станции."));
        return;
    }
    const bucket = msg.bucket;
    if (bucket == STORAGE_BUCKET_OUTPUT && isEquipmentStation(msg.station)
        && handleCraftedWithdraw(player, msg.station, entry)) {
        sendStorageState(player, msg.station, false);
        return;
    }
    const row = findRow(container, msg.station, entry, bucket);
    if (!row) {
        sendError(player, baseText(player, "This item is not stored at the station.", "На станции нет этого предмета."));
        return;
    }
    const count = msg.count <= 0 ? row.itemCount : Math.min(Math.floor(msg.count), row.itemCount);
    if (count <= 0) return;
    const before = Number(player.GetItemCount(entry, false));
    player.AddItem(entry, count);
    const added = Math.min(
        count,
        Math.max(0, Number(player.GetItemCount(entry, false)) - before),
    );
    if (added <= 0) {
        sendError(player, baseText(player, "Free some space in your bags.", "Освободите место в сумках."));
        return;
    }
    row.itemCount = row.itemCount - added;
    row.MarkDirty();
    if (row.itemCount == 0) row.Delete();
    container.Save();

    sendStorageState(player, msg.station, false);
    if (added < count) {
        player.SendBroadcastMessage(baseText(
            player,
            `Received from storage: ${itemName(player, entry)} x${added}. Free bag space for the remainder.`,
            `Получено со склада: ${itemName(player, entry)} x${added}. Для остатка освободите место в сумках.`,
        ));
    } else {
        player.SendBroadcastMessage(baseText(player, `Received from storage: ${itemName(player, entry)} x${added}.`, `Получено со склада: ${itemName(player, entry)} x${added}.`));
    }
}

function handleUpgrade(player: TSPlayer, msg: StorageUpgradeMsg): void {
    if (!requireStation(player, msg.station)) return;
    if (msg.station == STORAGE_KEY) {
        sendError(player, baseText(player, "Regular storage does not require production upgrades.", "Обычный склад не требует производственных улучшений."));
        return;
    }

    // Сначала завершаем накопленные циклы по старым параметрам.
    processStation(player, msg.station);
    const flag = BaseFlag.get(player);
    const level = getLevel(flag, msg.station);
    if (level >= STATION_MAX_LEVEL) {
        sendError(player, baseText(player, "This station is already at maximum level.", "Эта станция уже максимального уровня."));
        sendStorageState(player, msg.station, false);
        return;
    }
    const cost = stationUpgradeMaterialCost(msg.station, level);
    if (!consumeMaterialCost(player, cost)) return;

    // Сохраняем долю текущего цикла при переходе на более короткий период.
    const now = nowUnix();
    const oldPeriod = stationPeriodFor(player, flag, msg.station);
    const last = getStamp(flag, msg.station);
    let progress = last > 0 && last <= now ? (now - last) / oldPeriod : 0;
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;

    setLevel(flag, msg.station, level + 1);
    const newPeriod = stationPeriodFor(player, flag, msg.station);
    setStamp(flag, msg.station, now - Math.floor(progress * newPeriod));
    flag.Save();

    sendStorageState(player, msg.station, false);
    sendError(player, baseText(
        player,
        `${stationName(player, msg.station)} upgraded to level ${level + 2}: `
            + `${batchFor(flag, msg.station)} operations every ${Math.floor(newPeriod / 60)} min.`,
        `${stationName(player, msg.station)} улучшена до уровня ${level + 2}: `
            + `${batchFor(flag, msg.station)} операций каждые ${Math.floor(newPeriod / 60)} мин.`,
    ));
}

/** Клик по GO станции: владелец — открыть окно, чужой — подсказка. */
function handleStationClick(obj: TSGameObject, player: TSPlayer): void {
    const station = stationByEntry(obj.GetEntry());
    if (station == 0) return;

    // владелец = есть своя строка этой станции в точке объекта
    let owned = false;
    BaseBuilding.get(player).forEach(row => {
        if (owned || row.catKey != station || row.mapId != obj.GetMapID()) return;
        if (dist2(row.x, row.y, obj.GetX(), obj.GetY()) <= 1.0) owned = true;
    });
    if (!owned) {
        player.SendBroadcastMessage(baseText(player, "This storage station belongs to another player.", "Это чужая станция хранения."));
        return;
    }
    if (!baseClient(player).ready) {
        player.SendBroadcastMessage(baseText(player, "Open the base menu (/base) once, then click again.", "Откройте меню базы (/base) один раз и кликните снова."));
        return;
    }
    processStation(player, station);
    sendStorageState(player, station, true);
}

export function RegisterBaseStorage(events: TSEvents): void {
    setBaseBuildingPlacementHandler((player, building, firstCopy) => {
        if (firstCopy) startFreshStationClock(player, Number(building.catKey));
    });
    events.Player.OnSave(player => BaseCraftedOutput.get(player).Save());
    events.Player.OnLogin((player, firstLogin) => {
        player.AddTimer(3000, 0x0fffffff, (owner, timer) => {
            const activePlayer = owner.ToPlayer();
            if (activePlayer) reconcileCraftedPropertyRequest(activePlayer);
        });
    });
    events.GameObject.OnGossipHello(GO_STORAGE_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_SMELTER_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_LAB_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_COOKING_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_LEATHERWORKING_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_LOOM_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_INSCRIPTION_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_STONECUTTING_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_ENGINEERING_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_BUTCHER_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_LEATHER_ARMOR_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_PLATE_ARMOR_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_CLOTH_ARMOR_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_WEAPON_FORGE_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });
    events.GameObject.OnGossipHello(GO_JEWELRY_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        handleStationClick(obj, player);
    });

    events.CustomPacket.OnReceive(OP_STORE_REQUEST, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new StorageRequest(0);
        msg.read(packet);
        if (!requireStation(player, msg.station)) return;
        processStation(player, msg.station);
        sendStorageState(player, msg.station, false);
    });

    events.CustomPacket.OnReceive(OP_STORE_DEPOSIT, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new StorageMoveMsg(OP_STORE_DEPOSIT, 0, 0, 0, STORAGE_BUCKET_INPUT);
        msg.read(packet);
        handleDeposit(player, msg);
    });

    events.CustomPacket.OnReceive(OP_STORE_WITHDRAW, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new StorageMoveMsg(OP_STORE_WITHDRAW, 0, 0, 0, STORAGE_BUCKET_INPUT);
        msg.read(packet);
        handleWithdraw(player, msg);
    });

    events.CustomPacket.OnReceive(OP_STORE_UPGRADE, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new StorageUpgradeMsg(0);
        msg.read(packet);
        handleUpgrade(player, msg);
    });
}
