/**
 * Custom companions — UI в стиле tswow-store.
 *
 * /companions (/спутники): карточки пойманных спутников, кнопка
 * «Призвать»/«Отозвать», клик по карточке показывает 3D-модель существа
 * в боковой панели (как предпросмотр в магазине). /companionattack
 * (/спутникатака) приказывает активному спутнику атаковать выбранную цель.
 */

import {
    CompanionActivateRequest,
    CompanionAttackRequest,
    CompanionError,
    CompanionExpeditionRequest,
    CompanionModeRequest,
    CompanionState,
    CompanionStateRequest,
    COMPANION_PROTOCOL_VERSION,
    COMPANION_MODE_DEFENSE,
    COMPANION_MODE_PASSIVE,
    COMPANION_MODE_TANK,
    COMPANION_EXPEDITION_CLAIM,
    COMPANION_EXPEDITION_START,
    OP_COMPANION_ERROR,
    OP_COMPANION_STATE,
    OP_COMPANION_SUMMARY_V3,
} from "../shared/CompanionMessages";
import {
    EXPEDITION_NONE,
    expeditionSpecialtyName,
} from "../shared/CompanionExpeditions";
import {
    COMPANION_SERVICE_RANKS,
    companionProfessionById,
    companionTraitById,
} from "../shared/CompanionProgression";
import {
    createStoreWindow, createSidebar, createCardGrid, createActionButton,
    createNavArrows, createSidePanel, StoreCard, STORE_FONT,
} from "./StoreStyle";
import {
    companionWorkforceAssigned,
    openCompanionProgression,
    reportCompanionProgressionError,
    requestCompanionWorkforceState,
    setCompanionWorkforceRefreshHandler,
    updateCompanionProgressionSummary,
} from "./CompanionProgressionUI";

const CARDS_PER_PAGE = 8;
const COMPANION_ICON = "Interface\\Icons\\Ability_Hunter_BeastCall";
const SECTION_ALL = 0;
const SECTION_ACTIVE = 1;
const SECTION_EXPEDITIONS = 2;
const WORKFORCE_RESPONSE_TIMEOUT_S = 5;
const RU = GetLocale() == "ruRU";

function L(english: string, russian: string): string {
    return RU ? russian : english;
}

let state = new CompanionState();
let activePage = 0;
let section = SECTION_ALL;
let stateReceivedAt = GetTime();
let refreshElapsed = 0;
let lastMessage = L(
    "Press Refresh to fetch the list from the server.",
    "Нажмите «Обновить», чтобы получить список с сервера.",
);
let workforceStateReady = false;
let workforceRequestedAt = 0;
let workforceResponseDelayed = false;
let frame: WoWAPI.Frame | undefined;
let cards: StoreCard[] = [];
let sidebar: ReturnType<typeof createSidebar> | undefined;
let headerText: WoWAPI.FontString | undefined;
let messageText: WoWAPI.FontString | undefined;
let pageText: WoWAPI.FontString | undefined;
let modeButton: ReturnType<typeof createActionButton> | undefined;
let attackButton: ReturnType<typeof createActionButton> | undefined;
let modelPanel: WoWAPI.Frame | undefined;
let model: WoWAPI.PlayerModel | undefined;
let minimapButton: WoWAPI.Button | undefined;

interface CompanionCardBadges {
    trait: WoWAPI.Texture;
    rank: WoWAPI.Texture;
    training: WoWAPI.Texture;
    rankText: WoWAPI.FontString;
    trainingText: WoWAPI.FontString;
}

let cardBadges: CompanionCardBadges[] = [];

type CompanionEntry = CompanionState["companions"][0];

function setMessage(message: string, chat: boolean = false): void {
    lastMessage = message;
    refresh();
    if (chat) print(`|cff66ff66${L("Companions", "Спутники")}:|r ${message}`);
}

function sendPacket(packet: TSPacketWrite, message: string): void {
    if (!(_G as any)._CLIENT_NETWORK) {
        setMessage(L(
            "The TSWoW client transport is not loaded. Restart the client through TSWoW.",
            "Клиентский транспорт TSWoW не загружен. Перезапустите клиент через TSWoW.",
        ), true);
        return;
    }
    setMessage(message);
    packet.Send();
}

function visibleCompanions(): CompanionEntry[] {
    if (section != SECTION_ACTIVE) return state.companions;
    const out: CompanionEntry[] = [];
    for (let i = 0; i < state.companions.length; i++) {
        if (state.companions[i].companionId == state.activeId) out.push(state.companions[i]);
    }
    return out;
}

function expeditionRemaining(companion: CompanionEntry): number {
    if (companion.expeditionRemainingS < 0) return EXPEDITION_NONE;
    const elapsed = Math.max(0, GetTime() - stateReceivedAt);
    return Math.max(0, Math.ceil(companion.expeditionRemainingS - elapsed));
}

function expeditionTimeText(seconds: number): string {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    if (minutes < 60) return L(`${minutes} min.`, `${minutes} мин.`);
    return L(
        `${Math.floor(minutes / 60)} h ${minutes % 60} min.`,
        `${Math.floor(minutes / 60)} ч. ${minutes % 60} мин.`,
    );
}

function maxPage(): number {
    return Math.max(0, Math.floor((visibleCompanions().length - 1) / CARDS_PER_PAGE));
}

function expeditionSlotOccupied(): boolean {
    for (let i = 0; i < state.companions.length; i++) {
        if (state.companions[i].expeditionRemainingS >= 0) return true;
    }
    return false;
}

function activeCompanion(): CompanionEntry | undefined {
    for (let i = 0; i < state.companions.length; i++) {
        const companion = state.companions[i];
        if (companion.companionId == state.activeId) return companion;
    }
    return undefined;
}

function activeName(): string {
    const companion = activeCompanion();
    return companion ? `${companion.name} #${companion.companionId}` : L("none", "нет");
}

function attackSelectedTarget(): void {
    sendPacket(
        new CompanionAttackRequest(state.activeId).write(),
        L("Ordering an attack on the selected target...", "Приказываю атаковать выбранную цель..."),
    );
}

function combatModeName(combatMode: number): string {
    if (combatMode == COMPANION_MODE_PASSIVE) return L("Do not attack", "Не атаковать");
    if (combatMode == COMPANION_MODE_TANK) return L("Tank", "Танк");
    return L("Defense", "Защита");
}

/* --------------------------- панель 3D-модели ------------------------------ */
function ensureModelPanel(parent: WoWAPI.Frame): void {
    if (modelPanel) return;
    const panel = createSidePanel(parent, 270, 400, L("Preview", "Предпросмотр"));
    panel.SetPoint("LEFT", parent, "RIGHT", -8, 20);
    panel.EnableMouse(true);
    panel.Hide();

    const closeBtn = CreateFrame("Button", "", panel, "UIPanelCloseButton");
    closeBtn.SetSize(30, 30);
    closeBtn.SetPoint("TOPRIGHT", 4, -2);
    closeBtn.SetScript("OnClick", () => panel.Hide());

    const m = CreateFrame("DressUpModel", "CompanionPreviewModel", panel) as WoWAPI.DressUpModel;
    m.SetSize(panel.GetWidth() - 20, panel.GetHeight() - 70);
    m.SetPoint("CENTER", panel, "CENTER", 5, 0);
    m.SetFacing(45);
    m.EnableMouse(true);

    // вращение моделей перетаскиванием, как в магазине
    m.SetScript("OnMouseDown", (self, button) => {
        if (button != "LeftButton") return;
        let [startX] = GetCursorPosition();
        m.SetScript("OnUpdate", () => {
            const [curX] = GetCursorPosition();
            m.SetFacing(m.GetFacing() + (curX - startX) / 100);
            startX = curX;
        });
    });
    m.SetScript("OnMouseUp", () => m.SetScript("OnUpdate", null as any));

    // окно спутников закрылось — прячем и предпросмотр
    parent.HookScript("OnHide", () => panel.Hide());

    model = m;
    modelPanel = panel;
}

function showModel(entry: number): void {
    if (!frame) return;
    ensureModelPanel(frame);
    if (!modelPanel || !model) return;
    modelPanel.Show();
    (model as any).ClearModel();
    (model as any).SetCreature(entry);
    model.SetFacing(45);
}

function createCardBadges(parent: WoWAPI.Frame): CompanionCardBadges {
    const trait = parent.CreateTexture(null, "OVERLAY");
    trait.SetSize(20, 20);
    trait.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -8, -10);
    trait.SetTexCoord(0.07, 0.93, 0.07, 0.93);

    const rank = parent.CreateTexture(null, "OVERLAY");
    rank.SetSize(20, 20);
    rank.SetPoint("TOPRIGHT", trait, "BOTTOMRIGHT", 0, -3);
    rank.SetTexCoord(0.07, 0.93, 0.07, 0.93);

    const training = parent.CreateTexture(null, "OVERLAY");
    training.SetSize(20, 20);
    training.SetPoint("TOPRIGHT", rank, "BOTTOMRIGHT", 0, -3);
    training.SetTexCoord(0.07, 0.93, 0.07, 0.93);

    const rankText = parent.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    rankText.SetFont(STORE_FONT, 9, "OUTLINE");
    rankText.SetPoint("BOTTOMRIGHT", rank, "BOTTOMRIGHT", 1, -1);
    const trainingText = parent.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    trainingText.SetFont(STORE_FONT, 9, "OUTLINE");
    trainingText.SetPoint("BOTTOMRIGHT", training, "BOTTOMRIGHT", 1, -1);
    return { trait: trait, rank: rank, training: training, rankText: rankText, trainingText: trainingText };
}

/* -------------------------------- окно ------------------------------------- */
function ensureFrame(): WoWAPI.Frame {
    if (frame) return frame;

    frame = createStoreWindow("CustomCompanionsFrame", L("My Companions", "Мои спутники"));

    sidebar = createSidebar(frame, [
        { name: L("All companions", "Все спутники"), icon: COMPANION_ICON },
        { name: L("Active", "Активный"), icon: "Interface\\Icons\\Ability_Hunter_MendPet" },
        { name: L("Expeditions", "Экспедиции"), icon: "Interface\\Icons\\INV_Misc_Map_01" },
    ], (i) => {
        section = i;
        activePage = 0;
        refresh();
    });

    cards = createCardGrid(frame, (i) => {
        const companion = visibleCompanions()[activePage * CARDS_PER_PAGE + i];
        if (!companion || !frame) return;
        GameTooltip.SetOwner(frame, "ANCHOR_CURSOR");
        GameTooltip.SetText(`${companion.name} #${companion.companionId}`);
        GameTooltip.AddLine(L(
            `Health: ${Math.floor(Math.max(0, Math.min(1, companion.healthPct)) * 100)}%`,
            `Здоровье: ${Math.floor(Math.max(0, Math.min(1, companion.healthPct)) * 100)}%`,
        ), 1, 1, 1);
        GameTooltip.AddLine(L(
            `Mode: ${combatModeName(companion.combatMode)}`,
            `Режим: ${combatModeName(companion.combatMode)}`,
        ), 1, 0.82, 0);
        GameTooltip.AddLine(L(
            `Expedition: ${expeditionSpecialtyName(companion.expeditionSpecialty, RU)}`,
            `Экспедиция: ${expeditionSpecialtyName(companion.expeditionSpecialty, RU)}`,
        ), 0.6, 0.9, 0.6);
        if (state.selectedProtocolVersion == COMPANION_PROTOCOL_VERSION) {
            const profession = companionProfessionById(companion.professionId);
            const trait = companionTraitById(companion.innateTraitId);
            const rank = Math.max(1, Math.min(COMPANION_SERVICE_RANKS.length, companion.serviceRank));
            GameTooltip.AddLine(L(
                `Profession: ${profession ? profession.name : "not set"}`,
                `Профессия: ${profession ? profession.nameRu : "не определена"}`,
            ), 1, 0.82, 0);
            GameTooltip.AddLine(L(
                `Trait: ${trait ? trait.name : "not set"}`,
                `Черта: ${trait ? trait.nameRu : "не определена"}`,
            ), 1, 1, 1, true);
            if (trait) GameTooltip.AddLine(L(trait.description, trait.descriptionRu), 0.75, 0.85, 1, true);
            GameTooltip.AddLine(L(
                `Service: ${COMPANION_SERVICE_RANKS[rank - 1].name} (${companion.serviceXp} XP)`,
                `Служба: ${COMPANION_SERVICE_RANKS[rank - 1].nameRu} (${companion.serviceXp} XP)`,
            ), 0.6, 0.9, 0.6);
            GameTooltip.AddLine(L(
                `Upgrades: ${companion.installedCount}/${companion.trainingCapacity}`,
                `Улучшения: ${companion.installedCount}/${companion.trainingCapacity}`,
            ), 0.6, 0.9, 0.6);
        }
        const remaining = expeditionRemaining(companion);
        if (remaining > 0) GameTooltip.AddLine(L(
            `Returns in ${expeditionTimeText(remaining)}`,
            `Вернётся через ${expeditionTimeText(remaining)}`,
        ), 1, 0.82, 0);
        else if (remaining == 0) GameTooltip.AddLine(L("Reward ready.", "Награда готова."), 0.3, 1, 0.3);
        else if (!workforceStateReady) {
            GameTooltip.AddLine(L("Base assignment is still being checked.", "Назначение на базе ещё проверяется."), 1, 0.82, 0);
        } else if (companionWorkforceAssigned(companion.companionId)) {
            GameTooltip.AddLine(L("Working at the base.", "Работает на базе."), 0.3, 1, 0.3);
        }
        GameTooltip.AddLine(L("Click the card for a 3D preview.", "Клик по карточке — 3D-предпросмотр."), 0.6, 0.9, 0.6);
        GameTooltip.AddLine(L("Right-click for progression, training and base work.", "ПКМ — развитие, обучение и работа на базе."), 0.6, 0.9, 0.6);
        GameTooltip.Show();
    }, () => GameTooltip.Hide());

    for (let i = 0; i < cards.length; i++) {
        const index = i;
        cardBadges.push(createCardBadges(cards[i].frame));
        cards[i].frame.SetScript("OnMouseDown", (_self, button) => {
            const companion = visibleCompanions()[activePage * CARDS_PER_PAGE + index];
            if (!companion) return;
            if (button == "RightButton") {
                openCompanionProgression(companion.companionId);
                return;
            }
            showModel(companion.entry);
        });
        cards[i].action.button.SetScript("OnClick", () => {
            const companion = visibleCompanions()[activePage * CARDS_PER_PAGE + index];
            if (!companion) return;
            const remaining = expeditionRemaining(companion);
            const assigned = companionWorkforceAssigned(companion.companionId);
            if (remaining >= 0) {
                if (remaining > 0) {
                    setMessage(L(
                        `The companion returns in ${expeditionTimeText(remaining)}`,
                        `Спутник вернётся через ${expeditionTimeText(remaining)}`,
                    ));
                    return;
                }
                sendPacket(
                    new CompanionExpeditionRequest(companion.companionId, COMPANION_EXPEDITION_CLAIM).write(),
                    L("Claiming the expedition reward...", "Забираю награду экспедиции..."),
                );
                return;
            }
            if (section == SECTION_EXPEDITIONS) {
                if (companion.companionId == state.activeId) {
                    setMessage(L("Dismiss the active companion first.", "Сначала отзовите активного спутника."));
                    return;
                }
                if (!workforceStateReady) {
                    setMessage(L("Wait for the base assignments check.", "Дождитесь проверки назначений на базе."));
                    return;
                }
                if (assigned) {
                    setMessage(L("Remove the companion from base work first.", "Сначала снимите спутника с работы на базе."));
                    return;
                }
                sendPacket(
                    new CompanionExpeditionRequest(companion.companionId, COMPANION_EXPEDITION_START).write(),
                    L(
                        `Sending ${companion.name} on an expedition...`,
                        `Отправляю ${companion.name} в экспедицию...`,
                    ),
                );
                return;
            }
            if (companion.companionId != state.activeId && !workforceStateReady) {
                setMessage(L("Wait for the base assignments check.", "Дождитесь проверки назначений на базе."));
                return;
            }
            if (companion.companionId != state.activeId && assigned) {
                setMessage(L("Remove the companion from base work first.", "Сначала снимите спутника с работы на базе."));
                return;
            }
            const companionId = companion.companionId == state.activeId ? 0 : companion.companionId;
            sendPacket(
                new CompanionActivateRequest(companionId).write(),
                companionId == 0
                    ? L("Dismissing the companion...", "Отзываю спутника...")
                    : L(`Summoning ${companion.name}...`, `Призываю ${companion.name}...`),
            );
        });
    }

    pageText = createNavArrows(frame, () => {
        if (activePage > 0) activePage--;
        refresh();
    }, () => {
        if (activePage < maxPage()) activePage++;
        refresh();
    });

    headerText = frame.CreateFontString(null, "OVERLAY", "GameFontNormal");
    headerText.SetFont(STORE_FONT, 12, "OUTLINE");
    headerText.SetPoint("TOPLEFT", frame, "TOPLEFT", frame.GetWidth() * 0.26, -44);
    headerText.SetJustifyH("LEFT");

    messageText = frame.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    messageText.SetFont(STORE_FONT, 10, "OUTLINE");
    messageText.SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", frame.GetWidth() * 0.26, 14);
    messageText.SetWidth(frame.GetWidth() * 0.34);
    messageText.SetJustifyH("LEFT");

    const refreshBtn = createActionButton(frame, 110, 24, L("Refresh", "Обновить"));
    refreshBtn.button.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -22, 14);
    refreshBtn.button.SetScript("OnClick", () => sendPacket(
        new CompanionStateRequest().write(),
        L("Requesting the list...", "Запрашиваю список..."),
    ));

    modeButton = createActionButton(frame, 170, 24, L("Mode: Defense", "Режим: Защита"));
    modeButton.button.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -142, 14);
    modeButton.button.SetScript("OnClick", () => {
        const companion = activeCompanion();
        if (!companion) {
            setMessage(L("Summon a companion first.", "Сначала призовите спутника."));
            return;
        }
        const combatMode = companion.combatMode == COMPANION_MODE_DEFENSE
            ? COMPANION_MODE_TANK
            : companion.combatMode == COMPANION_MODE_TANK
                ? COMPANION_MODE_PASSIVE
                : COMPANION_MODE_DEFENSE;
        sendPacket(
            new CompanionModeRequest(companion.companionId, combatMode).write(),
            L(
                `Switching mode to ${combatModeName(combatMode)}...`,
                `Переключаю режим на «${combatModeName(combatMode)}»...`,
            ),
        );
    });
    modeButton.button.SetScript("OnEnter", () => {
        GameTooltip.SetOwner(modeButton!.button, "ANCHOR_TOP");
        GameTooltip.SetText(L("Behavior mode", "Режим поведения"));
        GameTooltip.AddLine(L(
            "Defense — the companion joins combat with you.",
            "Защита — спутник вступает в бой вместе с вами.",
        ), 1, 1, 1);
        GameTooltip.AddLine(L(
            "Tank — enables tank talents and allows taunts.",
            "Танк — включает танковые таланты и разрешает провокации.",
        ), 1, 0.82, 0, true);
        GameTooltip.AddLine(L(
            "Do not attack — stops attacks; healing and utility spells remain available.",
            "Не атаковать — прекращает атаки; лечение и полезные заклинания сохраняются.",
        ), 0.6, 0.9, 0.6, true);
        GameTooltip.Show();
    });
    modeButton.button.SetScript("OnLeave", () => GameTooltip.Hide());

    attackButton = createActionButton(frame, 150, 24, L("Attack target", "Атаковать цель"));
    attackButton.button.SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", 22, 14);
    attackButton.button.SetScript("OnClick", () => attackSelectedTarget());
    attackButton.button.SetScript("OnEnter", () => {
        GameTooltip.SetOwner(attackButton!.button, "ANCHOR_TOP");
        GameTooltip.SetText(L("Attack selected target", "Атаковать выбранную цель"));
        GameTooltip.AddLine(L(
            "Works in Do not attack mode, but cannot target friendly or dead units.",
            "Работает и в режиме «Не атаковать», но не позволяет атаковать дружественные или мёртвые цели.",
        ), 1, 1, 1, true);
        GameTooltip.Show();
    });
    attackButton.button.SetScript("OnLeave", () => GameTooltip.Hide());

    frame.SetScript("OnShow", () => {
        PlaySound("igMainMenuOpen");
        sendPacket(new CompanionStateRequest().write(), L("Requesting the list...", "Запрашиваю список..."));
        workforceStateReady = false;
        workforceRequestedAt = GetTime();
        workforceResponseDelayed = false;
        requestCompanionWorkforceState();
    });
    frame.SetScript("OnUpdate", (_self, elapsed) => {
        refreshElapsed += elapsed;
        if (refreshElapsed < 1) return;
        refreshElapsed = 0;
        const now = GetTime();
        if (!workforceStateReady && workforceRequestedAt > 0
            && now - workforceRequestedAt >= WORKFORCE_RESPONSE_TIMEOUT_S) {
            workforceRequestedAt = now;
            workforceResponseDelayed = true;
            requestCompanionWorkforceState();
            lastMessage = L(
                "The base server did not respond. Retrying the assignments check...",
                "Сервер базы не ответил. Повторяю проверку назначений...",
            );
        }
        refresh();
    });

    if (sidebar) sidebar.setActive(0);
    return frame;
}

function refresh(): void {
    if (!frame) return;
    if (activePage > maxPage()) activePage = maxPage();
    const slotOccupied = expeditionSlotOccupied();

    if (headerText) {
        headerText.SetText(L(
            `Captured: ${state.companions.length}    Active: ${activeName()}`,
            `Поймано: ${state.companions.length}    Активный: ${activeName()}`,
        ));
    }
    if (messageText) messageText.SetText(lastMessage);
    if (pageText) pageText.SetText(`${activePage + 1}/${maxPage() + 1}`);
    if (modeButton) {
        const companion = activeCompanion();
        if (companion) {
            modeButton.button.Show();
            modeButton.label.SetText(L(
                `Mode: ${combatModeName(companion.combatMode)}`,
                `Режим: ${combatModeName(companion.combatMode)}`,
            ));
        } else {
            modeButton.button.Hide();
        }
    }
    if (attackButton) {
        if (activeCompanion()) attackButton.button.Show();
        else attackButton.button.Hide();
    }

    const list = visibleCompanions();
    for (let i = 0; i < cards.length; i++) {
        const companion = list[activePage * CARDS_PER_PAGE + i];
        if (!companion) {
            cards[i].frame.Hide();
        } else {
            const active = companion.companionId == state.activeId;
            const assigned = workforceStateReady
                && companionWorkforceAssigned(companion.companionId);
            const healthPct = Math.floor(Math.max(0, Math.min(1, companion.healthPct)) * 100);
            const remaining = expeditionRemaining(companion);
            const badges = cardBadges[i];
            cards[i].frame.Show();
            cards[i].icon.SetTexture(COMPANION_ICON);
            cards[i].title.SetText(active ? `|cff66ff66${companion.name}|r` : companion.name);
            if (state.selectedProtocolVersion == COMPANION_PROTOCOL_VERSION) {
                const trait = companionTraitById(companion.innateTraitId);
                badges.trait.SetTexture(trait ? trait.icon : COMPANION_ICON);
                badges.rank.SetTexture("Interface\\Icons\\INV_Misc_Note_01");
                badges.training.SetTexture("Interface\\Icons\\INV_Misc_Book_11");
                badges.rankText.SetText(`${companion.serviceRank}`);
                badges.trainingText.SetText(`${companion.installedCount}`);
                badges.trait.Show();
                badges.rank.Show();
                badges.training.Show();
                badges.rankText.Show();
                badges.trainingText.Show();
            } else {
                badges.trait.Hide();
                badges.rank.Hide();
                badges.training.Hide();
                badges.rankText.Hide();
                badges.trainingText.Hide();
            }
            if (remaining > 0) {
                cards[i].sub.SetText(L(
                    `#${companion.companionId}   ${expeditionSpecialtyName(companion.expeditionSpecialty, RU)}\nAway: ${expeditionTimeText(remaining)}`,
                    `#${companion.companionId}   ${expeditionSpecialtyName(companion.expeditionSpecialty, RU)}\nВ пути: ${expeditionTimeText(remaining)}`,
                ));
            } else if (remaining == 0) {
                cards[i].sub.SetText(L(
                    `#${companion.companionId}   ${expeditionSpecialtyName(companion.expeditionSpecialty, RU)}\n|cff66ff66Reward ready|r`,
                    `#${companion.companionId}   ${expeditionSpecialtyName(companion.expeditionSpecialty, RU)}\n|cff66ff66Награда готова|r`,
                ));
            } else if (!workforceStateReady) {
                cards[i].sub.SetText(L(
                    `#${companion.companionId}   Health: ${healthPct}%\n|cffffcc00Checking base...|r`,
                    `#${companion.companionId}   Здоровье: ${healthPct}%\n|cffffcc00Проверяю базу...|r`,
                ));
            } else if (assigned) {
                cards[i].sub.SetText(L(
                    `#${companion.companionId}   Health: ${healthPct}%\n|cff66ff66Working at base|r`,
                    `#${companion.companionId}   Здоровье: ${healthPct}%\n|cff66ff66Работает на базе|r`,
                ));
            } else {
                cards[i].sub.SetText(L(
                    `#${companion.companionId}   Health: ${healthPct}%\n${expeditionSpecialtyName(companion.expeditionSpecialty, RU)}`,
                    `#${companion.companionId}   Здоровье: ${healthPct}%\n${expeditionSpecialtyName(companion.expeditionSpecialty, RU)}`,
                ));
            }
            cards[i].setCost(undefined);
            cards[i].action.button.Enable();
            if (remaining > 0) {
                cards[i].action.label.SetText(L("Away", "В пути"));
                cards[i].action.label.SetTextColor(0.55, 0.55, 0.55);
                cards[i].action.button.Disable();
            } else if (remaining == 0) {
                cards[i].action.label.SetText(L("Claim", "Забрать"));
                cards[i].action.label.SetTextColor(0.3, 1, 0.3);
            } else if (section == SECTION_EXPEDITIONS) {
                const unavailable = active || !workforceStateReady || assigned || slotOccupied;
                cards[i].action.label.SetText(active ? L("Summoned", "Призван")
                    : !workforceStateReady ? L("Checking base", "Проверка базы")
                        : assigned ? L("At base", "На базе")
                            : slotOccupied ? L("Slot occupied", "Лимит занят") : L("Send", "Отправить"));
                cards[i].action.label.SetTextColor(unavailable ? 0.55 : 1, unavailable ? 0.55 : 0.82, unavailable ? 0.55 : 0);
                if (unavailable) cards[i].action.button.Disable();
            } else {
                const blocked = !active && (!workforceStateReady || assigned);
                cards[i].action.label.SetText(active ? L("Dismiss", "Отозвать")
                    : !workforceStateReady ? L("Checking base", "Проверка базы")
                        : assigned ? L("At base", "На базе") : L("Summon", "Призвать"));
                cards[i].action.label.SetTextColor(blocked ? 0.55 : 1, active ? 0.5 : blocked ? 0.55 : 0.82, active ? 0.5 : blocked ? 0.55 : 0);
                if (blocked) cards[i].action.button.Disable();
            }
        }
    }
}

setCompanionWorkforceRefreshHandler(() => {
    workforceStateReady = true;
    workforceRequestedAt = 0;
    if (workforceResponseDelayed) lastMessage = L(
        "Base assignments updated.",
        "Назначения на базе успешно обновлены.",
    );
    workforceResponseDelayed = false;
    refresh();
});

function toggle(): void {
    const panel = ensureFrame();
    if (panel.IsShown()) {
        panel.Hide();
        return;
    }
    panel.Show();
    refresh();
}

/* ------------------------------ кнопка миникарты --------------------------- */
function ensureMinimapButton(): void {
    if (minimapButton) return;
    const button = CreateFrame("Button", "CustomCompanionsMinimapButton", Minimap);
    button.SetSize(32, 32);
    button.SetFrameStrata("MEDIUM");
    button.SetFrameLevel(8);
    button.RegisterForClicks("LeftButtonUp");
    button.SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight");

    const icon = button.CreateTexture("", "BACKGROUND");
    icon.SetTexture(COMPANION_ICON);
    icon.SetSize(20, 20);
    icon.SetPoint("CENTER", button, "CENTER", 0, 1);
    icon.SetTexCoord(0.05, 0.95, 0.05, 0.95);

    const border = button.CreateTexture("", "OVERLAY");
    border.SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder");
    border.SetSize(54, 54);
    border.SetPoint("TOPLEFT", button, "TOPLEFT", 0, 0);

    button.SetPoint("CENTER", Minimap, "CENTER", -40, -69);

    button.SetScript("OnClick", () => toggle());
    button.SetScript("OnEnter", () => {
        GameTooltip.SetOwner(button, "ANCHOR_LEFT");
        GameTooltip.SetText(L("My Companions", "Мои спутники"));
        GameTooltip.AddLine(L(
            "Left-click to open the window (/companions).",
            "ЛКМ — открыть окно (/companions).",
        ), 0.8, 0.8, 0.8, true);
        GameTooltip.Show();
    });
    button.SetScript("OnLeave", () => GameTooltip.Hide());
    minimapButton = button;
}

OnCustomPacket(OP_COMPANION_STATE, (packet) => {
    state = new CompanionState();
    state.read(packet);
    stateReceivedAt = GetTime();
    updateCompanionProgressionSummary(state);
    refresh();
    setMessage(L("List updated.", "Список обновлён."));
});

OnCustomPacket(OP_COMPANION_SUMMARY_V3, (packet) => {
    state = new CompanionState();
    state.read(packet, COMPANION_PROTOCOL_VERSION);
    stateReceivedAt = GetTime();
    updateCompanionProgressionSummary(state);
    refresh();
    setMessage(L("List and progression updated.", "Список и развитие обновлены."));
});

OnCustomPacket(OP_COMPANION_ERROR, (packet) => {
    const error = new CompanionError("");
    error.read(packet);
    reportCompanionProgressionError(error.message);
    setMessage(error.message, true);
});

const bootstrap = CreateFrame("Frame");
bootstrap.RegisterEvent("PLAYER_ENTERING_WORLD");
bootstrap.SetScript("OnEvent", () => {
    ensureMinimapButton();
    sendPacket(new CompanionStateRequest().write(), L("Refreshing the list...", "Обновляю список..."));
});

(_G as any).SLASH_CUSTOMCOMPANIONS1 = "/companions";
(_G as any).SLASH_CUSTOMCOMPANIONS2 = "/спутники";
SlashCmdList.CUSTOMCOMPANIONS = () => toggle();

(_G as any).SLASH_CUSTOMCOMPANIONATTACK1 = "/companionattack";
(_G as any).SLASH_CUSTOMCOMPANIONATTACK2 = "/спутникатака";
SlashCmdList.CUSTOMCOMPANIONATTACK = () => attackSelectedTarget();
