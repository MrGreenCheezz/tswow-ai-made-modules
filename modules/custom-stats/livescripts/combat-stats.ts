/** Vampirism and Thorns using normal combat-log packets. */

import { thornsPct, vampirismPct } from "../shared/StatFormula";
import { getStats } from "./stat-store";

let VAMPIRISM_HEAL_SPELL = 0;
let THORNS_REFLECT_SPELL = 0;
let PERIODIC_TRACKER_SPELL = 0;

export function initCombatStatSpells(): void {
    VAMPIRISM_HEAL_SPELL = GetID("Spell", "custom-stats", "vampirism-heal");
    THORNS_REFLECT_SPELL = GetID("Spell", "custom-stats", "thorns-reflect");
    PERIODIC_TRACKER_SPELL = GetID("Spell", "custom-stats", "periodic-damage-tracker");
}

export function periodicTrackerSpellId(): number {
    return PERIODIC_TRACKER_SPELL;
}

export function ensurePeriodicTracker(player: TSPlayer): void {
    if (PERIODIC_TRACKER_SPELL > 0 && !player.HasAura(PERIODIC_TRACKER_SPELL)) {
        player.CastSpell(player, PERIODIC_TRACKER_SPELL, true);
    }
}

export function isInternalCombatSpell(spellId: number): boolean {
    return spellId == VAMPIRISM_HEAL_SPELL || spellId == THORNS_REFLECT_SPELL;
}

function applyVampirism(attacker: TSUnit, damage: number): void {
    if (!attacker.IsPlayer() || !attacker.IsAlive()) return;
    const player = attacker.ToPlayer();
    if (!player) return;
    const totals = getStats(player);
    if (totals.internalEffect) return;
    const amount = Math.floor(damage * vampirismPct(totals.vampirism, Number(player.GetLevel())) / 100);
    if (amount <= 0) return;

    totals.internalEffect = true;
    player.CastCustomSpell(player, VAMPIRISM_HEAL_SPELL, true, amount, 0, 0);
    totals.internalEffect = false;
}

function applyThorns(attacker: TSUnit, victim: TSUnit, damage: number): void {
    if (!victim.IsPlayer() || !victim.IsAlive() || !attacker.IsAlive()) return;
    const player = victim.ToPlayer();
    if (!player) return;
    const totals = getStats(player);
    if (totals.internalEffect) return;
    const amount = Math.floor(damage * thornsPct(totals.thorns, Number(player.GetLevel())) / 100);
    if (amount <= 0) return;

    totals.internalEffect = true;
    player.CastCustomSpell(attacker, THORNS_REFLECT_SPELL, true, amount, 0, 0);
    totals.internalEffect = false;
}

function onDamage(attacker: TSUnit | undefined, victim: TSUnit | undefined, damage: number, spellId: number): void {
    if (!attacker || !victim || damage <= 0) return;
    if (attacker.GetGUIDLow() == victim.GetGUIDLow() && attacker.GetEntry() == victim.GetEntry()) return;
    if (isInternalCombatSpell(spellId)) return;
    applyVampirism(attacker, damage);
    applyThorns(attacker, victim, damage);
}

function sameUnit(left: TSUnit, right: TSUnit): boolean {
    return left.GetGUIDLow() == right.GetGUIDLow() && left.GetEntry() == right.GetEntry();
}

function periodicSpellId(info: TSDamageInfo): number {
    return Number(info.GetSpellInfo().GetEntry());
}

export function RegisterCombatStats(events: TSEvents): void {
    events.Unit.OnMeleeDamageLate((info, damage, type, index) => {
        // Trinity fires once for each of the two weapon damage components.
        // On index 1 both components have completed mitigation, so emit one
        // combined stat event instead of two rounded heals/reflections.
        if (Number(index) != 1) return;
        const total = Number(info.GetDamage1()) + Number(info.GetDamage2());
        onDamage(info.GetAttacker(), info.GetTarget(), total, 0);
    });
    events.Spell.OnDamageLate((spell, damage, info, type, isCrit, effectMask) => {
        onDamage(info.GetAttacker(), info.GetTarget(), Number(damage.get()), Number(info.GetSpellID()));
    });
    events.Spell.OnProc(PERIODIC_TRACKER_SPELL, (application, proc, handled, cancel) => {
        const owner = application.GetTarget();
        const info = proc.GetDamageInfo();
        const attacker = info.GetAttacker();
        const victim = info.GetVictim();
        const damage = Number(info.GetDamage());
        const spellId = periodicSpellId(info);
        if (damage > 0 && !isInternalCombatSpell(spellId)) {
            // The same PvP tick procs one tracker on each player. Process only
            // the side owned by this aura so neither stat is applied twice.
            const validAttacker = !!attacker && !attacker.IsNull();
            const validVictim = !!victim && !victim.IsNull();
            if (validAttacker && sameUnit(owner, attacker)) applyVampirism(attacker, damage);
            if (validAttacker && validVictim && sameUnit(owner, victim)) applyThorns(attacker, victim, damage);
        }
        handled.set(true);
    });
}
