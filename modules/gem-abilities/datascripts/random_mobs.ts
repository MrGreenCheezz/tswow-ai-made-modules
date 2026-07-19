import { std } from "wow/wotlk";
import { GEM_MODULE } from "./pool_data";

/** Static data for the field-enemy randomizer. Runtime selection lives in
 * livescripts/random_mobs.ts; these records remain rebuildable module data. */

export const RANDOM_MOB_PROC_TAG = "spell/random-mob-damage-proc";
export const OVERLOADED_AURA_TAG = "spell/random-mob-overloaded";
export const ESCAPED_LOOT_CREATURE_TAG = "npc/escaped-loot";

// Keep this in sync with shared/RandomMobRules.ts. It is deliberately a
// separate tuning knob from the 25% chance that a creature receives an aura.
export const RANDOM_MOB_PROC_CHANCE_PERCENT = 25;

const PROC_DRIVER_BASE = 11069;
// DONE_* hit events, including direct, spell, ranged and periodic damage.
const PROC_DONE_HIT_MASK = 0x00e55554;
const PROC_TYPE_DAMAGE = 0x00000001;
const PROC_PHASE_HIT = 0x00000002;
const ALL_SCHOOLS = [
    "PHYSICAL", "HOLY", "FIRE", "NATURE", "FROST", "SHADOW", "ARCANE",
];

/** One native proc driver per ability-gem spell. The runtime only chooses
 * drivers whose payload passes its conservative creature-cast safety filter. */
export function createRandomMobProcAura(payloadSpellId: number, englishName?: string): number {
    const payload = std.Spells.load(payloadSpellId);
    const enName = englishName || payload.Name.enGB.get() || "Spell " + payloadSpellId;
    const ruName = payload.Name.ruRU.get() || enName;
    const enDescription = "Any damage dealt has a "
        + RANDOM_MOB_PROC_CHANCE_PERCENT + "% chance to trigger " + enName + ".";
    const ruDescription = "Любой нанесённый урон с вероятностью "
        + RANDOM_MOB_PROC_CHANCE_PERCENT + "% вызывает эффект «" + ruName + "».";

    const driver = std.Spells.create(
        GEM_MODULE,
        "random-mob-proc-" + payloadSpellId,
        PROC_DRIVER_BASE,
        false,
    );
    driver.Family.set(0);
    driver.Power.setMana(0, 0);
    driver.CastTime.setSimple(0, 0, 0);
    driver.Range.setSimple(0, 0);
    driver.Duration.setSimple(-1);
    driver.Levels.set(0, 0, 0);
    driver.DispelType.set("DISPEL_NONE");
    driver.row.ShapeshiftMask.set(BigInt(0));
    driver.row.ShapeshiftExclude.set(BigInt(0));
    driver.Attributes.clearAll();
    driver.Attributes.IS_HIDDEN_IN_SPELLBOOK.set(true);
    driver.Attributes.CANT_BE_CANCELED.set(true);
    driver.Attributes.NOT_STEALABLE.set(true);
    driver.Attributes.NO_THREAT.set(true);
    driver.Attributes.HIDE_FROM_AURA_BAR.set(false);
    driver.Name.enGB.set("Unstable: " + enName);
    driver.Name.ruRU.set("Нестабильность: " + ruName);
    driver.Description.enGB.set(enDescription);
    driver.Description.ruRU.set(ruDescription);
    driver.AuraDescription.enGB.set(enDescription);
    driver.AuraDescription.ruRU.set(ruDescription);
    driver.Icon.set(payload.Icon.get());
    driver.SchoolMask.clearAll();
    driver.Effects.clearAll();
    driver.Effects.addGet()
        .Type.APPLY_AURA.set()
        .Aura.PROC_TRIGGER_SPELL.set()
        .ImplicitTargetA.UNIT_CASTER.set()
        .TriggeredSpell.set(payloadSpellId);
    driver.Proc.mod(proc => {
        // DBC-backed values are written before SQL-backed values create the
        // spell_proc row, matching the working custom-stats proc pattern.
        (proc.TriggerMask as any).set(PROC_DONE_HIT_MASK);
        proc.Chance.set(RANDOM_MOB_PROC_CHANCE_PERCENT);
        proc.Charges.set(0);
        proc.SchoolMask.clearAll();
        proc.SpellFamily.set(0);
        proc.ClassMask.A.clearAll();
        proc.ClassMask.B.clearAll();
        proc.ClassMask.C.clearAll();
        (proc.TypeMask as any).set(PROC_TYPE_DAMAGE);
        (proc.PhaseMask as any).set(PROC_PHASE_HIT);
        proc.HitMask.clearAll();
        proc.AttributesMask.clearAll();
        proc.DisableEffectsMask.clearAll();
        proc.ProcsPerMinute.set(0);
    });
    // CAN_PROC_WITH_TRIGGERED intentionally remains false: a payload cannot
    // recursively trigger this or the second Franken-rare driver.
    driver.Tags.add(GEM_MODULE, RANDOM_MOB_PROC_TAG);
    return driver.ID;
}

/** 300% total attack speed and damage means +200% over the normal baseline. */
const overloaded = std.Spells.create(
    GEM_MODULE,
    "random-mob-overloaded",
    PROC_DRIVER_BASE,
    false,
);
overloaded.Family.set(0);
overloaded.Power.setMana(0, 0);
overloaded.CastTime.setSimple(0, 0, 0);
overloaded.Range.setSimple(0, 0);
overloaded.Duration.setSimple(-1);
overloaded.Levels.set(0, 0, 0);
overloaded.DispelType.set("DISPEL_NONE");
overloaded.Attributes.clearAll();
overloaded.Attributes.IS_HIDDEN_IN_SPELLBOOK.set(true);
overloaded.Attributes.CANT_BE_CANCELED.set(true);
overloaded.Attributes.NOT_STEALABLE.set(true);
overloaded.Attributes.NO_THREAT.set(true);
overloaded.Attributes.HIDE_FROM_AURA_BAR.set(false);
overloaded.Name.enGB.set("Catastrophically Overloaded");
overloaded.Name.ruRU.set("Катастрофическая перегрузка");
overloaded.Description.enGB.set(
    "Attack speed and damage are 300% of normal. Defeating this enemy triples its rewards.",
);
overloaded.Description.ruRU.set(
    "Скорость атаки и урон составляют 300% от нормы. Победа утраивает награду.",
);
overloaded.AuraDescription.enGB.set(
    "300% attack speed and damage; rewards are tripled.",
);
overloaded.AuraDescription.ruRU.set(
    "300% скорости атаки и урона; награда утроена.",
);
overloaded.Icon.setPath("spell_nature_bloodlust");
overloaded.SchoolMask.clearAll();
overloaded.Effects.clearAll();
overloaded.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_MELEE_RANGED_HASTE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(200);
overloaded.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_DAMAGE_PERCENT_DONE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .Schools.set(ALL_SCHOOLS as any)
    .PercentBase.set(200);
overloaded.Tags.addUnique(GEM_MODULE, OVERLOADED_AURA_TAG);

/** A hostile, catchable goblin whose corpse is filled by the livescript. */
const escapedLoot = std.CreatureTemplates.create(
    GEM_MODULE,
    "escaped-loot",
    3391, // Gazlowe: stable goblin model in the 3.3.5 client
);
escapedLoot.Name.enGB.set("Escaped Loot");
escapedLoot.Name.ruRU.set("Сбежавшая добыча");
escapedLoot.Subname.enGB.set("Catch it before it disappears!");
escapedLoot.Subname.ruRU.set("Поймайте, пока не исчезло!");
escapedLoot.NPCFlags.clearAll();
escapedLoot.UnitFlags.clearAll();
escapedLoot.FlagsExtra.clearAll();
escapedLoot.FlagsExtra.NO_XP.set(true);
escapedLoot.Difficulty.Heroic5Man.set(0);
escapedLoot.Difficulty.Heroic10Man.set(0);
escapedLoot.Difficulty.Heroic25Man.set(0);
escapedLoot.FactionTemplate.set(14);
escapedLoot.AIName.set("");
escapedLoot.row.ScriptName.set("");
escapedLoot.row.lootid.set(0);
escapedLoot.row.pickpocketloot.set(0);
escapedLoot.row.skinloot.set(0);
escapedLoot.row.mingold.set(0);
escapedLoot.row.maxgold.set(0);
escapedLoot.Level.set(1, 80);
escapedLoot.Stats.set(0.35, 0.1, 0.5, 0.1, 0);
escapedLoot.Tags.addUnique(GEM_MODULE, ESCAPED_LOOT_CREATURE_TAG);
