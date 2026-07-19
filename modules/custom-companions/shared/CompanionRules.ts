/** Pure combat-attitude rules shared with the runnable regression test. */

export function canCommandCompanionAttack(
    targetIsDead: boolean,
    eitherSideIsFriendly: boolean,
    playerIsHostile: boolean,
    combatConfirmed: boolean,
): boolean {
    return !targetIsDead
        && !eitherSideIsFriendly
        && (playerIsHostile || combatConfirmed);
}

export function canRecruitCompanionTarget(eitherSideIsFriendly: boolean): boolean {
    return !eitherSideIsFriendly;
}

export function shouldSyncCompanionTalents(
    ownerRevision: number,
    appliedRevision: number,
    expectedAuraMissing: boolean,
): boolean {
    return ownerRevision != appliedRevision || expectedAuraMissing;
}

/**
 * Core 3.3.5 spell-effect/aura IDs that directly taunt or modify threat.
 * Kept numeric so this pure shared rule also runs in the addon regression test.
 */
export function isTankOnlySpellEffect(effectType: number, auraType: number): boolean {
    return effectType == 63       // THREAT
        || effectType == 91       // THREAT_ALL
        || effectType == 114      // ATTACK_ME
        || effectType == 125      // MODIFY_THREAT_PERCENT
        || effectType == 130      // REDIRECT_THREAT
        || auraType == 10         // MOD_THREAT
        || auraType == 11         // MOD_TAUNT
        || auraType == 103;       // MOD_TOTAL_THREAT
}

const UNSAFE_RANDOM_ABILITY_EFFECTS: number[] = [
    1, 4, 5, 11, 12, 13, 14, 15, 16, 18, 24, 28, 33, 34, 36, 39,
    44, 45, 46, 47, 50, 53, 54, 55, 56, 57, 59, 60, 61, 66, 71, 73,
    74, 76, 81, 83, 84, 85, 86, 87, 88, 89, 90, 92, 94, 95, 97, 99,
    101, 102, 103, 104, 105, 106, 107, 109, 111, 113, 115, 116, 117,
    118, 120, 123, 127, 131, 132, 133, 134, 135, 139, 140, 141, 146,
    147, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161,
    162,
];
const UNSAFE_RANDOM_ABILITY_AURAS: number[] = [
    2, 6, 36, 56, 78, 128, 177, 236, 243, 247, 261,
];
const UNSAFE_RANDOM_ABILITY_TARGET_FLAGS: number[] = [
    0x00000010, 0x00000200, 0x00000400, 0x00000800, 0x00001000,
    0x00002000, 0x00004000, 0x00008000, 0x00010000, 0x00020000,
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

/** Reject service/world effects that are unsafe when an ordinary creature casts them. */
export function isUnsafeRandomGemAbilityEffect(
    effectType: number,
    auraType: number,
): boolean {
    return hasNumber(UNSAFE_RANDOM_ABILITY_EFFECTS, effectType)
        || hasNumber(UNSAFE_RANDOM_ABILITY_AURAS, auraType);
}

export function canUseRandomGemAbility(
    attributes: number,
    explicitTargetMask: number,
    hasEffect: boolean,
    hasUnsafeEffect: boolean,
): boolean {
    return !hasFlag(attributes, 0x00000040)
        && hasEffect
        && !hasUnsafeEffect
        && !hasAnyFlag(explicitTargetMask, UNSAFE_RANDOM_ABILITY_TARGET_FLAGS);
}
