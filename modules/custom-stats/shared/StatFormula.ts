/** Pure, shared item-affix rules (server + addon). */

export const STAT_VAMPIRISM = 0;
export const STAT_THORNS = 1;
export const STAT_MASTERY = 2;
export const STAT_COUNT = 3;

// Stored/transmitted affix kinds use zero for "no affix".
export const AFFIX_NONE = 0;
export const AFFIX_VAMPIRISM = STAT_VAMPIRISM + 1;
export const AFFIX_THORNS = STAT_THORNS + 1;
export const AFFIX_MASTERY = STAT_MASTERY + 1;

// WoW equipment inventory types. Bags, ammo, shirts and tabards are excluded.
const GEAR_INVENTORY_TYPES = [
    1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    20, 21, 22, 23, 25, 26, 28,
];

// Levelling gear shares one baseline so early white/green items stay useful;
// higher qualities improve partial sets while the final effect remains capped.
const QUALITY_VALUE_PCT = [100, 100, 100, 105, 110, 115, 120];
const FULL_SET_ITEMS = 16; // 14 armour/accessory slots + a typical two-weapon setup
const FULL_SET_EFFECT_PCT = 82.5;
const MAX_EFFECT_PCT = 85;
const AFFIX_CHANCE_BPS = [400, 1000, 2200, 3500, 4800, 6000, 7000];
const PRNG_MOD = 2147483647;
const PRNG_MAX_SEED = 2147483646;

function contains(values: number[], value: number): boolean {
    for (let i = 0; i < values.length; i++) {
        if (values[i] == value) return true;
    }
    return false;
}

export function isAffixEligible(
    itemClass: number,
    inventoryType: number,
    itemLevel: number,
): boolean {
    return (itemClass == 2 || itemClass == 4)
        && itemLevel > 0
        && contains(GEAR_INVENTORY_TYPES, inventoryType);
}

function nextSeed(seed: number): number {
    return (seed * 48271) % PRNG_MOD;
}

function firstSeed(itemGuid: number, itemEntry: number): number {
    return ((itemGuid + itemEntry * 65537 + 104729) % PRNG_MAX_SEED) + 1;
}

/** Rating before the small per-instance variance. Monotonic in item level. */
export function itemStatValue(_kind: number, itemLevel: number, quality: number): number {
    const q = QUALITY_VALUE_PCT[quality] !== undefined ? QUALITY_VALUE_PCT[quality] : 100;
    const value = Math.floor((itemLevel * q + 50) / 100);
    return value > 0 ? value : 1;
}

export interface ItemAffixRoll {
    kind: number;
    value: number;
}

/**
 * A stable random roll for this exact item instance. The GUID makes identical
 * templates differ, while the pure formula survives relogs, mail and trades.
 * Treat this function as save-format: changing it rerolls existing items.
 */
export function rollItemAffix(
    itemGuid: number,
    itemEntry: number,
    itemClass: number,
    inventoryType: number,
    itemLevel: number,
    quality: number,
): ItemAffixRoll {
    if (!isAffixEligible(itemClass, inventoryType, itemLevel)) {
        return { kind: AFFIX_NONE, value: 0 };
    }

    let seed = nextSeed(firstSeed(itemGuid, itemEntry));
    const chance = AFFIX_CHANCE_BPS[quality] !== undefined
        ? AFFIX_CHANCE_BPS[quality]
        : AFFIX_CHANCE_BPS[2];
    if (seed % 10000 >= chance) {
        return { kind: AFFIX_NONE, value: 0 };
    }

    seed = nextSeed(seed);
    const kind = (seed % STAT_COUNT) + 1;
    seed = nextSeed(seed);
    const variancePct = 97 + (seed % 7); // 97..103%, stable per instance
    const base = itemStatValue(kind - 1, itemLevel, quality);
    const value = Math.max(1, Math.floor((base * variancePct + 50) / 100));
    return { kind, value };
}

function effectPct(rating: number, playerLevel: number): number {
    if (rating <= 0) return 0;
    const level = Math.max(1, Math.floor(playerLevel));
    return Math.min(MAX_EFFECT_PCT, rating * FULL_SET_EFFECT_PCT / (level * FULL_SET_ITEMS));
}

export function vampirismPct(rating: number, playerLevel: number): number {
    return effectPct(rating, playerLevel);
}

export function thornsPct(rating: number, playerLevel: number): number {
    return effectPct(rating, playerLevel);
}

export function masteryPct(rating: number, playerLevel: number): number {
    return effectPct(rating, playerLevel);
}
