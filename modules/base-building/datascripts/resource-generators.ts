import { std } from "wow/wotlk";

// Datascripts intentionally keep this visual projection local: their tsconfig
// cannot import ../shared without moving the generated output root. Runtime
// rules and item/cost data remain authoritative in shared/ResourceGenerators.ts.
const MODNAME = "base-building";
const BUILDING_PREVIEW_BASE = 61031;
const GATHER_CAST_BASE = 8690;
const GENERATOR_USE_RANGE = 8;
const READY_GLOW_DISPLAY = 230; // stock «Blue Aura, column»
const GO_FLAG_INTERACT_COND = 0x04;
const GO_FLAG_NOT_SELECTABLE = 0x10;

const TAG_PLACE_SPELL = "spell/resource-generator-place";
const TAG_PLACE_ITEM = "item/resource-generator-place";
const TAG_GATHER_SPELL = "spell/resource-generator-gather";
const TAG_READY_EFFECT = "go/resource-generator-ready-effect";

type VisualCategory = "ore" | "herb" | "stone" | "wood" | "fish" | "junk";

interface GeneratorVisual {
    id: string;
    category: VisualCategory;
    resourceEn: string;
    resourceRu: string;
    sourceEntry: number;
    display?: number;
    size?: number;
}

const GENERATORS: GeneratorVisual[] = [
    { id: "copper-ore", category: "ore", resourceEn: "Copper Ore", resourceRu: "Медная руда", sourceEntry: 1731 },
    { id: "tin-ore", category: "ore", resourceEn: "Tin Ore", resourceRu: "Оловянная руда", sourceEntry: 1732 },
    { id: "silver-ore", category: "ore", resourceEn: "Silver Ore", resourceRu: "Серебряная руда", sourceEntry: 1733 },
    { id: "iron-ore", category: "ore", resourceEn: "Iron Ore", resourceRu: "Железная руда", sourceEntry: 1735 },
    { id: "gold-ore", category: "ore", resourceEn: "Gold Ore", resourceRu: "Золотая руда", sourceEntry: 1734 },
    { id: "mithril-ore", category: "ore", resourceEn: "Mithril Ore", resourceRu: "Мифриловая руда", sourceEntry: 2040 },
    { id: "truesilver-ore", category: "ore", resourceEn: "Truesilver Ore", resourceRu: "Руда истинного серебра", sourceEntry: 2047 },
    { id: "thorium-ore", category: "ore", resourceEn: "Thorium Ore", resourceRu: "Ториевая руда", sourceEntry: 324 },
    { id: "fel-iron-ore", category: "ore", resourceEn: "Fel Iron Ore", resourceRu: "Руда осквернённого железа", sourceEntry: 181555 },
    { id: "adamantite-ore", category: "ore", resourceEn: "Adamantite Ore", resourceRu: "Адамантитовая руда", sourceEntry: 181556 },
    { id: "cobalt-ore", category: "ore", resourceEn: "Cobalt Ore", resourceRu: "Кобальтовая руда", sourceEntry: 189978 },
    { id: "saronite-ore", category: "ore", resourceEn: "Saronite Ore", resourceRu: "Саронитовая руда", sourceEntry: 189980 },
    { id: "titanium-ore", category: "ore", resourceEn: "Titanium Ore", resourceRu: "Титановая руда", sourceEntry: 191133 },

    { id: "peacebloom", category: "herb", resourceEn: "Peacebloom", resourceRu: "Мироцвет", sourceEntry: 1618 },
    { id: "silverleaf", category: "herb", resourceEn: "Silverleaf", resourceRu: "Сребролист", sourceEntry: 1617 },
    { id: "mageroyal", category: "herb", resourceEn: "Mageroyal", resourceRu: "Магороза", sourceEntry: 1620 },
    { id: "briarthorn", category: "herb", resourceEn: "Briarthorn", resourceRu: "Остротерн", sourceEntry: 1621 },
    { id: "kingsblood", category: "herb", resourceEn: "Kingsblood", resourceRu: "Королевская кровь", sourceEntry: 1624 },
    { id: "stranglekelp", category: "herb", resourceEn: "Stranglekelp", resourceRu: "Удавник", sourceEntry: 2045 },
    { id: "goldthorn", category: "herb", resourceEn: "Goldthorn", resourceRu: "Златошип", sourceEntry: 2046 },
    { id: "khadgars-whisker", category: "herb", resourceEn: "Khadgar's Whisker", resourceRu: "Ус Кадгара", sourceEntry: 2043 },
    { id: "sungrass", category: "herb", resourceEn: "Sungrass", resourceRu: "Солнечник", sourceEntry: 142142 },
    { id: "dreamfoil", category: "herb", resourceEn: "Dreamfoil", resourceRu: "Снолист", sourceEntry: 176584 },
    { id: "felweed", category: "herb", resourceEn: "Felweed", resourceRu: "Сквернопля", sourceEntry: 181270 },
    { id: "goldclover", category: "herb", resourceEn: "Goldclover", resourceRu: "Златоклевер", sourceEntry: 189973 },
    { id: "icethorn", category: "herb", resourceEn: "Icethorn", resourceRu: "Ледошип", sourceEntry: 190172 },

    { id: "rough-stone", category: "stone", resourceEn: "Rough Stone", resourceRu: "Грубый камень", sourceEntry: 1731 },
    { id: "coarse-stone", category: "stone", resourceEn: "Coarse Stone", resourceRu: "Необработанный камень", sourceEntry: 1732 },
    { id: "heavy-stone", category: "stone", resourceEn: "Heavy Stone", resourceRu: "Тяжёлый камень", sourceEntry: 1735 },
    { id: "solid-stone", category: "stone", resourceEn: "Solid Stone", resourceRu: "Твёрдый камень", sourceEntry: 2040 },
    { id: "dense-stone", category: "stone", resourceEn: "Dense Stone", resourceRu: "Массивный камень", sourceEntry: 324 },

    { id: "pine-log", category: "wood", resourceEn: "Pine Log", resourceRu: "Сосновое бревно", sourceEntry: 0, display: 7459, size: 0.23 },
    { id: "oak-log", category: "wood", resourceEn: "Oak Log", resourceRu: "Дубовое бревно", sourceEntry: 0, display: 967, size: 0.5 },
    { id: "ash-log", category: "wood", resourceEn: "Ash Log", resourceRu: "Ясеневое бревно", sourceEntry: 0, display: 702, size: 0.45 },
    { id: "ironwood-log", category: "wood", resourceEn: "Ironwood Log", resourceRu: "Бревно железного дерева", sourceEntry: 0, display: 7321, size: 0.043 },
    { id: "terokkar-log", category: "wood", resourceEn: "Terokkar Log", resourceRu: "Тероккарское бревно", sourceEntry: 0, display: 7288, size: 0.2 },
    { id: "frostwood-log", category: "wood", resourceEn: "Frostwood Log", resourceRu: "Морозное бревно", sourceEntry: 0, display: 7801, size: 1.3 },

    { id: "brilliant-smallfish", category: "fish", resourceEn: "Raw Brilliant Smallfish", resourceRu: "Сырая блестящая рыбка", sourceEntry: 180656 },
    { id: "slitherskin-mackerel", category: "fish", resourceEn: "Raw Slitherskin Mackerel", resourceRu: "Сырая скользкокожая скумбрия", sourceEntry: 180656 },
    { id: "longjaw-mud-snapper", category: "fish", resourceEn: "Raw Longjaw Mud Snapper", resourceRu: "Сырой илистый луциан", sourceEntry: 180656 },
    { id: "loch-frenzy", category: "fish", resourceEn: "Raw Loch Frenzy", resourceRu: "Сырая озёрная бешенка", sourceEntry: 180656 },
    { id: "rainbow-fin-albacore", category: "fish", resourceEn: "Raw Rainbow Fin Albacore", resourceRu: "Сырой радужный тунец", sourceEntry: 180656 },
    { id: "rockscale-cod", category: "fish", resourceEn: "Raw Rockscale Cod", resourceRu: "Сырая каменношкурая треска", sourceEntry: 180656 },
    { id: "spotted-yellowtail", category: "fish", resourceEn: "Raw Spotted Yellowtail", resourceRu: "Сырой пятнистый желтохвост", sourceEntry: 180656 },
    { id: "raw-redgill", category: "fish", resourceEn: "Raw Redgill", resourceRu: "Сырой краснобородочник", sourceEntry: 180656 },
    { id: "mithril-head-trout", category: "fish", resourceEn: "Raw Mithril Head Trout", resourceRu: "Сырая мифрилоголовая форель", sourceEntry: 180656 },
    { id: "salvage-puddle", category: "junk", resourceEn: "Floating Debris", resourceRu: "Плавающий мусор", sourceEntry: 180655 },
    { id: "schooner-wreckage", category: "junk", resourceEn: "Schooner Wreckage", resourceRu: "Разбитая шхуна", sourceEntry: 180662 },
    { id: "waterlogged-wreckage", category: "junk", resourceEn: "Waterlogged Wreckage", resourceRu: "Плавающие обломки", sourceEntry: 180685 },
    { id: "floating-wreckage", category: "junk", resourceEn: "Floating Wreckage", resourceRu: "Обломки в воде", sourceEntry: 180751 },
    { id: "bloodsail-wreckage", category: "junk", resourceEn: "Bloodsail Wreckage", resourceRu: "Обломки кораблекрушения Кровавого Паруса", sourceEntry: 180901 },
    { id: "steam-pump-flotsam", category: "junk", resourceEn: "Steam Pump Flotsam", resourceRu: "Обломки парового насоса", sourceEntry: 182952 },
];

function generatorName(generator: GeneratorVisual, ru: boolean): string {
    const resource = ru ? generator.resourceRu : generator.resourceEn;
    if (generator.category == "fish") return ru ? `Лунка: ${resource}` : `Fishing Hole: ${resource}`;
    if (generator.category == "junk") return resource;
    return ru ? `Генератор: ${resource}` : `${resource} Generator`;
}

function assertVisualCatalog(): void {
    if (GENERATORS.length != 52) throw new Error(`expected 52 resource generator visuals, got ${GENERATORS.length}`);
    const seen: { [id: string]: boolean } = {};
    for (let i = 0; i < GENERATORS.length; i++) {
        if (seen[GENERATORS[i].id]) throw new Error(`duplicate resource generator id ${GENERATORS[i].id}`);
        seen[GENERATORS[i].id] = true;
    }
}

function clearGameObjectData(go: any): void {
    for (let i = 0; i <= 23; i++) go[`Data${i}`].set(0);
}

function makeGeneratorTemplate(generator: GeneratorVisual): number {
    const nameEn = generatorName(generator, false);
    const nameRu = generatorName(generator, true);

    if (generator.category == "fish" || generator.category == "junk") {
        // A real FISHINGHOLE is globally selected by any nearby bobber. Keep
        // the stock pool visual, but make the marker inert; the owner's normal
        // bobber event detects it by position without disrupting other players.
        const hole = std.GameObjectTemplates.Generic.create(
            MODNAME,
            `resource-generator-${generator.id}`,
            generator.sourceEntry,
        );
        hole.Type.TRAP.set();
        clearGameObjectData(hole);
        hole.Faction.set(0);
        hole.Flags.set(GO_FLAG_INTERACT_COND | GO_FLAG_NOT_SELECTABLE);
        hole.Name.enGB.set(nameEn);
        hole.Name.ruRU.set(nameRu);
        hole.Tags.addUnique(MODNAME, `go/resource-generator-${generator.id}`);
        return hole.ID;
    }

    const go = std.GameObjectTemplates.Generic.create(
        MODNAME,
        `resource-generator-${generator.id}`,
        generator.sourceEntry,
    );
    go.Type.GOOBER.set();
    clearGameObjectData(go);
    go.Faction.set(0);
    go.Flags.set(0);
    go.Name.enGB.set(nameEn);
    go.Name.ruRU.set(nameRu);
    if (generator.display !== undefined) go.Display.set(generator.display);
    if (generator.size !== undefined) go.Size.set(generator.size);
    go.Tags.addUnique(MODNAME, `go/resource-generator-${generator.id}`);
    return go.ID;
}

function makePlacementSpell(previewEntry: number): number {
    const spell = std.Spells.create(MODNAME, "resource-generator-place", BUILDING_PREVIEW_BASE);
    spell.Name.enGB.set("Place Resource Generator");
    spell.Name.ruRU.set("Установить генератор ресурсов");
    spell.Description.enGB.set("Places the resource generator selected in the base catalog.");
    spell.Description.ruRU.set("Устанавливает генератор ресурсов, выбранный в каталоге базы.");
    spell.Attributes.clearAll();
    spell.row.ShapeshiftMask.set(BigInt(0));
    spell.row.ShapeshiftExclude.set(BigInt(0));
    spell.TargetType.clearAll();
    spell.TargetType.DEST_LOCATION.set(true);
    spell.Effects.clearAll();
    spell.Effects.addGet()
        .Type.TRANS_DOOR.set()
        .GOTemplate.set(previewEntry)
        .ImplicitTargetA.DEST_DEST.set();
    spell.CastTime.set(14);
    spell.Duration.set(23);
    spell.Range.set(12);
    spell.Speed.set(0);
    spell.Visual.set(353);
    spell.Icon.set(3646);
    spell.ActiveIcon.set(0);
    spell.Tags.addUnique(MODNAME, TAG_PLACE_SPELL);
    return spell.ID;
}

function makePlacementItem(spellId: number): void {
    const item = std.Items.create(MODNAME, "resource-generator-place", 6948);
    item.Name.enGB.set("Resource Generator Blueprint");
    item.Name.ruRU.set("Чертёж генератора ресурсов");
    item.Description.enGB.set("Places the generator selected in the base catalog. Its exact 40-resource cost is charged only after successful placement.");
    item.Description.ruRU.set("Устанавливает выбранный в каталоге генератор. Точная цена в 40 единиц ресурса списывается только после успешной установки.");
    item.Class.OTHER_MISC.set();
    item.Quality.set(1);
    item.Bonding.set(1);
    // One pending selection uses one common blueprint; after placement the same
    // generator may immediately be selected and built again without a limit.
    item.MaxCount.set(1);
    item.MaxStack.set(1);
    item.Price.set(0, 0, 1);
    item.Spells.clearAll();
    item.Spells.addMod(spell => {
        spell.Spell.set(spellId);
        spell.Trigger.set(0);
        spell.Charges.set(1, "DELETE_ITEM");
        spell.Cooldown.set(-1);
        spell.CategoryCooldown.set(-1);
    });
    item.Tags.addUnique(MODNAME, TAG_PLACE_ITEM);
}

function makeGatherSpell(): void {
    const spell = std.Spells.create(MODNAME, "resource-generator-gather", GATHER_CAST_BASE);
    spell.Name.enGB.set("Gather Resource");
    spell.Name.ruRU.set("Добыча ресурса");
    spell.Description.enGB.set("Gather the ready resource after a three-second cast.");
    spell.Description.ruRU.set("Добывает готовый ресурс после трёх секунд работы.");
    // 8690 (Hearthstone) has SpellRange #1 with max range 0. A GO-targeted
    // cast would therefore fail Trinity's range check unless we replace it.
    spell.Attributes.clearAll();
    spell.Range.setSimple(0, GENERATOR_USE_RANGE);
    spell.row.ShapeshiftMask.set(BigInt(0));
    spell.row.ShapeshiftExclude.set(BigInt(0));
    spell.Effects.clearAll();
    spell.Effects.addGet()
        .Type.SCRIPT_EFFECT.set()
        .ImplicitTargetA.GAMEOBJECT_TARGET.set();
    spell.CastTime.setSimple(3000, 0, 3000);
    spell.row.Category.set(0);
    spell.Cooldown.Time.set(0);
    spell.Cooldown.CategoryTime.set(0);
    spell.Icon.setPath("trade_mining");
    spell.Tags.addUnique(MODNAME, TAG_GATHER_SPELL);
}

function makeReadyEffect(): void {
    const glow = std.GameObjectTemplates.Generic.create(MODNAME, "resource-generator-ready-effect");
    glow.Type.TRAP.set();
    clearGameObjectData(glow);
    glow.Display.set(READY_GLOW_DISPLAY);
    glow.Size.set(1.2);
    glow.Faction.set(0);
    // Runtime applies the same flags to the live object after SpawnGameObject.
    glow.Flags.set(GO_FLAG_INTERACT_COND | GO_FLAG_NOT_SELECTABLE);
    glow.Name.enGB.set("Resource Ready");
    glow.Name.ruRU.set("Ресурс готов");
    glow.Tags.addUnique(MODNAME, TAG_READY_EFFECT);
}

assertVisualCatalog();
const generatorEntries: number[] = [];
for (let i = 0; i < GENERATORS.length; i++) generatorEntries.push(makeGeneratorTemplate(GENERATORS[i]));
makePlacementItem(makePlacementSpell(generatorEntries[0]));
makeGatherSpell();
makeReadyEffect();
