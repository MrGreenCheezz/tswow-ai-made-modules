const ICON_SIZE = 40;
const COL = 70;
const ROW = 48;
const FALLBACK_ICON = "Interface\\Icons\\INV_Misc_QuestionMark";
const UI_FONT = (_G["GameFontNormal"] as WoWAPI.FontInstance).GetFont()[0];
const RUSSIAN = GetLocale() == "ruRU";

function tr(english: string, russian: string): string {
    return RUSSIAN ? russian : english;
}

type Talent = {
    id: string;
    name: string;
    spell: number;
    rank: string;
    col: number;
    row: number;
    desc: string;
};

type TalentLink = [string, string];

const balanceTalents: Talent[] = [
    { id: "starlight-wrath", name: "Starlight Wrath", spell: 16818, rank: "5/5", col: 1, row: 0, desc: "Reduces the cast time of Wrath and Starfire." },
    { id: "genesis", name: "Genesis", spell: 57814, rank: "5/5", col: 3, row: 0, desc: "Increases damage and healing done by periodic druid spells." },
    { id: "moonglow", name: "Moonglow", spell: 16847, rank: "3/3", col: 0, row: 1, desc: "Reduces the mana cost of Moonfire, Starfire, Wrath, Healing Touch and Rejuvenation." },
    { id: "natures-majesty", name: "Nature's Majesty", spell: 35364, rank: "2/2", col: 2, row: 1, desc: "Increases critical strike chance with Wrath, Starfire, Starfall, Nourish and Healing Touch." },
    { id: "improved-moonfire", name: "Improved Moonfire", spell: 16822, rank: "2/2", col: 4, row: 1, desc: "Increases the damage and critical strike chance of Moonfire." },
    { id: "brambles", name: "Brambles", spell: 16840, rank: "3/3", col: 0, row: 2, desc: "Increases damage from Thorns and treant attacks." },
    { id: "natures-grace", name: "Nature's Grace", spell: 61346, rank: "3/3", col: 2, row: 2, desc: "Spell critical strikes reduce the cast time of your next spell." },
    { id: "natures-splendor", name: "Nature's Splendor", spell: 57865, rank: "1/1", col: 4, row: 2, desc: "Increases the duration of Moonfire, Rejuvenation, Regrowth, Lifebloom and Insect Swarm." },
    { id: "natures-reach", name: "Nature's Reach", spell: 16820, rank: "2/2", col: 0, row: 3, desc: "Increases range of Balance spells and reduces threat." },
    { id: "vengeance", name: "Vengeance", spell: 16913, rank: "5/5", col: 2, row: 3, desc: "Increases critical strike damage bonus of Starfire, Starfall, Moonfire and Wrath." },
    { id: "celestial-focus", name: "Celestial Focus", spell: 16924, rank: "3/3", col: 4, row: 3, desc: "Gives Starfire a stun chance and increases spell haste." },
    { id: "lunar-guidance", name: "Lunar Guidance", spell: 33591, rank: "3/3", col: 1, row: 4, desc: "Increases spell power based on Intellect." },
    { id: "insect-swarm", name: "Insect Swarm", spell: 5570, rank: "1/1", col: 2, row: 4, desc: "The enemy target is swarmed by insects, taking Nature damage and missing more often." },
    { id: "improved-insect-swarm", name: "Improved Insect Swarm", spell: 57851, rank: "3/3", col: 3, row: 4, desc: "Improves Wrath and Starfire against targets affected by your damage over time spells." },
    { id: "dreamstate", name: "Dreamstate", spell: 33956, rank: "3/3", col: 1, row: 5, desc: "Regenerates mana equal to a percentage of your Intellect." },
    { id: "moonfury", name: "Moonfury", spell: 16899, rank: "3/3", col: 2, row: 5, desc: "Increases damage done by Starfire, Moonfire and Wrath." },
    { id: "balance-of-power", name: "Balance of Power", spell: 33596, rank: "2/2", col: 3, row: 5, desc: "Increases spell hit chance and reduces spell damage taken." },
    { id: "moonkin-form", name: "Moonkin Form", spell: 24858, rank: "1/1", col: 2, row: 6, desc: "Shapeshift into Moonkin Form, increasing armor and spell critical strike aura." },
    { id: "improved-moonkin", name: "Improved Moonkin Form", spell: 48396, rank: "3/3", col: 2, row: 7, desc: "Increases spell haste and spell power contribution in Moonkin Form." },
    { id: "improved-faerie-fire", name: "Improved Faerie Fire", spell: 33602, rank: "3/3", col: 4, row: 7, desc: "Improves Faerie Fire and increases chance to hit the target." },
    { id: "owlkin-frenzy", name: "Owlkin Frenzy", spell: 48393, rank: "3/3", col: 0, row: 8, desc: "Damage taken can increase your damage and prevent spell pushback." },
    { id: "wrath-of-cenarius", name: "Wrath of Cenarius", spell: 33607, rank: "5/5", col: 2, row: 8, desc: "Your Starfire and Wrath gain additional benefit from spell power." },
    { id: "eclipse", name: "Eclipse", spell: 48525, rank: "3/3", col: 3, row: 8, desc: "Wrath and Starfire critical strikes empower the other spell." },
    { id: "typhoon", name: "Typhoon", spell: 50516, rank: "1/1", col: 0, row: 9, desc: "Summons a violent Typhoon that damages and knocks enemies back." },
    { id: "force-of-nature", name: "Force of Nature", spell: 33831, rank: "1/1", col: 2, row: 9, desc: "Summons treants to attack your current enemy." },
    { id: "gale-winds", name: "Gale Winds", spell: 48514, rank: "2/2", col: 4, row: 9, desc: "Increases damage done by Hurricane and Typhoon." },
    { id: "earth-and-moon", name: "Earth and Moon", spell: 48511, rank: "3/3", col: 2, row: 10, desc: "Wrath and Starfire increase spell damage taken by the target." },
    { id: "starfall", name: "Starfall", spell: 48505, rank: "1/1", col: 2, row: 11, desc: "Summons a flurry of stars to strike nearby enemies." },
];

const feralTalents: Talent[] = [
    { id: "ferocity", name: "Ferocity", spell: 16938, rank: "5/5", col: 1, row: 0, desc: "Reduces the cost of Maul, Swipe, Claw, Rake and Mangle." },
    { id: "feral-aggression", name: "Feral Aggression", spell: 16862, rank: "5/5", col: 3, row: 0, desc: "Increases Ferocious Bite damage and Demoralizing Roar effect." },
    { id: "feral-instinct", name: "Feral Instinct", spell: 16949, rank: "3/3", col: 0, row: 1, desc: "Increases threat in Bear Form and reduces stealth detection." },
    { id: "savage-fury", name: "Savage Fury", spell: 16999, rank: "2/2", col: 2, row: 1, desc: "Increases damage caused by Claw, Rake, Mangle and Maul." },
    { id: "thick-hide", name: "Thick Hide", spell: 16931, rank: "3/3", col: 4, row: 1, desc: "Increases your armor contribution from items." },
    { id: "feral-swiftness", name: "Feral Swiftness", spell: 24866, rank: "2/2", col: 0, row: 2, desc: "Increases movement speed in Cat Form and dodge chance." },
    { id: "survival-instincts", name: "Survival Instincts", spell: 61336, rank: "1/1", col: 2, row: 2, desc: "Temporarily increases your maximum health." },
    { id: "sharpened-claws", name: "Sharpened Claws", spell: 16944, rank: "3/3", col: 3, row: 2, desc: "Increases critical strike chance in Bear, Dire Bear and Cat Form." },
    { id: "shredding-attacks", name: "Shredding Attacks", spell: 16968, rank: "2/2", col: 1, row: 3, desc: "Reduces the energy cost of Shred and rage cost of Lacerate." },
    { id: "predatory-strikes", name: "Predatory Strikes", spell: 16975, rank: "3/3", col: 2, row: 3, desc: "Increases melee attack power in forms and enables instant spells after finishing moves." },
    { id: "primal-fury", name: "Primal Fury", spell: 37117, rank: "2/2", col: 3, row: 3, desc: "Critical strikes in forms generate extra rage or combo points." },
    { id: "primal-precision", name: "Primal Precision", spell: 48410, rank: "2/2", col: 1, row: 4, desc: "Increases expertise and refunds energy on missed finishing moves." },
    { id: "brutal-impact", name: "Brutal Impact", spell: 16941, rank: "2/2", col: 2, row: 4, desc: "Increases stun duration and reduces Bash cooldown." },
    { id: "feral-charge", name: "Feral Charge", spell: 49377, rank: "1/1", col: 3, row: 4, desc: "Charge an enemy in Bear Form or leap behind in Cat Form." },
    { id: "nurturing-instinct", name: "Nurturing Instinct", spell: 33873, rank: "2/2", col: 0, row: 5, desc: "Increases healing done to you and healing based on Agility." },
    { id: "natural-reaction", name: "Natural Reaction", spell: 57881, rank: "3/3", col: 1, row: 5, desc: "Increases dodge and rage generation in Bear Form." },
    { id: "heart-of-the-wild", name: "Heart of the Wild", spell: 24894, rank: "5/5", col: 2, row: 5, desc: "Increases Intellect, Stamina in Bear Form and attack power in Cat Form." },
    { id: "survival-of-the-fittest", name: "Survival of the Fittest", spell: 33856, rank: "3/3", col: 3, row: 5, desc: "Increases attributes and reduces chance to be critically hit." },
    { id: "leader-of-the-pack", name: "Leader of the Pack", spell: 17007, rank: "1/1", col: 2, row: 6, desc: "Increases melee and ranged critical strike chance of party and raid members." },
    { id: "improved-leader", name: "Improved Leader of the Pack", spell: 34300, rank: "2/2", col: 2, row: 7, desc: "Leader of the Pack heals allies and restores mana." },
    { id: "primal-tenacity", name: "Primal Tenacity", spell: 33957, rank: "3/3", col: 4, row: 7, desc: "Reduces fear duration and damage taken while stunned." },
    { id: "protector-of-the-pack", name: "Protector of the Pack", spell: 57877, rank: "3/3", col: 1, row: 8, desc: "Increases attack power and reduces damage taken in Bear Form." },
    { id: "predatory-instincts", name: "Predatory Instincts", spell: 33867, rank: "3/3", col: 2, row: 8, desc: "Increases critical strike damage and reduces area damage taken." },
    { id: "infected-wounds", name: "Infected Wounds", spell: 48485, rank: "3/3", col: 3, row: 8, desc: "Mangle, Maul and Shred reduce enemy movement and attack speed." },
    { id: "king-of-the-jungle", name: "King of the Jungle", spell: 48495, rank: "3/3", col: 1, row: 9, desc: "Improves Enrage and Tiger's Fury." },
    { id: "mangle", name: "Mangle", spell: 33917, rank: "1/1", col: 2, row: 9, desc: "Mangle the target, increasing bleed damage taken." },
    { id: "improved-mangle", name: "Improved Mangle", spell: 48491, rank: "3/3", col: 3, row: 9, desc: "Reduces the cooldown of Mangle and energy cost in Cat Form." },
    { id: "rend-and-tear", name: "Rend and Tear", spell: 51269, rank: "5/5", col: 2, row: 10, desc: "Increases damage against bleeding targets." },
    { id: "berserk", name: "Berserk", spell: 50334, rank: "1/1", col: 2, row: 11, desc: "Removes fear and greatly improves Mangle for a short time." },
];

const balanceLinks: TalentLink[] = [
    ["starlight-wrath", "natures-majesty"], ["genesis", "improved-moonfire"],
    ["natures-majesty", "natures-grace"], ["improved-moonfire", "natures-splendor"],
    ["natures-grace", "vengeance"], ["vengeance", "insect-swarm"],
    ["insect-swarm", "improved-insect-swarm"], ["insect-swarm", "moonfury"],
    ["moonfury", "moonkin-form"], ["moonkin-form", "improved-moonkin"],
    ["improved-moonkin", "wrath-of-cenarius"], ["wrath-of-cenarius", "force-of-nature"],
    ["eclipse", "earth-and-moon"], ["earth-and-moon", "starfall"],
];

const feralLinks: TalentLink[] = [
    ["ferocity", "savage-fury"], ["feral-aggression", "thick-hide"],
    ["savage-fury", "survival-instincts"], ["sharpened-claws", "primal-fury"],
    ["survival-instincts", "predatory-strikes"], ["predatory-strikes", "heart-of-the-wild"],
    ["primal-fury", "feral-charge"], ["feral-charge", "survival-of-the-fittest"],
    ["heart-of-the-wild", "leader-of-the-pack"], ["leader-of-the-pack", "improved-leader"],
    ["improved-leader", "predatory-instincts"], ["survival-of-the-fittest", "infected-wounds"],
    ["predatory-instincts", "mangle"], ["mangle", "rend-and-tear"], ["rend-and-tear", "berserk"],
];

function registerExclusiveWindow(target: WoWAPI.Frame): void {
    hooksecurefunc(target as any, "Show", () => {
        const globals = _G as any;
        const previous = globals.TSWOW_ActiveSystemWindow as WoWAPI.Frame | undefined;
        if (previous && previous != target && previous.IsShown()) previous.Hide();
        globals.TSWOW_ActiveSystemWindow = target;
    });
}

const talents = CreateFrame("Frame", "SimpleTalentWindow", UIParent);
registerExclusiveWindow(talents);
talents.SetSize(1120, 660);
talents.SetScale(0.9 * Math.min(
    1,
    (UIParent.GetWidth() - 40) / 1120,
    (UIParent.GetHeight() - 40) / 660,
));
talents.SetPoint("CENTER", UIParent, "CENTER", 0, 0);
talents.SetClampedToScreen(true);
talents.SetMovable(true);
talents.EnableMouse(true);
talents.RegisterForDrag("LeftButton");
talents.SetScript("OnDragStart", (self) => self.StartMoving());
talents.SetScript("OnDragStop", (self) => self.StopMovingOrSizing());
talents.SetBackdrop({
    bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
    edgeFile: "Interface\\DialogFrame\\UI-DialogBox-Border",
    tile: true,
    tileSize: 16,
    edgeSize: 16,
    insets: { left: 4, right: 4, top: 4, bottom: 4 },
});
talents.SetBackdropColor(0.02, 0.018, 0.035, 0.98);
(talents as any).SetBackdropBorderColor(0.55, 0.42, 0.18, 1);

const shade = talents.CreateTexture("", "BACKGROUND");
shade.SetTexture(0.015, 0.025, 0.035, 0.82);
shade.SetAllPoints(talents);

function treePanel(x: number): void {
    const border = talents.CreateTexture("", "BACKGROUND");
    border.SetTexture(0.52, 0.39, 0.14, 0.75);
    border.SetPoint("TOPLEFT", talents, "TOPLEFT", x - 2, -112);
    border.SetSize(474, 526);
    const background = talents.CreateTexture("", "BACKGROUND");
    background.SetTexture(0.018, 0.032, 0.04, 0.96);
    background.SetPoint("TOPLEFT", talents, "TOPLEFT", x, -114);
    background.SetSize(470, 522);
}

treePanel(45);
treePanel(595);

function label(parent: WoWAPI.Frame, value: string, x: number, y: number, size = 14) {
    const t = parent.CreateFontString("", "OVERLAY", "GameFontNormal");
    t.SetPoint("TOP", parent, "TOP", x, y);
    t.SetFont(UI_FONT, size, "OUTLINE");
    t.SetShadowOffset(1, -1);
    t.SetTextColor(1, 0.84, 0.3);
    t.SetText(value);
    return t;
}

label(talents, tr("Talents", "Таланты"), 0, -12, 14);
label(talents, tr("FERAL POINTS AVAILABLE", "ДОСТУПНО ОЧКОВ СИЛЫ ЗВЕРЯ"), -300, -54, 18);
label(talents, "0", -300, -88, 28);
label(talents, tr("BALANCE POINTS AVAILABLE", "ДОСТУПНО ОЧКОВ БАЛАНСА"), 300, -54, 18);
label(talents, "0", 300, -88, 28);

const closeButton = CreateFrame("Button", "SimpleTalentCloseButton", talents, "UIPanelCloseButton");
closeButton.SetSize(28, 28);
closeButton.SetPoint("TOPRIGHT", talents, "TOPRIGHT", -6, -6);
closeButton.SetScript("OnClick", () => talents.Hide());

function talentX(treeLeft: number, talent: Talent) {
    return treeLeft + talent.col * COL;
}

function talentY(treeTop: number, talent: Talent) {
    return treeTop + talent.row * ROW;
}

function segment(parent: WoWAPI.Frame, x: number, y: number, width: number, height: number, active = true) {
    const s = parent.CreateTexture("", "ARTWORK");
    s.SetTexture(active ? 0.75 : 0.32, active ? 0.63 : 0.32, active ? 0.12 : 0.32, active ? 0.95 : 0.75);
    s.SetPoint("TOPLEFT", parent, "TOPLEFT", x, -y);
    s.SetSize(width, height);
}

function hSegment(parent: WoWAPI.Frame, x1: number, x2: number, y: number, active = true) {
    segment(parent, Math.min(x1, x2), y, Math.abs(x2 - x1), 3, active);
}

function vSegment(parent: WoWAPI.Frame, x: number, y1: number, y2: number, active = true) {
    segment(parent, x, Math.min(y1, y2), 3, Math.abs(y2 - y1), active);
}

function findTalent(tree: Talent[], id: string) {
    for (let i = 0; i < tree.length; i++) {
        if (tree[i].id === id) {
            return tree[i];
        }
    }
    return undefined;
}

function drawLink(parent: WoWAPI.Frame, tree: Talent[], treeLeft: number, treeTop: number, fromId: string, toId: string) {
    const from = findTalent(tree, fromId);
    const to = findTalent(tree, toId);
    if (!from || !to) {
        return;
    }

    const x1 = talentX(treeLeft, from) + ICON_SIZE / 2;
    const y1 = talentY(treeTop, from) + ICON_SIZE;
    const x2 = talentX(treeLeft, to) + ICON_SIZE / 2;
    const y2 = talentY(treeTop, to);
    const midY = y1 + Math.max(10, (y2 - y1) / 2);

    vSegment(parent, x1, y1, midY);
    if (x1 !== x2) {
        hSegment(parent, x1, x2, midY);
    }
    vSegment(parent, x2, midY, y2);
}

function spellIcon(spell: number) {
    const info = GetSpellInfo(spell);
    return info[2] || GetSpellTexture(spell, BOOKTYPE_SPELL) || FALLBACK_ICON;
}

function localizedTalentName(talent: Talent): string {
    if (!RUSSIAN) return talent.name;
    const info = GetSpellInfo(talent.spell);
    return info[0] || talent.name;
}

function localizedTalentDescription(talent: Talent): string {
    if (!RUSSIAN) return talent.desc;
    return GetSpellDescription(talent.spell) || talent.desc;
}

function renderTalent(parent: WoWAPI.Frame, treeLeft: number, treeTop: number, talent: Talent, spent: boolean) {
    const button = CreateFrame("Button", "", parent);
    button.SetSize(ICON_SIZE, ICON_SIZE);
    button.SetPoint("TOPLEFT", parent, "TOPLEFT", talentX(treeLeft, talent), -talentY(treeTop, talent));
    button.SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square");
    button.SetPushedTexture("Interface\\Buttons\\UI-Quickslot-Depress");

    const iconTexture = button.CreateTexture("", "BACKGROUND");
    iconTexture.SetTexture(spellIcon(talent.spell));
    iconTexture.SetAllPoints(button);
    iconTexture.SetTexCoord(0.08, 0.92, 0.08, 0.92);

    const rankBg = button.CreateTexture("", "OVERLAY");
    rankBg.SetTexture(0, 0, 0, 0.9);
    rankBg.SetPoint("BOTTOMRIGHT", button, "BOTTOMRIGHT", 5, -4);
    rankBg.SetSize(29, 15);

    const rank = button.CreateFontString("", "OVERLAY", "NumberFontNormal");
    rank.SetPoint("CENTER", rankBg, "CENTER", 0, 0);
    rank.SetText(talent.rank);

    if (!spent) {
        iconTexture.SetVertexColor(0.35, 0.35, 0.35, 1);
    }

    button.SetScript("OnEnter", () => {
        GameTooltip.SetOwner(button, "ANCHOR_RIGHT");
        GameTooltip.SetText(localizedTalentName(talent), 1, 0.82, 0);
        GameTooltip.AddLine(localizedTalentDescription(talent), 1, 1, 1, true);
        GameTooltip.AddLine(
            tr(`Rank ${talent.rank}`, `Ранг ${talent.rank}`),
            spent ? 0.2 : 0.7,
            spent ? 1 : 0.7,
            spent ? 0.2 : 0.7,
        );
        GameTooltip.Show();
    });
    button.SetScript("OnLeave", () => GameTooltip.Hide());
}

function requirement(parent: WoWAPI.Frame, treeLeft: number, treeTop: number, row: number, value: string) {
    const y = treeTop + row * ROW - 10;
    segment(parent, treeLeft - 5, y, COL * 5, 1, false);
    const t = parent.CreateFontString("", "OVERLAY", "GameFontNormalSmall");
    t.SetFont(UI_FONT, 9, "OUTLINE");
    t.SetPoint("TOPLEFT", parent, "TOPLEFT", treeLeft + COL * 5 + 8, -y + 8);
    t.SetText(tr(`|cff33ff99${value} Required|r`, `|cff33ff99Требуется: ${value}|r`));
}

function renderTree(parent: WoWAPI.Frame, tree: Talent[], links: TalentLink[], treeLeft: number, treeTop: number) {
    requirement(parent, treeLeft, treeTop, 4, "10");
    requirement(parent, treeLeft, treeTop, 7, "25");

    for (let i = 0; i < links.length; i++) {
        drawLink(parent, tree, treeLeft, treeTop, links[i][0], links[i][1]);
    }

    for (let i = 0; i < tree.length; i++) {
        renderTalent(parent, treeLeft, treeTop, tree[i], i % 5 !== 1);
    }
}

let treesBuilt = false;

function buildTalentTrees() {
    if (treesBuilt) {
        return;
    }

    renderTree(talents, feralTalents, feralLinks, 70, 124);
    renderTree(talents, balanceTalents, balanceLinks, 620, 124);
    treesBuilt = true;
}

const reset = CreateFrame("Button", "", talents, "UIPanelButtonTemplate");
reset.SetSize(150, 24);
reset.SetPoint("BOTTOM", talents, "BOTTOM", 0, 22);
reset.SetText(tr("Reset All Talents", "Сбросить все таланты"));
reset.GetFontString().SetFont(UI_FONT, 11, "OUTLINE");

talents.Hide();

function toggleTalentWindow() {
    if (talents.IsVisible()) {
        talents.Hide();
    } else {
        buildTalentTrees();
        talents.Show();
    }
}

SlashCmdList.SIMPLE_BUTTON_ADDON = () => {
    toggleTalentWindow();
};

_G.SLASH_SIMPLE_BUTTON_ADDON1 = "/simplebutton";
_G.SLASH_SIMPLE_BUTTON_ADDON2 = "/sbutton";
// "/talents" is now owned by the retail-talents module
