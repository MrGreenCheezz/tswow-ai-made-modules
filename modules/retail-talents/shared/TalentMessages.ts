/**
 * Retail-style talent system — client<->server protocol (shared).
 *
 * All numbers travel as Double, strings as String (the proven codec used by
 * the custom packet Lua bridge). Variable-length lists are prefixed with a
 * count. The server answers every mutation with a full TalentState resync.
 */

export const OP_STATE_REQUEST = 40; // C->S: request full state
export const OP_STATE         = 41; // S->C: full state
export const OP_LEARN         = 42; // C->S: spend one point in a node
export const OP_ERROR         = 43; // S->C: human-readable rejection
export const OP_RESET         = 44; // C->S: reset tree (RESET_ALL = everything)

export class SpentEntry {
    treeId: number = 0;
    nodeId: number = 0;
    rank: number = 0;
    constructor(treeId: number, nodeId: number, rank: number) {
        this.treeId = treeId;
        this.nodeId = nodeId;
        this.rank = rank;
    }
}

export class TalentState {
    classTotal: number = 0;
    specTotal: number = 0; // shared pool across all specialization trees
    spent: TSArray<SpentEntry> = [];

    read(read: TSPacketRead): void {
        this.classTotal = read.ReadDouble();
        this.specTotal = read.ReadDouble();
        this.spent = [];
        const count = read.ReadDouble();
        for (let i = 0; i < count; i++) {
            const treeId = read.ReadDouble();
            const nodeId = read.ReadDouble();
            const rank = read.ReadDouble();
            this.spent.push(new SpentEntry(treeId, nodeId, rank));
        }
    }

    write(): TSPacketWrite {
        let packet = CreateCustomPacket(OP_STATE, 0);
        packet.WriteDouble(this.classTotal);
        packet.WriteDouble(this.specTotal);
        packet.WriteDouble(this.spent.length);
        for (let i = 0; i < this.spent.length; i++) {
            packet.WriteDouble(this.spent[i].treeId);
            packet.WriteDouble(this.spent[i].nodeId);
            packet.WriteDouble(this.spent[i].rank);
        }
        return packet;
    }
}

export class StateRequest {
    read(read: TSPacketRead): void {
        read.ReadDouble();
    }

    write(): TSPacketWrite {
        let packet = CreateCustomPacket(OP_STATE_REQUEST, 0);
        packet.WriteDouble(0);
        return packet;
    }
}

export class LearnRequest {
    treeId: number = 0;
    nodeId: number = 0;

    constructor(treeId: number, nodeId: number) {
        this.treeId = treeId;
        this.nodeId = nodeId;
    }

    read(read: TSPacketRead): void {
        this.treeId = read.ReadDouble();
        this.nodeId = read.ReadDouble();
    }

    write(): TSPacketWrite {
        let packet = CreateCustomPacket(OP_LEARN, 0);
        packet.WriteDouble(this.treeId);
        packet.WriteDouble(this.nodeId);
        return packet;
    }
}

export class ResetRequest {
    treeId: number = 0;

    constructor(treeId: number) {
        this.treeId = treeId;
    }

    read(read: TSPacketRead): void {
        this.treeId = read.ReadDouble();
    }

    write(): TSPacketWrite {
        let packet = CreateCustomPacket(OP_RESET, 0);
        packet.WriteDouble(this.treeId);
        return packet;
    }
}

export class ErrorMsg {
    message: string = "";

    constructor(message: string) {
        this.message = message;
    }

    read(read: TSPacketRead): void {
        this.message = read.ReadString();
    }

    write(): TSPacketWrite {
        let packet = CreateCustomPacket(OP_ERROR, 0);
        packet.WriteString(this.message);
        return packet;
    }
}
