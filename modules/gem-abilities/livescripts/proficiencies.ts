/**
 * Give every class the proficiency to wear all armor and use all weapons.
 *
 * Equipping armor/weapons is gated by the player's known proficiency spells
 * (passives like "Plate Mail", "Two-Handed Swords"). We teach the full set on
 * login (after class spells are stripped) so any class can equip anything.
 */

// All armor + weapon proficiency spell ids (3.3.5), plus Dual Wield.
export const PROFICIENCIES: number[] = [
    // armor
    9078,  // Cloth
    9077,  // Leather
    8737,  // Mail
    750,   // Plate Mail
    9116,  // Shield
    // dual wield
    674,   // Dual Wield
    // melee weapons
    1180,  // Daggers
    201,   // One-Handed Swords
    202,   // Two-Handed Swords
    196,   // One-Handed Axes
    197,   // Two-Handed Axes
    198,   // One-Handed Maces
    199,   // Two-Handed Maces
    200,   // Polearms
    227,   // Staves
    15590, // Fist Weapons
    // ranged / thrown
    264,   // Bows
    5011,  // Crossbows
    266,   // Guns
    5009,  // Wands
    2567,  // Thrown
];

export function grantAllProficiencies(player: TSPlayer): void {
    for (let i = 0; i < PROFICIENCIES.length; i++) {
        if (!player.HasSpell(PROFICIENCIES[i])) {
            player.LearnSpell(PROFICIENCIES[i]);
        }
    }
}
