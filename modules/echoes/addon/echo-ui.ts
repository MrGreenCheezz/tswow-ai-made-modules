/** Server-authoritative card chooser and separate boss-book Echo collection. */

import { ECHOES } from "../datascripts/shared/EchoDefs";
import { COLLECTION_ECHOES } from "../datascripts/shared/CollectionEchoDefs";
import {
    ECHO_ERROR_CONTEXT_CARD,
    ECHO_ERROR_CONTEXT_COLLECTION,
    ECHO_ERROR_CONTEXT_GENERAL,
    EchoChooseRequest,
    EchoCollectionSetActiveRequest,
    EchoErrorMsg,
    EchoStateMsg,
    EchoStateRequest,
    OP_ECHO_ERROR,
    OP_ECHO_STATE,
} from "../shared/EchoMessages";

const FRAME_NAME = "EchoChooser";
const COLLECTION_FRAME_NAME = "EchoCollection";
const CARD_COUNT = 3;
const COLLECTION_PAGE_SIZE = 12;
const CLICK_GRACE_SECONDS = 0.1;
const CHOICE_TIMEOUT_SECONDS = 5;
const STATE_TIMEOUT_SECONDS = 5;
const FALLBACK_ICON = "Interface\\Icons\\INV_Misc_QuestionMark";
const COLLECTION_BUTTON_ICON = "Interface\\Icons\\inv_10_enchanting2_magicswirl_blue";
const COLLECTION_MINIMAP_RADIUS = 80;
const UI_FONT = (_G["GameFontNormal"] as WoWAPI.FontInstance).GetFont()[0];
const RUSSIAN = GetLocale() == "ruRU";

function tr(english: string, russian: string): string {
    return RUSSIAN ? russian : english;
}

const QUALITY_COLORS: number[][] = [
    [1, 1, 1],
    [0.12, 1, 0.12],
    [0.12, 0.44, 1],
    [0.64, 0.21, 0.93],
];
const QUALITY_NAMES = RUSSIAN
    ? ["Обычное", "Необычное", "Редкое", "Эпическое"]
    : ["Common", "Uncommon", "Rare", "Epic"];

interface EchoCard {
    frame: WoWAPI.Frame;
    icon: WoWAPI.Texture;
    name: WoWAPI.FontString;
    family: WoWAPI.FontString;
    description: WoWAPI.FontString;
    rank: WoWAPI.FontString;
    button: WoWAPI.Button;
}

interface CollectionCard {
    frame: WoWAPI.Frame;
    icon: WoWAPI.Texture;
    name: WoWAPI.FontString;
    status: WoWAPI.FontString;
    button: WoWAPI.Button;
    echoIndex: number;
}

let state = new EchoStateMsg();
let frame: WoWAPI.Frame | undefined;
let pendingText: WoWAPI.FontString | undefined;
let statusText: WoWAPI.FontString | undefined;
let cards: EchoCard[] = [];
let waitingForServer = false;
let queuedStateRequest = false;
let networkPollElapsed = 0;
let choiceWaitElapsed = 0;
let stateRequestInFlight = false;
let stateRequestElapsed = 0;
let offerShownAt = 0;
let selectedName = "";
let statusMessage = tr("Waiting for server data...", "Ожидание данных сервера...");
let statusIsError = false;
let preserveNextStateError = false;
let collectionFrame: WoWAPI.Frame | undefined;
let collectionMenuButton: WoWAPI.Button | undefined;
let collectionMinimapAngle = (280 * Math.PI) / 180;
let collectionHeader: WoWAPI.FontString | undefined;
let collectionStatus: WoWAPI.FontString | undefined;
let collectionEmpty: WoWAPI.FontString | undefined;
let collectionAllTab: WoWAPI.Button | undefined;
let collectionActiveTab: WoWAPI.Button | undefined;
let collectionPreviousPage: WoWAPI.Button | undefined;
let collectionNextPage: WoWAPI.Button | undefined;
let collectionPageText: WoWAPI.FontString | undefined;
let collectionCards: CollectionCard[] = [];
let collectionTab = 0;
let collectionPage = 0;
let collectionWaiting = false;
let collectionWaitElapsed = 0;
let collectionRequestToken = 0;
let pendingCollectionToken = 0;
let collectionMessage = tr("Waiting for server data...", "Ожидание данных сервера...");
let collectionMessageIsError = false;
let preserveNextCollectionError = false;

function registerExclusiveWindow(target: WoWAPI.Frame): void {
    hooksecurefunc(target as any, "Show", () => {
        const globals = _G as any;
        const previous = globals.TSWOW_ActiveSystemWindow as WoWAPI.Frame | undefined;
        if (previous && previous != target && previous.IsShown()) previous.Hide();
        globals.TSWOW_ActiveSystemWindow = target;
    });
}

function configureDialogWindow(target: WoWAPI.Frame, width: number, height: number): void {
    registerExclusiveWindow(target);
    target.SetSize(width, height);
    target.SetScale(0.9 * Math.min(
        1,
        (UIParent.GetWidth() - 40) / width,
        (UIParent.GetHeight() - 40) / height,
    ));
    target.SetPoint("CENTER");
    target.SetFrameStrata("DIALOG");
    target.SetClampedToScreen(true);
    target.SetMovable(true);
    target.EnableMouse(true);
    target.RegisterForDrag("LeftButton");
    target.SetScript("OnDragStart", self => self.StartMoving());
    target.SetScript("OnDragStop", self => self.StopMovingOrSizing());
}

function styleButton(button: WoWAPI.Button, size = 11): void {
    const text = button.GetFontString();
    text.SetFont(UI_FONT, size, "OUTLINE");
    text.SetShadowOffset(1, -1);
}

function catalogIcon(value: string): WoWAPI.TexturePath {
    if (!value) return FALLBACK_ICON;
    return value.indexOf("\\") >= 0 ? value : `Interface\\Icons\\${value}`;
}

function familyName(value: string): string {
    if (!RUSSIAN) return value;
    if (value == "Caster DPS") return "Заклинатель";
    if (value == "Healer") return "Целитель";
    if (value == "Melee DPS") return "Ближний бой";
    if (value == "Mobility") return "Мобильность";
    if (value == "Ranged DPS") return "Дальний бой";
    if (value == "Survivability") return "Выживаемость";
    if (value == "Tank") return "Танк";
    return value;
}

function familyText(values: string[]): string {
    const result: string[] = [];
    for (let i = 0; i < values.length; i++) result.push(familyName(values[i]));
    return result.join(" • ");
}

function actualSpell(index: number): { name: string; icon: WoWAPI.TexturePath } {
    const definition = ECHOES[index];
    let name = definition
        ? RUSSIAN ? definition.nameRu : definition.name
        : tr("Unknown Echo", "Неизвестное Эхо");
    let icon: WoWAPI.TexturePath = definition ? catalogIcon(definition.icon) : FALLBACK_ICON;
    const spellId = state.spellIds[index] || 0;
    if (spellId > 0) {
        const [spellName, , spellIcon] = GetSpellInfo(spellId);
        if (spellName) name = spellName;
        if (spellIcon) {
            icon = spellIcon;
        } else {
            const texture = GetSpellTexture(spellId, BOOKTYPE_SPELL);
            if (texture) icon = texture;
        }
    }
    return { name, icon };
}

function actualCollectionSpell(index: number): { name: string; icon: WoWAPI.TexturePath } {
    const definition = COLLECTION_ECHOES[index];
    let name = definition
        ? RUSSIAN ? definition.nameRu : definition.name
        : tr("Unknown Echo", "Неизвестное Эхо");
    let icon: WoWAPI.TexturePath = definition ? catalogIcon(definition.icon) : FALLBACK_ICON;
    const spellId = state.collectionSpellIds[index] || 0;
    if (spellId > 0) {
        const [spellName, , spellIcon] = GetSpellInfo(spellId);
        if (spellName) name = spellName;
        if (spellIcon) icon = spellIcon;
        else {
            const texture = GetSpellTexture(spellId, BOOKTYPE_SPELL);
            if (texture) icon = texture;
        }
    }
    return { name, icon };
}

function collectionActiveCount(): number {
    let count = 0;
    for (let i = 0; i < state.collectionActiveSlots.length; i++) {
        if ((state.collectionActiveSlots[i] || 0) > 0) count++;
    }
    return count;
}

function collectionUnlockedCount(): number {
    let count = 0;
    for (let i = 0; i < state.collectionUnlocked.length; i++) {
        if ((state.collectionUnlocked[i] || 0) > 0) count++;
    }
    return count;
}

function visibleCollectionIndices(): number[] {
    const result: number[] = [];
    for (let i = 0; i < COLLECTION_ECHOES.length; i++) {
        if (collectionTab == 0 || (state.collectionActiveSlots[i] || 0) > 0) result.push(i);
    }
    return result;
}

function showCollectionTooltip(card: CollectionCard): void {
    const definition = COLLECTION_ECHOES[card.echoIndex];
    if (!definition || !collectionFrame) return;
    const activeSlot = state.collectionActiveSlots[card.echoIndex] || 0;
    const unlocked = (state.collectionUnlocked[card.echoIndex] || 0) > 0;
    GameTooltip.SetOwner(collectionFrame, "ANCHOR_CURSOR");
    GameTooltip.SetText(actualCollectionSpell(card.echoIndex).name);
    GameTooltip.AddLine(RUSSIAN ? definition.descriptionRu : definition.description, 1, 1, 1, true);
    GameTooltip.AddLine(
        unlocked
            ? activeSlot > 0
                ? tr(`Active in slot ${activeSlot}.`, `Активно в слоте ${activeSlot}.`)
                : tr("Unlocked, but inactive.", "Изучено, но не активно.")
            : tr(
                "Not unlocked. Look for this Echo's book in boss loot.",
                "Не изучено. Ищите книгу этого Эхо в добыче с боссов.",
            ),
        unlocked ? 0.45 : 0.75,
        unlocked ? 1 : 0.55,
        unlocked ? 0.45 : 0.85,
        true,
    );
    GameTooltip.AddLine(
        tr(`Ebonhold catalog: #${definition.catalogNumber}`, `Каталог Ebonhold: №${definition.catalogNumber}`),
        0.6, 0.6, 0.6,
    );
    GameTooltip.Show();
}

function createCollectionCard(parent: WoWAPI.Frame, slot: number): CollectionCard {
    const column = slot % 3;
    const row = Math.floor(slot / 3);
    const card = CreateFrame("Frame", null, parent);
    card.SetSize(245, 104);
    card.SetPoint("TOPLEFT", parent, "TOPLEFT", 28 + column * 255, -96 - row * 112);
    card.EnableMouse(true);
    card.SetBackdrop({
        bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
        edgeFile: "Interface\\Tooltips\\UI-Tooltip-Border",
        tile: true,
        tileSize: 16,
        edgeSize: 14,
        insets: { left: 3, right: 3, top: 3, bottom: 3 },
    });

    const icon = card.CreateTexture(null, "ARTWORK");
    icon.SetSize(46, 46);
    icon.SetPoint("TOPLEFT", card, "TOPLEFT", 11, -12);
    icon.SetTexture(FALLBACK_ICON);
    icon.SetTexCoord(0.06, 0.94, 0.06, 0.94);
    const name = card.CreateFontString(null, "OVERLAY", "GameFontNormal");
    name.SetFont(UI_FONT, 12, "OUTLINE");
    name.SetPoint("TOPLEFT", icon, "TOPRIGHT", 8, -1);
    name.SetWidth(169);
    name.SetHeight(34);
    name.SetJustifyH("LEFT");
    name.SetJustifyV("TOP");

    const status = card.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    status.SetFont(UI_FONT, 10, "OUTLINE");
    status.SetPoint("TOPLEFT", icon, "BOTTOMLEFT", 0, -7);
    status.SetWidth(86);
    status.SetJustifyH("LEFT");

    const button = CreateFrame("Button", null, card, "UIPanelButtonTemplate");
    button.SetSize(132, 23);
    button.SetPoint("BOTTOMRIGHT", card, "BOTTOMRIGHT", -10, 10);
    styleButton(button);

    const result: CollectionCard = {
        frame: card,
        icon,
        name,
        status,
        button,
        echoIndex: -1,
    };
    card.SetScript("OnEnter", () => showCollectionTooltip(result));
    card.SetScript("OnLeave", () => GameTooltip.Hide());
    button.SetScript("OnEnter", () => showCollectionTooltip(result));
    button.SetScript("OnLeave", () => GameTooltip.Hide());
    button.SetScript("OnClick", () => toggleCollectionEcho(result.echoIndex));
    return result;
}

function ensureCollectionFrame(): WoWAPI.Frame {
    if (collectionFrame) return collectionFrame;

    collectionFrame = CreateFrame("Frame", COLLECTION_FRAME_NAME, UIParent);
    configureDialogWindow(collectionFrame, 820, 600);
    collectionFrame.SetBackdrop({
        bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
        edgeFile: "Interface\\DialogFrame\\UI-DialogBox-Border",
        tile: true,
        tileSize: 32,
        edgeSize: 32,
        insets: { left: 11, right: 12, top: 12, bottom: 11 },
    });
    collectionFrame.SetBackdropColor(0.03, 0.025, 0.05, 0.98);
    (collectionFrame as any).SetBackdropBorderColor(0.55, 0.42, 0.18, 1);

    const title = collectionFrame.CreateFontString(null, "OVERLAY", "GameFontNormalLarge");
    title.SetFont(UI_FONT, 16, "OUTLINE");
    title.SetPoint("TOP", collectionFrame, "TOP", 0, -16);
    title.SetShadowOffset(1, -1);
    title.SetTextColor(1, 0.86, 0.32);
    title.SetText(tr("Echo Collection", "Коллекция Эхо"));

    collectionHeader = collectionFrame.CreateFontString(null, "OVERLAY", "GameFontHighlight");
    collectionHeader.SetFont(UI_FONT, 11, "OUTLINE");
    collectionHeader.SetPoint("TOP", title, "BOTTOM", 0, -4);

    collectionAllTab = CreateFrame("Button", null, collectionFrame, "UIPanelButtonTemplate");
    collectionAllTab.SetSize(125, 24);
    styleButton(collectionAllTab);
    collectionAllTab.SetPoint("TOPLEFT", collectionFrame, "TOPLEFT", 28, -61);
    collectionAllTab.SetText(tr("All auras", "Все ауры"));
    collectionAllTab.SetScript("OnClick", () => {
        collectionTab = 0;
        collectionPage = 0;
        refreshCollection();
    });

    collectionActiveTab = CreateFrame("Button", null, collectionFrame, "UIPanelButtonTemplate");
    collectionActiveTab.SetSize(125, 24);
    styleButton(collectionActiveTab);
    collectionActiveTab.SetPoint("LEFT", collectionAllTab, "RIGHT", 8, 0);
    collectionActiveTab.SetText(tr("Active", "Активные"));
    collectionActiveTab.SetScript("OnClick", () => {
        collectionTab = 1;
        collectionPage = 0;
        refreshCollection();
    });

    const refreshButton = CreateFrame("Button", null, collectionFrame, "UIPanelButtonTemplate");
    refreshButton.SetSize(105, 24);
    styleButton(refreshButton);
    refreshButton.SetPoint("TOPRIGHT", collectionFrame, "TOPRIGHT", -42, -61);
    refreshButton.SetText(tr("Refresh", "Обновить"));
    refreshButton.SetScript("OnClick", () => {
        collectionMessage = tr("Synchronizing with server...", "Синхронизация с сервером...");
        collectionMessageIsError = false;
        refreshCollection();
        requestState();
    });

    collectionEmpty = collectionFrame.CreateFontString(null, "OVERLAY", "GameFontHighlightLarge");
    collectionEmpty.SetFont(UI_FONT, 14, "OUTLINE");
    collectionEmpty.SetPoint("CENTER", collectionFrame, "CENTER", 0, -12);
    collectionEmpty.SetText(tr("No active Echoes", "Нет активных Эхо"));
    collectionEmpty.SetTextColor(0.65, 0.65, 0.65);

    collectionStatus = collectionFrame.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    collectionStatus.SetFont(UI_FONT, 10, "OUTLINE");
    collectionStatus.SetPoint("BOTTOM", collectionFrame, "BOTTOM", 0, 15);
    collectionStatus.SetWidth(740);
    collectionStatus.SetJustifyH("CENTER");

    collectionPreviousPage = CreateFrame("Button", null, collectionFrame, "UIPanelButtonTemplate");
    collectionPreviousPage.SetSize(78, 22);
    styleButton(collectionPreviousPage, 10);
    collectionPreviousPage.SetPoint("BOTTOM", collectionFrame, "BOTTOM", -105, 40);
    collectionPreviousPage.SetText(tr("Previous", "Назад"));
    collectionPreviousPage.SetScript("OnClick", () => {
        if (collectionPage <= 0) return;
        collectionPage--;
        refreshCollection();
    });

    collectionPageText = collectionFrame.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    collectionPageText.SetFont(UI_FONT, 10, "OUTLINE");
    collectionPageText.SetPoint("BOTTOM", collectionFrame, "BOTTOM", 0, 45);
    collectionPageText.SetWidth(110);
    collectionPageText.SetJustifyH("CENTER");

    collectionNextPage = CreateFrame("Button", null, collectionFrame, "UIPanelButtonTemplate");
    collectionNextPage.SetSize(78, 22);
    styleButton(collectionNextPage, 10);
    collectionNextPage.SetPoint("BOTTOM", collectionFrame, "BOTTOM", 105, 40);
    collectionNextPage.SetText(tr("Next", "Вперёд"));
    collectionNextPage.SetScript("OnClick", () => {
        collectionPage++;
        refreshCollection();
    });

    const close = CreateFrame("Button", null, collectionFrame, "UIPanelCloseButton");
    close.SetPoint("TOPRIGHT", collectionFrame, "TOPRIGHT", -5, -5);
    close.SetScript("OnClick", () => {
        if (collectionFrame) collectionFrame.Hide();
    });

    collectionCards = [];
    for (let i = 0; i < COLLECTION_PAGE_SIZE; i++) {
        collectionCards.push(createCollectionCard(collectionFrame, i));
    }
    collectionFrame.SetScript("OnShow", () => PlaySound("igMainMenuOpen"));
    collectionFrame.Hide();
    UISpecialFrames.push(COLLECTION_FRAME_NAME);
    return collectionFrame;
}

function renderCollectionCard(
    card: CollectionCard,
    echoIndex: number,
    activeCount: number,
    limit: number,
): void {
    card.echoIndex = echoIndex;
    card.frame.Show();
    const unlocked = (state.collectionUnlocked[echoIndex] || 0) > 0;
    const activeSlot = state.collectionActiveSlots[echoIndex] || 0;
    const spell = actualCollectionSpell(echoIndex);
    card.icon.SetTexture(spell.icon);
    card.icon.SetAlpha(unlocked ? 1 : 0.35);
    card.name.SetText(spell.name);
    card.name.SetTextColor(
        activeSlot > 0 ? 0.35 : unlocked ? 0.82 : 0.55,
        activeSlot > 0 ? 1 : unlocked ? 0.55 : 0.55,
        activeSlot > 0 ? 0.45 : unlocked ? 1 : 0.55,
    );
    (card.frame as any).SetBackdropBorderColor(
        activeSlot > 0 ? 0.2 : unlocked ? 0.65 : 0.3,
        activeSlot > 0 ? 1 : unlocked ? 0.25 : 0.3,
        activeSlot > 0 ? 0.35 : unlocked ? 0.9 : 0.3,
        1,
    );
    if (!unlocked) {
        card.status.SetText(tr("Not unlocked", "Не изучено"));
        card.status.SetTextColor(0.6, 0.6, 0.6);
        card.button.SetText(tr("Not unlocked", "Не изучено"));
        card.button.Disable();
    } else if (activeSlot > 0) {
        card.status.SetText(tr(`Slot ${activeSlot}`, `Слот ${activeSlot}`));
        card.status.SetTextColor(0.3, 1, 0.3);
        card.button.SetText(tr("Deactivate", "Отключить"));
        if (collectionWaiting) card.button.Disable();
        else card.button.Enable();
    } else {
        card.status.SetText(tr("In collection", "В коллекции"));
        card.status.SetTextColor(0.75, 0.55, 1);
        card.button.SetText(activeCount >= limit
            ? tr("No free slot", "Нет слота")
            : tr("Activate", "Активировать"));
        if (collectionWaiting || activeCount >= limit) card.button.Disable();
        else card.button.Enable();
    }
}

function refreshCollection(): void {
    if (!collectionFrame
        || !collectionHeader
        || !collectionStatus
        || !collectionEmpty
        || !collectionAllTab
        || !collectionActiveTab
        || !collectionPreviousPage
        || !collectionNextPage
        || !collectionPageText) return;
    const activeCount = collectionActiveCount();
    const limit = Math.max(2, state.collectionSlotLimit || 2);
    collectionHeader.SetText(
        tr(
            `Unlocked: ${collectionUnlockedCount()}/${COLLECTION_ECHOES.length}   •   Active: ${activeCount}/${limit}`,
            `Изучено: ${collectionUnlockedCount()}/${COLLECTION_ECHOES.length}   •   Активно: ${activeCount}/${limit}`,
        ),
    );
    collectionStatus.SetText(collectionMessage);
    collectionStatus.SetTextColor(
        collectionMessageIsError ? 1 : 0.72,
        collectionMessageIsError ? 0.25 : 0.82,
        collectionMessageIsError ? 0.25 : 0.95,
    );
    if (collectionTab == 0) {
        collectionAllTab.Disable();
        collectionActiveTab.Enable();
    } else {
        collectionAllTab.Enable();
        collectionActiveTab.Disable();
    }

    const visible = visibleCollectionIndices();
    const pageCount = Math.max(1, Math.ceil(visible.length / COLLECTION_PAGE_SIZE));
    collectionPage = Math.max(0, Math.min(collectionPage, pageCount - 1));
    collectionPageText.SetText(tr(
        `Page ${collectionPage + 1}/${pageCount}`,
        `Страница ${collectionPage + 1}/${pageCount}`,
    ));
    if (collectionPage <= 0) collectionPreviousPage.Disable();
    else collectionPreviousPage.Enable();
    if (collectionPage >= pageCount - 1) collectionNextPage.Disable();
    else collectionNextPage.Enable();
    if (visible.length == 0) collectionEmpty.Show();
    else collectionEmpty.Hide();
    const pageStart = collectionPage * COLLECTION_PAGE_SIZE;
    for (let slot = 0; slot < collectionCards.length; slot++) {
        const card = collectionCards[slot];
        const echoIndex = visible[pageStart + slot];
        const definition = echoIndex === undefined ? undefined : COLLECTION_ECHOES[echoIndex];
        if (!definition) {
            card.echoIndex = -1;
            card.frame.Hide();
        } else {
            renderCollectionCard(card, echoIndex, activeCount, limit);
        }
    }
}

function toggleCollectionEcho(echoIndex: number): void {
    if (echoIndex < 0 || echoIndex >= COLLECTION_ECHOES.length || collectionWaiting) return;
    if (!(_G as any)._CLIENT_NETWORK) {
        collectionMessage = tr(
            "The TSWoW client transport is not ready yet.",
            "Клиентский транспорт TSWoW ещё не готов.",
        );
        collectionMessageIsError = true;
        refreshCollection();
        return;
    }
    const desiredActive = (state.collectionActiveSlots[echoIndex] || 0) > 0 ? 0 : 1;
    if (state.collectionAckToken > collectionRequestToken) {
        collectionRequestToken = state.collectionAckToken;
    }
    collectionRequestToken = collectionRequestToken >= 0x7ffffffe
        ? 1
        : collectionRequestToken + 1;
    pendingCollectionToken = collectionRequestToken;
    collectionWaiting = true;
    collectionWaitElapsed = 0;
    preserveNextCollectionError = false;
    const definition = COLLECTION_ECHOES[echoIndex];
    const localizedName = RUSSIAN ? definition.nameRu : definition.name;
    collectionMessage = desiredActive > 0
        ? tr(`Activating “${localizedName}”...`, `Активируем «${localizedName}»...`)
        : tr(`Deactivating “${localizedName}”...`, `Отключаем «${localizedName}»...`);
    collectionMessageIsError = false;
    refreshCollection();
    new EchoCollectionSetActiveRequest(
        echoIndex,
        desiredActive,
        pendingCollectionToken,
    ).write().Send();
}

function toggleCollectionWindow(): void {
    const ui = ensureCollectionFrame();
    if (ui.IsShown()) {
        ui.Hide();
        return;
    }
    collectionMessage = tr("Synchronizing with server...", "Синхронизация с сервером...");
    collectionMessageIsError = false;
    ui.Show();
    refreshCollection();
    requestState();
}

function placeCollectionMenuButton(button: WoWAPI.Button): void {
    button.SetPoint(
        "CENTER",
        Minimap,
        "CENTER",
        COLLECTION_MINIMAP_RADIUS * Math.cos(collectionMinimapAngle),
        COLLECTION_MINIMAP_RADIUS * Math.sin(collectionMinimapAngle),
    );
}

function ensureCollectionMenuButton(): void {
    if (collectionMenuButton) return;
    const button = CreateFrame("Button", "EchoCollectionMinimapButton", Minimap);
    button.SetSize(32, 32);
    button.SetFrameStrata("MEDIUM");
    button.SetFrameLevel(8);
    button.RegisterForClicks("LeftButtonUp");
    button.RegisterForDrag("LeftButton");
    button.SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight");

    const icon = button.CreateTexture(null, "BACKGROUND");
    icon.SetTexture(COLLECTION_BUTTON_ICON);
    icon.SetSize(20, 20);
    icon.SetPoint("CENTER", button, "CENTER", 0, 1);
    icon.SetTexCoord(0.05, 0.95, 0.05, 0.95);

    const border = button.CreateTexture(null, "OVERLAY");
    border.SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder");
    border.SetSize(54, 54);
    border.SetPoint("TOPLEFT", button, "TOPLEFT", 0, 0);

    placeCollectionMenuButton(button);
    button.SetScript("OnClick", () => toggleCollectionWindow());
    button.SetScript("OnDragStart", () => {
        button.SetScript("OnUpdate", () => {
            const [cursorX, cursorY] = GetCursorPosition();
            const scale = Minimap.GetEffectiveScale();
            const [minimapX, minimapY] = Minimap.GetCenter();
            collectionMinimapAngle = Math.atan2(
                cursorY / scale - minimapY,
                cursorX / scale - minimapX,
            );
            button.ClearAllPoints();
            placeCollectionMenuButton(button);
        });
    });
    button.SetScript("OnDragStop", () => button.SetScript("OnUpdate", null as any));
    button.SetScript("OnEnter", () => {
        GameTooltip.SetOwner(button, "ANCHOR_LEFT");
        GameTooltip.SetText(tr("Echo Collection", "Коллекция Эхо"));
        GameTooltip.AddLine(
            tr(
                "Left-click to open the powerful aura collection (/echoes). Drag to move this button.",
                "ЛКМ — открыть коллекцию сильных аур (/echoes). Перетащите, чтобы переместить кнопку.",
            ),
            0.8,
            0.8,
            0.8,
            true,
        );
        GameTooltip.Show();
    });
    button.SetScript("OnLeave", () => GameTooltip.Hide());
    collectionMenuButton = button;
}

function createCard(parent: WoWAPI.Frame, slot: number): EchoCard {
    const card = CreateFrame("Frame", null, parent);
    card.SetSize(220, 275);
    card.SetPoint("TOPLEFT", parent, "TOPLEFT", 45 + slot * 245, -58);
    card.SetBackdrop({
        bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
        edgeFile: "Interface\\Tooltips\\UI-Tooltip-Border",
        tile: true,
        tileSize: 16,
        edgeSize: 16,
        insets: { left: 4, right: 4, top: 4, bottom: 4 },
    });

    const icon = card.CreateTexture(null, "ARTWORK");
    icon.SetSize(58, 58);
    icon.SetPoint("TOP", card, "TOP", 0, -15);
    icon.SetTexture(FALLBACK_ICON);
    icon.SetTexCoord(0.06, 0.94, 0.06, 0.94);
    const name = card.CreateFontString(null, "OVERLAY", "GameFontNormalLarge");
    name.SetFont(UI_FONT, 14, "OUTLINE");
    name.SetPoint("TOP", icon, "BOTTOM", 0, -7);
    name.SetWidth(190);
    name.SetHeight(36);
    name.SetJustifyH("CENTER");

    const family = card.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    family.SetFont(UI_FONT, 10, "OUTLINE");
    family.SetPoint("TOP", name, "BOTTOM", 0, -2);
    family.SetWidth(190);
    family.SetJustifyH("CENTER");
    family.SetTextColor(0.72, 0.72, 0.72);

    const description = card.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    description.SetFont(UI_FONT, 10, "OUTLINE");
    description.SetPoint("TOP", family, "BOTTOM", 0, -9);
    description.SetWidth(188);
    description.SetHeight(67);
    description.SetJustifyH("CENTER");
    description.SetJustifyV("TOP");
    description.SetTextColor(0.92, 0.92, 0.92);

    const rank = card.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    rank.SetFont(UI_FONT, 10, "OUTLINE");
    rank.SetPoint("BOTTOM", card, "BOTTOM", 0, 45);

    const button = CreateFrame("Button", null, card, "UIPanelButtonTemplate");
    button.SetSize(160, 24);
    styleButton(button);
    button.SetPoint("BOTTOM", card, "BOTTOM", 0, 14);
    button.SetScript("OnClick", () => choose(slot));

    return { frame: card, icon, name, family, description, rank, button };
}

function ensureFrame(): WoWAPI.Frame {
    if (frame) return frame;

    frame = CreateFrame("Frame", FRAME_NAME, UIParent);
    configureDialogWindow(frame, 800, 360);
    frame.SetBackdrop({
        bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
        edgeFile: "Interface\\DialogFrame\\UI-DialogBox-Border",
        tile: true,
        tileSize: 32,
        edgeSize: 32,
        insets: { left: 11, right: 12, top: 12, bottom: 11 },
    });
    frame.SetBackdropColor(0.03, 0.025, 0.05, 0.98);
    (frame as any).SetBackdropBorderColor(0.55, 0.42, 0.18, 1);

    const title = frame.CreateFontString(null, "OVERLAY", "GameFontNormalLarge");
    title.SetFont(UI_FONT, 16, "OUTLINE");
    title.SetPoint("TOP", frame, "TOP", 0, -15);
    title.SetShadowOffset(1, -1);
    title.SetTextColor(1, 0.86, 0.32);
    title.SetText(tr("Choose an Echo", "Выберите Эхо"));

    pendingText = frame.CreateFontString(null, "OVERLAY", "GameFontHighlight");
    pendingText.SetFont(UI_FONT, 11, "OUTLINE");
    pendingText.SetPoint("TOP", title, "BOTTOM", 0, -3);

    statusText = frame.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    statusText.SetFont(UI_FONT, 10, "OUTLINE");
    statusText.SetPoint("BOTTOM", frame, "BOTTOM", 0, 12);
    statusText.SetWidth(720);
    statusText.SetJustifyH("CENTER");

    const close = CreateFrame("Button", null, frame, "UIPanelCloseButton");
    close.SetPoint("TOPRIGHT", frame, "TOPRIGHT", -5, -5);
    close.SetScript("OnClick", () => {
        if (frame) {
            frame.Hide();
            if (state.pending > 0) {
                print(tr(
                    "|cff80c0ffEcho:|r Your choice was saved. Enter /echo to reopen the window.",
                    "|cff80c0ffЭхо:|r Выбор сохранён. Введите /echo, чтобы открыть окно снова.",
                ));
            }
        }
    });

    cards = [];
    for (let i = 0; i < CARD_COUNT; i++) cards.push(createCard(frame, i));

    frame.SetScript("OnShow", () => {
        offerShownAt = GetTime();
        PlaySound("igMainMenuOpen");
    });
    frame.Hide();
    UISpecialFrames.push(FRAME_NAME);
    return frame;
}

function refresh(): void {
    if (!frame || !pendingText || !statusText) return;

    if (state.pending > 0) {
        pendingText.SetText(tr(
            `Ranks chosen: ${state.picked}   •   Echo choice available`,
            `Выбрано рангов: ${state.picked}   •   Доступен выбор Эхо`,
        ));
    } else {
        pendingText.SetText(tr(
            `Ranks chosen: ${state.picked}   •   No active choice`,
            `Выбрано рангов: ${state.picked}   •   Нет активного выбора`,
        ));
    }
    statusText.SetText(statusMessage);
    statusText.SetTextColor(statusIsError ? 1 : 0.75, statusIsError ? 0.25 : 0.75, statusIsError ? 0.25 : 0.75);

    for (let i = 0; i < cards.length; i++) {
        const offer = state.offers[i];
        const index = offer ? offer.echoIndex : -1;
        const definition = index >= 0 ? ECHOES[index] : undefined;
        const card = cards[i];
        if (!definition || state.pending <= 0) {
            card.frame.Hide();
        } else {
            const spell = actualSpell(index);
            const color = QUALITY_COLORS[definition.quality] || QUALITY_COLORS[0];
            const rank = state.ranks[index] || 0;
            card.frame.Show();
            card.frame.SetAlpha(waitingForServer ? 0.62 : 1);
            (card.frame as any).SetBackdropBorderColor(color[0], color[1], color[2], 1);
            card.icon.SetTexture(spell.icon);
            card.name.SetText(spell.name);
            card.name.SetTextColor(color[0], color[1], color[2]);
            card.family.SetText(familyText(definition.families));
            card.description.SetText(RUSSIAN ? definition.descriptionRu : definition.description);
            card.rank.SetText(tr(
                `${QUALITY_NAMES[definition.quality] || "Echo"} • Rank: ${rank}/${definition.maxStack}`,
                `${QUALITY_NAMES[definition.quality] || "Эхо"} • Ранг: ${rank}/${definition.maxStack}`,
            ));
            card.button.SetText(tr(`Choose (${state.pending})`, `Выбрать (${state.pending})`));
            if (waitingForServer || state.offerToken <= 0) card.button.Disable();
            else card.button.Enable();
        }
    }
}

function choose(slot: number): void {
    if (waitingForServer || GetTime() - offerShownAt < CLICK_GRACE_SECONDS) return;
    const offer = state.offers[slot];
    const definition = offer ? ECHOES[offer.echoIndex] : undefined;
    if (!offer || !definition || state.offerToken <= 0) return;
    if (!(_G as any)._CLIENT_NETWORK) {
        statusMessage = tr(
            "The TSWoW client transport is not ready yet.",
            "Клиентский транспорт TSWoW ещё не готов.",
        );
        statusIsError = true;
        refresh();
        return;
    }

    waitingForServer = true;
    choiceWaitElapsed = 0;
    stateRequestInFlight = false;
    stateRequestElapsed = 0;
    selectedName = actualSpell(offer.echoIndex).name;
    preserveNextStateError = false;
    statusMessage = tr(`Choosing “${selectedName}”...`, `Выбираем «${selectedName}»...`);
    statusIsError = false;
    refresh();
    new EchoChooseRequest(state.offerToken, offer.echoIndex).write().Send();
}

function sendStateRequest(): boolean {
    if (!(_G as any)._CLIENT_NETWORK) return false;
    queuedStateRequest = false;
    stateRequestInFlight = true;
    stateRequestElapsed = 0;
    new EchoStateRequest().write().Send();
    return true;
}

function requestState(): void {
    queuedStateRequest = true;
    preserveNextStateError = false;
    statusMessage = tr("Synchronizing with server...", "Синхронизация с сервером...");
    statusIsError = false;
    refresh();
    sendStateRequest();
}

function toggle(): void {
    const ui = ensureFrame();
    if (ui.IsShown()) {
        ui.Hide();
        return;
    }
    ui.Show();
    refresh();
    requestState();
}

OnCustomPacket(OP_ECHO_STATE, packet => {
    const wasWaiting = waitingForServer;
    const wasChoosing = wasWaiting || state.pending > 0;
    const priorPicked = state.picked;
    const priorToken = state.offerToken;
    const priorPending = state.pending;
    const preserveError = preserveNextStateError && !waitingForServer;
    preserveNextStateError = false;
    const next = new EchoStateMsg();
    next.read(packet);
    const collectionReplyMatchesPending = pendingCollectionToken > 0
        && next.collectionAckToken == pendingCollectionToken;
    const staleCollectionReply = collectionWaiting
        ? !collectionReplyMatchesPending
        : state.collectionAckToken > 0
            && next.collectionAckToken != state.collectionAckToken;
    if (staleCollectionReply) {
        next.collectionSlotLimit = state.collectionSlotLimit;
        next.collectionSpellIds = state.collectionSpellIds;
        next.collectionUnlocked = state.collectionUnlocked;
        next.collectionActiveSlots = state.collectionActiveSlots;
        next.collectionAckToken = state.collectionAckToken;
    }
    const choiceAccepted = wasWaiting && next.picked > priorPicked;
    const choiceResolved = !wasWaiting
        || choiceAccepted
        || next.offerToken != priorToken
        || next.pending < priorPending;
    const collectionResolved = !collectionWaiting || collectionReplyMatchesPending;
    const preserveCollectionError = preserveNextCollectionError && collectionResolved;
    const acceptedName = choiceAccepted ? selectedName : "";
    state = next;
    queuedStateRequest = false;
    stateRequestInFlight = false;
    stateRequestElapsed = 0;
    if (collectionResolved) {
        collectionWaiting = false;
        collectionWaitElapsed = 0;
        pendingCollectionToken = 0;
        preserveNextCollectionError = false;
        if (!preserveCollectionError) {
            collectionMessage = tr("Collection state updated.", "Состояние коллекции обновлено.");
            collectionMessageIsError = false;
        }
    }
    refreshCollection();

    // A delayed reply to an earlier state request must not unlock the same
    // offer while the authoritative choose response is still in flight.
    if (!choiceResolved) {
        statusMessage = tr(
            `Waiting for confirmation of “${selectedName}”...`,
            `Ожидаем подтверждение выбора «${selectedName}»...`,
        );
        statusIsError = false;
        refresh();
        return;
    }

    waitingForServer = false;
    choiceWaitElapsed = 0;
    selectedName = "";
    offerShownAt = GetTime();
    if (!preserveError) statusIsError = false;

    if (state.pending > 0) {
        if (acceptedName) {
            statusMessage = tr(
                `Received “${acceptedName}”. Choose the next Echo.`,
                `Получено «${acceptedName}». Выберите следующее Эхо.`,
            );
            statusIsError = false;
        } else if (!preserveError) {
            statusMessage = tr("Choose one of the three Echoes.", "Выберите одно из трёх Эхо.");
        }
        const ui = ensureFrame();
        if (!ui.IsShown()) ui.Show();
        refresh();
    } else if (wasChoosing) {
        if (frame) frame.Hide();
        print(tr(
            `|cff80c0ffEcho:|r ${acceptedName ? `“${acceptedName}” received. ` : ""}There is no active choice.`,
            `|cff80c0ffЭхо:|r ${acceptedName ? `«${acceptedName}» получено. ` : ""}Активного выбора больше нет.`,
        ));
    } else {
        statusMessage = tr(
            "There is no active Echo choice. Use an Echo Crystal.",
            "Нет активного выбора Эхо. Используйте Кристалл Эхо.",
        );
        refresh();
    }
});

OnCustomPacket(OP_ECHO_ERROR, packet => {
    const error = new EchoErrorMsg("");
    error.read(packet);
    stateRequestInFlight = false;
    stateRequestElapsed = 0;
    const cardError = error.context == ECHO_ERROR_CONTEXT_CARD
        || (error.context == ECHO_ERROR_CONTEXT_GENERAL && waitingForServer);
    const collectionError = error.context == ECHO_ERROR_CONTEXT_COLLECTION
        || (error.context == ECHO_ERROR_CONTEXT_GENERAL && collectionWaiting);
    if (cardError) {
        waitingForServer = false;
        choiceWaitElapsed = 0;
        selectedName = "";
        statusMessage = error.message;
        statusIsError = true;
        preserveNextStateError = true;
    }
    if (collectionError) {
        collectionMessage = error.message;
        collectionMessageIsError = true;
        preserveNextCollectionError = true;
    }
    print(`${tr("|cffff6060Echo:|r", "|cffff6060Эхо:|r")} ${error.message}`);
    refresh();
    refreshCollection();
});

const networkWaiter = CreateFrame("Frame");
networkWaiter.SetScript("OnUpdate", (self, elapsed) => {
    if (queuedStateRequest) {
        networkPollElapsed += elapsed;
        if (networkPollElapsed >= CLICK_GRACE_SECONDS) {
            networkPollElapsed = 0;
            sendStateRequest();
        }
    }
    if (stateRequestInFlight && !waitingForServer) {
        stateRequestElapsed += elapsed;
        if (stateRequestElapsed >= STATE_TIMEOUT_SECONDS) {
            stateRequestInFlight = false;
            stateRequestElapsed = 0;
            queuedStateRequest = true;
            statusMessage = tr(
                "The server did not respond; synchronizing again...",
                "Сервер не ответил; повторяем синхронизацию...",
            );
            statusIsError = true;
            refresh();
            sendStateRequest();
        }
    }
    if (waitingForServer) {
        choiceWaitElapsed += elapsed;
        if (choiceWaitElapsed >= CHOICE_TIMEOUT_SECONDS) {
            waitingForServer = false;
            choiceWaitElapsed = 0;
            selectedName = "";
            stateRequestInFlight = false;
            stateRequestElapsed = 0;
            queuedStateRequest = true;
            statusMessage = tr(
                "The server did not respond in time; requesting state again.",
                "Сервер не ответил вовремя; состояние запрашивается повторно.",
            );
            statusIsError = true;
            refresh();
            sendStateRequest();
        }
    }
    if (collectionWaiting) {
        collectionWaitElapsed += elapsed;
        if (collectionWaitElapsed >= STATE_TIMEOUT_SECONDS) {
            collectionWaiting = false;
            collectionWaitElapsed = 0;
            pendingCollectionToken = 0;
            collectionMessage = tr(
                "The server did not confirm the change; requesting state again.",
                "Сервер не подтвердил изменение; состояние запрашивается повторно.",
            );
            collectionMessageIsError = true;
            refreshCollection();
            requestState();
        }
    }
});

const bootstrap = CreateFrame("Frame");
bootstrap.RegisterEvent("PLAYER_ENTERING_WORLD");
bootstrap.SetScript("OnEvent", () => {
    ensureCollectionMenuButton();
    requestState();
});

export function initEchoUI(): void {
    (_G as any).SLASH_ECHO1 = "/echo";
    SlashCmdList.ECHO = () => toggle();
    (_G as any).SLASH_ECHOCOLLECTION1 = "/echoes";
    (SlashCmdList as any).ECHOCOLLECTION = () => toggleCollectionWindow();
}
