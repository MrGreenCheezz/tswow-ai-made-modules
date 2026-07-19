/**
 * Универсальные таланты — UI в стиле tswow-store.
 *
 * Слева — пять деревьев (ОСНОВА / МАГИЯ / ОРУЖИЕ / ЖИВУЧЕСТЬ / СПУТНИКИ), справа —
 * карточки талантов с рангом и кнопкой «Изучить». Кнопка талантов клиента и
 * /utalent открывают это окно.
 */

import {
    COMPANION_TREE,
    CORE_TREE,
    FIRE_TREE,
    RESET_ALL,
    TREE_CORE,
    VITALITY_TREE,
    WEAPON_TREE,
    TalentNode,
    TalentTree,
    isSpecTree,
    talentDescription,
    talentName,
    tagName,
    treeName,
} from "../datascripts/shared/TalentDefs";
import {
    ErrorMsg,
    LearnRequest,
    OP_ERROR,
    OP_STATE,
    ResetRequest,
    StateRequest,
    TalentState,
} from "../shared/TalentMessages";
import {
    createStoreWindow, createSidebar, createCardGrid, createActionButton,
    createNavArrows, StoreCard, STORE_FONT,
} from "./StoreStyle";

const TREES: TalentTree[] = [CORE_TREE, FIRE_TREE, WEAPON_TREE, VITALITY_TREE, COMPANION_TREE];
const CARDS_PER_PAGE = 8;
const RUSSIAN = GetLocale() == "ruRU";

function tr(english: string, russian: string): string {
    return RUSSIAN ? russian : english;
}

const TREE_ICONS: string[] = [
    "Interface\\Icons\\Spell_Holy_WordFortitude",
    "Interface\\Icons\\Spell_Fire_FireBolt02",
    "Interface\\Icons\\Ability_MeleeDamage",
    "Interface\\Icons\\Spell_Holy_DevotionAura",
    "Interface\\Icons\\Ability_Hunter_BeastCall",
];

let state = new TalentState();
let activeTree = TREE_CORE;
let activePage = 0;
let lastMessage = tr(
    "Use /utalent to open this window.",
    "Используйте /utalent, чтобы открыть это окно.",
);
let frame: WoWAPI.Frame | undefined;
let cards: StoreCard[] = [];
let sidebar: ReturnType<typeof createSidebar> | undefined;
let pointsText: WoWAPI.FontString | undefined;
let messageText: WoWAPI.FontString | undefined;
let pageText: WoWAPI.FontString | undefined;

/* ------------------------------ вычисления --------------------------------- */
function spentInNode(treeId: number, nodeId: number): number {
    for (let i = 0; i < state.spent.length; i++) {
        const entry = state.spent[i];
        if (entry.treeId == treeId && entry.nodeId == nodeId) return entry.rank;
    }
    return 0;
}

function spentInTree(treeId: number): number {
    let total = 0;
    for (let i = 0; i < state.spent.length; i++) {
        const entry = state.spent[i];
        if (entry.treeId == treeId) total += entry.rank;
    }
    return total;
}

function spentSpec(): number {
    let total = 0;
    for (let i = 0; i < state.spent.length; i++) {
        if (isSpecTree(state.spent[i].treeId)) total += state.spent[i].rank;
    }
    return total;
}

function treeAvailable(treeId: number): number {
    return treeId == TREE_CORE ? state.classTotal - spentInTree(TREE_CORE) : state.specTotal - spentSpec();
}

function currentTree(): TalentTree {
    return TREES[activeTree] || CORE_TREE;
}

function findNode(tree: TalentTree, nodeId: number): TalentNode | undefined {
    for (let i = 0; i < tree.nodes.length; i++) {
        if (tree.nodes[i].id == nodeId) return tree.nodes[i];
    }
    return undefined;
}

function reqText(tree: TalentTree, node: TalentNode): string {
    const bits: string[] = [];
    if (node.requiredTag) bits.push(tr(
        `Style: ${tagName(node.requiredTag, false)}`,
        `Стиль: ${tagName(node.requiredTag, true)}`,
    ));
    if (node.gate > 0) bits.push(tr(
        `${node.gate} points in ${treeName(tree, false)}`,
        `${node.gate} очк. в ${treeName(tree, true)}`,
    ));
    for (let i = 0; i < node.requires.length; i++) {
        const other = findNode(tree, node.requires[i]);
        if (other) bits.push(tr(
            `Requires: ${talentName(tree.treeId, other, false)}`,
            `Нужно: ${talentName(tree.treeId, other, true)}`,
        ));
    }
    return bits.join(" | ");
}

function canSpendLocal(tree: TalentTree, node: TalentNode): boolean {
    const rank = spentInNode(tree.treeId, node.id);
    if (rank >= node.ranks.length || treeAvailable(tree.treeId) <= 0 || spentInTree(tree.treeId) < node.gate) return false;
    for (let i = 0; i < node.requires.length; i++) {
        if (spentInNode(tree.treeId, node.requires[i]) <= 0) return false;
    }
    return true;
}

function requestState(): void {
    new StateRequest().write().Send();
}

function maxPage(): number {
    return Math.max(0, Math.floor((currentTree().nodes.length - 1) / CARDS_PER_PAGE));
}

/* -------------------------------- окно ------------------------------------- */
function ensureFrame(): WoWAPI.Frame {
    if (frame) return frame;

    frame = createStoreWindow(
        "UniversalTalentFrame",
        tr("Universal Talents", "Универсальные таланты"),
    );

    sidebar = createSidebar(
        frame,
        TREES.map((tree, i) => ({ name: treeName(tree, RUSSIAN), icon: TREE_ICONS[i] })),
        (i) => {
            activeTree = TREES[i].treeId;
            activePage = 0;
            const selectedTreeName = treeName(TREES[i], RUSSIAN);
            lastMessage = tr(
                `${selectedTreeName}: ${spentInTree(TREES[i].treeId)} points spent.`,
                `${selectedTreeName}: вложено очков ${spentInTree(TREES[i].treeId)}.`,
            );
            refresh();
        },
    );

    cards = createCardGrid(frame, (i) => {
        const tree = currentTree();
        const node = tree.nodes[activePage * CARDS_PER_PAGE + i];
        if (!node || !frame) return;
        const rank = spentInNode(tree.treeId, node.id);
        GameTooltip.SetOwner(frame, "ANCHOR_CURSOR");
        GameTooltip.SetText(`${talentName(tree.treeId, node, RUSSIAN)} (${rank}/${node.ranks.length})`);
        GameTooltip.AddLine(talentDescription(tree.treeId, node, RUSSIAN), 1, 1, 1, true);
        const req = reqText(tree, node);
        if (req != "") GameTooltip.AddLine(req, 0.7, 0.7, 1, true);
        GameTooltip.Show();
    }, () => GameTooltip.Hide());

    for (let i = 0; i < cards.length; i++) {
        const index = i;
        cards[i].action.button.SetScript("OnClick", () => {
            const tree = currentTree();
            const node = tree.nodes[activePage * CARDS_PER_PAGE + index];
            if (!node) return;
            const localizedName = talentName(tree.treeId, node, RUSSIAN);
            lastMessage = tr(`Learning ${localizedName}...`, `Изучение ${localizedName}...`);
            refresh();
            new LearnRequest(tree.treeId, node.id).write().Send();
        });
    }

    pageText = createNavArrows(frame, () => {
        if (activePage > 0) activePage--;
        refresh();
    }, () => {
        if (activePage < maxPage()) activePage++;
        refresh();
    });

    pointsText = frame.CreateFontString(null, "OVERLAY", "GameFontNormal");
    pointsText.SetFont(STORE_FONT, 12, "OUTLINE");
    pointsText.SetPoint("TOPLEFT", frame, "TOPLEFT", frame.GetWidth() * 0.26, -44);
    pointsText.SetJustifyH("LEFT");

    messageText = frame.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    messageText.SetFont(STORE_FONT, 10, "OUTLINE");
    messageText.SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", frame.GetWidth() * 0.26, 14);
    messageText.SetWidth(frame.GetWidth() * 0.5);
    messageText.SetJustifyH("LEFT");

    // сброс — под колонкой категорий
    const resetTree = createActionButton(frame, 150, 24, tr("Reset tree", "Сброс ветки"));
    resetTree.button.SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", 22, 40);
    resetTree.button.SetScript("OnClick", () => {
        const tree = currentTree();
        const localizedTreeName = treeName(tree, RUSSIAN);
        lastMessage = tr(
            `Resetting ${localizedTreeName}...`,
            `Сброс ветки ${localizedTreeName}...`,
        );
        refresh();
        new ResetRequest(tree.treeId).write().Send();
    });

    const resetAll = createActionButton(frame, 150, 24, tr("Reset all", "Сброс всех"));
    resetAll.button.SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", 22, 14);
    resetAll.button.SetScript("OnClick", () => {
        lastMessage = tr("Resetting all talents...", "Сброс всех талантов...");
        refresh();
        new ResetRequest(RESET_ALL).write().Send();
    });

    const refreshBtn = createActionButton(frame, 110, 24, tr("Refresh", "Обновить"));
    refreshBtn.button.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -22, 14);
    refreshBtn.button.SetScript("OnClick", () => {
        lastMessage = tr("Refreshing...", "Обновление...");
        refresh();
        requestState();
    });

    frame.SetScript("OnShow", () => {
        PlaySound("igMainMenuOpen");
        requestState();
    });

    if (sidebar) sidebar.setActive(0);
    return frame;
}

function refresh(): void {
    if (!frame || !pointsText || !messageText || !pageText) return;

    const tree = currentTree();
    if (activePage > maxPage()) activePage = maxPage();
    const classSpent = spentInTree(TREE_CORE);
    const specSpentValue = spentSpec();
    pointsText.SetText(tr(
        `Core ${classSpent}/${state.classTotal} (free ${state.classTotal - classSpent})    `
            + `Spec ${specSpentValue}/${state.specTotal} (free ${state.specTotal - specSpentValue})    `
            + `In this tree: ${treeAvailable(tree.treeId)}`,
        `Основа ${classSpent}/${state.classTotal} (свободно ${state.classTotal - classSpent})    `
            + `Спец. ${specSpentValue}/${state.specTotal} (свободно ${state.specTotal - specSpentValue})    `
            + `В этой ветке: ${treeAvailable(tree.treeId)}`,
    ));
    messageText.SetText(lastMessage);
    pageText.SetText(`${activePage + 1}/${maxPage() + 1}`);

    for (let i = 0; i < TREES.length; i++) {
        if (sidebar) {
            sidebar.buttons[i].label.SetText(
                `${treeName(TREES[i], RUSSIAN)}  (${spentInTree(TREES[i].treeId)})`,
            );
        }
    }

    const treeIndex = activeTree < TREES.length ? activeTree : 0;
    for (let i = 0; i < cards.length; i++) {
        const node = tree.nodes[activePage * CARDS_PER_PAGE + i];
        if (!node) {
            cards[i].frame.Hide();
        } else {
            const rank = spentInNode(tree.treeId, node.id);
            cards[i].frame.Show();
            cards[i].icon.SetTexture(TREE_ICONS[treeIndex]);
            cards[i].title.SetText(talentName(tree.treeId, node, RUSSIAN));
            cards[i].sub.SetText(tr(
                `Rank ${rank}/${node.ranks.length}`,
                `Ранг ${rank}/${node.ranks.length}`,
            ));
            cards[i].setCost(undefined);

            const button = cards[i].action;
            if (rank >= node.ranks.length) {
                button.label.SetText(tr("Max", "Макс."));
                button.label.SetTextColor(0.5, 1, 0.5);
                button.button.Disable();
            } else if (!canSpendLocal(tree, node)) {
                button.label.SetText(tr("Locked", "Закрыто"));
                button.label.SetTextColor(0.6, 0.6, 0.6);
                button.button.Disable();
            } else {
                button.label.SetText(tr("Learn", "Изучить"));
                button.label.SetTextColor(1, 0.82, 0);
                button.button.Enable();
            }
        }
    }
}

function toggle(): void {
    const ui = ensureFrame();
    if (ui.IsShown()) {
        ui.Hide();
        return;
    }
    ui.Show();
    refresh();
}

function installTalentHook(): void {
    const globals = _G as any;
    globals.ToggleTalentFrame = () => toggle();
    globals.PlayerTalentFrame_Toggle = () => toggle();

    if (globals.TalentMicroButton) {
        globals.TalentMicroButton.SetScript("OnClick", () => toggle());
    }
}

OnCustomPacket(OP_STATE, (packet) => {
    state = new TalentState();
    state.read(packet);
    lastMessage = tr("State updated.", "Состояние обновлено.");
    refresh();
});

OnCustomPacket(OP_ERROR, (packet) => {
    const error = new ErrorMsg("");
    error.read(packet);
    lastMessage = error.message;
    print(`${tr("|cffff6060Universal Talents:|r", "|cffff6060Универсальные таланты:|r")} ${error.message}`);
    refresh();
});

const bootstrap = CreateFrame("Frame");
bootstrap.RegisterEvent("PLAYER_ENTERING_WORLD");
bootstrap.SetScript("OnEvent", () => requestState());

const talentHook = CreateFrame("Frame");
talentHook.RegisterEvent("PLAYER_LOGIN");
talentHook.RegisterEvent("ADDON_LOADED");
talentHook.SetScript("OnEvent", () => installTalentHook());

export function initTalentUI(): void {
    (_G as any).SLASH_UTALENT1 = "/utalent";
    (_G as any).SLASH_UTALENT2 = "/utalents";
    SlashCmdList.UTALENT = () => toggle();
    installTalentHook();
}
