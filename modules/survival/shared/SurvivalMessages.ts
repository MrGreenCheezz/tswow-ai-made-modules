/**
 * Survival (hunger/thirst) — client<->server protocol.
 * Opcodes 60–61 (talents 40–44, stats 50–51 — no overlap).
 */

export const OP_SURVIVAL_REQUEST = 60; // C->S
export const OP_SURVIVAL = 61;         // S->C

export class SurvivalRequest {
    read(read: TSPacketRead): void {
        read.ReadDouble();
    }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_SURVIVAL_REQUEST, 0);
        p.WriteDouble(0);
        return p;
    }
}

export class SurvivalState {
    hunger: number = 100;
    thirst: number = 100;

    read(read: TSPacketRead): void {
        this.hunger = read.ReadDouble();
        this.thirst = read.ReadDouble();
    }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_SURVIVAL, 0);
        p.WriteDouble(this.hunger);
        p.WriteDouble(this.thirst);
        return p;
    }
}
