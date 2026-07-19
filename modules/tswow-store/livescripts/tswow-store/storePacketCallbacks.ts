/**
 * Store — серверные обработчики пакетов.
 *
 * ПЕРЕПИСАНО под lua-бэкенд tswow: CreateDictionary/TSDictionary здесь мертвы
 * (методов .set/.get/.keys нет в рантайме) — используем плоские объекты.
 * Покупка выдаёт предмет напрямую в сумки (SendGMMail не забинжен в lua).
 */
import { ClientCallbackOperations } from "../../shared/Messages";
import { BuyItemPayload } from "../../shared/Payloads/BuyItemPayload";
import { DonationPointsPayload } from "../../shared/Payloads/DonationPointsPayload";
import { StoreItem, StoreItemPayload } from "../../shared/Payloads/StoreItemPayload";
import { setupItems } from "./retrieveItems";

export const accountPoints: { [account: number]: number } = {};
export const itemDict: { [tab: number]: { [index: number]: StoreItem } } = {};
let storePayload: StoreItemPayload;

function isRussian(player: TSPlayer): boolean {
    return Number(player.GetDbcLocale()) == LocaleConstant.ruRU;
}

function localize(player: TSPlayer, english: string, russian: string): string {
    return isRussian(player) ? russian : english;
}

export function StorePacketCallbacks(events: TSEvents) {
    storePayload = setupItems(itemDict);

    events.Player.OnLogin((player, firstLogin) => {
        LoadAccountToCache(player.GetAccountID(), true);
        // НЕ шлём кастомные пакеты в OnLogin: у нового персонажа клиентский
        // сетевой слой ещё не готов (__FireCustomPacket nil). Клиент сам
        // запрашивает поинты и товары при загрузке аддона.
        const extraIDQuery = QueryWorld("SELECT DISTINCT extra_id FROM store_items");
        const extraIDs: number[] = [];
        while (extraIDQuery.GetRow()) {
            extraIDs.push(extraIDQuery.GetUInt32(0));
        }
        extraIDs.forEach((extraID) => {
            if (extraID > 0) player.SendCreatureQueryPacket(extraID);
        });
    });

    packetFunctions(events);
    reloadCommand(events);
}

function packetFunctions(events: TSEvents) {
    events.CustomPacket.OnReceive(ClientCallbackOperations.REQUEST_ITEMS, (op, packet, player) => {
        storePayload.BuildPacket(isRussian(player)).SendToPlayer(player);
    });

    events.CustomPacket.OnReceive(ClientCallbackOperations.REQUEST_POINTS, (op, packet, player) => {
        LoadAccountToCache(player.GetAccountID(), false);
        sendPoints(player);
    });

    events.CustomPacket.OnReceive(ClientCallbackOperations.BUY_ITEM, (op, packet, player) => {
        const buyPacket = new BuyItemPayload();
        buyPacket.read(packet);
        const tabIndex = buyPacket.TabIndex;
        const itemIndex = buyPacket.ItemIndex;

        if (!checkItem(tabIndex, itemIndex)) {
            player.SendAreaTriggerMessage(localize(player, "Store item not found.", "Товар магазина не найден."));
            return;
        }

        const itemObj = itemDict[tabIndex][itemIndex];

        if (checkIfPlayerPoor(player.GetAccountID(), itemObj.Cost)) {
            player.SendAreaTriggerMessage(localize(player, "Not enough bonus points.", "Недостаточно бонусных очков."));
            return;
        }

        // SendGMMail не забинжен в lua — выдаём напрямую и не списываем
        // очки, если в сумках нет места.
        if (!player.AddItem(itemObj.PurchaseID, 1)) {
            player.SendAreaTriggerMessage(localize(player, "Free up some bag space.", "Освободите место в сумках."));
            return;
        }

        decrementPoints(player, itemObj.Cost);
        logBuyItem(player, itemObj);
        player.SendAreaTriggerMessage(localize(player, "Thank you for your purchase!", "Спасибо за покупку!"));
        sendPoints(player);
    });
}

function LoadAccountToCache(accountID: number, force: bool) {
    if (accountPoints[accountID] !== undefined && !force) return;
    const pointsQuery = QueryAuth(`SELECT donation_points FROM account WHERE id = ${accountID};`);
    while (pointsQuery.GetRow()) {
        let points = pointsQuery.GetInt32(0);
        if (points < 0) points = 0;
        accountPoints[accountID] = points;
    }
}

function logBuyItem(player: TSPlayer, item: StoreItem) {
    QueryWorld(`INSERT INTO store_audit (cost, name, description, account_id) VALUES (${item.Cost}, "${item.Name}", "${item.Description}", ${player.GetAccountID()})`);
}

function sendPoints(player: TSPlayer) {
    const payload = new DonationPointsPayload();
    payload.points = accountPoints[player.GetAccountID()] || 0;
    payload.BuildPacket().SendToPlayer(player);
}

function checkItem(tabIndex: number, itemIndex: number): boolean {
    if (itemDict[tabIndex] === undefined) return false;
    if (itemDict[tabIndex][itemIndex] === undefined) return false;
    return true;
}

function decrementPoints(player: TSPlayer, cost: number) {
    const accID = player.GetAccountID();
    QueryAuth(`UPDATE account SET donation_points = donation_points - ${cost} WHERE id = ${accID}`);
    accountPoints[accID] = (accountPoints[accID] || 0) - cost;
}

function checkIfPlayerPoor(accID: number, cost: number) {
    return (accountPoints[accID] || 0) < cost;
}

function reloadCommand(events: TSEvents) {
    events.Player.OnCommand((player, command, found) => {
        if (player.IsPlayer() && player.IsInWorld()) {
            const commandText = command.get();
            if (commandText === "reload store_items") {
                if (player.GetGMRank() >= 1) {
                    storePayload = setupItems(itemDict);
                    player.SendAreaTriggerMessage(localize(player, "The store_items table has been reloaded.", "Таблица store_items перезагружена."));
                } else {
                    player.SendAreaTriggerMessage(localize(player, "You do not have sufficient GM permissions for this command.", "Недостаточно прав GM для этой команды."));
                }
                found.set(true);
            }
        }
    });
}
