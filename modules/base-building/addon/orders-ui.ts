import {
    OP_ORDER_STATE, ORDER_MATERIAL, ORDER_CRAFT, ORDER_KILL,
    OrderOfferView, OrderStateMsg, OrderRequestMsg, OrderAcceptMsg, OrderTurnInMsg, OrderAbandonMsg,
} from "../shared/BaseOrders";
import {
    ActionButton, STORE_FONT, createActionButton, createSidePanel, createStoreWindow, fmtGold,
} from "./StoreStyle";
import { uiText } from "./locale";

interface OfferWidgets {
    panel: WoWAPI.Frame;
    body: WoWAPI.FontString;
    reward: WoWAPI.FontString;
    action: ActionButton;
}

let frame: WoWAPI.Frame | undefined;
let refreshText: WoWAPI.FontString | undefined;
let offerWidgets: OfferWidgets[] = [];
let activeBody: WoWAPI.FontString | undefined;
let activeReward: WoWAPI.FontString | undefined;
let turnIn: ActionButton | undefined;
let abandon: ActionButton | undefined;
let state = new OrderStateMsg();
let stateReceivedAt = 0;
let refreshRequested = false;

function send(packet: TSPacketWrite): void {
    if (!(_G as any)._CLIENT_NETWORK) {
        print(uiText(
            "|cffff6060Order Board: TSWoW transport is not loaded.|r",
            "|cffff6060Доска заказов: транспорт TSWoW не загружен.|r",
        ));
        return;
    }
    packet.Send();
}

function typeText(type: number): string {
    if (type == ORDER_MATERIAL) return uiText("Deliver", "Принести");
    if (type == ORDER_CRAFT) return uiText("Craft", "Изготовить");
    if (type == ORDER_KILL) return uiText("Destroy", "Уничтожить");
    return uiText("Unavailable", "Недоступно");
}

function offerDescription(offer: OrderOfferView): string {
    if (offer.target <= 0 || offer.required <= 0) return offer.name;
    const count = offer.type == ORDER_CRAFT ? "" : ` × ${offer.required}`;
    return `|cffffd45c${typeText(offer.type)}:|r ${offer.name}${count}\n`
        + `${uiText("Order tier", "Уровень заказа")}: ${offer.tier}/5`;
}

function remainingRefresh(): number {
    return Math.max(0, state.refreshSeconds - (GetTime() - stateReceivedAt));
}

function clockText(seconds: number): string {
    const total = Math.ceil(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return uiText(`${hours} h ${minutes} min`, `${hours} ч ${minutes} мин`);
}

function setActionEnabled(action: ActionButton, enabled: boolean): void {
    if (enabled) {
        action.button.Enable();
        action.label.SetTextColor(1, 0.82, 0);
    } else {
        action.button.Disable();
        action.label.SetTextColor(0.55, 0.55, 0.55);
    }
}

function refresh(): void {
    if (!frame) return;
    const bySlot: { [slot: number]: OrderOfferView } = {};
    for (let i = 0; i < state.offers.length; i++) bySlot[state.offers[i].slot] = state.offers[i];

    for (let slot = 1; slot <= 3; slot++) {
        const widgets = offerWidgets[slot - 1];
        const offer = bySlot[slot] || new OrderOfferView(slot);
        widgets.body.SetText(offerDescription(offer));
        widgets.reward.SetText(offer.money > 0
            ? uiText(
                `Reward: ${fmtGold(offer.money)} + random ability gem`,
                `Награда: ${fmtGold(offer.money)} + случайный камень способности`,
            )
            : uiText("Reward unavailable", "Награда недоступна"));
        let label = uiText("Accept", "Принять");
        if (state.activeToken != 0) label = uiText("Active order in progress", "Есть активный заказ");
        else if (state.acceptedThisCycle == 1) label = uiText("Already chosen this cycle", "Уже выбран в этом цикле");
        else if (offer.target <= 0) label = uiText("Unavailable", "Недоступно");
        widgets.action.label.SetText(label);
        setActionEnabled(
            widgets.action,
            state.activeToken == 0 && state.acceptedThisCycle == 0 && offer.target > 0 && offer.required > 0,
        );
    }

    if (state.activeToken == 0) {
        if (activeBody) activeBody.SetText(uiText(
            "There is no active order. Choose one of the three offers above.",
            "Активного заказа нет. Выберите одно из трёх предложений выше.",
        ));
        if (activeReward) activeReward.SetText("");
        if (turnIn) {
            turnIn.label.SetText(uiText("Turn In Order", "Сдать заказ"));
            setActionEnabled(turnIn, false);
        }
        if (abandon) setActionEnabled(abandon, false);
    } else {
        const visibleProgress = state.activeType == ORDER_MATERIAL
            ? Math.min(state.activeRequired, state.activeDeposited + GetItemCount(state.activeTarget))
            : state.activeProgress;
        const required = state.activeType == ORDER_CRAFT ? "" : ` × ${state.activeRequired}`;
        if (activeBody) activeBody.SetText(
            `|cffffd45c${typeText(state.activeType)}:|r ${state.activeName}${required}\n` +
            uiText(
                `Progress: ${visibleProgress}/${state.activeRequired}    Tier: ${state.activeTier}/5`,
                `Прогресс: ${visibleProgress}/${state.activeRequired}    Уровень: ${state.activeTier}/5`,
            ) + (state.activeType == ORDER_MATERIAL ? uiText(
                `\nAlready deposited: ${state.activeDeposited}/${state.activeRequired}`,
                `\nУже внесено: ${state.activeDeposited}/${state.activeRequired}`,
            ) : ""),
        );
        if (activeReward) activeReward.SetText(
            uiText(
                `On turn-in: ${fmtGold(state.activeMoney)} + locked random ability gem`,
                `При сдаче: ${fmtGold(state.activeMoney)} + зафиксированный случайный камень способности`,
            ),
        );
        if (turnIn) {
            const complete = visibleProgress >= state.activeRequired;
            const canDeposit = state.activeType == ORDER_MATERIAL && GetItemCount(state.activeTarget) > 0;
            turnIn.label.SetText(complete
                ? uiText("Turn In Order", "Сдать заказ")
                : (canDeposit
                    ? uiText("Deposit Materials", "Внести материалы")
                    : uiText("Requirements Not Met", "Условия не выполнены")));
            setActionEnabled(turnIn, complete || canDeposit);
        }
        if (abandon) setActionEnabled(abandon, true);
    }

    if (refreshText) refreshText.SetText(uiText(
        `New offers in: ${clockText(remainingRefresh())}`,
        `Новые предложения через: ${clockText(remainingRefresh())}`,
    ));
}

function makeOffer(parent: WoWAPI.Frame, title: string, y: number, slot: number): OfferWidgets {
    const panel = createSidePanel(parent, parent.GetWidth() - 70, 105, title);
    panel.SetPoint("TOPLEFT", 35, y);

    const body = panel.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    body.SetFont(STORE_FONT, 11, "OUTLINE");
    body.SetPoint("TOPLEFT", 18, -35);
    body.SetWidth(panel.GetWidth() - 220);
    body.SetJustifyH("LEFT");

    const reward = panel.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    reward.SetFont(STORE_FONT, 10, "OUTLINE");
    reward.SetPoint("BOTTOMLEFT", 18, 15);
    reward.SetWidth(panel.GetWidth() - 220);
    reward.SetJustifyH("LEFT");

    const action = createActionButton(panel, 180, 30, uiText("Accept", "Принять"));
    action.button.SetPoint("RIGHT", -18, 0);
    action.button.SetScript("OnClick", () => {
        send(new OrderAcceptMsg(state.cycleToken, slot).write());
    });
    return { panel: panel, body: body, reward: reward, action: action };
}

function ensureFrame(): WoWAPI.Frame {
    if (frame) return frame;
    frame = createStoreWindow("BaseOrderBoardFrame", uiText("Base Order Board", "Доска заказов базы"));

    refreshText = frame.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    refreshText.SetFont(STORE_FONT, 11, "OUTLINE");
    refreshText.SetPoint("TOP", 0, -50);

    offerWidgets = [
        makeOffer(frame, uiText("Material Delivery", "Поставка материалов"), -72, 1),
        makeOffer(frame, uiText("Crafting Order", "Ремесленный заказ"), -184, 2),
        makeOffer(frame, uiText("Hunting Order", "Охотничий заказ"), -296, 3),
    ];

    const active = createSidePanel(frame, frame.GetWidth() - 70, 115, uiText("Active Order", "Активный заказ"));
    active.SetPoint("TOPLEFT", 35, -416);
    activeBody = active.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    activeBody.SetFont(STORE_FONT, 11, "OUTLINE");
    activeBody.SetPoint("TOPLEFT", 18, -36);
    activeBody.SetWidth(active.GetWidth() - 220);
    activeBody.SetJustifyH("LEFT");
    activeReward = active.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    activeReward.SetFont(STORE_FONT, 10, "OUTLINE");
    activeReward.SetPoint("BOTTOMLEFT", 18, 15);
    activeReward.SetWidth(active.GetWidth() - 220);
    activeReward.SetJustifyH("LEFT");
    turnIn = createActionButton(active, 180, 30, uiText("Turn In Order", "Сдать заказ"));
    turnIn.button.SetPoint("RIGHT", -18, 18);
    turnIn.button.SetScript("OnClick", () => send(new OrderTurnInMsg(state.activeToken).write()));
    abandon = createActionButton(active, 180, 26, uiText("Abandon (No Refund)", "Отказаться (без возврата)"));
    abandon.button.SetPoint("RIGHT", -18, -20);
    abandon.button.SetScript("OnClick", () => send(new OrderAbandonMsg(state.activeToken).write()));

    frame.HookScript("OnShow", () => send(new OrderRequestMsg().write()));
    frame.SetScript("OnUpdate", () => {
        const left = remainingRefresh();
        if (refreshText) refreshText.SetText(uiText(
            `New offers in: ${clockText(left)}`,
            `Новые предложения через: ${clockText(left)}`,
        ));
        if (left <= 0 && !refreshRequested) {
            refreshRequested = true;
            send(new OrderRequestMsg().write());
        }
    });
    refresh();
    return frame;
}

export function initOrdersUI(): void {
    OnCustomPacket(OP_ORDER_STATE, packet => {
        const incoming = new OrderStateMsg();
        incoming.read(packet);
        state = incoming;
        stateReceivedAt = GetTime();
        refreshRequested = false;
        const ui = ensureFrame();
        if (state.openWindow == 1) ui.Show();
        refresh();
    });

    const bagWatcher = CreateFrame("Frame");
    bagWatcher.RegisterEvent("BAG_UPDATE");
    bagWatcher.SetScript("OnEvent", () => {
        if (frame && frame.IsShown() && state.activeType == ORDER_MATERIAL) refresh();
    });
}
