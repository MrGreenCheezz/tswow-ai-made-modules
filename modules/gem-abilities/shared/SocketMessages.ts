/** Client/server contract for extracting ability gems from the native socket UI. */

export const OP_GEM_EXTRACT = 85;

export const GEM_LOCATION_EQUIPMENT = 0;
export const GEM_LOCATION_CONTAINER = 1;

const PLAYER_BAG = 255;
const EQUIPMENT_SLOT_COUNT = 19;
const BACKPACK_SLOT_COUNT = 16;
const MAX_CARRIED_BAG_SLOT_COUNT = 36;
const INVENTORY_BAG_SLOT_START = 19;
const BACKPACK_ITEM_SLOT_START = 23;

function isInteger(value: number): boolean {
    return value == Math.floor(value);
}

/**
 * Converts Blizzard's socket API location to Trinity's GetItemByPos bag/slot.
 * An empty array means that the client supplied an unsupported location.
 */
export function resolveSocketItemPosition(location: number, bag: number, slot: number): number[] {
    if (!isInteger(location) || !isInteger(bag) || !isInteger(slot)) return [];

    if (location == GEM_LOCATION_EQUIPMENT) {
        if (bag != 0 || slot < 1 || slot > EQUIPMENT_SLOT_COUNT) return [];
        return [PLAYER_BAG, slot - 1];
    }

    if (location != GEM_LOCATION_CONTAINER) return [];
    if (bag == 0) {
        if (slot < 1 || slot > BACKPACK_SLOT_COUNT) return [];
        return [PLAYER_BAG, BACKPACK_ITEM_SLOT_START + slot - 1];
    }
    if (bag < 1 || bag > 4 || slot < 1 || slot > MAX_CARRIED_BAG_SLOT_COUNT) return [];
    return [INVENTORY_BAG_SLOT_START + bag - 1, slot - 1];
}

export class GemExtractRequest {
    location: number = GEM_LOCATION_EQUIPMENT;
    bag: number = 0;
    slot: number = 0;

    constructor(location: number = GEM_LOCATION_EQUIPMENT, bag: number = 0, slot: number = 0) {
        this.location = location;
        this.bag = bag;
        this.slot = slot;
    }

    read(packet: TSPacketRead): void {
        this.location = packet.ReadDouble();
        this.bag = packet.ReadDouble();
        this.slot = packet.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_GEM_EXTRACT, 0);
        packet.WriteDouble(this.location);
        packet.WriteDouble(this.bag);
        packet.WriteDouble(this.slot);
        return packet;
    }
}
