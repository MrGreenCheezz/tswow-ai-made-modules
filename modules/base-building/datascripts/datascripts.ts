/**
 * Base-building — datascripts.
 *
 * Создаёт ground-target spell флага, отдельный spell для каждой каталожной
 * постройки и отдельные spell/item с точным ghost-preview для каждого объекта patch-каталога. Livescript
 * сохраняет постоянный GO только после серверных проверок территории и лимита.
 *
 * Имена задаются на enGB и ruRU. Значения-литералы флага и legacy-spell должны
 * совпадать с shared/BaseCatalog.ts.
 */

import { SQL, std } from "wow/wotlk";
import { PATCH_BUILDING_ENTRIES } from "./PatchBuildingEntries";
import { increaseVanillaResourceDensity } from "./resource-density";
import {
    LEATHER_ARMOR_STATION, PLATE_ARMOR_STATION, CLOTH_ARMOR_STATION,
    WEAPON_FORGE_STATION, JEWELRY_STATION,
} from "./production-stations";
import { ORDER_BOARD_TEMPLATE } from "./orders";
import {
    BASE_HEALING_DUMMY, BASE_CLEANSING_FONT, BASE_REPAIR_STATION,
    BASE_CAPITAL_PORTAL, BASE_HERALD, BASE_TACTICAL_TABLE,
    BASE_SHIELDBEARER, BASE_BATTLE_MAGE, BASE_BALLISTA,
    BASE_FROST_TRAP, BASE_RUNIC_BULWARK, BASE_WATCH_GONG,
} from "./functional-buildings";
import "./patch-buildings";
import "./woodcutting";
import "./resource-generators";

increaseVanillaResourceDensity();

// --- держать синхронно с shared/BaseCatalog.ts ---
const MODNAME = "base-building";
const TAG_PLACE = "base-place-spell";
const TAG_FLAG = "base-flag-spell";
const TAG_FLAG_ITEM = "base-flag-item";
const TAG_PATCH_ITEM = "base-patch-item";
const TAG_PATCH_PREVIEW_SPELLS = "base-patch-preview-spells";
const TAG_PATCH_PREVIEW_ITEMS = "base-patch-preview-items";
const PLACE_SPELL_NAME_EN = "Base Construction";
const PLACE_SPELL_NAME_RU = "Строительство базы";
const FLAG_SPELL_NAME_EN = "Base Flag";
const FLAG_SPELL_NAME_RU = "Флаг базы";
const FLAG_ENTRY = 192252;
const HORDE_FLAG_ENTRY = 192253;
const FLAG_TOOLTIP_NAME = "Alliance Banner";
const HORDE_FLAG_TOOLTIP_NAME = "Horde Banner";
const FLAG_INTERACTION_BASE = 93; // type=GENERIC, Data0=1, Data1=1: visible tooltip/highlight without GM
// переиспользованные незаспавненные GO-шаблоны (держать синхронно с BaseCatalog.ts)
const GO_SAFE_ENTRY = 2130;
const GO_WATER_ENTRY = 2131;
const GO_FOOD_ENTRY = 2148;
const GO_MINE_ENTRY = 2149;
const GO_GARDEN_ENTRY = 1670;
const GO_BANNER_ENTRY = 1729;
const GO_STORAGE_ENTRY = 2696; // «Склад материалов» (бывш. Bucket 001)
const GO_SMELTER_ENTRY = 2692; // «Плавильня» (бывш. Bottle 002)
const GO_LAB_ENTRY = 2686;     // «Алхимический стол» (бывш. Apothecary Table)
const GO_COOKING_ENTRY = 12665; // «Кухонный стол» (stock Cooking Table)
const GO_LEATHERWORKING_ENTRY = 2693;
const GO_LOOM_ENTRY = 2694;
const GO_INSCRIPTION_ENTRY = 2697;
const GO_STONECUTTING_ENTRY = 2698;
const GO_ENGINEERING_ENTRY = 2699;
const GO_BUTCHER_ENTRY = 2333;
const GO_RESTORATION_ALTAR_ENTRY = 190741;

// Флаг использует профиль наведения 95018. Постройки ниже используют профиль
// 61031: его TRANS_DOOR даёт клиенту предпросмотр конкретного GameObject.
// Livescript отменяет штатный эффект после каста и создаёт независимый GO базы.
const GROUND_TARGET_BASE = 48467;
const BUILDING_PREVIEW_BASE = 61031;

function clearGameObjectData(go: any) {
    for (let i = 0; i <= 23; i++) {
        go[`Data${i}`].set(0);
    }
}

/** Dedicated copies keep base decoration inert without changing stock world GO. */
function makeStockDecoration(key: number, nameEn: string, nameRu: string, parent: number) {
    const go = std.GameObjectTemplates.Generic.create(MODNAME, `base-decoration-${key}`, parent);
    // MAP_OBJECT is static map geometry and the 3.3.5 client does not render it
    // when spawned dynamically. An empty TRAP is visible but has no interaction.
    go.Type.TRAP.set();
    clearGameObjectData(go);
    go.Faction.set(0);
    go.Flags.set(0);
    go.Name.enGB.set(nameEn);
    go.Name.ruRU.set(nameRu);
    go.Tags.addUnique(MODNAME, `go/base-decoration-${key}`);
    return go;
}

function makeGroundSpell(id: string, nameEn: string, nameRu: string, tag: string) {
    const spl = std.Spells.create(MODNAME, id, GROUND_TARGET_BASE);
    spl.Name.enGB.set(nameEn);
    spl.Name.ruRU.set(nameRu);
    spl.Description.enGB.set(nameEn);
    spl.Description.ruRU.set(nameRu);

    // Профиль наведения и каста повторяет рабочий spell 95018.
    spl.Attributes.clearAll();
    spl.row.ShapeshiftMask.set(BigInt(0));
    spl.row.ShapeshiftExclude.set(BigInt(0));
    spl.TargetType.clearAll();
    spl.TargetType.DEST_LOCATION.set(true);
    spl.Effects.clearAll();
    spl.Effects.addGet()
        .Type.SCRIPT_EFFECT.set()
        .ImplicitTargetA.DEST_DEST.set();
    spl.CastTime.set(1);
    spl.Duration.set(32);
    spl.Range.set(3);
    spl.Speed.set(0);
    spl.Icon.set(353);
    spl.ActiveIcon.set(353);
    spl.Tags.add(MODNAME, tag);
    return spl;
}

const patchSpell = makeGroundSpell("place-spell", PLACE_SPELL_NAME_EN, PLACE_SPELL_NAME_RU, TAG_PLACE);
patchSpell.Range.set(12); // тот же радиус выбора точки, что у обычных строительных чертежей
const flagSpell = makeGroundSpell("flag-spell", FLAG_SPELL_NAME_EN, FLAG_SPELL_NAME_RU, TAG_FLAG);

interface ToolBuilding {
    key: number;
    name: string;
    nameEn?: string;
    entry: number;
    preview?: number; // GO-шаблон для ghost-preview (нужен NPC-постройкам: их entry — креатура)
}

// Ghost-preview для NPC-построек: клиенту нужен ВАЛИДНЫЙ GO-шаблон в TRANS_DOOR.
const NPC_PREVIEW_ENTRY = 1798; // костёр

function makeBaseGuard(id: string, nameEn: string, nameRu: string, parent: number, tag: string) {
    const guard = std.CreatureTemplates.create(MODNAME, id, parent);
    guard.Name.enGB.set(nameEn);
    guard.Name.ruRU.set(nameRu);
    guard.Subname.enGB.set("Base Defender");
    guard.Subname.ruRU.set("Защитник владения");
    guard.NPCFlags.clearAll();
    guard.UnitFlags.clearAll();
    guard.FlagsExtra.clearAll();
    guard.FlagsExtra.NO_XP.set(true);
    guard.FactionTemplate.set(1665);
    guard.AIName.AggressorAI();
    guard.Level.set(1, 1);
    guard.Stats.set(1.5, 1, 1, 1, 1);
    guard.row.ScriptName.set("");
    guard.row.lootid.set(0);
    guard.row.pickpocketloot.set(0);
    guard.row.skinloot.set(0);
    guard.Tags.addUnique(MODNAME, tag);
    return guard;
}

const BASE_GUARD = makeBaseGuard("base-guard", "Base Guard", "Страж базы", 9460, "npc/base-guard");
BASE_GUARD.Weapons.add(2809);

const BASE_ARCHER = makeBaseGuard("base-archer", "Base Archer", "Стрелок базы", 11190, "npc/base-archer");
BASE_ARCHER.Weapons.add(5291, 11586, 2552);
BASE_ARCHER.AIName.set("ArcherAI");
const archerSpell = SQL.creature_template_spell.query({ CreatureID: BASE_ARCHER.ID, Index: 0 });
if (archerSpell) {
    archerSpell.Spell.set(6660); // Shoot: ArcherAI сам держит дистанцию и повторяет выстрелы
} else {
    SQL.creature_template_spell.add(BASE_ARCHER.ID, 0, { Spell: 6660, VerifiedBuild: 0 });
}

const BASE_HEALER = makeBaseGuard("base-healer", "Base Healer", "Целитель базы", 14393, "npc/base-healer");
BASE_HEALER.Weapons.add(2809);

// Stock AI `npc_training_dummy` обнуляет входящий урон и сам снимает combat
// с атакующего спустя 5 секунд без новых попаданий. Клонируем шаблон, чтобы
// имя и отсутствие наград оставались частью воспроизводимого модуля.
const BASE_TRAINING_DUMMY = std.CreatureTemplates.create(MODNAME, "base-training-dummy", 31143);
BASE_TRAINING_DUMMY.Name.enGB.set("Training Dummy");
BASE_TRAINING_DUMMY.Name.ruRU.set("Тренировочный манекен");
BASE_TRAINING_DUMMY.Subname.enGB.set("Damage and Effect Testing");
BASE_TRAINING_DUMMY.Subname.ruRU.set("Проверка урона и эффектов");
BASE_TRAINING_DUMMY.NPCFlags.clearAll();
BASE_TRAINING_DUMMY.FlagsExtra.NO_XP.set(true);
BASE_TRAINING_DUMMY.FactionTemplate.set(7);
BASE_TRAINING_DUMMY.row.ScriptName.set("npc_training_dummy");
BASE_TRAINING_DUMMY.row.lootid.set(0);
BASE_TRAINING_DUMMY.row.pickpocketloot.set(0);
BASE_TRAINING_DUMMY.row.skinloot.set(0);
BASE_TRAINING_DUMMY.Tags.addUnique(MODNAME, "npc/base-training-dummy");

// These entries also exist in the stock world. Use private inert TRAP clones so
// changing base decoration cannot disable real anvils, forges, campfires, etc.
const STOCK_DECORATION_ENTRIES: { [key: number]: number } = {};
[
    [0, "Tent", "Палатка", 184592],
    [1, "Barracks", "Казарма", 19003],
    [2, "Tavern", "Таверна", 19367],
    [3, "Watch Tower", "Сторожевая башня", 19450],
    [4, "Orc Tower", "Орочья башня", 20812],
    [5, "Doghouse", "Будка", 180033],
    [6, "Campfire", "Костёр", 1798],
    [7, "Brazier", "Жаровня", 37089],
    [8, "Forge", "Кузница", 1685],
    [9, "Anvil", "Наковальня", 1684],
    [10, "Barrel", "Бочка", 3658],
    [11, "Supply Crate", "Ящик припасов", 3710],
    [13, "Ale Keg", "Бочонок эля", 3238],
].forEach(value => {
    const key = value[0] as number;
    STOCK_DECORATION_ENTRIES[key] = makeStockDecoration(
        key, value[1] as string, value[2] as string, value[3] as number,
    ).ID;
});

// Keep keys/names synchronized with shared/BaseCatalog.ts. Stock decorative entries
// intentionally use the private inert copies above; livescripts resolve them by tag.
const TOOL_BUILDINGS: ToolBuilding[] = [
    { key: 0, name: "Палатка", nameEn: "Tent", entry: STOCK_DECORATION_ENTRIES[0] },
    { key: 1, name: "Казарма", nameEn: "Barracks", entry: STOCK_DECORATION_ENTRIES[1] },
    { key: 2, name: "Таверна", nameEn: "Tavern", entry: STOCK_DECORATION_ENTRIES[2] },
    { key: 3, name: "Сторожевая башня", nameEn: "Watch Tower", entry: STOCK_DECORATION_ENTRIES[3] },
    { key: 4, name: "Орочья башня", nameEn: "Orc Tower", entry: STOCK_DECORATION_ENTRIES[4] },
    { key: 5, name: "Будка", nameEn: "Doghouse", entry: STOCK_DECORATION_ENTRIES[5] },
    { key: 6, name: "Костёр", nameEn: "Campfire", entry: STOCK_DECORATION_ENTRIES[6] },
    { key: 7, name: "Жаровня", nameEn: "Brazier", entry: STOCK_DECORATION_ENTRIES[7] },
    { key: 8, name: "Кузница", nameEn: "Forge", entry: STOCK_DECORATION_ENTRIES[8] },
    { key: 9, name: "Наковальня", nameEn: "Anvil", entry: STOCK_DECORATION_ENTRIES[9] },
    { key: 10, name: "Бочка", nameEn: "Barrel", entry: STOCK_DECORATION_ENTRIES[10] },
    { key: 11, name: "Ящик припасов", nameEn: "Supply Crate", entry: STOCK_DECORATION_ENTRIES[11] },
    { key: 12, name: "Кухонный стол", nameEn: "Cooking Table", entry: GO_COOKING_ENTRY },
    { key: 13, name: "Бочонок эля", nameEn: "Ale Keg", entry: STOCK_DECORATION_ENTRIES[13] },
    { key: 14, name: "NE Small House", entry: 4000391 },
    { key: 15, name: "NE Inn", entry: 4000400 },
    { key: 16, name: "NE Guard Tower", entry: 4000404 },
    { key: 17, name: "NE Druid Tower", entry: 4000408 },
    { key: 18, name: "NE Moonwell", entry: 4000398 },
    { key: 19, name: "NE Gate", entry: 4000387 },
    { key: 20, name: "BE Fence", entry: 4000417 },
    { key: 21, name: "Duskwood Gate", entry: 4000511 },
    { key: 22, name: "Duskwood Fence", entry: 4000513 },
    { key: 23, name: "Duskwood Fence Post", entry: 4000514 },
    { key: 24, name: "Duskwood Bridge", entry: 4000515 },
    { key: 25, name: "Burning Rope Bridge", entry: 4000518 },
    { key: 26, name: "Stranglethorn Bridge", entry: 4000509 },
    { key: 27, name: "HU Gypsy Wagon", entry: 4000516 },
    { key: 28, name: "Westfall Bed", entry: 4000505 },
    { key: 29, name: "Troll Fountain", entry: 4000506 },
    { key: 30, name: "Serpent Statue", entry: 4000507 },
    { key: 31, name: "Lothar Statue", entry: 4000517 },
    { key: 32, name: "SC Tent", entry: 4002055 },
    { key: 33, name: "SC Tent Variant", entry: 4002056 },
    { key: 34, name: "SC Wall", entry: 4002073 },
    { key: 35, name: "SC Wall Variant", entry: 4002074 },
    { key: 36, name: "SC Ramp", entry: 4002076 },
    { key: 37, name: "SC Trench", entry: 4002059 },
    { key: 38, name: "SC Broken Wagon", entry: 4002072 },
    { key: 39, name: "ND Orc Gate", entry: 4002100 },
    { key: 40, name: "ND Orc Wall", entry: 4002102 },
    { key: 41, name: "ND Orc Wall Large", entry: 4002125 },
    { key: 42, name: "ND Orc Forge", entry: 4002108 },
    { key: 43, name: "ND Orc Stables", entry: 4002119 },
    { key: 44, name: "ND Orc Tower", entry: 4002120 },
    { key: 45, name: "GOB Bridge", entry: 4002133 },
    { key: 46, name: "TS Hut", entry: 4002143 },
    { key: 47, name: "SW Lighthouse", entry: 4002153 },
    { key: 48, name: "Людская казарма", nameEn: "Human Barracks", entry: 4000008 },
    { key: 49, name: "Двухэтажный дом", nameEn: "Two-Story House", entry: 4000010 },
    { key: 50, name: "Крепостная стена", nameEn: "Keep Wall", entry: 4000011 },
    { key: 51, name: "Столб крепостной стены", nameEn: "Keep Wall Post", entry: 4000013 },
    { key: 52, name: "Крепостные ворота", nameEn: "Keep Gate", entry: 4000029 },
    { key: 53, name: "Людские стойла", nameEn: "Human Stables", entry: 4000034 },
    { key: 54, name: "Лесопилка", nameEn: "Lumber Mill", entry: 4000035 },
    { key: 55, name: "Орочья нора", nameEn: "Orc Burrow", entry: 4000120 },
    { key: 56, name: "Большая тролльская хижина", nameEn: "Large Troll Hut", entry: 4000127 },
    /* -------- функциональные постройки; держать синхронно с BaseCatalog.ts -------- */
    { key: 57, name: "Почтовый ящик", nameEn: "Mailbox", entry: 32349 },
    { key: 58, name: "Камень встреч", nameEn: "Meeting Stone", entry: 178824 },
    { key: 59, name: "Личный сейф", nameEn: "Personal Vault", entry: GO_SAFE_ENTRY },
    { key: 60, name: "Бочка питьевой воды", nameEn: "Drinking Water Barrel", entry: GO_WATER_ENTRY },
    { key: 61, name: "Котёл с похлёбкой", nameEn: "Stew Cauldron", entry: GO_FOOD_ENTRY },
    { key: 62, name: "Аукционист", nameEn: "Auctioneer", entry: 8661, preview: NPC_PREVIEW_ENTRY },
    { key: 63, name: "Трактирщик", nameEn: "Innkeeper", entry: 7733, preview: NPC_PREVIEW_ENTRY },
    { key: 64, name: "Ремонтник", nameEn: "Repair Vendor", entry: 8129, preview: NPC_PREVIEW_ENTRY },
    { key: 65, name: "Учитель: кузнечное дело", nameEn: "Trainer: Blacksmithing", entry: 28694, preview: NPC_PREVIEW_ENTRY },
    { key: 66, name: "Учитель: портняжное дело", nameEn: "Trainer: Tailoring", entry: 28699, preview: NPC_PREVIEW_ENTRY },
    { key: 67, name: "Учитель: кожевничество", nameEn: "Trainer: Leatherworking", entry: 28700, preview: NPC_PREVIEW_ENTRY },
    { key: 68, name: "Учитель: наложение чар", nameEn: "Trainer: Enchanting", entry: 28693, preview: NPC_PREVIEW_ENTRY },
    { key: 69, name: "Учитель: начертание", nameEn: "Trainer: Inscription", entry: 28702, preview: NPC_PREVIEW_ENTRY },
    { key: 70, name: "Учитель: ювелирное дело", nameEn: "Trainer: Jewelcrafting", entry: 28701, preview: NPC_PREVIEW_ENTRY },
    { key: 71, name: "Учитель: инженерное дело", nameEn: "Trainer: Engineering", entry: 28697, preview: NPC_PREVIEW_ENTRY },
    { key: 72, name: "Учитель: горное дело", nameEn: "Trainer: Mining", entry: 28698, preview: NPC_PREVIEW_ENTRY },
    { key: 73, name: "Учитель: травничество", nameEn: "Trainer: Herbalism", entry: 28704, preview: NPC_PREVIEW_ENTRY },
    { key: 74, name: "Учитель: снятие шкур", nameEn: "Trainer: Skinning", entry: 28696, preview: NPC_PREVIEW_ENTRY },
    { key: 75, name: "Медная жила (совместимость)", nameEn: "Copper Vein (Legacy)", entry: GO_MINE_ENTRY },
    { key: 76, name: "Мироцвет (совместимость)", nameEn: "Peacebloom (Legacy)", entry: GO_GARDEN_ENTRY },
    // key 77 «Улучшение базы» — услуга, спелл/предмет не создаются
    { key: 78, name: "Стражник базы", nameEn: "Base Guard", entry: BASE_GUARD.ID, preview: NPC_PREVIEW_ENTRY },
    { key: 79, name: "Стрелок базы", nameEn: "Base Archer", entry: BASE_ARCHER.ID, preview: NPC_PREVIEW_ENTRY },
    { key: 80, name: "Боевое знамя", nameEn: "Battle Banner", entry: GO_BANNER_ENTRY },
    { key: 81, name: "Целитель базы", nameEn: "Base Healer", entry: BASE_HEALER.ID, preview: NPC_PREVIEW_ENTRY },
    /* -------- хранилище и переработка (июль 2026) -------- */
    { key: 82, name: "Склад материалов", nameEn: "Material Warehouse", entry: GO_STORAGE_ENTRY },
    { key: 83, name: "Плавильня", nameEn: "Smelter", entry: GO_SMELTER_ENTRY },
    { key: 84, name: "Алхимический стол", nameEn: "Alchemy Table", entry: GO_LAB_ENTRY },
    { key: 85, name: "Дубильный верстак", nameEn: "Tanning Bench", entry: GO_LEATHERWORKING_ENTRY },
    { key: 86, name: "Ткацкий станок", nameEn: "Loom", entry: GO_LOOM_ENTRY },
    { key: 87, name: "Стол начертателя", nameEn: "Scribe's Table", entry: GO_INSCRIPTION_ENTRY },
    { key: 88, name: "Точильный круг", nameEn: "Grinding Wheel", entry: GO_STONECUTTING_ENTRY },
    { key: 89, name: "Инженерный станок", nameEn: "Engineering Workbench", entry: GO_ENGINEERING_ENTRY },
    { key: 90, name: "Разделочный стол", nameEn: "Butcher's Table", entry: GO_BUTCHER_ENTRY },
    { key: 91, name: "Тренировочный манекен", nameEn: "Training Dummy", entry: BASE_TRAINING_DUMMY.ID, preview: NPC_PREVIEW_ENTRY },
    { key: 92, name: "Алтарь восстановления", nameEn: "Restoration Altar", entry: GO_RESTORATION_ALTAR_ENTRY },
    { key: 93, name: "Кожевенная мастерская", nameEn: "Leather Armor Workshop", entry: LEATHER_ARMOR_STATION.ID },
    { key: 94, name: "Латная мастерская", nameEn: "Metal Armor Workshop", entry: PLATE_ARMOR_STATION.ID },
    { key: 95, name: "Портняжная мастерская", nameEn: "Tailoring Workshop", entry: CLOTH_ARMOR_STATION.ID },
    { key: 96, name: "Оружейная кузница", nameEn: "Weapon Forge", entry: WEAPON_FORGE_STATION.ID },
    { key: 97, name: "Ювелирная мастерская", nameEn: "Jewelry Workshop", entry: JEWELRY_STATION.ID },
    { key: 99, name: "Доска заказов", nameEn: "Order Board", entry: ORDER_BOARD_TEMPLATE.ID },
    /* -------- новые службы и оборона -------- */
    { key: 100, name: "Манекен лекаря", nameEn: "Healer's Training Dummy", entry: BASE_HEALING_DUMMY.ID, preview: NPC_PREVIEW_ENTRY },
    { key: 101, name: "Купель очищения", nameEn: "Cleansing Font", entry: BASE_CLEANSING_FONT.ID },
    { key: 102, name: "Ремонтная стойка", nameEn: "Repair Rack", entry: BASE_REPAIR_STATION.ID },
    { key: 103, name: "Навигационный портал", nameEn: "Navigation Portal", entry: BASE_CAPITAL_PORTAL.ID },
    { key: 104, name: "Геральдист базы", nameEn: "Base Herald", entry: BASE_HERALD.ID, preview: NPC_PREVIEW_ENTRY },
    { key: 105, name: "Тактический стол", nameEn: "Tactical Table", entry: BASE_TACTICAL_TABLE.ID },
    { key: 106, name: "Щитоносец базы", nameEn: "Base Shieldbearer", entry: BASE_SHIELDBEARER.ID, preview: NPC_PREVIEW_ENTRY },
    { key: 107, name: "Боевой маг базы", nameEn: "Base Battle Mage", entry: BASE_BATTLE_MAGE.ID, preview: NPC_PREVIEW_ENTRY },
    { key: 108, name: "Баллиста базы", nameEn: "Base Ballista", entry: BASE_BALLISTA.ID, preview: NPC_PREVIEW_ENTRY },
    { key: 109, name: "Морозный капкан", nameEn: "Frost Trap", entry: BASE_FROST_TRAP.ID },
    { key: 110, name: "Рунный обелиск", nameEn: "Runic Obelisk", entry: BASE_RUNIC_BULWARK.ID },
    { key: 111, name: "Дозорный гонг", nameEn: "Watch Gong", entry: BASE_WATCH_GONG.ID },
    { key: 112, name: "Торговец Эхо", nameEn: "Echo Vendor", entry: 0, preview: NPC_PREVIEW_ENTRY },
];

function makeBuildingSpell(
    building: ToolBuilding,
    id: string = `building-spell-${building.key}`,
    tag: string = `base-building-spell-${building.key}`,
    uniqueTag: boolean = true,
) {
    const nameEn = `Place: ${building.nameEn || building.name}`;
    const nameRu = `Установить: ${building.name}`;
    const spl = std.Spells.create(MODNAME, id, BUILDING_PREVIEW_BASE);
    spl.Name.enGB.set(nameEn);
    spl.Name.ruRU.set(nameRu);
    spl.Description.enGB.set(nameEn);
    spl.Description.ruRU.set(nameRu);

    // Профиль spell 61031 (Toy Train Set). Требования оригинала, включая
    // CANNOT_USE_IN_COMBAT, не копируем. Остальные клиентские поля наследуем
    // непосредственно от 61031, чтобы сохранить его механику предпросмотра.
    spl.Attributes.clearAll();
    spl.row.ShapeshiftMask.set(BigInt(0));
    spl.row.ShapeshiftExclude.set(BigInt(0));
    spl.TargetType.clearAll();
    spl.TargetType.DEST_LOCATION.set(true);
    spl.Effects.clearAll();
    spl.Effects.addGet()
        .Type.TRANS_DOOR.set()
        .GOTemplate.set(building.preview !== undefined ? building.preview : building.entry)
        .ImplicitTargetA.DEST_DEST.set();
    spl.CastTime.set(14);
    spl.Duration.set(23);
    spl.Range.set(12);
    spl.Speed.set(0);
    spl.Visual.set(353);
    spl.Icon.set(3646);
    spl.ActiveIcon.set(0);
    if (uniqueTag) spl.Tags.addUnique(MODNAME, tag);
    else spl.Tags.add(MODNAME, tag);
    return spl;
}

function makeToolItem(
    id: string,
    nameEn: string,
    nameRu: string,
    descriptionEn: string,
    descriptionRu: string,
    spellId: number,
    tag: string,
    deleteOnUse: boolean = true,
    uniqueTag: boolean = true,
) {
    const item = std.Items.create(MODNAME, id, 6948);
    item.Name.enGB.set(nameEn);
    item.Name.ruRU.set(nameRu);
    item.Description.enGB.set(descriptionEn);
    item.Description.ruRU.set(descriptionRu);
    item.Class.OTHER_MISC.set();
    item.Quality.set(1);
    item.Bonding.set(1);
    item.MaxCount.set(1);
    item.MaxStack.set(1);
    item.Price.set(0, 0, 1);
    item.Spells.clearAll();
    item.Spells.addMod(spell => {
        spell.Spell.set(spellId);
        spell.Trigger.set(0);
        if (deleteOnUse) spell.Charges.set(1, "DELETE_ITEM");
        else spell.Charges.set("UNLIMITED");
        spell.Cooldown.set(-1);
        spell.CategoryCooldown.set(-1);
    });
    if (uniqueTag) item.Tags.addUnique(MODNAME, tag);
    else item.Tags.add(MODNAME, tag);
    return item;
}

makeToolItem(
    "patch-item",
    "Object Placement Tool",
    "Установка объекта",
    "A single-use placement tool for the selected object from the full catalog. Use the item to choose a construction location.",
    "Одноразовая установка выбранного объекта из полного каталога. Используйте предмет, чтобы указать место строительства.",
    patchSpell.ID,
    TAG_PATCH_ITEM,
);

PATCH_BUILDING_ENTRIES.forEach(entry => {
    const nameEn = `Object Placement entry ${entry}`;
    const nameRu = `Установка объекта entry ${entry}`;
    const spell = makeBuildingSpell(
        { key: entry, name: `объект entry ${entry}`, nameEn: `object entry ${entry}`, entry },
        `patch-preview-spell-${entry}`,
        TAG_PATCH_PREVIEW_SPELLS,
        false,
    );
    makeToolItem(
        `patch-preview-item-${entry}`,
        nameEn,
        nameRu,
        nameEn,
        nameRu,
        spell.ID,
        TAG_PATCH_PREVIEW_ITEMS,
        true,
        false,
    );
});

makeToolItem(
    "flag-item",
    "Base Flag Tool",
    "Инструмент: флаг базы",
    "Use it to choose a location for your base's only flag. Disappears after use.",
    "Используйте, чтобы выбрать место для единственного флага вашей базы. После использования исчезает.",
    flagSpell.ID,
    TAG_FLAG_ITEM,
);

TOOL_BUILDINGS.forEach(building => {
    const spell = makeBuildingSpell(building);
    const nameEn = building.nameEn || building.name;
    makeToolItem(
        `building-item-${building.key}`,
        `Blueprint: ${nameEn}`,
        `Чертёж: ${building.name}`,
        `Single-use placement tool. Disappears after use. The cost is charged after successful construction: ${nameEn}.`,
        `Одноразовый инструмент установки. После использования исчезает. Цена списывается после успешного строительства: ${building.name}.`,
        spell.ID,
        `base-building-item-${building.key}`,
    );
});

function copyGameObjectData(to: any, from: any) {
    for (let i = 0; i <= 23; i++) {
        to[`Data${i}`].set(from[`Data${i}`].get());
    }
}

// GENERIC (тип 5) — только подсветка/тултип, клиент НЕ шлёт CMSG_GAMEOBJ_USE по нему,
// т.е. серверный OnGossipHello никогда не сработает (проверено в игре). Кликабельный
// тип — GOOBER (10) с нулевыми Data: без замка (lockId 0), не расходуется, без кд.
function makeClickable(tpl: any, nameEn: string, nameRu: string = nameEn) {
    clearGameObjectData(tpl);
    tpl.Type.GOOBER.set();
    clearGameObjectData(tpl); // тип сменил раскладку Data — обнуляем уже по-гоберски
    tpl.Faction.set(0);
    tpl.Flags.set(0);
    tpl.Name.enGB.set(nameEn);
    tpl.Name.ruRU.set(nameRu);
}

function makeFlagSign(entry: number, name: string) {
    const flagTemplate = std.GameObjectTemplates.Generic.load(entry);
    if (!flagTemplate) return;
    makeClickable(flagTemplate, name); // клик по СВОЕМУ флагу выдаёт припасы (ливскрипт)
}

makeFlagSign(FLAG_ENTRY, FLAG_TOOLTIP_NAME);
makeFlagSign(HORDE_FLAG_ENTRY, HORDE_FLAG_TOOLTIP_NAME);

/* --------------------- заклинание возврата на базу ------------------------- */
// Ливскрипт выучивает spell при установке флага и снимает при сносе базы.
// Сам телепорт выполняет сервер в Spell.OnCast; spell даёт только каст-бар
// (прерывается движением/уроном, как Камень возвращения) и 5-минутный кулдаун.
const TAG_TELEPORT = "base-teleport-spell";
const TELEPORT_SPELL_NAME_EN = "Return to Base";
const TELEPORT_SPELL_NAME_RU = "Возврат на базу";
const HEARTHSTONE_BASE = 8690;
const TELEPORT_CAST_MS = 5000;
const TELEPORT_COOLDOWN_MS = 5 * 60 * 1000;
const GENERIC_DND_SKILL = 183; // вкладка «Общие» книги заклинаний

const teleportSpell = std.Spells.create(MODNAME, "teleport-spell", HEARTHSTONE_BASE);
teleportSpell.Name.enGB.set(TELEPORT_SPELL_NAME_EN);
teleportSpell.Name.ruRU.set(TELEPORT_SPELL_NAME_RU);
teleportSpell.Description.enGB.set("Teleports you to your base flag.");
teleportSpell.Description.ruRU.set("Телепортирует вас к флагу вашей базы.");
teleportSpell.Effects.clearAll();
teleportSpell.Effects.addGet()
    .Type.SCRIPT_EFFECT.set()
    .ImplicitTargetA.UNIT_CASTER.set();
teleportSpell.CastTime.setSimple(TELEPORT_CAST_MS, 0, TELEPORT_CAST_MS);
// Собственный кулдаун вместо унаследованной категории Камня возвращения.
teleportSpell.row.Category.set(0);
teleportSpell.Cooldown.Time.set(TELEPORT_COOLDOWN_MS);
teleportSpell.Cooldown.CategoryTime.set(0);
teleportSpell.SkillLines.add(GENERIC_DND_SKILL);
teleportSpell.Tags.add(MODNAME, TAG_TELEPORT);

/* --------------------- функциональные кликабельные GO ---------------------- */
// Тот же приём, что и с флагом: незаспавненный шаблон переименовывается, тип
// GENERIC + interaction data 93 делают его кликабельным. Логика клика —
// в ливскриптах (сейф: base.ts → SendShowBank; вода/котёл: survival module).
function makeInteractable(entry: number, nameEn: string, nameRu: string, display: number) {
    const tpl = std.GameObjectTemplates.Generic.load(entry); // 2130/2131/2148/2149/1670 — тип 5
    if (!tpl) return;
    makeClickable(tpl, nameEn, nameRu);
    tpl.Display.set(display);
}

makeInteractable(GO_SAFE_ENTRY, "Personal Vault", "Личный сейф", 10);         // сундук
makeInteractable(GO_WATER_ENTRY, "Drinking Water Barrel", "Бочка питьевой воды", 334); // бочка с водой
makeInteractable(GO_FOOD_ENTRY, "Stew Cauldron", "Котёл с похлёбкой", 216);    // булькающий котёл
makeInteractable(GO_MINE_ENTRY, "Copper Vein (Legacy)", "Медная жила (совместимость)", 310);
makeInteractable(GO_GARDEN_ENTRY, "Peacebloom (Legacy)", "Мироцвет (совместимость)", 269);
makeInteractable(GO_BANNER_ENTRY, "Battle Banner", "Боевое знамя", 5651);      // знамя (проксимити-бафф)
makeInteractable(GO_STORAGE_ENTRY, "Material Warehouse", "Склад материалов", 335);  // ящик с бронёй (Armor Crate)
makeInteractable(GO_SMELTER_ENTRY, "Smelter", "Плавильня", 197);         // горн
makeInteractable(GO_LAB_ENTRY, "Alchemy Table", "Алхимический стол", 234);     // аптекарский стол
makeInteractable(GO_COOKING_ENTRY, "Cooking Table", "Кухонный стол", 331);     // stock Cooking Table
makeInteractable(GO_LEATHERWORKING_ENTRY, "Tanning Bench", "Дубильный верстак", 62423); // Dalaran leatherworking bench [PATCH]
makeInteractable(GO_LOOM_ENTRY, "Loom", "Ткацкий станок", 76204);                 // Blood Elf loom [PATCH]
makeInteractable(GO_INSCRIPTION_ENTRY, "Scribe's Table", "Стол начертателя", 87212);        // human scribe station [PATCH]
makeInteractable(GO_STONECUTTING_ENTRY, "Grinding Wheel", "Точильный круг", 87838);         // dwarven sharpening wheel [PATCH]
makeInteractable(GO_ENGINEERING_ENTRY, "Engineering Workbench", "Инженерный станок", 83332);       // engineering autolathe [PATCH]
makeInteractable(GO_BUTCHER_ENTRY, "Butcher's Table", "Разделочный стол", 86784);            // orc raw-meat rack [PATCH]
makeInteractable(GO_RESTORATION_ALTAR_ENTRY, "Restoration Altar", "Алтарь восстановления", 7355); // WotLK Light Altar

/* ------------------------- проксимити-баффы базы --------------------------- */
// Вешаются ливскрипт-таймером рядом со своими постройками; длительность чуть
// больше периода таймера (10с), чтобы бафф спадал после ухода с базы.
const BUFF_BASE = 34747; // видимая аура (тот же клон-донор, что в survival)
const BUFF_DURATION_MS = 35000;

function makeBaseBuff(
    id: string,
    tag: string,
    nameEn: string,
    nameRu: string,
    descEn: string,
    descRu: string,
    icon: string,
) {
    const spell = std.Spells.create(MODNAME, id, BUFF_BASE);
    spell
        .Name.enGB.set(nameEn)
        .Name.ruRU.set(nameRu)
        .Description.enGB.set(descEn)
        .Description.ruRU.set(descRu)
        .AuraDescription.enGB.set(descEn)
        .AuraDescription.ruRU.set(descRu)
        .Icon.setPath(icon);
    spell.Duration.set(BUFF_DURATION_MS);
    spell.Attributes.IS_NEGATIVE.set(false);
    spell.Attributes.IS_PASSIVE.set(false);
    spell.Attributes.HIDE_FROM_AURA_BAR.set(false);
    spell.Attributes.HIDE_AURA_IF_SELF_CAST.set(false);
    spell.Attributes.AURA_VISIBLE_TO_CASTER_ONLY.set(false);
    spell.SchoolMask.clearAll().Effects.clearAll();
    spell.Tags.add(MODNAME, tag);
    return spell;
}

// «Тепло очага»: периодический хил у своего костра/жаровни.
const hearthBuff = makeBaseBuff(
    "hearth-buff", "base-hearth-buff",
    "Hearth's Warmth",
    "Тепло очага",
    "The warmth of your hearth restores health.",
    "Огонь родного очага восстанавливает здоровье.",
    "spell_fire_fire"
);
const hearthEff = hearthBuff.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.PERIODIC_HEAL.set()
    .ImplicitTargetA.UNIT_CASTER.set();
hearthEff.HealBase.set(25);
hearthBuff.Effects.get(0).AuraPeriod.set(2000);

// «Кров»: маркер-аура жилья; survival замедляет голод/жажду как при отдыхе.
const shelterBuff = makeBaseBuff(
    "shelter-buff", "base-shelter-buff",
    "Shelter",
    "Кров",
    "You are home: hunger and thirst increase much more slowly.",
    "Вы дома: голод и жажда растут значительно медленнее.",
    "inv_misc_tent_01"
);
shelterBuff.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.DUMMY.set()
    .ImplicitTargetA.UNIT_CASTER.set();

// «Боевой дух»: +10% ко всему урону у своего боевого знамени.
const bannerBuff = makeBaseBuff(
    "banner-buff", "base-banner-buff",
    "Battle Spirit",
    "Боевой дух",
    "Your banner inspires you: damage increased by 10%.",
    "Родное знамя воодушевляет: урон увеличен на 10%.",
    "inv_bannerpvp_02"
);
bannerBuff.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_DAMAGE_PERCENT_DONE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .Schools.set(["PHYSICAL", "HOLY", "FIRE", "NATURE", "FROST", "SHADOW", "ARCANE"] as any)
    .PercentBase.set(10);
