import { RESOURCE_GENERATORS, resourceGeneratorByKey } from "./ResourceGenerators";

/**
 * Base-building — shared catalog & tunables (used by datascripts, livescripts and addon).
 *
 * Открытый мир: постройки видны всем. Игрок ставит ОДИН флаг базы и строит
 * постройки в радиусе от него за материалы. Место выбирается кликом по земле
 * (ground-target спелл), ориентация — по направлению взгляда с доворотом кнопками.
 */

export const MODNAME = "base-building";

/* Теги спеллов размещения — livescript резолвит их через literal UTAG при сборке. */
export const TAG_PLACE = "base-place-spell"; // общий спелл: строить выбранную постройку
export const TAG_FLAG  = "base-flag-spell";  // спелл: поставить/переставить флаг базы
export const TAG_FLAG_ITEM = "base-flag-item";

export function buildingSpellTag(key: number): string {
    return `base-building-spell-${key}`;
}

export function buildingItemTag(key: number): string {
    return `base-building-item-${key}`;
}

/*
 * Имена спеллов задаются в датаскрипте на ВСЕХ локалях (клиент ruRU читает ruRU).
 * Каждый одноразовый строительный предмет запускает собственный ground-target spell.
 */
export const PLACE_SPELL_NAME = "Строительство базы";
export const PLACE_SPELL_NAME_EN = "Base Construction";
export const FLAG_SPELL_NAME  = "Флаг базы";
export const FLAG_SPELL_NAME_EN = "Base Flag";

/* ----------------------------- Параметры ----------------------------------- */
export const BUILD_RADIUS = 25.0;          // радиус строительства от флага, ярды
export const MAX_BUILDINGS = 30;           // лимит построек на игрока
export const ROTATE_STEP = Math.PI / 12;   // шаг доворота = 15°
export const MANAGE_RANGE = 15.0;          // радиус «ближайшей своей постройки» для поворота/сноса

/** Один агрегированный материал: нужное количество можно набрать любыми item из entries. */
export interface BuildingMaterial {
    name: string;
    nameEn: string;
    entries: number[];
    count: number;
}

// Любой тир подходит как одна единица материала; сначала расходуются младшие.
export const BUILDING_ORE_ITEMS = [2770, 2771, 2772, 3858, 10620, 23424, 36909, 36912];
export const BUILDING_HERB_ITEMS = [2447, 2450, 3356, 3821, 8838, 22785, 36901, 36906];
export const BUILDING_CLOTH_ITEMS = [2589, 2592, 4306, 4338, 14047, 21877, 33470];
export const BUILDING_LEATHER_ITEMS = [2318, 2319, 4234, 4304, 8170, 21887, 33568];
export const BUILDING_STONE_ITEMS = [2835, 2836, 2838, 7912, 12365];
// Сервер заполняет массив через UTAG, затем передаёт числовые ID клиенту в BaseState.
// Массив нельзя заменять целиком: готовые рецепты декора хранят ссылку на него.
export const BUILDING_WOOD_ITEMS: number[] = [];

export function setBuildingWoodItems(entries: number[]): void {
    while (BUILDING_WOOD_ITEMS.length > 0) BUILDING_WOOD_ITEMS.pop();
    for (let i = 0; i < entries.length; i++) BUILDING_WOOD_ITEMS.push(entries[i]);
}

function ore(count: number): BuildingMaterial {
    return { name: "Любая руда", nameEn: "Any Ore", entries: BUILDING_ORE_ITEMS, count: count };
}

function herb(count: number): BuildingMaterial {
    return { name: "Любая трава", nameEn: "Any Herb", entries: BUILDING_HERB_ITEMS, count: count };
}

function cloth(count: number): BuildingMaterial {
    return { name: "Любая ткань", nameEn: "Any Cloth", entries: BUILDING_CLOTH_ITEMS, count: count };
}

function leather(count: number): BuildingMaterial {
    return { name: "Любая кожа", nameEn: "Any Leather", entries: BUILDING_LEATHER_ITEMS, count: count };
}

function stone(count: number): BuildingMaterial {
    return { name: "Любой камень", nameEn: "Any Stone", entries: BUILDING_STONE_ITEMS, count: count };
}

function wood(count: number): BuildingMaterial {
    return { name: "Любая древесина", nameEn: "Any Wood", entries: BUILDING_WOOD_ITEMS, count: count };
}

/** Единая цена обычного декора и объектов из полного patch-каталога. */
export const DECORATION_MATERIAL_COST: BuildingMaterial[] = [wood(5)];

/**
 * gameobject_template.entry модели флага базы. 192252 = "Alliance Banner" (display 5651) —
 * подобрано из БД мира. Замените при желании на любой banner/standard.
 */
export const FLAG_ENTRY = 192252;
export const HORDE_FLAG_ENTRY = 192253;
export const FLAG_TOOLTIP_NAME = "Alliance Banner";
export const HORDE_FLAG_TOOLTIP_NAME = "Horde Banner";

/* --------------------- Функциональные постройки ---------------------------- */
/*
 * Переиспользованные НЕЗАСПАВНЕННЫЕ в мире gameobject_template (проверено по
 * таблице gameobject) — датаскрипт переименовывает их и делает кликабельными
 * (паттерн флага: тип GENERIC + interaction data). Entries стабильны, UTAG для
 * GO-шаблонов недоступен (у них нет Tags).
 */
export const GO_SAFE_ENTRY  = 2130; // «Личный сейф» (бывш. вывеска The Wine Cask)
export const GO_WATER_ENTRY = 2131; // «Бочка питьевой воды» (бывш. Cathedral Square)
export const GO_FOOD_ENTRY  = 2148; // «Котёл с похлёбкой» (бывш. The Cheese Cutters)
export const GO_MINE_ENTRY   = 2149; // «Рудная жила» (бывш. The Seven Deadly Venoms)
export const GO_GARDEN_ENTRY = 1670; // «Сад трав» (бывш. Barrel of Powder)

/** Один независимый бросок мастерства; chance хранится в basis points (0..10000). */
export function masteryExtraCopy(masteryBps: number, roll01: number): number {
    let chance = masteryBps;
    if (chance < 0) chance = 0;
    if (chance > 10000) chance = 10000;
    return roll01 * 10000 < chance ? 1 : 0;
}

/* Ежедневные припасы: клик по СВОЕМУ флагу базы. */
export const SUPPLY_COOLDOWN_S = 72000; // 20 часов

/* Прокачка базы: уровень флага (0-2) расширяет радиус и лимит построек. */
export const UPGRADE_KEY = 77;                 // "постройка"-услуга в каталоге
export const BASE_MAX_LEVEL = 2;
export const RADIUS_BY_LEVEL = [25.0, 35.0, 45.0];
export const LIMIT_BY_LEVEL = [30, 45, 60];

/* Набеги на базу: PvE-волны мобов уровня игрока, пока он у своего флага. */
export const GUARD_KEY = 78;            // стражник-мили
export const ARCHER_KEY = 79;           // стрелок (дальний бой)
export const HEALER_KEY = 81;           // целитель поддержки

/* Функциональное расширение каталога. 98 зарезервирован, 99 занят заказами,
 * генераторы начинаются с 200 — блок 100..112 остаётся стабильным. */
export const HEALING_DUMMY_KEY = 100;
export const CLEANSING_FONT_KEY = 101;
export const REPAIR_STATION_KEY = 102;
export const CAPITAL_PORTAL_KEY = 103;
export const BASE_HERALD_KEY = 104;
export const TACTICAL_TABLE_KEY = 105;
export const SHIELDBEARER_KEY = 106;
export const BATTLE_MAGE_KEY = 107;
export const BALLISTA_KEY = 108;
export const FROST_TRAP_KEY = 109;
export const RUNIC_OBELISK_KEY = 110;
export const WATCH_GONG_KEY = 111;
export const ECHO_VENDOR_KEY = 112;

export const SERVICE_EXPANSION_KEYS = [
    HEALING_DUMMY_KEY, CLEANSING_FONT_KEY, REPAIR_STATION_KEY,
    CAPITAL_PORTAL_KEY, BASE_HERALD_KEY, TACTICAL_TABLE_KEY, ECHO_VENDOR_KEY,
];
export const DEFENSE_EXPANSION_KEYS = [
    SHIELDBEARER_KEY, BATTLE_MAGE_KEY, BALLISTA_KEY,
    FROST_TRAP_KEY, RUNIC_OBELISK_KEY, WATCH_GONG_KEY,
];
export const DEFENSE_BUILDING_KEYS = [
    GUARD_KEY, ARCHER_KEY, 80, HEALER_KEY,
    ...DEFENSE_EXPANSION_KEYS,
];

/** Только эти defense entries являются существами. GO нельзя класть сюда:
 * raids.ts разрешает GUID из этого массива как TSCreature. */
export const GUARD_KEYS = [
    GUARD_KEY, ARCHER_KEY, HEALER_KEY,
    SHIELDBEARER_KEY, BATTLE_MAGE_KEY, BALLISTA_KEY,
];
export const RAID_COOLDOWN_S = 3600;    // не чаще раза в час
export const RAID_CHANCE = 0.15;        // шанс на минутную проверку у флага
export const RAID_MIN_LEVEL = 5;        // ниже — не беспокоим
export const RAID_BASE_COUNT = 4;       // мобов в волне (+2 за уровень базы)

export const CLEANSING_COOLDOWN_S = 5 * 60;
export const REPAIR_COOLDOWN_S = 15 * 60;
export const CAPITAL_PORTAL_COOLDOWN_S = 30 * 60;
export const PRACTICE_RAID_COOLDOWN_S = 10 * 60;
export const SERVICE_USE_RANGE = 6.0;
export const PRACTICE_RAID_DURATION_S = 90;

export function cooldownWaitSeconds(lastUse: number, now: number, cooldown: number): number {
    return Math.max(0, lastUse + cooldown - now);
}

/** Ноль означает отсутствие отдельного лимита помимо общего лимита базы. */
export function maxBuildingCopies(key: number): number {
    if (key == BALLISTA_KEY || key == FROST_TRAP_KEY) return 2;
    for (let i = 0; i < SERVICE_EXPANSION_KEYS.length; i++) {
        if (SERVICE_EXPANSION_KEYS[i] == key) return 1;
    }
    for (let i = 0; i < DEFENSE_EXPANSION_KEYS.length; i++) {
        if (DEFENSE_EXPANSION_KEYS[i] == key) return 1;
    }
    return 0;
}

/* Осада: невыбитые рейдеры идут к флагу; провал за 5 минут = разграбление. */
export const GO_BANNER_ENTRY = 1729;    // «Боевое знамя» (бывш. Tainted Keg, незаспавнен)
export const BANNER_KEYS = [80];
export const BANNER_RANGE = 15.0;       // радиус «Боевого духа»

/* --------------------- Хранилище и переработка ----------------------------- */
/* Переиспользованные незаспавненные шаблоны (как сейф/жила/сад — см. выше). */
export const GO_STORAGE_ENTRY = 2696; // «Склад материалов» (бывш. Bucket 001, тип 5 — Generic.load требует тип GENERIC)
export const GO_SMELTER_ENTRY = 2692; // «Плавильня» (бывш. Bottle 002)
export const GO_LAB_ENTRY     = 2686; // «Алхимический стол» (бывш. Apothecary Table)
export const GO_COOKING_ENTRY = 12665; // «Кухонный стол» (stock Cooking Table)
export const GO_LEATHERWORKING_ENTRY = 2693; // незаспавненный Generic «Bottle 003»
export const GO_LOOM_ENTRY           = 2694; // незаспавненный Generic «Bottle 004»
export const GO_INSCRIPTION_ENTRY    = 2697; // незаспавненный Generic «Candlelabra 001»
export const GO_STONECUTTING_ENTRY   = 2698; // незаспавненный Generic «Cup 001»
export const GO_ENGINEERING_ENTRY    = 2699; // незаспавненный Generic «Blue Aura, column»
export const GO_BUTCHER_ENTRY        = 2333; // незаспавненный Generic «Stranglevine Wine»

/* Новые шаблоны — приватные datascript-клоны, поэтому их числовые ID
 * разрешаются через UTAG в livescript после build data. Addon использует ключи. */
export let GO_LEATHER_ARMOR_ENTRY = 0;
export let GO_PLATE_ARMOR_ENTRY = 0;
export let GO_CLOTH_ARMOR_ENTRY = 0;
export let GO_WEAPON_FORGE_ENTRY = 0;
export let GO_JEWELRY_ENTRY = 0;
export let GO_ORDERS_BOARD_ENTRY = 0;

export const STORAGE_KEY = 82; // склад материалов: обычные предметы без instance-данных
export const SMELTER_KEY = 83; // плавильня: руда → слитки со временем
export const LAB_KEY     = 84; // алхимический стол: травы → зелья со временем
export const COOKING_KEY = 12; // существующий кухонный стол: сырая рыба → готовая еда
export const LEATHERWORKING_KEY = 85; // кожевенный верстак: кожа → кожа следующего тира
export const LOOM_KEY           = 86; // ткацкий станок: ткань → рулоны
export const INSCRIPTION_KEY    = 87; // стол начертателя: пигменты → чернила
export const STONECUTTING_KEY   = 88; // точильный круг: камень → точильные камни
export const ENGINEERING_KEY    = 89; // инженерный станок: сырьё → детали
export const BUTCHER_KEY        = 90; // разделочный стол: сырое мясо → еда
export const LEATHER_ARMOR_KEY  = 93; // кожа → случайная кожаная броня
export const PLATE_ARMOR_KEY    = 94; // металл → случайная кольчужная/латная броня
export const CLOTH_ARMOR_KEY    = 95; // ткань → случайная тканевая броня
export const WEAPON_FORGE_KEY   = 96; // доминирующий материал → случайное оружие любого типа
export const JEWELRY_KEY        = 97; // металл/камни → случайное украшение
export const ORDERS_BOARD_KEY   = 99;
export const STATION_KEYS = [
    STORAGE_KEY, SMELTER_KEY, LAB_KEY, COOKING_KEY,
    LEATHERWORKING_KEY, LOOM_KEY, INSCRIPTION_KEY,
    STONECUTTING_KEY, ENGINEERING_KEY, BUTCHER_KEY,
    LEATHER_ARMOR_KEY, PLATE_ARMOR_KEY, CLOTH_ARMOR_KEY,
    WEAPON_FORGE_KEY, JEWELRY_KEY,
];

export const RANDOM_CRAFT_STATION_KEYS = [
    LAB_KEY, LEATHER_ARMOR_KEY, PLATE_ARMOR_KEY, CLOTH_ARMOR_KEY,
    WEAPON_FORGE_KEY, JEWELRY_KEY,
];

export const STORAGE_MAX_SLOTS = 24;      // различных предметов в каждом пуле станции
export const STORAGE_MAX_PER_SLOT = 1000; // штук одного предмета в слоте
export const STATION_MAX_LEVEL = 2;       // внутренние уровни 0..2 (в UI: I..III)
export const PROCESS_PERIOD_BY_LEVEL = [300, 240, 180]; // 5 / 4 / 3 минуты
export const PROCESS_BATCH_BY_LEVEL = [5, 8, 12];       // операций за цикл
export const PROCESS_OFFLINE_CAP_S = 8 * 60 * 60;       // до 8 часов оффлайн-работы
export const STATION_USE_RANGE = 10.0;    // класть/забирать можно только рядом
export const CRAFT_PERIOD_BY_LEVEL = [30 * 60, 20 * 60, 15 * 60];
export const WEAPON_CRAFT_PERIOD_BY_LEVEL = [60 * 60, 40 * 60, 30 * 60];

/* Служебные постройки после производственных ключей 85..90. */
export const TRAINING_DUMMY_KEY = 91;
export const RESTORATION_ALTAR_KEY = 92;
export const GO_RESTORATION_ALTAR_ENTRY = 190741; // WotLK Light Altar, незаспавненный stock Generic
export const RESTORATION_COOLDOWN_S = 5 * 60;
export const RESTORATION_USE_RANGE = 6.0;

export function restorationWaitSeconds(lastUse: number, now: number): number {
    return Math.max(0, lastUse + RESTORATION_COOLDOWN_S - now);
}

const ITEM_CLASS_QUEST = 12;

/**
 * Выдача создаёт новый экземпляр, поэтому экипировку с чарами/прочностью/
 * random-property не принимаем. Обычные неэкипируемые предметы, в том числе
 * одиночные, безопасны. Производственные станции используют белые списки.
 */
export function warehouseRejectReason(
    itemClass: number,
    inventoryType: number,
    conjured: boolean,
    russian: boolean = true,
): string | undefined {
    if (itemClass == ITEM_CLASS_QUEST) return russian ? "Квестовые предметы хранить нельзя." : "Quest items cannot be stored.";
    if (inventoryType != 0) return russian
        ? "Экипировку хранить нельзя: склад не сохраняет данные экземпляра предмета."
        : "Equipment cannot be stored because the warehouse does not preserve item instance data.";
    if (conjured) return russian ? "Сотворённые предметы хранить нельзя." : "Conjured items cannot be stored.";
    return undefined;
}

/** Рецепт станции: inCount входа → outCount выхода за одну операцию. */
export interface ProcessRecipe {
    stationKey: number;
    input: number;
    inCount: number;
    output: number;
    outCount: number;
}

export const RECIPES: ProcessRecipe[] = [
    /* Плавильня: классические плавки 1:1 для точных рудных генераторов. */
    { stationKey: SMELTER_KEY, input: 2770,  inCount: 1, output: 2840,  outCount: 1 }, // медь
    { stationKey: SMELTER_KEY, input: 2771,  inCount: 1, output: 3576,  outCount: 1 }, // олово
    { stationKey: SMELTER_KEY, input: 2775,  inCount: 1, output: 2842,  outCount: 1 }, // серебро
    { stationKey: SMELTER_KEY, input: 2772,  inCount: 1, output: 3575,  outCount: 1 }, // железо
    { stationKey: SMELTER_KEY, input: 2776,  inCount: 1, output: 2843,  outCount: 1 }, // золото
    { stationKey: SMELTER_KEY, input: 3858,  inCount: 1, output: 3860,  outCount: 1 }, // мифрил
    { stationKey: SMELTER_KEY, input: 7911,  inCount: 1, output: 6037,  outCount: 1 }, // истинное серебро
    { stationKey: SMELTER_KEY, input: 10620, inCount: 1, output: 12359, outCount: 1 }, // торий
    { stationKey: SMELTER_KEY, input: 23424, inCount: 1, output: 23445, outCount: 1 }, // адское железо
    { stationKey: SMELTER_KEY, input: 23425, inCount: 1, output: 23446, outCount: 1 }, // адамантит
    { stationKey: SMELTER_KEY, input: 36909, inCount: 1, output: 36916, outCount: 1 }, // кобальт
    { stationKey: SMELTER_KEY, input: 36912, inCount: 1, output: 36913, outCount: 1 }, // саронит
    { stationKey: SMELTER_KEY, input: 36910, inCount: 1, output: 41163, outCount: 1 }, // титан
    /* Старый список оставлен для совместимости; runtime алхимии использует случайный craft-all каталог. */
    { stationKey: LAB_KEY, input: 2447,  inCount: 3, output: 118,   outCount: 1 }, // мироцвет → малое лечебное
    { stationKey: LAB_KEY, input: 765,   inCount: 3, output: 2455,  outCount: 1 }, // сребролист → малое зелье маны
    { stationKey: LAB_KEY, input: 785,   inCount: 3, output: 3385,  outCount: 1 }, // магороза → слабое зелье маны
    { stationKey: LAB_KEY, input: 2450,  inCount: 3, output: 858,   outCount: 1 }, // шипошёрст → слабое лечебное
    { stationKey: LAB_KEY, input: 3356,  inCount: 3, output: 929,   outCount: 1 }, // королевская кровь → лечебное
    { stationKey: LAB_KEY, input: 3820,  inCount: 3, output: 3827,  outCount: 1 }, // удавник → зелье маны
    { stationKey: LAB_KEY, input: 3821,  inCount: 3, output: 1710,  outCount: 1 }, // златошип → большое лечебное
    { stationKey: LAB_KEY, input: 3358,  inCount: 3, output: 6149,  outCount: 1 }, // ус Кадгара → большое зелье маны
    { stationKey: LAB_KEY, input: 8838,  inCount: 3, output: 3928,  outCount: 1 }, // солнечник → отличное лечебное
    { stationKey: LAB_KEY, input: 13463, inCount: 3, output: 13444, outCount: 1 }, // сноцвет → превосходное зелье маны
    { stationKey: LAB_KEY, input: 22785, inCount: 3, output: 22829, outCount: 1 }, // сквернопля → сверхлечебное
    { stationKey: LAB_KEY, input: 36901, inCount: 3, output: 33447, outCount: 1 }, // златоклевер → руническое лечебное
    { stationKey: LAB_KEY, input: 36906, inCount: 3, output: 33448, outCount: 1 }, // ледошип → руническое зелье маны
    /* Кухонный стол: проверенные рецепты готовки рыбы 1:1 из Spell.dbc. */
    { stationKey: COOKING_KEY, input: 6291,  inCount: 1, output: 6290,  outCount: 1 },
    { stationKey: COOKING_KEY, input: 6303,  inCount: 1, output: 787,   outCount: 1 },
    { stationKey: COOKING_KEY, input: 6289,  inCount: 1, output: 4592,  outCount: 1 },
    { stationKey: COOKING_KEY, input: 6317,  inCount: 1, output: 6316,  outCount: 1 },
    { stationKey: COOKING_KEY, input: 6361,  inCount: 1, output: 5095,  outCount: 1 },
    { stationKey: COOKING_KEY, input: 6362,  inCount: 1, output: 4594,  outCount: 1 },
    { stationKey: COOKING_KEY, input: 4603,  inCount: 1, output: 6887,  outCount: 1 },
    { stationKey: COOKING_KEY, input: 13758, inCount: 1, output: 13930, outCount: 1 },
    { stationKey: COOKING_KEY, input: 8365,  inCount: 1, output: 8364,  outCount: 1 },
    /* Кожевенный верстак: точные одно-компонентные рецепты из Spell.dbc. */
    { stationKey: LEATHERWORKING_KEY, input: 2934,  inCount: 3, output: 2318,  outCount: 1 }, // 2881: обрывки → лёгкая кожа
    { stationKey: LEATHERWORKING_KEY, input: 2318,  inCount: 4, output: 2319,  outCount: 1 }, // 20648: лёгкая → средняя
    { stationKey: LEATHERWORKING_KEY, input: 2319,  inCount: 5, output: 4234,  outCount: 1 }, // 20649: средняя → тяжёлая
    { stationKey: LEATHERWORKING_KEY, input: 4234,  inCount: 6, output: 4304,  outCount: 1 }, // 20650: тяжёлая → толстая
    { stationKey: LEATHERWORKING_KEY, input: 4304,  inCount: 6, output: 8170,  outCount: 1 }, // 22331: толстая → грубая
    { stationKey: LEATHERWORKING_KEY, input: 21887, inCount: 5, output: 23793, outCount: 1 }, // 32455: узловатая → тяжёлая узловатая
    { stationKey: LEATHERWORKING_KEY, input: 33567, inCount: 5, output: 33568, outCount: 1 }, // 64661: обрывки борейской → борейская
    { stationKey: LEATHERWORKING_KEY, input: 33568, inCount: 6, output: 38425, outCount: 1 }, // 50936: борейская → тяжёлая борейская
    /* Ткацкий станок: классические рулоны ткани. */
    { stationKey: LOOM_KEY, input: 2589,  inCount: 2, output: 2996,  outCount: 1 }, // 2963
    { stationKey: LOOM_KEY, input: 2592,  inCount: 3, output: 2997,  outCount: 1 }, // 2964
    { stationKey: LOOM_KEY, input: 4306,  inCount: 4, output: 4305,  outCount: 1 }, // 3839
    { stationKey: LOOM_KEY, input: 4338,  inCount: 4, output: 4339,  outCount: 1 }, // 3865
    { stationKey: LOOM_KEY, input: 14047, inCount: 4, output: 14048, outCount: 1 }, // 18401
    { stationKey: LOOM_KEY, input: 21877, inCount: 5, output: 21840, outCount: 1 }, // 26745
    { stationKey: LOOM_KEY, input: 33470, inCount: 5, output: 41510, outCount: 1 }, // 55899
    /* Стол начертателя: два пигмента → соответствующие чернила. */
    { stationKey: INSCRIPTION_KEY, input: 39151, inCount: 2, output: 39469, outCount: 1 }, // 52843
    { stationKey: INSCRIPTION_KEY, input: 39334, inCount: 2, output: 39774, outCount: 1 }, // 53462
    { stationKey: INSCRIPTION_KEY, input: 39338, inCount: 2, output: 43116, outCount: 1 }, // 57704
    { stationKey: INSCRIPTION_KEY, input: 39339, inCount: 2, output: 43118, outCount: 1 }, // 57707
    { stationKey: INSCRIPTION_KEY, input: 39340, inCount: 2, output: 43120, outCount: 1 }, // 57709
    { stationKey: INSCRIPTION_KEY, input: 39341, inCount: 2, output: 43122, outCount: 1 }, // 57711
    { stationKey: INSCRIPTION_KEY, input: 39342, inCount: 2, output: 43124, outCount: 1 }, // 57713
    { stationKey: INSCRIPTION_KEY, input: 39343, inCount: 2, output: 43126, outCount: 1 }, // 57715
    /* Точильный круг: одно-компонентные кузнечные рецепты точильных камней. */
    { stationKey: STONECUTTING_KEY, input: 2835,  inCount: 1, output: 2862,  outCount: 1 }, // 2660
    { stationKey: STONECUTTING_KEY, input: 2836,  inCount: 1, output: 2863,  outCount: 1 }, // 2665
    { stationKey: STONECUTTING_KEY, input: 2838,  inCount: 1, output: 2871,  outCount: 1 }, // 2674
    { stationKey: STONECUTTING_KEY, input: 7912,  inCount: 1, output: 7964,  outCount: 1 }, // 9918
    { stationKey: STONECUTTING_KEY, input: 12365, inCount: 1, output: 12404, outCount: 1 }, // 16641
    /* Инженерный станок: только рецепты с одним видом сырья. */
    { stationKey: ENGINEERING_KEY, input: 2835,  inCount: 1, output: 4357,  outCount: 1 }, // 3918: грубый порох
    { stationKey: ENGINEERING_KEY, input: 2840,  inCount: 1, output: 4359,  outCount: 1 }, // 3922: медные винты
    { stationKey: ENGINEERING_KEY, input: 2836,  inCount: 1, output: 4364,  outCount: 1 }, // 3929: простой порох
    { stationKey: ENGINEERING_KEY, input: 2838,  inCount: 1, output: 4377,  outCount: 1 }, // 3945: тяжёлый порох
    { stationKey: ENGINEERING_KEY, input: 7912,  inCount: 2, output: 10505, outCount: 1 }, // 12585: твёрдый порох
    { stationKey: ENGINEERING_KEY, input: 3860,  inCount: 3, output: 10559, outCount: 1 }, // 12589: мифриловая труба
    { stationKey: ENGINEERING_KEY, input: 12365, inCount: 2, output: 15992, outCount: 1 }, // 19788: концентрированный порох
    { stationKey: ENGINEERING_KEY, input: 12359, inCount: 6, output: 16000, outCount: 1 }, // 19795: ториевая труба
    { stationKey: ENGINEERING_KEY, input: 23445, inCount: 3, output: 23782, outCount: 1 }, // 30304: обшивка из осквернённого железа
    { stationKey: ENGINEERING_KEY, input: 23573, inCount: 3, output: 23785, outCount: 1 }, // 30307: закалённая адамантитовая труба
    /* Разделочный стол: проверенные рецепты готовки мяса 1:1. */
    { stationKey: BUTCHER_KEY, input: 2672,  inCount: 1, output: 2679,  outCount: 1 }, // 2538
    { stationKey: BUTCHER_KEY, input: 769,   inCount: 1, output: 2681,  outCount: 1 }, // 2540
    { stationKey: BUTCHER_KEY, input: 3730,  inCount: 1, output: 3726,  outCount: 1 }, // 3397
    { stationKey: BUTCHER_KEY, input: 12184, inCount: 1, output: 12210, outCount: 1 }, // 15855
    { stationKey: BUTCHER_KEY, input: 27678, inCount: 1, output: 27658, outCount: 1 }, // 33287
    { stationKey: BUTCHER_KEY, input: 43010, inCount: 1, output: 34750, outCount: 1 }, // 45551
    { stationKey: BUTCHER_KEY, input: 43012, inCount: 1, output: 34752, outCount: 1 }, // 45553
];

export function recipesFor(stationKey: number): ProcessRecipe[] {
    const out: ProcessRecipe[] = [];
    for (let i = 0; i < RECIPES.length; i++) {
        if (RECIPES[i].stationKey == stationKey) out.push(RECIPES[i]);
    }
    return out;
}

export function recipeByInput(stationKey: number, input: number): ProcessRecipe | undefined {
    for (let i = 0; i < RECIPES.length; i++) {
        if (RECIPES[i].stationKey == stationKey && RECIPES[i].input == input) return RECIPES[i];
    }
    return undefined;
}

/* Проксимити-баффы: рядом со СВОИМИ постройками этих ключей (livescript-таймер). */
export const HEARTH_KEYS = [6, 7];           // костёр, жаровня → «Тепло очага»
export const SHELTER_KEYS = [0, 1, 2, 5, 14, 15, 27, 32, 33, 46, 48, 49, 55, 56]; // жильё → «Кров»
export const HEARTH_RANGE = 8.0;
export const SHELTER_RANGE = 12.0;

/* ------------------------------ Каталог ------------------------------------ */
export interface Building {
    key: number;    // индекс в каталоге
    name: string;   // отображаемое имя в меню
    nameEn?: string;
    entry: number;  // gameobject_template.entry (или creature_template.entry для kind="npc"; 0 для service)
    kind?: "npc" | "service"; // npc = спавнится существо; service = мгновенная услуга (ничего не спавнит)
    hint?: string;  // подсказка/описание
    hintEn?: string;
}

export function buildingName(building: Building, russian: boolean): string {
    return russian ? building.name : (building.nameEn || building.name);
}

export function buildingHint(building: Building, russian: boolean): string {
    return russian ? (building.hint || "") : (building.hintEn || building.hint || "");
}

export const BUILDINGS: Building[] = [
    { key: 0,  name: "Палатка", nameEn: "Tent", entry: 184592, hint: "Stock Tent, display 7194." },
    { key: 1,  name: "Казарма", nameEn: "Barracks", entry: 19003, hint: "Stock Barracks, display 9004." },
    { key: 2,  name: "Таверна", nameEn: "Tavern", entry: 19367, hint: "Stock Tavern, display 9368." },
    { key: 3,  name: "Сторожевая башня", nameEn: "Watch Tower", entry: 19450, hint: "Stock Watch Tower, display 9450." },
    { key: 4,  name: "Орочья башня", nameEn: "Orc Tower", entry: 20812, hint: "Stock Orc Tower, display 629." },
    { key: 5,  name: "Будка", nameEn: "Doghouse", entry: 180033, hint: "Stock Doghouse, display 154." },
    { key: 6,  name: "Костёр", nameEn: "Campfire", entry: 1798, hint: "Stock Campfire, display 192." },
    { key: 7,  name: "Жаровня", nameEn: "Brazier", entry: 37089, hint: "Stock Brazier, display 602." },
    { key: 8,  name: "Кузница", nameEn: "Forge", entry: 1685, hint: "Stock Forge, display 209." },
    { key: 9,  name: "Наковальня", nameEn: "Anvil", entry: 1684, hint: "Stock Anvil, display 273." },
    { key: 10, name: "Бочка", nameEn: "Barrel", entry: 3658, hint: "Stock Barrel, display 334." },
    { key: 11, name: "Ящик припасов", nameEn: "Supply Crate", entry: 3710, hint: "Stock Food Crate, display 336." },
    { key: 12, name: "Кухонный стол", nameEn: "Cooking Table", entry: GO_COOKING_ENTRY, hint: "Готовит сырую рыбу оффлайн; улучшения ускоряют цикл и увеличивают партию.", hintEn: "Cooks raw fish offline; upgrades shorten the cycle and increase the batch." },
    { key: 13, name: "Бочонок эля", nameEn: "Ale Keg", entry: 3238, hint: "Stock Keg, display 319." },
    { key: 14, name: "NE Small House",       entry: 4000391, hint: "Patch building, display 99608." },
    { key: 15, name: "NE Inn",               entry: 4000400, hint: "Patch building, display 99599." },
    { key: 16, name: "NE Guard Tower",       entry: 4000404, hint: "Patch building, display 99595." },
    { key: 17, name: "NE Druid Tower",       entry: 4000408, hint: "Patch building, display 99591." },
    { key: 18, name: "NE Moonwell",          entry: 4000398, hint: "Patch building, display 99601." },
    { key: 19, name: "NE Gate",              entry: 4000387, hint: "Patch building, display 99612." },
    { key: 20, name: "BE Fence",             entry: 4000417, hint: "Patch wall, display 99582." },
    { key: 21, name: "Duskwood Gate",        entry: 4000511, hint: "Patch wall, display 99488." },
    { key: 22, name: "Duskwood Fence",       entry: 4000513, hint: "Patch wall, display 99486." },
    { key: 23, name: "Duskwood Fence Post",  entry: 4000514, hint: "Patch wall, display 99485." },
    { key: 24, name: "Duskwood Bridge",      entry: 4000515, hint: "Patch wall, display 99484." },
    { key: 25, name: "Burning Rope Bridge",  entry: 4000518, hint: "Patch bridge, display 99481." },
    { key: 26, name: "Stranglethorn Bridge", entry: 4000509, hint: "Patch bridge, display 99490." },
    { key: 27, name: "HU Gypsy Wagon",       entry: 4000516, hint: "Patch building, display 99483." },
    { key: 28, name: "Westfall Bed",         entry: 4000505, hint: "Patch interior, display 99494." },
    { key: 29, name: "Troll Fountain",       entry: 4000506, hint: "Patch decor, display 99493." },
    { key: 30, name: "Serpent Statue",       entry: 4000507, hint: "Patch decor, display 99492." },
    { key: 31, name: "Lothar Statue",        entry: 4000517, hint: "Patch decor, display 99482." },
    { key: 32, name: "SC Tent",              entry: 4002055, hint: "Patch camp, display 97944." },
    { key: 33, name: "SC Tent Variant",      entry: 4002056, hint: "Patch camp, display 97943." },
    { key: 34, name: "SC Wall",              entry: 4002073, hint: "Patch wall, display 97926." },
    { key: 35, name: "SC Wall Variant",      entry: 4002074, hint: "Patch wall, display 97925." },
    { key: 36, name: "SC Ramp",              entry: 4002076, hint: "Patch wall, display 97923." },
    { key: 37, name: "SC Trench",            entry: 4002059, hint: "Patch wall, display 97940." },
    { key: 38, name: "SC Broken Wagon",      entry: 4002072, hint: "Patch decor, display 97927." },
    { key: 39, name: "ND Orc Gate",          entry: 4002100, hint: "Patch wall, display 97899." },
    { key: 40, name: "ND Orc Wall",          entry: 4002102, hint: "Patch wall, display 97897." },
    { key: 41, name: "ND Orc Wall Large",    entry: 4002125, hint: "Patch wall, display 97874." },
    { key: 42, name: "ND Orc Forge",         entry: 4002108, hint: "Patch interior, display 97891." },
    { key: 43, name: "ND Orc Stables",       entry: 4002119, hint: "Patch interior, display 97880." },
    { key: 44, name: "ND Orc Tower",         entry: 4002120, hint: "Patch interior, display 97879." },
    { key: 45, name: "GOB Bridge",           entry: 4002133, hint: "Patch interior, display 97866." },
    { key: 46, name: "TS Hut",               entry: 4002143, hint: "Patch interior, display 97856." },
    { key: 47, name: "SW Lighthouse",        entry: 4002153, hint: "Patch interior, display 97846." },
    { key: 48, name: "Людская казарма", nameEn: "Human Barracks", entry: 4000008, hint: "Patch building, Human barracks." },
    { key: 49, name: "Двухэтажный дом", nameEn: "Two-Story House", entry: 4000010, hint: "Patch building, Human two-story house." },
    { key: 50, name: "Крепостная стена", nameEn: "Keep Wall", entry: 4000011, hint: "Patch wall, Keep wall." },
    { key: 51, name: "Столб крепостной стены", nameEn: "Keep Wall Post", entry: 4000013, hint: "Patch wall, Keep wall post." },
    { key: 52, name: "Крепостные ворота", nameEn: "Keep Gate", entry: 4000029, hint: "Patch wall, Keep wall gate." },
    { key: 53, name: "Людские стойла", nameEn: "Human Stables", entry: 4000034, hint: "Patch building, Human stable." },
    { key: 54, name: "Лесопилка", nameEn: "Lumber Mill", entry: 4000035, hint: "Patch building, Human lumber mill." },
    { key: 55, name: "Орочья нора", nameEn: "Orc Burrow", entry: 4000120, hint: "Patch building, Orc burrow." },
    { key: 56, name: "Большая тролльская хижина", nameEn: "Large Troll Hut", entry: 4000127, hint: "Patch building, Troll big hut." },
    /* -------- функциональные постройки (июль 2026) -------- */
    { key: 57, name: "Почтовый ящик", nameEn: "Mailbox", entry: 32349, hint: "Рабочая почта, display 1947.", hintEn: "Working mailbox, display 1947." },
    { key: 58, name: "Камень встреч", nameEn: "Meeting Stone", entry: 178824, hint: "Ритуал призыва согруппников, display 5491.", hintEn: "Summons party members through a ritual, display 5491." },
    { key: 59, name: "Личный сейф", nameEn: "Personal Vault", entry: GO_SAFE_ENTRY, hint: "Клик открывает ваш банк.", hintEn: "Click to open your bank." },
    { key: 60, name: "Бочка питьевой воды", nameEn: "Drinking Water Barrel", entry: GO_WATER_ENTRY, hint: "Клик утоляет жажду (раз в минуту).", hintEn: "Click to quench thirst (once per minute)." },
    { key: 61, name: "Котёл с похлёбкой", nameEn: "Stew Cauldron", entry: GO_FOOD_ENTRY, hint: "Клик утоляет голод (раз в минуту).", hintEn: "Click to satisfy hunger (once per minute)." },
    { key: 62, name: "Аукционист", nameEn: "Auctioneer", entry: 8661, kind: "npc", hint: "Auctioneer Beardo, нейтральный аукцион.", hintEn: "Auctioneer Beardo, neutral auction house." },
    { key: 63, name: "Трактирщик", nameEn: "Innkeeper", entry: 7733, kind: "npc", hint: "Fizzgrimble: привязка камня + еда и напитки.", hintEn: "Fizzgrimble: hearthstone binding, food, and drinks." },
    { key: 64, name: "Ремонтник", nameEn: "Repair Vendor", entry: 8129, kind: "npc", hint: "Wrinkle Goodsteel: ремонт и товары.", hintEn: "Wrinkle Goodsteel: repairs and goods." },
    { key: 65, name: "Учитель: кузнечное дело", nameEn: "Trainer: Blacksmithing", entry: 28694, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 66, name: "Учитель: портняжное дело", nameEn: "Trainer: Tailoring", entry: 28699, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 67, name: "Учитель: кожевничество", nameEn: "Trainer: Leatherworking", entry: 28700, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 68, name: "Учитель: наложение чар", nameEn: "Trainer: Enchanting", entry: 28693, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 69, name: "Учитель: начертание", nameEn: "Trainer: Inscription", entry: 28702, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 70, name: "Учитель: ювелирное дело", nameEn: "Trainer: Jewelcrafting", entry: 28701, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 71, name: "Учитель: инженерное дело", nameEn: "Trainer: Engineering", entry: 28697, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 72, name: "Учитель: горное дело", nameEn: "Trainer: Mining", entry: 28698, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 73, name: "Учитель: травничество", nameEn: "Trainer: Herbalism", entry: 28704, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 74, name: "Учитель: снятие шкур", nameEn: "Trainer: Skinning", entry: 28696, kind: "npc", hint: "Grand Master, Даларан.", hintEn: "Grand Master, Dalaran." },
    { key: 75, name: "Медная жила (старое сохранение)", nameEn: "Copper Vein (Legacy Save)", entry: GO_MINE_ENTRY, hint: "Совместима с генератором медной руды: созревание 30 минут, личная добыча 3 секунды.", hintEn: "Compatible with the Copper Ore Generator: 30-minute growth and a personal 3-second harvest." },
    { key: 76, name: "Мироцвет (старое сохранение)", nameEn: "Peacebloom (Legacy Save)", entry: GO_GARDEN_ENTRY, hint: "Совместим с генератором мироцвета: созревание 30 минут, личный сбор 3 секунды.", hintEn: "Compatible with the Peacebloom Generator: 30-minute growth and a personal 3-second harvest." },
    { key: 77, name: "Улучшение базы", nameEn: "Base Upgrade", entry: 0, kind: "service", hint: "Мгновенно: радиус 25→35→45 ярдов, лимит построек 30→45→60.", hintEn: "Instant: radius 25→35→45 yards, building limit 30→45→60." },
    { key: 78, name: "Стражник базы", nameEn: "Base Guard", entry: 9460, kind: "npc", hint: "Вышибала уровня владельца+2; сам атакует налётчиков.", hintEn: "A brawler at owner level +2 who attacks raiders automatically." },
    { key: 79, name: "Стрелок базы", nameEn: "Base Archer", entry: 11190, kind: "npc", hint: "Стрелок уровня владельца+2; бьёт налётчиков издали.", hintEn: "An archer at owner level +2 who attacks raiders from range." },
    { key: 80, name: "Боевое знамя", nameEn: "Battle Banner", entry: GO_BANNER_ENTRY, hint: "Рядом со знаменем — «Боевой дух»: +10% к урону.", hintEn: "Grants Battle Spirit near the banner: +10% damage." },
    { key: 81, name: "Целитель базы", nameEn: "Base Healer", entry: 14393, kind: "npc", hint: "Жрец уровня владельца+2; каждые 5 секунд лечит самого раненого защитника или владельца.", hintEn: "A priest at owner level +2 who heals the most wounded defender or owner every 5 seconds." },
    /* -------- хранилище и переработка (июль 2026) -------- */
    { key: STORAGE_KEY, name: "Склад материалов", nameEn: "Material Warehouse", entry: GO_STORAGE_ENTRY, hint: "Хранит до 24 видов обычных предметов. Экипировка, квестовые и сотворённые предметы не принимаются.", hintEn: "Stores up to 24 types of ordinary items. Equipment, quest, and conjured items are not accepted." },
    { key: SMELTER_KEY, name: "Плавильня", nameEn: "Smelter", entry: GO_SMELTER_ENTRY, hint: "Переплавляет руду оффлайн; улучшения ускоряют цикл и увеличивают партию.", hintEn: "Smelts ore offline; upgrades shorten the cycle and increase the batch." },
    { key: LAB_KEY, name: "Алхимический стол", nameEn: "Alchemy Table", entry: GO_LAB_ENTRY, hint: "Варит зелья из трав оффлайн; улучшения ускоряют цикл и увеличивают партию.", hintEn: "Brews potions from herbs offline; upgrades shorten the cycle and increase the batch." },
    { key: LEATHERWORKING_KEY, name: "Дубильный верстак", nameEn: "Tanning Bench", entry: GO_LEATHERWORKING_ENTRY, hint: "Перерабатывает кожу следующего тира оффлайн.", hintEn: "Processes leather into the next tier offline." },
    { key: LOOM_KEY, name: "Ткацкий станок", nameEn: "Loom", entry: GO_LOOM_ENTRY, hint: "Сворачивает ткань в рулоны оффлайн.", hintEn: "Turns cloth into bolts offline." },
    { key: INSCRIPTION_KEY, name: "Стол начертателя", nameEn: "Scribe's Table", entry: GO_INSCRIPTION_ENTRY, hint: "Изготавливает чернила из пигментов оффлайн.", hintEn: "Makes inks from pigments offline." },
    { key: STONECUTTING_KEY, name: "Точильный круг", nameEn: "Grinding Wheel", entry: GO_STONECUTTING_ENTRY, hint: "Изготавливает точильные камни оффлайн.", hintEn: "Makes sharpening stones offline." },
    { key: ENGINEERING_KEY, name: "Инженерный станок", nameEn: "Engineering Workbench", entry: GO_ENGINEERING_ENTRY, hint: "Изготавливает порох, трубы и детали оффлайн.", hintEn: "Makes blasting powder, tubes, and parts offline." },
    { key: BUTCHER_KEY, name: "Разделочный стол", nameEn: "Butcher's Table", entry: GO_BUTCHER_ENTRY, hint: "Готовит сырое мясо оффлайн.", hintEn: "Cooks raw meat offline." },
    { key: TRAINING_DUMMY_KEY, name: "Тренировочный манекен", nameEn: "Training Dummy", entry: 31143, kind: "npc", hint: "Не получает урон и завершает бой через 5 секунд без атак — удобно проверять сборку и проки.", hintEn: "Takes no damage and ends combat after 5 seconds without attacks, useful for testing builds and procs." },
    { key: RESTORATION_ALTAR_KEY, name: "Алтарь восстановления", nameEn: "Restoration Altar", entry: GO_RESTORATION_ALTAR_ENTRY, hint: "Вне боя полностью восстанавливает здоровье и текущий ресурс владельца. Перезарядка: 5 минут.", hintEn: "Fully restores the owner's health and current resource out of combat. Cooldown: 5 minutes." },
    { key: LEATHER_ARMOR_KEY, name: "Кожевенная мастерская", nameEn: "Leather Armor Workshop", entry: GO_LEATHER_ARMOR_ENTRY, hint: "Создаёт случайную кожаную броню из доминирующего материала самого высокого доступного уровня.", hintEn: "Creates random leather armor from the highest-tier dominant material available." },
    { key: PLATE_ARMOR_KEY, name: "Латная мастерская", nameEn: "Metal Armor Workshop", entry: GO_PLATE_ARMOR_ENTRY, hint: "Создаёт случайную кольчужную или латную броню из лучшего заложенного металла.", hintEn: "Creates random mail or plate armor from the best deposited metal." },
    { key: CLOTH_ARMOR_KEY, name: "Портняжная мастерская", nameEn: "Tailoring Workshop", entry: GO_CLOTH_ARMOR_ENTRY, hint: "Создаёт случайную тканевую броню. Обычный ткацкий станок по-прежнему делает рулоны.", hintEn: "Creates random cloth armor. The regular loom still makes bolts." },
    { key: WEAPON_FORGE_KEY, name: "Оружейная кузница", nameEn: "Weapon Forge", entry: GO_WEAPON_FORGE_ENTRY, hint: "Создаёт оружие любого типа; цикл вдвое дольше, чем у остальных мастерских.", hintEn: "Creates weapons of any type; its cycle is twice as long as other workshops." },
    { key: JEWELRY_KEY, name: "Ювелирная мастерская", nameEn: "Jewelry Workshop", entry: GO_JEWELRY_ENTRY, hint: "Создаёт случайное кольцо, ожерелье или другое доступное украшение.", hintEn: "Creates a random ring, necklace, or other available piece of jewelry." },
    { key: ORDERS_BOARD_KEY, name: "Доска заказов", nameEn: "Order Board", entry: GO_ORDERS_BOARD_ENTRY, hint: "Три задания пяти уровней: материалы, изготовление предмета или охота. Награда — деньги и случайный камень способности.", hintEn: "Three jobs across five tiers: materials, crafting, or hunting. Reward: money and a random ability gem." },
    /* -------- дополнительные службы (keys 100..105) -------- */
    { key: HEALING_DUMMY_KEY, name: "Манекен лекаря", nameEn: "Healer's Training Dummy", entry: 0, kind: "npc", hint: "Дружелюбная цель на 50% здоровья для проверки прямого лечения, HoT и лечебных проков. Лимит: 1.", hintEn: "A friendly target at 50% health for testing direct heals, HoTs, and healing procs. Limit: 1." },
    { key: CLEANSING_FONT_KEY, name: "Купель очищения", nameEn: "Cleansing Font", entry: 0, hint: "Вне боя снимает по одному яду, болезни и проклятию владельца. Перезарядка: 5 минут. Лимит: 1.", hintEn: "Out of combat, removes one poison, disease, and curse from the owner. Cooldown: 5 minutes. Limit: 1." },
    { key: REPAIR_STATION_KEY, name: "Ремонтная стойка", nameEn: "Repair Rack", entry: 0, hint: "Вне боя бесплатно чинит всю экипировку владельца. Перезарядка: 15 минут. Лимит: 1.", hintEn: "Repairs all of the owner's equipment for free out of combat. Cooldown: 15 minutes. Limit: 1." },
    { key: CAPITAL_PORTAL_KEY, name: "Навигационный портал", nameEn: "Navigation Portal", entry: 0, hint: "Отправляет владельца в столицу своей фракции, Шаттрат или Даларан. Перезарядка: 30 минут. Лимит: 1.", hintEn: "Sends the owner to a faction capital, Shattrath, or Dalaran. Cooldown: 30 minutes. Limit: 1." },
    { key: BASE_HERALD_KEY, name: "Геральдист базы", nameEn: "Base Herald", entry: 0, kind: "npc", hint: "Нейтральный оформитель гильдейских гербовых накидок. Лимит: 1.", hintEn: "A neutral guild tabard designer. Limit: 1." },
    { key: TACTICAL_TABLE_KEY, name: "Тактический стол", nameEn: "Tactical Table", entry: 0, hint: "Показывает состояние базы и запускает учебный набег без награды и разграбления. Лимит: 1.", hintEn: "Shows base status and starts a practice raid without rewards or pillaging. Limit: 1." },
    { key: ECHO_VENDOR_KEY, name: "Торговец Эхо", nameEn: "Echo Vendor", entry: 0, kind: "npc", hint: "Продаёт Кристалл Эхо и Кристалл забвения. Лимит: 1.", hintEn: "Sells Echo Crystals and Crystals of Oblivion. Limit: 1." },
    /* -------- дополнительная оборона (keys 106..111) -------- */
    { key: SHIELDBEARER_KEY, name: "Щитоносец базы", nameEn: "Base Shieldbearer", entry: 0, kind: "npc", hint: "Тяжёлый защитник с повышенным здоровьем и бронёй; перехватывает налётчиков. Лимит: 1.", hintEn: "A heavy defender with increased health and armor who intercepts raiders. Limit: 1." },
    { key: BATTLE_MAGE_KEY, name: "Боевой маг базы", nameEn: "Base Battle Mage", entry: 0, kind: "npc", hint: "Во время набега поражает тайной магией до трёх налётчиков каждые 10 секунд. Лимит: 1.", hintEn: "During raids, strikes up to three raiders with Arcane magic every 10 seconds. Limit: 1." },
    { key: BALLISTA_KEY, name: "Баллиста базы", nameEn: "Base Ballista", entry: 0, kind: "npc", hint: "Стационарное орудие стреляет по налётчикам в 40 ярдах каждые 5 секунд. Лимит: 2.", hintEn: "A stationary weapon that fires at raiders within 40 yards every 5 seconds. Limit: 2." },
    { key: FROST_TRAP_KEY, name: "Морозный капкан", nameEn: "Frost Trap", entry: 0, hint: "Во время набега замедляет налётчиков в 10 ярдах на 30%. Лимит: 2.", hintEn: "During raids, slows raiders within 10 yards by 30%. Limit: 2." },
    { key: RUNIC_OBELISK_KEY, name: "Рунный обелиск", nameEn: "Runic Obelisk", entry: 0, hint: "Во время набега снижает получаемый владельцем и защитниками урон на 10% в радиусе 15 ярдов. Лимит: 1.", hintEn: "During raids, reduces damage taken by the owner and defenders within 15 yards by 10%. Limit: 1." },
    { key: WATCH_GONG_KEY, name: "Дозорный гонг", nameEn: "Watch Gong", entry: 0, hint: "Удваивает предупреждение об обычном набеге с 20 до 40 секунд и заранее сообщает размер волны. Лимит: 1.", hintEn: "Doubles the normal raid warning from 20 to 40 seconds and announces the wave size in advance. Limit: 1." },
    ...RESOURCE_GENERATORS.map(def => ({
        key: def.key,
        name: def.nameRu,
        nameEn: def.nameEn,
        entry: def.entry,
        hint: def.nativeFishing
            ? `Размещайте у доступной для заброса воды; требует активной рыбалки. Стоимость: 40 × ${def.cost.item.nameRu}.`
            : `Созревает за 30 минут; сбор занимает 3 секунды. Стоимость: 40 × ${def.cost.item.nameRu}.`,
        hintEn: def.nativeFishing
            ? `Place near water within casting reach; requires active fishing. Cost: 40 × ${def.cost.item.nameEn}.`
            : `Matures in 30 minutes; gathering takes 3 seconds. Cost: 40 × ${def.cost.item.nameEn}.`,
    })),
];

/** Числовые ID приватных GO известны только после build data. */
export function setDynamicBuildingEntries(
    leatherArmor: number,
    plateArmor: number,
    clothArmor: number,
    weaponForge: number,
    jewelry: number,
    ordersBoard: number,
): void {
    GO_LEATHER_ARMOR_ENTRY = leatherArmor;
    GO_PLATE_ARMOR_ENTRY = plateArmor;
    GO_CLOTH_ARMOR_ENTRY = clothArmor;
    GO_WEAPON_FORGE_ENTRY = weaponForge;
    GO_JEWELRY_ENTRY = jewelry;
    GO_ORDERS_BOARD_ENTRY = ordersBoard;
    const values = [leatherArmor, plateArmor, clothArmor, weaponForge, jewelry, ordersBoard];
    const keys = [LEATHER_ARMOR_KEY, PLATE_ARMOR_KEY, CLOTH_ARMOR_KEY, WEAPON_FORGE_KEY, JEWELRY_KEY, ORDERS_BOARD_KEY];
    for (let i = 0; i < keys.length; i++) {
        const building = buildingByKey(keys[i]);
        if (building) building.entry = values[i];
    }
}

/** После build data livescript передаёт generated IDs приватных templates
 * расширения. Addon оставляет entry=0 и показывает карточки по иконкам. */
export function setExpansionBuildingEntries(entries: number[]): void {
    const keys = SERVICE_EXPANSION_KEYS.concat(DEFENSE_EXPANSION_KEYS);
    for (let i = 0; i < keys.length && i < entries.length; i++) {
        const building = buildingByKey(keys[i]);
        if (building) building.entry = entries[i];
    }
}

export function buildingByKey(key: number): Building | undefined {
    for (let i = 0; i < BUILDINGS.length; i++) {
        if (BUILDINGS[i].key == key) return BUILDINGS[i];
    }
    return undefined;
}

/** После UTAG-гидрации переносит generated GO IDs в общий строительный каталог. */
export function syncResourceGeneratorBuildingEntries(): void {
    for (let i = 0; i < RESOURCE_GENERATORS.length; i++) {
        const building = buildingByKey(RESOURCE_GENERATORS[i].key);
        if (building) building.entry = RESOURCE_GENERATORS[i].entry;
    }
}

/** Каталожные GO, которые служат только декором и не должны принимать клики. */
export function isDecorativeBuildingKey(key: number): boolean {
    return (key >= 0 && key <= 11) || (key >= 13 && key <= 56);
}

/** Функциональные защитные GO без клика: видимы, но должны оставаться
 * невыбираемыми и обслуживаются только raid pump. */
export function isInertDefenseBuildingKey(key: number): boolean {
    return key == FROST_TRAP_KEY || key == RUNIC_OBELISK_KEY || key == WATCH_GONG_KEY;
}

/** Сервер и addon используют один и тот же рецепт; золото при строительстве не требуется. */
export function buildingMaterialCost(key: number): BuildingMaterial[] {
    const generator = resourceGeneratorByKey(key);
    if (generator) {
        return [{
            name: generator.cost.item.nameRu,
            nameEn: generator.cost.item.nameEn,
            entries: [generator.cost.item.entry],
            count: generator.cost.count,
        }];
    }
    if (isDecorativeBuildingKey(key)) return DECORATION_MATERIAL_COST;
    if (key == 12 || key == 60 || key == 61) return [stone(10), herb(10)]; // кухня / припасы
    if (key == 57) return [ore(10), wood(5)];                              // почта
    if (key == 58) return [stone(15), herb(10)];                           // камень встреч
    if (key == 59 || key == 64) return [ore(20), wood(10)];                // сейф / ремонтник
    if (key == 62) return [ore(10), cloth(15)];                            // аукционист
    if (key == 63) return [cloth(10), herb(10)];                           // трактирщик
    if (key >= 65 && key <= 74) return [cloth(10), stone(10)];             // учителя
    if (key == UPGRADE_KEY) return [ore(20), stone(20), wood(10)];
    if (key == 78) return [ore(15), leather(10)];                          // стражник
    if (key == 79) return [ore(10), leather(5), cloth(5)];                 // стрелок
    if (key == 80) return [cloth(10), herb(10)];                           // знамя
    if (key == 81) return [cloth(10), herb(15)];                           // целитель
    if (key == STORAGE_KEY) return [stone(15), wood(10)];
    if (key == SMELTER_KEY) return [ore(20), stone(10), wood(5)];
    if (key == LAB_KEY) return [stone(10), herb(15)];
    if (key == LEATHERWORKING_KEY) return [stone(10), leather(10)];
    if (key == LOOM_KEY) return [wood(10), cloth(10)];
    if (key == INSCRIPTION_KEY) return [cloth(10), herb(15)];
    if (key == STONECUTTING_KEY) return [stone(20), ore(10)];
    if (key == ENGINEERING_KEY) return [ore(25), stone(10), wood(10)];
    if (key == BUTCHER_KEY) return [stone(10), leather(5)];
    if (key == TRAINING_DUMMY_KEY) return [wood(10), cloth(10)];
    if (key == RESTORATION_ALTAR_KEY) return [stone(15), herb(15)];
    if (key == LEATHER_ARMOR_KEY) return [stone(10), leather(20)];
    if (key == PLATE_ARMOR_KEY) return [ore(25), stone(15)];
    if (key == CLOTH_ARMOR_KEY) return [wood(10), cloth(20)];
    if (key == WEAPON_FORGE_KEY) return [ore(30), stone(10), wood(15)];
    if (key == JEWELRY_KEY) return [ore(20), stone(10)];
    if (key == ORDERS_BOARD_KEY) return [wood(15), cloth(5)];
    if (key == HEALING_DUMMY_KEY) return [wood(10), cloth(15), herb(5)];
    if (key == CLEANSING_FONT_KEY) return [stone(15), herb(20)];
    if (key == REPAIR_STATION_KEY) return [ore(20), wood(10)];
    if (key == CAPITAL_PORTAL_KEY) return [stone(25), cloth(10), herb(10)];
    if (key == BASE_HERALD_KEY || key == ECHO_VENDOR_KEY) return [cloth(15), ore(10)];
    if (key == TACTICAL_TABLE_KEY) return [wood(15), cloth(10), stone(5)];
    if (key == SHIELDBEARER_KEY) return [ore(20), leather(15), stone(10)];
    if (key == BATTLE_MAGE_KEY) return [cloth(20), herb(20), stone(5)];
    if (key == BALLISTA_KEY) return [ore(25), wood(20), leather(10)];
    if (key == FROST_TRAP_KEY) return [ore(10), leather(10), herb(10)];
    if (key == RUNIC_OBELISK_KEY) return [stone(20), herb(20), cloth(10)];
    if (key == WATCH_GONG_KEY) return [wood(15), ore(10)];
    return [];
}

export function materialCostText(cost: BuildingMaterial[], russian: boolean = true): string {
    let text = "";
    for (let i = 0; i < cost.length; i++) {
        if (i > 0) text += " + ";
        text += `${cost[i].count} × ${russian ? cost[i].name : cost[i].nameEn}`;
    }
    return text;
}

/** I→II стоит как постройка станции, II→III — вдвое дороже. */
export function stationUpgradeMaterialCost(stationKey: number, currentLevel: number): BuildingMaterial[] {
    if (currentLevel < 0 || currentLevel >= STATION_MAX_LEVEL) return [];
    const base = buildingMaterialCost(stationKey);
    const multiplier = currentLevel + 1;
    const result: BuildingMaterial[] = [];
    for (let i = 0; i < base.length; i++) {
        result.push({
            name: base[i].name,
            nameEn: base[i].nameEn,
            entries: base[i].entries,
            count: base[i].count * multiplier,
        });
    }
    return result;
}
