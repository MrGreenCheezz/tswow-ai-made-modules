/** Shared contract for the player-bound combo sequence. */
export const COMBO_MODULE = "gem-abilities";
export const COMBO_AURA_TAG = "spell/player-combo-sequence";
export const COMBO_FINISHER_TAG = "spell/player-combo-finisher";
export const COMBO_MAX_STACKS = 5;

function clampCombo(value: number): number {
    return Math.max(0, Math.min(COMBO_MAX_STACKS, Math.floor(value)));
}

/** Every completed non-finisher ability grants exactly one point. */
export function gainComboPoint(current: number): number {
    return clampCombo(current + 1);
}

/** A missed/cancelled finisher returns its reserved points without overflow. */
export function restoreComboPoints(current: number, reserved: number): number {
    return clampCombo(current + reserved);
}
