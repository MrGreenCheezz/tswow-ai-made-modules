/**
 * Universal attribute effects for all classes (shown in the character sheet):
 *   Strength  -> increases maximum health
 *   Agility   -> increases melee/ranged attack speed and cast speed (haste %)
 *   Intellect -> increases Spell Power (spell damage) and healing power
 *
 * Agility haste and Intellect spell power are applied through hidden auras
 * (agi-haste-aura, int-spellpower-aura) reapplied on login / equip / timer,
 * with their magnitude overridden from the current stat via CastCustomSpell.
 * Strength is applied in the max-health calc hook.
 */

const STAT_STRENGTH = 0;
const STAT_AGILITY = 1;
const STAT_INTELLECT = 3;

// tuning knobs
const STR_HEALTH_PER_POINT = 10;    // +HP per Strength
const AGI_HASTE_PER_POINT = 0.05;   // +% haste per Agility
const AGI_HASTE_CAP = 50;           // max % haste from Agility
const INT_POWER_PER_POINT = 1;      // +spell power (and healing) per Intellect

let AGI_HASTE_SPELL = 0;
let INT_POWER_SPELL = 0;

export function initAttributeSpells(): void {
    AGI_HASTE_SPELL = GetID("Spell", "attributes", "agi-haste-aura");
    INT_POWER_SPELL = GetID("Spell", "attributes", "int-spellpower-aura");
}

function agiHastePct(player: TSPlayer): number {
    const pct = player.GetStat(STAT_AGILITY) * AGI_HASTE_PER_POINT;
    return pct > AGI_HASTE_CAP ? AGI_HASTE_CAP : pct;
}

function applyAttributeAuras(player: TSPlayer): void {
    if (AGI_HASTE_SPELL != 0) {
        player.RemoveAura(AGI_HASTE_SPELL);
        const pct = Math.floor(agiHastePct(player));
        if (pct > 0) {
            player.CastCustomSpell(player, AGI_HASTE_SPELL, true, pct, pct, 0);
        }
    }
    if (INT_POWER_SPELL != 0) {
        player.RemoveAura(INT_POWER_SPELL);
        const sp = Math.floor(player.GetStat(STAT_INTELLECT) * INT_POWER_PER_POINT);
        if (sp > 0) {
            player.CastCustomSpell(player, INT_POWER_SPELL, true, sp, sp, 0);
        }
    }
}

export function RegisterAttributes(events: TSEvents): void {
    // Strength -> max health
    events.Player.OnUpdateMaxHealth((player, health) => {
        health.set(health.get() + player.GetStat(STAT_STRENGTH) * STR_HEALTH_PER_POINT);
    });

    // Agility (haste) + Intellect (spell power): (re)apply as stats/gear change
    events.Player.OnLogin((player, firstLogin) => {
        applyAttributeAuras(player);
        player.AddTimer(3000, 0x0fffffff, (owner, timer) => {
            applyAttributeAuras(player);
        });
    });
    events.Item.OnEquip((item, player, slot, isMerge) => {
        applyAttributeAuras(player);
    });
}
