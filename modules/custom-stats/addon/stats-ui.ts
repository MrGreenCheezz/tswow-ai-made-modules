/** Character-sheet rows plus per-instance affix tooltip lines. */

import {
    isMakerMarkProperty,
    itemPropertyTooltip,
} from "../shared/ItemProperties";
import {
    OP_ITEM_PROPERTIES,
    OP_STATS,
    ItemPropertiesRequest,
    ItemPropertiesState,
    ITEM_LOCATION_BAG,
    ITEM_LOCATION_EQUIPMENT,
    StatsRequest,
    StatsState,
} from "../shared/StatMessages";

const AFFIX_COLOR = "|cffb46cff";
const MAKER_MARK_COLOR = "|cffffc44d";
const UI_FONT = (_G["GameFontNormal"] as WoWAPI.FontInstance).GetFont()[0];
const RUSSIAN = GetLocale() == "ruRU";

function tr(english: string, russian: string): string {
    return RUSSIAN ? russian : english;
}

let stats = new StatsState();
let hoverLocation = -1;
let hoverBag = -1;
let hoverSlot = -1;
let hoverEntry = 0;
let hoverRequestToken = 0;
let nextRequestToken = 0;
let hoverState: ItemPropertiesState | undefined = undefined;
let tooltipHasTrackedItem = false;
let tooltipRefreshPaused = false;
let shownLineKeys: { [key: string]: boolean } = {};

function round1(value: number): number {
    return Math.floor(value * 10) / 10;
}

function locationKey(location: number, bag: number, slot: number): string {
    return `${location}:${bag}:${slot}`;
}

function itemEntryFromLink(link: string | undefined): number {
    if (!link) return 0;
    const marker = link.indexOf("item:");
    if (marker < 0) return 0;
    const start = marker + 5;
    const end = link.indexOf(":", start);
    const raw = end >= 0 ? link.substring(start, end) : link.substring(start);
    return tonumber(raw) || 0;
}

function pauseTooltipRefresh(): void {
    tooltipRefreshPaused = true;
    (GameTooltip as any).updateTooltip = 0x7fffffff;
}

function resumeTooltipRefresh(): void {
    if (!tooltipRefreshPaused) return;
    tooltipRefreshPaused = false;
    (GameTooltip as any).updateTooltip = 0;
}

function addProperties(state: ItemPropertiesState, key: string): void {
    let added = false;
    for (let i = 0; i < state.properties.length; i++) {
        const property = state.properties[i];
        const lineKey = `${key}:${state.itemGuid}:${property.propertySerial}`;
        const text = itemPropertyTooltip(property.propertyId, property.value1, property.value2, RUSSIAN);
        if (!shownLineKeys[lineKey] && text.length > 0) {
            const color = isMakerMarkProperty(property.propertyId) ? MAKER_MARK_COLOR : AFFIX_COLOR;
            GameTooltip.AddLine(`${color}${text}|r`);
            shownLineKeys[lineKey] = true;
            added = true;
        }
    }
    if (added) {
        GameTooltip.Show();
        pauseTooltipRefresh();
    }
}

function requestProperties(location: number, bag: number, slot: number, link: string | undefined): void {
    const entry = itemEntryFromLink(link);
    tooltipHasTrackedItem = entry > 0;
    const sameHover = location == hoverLocation
        && bag == hoverBag
        && slot == hoverSlot
        && entry == hoverEntry;
    if (!sameHover) {
        hoverLocation = location;
        hoverBag = bag;
        hoverSlot = slot;
        hoverEntry = entry;
        hoverRequestToken = 0;
        hoverState = undefined;
    }
    if (hoverEntry <= 0) return;
    if (hoverState !== undefined) {
        addProperties(hoverState, locationKey(location, bag, slot));
        return;
    }
    if (hoverRequestToken > 0) return;

    nextRequestToken = nextRequestToken >= 4294967295 ? 1 : nextRequestToken + 1;
    hoverRequestToken = nextRequestToken;
    new ItemPropertiesRequest(location, bag, slot, hoverRequestToken).write().Send();
}

function clearShownPropertyLines(): void {
    resumeTooltipRefresh();
    shownLineKeys = {};
    tooltipHasTrackedItem = false;
}

function clearItemCache(): void {
    clearShownPropertyLines();
    hoverLocation = -1;
    hoverBag = -1;
    hoverSlot = -1;
    hoverEntry = 0;
    hoverRequestToken = 0;
    hoverState = undefined;
}

const panel = CreateFrame("Frame", "CustomStatsCharacterPanel", PaperDollFrame);
panel.SetSize(248, 122);
panel.SetPoint("TOPLEFT", CharacterFrame, "TOPRIGHT", -8, -30);
panel.SetBackdrop({
    bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
    edgeFile: "Interface\\Tooltips\\UI-Tooltip-Border",
    tile: true,
    tileSize: 16,
    edgeSize: 14,
    insets: { left: 3, right: 3, top: 3, bottom: 3 },
});
panel.SetBackdropColor(0.025, 0.02, 0.04, 0.96);
(panel as any).SetBackdropBorderColor(0.55, 0.42, 0.18, 1);

const headerIcon = panel.CreateTexture("", "ARTWORK");
headerIcon.SetTexture("Interface\\Icons\\Spell_Holy_PowerInfusion");
headerIcon.SetTexCoord(0.08, 0.92, 0.08, 0.92);
headerIcon.SetSize(20, 20);
headerIcon.SetPoint("TOPLEFT", panel, "TOPLEFT", 13, -11);

const title = panel.CreateFontString("", "OVERLAY", "GameFontNormal");
title.SetFont(UI_FONT, 12, "OUTLINE");
title.SetPoint("LEFT", headerIcon, "RIGHT", 8, 0);
title.SetShadowOffset(1, -1);
title.SetTextColor(1, 0.84, 0.3);
title.SetText(tr("Additional Stats", "Дополнительные характеристики"));

const separator = panel.CreateTexture("", "ARTWORK");
separator.SetTexture(0.55, 0.42, 0.18, 0.65);
separator.SetPoint("TOPLEFT", panel, "TOPLEFT", 12, -39);
separator.SetSize(panel.GetWidth() - 24, 1);

function createRow(index: number): WoWAPI.FontString {
    const row = panel.CreateFontString("", "OVERLAY", "GameFontHighlightSmall");
    row.SetFont(UI_FONT, 11, "OUTLINE");
    row.SetPoint("TOPLEFT", panel, "TOPLEFT", 15, -49 - index * 22);
    row.SetWidth(panel.GetWidth() - 30);
    row.SetJustifyH("LEFT");
    row.SetShadowOffset(1, -1);
    return row;
}

const vampirismRow = createRow(0);
const thornsRow = createRow(1);
const masteryRow = createRow(2);

function refreshCharacterPanel(): void {
    vampirismRow.SetText(tr(
        `Vampirism: ${stats.vampirism} (${round1(stats.vampirismPct)}% healing)`,
        `Вампиризм: ${stats.vampirism} (${round1(stats.vampirismPct)}% лечения)`,
    ));
    thornsRow.SetText(tr(
        `Thorns: ${stats.thorns} (${round1(stats.thornsPct)}% reflected)`,
        `Шипы: ${stats.thorns} (${round1(stats.thornsPct)}% отражения)`,
    ));
    masteryRow.SetText(tr(
        `Mastery: ${stats.mastery} (${round1(stats.masteryPct)}% double loot)`,
        `Мастерство: ${stats.mastery} (${round1(stats.masteryPct)}% двойной добычи)`,
    ));
}

function requestStats(): void {
    new StatsRequest().write().Send();
}

function hookTooltips(): void {
    (GameTooltip as any).HookScript("OnTooltipCleared", clearShownPropertyLines);
    (GameTooltip as any).HookScript("OnHide", clearItemCache);

    hooksecurefunc(GameTooltip as any, "SetBagItem", (tooltip: WoWAPI.GameTooltip, bag: number, slot: number) => {
        requestProperties(ITEM_LOCATION_BAG, bag, slot, GetContainerItemLink(bag as any, slot));
    });
    hooksecurefunc(GameTooltip as any, "SetInventoryItem", (tooltip: WoWAPI.GameTooltip, unit: string, slot: number) => {
        if (unit == "player") {
            requestProperties(ITEM_LOCATION_EQUIPMENT, 0, slot, GetInventoryItemLink("player", slot));
        }
    });
}

OnCustomPacket(OP_STATS, packet => {
    stats = new StatsState();
    stats.read(packet);
    refreshCharacterPanel();
});

OnCustomPacket(OP_ITEM_PROPERTIES, packet => {
    const state = new ItemPropertiesState();
    state.read(packet);
    if (
        state.requestToken == hoverRequestToken
        && state.location == hoverLocation
        && state.bag == hoverBag
        && state.slot == hoverSlot
        && state.itemEntry == hoverEntry
        && tooltipHasTrackedItem
        && GameTooltip.IsShown()
    ) {
        hoverRequestToken = 0;
        hoverState = state;
        addProperties(state, locationKey(state.location, state.bag, state.slot));
    }
});

export function initStatsUI(): void {
    hookTooltips();
    refreshCharacterPanel();
    CharacterFrame.HookScript("OnShow", requestStats);

    const events = CreateFrame("Frame");
    events.RegisterEvent("PLAYER_ENTERING_WORLD");
    events.RegisterEvent("UNIT_INVENTORY_CHANGED");
    events.RegisterEvent("BAG_UPDATE");
    events.RegisterEvent("PLAYERBANKSLOTS_CHANGED");
    events.RegisterEvent("PLAYERBANKBAGSLOTS_CHANGED");
    events.RegisterEvent("MODIFIER_STATE_CHANGED");
    events.RegisterEvent("BAG_UPDATE_COOLDOWN");
    events.RegisterEvent("UPDATE_INVENTORY_DURABILITY");
    events.SetScript("OnEvent", (self, event) => {
        if (event == "MODIFIER_STATE_CHANGED"
            || event == "BAG_UPDATE_COOLDOWN"
            || event == "UPDATE_INVENTORY_DURABILITY") {
            resumeTooltipRefresh();
            return;
        }
        if (event == "BAG_UPDATE"
            || event == "UNIT_INVENTORY_CHANGED"
            || event == "PLAYERBANKSLOTS_CHANGED"
            || event == "PLAYERBANKBAGSLOTS_CHANGED") clearItemCache();
        requestStats();
    });
}
