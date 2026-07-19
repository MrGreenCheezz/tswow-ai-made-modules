export const OP_COMPANION_REQUEST  = 64; // C->S: запросить полный список
export const OP_COMPANION_STATE    = 65; // S->C: активный спутник и весь список
export const OP_COMPANION_ACTIVATE = 66; // C->S: companionId, 0 означает отозвать
export const OP_COMPANION_ERROR    = 67; // S->C: текст отказа
export const OP_COMPANION_MODE     = 75; // C->S: companionId + режим боя
export const OP_COMPANION_EXPEDITION = 78; // C->S: отправить спутника / забрать награду
export const OP_COMPANION_ATTACK   = 84; // C->S: приказ атаковать выбранную игроком цель
export const OP_COMPANION_SUMMARY_V3 = 91; // S->C: v3 summary for the whole collection

export const COMPANION_MODE_DEFENSE = 0;
export const COMPANION_MODE_PASSIVE = 1;
export const COMPANION_MODE_TANK = 2;
export const COMPANION_EXPEDITION_START = 1;
export const COMPANION_EXPEDITION_CLAIM = 2;
export const COMPANION_PROTOCOL_EXPEDITIONS_VERSION = 2;
export const COMPANION_PROTOCOL_VERSION = 3;

export class CompanionStateEntry {
    companionId: number = 0;
    entry: number = 0;
    name: string = "";
    healthPct: number = 0;
    combatMode: number = COMPANION_MODE_DEFENSE;
    expeditionSpecialty: number = 0;
    expeditionRemainingS: number = -1;
    professionId: number = 0;
    innateTraitId: number = 0;
    serviceXp: number = 0;
    serviceRank: number = 1;
    trainingCapacity: number = 2;
    trainingProgress: number = 0;
    trainingRevision: number = 0;
    installedCount: number = 0;

    constructor(
        companionId: number,
        entry: number,
        name: string,
        healthPct: number,
        combatMode: number = COMPANION_MODE_DEFENSE,
        expeditionSpecialty: number = 0,
        expeditionRemainingS: number = -1,
        professionId: number = 0,
        innateTraitId: number = 0,
        serviceXp: number = 0,
        serviceRank: number = 1,
        trainingCapacity: number = 2,
        trainingProgress: number = 0,
        trainingRevision: number = 0,
        installedCount: number = 0,
    ) {
        this.companionId = companionId;
        this.entry = entry;
        this.name = name;
        this.healthPct = healthPct;
        this.combatMode = combatMode;
        this.expeditionSpecialty = expeditionSpecialty;
        this.expeditionRemainingS = expeditionRemainingS;
        this.professionId = professionId;
        this.innateTraitId = innateTraitId;
        this.serviceXp = serviceXp;
        this.serviceRank = serviceRank;
        this.trainingCapacity = trainingCapacity;
        this.trainingProgress = trainingProgress;
        this.trainingRevision = trainingRevision;
        this.installedCount = installedCount;
    }
}

export class CompanionState {
    selectedProtocolVersion: number = COMPANION_PROTOCOL_EXPEDITIONS_VERSION;
    activeId: number = 0;
    companions: TSArray<CompanionStateEntry> = [];

    read(read: TSPacketRead, protocolVersion: number = COMPANION_PROTOCOL_EXPEDITIONS_VERSION): void {
        this.selectedProtocolVersion = protocolVersion >= COMPANION_PROTOCOL_VERSION
            ? read.ReadDouble()
            : protocolVersion;
        this.activeId = read.ReadDouble();
        this.companions = [];
        const count = read.ReadDouble();
        for (let i = 0; i < count; i++) {
            const entry = new CompanionStateEntry(
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadString(),
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
            );
            if (protocolVersion >= COMPANION_PROTOCOL_VERSION) {
                entry.professionId = read.ReadDouble();
                entry.innateTraitId = read.ReadDouble();
                entry.serviceXp = read.ReadDouble();
                entry.serviceRank = read.ReadDouble();
                entry.trainingCapacity = read.ReadDouble();
                entry.trainingProgress = read.ReadDouble();
                entry.trainingRevision = read.ReadDouble();
                entry.installedCount = read.ReadDouble();
            }
            this.companions.push(entry);
        }
    }

    write(protocolVersion: number = COMPANION_PROTOCOL_VERSION): TSPacketWrite {
        const selected = protocolVersion >= COMPANION_PROTOCOL_VERSION
            ? COMPANION_PROTOCOL_VERSION
            : protocolVersion >= COMPANION_PROTOCOL_EXPEDITIONS_VERSION
                ? COMPANION_PROTOCOL_EXPEDITIONS_VERSION
                : 0;
        const packet = CreateCustomPacket(
            selected >= COMPANION_PROTOCOL_VERSION
                ? OP_COMPANION_SUMMARY_V3
                : OP_COMPANION_STATE,
            0,
        );
        if (selected >= COMPANION_PROTOCOL_VERSION) packet.WriteDouble(selected);
        packet.WriteDouble(this.activeId);
        packet.WriteDouble(this.companions.length);
        for (let i = 0; i < this.companions.length; i++) {
            const companion = this.companions[i];
            packet.WriteDouble(companion.companionId);
            packet.WriteDouble(companion.entry);
            packet.WriteString(companion.name);
            packet.WriteDouble(companion.healthPct);
            packet.WriteDouble(companion.combatMode);
            if (selected >= COMPANION_PROTOCOL_EXPEDITIONS_VERSION) {
                packet.WriteDouble(companion.expeditionSpecialty);
                packet.WriteDouble(companion.expeditionRemainingS);
            }
            if (selected >= COMPANION_PROTOCOL_VERSION) {
                packet.WriteDouble(companion.professionId);
                packet.WriteDouble(companion.innateTraitId);
                packet.WriteDouble(companion.serviceXp);
                packet.WriteDouble(companion.serviceRank);
                packet.WriteDouble(companion.trainingCapacity);
                packet.WriteDouble(companion.trainingProgress);
                packet.WriteDouble(companion.trainingRevision);
                packet.WriteDouble(companion.installedCount);
            }
        }
        return packet;
    }
}

export class CompanionStateRequest {
    protocolVersion: number = COMPANION_PROTOCOL_VERSION;

    read(read: TSPacketRead): void { this.protocolVersion = read.ReadDouble(); }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_REQUEST, 0);
        packet.WriteDouble(this.protocolVersion);
        return packet;
    }
}

export class CompanionActivateRequest {
    companionId: number = 0;

    constructor(companionId: number) { this.companionId = companionId; }

    read(read: TSPacketRead): void { this.companionId = read.ReadDouble(); }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_ACTIVATE, 0);
        packet.WriteDouble(this.companionId);
        return packet;
    }
}

export class CompanionModeRequest {
    companionId: number = 0;
    combatMode: number = COMPANION_MODE_DEFENSE;

    constructor(companionId: number, combatMode: number) {
        this.companionId = companionId;
        this.combatMode = combatMode;
    }

    read(read: TSPacketRead): void {
        this.companionId = read.ReadDouble();
        this.combatMode = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_MODE, 0);
        packet.WriteDouble(this.companionId);
        packet.WriteDouble(this.combatMode);
        return packet;
    }
}

export class CompanionAttackRequest {
    /** 0 asks the server to resolve the player's current active companion. */
    companionId: number = 0;

    constructor(companionId: number) { this.companionId = companionId; }

    read(read: TSPacketRead): void { this.companionId = read.ReadDouble(); }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_ATTACK, 0);
        packet.WriteDouble(this.companionId);
        return packet;
    }
}

export class CompanionExpeditionRequest {
    companionId: number = 0;
    action: number = 0;

    constructor(companionId: number, action: number) {
        this.companionId = companionId;
        this.action = action;
    }

    read(read: TSPacketRead): void {
        this.companionId = read.ReadDouble();
        this.action = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_EXPEDITION, 0);
        packet.WriteDouble(this.companionId);
        packet.WriteDouble(this.action);
        return packet;
    }
}

export class CompanionError {
    message: string = "";

    constructor(message: string) { this.message = message; }

    read(read: TSPacketRead): void { this.message = read.ReadString(); }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_ERROR, 0);
        packet.WriteString(this.message);
        return packet;
    }
}
