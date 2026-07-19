import { ECHOES } from "../datascripts/shared/EchoDefs";

/** Relative offer weights for Common, Uncommon, Rare, and Epic Echoes. */
export const ECHO_QUALITY_WEIGHTS: number[] = [100, 45, 20, 8];

function isEligible(ranks: number[], echoIndex: number): boolean {
    if (echoIndex < 0 || echoIndex >= ECHOES.length || Math.floor(echoIndex) != echoIndex) return false;
    const candidate = ECHOES[echoIndex];
    if ((ranks[echoIndex] || 0) >= candidate.maxStack) return false;
    return true;
}

/** Weighted sampling without replacement; returns stable catalog indices. */
export function rollEchoOffer(
    ranks: number[],
    random: () => number,
    count: number,
): number[] {
    const pool: number[] = [];
    for (let i = 0; i < ECHOES.length; i++) {
        if (isEligible(ranks, i)) pool.push(i);
    }

    const result: number[] = [];
    const wanted = Math.max(0, Math.floor(count));
    while (pool.length > 0 && result.length < wanted) {
        let total = 0;
        for (let i = 0; i < pool.length; i++) total += ECHO_QUALITY_WEIGHTS[ECHOES[pool[i]].quality];

        const sample = Math.max(0, Math.min(0.999999999, random())) * total;
        let selected = pool.length - 1;
        let cursor = 0;
        for (let i = 0; i < pool.length; i++) {
            cursor += ECHO_QUALITY_WEIGHTS[ECHOES[pool[i]].quality];
            if (sample < cursor) {
                selected = i;
                break;
            }
        }
        result.push(pool[selected]);
        pool.splice(selected, 1);
    }
    return result;
}

/** Rejects arbitrary client indices and choices invalidated since offer creation. */
export function validateEchoChoice(
    ranks: number[],
    offers: number[],
    echoIndex: number,
): boolean {
    if (!isEligible(ranks, echoIndex)) return false;
    for (let i = 0; i < offers.length; i++) {
        if (offers[i] == echoIndex) return true;
    }
    return false;
}
