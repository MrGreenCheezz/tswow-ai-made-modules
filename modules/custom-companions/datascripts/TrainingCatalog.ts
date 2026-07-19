/**
 * Datascript-local projection of the shared training catalog.
 *
 * TSWoW's data compiler transpiles only files below `datascripts`, so this
 * file must not import `../shared`. The executable contract test compares all
 * item/spell-facing fields with shared/CompanionTraining.ts.
 */

export const DS_ACTIVE_MANUAL_COUNT = 42;
export const DS_MANUAL_COUNT = 50;
export const DS_TRAINING_KIND_MANUAL = 1;
export const DS_TRAINING_KIND_TOOL = 2;

export const DS_PAYLOAD_ENEMY_DAMAGE = 1;
export const DS_PAYLOAD_OWNER_HEAL = 2;
export const DS_PAYLOAD_SELF_HEAL = 3;
export const DS_PAYLOAD_INTERRUPT = 4;
export const DS_PAYLOAD_TAUNT = 5;
export const DS_PAYLOAD_TOOL_PERIOD = 10;
export const DS_PAYLOAD_PASSIVE_DAMAGE = 20;
export const DS_PAYLOAD_PASSIVE_HEALING = 21;
export const DS_PAYLOAD_PASSIVE_HEALTH = 22;
export const DS_PAYLOAD_PASSIVE_DEFENSE = 23;
export const DS_PAYLOAD_PASSIVE_HASTE = 24;
export const DS_PAYLOAD_PASSIVE_CRIT = 25;
export const DS_PAYLOAD_PASSIVE_SUPPORT = 26;
export const DS_PAYLOAD_PASSIVE_THREAT = 27;

export interface DatascriptTrainingFeatureDef {
    id: number;
    key: string;
    kind: number;
    name: string;
    nameRu: string;
    description: string;
    descriptionRu: string;
    icon: string;
    payload: number;
}

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
    DS_PAYLOAD_ENEMY_DAMAGE,
    DS_PAYLOAD_ENEMY_DAMAGE,
    DS_PAYLOAD_OWNER_HEAL,
    DS_PAYLOAD_SELF_HEAL,
    DS_PAYLOAD_INTERRUPT,
    DS_PAYLOAD_TAUNT,
    DS_PAYLOAD_ENEMY_DAMAGE,
];

export const DATASCRIPT_TRAINING_FEATURES: DatascriptTrainingFeatureDef[] = [];
for (let index = 0; index < DS_ACTIVE_MANUAL_COUNT; index++) {
    const familyIndex = index % FAMILY_THEMES.length;
    const form = Math.floor(index / FAMILY_THEMES.length);
    DATASCRIPT_TRAINING_FEATURES.push({
        id: index + 1,
        key: FAMILY_THEME_KEYS[familyIndex] + "-" + ACTIVE_FORM_KEYS[form],
        kind: DS_TRAINING_KIND_MANUAL,
        name: FAMILY_THEMES[familyIndex][0] + " " + ACTIVE_FORM_EN[form],
        nameRu: FAMILY_THEMES[familyIndex][1] + ": " + ACTIVE_FORM_RU[form],
        description: ACTIVE_DESCRIPTIONS[form][0],
        descriptionRu: ACTIVE_DESCRIPTIONS[form][1],
        icon: "Interface\\Icons\\" + FAMILY_THEMES[familyIndex][2],
        payload: ACTIVE_PAYLOADS[form],
    });
}

const PASSIVE_MANUALS: [string, string, string, number, string, string, string][] = [
    ["battle-instinct", "Battle Instinct", "Боевой инстинкт", DS_PAYLOAD_PASSIVE_DAMAGE, "ability_hunter_ferociousinspiration", "Increases all damage dealt by 3/5/8% at ranks I/II/III.", "Повышает весь наносимый урон на 3/5/8% на рангах I/II/III."],
    ["field-care", "Field Care", "Полевая забота", DS_PAYLOAD_PASSIVE_HEALING, "spell_holy_flashheal", "Increases healing done by 3/5/8% at ranks I/II/III.", "Повышает эффективность лечения на 3/5/8% на рангах I/II/III."],
    ["iron-vigor", "Iron Vigor", "Железная выносливость", DS_PAYLOAD_PASSIVE_HEALTH, "spell_holy_devotionaura", "Increases maximum health by 4/7/10% at ranks I/II/III.", "Повышает максимальный запас здоровья на 4/7/10% на рангах I/II/III."],
    ["hardened-hide", "Hardened Hide", "Закалённый покров", DS_PAYLOAD_PASSIVE_DEFENSE, "inv_misc_monsterscales_11", "Reduces damage taken by 2/4/6% at ranks I/II/III.", "Снижает получаемый урон на 2/4/6% на рангах I/II/III."],
    ["quick-reflexes", "Quick Reflexes", "Быстрые рефлексы", DS_PAYLOAD_PASSIVE_HASTE, "ability_rogue_sprint", "Increases melee haste by 3/5/8% at ranks I/II/III.", "Повышает скорость ближнего боя на 3/5/8% на рангах I/II/III."],
    ["precise-training", "Precise Training", "Точная выучка", DS_PAYLOAD_PASSIVE_CRIT, "ability_marksmanship", "Increases melee and spell critical strike chance by 2/3/5% at ranks I/II/III.", "Повышает шанс критического удара в ближнем бою и заклинаниями на 2/3/5% на рангах I/II/III."],
    ["support-mastery", "Support Mastery", "Мастерство поддержки", DS_PAYLOAD_PASSIVE_SUPPORT, "spell_holy_blessingofprotection", "Increases casting speed and healing done by 3/5/8% at ranks I/II/III.", "Повышает скорость произнесения заклинаний и эффективность лечения на 3/5/8% на рангах I/II/III."],
    ["commanding-presence", "Commanding Presence", "Командное присутствие", DS_PAYLOAD_PASSIVE_THREAT, "ability_warrior_challange", "Increases threat generated by 15/30/50% at ranks I/II/III while in Tank mode.", "Повышает создаваемую угрозу на 15/30/50% на рангах I/II/III в режиме «Танк»."],
];
for (let i = 0; i < PASSIVE_MANUALS.length; i++) {
    DATASCRIPT_TRAINING_FEATURES.push({
        id: DS_ACTIVE_MANUAL_COUNT + i + 1,
        key: PASSIVE_MANUALS[i][0],
        kind: DS_TRAINING_KIND_MANUAL,
        name: PASSIVE_MANUALS[i][1],
        nameRu: PASSIVE_MANUALS[i][2],
        description: PASSIVE_MANUALS[i][5],
        descriptionRu: PASSIVE_MANUALS[i][6],
        icon: "Interface\\Icons\\" + PASSIVE_MANUALS[i][4],
        payload: PASSIVE_MANUALS[i][3],
    });
}

const PROFESSIONS = [
    ["miner-metallurgist", "Miner / Metallurgist", "Рудокоп-металлург", "Interface\\Icons\\Trade_Mining"],
    ["herbalist-alchemist", "Herbalist / Alchemist", "Травник-алхимик", "Interface\\Icons\\Trade_Alchemy"],
    ["forester-carpenter", "Forester / Carpenter", "Лесник-плотник", "Interface\\Icons\\Trade_Engineering"],
    ["fisher-cook", "Fisher / Cook", "Рыбак-повар", "Interface\\Icons\\Trade_Fishing"],
    ["hunter-leatherworker", "Hunter / Leatherworker", "Охотник-кожевник", "Interface\\Icons\\INV_Misc_LeatherScrap_02"],
    ["tailor", "Tailor", "Портной", "Interface\\Icons\\Trade_Tailoring"],
    ["scribe", "Scribe", "Начертатель", "Interface\\Icons\\INV_Inscription_Tradeskill01"],
    ["smith-weaponsmith", "Smith / Weaponsmith", "Кузнец-оружейник", "Interface\\Icons\\Trade_BlackSmithing"],
    ["engineer-mechanic", "Engineer / Mechanic", "Инженер-механик", "Interface\\Icons\\Trade_Engineering"],
    ["jeweler-cutter", "Jeweler / Cutter", "Ювелир-огранщик", "Interface\\Icons\\INV_Misc_Gem_01"],
];
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
for (let profession = 0; profession < PROFESSIONS.length; profession++) {
    for (let tool = 0; tool < 3; tool++) {
        DATASCRIPT_TRAINING_FEATURES.push({
            id: DS_MANUAL_COUNT + profession * 3 + tool + 1,
            key: PROFESSIONS[profession][0] + "-" + TOOL_KEYS[tool],
            kind: DS_TRAINING_KIND_TOOL,
            name: PROFESSIONS[profession][1] + " " + TOOL_NAME_EN[tool],
            nameRu: PROFESSIONS[profession][2] + ": " + TOOL_NAME_RU[tool],
            description: TOOL_DESCRIPTION_EN[tool]
                + (profession == 2 && tool == 1
                    ? " Forester / Carpenter has no station target; this kit currently has no effect."
                    : ""),
            descriptionRu: TOOL_DESCRIPTION_RU[tool]
                + (profession == 2 && tool == 1
                    ? " У лесника-плотника нет цели-станка: этот набор пока не даёт эффекта."
                    : ""),
            icon: PROFESSIONS[profession][3],
            payload: DS_PAYLOAD_TOOL_PERIOD + tool,
        });
    }
}
