import { std } from "wow/wotlk";

// Hidden haste aura driven by Agility. Two APPLY_AURA effects whose percent is
// overridden at cast time via CastCustomSpell(bp0, bp1):
//   effect 0: MOD_MELEE_RANGED_HASTE      -> melee + ranged attack speed
//   effect 1: MOD_CASTING_SPEED_NOT_STACK -> cast speed + spell GCD
export const ATTR_MODULE = "attributes";
export const AGI_HASTE_SPELL_ID = "agi-haste-aura";

const AGI_HASTE = std.Spells.create(ATTR_MODULE, AGI_HASTE_SPELL_ID, 11069);
AGI_HASTE
    .Name.enGB.set("Agility Haste")
    .Name.ruRU.set("Скорость от ловкости")
    .Icon.setPath("ability_rogue_quickrecovery");
AGI_HASTE.Duration.setSimple(-1);
AGI_HASTE
    .SchoolMask.clearAll()
    .Effects.clearAll();
AGI_HASTE.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_MELEE_RANGED_HASTE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(0);
AGI_HASTE.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_CASTING_SPEED_NOT_STACK.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(0);

// Hidden Spell Power aura driven by Intellect. Overridden at cast time:
//   effect 0: MOD_DAMAGE_DONE (all magic schools) -> spell power (dmg)
//   effect 1: MOD_HEALING_DONE                     -> healing power
export const INT_POWER_SPELL_ID = "int-spellpower-aura";
const MAGIC_SCHOOLS = ["HOLY", "FIRE", "NATURE", "FROST", "SHADOW", "ARCANE"];

const INT_POWER = std.Spells.create(ATTR_MODULE, INT_POWER_SPELL_ID, 11069);
INT_POWER
    .Name.enGB.set("Intellect Power")
    .Name.ruRU.set("Сила заклинаний от интеллекта")
    .Icon.setPath("spell_holy_magicalsentry");
INT_POWER.Duration.setSimple(-1);
INT_POWER
    .SchoolMask.clearAll()
    .Effects.clearAll();
INT_POWER.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_DAMAGE_DONE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .School.set(MAGIC_SCHOOLS as any)
    .DamagePctBase.set(0);
INT_POWER.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_HEALING_DONE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .Schools.set(MAGIC_SCHOOLS as any)
    .PointsBase.set(0);
