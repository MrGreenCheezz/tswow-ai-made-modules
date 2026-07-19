import { createCategories, updateCategories } from "./Components/Categories";
import { createAllItems, updateItems } from "./Components/Items";
import { setupModelFrame } from "./Components/modelFrame";
import { createNavButtons, updateNavButtonScripts } from "./Components/NavButtons";
import { createIcon } from "./Components/Icon";
import { createCloseButton } from "./Components/CloseButton";
import { StoreItemPayload } from "../../shared/Payloads/StoreItemPayload";
import { ClientCallbackOperations, SimpleMessagePayload } from "../../shared/Messages";
import { DonationPointsPayload } from "../../shared/Payloads/DonationPointsPayload";
import { GameMenuButton } from "./Components/GameMenu";
import { configureStoreFrame, registerExclusiveWindow, storeText, styleText } from "./Theme";

let accountPoints = 0;
let storeData: StoreItemPayload = null;
let shopMainFrame = null;
let selectedCategory = -1;
let currentTab = 0;
let currentPage = 0;
let pointsFrameString = null;

export function shopFrameSetup() {
    shopMainFrame = CreateFrame("Frame", "ShopMainFrame", UIParent);
    UISpecialFrames.push(`ShopMainFrame`)
    registerExclusiveWindow(shopMainFrame);
    configureStoreFrame(shopMainFrame);
    shopMainFrame.SetPoint("CENTER");
    shopMainFrame.SetScript("OnShow", () => {
        PlaySound("igMainMenuOpen");
    })

    shopMainFrame.SetScript("OnHide", () => { _G['shopModelFrame'].Hide(), PlaySound("igMainMenuClose"); })
    shopMainFrame.SetMovable(true);
    shopMainFrame.EnableMouse(true)
    shopMainFrame.RegisterForDrag("LeftButton");
    shopMainFrame.SetScript("OnDragStart", () => { shopMainFrame.StartMoving(); });
    shopMainFrame.SetScript("OnDragStop", () => { shopMainFrame.StopMovingOrSizing(); });

    let shopMainFrameTexture = shopMainFrame.CreateTexture();
    shopMainFrameTexture.SetAllPoints();
    shopMainFrameTexture.SetTexture("Interface\\AddOns\\dh-store-assets\\NewStoreMain.blp");
    shopMainFrameTexture.SetTexCoord(0, 0.789062500, 0, 0.539062500);

    const title = shopMainFrame.CreateFontString(null, "OVERLAY", "GameFontNormal");
    styleText(title, 16);
    title.SetPoint("TOP", shopMainFrame, "TOP", 0, -18);
    title.SetTextColor(1, 0.86, 0.32);
    title.SetText(storeText("Store", "Магазин"));

    pointsFrameString = shopMainFrame.CreateFontString(null, "OVERLAY", "GameFontNormal");
    styleText(pointsFrameString, 12);
    pointsFrameString.SetText(`${accountPoints}`);

    let shopCoin = createIcon(shopMainFrame, "Interface\\AddOns\\dh-store-assets\\coin.blp", { point: "BOTTOMLEFT", offsetX: 75, offsetY: 28 }, { width: 12, height: 14 }, "OVERLAY");
    pointsFrameString.SetPoint("BOTTOMLEFT", shopCoin, 15, 0);

    setupModelFrame()
    createNavButtons(shopMainFrame);
    createAllItems(shopMainFrame)
    createCloseButton(shopMainFrame, { width: 30, height: 30 }, () => { shopMainFrame.Hide(); });
    GameMenuButton(shopMainFrame, storeText("Store", "Магазин"));
    createCategories(shopMainFrame)
    StoreCallbacks()
    shopMainFrame.Hide();
}

export function ShopFrameUpdate() {
    if (!storeData || storeData.AllItems.length === 0) {
        selectedCategory = -1;
        currentTab = 0;
        currentPage = 0;
        updateCategories([]);
        updateItems(shopMainFrame, [], currentTab, currentPage);
        updateNavButtonScripts(currentTab, currentPage, shopMainFrame, []);
        return;
    }

    let catButtons = updateCategories(storeData.AllItems.map((collection) => collection.Items[0].Category))
    catButtons.forEach((catButton, i) => {
        catButton.catButton.SetScript("OnClick", (frame, button, down) => {
            if (selectedCategory !== -1) {
                let previousCatButton = catButtons[selectedCategory]
                previousCatButton.activeTexture.Hide()
            }

            selectedCategory = i;
            let currentCatButton = catButtons[selectedCategory]
            currentCatButton.activeTexture.Show()

            currentTab = i
            currentPage = 0
            updateItems(shopMainFrame, storeData.AllItems[currentTab].Items.slice(currentPage * 8, (currentPage * 8) + 8), currentTab, currentPage)
            updateNavButtonScripts(currentTab, currentPage, shopMainFrame, storeData.AllItems[currentTab].Items)

            _G['shopCreatureModelFrame'].Hide()
            _G['shopPlayerModelFrame'].Hide()
            _G['shopModelFrame'].Hide();
        });
    });
    updateItems(shopMainFrame, storeData.AllItems[currentTab].Items, currentTab, currentPage);
    updateNavButtonScripts(currentTab, currentPage, shopMainFrame, storeData.AllItems[currentTab].Items)
}

function StoreCallbacks() {
    OnCustomPacket(ClientCallbackOperations.RECEIVE_ITEMS, (pkt) => {
        const data = new StoreItemPayload();
        storeData = data.read(pkt);
        ShopFrameUpdate();
        _G['ShopMainFrame'].Hide()
    });

    OnCustomPacket(ClientCallbackOperations.GET_POINTS, (pkt) => {
        const data = new DonationPointsPayload();
        let returnData = data.read(pkt);
        accountPoints = returnData.points;
        pointsFrameString.SetText(`${accountPoints}`);
    });
    // Запрашивать данные только когда игрок полностью в мире: на этапе загрузки
    // аддона клиентский транспорт tswow ещё может быть не готов.
    const bootstrap = CreateFrame("Frame");
    bootstrap.RegisterEvent("PLAYER_ENTERING_WORLD");
    bootstrap.SetScript("OnEvent", () => {
        if (!(_G as any)._CLIENT_NETWORK) return;
        new SimpleMessagePayload(ClientCallbackOperations.REQUEST_ITEMS, "").write().Send();
        new SimpleMessagePayload(ClientCallbackOperations.REQUEST_POINTS, "").write().Send();
    });
}
