/**
 * StoreStyle — переиспользуемый UI-кит в стиле tswow-store.
 *
 * Текстуры берутся из ассетов модуля tswow-store (dh-store-assets), которые
 * попадают в клиентский патч при build data/addon. Координаты атласов взяты
 * из оригинального аддона магазина (StoreUI/Categories/Items/NavButtons).
 *
 * Файл дублируется в каждом модуле-потребителе (base-building, retail-talents,
 * custom-companions): аддоны tswow собираются помодульно и не могут импортировать
 * файлы чужих модулей. При правке — синхронизировать все копии.
 */

export const TEX_MAIN = "Interface\\AddOns\\dh-store-assets\\NewStoreMain.blp";
export const TEX_BUTTON = "Interface\\AddOns\\dh-store-assets\\NewStoreMainButton.blp";
export const TEX_CARD = "Interface\\AddOns\\dh-store-assets\\item-sale-bg.blp";
export const TEX_FRAME = "Interface\\AddOns\\dh-store-assets\\StoreFrame_Main.blp";
export const TEX_COIN = "Interface\\AddOns\\dh-store-assets\\coin.blp";
export const TEX_PANEL = "Interface\\AddOns\\dh-store-assets\\itemdisplay.blp";
export const STORE_FONT = (_G["GameFontNormal"] as WoWAPI.FontInstance).GetFont()[0];
export const STORE_STYLE_RUSSIAN = GetLocale() == "ruRU";

export function fmtGold(copper: number): string {
    const g = Math.floor(copper / 10000);
    const s = Math.floor((copper % 10000) / 100);
    if (STORE_STYLE_RUSSIAN) return s > 0 ? `${g}з ${s}с` : `${g}з`;
    return s > 0 ? `${g}g ${s}s` : `${g}g`;
}

/**
 * Keeps the large windows of our systems mutually exclusive without touching
 * Blizzard panels or persistent HUD elements.
 */
export function registerExclusiveWindow(frame: WoWAPI.Frame): void {
    hooksecurefunc(frame as any, "Show", () => {
        const globals = _G as any;
        const previous = globals.TSWOW_ActiveSystemWindow as WoWAPI.Frame | undefined;
        if (previous && previous != frame && previous.IsShown()) previous.Hide();
        globals.TSWOW_ActiveSystemWindow = frame;
    });
}

/* ------------------------------ главное окно ------------------------------- */
/**
 * Большое окно в стиле магазина: фон NewStoreMain, перетаскивание, закрытие по
 * ESC и крестиком. Пропорции — как у оригинального магазина.
 */
export function createStoreWindow(globalName: string, title: string): WoWAPI.Frame {
    const frame = CreateFrame("Frame", globalName, UIParent);
    UISpecialFrames.push(globalName);
    registerExclusiveWindow(frame);
    frame.SetSize(1040, 720);
    frame.SetScale(0.9 * Math.min(
        1,
        (UIParent.GetWidth() - 40) / 1040,
        (UIParent.GetHeight() - 40) / 720,
    ));
    frame.SetPoint("CENTER");
    frame.SetClampedToScreen(true);
    frame.SetMovable(true);
    frame.EnableMouse(true);
    frame.RegisterForDrag("LeftButton");
    frame.SetScript("OnDragStart", () => frame.StartMoving());
    frame.SetScript("OnDragStop", () => frame.StopMovingOrSizing());
    frame.SetScript("OnShow", () => PlaySound("igMainMenuOpen"));
    frame.SetScript("OnHide", () => PlaySound("igMainMenuClose"));
    frame.SetFrameStrata("HIGH");

    const bg = frame.CreateTexture(null, "BACKGROUND");
    bg.SetAllPoints();
    bg.SetTexture(TEX_MAIN);
    bg.SetTexCoord(0, 0.789062500, 0, 0.539062500);

    const titleText = frame.CreateFontString(null, "OVERLAY", "GameFontNormal");
    titleText.SetFont(STORE_FONT, 16, "OUTLINE");
    titleText.SetPoint("TOP", frame, "TOP", 0, -18);
    titleText.SetShadowOffset(1, -1);
    titleText.SetTextColor(1, 0.86, 0.32);
    titleText.SetText(title);

    const close = CreateFrame("Button", "", frame, "UIPanelCloseButton");
    close.SetSize(28, 28);
    close.SetPoint("TOPRIGHT", -4, -7);
    close.SetScript("OnClick", () => frame.Hide());

    frame.Hide();
    return frame;
}

/* ------------------------- боковая панель категорий ------------------------ */
export interface SidebarEntry {
    name: string;
    icon: string;
}

export interface SidebarButton {
    root: WoWAPI.Frame;
    button: WoWAPI.Button;
    label: WoWAPI.FontString;
    active: WoWAPI.Texture;
}

export interface Sidebar {
    buttons: SidebarButton[];
    setActive(index: number): void;
}

/** Колонка категорий слева (текстуры кнопок магазина: normal/highlight/active). */
export function createSidebar(parent: WoWAPI.Frame, entries: SidebarEntry[], onSelect: (index: number) => void): Sidebar {
    const bounding = CreateFrame("Frame", "", parent);
    bounding.SetSize(parent.GetWidth() * 0.225, parent.GetHeight() - 122);
    bounding.SetPoint("TOPLEFT", 18, -70);
    const rowHeight = Math.min(42, bounding.GetHeight() / Math.max(1, entries.length));

    const buttons: SidebarButton[] = [];
    const sidebar: Sidebar = {
        buttons: buttons,
        setActive: (index: number) => {
            for (let i = 0; i < buttons.length; i++) {
                if (i == index) buttons[i].active.Show();
                else buttons[i].active.Hide();
            }
        },
    };

    entries.forEach((entry, i) => {
        const row = CreateFrame("Frame", "", bounding);
        row.SetSize(bounding.GetWidth() - 8, rowHeight);
        row.SetPoint("TOPLEFT", bounding, 0, i * -(rowHeight + 2));

        const button = CreateFrame("Button", "", row);
        button.SetSize(row.GetWidth(), row.GetHeight());
        button.SetPoint("CENTER", row, 0, 0);
        button.RegisterForClicks("AnyDown");

        const normal = button.CreateTexture(null);
        normal.SetAllPoints();
        normal.SetTexture(TEX_BUTTON);
        normal.SetTexCoord(0.031250000, 0.711250000, 0.171875000, 0.316406250);

        const highlight = button.CreateTexture(null);
        highlight.SetAllPoints();
        highlight.SetTexture(TEX_BUTTON);
        highlight.SetTexCoord(0.031250000, 0.710937500, 0.332031250, 0.476562500);
        button.SetHighlightTexture(highlight);

        const label = button.CreateFontString(null, "OVERLAY", "GameFontNormal");
        label.SetFont(STORE_FONT, 12, "OUTLINE");
        label.SetShadowOffset(1, -1);
        label.SetPoint("LEFT", row, "LEFT", 43, 0);
        label.SetWidth(row.GetWidth() - 48);
        label.SetJustifyH("LEFT");
        label.SetText(entry.name);

        const active = button.CreateTexture(null, "OVERLAY");
        active.SetAllPoints();
        active.SetTexture(TEX_BUTTON);
        active.SetTexCoord(0.031250000, 0.710937500, 0.500000000, 0.640625000);
        active.Hide();

        const iconFrame = CreateFrame("Frame", "", row);
        iconFrame.SetSize(28, 28);
        iconFrame.SetPoint("LEFT", 8, 0);
        const iconTex = row.CreateTexture(null, "OVERLAY");
        iconTex.SetTexture(entry.icon);
        iconTex.SetPoint("CENTER", iconFrame, "CENTER");
        iconTex.SetSize(24, 24);
        iconTex.SetTexCoord(0.06, 0.94, 0.06, 0.94);
        button.SetScript("OnClick", () => {
            sidebar.setActive(i);
            PlaySound("igMainMenuOptionCheckBoxOn");
            onSelect(i);
        });

        buttons.push({ root: row, button: button, label: label, active: active });
    });

    return sidebar;
}

/* ------------------------------ кнопка-действие ---------------------------- */
export interface ActionButton {
    button: WoWAPI.Button;
    label: WoWAPI.FontString;
}

/** Золотая кнопка магазина (атлас StoreFrame_Main, как у кнопки Buy). */
export function createActionButton(parent: WoWAPI.Frame, width: number, height: number, text: string): ActionButton {
    const button = CreateFrame("Button", "", parent);
    button.SetSize(width, height);
    button.EnableMouse(true);
    button.RegisterForClicks("AnyUp");

    const normal = button.CreateTexture(null);
    normal.SetTexture(TEX_FRAME);
    normal.SetTexCoord(0.69287109375, 0.81689453125, 0.82958984375, 0.85205078125);
    normal.SetAllPoints();

    const highlight = button.CreateTexture(null);
    highlight.SetTexture(TEX_FRAME);
    highlight.SetTexCoord(0.69287109375, 0.81689453125, 0.82958984375, 0.85205078125);
    highlight.SetAllPoints();
    button.SetHighlightTexture(highlight);

    const pushed = button.CreateTexture(null);
    pushed.SetTexture(TEX_FRAME);
    pushed.SetTexCoord(0.69287109375, 0.81689453125, 0.85302734375, 0.87548828125);
    pushed.SetAllPoints();
    button.SetPushedTexture(pushed);

    const label = button.CreateFontString(null, "OVERLAY", "GameFontNormal");
    label.SetPoint("CENTER", 0, 0);
    label.SetFont(STORE_FONT, 11, "OUTLINE");
    label.SetShadowOffset(1, -1);
    label.SetText(text);

    return { button: button, label: label };
}

/* ------------------------------- карточки ---------------------------------- */
export interface StoreCard {
    frame: WoWAPI.Frame;
    icon: WoWAPI.Texture;
    title: WoWAPI.FontString;
    sub: WoWAPI.FontString;
    action: ActionButton;
    cost: WoWAPI.FontString;
    coin: WoWAPI.Texture;
    setCost(copper: number | undefined): void;
}

/**
 * Сетка карточек 4x2 (как товары магазина): фон item-sale-bg, hover-рамка,
 * иконка сверху, название, золотая кнопка с ценой.
 */
export function createCardGrid(parent: WoWAPI.Frame, onEnter?: (i: number) => void, onLeave?: (i: number) => void): StoreCard[] {
    const cards: StoreCard[] = [];
    const cardW = parent.GetWidth() / 5.75;
    const cardH = parent.GetHeight() / 2.5;
    const baseX = parent.GetWidth() * 0.26;
    const baseY = -parent.GetHeight() * 0.10;
    const stepX = (parent.GetWidth() * 0.98 - baseX - cardW) / 3;
    const stepY = cardH * 1.06;

    for (let i = 0; i < 8; i++) {
        const index = i;
        const card = CreateFrame("Frame", "", parent);
        card.SetSize(cardW, cardH);
        card.SetPoint("TOPLEFT", baseX + (i % 4) * stepX, baseY - Math.floor(i / 4) * stepY);
        card.EnableMouse(true);

        const bg = card.CreateTexture(null, "ARTWORK");
        bg.SetAllPoints();
        bg.SetTexture(TEX_CARD);
        bg.SetTexCoord(0.035156250, 0.601562500, 0.039062500, 0.849062500);

        const hover = card.CreateTexture(null, "OVERLAY");
        hover.SetAllPoints();
        hover.SetTexture(TEX_MAIN);
        hover.SetTexCoord(0.349609375, 0.491046875, 0.645625000, 0.849609375);
        hover.Hide();

        card.SetScript("OnEnter", () => {
            hover.Show();
            if (onEnter) onEnter(index);
        });
        card.SetScript("OnLeave", () => {
            hover.Hide();
            if (onLeave) onLeave(index);
        });

        const iconFrame = CreateFrame("Frame", "", card);
        iconFrame.SetSize(cardW * 0.5, cardW * 0.5);
        iconFrame.SetPoint("TOP", 0, -cardH * 0.12);
        const icon = card.CreateTexture(null, "OVERLAY");
        icon.SetPoint("CENTER", iconFrame, "CENTER");
        icon.SetSize(iconFrame.GetWidth(), iconFrame.GetHeight());
        icon.SetTexCoord(0.06, 0.94, 0.06, 0.94);
        const title = card.CreateFontString(null, "OVERLAY", "GameFontNormal");
        title.SetFont(STORE_FONT, 12, "OUTLINE");
        title.SetPoint("CENTER", 0, -cardH * 0.08);
        title.SetWidth(cardW - 18);
        title.SetWordWrap(true);

        const sub = card.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
        sub.SetFont(STORE_FONT, 10, "OUTLINE");
        sub.SetPoint("CENTER", 0, -cardH * 0.22);
        sub.SetWidth(cardW - 20);
        sub.SetWordWrap(true);

        const action = createActionButton(
            card,
            cardW * 0.78,
            cardH * 0.13,
            STORE_STYLE_RUSSIAN ? "Выбрать" : "Select",
        );
        action.button.SetPoint("BOTTOM", card, 0, cardH * 0.085);
        action.label.ClearAllPoints();
        action.label.SetPoint("LEFT", action.button, "LEFT", 10, 0);

        const coin = action.button.CreateTexture(null, "OVERLAY");
        coin.SetTexture(TEX_COIN);
        coin.SetSize(12, 14);
        coin.SetPoint("RIGHT", action.button, "RIGHT", -10, 0);

        const cost = action.button.CreateFontString(null, "OVERLAY", "GameFontNormal");
        cost.SetFont(STORE_FONT, 11, "OUTLINE");
        cost.SetPoint("RIGHT", coin, "LEFT", -2, 0);

        const cardObj: StoreCard = {
            frame: card,
            icon: icon,
            title: title,
            sub: sub,
            action: action,
            cost: cost,
            coin: coin,
            setCost: (copper: number | undefined) => {
                if (copper === undefined) {
                    cost.SetText("");
                    coin.Hide();
                } else {
                    cost.SetText(fmtGold(copper));
                    coin.Show();
                }
            },
        };
        card.Hide();
        cards.push(cardObj);
    }
    return cards;
}

/* ---------------------------- стрелки пагинации ---------------------------- */
export function createNavArrows(parent: WoWAPI.Frame, onPrev: () => void, onNext: () => void): WoWAPI.FontString {
    const left = CreateFrame("Button", "", parent);
    left.SetSize(30, 24);
    left.SetPoint("BOTTOM", parent, "BOTTOM", -80, 24);
    const leftTex = left.CreateTexture(null);
    leftTex.SetAllPoints();
    leftTex.SetTexture(TEX_FRAME);
    leftTex.SetTexCoord(0.84814453125, 0.87744140625, 0.84619140625, 0.87548828125);
    left.SetScript("OnClick", () => { PlaySound("igMainMenuOptionCheckBoxOn"); onPrev(); });

    const right = CreateFrame("Button", "", parent);
    right.SetSize(30, 24);
    right.SetPoint("BOTTOM", parent, "BOTTOM", 80, 24);
    const rightTex = right.CreateTexture(null);
    rightTex.SetAllPoints();
    rightTex.SetTexture(TEX_FRAME);
    rightTex.SetTexCoord(0.93896484375, 0.96826171875, 0.84619140625, 0.87548828125);
    right.SetScript("OnClick", () => { PlaySound("igMainMenuOptionCheckBoxOn"); onNext(); });

    const pageText = parent.CreateFontString(null, "OVERLAY", "GameFontNormal");
    pageText.SetFont(STORE_FONT, 11, "OUTLINE");
    pageText.SetPoint("BOTTOM", parent, "BOTTOM", 0, 29);
    pageText.SetWidth(120);
    pageText.SetJustifyH("CENTER");
    return pageText;
}

/* --------------------------- вертикальная панель ---------------------------- */
/**
 * Узкая панель в стиле «Preview» магазина (itemdisplay.blp). Используется для
 * окна склада: слева хранилище, справа сумки.
 */
export function createSidePanel(parent: WoWAPI.Frame, width: number, height: number, title: string): WoWAPI.Frame {
    const panel = CreateFrame("Frame", "", parent);
    panel.SetSize(width, height);

    const bg = panel.CreateTexture(null, "BACKGROUND");
    bg.SetAllPoints();
    bg.SetTexture(TEX_PANEL);
    bg.SetTexCoord(0.013671875, 0.552734375, 0.011718750, 0.750000000);

    const titleText = panel.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    titleText.SetFont(STORE_FONT, 11, "OUTLINE");
    titleText.SetPoint("TOP", 0, -12);
    titleText.SetShadowOffset(1, -1);
    titleText.SetTextColor(1, 1, 0);
    titleText.SetText(title);

    return panel;
}

/* ------------------------------- строка списка ------------------------------ */
export interface ListRow {
    button: WoWAPI.Button;
    icon: WoWAPI.Texture;
    label: WoWAPI.FontString;
    count: WoWAPI.FontString;
}

/** Строка списка на золотой кнопке категории (иконка + имя + количество). */
export function createListRow(parent: WoWAPI.Frame, width: number, height: number): ListRow {
    const button = CreateFrame("Button", "", parent);
    button.SetSize(width, height);
    button.RegisterForClicks("AnyUp");

    const normal = button.CreateTexture(null);
    normal.SetAllPoints();
    normal.SetTexture(TEX_BUTTON);
    normal.SetTexCoord(0.031250000, 0.711250000, 0.171875000, 0.316406250);

    const highlight = button.CreateTexture(null);
    highlight.SetAllPoints();
    highlight.SetTexture(TEX_BUTTON);
    highlight.SetTexCoord(0.031250000, 0.710937500, 0.332031250, 0.476562500);
    button.SetHighlightTexture(highlight);

    const icon = button.CreateTexture(null, "OVERLAY");
    icon.SetSize(height - 10, height - 10);
    icon.SetPoint("LEFT", 8, 0);
    icon.SetTexCoord(0.06, 0.94, 0.06, 0.94);

    const label = button.CreateFontString(null, "OVERLAY", "GameFontNormal");
    label.SetFont(STORE_FONT, 10, "OUTLINE");
    label.SetPoint("LEFT", icon, "RIGHT", 5, 0);
    label.SetJustifyH("LEFT");
    label.SetWidth(width - height - 52);

    const count = button.CreateFontString(null, "OVERLAY", "GameFontNormal");
    count.SetFont(STORE_FONT, 10, "OUTLINE");
    count.SetPoint("RIGHT", -8, 0);
    count.SetJustifyH("RIGHT");

    button.Hide();
    return { button: button, icon: icon, label: label, count: count };
}
