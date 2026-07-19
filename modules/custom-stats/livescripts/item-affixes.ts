import { ItemAffixRoll } from "../shared/StatFormula";
import {
    AffixRequest,
    ITEM_LOCATION_BAG,
    ITEM_LOCATION_EQUIPMENT,
} from "../shared/StatMessages";
import { legacyAffixForItem } from "./item-properties";

const INVENTORY_SLOT_BAG_0 = 255;
const EQUIPMENT_SLOT_END = 19;
const INVENTORY_SLOT_ITEM_START = 23;
const INVENTORY_SLOT_ITEM_END = 39;
const INVENTORY_SLOT_BAG_START = 19;
const BANK_CONTAINER = -1;
const BANK_SLOT_ITEM_START = 39;
const BANK_SLOT_ITEM_END = 67;
const BANK_BAG_CLIENT_START = 5;
const BANK_BAG_CLIENT_END = 11;
const BANK_SLOT_BAG_START = 67;

export function affixForItem(player: TSPlayer, item: TSItem): ItemAffixRoll {
    return legacyAffixForItem(player, item);
}

/** Resolve a standard 3.3.5 Lua bag/equipment location on the server. */
export function itemForRequest(player: TSPlayer, request: AffixRequest): TSItem | undefined {
    const slot = Math.floor(request.slot);
    if (request.location == ITEM_LOCATION_EQUIPMENT) {
        if (slot >= 1 && slot <= EQUIPMENT_SLOT_END) {
            return player.GetItemByPos(INVENTORY_SLOT_BAG_0, slot - 1);
        }
        // BankFrame uses SetInventoryItem("player", 40..67) for the main
        // bank, while container APIs use bag=-1. Both map to server 39..66.
        if (slot >= BANK_SLOT_ITEM_START + 1 && slot <= BANK_SLOT_ITEM_END) {
            return player.GetItemByPos(INVENTORY_SLOT_BAG_0, slot - 1);
        }
        return undefined;
    }
    if (request.location != ITEM_LOCATION_BAG) return undefined;

    const bag = Math.floor(request.bag);
    if (bag == 0) {
        if (slot < 1 || slot > INVENTORY_SLOT_ITEM_END - INVENTORY_SLOT_ITEM_START) return undefined;
        return player.GetItemByPos(INVENTORY_SLOT_BAG_0, INVENTORY_SLOT_ITEM_START + slot - 1);
    }
    if (bag == BANK_CONTAINER) {
        if (slot < 1 || slot > BANK_SLOT_ITEM_END - BANK_SLOT_ITEM_START) return undefined;
        return player.GetItemByPos(INVENTORY_SLOT_BAG_0, BANK_SLOT_ITEM_START + slot - 1);
    }
    if (bag >= BANK_BAG_CLIENT_START && bag <= BANK_BAG_CLIENT_END && slot >= 1) {
        const bankBagSlot = BANK_SLOT_BAG_START + bag - BANK_BAG_CLIENT_START;
        const bankBag = player.GetItemByPos(INVENTORY_SLOT_BAG_0, bankBagSlot);
        if (!bankBag || slot > bankBag.GetBagSize()) return undefined;
        return player.GetItemByPos(bankBagSlot, slot - 1);
    }
    if (bag < 1 || bag > 4 || slot < 1) return undefined;

    const bagSlot = INVENTORY_SLOT_BAG_START + bag - 1;
    const bagItem = player.GetItemByPos(INVENTORY_SLOT_BAG_0, bagSlot);
    if (!bagItem || slot > bagItem.GetBagSize()) return undefined;
    return player.GetItemByPos(bagSlot, slot - 1);
}
