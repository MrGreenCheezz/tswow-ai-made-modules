import {
    STORAGE_KEY, SMELTER_KEY, LAB_KEY, COOKING_KEY,
    LEATHERWORKING_KEY, LOOM_KEY, INSCRIPTION_KEY, STONECUTTING_KEY,
    ENGINEERING_KEY, BUTCHER_KEY, LEATHER_ARMOR_KEY, PLATE_ARMOR_KEY,
    CLOTH_ARMOR_KEY, WEAPON_FORGE_KEY, JEWELRY_KEY, STATION_KEYS,
    buildingByKey, buildingName,
} from "../shared/BaseCatalog";
import {
    ResourceGeneratorDef, resourceGeneratorByKey,
} from "../shared/ResourceGenerators";
import {
    COMPANION_WORKFORCE_TOKEN_MIN,
    OP_COMPANION_WORKFORCE_ERROR, OP_COMPANION_WORKFORCE_STATE,
    OP_WORKFORCE_REQUEST, OP_WORKFORCE_STATE,
    WORKFORCE_ACTION_STATE, WORKFORCE_ACTION_ASSIGN, WORKFORCE_ACTION_UNASSIGN,
    WORKFORCE_TARGET_STATION, WORKFORCE_TARGET_GENERATOR,
    ErrorMsg, WorkforceRequest, WorkforceState, WorkforceTarget,
} from "../shared/BaseMessages";
import {
    BaseBuilding, BaseFlag, BaseWorkerAssignment, ensureStableBuildingIds,
} from "./base-db";
import { acknowledgeWorkXP, queueWorkXP, WorkforceXPBatch } from "../shared/WorkforceXPLogic";
import { baseClient, baseText, isRussianClient, nowUnix, sendError, setBaseBuildingRemovalHandler } from "./base";

const COMPANION_READY = "custom-companions:workforce-ready";
const BASE_READY = "base-building:workforce-ready";
const WORKER_VISUAL_MARKER = "base-building:workforce-visual";
const WORKER_VISUAL_OWNER = "base-building:worker-owner";
const NPC_FRIENDLY_FACTION = 35;
const UNIT_FLAG_NON_ATTACKABLE = 0x00000002;
const UNIT_FLAG_NOT_SELECTABLE = 0x02000000;
const WORKER_EMOTE_STATE = 173; // EMOTE_STATE_WORK
const WORKFORCE_TIMER_MS = 5000;
const WORKFORCE_TIMER_LOOPS = 0x0fffffff;
const DAILY_WORK_XP_CAP = 100;
const DAY_S = 24 * 60 * 60;

export type StationSettler = (
    player: TSPlayer,
    station: number,
    oldPeriodBps: number,
    newPeriodBps: number,
) => void;

function companionKey(workerId: number, suffix: string): string {
    return `custom-companions:worker:${workerId}:${suffix}`;
}

function baseWorkerKey(workerId: number, suffix: string): string {
    return `base-building:worker:${workerId}:${suffix}`;
}

function cap(value: number, maximum: number): number {
    return Math.max(0, Math.min(maximum, Math.floor(value)));
}

function validUInt(value: number): boolean {
    return value >= 0 && value <= 0xffffffff && value == Math.floor(value);
}

function categoryCode(def: ResourceGeneratorDef): number {
    if (def.category == "ore") return 1;
    if (def.category == "herb") return 2;
    if (def.category == "stone") return 3;
    if (def.category == "wood") return 4;
    if (def.category == "fish") return 5;
    if (def.category == "junk") return 6;
    return 0;
}

function workerById(player: TSPlayer, workerId: number): BaseWorkerAssignment | undefined {
    let found: BaseWorkerAssignment | undefined = undefined;
    BaseWorkerAssignment.get(player).forEach(row => {
        if (!found && row.workerId == workerId) found = row;
    });
    return found;
}

function assignmentForTarget(
    player: TSPlayer,
    targetKind: number,
    targetId: number,
): BaseWorkerAssignment | undefined {
    let found: BaseWorkerAssignment | undefined = undefined;
    BaseWorkerAssignment.get(player).forEach(row => {
        if (!found && row.targetKind == targetKind && row.targetId == targetId) found = row;
    });
    return found;
}

export function workerForStation(player: TSPlayer, station: number): BaseWorkerAssignment | undefined {
    return assignmentForTarget(player, WORKFORCE_TARGET_STATION, station);
}

export function workerForGenerator(
    player: TSPlayer,
    buildingId: number,
): BaseWorkerAssignment | undefined {
    return assignmentForTarget(player, WORKFORCE_TARGET_GENERATOR, buildingId);
}

export function effectiveWorkerPeriod(basePeriod: number, worker?: BaseWorkerAssignment): number {
    const bps = worker ? cap(worker.periodBps, 3500) : 0;
    return Math.max(1, Math.floor(basePeriod * (10000 - bps) / 10000));
}

export function workerSavedInput(worker?: BaseWorkerAssignment): boolean {
    return worker !== undefined && Math.random() * 10000 < cap(worker.saveBps, 2500);
}

export function workerBonusOutput(worker?: BaseWorkerAssignment): boolean {
    return worker !== undefined && Math.random() * 10000 < cap(worker.bonusBps, 2500);
}

function workerCompatible(profession: number, targetKind: number, station: number, category: number): boolean {
    if (targetKind == WORKFORCE_TARGET_GENERATOR) {
        if (profession == 1) return category == 1 || category == 3;
        if (profession == 2) return category == 2;
        if (profession == 3) return category == 4;
        if (profession == 4) return category == 5 || category == 6;
        return false;
    }
    if (targetKind != WORKFORCE_TARGET_STATION) return false;
    if (profession == 1) return station == SMELTER_KEY || station == STONECUTTING_KEY;
    if (profession == 2) return station == LAB_KEY;
    // A carpenter currently has only the exact wood generator as a real
    // compatible target; the weapon forge belongs to smiths and engineers.
    if (profession == 3) return false;
    if (profession == 4) return station == COOKING_KEY;
    if (profession == 5) {
        return station == LEATHERWORKING_KEY || station == BUTCHER_KEY || station == LEATHER_ARMOR_KEY;
    }
    if (profession == 6) return station == LOOM_KEY || station == CLOTH_ARMOR_KEY;
    if (profession == 7) return station == INSCRIPTION_KEY;
    if (profession == 8) {
        return station == SMELTER_KEY || station == PLATE_ARMOR_KEY || station == WEAPON_FORGE_KEY;
    }
    if (profession == 9) return station == ENGINEERING_KEY || station == WEAPON_FORGE_KEY;
    if (profession == 10) return station == STONECUTTING_KEY || station == JEWELRY_KEY;
    return false;
}

function buildingForTarget(
    player: TSPlayer,
    targetKind: number,
    targetId: number,
): BaseBuilding | undefined {
    let found: BaseBuilding | undefined = undefined;
    BaseBuilding.get(player).forEach(row => {
        if (found) return;
        if (targetKind == WORKFORCE_TARGET_STATION && row.catKey == targetId) found = row;
        else if (targetKind == WORKFORCE_TARGET_GENERATOR && row.buildingId == targetId
            && resourceGeneratorByKey(row.catKey)) found = row;
    });
    return found;
}

function targetCategory(player: TSPlayer, targetKind: number, targetId: number): number {
    if (targetKind != WORKFORCE_TARGET_GENERATOR) return 0;
    const row = buildingForTarget(player, targetKind, targetId);
    const def = row ? resourceGeneratorByKey(row.catKey) : undefined;
    return def ? categoryCode(def) : 0;
}

function targetExists(player: TSPlayer, targetKind: number, targetId: number): boolean {
    if (targetKind == WORKFORCE_TARGET_STATION) {
        if (targetId == STORAGE_KEY) return false;
        let known = false;
        for (let i = 0; i < STATION_KEYS.length; i++) {
            if (STATION_KEYS[i] == targetId) known = true;
        }
        return known && buildingForTarget(player, targetKind, targetId) !== undefined;
    }
    return targetKind == WORKFORCE_TARGET_GENERATOR
        && buildingForTarget(player, targetKind, targetId) !== undefined;
}

interface WorkerSnapshot {
    workerRevision: number;
    workerEntry: number;
    profession: number;
    trait: number;
    rank: number;
    periodBps: number;
    saveBps: number;
    bonusBps: number;
    bias: number;
    markBps: number;
    markProperty: number;
}

function companionSnapshot(player: TSPlayer, row: BaseWorkerAssignment): WorkerSnapshot {
    const id = row.workerId;
    return {
        workerRevision: Number(player.GetUInt(companionKey(id, "revision"), row.workerRevision)),
        workerEntry: Number(player.GetUInt(companionKey(id, "entry"), row.workerEntry)),
        profession: Number(player.GetUInt(companionKey(id, "profession"), row.profession)),
        trait: Number(player.GetUInt(companionKey(id, "trait"), row.trait)),
        rank: Number(player.GetUInt(companionKey(id, "rank"), row.rank)),
        periodBps: cap(Number(player.GetUInt(companionKey(id, "period-bps"), row.periodBps)), 3500),
        saveBps: cap(Number(player.GetUInt(companionKey(id, "save-bps"), row.saveBps)), 2500),
        bonusBps: cap(Number(player.GetUInt(companionKey(id, "bonus-bps"), row.bonusBps)), 2500),
        bias: cap(Number(player.GetUInt(companionKey(id, "bias"), row.bias)), 4),
        markBps: cap(Number(player.GetUInt(companionKey(id, "mark-bps"), row.markBps)), 2000),
        markProperty: Number(player.GetUInt(companionKey(id, "mark-property"), row.markProperty)),
    };
}

function applySnapshot(row: BaseWorkerAssignment, snapshot: WorkerSnapshot): void {
    row.workerRevision = snapshot.workerRevision;
    row.workerEntry = snapshot.workerEntry;
    row.profession = snapshot.profession;
    row.trait = snapshot.trait;
    row.rank = snapshot.rank;
    row.periodBps = snapshot.periodBps;
    row.saveBps = snapshot.saveBps;
    row.bonusBps = snapshot.bonusBps;
    row.bias = snapshot.bias;
    row.markBps = snapshot.markBps;
    row.markProperty = snapshot.markProperty;
    row.MarkDirty();
}

function publishAssignment(player: TSPlayer, row: BaseWorkerAssignment): void {
    player.SetUInt(baseWorkerKey(row.workerId, "assigned"), row.targetKind == 0 ? 0 : 1);
    player.SetUInt(baseWorkerKey(row.workerId, "target-kind"), row.targetKind);
    player.SetUInt(baseWorkerKey(row.workerId, "target-id"), row.targetId);
    player.SetUInt(baseWorkerKey(row.workerId, "station"), row.station);
    player.SetUInt(baseWorkerKey(row.workerId, "generator-category"), row.generatorCategory);
    player.SetUInt(baseWorkerKey(row.workerId, "revision"), row.revision);
    player.SetUInt(companionKey(row.workerId, "pending-xp"), row.pendingXP);
    player.SetUInt(companionKey(row.workerId, "xp-revision"), row.xpRevision);
}

function clearVisualRecord(row: BaseWorkerAssignment): void {
    if (row.visualGuid == 0 && row.visualMapId == 0) return;
    row.visualGuid = 0;
    row.visualMapId = 0;
    row.MarkDirty();
}

function removeWorkerVisualFromMap(map: TSMap, row: BaseWorkerAssignment): void {
    if (row.visualGuid == 0 || row.workerEntry == 0) {
        clearVisualRecord(row);
        return;
    }
    const mapId = Number(map.GetMapID());
    if (row.visualMapId != 0 && row.visualMapId != mapId) return;
    const creature = map.GetCreature(CreateGUID(HighGuid.Unit, row.workerEntry, row.visualGuid));
    if (creature
        && Number(creature.GetUInt(WORKER_VISUAL_MARKER, 0)) == 1
        && Number(creature.GetUInt(WORKER_VISUAL_OWNER, 0)) == Number(row.playerGUID)
        && Number(creature.GetUInt("base-building:worker-id", 0)) == row.workerId) {
        creature.DespawnOrUnsummon(0);
    }
    clearVisualRecord(row);
}

function removeWorkerVisual(player: TSPlayer, row: BaseWorkerAssignment): void {
    if (row.visualGuid == 0 || row.workerEntry == 0 || !player.IsInWorld()) {
        clearVisualRecord(row);
        return;
    }
    if (row.visualMapId != 0 && row.visualMapId != player.GetMapID()) {
        clearVisualRecord(row);
        return;
    }
    removeWorkerVisualFromMap(player.GetMap(), row);
}

function syncWorkerVisual(player: TSPlayer, row: BaseWorkerAssignment): void {
    if (!player.IsInWorld() || row.targetKind == 0 || row.workerEntry == 0) {
        removeWorkerVisual(player, row);
        return;
    }
    if (Number(player.GetUInt(COMPANION_READY, 0)) == 1
        && Number(player.GetUInt(companionKey(row.workerId, "available"), 0)) == 1) {
        // Assignment was just published; wait until companions has removed the
        // active/expedition representation before showing its base copy.
        removeWorkerVisual(player, row);
        return;
    }
    const target = buildingForTarget(player, row.targetKind, row.targetId);
    if (!target || target.mapId != player.GetMapID()) {
        removeWorkerVisual(player, row);
        return;
    }
    let live: TSCreature | undefined = undefined;
    if (row.visualGuid != 0) {
        if (row.visualMapId != 0 && row.visualMapId != player.GetMapID()) {
            clearVisualRecord(row);
        } else {
            live = player.GetMap().GetCreature(CreateGUID(HighGuid.Unit, row.workerEntry, row.visualGuid));
        }
        if (live && (Number(live.GetUInt(WORKER_VISUAL_MARKER, 0)) != 1
            || Number(live.GetUInt(WORKER_VISUAL_OWNER, 0)) != Number(row.playerGUID)
            || Number(live.GetUInt("base-building:worker-id", 0)) != row.workerId)) {
            live = undefined;
            clearVisualRecord(row);
        }
    }
    const x = target.x + Math.cos(target.o + Math.PI / 2) * 1.5;
    const y = target.y + Math.sin(target.o + Math.PI / 2) * 1.5;
    if (live && Math.abs(live.GetX() - x) < 0.5 && Math.abs(live.GetY() - y) < 0.5) return;
    if (live) live.DespawnOrUnsummon(0);
    const creature = player.GetMap().SpawnCreature(
        row.workerEntry,
        x,
        y,
        target.z,
        target.o,
        0,
        target.phaseMask || player.GetPhaseMaskForSpawn(),
    );
    if (!creature) {
        clearVisualRecord(row);
        return;
    }
    creature.SetFaction(NPC_FRIENDLY_FACTION);
    creature.SetReactState(0);
    creature.SetRooted(true);
    creature.EmoteState(WORKER_EMOTE_STATE);
    creature.SetNPCFlags(0);
    creature.SetFlag(UnitFields.UNIT_FIELD_FLAGS, UNIT_FLAG_NON_ATTACKABLE | UNIT_FLAG_NOT_SELECTABLE);
    creature.SetUInt(WORKER_VISUAL_MARKER, 1);
    creature.SetUInt(WORKER_VISUAL_OWNER, Number(row.playerGUID));
    creature.SetUInt("base-building:worker-id", row.workerId);
    row.visualGuid = creature.GetGUIDLow();
    row.visualMapId = target.mapId;
    row.MarkDirty();
}

function rescaleGenerator(
    player: TSPlayer,
    buildingId: number,
    oldPeriodBps: number,
    newPeriodBps: number,
): void {
    const row = buildingForTarget(player, WORKFORCE_TARGET_GENERATOR, buildingId);
    if (!row) return;
    const def = resourceGeneratorByKey(row.catKey);
    if (!def) return;
    const now = nowUnix();
    if (row.lastHarvest == 0 || Number(row.lastHarvest) > now) return;
    const oldPeriod = Math.max(1, Math.floor(def.periodS
        * (10000 - cap(oldPeriodBps, 3500)) / 10000));
    const newPeriod = Math.max(1, Math.floor(def.periodS
        * (10000 - cap(newPeriodBps, 3500)) / 10000));
    // Preserve progress through both normal-ready and doubled-ready thresholds.
    const progress = Math.min(2, Math.max(0, (now - Number(row.lastHarvest)) / oldPeriod));
    row.lastHarvest = now - Math.floor(progress * newPeriod);
    row.MarkDirty();
    BaseBuilding.get(player).Save();
}

function settleTarget(
    player: TSPlayer,
    targetKind: number,
    targetId: number,
    oldPeriodBps: number,
    newPeriodBps: number,
    settleStation: StationSettler,
): void {
    // Demolished targets must not perform offline catch-up while their stale
    // assignment is being cleaned up.
    if (!targetExists(player, targetKind, targetId)) return;
    if (targetKind == WORKFORCE_TARGET_STATION) {
        settleStation(player, targetId, oldPeriodBps, newPeriodBps);
    } else if (targetKind == WORKFORCE_TARGET_GENERATOR) {
        rescaleGenerator(player, targetId, oldPeriodBps, newPeriodBps);
    }
}

function bumpRevision(player: TSPlayer, row: BaseWorkerAssignment): void {
    const flag = BaseFlag.get(player);
    flag.workforceRevision = Number(flag.workforceRevision) + 1;
    flag.Save();
    row.revision = flag.workforceRevision;
    row.MarkDirty();
}

function deactivateAssignment(
    player: TSPlayer,
    row: BaseWorkerAssignment,
    settleStation: StationSettler,
): void {
    if (row.targetKind != 0) {
        settleTarget(player, row.targetKind, row.targetId, row.periodBps, 0, settleStation);
    }
    removeWorkerVisual(player, row);
    row.targetKind = 0;
    row.targetId = 0;
    row.station = 0;
    row.generatorCategory = 0;
    bumpRevision(player, row);
    publishAssignment(player, row);
}

function deactivateBuildingWorker(
    player: TSPlayer,
    building: BaseBuilding,
    settleStation: StationSettler,
): void {
    let targetKind = 0;
    let targetId = 0;
    if (resourceGeneratorByKey(Number(building.catKey))) {
        targetKind = WORKFORCE_TARGET_GENERATOR;
        targetId = Number(building.buildingId);
    } else {
        let station = false;
        for (let i = 0; i < STATION_KEYS.length; i++) {
            if (STATION_KEYS[i] == Number(building.catKey)) station = true;
        }
        if (!station) return;
        let anotherCopy = false;
        const removedBuildingId = Number(building.buildingId);
        BaseBuilding.get(player).forEach(other => {
            const sameBuilding = other === building
                || (removedBuildingId > 0 && Number(other.buildingId) == removedBuildingId);
            if (!sameBuilding && !other.IsDeleted()
                && other.catKey == building.catKey) anotherCopy = true;
        });
        if (anotherCopy) return;
        targetKind = WORKFORCE_TARGET_STATION;
        targetId = Number(building.catKey);
    }
    const assignment = assignmentForTarget(player, targetKind, targetId);
    if (!assignment) return;
    deactivateAssignment(player, assignment, settleStation);
    BaseWorkerAssignment.get(player).Save();
}

function readXPBatch(row: BaseWorkerAssignment): WorkforceXPBatch {
    return {
        pendingXP: Number(row.pendingXP),
        queuedXP: Number(row.queuedXP),
        xpRevision: Number(row.xpRevision),
    };
}

function writeXPBatch(row: BaseWorkerAssignment, batch: WorkforceXPBatch): void {
    row.pendingXP = batch.pendingXP;
    row.queuedXP = batch.queuedXP;
    row.xpRevision = batch.xpRevision;
    row.MarkDirty();
}

function reconcileXP(player: TSPlayer, row: BaseWorkerAssignment): boolean {
    if (row.pendingXP == 0) return false;
    const ack = Number(player.GetUInt(companionKey(row.workerId, "xp-ack-revision"), 0));
    const batch = readXPBatch(row);
    if (!acknowledgeWorkXP(batch, ack)) return false;
    writeXPBatch(row, batch);
    publishAssignment(player, row);
    return true;
}

export function awardWorkerServiceXP(
    player: TSPlayer,
    worker: BaseWorkerAssignment | undefined,
    amount: number,
): void {
    if (!worker || amount <= 0) return;
    reconcileXP(player, worker);
    const now = nowUnix();
    if (worker.xpWindowStart == 0 || now - Number(worker.xpWindowStart) >= DAY_S) {
        worker.xpWindowStart = now;
        worker.xpWindowEarned = 0;
    }
    const granted = Math.min(
        Math.floor(amount),
        Math.max(0, DAILY_WORK_XP_CAP - Number(worker.xpWindowEarned)),
    );
    if (granted <= 0) return;
    const batch = readXPBatch(worker);
    queueWorkXP(batch, granted);
    writeXPBatch(worker, batch);
    worker.xpWindowEarned = Number(worker.xpWindowEarned) + granted;
    worker.MarkDirty();
    BaseWorkerAssignment.get(player).Save();
    publishAssignment(player, worker);
}

function refreshSnapshots(player: TSPlayer, settleStation: StationSettler): void {
    const companionReady = Number(player.GetUInt(COMPANION_READY, 0)) == 1;
    const rows = BaseWorkerAssignment.get(player);
    let changed = false;
    rows.forEach(row => {
        if (reconcileXP(player, row)) changed = true;
        publishAssignment(player, row);
        if (!companionReady) {
            syncWorkerVisual(player, row);
            return;
        }
        const exists = Number(player.GetUInt(companionKey(row.workerId, "exists"), 0)) == 1;
        if (!exists) {
            if (row.targetKind != 0) {
                deactivateAssignment(player, row, settleStation);
                changed = true;
            }
            return;
        }
        const snapshot = companionSnapshot(player, row);
        if (snapshot.workerRevision != row.workerRevision) {
            const oldPeriodBps = row.periodBps;
            const oldEntry = row.workerEntry;
            if (row.targetKind != 0) {
                settleTarget(player, row.targetKind, row.targetId,
                    oldPeriodBps, snapshot.periodBps, settleStation);
            }
            if (oldEntry != snapshot.workerEntry) {
                removeWorkerVisual(player, row);
            }
            applySnapshot(row, snapshot);
            if (row.targetKind != 0 && !workerCompatible(
                row.profession,
                row.targetKind,
                row.station,
                row.generatorCategory,
            )) {
                deactivateAssignment(player, row, settleStation);
            }
            // Snapshot/effect changes do not alter target occupancy. Keeping
            // the topology revision stable avoids rejecting a concurrent UI
            // action merely because routine worker XP arrived.
            changed = true;
        }
        if (row.targetKind != 0 && !targetExists(player, row.targetKind, row.targetId)) {
            deactivateAssignment(player, row, settleStation);
            changed = true;
        }
        syncWorkerVisual(player, row);
    });
    if (changed) rows.Save();
}

function fillTargetSnapshot(target: WorkforceTarget, worker?: BaseWorkerAssignment): void {
    if (!worker) return;
    target.workerId = worker.workerId;
    target.workerEntry = worker.workerEntry;
    target.profession = worker.profession;
    target.trait = worker.trait;
    target.rank = worker.rank;
    target.periodBps = worker.periodBps;
    target.saveBps = worker.saveBps;
    target.bonusBps = worker.bonusBps;
    target.bias = worker.bias;
    target.markBps = worker.markBps;
    target.markProperty = worker.markProperty;
    target.pendingXP = worker.pendingXP;
}

function sendWorkforceState(player: TSPlayer, requestToken: number): void {
    ensureStableBuildingIds(player);
    const state = new WorkforceState();
    state.revision = BaseFlag.get(player).workforceRevision;
    state.requestToken = requestToken;
    const seenStations: number[] = [];
    BaseBuilding.get(player).forEach(row => {
        const def = resourceGeneratorByKey(row.catKey);
        if (def) {
            const target = new WorkforceTarget();
            target.targetKind = WORKFORCE_TARGET_GENERATOR;
            target.targetId = row.buildingId;
            target.catKey = row.catKey;
            target.generatorCategory = categoryCode(def);
            target.name = isRussianClient(player) ? def.nameRu : def.nameEn;
            fillTargetSnapshot(target, workerForGenerator(player, row.buildingId));
            state.targets.push(target);
            return;
        }
        if (row.catKey == STORAGE_KEY) return;
        let station = false;
        for (let i = 0; i < STATION_KEYS.length; i++) {
            if (STATION_KEYS[i] == row.catKey) station = true;
        }
        if (!station || seenStations.indexOf(row.catKey) >= 0) return;
        seenStations.push(row.catKey);
        const target = new WorkforceTarget();
        target.targetKind = WORKFORCE_TARGET_STATION;
        target.targetId = row.catKey;
        target.catKey = row.catKey;
        const building = buildingByKey(row.catKey);
        target.name = building
            ? buildingName(building, isRussianClient(player))
            : baseText(player, `Station #${row.catKey}`, `Станция #${row.catKey}`);
        fillTargetSnapshot(target, workerForStation(player, row.catKey));
        state.targets.push(target);
    });
    const responseOpcode = requestToken >= COMPANION_WORKFORCE_TOKEN_MIN
        ? OP_COMPANION_WORKFORCE_STATE
        : OP_WORKFORCE_STATE;
    state.write(responseOpcode).SendToPlayer(player);
}

function sendWorkforceError(player: TSPlayer, msg: WorkforceRequest, message: string): void {
    if (msg.requestToken >= COMPANION_WORKFORCE_TOKEN_MIN) {
        new ErrorMsg(message).write(OP_COMPANION_WORKFORCE_ERROR).SendToPlayer(player);
    } else {
        sendError(player, message);
    }
}

function assignWorker(
    player: TSPlayer,
    msg: WorkforceRequest,
    settleStation: StationSettler,
): void {
    const flag = BaseFlag.get(player);
    if (msg.expectedRevision != flag.workforceRevision) {
        sendWorkforceError(player, msg, "Состояние работников изменилось; список обновлён.");
        return;
    }
    if (Number(player.GetUInt(COMPANION_READY, 0)) != 1) {
        sendWorkforceError(player, msg, "Коллекция спутников ещё загружается.");
        return;
    }
    if (!targetExists(player, msg.targetKind, msg.targetId)) {
        sendWorkforceError(player, msg, "Выбранное рабочее место больше не существует.");
        return;
    }
    const occupied = assignmentForTarget(player, msg.targetKind, msg.targetId);
    if (occupied && occupied.workerId != msg.workerId) {
        sendWorkforceError(player, msg, "Это рабочее место уже занято.");
        return;
    }
    const exists = Number(player.GetUInt(companionKey(msg.workerId, "exists"), 0)) == 1;
    const eligible = Number(player.GetUInt(companionKey(msg.workerId, "eligible"), 0)) == 1;
    if (!exists || !eligible) {
        sendWorkforceError(player, msg, "Спутник активен, находится в экспедиции или недоступен.");
        return;
    }
    const category = targetCategory(player, msg.targetKind, msg.targetId);
    const station = msg.targetKind == WORKFORCE_TARGET_STATION ? msg.targetId : 0;
    const profession = Number(player.GetUInt(companionKey(msg.workerId, "profession"), 0));
    if (!workerCompatible(profession, msg.targetKind, station, category)) {
        sendWorkforceError(player, msg, "Профессия спутника несовместима с этим рабочим местом.");
        return;
    }
    const rows = BaseWorkerAssignment.get(player);
    let row = workerById(player, msg.workerId);
    if (!row) {
        row = rows.Add(new BaseWorkerAssignment(player.GetGUIDLow()));
        row.workerId = msg.workerId;
    }
    const oldKind = row.targetKind;
    const oldTarget = row.targetId;
    const oldPeriodBps = row.periodBps;
    const snapshot = companionSnapshot(player, row);
    if (oldKind == msg.targetKind && oldTarget == msg.targetId) {
        settleTarget(player, oldKind, oldTarget, oldPeriodBps, snapshot.periodBps, settleStation);
    } else {
        if (oldKind != 0) settleTarget(player, oldKind, oldTarget, oldPeriodBps, 0, settleStation);
        settleTarget(player, msg.targetKind, msg.targetId, 0, snapshot.periodBps, settleStation);
    }
    removeWorkerVisual(player, row);
    applySnapshot(row, snapshot);
    row.targetKind = msg.targetKind;
    row.targetId = msg.targetId;
    row.station = station;
    row.generatorCategory = category;
    bumpRevision(player, row);
    row.MarkDirty();
    rows.Save();
    publishAssignment(player, row);
    syncWorkerVisual(player, row);
}

function unassignWorker(
    player: TSPlayer,
    msg: WorkforceRequest,
    settleStation: StationSettler,
): void {
    const flag = BaseFlag.get(player);
    if (msg.expectedRevision != flag.workforceRevision) {
        sendWorkforceError(player, msg, "Состояние работников изменилось; список обновлён.");
        return;
    }
    const row = workerById(player, msg.workerId);
    if (!row || row.targetKind == 0) return;
    deactivateAssignment(player, row, settleStation);
    BaseWorkerAssignment.get(player).Save();
}

export function RegisterBaseWorkforce(events: TSEvents, settleStation: StationSettler): void {
    setBaseBuildingRemovalHandler((player, building) => {
        deactivateBuildingWorker(player, building, settleStation);
    });
    events.CustomPacket.OnReceive(OP_WORKFORCE_REQUEST, (opcode, packet, player) => {
        baseClient(player).ready = true;
        ensureStableBuildingIds(player);
        refreshSnapshots(player, settleStation);
        player.SetUInt(BASE_READY, 1);
        const msg = new WorkforceRequest();
        msg.read(packet);
        const mutation = msg.action == WORKFORCE_ACTION_ASSIGN || msg.action == WORKFORCE_ACTION_UNASSIGN;
        const validMutation = msg.workerId > 0 && validUInt(msg.workerId)
            && validUInt(msg.targetId)
            && validUInt(msg.expectedRevision)
            && validUInt(msg.requestToken)
            && (msg.action == WORKFORCE_ACTION_UNASSIGN
                || msg.targetKind == WORKFORCE_TARGET_STATION
                || msg.targetKind == WORKFORCE_TARGET_GENERATOR);
        if (mutation && !validMutation) sendWorkforceError(player, msg, "Некорректный запрос работника.");
        else if (msg.action == WORKFORCE_ACTION_ASSIGN) assignWorker(player, msg, settleStation);
        else if (msg.action == WORKFORCE_ACTION_UNASSIGN) unassignWorker(player, msg, settleStation);
        else if (msg.action != WORKFORCE_ACTION_STATE) sendWorkforceError(player, msg, "Неизвестное действие работника.");
        sendWorkforceState(player, validUInt(msg.requestToken) ? msg.requestToken : 0);
    });

    events.Player.OnSave(player => BaseWorkerAssignment.get(player).Save());
    events.Map.OnPlayerLeave((map, player) => {
        BaseWorkerAssignment.get(player).forEach(row => removeWorkerVisualFromMap(map, row));
        BaseWorkerAssignment.get(player).Save();
    });
    events.Player.OnLogout(player => {
        // OnLogout and Map.OnPlayerLeave ordering is core-dependent. Use the
        // still-valid map directly so either callback can remove the creature
        // before the persistent GUID is cleared.
        BaseWorkerAssignment.get(player).forEach(row => removeWorkerVisualFromMap(player.GetMap(), row));
        BaseWorkerAssignment.get(player).Save();
    });
    events.Player.OnLogin((player, firstLogin) => {
        ensureStableBuildingIds(player);
        BaseWorkerAssignment.get(player).forEach(row => publishAssignment(player, row));
        // Readiness is the commit marker for the complete persisted snapshot.
        player.SetUInt(BASE_READY, 1);
        player.AddTimer(WORKFORCE_TIMER_MS, WORKFORCE_TIMER_LOOPS, (owner, timer) => {
            const activePlayer = owner.ToPlayer();
            if (!activePlayer) return;
            ensureStableBuildingIds(activePlayer);
            refreshSnapshots(activePlayer, settleStation);
            BaseWorkerAssignment.get(activePlayer).Save();
        });
    });
}
