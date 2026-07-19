/**
 * Make every weapon & armor proficiency available to (and auto-learned by)
 * EVERY class and race, at the DBC level (SkillRaceClassInfo / SkillLineAbility).
 *
 * This is the clean fix for "any class can use any gear": the client and server
 * both read these tables, so equipping is allowed and the skills are legal for
 * the class (no more `_LoadSkills ... forbidden skill` pruning/spam). Runtime
 * SetSkill (livescripts/skills.ts) still tops up already-created characters.
 */

import { std } from "wow/wotlk";
import { HERO_CLASS } from "./hero_class";

const ALL_CLASSES = [
    "WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST",
    "DEATH_KNIGHT", "SHAMAN", "MAGE", "WARLOCK", "DRUID",
];
const ALL_RACES = [
    "HUMAN", "ORC", "DWARF", "NIGHTELF", "UNDEAD",
    "TAUREN", "GNOME", "TROLL", "BLOODELF", "DRAENEI",
];

const E = std.EquipSkills;
const EQUIP_SKILLS = [
    E.Maces1H, E.Maces2H, E.Daggers, E.Swords1H, E.Swords2H,
    E.Axes1H, E.Axes2H, E.Polearms, E.FistWeapons, E.Bows,
    E.Crossbows, E.Guns, E.Staves, E.Thrown, E.Wands,
    E.Shields, E.Cloth, E.Leather, E.Mail, E.Plate,
];

for (let i = 0; i < EQUIP_SKILLS.length; i++) {
    EQUIP_SKILLS[i].enableAutolearnClass(ALL_CLASSES as any, ALL_RACES as any, 1);
    EQUIP_SKILLS[i].enableAutolearnClass(HERO_CLASS.Mask as any, ALL_RACES as any, 1);
}

// Dual Wield is an equipment proficiency but has no named std.EquipSkills
// convenience property.
std.EquipSkills.load(118, 674).enableAutolearnClass(HERO_CLASS.Mask as any, ALL_RACES as any, 1);
