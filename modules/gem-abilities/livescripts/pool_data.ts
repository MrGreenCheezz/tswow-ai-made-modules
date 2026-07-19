/**
 * Fallback class ability pool — MUST stay identical to
 * datascripts/pool_data.ts.
 * (datascripts and livescripts are separate TS projects and can't share files.)
 */

export const GEM_MODULE = "gem-abilities";

export const ABILITY_POOL: number[] = [
    133, 116, 2136, 5143, 168, 11426, 11113, 11366, 31661, 34913, 44457, 44425, // mage
    686, 172, 348, 687, 18220, 30108, 48181, 17877, 30283, 50796,              // warlock
    12294, 5308, 1715, 772, 78, 20243,             // warrior
    1752, 2098, 1329, 16511,                       // rogue
    403, 421, 8050, 331, 8071, 5394, 974, 61295, 3599, 30706, 51490,          // shaman
    635, 20271, 35395, 7328, 20473, 20925, 31935,                            // paladin
    3044, 56641, 2973, 19386, 19306, 13797, 19434, 53301, 60202, 3674,       // hunter
    5176, 8921, 774, 5185, 6807, 33878, 33876, 48438, 5570, 48505, 50516,    // druid
    585, 2061, 589, 2050, 19236, 724, 34861, 15407, 34914, 47540,           // priest
    45477, 45462, 47541, 49576, 45902, 55050, 49143, 49184, 55090,          // death knight
];
