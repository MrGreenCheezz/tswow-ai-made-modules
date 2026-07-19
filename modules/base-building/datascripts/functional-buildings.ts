import { std } from "wow/wotlk";

const MODNAME = "base-building";
const VISIBLE_AURA_BASE = 34747;
const ALL_SCHOOLS = ["PHYSICAL", "HOLY", "FIRE", "NATURE", "FROST", "SHADOW", "ARCANE"];

function clearGameObjectData(go: any): void {
    for (let i = 0; i <= 23; i++) go[`Data${i}`].set(0);
}

function makeClickableObject(
    id: string,
    nameEn: string,
    nameRu: string,
    display: number,
    tag: string,
): any {
    const go = std.GameObjectTemplates.Generic.create(MODNAME, id, 2696);
    clearGameObjectData(go);
    go.Type.GOOBER.set();
    clearGameObjectData(go);
    go.Faction.set(0);
    go.Flags.set(0);
    go.Display.set(display);
    go.Name.enGB.set(nameEn);
    go.Name.ruRU.set(nameRu);
    go.Tags.addUnique(MODNAME, tag);
    return go;
}

function makeInertObject(
    id: string,
    nameEn: string,
    nameRu: string,
    display: number,
    tag: string,
): any {
    const go = std.GameObjectTemplates.Generic.create(MODNAME, id, 2696);
    go.Type.TRAP.set();
    clearGameObjectData(go);
    go.Faction.set(0);
    go.Flags.set(0);
    go.Display.set(display);
    go.Name.enGB.set(nameEn);
    go.Name.ruRU.set(nameRu);
    go.Tags.addUnique(MODNAME, tag);
    return go;
}

function stripCreatureRewards(creature: any): void {
    creature.FlagsExtra.clearAll();
    creature.FlagsExtra.NO_XP.set(true);
    creature.row.lootid.set(0);
    creature.row.pickpocketloot.set(0);
    creature.row.skinloot.set(0);
}

function makeDefender(
    id: string,
    nameEn: string,
    nameRu: string,
    parent: number,
    tag: string,
    healthMod: number,
    armorMod: number = 1,
    damageMod: number = 1,
): any {
    const creature = std.CreatureTemplates.create(MODNAME, id, parent);
    creature.Name.enGB.set(nameEn);
    creature.Name.ruRU.set(nameRu);
    creature.Subname.enGB.set("Base Defender");
    creature.Subname.ruRU.set("Защитник владения");
    creature.NPCFlags.clearAll();
    creature.UnitFlags.clearAll();
    creature.Difficulty.Heroic5Man.set(0);
    creature.Difficulty.Heroic10Man.set(0);
    creature.Difficulty.Heroic25Man.set(0);
    stripCreatureRewards(creature);
    creature.FactionTemplate.set(1665);
    creature.AIName.set("");
    creature.row.ScriptName.set("");
    creature.Level.set(1, 1);
    creature.Stats.set(healthMod, 1, armorMod, damageMod, 1);
    creature.Tags.addUnique(MODNAME, tag);
    return creature;
}

export const BASE_HEALING_DUMMY = std.CreatureTemplates.create(
    MODNAME,
    "base-healing-dummy",
    31143,
);
BASE_HEALING_DUMMY.Name.enGB.set("Healer's Training Dummy");
BASE_HEALING_DUMMY.Name.ruRU.set("Манекен лекаря");
BASE_HEALING_DUMMY.Subname.enGB.set("Healing and Proc Testing");
BASE_HEALING_DUMMY.Subname.ruRU.set("Проверка исцеления и эффектов");
BASE_HEALING_DUMMY.NPCFlags.clearAll();
BASE_HEALING_DUMMY.UnitFlags.clearAll();
stripCreatureRewards(BASE_HEALING_DUMMY);
BASE_HEALING_DUMMY.FactionTemplate.set(35);
BASE_HEALING_DUMMY.AIName.set("");
BASE_HEALING_DUMMY.row.ScriptName.set("npc_training_dummy");
BASE_HEALING_DUMMY.Level.set(1, 1);
// Донор 31143 имеет HealthModifier 0.02381: на низких уровнях это всего 1 HP.
// Большой нормальный пул оставляет достаточно effective healing для прямых
// исцелений, HoT и связанных с ними оружейных проков на любом уровне.
BASE_HEALING_DUMMY.Stats.set(10, 1, 1, 0, 1);
BASE_HEALING_DUMMY.Tags.addUnique(MODNAME, "npc/base-healing-dummy");

export const BASE_CLEANSING_FONT = makeClickableObject(
    "base-cleansing-font",
    "Cleansing Font",
    "Купель очищения",
    8097,
    "go/base-cleansing-font",
);

export const BASE_REPAIR_STATION = makeClickableObject(
    "base-repair-station",
    "Repair Rack",
    "Ремонтная стойка",
    99719,
    "go/base-repair-station",
);

export const BASE_CAPITAL_PORTAL = makeClickableObject(
    "base-capital-portal",
    "Navigation Portal",
    "Навигационный портал",
    99471,
    "go/base-capital-portal",
);

export const BASE_HERALD = std.CreatureTemplates.create(MODNAME, "base-herald", 5193);
BASE_HERALD.Name.enGB.set("Base Herald");
BASE_HERALD.Name.ruRU.set("Геральдист базы");
BASE_HERALD.Subname.enGB.set("Guild Emblem Designer");
BASE_HERALD.Subname.ruRU.set("Создание герба гильдии");
BASE_HERALD.UnitFlags.clearAll();
stripCreatureRewards(BASE_HERALD);
BASE_HERALD.FactionTemplate.set(35);
BASE_HERALD.AIName.set("");
BASE_HERALD.row.ScriptName.set("");
BASE_HERALD.Level.set(1, 1);
BASE_HERALD.Tags.addUnique(MODNAME, "npc/base-herald");

export const BASE_TACTICAL_TABLE = makeClickableObject(
    "base-tactical-table",
    "Tactical Table",
    "Тактический стол",
    99763,
    "go/base-tactical-table",
);

export const BASE_SHIELDBEARER = makeDefender(
    "base-shieldbearer",
    "Base Shieldbearer",
    "Щитоносец базы",
    28028,
    "npc/base-shieldbearer",
    2.5,
    2.0,
    0.6,
);
BASE_SHIELDBEARER.Weapons.add(40598, 40597, 0);

export const BASE_BATTLE_MAGE = makeDefender(
    "base-battle-mage",
    "Base Battle Mage",
    "Боевой маг базы",
    27164,
    "npc/base-battle-mage",
    1.5,
);

export const BASE_BALLISTA = makeDefender(
    "base-ballista",
    "Base Ballista",
    "Баллиста базы",
    27894,
    "npc/base-ballista",
    1.5,
);
BASE_BALLISTA.Vehicle.set(0);

export const BASE_FROST_TRAP = makeInertObject(
    "base-frost-trap",
    "Frost Trap",
    "Морозный капкан",
    8068,
    "go/base-frost-trap",
);

export const BASE_RUNIC_BULWARK = makeInertObject(
    "base-runic-bulwark",
    "Runic Obelisk",
    "Рунный обелиск",
    7585,
    "go/base-runic-bulwark",
);

export const BASE_WATCH_GONG = makeInertObject(
    "base-watch-gong",
    "Watch Gong",
    "Дозорный гонг",
    4675,
    "go/base-watch-gong",
);

function makeDirectDamageSpell(
    id: string,
    tag: string,
    nameEn: string,
    nameRu: string,
    descriptionEn: string,
    descriptionRu: string,
    icon: string,
    parent: number,
    school: "ARCANE" | "PHYSICAL",
): any {
    const spell = std.Spells.create(MODNAME, id, parent, false);
    spell.Name.enGB.set(nameEn);
    spell.Name.ruRU.set(nameRu);
    spell.Description.enGB.set(descriptionEn);
    spell.Description.ruRU.set(descriptionRu);
    spell.Icon.setPath(icon);
    spell.Family.set(0);
    spell.Power.setMana(0, 0);
    spell.CastTime.setSimple(0, 0, 0);
    spell.Range.setSimple(0, 50);
    spell.row.ShapeshiftMask.set(BigInt(0));
    spell.row.ShapeshiftExclude.set(BigInt(0));
    spell.Attributes.clearAll();
    spell.Attributes.CANT_CRIT.set(true);
    spell.Attributes.IGNORE_BONUSES.set(true);
    spell.SchoolMask.clearAll();
    if (school == "ARCANE") spell.SchoolMask.ARCANE.set(true);
    else spell.SchoolMask.PHYSICAL.set(true);
    spell.Effects.clearAll();
    const effect = spell.Effects.addGet();
    effect.Type.SCHOOL_DAMAGE.set()
        .ImplicitTargetA.UNIT_TARGET_ENEMY.set()
        .DamageBase.set(1);
    effect.BonusMultiplier.set(0);
    spell.Tags.addUnique(MODNAME, tag);
    return spell;
}

export const BASE_BATTLE_MAGE_BOLT = makeDirectDamageSpell(
    "base-battle-mage-bolt",
    "spell/base-battle-mage-bolt",
    "Base Arcane Bolt",
    "Чародейский снаряд базы",
    "Deals direct Arcane damage to a base raider.",
    "Наносит налётчику базы прямой урон от тайной магии.",
    "spell_arcane_arcane01",
    30451,
    "ARCANE",
);

export const BASE_BALLISTA_SHOT = makeDirectDamageSpell(
    "base-ballista-shot",
    "spell/base-ballista-shot",
    "Ballista Shot",
    "Выстрел баллисты",
    "Deals direct Physical damage to a base raider.",
    "Наносит налётчику базы прямой физический урон.",
    "ability_vehicle_siegeenginecannon",
    6660,
    "PHYSICAL",
);

function makeAuraSpell(
    id: string,
    tag: string,
    nameEn: string,
    nameRu: string,
    descriptionEn: string,
    descriptionRu: string,
    icon: string,
    negative: boolean,
): any {
    const spell = std.Spells.create(MODNAME, id, VISIBLE_AURA_BASE);
    spell.Name.enGB.set(nameEn);
    spell.Name.ruRU.set(nameRu);
    spell.Description.enGB.set(descriptionEn);
    spell.Description.ruRU.set(descriptionRu);
    spell.AuraDescription.enGB.set(descriptionEn);
    spell.AuraDescription.ruRU.set(descriptionRu);
    spell.Icon.setPath(icon);
    spell.Duration.setSimple(7000);
    spell.DispelType.set("DISPEL_NONE");
    spell.Attributes.IS_NEGATIVE.set(negative);
    spell.Attributes.CANT_BE_CANCELED.set(true);
    spell.Attributes.IS_PASSIVE.set(false);
    spell.Attributes.HIDE_FROM_AURA_BAR.set(false);
    spell.Attributes.HIDE_AURA_IF_SELF_CAST.set(false);
    spell.Attributes.AURA_VISIBLE_TO_CASTER_ONLY.set(false);
    spell.SchoolMask.clearAll();
    spell.Effects.clearAll();
    spell.Tags.addUnique(MODNAME, tag);
    return spell;
}

export const BASE_FROST_TRAP_SLOW = makeAuraSpell(
    "base-frost-trap-slow",
    "spell/base-frost-trap-slow",
    "Frost Trap",
    "Морозный капкан",
    "Movement speed reduced by 30% near an enemy frost trap.",
    "Скорость передвижения снижена на 30% рядом с вражеским морозным капканом.",
    "spell_frost_frostnova",
    true,
);
BASE_FROST_TRAP_SLOW.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_DECREASE_SPEED.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(-30);

export const BASE_RUNIC_BULWARK_AURA = makeAuraSpell(
    "base-runic-bulwark",
    "spell/base-runic-bulwark",
    "Runic Bulwark",
    "Рунный бастион",
    "Damage taken reduced by 10% near a friendly runic obelisk.",
    "Получаемый урон снижен на 10% рядом с дружественным рунным обелиском.",
    "spell_holy_powerwordshield",
    false,
);
BASE_RUNIC_BULWARK_AURA.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_DAMAGE_PERCENT_TAKEN.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .Schools.set(ALL_SCHOOLS as any)
    .PercentBase.set(-10);
