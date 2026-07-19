export interface WorkforceXPBatch {
    pendingXP: number;
    queuedXP: number;
    xpRevision: number;
}

function nextXPRevision(current: number): number {
    const next = Math.floor(current) + 1;
    return next > 0xffffffff || next <= 0 ? 1 : next;
}

/**
 * Adds earned XP without changing an in-flight batch. The published revision
 * stays stable until companions acknowledges that exact batch.
 */
export function queueWorkXP(batch: WorkforceXPBatch, amount: number): boolean {
    const granted = Math.max(0, Math.floor(amount));
    if (granted == 0) return false;
    if (batch.pendingXP > 0) {
        batch.queuedXP = Math.max(0, Math.floor(batch.queuedXP)) + granted;
    } else {
        batch.pendingXP = Math.max(0, Math.floor(batch.queuedXP)) + granted;
        batch.queuedXP = 0;
        batch.xpRevision = nextXPRevision(batch.xpRevision);
    }
    return true;
}

/**
 * Acknowledges only the currently published batch. Any XP earned while that
 * batch was in flight is promoted under a fresh revision, so a repeated old
 * acknowledgement cannot consume or re-award it.
 */
export function acknowledgeWorkXP(batch: WorkforceXPBatch, ackRevision: number): boolean {
    if (batch.pendingXP <= 0 || Math.floor(ackRevision) != Math.floor(batch.xpRevision)) {
        return false;
    }
    batch.pendingXP = 0;
    const queued = Math.max(0, Math.floor(batch.queuedXP));
    batch.queuedXP = 0;
    if (queued > 0) {
        batch.pendingXP = queued;
        batch.xpRevision = nextXPRevision(batch.xpRevision);
    }
    return true;
}
