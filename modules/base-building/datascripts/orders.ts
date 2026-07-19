/** Static data for the base order board and its outdoor non-boss kill pool. */

import { SQL, std } from "wow/wotlk";

const MOD = "base-building";
const BOARD_TAG = "go/orders-board";
const BOARD_PARENT = 180448; // Wanted Poster: Deathclasp — a suitable stock notice-board model.
const UNIT_FLAG_NON_ATTACKABLE = 0x00000002;
const UNIT_FLAG_IMMUNE_TO_PC = 0x00000100;
const UNIT_FLAG_NOT_SELECTABLE = 0x02000000;
const CREATURE_TYPE_FLAG_BOSS_MOB = 0x00000004;
const CREATURE_TYPE_FLAG_QUEST_BOSS = 0x80000000;
const OUTDOOR_MAPS: { [map: number]: boolean } = { 0: true, 1: true, 530: true, 571: true };

function clearGameObjectData(go: any): void {
    for (let i = 0; i <= 23; i++) go[`Data${i}`].set(0);
}

export const ORDER_BOARD_TEMPLATE = std.GameObjectTemplates.Generic.create(MOD, "orders-board", BOARD_PARENT);
ORDER_BOARD_TEMPLATE.Type.GOOBER.set();
clearGameObjectData(ORDER_BOARD_TEMPLATE);
ORDER_BOARD_TEMPLATE.Faction.set(0);
ORDER_BOARD_TEMPLATE.Flags.set(0);
ORDER_BOARD_TEMPLATE.Name.enGB.set("Order Board");
ORDER_BOARD_TEMPLATE.Name.ruRU.set("Доска заказов");
ORDER_BOARD_TEMPLATE.Tags.addUnique(MOD, BOARD_TAG);

// A target must have at least one persistent spawn on an outdoor continent.
const spawnedOutdoors: { [entry: number]: boolean } = {};
SQL.creature.queryAll({}).forEach(spawn => {
    if (OUTDOOR_MAPS[spawn.map.get()] === true && spawn.spawnMask.get() != 0) {
        spawnedOutdoors[spawn.id.get()] = true;
    }
});

function killTier(level: number): number {
    if (level >= 69) return 5;
    if (level >= 51) return 4;
    if (level >= 36) return 3;
    if (level >= 21) return 2;
    return 1;
}

function looksLikeInternalCreature(name: string): boolean {
    const lowered = name.toLowerCase();
    return lowered.indexOf("trigger") >= 0
        || lowered.indexOf("bunny") >= 0
        || lowered.indexOf("credit") >= 0
        || lowered.indexOf("invisible") >= 0
        || lowered.indexOf("test ") >= 0
        || lowered.indexOf("dummy") >= 0;
}

const tagged = [0, 0, 0, 0, 0];
std.CreatureTemplates.filter(creature => {
    if (spawnedOutdoors[creature.ID] !== true) return false;
    if (creature.Rank.get() == 3 || creature.RacialLeader.get()) return false;
    if (creature.NPCFlags.get() != 0 || creature.row.lootid.get() == 0) return false;

    const typeFlags = creature.row.type_flags.get();
    if ((typeFlags & CREATURE_TYPE_FLAG_BOSS_MOB) != 0
        || (typeFlags & CREATURE_TYPE_FLAG_QUEST_BOSS) != 0) return false;

    const flags = creature.row.unit_flags.get();
    if ((flags & (UNIT_FLAG_NON_ATTACKABLE | UNIT_FLAG_IMMUNE_TO_PC | UNIT_FLAG_NOT_SELECTABLE)) != 0) return false;

    const level = creature.Level.Max.get();
    if (level <= 0 || level > 83 || looksLikeInternalCreature(creature.Name.enGB.get())) return false;

    const tier = killTier(level);
    creature.Tags.add(MOD, `npc/orders-tier-${tier}`);
    tagged[tier - 1]++;
    return false;
});

for (let tier = 0; tier < tagged.length; tier++) {
    if (tagged[tier] == 0) throw new Error(`[base-building/orders] empty outdoor kill pool for tier ${tier + 1}`);
}
console.log(`[base-building/orders] outdoor non-boss targets by tier: ${tagged.join("/")}`);
