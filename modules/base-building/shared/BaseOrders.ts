/** Shared contract for the base order board (datascript/livescript/addon). */

import { ORDERS_BOARD_KEY } from "./BaseCatalog";

export const ORDER_BOARD_KEY = ORDERS_BOARD_KEY;
export const ORDER_BOARD_TAG = "go/orders-board";
export const ORDER_BOARD_USE_RANGE = 10.0;
export const ORDER_REFRESH_S = 20 * 60 * 60;

// 75-78 are used by other modules. Keep this block synchronized with BaseMessages.
export const OP_ORDER_STATE = 79;   // S->C: complete board/active-order state
export const OP_ORDER_REQUEST = 80; // C->S: refresh state while standing at own board
export const OP_ORDER_ACCEPT = 81;  // C->S: cycleToken, slot
export const OP_ORDER_TURN_IN = 82; // C->S: activeToken
export const OP_ORDER_ABANDON = 83; // C->S: activeToken; the cycle remains spent

export const ORDER_NONE = 0;
export const ORDER_MATERIAL = 1;
export const ORDER_CRAFT = 2;
export const ORDER_KILL = 3;
export const ORDER_TIER_COUNT = 5;

/** Exact world materials grouped by the same five progression bands as orders. */
export const ORDER_MATERIAL_ITEMS_BY_TIER: number[][] = [
    [2770, 2447, 2589, 2318, 2835, 6291],
    [2771, 2775, 2772, 2776, 2453, 3355, 2592, 4306, 2319, 4234, 2836, 2838, 6308],
    [3858, 7911, 3821, 8838, 4338, 4304, 8170, 7912, 12365, 13760],
    [10620, 23424, 23425, 22785, 22786, 14047, 21877, 21887, 27422],
    [36909, 36912, 36910, 36901, 36906, 33470, 33568, 41809],
];

const MATERIAL_COUNT_MIN = [8, 10, 12, 15, 18];
const MATERIAL_COUNT_MAX = [14, 18, 22, 25, 30];
const KILL_COUNT_MIN = [4, 5, 6, 7, 8];
const KILL_COUNT_MAX = [7, 9, 10, 12, 14];
const REWARD_COPPER = [10000, 50000, 150000, 400000, 1000000];

function tierIndex(tier: number): number {
    return Math.max(0, Math.min(ORDER_TIER_COUNT - 1, Math.floor(tier) - 1));
}

function countFromRoll(min: number, max: number, roll01: number): number {
    const roll = Math.max(0, Math.min(0.999999, roll01));
    return min + Math.floor(roll * (max - min + 1));
}

export function maxOrderTier(playerLevel: number): number {
    if (playerLevel >= 69) return 5;
    if (playerLevel >= 51) return 4;
    if (playerLevel >= 36) return 3;
    if (playerLevel >= 21) return 2;
    return 1;
}

export function materialOrderCount(tier: number, roll01: number): number {
    const i = tierIndex(tier);
    return countFromRoll(MATERIAL_COUNT_MIN[i], MATERIAL_COUNT_MAX[i], roll01);
}

export function killOrderCount(tier: number, roll01: number): number {
    const i = tierIndex(tier);
    return countFromRoll(KILL_COUNT_MIN[i], KILL_COUNT_MAX[i], roll01);
}

export function orderRewardMoney(type: number, tier: number): number {
    const base = REWARD_COPPER[tierIndex(tier)];
    if (type == ORDER_CRAFT) return Math.floor(base * 3 / 2);
    if (type == ORDER_KILL) return Math.floor(base * 5 / 4);
    return base;
}

export class OrderOfferView {
    slot: number = 0;
    type: number = ORDER_NONE;
    tier: number = 1;
    target: number = 0;
    required: number = 0;
    money: number = 0;
    name: string = "";

    constructor(
        slot: number = 0,
        type: number = ORDER_NONE,
        tier: number = 1,
        target: number = 0,
        required: number = 0,
        money: number = 0,
        name: string = "",
    ) {
        this.slot = slot;
        this.type = type;
        this.tier = tier;
        this.target = target;
        this.required = required;
        this.money = money;
        this.name = name;
    }
}

export class OrderStateMsg {
    openWindow: number = 0;
    cycleToken: number = 0;
    refreshSeconds: number = 0;
    acceptedThisCycle: number = 0;
    activeToken: number = 0;
    activeSlot: number = 0;
    activeType: number = ORDER_NONE;
    activeTier: number = 0;
    activeTarget: number = 0;
    activeRequired: number = 0;
    activeProgress: number = 0;
    activeDeposited: number = 0;
    activeMoney: number = 0;
    activeName: string = "";
    offers: TSArray<OrderOfferView> = [];

    read(read: TSPacketRead): void {
        this.openWindow = read.ReadDouble();
        this.cycleToken = read.ReadDouble();
        this.refreshSeconds = read.ReadDouble();
        this.acceptedThisCycle = read.ReadDouble();
        this.activeToken = read.ReadDouble();
        this.activeSlot = read.ReadDouble();
        this.activeType = read.ReadDouble();
        this.activeTier = read.ReadDouble();
        this.activeTarget = read.ReadDouble();
        this.activeRequired = read.ReadDouble();
        this.activeProgress = read.ReadDouble();
        this.activeDeposited = read.ReadDouble();
        this.activeMoney = read.ReadDouble();
        this.activeName = read.ReadString();
        this.offers = [];
        const count = read.ReadDouble();
        for (let i = 0; i < count; i++) {
            this.offers.push(new OrderOfferView(
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadString(),
            ));
        }
    }

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ORDER_STATE, 0);
        packet.WriteDouble(this.openWindow);
        packet.WriteDouble(this.cycleToken);
        packet.WriteDouble(this.refreshSeconds);
        packet.WriteDouble(this.acceptedThisCycle);
        packet.WriteDouble(this.activeToken);
        packet.WriteDouble(this.activeSlot);
        packet.WriteDouble(this.activeType);
        packet.WriteDouble(this.activeTier);
        packet.WriteDouble(this.activeTarget);
        packet.WriteDouble(this.activeRequired);
        packet.WriteDouble(this.activeProgress);
        packet.WriteDouble(this.activeDeposited);
        packet.WriteDouble(this.activeMoney);
        packet.WriteString(this.activeName);
        packet.WriteDouble(this.offers.length);
        for (let i = 0; i < this.offers.length; i++) {
            const offer = this.offers[i];
            packet.WriteDouble(offer.slot);
            packet.WriteDouble(offer.type);
            packet.WriteDouble(offer.tier);
            packet.WriteDouble(offer.target);
            packet.WriteDouble(offer.required);
            packet.WriteDouble(offer.money);
            packet.WriteString(offer.name);
        }
        return packet;
    }
}

export class OrderRequestMsg {
    read(read: TSPacketRead): void { read.ReadDouble(); }
    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ORDER_REQUEST, 0);
        packet.WriteDouble(0);
        return packet;
    }
}

export class OrderAcceptMsg {
    cycleToken: number = 0;
    slot: number = 0;
    constructor(cycleToken: number = 0, slot: number = 0) {
        this.cycleToken = cycleToken;
        this.slot = slot;
    }
    read(read: TSPacketRead): void {
        this.cycleToken = read.ReadDouble();
        this.slot = read.ReadDouble();
    }
    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ORDER_ACCEPT, 0);
        packet.WriteDouble(this.cycleToken);
        packet.WriteDouble(this.slot);
        return packet;
    }
}

export class OrderTurnInMsg {
    activeToken: number = 0;
    constructor(activeToken: number = 0) { this.activeToken = activeToken; }
    read(read: TSPacketRead): void { this.activeToken = read.ReadDouble(); }
    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ORDER_TURN_IN, 0);
        packet.WriteDouble(this.activeToken);
        return packet;
    }
}

export class OrderAbandonMsg {
    activeToken: number = 0;
    constructor(activeToken: number = 0) { this.activeToken = activeToken; }
    read(read: TSPacketRead): void { this.activeToken = read.ReadDouble(); }
    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_ORDER_ABANDON, 0);
        packet.WriteDouble(this.activeToken);
        return packet;
    }
}
