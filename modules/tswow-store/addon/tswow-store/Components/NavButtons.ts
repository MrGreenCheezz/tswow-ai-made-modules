import { StoreItem } from "../../../shared/Payloads/StoreItemPayload";
import { updateItems } from "./Items";
import { styleText } from "../Theme";

let leftButton: WoWAPI.Button;
let rightButton: WoWAPI.Button;
let pageText: WoWAPI.FontString;

function refreshNavState(currentPage: number, itemCount: number): void {
    const pageCount = Math.max(1, Math.ceil(itemCount / 8));
    pageText.SetText(`${currentPage + 1}/${pageCount}`);
    if (currentPage <= 0) {
        leftButton.Disable();
        leftButton.SetAlpha(0.35);
    } else {
        leftButton.Enable();
        leftButton.SetAlpha(1);
    }
    if (currentPage >= pageCount - 1) {
        rightButton.Disable();
        rightButton.SetAlpha(0.35);
    } else {
        rightButton.Enable();
        rightButton.SetAlpha(1);
    }
}

export function createNavButtons(parent: WoWAPI.Frame) {
    leftButton = CreateFrame("Button", "leftNavButton", parent);
    leftButton.SetSize(30, 24);
    leftButton.SetPoint("BOTTOM", parent, "BOTTOM", 60, 24);

    let leftText = leftButton.CreateTexture();
    leftText.SetAllPoints();
    leftText.SetTexture("Interface\\AddOns\\dh-store-assets\\StoreFrame_Main.blp");
    leftText.SetTexCoord(0.84814453125, 0.87744140625, 0.84619140625, 0.87548828125);
    leftButton.Show();

    rightButton = CreateFrame("Button", "rightNavButton", parent);
    rightButton.SetSize(30, 24);
    rightButton.SetPoint("CENTER", leftButton, 34, 0);

    let rightText = rightButton.CreateTexture();
    rightText.SetAllPoints();
    rightText.SetTexture("Interface\\AddOns\\dh-store-assets\\StoreFrame_Main.blp");
    rightText.SetTexCoord(0.93896484375, 0.96826171875, 0.84619140625, 0.87548828125);

    rightButton.Show();

    pageText = parent.CreateFontString(null, "OVERLAY", "GameFontNormal");
    styleText(pageText, 11);
    pageText.SetPoint("LEFT", rightButton, "RIGHT", 8, 0);
}

export function updateNavButtonScripts(currentTab: number, currentPage: number, parentFrame: WoWAPI.Frame, storeItems: StoreItem[]) {
    refreshNavState(currentPage, storeItems.length);
    leftButton.SetScript("OnClick", (f, button, down) => {
        if (currentPage == 0) return;
        currentPage--;
        updateItems(parentFrame, storeItems.slice(currentPage * 8, (currentPage * 8) + 8), currentTab, currentPage)
        refreshNavState(currentPage, storeItems.length);
    });
    rightButton.SetScript("OnClick", (f, button, down) => {
        if (Math.ceil(storeItems.length / 8) <= currentPage + 1) {
            return;
        }
        currentPage++;
        updateItems(parentFrame, storeItems.slice(currentPage * 8, (currentPage * 8) + 8), currentTab, currentPage)
        refreshNavState(currentPage, storeItems.length);
    });
}
