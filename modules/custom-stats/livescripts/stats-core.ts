/** Recompute equipped affixes and synchronize character/item UI. */

import {
    masteryPct,
    thornsPct,
    vampirismPct,
} from "../shared/StatFormula";
import {
    OP_AFFIX_REQUEST,
    OP_ITEM_PROPERTIES_REQUEST,
    OP_STATS_REQUEST,
    AffixRequest,
    AffixState,
    ItemPropertiesRequest,
    ItemPropertiesState,
    ItemPropertyPacketRow,
    StatsState,
} from "../shared/StatMessages";
import { affixForItem, itemForRequest } from "./item-affixes";
import {
    flushItemPropertyBridge,
    itemPropertyRevision,
    listItemProperties,
    ratingsForItem,
} from "./item-properties";
import { getStats } from "./stat-store";
import { ensurePeriodicTracker } from "./combat-stats";

const EQUIPMENT_SLOT_END = 19;
const RECOMPUTE_INTERVAL_MS = 3000;
const RECOMPUTE_LOOPS = 0x0fffffff;
export const MASTERY_BPS_KEY = "custom-stats:mastery-bps";

class StatsClient {
    ready: boolean = false;
}

function statsClient(player: TSPlayer): StatsClient {
    return player.GetObject("custom-stats:client", new StatsClient());
}

export function recomputeStats(player: TSPlayer, forceSend: boolean = false): void {
    flushItemPropertyBridge(player);
    ensurePeriodicTracker(player);
    let vampirism = 0;
    let thorns = 0;
    let mastery = 0;
    for (let slot = 0; slot < EQUIPMENT_SLOT_END; slot++) {
        const item = player.GetEquippedItemBySlot(slot);
        if (!item) continue;
        const ratings = ratingsForItem(player, item);
        vampirism += ratings.vampirism;
        thorns += ratings.thorns;
        mastery += ratings.mastery;
    }

    const totals = getStats(player);
    const playerLevel = Number(player.GetLevel());
    const changed = totals.vampirism != vampirism
        || totals.thorns != thorns
        || totals.mastery != mastery
        || totals.playerLevel != playerLevel;
    totals.vampirism = vampirism;
    totals.thorns = thorns;
    totals.mastery = mastery;
    totals.playerLevel = playerLevel;

    // Cross-module, transient contract used by custom gathering buildings.
    player.SetUInt(MASTERY_BPS_KEY, Math.floor(masteryPct(mastery, playerLevel) * 100));
    if (changed || forceSend) sendStats(player);
}

export function sendStats(player: TSPlayer): void {
    if (!statsClient(player).ready) return;
    const totals = getStats(player);
    const state = new StatsState();
    state.vampirism = totals.vampirism;
    state.thorns = totals.thorns;
    state.mastery = totals.mastery;
    const playerLevel = Number(player.GetLevel());
    state.vampirismPct = vampirismPct(totals.vampirism, playerLevel);
    state.thornsPct = thornsPct(totals.thorns, playerLevel);
    state.masteryPct = masteryPct(totals.mastery, playerLevel);
    state.write().SendToPlayer(player);
}

function sendAffix(player: TSPlayer, request: AffixRequest): void {
    const state = new AffixState();
    state.location = request.location;
    state.bag = request.bag;
    state.slot = request.slot;
    const item = itemForRequest(player, request);
    if (item) {
        const affix = affixForItem(player, item);
        state.itemEntry = Number(item.GetEntry());
        state.kind = affix.kind;
        state.value = affix.value;
    }
    state.write().SendToPlayer(player);
}

function sendItemProperties(player: TSPlayer, request: ItemPropertiesRequest): void {
    flushItemPropertyBridge(player);
    const state = new ItemPropertiesState();
    state.location = request.location;
    state.bag = request.bag;
    state.slot = request.slot;
    state.requestToken = request.requestToken;
    const item = itemForRequest(player, request);
    if (item) {
        state.itemEntry = Number(item.GetEntry());
        state.itemGuid = Number(item.GetGUIDLow());
        state.revision = itemPropertyRevision(player, item);
        const properties = listItemProperties(player, item);
        for (let i = 0; i < properties.length; i++) {
            const source = properties[i];
            const row = new ItemPropertyPacketRow();
            row.propertySerial = Number(source.propertySerial);
            row.propertyId = Number(source.propertyId);
            row.value1 = Number(source.value1);
            row.value2 = Number(source.value2);
            row.sourceKind = Number(source.sourceKind);
            row.sourceId = Number(source.sourceId);
            row.sourceEntry = Number(source.sourceEntry);
            row.sourceOwner = Number(source.sourceOwner);
            row.sourceNonce = Number(source.sourceNonce);
            row.flags = Number(source.flags);
            state.properties.push(row);
        }
    }
    state.write().SendToPlayer(player);
}

export function RegisterStatsCore(events: TSEvents): void {
    events.Player.OnLogin((player, firstLogin) => {
        recomputeStats(player);
        player.AddTimer(RECOMPUTE_INTERVAL_MS, RECOMPUTE_LOOPS, (owner, timer) => {
            const current = owner.ToPlayer();
            if (current) recomputeStats(current);
        });
    });

    events.Item.OnEquip((item, player, slot, isMerge) => {
        // The core callback can run before the old slot is fully cleared. A
        // delayed recompute covers both equip and unequip without stale gear.
        player.AddTimer(1, 1, (owner, timer) => {
            const current = owner.ToPlayer();
            if (current) recomputeStats(current);
        });
    });

    events.CustomPacket.OnReceive(OP_STATS_REQUEST, (opcode, packet, player) => {
        statsClient(player).ready = true;
        recomputeStats(player, true);
    });

    events.CustomPacket.OnReceive(OP_AFFIX_REQUEST, (opcode, packet, player) => {
        statsClient(player).ready = true;
        const request = new AffixRequest();
        request.read(packet);
        sendAffix(player, request);
    });

    events.CustomPacket.OnReceive(OP_ITEM_PROPERTIES_REQUEST, (opcode, packet, player) => {
        statsClient(player).ready = true;
        const request = new ItemPropertiesRequest();
        request.read(packet);
        sendItemProperties(player, request);
    });
}
