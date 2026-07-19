import { BuyItemPayload } from "../../../shared/Payloads/BuyItemPayload";
import { StoreItem, StoreItemFlags } from "../../../shared/Payloads/StoreItemPayload";
import { createIcon } from "./Icon";
import { storeText, styleText } from "../Theme";

const itemFramesList: WoWAPI.Frame[] = [];

export function createAllItems(shopFrame: WoWAPI.Frame) {
    const cardW = shopFrame.GetWidth() / 5.75;
    const cardH = shopFrame.GetHeight() / 2.5;
    const basePosX = shopFrame.GetWidth() * 0.26;
    const basePosY = -shopFrame.GetHeight() * 0.10;
    const stepX = (shopFrame.GetWidth() * 0.98 - basePosX - cardW) / 3;
    const stepY = cardH * 1.06;
    for (let i = 0; i < 8; i++) {
        const posX = basePosX + (i % 4) * stepX;
        const posY = basePosY - Math.floor(i / 4) * stepY;
        const itemFrame = CreateFrame("Frame", "Item" + i, shopFrame);
        itemFrame.SetID(i)
        itemFrame.SetSize(cardW, cardH);
        itemFrame.EnableMouse(true)
        itemFrame.SetPoint("TOPLEFT", posX, posY);
        itemFrame.Hide()

        itemFrame.SetScript("OnEnter", function () {
            itemFrame['hoverTexture'].Show();
            SetCursor("INSPECT_CURSOR");
        })

        itemFrame.SetScript("OnLeave", function () {
            itemFrame['hoverTexture'].Hide();
            SetCursor("POINT_CURSOR");
        })

        itemFrame['hoverTexture'] = itemFrame.CreateTexture("", "OVERLAY")
        itemFrame['hoverTexture'].SetAllPoints(itemFrame)
        itemFrame['hoverTexture'].SetTexture("Interface\\AddOns\\dh-store-assets\\NewStoreMain.blp")
        itemFrame['hoverTexture'].SetTexCoord(0.349609375, 0.491046875, 0.645625000, 0.849609375)
        itemFrame['hoverTexture'].Hide()

        itemFrame['itemTexture'] = itemFrame.CreateTexture("", "ARTWORK");
        itemFrame['itemTexture'].SetAllPoints();
        itemFrame['itemTexture'].SetTexture("Interface\\AddOns\\dh-store-assets\\item-sale-bg.blp");
        itemFrame['itemTexture'].SetTexCoord(0.035156250, 0.601562500, 0.039062500, 0.849062500);

        itemFrame['itemString'] = itemFrame.CreateFontString("itemName" + i, "OVERLAY", "GameFontNormal");
        styleText(itemFrame['itemString'], 12);
        itemFrame['itemString'].SetPoint("TOP", itemFrame, "TOP", 0, -124);
        itemFrame['itemString'].SetWidth(itemFrame.GetWidth() - 20)
        itemFrame['itemString'].SetWordWrap(true)

        itemFrame[`activeItemTexture`] = itemFrame.CreateTexture("", "ARTWORK");
        itemFrame['activeItemTexture'].SetAllPoints();
        itemFrame['activeItemTexture'].SetTexture("Interface\\AddOns\\dh-store-assets\\NewStoreMain.blp");
        itemFrame['activeItemTexture'].SetTexCoord(0.208984375, 0.350953125, 0.646000000, 0.850000000);
        itemFrame['activeItemTexture'].Hide()

        itemFrame['icon'] = createIcon(itemFrame, i, { point: "TOP", offsetX: 0, offsetY: -32 }, { width: 72, height: 72 },);
        itemFrame['icon'].EnableMouse(true)
        itemFrame['icon'].SetScript("OnLeave", function () { GameTooltip.Hide(); })

        itemFrame['buyButton'] = createBuyButton(itemFrame, i);
        itemFrame['costIcon'] = createCostIcon(itemFrame['buyButton'], i);
        itemFramesList.push(itemFrame);
    }
    return itemFramesList;
}

export function updateItems(shopFrame: WoWAPI.Frame, items: TSArray<StoreItem>, currentTab: number, currentPage: number) {
    for (let i = 0; i < 8; i++) {
        const item = items[i];
        if (items[i] != null) {
            const itemFrame = itemFramesList[i];
            itemFrame['itemString'].SetText(item.Name);
            //itemFrame['descString'].SetText(item.Description);
            itemFrame['icon']['texture'].SetTexture(GetItemIcon(item.PurchaseID) || "Interface\\Icons\\INV_Misc_QuestionMark");
            const frameID = itemFrame.GetID() + (currentPage * 8);

            itemFrame.SetScript("OnMouseDown", function () {
                if (containsFlag(item.Flags, StoreItemFlags.isEquipment)) {
                    _G['shopCreatureModelFrame'].Hide()
                    _G['shopPlayerModelFrame'].Hide()
                    _G['shopModelFrame'].Hide()
                    _G['shopPlayerModelFrame'].SetUnit("player")
                    _G['shopPlayerModelFrame'].Show()
                    _G['shopModelFrame'].Show()
                    _G['shopPlayerModelFrame'].TryOn(`item:${item.PurchaseID}`)
                } else if (containsFlag(item.Flags, StoreItemFlags.iSCreature)) {
                    _G['shopPlayerModelFrame'].Hide()
                    _G['shopCreatureModelFrame'].Hide()
                    _G['shopModelFrame'].Hide()
                    _G['shopCreatureModelFrame'].SetCreature(item.ExtraID);
                    _G['shopCreatureModelFrame'].Show()
                    _G['shopModelFrame'].Show()
                }
            });

            itemFrame['icon'].SetScript("OnEnter", () => {
                GameTooltip.SetOwner(shopFrame, "ANCHOR_CURSOR");
                GameTooltip.SetHyperlink(`item:${item.PurchaseID}`)
                GameTooltip.Show();
            })

            itemFrame['buyButton'].SetScript("OnClick", (f, b, d) => {
                buyFrameID = frameID
                buyTabID = currentTab
                //@ts-ignore
                StaticPopup_Show("SHOW_CONFIRM_SALE")
            });

            itemFrame['costIcon']['costText'].SetText(items[i].Cost.toString());
            itemFrame.Show()
        } else {
            itemFramesList[i].Hide()
        }
    }
}

function containsFlag(value, flag) {
    return (value % (2 * flag)) >= flag
}

export function createCostIcon(parentFrame: WoWAPI.Button, index: number) {
    const coinFrame = CreateFrame("Frame", "Coin" + index, parentFrame);
    coinFrame.SetSize((parentFrame.GetWidth() * 40) / 100, parentFrame.GetHeight());
    coinFrame.SetPoint("RIGHT", -10, 0);

    const buttonIcon = createIcon(coinFrame, "Interface\\AddOns\\dh-store-assets\\coin.blp", { point: "RIGHT", offsetX: 0, offsetY: 0 }, { width: (coinFrame.GetWidth() - 28), height: (coinFrame.GetHeight() - 13 ) });
    buttonIcon.Show();

    coinFrame['costText'] = coinFrame.CreateFontString(null, "OVERLAY", "GameFontNormal");
    styleText(coinFrame['costText'], 11);
    coinFrame['costText'].SetPoint("RIGHT", buttonIcon, "LEFT", -2, 0);
    coinFrame['costText'].Show();
    return coinFrame;
}


export function createBuyButton(parentFrame: WoWAPI.Frame, index: number) {
    const button = CreateFrame('Button', 'BuyItemButton' + index, parentFrame);
    button.SetPoint('BOTTOM', parentFrame, 0, 20);
    button.SetSize(parentFrame.GetWidth() * 75 / 100, parentFrame.GetHeight() * 13 / 100);
    button.EnableMouse(true);

    const buttonTexture = button.CreateTexture('');
    buttonTexture.SetTexture("Interface\\AddOns\\dh-store-assets\\StoreFrame_Main.blp");
    buttonTexture.SetTexCoord(0.69287109375, 0.81689453125, 0.82958984375, 0.85205078125);
    buttonTexture.SetAllPoints();

    const highlightText = button.CreateTexture('');
    highlightText.SetTexture("Interface\\AddOns\\dh-store-assets\\StoreFrame_Main.blp")
    highlightText.SetTexCoord(0.69287109375, 0.81689453125, 0.82958984375, 0.85205078125);
    highlightText.SetAllPoints()
    button.SetHighlightTexture(highlightText)

    const pushedText = button.CreateTexture('');
    pushedText.SetTexture("Interface\\AddOns\\dh-store-assets\\StoreFrame_Main.blp")
    pushedText.SetTexCoord(0.69287109375, 0.81689453125, 0.85302734375, 0.87548828125);
    pushedText.SetAllPoints()
    button.SetPushedTexture(pushedText);

    const buttonText = button.CreateFontString(null, 'OVERLAY', "GameFontNormal");
    buttonText.SetPoint('LEFT', 10, 0);
    styleText(buttonText, 11);
    buttonText.SetText(storeText("Buy", "Купить"));

    return button;
}
let buyFrameID;
let buyTabID;
//@ts-ignore
StaticPopupDialogs["SHOW_CONFIRM_SALE"] = {
    text: storeText("Confirm purchase?", "Подтвердить покупку?"),
    button1: storeText("Yes", "Да"),
    button2: storeText("No", "Нет"),
    OnAccept: function () {
        BuyItem(buyFrameID, buyTabID)
    },
    timeout: 0,
    whileDead: true,
    hideOnEscape: true,
}


export function BuyItem(itemIndex: number, tabIndex: number) {
    let sendingPacket = new BuyItemPayload();
    sendingPacket.ItemIndex = itemIndex;
    sendingPacket.TabIndex = tabIndex;
    sendingPacket.BuildPacket().Send();
}
