import {
    COMPANION_FAMILY_ALL,
    COMPANION_PROFESSIONS,
    companionMaskHas,
} from "./CompanionProgression";

export const COMPANION_MANUAL_COUNT = 50;
export const COMPANION_ACTIVE_MANUAL_COUNT = 42;
export const COMPANION_PASSIVE_MANUAL_COUNT = 8;
export const COMPANION_TOOL_COUNT = 30;
export const COMPANION_TRAINING_FEATURE_COUNT = 80;
export const COMPANION_TRAINING_CATALOG_VERSION = 1;
export const COMPANION_TRAINING_MAX_SLOTS = 15;
export const COMPANION_TRAINING_INITIAL_SLOTS = 2;

export const TRAINING_KIND_MANUAL = 1;
export const TRAINING_KIND_TOOL = 2;
export const TRAINING_PAYLOAD_ENEMY_DAMAGE = 1;
export const TRAINING_PAYLOAD_OWNER_HEAL = 2;
export const TRAINING_PAYLOAD_SELF_HEAL = 3;
export const TRAINING_PAYLOAD_INTERRUPT = 4;
export const TRAINING_PAYLOAD_TAUNT = 5;
export const TRAINING_PAYLOAD_PASSIVE_DAMAGE = 20;
export const TRAINING_PAYLOAD_PASSIVE_HEALING = 21;
export const TRAINING_PAYLOAD_PASSIVE_HEALTH = 22;
export const TRAINING_PAYLOAD_PASSIVE_DEFENSE = 23;
export const TRAINING_PAYLOAD_PASSIVE_HASTE = 24;
export const TRAINING_PAYLOAD_PASSIVE_CRIT = 25;
export const TRAINING_PAYLOAD_PASSIVE_SUPPORT = 26;
export const TRAINING_PAYLOAD_PASSIVE_THREAT = 27;
export const TRAINING_PAYLOAD_TOOL_PERIOD = 10;
export const TRAINING_PAYLOAD_TOOL_SAVE = 11;
export const TRAINING_PAYLOAD_TOOL_BONUS = 12;

export const COMPANION_SLOT_COSTS = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 7, 10, 14, 20];
export const COMPANION_RANK_MULTIPLIER_BPS = [10000, 12500, 15000];

export interface CompanionTrainingFeatureDef {
    id: number;
    key: string;
    kind: number;
    name: string;
    nameRu: string;
    description: string;
    descriptionRu: string;
    icon: string;
    familyMask: number;
    /** Thematic corpse-drop mask; independent from install compatibility. */
    lootFamilyMask: number;
    professionId: number;
    payload: number;
    cooldownMs: number;
    coefficientPermille: number;
}

const FAMILY_BITS = [1, 2, 4, 8, 16, 32];
const FAMILY_THEMES = [
    ["Wild", "Дикая", "ability_druid_ferociousbite"],
    ["Draconic", "Драконья", "inv_misc_head_dragon_01"],
    ["Dark", "Тёмная", "spell_shadow_shadowbolt"],
    ["Primal", "Первозданная", "spell_nature_earthquake"],
    ["Tactical", "Тактическая", "ability_warrior_savageblow"],
    ["Mechanical", "Механическая", "inv_gizmo_02"],
];
const FAMILY_THEME_KEYS = ["wild", "draconic", "dark", "primal", "tactical", "mechanical"];
const ACTIVE_FORM_EN = ["Strike", "Burst", "Aid", "Recovery", "Disruption", "Challenge", "Onslaught"];
const ACTIVE_FORM_KEYS = ["strike", "burst", "aid", "recovery", "disruption", "challenge", "onslaught"];
const ACTIVE_FORM_RU = ["атака", "всплеск", "помощь", "восстановление", "прерывание", "провокация", "натиск"];
const ACTIVE_DESCRIPTIONS = [
    [
        "Deals base damage (8 + 5 × companion level) × 0.90 × 1.00/1.25/1.50 at ranks I/II/III, before service-rank and Fury bonuses. Targets the current enemy outside Passive mode. Cooldown: 18 sec. Theme affects compatibility and loot only.",
        "Наносит базовый урон (8 + 5 × уровень спутника) × 0,90 × 1,00/1,25/1,50 на рангах I/II/III, до бонусов службы и «Ярости». Бьёт текущего противника вне режима «Не атаковать». Перезарядка: 18 сек. Тема влияет только на совместимость и добычу.",
    ],
    [
        "Deals base damage (8 + 5 × companion level) × 0.95 × 1.00/1.25/1.50 at ranks I/II/III, before service-rank and Fury bonuses. Targets the current enemy outside Passive mode. Cooldown: 19 sec. Theme affects compatibility and loot only.",
        "Наносит базовый урон (8 + 5 × уровень спутника) × 0,95 × 1,00/1,25/1,50 на рангах I/II/III, до бонусов службы и «Ярости». Бьёт текущего противника вне режима «Не атаковать». Перезарядка: 19 сек. Тема влияет только на совместимость и добычу.",
    ],
    [
        "Below 75% owner health, heals for (10 + 4 × companion level) × 1.00/1.25/1.50 at ranks I/II/III, before service-rank and Care bonuses. Cooldown: 30 sec. Theme affects compatibility and loot only.",
        "При здоровье хозяина ниже 75% лечит на (10 + 4 × уровень спутника) × 1,00/1,25/1,50 на рангах I/II/III, до бонусов службы и «Заботы». Перезарядка: 30 сек. Тема влияет только на совместимость и добычу.",
    ],
    [
        "Below 65% companion health, heals it for (10 + 4 × companion level) × 1.05 × 1.00/1.25/1.50 at ranks I/II/III, before service-rank and Care bonuses. Cooldown: 30 sec. Theme affects compatibility and loot only.",
        "При здоровье спутника ниже 65% лечит его на (10 + 4 × уровень спутника) × 1,05 × 1,00/1,25/1,50 на рангах I/II/III, до бонусов службы и «Заботы». Перезарядка: 30 сек. Тема влияет только на совместимость и добычу.",
    ],
    [
        "Interrupts the current enemy's spellcast outside Passive mode. Cooldown: 24 sec. Ranks II/III currently do not improve the effect or cooldown. Theme affects compatibility and loot only.",
        "Прерывает заклинание текущего противника вне режима «Не атаковать». Перезарядка: 24 сек. Ранги II/III сейчас не усиливают эффект и не сокращают перезарядку. Тема влияет только на совместимость и добычу.",
    ],
    [
        "Taunts the current enemy in Tank mode. Cooldown: 18 sec. Ranks II/III currently do not improve the effect or cooldown. Theme affects compatibility and loot only.",
        "Провоцирует текущего противника в режиме «Танк». Перезарядка: 18 сек. Ранги II/III сейчас не усиливают эффект и не сокращают перезарядку. Тема влияет только на совместимость и добычу.",
    ],
    [
        "Deals base damage (8 + 5 × companion level) × 1.20 × 1.00/1.25/1.50 at ranks I/II/III, before service-rank and Fury bonuses. Targets the current enemy outside Passive mode. Cooldown: 24 sec. Theme affects compatibility and loot only.",
        "Наносит базовый урон (8 + 5 × уровень спутника) × 1,20 × 1,00/1,25/1,50 на рангах I/II/III, до бонусов службы и «Ярости». Бьёт текущего противника вне режима «Не атаковать». Перезарядка: 24 сек. Тема влияет только на совместимость и добычу.",
    ],
];
const ACTIVE_PAYLOADS = [
    TRAINING_PAYLOAD_ENEMY_DAMAGE,
    TRAINING_PAYLOAD_ENEMY_DAMAGE,
    TRAINING_PAYLOAD_OWNER_HEAL,
    TRAINING_PAYLOAD_SELF_HEAL,
    TRAINING_PAYLOAD_INTERRUPT,
    TRAINING_PAYLOAD_TAUNT,
    TRAINING_PAYLOAD_ENEMY_DAMAGE,
];

export const COMPANION_COMBAT_MANUALS: CompanionTrainingFeatureDef[] = [];
for (let index = 0; index < COMPANION_ACTIVE_MANUAL_COUNT; index++) {
    const familyIndex = index % FAMILY_BITS.length;
    const form = Math.floor(index / FAMILY_BITS.length);
    let familyMask = FAMILY_BITS[familyIndex]
        + FAMILY_BITS[(familyIndex + 1) % FAMILY_BITS.length];
    if (index < 8) familyMask += FAMILY_BITS[(familyIndex + 3) % FAMILY_BITS.length];
    const payload = ACTIVE_PAYLOADS[form];
    COMPANION_COMBAT_MANUALS.push({
        id: index + 1,
        key: FAMILY_THEME_KEYS[familyIndex] + "-" + ACTIVE_FORM_KEYS[form],
        kind: TRAINING_KIND_MANUAL,
        name: FAMILY_THEMES[familyIndex][0] + " " + ACTIVE_FORM_EN[form],
        nameRu: FAMILY_THEMES[familyIndex][1] + ": " + ACTIVE_FORM_RU[form],
        description: ACTIVE_DESCRIPTIONS[form][0],
        descriptionRu: ACTIVE_DESCRIPTIONS[form][1],
        icon: "Interface\\Icons\\" + FAMILY_THEMES[familyIndex][2],
        familyMask,
        lootFamilyMask: familyMask,
        professionId: 0,
        payload,
        cooldownMs: payload == TRAINING_PAYLOAD_TAUNT ? 18000
            : payload == TRAINING_PAYLOAD_INTERRUPT ? 24000
                : payload == TRAINING_PAYLOAD_ENEMY_DAMAGE ? 18000 + form * 1000 : 30000,
        coefficientPermille: 900 + form * 50,
    });
}

const PASSIVE_MANUALS: [string, string, string, number, string, string, string][] = [
    ["battle-instinct", "Battle Instinct", "Боевой инстинкт", TRAINING_PAYLOAD_PASSIVE_DAMAGE, "ability_hunter_ferociousinspiration", "Increases all damage dealt by 3/5/8% at ranks I/II/III.", "Повышает весь наносимый урон на 3/5/8% на рангах I/II/III."],
    ["field-care", "Field Care", "Полевая забота", TRAINING_PAYLOAD_PASSIVE_HEALING, "spell_holy_flashheal", "Increases healing done by 3/5/8% at ranks I/II/III.", "Повышает эффективность лечения на 3/5/8% на рангах I/II/III."],
    ["iron-vigor", "Iron Vigor", "Железная выносливость", TRAINING_PAYLOAD_PASSIVE_HEALTH, "spell_holy_devotionaura", "Increases maximum health by 4/7/10% at ranks I/II/III.", "Повышает максимальный запас здоровья на 4/7/10% на рангах I/II/III."],
    ["hardened-hide", "Hardened Hide", "Закалённый покров", TRAINING_PAYLOAD_PASSIVE_DEFENSE, "inv_misc_monsterscales_11", "Reduces damage taken by 2/4/6% at ranks I/II/III.", "Снижает получаемый урон на 2/4/6% на рангах I/II/III."],
    ["quick-reflexes", "Quick Reflexes", "Быстрые рефлексы", TRAINING_PAYLOAD_PASSIVE_HASTE, "ability_rogue_sprint", "Increases melee haste by 3/5/8% at ranks I/II/III.", "Повышает скорость ближнего боя на 3/5/8% на рангах I/II/III."],
    ["precise-training", "Precise Training", "Точная выучка", TRAINING_PAYLOAD_PASSIVE_CRIT, "ability_marksmanship", "Increases melee and spell critical strike chance by 2/3/5% at ranks I/II/III.", "Повышает шанс критического удара в ближнем бою и заклинаниями на 2/3/5% на рангах I/II/III."],
    ["support-mastery", "Support Mastery", "Мастерство поддержки", TRAINING_PAYLOAD_PASSIVE_SUPPORT, "spell_holy_blessingofprotection", "Increases casting speed and healing done by 3/5/8% at ranks I/II/III.", "Повышает скорость произнесения заклинаний и эффективность лечения на 3/5/8% на рангах I/II/III."],
    ["commanding-presence", "Commanding Presence", "Командное присутствие", TRAINING_PAYLOAD_PASSIVE_THREAT, "ability_warrior_challange", "Increases threat generated by 15/30/50% at ranks I/II/III while in Tank mode.", "Повышает создаваемую угрозу на 15/30/50% на рангах I/II/III в режиме «Танк»."],
];
for (let i = 0; i < PASSIVE_MANUALS.length; i++) {
    COMPANION_COMBAT_MANUALS.push({
        id: COMPANION_ACTIVE_MANUAL_COUNT + i + 1,
        key: PASSIVE_MANUALS[i][0],
        kind: TRAINING_KIND_MANUAL,
        name: PASSIVE_MANUALS[i][1],
        nameRu: PASSIVE_MANUALS[i][2],
        description: PASSIVE_MANUALS[i][5],
        descriptionRu: PASSIVE_MANUALS[i][6],
        icon: "Interface\\Icons\\" + PASSIVE_MANUALS[i][4],
        familyMask: COMPANION_FAMILY_ALL,
        lootFamilyMask: COMPANION_FAMILY_ALL,
        professionId: 0,
        payload: PASSIVE_MANUALS[i][3],
        cooldownMs: 0,
        coefficientPermille: 1000,
    });
}

const TOOL_NAME_EN = ["Speed Kit", "Saving Kit", "Yield Kit"];
const TOOL_KEYS = ["speed-kit", "saving-kit", "yield-kit"];
const TOOL_NAME_RU = ["набор скорости", "бережливый набор", "набор добычи"];
const TOOL_DESCRIPTION_EN = [
    "Reduces station, generator and expedition time by 2.5/5/7.5% at ranks I/II/III. Adds to the profession's service-rank and trait bonuses; total reduction is capped at 35%.",
    "At a station: 2.5/5/7.5% chance per operation at ranks I/II/III to save all materials. Other bonuses stack up to 25%. No effect on generators or expeditions.",
    "Adds 2.5/5/7.5 percentage points to bonus-output chance at ranks I/II/III, up to 25% total. Success gives one extra station batch or generator item. Expeditions gain +1 item per full 10% total bonus.",
];
const TOOL_DESCRIPTION_RU = [
    "Сокращает время станка, генератора и экспедиции на 2,5/5/7,5% на рангах I/II/III. Складывается с бонусом профессии по рангу службы и чертой; общий предел — 35%.",
    "На станке: 2,5/5/7,5% шанс за операцию на рангах I/II/III сохранить все материалы. Другие бонусы складываются до 25%. Не действует на генераторы и экспедиции.",
    "Добавляет 2,5/5/7,5 п.п. к шансу дополнительного выхода на рангах I/II/III, до 25% суммарно. Успех даёт ещё одну партию станка или предмет генератора. Экспедиция получает +1 предмет за каждые полные 10% общего бонуса.",
];
// Tools remain install-compatible with every creature family, while their
// outdoor drops follow the profession's natural/material theme.
const TOOL_LOOT_FAMILY_MASKS = [
    4 + 8 + 32,  // miner / metallurgist: dark, primal, mechanical
    1 + 2 + 8,   // herbalist / alchemist: wild, draconic, primal
    1 + 8 + 16,  // forester / carpenter: wild, primal, tactical
    1 + 2 + 8,   // fisher / cook: wild, draconic, primal
    1 + 2 + 16,  // hunter / leatherworker: wild, draconic, tactical
    1 + 4 + 16,  // tailor: wild, dark, tactical
    2 + 4 + 16,  // scribe: draconic, dark, tactical
    8 + 16 + 32, // smith / weaponsmith: primal, tactical, mechanical
    8 + 16 + 32, // engineer / mechanic: primal, tactical, mechanical
    2 + 4 + 8,   // jeweler / cutter: draconic, dark, primal
];

export const COMPANION_PROFESSION_TOOLS: CompanionTrainingFeatureDef[] = [];
for (let professionIndex = 0; professionIndex < COMPANION_PROFESSIONS.length; professionIndex++) {
    const profession = COMPANION_PROFESSIONS[professionIndex];
    for (let tool = 0; tool < 3; tool++) {
        COMPANION_PROFESSION_TOOLS.push({
            id: COMPANION_MANUAL_COUNT + professionIndex * 3 + tool + 1,
            key: profession.key + "-" + TOOL_KEYS[tool],
            kind: TRAINING_KIND_TOOL,
            name: profession.name + " " + TOOL_NAME_EN[tool],
            nameRu: profession.nameRu + ": " + TOOL_NAME_RU[tool],
            description: TOOL_DESCRIPTION_EN[tool]
                + (professionIndex == 2 && tool == 1
                    ? " Forester / Carpenter has no station target; this kit currently has no effect."
                    : ""),
            descriptionRu: TOOL_DESCRIPTION_RU[tool]
                + (professionIndex == 2 && tool == 1
                    ? " У лесника-плотника нет цели-станка: этот набор пока не даёт эффекта."
                    : ""),
            icon: profession.icon,
            familyMask: COMPANION_FAMILY_ALL,
            lootFamilyMask: TOOL_LOOT_FAMILY_MASKS[professionIndex],
            professionId: profession.id,
            payload: TRAINING_PAYLOAD_TOOL_PERIOD + tool,
            cooldownMs: 0,
            coefficientPermille: 1000,
        });
    }
}

export const COMPANION_TRAINING_FEATURES: CompanionTrainingFeatureDef[] = [];
for (let i = 0; i < COMPANION_COMBAT_MANUALS.length; i++) {
    COMPANION_TRAINING_FEATURES.push(COMPANION_COMBAT_MANUALS[i]);
}
for (let i = 0; i < COMPANION_PROFESSION_TOOLS.length; i++) {
    COMPANION_TRAINING_FEATURES.push(COMPANION_PROFESSION_TOOLS[i]);
}

export function companionTrainingFeatureById(id: number): CompanionTrainingFeatureDef | undefined {
    if (id <= 0 || Math.floor(id) != id || id > COMPANION_TRAINING_FEATURES.length) return undefined;
    const feature = COMPANION_TRAINING_FEATURES[id - 1];
    return feature && feature.id == id ? feature : undefined;
}

export function companionTrainingCompatible(
    feature: CompanionTrainingFeatureDef,
    family: number,
    professionId: number,
): boolean {
    return companionMaskHas(feature.familyMask, family)
        && (feature.professionId == 0 || feature.professionId == professionId);
}

export function companionNextSlotCost(capacity: number): number {
    const normalized = Math.max(0, Math.min(COMPANION_TRAINING_MAX_SLOTS, Math.floor(capacity)));
    return normalized >= COMPANION_TRAINING_MAX_SLOTS ? 0 : COMPANION_SLOT_COSTS[normalized];
}

export function companionSlotCumulativeCost(capacity: number): number {
    const normalized = Math.max(0, Math.min(COMPANION_TRAINING_MAX_SLOTS, Math.floor(capacity)));
    let total = 0;
    for (let i = 0; i < normalized; i++) total += COMPANION_SLOT_COSTS[i];
    return total;
}

export function companionRankDuplicateCost(rank: number): number {
    if (rank == 1) return 1;
    if (rank == 2) return 3;
    return 0;
}

export function companionRankMultiplierBps(rank: number): number {
    const index = Math.max(0, Math.min(2, Math.floor(rank) - 1));
    return COMPANION_RANK_MULTIPLIER_BPS[index];
}

export function companionManualDamage(level: number, rank: number, coefficientPermille: number): number {
    const clampedLevel = Math.max(1, Math.min(80, Math.floor(level)));
    return Math.max(1, Math.floor(
        (8 + 5 * clampedLevel)
        * companionRankMultiplierBps(rank) / 10000
        * coefficientPermille / 1000,
    ));
}

export function companionManualHeal(level: number, rank: number, coefficientPermille: number): number {
    const clampedLevel = Math.max(1, Math.min(80, Math.floor(level)));
    return Math.max(1, Math.floor(
        (10 + 4 * clampedLevel)
        * companionRankMultiplierBps(rank) / 10000
        * coefficientPermille / 1000,
    ));
}

export function companionToolBonusBps(rank: number): number {
    return [250, 500, 750][Math.max(0, Math.min(2, Math.floor(rank) - 1))];
}

/** Signed aura amount for each installable passive at ranks I-III. */
export function companionPassiveAmount(payload: number, rank: number): number {
    const index = Math.max(0, Math.min(2, Math.floor(rank) - 1));
    if (payload == TRAINING_PAYLOAD_PASSIVE_DAMAGE) return [3, 5, 8][index];
    if (payload == TRAINING_PAYLOAD_PASSIVE_HEALING) return [3, 5, 8][index];
    if (payload == TRAINING_PAYLOAD_PASSIVE_HEALTH) return [4, 7, 10][index];
    if (payload == TRAINING_PAYLOAD_PASSIVE_DEFENSE) return [-2, -4, -6][index];
    if (payload == TRAINING_PAYLOAD_PASSIVE_HASTE) return [3, 5, 8][index];
    if (payload == TRAINING_PAYLOAD_PASSIVE_CRIT) return [2, 3, 5][index];
    if (payload == TRAINING_PAYLOAD_PASSIVE_SUPPORT) return [3, 5, 8][index];
    if (payload == TRAINING_PAYLOAD_PASSIVE_THREAT) return [15, 30, 50][index];
    return 0;
}
