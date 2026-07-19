/**
 * Survival UI — two status bars (hunger/thirst) synced from the server.
 */

import { OP_SURVIVAL, SurvivalRequest, SurvivalState } from "../shared/SurvivalMessages";

// FrameXML global not present in our typings; frame methods use self-calls,
// so a typed declaration compiles correctly (never call via `(_G as any)` — see gotchas)
declare const UIErrorsFrame: WoWAPI.MessageFrame;

const PRESSURE_THRESHOLD = 50;
const WARN_THRESHOLD = 25;
const UI_FONT = (_G["GameFontNormal"] as WoWAPI.FontInstance).GetFont()[0];
const RUSSIAN = GetLocale() == "ruRU";

function tr(english: string, russian: string): string {
    return RUSSIAN ? russian : english;
}

let state = new SurvivalState();

const frame = CreateFrame("Frame", "SurvivalFrame", UIParent);
frame.SetSize(214, 72);
frame.SetPoint("TOPRIGHT", UIParent, "TOPRIGHT", -200, -16);
frame.SetClampedToScreen(true);
frame.SetMovable(true);
frame.EnableMouse(true);
frame.RegisterForDrag("LeftButton");
frame.SetScript("OnDragStart", (self) => self.StartMoving());
frame.SetScript("OnDragStop", (self) => self.StopMovingOrSizing());
frame.SetBackdrop({
    bgFile: "Interface\\Tooltips\\UI-Tooltip-Background",
    edgeFile: "Interface\\Tooltips\\UI-Tooltip-Border",
    tile: true,
    tileSize: 16,
    edgeSize: 12,
    insets: { left: 3, right: 3, top: 3, bottom: 3 },
});
frame.SetBackdropColor(0.025, 0.02, 0.04, 0.9);
(frame as any).SetBackdropBorderColor(0.55, 0.42, 0.18, 1);

type Bar = { bar: WoWAPI.StatusBar; text: WoWAPI.FontString };

function makeBar(y: number, iconPath: string, r: number, g: number, b: number): Bar {
    const icon = frame.CreateTexture("", "ARTWORK");
    icon.SetTexture(iconPath);
    icon.SetTexCoord(0.08, 0.92, 0.08, 0.92);
    icon.SetSize(20, 20);
    icon.SetPoint("TOPLEFT", frame, "TOPLEFT", 10, y);

    const bar = CreateFrame("StatusBar", "", frame) as WoWAPI.StatusBar;
    bar.SetSize(166, 20);
    bar.SetPoint("TOPLEFT", frame, "TOPLEFT", 38, y);
    bar.SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar");
    bar.SetStatusBarColor(r, g, b, 1);
    bar.SetMinMaxValues(0, 100);
    bar.SetValue(100);

    const bg = bar.CreateTexture("", "BACKGROUND");
    bg.SetAllPoints(bar);
    bg.SetTexture(0, 0, 0, 0.5);

    const text = bar.CreateFontString("", "OVERLAY", "GameFontHighlightSmall");
    text.SetFont(UI_FONT, 10, "OUTLINE");
    text.SetPoint("CENTER", bar, "CENTER", 0, 0);
    text.SetShadowOffset(1, -1);
    text.SetText("");

    return { bar: bar, text: text };
}

const HUNGER_COLOR: [number, number, number] = [0.85, 0.55, 0.15]; // amber
const THIRST_COLOR: [number, number, number] = [0.2, 0.55, 0.95];  // blue

const hungerBar = makeBar(-9, "Interface\\Icons\\INV_Misc_Food_15", HUNGER_COLOR[0], HUNGER_COLOR[1], HUNGER_COLOR[2]);
const thirstBar = makeBar(-41, "Interface\\Icons\\INV_Drink_18", THIRST_COLOR[0], THIRST_COLOR[1], THIRST_COLOR[2]);

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Base color above 50%, smoothly turning red as the bar approaches empty. */
function applyBarColor(b: Bar, base: [number, number, number], value: number): void {
    const t = value >= 50 ? 0 : (50 - value) / 50;
    b.bar.SetStatusBarColor(lerp(base[0], 0.9, t), lerp(base[1], 0.12, t), lerp(base[2], 0.12, t), 1);
}

function refresh(): void {
    hungerBar.bar.SetValue(state.hunger);
    hungerBar.text.SetText(tr(`Satiety: ${Math.floor(state.hunger)}%`, `Сытость: ${Math.floor(state.hunger)}%`));
    applyBarColor(hungerBar, HUNGER_COLOR, state.hunger);
    thirstBar.bar.SetValue(state.thirst);
    thirstBar.text.SetText(tr(`Water: ${Math.floor(state.thirst)}%`, `Вода: ${Math.floor(state.thirst)}%`));
    applyBarColor(thirstBar, THIRST_COLOR, state.thirst);
}

function warnOnce(text: string): void {
    UIErrorsFrame.AddMessage(text, 1, 0.25, 0.15, 1, false);
    PlaySound("igQuestFailed");
}

/** Screen warnings on downward threshold crossings. */
function checkWarnings(prev: SurvivalState, cur: SurvivalState): void {
    if (prev.hunger > PRESSURE_THRESHOLD && cur.hunger <= PRESSURE_THRESHOLD) {
        warnOnce(tr("Hunger is beginning to weaken you!", "Голод начинает ослаблять вас!"));
    }
    if (prev.hunger > WARN_THRESHOLD && cur.hunger <= WARN_THRESHOLD) {
        warnOnce(tr("You are starving — eat something!", "Вы сильно истощены — пора поесть!"));
    }
    if (prev.hunger > 0 && cur.hunger <= 0) {
        warnOnce(tr("You are dying of hunger!", "Вы умираете от голода!"));
    }
    if (prev.thirst > PRESSURE_THRESHOLD && cur.thirst <= PRESSURE_THRESHOLD) {
        warnOnce(tr("Thirst is beginning to slow you down!", "Жажда начинает замедлять вас!"));
    }
    if (prev.thirst > WARN_THRESHOLD && cur.thirst <= WARN_THRESHOLD) {
        warnOnce(tr("You are severely dehydrated — drink something!", "Сильное обезвоживание — пора попить!"));
    }
    if (prev.thirst > 0 && cur.thirst <= 0) {
        warnOnce(tr("You are dying of thirst!", "Вы умираете от жажды!"));
    }
}

OnCustomPacket(OP_SURVIVAL, (packet) => {
    const prev = state;
    state = new SurvivalState();
    state.read(packet);
    checkWarnings(prev, state);
    refresh();
});

const bootstrap = CreateFrame("Frame");
bootstrap.RegisterEvent("PLAYER_ENTERING_WORLD");
bootstrap.SetScript("OnEvent", () => {
    new SurvivalRequest().write().Send();
});

export function initSurvivalUI(): void {
    refresh();
}
