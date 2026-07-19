/** Pure rules and tuning knobs for random field enemies. Kept free of TSWoW
 * globals so the probability, filtering and reward math have a runnable test. */

export const RANDOM_PROC_ASSIGN_CHANCE_PERCENT = 25;
export const RANDOM_PROC_TRIGGER_CHANCE_PERCENT = 25;
export const OVERLOADED_CHANCE_PERCENT = 1;
export const FRANKEN_RARE_CHANCE_PERCENT = 2;
export const ESCAPED_LOOT_CHANCE_PERCENT = 3;

export const OVERLOADED_REWARD_MULTIPLIER = 3;
export const SPECIAL_REWARD_MULTIPLIER = 2;

export const FRANKEN_SCALE = 1.35;
export const FRANKEN_HEALTH_MULTIPLIER = 1.5;
export const REVENGE_CHAMPION_SCALE = 1.6;
export const REVENGE_CHAMPION_HEALTH_MULTIPLIER = 2;
export const REVENGE_MIN_KILLS = 8;
export const REVENGE_MAX_KILLS = 12;

const SPELL_ATTR0_PASSIVE = 0x00000040;
const TARGET_FLAG_UNIT_ENEMY = 0x00000080;

// Service/world mutations, summons, teleports, inventory operations, quest
// credit, resurrection and other effects unsafe as a native damage proc.
const UNSAFE_RANDOM_MOB_EFFECTS: number[] = [
    1, 4, 5, 11, 12, 13, 14, 15, 16, 18, 24, 28, 33, 34, 36, 39,
    44, 45, 46, 47, 50, 53, 54, 55, 56, 57, 59, 60, 61, 63, 66, 71,
    73, 74, 76, 80, 81, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 94,
    95, 97, 99, 101, 102, 103, 104, 105, 106, 107, 109, 111, 113,
    114, 115, 116, 117, 118, 120, 123, 125, 127, 130, 131, 132, 133,
    134, 135, 139, 140, 141, 146, 147, 150, 151, 152, 153, 154, 155,
    156, 157, 158, 159, 160, 161, 162,
];

const UNSAFE_RANDOM_MOB_AURAS: number[] = [
    2, 6, 10, 11, 36, 56, 78, 103, 128, 177, 236, 243, 247, 261,
];

// Only ordinary unit/enemy targeting is allowed. Native proc triggering has
// no reliable source/destination/item/corpse context to supply.
const UNSAFE_RANDOM_MOB_TARGET_FLAGS: number[] = [
    0x00000004, 0x00000008, 0x00000010, 0x00000020, 0x00000040,
    0x00000100, 0x00000200, 0x00000400, 0x00000800, 0x00001000,
    0x00002000, 0x00004000, 0x00008000, 0x00010000, 0x00020000,
    0x00040000, 0x00080000, 0x00100000,
];

function hasNumber(values: number[], value: number): boolean {
    for (let i = 0; i < values.length; i++) {
        if (values[i] == value) return true;
    }
    return false;
}

function hasFlag(value: number, flag: number): boolean {
    return Math.floor(value / flag) % 2 == 1;
}

function hasAnyFlag(value: number, flags: number[]): boolean {
    for (let i = 0; i < flags.length; i++) {
        if (hasFlag(value, flags[i])) return true;
    }
    return false;
}

export function rollPercent(sample: number, percent: number): boolean {
    if (percent <= 0) return false;
    if (percent >= 100) return true;
    return sample >= 0 && sample < percent / 100;
}

export function multiplyCapped(value: number, multiplier: number, cap: number): number {
    if (value <= 0 || multiplier <= 0 || cap <= 0) return 0;
    return Math.min(cap, Math.floor(value * multiplier));
}

export function isUnsafeRandomMobAbilityEffect(
    effectType: number,
    auraType: number,
): boolean {
    return hasNumber(UNSAFE_RANDOM_MOB_EFFECTS, effectType)
        || hasNumber(UNSAFE_RANDOM_MOB_AURAS, auraType);
}

export function canUseRandomMobProcSpell(
    attributes: number,
    attributesCu: number,
    explicitTargetMask: number,
    hasEffect: boolean,
    hasUnsafeEffect: boolean,
    hasComboScaling: boolean,
): boolean {
    const harmful = hasFlag(explicitTargetMask, TARGET_FLAG_UNIT_ENEMY)
        || hasAnyFlag(attributesCu, [
            0x00001000, 0x00002000, 0x00004000,
        ]);
    return !hasFlag(attributes, SPELL_ATTR0_PASSIVE)
        && hasEffect
        && harmful
        && !hasUnsafeEffect
        && !hasComboScaling
        && !hasAnyFlag(explicitTargetMask, UNSAFE_RANDOM_MOB_TARGET_FLAGS);
}
