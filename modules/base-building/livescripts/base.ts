/**
 * Base-building — серверная логика (открытый мир).
 *
 * Поток:
 *  - /base открывает меню (аддон) → OP_BASE_REQUEST → сервер шлёт OP_BASE_STATE.
 *  - Кнопки каталога запрашивают одноразовые предметы через OP_BASE_TOOL.
 *  - Предмет флага и обычные чертежи запускают собственный ground-target spell;
 *    полный patch-каталог использует один предмет с сохранённым server-side entry.
 *  - Сервер проверяет флаг/радиус/лимит/материалы до каста. Spell на базе 61031
 *    показывает предпросмотр, а сервер вместо временного spell-GO создаёт и
 *    сохраняет независимый объект базы.
 *  - Панель управления получает все объекты базы на текущей карте, фиксирует выбор на сервере
 *    и затем двигает его по X/Y/Z, поворачивает или сносит.
 *
 * Объекты живут в наших таблицах, а в мире поднимаются как map GO в фазе игрока.
 * spawnGuid — runtime guid текущего GO; после рестарта он восстанавливается из наших строк.
 */

import {
    BUILD_RADIUS, MAX_BUILDINGS, ROTATE_STEP, MANAGE_RANGE,
    FLAG_ENTRY, HORDE_FLAG_ENTRY, BUILDINGS, buildingByKey, buildingName, isDecorativeBuildingKey, Building,
    GO_SAFE_ENTRY, HEARTH_KEYS, SHELTER_KEYS, HEARTH_RANGE, SHELTER_RANGE,
    SUPPLY_COOLDOWN_S,
    UPGRADE_KEY, BASE_MAX_LEVEL, RADIUS_BY_LEVEL, LIMIT_BY_LEVEL, GUARD_KEYS,
    GUARD_KEY, ARCHER_KEY, HEALER_KEY,
    BANNER_KEYS, BANNER_RANGE,
    TRAINING_DUMMY_KEY, RESTORATION_ALTAR_KEY, GO_RESTORATION_ALTAR_ENTRY,
    RESTORATION_USE_RANGE, restorationWaitSeconds,
    HEALING_DUMMY_KEY, BASE_HERALD_KEY,
    SHIELDBEARER_KEY, BATTLE_MAGE_KEY, BALLISTA_KEY,
    maxBuildingCopies, isInertDefenseBuildingKey, setExpansionBuildingEntries,
    BuildingMaterial, BUILDING_ORE_ITEMS, BUILDING_HERB_ITEMS, BUILDING_WOOD_ITEMS,
    setBuildingWoodItems,
    DECORATION_MATERIAL_COST, buildingMaterialCost, materialCostText,
    setDynamicBuildingEntries, syncResourceGeneratorBuildingEntries,
} from "../shared/BaseCatalog";
import {
    resourceGeneratorByKey, hydrateResourceGeneratorCatalog,
} from "../shared/ResourceGenerators";
import { PATCH_BUILDING_ENTRIES, isPatchBuildingEntry } from "../shared/PatchBuildingEntries";
import {
    OP_BASE_REQUEST, OP_BASE_SELECT, OP_BASE_ROTATE, OP_BASE_REMOVE,
    OP_BASE_MOVE,
    OP_BASE_TOOLTIP, OP_BASE_CLEAR, OP_BASE_TOOL, FLAG_TOOL_KEY,
    MOVE_AXIS_X, MOVE_AXIS_Y, MOVE_AXIS_Z,
    BaseState, SelectMsg, ManageEntry, ManageState, MoveMsg, RotateMsg,
    ErrorMsg, TooltipRequest, TooltipOwnerMsg, ClearBaseMsg, ToolRequestMsg,
} from "../shared/BaseMessages";
import {
    BaseFlag, BaseBuilding, allocateBuildingId, ensureStableBuildingIds,
} from "./base-db";

export function isRussianClient(player: TSPlayer): boolean {
    return Number(player.GetDbcLocale()) == LocaleConstant.ruRU;
}

export function baseText(player: TSPlayer, english: string, russian: string): string {
    return isRussianClient(player) ? russian : english;
}

export const localizedTemplateNames = (() => {
    // Session DB locale is the client's original locale. DBC locale may be
    // replaced by an available fallback and must not select *_template_locale.
    const queries = [
        PrepareWorldQuery("SELECT `Name` FROM `item_template_locale` WHERE `ID` = ? AND `locale` = 'ruRU'"),
        PrepareWorldQuery("SELECT `Name` FROM `creature_template_locale` WHERE `entry` = ? AND `locale` = 'ruRU'"),
        PrepareWorldQuery("SELECT `name` FROM `gameobject_template_locale` WHERE `entry` = ? AND `locale` = 'ruRU'"),
    ];
    const names: { [kind: number]: { [entry: number]: string } } = [{}, {}, {}];

    function russianName(kind: number, entry: number): string {
        let name = names[kind][entry];
        if (name !== undefined) return name;
        const result = queries[kind].Create().SetUInt32(0, entry as uint32).Send();
        name = result.GetRow() ? result.GetString(0) : "";
        names[kind][entry] = name;
        return name;
    }

    return {
        item(player: TSPlayer, entry: number): string {
            const template = GetItemTemplate(entry);
            const fallback = template ? template.GetName() : baseText(player, `Item #${entry}`, `Предмет #${entry}`);
            if (Number(player.GetDbLocaleIndex()) != 8) return fallback;
            return russianName(0, entry) || fallback;
        },
        creature(player: TSPlayer, entry: number): string {
            const template = GetCreatureTemplate(entry);
            const fallback = template ? template.GetName() : baseText(player, `Creature #${entry}`, `Существо #${entry}`);
            if (Number(player.GetDbLocaleIndex()) != 8) return fallback;
            return russianName(1, entry) || fallback;
        },
        gameObject(player: TSPlayer, entry: number, fallback: string): string {
            if (Number(player.GetDbLocaleIndex()) != 8) return fallback;
            return russianName(2, entry) || fallback;
        },
    };
})();

type BaseBuildingRemovalHandler = (player: TSPlayer, building: BaseBuilding) => void;
let baseBuildingRemovalHandler: BaseBuildingRemovalHandler | undefined = undefined;
type BaseBuildingPlacementHandler = (
    player: TSPlayer,
    building: BaseBuilding,
    firstCopy: boolean,
) => void;
let baseBuildingPlacementHandler: BaseBuildingPlacementHandler | undefined = undefined;

/** Lets workforce settle and release a target immediately before its source row is removed. */
export function setBaseBuildingRemovalHandler(handler: BaseBuildingRemovalHandler): void {
    baseBuildingRemovalHandler = handler;
}

export function prepareBuildingRemoval(player: TSPlayer, building: BaseBuilding): void {
    if (baseBuildingRemovalHandler) baseBuildingRemovalHandler(player, building);
}

/** Lets station storage start a fresh clock when a station type is rebuilt. */
export function setBaseBuildingPlacementHandler(handler: BaseBuildingPlacementHandler): void {
    baseBuildingPlacementHandler = handler;
}

function finishBuildingPlacement(
    player: TSPlayer,
    building: BaseBuilding,
    firstCopy: boolean,
): void {
    if (baseBuildingPlacementHandler) baseBuildingPlacementHandler(player, building, firstCopy);
}

setBuildingWoodItems([
    UTAG("base-building", "item/wood-tier-1"),
    UTAG("base-building", "item/wood-tier-2"),
    UTAG("base-building", "item/wood-tier-3"),
    UTAG("base-building", "item/wood-tier-4"),
    UTAG("base-building", "item/wood-tier-5"),
    UTAG("base-building", "item/wood-tier-6"),
]);

hydrateResourceGeneratorCatalog([
    UTAG("base-building", "go/resource-generator-copper-ore"),
    UTAG("base-building", "go/resource-generator-tin-ore"),
    UTAG("base-building", "go/resource-generator-silver-ore"),
    UTAG("base-building", "go/resource-generator-iron-ore"),
    UTAG("base-building", "go/resource-generator-gold-ore"),
    UTAG("base-building", "go/resource-generator-mithril-ore"),
    UTAG("base-building", "go/resource-generator-truesilver-ore"),
    UTAG("base-building", "go/resource-generator-thorium-ore"),
    UTAG("base-building", "go/resource-generator-fel-iron-ore"),
    UTAG("base-building", "go/resource-generator-adamantite-ore"),
    UTAG("base-building", "go/resource-generator-cobalt-ore"),
    UTAG("base-building", "go/resource-generator-saronite-ore"),
    UTAG("base-building", "go/resource-generator-titanium-ore"),
    UTAG("base-building", "go/resource-generator-peacebloom"),
    UTAG("base-building", "go/resource-generator-silverleaf"),
    UTAG("base-building", "go/resource-generator-mageroyal"),
    UTAG("base-building", "go/resource-generator-briarthorn"),
    UTAG("base-building", "go/resource-generator-kingsblood"),
    UTAG("base-building", "go/resource-generator-stranglekelp"),
    UTAG("base-building", "go/resource-generator-goldthorn"),
    UTAG("base-building", "go/resource-generator-khadgars-whisker"),
    UTAG("base-building", "go/resource-generator-sungrass"),
    UTAG("base-building", "go/resource-generator-dreamfoil"),
    UTAG("base-building", "go/resource-generator-felweed"),
    UTAG("base-building", "go/resource-generator-goldclover"),
    UTAG("base-building", "go/resource-generator-icethorn"),
    UTAG("base-building", "go/resource-generator-rough-stone"),
    UTAG("base-building", "go/resource-generator-coarse-stone"),
    UTAG("base-building", "go/resource-generator-heavy-stone"),
    UTAG("base-building", "go/resource-generator-solid-stone"),
    UTAG("base-building", "go/resource-generator-dense-stone"),
    UTAG("base-building", "go/resource-generator-pine-log"),
    UTAG("base-building", "go/resource-generator-oak-log"),
    UTAG("base-building", "go/resource-generator-ash-log"),
    UTAG("base-building", "go/resource-generator-ironwood-log"),
    UTAG("base-building", "go/resource-generator-terokkar-log"),
    UTAG("base-building", "go/resource-generator-frostwood-log"),
    UTAG("base-building", "go/resource-generator-brilliant-smallfish"),
    UTAG("base-building", "go/resource-generator-slitherskin-mackerel"),
    UTAG("base-building", "go/resource-generator-longjaw-mud-snapper"),
    UTAG("base-building", "go/resource-generator-loch-frenzy"),
    UTAG("base-building", "go/resource-generator-rainbow-fin-albacore"),
    UTAG("base-building", "go/resource-generator-rockscale-cod"),
    UTAG("base-building", "go/resource-generator-spotted-yellowtail"),
    UTAG("base-building", "go/resource-generator-raw-redgill"),
    UTAG("base-building", "go/resource-generator-mithril-head-trout"),
    UTAG("base-building", "go/resource-generator-salvage-puddle"),
    UTAG("base-building", "go/resource-generator-schooner-wreckage"),
    UTAG("base-building", "go/resource-generator-waterlogged-wreckage"),
    UTAG("base-building", "go/resource-generator-floating-wreckage"),
    UTAG("base-building", "go/resource-generator-bloodsail-wreckage"),
    UTAG("base-building", "go/resource-generator-steam-pump-flotsam"),
], BUILDING_WOOD_ITEMS);
syncResourceGeneratorBuildingEntries();

setDynamicBuildingEntries(
    UTAG("base-building", "go/station-leather-armor"),
    UTAG("base-building", "go/station-plate-armor"),
    UTAG("base-building", "go/station-cloth-armor"),
    UTAG("base-building", "go/station-weapon-forge"),
    UTAG("base-building", "go/station-jewelry"),
    UTAG("base-building", "go/orders-board"),
);

setExpansionBuildingEntries([
    UTAG("base-building", "npc/base-healing-dummy"),
    UTAG("base-building", "go/base-cleansing-font"),
    UTAG("base-building", "go/base-repair-station"),
    UTAG("base-building", "go/base-capital-portal"),
    UTAG("base-building", "npc/base-herald"),
    UTAG("base-building", "go/base-tactical-table"),
    UTAG("echoes", "npc/echo-vendor"),
    UTAG("base-building", "npc/base-shieldbearer"),
    UTAG("base-building", "npc/base-battle-mage"),
    UTAG("base-building", "npc/base-ballista"),
    UTAG("base-building", "go/base-frost-trap"),
    UTAG("base-building", "go/base-runic-bulwark"),
    UTAG("base-building", "go/base-watch-gong"),
]);

const WOODCUTTING_APPRENTICE_SPELL = UTAG("base-building", "spell/woodcutting-rank-1");
const WOODCUTTING_GATHER_SPELL = UTAG("base-building", "spell/woodcutting-gather");
const WOODCUTTING_SKILL = GetID("SkillLine", "base-building", "woodcutting");

function grantWoodcutting(player: TSPlayer): void {
    if (!player.HasSpell(WOODCUTTING_APPRENTICE_SPELL)) player.LearnSpell(WOODCUTTING_APPRENTICE_SPELL);
    if (!player.HasSpell(WOODCUTTING_GATHER_SPELL)) player.LearnSpell(WOODCUTTING_GATHER_SPELL);
    if (!player.HasSkill(WOODCUTTING_SKILL) || Number(player.GetSkillValue(WOODCUTTING_SKILL)) < 1) {
        player.SetSkill(WOODCUTTING_SKILL, 1, 1, 75);
    }
}

/* ------------------------- клиентское состояние ---------------------------- */
class BaseClient {
    ready: boolean = false;
    selectedSpawnGuid: number = 0;
    selectedEntry: number = 0;
    markerSpawnGuid: number = 0;
    markerMapId: number = 0;
    patchRefundItemId: number = 0;
}
export function baseClient(player: TSPlayer): BaseClient {
    return player.GetObject("baseClient", new BaseClient());
}

const SAME_SPOT_EPS2 = 1.0;
const MANAGE_MARKER_ENTRY = 4001946;
const MANAGE_MARKER_MS = 2500;
// Templates use inert TRAP type; keep NOT_SELECTABLE as a runtime safeguard.
const GO_FLAGS_DECORATIVE = 0x04 | 0x10;
const MOVE_STEP_MIN = 0.05;
const MOVE_STEP_MAX = 5.0;
const RADIUS_MAX = RADIUS_BY_LEVEL[RADIUS_BY_LEVEL.length - 1];
const FLAG_MIN_DISTANCE = RADIUS_MAX * 2.0; // консервативно: базы могут прокачать радиус
const FLAG_TOOLTIP_RANGE = 25.0;
// AreaTable flags CAPITAL (0x100) / CITY (0x200), including child districts.
// storage-protocol.test.cjs keeps this list aligned with the active dataset DBC.
const CITY_AREA_IDS: TSArray<number> = [
    1497, 1519, 1537, 1617, 1637, 1638, 1639, 1640, 1641, 1657,
    1658, 1659, 1660, 1661, 1662, 2197, 3459, 3487, 3557, 3703,
    3704, 3896, 3897, 3898, 3899, 4281, 4395, 4411, 4560, 4564,
    4567, 4568, 4569, 4570, 4598, 4599, 4601, 4613, 4614, 4616,
    4617, 4618, 4619, 4620, 4632, 4637, 4638, 4679, 4739, 4740,
];

function isCityArea(areaId: number): boolean {
    return CITY_AREA_IDS.indexOf(areaId) >= 0;
}

function requireNonCityPlacement(player: TSPlayer, x: number, y: number, z: number): boolean {
    const areaId = Number(player.GetMap().GetAreaID(
        x, y, z, Number(player.GetPhaseMaskForSpawn()),
    ));
    if (!isCityArea(areaId) && !isCityArea(Number(player.GetZoneID()))) return true;
    sendError(player, baseText(
        player,
        "Bases and buildings cannot be placed in cities or their districts.",
        "В городах и их районах нельзя размещать базы и постройки.",
    ));
    return false;
}

/** Радиус строительства с учётом уровня базы. */
function radiusFor(flag: BaseFlag): number {
    const lvl = flag.baseLevel;
    return RADIUS_BY_LEVEL[lvl < RADIUS_BY_LEVEL.length ? lvl : RADIUS_BY_LEVEL.length - 1];
}

/** Лимит построек с учётом уровня базы. */
function limitFor(flag: BaseFlag): number {
    const lvl = flag.baseLevel;
    return LIMIT_BY_LEVEL[lvl < LIMIT_BY_LEVEL.length ? lvl : LIMIT_BY_LEVEL.length - 1];
}

// Tag macros are resolved while livescripts are built; they are not runtime
// Lua functions. Keep every lookup literal so the compiler can replace it
// with the generated item ID before the server loads this file.
const FLAG_TOOL_ITEM_ID = UTAG("base-building", "base-flag-item");
const FLAG_SPELL_ID = UTAG("base-building", "base-flag-spell");
const PATCH_TOOL_ITEM_ID = UTAG("base-building", "base-patch-item");
const PATCH_SPELL_ID = UTAG("base-building", "base-place-spell");
const PATCH_PREVIEW_SPELL_IDS: number[] = TAG("base-building", "base-patch-preview-spells");
const PATCH_PREVIEW_ITEM_IDS: number[] = TAG("base-building", "base-patch-preview-items");
const RESOURCE_GENERATOR_TOOL_ITEM_ID = UTAG("base-building", "item/resource-generator-place");
const RESOURCE_GENERATOR_PLACE_SPELL_ID = UTAG("base-building", "spell/resource-generator-place");
const RESOURCE_GENERATOR_READY_EFFECT_ENTRY = UTAG("base-building", "go/resource-generator-ready-effect");
const TELEPORT_SPELL_ID = UTAG("base-building", "base-teleport-spell");
const BUILDING_SPELL_IDS: number[] = [
    UTAG("base-building", "base-building-spell-0"),
    UTAG("base-building", "base-building-spell-1"),
    UTAG("base-building", "base-building-spell-2"),
    UTAG("base-building", "base-building-spell-3"),
    UTAG("base-building", "base-building-spell-4"),
    UTAG("base-building", "base-building-spell-5"),
    UTAG("base-building", "base-building-spell-6"),
    UTAG("base-building", "base-building-spell-7"),
    UTAG("base-building", "base-building-spell-8"),
    UTAG("base-building", "base-building-spell-9"),
    UTAG("base-building", "base-building-spell-10"),
    UTAG("base-building", "base-building-spell-11"),
    UTAG("base-building", "base-building-spell-12"),
    UTAG("base-building", "base-building-spell-13"),
    UTAG("base-building", "base-building-spell-14"),
    UTAG("base-building", "base-building-spell-15"),
    UTAG("base-building", "base-building-spell-16"),
    UTAG("base-building", "base-building-spell-17"),
    UTAG("base-building", "base-building-spell-18"),
    UTAG("base-building", "base-building-spell-19"),
    UTAG("base-building", "base-building-spell-20"),
    UTAG("base-building", "base-building-spell-21"),
    UTAG("base-building", "base-building-spell-22"),
    UTAG("base-building", "base-building-spell-23"),
    UTAG("base-building", "base-building-spell-24"),
    UTAG("base-building", "base-building-spell-25"),
    UTAG("base-building", "base-building-spell-26"),
    UTAG("base-building", "base-building-spell-27"),
    UTAG("base-building", "base-building-spell-28"),
    UTAG("base-building", "base-building-spell-29"),
    UTAG("base-building", "base-building-spell-30"),
    UTAG("base-building", "base-building-spell-31"),
    UTAG("base-building", "base-building-spell-32"),
    UTAG("base-building", "base-building-spell-33"),
    UTAG("base-building", "base-building-spell-34"),
    UTAG("base-building", "base-building-spell-35"),
    UTAG("base-building", "base-building-spell-36"),
    UTAG("base-building", "base-building-spell-37"),
    UTAG("base-building", "base-building-spell-38"),
    UTAG("base-building", "base-building-spell-39"),
    UTAG("base-building", "base-building-spell-40"),
    UTAG("base-building", "base-building-spell-41"),
    UTAG("base-building", "base-building-spell-42"),
    UTAG("base-building", "base-building-spell-43"),
    UTAG("base-building", "base-building-spell-44"),
    UTAG("base-building", "base-building-spell-45"),
    UTAG("base-building", "base-building-spell-46"),
    UTAG("base-building", "base-building-spell-47"),
    UTAG("base-building", "base-building-spell-48"),
    UTAG("base-building", "base-building-spell-49"),
    UTAG("base-building", "base-building-spell-50"),
    UTAG("base-building", "base-building-spell-51"),
    UTAG("base-building", "base-building-spell-52"),
    UTAG("base-building", "base-building-spell-53"),
    UTAG("base-building", "base-building-spell-54"),
    UTAG("base-building", "base-building-spell-55"),
    UTAG("base-building", "base-building-spell-56"),
    UTAG("base-building", "base-building-spell-57"),
    UTAG("base-building", "base-building-spell-58"),
    UTAG("base-building", "base-building-spell-59"),
    UTAG("base-building", "base-building-spell-60"),
    UTAG("base-building", "base-building-spell-61"),
    UTAG("base-building", "base-building-spell-62"),
    UTAG("base-building", "base-building-spell-63"),
    UTAG("base-building", "base-building-spell-64"),
    UTAG("base-building", "base-building-spell-65"),
    UTAG("base-building", "base-building-spell-66"),
    UTAG("base-building", "base-building-spell-67"),
    UTAG("base-building", "base-building-spell-68"),
    UTAG("base-building", "base-building-spell-69"),
    UTAG("base-building", "base-building-spell-70"),
    UTAG("base-building", "base-building-spell-71"),
    UTAG("base-building", "base-building-spell-72"),
    UTAG("base-building", "base-building-spell-73"),
    UTAG("base-building", "base-building-spell-74"),
    UTAG("base-building", "base-building-spell-75"),
    UTAG("base-building", "base-building-spell-76"),
    0, // key 77 «Улучшение базы» — услуга, тега спелла не существует
    UTAG("base-building", "base-building-spell-78"),
    UTAG("base-building", "base-building-spell-79"),
    UTAG("base-building", "base-building-spell-80"),
    UTAG("base-building", "base-building-spell-81"),
    UTAG("base-building", "base-building-spell-82"),
    UTAG("base-building", "base-building-spell-83"),
    UTAG("base-building", "base-building-spell-84"),
    UTAG("base-building", "base-building-spell-85"),
    UTAG("base-building", "base-building-spell-86"),
    UTAG("base-building", "base-building-spell-87"),
    UTAG("base-building", "base-building-spell-88"),
    UTAG("base-building", "base-building-spell-89"),
    UTAG("base-building", "base-building-spell-90"),
    UTAG("base-building", "base-building-spell-91"),
    UTAG("base-building", "base-building-spell-92"),
    UTAG("base-building", "base-building-spell-93"),
    UTAG("base-building", "base-building-spell-94"),
    UTAG("base-building", "base-building-spell-95"),
    UTAG("base-building", "base-building-spell-96"),
    UTAG("base-building", "base-building-spell-97"),
    0, // key 98 зарезервирован
    UTAG("base-building", "base-building-spell-99"),
    UTAG("base-building", "base-building-spell-100"),
    UTAG("base-building", "base-building-spell-101"),
    UTAG("base-building", "base-building-spell-102"),
    UTAG("base-building", "base-building-spell-103"),
    UTAG("base-building", "base-building-spell-104"),
    UTAG("base-building", "base-building-spell-105"),
    UTAG("base-building", "base-building-spell-106"),
    UTAG("base-building", "base-building-spell-107"),
    UTAG("base-building", "base-building-spell-108"),
    UTAG("base-building", "base-building-spell-109"),
    UTAG("base-building", "base-building-spell-110"),
    UTAG("base-building", "base-building-spell-111"),
    UTAG("base-building", "base-building-spell-112"),
];
const BUILDING_TOOL_ITEM_IDS: number[] = [
    UTAG("base-building", "base-building-item-0"),
    UTAG("base-building", "base-building-item-1"),
    UTAG("base-building", "base-building-item-2"),
    UTAG("base-building", "base-building-item-3"),
    UTAG("base-building", "base-building-item-4"),
    UTAG("base-building", "base-building-item-5"),
    UTAG("base-building", "base-building-item-6"),
    UTAG("base-building", "base-building-item-7"),
    UTAG("base-building", "base-building-item-8"),
    UTAG("base-building", "base-building-item-9"),
    UTAG("base-building", "base-building-item-10"),
    UTAG("base-building", "base-building-item-11"),
    UTAG("base-building", "base-building-item-12"),
    UTAG("base-building", "base-building-item-13"),
    UTAG("base-building", "base-building-item-14"),
    UTAG("base-building", "base-building-item-15"),
    UTAG("base-building", "base-building-item-16"),
    UTAG("base-building", "base-building-item-17"),
    UTAG("base-building", "base-building-item-18"),
    UTAG("base-building", "base-building-item-19"),
    UTAG("base-building", "base-building-item-20"),
    UTAG("base-building", "base-building-item-21"),
    UTAG("base-building", "base-building-item-22"),
    UTAG("base-building", "base-building-item-23"),
    UTAG("base-building", "base-building-item-24"),
    UTAG("base-building", "base-building-item-25"),
    UTAG("base-building", "base-building-item-26"),
    UTAG("base-building", "base-building-item-27"),
    UTAG("base-building", "base-building-item-28"),
    UTAG("base-building", "base-building-item-29"),
    UTAG("base-building", "base-building-item-30"),
    UTAG("base-building", "base-building-item-31"),
    UTAG("base-building", "base-building-item-32"),
    UTAG("base-building", "base-building-item-33"),
    UTAG("base-building", "base-building-item-34"),
    UTAG("base-building", "base-building-item-35"),
    UTAG("base-building", "base-building-item-36"),
    UTAG("base-building", "base-building-item-37"),
    UTAG("base-building", "base-building-item-38"),
    UTAG("base-building", "base-building-item-39"),
    UTAG("base-building", "base-building-item-40"),
    UTAG("base-building", "base-building-item-41"),
    UTAG("base-building", "base-building-item-42"),
    UTAG("base-building", "base-building-item-43"),
    UTAG("base-building", "base-building-item-44"),
    UTAG("base-building", "base-building-item-45"),
    UTAG("base-building", "base-building-item-46"),
    UTAG("base-building", "base-building-item-47"),
    UTAG("base-building", "base-building-item-48"),
    UTAG("base-building", "base-building-item-49"),
    UTAG("base-building", "base-building-item-50"),
    UTAG("base-building", "base-building-item-51"),
    UTAG("base-building", "base-building-item-52"),
    UTAG("base-building", "base-building-item-53"),
    UTAG("base-building", "base-building-item-54"),
    UTAG("base-building", "base-building-item-55"),
    UTAG("base-building", "base-building-item-56"),
    UTAG("base-building", "base-building-item-57"),
    UTAG("base-building", "base-building-item-58"),
    UTAG("base-building", "base-building-item-59"),
    UTAG("base-building", "base-building-item-60"),
    UTAG("base-building", "base-building-item-61"),
    UTAG("base-building", "base-building-item-62"),
    UTAG("base-building", "base-building-item-63"),
    UTAG("base-building", "base-building-item-64"),
    UTAG("base-building", "base-building-item-65"),
    UTAG("base-building", "base-building-item-66"),
    UTAG("base-building", "base-building-item-67"),
    UTAG("base-building", "base-building-item-68"),
    UTAG("base-building", "base-building-item-69"),
    UTAG("base-building", "base-building-item-70"),
    UTAG("base-building", "base-building-item-71"),
    UTAG("base-building", "base-building-item-72"),
    UTAG("base-building", "base-building-item-73"),
    UTAG("base-building", "base-building-item-74"),
    UTAG("base-building", "base-building-item-75"),
    UTAG("base-building", "base-building-item-76"),
    0, // key 77 «Улучшение базы» — услуга, тега предмета не существует
    UTAG("base-building", "base-building-item-78"),
    UTAG("base-building", "base-building-item-79"),
    UTAG("base-building", "base-building-item-80"),
    UTAG("base-building", "base-building-item-81"),
    UTAG("base-building", "base-building-item-82"),
    UTAG("base-building", "base-building-item-83"),
    UTAG("base-building", "base-building-item-84"),
    UTAG("base-building", "base-building-item-85"),
    UTAG("base-building", "base-building-item-86"),
    UTAG("base-building", "base-building-item-87"),
    UTAG("base-building", "base-building-item-88"),
    UTAG("base-building", "base-building-item-89"),
    UTAG("base-building", "base-building-item-90"),
    UTAG("base-building", "base-building-item-91"),
    UTAG("base-building", "base-building-item-92"),
    UTAG("base-building", "base-building-item-93"),
    UTAG("base-building", "base-building-item-94"),
    UTAG("base-building", "base-building-item-95"),
    UTAG("base-building", "base-building-item-96"),
    UTAG("base-building", "base-building-item-97"),
    0, // key 98 зарезервирован
    UTAG("base-building", "base-building-item-99"),
    UTAG("base-building", "base-building-item-100"),
    UTAG("base-building", "base-building-item-101"),
    UTAG("base-building", "base-building-item-102"),
    UTAG("base-building", "base-building-item-103"),
    UTAG("base-building", "base-building-item-104"),
    UTAG("base-building", "base-building-item-105"),
    UTAG("base-building", "base-building-item-106"),
    UTAG("base-building", "base-building-item-107"),
    UTAG("base-building", "base-building-item-108"),
    UTAG("base-building", "base-building-item-109"),
    UTAG("base-building", "base-building-item-110"),
    UTAG("base-building", "base-building-item-111"),
    UTAG("base-building", "base-building-item-112"),
];

/* --------------------- функциональные постройки ---------------------------- */
const HEARTH_BUFF_SPELL = UTAG("base-building", "base-hearth-buff");
const SHELTER_BUFF_SPELL = UTAG("base-building", "base-shelter-buff");
const BANNER_BUFF_SPELL = UTAG("base-building", "base-banner-buff");
const BUFF_CHECK_INTERVAL = 10000;
const BUFF_TIMER_LOOPS = 0x0fffffff;

/* ------------------------------ отправка ----------------------------------- */
function sendState(player: TSPlayer): void {
    if (!baseClient(player).ready) return;
    const st = new BaseState();
    const flag = BaseFlag.get(player);
    st.hasFlag = flag.hasFlag;
    st.count = BaseBuilding.get(player).Size();
    st.max = limitFor(flag);
    st.woodItems = BUILDING_WOOD_ITEMS;
    st.write().SendToPlayer(player);
}

export function sendError(player: TSPlayer, message: string): void {
    if (!baseClient(player).ready) {
        player.SendBroadcastMessage(`${baseText(player, "Construction", "Строительство")}: ${message}`);
        return;
    }
    sendState(player);
    new ErrorMsg(message).write().SendToPlayer(player);
}

function materialCount(player: TSPlayer, material: BuildingMaterial): number {
    let count = 0;
    for (let i = 0; i < material.entries.length; i++) {
        count += Number(player.GetItemCount(material.entries[i], false));
    }
    return count;
}

export function requireMaterialCost(player: TSPlayer, cost: BuildingMaterial[]): boolean {
    if (cost.length == 0) {
        sendError(player, baseText(
            player,
            "No material cost is configured for this building.",
            "Для этой постройки не настроена стоимость материалов.",
        ));
        return false;
    }
    for (let i = 0; i < cost.length; i++) {
        if (materialCount(player, cost[i]) < cost[i].count) {
            sendError(player, baseText(
                player,
                `Not enough materials in your bags. Required: ${materialCostText(cost, false)}.`,
                `Недостаточно материалов в сумках. Нужно: ${materialCostText(cost, true)}.`,
            ));
            return false;
        }
    }
    return true;
}

export interface MaterialPayment {
    entry: number;
    count: number;
}

function refundMaterialPayment(player: TSPlayer, payment: MaterialPayment[]): void {
    for (let i = 0; i < payment.length; i++) {
        if (!player.AddItem(payment[i].entry, payment[i].count)) {
            sendError(player, baseText(
                player,
                "Some construction materials could not be returned; free space in your bags.",
                "Не удалось вернуть часть строительных материалов: освободите место в сумках.",
            ));
        }
    }
}

const INVENTORY_SLOT_BAG_0 = 255;
const INVENTORY_SLOT_BAG_START = 19;
const INVENTORY_SLOT_BAG_END = 23;
const INVENTORY_SLOT_ITEM_START = 23;
const INVENTORY_SLOT_ITEM_END = 39;
const MAX_BAG_SIZE = 36;

/** Remove matching non-trade stacks from backpack and equipped bags only. */
export function removeCarriedItems(player: TSPlayer, entry: number, requested: number): number {
    let removed = 0;
    for (let slot = INVENTORY_SLOT_ITEM_START; slot < INVENTORY_SLOT_ITEM_END && removed < requested; slot++) {
        const item = player.GetItemByPos(INVENTORY_SLOT_BAG_0, slot);
        if (!item || item.GetEntry() != entry || item.IsInTrade()) continue;
        const take = Math.min(requested - removed, Number(item.GetCount()));
        if (take <= 0) continue;
        player.RemoveItem(item, take);
        removed += take;
    }
    for (let bag = INVENTORY_SLOT_BAG_START; bag < INVENTORY_SLOT_BAG_END && removed < requested; bag++) {
        for (let slot = 0; slot < MAX_BAG_SIZE && removed < requested; slot++) {
            const item = player.GetItemByPos(bag, slot);
            if (!item || item.GetEntry() != entry || item.IsInTrade()) continue;
            const take = Math.min(requested - removed, Number(item.GetCount()));
            if (take <= 0) continue;
            player.RemoveItem(item, take);
            removed += take;
        }
    }
    return removed;
}

/** Сначала расходуются младшие тиры; снимаются только конкретные стаки из сумок. */
export function consumeMaterialCost(
    player: TSPlayer,
    cost: BuildingMaterial[],
): MaterialPayment[] | undefined {
    if (!requireMaterialCost(player, cost)) return undefined;
    const payment: MaterialPayment[] = [];
    for (let i = 0; i < cost.length; i++) {
        let remaining = cost[i].count;
        for (let j = 0; j < cost[i].entries.length && remaining > 0; j++) {
            const entry = cost[i].entries[j];
            const take = Math.min(remaining, Number(player.GetItemCount(entry, false)));
            if (take > 0) {
                const removed = removeCarriedItems(player, entry, take);
                if (removed > 0) payment.push({ entry: entry, count: removed });
                remaining -= removed;
            }
        }
        if (remaining > 0) {
            refundMaterialPayment(player, payment);
            sendError(player, baseText(
                player,
                "Materials could not be consumed. Remove them from the trade window and try again.",
                "Не удалось списать материалы. Уберите их из окна обмена и повторите попытку.",
            ));
            return undefined;
        }
    }
    return payment;
}

/* ------------------------------ утилиты ------------------------------------ */
/** Unix-время в СЕКУНДАХ. ВНИМАНИЕ: GetUnixTime() ядра возвращает МИЛЛИСЕКУНДЫ. */
export function nowUnix(): number {
    return Math.floor(Number(GetUnixTime()) / 1000);
}

/** Старые строки могли сохранить время в мс (до фикса) — нормализуем в секунды. */
export function normTime(v: number): number {
    return v > 40000000000 ? Math.floor(v / 1000) : v;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

function playerNameByGuid(guid: number): string {
    const result = QueryCharacters(`SELECT name FROM characters WHERE guid = ${guid} LIMIT 1`);
    if (result.GetRow()) return result.GetString(0);
    return `#${guid}`;
}

function flagEntry(player: TSPlayer): number {
    return player.IsHorde() ? HORDE_FLAG_ENTRY : FLAG_ENTRY;
}

/** «Улучшение базы»: за материалы повышает уровень флага (радиус + лимит построек). */
function upgradeBase(player: TSPlayer): void {
    const flag = BaseFlag.get(player);
    if (flag.baseLevel >= BASE_MAX_LEVEL) {
        sendError(player, baseText(player, "Your base is already at maximum level.", "Ваша база уже максимального уровня."));
        return;
    }
    const cost = buildingMaterialCost(UPGRADE_KEY);
    if (!consumeMaterialCost(player, cost)) return;
    flag.baseLevel = flag.baseLevel + 1;
    flag.Save();
    sendError(player, baseText(
        player,
        `Base upgraded to level ${flag.baseLevel + 1}: construction radius ${radiusFor(flag)} yards, building limit ${limitFor(flag)}.`,
        `База улучшена до уровня ${flag.baseLevel + 1}: радиус строительства ${radiusFor(flag)} ярдов, лимит построек ${limitFor(flag)}.`,
    ));
}

function grantPatchToolItem(player: TSPlayer, entry: number): void {
    if (!isPatchBuildingEntry(entry)) {
        sendError(player, baseText(player, "This object is unavailable for construction.", "Этот объект недоступен для строительства."));
        return;
    }

    const patchIndex = PATCH_BUILDING_ENTRIES.indexOf(entry);
    const itemId = patchIndex >= 0 ? PATCH_PREVIEW_ITEM_IDS[patchIndex] || 0 : 0;

    const flag = BaseFlag.get(player);
    if (flag.hasFlag == 0) {
        sendError(player, baseText(player, "Get and place a base flag first.", "Сначала получите и установите флаг базы."));
        return;
    }
    if (!itemId) {
        sendError(player, baseText(player, "The placement item was not found. Run build data.", "Предмет установки не найден. Требуется build data."));
        return;
    }
    const pendingIndex = PATCH_BUILDING_ENTRIES.indexOf(flag.pendingPatchEntry);
    const pendingItemId = pendingIndex >= 0 ? PATCH_PREVIEW_ITEM_IDS[pendingIndex] || 0 : 0;
    if (
        (PATCH_TOOL_ITEM_ID != 0 && player.HasItem(PATCH_TOOL_ITEM_ID, 1, true)) ||
        player.HasItem(itemId, 1, true) ||
        (pendingItemId != 0 && player.HasItem(pendingItemId, 1, true))
    ) {
        sendError(player, baseText(player, "You already have a placement tool. Use it first.", "У вас уже есть установка. Сначала используйте её."));
        return;
    }
    if (!player.AddItem(itemId, 1)) {
        sendError(player, baseText(player, "The placement tool could not be granted; free space in your bags.", "Не удалось выдать установку: освободите место в сумках."));
        return;
    }

    flag.pendingPatchEntry = entry;
    flag.Save();
    sendError(player, baseText(
        player,
        `Received a placement tool for object entry ${entry}. Materials will be charged after placement.`,
        `Получена установка объекта entry ${entry}. Материалы спишутся после размещения.`,
    ));
}

function grantToolItem(player: TSPlayer, key: number): void {
    if (isPatchBuildingEntry(key)) {
        grantPatchToolItem(player, key);
        return;
    }

    let itemId = FLAG_TOOL_ITEM_ID;
    let toolName = baseText(player, "base flag", "флага базы");
    const generator = resourceGeneratorByKey(key);

    if (key == FLAG_TOOL_KEY) {
        if (BaseFlag.get(player).hasFlag == 1) {
            sendError(player, baseText(player, "You already have a base flag.", "У вас уже установлен флаг базы."));
            return;
        }
    } else if (generator) {
        const flag = BaseFlag.get(player);
        if (flag.hasFlag == 0) {
            sendError(player, baseText(player, "Get and place a base flag first.", "Сначала получите и установите флаг базы."));
            return;
        }
        itemId = RESOURCE_GENERATOR_TOOL_ITEM_ID;
        toolName = isRussianClient(player) ? generator.nameRu : generator.nameEn;
    } else {
        const building = buildingByKey(key);
        if (!building) {
            sendError(player, baseText(player, "Unknown construction tool.", "Неизвестный строительный инструмент."));
            return;
        }
        if (BaseFlag.get(player).hasFlag == 0) {
            sendError(player, baseText(player, "Get and place a base flag first.", "Сначала получите и установите флаг базы."));
            return;
        }
        if (!canAddBuildingCopy(player, key)) return;
        if (building.kind == "service") {
            // «Улучшение базы»: не предмет — мгновенная услуга
            upgradeBase(player);
            return;
        }
        itemId = BUILDING_TOOL_ITEM_IDS[building.key] || 0;
        toolName = buildingName(building, isRussianClient(player));
    }

    if (!itemId) {
        sendError(player, baseText(player, "The construction item was not found. Run build data.", "Предмет строительства не найден. Требуется build data."));
        return;
    }
    if (player.HasItem(itemId, 1, true)) {
        sendError(player, baseText(
            player,
            `The “${toolName}” tool is already in your inventory or bank.`,
            `Инструмент «${toolName}» уже находится у вас или в банке.`,
        ));
        return;
    }
    if (!player.AddItem(itemId, 1)) {
        sendError(player, baseText(player, "The item could not be granted; free space in your bags.", "Не удалось выдать предмет: освободите место в сумках."));
        return;
    }

    if (generator) {
        const flag = BaseFlag.get(player);
        flag.pendingGeneratorKey = key;
        flag.Save();
    }

    sendError(player, baseText(
        player,
        `Received construction tool: ${toolName}. It will disappear after use.`,
        `Получен строительный инструмент: ${toolName}. После использования он исчезнет.`,
    ));
}

function buildingCopyCount(player: TSPlayer, key: number): number {
    let count = 0;
    BaseBuilding.get(player).forEach(row => {
        if (row.catKey == key) count++;
    });
    return count;
}

function canAddBuildingCopy(player: TSPlayer, key: number): boolean {
    const maximum = maxBuildingCopies(key);
    if (maximum == 0 || buildingCopyCount(player, key) < maximum) return true;
    const building = buildingByKey(key);
    const name = building ? buildingName(building, isRussianClient(player)) : baseText(player, "building", "постройка");
    sendError(player, baseText(
        player,
        `The “${name}” limit has been reached: ${maximum}.`,
        `Достигнут лимит «${name}»: ${maximum}.`,
    ));
    return false;
}

function findBlockingFlag(player: TSPlayer, x: number, y: number, range: number): BaseFlag | undefined {
    const range2 = range * range;
    const minX = x - range;
    const maxX = x + range;
    const minY = y - range;
    const maxY = y + range;
    let blocking: BaseFlag | undefined = undefined;

    QueryDBEntry(BaseFlag, `WHERE hasflag = 1 AND mapid = ${player.GetMapID()} AND playerguid <> ${player.GetGUIDLow()} AND x >= ${minX} AND x <= ${maxX} AND y >= ${minY} AND y <= ${maxY}`).forEach(flag => {
        if (blocking) return;
        if (dist2(x, y, flag.x, flag.y) <= range2) blocking = flag;
    });

    return blocking;
}

function nearestFlag(player: TSPlayer, range: number): BaseFlag | undefined {
    const x = player.GetX();
    const y = player.GetY();
    const range2 = range * range;
    let best: BaseFlag | undefined = undefined;
    let bestD = range2;

    QueryDBEntry(BaseFlag, `WHERE hasflag = 1 AND mapid = ${player.GetMapID()} AND x >= ${x - range} AND x <= ${x + range} AND y >= ${y - range} AND y <= ${y + range}`).forEach(flag => {
        const d = dist2(x, y, flag.x, flag.y);
        if (d <= bestD) {
            bestD = d;
            best = flag;
        }
    });

    return best;
}

function flagByGameObject(obj: TSGameObject): BaseFlag | undefined {
    let found: BaseFlag | undefined = undefined;
    QueryDBEntry(BaseFlag, `WHERE hasflag = 1 AND mapid = ${obj.GetMapID()} AND spawnguid = ${obj.GetGUIDLow()} LIMIT 1`).forEach(flag => {
        if (!found) found = flag;
    });
    if (found) return found;

    QueryDBEntry(BaseFlag, `WHERE hasflag = 1 AND mapid = ${obj.GetMapID()} AND x >= ${obj.GetX() - 1.0} AND x <= ${obj.GetX() + 1.0} AND y >= ${obj.GetY() - 1.0} AND y <= ${obj.GetY() + 1.0}`).forEach(flag => {
        if (found) return;
        if (dist2(obj.GetX(), obj.GetY(), flag.x, flag.y) <= SAME_SPOT_EPS2) found = flag;
    });

    return found;
}

export function liveGameObject(player: TSPlayer, spawnGuid: number, entry: number): TSGameObject | undefined {
    if (spawnGuid == 0) return undefined;
    return player.GetMap().GetGameObject(CreateGUID(HighGuid.GameObject, entry, spawnGuid))
        || player.GetMap().GetGameObjectByDBGUID(spawnGuid);
}

export function removeStoredGameObject(
    player: TSPlayer,
    spawnGuid: number,
    entry?: number,
    x?: number,
    y?: number,
    mapId?: number,
): void {
    if (spawnGuid != 0) {
        const live = entry == undefined ? undefined
            : player.GetMap().GetGameObject(CreateGUID(HighGuid.GameObject, entry, spawnGuid));
        if (live && (entry == undefined || live.GetEntry() == entry) &&
            (x == undefined || y == undefined || dist2(live.GetX(), live.GetY(), x, y) <= SAME_SPOT_EPS2)) {
            live.RemoveFromWorld(true);
        }

        const legacyDb = player.GetMap().GetGameObjectByDBGUID(spawnGuid);
        if (legacyDb && (entry == undefined || legacyDb.GetEntry() == entry) &&
            (x == undefined || y == undefined || dist2(legacyDb.GetX(), legacyDb.GetY(), x, y) <= SAME_SPOT_EPS2)) {
            legacyDb.RemoveFromWorld(true);
        }

        // Старый GUID может уже принадлежать совершенно другому объекту. Если
        // известны entry/координаты, удаляем world-строку только при полном
        // совпадении с нашей сохранённой постройкой.
        if (entry != undefined && x != undefined && y != undefined) {
            QueryWorld(
                `DELETE FROM gameobject WHERE guid = ${spawnGuid} AND id = ${entry} ` +
                `AND position_x >= ${x - 1.0} AND position_x <= ${x + 1.0} ` +
                `AND position_y >= ${y - 1.0} AND position_y <= ${y + 1.0}`,
            );
        } else {
            QueryWorld(`DELETE FROM gameobject WHERE guid = ${spawnGuid}`);
        }
    }

    if (entry != undefined && x != undefined && y != undefined && mapId != undefined) {
        QueryWorld(
            `DELETE FROM gameobject WHERE map = ${mapId} AND id = ${entry} ` +
            `AND position_x >= ${x - 1.0} AND position_x <= ${x + 1.0} ` +
            `AND position_y >= ${y - 1.0} AND position_y <= ${y + 1.0}`,
        );
    }

    if (entry == undefined || x == undefined || y == undefined) return;
    player.GetGameObjectsInRange(MANAGE_RANGE + 3.0, entry, 0).forEach(go => {
        if (dist2(go.GetX(), go.GetY(), x, y) <= SAME_SPOT_EPS2) go.RemoveFromWorld(true);
    });
}

function removeStoredFlag(player: TSPlayer, spawnGuid: number, mapId: number, x: number, y: number): void {
    removeStoredGameObject(player, spawnGuid, FLAG_ENTRY, x, y, mapId);
    removeStoredGameObject(player, spawnGuid, HORDE_FLAG_ENTRY, x, y, mapId);
    QueryWorld(
        `DELETE FROM gameobject WHERE map = ${mapId} AND id IN (${FLAG_ENTRY}, ${HORDE_FLAG_ENTRY}) ` +
        `AND position_x >= ${x - 1.0} AND position_x <= ${x + 1.0} ` +
        `AND position_y >= ${y - 1.0} AND position_y <= ${y + 1.0}`,
    );
}

export function spawnVisible(player: TSPlayer, entry: number, x: number, y: number, z: number, o: number, phaseMask: number): TSGameObject | undefined {
    // TSGameObject.SaveToDB() без аргументов работает только для уже
    // существующего DB-spawn. Источник истины здесь — таблицы модуля;
    // после рестарта объект восстанавливается из сохранённых координат.
    return player.GetMap().SpawnGameObject(entry, x, y, z, o, 0, phaseMask);
}

function markDecorative(go: TSGameObject | undefined): TSGameObject | undefined {
    if (go) go.SetFlag(GameObjectFields.GAMEOBJECT_FLAGS, GO_FLAGS_DECORATIVE);
    return go;
}

export function spawnDecorativeVisible(player: TSPlayer, entry: number, x: number, y: number, z: number, o: number, phaseMask: number): TSGameObject | undefined {
    return markDecorative(spawnVisible(player, entry, x, y, z, o, phaseMask));
}

function spawnPatchVisible(player: TSPlayer, entry: number, x: number, y: number, z: number, o: number, phaseMask: number): number {
    const go = spawnDecorativeVisible(player, entry, x, y, z, o, phaseMask);
    return go ? go.GetGUIDLow() : 0;
}

function needsRespawn(
    player: TSPlayer,
    spawnGuid: number,
    entry: number,
    x?: number,
    y?: number,
): boolean {
    const live = liveGameObject(player, spawnGuid, entry);
    return !live || live.GetEntry() != entry
        || (x !== undefined && y !== undefined
            && dist2(live.GetX(), live.GetY(), x, y) > SAME_SPOT_EPS2);
}

/* ------------------------- NPC-постройки (kind="npc") ---------------------- */
const NPC_FRIENDLY_FACTION = 35;  // Friendly to all: зелёные, но НЕ могут атаковать
// FactionTemplate 1665: friend=7 (игроки обеих фракций), enemy=8 (монстры) —
// защитники сами агрят рейдеров (фракции 14/16) и дружелюбны игрокам
const GUARD_FACTION = 1665;
const GUARD_ENTRY = UTAG("base-building", "npc/base-guard");
const ARCHER_ENTRY = UTAG("base-building", "npc/base-archer");
const HEALER_ENTRY = UTAG("base-building", "npc/base-healer");
const TRAINING_DUMMY_ENTRY = UTAG("base-building", "npc/base-training-dummy");
const STOCK_DECORATION_ENTRIES: number[] = [
    UTAG("base-building", "go/base-decoration-0"),
    UTAG("base-building", "go/base-decoration-1"),
    UTAG("base-building", "go/base-decoration-2"),
    UTAG("base-building", "go/base-decoration-3"),
    UTAG("base-building", "go/base-decoration-4"),
    UTAG("base-building", "go/base-decoration-5"),
    UTAG("base-building", "go/base-decoration-6"),
    UTAG("base-building", "go/base-decoration-7"),
    UTAG("base-building", "go/base-decoration-8"),
    UTAG("base-building", "go/base-decoration-9"),
    UTAG("base-building", "go/base-decoration-10"),
    UTAG("base-building", "go/base-decoration-11"),
    0, // key 12 is the functional cooking table
    UTAG("base-building", "go/base-decoration-13"),
];

function buildingEntry(b: Building): number {
    if ((b.key >= 0 && b.key <= 11) || b.key == 13) return STOCK_DECORATION_ENTRIES[b.key];
    if (b.key == GUARD_KEY) return GUARD_ENTRY;
    if (b.key == ARCHER_KEY) return ARCHER_ENTRY;
    if (b.key == HEALER_KEY) return HEALER_ENTRY;
    if (b.key == TRAINING_DUMMY_KEY) return TRAINING_DUMMY_ENTRY;
    return b.entry;
}

function isNpcBuilding(catKey: number): boolean {
    const b = buildingByKey(catKey);
    return b !== undefined && b.kind == "npc";
}

/**
 * Живой NPC постройки. ВАЖНО: TSMap.GetCreature(lowGuid) НЕ работает — полный
 * GUID существа включает entry, из одного счётчика его не собрать. Поэтому
 * сканируем существ нужного entry и матчим по low guid.
 */
function findSpawnedCreature(player: TSPlayer, row: BaseBuilding): TSCreature | undefined {
    if (row.spawnGuid == 0) return undefined;
    return player.GetMap().GetCreature(CreateGUID(HighGuid.Unit, row.entry, row.spawnGuid));
}

function needsRespawnCreature(player: TSPlayer, row: BaseBuilding): boolean {
    return findSpawnedCreature(player, row) === undefined;
}

/** Убрать заспавненный объект постройки любого вида (NPC — TempSummon, без строк в мире). */
export function removeStoredBuilding(player: TSPlayer, row: BaseBuilding): void {
    if (row.readyEffectGuid != 0) {
        removeStoredGameObject(
            player,
            row.readyEffectGuid,
            RESOURCE_GENERATOR_READY_EFFECT_ENTRY,
            row.x,
            row.y,
            row.mapId,
        );
        row.readyEffectGuid = 0;
        row.MarkDirty();
    }
    if (isNpcBuilding(row.catKey)) {
        if (row.mapId != player.GetMapID()) return;
        const live = findSpawnedCreature(player, row);
        if (live) {
            // Подчистить дубликаты, накопленные старым lookup через DB-spawn store.
            live.GetCreaturesInRange(3.0, row.entry, 0, 0).forEach(c => {
                if (dist2(c.GetX(), c.GetY(), row.x, row.y) <= SAME_SPOT_EPS2) c.DespawnOrUnsummon(0);
            });
            live.DespawnOrUnsummon(0);
        } else {
            player.GetCreaturesInRange(MANAGE_RANGE + 3.0, row.entry, 0, 0).forEach(c => {
                if (dist2(c.GetX(), c.GetY(), row.x, row.y) <= SAME_SPOT_EPS2) c.DespawnOrUnsummon(0);
            });
        }
        return;
    }
    removeStoredGameObject(player, row.spawnGuid, row.entry, row.x, row.y, row.mapId);
}

/** Спавн постройки по каталожному описанию; возвращает guid или 0. */
function spawnBuildingVisible(player: TSPlayer, b: Building, x: number, y: number, z: number, o: number, phaseMask: number): number {
    if (b.kind == "npc") {
        const c = player.GetMap().SpawnCreature(buildingEntry(b), x, y, z, o, 0, phaseMask);
        if (!c) return 0;
        if (b.key == TRAINING_DUMMY_KEY) {
            // Сохраняем враждебную faction stock-манекена: иначе игрок не сможет
            // начать автоатаку. AI npc_training_dummy не наносит урон и не умирает.
            c.SetFaction(7);
            c.SetLevel(Math.max(1, player.GetLevel()));
            c.UpdateLevelDependantStats();
            c.SetHealth(Number(c.GetMaxHealth()));
            c.SetReactState(0);
        } else if (b.key == HEALING_DUMMY_KEY) {
            c.SetFaction(NPC_FRIENDLY_FACTION);
            c.SetLevel(Math.max(1, player.GetLevel()));
            c.UpdateLevelDependantStats();
            c.SetHealth(Math.max(1, Math.floor(Number(c.GetMaxHealth()) * 0.5)));
            c.SetReactState(0);
        } else if (contains(GUARD_KEYS, b.key)) {
            c.SetFaction(GUARD_FACTION);       // сам агрит монстров, друг игрокам
            c.SetLevel(Math.min(80, player.GetLevel() + 2));
            c.UpdateLevelDependantStats();     // SetLevel сам по себе не пересчитывает здоровье/урон
            c.SetHealth(Number(c.GetMaxHealth()));
            const scripted = b.key == HEALER_KEY || b.key == BATTLE_MAGE_KEY || b.key == BALLISTA_KEY;
            c.SetReactState(scripted ? 0 : 2);
            if (b.key == BALLISTA_KEY) c.SetRooted(true);
        } else {
            c.SetFaction(NPC_FRIENDLY_FACTION); // сервисные NPC: просто дружелюбны
        }
        return c.GetGUIDLow();
    }
    const go = isDecorativeBuildingKey(b.key) || isInertDefenseBuildingKey(b.key)
        ? spawnDecorativeVisible(player, b.entry, x, y, z, o, phaseMask)
        : spawnVisible(player, b.entry, x, y, z, o, phaseMask);
    return go ? go.GetGUIDLow() : 0;
}

function ensureBaseObjects(player: TSPlayer): void {
    ensureStableBuildingIds(player);
    const mapId = player.GetMapID();
    const flag = BaseFlag.get(player);
    const entry = flagEntry(player);
    if (flag.hasFlag == 1 && flag.mapId == mapId && needsRespawn(player, flag.spawnGuid, entry)) {
        removeStoredFlag(player, flag.spawnGuid, flag.mapId, flag.x, flag.y);
        const phaseMask = flag.phaseMask || player.GetPhaseMaskForSpawn();
        const orientation = flag.o;
        const go = spawnVisible(player, entry, flag.x, flag.y, flag.z, orientation, phaseMask);
        if (go) {
            flag.spawnGuid = go.GetGUIDLow();
            flag.phaseMask = phaseMask;
            flag.o = orientation;
            flag.Save();
        }
    }

    const container = BaseBuilding.get(player);
    let changed = false;
    container.forEach(row => {
        if (row.mapId != mapId) return;
        const b = buildingByKey(row.catKey);
        const patch = isPatchBuildingEntry(row.catKey);
        if (!b && !patch) return;
        const expectedEntry = b ? buildingEntry(b) : row.catKey;
        if (row.entry != expectedEntry) {
            removeStoredBuilding(player, row);
            row.entry = expectedEntry;
            row.spawnGuid = 0;
            row.MarkDirty();
            changed = true;
        }
        const npc = isNpcBuilding(row.catKey);
        if (npc ? !needsRespawnCreature(player, row)
                : !needsRespawn(player, row.spawnGuid, row.entry, row.x, row.y)) {
            if (!npc && (patch || (b !== undefined
                && (isDecorativeBuildingKey(b.key) || isInertDefenseBuildingKey(b.key))))) {
                markDecorative(liveGameObject(player, row.spawnGuid, row.entry));
            }
            return;
        }
        removeStoredBuilding(player, row);
        const phaseMask = row.phaseMask || player.GetPhaseMaskForSpawn();
        const orientation = row.o;
        const guid = b
            ? spawnBuildingVisible(player, b, row.x, row.y, row.z, orientation, phaseMask)
            : spawnPatchVisible(player, expectedEntry, row.x, row.y, row.z, orientation, phaseMask);
        if (guid == 0) return;
        row.spawnGuid = guid;
        row.phaseMask = phaseMask;
        row.o = orientation;
        row.MarkDirty();
        changed = true;
    });
    if (changed) container.Save();
}

/** Спелл возврата на базу должен быть ровно у владельцев флага. */
function syncTeleportSpell(player: TSPlayer): void {
    const hasFlag = BaseFlag.get(player).hasFlag == 1;
    if (hasFlag && !player.HasSpell(TELEPORT_SPELL_ID)) {
        player.LearnSpell(TELEPORT_SPELL_ID);
    } else if (!hasFlag && player.HasSpell(TELEPORT_SPELL_ID)) {
        player.RemoveSpell(TELEPORT_SPELL_ID, false, false);
    }
}

/** Ближайшая своя постройка к игроку на его карте в пределах MANAGE_RANGE. */
function nearestOwned(player: TSPlayer): BaseBuilding | undefined {
    const container = BaseBuilding.get(player);
    const px = player.GetX();
    const py = player.GetY();
    const mapId = player.GetMapID();
    let best: BaseBuilding | undefined = undefined;
    let bestD = MANAGE_RANGE * MANAGE_RANGE;
    container.forEach(row => {
        if (row.mapId != mapId) return;
        const d = dist2(row.x, row.y, px, py);
        if (d <= bestD) {
            bestD = d;
            best = row;
        }
    });
    return best;
}

function distanceFromPlayer2(player: TSPlayer, row: BaseBuilding): number {
    const dx = row.x - player.GetX();
    const dy = row.y - player.GetY();
    const dz = row.z - player.GetZ();
    return dx * dx + dy * dy + dz * dz;
}

function ownedOnCurrentMap(player: TSPlayer): BaseBuilding[] {
    const rows: BaseBuilding[] = [];
    const mapId = player.GetMapID();
    BaseBuilding.get(player).forEach(row => {
        if (row.spawnGuid != 0 && row.mapId == mapId) rows.push(row);
    });
    rows.sort((a, b) => distanceFromPlayer2(player, a) - distanceFromPlayer2(player, b));
    return rows;
}

function clearSelectionMarker(player: TSPlayer): void {
    const client = baseClient(player);
    if (client.markerSpawnGuid != 0 && client.markerMapId == player.GetMapID()) {
        const marker = player.GetMap().GetGameObject(
            CreateGUID(HighGuid.GameObject, MANAGE_MARKER_ENTRY, client.markerSpawnGuid),
        );
        if (marker && marker.GetEntry() == MANAGE_MARKER_ENTRY) marker.RemoveFromWorld(false);
    }
    client.markerSpawnGuid = 0;
    client.markerMapId = 0;
}

function clearSelected(player: TSPlayer): void {
    clearSelectionMarker(player);
    const client = baseClient(player);
    client.selectedSpawnGuid = 0;
    client.selectedEntry = 0;
}

function selectRow(player: TSPlayer, row: BaseBuilding): void {
    const client = baseClient(player);
    client.selectedSpawnGuid = row.spawnGuid;
    client.selectedEntry = row.entry;
}

function selectedOwned(player: TSPlayer): BaseBuilding | undefined {
    const client = baseClient(player);
    if (client.selectedSpawnGuid == 0 || client.selectedEntry == 0) return undefined;

    const mapId = player.GetMapID();
    let selected: BaseBuilding | undefined = undefined;
    BaseBuilding.get(player).forEach(row => {
        if (
            !selected && row.spawnGuid == client.selectedSpawnGuid && row.entry == client.selectedEntry &&
            row.mapId == mapId
        ) {
            selected = row;
        }
    });
    if (!selected) clearSelected(player);
    return selected;
}

function sendManageState(player: TSPlayer): void {
    const selected = selectedOwned(player);
    const rows = ownedOnCurrentMap(player);
    const items: ManageEntry[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        items.push(new ManageEntry(
            row.spawnGuid,
            row.entry,
            row.catKey,
            Math.sqrt(distanceFromPlayer2(player, row)),
        ));
    }
    new ManageState(
        selected ? selected.spawnGuid : 0,
        selected ? selected.entry : 0,
        items,
    ).write().SendToPlayer(player);
}

function flashSelected(player: TSPlayer, row: BaseBuilding): void {
    clearSelectionMarker(player);
    const marker = spawnDecorativeVisible(
        player,
        MANAGE_MARKER_ENTRY,
        row.x,
        row.y,
        row.z + 0.1,
        row.o,
        row.phaseMask || player.GetPhaseMaskForSpawn(),
    );
    if (!marker) return;
    const client = baseClient(player);
    client.markerSpawnGuid = marker.GetGUIDLow();
    client.markerMapId = player.GetMapID();
    marker.AddTimer(MANAGE_MARKER_MS, 1, (owner, timer) => {
        const go = owner.ToGameObject();
        if (go) go.RemoveFromWorld(false);
    });
}

/** Удалить текущий объект и заспавнить заново; при ошибке восстановить прежний. */
function respawnBuilding(player: TSPlayer, row: BaseBuilding, x: number, y: number, z: number, o: number): boolean {
    const b = buildingByKey(row.catKey);
    const patch = isPatchBuildingEntry(row.catKey);
    if (!b && !patch) return false;

    const entry = b ? buildingEntry(b) : row.catKey;
    const phaseMask = row.phaseMask || player.GetPhaseMaskForSpawn();
    if (row.mapId == player.GetMapID() && row.spawnGuid != 0) {
        removeStoredBuilding(player, row);
    }
    const guid = b
        ? spawnBuildingVisible(player, b, x, y, z, o, phaseMask)
        : spawnPatchVisible(player, entry, x, y, z, o, phaseMask);
    if (guid == 0) {
        row.spawnGuid = b
            ? spawnBuildingVisible(player, b, row.x, row.y, row.z, row.o, phaseMask)
            : spawnPatchVisible(player, entry, row.x, row.y, row.z, row.o, phaseMask);
        row.MarkDirty();
        BaseBuilding.get(player).Save();
        return false;
    }

    row.entry = entry;
    row.spawnGuid = guid;
    row.x = x;
    row.y = y;
    row.z = z;
    row.o = o;
    row.mapId = player.GetMapID();
    row.MarkDirty();
    BaseBuilding.get(player).Save();
    return true;
}

function canMoveSelectedTo(player: TSPlayer, x: number, y: number, z: number): boolean {
    const flag = BaseFlag.get(player);
    if (flag.hasFlag == 0 || flag.mapId != player.GetMapID()) {
        sendError(player, baseText(player, "Your base flag is on another map or missing.", "Флаг вашей базы находится на другой карте или отсутствует."));
        return false;
    }
    if (!requireNonCityPlacement(player, x, y, z)) return false;

    const radius = radiusFor(flag);
    if (dist2(x, y, flag.x, flag.y) > radius * radius) {
        sendError(player, baseText(
            player,
            `The building must remain within ${radius} yards of the flag.`,
            `Постройка должна оставаться в пределах ${radius} ярдов от флага.`,
        ));
        return false;
    }
    const blocked = findBlockingFlag(player, x, y, RADIUS_MAX);
    if (blocked) {
        sendError(player, baseText(
            player,
            `This point is inside ${playerNameByGuid(blocked.playerGUID)}'s base territory.`,
            `Эта точка находится на территории базы игрока ${playerNameByGuid(blocked.playerGUID)}.`,
        ));
        return false;
    }

    return true;
}

/* --------------------------- спелл: флаг базы ------------------------------ */
function canPlaceFlag(player: TSPlayer, dest: TSPosition): boolean {
    const flag = BaseFlag.get(player);
    if (flag.hasFlag == 1) {
        sendError(player, baseText(player, "You already have a base. Demolish it and its buildings first.", "У вас уже есть база. Сначала снесите её вместе с постройками."));
        return false;
    }
    if (!requireNonCityPlacement(player, dest.x, dest.y, dest.z)) return false;
    const blocked = findBlockingFlag(player, dest.x, dest.y, FLAG_MIN_DISTANCE);
    if (blocked) {
        sendError(player, baseText(
            player,
            `The flag cannot be placed this close to ${playerNameByGuid(blocked.playerGUID)}'s base.`,
            `Нельзя ставить флаг так близко к базе игрока ${playerNameByGuid(blocked.playerGUID)}.`,
        ));
        return false;
    }
    return true;
}

function placeFlag(player: TSPlayer, dest: TSPosition): void {
    if (!canPlaceFlag(player, dest)) return;
    const flag = BaseFlag.get(player);
    const entry = flagEntry(player);

    const o = player.GetO();
    const phaseMask = player.GetPhaseMaskForSpawn();
    const go = spawnVisible(player, entry, dest.x, dest.y, dest.z, o, phaseMask);
    if (!go) {
        sendError(player, baseText(player, "The flag could not be placed.", "Не удалось поставить флаг."));
        return;
    }
    flag.hasFlag = 1;
    flag.mapId = player.GetMapID();
    flag.x = dest.x;
    flag.y = dest.y;
    flag.z = dest.z;
    flag.o = o;
    flag.phaseMask = phaseMask;
    flag.spawnGuid = go.GetGUIDLow();
    flag.Save();
    syncTeleportSpell(player);

    sendError(player, baseText(
        player,
        "Base flag placed. You can now build near it. You learned Return to Base, which teleports you to the flag every 5 minutes.",
        "Флаг базы установлен. Теперь стройте рядом с ним. Вы выучили «Возврат на базу» — телепорт к флагу раз в 5 минут.",
    ));
}

/* ----------------------- спелл: строить постройку -------------------------- */
function canPlaceAtBase(player: TSPlayer, dest: TSPosition): boolean {
    const flag = BaseFlag.get(player);
    if (flag.hasFlag == 0) {
        sendError(player, baseText(player, "Place a base flag first.", "Сначала поставьте флаг базы."));
        return false;
    }
    if (flag.mapId != player.GetMapID()) {
        sendError(player, baseText(player, "Your base flag is on another map.", "Флаг вашей базы на другой карте."));
        return false;
    }
    if (!requireNonCityPlacement(player, dest.x, dest.y, dest.z)) return false;

    const radius = radiusFor(flag);
    if (dist2(dest.x, dest.y, flag.x, flag.y) > radius * radius) {
        sendError(player, baseText(player, `Build within ${radius} yards of the flag.`, `Стройте в пределах ${radius} ярдов от флага.`));
        return false;
    }
    // чужой радиус может быть прокачан — проверяем по максимальному
    const blocked = findBlockingFlag(player, dest.x, dest.y, RADIUS_MAX);
    if (blocked) {
        sendError(player, baseText(
            player,
            `This point is inside ${playerNameByGuid(blocked.playerGUID)}'s base territory.`,
            `Эта точка находится на территории базы игрока ${playerNameByGuid(blocked.playerGUID)}.`,
        ));
        return false;
    }

    const container = BaseBuilding.get(player);
    const limit = limitFor(flag);
    if (container.Size() >= limit) {
        sendError(player, baseText(
            player,
            `Building limit reached (${limit}). Upgrade your base in the construction menu.`,
            `Достигнут лимит построек (${limit}). Улучшите базу в меню строительства.`,
        ));
        return false;
    }
    return true;
}

function canPlaceBuilding(player: TSPlayer, key: number, dest: TSPosition): boolean {
    const b = buildingByKey(key);
    if (!b) {
        sendError(player, baseText(player, "Unknown building.", "Неизвестная постройка."));
        return false;
    }
    if (!canPlaceAtBase(player, dest)) return false;
    if (!canAddBuildingCopy(player, key)) return false;
    return requireMaterialCost(player, buildingMaterialCost(key));
}

function canPlacePatchBuilding(player: TSPlayer, expectedEntry: number, itemId: number, dest: TSPosition): boolean {
    const flag = BaseFlag.get(player);
    if (!isPatchBuildingEntry(expectedEntry) || flag.pendingPatchEntry != expectedEntry) {
        sendError(player, baseText(player, "No placement is selected for this item.", "Для этого предмета не выбрана установка."));
        return false;
    }
    if (itemId == 0 || !player.HasItem(itemId, 1, false)) {
        sendError(player, baseText(player, "The placement item must be in your bags.", "Предмет установки должен находиться в сумках."));
        return false;
    }
    if (!canPlaceAtBase(player, dest)) return false;
    return requireMaterialCost(player, DECORATION_MATERIAL_COST);
}

function placeCheckedBuilding(player: TSPlayer, key: number, dest: TSPosition): boolean {
    const b = buildingByKey(key);
    if (!b) return false;
    if (!canPlaceAtBase(player, dest)) return false;
    // Повторяем authoritative cap после OnCheckCast: сохранённый чертёж и
    // параллельное размещение не должны обходить лимит экземпляров.
    if (!canAddBuildingCopy(player, key)) return false;
    const firstCopy = buildingCopyCount(player, key) == 0;
    const cost = buildingMaterialCost(key);
    const payment = consumeMaterialCost(player, cost);
    if (!payment) return false;

    const o = player.GetO();
    const phaseMask = player.GetPhaseMaskForSpawn();
    const guid = spawnBuildingVisible(player, b, dest.x, dest.y, dest.z, o, phaseMask);
    if (guid == 0) {
        refundMaterialPayment(player, payment);
        sendError(player, baseText(player, "The building could not be placed here.", "Не удалось разместить постройку здесь."));
        return false;
    }
    const buildingId = allocateBuildingId(player);
    const container = BaseBuilding.get(player);
    const row = container.Add(new BaseBuilding(player.GetGUIDLow()));
    row.buildingId = buildingId;
    row.catKey = key;
    row.entry = buildingEntry(b);
    row.mapId = player.GetMapID();
    row.x = dest.x;
    row.y = dest.y;
    row.z = dest.z;
    row.o = o;
    row.phaseMask = phaseMask;
    row.spawnGuid = guid;
    row.lastHarvest = nowUnix(); // старт отсчёта для производственных построек
    row.MarkDirty();
    finishBuildingPlacement(player, row, firstCopy);
    container.Save();

    sendError(player, baseText(
        player,
        `Built: ${buildingName(b, false)}. Select it in Management to edit it.`,
        `Построено: ${b.name}. Выберите объект в разделе «Управление» для правки.`,
    ));
    return true;
}

function placeCheckedPatchBuilding(player: TSPlayer, entry: number, dest: TSPosition): boolean {
    const flag = BaseFlag.get(player);
    if (!isPatchBuildingEntry(entry) || flag.pendingPatchEntry != entry) return false;
    if (!canPlaceAtBase(player, dest)) return false;
    const payment = consumeMaterialCost(player, DECORATION_MATERIAL_COST);
    if (!payment) return false;

    const o = player.GetO();
    const phaseMask = player.GetPhaseMaskForSpawn();
    const go = spawnDecorativeVisible(player, entry, dest.x, dest.y, dest.z, o, phaseMask);
    if (!go) {
        refundMaterialPayment(player, payment);
        sendError(player, baseText(
            player,
            "The selected object could not be placed here. The placement tool was preserved.",
            "Не удалось разместить выбранный объект здесь. Установка сохранена.",
        ));
        return false;
    }

    const buildingId = allocateBuildingId(player);
    const container = BaseBuilding.get(player);
    const row = container.Add(new BaseBuilding(player.GetGUIDLow()));
    row.buildingId = buildingId;
    row.catKey = entry;
    row.entry = entry;
    row.mapId = player.GetMapID();
    row.x = dest.x;
    row.y = dest.y;
    row.z = dest.z;
    row.o = o;
    row.phaseMask = phaseMask;
    row.spawnGuid = go.GetGUIDLow();
    row.lastHarvest = nowUnix();
    row.MarkDirty();
    container.Save();

    flag.pendingPatchEntry = 0;
    flag.Save();
    sendError(player, baseText(
        player,
        `Object entry ${entry} placed. Select it in Management to edit it.`,
        `Объект entry ${entry} установлен. Выберите его в разделе «Управление» для правки.`,
    ));
    return true;
}

function clearBase(player: TSPlayer): void {
    clearSelected(player);
    const flag = BaseFlag.get(player);
    if (flag.hasFlag == 0) {
        sendError(player, baseText(player, "You do not have a base to demolish.", "У вас нет базы для сноса."));
        sendManageState(player);
        return;
    }

    // Старые базы могли остаться далеко, на другой карте или со spawnGuid=0.
    // Свою базу игрок должен иметь возможность удалить из любой точки.
    const oldFlagMap = flag.mapId;
    const oldFlagX = flag.x;
    const oldFlagY = flag.y;
    const oldFlagSpawnGuid = flag.spawnGuid;
    const container = BaseBuilding.get(player);
    const oldBuildings = container.ToArray();

    // Settle each final station target and release every exact generator target
    // while its source row still exists. Marking rows one by one lets duplicate
    // shared stations remain assigned until the last copy is reached.
    oldBuildings.forEach(row => {
        prepareBuildingRemoval(player, row);
        row.Delete();
    });

    // Remove live buildings while their snapshots are still readable, then
    // durably delete their rows before clearing the flag. A crash between the
    // two saves leaves a retryable empty base instead of orphaned buildings
    // whose owner no longer has a flag and therefore cannot run clear again.
    oldBuildings.forEach(row => removeStoredBuilding(player, row));
    container.Save();

    removeStoredFlag(player, oldFlagSpawnGuid, oldFlagMap, oldFlagX, oldFlagY);
    flag.hasFlag = 0;
    flag.mapId = 0;
    flag.x = 0;
    flag.y = 0;
    flag.z = 0;
    flag.o = 0;
    flag.phaseMask = 0;
    flag.spawnGuid = 0;
    flag.Save();

    syncTeleportSpell(player);
    sendError(player, baseText(player, "The base, flag, and all saved buildings were deleted.", "База, флаг и все сохранённые постройки удалены."));
    sendManageState(player);
}

/* ------------------ производственные постройки и припасы ------------------- */
// Тиры ресурсов по СКИЛЛУ добывающей профессии: [мин. скилл, itemId].
// Пороги — как у добычи в мире (жилы/травы). Нет профессии → скилл 0 → 1-й тир.
export const ORE_TIERS: [number, number][] = [
    [0, BUILDING_ORE_ITEMS[0]],   // Copper Ore
    [65, BUILDING_ORE_ITEMS[1]],  // Tin Ore
    [125, BUILDING_ORE_ITEMS[2]], // Iron Ore
    [175, BUILDING_ORE_ITEMS[3]], // Mithril Ore
    [245, BUILDING_ORE_ITEMS[4]], // Thorium Ore
    [300, BUILDING_ORE_ITEMS[5]], // Fel Iron Ore
    [350, BUILDING_ORE_ITEMS[6]], // Cobalt Ore
    [400, BUILDING_ORE_ITEMS[7]], // Saronite Ore
];
export const HERB_TIERS: [number, number][] = [
    [0, BUILDING_HERB_ITEMS[0]],   // Peacebloom
    [70, BUILDING_HERB_ITEMS[1]],  // Briarthorn
    [125, BUILDING_HERB_ITEMS[2]], // Kingsblood
    [170, BUILDING_HERB_ITEMS[3]], // Goldthorn
    [230, BUILDING_HERB_ITEMS[4]], // Sungrass
    [300, BUILDING_HERB_ITEMS[5]], // Felweed
    [350, BUILDING_HERB_ITEMS[6]], // Goldclover
    [400, BUILDING_HERB_ITEMS[7]], // Icethorn
];
export const MINING_SKILL = 186;
export const HERBALISM_SKILL = 182;
const SUPPLY_GOLD_PER_LEVEL = 1250; // медь за уровень (~10 золотых на 80)
const SUPPLY_RESOURCE_COUNT = 5;

/** Случайный ресурс из тиров, доступных при данном скилле профессии. */
export function randomResourceForSkill(tiers: [number, number][], skill: number): number {
    let unlocked = 0;
    for (let i = 0; i < tiers.length; i++) {
        if (skill >= tiers[i][0]) unlocked = i + 1;
    }
    if (unlocked == 0) unlocked = 1;
    return tiers[Math.floor(Math.random() * unlocked)][1];
}

/** Скилл добычи игрока (0, если профессия не изучена). */
export function gatherSkill(player: TSPlayer, skillId: number): number {
    return player.HasSkill(skillId) ? Number(player.GetSkillValue(skillId)) : 0;
}

/** Своя постройка данного entry в точке кликнутого объекта (или undefined). */
function ownedRowAtObject(player: TSPlayer, obj: TSGameObject): BaseBuilding | undefined {
    let found: BaseBuilding | undefined = undefined;
    BaseBuilding.get(player).forEach(row => {
        if (found) return;
        if (row.entry != obj.GetEntry() || row.mapId != obj.GetMapID()) return;
        if (dist2(row.x, row.y, obj.GetX(), obj.GetY()) <= SAME_SPOT_EPS2) found = row;
    });
    return found;
}

/** Ежедневные припасы за клик по СВОЕМУ флагу: золото + свёрток ресурсов. */
function grantDailySupply(player: TSPlayer, flag: BaseFlag): void {
    const now = nowUnix();
    const left = SUPPLY_COOLDOWN_S - (now - normTime(Number(flag.lastSupply)));
    if (left > 0) {
        const hours = Math.ceil(left / 3600);
        player.SendBroadcastMessage(baseText(
            player,
            `Base supplies will be ready in about ${hours} h.`,
            `Припасы базы будут готовы через ~${hours} ч.`,
        ));
        return;
    }
    // Три разных ресурса могут потребовать по отдельному стеку. Не запускаем
    // суточный cooldown, пока полная посылка гарантированно не помещается.
    if (Number(player.GetFreeInventorySpace()) < 3) {
        player.SendBroadcastMessage(baseText(
            player,
            "Free 3 bag slots for the daily supplies.",
            "Для ежедневных припасов освободите 3 места в сумках.",
        ));
        return;
    }
    flag.lastSupply = now;
    flag.Save();
    const gold = player.GetLevel() * SUPPLY_GOLD_PER_LEVEL;
    player.ModifyMoney(gold);
    player.AddItem(randomResourceForSkill(ORE_TIERS, gatherSkill(player, MINING_SKILL)), SUPPLY_RESOURCE_COUNT);
    player.AddItem(randomResourceForSkill(HERB_TIERS, gatherSkill(player, HERBALISM_SKILL)), SUPPLY_RESOURCE_COUNT);
    player.AddItem(BUILDING_WOOD_ITEMS[0], SUPPLY_RESOURCE_COUNT);
    player.SendBroadcastMessage(baseText(
        player,
        "Daily base supplies received: gold, ore, herbs, and wood.",
        "Ежедневные припасы базы получены: золото, руда, травы и древесина.",
    ));
}

/* ------------------------ проксимити-баффы базы ---------------------------- */
function contains(arr: number[], v: number): boolean {
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] == v) return true;
    }
    return false;
}

/** «Тепло очага» у своего костра, «Кров» у своего жилья. Ауры короткие,
 *  таймер (10с) продлевает их, пока игрок остаётся на базе. */
function applyProximityBuffs(player: TSPlayer): void {
    const mapId = player.GetMapID();
    const px = player.GetX();
    const py = player.GetY();
    let hearth = false;
    let shelter = false;
    let banner = false;
    BaseBuilding.get(player).forEach(row => {
        if (row.mapId != mapId) return;
        const d = dist2(row.x, row.y, px, py);
        if (!hearth && d <= HEARTH_RANGE * HEARTH_RANGE && contains(HEARTH_KEYS, row.catKey)) hearth = true;
        if (!shelter && d <= SHELTER_RANGE * SHELTER_RANGE && contains(SHELTER_KEYS, row.catKey)) shelter = true;
        if (!banner && d <= BANNER_RANGE * BANNER_RANGE && contains(BANNER_KEYS, row.catKey)) banner = true;
    });
    if (hearth) player.AddAura(HEARTH_BUFF_SPELL, player);
    if (shelter) player.AddAura(SHELTER_BUFF_SPELL, player);
    if (banner) player.AddAura(BANNER_BUFF_SPELL, player);
}

/** Манекен лекаря снова создаёт недостающее здоровье каждые 10 секунд, чтобы
 * прямые исцеления и HoT продолжали давать effective healing и лечебные проки. */
function refreshHealingDummies(player: TSPlayer): void {
    const mapId = player.GetMapID();
    BaseBuilding.get(player).forEach(row => {
        if (row.catKey != HEALING_DUMMY_KEY || row.mapId != mapId) return;
        const dummy = findSpawnedCreature(player, row);
        if (!dummy || dummy.IsDead()) return;
        const wantedLevel = Math.max(1, player.GetLevel());
        if (Number(dummy.GetLevel()) != wantedLevel) {
            dummy.SetLevel(wantedLevel);
            dummy.UpdateLevelDependantStats();
        }
        dummy.SetHealth(Math.max(1, Math.floor(Number(dummy.GetMaxHealth()) * 0.5)));
    });
}

function registerPatchPlacement(
    events: TSEvents,
    spellId: number,
    itemId: number,
    fixedEntry: number,
): void {
    if (spellId == 0 || itemId == 0) return;

    events.Spell.OnCheckCast(spellId, (spell, result) => {
        const player = spell.GetCaster().ToPlayer();
        const entry = fixedEntry != 0 ? fixedEntry : (player ? BaseFlag.get(player).pendingPatchEntry : 0);
        if (!player || !canPlacePatchBuilding(player, entry, itemId, spell.GetTargetDest())) {
            result.set(SpellCastResult.FAILED_DONT_REPORT);
        }
    });

    events.Spell.OnEffect(spellId, (spell, cancel, info, mode) => {
        if (mode != SpellEffectHandleMode.HIT) return;
        cancel.set(true);
        const player = spell.GetCaster().ToPlayer();
        if (!player) return;

        const entry = fixedEntry != 0 ? fixedEntry : BaseFlag.get(player).pendingPatchEntry;
        const client = baseClient(player);
        client.patchRefundItemId = itemId;
        if (placeCheckedPatchBuilding(player, entry, spell.GetTargetDest())) {
            client.patchRefundItemId = 0;
        }
    });

    events.Spell.OnAfterCast(spellId, (spell, cancel) => {
        const player = spell.GetCaster().ToPlayer();
        if (!player) return;

        const client = baseClient(player);
        const refundItemId = client.patchRefundItemId;
        client.patchRefundItemId = 0;
        if (refundItemId == 0 || player.AddItem(refundItemId, 1)) return;

        const flag = BaseFlag.get(player);
        flag.pendingPatchEntry = 0;
        flag.Save();
        sendError(player, baseText(
            player,
            "The placement tool could not be returned to your bags. Materials were not charged.",
            "Не удалось вернуть установку в сумки. Материалы не списывались.",
        ));
    });
}

/* ------------------------------ регистрация -------------------------------- */
export function RegisterBaseBuilding(events: TSEvents): void {
    const registerFlagGossip = (entry: number) => events.GameObject.OnGossipHello(entry, (obj, player, cancel) => {
        const flag = flagByGameObject(obj);
        if (!flag) {
            player.SendBroadcastMessage(baseText(player, "Base flag.", "Флаг базы."));
            cancel.set(true);
            return;
        }

        if (flag.playerGUID == player.GetGUIDLow()) {
            // владелец: ежедневные припасы (через кешированный экземпляр игрока,
            // а не строку из QueryDBEntry — иначе кеш устареет)
            grantDailySupply(player, BaseFlag.get(player));
            cancel.set(true);
            return;
        }

        player.SendBroadcastMessage(baseText(
            player,
            `${playerNameByGuid(flag.playerGUID)}'s base flag.`,
            `Флаг базы игрока ${playerNameByGuid(flag.playerGUID)}.`,
        ));
        cancel.set(true);
    });
    registerFlagGossip(FLAG_ENTRY);
    registerFlagGossip(HORDE_FLAG_ENTRY);

    // «Личный сейф»: клик открывает банк игрока. Банковские операции ядра 3.3.5
    // не перепроверяют NPC-флаги (так же работает GM-команда .bank).
    events.GameObject.OnGossipHello(GO_SAFE_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        player.SendShowBank(obj);
    });

    events.GameObject.OnGossipHello(GO_RESTORATION_ALTAR_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        const row = ownedRowAtObject(player, obj);
        if (!row || row.catKey != RESTORATION_ALTAR_KEY) {
            player.SendBroadcastMessage(baseText(player, "Only this base's owner can use the altar.", "Алтарь может использовать только владелец этой базы."));
            return;
        }
        if (Number(player.GetDistance(obj)) > RESTORATION_USE_RANGE) {
            player.SendBroadcastMessage(baseText(player, "Move closer to the altar.", "Подойдите ближе к алтарю."));
            return;
        }
        if (player.IsInCombat()) {
            player.SendBroadcastMessage(baseText(player, "The altar cannot be used in combat.", "Алтарь нельзя использовать в бою."));
            return;
        }

        const flag = BaseFlag.get(player);
        const now = nowUnix();
        const wait = restorationWaitSeconds(Number(flag.lastRestore), now);
        if (wait > 0) {
            player.SendBroadcastMessage(baseText(
                player,
                `The altar will be ready in ${Math.ceil(wait / 60)} min.`,
                `Алтарь восстановится через ${Math.ceil(wait / 60)} мин.`,
            ));
            return;
        }

        player.SetHealth(Number(player.GetMaxHealth()));
        // Lua binding не экспортирует GetPowerType. Selector -1 в TSUnit API
        // означает текущий ресурс (mana/rage/energy/runic power).
        player.SetPower(-1, Number(player.GetMaxPower(-1)));
        flag.lastRestore = now;
        flag.Save();
        player.SendBroadcastMessage(baseText(
            player,
            "The altar fully restored your health and current resource.",
            "Алтарь полностью восстановил здоровье и текущий ресурс.",
        ));
    });

    events.CustomPacket.OnReceive(OP_BASE_REQUEST, (opcode, packet, player) => {
        baseClient(player).ready = true;
        syncTeleportSpell(player);
        ensureBaseObjects(player); // ручной ресинк построек открытием меню /base
        sendState(player);
    });

    events.CustomPacket.OnReceive(OP_BASE_TOOLTIP, (opcode, packet, player) => {
        const msg = new TooltipRequest();
        msg.read(packet);
        const flag = nearestFlag(player, FLAG_TOOLTIP_RANGE);
        if (flag) new TooltipOwnerMsg(playerNameByGuid(flag.playerGUID)).write().SendToPlayer(player);
    });

    events.CustomPacket.OnReceive(OP_BASE_TOOL, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new ToolRequestMsg(FLAG_TOOL_KEY);
        msg.read(packet);
        grantToolItem(player, msg.key);
    });

    registerPatchPlacement(events, PATCH_SPELL_ID, PATCH_TOOL_ITEM_ID, 0);
    for (let i = 0; i < PATCH_BUILDING_ENTRIES.length; i++) {
        registerPatchPlacement(
            events,
            PATCH_PREVIEW_SPELL_IDS[i] || 0,
            PATCH_PREVIEW_ITEM_IDS[i] || 0,
            PATCH_BUILDING_ENTRIES[i],
        );
    }

    events.Spell.OnCheckCast(RESOURCE_GENERATOR_PLACE_SPELL_ID, (spell, result) => {
        const player = spell.GetCaster().ToPlayer();
        const key = player ? BaseFlag.get(player).pendingGeneratorKey : 0;
        if (!player || !resourceGeneratorByKey(key) || !canPlaceBuilding(player, key, spell.GetTargetDest())) {
            result.set(SpellCastResult.FAILED_DONT_REPORT);
        }
    });

    events.Spell.OnEffect(RESOURCE_GENERATOR_PLACE_SPELL_ID, (spell, cancel, info, mode) => {
        if (mode != SpellEffectHandleMode.HIT) return;
        cancel.set(true);
        const player = spell.GetCaster().ToPlayer();
        if (!player) return;
        const flag = BaseFlag.get(player);
        const key = flag.pendingGeneratorKey;
        if (!resourceGeneratorByKey(key)) {
            sendError(player, baseText(player, "The resource generator type is no longer selected.", "Тип ресурсного генератора больше не выбран."));
            return;
        }
        if (placeCheckedBuilding(player, key, spell.GetTargetDest())) {
            flag.pendingGeneratorKey = 0;
            flag.Save();
        }
    });

    events.Spell.OnCheckCast(FLAG_SPELL_ID, (spell, result) => {
        const player = spell.GetCaster().ToPlayer();
        if (!player || !canPlaceFlag(player, spell.GetTargetDest())) {
            result.set(SpellCastResult.FAILED_DONT_REPORT);
        }
    });

    events.Spell.OnCast(FLAG_SPELL_ID, spell => {
        const player = spell.GetCaster().ToPlayer();
        if (!player) return;
        placeFlag(player, spell.GetTargetDest());
    });

    events.Spell.OnCast(TELEPORT_SPELL_ID, spell => {
        const player = spell.GetCaster().ToPlayer();
        if (!player) return;
        const flag = BaseFlag.get(player);
        if (flag.hasFlag == 0) {
            // Спелл остался без базы (снос с другого клиента и т.п.):
            // не наказываем кулдауном и забираем спелл.
            player.ResetSpellCooldown(TELEPORT_SPELL_ID, true);
            syncTeleportSpell(player);
            sendError(player, baseText(player, "You do not have a base flag.", "У вас нет флага базы."));
            return;
        }
        player.Teleport(flag.mapId, flag.x, flag.y, flag.z, flag.o);
    });

    BUILDINGS.forEach(building => {
        if (building.kind == "service") return; // услуги не имеют спелла размещения
        const spellId = BUILDING_SPELL_IDS[building.key];
        if (!spellId) return;

        events.Spell.OnCheckCast(spellId, (spell, result) => {
            const player = spell.GetCaster().ToPlayer();
            if (!player || !canPlaceBuilding(player, building.key, spell.GetTargetDest())) {
                result.set(SpellCastResult.FAILED_DONT_REPORT);
            }
        });

        events.Spell.OnEffect(spellId, (spell, cancel, info, mode) => {
            if (mode != SpellEffectHandleMode.HIT) return;

            // TRANS_DOOR нужен клиенту для ghost-preview. Его штатный временный
            // объект на сервере отменяем, чтобы не получить дубль/owner lifetime.
            cancel.set(true);
            const player = spell.GetCaster().ToPlayer();
            if (!player) return;
            placeCheckedBuilding(player, building.key, spell.GetTargetDest());
        });
    });

    events.CustomPacket.OnReceive(OP_BASE_SELECT, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new SelectMsg();
        msg.read(packet);
        ensureBaseObjects(player);
        if (msg.key == 0 && msg.entry == 0) {
            clearSelected(player);
            sendManageState(player);
            return;
        }

        const current = selectedOwned(player);
        const rows = ownedOnCurrentMap(player);
        let selected: BaseBuilding | undefined = undefined;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].spawnGuid == msg.key && rows[i].entry == msg.entry) selected = rows[i];
        }
        if (!selected && current && current.spawnGuid == msg.key && current.entry == msg.entry) selected = current;
        if (!selected) {
            clearSelected(player);
            sendError(player, baseText(player, "The selected building is not on the current map.", "Выбранная постройка отсутствует на текущей карте."));
            sendManageState(player);
            return;
        }
        selectRow(player, selected);
        flashSelected(player, selected);
        sendManageState(player);
    });

    events.CustomPacket.OnReceive(OP_BASE_MOVE, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new MoveMsg(MOVE_AXIS_X, 1, 1);
        msg.read(packet);
        if (
            (msg.axis != MOVE_AXIS_X && msg.axis != MOVE_AXIS_Y && msg.axis != MOVE_AXIS_Z) ||
            (msg.dir != -1 && msg.dir != 1) || msg.step != msg.step ||
            msg.step < MOVE_STEP_MIN || msg.step > MOVE_STEP_MAX
        ) {
            sendError(player, baseText(player, "Invalid movement step.", "Некорректный шаг перемещения."));
            sendManageState(player);
            return;
        }

        const row = selectedOwned(player);
        if (!row) {
            sendError(player, baseText(
                player,
                "Select a building from the current map's object list first.",
                "Сначала выберите постройку из списка объектов текущей карты.",
            ));
            sendManageState(player);
            return;
        }

        let x = row.x;
        let y = row.y;
        let z = row.z;
        const delta = msg.dir * msg.step;
        if (msg.axis == MOVE_AXIS_X) x += delta;
        else if (msg.axis == MOVE_AXIS_Y) y += delta;
        else z += delta;

        if (!canMoveSelectedTo(player, x, y, z)) {
            sendManageState(player);
            return;
        }
        const moved = respawnBuilding(player, row, x, y, z, row.o);
        if (row.spawnGuid != 0) {
            selectRow(player, row);
            flashSelected(player, row);
        } else {
            clearSelected(player);
        }
        sendError(player, moved
            ? baseText(player, "Building position updated.", "Положение постройки изменено.")
            : baseText(player, "The building could not be moved; its previous position was preserved.", "Не удалось переместить постройку; прежнее положение сохранено."));
        sendManageState(player);
    });

    events.CustomPacket.OnReceive(OP_BASE_ROTATE, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new RotateMsg(1);
        msg.read(packet);
        if (msg.dir != -1 && msg.dir != 1) {
            sendError(player, baseText(player, "Invalid rotation direction.", "Некорректное направление поворота."));
            sendManageState(player);
            return;
        }
        const client = baseClient(player);
        const hadSelection = client.selectedSpawnGuid != 0 || client.selectedEntry != 0;
        const selected = selectedOwned(player);
        const row = selected || (!hadSelection ? nearestOwned(player) : undefined);
        if (!row) {
            sendError(player, baseText(player, "Select a building from the current map's object list.", "Выберите постройку из списка объектов текущей карты."));
            sendManageState(player);
            return;
        }
        const rotated = respawnBuilding(player, row, row.x, row.y, row.z, row.o + msg.dir * ROTATE_STEP);
        if (row.spawnGuid != 0) {
            selectRow(player, row);
            flashSelected(player, row);
        } else {
            clearSelected(player);
        }
        sendError(player, rotated
            ? baseText(player, "Building rotated.", "Постройка повёрнута.")
            : baseText(player, "The building could not be rotated; its previous position was preserved.", "Не удалось повернуть постройку; прежнее положение сохранено."));
        sendManageState(player);
    });

    events.CustomPacket.OnReceive(OP_BASE_REMOVE, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const client = baseClient(player);
        const hadSelection = client.selectedSpawnGuid != 0 || client.selectedEntry != 0;
        const selected = selectedOwned(player);
        const row = selected || (!hadSelection ? nearestOwned(player) : undefined);
        if (!row) {
            sendError(player, baseText(player, "Select a building from the current map's object list.", "Выберите постройку из списка объектов текущей карты."));
            sendManageState(player);
            return;
        }
        if (row.mapId == player.GetMapID() && row.spawnGuid != 0) {
            removeStoredBuilding(player, row);
        }
        // ponytail: точный состав агрегированных материалов не хранится;
        // добавьте платёжную квитанцию в BaseBuilding перед возвратом ресурсов.
        prepareBuildingRemoval(player, row);
        row.Delete();
        BaseBuilding.get(player).Save();
        clearSelected(player);
        sendError(player, baseText(player, "Building demolished. Materials are not refunded.", "Постройка снесена. Материалы не возвращаются."));
        sendManageState(player);
    });

    events.CustomPacket.OnReceive(OP_BASE_CLEAR, (opcode, packet, player) => {
        baseClient(player).ready = true;
        const msg = new ClearBaseMsg();
        msg.read(packet);
        sendError(player, baseText(player, "The server accepted the base deletion request.", "Сервер принял запрос на удаление базы."));
        clearBase(player);
    });

    events.Player.OnSave(player => {
        BaseFlag.get(player).Save();
        BaseBuilding.get(player).Save();
    });

    events.Player.OnLogin((player, firstLogin) => {
        grantWoodcutting(player);
        ensureStableBuildingIds(player);
        syncTeleportSpell(player);
        // НЕ спавнить объекты прямо в OnLogin: игрок ещё не активен в гриде и
        // пропускает create-пакеты (постройки «невидимы до перезахода»).
        // Отложенный одноразовый таймер — игрок уже полностью в мире.
        player.AddTimer(4000, 1, (owner, timer) => {
            const activePlayer = owner.ToPlayer();
            if (!activePlayer) return;
            grantWoodcutting(activePlayer);
            ensureBaseObjects(activePlayer);
        });
        player.AddTimer(BUFF_CHECK_INTERVAL, BUFF_TIMER_LOOPS, (owner, timer) => {
            const activePlayer = owner.ToPlayer();
            if (!activePlayer) return;
            applyProximityBuffs(activePlayer);
            refreshHealingDummies(activePlayer);
        });
    });
}
