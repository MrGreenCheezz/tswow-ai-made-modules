/**
 * Fallback class ability pool for starter, quest and active talent spells that
 * may have no trainer_spell row. gems.ts also scans all class trainers.
 *
 * NOTE: this list is DUPLICATED in livescripts/pool_data.ts — keep the two in
 * sync (datascripts and livescripts are separate TS projects and cannot import
 * each other). To scale toward "every spell", replace this list with a
 * std.Spells.filter(...) generation loop in gems.ts (see the note there) — be
 * aware of the huge build/client-cache cost.
 */

export const GEM_MODULE = "gem-abilities";

export const ABILITY_POOL: number[] = [
    // mage
    133,   // Fireball
    116,   // Frostbolt
    2136,  // Fire Blast
    5143,  // Arcane Missiles
    168,   // Frost Armor
    11426, // Ice Barrier
    11113, // Blast Wave
    11366, // Pyroblast
    31661, // Dragon's Breath
    34913, // Molten Armor
    44457, // Living Bomb
    44425, // Arcane Barrage
    // warlock
    686,   // Shadow Bolt
    172,   // Corruption
    348,   // Immolate
    687,   // Demon Skin
    18220, // Dark Pact
    30108, // Unstable Affliction
    48181, // Haunt
    17877, // Shadowburn
    30283, // Shadowfury
    50796, // Chaos Bolt
    // warrior
    12294, // Mortal Strike
    5308,  // Execute
    1715,  // Hamstring
    772,   // Rend
    78,    // Heroic Strike
    20243, // Devastate
    // rogue
    1752,  // Sinister Strike
    2098,  // Eviscerate
    1329,  // Mutilate
    16511, // Hemorrhage
    // shaman
    403,   // Lightning Bolt
    421,   // Chain Lightning
    8050,  // Flame Shock
    331,   // Healing Wave
    8071,  // Stoneskin Totem
    5394,  // Healing Stream Totem
    974,   // Earth Shield
    61295, // Riptide
    3599,  // Searing Totem
    30706, // Totem of Wrath
    51490, // Thunderstorm
    // paladin
    635,   // Holy Light
    20271, // Judgement of Light
    35395, // Crusader Strike
    7328,  // Redemption
    20473, // Holy Shock
    20925, // Holy Shield
    31935, // Avenger's Shield
    // hunter
    3044,  // Arcane Shot
    56641, // Steady Shot
    2973,  // Raptor Strike
    19386, // Wyvern Sting
    19306, // Counterattack
    13797, // Immolation Trap
    19434, // Aimed Shot
    53301, // Explosive Shot
    60202, // Freezing Arrow
    3674,  // Black Arrow
    // druid
    5176,  // Wrath
    8921,  // Moonfire
    774,   // Rejuvenation
    5185,  // Healing Touch
    6807,  // Maul
    33878, // Mangle (Bear)
    33876, // Mangle (Cat)
    48438, // Wild Growth
    5570,  // Insect Swarm
    48505, // Starfall
    50516, // Typhoon
    // priest
    585,   // Smite
    2061,  // Flash Heal
    589,   // Shadow Word: Pain
    2050,  // Lesser Heal
    19236, // Desperate Prayer
    724,   // Lightwell
    34861, // Circle of Healing
    15407, // Mind Flay
    34914, // Vampiric Touch
    47540, // Penance
    // death knight
    45477, // Icy Touch
    45462, // Plague Strike
    47541, // Death Coil
    49576, // Death Grip
    45902, // Blood Strike
    55050, // Heart Strike
    49143, // Frost Strike
    49184, // Howling Blast
    55090, // Scourge Strike
];
