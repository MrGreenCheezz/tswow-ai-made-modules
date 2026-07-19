import {
    OP_WORKFORCE_STATE,
    WORKFORCE_ACTION_STATE, WORKFORCE_ACTION_UNASSIGN,
    WORKFORCE_TARGET_STATION,
    WorkforceRequest, WorkforceState, WorkforceTarget,
} from "../shared/BaseMessages";

let state: WorkforceState | undefined;
let requestToken = 1;
let pendingRequestToken = 0;
let refreshHandler: (() => void) | undefined;

function nextRequestToken(): number {
    requestToken = requestToken >= 999999999 ? 1 : requestToken + 1;
    pendingRequestToken = requestToken;
    return requestToken;
}

export function stationWorker(station: number): WorkforceTarget | undefined {
    if (!state) return undefined;
    for (let i = 0; i < state.targets.length; i++) {
        const target = state.targets[i];
        if (target.targetKind == WORKFORCE_TARGET_STATION && target.targetId == station) return target;
    }
    return undefined;
}

export function requestWorkforceState(): void {
    new WorkforceRequest(
        WORKFORCE_ACTION_STATE, 0, 0, 0,
        state ? state.revision : 0,
        nextRequestToken(),
    ).write().Send();
}

export function unassignStationWorker(station: number): void {
    const worker = stationWorker(station);
    if (!worker || worker.workerId <= 0 || !state) return;
    new WorkforceRequest(
        WORKFORCE_ACTION_UNASSIGN,
        worker.workerId,
        WORKFORCE_TARGET_STATION,
        station,
        state.revision,
        nextRequestToken(),
    ).write().Send();
}

export function initWorkforceUI(onRefresh: () => void): void {
    refreshHandler = onRefresh;
    OnCustomPacket(OP_WORKFORCE_STATE, packet => {
        const next = new WorkforceState();
        next.read(packet);
        if (pendingRequestToken <= 0 || next.requestToken != pendingRequestToken) return;
        pendingRequestToken = 0;
        if (state && next.revision < state.revision) return;
        state = next;
        if (refreshHandler) refreshHandler();
    });
}
