export const OP_COMPANION_DETAIL_REQUEST = 92; // C->S
export const OP_COMPANION_DETAIL = 93; // S->C
export const OP_COMPANION_TRAINING_ACTION = 94; // C->S

export const COMPANION_ACTION_LEARN_OR_RANK = 1;
export const COMPANION_ACTION_STUDY = 2;
export const COMPANION_ACTION_INSTALL = 3;
export const COMPANION_ACTION_UNINSTALL = 4;

export class CompanionDetailRequest {
    companionId: number = 0;
    requestToken: number = 0;

    constructor(companionId: number = 0, requestToken: number = 0) {
        this.companionId = companionId;
        this.requestToken = requestToken;
    }

    read(read: TSPacketRead): void {
        this.companionId = read.ReadDouble();
        this.requestToken = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_DETAIL_REQUEST, 0);
        packet.WriteDouble(this.companionId);
        packet.WriteDouble(this.requestToken);
        return packet;
    }
}

export class CompanionDetailFeatureState {
    featureId: number = 0;
    rank: number = 0;
    rankProgress: number = 0;
    installedSlot: number = 0;
    inventoryCount: number = 0;

    constructor(
        featureId: number = 0,
        rank: number = 0,
        rankProgress: number = 0,
        installedSlot: number = 0,
        inventoryCount: number = 0,
    ) {
        this.featureId = featureId;
        this.rank = rank;
        this.rankProgress = rankProgress;
        this.installedSlot = installedSlot;
        this.inventoryCount = inventoryCount;
    }
}

export class CompanionDetailState {
    ackToken: number = 0;
    companionId: number = 0;
    revision: number = 0;
    catalogVersion: number = COMPANION_TRAINING_CATALOG_VERSION;
    family: number = 0;
    professionId: number = 0;
    innateTraitId: number = 0;
    serviceXp: number = 0;
    serviceRank: number = 1;
    capacity: number = 2;
    progress: number = 0;
    nextSlotCost: number = 1;
    features: TSArray<CompanionDetailFeatureState> = [];

    read(read: TSPacketRead): void {
        this.ackToken = read.ReadDouble();
        this.companionId = read.ReadDouble();
        this.revision = read.ReadDouble();
        this.catalogVersion = read.ReadDouble();
        this.family = read.ReadDouble();
        this.professionId = read.ReadDouble();
        this.innateTraitId = read.ReadDouble();
        this.serviceXp = read.ReadDouble();
        this.serviceRank = read.ReadDouble();
        this.capacity = read.ReadDouble();
        this.progress = read.ReadDouble();
        this.nextSlotCost = read.ReadDouble();
        this.features = [];
        const count = read.ReadDouble();
        for (let i = 0; i < count; i++) {
            this.features.push(new CompanionDetailFeatureState(
                read.ReadDouble(), read.ReadDouble(), read.ReadDouble(),
                read.ReadDouble(), read.ReadDouble(),
            ));
        }
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_DETAIL, 0);
        packet.WriteDouble(this.ackToken);
        packet.WriteDouble(this.companionId);
        packet.WriteDouble(this.revision);
        packet.WriteDouble(this.catalogVersion);
        packet.WriteDouble(this.family);
        packet.WriteDouble(this.professionId);
        packet.WriteDouble(this.innateTraitId);
        packet.WriteDouble(this.serviceXp);
        packet.WriteDouble(this.serviceRank);
        packet.WriteDouble(this.capacity);
        packet.WriteDouble(this.progress);
        packet.WriteDouble(this.nextSlotCost);
        packet.WriteDouble(this.features.length);
        for (let i = 0; i < this.features.length; i++) {
            const feature = this.features[i];
            packet.WriteDouble(feature.featureId);
            packet.WriteDouble(feature.rank);
            packet.WriteDouble(feature.rankProgress);
            packet.WriteDouble(feature.installedSlot);
            packet.WriteDouble(feature.inventoryCount);
        }
        return packet;
    }
}

export class CompanionTrainingActionRequest {
    requestToken: number = 0;
    expectedRevision: number = 0;
    expectedCatalogVersion: number = COMPANION_TRAINING_CATALOG_VERSION;
    companionId: number = 0;
    action: number = 0;
    featureId: number = 0;
    slot: number = 0;

    constructor(
        requestToken: number = 0,
        expectedRevision: number = 0,
        expectedCatalogVersion: number = COMPANION_TRAINING_CATALOG_VERSION,
        companionId: number = 0,
        action: number = 0,
        featureId: number = 0,
        slot: number = 0,
    ) {
        this.requestToken = requestToken;
        this.expectedRevision = expectedRevision;
        this.expectedCatalogVersion = expectedCatalogVersion;
        this.companionId = companionId;
        this.action = action;
        this.featureId = featureId;
        this.slot = slot;
    }

    read(read: TSPacketRead): void {
        this.requestToken = read.ReadDouble();
        this.expectedRevision = read.ReadDouble();
        this.expectedCatalogVersion = read.ReadDouble();
        this.companionId = read.ReadDouble();
        this.action = read.ReadDouble();
        this.featureId = read.ReadDouble();
        this.slot = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_COMPANION_TRAINING_ACTION, 0);
        packet.WriteDouble(this.requestToken);
        packet.WriteDouble(this.expectedRevision);
        packet.WriteDouble(this.expectedCatalogVersion);
        packet.WriteDouble(this.companionId);
        packet.WriteDouble(this.action);
        packet.WriteDouble(this.featureId);
        packet.WriteDouble(this.slot);
        return packet;
    }
}
import { COMPANION_TRAINING_CATALOG_VERSION } from "./CompanionTraining";

