import { std } from "wow/wotlk";
import { SQL } from "wow/wotlk";

// Persistent, non-dispellable debuffs applied while hunger/thirst are empty.
// They stay until the player eats/drinks (the livescript removes them).
export const SURVIVAL_MODULE = "survival";
export const HUNGRY_SPELL_ID = "hungry";
export const THIRSTY_SPELL_ID = "thirsty";
export const STARVING_SPELL_ID = "starving";
export const DEHYDRATED_SPELL_ID = "dehydrated";

const VISIBLE_AURA_BASE = 34747;
const SLOW_PERCENT = -15;
const PRESSURE_MAX_STACKS = 2;
const HUNGER_PRESSURE_PERCENT = -8;
const THIRST_HASTE_PERCENT = -8;
const THIRST_REGEN_PERCENT = -20;
const STARVING_DAMAGE_PERCENT = -25;   // all damage done while starving
const STARVING_HEAL_PERCENT = -25;
const DEHYDRATED_REGEN_PERCENT = -50;  // mana regen while dehydrated
const DEHYDRATED_CAST_PERCENT = -25;   // casting speed while dehydrated
const DEHYDRATED_HASTE_PERCENT = -25;  // melee/ranged attack speed while dehydrated

const ALL_SCHOOLS = ["PHYSICAL", "HOLY", "FIRE", "NATURE", "FROST", "SHADOW", "ARCANE"];

function makeDebuff(id: string, enName: string, ruName: string, enDesc: string, ruDesc: string, icon: string, slowPercent: number = SLOW_PERCENT) {
    const spell = std.Spells.create(SURVIVAL_MODULE, id, VISIBLE_AURA_BASE);
    spell
        .Name.enGB.set(enName)
        .Name.ruRU.set(ruName)
        .Description.enGB.set(enDesc)
        .Description.ruRU.set(ruDesc)
        .AuraDescription.enGB.set(enDesc)
        .AuraDescription.ruRU.set(ruDesc)
        .Icon.setPath(icon);
    spell.Duration.setSimple(-1);          // permanent until removed by the livescript
    spell.DispelType.set("DISPEL_NONE");   // not dispellable
    spell.Attributes.IS_NEGATIVE.set(true);
    spell.Attributes.CANT_BE_CANCELED.set(true);
    spell.Attributes.IS_PASSIVE.set(false);
    spell.Attributes.HIDE_FROM_AURA_BAR.set(false);
    spell.Attributes.HIDE_AURA_IF_SELF_CAST.set(false);
    spell.Attributes.AURA_VISIBLE_TO_CASTER_ONLY.set(false);
    spell.SchoolMask.clearAll().Effects.clearAll();
    if (slowPercent != 0) {
        spell.Effects.addGet()
            .Type.APPLY_AURA.set()
            .Aura.MOD_DECREASE_SPEED.set()
            .ImplicitTargetA.UNIT_CASTER.set()
            .PercentBase.set(slowPercent);
    }
    return spell;
}

// Progressive pressure mirrors the existing UI thresholds. At zero these
// auras are removed and the stronger starvation/dehydration aura takes over.
const hungry = makeDebuff(
    HUNGRY_SPELL_ID,
    "Hungry", "Голод",
    "Hunger weakens you: damage and healing done reduced by 8% per stack.",
    "Голод ослабляет вас: наносимый урон и исцеление снижены на 8% за уровень.",
    "inv_misc_food_15", 0,
);
hungry.Stacks.set(PRESSURE_MAX_STACKS);
hungry.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_DAMAGE_PERCENT_DONE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .Schools.set(ALL_SCHOOLS as any)
    .PercentBase.set(HUNGER_PRESSURE_PERCENT);
hungry.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_HEALING_DONE_PERCENT.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .Schools.set(ALL_SCHOOLS as any)
    .PercentBase.set(HUNGER_PRESSURE_PERCENT);

const thirsty = makeDebuff(
    THIRSTY_SPELL_ID,
    "Thirsty", "Жажда",
    "Thirst slows attacks and spells by 8% and reduces mana regeneration by 20% per stack.",
    "Жажда замедляет атаки и заклинания на 8% и снижает восстановление маны на 20% за уровень.",
    "inv_drink_18", 0,
);
thirsty.Stacks.set(PRESSURE_MAX_STACKS);
thirsty.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_MELEE_RANGED_HASTE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(THIRST_HASTE_PERCENT);
thirsty.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_CASTING_SPEED_NOT_STACK.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(THIRST_HASTE_PERCENT);
thirsty.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_POWER_REGEN_PERCENT.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PowerType.MANA.set()
    .PowerPctBase.set(THIRST_REGEN_PERCENT);

// Starving: slow + all damage/healing done reduced (hunger = physical weakness)
const starving = makeDebuff(
    STARVING_SPELL_ID,
    "Starving", "Голодание",
    "You are starving: movement slowed by 15%, damage and healing done reduced by 25%. Eat something!",
    "Вы голодаете: скорость передвижения снижена на 15%, наносимый урон и исцеление — на 25%. Съешьте что-нибудь!",
    "inv_misc_bone_humanskull_01"
);
starving.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_DAMAGE_PERCENT_DONE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .Schools.set(ALL_SCHOOLS as any)
    .PercentBase.set(STARVING_DAMAGE_PERCENT);
starving.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_HEALING_DONE_PERCENT.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .Schools.set(ALL_SCHOOLS as any)
    .PercentBase.set(STARVING_HEAL_PERCENT);

// Dehydrated: attacks, spells and mana recovery are heavily impaired.
const dehydrated = makeDebuff(
    DEHYDRATED_SPELL_ID,
    "Dehydrated", "Иссушение",
    "You are dehydrated: attacks and spells slowed by 25%, mana regeneration reduced by 50%. Drink something!",
    "Вы обезвожены: атаки и заклинания замедлены на 25%, восстановление маны снижено на 50%. Выпейте что-нибудь!",
    "inv_drink_10", 0,
);
dehydrated.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_MELEE_RANGED_HASTE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(DEHYDRATED_HASTE_PERCENT);
dehydrated.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_POWER_REGEN_PERCENT.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PowerType.MANA.set()
    .PowerPctBase.set(DEHYDRATED_REGEN_PERCENT);
dehydrated.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_CASTING_SPEED_NOT_STACK.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(DEHYDRATED_CAST_PERCENT);

// Freezing: stacking cold debuff in cold zones (livescript manages stacks).
// Each stack slows by 4% (stacks multiply the effect); at 10 stacks the
// livescript drains health every tick.
export const FREEZING_SPELL_ID = "freezing";
const FREEZING_SLOW_PER_STACK = -4;
const FREEZING_MAX_STACKS = 10;

const freezing = makeDebuff(
    FREEZING_SPELL_ID,
    "Freezing", "Переохлаждение",
    "You are freezing: each stack slows movement by 4%. Warm up by a campfire, in a tavern or in warmer lands. At 10 stacks you take cold damage.",
    "Вы замерзаете: каждый уровень замедляет на 4%. Согрейтесь у костра, в таверне или в тёплых краях. На 10 уровнях холод наносит урон.",
    "spell_frost_frostarmor02",
    FREEZING_SLOW_PER_STACK
);
freezing.Stacks.set(FREEZING_MAX_STACKS);

// Well fed & watered: keep both bars high (>=75) for +5% all stats.
// The livescript refreshes the aura every survival tick (30s) while eligible.
export const WELL_FED_SPELL_ID = "well-fed";
const WELL_FED_STATS_PCT = 5;
const WELL_FED_DURATION_MS = 65000; // чуть больше двух тиков

const wellFed = std.Spells.create(SURVIVAL_MODULE, WELL_FED_SPELL_ID, VISIBLE_AURA_BASE);
wellFed
    .Name.enGB.set("Well Fed and Watered")
    .Name.ruRU.set("Сытый и довольный")
    .Description.enGB.set("Hunger and thirst are satisfied: all stats increased by 5%.")
    .Description.ruRU.set("Голод и жажда утолены: все характеристики увеличены на 5%.")
    .AuraDescription.enGB.set("All stats increased by 5%.")
    .AuraDescription.ruRU.set("Все характеристики увеличены на 5%.")
    .Icon.setPath("spell_misc_food");
wellFed.Duration.setSimple(WELL_FED_DURATION_MS);
wellFed.DispelType.set("DISPEL_NONE");
wellFed.Attributes.IS_NEGATIVE.set(false);
wellFed.Attributes.IS_PASSIVE.set(false);
wellFed.Attributes.HIDE_FROM_AURA_BAR.set(false);
wellFed.Attributes.HIDE_AURA_IF_SELF_CAST.set(false);
wellFed.Attributes.AURA_VISIBLE_TO_CASTER_ONLY.set(false);
wellFed.SchoolMask.clearAll().Effects.clearAll();
wellFed.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.MOD_TOTAL_STAT_PERCENTAGE.set()
    .ImplicitTargetA.UNIT_CASTER.set()
    .PercentBase.set(WELL_FED_STATS_PCT)
    .Stat.ALL.set();

// Travel campfire: expendable item, plants a real campfire (Basic Campfire GO)
// for 3 minutes anywhere — the counter to Freezing away from your base.
// Sold by the base innkeeper (7733); new characters start with a few.
export const CAMP_ITEM_TAG = "camp-item";
const CAMPFIRE_GO = 29784;        // Basic Campfire (spell focus «кулинарный огонь»)
const CAMP_SPELL_BASE = 818;      // Basic Campfire (cooking) — родная механика TRANS_DOOR
const CAMP_DURATION_MS = 180000;
const CAMP_ITEM_BASE = 6948;      // hearthstone item template

const campSpell = std.Spells.create(SURVIVAL_MODULE, "camp-spell", CAMP_SPELL_BASE);
campSpell
    .Name.enGB.set("Travel Campfire")
    .Name.ruRU.set("Походный костёр")
    .Description.enGB.set("Builds a campfire for 3 minutes. Its warmth removes Freezing.")
    .Description.ruRU.set("Разводит костёр на 3 минуты. Его тепло снимает «Переохлаждение».");
campSpell.Duration.setSimple(CAMP_DURATION_MS);
campSpell.Reagents.clearAll();
campSpell.row.RequiresSpellFocus.set(0);
campSpell.Effects.get(0).Type.TRANS_DOOR.set().GOTemplate.set(CAMPFIRE_GO);

const campItem = std.Items.create(SURVIVAL_MODULE, "camp-item", CAMP_ITEM_BASE);
campItem.Name.enGB.set("Travel Campfire");
campItem.Name.ruRU.set("Походный костёр");
campItem.Description.enGB.set("Use: build a campfire for 3 minutes (warmth removes Freezing).");
campItem.Description.ruRU.set("Использование: развести костёр на 3 минуты (тепло снимает «Переохлаждение»).");
campItem.Class.OTHER_MISC.set();
campItem.Quality.set(1);
campItem.Bonding.set(0);
campItem.MaxCount.set(0);
campItem.MaxStack.set(20);
campItem.Price.setAsSilver(5, 25, 1);
campItem.Spells.clearAll();
campItem.Spells.addMod(spell => {
    spell.Spell.set(campSpell.ID);
    spell.Trigger.set(0);
    spell.Charges.set(1, "DELETE_ITEM"); // расходуется по 1 из стака
    spell.Cooldown.set(10000);
    spell.CategoryCooldown.set(-1);
});
campItem.Tags.addUnique(SURVIVAL_MODULE, CAMP_ITEM_TAG);

// продаётся у трактирщика базы (base-building key 63, Innkeeper Fizzgrimble)
SQL.npc_vendor.add(7733, campItem.ID, 0);

// Cooking: beasts drop "Свежее мясо" (livescript loot hook); clicking the base
// cauldron with meat cooks it into "Сытная похлёбка" — carryable food that
// fully restores hunger (SpellLevel 80 → restoreForSpell ratio >= 1 at any level).
const MEAT_BASE_ITEM = 2672; // Stringy Wolf Meat
const STEW_BASE_ITEM = 117;  // Tough Jerky (обычная еда)
const FOOD_SPELL_BASE = 433; // "Food" (аура 84 — survival видит её как еду)

const meatItem = std.Items.create(SURVIVAL_MODULE, "raw-meat", MEAT_BASE_ITEM);
meatItem.Name.enGB.set("Fresh Meat");
meatItem.Name.ruRU.set("Свежее мясо");
meatItem.Description.enGB.set("Raw. Cook it in your base cauldron into a hearty stew.");
meatItem.Description.ruRU.set("Сырое. Сварите в котле на базе — получится сытная похлёбка.");
meatItem.Quality.set(1);
meatItem.Bonding.set(0);
meatItem.MaxCount.set(0);
meatItem.MaxStack.set(20);
meatItem.Price.setAsCopper(50, 200, 1);
meatItem.Spells.clearAll(); // есть сырым нельзя
meatItem.Tags.addUnique(SURVIVAL_MODULE, "raw-meat");

const stewSpell = std.Spells.create(SURVIVAL_MODULE, "stew-spell", FOOD_SPELL_BASE);
stewSpell.Name.enGB.set("Hearty Stew");
stewSpell.Name.ruRU.set("Сытная похлёбка");
stewSpell.row.SpellLevel.set(80);
stewSpell.row.BaseLevel.set(80);

const stewItem = std.Items.create(SURVIVAL_MODULE, "stew-item", STEW_BASE_ITEM);
stewItem.Name.enGB.set("Hearty Stew");
stewItem.Name.ruRU.set("Сытная похлёбка");
stewItem.Description.enGB.set("Home cooking: fully restores satiety at any level.");
stewItem.Description.ruRU.set("Домашняя стряпня: полностью восстанавливает сытость на любом уровне.");
stewItem.Quality.set(1);
stewItem.Bonding.set(0);
stewItem.MaxCount.set(0);
stewItem.MaxStack.set(20);
stewItem.Price.setAsCopper(100, 400, 1);
stewItem.Spells.clearAll();
stewItem.Spells.addMod(spell => {
    spell.Spell.set(stewSpell.ID);
    spell.Trigger.set(0);
    spell.Charges.set(1, "DELETE_ITEM");
    spell.Cooldown.set(1000);
    spell.CategoryCooldown.set(-1);
});
stewItem.Tags.addUnique(SURVIVAL_MODULE, "stew-item");
