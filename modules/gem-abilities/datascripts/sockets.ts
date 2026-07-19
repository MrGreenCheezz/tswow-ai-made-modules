/**
 * Add sockets to every equippable item, by quality:
 *   poor(0)              -> 1 socket, only head/chest/legs/hands
 *   common(1)+uncommon(2)-> 1 socket, all gear
 *   rare(3)              -> 2 sockets
 *   epic(4)+legendary(5) -> 3 sockets
 *   heirloom(6)          -> 3 sockets
 *
 * Sockets use a single colour (RED); colour only affects the (unused) socket
 * bonus, and any non-meta gem fits any colour socket.
 */

import { std } from "wow/wotlk";

// ItemInventoryType values considered "gear" (see ItemInventoryType enum)
const GEAR_INV = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 25, 26, 28];
// poor items only get a socket on these slots (head, chest, legs, hands, robe)
const POOR_INV = [1, 5, 7, 10, 20];

function contains(arr: number[], v: number): boolean {
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === v) return true;
    }
    return false;
}

function socketCount(quality: number, inv: number): number {
    if (quality === 0) {
        return contains(POOR_INV, inv) ? 1 : 0;
    }
    if (quality === 1 || quality === 2) return 1;
    if (quality === 3) return 2;
    return 3; // epic, legendary, heirloom
}

// Item socket array is fixed at 3 slots — SET each slot directly (adding would
// overflow items that already have base sockets).
std.Items.filter((item) => {
    const inv = item.InventoryType.get();
    const n = contains(GEAR_INV, inv) ? socketCount(item.Quality.get(), inv) : 0;
    for (let i = 0; i < 3; i++) {
        item.Socket.get(i).set(i < n ? "RED" : "NONE", 0);
    }
    return false; // we mutate in place; no need to collect
});
