/**
 * Remove all class abilities on login; only auto-attack (and a few essential
 * non-combat spells) survive. Everything else must come from gems.
 *
 * WARNING: the whitelist must keep riding/languages/basics or characters break.
 */

import { PROFICIENCIES } from "./proficiencies";

export const AUTO_SHOT_SPELL = 75;

// auto-attack, basic actions, languages, riding — never removed
const WHITELIST: number[] = [
    6603,  // Attack (auto-attack)
    AUTO_SHOT_SPELL, // Auto Shot (ranged auto-attack)
    3365,  // Opening
    6233,  // Closing (chest)
    6247, 6246, 6461, 61437, // open/pick basics
    // languages
    668, 669, 670, 671, 672, 813, 814, 815, 816, 817, 7340, 7341, 17737,
    // riding
    33388, 33389, 34090, 34091,
    // swimming/defense basics
    3050, 8737, 9077, 9078, 9116, 674,
];

// SharedDefines.h: торговые эффекты — такие спеллы НЕ трогаем (профессии,
// ранги профессий и все рецепты, включая ~23k сгенерированных craft-all;
// иначе стрип снимал их при каждом логине до первого скиллапа)
const EFFECT_CREATE_ITEM = 24;
const EFFECT_TRADE_SKILL = 47;
const EFFECT_SKILL = 118;

function isTradeSpell(spellId: number): boolean {
    const info = GetSpellInfo(spellId);
    if (!info) return false;
    for (let i = 0; i < 3; i++) {
        const t = Number(info.GetEffect(i as any).GetType());
        if (t == EFFECT_CREATE_ITEM || t == EFFECT_TRADE_SKILL || t == EFFECT_SKILL) return true;
    }
    return false;
}

function whitelisted(spell: number): boolean {
    for (let i = 0; i < WHITELIST.length; i++) {
        if (WHITELIST[i] === spell) return true;
    }
    for (let i = 0; i < PROFICIENCIES.length; i++) {
        if (PROFICIENCIES[i] === spell) return true;
    }
    return isTradeSpell(spell);
}

export function stripClassSpells(player: TSPlayer): void {
    const spellMap = player.GetSpellMap();
    const toRemove: number[] = [];
    // In the lua backend the dictionary's methods (.forEach) are nil, but it is
    // a plain lua table — iterate its keys (spell ids) with for...in (pairs).
    for (const key in spellMap) {
        const spellId = Number(key);
        if (spellId > 0 && !whitelisted(spellId)) {
            toRemove.push(spellId);
        }
    }
    for (let i = 0; i < toRemove.length; i++) {
        player.RemoveSpell(toRemove[i], false, false);
    }
}
