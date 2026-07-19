import { createIcon } from "./Icon";
import { storeText, styleText } from "../Theme";

let categoryTable = [
    { nameEn: "Discounts", nameRu: "Скидки", icon: "Interface\\Icons\\INV_Misc_Coin_01", },// 0
    { nameEn: "Convenience", nameRu: "Удобства", icon: "Interface\\Icons\\INV_Misc_Bag_10", },// 1
    { nameEn: "Cosmetics", nameRu: "Косметика", icon: "Interface\\AddOns\\dh-store-assets\\INV_ARMOR_EARTHENCIVILIAN_D_01_belt.blp", },// 2
    { nameEn: "Mounts", nameRu: "Транспорт", icon: "Interface\\Icons\\Ability_Mount_RidingHorse", },// 3
    { nameEn: "Bundles", nameRu: "Наборы", icon: "Interface\\AddOns\\dh-store-assets\\ITEM_VENARI_PARAGONCHEST_02.blp", },// 4
    { nameEn: "Druid Forms", nameRu: "Формы друида", icon: "Interface\\AddOns\\dh-store-assets\\ABILITY_DRUID_SERENEFOCUS.blp" },// 5
    { nameEn: "Warlock Forms", nameRu: "Формы чернокнижника", icon: "Interface\\AddOns\\dh-store-assets\\SPELL_WARLOCK_DEMONSOUL.blp" },// 6
];

let categoryButtons: { catFrame: WoWAPI.Frame; catIcon: WoWAPI.Frame, catString: WoWAPI.FontString, catButton: WoWAPI.Button, activeTexture: WoWAPI.Texture }[] = []
let boundingFrame = null;

export function updateCategories(categories: number[]) {
    boundingFrame.Show();
    categoryTable.forEach((category, i) => {
        let info = categoryButtons[i]
        if (categories.includes(i)) {
            info.catString.SetText(storeText(category.nameEn, category.nameRu));
            info.catString.Show();
            info.catIcon.Show()
            info.catFrame.Show();
        } else {
            info.catString.Hide();
            info.catIcon.Hide()
            info.catFrame.Hide();
        }
    });
    return categories.map(category => categoryButtons[category])
}

export function createCategories(parentFrame: WoWAPI.Frame) {
    boundingFrame = CreateFrame("Frame", "BoundingCategory", parentFrame);
    boundingFrame.SetSize(parentFrame.GetWidth() * 0.225, parentFrame.GetHeight() - 122);
    boundingFrame.SetPoint("TOPLEFT", 18, -70);
    const rowHeight = Math.min(42, boundingFrame.GetHeight() / categoryTable.length);

    categoryTable.forEach((category, i) => {
        let categoryFrame = CreateFrame("Frame", "", boundingFrame);
        categoryFrame.SetSize(boundingFrame.GetWidth() - 8, rowHeight);
        categoryFrame.SetPoint("TOPLEFT", boundingFrame, 0, i * -(rowHeight + 2));

        let categoryButton = CreateFrame("Button", "", categoryFrame);
        categoryButton.SetSize(categoryFrame.GetWidth(), categoryFrame.GetHeight());
        categoryButton.SetPoint("CENTER", categoryFrame, 0, 0);
        categoryButton.RegisterForClicks("AnyDown")

        let text = categoryButton.CreateTexture("");
        text.SetAllPoints();
        text.SetTexture("Interface\\AddOns\\dh-store-assets\\NewStoreMainButton.blp");
        text.SetTexCoord(0.031250000, 0.711250000, 0.171875000, 0.316406250);

        let highlightText = categoryButton.CreateTexture("");
        highlightText.SetAllPoints();
        highlightText.SetTexture("Interface\\AddOns\\dh-store-assets\\NewStoreMainButton.blp");
        highlightText.SetTexCoord(0.031250000, 0.710937500, 0.332031250, 0.476562500);
        categoryButton.SetHighlightTexture(highlightText);

        let categoryString = categoryButton.CreateFontString(null, "OVERLAY", "GameFontNormal");
        styleText(categoryString, 12);
        categoryString.SetPoint("LEFT", categoryFrame, "LEFT", 43, 0);
        categoryString.SetWidth(categoryFrame.GetWidth() - 48);
        categoryString.SetJustifyH("LEFT");
        categoryString.SetText(storeText(category.nameEn, category.nameRu));

        let catBTNActive = categoryButton.CreateTexture(null, "OVERLAY")
        catBTNActive.SetAllPoints();
        catBTNActive.SetTexture("Interface\\AddOns\\dh-store-assets\\NewStoreMainButton.blp");
        catBTNActive.SetTexCoord(0.031250000, 0.710937500, 0.500000000, 0.640625000)
        catBTNActive.Hide();

        let icon: WoWAPI.Frame = createIcon(categoryFrame, category.icon, { point: "LEFT", offsetX: 8, offsetY: 0 }, { width: 24, height: 24 });
        categoryButtons.push({ catFrame: categoryFrame, catIcon: icon, catString: categoryString, catButton: categoryButton, activeTexture: catBTNActive });
    });
}
