/** Runtime for the base order board. Persistent state is per character. */

import {
    ORDER_BOARD_KEY, ORDER_BOARD_USE_RANGE, ORDER_REFRESH_S,
    OP_ORDER_REQUEST, OP_ORDER_ACCEPT, OP_ORDER_TURN_IN, OP_ORDER_ABANDON,
    ORDER_NONE, ORDER_MATERIAL, ORDER_CRAFT, ORDER_KILL,
    ORDER_MATERIAL_ITEMS_BY_TIER,
    maxOrderTier, materialOrderCount, killOrderCount, orderRewardMoney,
    OrderOfferView, OrderStateMsg, OrderRequestMsg, OrderAcceptMsg, OrderTurnInMsg, OrderAbandonMsg,
} from "../shared/BaseOrders";
import { CRAFT_STATION_RECIPES } from "../shared/generated/CraftStationRecipes";
import { ORDER_REWARD_GEMS } from "../shared/generated/AbilityGemRewards";
import { BaseBuilding } from "./base-db";
import {
    baseText, dist2, localizedTemplateNames,
    normTime, nowUnix, removeCarriedItems, sendError,
} from "./base";

const ORDER_BOARD_ENTRY = UTAG("base-building", "go/orders-board");
const KILL_TARGETS_TIER_1: number[] = TAG("base-building", "npc/orders-tier-1");
const KILL_TARGETS_TIER_2: number[] = TAG("base-building", "npc/orders-tier-2");
const KILL_TARGETS_TIER_3: number[] = TAG("base-building", "npc/orders-tier-3");
const KILL_TARGETS_TIER_4: number[] = TAG("base-building", "npc/orders-tier-4");
const KILL_TARGETS_TIER_5: number[] = TAG("base-building", "npc/orders-tier-5");
const ORDER_CRAFT_SKILLS = [164, 165, 171, 197, 202, 333, 755, 773];
const MAX_PLAYER_MONEY = 2147483647;
const CREATURE_TYPE_FLAG_BOSS_MOB = 0x00000004;
const CREATURE_TYPE_FLAG_QUEST_BOSS = 0x80000000;

@CharactersTable
export class BaseOrderState extends DBEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    refreshAt: uint64 = 0;
    @DBField
    cycleToken: uint32 = 0;
    @DBField
    acceptedCycleToken: uint32 = 0;

    @DBField
    materialTier: uint32 = 0;
    @DBField
    materialTarget: uint32 = 0;
    @DBField
    materialRequired: uint32 = 0;
    @DBField
    materialMoney: uint32 = 0;

    @DBField
    craftTier: uint32 = 0;
    @DBField
    craftTarget: uint32 = 0;
    @DBField
    craftRecipe: uint32 = 0;
    @DBField
    craftMoney: uint32 = 0;

    @DBField
    killTier: uint32 = 0;
    @DBField
    killTarget: uint32 = 0;
    @DBField
    killRequired: uint32 = 0;
    @DBField
    killMoney: uint32 = 0;

    @DBField
    activeToken: uint32 = 0;
    @DBField
    activeSlot: uint32 = 0;
    @DBField
    activeType: uint32 = ORDER_NONE;
    @DBField
    activeTier: uint32 = 0;
    @DBField
    activeTarget: uint32 = 0;
    @DBField
    activeRecipe: uint32 = 0;
    @DBField
    activeRequired: uint32 = 0;
    @DBField
    activeProgress: uint32 = 0;
    @DBField
    activeMoney: uint32 = 0;
    @DBField
    activeGemItem: uint32 = 0;
    @DBField
    turnInConsumed: uint32 = 0;
    @DBField
    gemDelivered: uint32 = 0;
    @DBField
    moneyGranted: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): BaseOrderState {
        return player.GetObject("BaseOrderState", LoadDBEntry(new BaseOrderState(player.GetGUIDLow())));
    }
}

class OrderCraftWatch {
    activeToken: number = 0;
    recipe: number = 0;
    target: number = 0;
    beforeCount: number = 0;
}

function craftWatch(player: TSPlayer): OrderCraftWatch {
    return player.GetObject("BaseOrderCraftWatch", new OrderCraftWatch());
}

function randomIndex(length: number): number {
    return Math.floor(Math.random() * length);
}

function randomTier(cap: number): number {
    return 1 + randomIndex(Math.max(1, cap));
}

function nextToken(state: BaseOrderState): number {
    let token = 1 + Math.floor(Math.random() * 2000000000);
    while (token == state.cycleToken || token == state.acceptedCycleToken || token == state.activeToken) {
        token = 1 + Math.floor(Math.random() * 2000000000);
    }
    return token;
}

function killTargets(tier: number): number[] {
    if (tier == 5) return KILL_TARGETS_TIER_5;
    if (tier == 4) return KILL_TARGETS_TIER_4;
    if (tier == 3) return KILL_TARGETS_TIER_3;
    if (tier == 2) return KILL_TARGETS_TIER_2;
    return KILL_TARGETS_TIER_1;
}

function playerCanAttackTarget(player: TSPlayer, entry: number): boolean {
    const creature = GetCreatureTemplate(entry);
    if (!creature) return false;
    const targetFaction = GetFactionTemplate(Number(creature.GetFaction()));
    const playerFaction = GetFactionTemplate(Number(player.GetFaction()));
    if (!targetFaction || !playerFaction) return false;
    return !targetFaction.IsFriendlyTo(playerFaction) && !playerFaction.IsFriendlyTo(targetFaction);
}

function chooseKillTarget(player: TSPlayer, tier: number): number {
    for (let current = tier; current >= 1; current--) {
        const pool = killTargets(current);
        const eligible: number[] = [];
        for (let i = 0; i < pool.length; i++) {
            if (playerCanAttackTarget(player, pool[i])) eligible.push(pool[i]);
        }
        if (eligible.length > 0) return eligible[randomIndex(eligible.length)];
    }
    return 0;
}

/** [output item, recipe spell, tier], restricted to recipes the player actually knows. */
function chooseCraftTarget(player: TSPlayer, tierCap: number): number[] {
    let hasProfession = false;
    for (let i = 0; i < ORDER_CRAFT_SKILLS.length; i++) {
        if (player.HasSkill(ORDER_CRAFT_SKILLS[i])) hasProfession = true;
    }
    if (!hasProfession) return [];
    const eligible: number[][] = [];
    for (let i = 0; i < CRAFT_STATION_RECIPES.length; i++) {
        const row = CRAFT_STATION_RECIPES[i];
        if (row.length < 8) continue;
        const output = row[1];
        const recipe = row[2];
        const tier = row[5];
        if (output > 0 && recipe > 0 && tier >= 1 && tier <= tierCap && player.HasSpell(recipe)) {
            eligible.push([output, recipe, tier]);
        }
    }
    return eligible.length > 0 ? eligible[randomIndex(eligible.length)] : [];
}

function chooseRewardGem(): number {
    const eligible: number[] = [];
    for (let i = 0; i < ORDER_REWARD_GEMS.length; i++) {
        const row = ORDER_REWARD_GEMS[i];
        if (row.length >= 2 && row[1] > 0) eligible.push(row[1]);
    }
    return eligible.length > 0 ? eligible[randomIndex(eligible.length)] : 0;
}

function generateOffers(player: TSPlayer, state: BaseOrderState, now: number): void {
    const tierCap = maxOrderTier(Number(player.GetLevel()));
    state.refreshAt = now + ORDER_REFRESH_S;
    state.cycleToken = nextToken(state);

    state.materialTier = randomTier(tierCap);
    const materials = ORDER_MATERIAL_ITEMS_BY_TIER[state.materialTier - 1];
    state.materialTarget = materials[randomIndex(materials.length)];
    state.materialRequired = materialOrderCount(state.materialTier, Math.random());
    state.materialMoney = orderRewardMoney(ORDER_MATERIAL, state.materialTier);

    const craft = chooseCraftTarget(player, tierCap);
    state.craftTarget = craft.length > 0 ? craft[0] : 0;
    state.craftRecipe = craft.length > 0 ? craft[1] : 0;
    state.craftTier = craft.length > 0 ? craft[2] : 0;
    state.craftMoney = craft.length > 0 ? orderRewardMoney(ORDER_CRAFT, state.craftTier) : 0;

    state.killTier = randomTier(tierCap);
    state.killTarget = chooseKillTarget(player, state.killTier);
    state.killRequired = state.killTarget > 0 ? killOrderCount(state.killTier, Math.random()) : 0;
    state.killMoney = state.killTarget > 0 ? orderRewardMoney(ORDER_KILL, state.killTier) : 0;
    state.Save();
}

function ensureOffers(player: TSPlayer, state: BaseOrderState): number {
    const now = nowUnix();
    const refreshAt = normTime(Number(state.refreshAt));
    if (state.cycleToken == 0 || refreshAt <= now) {
        generateOffers(player, state, now);
    }
    return now;
}

function fillCraftOfferIfAvailable(player: TSPlayer, state: BaseOrderState): void {
    if (state.craftTarget != 0 || state.acceptedCycleToken == state.cycleToken) return;
    const craft = chooseCraftTarget(player, maxOrderTier(Number(player.GetLevel())));
    if (craft.length == 0) return;
    state.craftTarget = craft[0];
    state.craftRecipe = craft[1];
    state.craftTier = craft[2];
    state.craftMoney = orderRewardMoney(ORDER_CRAFT, state.craftTier);
    state.Save();
}

function targetName(player: TSPlayer, type: number, entry: number): string {
    return type == ORDER_KILL
        ? localizedTemplateNames.creature(player, entry)
        : localizedTemplateNames.item(player, entry);
}

function activeDisplayProgress(player: TSPlayer, state: BaseOrderState): number {
    if (state.activeType == ORDER_MATERIAL && state.activeTarget > 0) {
        return Math.min(
            state.activeRequired,
            state.turnInConsumed + Number(player.GetItemCount(state.activeTarget, false)),
        );
    }
    return Math.min(state.activeRequired, state.activeProgress);
}

function sendState(player: TSPlayer, openWindow: boolean): void {
    const state = BaseOrderState.get(player);
    const now = ensureOffers(player, state);
    if (openWindow) fillCraftOfferIfAvailable(player, state);
    const msg = new OrderStateMsg();
    msg.openWindow = openWindow ? 1 : 0;
    msg.cycleToken = state.cycleToken;
    msg.refreshSeconds = Math.max(0, normTime(Number(state.refreshAt)) - now);
    msg.acceptedThisCycle = state.acceptedCycleToken == state.cycleToken ? 1 : 0;
    msg.activeToken = state.activeToken;
    msg.activeSlot = state.activeSlot;
    msg.activeType = state.activeType;
    msg.activeTier = state.activeTier;
    msg.activeTarget = state.activeTarget;
    msg.activeRequired = state.activeRequired;
    msg.activeProgress = activeDisplayProgress(player, state);
    msg.activeDeposited = state.turnInConsumed;
    msg.activeMoney = state.activeMoney;
    msg.activeName = state.activeTarget > 0 ? targetName(player, state.activeType, state.activeTarget) : "";
    msg.offers.push(new OrderOfferView(
        1, ORDER_MATERIAL, state.materialTier, state.materialTarget,
        state.materialRequired, state.materialMoney, localizedTemplateNames.item(player, state.materialTarget),
    ));
    msg.offers.push(new OrderOfferView(
        2, ORDER_CRAFT, state.craftTier, state.craftTarget, state.craftTarget > 0 ? 1 : 0,
        state.craftMoney, state.craftTarget > 0 ? localizedTemplateNames.item(player, state.craftTarget) : baseText(player, "No known recipe", "Нет изученного рецепта"),
    ));
    msg.offers.push(new OrderOfferView(
        3, ORDER_KILL, state.killTier, state.killTarget, state.killRequired,
        state.killMoney, state.killTarget > 0 ? localizedTemplateNames.creature(player, state.killTarget) : baseText(player, "No suitable target", "Нет подходящей цели"),
    ));
    msg.write().SendToPlayer(player);
}

function nearOwnBoard(player: TSPlayer): boolean {
    const map = player.GetMapID();
    const x = player.GetX();
    const y = player.GetY();
    const range2 = ORDER_BOARD_USE_RANGE * ORDER_BOARD_USE_RANGE;
    let found = false;
    BaseBuilding.get(player).forEach(row => {
        if (found || row.catKey != ORDER_BOARD_KEY || row.mapId != map) return;
        if (dist2(row.x, row.y, x, y) <= range2) found = true;
    });
    return found;
}

function ownsBoardObject(player: TSPlayer, object: TSGameObject): boolean {
    let found = false;
    BaseBuilding.get(player).forEach(row => {
        if (found || row.catKey != ORDER_BOARD_KEY || row.mapId != object.GetMapID()) return;
        if (dist2(row.x, row.y, object.GetX(), object.GetY()) <= 1.0) found = true;
    });
    return found;
}

function requireBoard(player: TSPlayer): boolean {
    if (nearOwnBoard(player)) return true;
    sendError(player, baseText(player, "Move closer to your order board.", "Подойдите к своей доске заказов."));
    return false;
}

function offer(state: BaseOrderState, slot: number): number[] {
    if (slot == 1) return [
        ORDER_MATERIAL, state.materialTier, state.materialTarget, 0,
        state.materialRequired, state.materialMoney,
    ];
    if (slot == 2) return [
        ORDER_CRAFT, state.craftTier, state.craftTarget, state.craftRecipe,
        state.craftTarget > 0 ? 1 : 0, state.craftMoney,
    ];
    if (slot == 3) return [
        ORDER_KILL, state.killTier, state.killTarget, 0,
        state.killRequired, state.killMoney,
    ];
    return [];
}

function acceptOrder(player: TSPlayer, msg: OrderAcceptMsg): void {
    if (!requireBoard(player)) return;
    const state = BaseOrderState.get(player);
    ensureOffers(player, state);
    if (msg.cycleToken != state.cycleToken) {
        sendError(player, baseText(player, "The offers have already refreshed.", "Предложения уже обновились."));
        sendState(player, false);
        return;
    }
    if (state.activeSlot != 0) {
        sendError(player, baseText(player, "Complete your current order first.", "Сначала завершите уже принятый заказ."));
        return;
    }
    if (state.acceptedCycleToken == state.cycleToken) {
        sendError(player, baseText(player, "You have already selected an order during this cycle.", "В этом цикле вы уже выбрали заказ."));
        return;
    }

    const selected = offer(state, Math.floor(msg.slot));
    if (selected.length == 0 || selected[2] <= 0 || selected[4] <= 0) {
        sendError(player, baseText(player, "This order is currently unavailable.", "Этот заказ сейчас недоступен."));
        return;
    }
    if (selected[0] == ORDER_CRAFT && !player.HasSpell(selected[3])) {
        sendError(player, baseText(player, "You no longer know the recipe for this item. Wait for the board to refresh.", "Вы больше не знаете рецепт этого предмета. Дождитесь обновления доски."));
        return;
    }
    const gem = chooseRewardGem();
    if (gem == 0) {
        sendError(player, baseText(player, "The reward gem catalog has not been generated yet. Run build data first.", "Каталог камней награды ещё не создан. Сначала выполните build data."));
        return;
    }

    state.acceptedCycleToken = state.cycleToken;
    state.activeToken = nextToken(state);
    state.activeSlot = Math.floor(msg.slot);
    state.activeType = selected[0];
    state.activeTier = selected[1];
    state.activeTarget = selected[2];
    state.activeRecipe = selected[3];
    state.activeRequired = selected[4];
    state.activeProgress = 0;
    state.activeMoney = selected[5];
    state.activeGemItem = gem;
    state.turnInConsumed = 0;
    state.gemDelivered = 0;
    state.moneyGranted = 0;
    state.Save();
    sendState(player, false);
    player.SendBroadcastMessage(baseText(
        player,
        `Order accepted: ${targetName(player, state.activeType, state.activeTarget)}.`,
        `Заказ принят: ${targetName(player, state.activeType, state.activeTarget)}.`,
    ));
}

function clearActive(state: BaseOrderState): void {
    state.activeToken = 0;
    state.activeSlot = 0;
    state.activeType = ORDER_NONE;
    state.activeTier = 0;
    state.activeTarget = 0;
    state.activeRecipe = 0;
    state.activeRequired = 0;
    state.activeProgress = 0;
    state.activeMoney = 0;
    state.activeGemItem = 0;
    state.turnInConsumed = 0;
    state.gemDelivered = 0;
    state.moneyGranted = 0;
}

/**
 * Consume only concrete backpack/bag stacks. RemoveItemByEntry can skip an
 * in-trade stack and continue into the bank, which is outside GetItemCount(...,
 * false) and would make a retry destroy uncredited bank materials.
 * Result: [actually removed, blocked by an in-trade stack (0/1)].
 */
function consumeOrderMaterials(player: TSPlayer, entry: number, requested: number): number[] {
    const removed = removeCarriedItems(player, entry, requested);
    const blockedByTrade = removed < requested
        && Number(player.GetItemCount(entry, false)) > 0 ? 1 : 0;
    return [removed, blockedByTrade];
}

function turnInOrder(player: TSPlayer, msg: OrderTurnInMsg): void {
    if (!requireBoard(player)) return;
    const state = BaseOrderState.get(player);
    if (state.activeSlot == 0 || state.activeToken == 0 || msg.activeToken != state.activeToken) {
        sendError(player, baseText(player, "This order is outdated or has already been completed.", "Заказ устарел или уже сдан."));
        sendState(player, false);
        return;
    }
    if (state.activeType != ORDER_MATERIAL && activeDisplayProgress(player, state) < state.activeRequired) {
        sendError(player, baseText(player, "The order requirements have not been met yet.", "Условия заказа ещё не выполнены."));
        sendState(player, false);
        return;
    }

    if (state.activeType == ORDER_MATERIAL && state.turnInConsumed < state.activeRequired) {
        const remaining = state.activeRequired - state.turnInConsumed;
        const available = Number(player.GetItemCount(state.activeTarget, false));
        const result = consumeOrderMaterials(player, state.activeTarget, Math.min(remaining, available));
        state.turnInConsumed += result[0];
        state.Save();
        if (result[1] != 0) {
            sendError(player, baseText(player, "Close the trade window: materials involved in a trade cannot be submitted to an order.", "Закройте окно обмена: материалы, участвующие в обмене, нельзя сдавать в заказ."));
            sendState(player, false);
            return;
        }
        if (state.turnInConsumed < state.activeRequired) {
            if (result[0] > 0) {
                player.SendBroadcastMessage(baseText(
                    player,
                    `Materials deposited: ${state.turnInConsumed}/${state.activeRequired}. You can bring the remainder later.`,
                    `Внесено материалов: ${state.turnInConsumed}/${state.activeRequired}. Остаток можно принести позже.`,
                ));
            } else {
                sendError(player, baseText(player, "Your bags contain no materials that can be submitted to this order.", "В сумках нет материалов, которые можно внести в этот заказ."));
            }
            sendState(player, false);
            return;
        }
    }

    const remainingMoney = Math.max(0, state.activeMoney - state.moneyGranted);
    if (remainingMoney > 0 && Number(player.GetMoney()) > MAX_PLAYER_MONEY - remainingMoney) {
        sendError(player, baseText(player, "Make room for the money reward by spending some gold.", "Освободите место под денежную награду: потратьте часть золота."));
        sendState(player, false);
        return;
    }

    if (state.gemDelivered == 0) {
        const before = Number(player.GetItemCount(state.activeGemItem, false));
        player.AddItem(state.activeGemItem, 1);
        const added = Number(player.GetItemCount(state.activeGemItem, false)) - before;
        if (added < 1) {
            sendError(player, baseText(player, "There is no room for the reward gem. Free a slot and turn the order in again; its completion is saved.", "Для камня награды нет места. Освободите слот и повторите сдачу; выполненный заказ сохранён."));
            sendState(player, false);
            return;
        }
        state.gemDelivered = 1;
        state.Save();
    }

    if (remainingMoney > 0) {
        const before = Number(player.GetMoney());
        player.ModifyMoney(remainingMoney);
        state.moneyGranted += Math.max(0, Number(player.GetMoney()) - before);
        state.Save();
        if (state.moneyGranted < state.activeMoney) {
            sendError(player, baseText(player, "The money reward was not granted in full; make room below the gold cap and turn the order in again.", "Денежная награда выдана не полностью; освободите лимит золота и повторите сдачу."));
            sendState(player, false);
            return;
        }
    }

    clearActive(state);
    state.Save();
    player.SendBroadcastMessage(baseText(player, "Order completed: you received money and a random ability gem.", "Заказ выполнен: деньги и случайный камень способности получены."));
    sendState(player, false);
}

function abandonOrder(player: TSPlayer, msg: OrderAbandonMsg): void {
    if (!requireBoard(player)) return;
    const state = BaseOrderState.get(player);
    if (state.activeToken == 0 || msg.activeToken != state.activeToken) {
        sendError(player, baseText(player, "The order has already been completed or changed.", "Заказ уже завершён или изменился."));
        sendState(player, false);
        return;
    }
    clearActive(state);
    state.Save();
    player.SendBroadcastMessage(baseText(player, "Order abandoned. You can select a new task during the board's next cycle.", "Заказ отменён. Новое задание можно будет выбрать в следующем цикле доски."));
    sendState(player, false);
}

function spellCreatesItem(spell: TSSpell, itemEntry: number): boolean {
    const info = spell.GetSpellInfo();
    for (let i = 0; i < 3; i++) {
        const effect = info.GetEffect(i);
        if (effect.IsEffect() && Number(effect.GetItemType()) == itemEntry) return true;
    }
    return false;
}

export function InitializeBaseOrders(events: TSEvents): void {
    events.GameObject.OnGossipHello(ORDER_BOARD_ENTRY, (object, player, cancel) => {
        cancel.set(true);
        if (!ownsBoardObject(player, object)) {
            player.SendBroadcastMessage(baseText(player, "This order board belongs to another player.", "Это чужая доска заказов."));
            return;
        }
        sendState(player, true);
    });

    events.CustomPacket.OnReceive(OP_ORDER_REQUEST, (opcode, packet, player) => {
        const msg = new OrderRequestMsg();
        msg.read(packet);
        if (requireBoard(player)) sendState(player, true);
    });

    events.CustomPacket.OnReceive(OP_ORDER_ACCEPT, (opcode, packet, player) => {
        const msg = new OrderAcceptMsg();
        msg.read(packet);
        acceptOrder(player, msg);
    });

    events.CustomPacket.OnReceive(OP_ORDER_TURN_IN, (opcode, packet, player) => {
        const msg = new OrderTurnInMsg();
        msg.read(packet);
        turnInOrder(player, msg);
    });

    events.CustomPacket.OnReceive(OP_ORDER_ABANDON, (opcode, packet, player) => {
        const msg = new OrderAbandonMsg();
        msg.read(packet);
        abandonOrder(player, msg);
    });

    events.Player.OnCreatureKill((player, killed) => {
        const state = BaseOrderState.get(player);
        if (state.activeType != ORDER_KILL || state.activeProgress >= state.activeRequired) return;
        if (Number(killed.GetEntry()) != state.activeTarget || killed.GetOwner()) return;
        const template = GetCreatureTemplate(state.activeTarget);
        if (!template || Number(template.GetRank()) == 3) return;
        const typeFlags = Number(template.GetTypeFlags());
        if ((typeFlags & CREATURE_TYPE_FLAG_BOSS_MOB) != 0
            || (typeFlags & CREATURE_TYPE_FLAG_QUEST_BOSS) != 0) return;
        state.activeProgress++;
        state.Save();
        sendState(player, false);
    });

    // Snapshot before the cast; AfterCast below only credits a real inventory increase.
    events.Player.OnSpellCast((player, spell, skipCheck) => {
        const state = BaseOrderState.get(player);
        if (state.activeType != ORDER_CRAFT || state.activeProgress >= state.activeRequired) return;
        if (Number(spell.GetEntry()) != state.activeRecipe) return;
        const watch = craftWatch(player);
        watch.activeToken = state.activeToken;
        watch.recipe = state.activeRecipe;
        watch.target = state.activeTarget;
        watch.beforeCount = Number(player.GetItemCount(state.activeTarget, false));
    });

    // Global successful-cast hook: automated stations never emit the player's recipe cast.
    events.Spell.OnAfterCast((spell, cancel) => {
        const player = spell.GetCaster().ToPlayer();
        if (!player) return;
        const state = BaseOrderState.get(player);
        if (state.activeType != ORDER_CRAFT || state.activeProgress >= state.activeRequired) return;
        if (Number(spell.GetEntry()) != state.activeRecipe) return;
        if (!spellCreatesItem(spell, state.activeTarget)) return;
        const watch = craftWatch(player);
        if (watch.activeToken != state.activeToken || watch.recipe != state.activeRecipe || watch.target != state.activeTarget) return;
        const created = Number(player.GetItemCount(state.activeTarget, false)) - watch.beforeCount;
        watch.activeToken = 0;
        watch.recipe = 0;
        watch.target = 0;
        watch.beforeCount = 0;
        if (created <= 0) return;
        state.activeProgress++;
        state.Save();
        sendState(player, false);
    });
}
