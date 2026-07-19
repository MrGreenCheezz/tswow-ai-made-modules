/**
 * Give every class all weapon & armor skill lines, so both the client and the
 * server treat any class as able to use any gear. Proficiency spells alone
 * aren't enough — the client also checks the actual skill lines before it will
 * even send an equip request.
 */

// SkillLine.dbc ids for every weapon and armor proficiency.
export const WEAPON_ARMOR_SKILLS: number[] = [
    // weapons
    43,  // Swords (one-handed)
    44,  // Axes (one-handed)
    45,  // Bows
    46,  // Guns
    54,  // Maces (one-handed)
    55,  // Two-Handed Swords
    136, // Staves
    160, // Two-Handed Maces
    162, // Unarmed
    172, // Two-Handed Axes
    173, // Daggers
    176, // Thrown
    226, // Crossbows
    228, // Wands
    229, // Polearms
    473, // Fist Weapons
    // armor
    293, // Plate Mail
    413, // Cloth
    414, // Leather
    415, // Mail
    433, // Shield
];

export function grantAllSkills(player: TSPlayer): void {
    const max = 5 * player.GetLevel();
    const val = max > 5 ? max : 5;
    for (let i = 0; i < WEAPON_ARMOR_SKILLS.length; i++) {
        // step 1, current = max = val; idempotent, overwrites low/missing skills
        player.SetSkill(WEAPON_ARMOR_SKILLS[i], 1, val, val);
    }
}
