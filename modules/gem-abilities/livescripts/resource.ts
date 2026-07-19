/**
 * Resource handling.
 *
 * Most classes are converted to mana (unified resource). Death Knight is a
 * special case: the 3.3.5 client hardcodes its rune/runic-power bar and cannot
 * show mana, so DK keeps its native runic-power bar as the visible resource and
 * pays for gem abilities from a HIDDEN mana pool that we keep topped up. Its
 * runic power is drained cosmetically on cast and regenerated on the timer, so
 * the visible bar still reacts to casting.
 */

const CLASS_DK = 6;
const RUNIC_COST_PER_CAST = 100; // internal units drained per DK cast
const RUNIC_REGEN_PER_TICK = 60; // internal units restored per recompute tick

function manaPool(player: TSPlayer): number {
    return 500 + player.GetLevel() * 150;
}

export function applyManaResource(player: TSPlayer): void {
    const mana = manaPool(player);
    if (player.GetClass() == CLASS_DK) {
        // keep the native runic-power bar; give a hidden mana pool for casts
        player.SetMaxPower(Powers.MANA, mana);
        player.SetPower(Powers.MANA, mana);
        return;
    }
    player.SetPowerType(Powers.MANA);
    player.SetMaxPower(Powers.MANA, mana);
    player.SetPower(Powers.MANA, mana);
}

/** Keep DK's hidden mana full (so abilities never block) and regen its bar. */
export function tickDeathKnight(player: TSPlayer): void {
    if (player.GetClass() != CLASS_DK) {
        return;
    }
    player.SetPower(Powers.MANA, manaPool(player));
    const rp = player.GetPower(Powers.RUNIC_POWER);
    player.SetPower(Powers.RUNIC_POWER, rp + RUNIC_REGEN_PER_TICK); // SetPower clamps to max
}

/** Cosmetic runic-power drain so the visible bar reacts when a DK casts. */
export function drainDeathKnightOnCast(player: TSPlayer): void {
    if (player.GetClass() != CLASS_DK) {
        return;
    }
    const rp = player.GetPower(Powers.RUNIC_POWER);
    player.SetPower(Powers.RUNIC_POWER, rp > RUNIC_COST_PER_CAST ? rp - RUNIC_COST_PER_CAST : 0);
}
