/**
 * Grant/revoke abilities based on the gems currently socketed into equipped
 * gear. Ranked abilities resolve to the highest rank allowed by the player's
 * current level. Recomputed on login, level-up, equip, socket packets, and a
 * fallback timer.
 */

import { spellForEnchant } from "./maps";

// SOCK_ENCHANTMENT_SLOT, _2, _3
const SOCK_SLOTS: number[] = [2, 3, 4];
const EQUIP_END = 19;

class GrantState {
    roots: TSArray<uint32> = [];
    ranks: TSArray<uint32> = [];
}

class DesiredAbilities {
    roots: TSArray<uint32> = [];
    ranks: TSArray<uint32> = [];
}

function getGrant(player: TSPlayer): GrantState {
    const state = player.GetObject("gemGranted", new GrantState());
    // Livescript reloads keep object data on online players. Repair state made
    // by the older exact-rank implementation instead of failing on nil arrays.
    if (state.roots === undefined) state.roots = [];
    if (state.ranks === undefined) state.ranks = [];
    return state;
}

function has(arr: TSArray<uint32>, v: number): boolean {
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === v) return true;
    }
    return false;
}

function indexOf(arr: TSArray<uint32>, v: number): number {
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === v) return i;
    }
    return -1;
}

/** SpellLevel is the trainer/character level for a rank; BaseLevel is a
 * fallback for unusual rows where SpellLevel is zero. */
function requiredLevel(info: TSSpellInfo): number {
    const spellLevel = info.GetSpellLevel();
    return spellLevel > 0 ? spellLevel : info.GetBaseLevel();
}

/** Canonical identity shared by every rank-specific gem in one chain. */
function rootSpell(spellId: number): number {
    if (spellId <= 0) return 0;
    const source = GetSpellInfo(spellId);
    if (source === undefined) return 0;
    if (!source.IsRanked()) return source.GetEntry();
    const first: TSSpellInfo | undefined = source.GetFirstRankSpell();
    if (first !== undefined) return first.GetEntry();

    // Some imported spell chains have no direct first-rank pointer even though
    // their previous-rank links are valid. Walk backwards as a safe fallback.
    let current: TSSpellInfo | undefined = source;
    for (let guard = 0; guard < 64 && current !== undefined; guard++) {
        const previous: TSSpellInfo | undefined = current.GetPrevRankSpell();
        if (previous === undefined || previous.GetEntry() == current.GetEntry()) break;
        current = previous;
    }
    return current === undefined ? source.GetEntry() : current.GetEntry();
}

/** True when this exact spell or any rank in its chain is currently supplied
 * by a socketed ability gem. Runtime systems use this to ignore item spells,
 * creature casts and unrelated triggered spells that share normal events. */
export function isGrantedAbility(player: TSPlayer, spellId: number): boolean {
    const root = rootSpell(spellId);
    return root > 0 && has(getGrant(player).roots, root);
}

/** Resolve a rank chain to the strongest rank available at the player's level.
 * Unranked high-level abilities stay unavailable until their required level
 * instead of bypassing progression through a gem. */
function spellForLevel(rootId: number, level: number): number {
    if (rootId <= 0) return 0;
    const root = GetSpellInfo(rootId);
    if (root === undefined) return 0;

    let current: TSSpellInfo | undefined = root;

    // A ranked gem must always grant at least rank 1. Native trainer levels
    // only decide when it upgrades; otherwise many low-level characters get a
    // valid socketed gem that appears to do nothing.
    let selected = root.IsRanked() ? root.GetEntry() : 0;
    // Corrupt spell chains must not lock the two-second recompute timer.
    for (let guard = 0; guard < 64 && current !== undefined; guard++) {
        const need = requiredLevel(current);
        if (need <= 0 || need <= level) selected = current.GetEntry();

        if (!current.IsRanked()) break;
        // Empty rank results are pushed to Lua as nil. The C++ null-check
        // method is not registered by the Lua binding.
        const next: TSSpellInfo | undefined = current.GetNextRankSpell();
        if (next === undefined || next.GetEntry() == current.GetEntry()) break;
        current = next;
    }
    return selected;
}

function socketedSpells(player: TSPlayer): DesiredAbilities {
    const out = new DesiredAbilities();
    for (let slot = 0; slot < EQUIP_END; slot++) {
        const item = player.GetEquippedItemBySlot(slot);
        if (!item) {
            continue;
        }
        for (let k = 0; k < SOCK_SLOTS.length; k++) {
            const ench = item.GetEnchantmentID(SOCK_SLOTS[k]);
            if (ench > 0) {
                const root = rootSpell(spellForEnchant(ench));
                const rank = spellForLevel(root, player.GetLevel());
                // All old rank-specific gems in one chain intentionally become
                // aliases of the same level-scaled ability.
                if (root > 0 && rank > 0 && !has(out.roots, root)) {
                    out.roots.push(root);
                    out.ranks.push(rank);
                }
            }
        }
    }
    return out;
}

export function recomputeAbilities(player: TSPlayer): void {
    const want = socketedSpells(player);
    const grant = getGrant(player);
    const resetRoots: TSArray<uint32> = [];

    // A root removal recursively clears the complete non-talent rank chain.
    // Queue every removed ability and every ability whose desired rank changed.
    for (let i = 0; i < grant.roots.length; i++) {
        const wantedIndex = indexOf(want.roots, grant.roots[i]);
        if (wantedIndex < 0 || grant.ranks[i] != want.ranks[wantedIndex]) {
            if (!has(resetRoots, grant.roots[i])) resetRoots.push(grant.roots[i]);
        }
    }

    // Repair stale/inactive lower ranks left by the old exact-rank algorithm or
    // by a script reload, when GrantState no longer knows the prior chain.
    for (let i = 0; i < want.roots.length; i++) {
        const oldIndex = indexOf(grant.roots, want.roots[i]);
        if ((oldIndex < 0 && player.HasSpell(want.roots[i]))
            || (oldIndex >= 0 && !player.HasSpell(want.ranks[i]))) {
            if (!has(resetRoots, want.roots[i])) resetRoots.push(want.roots[i]);
        }
    }

    // All removals must happen before any LearnSpell: removing a lower rank
    // after an upgrade would recursively delete the new higher rank.
    for (let i = 0; i < resetRoots.length; i++) {
        player.RemoveSpell(resetRoots[i], false, false);
    }

    for (let i = 0; i < want.roots.length; i++) {
        const oldIndex = indexOf(grant.roots, want.roots[i]);
        if (oldIndex < 0 || grant.ranks[oldIndex] != want.ranks[i] || !player.HasSpell(want.ranks[i])) {
            player.LearnSpell(want.ranks[i]);
        }
    }
    grant.roots = want.roots;
    grant.ranks = want.ranks;
}
