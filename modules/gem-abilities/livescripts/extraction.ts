/** Server-authoritative extraction of ability gems from carried equipment. */

import {
    GemExtractRequest, OP_GEM_EXTRACT, resolveSocketItemPosition,
} from "../shared/SocketMessages";
import { disableAutoFill, templateSocketCount } from "./fill";
import { recomputeAbilities } from "./grant";
import { itemForEnchant } from "./maps";

const SOCKET_ENCHANTMENT_SLOTS: number[] = [2, 3, 4];
const BONUS_ENCHANTMENT_SLOT = 5;

function playerText(player: TSPlayer, english: string, russian: string): string {
    return Number(player.GetDbcLocale ? player.GetDbcLocale() : 8) == 8 ? russian : english;
}

function sendError(player: TSPlayer, english: string, russian: string): void {
    player.SendBroadcastMessage(
        playerText(player, "|cffff5555Ability Gems:|r " + english, "|cffff5555Камни способностей:|r " + russian),
    );
}

function removeAddedItems(player: TSPlayer, added: TSItem[]): void {
    for (let i = added.length - 1; i >= 0; i--) {
        player.RemoveItem(added[i], 1);
    }
}

export function extractAbilityGems(player: TSPlayer, request: GemExtractRequest): void {
    if (!player.IsAlive()) {
        sendError(player, "only living characters can extract gems.", "извлекать камни можно только живым персонажем.");
        return;
    }
    if (player.IsInCombat()) {
        sendError(player, "gems cannot be extracted in combat.", "нельзя извлекать камни в бою.");
        return;
    }

    const position = resolveSocketItemPosition(request.location, request.bag, request.slot);
    if (position.length != 2) {
        sendError(player, "the socketing window points to an unsupported item.", "окно инкрустации указывает на неподдерживаемый предмет.");
        return;
    }
    const item = player.GetItemByPos(position[0], position[1]);
    if (!item) {
        sendError(player, "the item is no longer in the selected slot.", "предмет больше не находится в выбранной ячейке.");
        return;
    }
    if (item.IsInTrade()) {
        sendError(player, "this item is currently involved in another operation.", "этот предмет сейчас занят другой операцией.");
        return;
    }

    const enchantments: number[] = [];
    const enchantmentSlots: number[] = [];
    const gemItems: number[] = [];
    let removedStaticSocket = false;
    const staticSocketCount = templateSocketCount(item.GetTemplate());
    for (let i = 0; i < SOCKET_ENCHANTMENT_SLOTS.length; i++) {
        const enchantment = Number(item.GetEnchantmentID(SOCKET_ENCHANTMENT_SLOTS[i]));
        const gemItem = itemForEnchant(enchantment);
        if (enchantment <= 0 || gemItem <= 0) continue; // не трогаем обычные камни
        enchantments.push(enchantment);
        enchantmentSlots.push(SOCKET_ENCHANTMENT_SLOTS[i]);
        gemItems.push(gemItem);
        if (i < staticSocketCount) removedStaticSocket = true;
    }
    if (gemItems.length == 0) {
        sendError(player, "this item has no extractable ability gems.", "в этом предмете нет извлекаемых камней способностей.");
        return;
    }

    // Reserve every returned gem before touching the item. AddItem handles
    // stacks and unique limits; a partial reservation is rolled back exactly.
    const added: TSItem[] = [];
    for (let i = 0; i < gemItems.length; i++) {
        const returnedGem = player.AddItem(gemItems[i], 1);
        if (!returnedGem) {
            removeAddedItems(player, added);
            sendError(player, "there is not enough bag space for all extracted gems.", "в сумках недостаточно места для всех извлекаемых камней.");
            return;
        }
        added.push(returnedGem);
    }

    let cleared = 0;
    for (let i = 0; i < enchantmentSlots.length; i++) {
        if (!item.ClearEnchantment(enchantmentSlots[i])) {
            for (let restore = 0; restore < cleared; restore++) {
                item.SetEnchantment(enchantments[restore], enchantmentSlots[restore]);
            }
            removeAddedItems(player, added);
            item.SaveToDB();
            sendError(player, "extraction cancelled because the item changed.", "извлечение отменено: предмет успел измениться.");
            return;
        }
        cleared++;
    }

    // An empty static socket invalidates the item's native socket bonus. A gem
    // removed only from an extra prismatic socket must not remove that bonus.
    if (removedStaticSocket && item.GetEnchantmentID(BONUS_ENCHANTMENT_SLOT) > 0) {
        item.ClearEnchantment(BONUS_ENCHANTMENT_SLOT);
    }
    disableAutoFill(item);
    item.SaveToDB();
    recomputeAbilities(player);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff55ff55Ability Gems:|r extracted: " + gemItems.length + ".",
        "|cff55ff55Камни способностей:|r извлечено: " + gemItems.length + ".",
    ));
}

export function RegisterGemExtraction(events: TSEvents): void {
    events.CustomPacket.OnReceive(OP_GEM_EXTRACT, (opcode, packet, player) => {
        const request = new GemExtractRequest();
        request.read(packet);
        extractAbilityGems(player, request);
    });
}
