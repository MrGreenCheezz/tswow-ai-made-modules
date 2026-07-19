import { std } from "wow/wotlk";
import "./patch-buildings";

const MODNAME = "base-building";
const WOOD_ICON = "INV_Axe_01";
const GATHER_RESPAWN_S = 600;
// ponytail: global 1-in-4 sampling; add per-zone density only if playtesting shows uneven coverage.
const HERB_SAMPLE_STRIDE = 4;
const TREE_OFFSET_YARDS = 2.5;

function makeWoodItem(
    id: string,
    tag: string,
    parent: number,
    enGB: string,
    ruRU: string,
    descriptionEn: string,
    descriptionRu: string,
) {
    const item = std.Items.create(MODNAME, id, parent);
    item.Name.enGB.set(enGB);
    item.Name.ruRU.set(ruRU);
    item.Description.enGB.set(descriptionEn);
    item.Description.ruRU.set(descriptionRu);
    item.Quality.WHITE.set();
    item.MaxStack.set(100);
    item.Price.set(0, 0);
    item.Tags.addUnique(MODNAME, tag);
    return item;
}

const PINE_LOG = makeWoodItem(
    "pine-log", "item/wood-tier-1", 4470,
    "Pine Log", "Сосновое бревно",
    "Construction timber from young forests.",
    "Строительная древесина из молодых лесов.",
);
const OAK_LOG = makeWoodItem(
    "oak-log", "item/wood-tier-2", 4470,
    "Oak Log", "Дубовое бревно",
    "Sturdy timber for load-bearing structures.",
    "Крепкая древесина для несущих конструкций.",
);
const ASH_LOG = makeWoodItem(
    "ash-log", "item/wood-tier-3", 4470,
    "Ash Log", "Ясеневое бревно",
    "Resilient timber from old forests.",
    "Упругая древесина из старых лесов.",
);
const IRONWOOD_LOG = makeWoodItem(
    "ironwood-log", "item/wood-tier-4", 4470,
    "Ironwood Log", "Бревно железного дерева",
    "Exceptionally dense timber used for fortifications.",
    "Исключительно плотная древесина для укреплений.",
);
const TEROKKAR_LOG = makeWoodItem(
    "terokkar-log", "item/wood-tier-5", 11291,
    "Terokkar Log", "Тероккарское бревно",
    "Outland timber saturated with magic.",
    "Пропитанная магией древесина Запределья.",
);
const FROSTWOOD_LOG = makeWoodItem(
    "frostwood-log", "item/wood-tier-6", 11291,
    "Frostwood Log", "Морозное бревно",
    "Rare timber hardened by Northrend's cold.",
    "Редкая древесина, закалённая холодом Нордскола.",
);

export const WOODCUTTING = std.Professions.create(MODNAME, "woodcutting");
WOODCUTTING.Name.enGB.set("Woodcutting");
WOODCUTTING.Name.ruRU.set("Лесозаготовка");
WOODCUTTING.AsSkillLine.mod(skill => {
    skill.Category.PROFESSION.set();
    const raceClassInfo = skill.RaceClassInfos.get()[0];
    raceClassInfo.ClassMask.set([
        "WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST",
        "DEATH_KNIGHT", "SHAMAN", "MAGE", "WARLOCK", "DRUID",
    ]);
    raceClassInfo.RaceMask.set([
        "HUMAN", "ORC", "DWARF", "NIGHTELF", "UNDEAD",
        "TAUREN", "GNOME", "TROLL", "BLOODELF", "DRAENEI",
    ]);
    skill.Description.enGB.set("Allows harvesting timber from trees throughout the world.");
    skill.Description.ruRU.set("Позволяет заготавливать древесину с деревьев по всему миру.");
    skill.AlternateVerb.enGB.set("Chopping");
    skill.AlternateVerb.ruRU.set("Рубка");
    skill.Icon.setPath(WOOD_ICON);
});

const RANKS = [
    WOODCUTTING.Ranks.addGet(MODNAME, "woodcutting-apprentice", 75, { enGB: "Apprentice", ruRU: "Ученик" }),
    WOODCUTTING.Ranks.addGet(MODNAME, "woodcutting-journeyman", 150, { enGB: "Journeyman", ruRU: "Подмастерье" }),
    WOODCUTTING.Ranks.addGet(MODNAME, "woodcutting-expert", 225, { enGB: "Expert", ruRU: "Умелец" }),
    WOODCUTTING.Ranks.addGet(MODNAME, "woodcutting-artisan", 300, { enGB: "Artisan", ruRU: "Искусник" }),
    WOODCUTTING.Ranks.addGet(MODNAME, "woodcutting-master", 375, { enGB: "Master", ruRU: "Мастер" }),
    WOODCUTTING.Ranks.addGet(MODNAME, "woodcutting-grand-master", 450, { enGB: "Grand Master", ruRU: "Великий мастер" }),
];
WOODCUTTING.setHasCrafting(false);
RANKS.forEach((rank, index) => {
    const spell = rank.ProfessionSpell();
    spell.Icon.setPath(WOOD_ICON);
    spell.Tags.addUnique(MODNAME, `spell/woodcutting-rank-${index + 1}`);
});

const WOODCUTTING_LOCK = std.LockTypes.create();
WOODCUTTING_LOCK.Cursor.setMine();
WOODCUTTING_LOCK.Name.enGB.set("Woodcutting");
WOODCUTTING_LOCK.Name.ruRU.set("Лесозаготовка");
WOODCUTTING_LOCK.ResourceName.enGB.set("Tree");
WOODCUTTING_LOCK.ResourceName.ruRU.set("Дерево");
WOODCUTTING_LOCK.Verb.enGB.set("Chop");
WOODCUTTING_LOCK.Verb.ruRU.set("Рубить");

const GATHER_WOOD = WOODCUTTING.GatheringSpells.addGet(
    MODNAME,
    "gather-wood",
    WOODCUTTING_LOCK.ID,
);
GATHER_WOOD.Name.enGB.set("Chop Wood");
GATHER_WOOD.Name.ruRU.set("Рубка дерева");
GATHER_WOOD.Description.enGB.set("Harvest timber from a suitable tree.");
GATHER_WOOD.Description.ruRU.set("Заготавливает древесину с подходящего дерева.");
GATHER_WOOD.CastTime.setSimple(2500, 0, 2500);
GATHER_WOOD.Icon.setPath(WOOD_ICON);
GATHER_WOOD.Tags.addUnique(MODNAME, "spell/woodcutting-gather");
// The 3.3.5 client rejects custom gathering skills locally when the spell's
// SkillLineAbility has MinSkillLineRank = 1, before the cast reaches the server.
// Resource tier requirements remain authoritative in each node's Lock entry.
GATHER_WOOD.SkillLines.forEach(skillLine => skillLine.MinSkillRank.set(0));

interface WoodTier {
    id: string;
    nameEn: string;
    nameRu: string;
    requiredSkill: number;
    treeDisplay: number;
    treeSize: number;
    sourceHerbs: number[];
    item: typeof PINE_LOG;
    minLoot: number;
    maxLoot: number;
}

// Stock display IDs avoid making gathering nodes depend on the optional patch-building DBC.
const WOOD_TIERS: WoodTier[] = [
    {
        id: "young-pine", nameEn: "Young Pine", nameRu: "Молодая сосна",
        // Stock TSWoW resolves custom lock skills only for positive requirements.
        // Login initialization gives every player woodcutting 1 before gathering.
        requiredSkill: 1, treeDisplay: 7459, treeSize: 0.23,
        sourceHerbs: [1617, 1618, 1619, 1620, 1621, 3724, 3725, 3726, 3727, 3729],
        item: PINE_LOG, minLoot: 2, maxLoot: 3,
    },
    {
        id: "mature-oak", nameEn: "Mature Oak", nameRu: "Зрелый дуб",
        requiredSkill: 75, treeDisplay: 967, treeSize: 0.5,
        sourceHerbs: [1622, 1623, 1624, 1628, 2041, 3730],
        item: OAK_LOG, minLoot: 1, maxLoot: 3,
    },
    {
        id: "old-ash", nameEn: "Old Ash", nameRu: "Старый ясень",
        requiredSkill: 150, treeDisplay: 702, treeSize: 0.45,
        sourceHerbs: [2042, 2043, 2044, 2045, 2046, 2866, 142140],
        item: ASH_LOG, minLoot: 2, maxLoot: 3,
    },
    {
        id: "ironwood", nameEn: "Ironwood", nameRu: "Железное дерево",
        requiredSkill: 225, treeDisplay: 7321, treeSize: 0.043,
        sourceHerbs: [142141, 142142, 142143, 142144, 142145, 176583, 176584, 176586, 176587, 176588, 176589],
        item: IRONWOOD_LOG, minLoot: 2, maxLoot: 4,
    },
    {
        
        id: "terokkar-pine", nameEn: "Terokkar Pine", nameRu: "Тероккарская сосна",
        requiredSkill: 300, treeDisplay: 7288, treeSize: 0.2,
        sourceHerbs: [181270, 181271, 181275, 181276, 181277, 181278, 181279, 181280, 181281, 183043, 183044, 183045],
        item: TEROKKAR_LOG, minLoot: 3, maxLoot: 4,
    },
    {
        id: "frostwood", nameEn: "Frostwood", nameRu: "Морозное дерево",
        requiredSkill: 375, treeDisplay: 7801, treeSize: 1.3,
        sourceHerbs: [189973, 190169, 190170, 190171, 190172, 190176, 191019],
        item: FROSTWOOD_LOG, minLoot: 3, maxLoot: 5,
    },
];

function isOpenWorldMap(map: number): boolean {
    return map == 0 || map == 1 || map == 530 || map == 571;
}

function positionsNearHerbs(entries: number[], tierIndex: number) {
    const positions: { map: number; x: number; y: number; z: number; o: number }[] = [];
    for (let e = 0; e < entries.length; e++) {
        const herb = std.GameObjectTemplates.Chests.load(entries[e]);
        const spawns = herb.Spawns.get();
        const first = (tierIndex + e * 5) % HERB_SAMPLE_STRIDE;
        for (let i = first; i < spawns.length; i += HERB_SAMPLE_STRIDE) {
            const source = spawns[i];
            const pos = source.Position.toPosition();
            // Деревья нужны в открытом мире, а не в подземельях с теми же травами.
            if (!isOpenWorldMap(pos.map)) continue;
            const angle = ((Number(source.ID % 6283) / 1000) + tierIndex) % (Math.PI * 2);
            positions.push({
                map: pos.map,
                x: pos.x + Math.cos(angle) * TREE_OFFSET_YARDS,
                y: pos.y + Math.sin(angle) * TREE_OFFSET_YARDS,
                z: pos.z,
                o: angle,
            });
        }
    }
    return positions;
}

WOOD_TIERS.forEach((tier, index) => {
    const node = WOODCUTTING.GatheringNodes.addGet(
        MODNAME,
        `wood-node-${tier.id}`,
        WOODCUTTING_LOCK.ID,
        tier.requiredSkill,
    );
    node.Name.enGB.set(tier.nameEn);
    node.Name.ruRU.set(tier.nameRu);
    node.Display.set(tier.treeDisplay);
    node.Size.set(tier.treeSize);
    node.Loot.modRefCopy(loot => {
        loot.addItem(tier.item.ID, [100, "[0-100]"], tier.minLoot, tier.maxLoot);
    });
    node.Tags.addUnique(MODNAME, `go/wood-node-${index + 1}`);
    node.Spawns.add(
        MODNAME,
        `wood-node-${tier.id}-spawns`,
        positionsNearHerbs(tier.sourceHerbs, index),
        GATHER_RESPAWN_S,
    );
});
