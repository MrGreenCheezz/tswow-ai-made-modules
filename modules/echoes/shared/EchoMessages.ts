/** Shared client/server protocol for the card chooser and boss-book collection. */

export const OP_ECHO_STATE_REQUEST = 86;
export const OP_ECHO_STATE = 87;
export const OP_ECHO_CHOOSE = 88;
export const OP_ECHO_ERROR = 89;
export const OP_ECHO_COLLECTION_SET_ACTIVE = 90;

export const ECHO_ERROR_CONTEXT_GENERAL = 0;
export const ECHO_ERROR_CONTEXT_CARD = 1;
export const ECHO_ERROR_CONTEXT_COLLECTION = 2;

export class EchoOfferEntry {
    echoIndex: number = 0;

    constructor(echoIndex: number) {
        this.echoIndex = echoIndex;
    }
}

/**
 * Full authoritative state. Every server response replaces the client copy.
 * `spellIds` and `ranks` are aligned with the stable shared catalog order.
 */
export class EchoStateMsg {
    level: number = 1;
    /** Kept in the wire layout: chosen ranks plus the current item-created pick. */
    earned: number = 0;
    picked: number = 0;
    pending: number = 0;
    offerToken: number = 0;
    spellIds: TSArray<number> = [];
    ranks: TSArray<number> = [];
    offers: TSArray<EchoOfferEntry> = [];
    collectionSlotLimit: number = 2;
    /** Aligned with the stable CollectionEchoDefs catalog order. */
    collectionSpellIds: TSArray<number> = [];
    collectionUnlocked: TSArray<number> = [];
    /** Zero means inactive; positive values are authoritative active slots. */
    collectionActiveSlots: TSArray<number> = [];
    /** Last OP90 request processed by the server; appended for wire compatibility. */
    collectionAckToken: number = 0;

    read(packet: TSPacketRead): void {
        this.level = packet.ReadDouble(1);
        this.earned = packet.ReadDouble(0);
        this.picked = packet.ReadDouble(0);
        this.pending = packet.ReadDouble(0);
        this.offerToken = packet.ReadDouble(0);
        this.spellIds = [];
        this.ranks = [];
        const catalogCount = packet.ReadDouble(0);
        for (let i = 0; i < catalogCount; i++) {
            this.spellIds.push(packet.ReadDouble(0));
            this.ranks.push(packet.ReadDouble(0));
        }
        this.offers = [];
        const offerCount = packet.ReadDouble(0);
        for (let i = 0; i < offerCount; i++) {
            this.offers.push(new EchoOfferEntry(packet.ReadDouble(0)));
        }
        this.collectionSlotLimit = packet.ReadDouble(2);
        this.collectionSpellIds = [];
        this.collectionUnlocked = [];
        this.collectionActiveSlots = [];
        const collectionCount = packet.ReadDouble(0);
        for (let i = 0; i < collectionCount; i++) {
            this.collectionSpellIds.push(packet.ReadDouble(0));
            this.collectionUnlocked.push(packet.ReadDouble(0));
            this.collectionActiveSlots.push(packet.ReadDouble(0));
        }
        this.collectionAckToken = packet.ReadDouble(0);
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ECHO_STATE, 0);
        packet.WriteDouble(this.level);
        packet.WriteDouble(this.earned);
        packet.WriteDouble(this.picked);
        packet.WriteDouble(this.pending);
        packet.WriteDouble(this.offerToken);
        packet.WriteDouble(this.spellIds.length);
        for (let i = 0; i < this.spellIds.length; i++) {
            packet.WriteDouble(this.spellIds[i]);
            packet.WriteDouble(this.ranks[i] || 0);
        }
        packet.WriteDouble(this.offers.length);
        for (let i = 0; i < this.offers.length; i++) {
            packet.WriteDouble(this.offers[i].echoIndex);
        }
        packet.WriteDouble(this.collectionSlotLimit);
        packet.WriteDouble(this.collectionSpellIds.length);
        for (let i = 0; i < this.collectionSpellIds.length; i++) {
            packet.WriteDouble(this.collectionSpellIds[i]);
            packet.WriteDouble(this.collectionUnlocked[i] || 0);
            packet.WriteDouble(this.collectionActiveSlots[i] || 0);
        }
        packet.WriteDouble(this.collectionAckToken);
        return packet;
    }
}

export class EchoStateRequest {
    read(packet: TSPacketRead): void {
        packet.ReadDouble(0);
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ECHO_STATE_REQUEST, 0);
        packet.WriteDouble(0);
        return packet;
    }
}

/** A token plus catalog index; the client never chooses by arbitrary spell ID. */
export class EchoChooseRequest {
    offerToken: number = 0;
    echoIndex: number = 0;

    constructor(offerToken: number, echoIndex: number) {
        this.offerToken = offerToken;
        this.echoIndex = echoIndex;
    }

    read(packet: TSPacketRead): void {
        this.offerToken = packet.ReadDouble(0);
        this.echoIndex = packet.ReadDouble(0);
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ECHO_CHOOSE, 0);
        packet.WriteDouble(this.offerToken);
        packet.WriteDouble(this.echoIndex);
        return packet;
    }
}

/** Collection mutations use a stable catalog index, never an arbitrary spell ID. */
export class EchoCollectionSetActiveRequest {
    echoIndex: number = 0;
    active: number = 0;
    requestToken: number = 0;

    constructor(echoIndex: number, active: number, requestToken: number = 0) {
        this.echoIndex = echoIndex;
        this.active = active;
        this.requestToken = requestToken;
    }

    read(packet: TSPacketRead): void {
        this.echoIndex = packet.ReadDouble(0);
        this.active = packet.ReadDouble(0);
        this.requestToken = packet.ReadDouble(0);
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ECHO_COLLECTION_SET_ACTIVE, 0);
        packet.WriteDouble(this.echoIndex);
        packet.WriteDouble(this.active);
        packet.WriteDouble(this.requestToken);
        return packet;
    }
}

export class EchoErrorMsg {
    message: string = "";
    /** Appended after the legacy string so older clients can still read it. */
    context: number = ECHO_ERROR_CONTEXT_GENERAL;

    constructor(message: string, context: number = ECHO_ERROR_CONTEXT_GENERAL) {
        this.message = message;
        this.context = context;
    }

    read(packet: TSPacketRead): void {
        this.message = packet.ReadString("");
        this.context = packet.ReadDouble(ECHO_ERROR_CONTEXT_GENERAL);
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ECHO_ERROR, 0);
        packet.WriteString(this.message);
        packet.WriteDouble(this.context);
        return packet;
    }
}
