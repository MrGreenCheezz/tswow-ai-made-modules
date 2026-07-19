/** Pure, data-driven companion identity and service progression. */

export const COMPANION_FAMILY_WILD = 1;
export const COMPANION_FAMILY_DRACONIC = 2;
export const COMPANION_FAMILY_DARK = 4;
export const COMPANION_FAMILY_PRIMAL = 8;
export const COMPANION_FAMILY_TACTICAL = 16;
export const COMPANION_FAMILY_MECHANICAL = 32;
export const COMPANION_FAMILY_ALL = 63;

export const COMPANION_PROFESSION_COUNT = 10;
export const COMPANION_TRAIT_COUNT = 40;
export const COMPANION_SERVICE_RANK_COUNT = 5;

export interface CompanionProfessionDef {
    id: number;
    key: string;
    name: string;
    nameRu: string;
    icon: string;
    familyMask: number;
    expeditionSpecialty: number;
    bias: number;
    periodBps: number;
    saveBps: number;
    bonusBps: number;
}

export interface CompanionTraitDef {
    id: number;
    key: string;
    name: string;
    nameRu: string;
    description: string;
    descriptionRu: string;
    icon: string;
    familyMask: number;
    damageBps: number;
    healingBps: number;
    periodBps: number;
    saveBps: number;
    bonusBps: number;
    markBps: number;
    markProperty: number;
}

export interface CompanionServiceRankDef {
    id: number;
    name: string;
    nameRu: string;
    minimumXp: number;
    combatBps: number;
    expeditionPeriodBps: number;
}

export interface CompanionWorkXpDecision {
    commit: boolean;
    amount: number;
    nextRevision: number;
}

// Profession is a saved independent roll, so every profession fits every family.
export const COMPANION_PROFESSIONS: CompanionProfessionDef[] = [
    { id: 1, key: "miner-metallurgist", name: "Miner / Metallurgist", nameRu: "Рудокоп-металлург", icon: "Interface\\Icons\\Trade_Mining", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 2, bias: 1, periodBps: 1, saveBps: 0, bonusBps: 1 },
    { id: 2, key: "herbalist-alchemist", name: "Herbalist / Alchemist", nameRu: "Травник-алхимик", icon: "Interface\\Icons\\Trade_Alchemy", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 3, bias: 2, periodBps: 0, saveBps: 1, bonusBps: 1 },
    { id: 3, key: "forester-carpenter", name: "Forester / Carpenter", nameRu: "Лесник-плотник", icon: "Interface\\Icons\\Trade_Engineering", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 4, bias: 3, periodBps: 1, saveBps: 1, bonusBps: 0 },
    { id: 4, key: "fisher-cook", name: "Fisher / Cook", nameRu: "Рыбак-повар", icon: "Interface\\Icons\\Trade_Fishing", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 5, bias: 4, periodBps: 0, saveBps: 0, bonusBps: 1 },
    { id: 5, key: "hunter-leatherworker", name: "Hunter / Leatherworker", nameRu: "Охотник-кожевник", icon: "Interface\\Icons\\INV_Misc_LeatherScrap_02", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 0, bias: 1, periodBps: 1, saveBps: 1, bonusBps: 0 },
    { id: 6, key: "tailor", name: "Tailor", nameRu: "Портной", icon: "Interface\\Icons\\Trade_Tailoring", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 1, bias: 2, periodBps: 0, saveBps: 1, bonusBps: 1 },
    { id: 7, key: "scribe", name: "Scribe", nameRu: "Начертатель", icon: "Interface\\Icons\\INV_Inscription_Tradeskill01", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 1, bias: 3, periodBps: 1, saveBps: 0, bonusBps: 1 },
    { id: 8, key: "smith-weaponsmith", name: "Smith / Weaponsmith", nameRu: "Кузнец-оружейник", icon: "Interface\\Icons\\Trade_BlackSmithing", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 2, bias: 4, periodBps: 0, saveBps: 1, bonusBps: 0 },
    { id: 9, key: "engineer-mechanic", name: "Engineer / Mechanic", nameRu: "Инженер-механик", icon: "Interface\\Icons\\Trade_Engineering", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 2, bias: 1, periodBps: 1, saveBps: 0, bonusBps: 0 },
    { id: 10, key: "jeweler-cutter", name: "Jeweler / Cutter", nameRu: "Ювелир-огранщик", icon: "Interface\\Icons\\INV_Misc_Gem_01", familyMask: COMPANION_FAMILY_ALL, expeditionSpecialty: 2, bias: 2, periodBps: 0, saveBps: 0, bonusBps: 1 },
];

const TRAIT_SUFFIX_EN = ["Fury", "Care", "Discipline", "Insight"];
const TRAIT_SUFFIX_RU = ["ярость", "забота", "выучка", "чутьё"];
const INSIGHT_YIELD_EN = "Adds 4 percentage points to bonus-output chance.";
const INSIGHT_YIELD_RU = "Добавляет 4 п.п. к шансу дополнительного выхода.";
const TRAIT_ICONS = [
    "Interface\\Icons\\Ability_Warrior_SavageBlow",
    "Interface\\Icons\\Spell_Holy_Heal",
    "Interface\\Icons\\INV_Misc_Gear_01",
    "Interface\\Icons\\INV_Misc_Gem_Variety_01",
];
const TRAIT_DESCRIPTIONS_EN = [
    "Increases the companion's trained combat damage.",
    "Increases the companion's trained healing.",
    "Improves work speed and material saving.",
    INSIGHT_YIELD_EN + " At compatible equipment workshops, grants a 2/3/5/7/10% service-rank chance to add a professional maker's mark.",
];
const TRAIT_DESCRIPTIONS_RU = [
    "Усиливает урон изученных боевых приёмов спутника.",
    "Усиливает лечение изученных приёмов спутника.",
    "Повышает скорость работы и экономию материалов.",
    INSIGHT_YIELD_RU + " В совместимой мастерской экипировки даёт 2/3/5/7/10% шанс по рангу службы оставить профессиональное клеймо.",
];

export const COMPANION_TRAITS: CompanionTraitDef[] = [];
for (let theme = 0; theme < COMPANION_PROFESSIONS.length; theme++) {
    const profession = COMPANION_PROFESSIONS[theme];
    const canMarkEquipment = profession.id == 5 || profession.id == 6
        || profession.id == 8 || profession.id == 9 || profession.id == 10;
    for (let variant = 0; variant < 4; variant++) {
        const id = theme * 4 + variant + 1;
        COMPANION_TRAITS.push({
            id,
            key: profession.key + "-" + TRAIT_SUFFIX_EN[variant].toLowerCase(),
            name: profession.name + " " + TRAIT_SUFFIX_EN[variant],
            nameRu: profession.nameRu + ": " + TRAIT_SUFFIX_RU[variant],
            description: variant == 3 && !canMarkEquipment
                ? INSIGHT_YIELD_EN : TRAIT_DESCRIPTIONS_EN[variant],
            descriptionRu: variant == 3 && !canMarkEquipment
                ? INSIGHT_YIELD_RU : TRAIT_DESCRIPTIONS_RU[variant],
            icon: TRAIT_ICONS[variant],
            familyMask: profession.familyMask,
            damageBps: variant == 0 ? 400 : 0,
            healingBps: variant == 1 ? 500 : 0,
            periodBps: variant == 2 ? 300 : 0,
            saveBps: variant == 2 ? 200 : 0,
            bonusBps: variant == 3 ? 400 : 0,
            markBps: 0,
            markProperty: variant == 3 && canMarkEquipment
                ? 1001 + (profession.id - 1) % 7 : 0,
        });
    }
}

export const COMPANION_SERVICE_RANKS: CompanionServiceRankDef[] = [
    { id: 1, name: "Recruit", nameRu: "Новобранец", minimumXp: 0, combatBps: 0, expeditionPeriodBps: 500 },
    { id: 2, name: "Field Companion", nameRu: "Полевой спутник", minimumXp: 100, combatBps: 250, expeditionPeriodBps: 800 },
    { id: 3, name: "Veteran", nameRu: "Ветеран", minimumXp: 600, combatBps: 500, expeditionPeriodBps: 1200 },
    { id: 4, name: "Senior Companion", nameRu: "Старший спутник", minimumXp: 2400, combatBps: 750, expeditionPeriodBps: 1600 },
    { id: 5, name: "Legend", nameRu: "Легенда службы", minimumXp: 8000, combatBps: 1000, expeditionPeriodBps: 2000 },
];

export function companionFamilyForCreatureType(creatureType: number): number {
    if (creatureType == 1 || creatureType == 8 || creatureType == 12) return COMPANION_FAMILY_WILD;
    if (creatureType == 2) return COMPANION_FAMILY_DRACONIC;
    if (creatureType == 3 || creatureType == 6) return COMPANION_FAMILY_DARK;
    if (creatureType == 4 || creatureType == 5 || creatureType == 11 || creatureType == 13) return COMPANION_FAMILY_PRIMAL;
    if (creatureType == 7 || creatureType == 10) return COMPANION_FAMILY_TACTICAL;
    if (creatureType == 9) return COMPANION_FAMILY_MECHANICAL;
    // Type 0 (NONE) exists on otherwise valid hostile templates. Treat it as
    // generic/tactical so old captures never become unable to learn anything.
    return COMPANION_FAMILY_TACTICAL;
}

export function companionMaskHas(mask: number, family: number): boolean {
    return family > 0 && Math.floor(mask / family) % 2 == 1;
}

export function companionProfessionById(id: number): CompanionProfessionDef | undefined {
    for (let i = 0; i < COMPANION_PROFESSIONS.length; i++) {
        if (COMPANION_PROFESSIONS[i].id == id) return COMPANION_PROFESSIONS[i];
    }
    return undefined;
}

export function companionTraitById(id: number): CompanionTraitDef | undefined {
    for (let i = 0; i < COMPANION_TRAITS.length; i++) {
        if (COMPANION_TRAITS[i].id == id) return COMPANION_TRAITS[i];
    }
    return undefined;
}

function positiveIndex(seed: number, length: number): number {
    const value = Math.floor(Math.abs(seed));
    return length <= 0 ? 0 : value % length;
}

export function companionProfessionForSeed(_family: number, seed: number): number {
    return positiveIndex(seed, COMPANION_PROFESSIONS.length) + 1;
}

export function companionTraitForProfession(professionId: number, seed: number): number {
    const profession = Math.max(1, Math.min(COMPANION_PROFESSION_COUNT, Math.floor(professionId)));
    return (profession - 1) * 4 + positiveIndex(seed, 4) + 1;
}

/** Compatibility alias for older callers; the first argument is a profession ID. */
export function companionTraitForSeed(professionId: number, seed: number): number {
    return companionTraitForProfession(professionId, seed);
}

export function companionServiceRankForXp(serviceXp: number): number {
    const xp = Math.max(0, Math.floor(serviceXp));
    let rank = 1;
    for (let i = 1; i < COMPANION_SERVICE_RANKS.length; i++) {
        if (xp >= COMPANION_SERVICE_RANKS[i].minimumXp) rank = i + 1;
    }
    return rank;
}

export function companionServiceRankDef(rank: number): CompanionServiceRankDef {
    const index = Math.max(0, Math.min(COMPANION_SERVICE_RANKS.length - 1, Math.floor(rank) - 1));
    return COMPANION_SERVICE_RANKS[index];
}

/** Pure crash/replay rule for the base-building XP bridge. */
export function companionWorkXpDecision(
    lastPersistedRevision: number,
    publishedRevision: number,
    pendingXp: number,
): CompanionWorkXpDecision {
    const last = Math.max(0, Math.floor(lastPersistedRevision));
    const published = Math.max(0, Math.floor(publishedRevision));
    if (published <= 0 || published == last) {
        return { commit: false, amount: 0, nextRevision: last };
    }
    return {
        commit: true,
        amount: Math.max(0, Math.floor(pendingXp)),
        nextRevision: published,
    };
}

/** WotLK grey threshold shared by collectible drops and service kill XP. */
export function companionGreyLevel(playerLevel: number): number {
    const level = Math.max(1, Math.min(80, Math.floor(playerLevel)));
    if (level <= 5) return 0;
    if (level <= 39) return level - 5 - Math.floor(level / 10);
    return level - 9;
}

export function companionKillIsGrey(playerLevel: number, victimLevel: number): boolean {
    return Math.floor(victimLevel) <= companionGreyLevel(playerLevel);
}
