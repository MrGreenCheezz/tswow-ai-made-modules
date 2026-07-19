/**
 * Предустановка камней способностей в броню в момент её получения.
 *
 * Тип брони определяет пул: ткань → кастеры/лекари, кожа → друид/рога/энх-шаман,
 * кольчуга → охотник/кастер-шаман, латы → воин/пал/дк. Внутри пула роль (дпс/
 * хил/танк) выбирается по весам: латы тянут к танку, ткань — к лечению.
 *
 * Основная точка — Item.OnTakenAsLoot (предмет ложится в сумку уже с камнями,
 * видно в тултипе сразу). Fallback — OnEquip: покрывает крафт, вендоров,
 * квестовые награды и почту, где событие лута не срабатывает. Уже надетая
 * стартовая экипировка обрабатывается в OnLogin до пересчёта способностей.
 *
 * Заполняются ВСЕ гнёзда (свой/экзотический камень ставится ПОВЕРХ через
 * /socket — нативная перевставка уничтожает старый камень, это и есть выбор).
 * Оружие тоже получает камни: стрелковое → пул кольчуги (охотник), посохи и
 * жезлы → ткань, кинжалы/кулачное → кожа, остальное железо → латы; щиты → латы;
 * кольца/шейки/тринкеты — случайный пул. Заполняем ТОЛЬКО полностью пустые
 * вещи: любой уже стоящий сокет-энчант означает "эту вещь уже прокатывали".
 */

import { armorPools } from "./maps";
import { recomputeAbilities } from "./grant";

// SOCK_ENCHANTMENT_SLOT, _2, _3
const SOCK_SLOTS: number[] = [2, 3, 4];
const ITEM_CLASS_WEAPON = 2;
const ITEM_CLASS_ARMOR = 4;
const ARMOR_SUB_SHIELD = 6;
// пул (подкласс брони 1-4) по подклассу оружия
const WEAPON_POOL: { [sub: number]: number } = {
    0: 4, 1: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, // топоры/булавы/мечи/пики → латы
    2: 3, 3: 3, 16: 3, 18: 3,                 // луки/ружья/метательное/арбалеты → кольчуга
    10: 1, 19: 1,                             // посохи/жезлы → ткань
    13: 2, 15: 2,                             // кулачное/кинжалы → кожа
};
// подкласс брони: 1 ткань, 2 кожа, 3 кольчуга, 4 латы
// веса ролей [дпс, хил, танк] по подклассу
// NB: танковый пул пока мал (~8 камней — эвристика таунтов + короткий список в
// spec_data.ts), поэтому вес танка занижен; поднять после расширения списка
const ROLE_WEIGHTS: { [sub: number]: number[] } = {
    1: [55, 40, 5],
    2: [70, 15, 15],
    3: [80, 15, 5],
    4: [65, 10, 25],
};

// TSItemTemplate.GetSocketColor НЕ забинден в lua-рантайме (nil). Количество
// сокетов у нас детерминированно раздаёт datascripts/sockets.ts — зеркалим ту
// же формулу (quality + inventory type); держать в синхроне с sockets.ts.
const GEAR_INV: number[] = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 25, 26, 28];
const POOR_INV: number[] = [1, 5, 7, 10, 20];

/**
 * Sparse persistent marker: a row exists only after a player extracts a gem
 * from this exact item instance. It prevents OnEquip from rolling free gems
 * into a deliberately emptied item after relog, mail or trade.
 * Orphan rows are intentionally harmless because item-instance GUIDs are
 * monotonic; OnDestroyEarly is too early to clean them safely if destruction
 * is cancelled by another handler.
 */
@CharactersTable
export class GemAutoFillDisabled extends DBEntry {
    @DBPrimaryKey
    itemGuid: uint32 = 0;

    constructor(itemGuid: uint32) {
        super();
        this.itemGuid = itemGuid;
    }
}

function autoFillDisabled(item: TSItem): boolean {
    return new GemAutoFillDisabled(item.GetGUIDLow()).Load();
}

export function disableAutoFill(item: TSItem): void {
    new GemAutoFillDisabled(item.GetGUIDLow()).Save();
}

function contains(arr: number[], v: number): boolean {
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === v) return true;
    }
    return false;
}

export function templateSocketCount(tmpl: TSItemTemplate): number {
    const inv = tmpl.GetInventoryType();
    if (!contains(GEAR_INV, inv)) return 0;
    const quality = tmpl.GetQuality();
    if (quality == 0) return contains(POOR_INV, inv) ? 1 : 0;
    if (quality == 1 || quality == 2) return 1;
    if (quality == 3) return 2;
    return 3; // epic, legendary, heirloom
}

function randomFrom(list: uint32[]): number {
    if (list.length == 0) return 0;
    return list[Math.floor(Math.random() * list.length)];
}

/** Роль по весам; пустой пул роли откатывается на любой непустой. */
function pickEnchant(sub: number): number {
    const weights = ROLE_WEIGHTS[sub];
    const pools = armorPools[sub];
    if (weights === undefined || pools === undefined) return 0;
    const total = weights[0] + weights[1] + weights[2];
    let roll = Math.random() * total;
    let role = 0;
    if (roll < weights[0]) role = 0;
    else if (roll < weights[0] + weights[1]) role = 1;
    else role = 2;

    let ench = randomFrom(pools[role]);
    if (ench > 0) return ench;
    for (let r = 0; r <= 2; r++) {
        ench = randomFrom(pools[r]);
        if (ench > 0) return ench;
    }
    return 0;
}

/** Пул (подкласс брони 1-4) для предмета; 0 — случайный пул, -1 — не трогаем. */
function poolFor(tmpl: TSItemTemplate): number {
    const cls = tmpl.GetClass();
    const sub = tmpl.GetSubClass();
    if (cls == ITEM_CLASS_ARMOR) {
        if (sub >= 1 && sub <= 4) return sub;
        if (sub == ARMOR_SUB_SHIELD) return 4; // щит → латный (танковый) пул
        return 0; // кольца/шейки/тринкеты/рубашки — любой пул
    }
    if (cls == ITEM_CLASS_WEAPON) {
        const p = WEAPON_POOL[sub];
        return p !== undefined ? p : 0;
    }
    return -1;
}

export function fillSockets(item: TSItem): void {
    const tmpl = item.GetTemplate();
    const pool = poolFor(tmpl);
    if (pool < 0) return;
    const sockets = templateSocketCount(tmpl);
    if (sockets == 0) return;
    for (let k = 0; k < SOCK_SLOTS.length; k++) {
        if (item.GetEnchantmentID(SOCK_SLOTS[k]) > 0) return; // уже прокатана
    }
    if (autoFillDisabled(item)) return; // игрок намеренно извлёк камни
    let changed = false;
    for (let k = 0; k < sockets; k++) {
        const sub = pool == 0 ? 1 + Math.floor(Math.random() * 4) : pool;
        const ench = pickEnchant(sub);
        if (ench > 0) {
            item.SetEnchantment(ench, SOCK_SLOTS[k]);
            changed = true;
        }
    }
    if (changed) {
        item.SaveToDB();
    }
}

export function RegisterSocketFill(events: TSEvents): void {
    events.Item.OnTakenAsLoot((item, lootItem, loot, player) => {
        fillSockets(item);
    });
    // fallback для вещей мимо лута (крафт/вендор/квест/почта); recompute сразу,
    // чтобы способность появилась без ожидания 2с-таймера
    events.Item.OnEquip((item, player, slot, isMerge) => {
        fillSockets(item);
        recomputeAbilities(player);
    });
}
