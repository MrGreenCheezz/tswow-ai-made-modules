/**
 * Opens the native gem-socketing window for an equipped item and adds a
 * server-validated ability-gem extraction button to that same window.
 * Usage: /socket <slot>  where slot = head|chest|legs|hands|shoulder|waist|
 *        feet|wrist|hands|mainhand|offhand|ranged|neck|back|finger1|finger2|
 *        trinket1|trinket2
 *
 * SocketInventoryItem / GetInventorySlotInfo are standard 3.3.5 client APIs
 * not present in the generated declarations — declare them as globals so tstl
 * emits a plain call. (Calling via `(_G as any).Fn(x)` compiles to a self-call
 * `_G:Fn(x)` = `Fn(_G, x)`, which shifts the args and breaks the API.)
 */

import {
    GEM_LOCATION_CONTAINER, GEM_LOCATION_EQUIPMENT, GemExtractRequest,
} from "../shared/SocketMessages";

declare function GetInventorySlotInfo(slotName: string): number;
declare function SocketInventoryItem(slotId: number): void;
declare function GetNewSocketInfo(index: number): string | undefined;
declare function CloseSocketInfo(): void;

const RUSSIAN = GetLocale() == "ruRU";

function tr(english: string, russian: string): string {
    return RUSSIAN ? russian : english;
}

const SLOT_NAMES: { [key: string]: string } = {
    head: "HeadSlot",
    neck: "NeckSlot",
    shoulder: "ShoulderSlot",
    back: "BackSlot",
    chest: "ChestSlot",
    wrist: "WristSlot",
    hands: "HandsSlot",
    waist: "WaistSlot",
    legs: "LegsSlot",
    feet: "FeetSlot",
    finger1: "Finger0Slot",
    finger2: "Finger1Slot",
    trinket1: "Trinket0Slot",
    trinket2: "Trinket1Slot",
    mainhand: "MainHandSlot",
    offhand: "SecondaryHandSlot",
    ranged: "RangedSlot",
};

let socketLocation = -1;
let socketBag = 0;
let socketSlot = 0;
let extractButton: any = undefined;

function hasPendingReplacement(): boolean {
    for (let i = 1; i <= 3; i++) {
        if (GetNewSocketInfo(i)) return true;
    }
    return false;
}

function requestExtraction(): void {
    if (socketLocation < 0 || socketSlot <= 0) {
        print(tr(
            "|cffff5555Could not identify the item. Close and reopen the socketing window.|r",
            "|cffff5555Не удалось определить предмет. Закройте и снова откройте окно инкрустации.|r",
        ));
        return;
    }
    if (hasPendingReplacement()) {
        print(tr(
            "|cffffd100Finish or cancel socketing the new gems first.|r",
            "|cffffd100Сначала завершите или отмените установку новых камней.|r",
        ));
        return;
    }
    if (!(_G as any)._CLIENT_NETWORK) {
        print(tr(
            "|cffff5555The gem-extraction connection is not ready yet.|r",
            "|cffff5555Соединение для извлечения камней ещё не готово.|r",
        ));
        return;
    }
    new GemExtractRequest(socketLocation, socketBag, socketSlot).write().Send();
    CloseSocketInfo();
}

function ensureExtractButton(): void {
    const frame = (_G as any).ItemSocketingFrame;
    if (!frame || extractButton) return;
    extractButton = CreateFrame(
        "Button", "GemAbilitiesExtractButton", frame, "UIPanelButtonTemplate",
    );
    extractButton.SetSize(178, 24);
    extractButton.SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", 10, 31);
    extractButton.SetText(tr("Extract Gems", "Извлечь камни"));
    const icon = extractButton.CreateTexture("", "ARTWORK");
    icon.SetTexture("Interface\\Icons\\INV_Misc_Gem_Amethyst_02");
    icon.SetTexCoord(0.08, 0.92, 0.08, 0.92);
    icon.SetSize(16, 16);
    icon.SetPoint("LEFT", extractButton, "LEFT", 10, 0);
    const label = extractButton.GetFontString();
    label.ClearAllPoints();
    label.SetPoint("CENTER", extractButton, "CENTER", 8, 0);
    extractButton.SetScript("OnClick", requestExtraction);
    extractButton.SetScript("OnEnter", () => {
        GameTooltip.SetOwner(extractButton, "ANCHOR_TOP");
        GameTooltip.SetText(tr("Ability Gem Extraction", "Извлечение камней способностей"));
        GameTooltip.AddLine(tr(
            "Returns socketed gems to your bags. New gems must be confirmed or cancelled first.",
            "Возвращает установленные камни в сумки. Новые камни сначала нужно подтвердить или отменить.",
        ), 0.85, 0.85, 0.85, true);
        GameTooltip.Show();
    });
    extractButton.SetScript("OnLeave", () => GameTooltip.Hide());
}

export function initSocketing() {
    // Remember the raw Blizzard location; the server converts and validates it
    // against the player's own inventory before touching any enchantment.
    hooksecurefunc(_G as any, "SocketInventoryItem", (slotId: number) => {
        socketLocation = GEM_LOCATION_EQUIPMENT;
        socketBag = 0;
        socketSlot = slotId;
    });
    hooksecurefunc(_G as any, "SocketContainerItem", (bag: number, slot: number) => {
        socketLocation = GEM_LOCATION_CONTAINER;
        socketBag = bag;
        socketSlot = slot;
    });
    if ((_G as any).ItemSocketingFrame_LoadUI) {
        hooksecurefunc(_G as any, "ItemSocketingFrame_LoadUI", ensureExtractButton);
    }
    ensureExtractButton();

    SlashCmdList.GEM_SOCKET = (msg: string) => {
        const key = (msg || "").toLowerCase().split(" ").join("");
        const slotName = SLOT_NAMES[key];
        if (!slotName) {
            print(tr(
                "|cffffd100/socket <slot>|r — e.g. /socket chest. Slots: head, chest, legs, hands, mainhand ...",
                "|cffffd100/socket <слот>|r — напр. /socket chest. Слоты: head, chest, legs, hands, mainhand ...",
            ));
            return;
        }
        const slotId = GetInventorySlotInfo(slotName);
        SocketInventoryItem(slotId);
    };
    _G.SLASH_GEM_SOCKET1 = "/socket";
}
