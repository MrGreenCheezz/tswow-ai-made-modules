/** Mastery: a chance to receive a second copy of gathered resources. */

import { masteryPct } from "../shared/StatFormula";
import { getStats } from "./stat-store";

const ITEM_CLASS_TRADE_GOODS = 7;
const ITEM_CLASS_QUEST = 12;
const GO_TYPE_CHEST = 3;
const LOOT_DISENCHANTING = 4;
const LOOT_PROSPECTING = 7;
const LOOT_MILLING = 8;
const RESOURCE_NODE = 1;
const RESOURCE_SKINNING = 2;
const RESOURCE_FISHING = 3;

function tr(player: TSPlayer, english: string, russian: string): string {
    return Number(player.GetDbcLocale ? player.GetDbcLocale() : 8) == 8 ? russian : english;
}

const RU_ITEM_NAME_QUERY = PrepareWorldQuery(
    "SELECT `Name` FROM `item_template_locale` WHERE `ID` = ? AND `locale` = 'ruRU'",
);
const ruItemNames: { [entry: number]: string } = {};

function itemName(player: TSPlayer, template: TSItemTemplate): string {
    const fallback = template.GetName();
    // DB locale is the original client locale; DBC locale may be a fallback.
    if (Number(player.GetDbLocaleIndex()) != 8) return fallback;
    const entry = Number(template.GetEntry());
    let name = ruItemNames[entry];
    if (name === undefined) {
        const result = RU_ITEM_NAME_QUERY.Create().SetUInt32(0, entry as uint32).Send();
        name = result.GetRow() ? result.GetString(0) : "";
        ruItemNames[entry] = name;
    }
    return name || fallback;
}

export function masteryBonusCount(player: TSPlayer, count: number): number {
    if (count <= 0) return 0;
    const chance = masteryPct(getStats(player).mastery, Number(player.GetLevel()));
    return chance > 0 && Math.random() * 100 < chance ? count : 0;
}

function contains(values: number[], value: number): boolean {
    for (let i = 0; i < values.length; i++) {
        if (values[i] == value) return true;
    }
    return false;
}

function isStackableResource(template: TSItemTemplate): boolean {
    return !!template
        && Number(template.GetClass()) != ITEM_CLASS_QUEST
        && Number(template.GetInventoryType()) == 0
        && Number(template.GetStackable()) > 1;
}

function matchesGeneratedResource(template: TSItemTemplate, mode: number): boolean {
    if (!isStackableResource(template)) return false;
    if (mode == RESOURCE_FISHING) return true;
    if (Number(template.GetClass()) != ITEM_CLASS_TRADE_GOODS) return false;
    const subclass = Number(template.GetSubClass());
    if (mode == RESOURCE_SKINNING) return contains([6, 10], subclass); // leather/elemental
    return contains([4, 7, 9, 10, 11], subclass); // gem, ore/stone, herb, elemental, wood
}

function doubleGeneratedLoot(player: TSPlayer, loot: TSLoot, mode: number): void {
    for (let i = 0; i < Number(loot.GetItemCount()); i++) {
        const lootItem = loot.GetItem(i);
        const template = lootItem.GetTemplate();
        if (!matchesGeneratedResource(template, mode)) continue;
        const count = Number(lootItem.GetCount());
        const bonus = masteryBonusCount(player, count);
        if (bonus <= 0) continue;
        lootItem.SetCount(Math.min(255, count + bonus));
        const name = itemName(player, template);
        player.SendBroadcastMessage(tr(
            player,
            `Mastery: loot doubled — ${name} x${count + bonus}.`,
            `Мастерство: добыча удвоена — ${name} x${count + bonus}.`,
        ));
    }
}

function isProcessingLoot(lootType: number): boolean {
    return lootType == LOOT_DISENCHANTING || lootType == LOOT_PROSPECTING || lootType == LOOT_MILLING;
}

export function RegisterMastery(events: TSEvents): void {
    events.GameObject.OnGenerateLoot((obj, player) => {
        const template = obj.GetTemplate();
        // Mining/herbalism nodes are locked chest-type GOs. Filtering their
        // generated contents avoids doubling cloth/meat from creature corpses.
        if (Number(template.GetType()) != GO_TYPE_CHEST || Number(template.GetGOData(0)) <= 0) return;
        doubleGeneratedLoot(player, obj.GetLoot(), RESOURCE_NODE);
    });

    events.GameObject.OnGenerateFishLoot((obj, player, loot, isJunk) => {
        doubleGeneratedLoot(player, loot, RESOURCE_FISHING);
    });

    events.Creature.OnGenerateSkinningLoot((creature, player, loot) => {
        doubleGeneratedLoot(player, loot, RESOURCE_SKINNING);
    });

    // Disenchanting/prospecting/milling have a distinct loot type but no
    // generation hook carrying both player and loot in the current API.
    events.Item.OnTakenAsLoot((item, lootItem, loot, player) => {
        const template = lootItem.GetTemplate();
        if (!template || !isStackableResource(template) || !isProcessingLoot(Number(loot.GetLootType()))) return;

        const count = masteryBonusCount(player, Number(lootItem.GetCount()));
        if (count <= 0) return;
        const entry = Number(lootItem.GetItemID());
        if (player.AddItem(entry, count)) {
            const name = itemName(player, template);
            player.SendBroadcastMessage(tr(
                player,
                `Mastery: gained an extra ${name} x${count}.`,
                `Мастерство: дополнительно добыто ${name} x${count}.`,
            ));
        } else {
            player.SendBroadcastMessage(tr(
                player,
                "Mastery triggered, but your bags have no room for the extra resource.",
                "Мастерство сработало, но в сумках нет места для дополнительного ресурса.",
            ));
        }
    });
}
