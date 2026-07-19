/**
 * Builds the runtime lookup tables from the datascript-generated pool:
 *   - enchantToSpell: socket-enchant id -> ability spell id (классовые + экзотик)
 *   - enchantToItem:  socket-enchant id -> исходный предмет камня
 *   - armorPools:     подкласс брони (1 ткань..4 латы) -> роль (0 дпс,1 хил,2 танк)
 *                     -> список сокет-энчантов для предустановки (см. fill.ts)
 *   - exoticItemIds:  предметы экзотических камней (редкий дроп, см. loot.ts)
 *
 * The ids come from ./generated_pool (written by datascripts/gems.ts). We do
 * NOT use GetID() at runtime (build-time only) nor CreateDictionary (its
 * methods are nil in the lua backend) — a plain object map compiles to a lua
 * table and just works.
 */

import { GEN_EXOTIC, GEN_POOL } from "./generated_pool";

const enchantToSpell: { [ench: number]: number } = {};
const enchantToItem: { [ench: number]: number } = {};
export const exoticItemIds: uint32[] = [];
export const armorPools: { [sub: number]: { [role: number]: uint32[] } } = {};

let built = false;

export function buildMaps(): void {
    if (built) {
        return;
    }
    for (let sub = 1; sub <= 4; sub++) {
        armorPools[sub] = {};
        for (let role = 0; role <= 2; role++) {
            armorPools[sub][role] = [];
        }
    }
    for (let i = 0; i < GEN_POOL.length; i++) {
        const row = GEN_POOL[i]; // [spellId, gemItemId, socketEnchantId, armorMask, role]
        const spell = row[0];
        const item = row[1];
        const ench = row[2];
        const armorMask = row[3];
        const role = row[4];
        if (ench > 0) {
            enchantToSpell[ench] = spell;
            if (item > 0) enchantToItem[ench] = item;
            for (let sub = 1; sub <= 4; sub++) {
                if (armorMask & (1 << (sub - 1))) {
                    armorPools[sub][role].push(ench);
                }
            }
        }
    }
    for (let i = 0; i < GEN_EXOTIC.length; i++) {
        const row = GEN_EXOTIC[i]; // [spellId, gemItemId, socketEnchantId]
        const spell = row[0];
        const item = row[1];
        const ench = row[2];
        if (ench > 0) {
            enchantToSpell[ench] = spell;
            if (item > 0) enchantToItem[ench] = item;
        }
        if (item > 0) {
            exoticItemIds.push(item);
        }
    }
    built = true;
}

export function spellForEnchant(ench: number): number {
    const v = enchantToSpell[ench];
    return v !== undefined ? v : 0;
}

export function itemForEnchant(ench: number): number {
    const v = enchantToItem[ench];
    return v !== undefined ? v : 0;
}
