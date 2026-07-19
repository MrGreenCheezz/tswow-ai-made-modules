/** Custom stats protocol. 52-75 are used by base/companion modules. */

export const OP_STATS_REQUEST = 50;
export const OP_STATS = 51;
export const OP_AFFIX_REQUEST = 76;
export const OP_AFFIX = 77;
export const OP_ITEM_PROPERTIES_REQUEST = 97;
export const OP_ITEM_PROPERTIES = 98;

const MAX_ITEM_PROPERTIES_IN_PACKET = 32;

export const ITEM_LOCATION_BAG = 0;
export const ITEM_LOCATION_EQUIPMENT = 1;

export class StatsRequest {
    read(read: TSPacketRead): void { read.ReadDouble(); }
    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_STATS_REQUEST, 0);
        packet.WriteDouble(0);
        return packet;
    }
}

export class StatsState {
    vampirism: number = 0;
    thorns: number = 0;
    mastery: number = 0;
    vampirismPct: number = 0;
    thornsPct: number = 0;
    masteryPct: number = 0;

    read(read: TSPacketRead): void {
        this.vampirism = read.ReadDouble();
        this.thorns = read.ReadDouble();
        this.mastery = read.ReadDouble();
        this.vampirismPct = read.ReadDouble();
        this.thornsPct = read.ReadDouble();
        this.masteryPct = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_STATS, 0);
        packet.WriteDouble(this.vampirism);
        packet.WriteDouble(this.thorns);
        packet.WriteDouble(this.mastery);
        packet.WriteDouble(this.vampirismPct);
        packet.WriteDouble(this.thornsPct);
        packet.WriteDouble(this.masteryPct);
        return packet;
    }
}

export class AffixRequest {
    constructor(
        public location: number = ITEM_LOCATION_BAG,
        public bag: number = 0,
        public slot: number = 0,
    ) {}

    read(read: TSPacketRead): void {
        this.location = read.ReadDouble();
        this.bag = read.ReadDouble();
        this.slot = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_AFFIX_REQUEST, 0);
        packet.WriteDouble(this.location);
        packet.WriteDouble(this.bag);
        packet.WriteDouble(this.slot);
        return packet;
    }
}

export class AffixState {
    location: number = ITEM_LOCATION_BAG;
    bag: number = 0;
    slot: number = 0;
    itemEntry: number = 0;
    kind: number = 0;
    value: number = 0;

    read(read: TSPacketRead): void {
        this.location = read.ReadDouble();
        this.bag = read.ReadDouble();
        this.slot = read.ReadDouble();
        this.itemEntry = read.ReadDouble();
        this.kind = read.ReadDouble();
        this.value = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_AFFIX, 0);
        packet.WriteDouble(this.location);
        packet.WriteDouble(this.bag);
        packet.WriteDouble(this.slot);
        packet.WriteDouble(this.itemEntry);
        packet.WriteDouble(this.kind);
        packet.WriteDouble(this.value);
        return packet;
    }
}

/** New multi-property tooltip request; the old 76/77 pair stays supported. */
export class ItemPropertiesRequest extends AffixRequest {
    constructor(
        location: number = ITEM_LOCATION_BAG,
        bag: number = 0,
        slot: number = 0,
        public requestToken: number = 0,
    ) {
        super(location, bag, slot);
    }

    read(read: TSPacketRead): void {
        super.read(read);
        this.requestToken = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ITEM_PROPERTIES_REQUEST, 0);
        packet.WriteDouble(this.location);
        packet.WriteDouble(this.bag);
        packet.WriteDouble(this.slot);
        packet.WriteDouble(this.requestToken);
        return packet;
    }
}

export class ItemPropertyPacketRow {
    propertySerial: number = 0;
    propertyId: number = 0;
    value1: number = 0;
    value2: number = 0;
    sourceKind: number = 0;
    sourceId: number = 0;
    sourceEntry: number = 0;
    sourceOwner: number = 0;
    sourceNonce: number = 0;
    flags: number = 0;

    read(read: TSPacketRead): void {
        this.propertySerial = read.ReadDouble();
        this.propertyId = read.ReadDouble();
        this.value1 = read.ReadDouble();
        this.value2 = read.ReadDouble();
        this.sourceKind = read.ReadDouble();
        this.sourceId = read.ReadDouble();
        this.sourceEntry = read.ReadDouble();
        this.sourceOwner = read.ReadDouble();
        this.sourceNonce = read.ReadDouble();
        this.flags = read.ReadDouble();
    }

    write(packet: TSPacketWrite): void {
        packet.WriteDouble(this.propertySerial);
        packet.WriteDouble(this.propertyId);
        packet.WriteDouble(this.value1);
        packet.WriteDouble(this.value2);
        packet.WriteDouble(this.sourceKind);
        packet.WriteDouble(this.sourceId);
        packet.WriteDouble(this.sourceEntry);
        packet.WriteDouble(this.sourceOwner);
        packet.WriteDouble(this.sourceNonce);
        packet.WriteDouble(this.flags);
    }
}

export class ItemPropertiesState {
    location: number = ITEM_LOCATION_BAG;
    bag: number = 0;
    slot: number = 0;
    requestToken: number = 0;
    itemEntry: number = 0;
    itemGuid: number = 0;
    revision: number = 0;
    properties: ItemPropertyPacketRow[] = [];

    read(read: TSPacketRead): void {
        this.location = read.ReadDouble();
        this.bag = read.ReadDouble();
        this.slot = read.ReadDouble();
        this.requestToken = read.ReadDouble();
        this.itemEntry = read.ReadDouble();
        this.itemGuid = read.ReadDouble();
        this.revision = read.ReadDouble();
        const count = Math.min(
            MAX_ITEM_PROPERTIES_IN_PACKET,
            Math.max(0, Math.floor(read.ReadDouble())),
        );
        this.properties = [];
        for (let i = 0; i < count; i++) {
            const property = new ItemPropertyPacketRow();
            property.read(read);
            this.properties.push(property);
        }
    }

    write(): TSPacketWrite {
        const count = Math.min(MAX_ITEM_PROPERTIES_IN_PACKET, this.properties.length);
        const packet = CreateCustomPacket(OP_ITEM_PROPERTIES, 0);
        packet.WriteDouble(this.location);
        packet.WriteDouble(this.bag);
        packet.WriteDouble(this.slot);
        packet.WriteDouble(this.requestToken);
        packet.WriteDouble(this.itemEntry);
        packet.WriteDouble(this.itemGuid);
        packet.WriteDouble(this.revision);
        packet.WriteDouble(count);
        for (let i = 0; i < count; i++) this.properties[i].write(packet);
        return packet;
    }
}
