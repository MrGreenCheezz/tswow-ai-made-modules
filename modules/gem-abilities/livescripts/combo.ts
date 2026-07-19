/**
 * Player-bound combo sequence for ability gems.
 *
 * The visible aura is the only persistent source of truth. Its stacks are
 * mirrored into Trinity's target-bound counter only as a compatibility layer
 * for client cast checks and stock finisher formulas. Native combo generators
 * are suppressed only for gem casts, leaving creatures/NPCBots untouched.
 */

import {
    COMBO_MAX_STACKS,
    gainComboPoint,
    restoreComboPoints,
} from "../shared/ComboSequence";
import { isGrantedAbility } from "./grant";

// TAG/UTAG are build macros: their arguments must remain string literals.
const COMBO_AURA_ID = UTAG("gem-abilities", "spell/player-combo-sequence");
const FINISHER_SPELLS: number[] = TAG("gem-abilities", "spell/player-combo-finisher");
const FINISHER_TIMEOUT_MS = 5000;
const FINISHER_TIMER = "gem-abilities:combo-finisher-fallback";
const TARGET_SYNC_TIMER = "gem-abilities:combo-target-sync";
const MIRROR_RECONCILE_TIMER = "gem-abilities:combo-mirror-reconcile";
const MIRROR_RECONCILE_MS = 500;
const EFF_ADD_COMBO_POINTS = 80;

const finisherBySpell: { [spellId: number]: boolean } = {};
for (let i = 0; i < FINISHER_SPELLS.length; i++) {
    finisherBySpell[FINISHER_SPELLS[i]] = true;
}

class PendingFinisher {
    spellId: uint32 = 0;
    reserved: uint8 = 0;
    sawHit: boolean = false;
}

function pendingFinisher(player: TSPlayer): PendingFinisher {
    const state = player.GetObject("gemAbilityPendingFinisher", new PendingFinisher());
    // Repair online player object data after a livescript reload.
    if (state.spellId === undefined) state.spellId = 0;
    if (state.reserved === undefined) state.reserved = 0;
    if (state.sawHit === undefined) state.sawHit = false;
    return state;
}

function playerCaster(spell: TSSpell): TSPlayer | undefined {
    const caster = spell.GetCaster();
    return caster ? caster.ToPlayer() : undefined;
}

export function isComboFinisher(spellId: number): boolean {
    return finisherBySpell[spellId] === true;
}

export function comboAmount(player: TSPlayer): number {
    const aura = player.GetAura(COMBO_AURA_ID);
    return aura ? Number(aura.GetStackAmount()) : 0;
}

export function setComboAmount(player: TSPlayer, requested: number): void {
    const amount = Math.max(0, Math.min(COMBO_MAX_STACKS, Math.floor(requested)));
    let aura = player.GetAura(COMBO_AURA_ID);
    if (amount == 0) {
        if (aura) aura.Remove();
        return;
    }
    if (!aura) aura = player.AddAura(COMBO_AURA_ID, player);
    if (aura) aura.SetStackAmount(amount as uint8);
}

function clearPending(player: TSPlayer): void {
    const state = pendingFinisher(player);
    state.spellId = 0;
    state.reserved = 0;
    state.sawHit = false;
    player.ClearComboPoints();
    syncComboMirror(player);
}

/** Return the reserved aura stacks but keep the native mirror until
 * OnAfterHit, because BLOCK/REFLECT can still execute spell effects. */
function returnReserved(player: TSPlayer): void {
    const state = pendingFinisher(player);
    if (state.spellId != 0 && state.reserved != 0) {
        setComboAmount(player, restoreComboPoints(comboAmount(player), state.reserved));
        state.reserved = 0;
    }
}

function restorePending(player: TSPlayer): void {
    returnReserved(player);
    clearPending(player);
}

function relevantFinisher(player: TSPlayer, spellId: number): boolean {
    return isComboFinisher(spellId) && isGrantedAbility(player, spellId);
}

function spellUnitTarget(spell: TSSpell): TSUnit | undefined {
    const target = spell.GetTarget();
    return target ? target.ToUnit() : undefined;
}

/** Keep the stock counter aligned with the aura on the current/explicit
 * target. It is deliberately not the persistent resource and is never moved
 * while a finisher still needs the mirror for delayed effect calculations. */
export function syncComboMirror(
    player: TSPlayer,
    preferred?: TSUnit,
    forceTarget = false,
): void {
    const pending = pendingFinisher(player);
    if (pending.spellId != 0) {
        // After native CheckCast the target association is no longer needed:
        // all stock finisher formulas read only the caster's point count. If
        // Trinity clears that count while a projectile is in flight (death of
        // a prior target, warrior reactive cleanup, etc.), rebuild it on self
        // without moving or recreating the persistent aura reservation.
        if (!player.IsDead() && pending.reserved > 0
            && Number(player.GetComboPoints()) != pending.reserved) {
            player.ClearComboPoints();
            player.AddComboPoints(player, pending.reserved as int8);
        }
        return;
    }

    const points = comboAmount(player);
    const currentPoints = Number(player.GetComboPoints());
    if (points <= 0 || player.IsDead()) {
        if (currentPoints != 0) player.ClearComboPoints();
        return;
    }

    let target = preferred;
    if (!target) target = player.GetSelection();
    if (!target) target = player;
    if (!forceTarget && currentPoints == points) return;

    player.ClearComboPoints();
    player.AddComboPoints(target, points as int8);
}

export function handleComboCheckCast(
    spell: TSSpell,
    result: TSMutable<SpellCastResult, SpellCastResult>,
): void {
    const player = playerCaster(spell);
    const spellId = Number(spell.GetEntry());
    if (!player || !relevantFinisher(player, spellId)) return;

    if (pendingFinisher(player).spellId != 0) {
        result.set(SpellCastResult.FAILED_IN_PROGRESS);
    } else if (comboAmount(player) == 0) {
        syncComboMirror(player);
        result.set(SpellCastResult.FAILED_NO_COMBO_POINTS);
    } else {
        // The hook runs before Trinity's native combo requirement check.
        // Point the compatibility mirror at this cast's explicit target.
        syncComboMirror(player, spellUnitTarget(spell), true);
    }
}

export function handleComboCast(spell: TSSpell): void {
    const player = playerCaster(spell);
    const spellId = Number(spell.GetEntry());
    if (!player || !relevantFinisher(player, spellId)) return;

    const points = comboAmount(player);
    if (points <= 0) return; // triggered/forced cast that skipped CheckCast

    // Triggered casts can skip CheckCast; make their native formulas see the
    // same player-bound amount as normal client casts.
    syncComboMirror(player, spellUnitTarget(spell), true);

    const state = pendingFinisher(player);
    state.spellId = spellId as uint32;
    state.reserved = points as uint8;
    state.sawHit = false;
    setComboAmount(player, 0);
    player.AddNamedTimer(FINISHER_TIMER, FINISHER_TIMEOUT_MS, (owner, timer) => {
        const p = owner.ToPlayer();
        // A successful hit leaves the fallback timer alive. Do not let that
        // stale callback clear unrelated native points acquired afterwards.
        if (p && pendingFinisher(p).spellId != 0) restorePending(p);
    });
}

export function handleComboBeforeHit(spell: TSSpell, miss: SpellMissInfo): void {
    const player = playerCaster(spell);
    if (!player) return;
    const state = pendingFinisher(player);
    if (state.spellId != Number(spell.GetEntry())) return;

    // A finisher can have several effects and targets. Remember whether at
    // least one of them landed, but keep the native mirror until the current
    // synchronous hit batch has completely finished.
    if (miss == SpellMissInfo.NONE) state.sawHit = true;
}

export function handleComboAfterHit(spell: TSSpell): void {
    const player = playerCaster(spell);
    if (!player) return;
    const state = pendingFinisher(player);
    if (state.spellId == Number(spell.GetEntry())) {
        // Trinity emits OnAfterHit for each effect/target rather than once per
        // cast. A zero-delay timer runs on the next update, after every effect
        // in this hit batch has read the native combo mirror.
        player.AddNamedTimer(FINISHER_TIMER, 0, (owner, timer) => {
            const p = owner.ToPlayer();
            if (!p) return;
            const pending = pendingFinisher(p);
            if (pending.spellId == 0) return;
            if (pending.sawHit) clearPending(p);
            else restorePending(p);
        });
    }
}

export function handleComboCancel(spell: TSSpell): void {
    const player = playerCaster(spell);
    if (!player) return;
    if (pendingFinisher(player).spellId == Number(spell.GetEntry())) {
        restorePending(player);
    }
}

export function handleComboAfterCast(spell: TSSpell): void {
    const player = playerCaster(spell);
    const spellId = Number(spell.GetEntry());
    if (!player || !isGrantedAbility(player, spellId)) return;
    if (isComboFinisher(spellId) || spell.IsAutoRepeat()) return;

    setComboAmount(player, gainComboPoint(comboAmount(player)));
    syncComboMirror(player);
}

/** Prevent only the stock target-bound generator effect of an active gem
 * ability. The DBC row remains unchanged for NPCs, bots and normal class use. */
export function handleComboEffect(
    spell: TSSpell,
    preventDefault: TSMutable<boolean, boolean>,
    effect: TSSpellEffectInfo,
): void {
    if (Number(effect.GetType()) != EFF_ADD_COMBO_POINTS) return;
    const player = playerCaster(spell);
    if (player && isGrantedAbility(player, Number(spell.GetEntry()))) {
        preventDefault.set(true);
    }
}

export function RegisterComboSequence(events: TSEvents): void {
    events.Spell.OnCheckCast(handleComboCheckCast);
    events.Spell.OnCast(handleComboCast);
    events.Spell.OnBeforeHit(handleComboBeforeHit);
    events.Spell.OnAfterHit(handleComboAfterHit);
    events.Spell.OnCancel(handleComboCancel);
    events.Spell.OnAfterCast(handleComboAfterCast);
    events.Spell.OnEffect(handleComboEffect);
    events.Unit.OnSetTarget(unit => {
        const player = unit.ToPlayer();
        if (!player) return;
        // Selection is updated around this event; defer one update so the
        // mirror follows the final selected unit rather than the old target.
        player.AddNamedTimer(TARGET_SYNC_TIMER, 0, (owner, timer) => {
            const p = owner.ToPlayer();
            if (p) syncComboMirror(p, undefined, true);
        });
    });
    events.Player.OnLogin((player, firstLogin) => {
        const state = pendingFinisher(player);
        state.spellId = 0;
        state.reserved = 0;
        state.sawHit = false;
        syncComboMirror(player, undefined, true);
        // Trinity clears its target-bound counter in several unrelated paths
        // (death, target removal and warrior reactive timers). Reconcile the
        // disposable mirror cheaply; no packets are sent while it still
        // matches the persistent aura.
        player.AddNamedTimer(
            MIRROR_RECONCILE_TIMER,
            MIRROR_RECONCILE_MS,
            -1,
            (owner, timer) => {
                const p = owner.ToPlayer();
                if (p) syncComboMirror(p);
            },
        );
    });
}
