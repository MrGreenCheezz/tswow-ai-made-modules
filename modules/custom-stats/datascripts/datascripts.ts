import { patch } from "wow/data";
import { std } from "wow/wotlk";

export const CUSTOM_STATS_MODULE = "custom-stats";

function nameSpell(spell: any, en: string, ru: string, descriptionEn: string, descriptionRu: string, icon: string): void {
    spell.Family.set(0);
    spell.Power.setMana(0, 0);
    spell.CastTime.setSimple(0, 0, 0);
    spell.row.ShapeshiftMask.set(BigInt(0));
    spell.row.ShapeshiftExclude.set(BigInt(0));
    spell.Attributes.IS_PASSIVE.set(false);
    spell.Attributes.HIDE_FROM_AURA_BAR.set(false);
    spell.Name.enGB.set(en).Name.ruRU.set(ru);
    spell.Description.enGB.set(descriptionEn).Description.ruRU.set(descriptionRu);
    spell.AuraDescription.enGB.set(descriptionEn).AuraDescription.ruRU.set(descriptionRu);
    spell.Icon.setPath(icon);
}

// These spells run through the normal cast pipeline so combat addons and the
// weapon-proc engine receive ordinary SPELL_HEAL/SPELL_DAMAGE events.
const VAMPIRISM_HEAL = std.Spells.create(CUSTOM_STATS_MODULE, "vampirism-heal", 2061, false);
nameSpell(
    VAMPIRISM_HEAL,
    "Vampirism", "Вампиризм",
    "Restores health from damage dealt.", "Восстанавливает здоровье от нанесённого урона.",
    "spell_shadow_lifedrain02",
);
VAMPIRISM_HEAL.row.SpellVisualID.set([0, 0]);
VAMPIRISM_HEAL.Attributes.clearAll();
VAMPIRISM_HEAL.Attributes.CANT_CRIT.set(true);
VAMPIRISM_HEAL.Attributes.TRIGGER_CAN_TRIGGER_PROC.set(true);
VAMPIRISM_HEAL.Attributes.IGNORE_BONUSES.set(true);
VAMPIRISM_HEAL.Effects.clearAll();
const VAMPIRISM_HEAL_EFFECT = VAMPIRISM_HEAL.Effects.addGet();
VAMPIRISM_HEAL_EFFECT
    .Type.HEAL.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .HealBase.set(1);
VAMPIRISM_HEAL_EFFECT.BonusMultiplier.set(0);

const THORNS_REFLECT = std.Spells.create(CUSTOM_STATS_MODULE, "thorns-reflect", 12654, false);
nameSpell(
    THORNS_REFLECT,
    "Thorns", "Шипы",
    "Reflects part of incoming damage.", "Отражает часть входящего урона.",
    "spell_nature_thorns",
);
THORNS_REFLECT.Attributes.clearAll();
THORNS_REFLECT.Attributes.CANT_CRIT.set(true);
THORNS_REFLECT.Attributes.TRIGGER_CAN_TRIGGER_PROC.set(true);
THORNS_REFLECT.Attributes.IGNORE_BONUSES.set(true);
THORNS_REFLECT.SchoolMask.clearAll().SchoolMask.NATURE.set(true);
THORNS_REFLECT.Effects.clearAll();
const THORNS_REFLECT_EFFECT = THORNS_REFLECT.Effects.addGet();
THORNS_REFLECT_EFFECT
    .Type.SCHOOL_DAMAGE.set()
    .ImplicitTargetA.UNIT_TARGET_ENEMY.set()
    .DamageBase.set(1);
THORNS_REFLECT_EFFECT.BonusMultiplier.set(0);

// A hidden aura exposes resolved periodic damage through ProcEventInfo.
const PERIODIC_TRACKER = std.Spells.create(CUSTOM_STATS_MODULE, "periodic-damage-tracker", 11069);
nameSpell(
    PERIODIC_TRACKER,
    "Periodic damage tracker", "Отслеживание периодического урона",
    "Internal custom-stat tracker.", "Внутренний отслеживающий эффект характеристик.",
    "spell_shadow_shadowwordpain",
);
PERIODIC_TRACKER.Duration.setSimple(-1);
PERIODIC_TRACKER.Attributes.CANT_BE_CANCELED.set(true);
PERIODIC_TRACKER.Attributes.HIDE_FROM_AURA_BAR.set(true);
PERIODIC_TRACKER.Effects.clearAll();
PERIODIC_TRACKER.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.DUMMY.set()
    .ImplicitTargetA.UNIT_CASTER.set();
PERIODIC_TRACKER.Proc.Chance.set(100);
PERIODIC_TRACKER.Proc.Charges.set(0);
// The active core uses DONE_PERIODIC=0x40000 and TAKEN_PERIODIC=0x80000.
PERIODIC_TRACKER.Proc.TriggerMask.set(0x000c0000);
PERIODIC_TRACKER.Proc.TypeMask.set(0x1);
PERIODIC_TRACKER.Proc.PhaseMask.HIT.set(true);

const ON_EQUIP = 1;
const CHANCE_ON_HIT = 2;
const RANGED_INVENTORY_TYPES = [15, 25, 26];
const CASTER_STATS = [0, 5, 6, 18, 21, 30, 41, 42, 43, 45, 47];
const HEALER_STATS = [6, 41, 43];
const DAMAGE_CASTER_STATS = [18, 21, 30, 42, 47];

// Raw masks from the active TrinityCore SpellMgr.h. TSWoW's named
// SpellProcFlags enum is shifted and must not be used here.
// DONE_HIT includes DONE_PERIODIC (0x00040000), so the same driver handles
// both direct events and DoT/HoT ticks; TypeMask separates damage from healing.
const PROC_DONE_HIT_MASK = 0x00e55554;
const PROC_TYPE_DAMAGE = 0x1;
const PROC_TYPE_HEAL = 0x2;
const PROC_PHASE_HIT = 0x2;
const PROC_DRIVER_BASE = 11069;

type ProcKind = "damage" | "heal";

interface WeaponEffect {
    spell: number;
    chance: number;
    kind: ProcKind;
}

interface ProcTier {
    maxItemLevel: number;
    choices: WeaponEffect[];
}

function effects(kind: ProcKind, chance: number, ...spells: number[]): WeaponEffect[] {
    return spells.map(spell => ({ spell, chance, kind }));
}

function harmful(chance: number, ...spells: number[]): WeaponEffect[] {
    return effects("damage", chance, ...spells);
}

function helpful(chance: number, ...spells: number[]): WeaponEffect[] {
    return effects("heal", chance, ...spells);
}

// Payload spells are stock, data-driven effects. Script-bound item drivers
// (Capacitor, Heartpierce, Val'anyr, Shadowmourne, etc.) are intentionally not
// reused: their spell_script_names rows do not follow a cloned aura.
const MELEE_TIERS: ProcTier[] = [
    { maxItemLevel: 14, choices: harmful(10, 89) },
    { maxItemLevel: 29, choices: harmful(10, 16409, 18381, 18092, 13528, 13524) },
    {
        maxItemLevel: 49,
        choices: [...harmful(10, 13439, 13440, 13442, 11791, 11374, 13490), ...harmful(5, 11960)],
    },
    {
        maxItemLevel: 69,
        choices: [
            ...harmful(10, 16921, 16927, 18086, 16928, 15848, 17230),
            ...harmful(5, 16908, 16871),
        ],
    },
    {
        maxItemLevel: 99,
        choices: [
            ...harmful(10, 21140, 21992, 26693),
            ...harmful(5, 17505, 19755),
            ...harmful(2, 12541),
        ],
    },
    {
        maxItemLevel: 159,
        choices: [
            ...harmful(5, 60431, 31604),
            ...harmful(2, 31552),
            ...helpful(5, 21153, 28093, 28866, 32600),
            ...helpful(2, 30470),
        ],
    },
    {
        maxItemLevel: 249,
        choices: [
            ...harmful(10, 69180, 69209, 69211),
            ...harmful(5, 60432, 36482),
            ...harmful(2, 30113),
            ...helpful(5, 34775, 60302, 60437, 65019, 67671),
        ],
    },
    {
        maxItemLevel: Number.MAX_SAFE_INTEGER,
        choices: [
            ...harmful(10, 71838, 71839, 69209, 69211),
            ...harmful(5, 60433, 36482),
            ...harmful(2, 30113),
            ...helpful(5, 34775, 60302, 60437, 65019, 67671, 71568, 71872),
        ],
    },
];

const RANGED_TIERS: ProcTier[] = [
    { maxItemLevel: 30, choices: harmful(10, 29653) },
    {
        maxItemLevel: 45,
        choices: [
            ...harmful(10, 29646, 29638, 13528, 13524, 11374, 13490),
            ...harmful(5, 11960),
        ],
    },
    {
        maxItemLevel: 60,
        choices: [
            ...harmful(10, 29644, 29655, 29502, 29641, 29640, 29647, 29639, 11791, 15848, 17230),
            ...harmful(5, 16871),
        ],
    },
    {
        maxItemLevel: 99,
        choices: [
            ...harmful(10, 55736, 16928),
            ...harmful(5, 17505, 19755),
            ...harmful(2, 12541),
        ],
    },
    {
        maxItemLevel: 159,
        choices: [
            ...harmful(5, 60431, 16908, 31604),
            ...harmful(2, 31552),
            ...helpful(5, 21153, 28093, 28866, 32600),
        ],
    },
    {
        maxItemLevel: 249,
        choices: [
            ...harmful(10, 69180, 69209, 69211),
            ...harmful(5, 60432, 36482),
            ...harmful(2, 30113),
            ...helpful(5, 34775, 60302, 60437, 65019, 67671),
        ],
    },
    {
        maxItemLevel: Number.MAX_SAFE_INTEGER,
        choices: [
            ...harmful(10, 71838, 71839),
            ...harmful(5, 60433, 36482),
            ...harmful(2, 30113),
            ...helpful(5, 34775, 60302, 60437, 65019, 67671, 71568),
        ],
    },
];

const CASTER_TIERS: ProcTier[] = [
    {
        maxItemLevel: 75,
        choices: [
            ...harmful(10, 16409, 13439, 13440, 13442, 27860, 13528, 13524, 11374, 13490, 15848, 17230),
            ...harmful(5, 11960, 16871),
        ],
    },
    {
        maxItemLevel: 110,
        choices: [
            ...harmful(10, 16921, 21992, 11791, 16928),
            ...harmful(5, 16908, 17505, 19755),
            ...harmful(2, 12541),
        ],
    },
    {
        maxItemLevel: 159,
        choices: [
            ...harmful(5, 60431, 31604),
            ...harmful(2, 31552),
            ...helpful(5, 28866, 32600),
        ],
    },
    {
        maxItemLevel: 219,
        choices: [
            ...harmful(10, 60483, 60203),
            ...harmful(5, 60432, 36482),
            ...harmful(2, 30113),
            ...helpful(10, 40480),
            ...helpful(5, 34775),
        ],
    },
    {
        maxItemLevel: 249,
        choices: [
            ...harmful(10, 69209, 69211),
            ...harmful(5, 60432, 36482),
            ...harmful(2, 30113),
            ...helpful(5, 60064, 60302, 64741, 67669),
        ],
    },
    {
        maxItemLevel: Number.MAX_SAFE_INTEGER,
        choices: [
            ...harmful(10, 71838, 71839, 60203),
            ...harmful(5, 60433, 36482),
            ...harmful(2, 30113),
            ...helpful(5, 60064, 60302, 64741, 67669, 71568),
        ],
    },
];

const HEALER_TIERS: ProcTier[] = [
    {
        maxItemLevel: 110,
        choices: [...helpful(10, 25907, 38317, 10342, 52419, 25768, 35084, 35087), ...helpful(5, 21970)],
    },
    {
        maxItemLevel: 150,
        choices: [
            ...helpful(10, 33370, 40972, 43738, 52021, 35078, 45058, 16916, 21165, 34513, 38293),
            ...helpful(5, 28866, 32600),
        ],
    },
    {
        maxItemLevel: 199,
        choices: [...helpful(10, 36483, 40408, 40480), ...helpful(5, 34775)],
    },
    {
        maxItemLevel: 229,
        choices: [
            ...helpful(10, 60062, 60486, 60479, 60492),
            ...helpful(5, 60229, 60233, 60234, 60064, 60302),
        ],
    },
    {
        maxItemLevel: 249,
        choices: [
            ...helpful(10, 67696, 64739, 71584, 65006, 60494, 64713, 64951, 67371, 67378),
            ...helpful(5, 60234, 64741, 67669),
        ],
    },
    {
        maxItemLevel: Number.MAX_SAFE_INTEGER,
        choices: [
            ...helpful(10, 75466, 75473, 71570, 71572),
            ...helpful(5, 71633, 60229, 60233, 60234, 75477, 64741, 67669, 71568),
            ...helpful(2, 71610, 71641),
        ],
    },
];

// Official enUS 3.3.5a (build 12340) names for every stock payload above.
// Keep this module-local because a ruRU source client has empty enGB columns.
const PAYLOAD_ENGLISH_NAMES: { [spellId: number]: string } = {
    89: "Cripple",
    10342: "Guardian Effect",
    11374: "Gift of Arthas",
    11791: "Puncture Armor",
    11960: "Curse of the Dreadmaul",
    12541: "Ghoul Rot",
    13439: "Frostbolt",
    13440: "Shadow Bolt",
    13442: "Firebolt",
    13490: "Howling Blade",
    13524: "Curse of Stalvan",
    13528: "Decayed Strength",
    15848: "Festering Rash",
    16409: "Shadow Bolt",
    16871: "Bleakwood Curse",
    16908: "Dispel Magic",
    16916: "Strength of the Champion",
    16921: "Chain Lightning",
    16927: "Chilled",
    16928: "Armor Shatter",
    17230: "Infected Wound",
    17505: "Curse of Timmy",
    18086: "Firebolt",
    18092: "Frost Blast",
    18381: "Cripple",
    19755: "Frightalon",
    21140: "Fatal Wound",
    21153: "Bonereaver's Edge",
    21165: "Haste",
    21970: "Mark of the Chosen",
    21992: "Thunderfury",
    25768: "Mystical Disjunction",
    25907: "Spell Blasting",
    26693: "Drain Life",
    27860: "Engulfing Shadows",
    28093: "Lightning Speed",
    28866: "Kiss of the Spider",
    29502: "Frost Arrow",
    29638: "Searing Arrow",
    29639: "Flaming Cannonball",
    29640: "Shadow Bolt",
    29641: "Shadow Shot",
    29644: "Fire Blast",
    29646: "Quill Shot",
    29647: "Flaming Shell",
    29653: "Venom Shot",
    29655: "Keeper's Sting",
    30113: "Putrid Bite",
    30470: "Slice and Dice",
    31552: "Decayed Strength",
    31604: "Arcane Weakness",
    32600: "Avoidance",
    33370: "Spell Haste",
    34513: "Lionheart",
    34775: "Dragonspine Flurry",
    35078: "Band of the Eternal Defender",
    35084: "Band of the Eternal Sage",
    35087: "Band of the Eternal Restorer",
    36482: "Armor Disruption",
    36483: "Infernal Protection",
    38293: "Santos' Blessing",
    38317: "Forgotten Knowledge",
    40408: "Unbreakable",
    40480: "Power of the Ashtongue",
    40972: "Heal",
    43738: "Primal Instinct",
    45058: "Evasive Maneuvers",
    52021: "Snap and Snarl",
    52419: "Deflection",
    55736: "Chilled Shot",
    60062: "Essence of Life",
    60064: "Now is the time!",
    60203: "Darkmoon Card: Death",
    60229: "Greatness",
    60233: "Greatness",
    60234: "Greatness",
    60302: "Meteorite Whetstone",
    60431: "Earth and Moon",
    60432: "Earth and Moon",
    60433: "Earth and Moon",
    60437: "Grim Toll",
    60479: "Forge Ember",
    60483: "Pendulum of Telluric Currents",
    60486: "Illustration of the Dragon Soul",
    60492: "Embrace of the Spider",
    60494: "Dying Curse",
    64713: "Flame of the Heavens",
    64739: "Show of Faith",
    64741: "Pandora's Plea",
    64951: "Primal Wrath",
    65006: "Eye of the Broodmother",
    65019: "Mjolnir Runestone",
    67371: "Holy Strength",
    67378: "Evasion",
    67669: "Elusive Power",
    67671: "Fury",
    67696: "Energized",
    69180: "Gutgore Ripper",
    69209: "Fatal Wound",
    69211: "Shadow Bolt",
    71568: "Urgency",
    71570: "Cultivated Power",
    71572: "Cultivated Power",
    71584: "Revitalized",
    71610: "Echoes of Light",
    71633: "Thick Skin",
    71641: "Echoes of Light",
    71838: "Drain Life",
    71839: "Drain Life",
    71872: "Blessing of Light",
    75466: "Twilight Flames",
    75473: "Twilight Flames",
    75477: "Scaly Nimbleness",
};

const DRIVER_IDS: { [key: string]: number } = {};

function effectKey(effect: WeaponEffect): string {
    return effect.kind + "-" + effect.spell;
}

function createProcDriver(effect: WeaponEffect): number {
    const payload = std.Spells.load(effect.spell);
    const enName = PAYLOAD_ENGLISH_NAMES[effect.spell] || payload.Name.enGB.get() || "Spell " + effect.spell;
    const ruName = payload.Name.ruRU.get() || enName;
    const enDescription = effect.kind == "damage"
        ? "Any damage you deal has a " + effect.chance + "% chance to trigger " + enName + "."
        : "Any healing you do has a " + effect.chance + "% chance to trigger " + enName + ".";
    const ruDescription = effect.kind == "damage"
        ? "Любой нанесённый вами урон с вероятностью " + effect.chance + "% вызывает эффект «" + ruName + "»."
        : "Любое совершённое вами исцеление с вероятностью " + effect.chance + "% вызывает эффект «" + ruName + "».";
    const driver = std.Spells.create(
        CUSTOM_STATS_MODULE,
        "weapon-" + effectKey(effect),
        PROC_DRIVER_BASE,
        false,
    );
    driver.Family.set(0);
    driver.Power.setMana(0, 0);
    driver.CastTime.setSimple(0, 0, 0);
    driver.Duration.setSimple(-1);
    driver.row.ShapeshiftMask.set(BigInt(0));
    driver.row.ShapeshiftExclude.set(BigInt(0));
    driver.Attributes.clearAll();
    driver.Attributes.IS_PASSIVE.set(true);
    driver.Attributes.CANT_BE_CANCELED.set(true);
    driver.Attributes.HIDE_FROM_AURA_BAR.set(true);
    // The proc row still rejects arbitrary triggered casts. This DBC flag lets
    // specifically opt-in spells (the module's Thorns/Vampirism records) pass
    // TrinityCore's second triggered-spell gate without enabling arbitrary
    // proc chains.
    driver.Attributes.CAN_PROC_WITH_TRIGGERED.set(true);
    driver.Name.enGB.set(enName).Name.ruRU.set(ruName);
    driver.Description.enGB.set(enDescription).Description.ruRU.set(ruDescription);
    driver.AuraDescription.enGB.set(enDescription).AuraDescription.ruRU.set(ruDescription);
    driver.Icon.set(payload.Icon.get());
    driver.Effects.clearAll();
    driver.Effects.addGet()
        .Type.APPLY_AURA.set()
        .Aura.PROC_TRIGGER_SPELL.set()
        .ImplicitTargetA.UNIT_CASTER.set()
        .TriggeredSpell.set(effect.spell);
    driver.Proc.mod(proc => {
        // Set DBC-backed fields before the first SQL-backed field creates the
        // spell_proc row, so SQL receives the same normalized values.
        (proc.TriggerMask as any).set(PROC_DONE_HIT_MASK);
        proc.Chance.set(effect.chance);
        proc.Charges.set(0);
        proc.SchoolMask.clearAll();
        proc.SpellFamily.set(0);
        proc.ClassMask.A.clearAll();
        proc.ClassMask.B.clearAll();
        proc.ClassMask.C.clearAll();
        (proc.TypeMask as any).set(effect.kind == "damage" ? PROC_TYPE_DAMAGE : PROC_TYPE_HEAL);
        (proc.PhaseMask as any).set(PROC_PHASE_HIT);
        proc.HitMask.clearAll();
        proc.AttributesMask.clearAll();
        proc.DisableEffectsMask.clearAll();
        proc.ProcsPerMinute.set(0);
    });
    return driver.ID;
}

function prepareDrivers(tiers: ProcTier[]): void {
    for (const tier of tiers) {
        for (const effect of tier.choices) {
            const key = effectKey(effect);
            const existing = DRIVER_IDS[key];
            if (existing === undefined) DRIVER_IDS[key] = createProcDriver(effect);
        }
    }
}

prepareDrivers(MELEE_TIERS);
prepareDrivers(RANGED_TIERS);
prepareDrivers(CASTER_TIERS);
prepareDrivers(HEALER_TIERS);

function hasNativeProc(item: any): boolean {
    for (let i = 0; i < item.Spells.length; i++) {
        const itemSpell = item.Spells.get(i);
        const spellId = Number(itemSpell.Spell.get());
        if (spellId <= 0) continue;
        if (Number(itemSpell.Trigger.get()) == CHANCE_ON_HIT) return true;
        if (Number(itemSpell.Trigger.get()) != ON_EQUIP) continue;

        const spell = std.Spells.load(spellId);
        if (spell.Proc.exists() || Number(spell.Proc.TriggerMask.get()) > 0) return true;
    }
    return false;
}

function statScores(item: any): { caster: number; healer: number; damage: number } {
    let caster = 0;
    let healer = 0;
    let damage = 0;
    for (let i = 0; i < item.Stats.length; i++) {
        const stat = item.Stats.get(i);
        const value = Math.abs(Number(stat.Value.get()));
        if (value == 0) continue;
        const type = Number(stat.Type.get());
        if (CASTER_STATS.includes(type)) caster += value;
        if (HEALER_STATS.includes(type)) healer += value;
        if (DAMAGE_CASTER_STATS.includes(type)) damage += value;
    }
    return { caster, healer, damage };
}

function choose(tiers: ProcTier[], itemLevel: number, itemEntry: number): WeaponEffect {
    let tier = tiers[tiers.length - 1];
    for (let i = 0; i < tiers.length; i++) {
        if (itemLevel <= tiers[i].maxItemLevel) {
            tier = tiers[i];
            break;
        }
    }
    return tier.choices[itemEntry % tier.choices.length];
}

function chooseForWeapon(item: any): WeaponEffect {
    const itemLevel = Number(item.ItemLevel.get());
    const inventoryType = Number(item.InventoryType.get());
    const subclass = Number(item.Class.getSubclass());
    const isRangedWeapon = RANGED_INVENTORY_TYPES.includes(inventoryType) && subclass != 19;
    if (isRangedWeapon) return choose(RANGED_TIERS, itemLevel, item.ID);

    const scores = statScores(item);
    if (itemLevel >= 54 && scores.caster > 0) {
        const healer = scores.healer > scores.damage
            || (scores.healer == scores.damage && item.ID % 4 == 0);
        return choose(healer ? HEALER_TIERS : CASTER_TIERS, itemLevel, item.ID);
    }
    return choose(MELEE_TIERS, itemLevel, item.ID);
}

function addNativeProc(item: any, effect: WeaponEffect): void {
    for (let i = 0; i < item.Spells.length; i++) {
        const itemSpell = item.Spells.get(i);
        if (Number(itemSpell.Spell.get()) > 0) continue;
        itemSpell.clear();
        itemSpell.Spell.set(DRIVER_IDS[effectKey(effect)]);
        itemSpell.Trigger.set(ON_EQUIP);
        itemSpell.Charges.set("UNLIMITED");
        return;
    }
    // The only stock weapons with all five slots occupied are Atiesh variants,
    // which already have their own five equip effects.
}

patch(CUSTOM_STATS_MODULE, () => {
    std.Items
        .filter(item => item.Class.getClass() == 2
            && Number(item.InventoryType.get()) > 0)
        .forEach(item => {
            if (!hasNativeProc(item)) addNativeProc(item, chooseForWeapon(item));
        });
});
