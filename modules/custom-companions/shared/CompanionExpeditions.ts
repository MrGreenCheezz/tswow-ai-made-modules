export const EXPEDITION_DURATION_MS = 2 * 60 * 60 * 1000;
export const EXPEDITION_CONCURRENT_CAP = 1;
export const EXPEDITION_NONE = -1;

export const EXPEDITION_SPECIALTY_LEATHER = 0;
export const EXPEDITION_SPECIALTY_CLOTH = 1;
export const EXPEDITION_SPECIALTY_ORE = 2;
export const EXPEDITION_SPECIALTY_HERB = 3;
export const EXPEDITION_SPECIALTY_WOOD = 4;
export const EXPEDITION_SPECIALTY_FISH = 5;

const REWARD_LEVELS = [1, 16, 26, 36, 46, 58, 68, 73];
const LEATHER_REWARDS = [2318, 2319, 4234, 4304, 8170, 21887, 33568, 33568];
const CLOTH_REWARDS = [2589, 2592, 4306, 4338, 14047, 21877, 33470, 33470];
const ORE_REWARDS = [2770, 2771, 2772, 3858, 10620, 23424, 36909, 36912];
const HERB_REWARDS = [2447, 2453, 3357, 3818, 8838, 13463, 22785, 36901];
const FISH_REWARDS = [6291, 6308, 6361, 8365, 13754, 27422, 41808, 41813];

/** Legacy fallback for rows that have not yet received their saved profession. */
export function expeditionSpecialtyForCreatureType(creatureType: number): number {
    if (creatureType == 1 || creatureType == 2 || creatureType == 8 || creatureType == 12) {
        return EXPEDITION_SPECIALTY_LEATHER;
    }
    if (creatureType == 4 || creatureType == 5 || creatureType == 9 || creatureType == 13) {
        return EXPEDITION_SPECIALTY_ORE;
    }
    return EXPEDITION_SPECIALTY_CLOTH;
}

export function expeditionSpecialtyName(specialty: number, russian: boolean = true): string {
    if (specialty == EXPEDITION_SPECIALTY_LEATHER) return russian ? "Следопыт — кожа" : "Tracker — leather";
    if (specialty == EXPEDITION_SPECIALTY_ORE) return russian ? "Старатель — руда" : "Prospector — ore";
    if (specialty == EXPEDITION_SPECIALTY_HERB) return russian ? "Травник — растения" : "Herbalist — herbs";
    if (specialty == EXPEDITION_SPECIALTY_WOOD) return russian ? "Лесник — древесина" : "Forester — wood";
    if (specialty == EXPEDITION_SPECIALTY_FISH) return russian ? "Рыбак — рыба" : "Fisher — fish";
    return russian ? "Снабженец — ткань" : "Supplier — cloth";
}

export function expeditionRewardTier(level: number): number {
    const clamped = Math.max(1, Math.min(80, Math.floor(level)));
    let tier = 0;
    for (let i = 1; i < REWARD_LEVELS.length; i++) {
        if (clamped >= REWARD_LEVELS[i]) tier = i;
    }
    return tier;
}

export function expeditionRewardItem(specialty: number, level: number): number {
    const tier = expeditionRewardTier(level);
    if (specialty == EXPEDITION_SPECIALTY_LEATHER) return LEATHER_REWARDS[tier];
    if (specialty == EXPEDITION_SPECIALTY_ORE) return ORE_REWARDS[tier];
    if (specialty == EXPEDITION_SPECIALTY_HERB) return HERB_REWARDS[tier];
    if (specialty == EXPEDITION_SPECIALTY_FISH) return FISH_REWARDS[tier];
    // Wood uses base-building's generated item tags and is resolved in livescripts.
    if (specialty == EXPEDITION_SPECIALTY_WOOD) return 0;
    return CLOTH_REWARDS[tier];
}

export function expeditionRewardCount(level: number): number {
    const clamped = Math.max(1, Math.min(80, Math.floor(level)));
    return 2 + Math.floor((clamped - 1) / 20);
}

/** -1 = свободен, 0 = награда готова, >0 = секунд до возвращения. */
export function expeditionRemainingSeconds(endAtMs: number, nowMs: number): number {
    if (!(endAtMs > 0)) return EXPEDITION_NONE;
    return Math.max(0, Math.ceil((endAtMs - nowMs) / 1000));
}
