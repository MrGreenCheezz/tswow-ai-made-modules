/**
 * Keep this catalog under datascripts/shared: datascripts need endpoint-local JS,
 * while the addon preloader uses the shared path segment as its module name.
 * Never reorder persisted entries.
 */

export type EchoQuality = 0 | 1 | 2 | 3;

export type EchoFamily =
    | "Caster DPS"
    | "Healer"
    | "Melee DPS"
    | "Mobility"
    | "Ranged DPS"
    | "Survivability"
    | "Tank";

export type EchoAuraKind =
    | "HASTE_SPELLS"
    | "MOD_ATTACK_POWER"
    | "MOD_DAMAGE_DONE"
    | "MOD_DAMAGE_PERCENT_DONE"
    | "MOD_DAMAGE_PERCENT_TAKEN"
    | "MOD_DAMAGE_TAKEN"
    | "MOD_DECREASE_SPEED"
    | "MOD_HEALING_DONE"
    | "MOD_HEALING_DONE_PERCENT"
    | "MOD_HEALING_PCT"
    | "MOD_INCREASE_ENERGY"
    | "MOD_INCREASE_HEALTH_PERCENT"
    | "MOD_MANA_REGEN_INTERRUPT"
    | "MOD_POWER_COST_SCHOOL_PCT"
    | "MOD_POWER_REGEN"
    | "MOD_RANGED_ATTACK_POWER"
    | "MOD_RATING"
    | "MOD_RESISTANCE"
    | "MOD_SHIELD_BLOCKVALUE"
    | "MOD_SPEED_ALWAYS"
    | "MOD_STAT"
    | "MOD_THREAT"
    | "PERIODIC_HEAL"
    | "REDUCE_PUSHBACK";

export interface EchoEffectDef {
    aura: EchoAuraKind;
    /** Effective value; Spell.dbc stores this as base points minus one. */
    pointsBase: number;
    pointsPerLevel: number;
    period: number;
    miscA: number;
    miscB: number;
}

export interface EchoDef {
    /** Original Ebonhold Spell.dbc ID, retained only for provenance. */
    sourceId: number;
    key: string;
    name: string;
    nameRu: string;
    description: string;
    descriptionRu: string;
    icon: string;
    quality: EchoQuality;
    maxStack: number;
    /** Original Ebonhold base-class gate, retained only for provenance. */
    sourceClassMask: number;
    /** Original Ebonhold grouping metadata; server semantics were not in MPQs. */
    groupId: number;
    /** Original tome/unlock spell, retained only for provenance. */
    sourceRequiredSpell: number;
    families: EchoFamily[];
    effects: EchoEffectDef[];
}

function effect(
    aura: EchoAuraKind,
    pointsBase: number,
    pointsPerLevel: number,
    period: number = 0,
    miscA: number = 0,
    miscB: number = 0,
): EchoEffectDef {
    return { aura, pointsBase, pointsPerLevel, period, miscA, miscB };
}

function echo(
    sourceId: number,
    key: string,
    name: string,
    nameRu: string,
    description: string,
    descriptionRu: string,
    icon: string,
    quality: EchoQuality,
    maxStack: number,
    sourceClassMask: number,
    groupId: number,
    sourceRequiredSpell: number,
    families: EchoFamily[],
    effects: EchoEffectDef[],
): EchoDef {
    return {
        sourceId, key, name, nameRu, description, descriptionRu, icon, quality, maxStack,
        sourceClassMask,
        groupId, sourceRequiredSpell, families, effects,
    };
}

export const ECHOES: EchoDef[] = [
    echo(200000, "strength-training", "Strength Training", "Тренировка силы",
        "Each rank increases Strength by 10 plus 0.2 per character level.",
        "Каждый ранг повышает силу на 10 ед. плюс 0,2 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\Ability_Warrior_StrengthOfArms", 0, 80, 1131, 97, 0, ["Melee DPS", "Tank"],
        [effect("MOD_STAT", 10, 0.2, 0, 0, 0)]),
    echo(200001, "agility-boost", "Agility Boost", "Повышение ловкости",
        "Each rank increases Agility by 10 plus 0.2 per character level.",
        "Каждый ранг повышает ловкость на 10 ед. плюс 0,2 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\Spell_Holy_BlessingOfAgility", 0, 80, 1135, 2, 0, ["Melee DPS", "Ranged DPS", "Tank"],
        [effect("MOD_STAT", 10, 0.2, 0, 1, 0)]),
    echo(200002, "mind-expansion", "Mind Expansion", "Расширение разума",
        "Each rank increases Intellect by 10 plus 0.2 per character level.",
        "Каждый ранг повышает интеллект на 10 ед. плюс 0,2 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\Spell_Holy_ArcaneIntellect", 0, 80, 1494, 56, 0, ["Caster DPS", "Healer"],
        [effect("MOD_STAT", 10, 0.2, 0, 3, 0)]),
    echo(200003, "spiritual-fortitude", "Spiritual Fortitude", "Духовная стойкость",
        "Each rank increases Spirit by 10 plus 0.2 per character level.",
        "Каждый ранг повышает дух на 10 ед. плюс 0,2 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\Spell_Holy_PrayerofSpirit", 0, 80, 1490, 88, 0, ["Caster DPS", "Healer"],
        [effect("MOD_STAT", 10, 0.2, 0, 4, 0)]),
    echo(200004, "iron-constitution", "Iron Constitution", "Железная закалка",
        "Each rank increases Stamina by 10 plus 0.2 per character level.",
        "Каждый ранг повышает выносливость на 10 ед. плюс 0,2 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\Spell_Nature_UnyeildingStamina", 0, 80, 1535, 52, 0, ["Survivability"],
        [effect("MOD_STAT", 10, 0.2, 0, 2, 0)]),
    echo(200006, "mana-regeneration", "Mana Regeneration", "Восполнение маны",
        "Each rank restores 10 plus 0.2 per character level additional mana every 5 seconds.",
        "Каждый ранг дополнительно восполняет 10 ед. маны плюс 0,2 ед. за каждый уровень персонажа раз в 5 сек.",
        "Interface\\Icons\\inv_misc_ancient_mana", 0, 80, 1490, 54, 0, ["Caster DPS", "Healer"],
        [effect("MOD_POWER_REGEN", 10, 0.2)]),
    echo(200007, "reinforced-shielding", "Reinforced Shielding", "Укреплённый щит",
        "Each rank increases shield block value by 30 plus 0.6 per character level.",
        "Каждый ранг увеличивает количество урона, блокируемого щитом, на 30 ед. плюс 0,6 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\inv_shield_panstart_a_01", 0, 80, 3, 72, 0, ["Tank"],
        [effect("MOD_SHIELD_BLOCKVALUE", 30, 0.6)]),
    echo(200008, "mystic-potency", "Mystic Potency", "Мистическая мощь",
        "Each rank increases magic spell damage and healing by 20 plus 0.4 per character level.",
        "Каждый ранг увеличивает урон от магических заклинаний и объём исцеления на 20 ед. плюс 0,4 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\INV_Enchant_EssenceMysticalLarge", 0, 80, 1490, 58, 0, ["Caster DPS", "Healer"],
        [effect("MOD_DAMAGE_DONE", 20, 0.4, 0, 126, 0), effect("MOD_HEALING_DONE", 20, 0.4, 0, 127, 0)]),
    echo(200009, "brutal-might", "Brutal Might", "Неистовая мощь",
        "Each rank increases melee and ranged attack power by 30 plus 0.6 per character level.",
        "Каждый ранг повышает силу атаки в ближнем и дальнем бою на 30 ед. плюс 0,6 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\inv_ability_mountainthanewarrior_thorimsmight", 0, 80, 1135, 13, 0, ["Melee DPS", "Ranged DPS"],
        [effect("MOD_ATTACK_POWER", 30, 0.6), effect("MOD_RANGED_ATTACK_POWER", 30, 0.6)]),
    echo(200016, "warm-blooded", "Warm-Blooded", "Теплокровность",
        "Each rank restores 12 plus 0.24 per character level health every 3 seconds.",
        "Каждый ранг восстанавливает 12 ед. здоровья плюс 0,24 ед. за каждый уровень персонажа раз в 3 сек.",
        "Interface\\Icons\\ability_racial_pureblood", 0, 80, 1535, 107, 0, ["Survivability"],
        [effect("PERIODIC_HEAL", 12, 0.24, 3000)]),
    echo(200017, "hardened-skin", "Hardened Skin", "Закалённая кожа",
        "Each rank increases armor by 80 plus 1.6 per character level.",
        "Каждый ранг повышает броню на 80 ед. плюс 1,6 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\inv_10_skinning_scales_black", 0, 80, 1535, 47, 0, ["Tank"],
        [effect("MOD_RESISTANCE", 80, 1.6, 0, 1, 0)]),
    echo(200018, "hardened-resolve", "Hardened Resolve", "Непоколебимая решимость",
        "Each rank reduces damage taken from every school by 6 per hit.",
        "Каждый ранг уменьшает получаемый урон любого типа от каждого попадания на 6 ед.",
        "Interface\\Icons\\warrior_talent_icon_gladiatorsresolve", 0, 80, 1535, 46, 0, ["Tank"],
        [effect("MOD_DAMAGE_TAKEN", -6, 0, 0, 127, 0)]),
    echo(200019, "swift-step", "Swift Step", "Быстрый шаг",
        "Each rank increases movement speed by 5%.",
        "Каждый ранг повышает скорость передвижения на 5%.",
        "Interface\\Icons\\rogue_burstofspeed", 0, 80, 1535, 101, 0, ["Mobility"],
        [effect("MOD_SPEED_ALWAYS", 5, 0)]),
    echo(200041, "enhanced-recovery", "Enhanced Recovery", "Усиленное восстановление",
        "Each rank increases all healing received by 1%.",
        "Каждый ранг увеличивает всё получаемое исцеление на 1%.",
        "Interface\\Icons\\Ability_Druid_HealingInstincts", 1, 15, 1535, 33, 0, ["Tank", "Survivability"],
        [effect("MOD_HEALING_PCT", 1, 0)]),
    echo(200429, "keen-aim", "Keen Aim", "Меткий прицел",
        "Each rank increases melee, ranged, and spell hit rating by 5 plus 0.15 per character level.",
        "Каждый ранг повышает рейтинг меткости атак ближнего и дальнего боя и заклинаний на 5 ед. плюс 0,15 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\Ability_Druid_PrimalPrecision", 0, 80, 1535, 53, 0, ["Caster DPS", "Melee DPS", "Ranged DPS", "Tank"],
        [effect("MOD_RATING", 5, 0.15, 0, 224, 0)]),
    echo(200430, "crushing-force", "Crushing Force", "Сокрушительная сила",
        "Each rank increases melee, ranged, and spell critical strike rating by 5 plus 0.15 per character level.",
        "Каждый ранг повышает рейтинг критического удара атак ближнего и дальнего боя и заклинаний на 5 ед. плюс 0,15 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\achievement_guildperk_reinforce", 0, 80, 1535, 19, 0, ["Caster DPS", "Melee DPS", "Ranged DPS"],
        [effect("MOD_RATING", 5, 0.15, 0, 1792, 0)]),
    echo(200431, "quick-hands", "Quick Hands", "Ловкие руки",
        "Each rank increases melee, ranged, and spell haste rating by 5 plus 0.15 per character level.",
        "Каждый ранг повышает рейтинг скорости атак ближнего и дальнего боя и заклинаний на 5 ед. плюс 0,15 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\ability_titankeeper_phasing", 0, 80, 1535, 69, 0, ["Caster DPS", "Melee DPS", "Ranged DPS"],
        [effect("MOD_RATING", 5, 0.15, 0, 917504, 0)]),
    echo(200432, "armor-penetration", "Armor Penetration", "Пробивание брони",
        "Each rank increases armor penetration rating by 5 plus 0.15 per character level.",
        "Каждый ранг повышает рейтинг пробивания брони на 5 ед. плюс 0,15 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\Ability_Warrior_ShieldBreak", 0, 80, 1135, 6, 0, ["Melee DPS", "Ranged DPS"],
        [effect("MOD_RATING", 5, 0.15, 0, 16777216, 0)]),
    echo(200433, "expertise-drills", "Expertise Drills", "Тренировка мастерства",
        "Each rank increases expertise rating by 5 plus 0.15 per character level.",
        "Каждый ранг повышает рейтинг мастерства на 5 ед. плюс 0,15 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\ability_rogue_combatexpertisetga", 0, 80, 1131, 34, 0, ["Melee DPS", "Tank"],
        [effect("MOD_RATING", 5, 0.15, 0, 8388608, 0)]),
    echo(200434, "mana-reservoir", "Mana Reservoir", "Запас маны",
        "Each rank increases maximum mana by 120 plus 2.4 per character level.",
        "Каждый ранг увеличивает максимальный запас маны на 120 ед. плюс 2,4 ед. за каждый уровень персонажа.",
        "Interface\\Icons\\Spell_Magic_ManaGain", 0, 80, 1490, 55, 0, ["Caster DPS", "Healer"],
        [effect("MOD_INCREASE_ENERGY", 120, 2.4)]),
    echo(200442, "steady-channeling", "Steady Channeling", "Непрерывный поток",
        "Each rank allows 5% of normal mana regeneration to continue while casting.",
        "Каждый ранг сохраняет 5% обычного восполнения маны во время произнесения заклинаний.",
        "Interface\\Icons\\inv_10_enchanting2_magicswirl_blue", 0, 20, 1490, 91, 0, ["Caster DPS", "Healer"],
        [effect("MOD_MANA_REGEN_INTERRUPT", 5, 0)]),
    echo(200437, "steady-casting", "Steady Casting", "Стойкое колдовство",
        "Each rank reduces spellcasting pushback from damage by 20%.",
        "Каждый ранг на 20% уменьшает задержку произнесения заклинаний при получении урона.",
        "Interface\\Icons\\inv_glove_cloth_challengemage_d_01", 1, 5, 1535, 90, 300437, ["Caster DPS", "Healer"],
        [effect("REDUCE_PUSHBACK", 20, 0, 0, 127, 0)]),
    echo(200438, "subtle-presence", "Subtle Presence", "Незаметное присутствие",
        "Each rank reduces threat generated from every school by 2%.",
        "Каждый ранг на 2% уменьшает угрозу, создаваемую эффектами всех школ.",
        "Interface\\Icons\\Spell_Magic_LesserInvisibilty", 1, 10, 1535, 98, 300438, ["Caster DPS", "Healer", "Melee DPS", "Ranged DPS"],
        [effect("MOD_THREAT", -2, 0, 0, 127, 0)]),
    echo(200439, "provoking-presence", "Provoking Presence", "Провоцирующее присутствие",
        "Each rank increases threat generated from every school by 3%.",
        "Каждый ранг на 3% увеличивает угрозу, создаваемую эффектами всех школ.",
        "Interface\\Icons\\inv_plate_raidwarrior_o_01helm", 1, 80, 1535, 66, 300439, ["Tank"],
        [effect("MOD_THREAT", 3, 0, 0, 127, 0)]),
    echo(200440, "efficient-casting", "Efficient Casting", "Эффективное колдовство",
        "Each rank reduces mana costs of spells from every school by 5%.",
        "Каждый ранг на 5% уменьшает затраты маны на заклинания всех школ.",
        "Interface\\Icons\\Spell_Arcane_ManaTap", 1, 10, 1494, 29, 0, ["Caster DPS", "Healer"],
        [effect("MOD_POWER_COST_SCHOOL_PCT", -5, 0, 0, 127, 1)]),
    echo(200674, "glass-canon", "Glass Canon", "Стеклянная пушка",
        "Increases all damage dealt by 15%, but reduces maximum health by 30%.",
        "Увеличивает весь наносимый урон на 15%, но уменьшает максимальный запас здоровья на 30%.",
        "Interface\\Icons\\inv_axe_2h_artifactmaw_d_06", 2, 1, 1535, 146, 0, ["Caster DPS", "Melee DPS", "Ranged DPS"],
        [effect("MOD_DAMAGE_PERCENT_DONE", 15, 0, 0, 127, 0), effect("MOD_INCREASE_HEALTH_PERCENT", -30, 0)]),
    echo(200734, "leadfoot", "Leadfoot", "Свинцовые ноги",
        "Increases spell haste by 10%, but reduces movement speed by 30%.",
        "Повышает скорость произнесения заклинаний на 10%, но снижает скорость передвижения на 30%.",
        "Interface\\Icons\\inv_boots_armor_dwarf_d_01", 2, 1, 1490, 175, 0, ["Caster DPS", "Healer"],
        [effect("HASTE_SPELLS", 10, 0), effect("MOD_DECREASE_SPEED", -30, 0)]),
    echo(200884, "fortress-soul", "Fortress Soul", "Душа-крепость",
        "Reduces all damage taken by 35% and all damage dealt by 70%, while increasing threat generated by 200%.",
        "Уменьшает весь получаемый урон на 35% и весь наносимый урон на 70%, при этом увеличивая создаваемую угрозу на 200%.",
        "Interface\\Icons\\ability_racial_mountaineer", 2, 1, 1535, 201, 300884, ["Tank"],
        [effect("MOD_DAMAGE_PERCENT_TAKEN", -35, 0, 0, 127, 0), effect("MOD_DAMAGE_PERCENT_DONE", -70, 0, 0, 127, 0), effect("MOD_THREAT", 200, 0, 0, 127, 0)]),
    echo(200886, "the-last-wall", "The Last Wall", "Последний оплот",
        "Increases maximum health by 50%, but reduces all healing received by 60%.",
        "Увеличивает максимальный запас здоровья на 50%, но уменьшает всё получаемое исцеление на 60%.",
        "Interface\\Icons\\inv_shield_1h_earthendungeon_c_02", 2, 1, 1535, 202, 300886, ["Tank"],
        [effect("MOD_INCREASE_HEALTH_PERCENT", 50, 0), effect("MOD_HEALING_PCT", -60, 0, 0, 127, 0)]),
    echo(201268, "overwhelming-restoration", "Overwhelming Restoration", "Неудержимое восстановление",
        "Increases healing done by 30%, but increases mana costs of magic spells by 500%.",
        "Увеличивает эффективность исцеления на 30%, но повышает затраты маны на магические заклинания на 500%.",
        "Interface\\Icons\\inv_112_restorationdruid_ancientoflore", 3, 1, 1535, 262, 301268, ["Healer"],
        [effect("MOD_HEALING_DONE_PERCENT", 30, 0, 0, 127, 0), effect("MOD_POWER_COST_SCHOOL_PCT", 500, 0, 0, 126, 1)]),
];
