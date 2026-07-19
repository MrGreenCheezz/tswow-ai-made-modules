/** Companion progression, training library, generic slots and base assignments. */

import {
    COMPANION_PROTOCOL_VERSION,
    CompanionActivateRequest,
    CompanionState,
    CompanionStateRequest,
} from "../shared/CompanionMessages";
import {
    COMPANION_SERVICE_RANKS,
    companionMaskHas,
    companionProfessionById,
    companionTraitById,
} from "../shared/CompanionProgression";
import {
    COMPANION_ACTION_INSTALL,
    COMPANION_ACTION_LEARN_OR_RANK,
    COMPANION_ACTION_STUDY,
    COMPANION_ACTION_UNINSTALL,
    CompanionDetailFeatureState,
    CompanionDetailRequest,
    CompanionDetailState,
    CompanionTrainingActionRequest,
    OP_COMPANION_DETAIL,
} from "../shared/CompanionProgressionMessages";
import {
    COMPANION_TRAINING_CATALOG_VERSION,
    COMPANION_TRAINING_FEATURE_COUNT,
    COMPANION_TRAINING_FEATURES,
    COMPANION_TRAINING_MAX_SLOTS,
    CompanionTrainingFeatureDef,
    TRAINING_KIND_MANUAL,
    companionTrainingCompatible,
} from "../shared/CompanionTraining";
import {
    ActionButton,
    ListRow,
    STORE_FONT,
    createActionButton,
    createListRow,
    createStoreWindow,
} from "./StoreStyle";

const OP_WORKFORCE_REQUEST = 95;
const OP_COMPANION_WORKFORCE_STATE = 99;
const OP_COMPANION_WORKFORCE_ERROR = 100;
const WORKFORCE_ACTION_STATE = 0;
const WORKFORCE_ACTION_ASSIGN = 1;
const WORKFORCE_ACTION_UNASSIGN = 2;
const WORKFORCE_TARGET_STATION = 1;
const WORKFORCE_TARGET_GENERATOR = 2;
const WORKFORCE_TIMEOUT_S = 5;

const MAX_WORKFORCE_TARGETS = 256;
const COMPANIONS_PER_PAGE = 8;
const LIBRARY_PER_PAGE = 7;
const TARGETS_PER_PAGE = 7;
const TAB_SLOTS = 0;
const TAB_LIBRARY = 1;
const TAB_BASE = 2;
const TAB_HELP = 3;
const TOKEN_MIN = 1000000000;
const TOKEN_MAX = 2147483646;
const COMPANION_ICON = "Interface\\Icons\\Ability_Hunter_BeastCall";
const STATION_ICON = "Interface\\Icons\\INV_Hammer_20";
const GENERATOR_ICON = "Interface\\Icons\\Trade_Mining";
const RU = GetLocale() == "ruRU";
const TRAINING_FAMILIES_RU: [number, string, string][] = [
    [1, "Wild", "Дикие"], [2, "Draconic", "Драконьи"], [4, "Dark", "Тёмные"],
    [8, "Primal", "Первозданные"], [16, "Tactical", "Тактические"], [32, "Mechanical", "Механические"],
];

function L(english: string, russian: string): string {
    return RU ? russian : english;
}

function trainingFamiliesRu(mask: number): string {
    const names: string[] = [];
    for (let i = 0; i < TRAINING_FAMILIES_RU.length; i++) {
        const family = TRAINING_FAMILIES_RU[i];
        if (companionMaskHas(mask, family[0])) names.push(L(family[1], family[2]));
    }
    return names.length == TRAINING_FAMILIES_RU.length
        ? L("All", "Все") : names.length > 0 ? names.join(", ") : L("Not set", "Не определены");
}

type CompanionSummaryEntry = CompanionState["companions"][0];

class WorkforceRequestLocal {
    constructor(
        public action: number = WORKFORCE_ACTION_STATE,
        public workerId: number = 0,
        public targetKind: number = 0,
        public targetId: number = 0,
        public expectedRevision: number = 0,
        public requestToken: number = 0,
    ) {}

    write(): TSPacketWrite {
        const packet = CreateCustomPacket(OP_WORKFORCE_REQUEST, 0);
        packet.WriteDouble(this.action);
        packet.WriteDouble(this.workerId);
        packet.WriteDouble(this.targetKind);
        packet.WriteDouble(this.targetId);
        packet.WriteDouble(this.expectedRevision);
        packet.WriteDouble(this.requestToken);
        return packet;
    }
}

interface WorkforceTargetLocal {
    targetKind: number;
    targetId: number;
    catKey: number;
    generatorCategory: number;
    name: string;
    workerId: number;
    workerEntry: number;
    profession: number;
    trait: number;
    rank: number;
    periodBps: number;
    saveBps: number;
    bonusBps: number;
    biasSelector: number;
    markBps: number;
    markProperty: number;
    pendingXP: number;
}

class WorkforceStateLocal {
    revision: number = 0;
    requestToken: number = 0;
    targets: WorkforceTargetLocal[] = [];
    truncated: boolean = false;

    read(read: TSPacketRead): void {
        this.revision = safeUInt(read.ReadDouble());
        this.requestToken = safeUInt(read.ReadDouble());
        const rawCount = read.ReadDouble();
        const count = safeCount(rawCount, MAX_WORKFORCE_TARGETS);
        this.truncated = rawCount > MAX_WORKFORCE_TARGETS;
        this.targets = [];
        const seen: { [key: string]: boolean } = {};
        for (let i = 0; i < count; i++) {
            const row: WorkforceTargetLocal = {
                targetKind: safeUInt(read.ReadDouble()),
                targetId: safeUInt(read.ReadDouble()),
                catKey: safeUInt(read.ReadDouble()),
                generatorCategory: safeUInt(read.ReadDouble()),
                name: read.ReadString(),
                workerId: safeUInt(read.ReadDouble()),
                workerEntry: safeUInt(read.ReadDouble()),
                profession: safeUInt(read.ReadDouble()),
                trait: safeUInt(read.ReadDouble()),
                rank: safeUInt(read.ReadDouble()),
                periodBps: safeUInt(read.ReadDouble()),
                saveBps: safeUInt(read.ReadDouble()),
                bonusBps: safeUInt(read.ReadDouble()),
                biasSelector: safeUInt(read.ReadDouble()),
                markBps: safeUInt(read.ReadDouble()),
                markProperty: safeUInt(read.ReadDouble()),
                pendingXP: safeUInt(read.ReadDouble()),
            };
            const validKind = row.targetKind == WORKFORCE_TARGET_STATION
                || row.targetKind == WORKFORCE_TARGET_GENERATOR;
            const key = `${row.targetKind}:${row.targetId}`;
            if (validKind && row.targetId > 0 && !seen[key]) {
                seen[key] = true;
                this.targets.push(row);
            }
        }
    }
}

interface PendingWorkforceAction {
    action: number;
    workerId: number;
    targetKind: number;
    targetId: number;
}

interface QueuedWorkforceAssignment {
    workerId: number;
    targetKind: number;
    targetId: number;
    waitingForState: boolean;
    startedAt: number;
}

interface CompanionBadge {
    button: WoWAPI.Button;
    icon: WoWAPI.Texture;
    count: WoWAPI.FontString;
}

interface CompanionBadges {
    trait: CompanionBadge;
    rank: CompanionBadge;
    training: CompanionBadge;
}

let summary = new CompanionState();
let selectedCompanionId = 0;
let detail: CompanionDetailState | undefined;
let detailFeatures: { [featureId: number]: CompanionDetailFeatureState } = {};
let workforce = new WorkforceStateLocal();
// A separate high range prevents collisions with the base module's own UI tokens.
let requestToken = TOKEN_MIN;
let pendingDetailToken = 0;
let pendingDetailRequestedAt = 0;
let detailRefreshAt = 0;
let pendingWorkforceToken = 0;
let pendingWorkforceAction: PendingWorkforceAction | undefined;
let pendingWorkforceError = "";
let queuedWorkforceAssignment: QueuedWorkforceAssignment | undefined;
let workforceLoaded = false;
let workforceRequestedAt = 0;
let workforceTimedOut = false;
let lastStaleDetailFloor = -1;
let lastStaleWorkforceFloor = -1;
let selectedFeatureId = 0;
let selectedSlot = 1;
let selectedTargetKey = "";
let activeTab = TAB_SLOTS;
let companionPage = 0;
let libraryPage = 0;
let targetPage = 0;
let message = L(
    "Select a companion to view its progression.",
    "Выберите спутника для просмотра развития.",
);

let frame: WoWAPI.Frame | undefined;
let companionRows: ListRow[] = [];
let companionBadges: CompanionBadges[] = [];
let slotButtons: ActionButton[] = [];
let libraryRows: ListRow[] = [];
let targetRows: ListRow[] = [];
let tabButtons: ActionButton[] = [];
let slotsPanel: WoWAPI.Frame | undefined;
let libraryPanel: WoWAPI.Frame | undefined;
let basePanel: WoWAPI.Frame | undefined;
let helpPanel: WoWAPI.Frame | undefined;
let nameText: WoWAPI.FontString | undefined;
let professionText: WoWAPI.FontString | undefined;
let traitText: WoWAPI.FontString | undefined;
let rankText: WoWAPI.FontString | undefined;
let protocolText: WoWAPI.FontString | undefined;
let messageText: WoWAPI.FontString | undefined;
let companionPageText: WoWAPI.FontString | undefined;
let libraryPageText: WoWAPI.FontString | undefined;
let targetPageText: WoWAPI.FontString | undefined;
let slotSelectionText: WoWAPI.FontString | undefined;
let librarySelectionText: WoWAPI.FontString | undefined;
let targetSelectionText: WoWAPI.FontString | undefined;
let installButton: ActionButton | undefined;
let uninstallButton: ActionButton | undefined;
let learnButton: ActionButton | undefined;
let libraryInstallButton: ActionButton | undefined;
let studyButton: ActionButton | undefined;
let workforceButton: ActionButton | undefined;
let workforceRefreshHandler: (() => void) | undefined;

function safeUInt(value: number): number {
    return value >= 0 && value <= 4294967295 && Math.floor(value) == value ? value : 0;
}

function safeCount(value: number, maximum: number): number {
    if (value < 0 || Math.floor(value) != value) return 0;
    return Math.min(maximum, value);
}

function nextToken(): number {
    requestToken = requestToken >= TOKEN_MAX ? TOKEN_MIN : requestToken + 1;
    return requestToken;
}

function setMessage(text: string): void {
    message = text;
    refresh();
}

function send(packet: TSPacketWrite, text: string): boolean {
    if (!(_G as any)._CLIENT_NETWORK) {
        setMessage(L("The TSWoW client transport is not loaded.", "Клиентский транспорт TSWoW не загружен."));
        return false;
    }
    message = text;
    packet.Send();
    refresh();
    return true;
}

function clipped(text: string, maximum: number): string {
    return text.length <= maximum ? text : text.substring(0, maximum - 1) + "…";
}

function romanRank(rank: number): string {
    if (rank == 1) return "I";
    if (rank == 2) return "II";
    if (rank == 3) return "III";
    return "—";
}

function bpsText(value: number): string {
    return `${Math.floor(Math.max(0, value) / 10) / 10}%`;
}

function selectedSummary(): CompanionSummaryEntry | undefined {
    const limit = summary.companions.length;
    for (let i = 0; i < limit; i++) {
        if (summary.companions[i].companionId == selectedCompanionId) return summary.companions[i];
    }
    return undefined;
}

function selectedFeature(): CompanionTrainingFeatureDef | undefined {
    if (selectedFeatureId <= 0 || selectedFeatureId > COMPANION_TRAINING_FEATURES.length) return undefined;
    const feature = COMPANION_TRAINING_FEATURES[selectedFeatureId - 1];
    return feature && feature.id == selectedFeatureId ? feature : undefined;
}

function featureState(featureId: number): CompanionDetailFeatureState | undefined {
    return detailFeatures[featureId];
}

function installedFeature(slot: number): CompanionDetailFeatureState | undefined {
    for (let featureId = 1; featureId <= COMPANION_TRAINING_FEATURE_COUNT; featureId++) {
        const state = detailFeatures[featureId];
        if (state && state.installedSlot == slot) return state;
    }
    return undefined;
}

function catalogReady(): boolean {
    return !!detail
        && detail.catalogVersion == COMPANION_TRAINING_CATALOG_VERSION
        && COMPANION_TRAINING_FEATURES.length == COMPANION_TRAINING_FEATURE_COUNT;
}

function detailReady(): boolean {
    return summary.selectedProtocolVersion == COMPANION_PROTOCOL_VERSION
        && !!detail
        && detail.companionId == selectedCompanionId
        && catalogReady();
}

function libraryFeatures(): CompanionTrainingFeatureDef[] {
    const features: CompanionTrainingFeatureDef[] = [];
    if (!detailReady() || !detail) return features;
    for (let i = 0; i < COMPANION_TRAINING_FEATURES.length; i++) {
        const feature = COMPANION_TRAINING_FEATURES[i];
        if (companionTrainingCompatible(feature, detail.family, detail.professionId)) features.push(feature);
    }
    return features;
}

function actionPending(): boolean {
    return pendingDetailToken > 0;
}

function detailRevisionFloor(): number {
    let floor = detail && detail.companionId == selectedCompanionId
        ? safeUInt(detail.revision)
        : 0;
    const companion = selectedSummary();
    if (companion) floor = Math.max(floor, safeUInt(companion.trainingRevision));
    return floor;
}

function setActionEnabled(action: ActionButton | undefined, enabled: boolean): void {
    if (!action) return;
    if (enabled) {
        action.button.Enable();
        action.label.SetTextColor(1, 0.82, 0);
    } else {
        action.button.Disable();
        action.label.SetTextColor(0.5, 0.5, 0.5);
    }
}

function companionMaxPage(): number {
    const count = summary.companions.length;
    return Math.max(0, Math.floor((count - 1) / COMPANIONS_PER_PAGE));
}

function libraryMaxPage(): number {
    return Math.max(0, Math.floor((libraryFeatures().length - 1) / LIBRARY_PER_PAGE));
}

function targetMaxPage(): number {
    return Math.max(0, Math.floor((workforce.targets.length - 1) / TARGETS_PER_PAGE));
}

function requestCollection(): void {
    send(new CompanionStateRequest().write(), L(
        "Requesting the companion collection...",
        "Запрашиваю коллекцию спутников...",
    ));
}

function requestDetail(): void {
    if (selectedCompanionId <= 0 || summary.selectedProtocolVersion != COMPANION_PROTOCOL_VERSION) return;
    const token = nextToken();
    pendingDetailToken = token;
    pendingDetailRequestedAt = GetTime();
    if (!send(
        new CompanionDetailRequest(selectedCompanionId, token).write(),
        L("Loading companion progression...", "Загружаю развитие спутника..."),
    )) {
        pendingDetailToken = 0;
        pendingDetailRequestedAt = 0;
    }
}

function requestWorkforce(force: boolean = false): boolean {
    if (pendingWorkforceAction) return false;
    const now = GetTime();
    if (pendingWorkforceToken > 0
        && !force
        && now - workforceRequestedAt < WORKFORCE_TIMEOUT_S) return false;
    const token = nextToken();
    pendingWorkforceToken = token;
    pendingWorkforceError = "";
    workforceRequestedAt = now;
    workforceTimedOut = false;
    if (!send(
        new WorkforceRequestLocal(WORKFORCE_ACTION_STATE, 0, 0, 0, workforce.revision, token).write(),
        L("Loading base workplaces...", "Загружаю рабочие места базы..."),
    )) {
        pendingWorkforceToken = 0;
        workforceRequestedAt = 0;
        return false;
    }
    return true;
}

function sendTrainingAction(action: number, featureId: number, slot: number): void {
    if (!detailReady() || actionPending() || !detail) return;
    const token = nextToken();
    pendingDetailToken = token;
    pendingDetailRequestedAt = GetTime();
    if (!send(new CompanionTrainingActionRequest(
        token,
        detail.revision,
        COMPANION_TRAINING_CATALOG_VERSION,
        selectedCompanionId,
        action,
        featureId,
        slot,
    ).write(), L("Sending the training action...", "Отправляю действие обучения..."))) {
        pendingDetailToken = 0;
        pendingDetailRequestedAt = 0;
    }
}

function sendWorkforceAction(action: number, target: WorkforceTargetLocal): void {
    if (selectedCompanionId <= 0 || pendingWorkforceToken > 0) return;
    const workerId = action == WORKFORCE_ACTION_UNASSIGN ? target.workerId : selectedCompanionId;
    if (workerId <= 0) return;
    const token = nextToken();
    pendingWorkforceToken = token;
    pendingWorkforceAction = {
        action,
        workerId,
        targetKind: target.targetKind,
        targetId: target.targetId,
    };
    pendingWorkforceError = "";
    workforceRequestedAt = GetTime();
    workforceTimedOut = false;
    if (!send(new WorkforceRequestLocal(
        action,
        workerId,
        target.targetKind,
        target.targetId,
        workforce.revision,
        token,
    ).write(), action == WORKFORCE_ACTION_ASSIGN
        ? L("Assigning worker...", "Назначаю работника...")
        : L("Removing worker...", "Снимаю работника..."))) {
        pendingWorkforceToken = 0;
        pendingWorkforceAction = undefined;
        workforceRequestedAt = 0;
    }
}

function sendOrQueueWorkforceAction(target: WorkforceTargetLocal): void {
    if (target.workerId == selectedCompanionId) {
        sendWorkforceAction(WORKFORCE_ACTION_UNASSIGN, target);
        return;
    }
    const companion = selectedSummary();
    if (!companion || companion.expeditionRemainingS >= 0) return;
    if (companion.companionId != summary.activeId) {
        sendWorkforceAction(WORKFORCE_ACTION_ASSIGN, target);
        return;
    }
    if (pendingWorkforceToken > 0 || queuedWorkforceAssignment) return;
    queuedWorkforceAssignment = {
        workerId: companion.companionId,
        targetKind: target.targetKind,
        targetId: target.targetId,
        waitingForState: false,
        startedAt: GetTime(),
    };
    if (!send(
        new CompanionActivateRequest(0).write(),
        L(
            "Dismissing the active companion before assigning it to the base...",
            "Отзываю активного спутника перед назначением на базу...",
        ),
    )) {
        queuedWorkforceAssignment = undefined;
        refresh();
    }
}

function sanitizeDetail(next: CompanionDetailState): boolean {
    if (next.companionId != selectedCompanionId
        || next.capacity < 0 || next.capacity > COMPANION_TRAINING_MAX_SLOTS
        || next.catalogVersion <= 0) return false;
    const sanitized: { [featureId: number]: CompanionDetailFeatureState } = {};
    const count = Math.min(COMPANION_TRAINING_FEATURE_COUNT, next.features.length);
    for (let i = 0; i < count; i++) {
        const source = next.features[i];
        const featureId = safeUInt(source.featureId);
        if (featureId > 0 && featureId <= COMPANION_TRAINING_FEATURE_COUNT && !sanitized[featureId]) {
            const state = new CompanionDetailFeatureState();
            state.featureId = featureId;
            state.rank = Math.max(0, Math.min(3, safeUInt(source.rank)));
            state.rankProgress = Math.max(0, Math.min(2, safeUInt(source.rankProgress)));
            state.installedSlot = Math.max(0, Math.min(COMPANION_TRAINING_MAX_SLOTS, safeUInt(source.installedSlot)));
            state.inventoryCount = Math.max(0, Math.min(999999, safeUInt(source.inventoryCount)));
            sanitized[featureId] = state;
        }
    }
    detailFeatures = sanitized;
    return true;
}

function selectCompanion(companionId: number): void {
    if (companionId <= 0 || (companionId == selectedCompanionId && detail)) return;
    selectedCompanionId = companionId;
    detail = undefined;
    detailFeatures = {};
    selectedFeatureId = 0;
    selectedSlot = 1;
    libraryPage = 0;
    pendingDetailToken = 0;
    pendingDetailRequestedAt = 0;
    queuedWorkforceAssignment = undefined;
    lastStaleDetailFloor = -1;
    requestDetail();
    refresh();
}

function targetKey(target: WorkforceTargetLocal): string {
    return `${target.targetKind}:${target.targetId}`;
}

function selectedTarget(): WorkforceTargetLocal | undefined {
    for (let i = 0; i < workforce.targets.length; i++) {
        if (targetKey(workforce.targets[i]) == selectedTargetKey) return workforce.targets[i];
    }
    return undefined;
}

function workforceTarget(targetKind: number, targetId: number): WorkforceTargetLocal | undefined {
    for (let i = 0; i < workforce.targets.length; i++) {
        const target = workforce.targets[i];
        if (target.targetKind == targetKind && target.targetId == targetId) return target;
    }
    return undefined;
}

function workforceCompatible(profession: number, target: WorkforceTargetLocal): boolean {
    if (target.targetKind == WORKFORCE_TARGET_GENERATOR) {
        if (profession == 1) return target.generatorCategory == 1 || target.generatorCategory == 3;
        if (profession == 2) return target.generatorCategory == 2;
        if (profession == 3) return target.generatorCategory == 4;
        if (profession == 4) return target.generatorCategory == 5 || target.generatorCategory == 6;
        return false;
    }
    if (target.targetKind != WORKFORCE_TARGET_STATION) return false;
    const station = target.targetId;
    if (profession == 1) return station == 83 || station == 88;
    if (profession == 2) return station == 84;
    if (profession == 3) return false;
    if (profession == 4) return station == 12;
    if (profession == 5) return station == 85 || station == 90 || station == 93;
    if (profession == 6) return station == 86 || station == 95;
    if (profession == 7) return station == 87;
    if (profession == 8) return station == 83 || station == 94 || station == 96;
    if (profession == 9) return station == 89 || station == 96;
    if (profession == 10) return station == 88 || station == 97;
    return false;
}

function isWorkforceErrorText(text: string): boolean {
    return text == "Состояние работников изменилось; список обновлён."
        || text == "Коллекция спутников ещё загружается."
        || text == "Выбранное рабочее место больше не существует."
        || text == "Это рабочее место уже занято."
        || text == "Спутник активен, находится в экспедиции или недоступен."
        || text == "Профессия спутника несовместима с этим рабочим местом."
        || text == "Некорректный запрос работника."
        || text == "Неизвестное действие работника.";
}

function workforceErrorDisplay(text: string): string {
    if (RU) return text;
    if (text == "Состояние работников изменилось; список обновлён.") return "Workforce state changed; the list was refreshed.";
    if (text == "Коллекция спутников ещё загружается.") return "The companion collection is still loading.";
    if (text == "Выбранное рабочее место больше не существует.") return "The selected workplace no longer exists.";
    if (text == "Это рабочее место уже занято.") return "This workplace is already occupied.";
    if (text == "Спутник активен, находится в экспедиции или недоступен.") return "The companion is active, on an expedition, or unavailable.";
    if (text == "Профессия спутника несовместима с этим рабочим местом.") return "The companion's profession is incompatible with this workplace.";
    if (text == "Некорректный запрос работника.") return "Invalid workforce request.";
    if (text == "Неизвестное действие работника.") return "Unknown workforce action.";
    return text;
}

function assignmentForSelected(): WorkforceTargetLocal | undefined {
    for (let i = 0; i < workforce.targets.length; i++) {
        if (workforce.targets[i].workerId == selectedCompanionId) return workforce.targets[i];
    }
    return undefined;
}

function createText(
    parent: WoWAPI.Frame,
    size: number,
    width: number,
    anchor: WoWAPI.Point,
    relative: WoWAPI.Region,
    relativeAnchor: WoWAPI.Point,
    x: number,
    y: number,
): WoWAPI.FontString {
    const text = parent.CreateFontString(null, "OVERLAY", "GameFontNormal");
    text.SetFont(STORE_FONT, size, "OUTLINE");
    text.SetPoint(anchor, relative, relativeAnchor, x, y);
    text.SetWidth(width);
    text.SetJustifyH("LEFT");
    return text;
}

function makePanel(parent: WoWAPI.Frame): WoWAPI.Frame {
    const panel = CreateFrame("Frame", "", parent);
    panel.SetSize(730, 430);
    panel.SetPoint("TOPLEFT", parent, "TOPLEFT", 285, -205);
    return panel;
}

function createPager(
    parent: WoWAPI.Frame,
    x: number,
    y: number,
    onPrevious: () => void,
    onNext: () => void,
): WoWAPI.FontString {
    const previous = createActionButton(parent, 30, 23, "<");
    previous.button.SetPoint("BOTTOMLEFT", parent, "BOTTOMLEFT", x, y);
    previous.button.SetScript("OnClick", onPrevious);
    const text = parent.CreateFontString(null, "OVERLAY", "GameFontNormal");
    text.SetFont(STORE_FONT, 10, "OUTLINE");
    text.SetPoint("LEFT", previous.button, "RIGHT", 4, 0);
    text.SetWidth(54);
    text.SetJustifyH("CENTER");
    const next = createActionButton(parent, 30, 23, ">");
    next.button.SetPoint("LEFT", text, "RIGHT", 4, 0);
    next.button.SetScript("OnClick", onNext);
    return text;
}

function createCompanionBadge(parent: WoWAPI.Button, x: number): CompanionBadge {
    const button = CreateFrame("Button", "", parent);
    button.SetSize(19, 19);
    button.SetPoint("RIGHT", parent, "RIGHT", x, 0);

    const background = button.CreateTexture(null, "BACKGROUND");
    background.SetAllPoints();
    background.SetTexture(0, 0, 0, 0.8);

    const icon = button.CreateTexture(null, "ARTWORK");
    icon.SetPoint("CENTER");
    icon.SetSize(17, 17);
    icon.SetTexCoord(0.07, 0.93, 0.07, 0.93);

    const count = button.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    count.SetFont(STORE_FONT, 9, "OUTLINE");
    count.SetPoint("BOTTOMRIGHT", button, "BOTTOMRIGHT", 1, -1);
    count.SetJustifyH("RIGHT");
    button.Hide();
    return { button: button, icon: icon, count: count };
}

function showCompanionBadgeTooltip(
    owner: WoWAPI.Button,
    companion: CompanionSummaryEntry,
    kind: number,
): void {
    GameTooltip.SetOwner(owner, "ANCHOR_RIGHT");
    if (kind == 1) {
        const trait = companionTraitById(companion.innateTraitId);
        GameTooltip.SetText(L("Innate trait", "Врождённая черта"));
        GameTooltip.AddLine(trait ? L(trait.name, trait.nameRu) : L("Not set", "Не определена"), 1, 0.82, 0);
        if (trait) GameTooltip.AddLine(L(trait.description, trait.descriptionRu), 1, 1, 1, true);
    } else if (kind == 2) {
        const rank = Math.max(1, Math.min(COMPANION_SERVICE_RANKS.length, companion.serviceRank));
        const nextRank = rank < COMPANION_SERVICE_RANKS.length ? COMPANION_SERVICE_RANKS[rank] : undefined;
        GameTooltip.SetText(L("Service rank", "Ранг службы"));
        GameTooltip.AddLine(L(
            COMPANION_SERVICE_RANKS[rank - 1].name,
            COMPANION_SERVICE_RANKS[rank - 1].nameRu,
        ), 1, 0.82, 0);
        GameTooltip.AddLine(nextRank
            ? L(
                `${companion.serviceXp}/${nextRank.minimumXp} XP until the next rank.`,
                `${companion.serviceXp}/${nextRank.minimumXp} XP до следующего ранга.`,
            )
            : L(
                `${companion.serviceXp} XP — maximum rank.`,
                `${companion.serviceXp} XP — максимальный ранг.`,
            ), 1, 1, 1, true);
    } else {
        GameTooltip.SetText(L("Installed upgrades", "Установленные улучшения"));
        GameTooltip.AddLine(L(
            `${companion.installedCount}/${companion.trainingCapacity} slots occupied.`,
            `${companion.installedCount}/${companion.trainingCapacity} ячеек занято.`,
        ), 1, 0.82, 0);
        GameTooltip.AddLine(L(
            "Library upgrades work only after being installed in an open slot.",
            "Улучшения из библиотеки действуют только после установки в открытую ячейку.",
        ), 1, 1, 1, true);
    }
    GameTooltip.Show();
}

function showCompanionRowTooltip(owner: WoWAPI.Button, companion: CompanionSummaryEntry): void {
    const profession = companionProfessionById(companion.professionId);
    const trait = companionTraitById(companion.innateTraitId);
    const rank = Math.max(1, Math.min(COMPANION_SERVICE_RANKS.length, companion.serviceRank));
    GameTooltip.SetOwner(owner, "ANCHOR_RIGHT");
    GameTooltip.SetText(`${companion.name} #${companion.companionId}`);
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
    GameTooltip.AddLine(L("Click to select the companion.", "Нажмите, чтобы выбрать спутника."), 0.8, 0.8, 0.8);
    GameTooltip.Show();
}

function buildSlotsPanel(parent: WoWAPI.Frame): void {
    slotsPanel = makePanel(parent);
    const title = createText(slotsPanel, 13, 700, "TOPLEFT", slotsPanel, "TOPLEFT", 10, -4);
    title.SetText(L("15 progression slots", "15 свободных ячеек развития"));
    for (let i = 0; i < COMPANION_TRAINING_MAX_SLOTS; i++) {
        const slot = i + 1;
        const action = createActionButton(slotsPanel, 132, 64, L(`${slot}. Empty`, `${slot}. Пусто`));
        action.button.SetPoint("TOPLEFT", slotsPanel, "TOPLEFT", 10 + (i % 5) * 142, -32 - Math.floor(i / 5) * 74);
        action.button.SetScript("OnClick", () => {
            selectedSlot = slot;
            const installed = installedFeature(slot);
            if (installed) selectedFeatureId = installed.featureId;
            refresh();
        });
        action.button.SetScript("OnEnter", () => showSlotTooltip(action.button, slot));
        action.button.SetScript("OnLeave", () => GameTooltip.Hide());
        slotButtons.push(action);
    }
    slotSelectionText = createText(slotsPanel, 11, 700, "TOPLEFT", slotsPanel, "TOPLEFT", 10, -260);
    slotSelectionText.SetHeight(64);
    installButton = createActionButton(slotsPanel, 220, 27, L("Install for free", "Установить бесплатно"));
    installButton.button.SetPoint("BOTTOMLEFT", slotsPanel, "BOTTOMLEFT", 10, 24);
    installButton.button.SetScript("OnClick", () => {
        if (selectedFeatureId > 0) sendTrainingAction(
            COMPANION_ACTION_INSTALL, selectedFeatureId, selectedSlot,
        );
    });
    uninstallButton = createActionButton(slotsPanel, 220, 27, L("Remove from slot", "Снять из ячейки"));
    uninstallButton.button.SetPoint("BOTTOMLEFT", slotsPanel, "BOTTOMLEFT", 245, 24);
    uninstallButton.button.SetScript("OnClick", () => {
        const installed = installedFeature(selectedSlot);
        if (installed) sendTrainingAction(COMPANION_ACTION_UNINSTALL, installed.featureId, selectedSlot);
    });
}

function buildLibraryPanel(parent: WoWAPI.Frame): void {
    libraryPanel = makePanel(parent);
    const title = createText(libraryPanel, 13, 700, "TOPLEFT", libraryPanel, "TOPLEFT", 10, -4);
    title.SetText(L("Available manuals and tools", "Доступные руководства и инструменты"));
    for (let i = 0; i < LIBRARY_PER_PAGE; i++) {
        const index = i;
        const row = createListRow(libraryPanel, 700, 38);
        row.button.SetPoint("TOPLEFT", libraryPanel, "TOPLEFT", 10, -28 - i * 41);
        const flat = row.button.CreateTexture(null, "ARTWORK");
        flat.SetAllPoints();
        flat.SetTexture(0.08, 0.055, 0.025, 0.96);
        const highlight = row.button.CreateTexture(null, "HIGHLIGHT");
        highlight.SetAllPoints();
        highlight.SetTexture(0.4, 0.27, 0.07, 0.35);
        row.button.SetHighlightTexture(highlight);
        row.button.SetScript("OnClick", () => {
            const feature = libraryFeatures()[libraryPage * LIBRARY_PER_PAGE + index];
            if (!feature) return;
            selectedFeatureId = feature.id;
            refresh();
        });
        row.button.SetScript("OnEnter", () => {
            const feature = libraryFeatures()[libraryPage * LIBRARY_PER_PAGE + index];
            if (feature) showFeatureTooltip(row.button, feature);
        });
        row.button.SetScript("OnLeave", () => GameTooltip.Hide());
        libraryRows.push(row);
    }
    librarySelectionText = createText(libraryPanel, 10, 700, "BOTTOMLEFT", libraryPanel, "BOTTOMLEFT", 10, 50);
    librarySelectionText.SetHeight(40);
    libraryPageText = createPager(libraryPanel, 8, 4, () => {
        if (libraryPage > 0) libraryPage--;
        refresh();
    }, () => {
        if (libraryPage < libraryMaxPage()) libraryPage++;
        refresh();
    });
    learnButton = createActionButton(libraryPanel, 180, 25, L("Learn: −1 item", "Изучить: −1 предмет"));
    learnButton.button.SetPoint("BOTTOMLEFT", libraryPanel, "BOTTOMLEFT", 140, 5);
    learnButton.button.SetScript("OnClick", () => {
        if (selectedFeatureId > 0) sendTrainingAction(
            COMPANION_ACTION_LEARN_OR_RANK, selectedFeatureId, 0,
        );
    });
    libraryInstallButton = createActionButton(libraryPanel, 180, 25, L("Install in slot: free", "В ячейку: бесплатно"));
    libraryInstallButton.button.SetPoint("BOTTOMLEFT", libraryPanel, "BOTTOMLEFT", 330, 5);
    libraryInstallButton.button.SetScript("OnClick", () => {
        if (selectedFeatureId > 0) sendTrainingAction(
            COMPANION_ACTION_INSTALL, selectedFeatureId, selectedSlot,
        );
    });
    studyButton = createActionButton(libraryPanel, 200, 25, L("Dismantle item", "Разобрать предмет"));
    studyButton.button.SetPoint("BOTTOMRIGHT", libraryPanel, "BOTTOMRIGHT", -10, 5);
    studyButton.button.SetScript("OnClick", () => {
        if (selectedFeatureId > 0) sendTrainingAction(COMPANION_ACTION_STUDY, selectedFeatureId, 0);
    });
}

function buildBasePanel(parent: WoWAPI.Frame): void {
    basePanel = makePanel(parent);
    const title = createText(basePanel, 13, 700, "TOPLEFT", basePanel, "TOPLEFT", 10, -4);
    title.SetText(L("Base workplaces", "Рабочие места базы"));
    const refreshButton = createActionButton(basePanel, 110, 23, L("Refresh", "Обновить"));
    refreshButton.button.SetPoint("TOPRIGHT", basePanel, "TOPRIGHT", -10, -2);
    refreshButton.button.SetScript("OnClick", () => {
        requestWorkforce(true);
    });
    for (let i = 0; i < TARGETS_PER_PAGE; i++) {
        const index = i;
        const row = createListRow(basePanel, 700, 38);
        row.button.SetPoint("TOPLEFT", basePanel, "TOPLEFT", 10, -28 - i * 41);
        row.button.SetScript("OnClick", () => {
            const target = workforce.targets[targetPage * TARGETS_PER_PAGE + index];
            if (!target) return;
            selectedTargetKey = targetKey(target);
            refresh();
        });
        row.button.SetScript("OnEnter", () => {
            const target = workforce.targets[targetPage * TARGETS_PER_PAGE + index];
            if (target) showTargetTooltip(row.button, target);
        });
        row.button.SetScript("OnLeave", () => GameTooltip.Hide());
        targetRows.push(row);
    }
    targetSelectionText = createText(basePanel, 10, 700, "BOTTOMLEFT", basePanel, "BOTTOMLEFT", 10, 50);
    targetSelectionText.SetHeight(40);
    targetPageText = createPager(basePanel, 8, 4, () => {
        if (targetPage > 0) targetPage--;
        refresh();
    }, () => {
        if (targetPage < targetMaxPage()) targetPage++;
        refresh();
    });
    workforceButton = createActionButton(basePanel, 220, 25, L("Assign", "Назначить"));
    workforceButton.button.SetPoint("BOTTOM", basePanel, "BOTTOM", 0, 5);
    workforceButton.button.SetScript("OnClick", () => {
        const target = selectedTarget();
        if (!target) return;
        sendOrQueueWorkforceAction(target);
    });
}

function buildHelpPanel(parent: WoWAPI.Frame): void {
    helpPanel = makePanel(parent);
    const title = createText(helpPanel, 13, 700, "TOPLEFT", helpPanel, "TOPLEFT", 10, -4);
    title.SetText(L("Terms and icons", "Справка по терминам и значкам"));

    const left = createText(helpPanel, 9, 340, "TOPLEFT", helpPanel, "TOPLEFT", 10, -30);
    left.SetHeight(390);
    left.SetJustifyV("TOP");
    left.SetText(L(
        "|cffffd45cMain icon|r — the companion's profession.\n"
        + "|cffffd45cTrait icon|r — innate specialty: damage, healing, work, or output quality.\n"
        + "|cffffd45cProfession|r — determines useful base work and expedition roles.\n"
        + "|cffffd45cInnate trait|r — a permanent random feature of this companion.\n"
        + "|cffffd45cService rank|r — long-term companion experience; the service icon shows its number.\n"
        + "|cffffd45cService XP|r — experience from combat, expeditions, and base work.\n"
        + "|cffffd45cProgression slot|r — a place for an installed learned upgrade.\n"
        + "|cffffd45cCapacity|r — the number of progression slots already open.\n"
        + "|cffffd45cLibrary|r — manuals and tools available to the selected companion.\n"
        + "|cffffd45cManual|r — an additional combat or utility ability.\n"
        + "|cffffd45cTool|r — a professional upgrade for base work.\n"
        + "|cffffd45cUpgrade rank|r — strength of a learned manual or tool: I–III.\n"
        + "|cffffd45cRank progress|r — extra copies invested toward the next rank.\n"
        + "|cffffd45cInstalled|r — learned and placed in a slot; the book icon shows occupied slots.\n"
        + "|cffffd45cIn bags|r — available item copies of the selected upgrade.\n"
        + "|cffffd45cCompatibility|r — whether an upgrade fits the selected companion's family and profession.",
        "|cffffd45cГлавная иконка|r — профессия спутника.\n"
        + "|cffffd45cИконка черты|r — врождённая специализация: урон, лечение, работа или качество результата.\n"
        + "|cffffd45cПрофессия|r — определяет полезные направления работы на базе и экспедиции.\n"
        + "|cffffd45cВрождённая черта|r — постоянная случайная особенность конкретного спутника.\n"
        + "|cffffd45cРанг службы|r — долгосрочный уровень опыта спутника; значок службы показывает его номер.\n"
        + "|cffffd45cXP службы|r — опыт за бой, экспедиции и работу на базе.\n"
        + "|cffffd45cЯчейка развития|r — место, куда устанавливается изученное улучшение.\n"
        + "|cffffd45cВместимость|r — число уже открытых ячеек развития.\n"
        + "|cffffd45cБиблиотека|r — руководства и инструменты, доступные выбранному спутнику.\n"
        + "|cffffd45cРуководство|r — дополнительная боевая или полезная способность.\n"
        + "|cffffd45cИнструмент|r — профессиональное улучшение для работы на базе.\n"
        + "|cffffd45cРанг улучшения|r — сила изученного руководства или инструмента: I–III.\n"
        + "|cffffd45cПрогресс ранга|r — число дополнительных копий, вложенных в следующий ранг.\n"
        + "|cffffd45cУстановлено|r — улучшение изучено и помещено в ячейку; значок книги показывает занятые ячейки.\n"
        + "|cffffd45cВ сумках|r — доступные предметы-копии выбранного улучшения.\n"
        + "|cffffd45cСовместимость|r — подходит ли улучшение семье и профессии выбранного спутника.",
    ));

    const right = createText(helpPanel, 9, 340, "TOPLEFT", helpPanel, "TOPLEFT", 380, -30);
    right.SetHeight(390);
    right.SetJustifyV("TOP");
    right.SetText(L(
        "|cffffd45cInstall in slot|r — free; it does not require another learned item.\n"
        + "|cffffd45cDismantle item|r — deliberately destroys one copy to open more slots.\n"
        + "|cffffd45cWorkplace|r — a station or generator that can employ one companion.\n"
        + "|cffffd45cStation|r — processes materials or crafts recipe items.\n"
        + "|cffffd45cGenerator|r — gradually produces resources in its category.\n"
        + "|cffffd45cSpeed|r — reduces work-cycle time.\n"
        + "|cffffd45cSaving|r — grants a chance not to consume some materials.\n"
        + "|cffffd45cYield|r — increases the amount produced.\n"
        + "|cffffd45cResult selector|r — biases randomness toward a result type.\n"
        + "|cffffd45cMaker's mark|r — chance to add an extra property to a crafted item.\n"
        + "|cffffd45cProperty|r — a saved bonus on a specific item instance.\n"
        + "|cffffd45cActive companion|r — summoned beside the player; automatically dismissed for base work.\n"
        + "|cffffd45cExpedition|r — an independent mission with a reward and return time.\n"
        + "|cffffd45cDefense|r — the companion joins combat with the player.\n"
        + "|cffffd45cTank|r — allows taunts and enables tank behavior.\n"
        + "|cffffd45cDo not attack|r — blocks autonomous attacks but keeps healing and utility.\n"
        + "|cffffd45cProtocol / catalog|r — technical exchange and upgrade-list versions; must match the server.",
        "|cffffd45cУстановить в ячейку|r — бесплатное действие: изученный предмет для него не нужен.\n"
        + "|cffffd45cРазобрать предмет|r — намеренно уничтожает одну копию ради открытия новых ячеек.\n"
        + "|cffffd45cРабочее место|r — станок или генератор, куда можно назначить одного спутника.\n"
        + "|cffffd45cСтанок|r — перерабатывает материалы или создаёт предметы по рецепту.\n"
        + "|cffffd45cГенератор|r — постепенно производит ресурсы своей категории.\n"
        + "|cffffd45cСкорость|r — уменьшает время рабочего цикла.\n"
        + "|cffffd45cЭкономия|r — даёт шанс не потратить часть материалов.\n"
        + "|cffffd45cВыход|r — повышает количество полученного результата.\n"
        + "|cffffd45cСелектор результата|r — смещает случайность к определённому типу результата.\n"
        + "|cffffd45cКлеймо|r — шанс добавить созданному предмету дополнительное свойство.\n"
        + "|cffffd45cСвойство|r — конкретный сохранённый бонус отдельного экземпляра предмета.\n"
        + "|cffffd45cАктивный спутник|r — призван рядом с игроком; при назначении на базу будет отозван автоматически.\n"
        + "|cffffd45cЭкспедиция|r — самостоятельное задание спутника с наградой и временем возвращения.\n"
        + "|cffffd45cЗащита|r — спутник вступает в бой вместе с игроком.\n"
        + "|cffffd45cТанк|r — разрешает провокации и включает танковое поведение.\n"
        + "|cffffd45cНе атаковать|r — запрещает самостоятельные атаки, но оставляет лечение и пользу.\n"
        + "|cffffd45cПротокол / каталог|r — технические версии обмена и списка улучшений; должны совпадать с сервером.",
    ));
}

function ensureFrame(): WoWAPI.Frame {
    if (frame) return frame;
    frame = createStoreWindow("CompanionProgressionFrame", L("Companion Progression", "Развитие спутников"));
    frame.RegisterEvent("BAG_UPDATE");
    frame.HookScript("OnEvent", () => {
        if (frame && frame.IsShown()) detailRefreshAt = GetTime() + 0.2;
    });

    const companionTitle = createText(frame, 13, 235, "TOPLEFT", frame, "TOPLEFT", 24, -67);
    companionTitle.SetText(L("Collection", "Коллекция"));
    for (let i = 0; i < COMPANIONS_PER_PAGE; i++) {
        const index = i;
        const row = createListRow(frame, 235, 49);
        row.button.SetPoint("TOPLEFT", frame, "TOPLEFT", 22, -96 - i * 55);
        row.label.ClearAllPoints();
        row.label.SetPoint("TOPLEFT", row.icon, "TOPRIGHT", 5, -3);
        row.label.SetWidth(105);
        row.count.ClearAllPoints();
        row.count.SetPoint("BOTTOMLEFT", row.icon, "BOTTOMRIGHT", 5, 3);
        row.count.SetWidth(105);
        row.count.SetJustifyH("LEFT");

        const badges: CompanionBadges = {
            trait: createCompanionBadge(row.button, -49),
            rank: createCompanionBadge(row.button, -27),
            training: createCompanionBadge(row.button, -5),
        };
        const select = () => {
            const companion = summary.companions[companionPage * COMPANIONS_PER_PAGE + index];
            if (companion) selectCompanion(companion.companionId);
        };
        row.button.SetScript("OnClick", select);
        row.button.SetScript("OnEnter", () => {
            const companion = summary.companions[companionPage * COMPANIONS_PER_PAGE + index];
            if (companion) showCompanionRowTooltip(row.button, companion);
        });
        row.button.SetScript("OnLeave", () => GameTooltip.Hide());
        badges.trait.button.SetScript("OnClick", select);
        badges.rank.button.SetScript("OnClick", select);
        badges.training.button.SetScript("OnClick", select);
        badges.trait.button.SetScript("OnEnter", () => {
            const companion = summary.companions[companionPage * COMPANIONS_PER_PAGE + index];
            if (companion) showCompanionBadgeTooltip(badges.trait.button, companion, 1);
        });
        badges.rank.button.SetScript("OnEnter", () => {
            const companion = summary.companions[companionPage * COMPANIONS_PER_PAGE + index];
            if (companion) showCompanionBadgeTooltip(badges.rank.button, companion, 2);
        });
        badges.training.button.SetScript("OnEnter", () => {
            const companion = summary.companions[companionPage * COMPANIONS_PER_PAGE + index];
            if (companion) showCompanionBadgeTooltip(badges.training.button, companion, 3);
        });
        badges.trait.button.SetScript("OnLeave", () => GameTooltip.Hide());
        badges.rank.button.SetScript("OnLeave", () => GameTooltip.Hide());
        badges.training.button.SetScript("OnLeave", () => GameTooltip.Hide());
        companionRows.push(row);
        companionBadges.push(badges);
    }
    companionPageText = createPager(frame, 80, 92, () => {
        if (companionPage > 0) companionPage--;
        refresh();
    }, () => {
        if (companionPage < companionMaxPage()) companionPage++;
        refresh();
    });

    nameText = createText(frame, 15, 720, "TOPLEFT", frame, "TOPLEFT", 285, -67);
    professionText = createText(frame, 11, 720, "TOPLEFT", frame, "TOPLEFT", 285, -94);
    traitText = createText(frame, 10, 720, "TOPLEFT", frame, "TOPLEFT", 285, -117);
    traitText.SetHeight(36);
    rankText = createText(frame, 11, 720, "TOPLEFT", frame, "TOPLEFT", 285, -153);
    protocolText = createText(frame, 9, 300, "TOPRIGHT", frame, "TOPRIGHT", -28, -157);
    protocolText.SetJustifyH("RIGHT");

    const tabNames = RU
        ? ["Ячейки", "Библиотека", "База", "Справка"]
        : ["Slots", "Library", "Base", "Help"];
    for (let i = 0; i < tabNames.length; i++) {
        const index = i;
        const tab = createActionButton(frame, 180, 27, tabNames[i]);
        tab.button.SetPoint("TOPLEFT", frame, "TOPLEFT", 285 + i * 190, -175);
        tab.button.SetScript("OnClick", () => {
            activeTab = index;
            if (index == TAB_BASE && (!workforceLoaded || workforceTimedOut)) requestWorkforce();
            refresh();
        });
        tabButtons.push(tab);
    }

    buildSlotsPanel(frame);
    buildLibraryPanel(frame);
    buildBasePanel(frame);
    buildHelpPanel(frame);
    messageText = createText(frame, 10, 720, "BOTTOMLEFT", frame, "BOTTOMLEFT", 285, 26);

    frame.HookScript("OnShow", () => {
        requestCollection();
        if (selectedCompanionId > 0 && pendingDetailToken == 0) requestDetail();
        requestWorkforce();
    });
    frame.HookScript("OnUpdate", () => {
        const now = GetTime();
        if (pendingDetailToken > 0 && pendingDetailRequestedAt > 0
            && now - pendingDetailRequestedAt >= WORKFORCE_TIMEOUT_S) {
            pendingDetailToken = 0;
            pendingDetailRequestedAt = 0;
            message = L(
                "The progression server did not respond. Retrying...",
                "Сервер развития не ответил. Повторяю запрос...",
            );
            requestDetail();
        }
        if (detailRefreshAt > 0 && now >= detailRefreshAt && pendingDetailToken == 0) {
            detailRefreshAt = 0;
            requestDetail();
        }
        if (pendingWorkforceToken > 0 && workforceRequestedAt > 0
            && now - workforceRequestedAt >= WORKFORCE_TIMEOUT_S) {
            const assigningAfterRecall = !!queuedWorkforceAssignment
                && queuedWorkforceAssignment.waitingForState;
            pendingWorkforceToken = 0;
            pendingWorkforceAction = undefined;
            const serverError = pendingWorkforceError;
            pendingWorkforceError = "";
            workforceRequestedAt = 0;
            workforceTimedOut = true;
            if (assigningAfterRecall) queuedWorkforceAssignment = undefined;
            message = serverError ? workforceErrorDisplay(serverError) : assigningAfterRecall
                ? L(
                    "The base server did not respond after the companion was dismissed. Click Refresh and retry the assignment.",
                    "Сервер базы не ответил после отзыва спутника. Нажмите «Обновить» и повторите назначение.",
                )
                : L(
                    "The base server did not respond. Click Refresh to retry.",
                    "Сервер базы не ответил. Нажмите «Обновить», чтобы повторить запрос.",
                );
            refresh();
            return;
        }
        if (queuedWorkforceAssignment && !queuedWorkforceAssignment.waitingForState
            && now - queuedWorkforceAssignment.startedAt >= WORKFORCE_TIMEOUT_S) {
            queuedWorkforceAssignment = undefined;
            message = L(
                "The server did not confirm the companion dismissal. Retry the assignment.",
                "Сервер не подтвердил отзыв спутника. Повторите назначение.",
            );
            refresh();
        }
    });
    refresh();
    return frame;
}

function showSlotTooltip(owner: WoWAPI.Button, slot: number): void {
    GameTooltip.SetOwner(owner, "ANCHOR_RIGHT");
    GameTooltip.SetText(L(`Slot ${slot}`, `Ячейка ${slot}`));
    if (!detail || slot > detail.capacity) {
        GameTooltip.AddLine(L("This slot is not open yet.", "Ячейка ещё не открыта."), 0.6, 0.6, 0.6);
    } else {
        const installed = installedFeature(slot);
        const feature = installed
            ? COMPANION_TRAINING_FEATURES[installed.featureId - 1]
            : undefined;
        GameTooltip.AddLine(feature ? L(feature.name, feature.nameRu) : L("Empty", "Свободна"), 1, 0.82, 0);
        GameTooltip.AddLine(L(
            "Select a slot, then an upgrade in the library. Installation is free.",
            "Выберите ячейку, затем улучшение в библиотеке. Установка бесплатна.",
        ), 0.8, 0.8, 0.8, true);
    }
    GameTooltip.Show();
}

function showFeatureTooltip(owner: WoWAPI.Button, feature: CompanionTrainingFeatureDef): void {
    GameTooltip.SetOwner(owner, "ANCHOR_RIGHT");
    GameTooltip.SetText(L(feature.name, feature.nameRu));
    GameTooltip.AddLine(L(feature.description, feature.descriptionRu), 1, 1, 1, true);
    if (feature.kind == TRAINING_KIND_MANUAL) {
        GameTooltip.AddLine(L(
            `Compatible families: ${trainingFamiliesRu(feature.familyMask)}.`,
            `Подходит семействам: ${trainingFamiliesRu(feature.familyMask)}.`,
        ), 0.65, 0.85, 1, true);
    }
    GameTooltip.AddLine(feature.kind == TRAINING_KIND_MANUAL
        ? L("Combat manual", "Боевое руководство")
        : L("Profession tool", "Профессиональный инструмент"), 1, 0.82, 0);
    if (detailReady() && detail) {
        const compatible = companionTrainingCompatible(feature, detail.family, detail.professionId);
        GameTooltip.AddLine(
            compatible
                ? L("Compatible with the selected companion", "Совместимо с выбранным спутником")
                : L("Incompatible with the selected companion", "Несовместимо с выбранным спутником"),
            compatible ? 0.3 : 1, compatible ? 1 : 0.3, 0.3,
        );
        const state = featureState(feature.id);
        if (state && state.rank > 0) {
            GameTooltip.AddLine(L(
                "Learned: installation in an open slot is free.",
                "Изучено: установка в открытую ячейку бесплатна.",
            ), 0.3, 1, 0.3, true);
        }
        GameTooltip.AddLine(L(
            "The item is consumed only when learning, ranking up, or explicitly dismantling it.",
            "Предмет расходуется только при изучении, повышении ранга или явном разборе.",
        ), 0.75, 0.75, 0.75, true);
    } else {
        GameTooltip.AddLine(L(
            "Compatibility is unknown: select a companion or wait for loading to finish.",
            "Совместимость не определена: выберите спутника или дождитесь загрузки.",
        ), 0.65, 0.65, 0.65, true);
    }
    GameTooltip.Show();
}

function showTargetTooltip(owner: WoWAPI.Button, target: WorkforceTargetLocal): void {
    GameTooltip.SetOwner(owner, "ANCHOR_RIGHT");
    GameTooltip.SetText(target.name);
    GameTooltip.AddLine(target.targetKind == WORKFORCE_TARGET_GENERATOR
        ? L("Generator", "Генератор") : L("Station", "Станок"), 1, 0.82, 0);
    const selected = selectedSummary();
    if (selected) {
        const compatible = workforceCompatible(selected.professionId, target);
        const profession = companionProfessionById(selected.professionId);
        GameTooltip.AddLine(
            L(
                `${profession ? profession.name : "Profession not set"}: ${compatible ? "compatible" : "not compatible"}`,
                `${profession ? profession.nameRu : "Профессия не определена"}: ${compatible ? "совместимо" : "не подходит"}`,
            ),
            compatible ? 0.3 : 1, compatible ? 1 : 0.3, 0.3,
        );
        if (selected.companionId == summary.activeId) {
            GameTooltip.AddLine(L(
                "The active companion will be dismissed automatically before assignment.",
                "Перед назначением активный спутник будет автоматически отозван.",
            ), 0.6, 0.9, 1, true);
        } else if (selected.expeditionRemainingS >= 0) {
            GameTooltip.AddLine(L(
                "The companion is on an expedition and unavailable for base work.",
                "Спутник в экспедиции и пока недоступен для базы.",
            ), 1, 0.3, 0.3, true);
        }
    }
    if (target.workerId > 0) {
        const profession = companionProfessionById(target.profession);
        const trait = companionTraitById(target.trait);
        const rank = Math.max(1, Math.min(COMPANION_SERVICE_RANKS.length, target.rank));
        GameTooltip.AddLine(L(`Worker #${target.workerId}`, `Работник #${target.workerId}`), 1, 1, 1);
        GameTooltip.AddLine(
            L(
                `${profession ? profession.name : "Profession not set"} • ${COMPANION_SERVICE_RANKS[rank - 1].name}`,
                `${profession ? profession.nameRu : "Профессия не определена"} • ${COMPANION_SERVICE_RANKS[rank - 1].nameRu}`,
            ),
            1, 0.82, 0,
        );
        if (trait) GameTooltip.AddLine(L(
            `${trait.name}: ${trait.description}`,
            `${trait.nameRu}: ${trait.descriptionRu}`,
        ), 0.8, 0.8, 0.8, true);
        GameTooltip.AddLine(L(
            `Speed ${bpsText(target.periodBps)}, saving ${bpsText(target.saveBps)}, yield ${bpsText(target.bonusBps)}`,
            `Скорость ${bpsText(target.periodBps)}, экономия ${bpsText(target.saveBps)}, выход ${bpsText(target.bonusBps)}`,
        ), 0.6, 0.9, 0.6, true);
        if (target.markBps > 0) GameTooltip.AddLine(L(
            `Maker's mark: ${bpsText(target.markBps)}, property ${target.markProperty}`,
            `Клеймо: ${bpsText(target.markBps)}, свойство ${target.markProperty}`,
        ), 1, 0.7, 0.3, true);
        if (target.pendingXP > 0) GameTooltip.AddLine(L(
            `Accumulated service XP: ${target.pendingXP}`,
            `Накоплено опыта службы: ${target.pendingXP}`,
        ), 0.6, 0.9, 0.6);
    } else {
        GameTooltip.AddLine(L("The workplace is free.", "Рабочее место свободно."), 0.6, 0.9, 0.6);
    }
    GameTooltip.Show();
}

function refreshHeader(): void {
    const companion = selectedSummary();
    if (!companion) {
        if (nameText) nameText.SetText(L("No companion selected", "Спутник не выбран"));
        if (professionText) professionText.SetText("");
        if (traitText) traitText.SetText("");
        if (rankText) rankText.SetText("");
    } else {
        const professionId = detail && detail.companionId == companion.companionId
            ? detail.professionId : companion.professionId;
        const traitId = detail && detail.companionId == companion.companionId
            ? detail.innateTraitId : companion.innateTraitId;
        const profession = companionProfessionById(professionId);
        const trait = companionTraitById(traitId);
        const xp = detail && detail.companionId == companion.companionId ? detail.serviceXp : companion.serviceXp;
        const rank = Math.max(1, Math.min(COMPANION_SERVICE_RANKS.length,
            detail && detail.companionId == companion.companionId ? detail.serviceRank : companion.serviceRank));
        const nextRank = rank < COMPANION_SERVICE_RANKS.length ? COMPANION_SERVICE_RANKS[rank] : undefined;
        if (nameText) nameText.SetText(`${companion.name} #${companion.companionId}`);
        if (professionText) professionText.SetText(L(
            `Profession: ${profession ? profession.name : "not set"}`,
            `Профессия: ${profession ? profession.nameRu : "не определена"}`,
        ));
        if (traitText) traitText.SetText(L(
            `Trait: ${trait ? trait.name + " — " + trait.description : "not set"}`,
            `Черта: ${trait ? trait.nameRu + " — " + trait.descriptionRu : "не определена"}`,
        ));
        if (rankText) rankText.SetText(
            L(COMPANION_SERVICE_RANKS[rank - 1].name, COMPANION_SERVICE_RANKS[rank - 1].nameRu)
            + `: ${xp} XP`
            + (nextRank ? ` / ${nextRank.minimumXp}` : L(" — maximum rank", " — максимальный ранг")),
        );
    }
    if (protocolText) {
        const catalog = detail ? detail.catalogVersion : 0;
        protocolText.SetText(L(
            `Protocol v${summary.selectedProtocolVersion} • catalog v${catalog}`,
            `Протокол v${summary.selectedProtocolVersion} • каталог v${catalog}`,
        ));
    }
}

function refreshCompanions(): void {
    companionPage = Math.min(companionPage, companionMaxPage());
    const count = summary.companions.length;
    for (let i = 0; i < companionRows.length; i++) {
        const companion = summary.companions[companionPage * COMPANIONS_PER_PAGE + i];
        const row = companionRows[i];
        const badges = companionBadges[i];
        if (!companion || companionPage * COMPANIONS_PER_PAGE + i >= count) {
            row.button.Hide();
            badges.trait.button.Hide();
            badges.rank.button.Hide();
            badges.training.button.Hide();
        } else {
            const profession = companionProfessionById(companion.professionId);
            const trait = companionTraitById(companion.innateTraitId);
            row.button.Show();
            row.icon.SetTexture(profession ? profession.icon : COMPANION_ICON);
            row.label.SetText(clipped(`${companion.name} #${companion.companionId}`, 21));
            row.count.SetText(summary.selectedProtocolVersion == COMPANION_PROTOCOL_VERSION
                ? clipped(profession
                    ? L(profession.name, profession.nameRu)
                    : L("Profession not set", "Профессия не определена"), 20)
                : L("Protocol v2", "Протокол v2"));
            row.label.SetTextColor(companion.companionId == selectedCompanionId ? 1 : 0.95, companion.companionId == selectedCompanionId ? 0.82 : 0.95, 0.3);
            if (summary.selectedProtocolVersion == COMPANION_PROTOCOL_VERSION) {
                badges.trait.button.Show();
                badges.trait.icon.SetTexture(trait ? trait.icon : COMPANION_ICON);
                badges.trait.count.SetText("");
                badges.rank.button.Show();
                badges.rank.icon.SetTexture("Interface\\Icons\\INV_Misc_Note_01");
                badges.rank.count.SetText(`${companion.serviceRank}`);
                badges.training.button.Show();
                badges.training.icon.SetTexture("Interface\\Icons\\INV_Misc_Book_11");
                badges.training.count.SetText(`${companion.installedCount}`);
            } else {
                badges.trait.button.Hide();
                badges.rank.button.Hide();
                badges.training.button.Hide();
            }
        }
    }
    if (companionPageText) companionPageText.SetText(`${companionPage + 1}/${companionMaxPage() + 1}`);
}

function refreshSlots(): void {
    const ready = detailReady();
    const capacity = detail ? Math.max(0, Math.min(COMPANION_TRAINING_MAX_SLOTS, detail.capacity)) : 0;
    for (let i = 0; i < slotButtons.length; i++) {
        const slot = i + 1;
        const installed = installedFeature(slot);
        const feature = installed ? COMPANION_TRAINING_FEATURES[installed.featureId - 1] : undefined;
        slotButtons[i].label.SetText(slot > capacity
            ? L(`${slot}. Locked`, `${slot}. Закрыто`)
            : feature
                ? L(
                    `${slot}. ${clipped(feature.name, 17)}\nRank ${romanRank(installed!.rank)}`,
                    `${slot}. ${clipped(feature.nameRu, 17)}\nРанг ${romanRank(installed!.rank)}`,
                )
                : L(`${slot}. Empty`, `${slot}. Свободно`));
        setActionEnabled(slotButtons[i], ready && slot <= capacity);
        slotButtons[i].label.SetTextColor(slot == selectedSlot ? 1 : slot > capacity ? 0.45 : 0.9, slot == selectedSlot ? 0.82 : slot > capacity ? 0.45 : 0.9, slot == selectedSlot ? 0 : slot > capacity ? 0.45 : 0.9);
    }
    const feature = selectedFeature();
    const state = feature ? featureState(feature.id) : undefined;
    const compatible = !!detail && !!feature && companionTrainingCompatible(feature, detail.family, detail.professionId);
    const installed = installedFeature(selectedSlot);
    if (slotSelectionText) {
        slotSelectionText.SetText(!ready
            ? summary.selectedProtocolVersion < COMPANION_PROTOCOL_VERSION
                ? L(
                    "The server uses protocol v2: progression is unavailable.",
                    "Сервер использует протокол v2: развитие недоступно.",
                )
                : L(
                    "Waiting for authoritative detail state or a compatible catalog.",
                    "Ожидание authoritative detail-state или совместимого каталога.",
                )
            : L(
                `Selected slot ${selectedSlot}. Upgrade: ${feature ? feature.name : "none"}.`
                    + " Installing a learned upgrade is free and does not require an item."
                    + ` Unlock progress: ${detail!.progress}/${detail!.nextSlotCost || 0}.`,
                `Выбрана ячейка ${selectedSlot}. Улучшение: ${feature ? feature.nameRu : "не выбрано"}.`
                    + " Установка изученного улучшения бесплатна и не требует предмета."
                    + ` Прогресс открытия: ${detail!.progress}/${detail!.nextSlotCost || 0}.`,
            ));
    }
    setActionEnabled(installButton, ready && !actionPending() && selectedSlot <= capacity
        && !!feature && !!state && state.rank > 0 && state.installedSlot != selectedSlot && compatible);
    setActionEnabled(uninstallButton, ready && !actionPending() && !!installed);
}

function refreshLibrary(): void {
    const features = libraryFeatures();
    libraryPage = Math.min(libraryPage, libraryMaxPage());
    for (let i = 0; i < libraryRows.length; i++) {
        const feature = features[libraryPage * LIBRARY_PER_PAGE + i];
        const row = libraryRows[i];
        if (!feature) {
            row.button.Hide();
        } else {
            const state = featureState(feature.id);
            row.button.Show();
            row.icon.SetTexture(feature.icon);
            row.label.SetText(`${feature.id}. ${clipped(L(feature.name, feature.nameRu), 42)}`);
            row.count.SetText(`${romanRank(state ? state.rank : 0)} • x${state ? state.inventoryCount : 0}`);
            row.count.SetTextColor(0.3, 1, 0.3);
            row.label.SetTextColor(feature.id == selectedFeatureId ? 1 : 0.95, feature.id == selectedFeatureId ? 0.82 : 0.95, feature.id == selectedFeatureId ? 0 : 0.95);
        }
    }
    if (libraryPageText) libraryPageText.SetText(`${libraryPage + 1}/${libraryMaxPage() + 1}`);
    const feature = selectedFeature();
    const state = feature ? featureState(feature.id) : undefined;
    const ready = detailReady();
    const compatible = ready && !!detail && !!feature
        && companionTrainingCompatible(feature, detail.family, detail.professionId);
    if (librarySelectionText) librarySelectionText.SetText(!ready
        ? L(
            "Loading manuals and tools available to the selected companion...",
            "Загружаю доступные выбранному спутнику руководства и инструменты...",
        )
        : feature
        ? L(
            `${feature.name}. Rank ${romanRank(state ? state.rank : 0)}, `
                + `rank progress ${state ? state.rankProgress : 0}, in bags ${state ? state.inventoryCount : 0}.`
                + (state && state.rank > 0
                    ? ` Installation in selected slot ${selectedSlot} is free.`
                    : " Learn the item first."),
            `${feature.nameRu}. Ранг ${romanRank(state ? state.rank : 0)}, `
                + `прогресс ранга ${state ? state.rankProgress : 0}, в сумках ${state ? state.inventoryCount : 0}.`
                + (state && state.rank > 0
                    ? ` Установка в выбранную ячейку ${selectedSlot} бесплатна.`
                    : " Сначала изучите предмет."),
        )
        : L("Select a manual or tool.", "Выберите руководство или инструмент."));
    const hasConsumable = detailReady() && !actionPending()
        && !!state && state.inventoryCount > 0;
    const rank = state ? state.rank : 0;
    if (learnButton) learnButton.label.SetText(rank <= 0
        ? L("Learn: −1 item", "Изучить: −1 предмет")
        : rank == 1 ? L("Rank II: −1 item", "Ранг II: −1 предмет") : rank == 2
            ? L(
                `Rank III: −1 (${3 - (state ? state.rankProgress : 0)} more)`,
                `Ранг III: −1 (ещё ${3 - (state ? state.rankProgress : 0)})`,
            )
            : L("Maximum rank", "Максимальный ранг"));
    if (libraryInstallButton) libraryInstallButton.label.SetText(
        state && state.installedSlot == selectedSlot
            ? L(`Already in slot ${selectedSlot}`, `Уже в ячейке ${selectedSlot}`)
            : L(`Install in slot ${selectedSlot}: free`, `В ячейку ${selectedSlot}: бесплатно`),
    );
    if (studyButton) studyButton.label.SetText(detail && detail.capacity < COMPANION_TRAINING_MAX_SLOTS
        ? L(
            `Dismantle −1 (${detail.progress}/${detail.nextSlotCost})`,
            `Разобрать −1 (${detail.progress}/${detail.nextSlotCost})`,
        )
        : L("All slots are open", "Все ячейки открыты"));
    setActionEnabled(learnButton, hasConsumable && compatible && rank < 3);
    setActionEnabled(libraryInstallButton, ready && !actionPending()
        && !!detail && selectedSlot <= detail.capacity
        && !!state && state.rank > 0 && state.installedSlot != selectedSlot && compatible);
    // Slot progress does not depend on whether the displayed item is learned.
    setActionEnabled(studyButton, hasConsumable
        && !!detail && detail.capacity < COMPANION_TRAINING_MAX_SLOTS);
}

function refreshBase(): void {
    targetPage = Math.min(targetPage, targetMaxPage());
    if (!selectedTarget() && workforce.targets.length > 0) selectedTargetKey = targetKey(workforce.targets[0]);
    const companion = selectedSummary();
    for (let i = 0; i < targetRows.length; i++) {
        const target = workforce.targets[targetPage * TARGETS_PER_PAGE + i];
        const row = targetRows[i];
        if (!target) {
            row.button.Hide();
        } else {
            row.button.Show();
            row.icon.SetTexture(target.targetKind == WORKFORCE_TARGET_GENERATOR ? GENERATOR_ICON : STATION_ICON);
            row.label.SetText(clipped(target.name, 44));
            const compatible = !!companion && workforceCompatible(companion.professionId, target);
            row.count.SetText(target.workerId > 0
                ? `#${target.workerId}`
                : !companion ? L("select companion", "выберите спутника")
                    : compatible ? L("compatible", "совместимо") : L("not suitable", "не подходит"));
            row.count.SetTextColor(
                target.workerId > 0 || !companion ? 0.85 : compatible ? 0.3 : 1,
                target.workerId > 0 || !companion ? 0.85 : compatible ? 1 : 0.3,
                target.workerId > 0 || !companion ? 0.85 : 0.3,
            );
            row.label.SetTextColor(targetKey(target) == selectedTargetKey ? 1 : 0.95, targetKey(target) == selectedTargetKey ? 0.82 : 0.95, 0.3);
        }
    }
    if (targetPageText) targetPageText.SetText(`${targetPage + 1}/${targetMaxPage() + 1}`);
    const target = selectedTarget();
    const current = assignmentForSelected();
    const compatible = !!target && !!companion && workforceCompatible(companion.professionId, target);
    const active = !!companion && companion.companionId == summary.activeId;
    const inExpedition = !!companion && companion.expeditionRemainingS >= 0;
    const noTargetText = pendingWorkforceToken > 0
        ? workforceLoaded
            ? L("Refreshing the base workplace list...", "Обновляю список рабочих мест базы...")
            : L("Loading base workplaces...", "Загружаю рабочие места базы...")
        : workforceTimedOut
            ? L(
                "The base server did not respond. Click Refresh to retry.",
                "Сервер базы не ответил. Нажмите «Обновить», чтобы повторить запрос.",
            )
            : workforceLoaded
                ? L(
                    "The list is loaded: the base has no functional stations or generators.",
                    "Список загружен: функциональных станков и генераторов на базе нет.",
                )
                : L(
                    "The workplace list is not loaded yet. Click Refresh.",
                    "Список рабочих мест ещё не загружен. Нажмите «Обновить».",
                );
    if (targetSelectionText) targetSelectionText.SetText(!target
        ? noTargetText
        : L(
            `${target.name}: ${target.workerId > 0 ? `worker #${target.workerId}` : "free"}.`
                + (!companion ? " Select a companion."
                    : compatible ? " The profession is compatible." : " The companion's profession is not suitable.")
                + (current ? ` Current assignment of the selected companion: ${current.name}.` : "")
                + (workforceTimedOut ? " The list may be stale: click Refresh." : "")
                + (inExpedition ? " The companion is on an expedition and unavailable."
                    : active ? " The active companion will be dismissed automatically before assignment." : ""),
            `${target.name}: ${target.workerId > 0 ? `работник #${target.workerId}` : "свободно"}.`
                + (!companion ? " Выберите спутника."
                    : compatible ? " Профессия совместима." : " Профессия спутника не подходит.")
                + (current ? ` Текущее назначение выбранного спутника: ${current.name}.` : "")
                + (workforceTimedOut ? " Список мог устареть: нажмите «Обновить»." : "")
                + (inExpedition ? " Спутник в экспедиции и недоступен."
                    : active ? " Перед назначением активный спутник будет автоматически отозван." : ""),
        ));
    const occupiedByOther = !!target && target.workerId > 0 && target.workerId != selectedCompanionId;
    const unassign = !!target && target.workerId == selectedCompanionId;
    if (workforceButton) workforceButton.label.SetText(queuedWorkforceAssignment
        ? L("Dismissing companion...", "Отзываю спутника...")
        : workforceTimedOut ? L("Refresh first", "Сначала обновите")
        : unassign ? L("Remove from work", "Снять с работы")
            : occupiedByOther ? L("Workplace occupied", "Место занято")
                : !companion ? L("Select companion", "Выберите спутника")
                    : inExpedition ? L("Companion on expedition", "Спутник в экспедиции")
                        : !compatible ? L("Profession not suitable", "Профессия не подходит")
                            : active ? L("Dismiss and assign", "Отозвать и назначить")
                                : current ? L("Reassign", "Переназначить") : L("Assign", "Назначить"));
    setActionEnabled(workforceButton, !!target && selectedCompanionId > 0 && pendingWorkforceToken == 0
        && !queuedWorkforceAssignment && !workforceTimedOut && !occupiedByOther
        && (unassign || compatible && !inExpedition));
}

function refreshTabs(): void {
    if (slotsPanel) (activeTab == TAB_SLOTS ? slotsPanel.Show() : slotsPanel.Hide());
    if (libraryPanel) (activeTab == TAB_LIBRARY ? libraryPanel.Show() : libraryPanel.Hide());
    if (basePanel) (activeTab == TAB_BASE ? basePanel.Show() : basePanel.Hide());
    if (helpPanel) (activeTab == TAB_HELP ? helpPanel.Show() : helpPanel.Hide());
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].label.SetTextColor(i == activeTab ? 1 : 0.75, i == activeTab ? 0.82 : 0.75, i == activeTab ? 0 : 0.75);
    }
}

function refresh(): void {
    if (!frame) return;
    refreshCompanions();
    refreshHeader();
    refreshSlots();
    refreshLibrary();
    refreshBase();
    refreshTabs();
    if (messageText) messageText.SetText(message);
}

export function updateCompanionProgressionSummary(next: CompanionState): void {
    summary = next;
    if (summary.selectedProtocolVersion < COMPANION_PROTOCOL_VERSION) {
        detail = undefined;
        detailFeatures = {};
        pendingDetailToken = 0;
        pendingDetailRequestedAt = 0;
        lastStaleDetailFloor = -1;
    }
    const count = summary.companions.length;
    let selectedExists = false;
    for (let i = 0; i < count; i++) {
        if (summary.companions[i].companionId == selectedCompanionId) selectedExists = true;
    }
    if (!selectedExists) {
        selectedCompanionId = summary.activeId > 0 ? summary.activeId
            : count > 0 ? summary.companions[0].companionId : 0;
        detail = undefined;
        detailFeatures = {};
        selectedFeatureId = 0;
        libraryPage = 0;
        pendingDetailToken = 0;
        pendingDetailRequestedAt = 0;
    }
    if (queuedWorkforceAssignment
        && queuedWorkforceAssignment.workerId != selectedCompanionId) {
        queuedWorkforceAssignment = undefined;
    }
    if (queuedWorkforceAssignment
        && !queuedWorkforceAssignment.waitingForState
        && summary.activeId != queuedWorkforceAssignment.workerId) {
        if (GetTime() - queuedWorkforceAssignment.startedAt >= WORKFORCE_TIMEOUT_S) {
            queuedWorkforceAssignment = undefined;
            message = L(
                "Assignment cancelled: the dismissal confirmation arrived too late.",
                "Назначение отменено: подтверждение отзыва пришло слишком поздно.",
            );
        } else {
            queuedWorkforceAssignment.startedAt = GetTime();
            queuedWorkforceAssignment.waitingForState = true;
            if (!requestWorkforce(true)) queuedWorkforceAssignment = undefined;
        }
    }
    if (frame && frame.IsShown() && selectedCompanionId > 0
        && summary.selectedProtocolVersion == COMPANION_PROTOCOL_VERSION
        && pendingDetailToken == 0
        && (!detail || detail.companionId != selectedCompanionId
            || selectedSummary()!.trainingRevision != detail.revision)) {
        requestDetail();
    }
    refresh();
}

export function reportCompanionProgressionError(text: string): void {
    message = text;
    if (pendingDetailToken > 0) {
        pendingDetailToken = 0;
        pendingDetailRequestedAt = 0;
        requestDetail();
    }
    refresh();
}

export function openCompanionProgression(companionId: number = 0): void {
    const panel = ensureFrame();
    if (companionId > 0) selectCompanion(companionId);
    if (!panel.IsShown()) panel.Show();
    refresh();
}

OnCustomPacket(OP_COMPANION_DETAIL, packet => {
    const next = new CompanionDetailState();
    next.read(packet);
    if (pendingDetailToken <= 0
        || next.ackToken != pendingDetailToken
        || next.companionId != selectedCompanionId) return;
    pendingDetailToken = 0;
    pendingDetailRequestedAt = 0;
    if (safeUInt(next.revision) != next.revision) {
        setMessage(L(
            "The server sent an invalid progression revision.",
            "Сервер прислал некорректную ревизию развития.",
        ));
        return;
    }
    const revisionFloor = detailRevisionFloor();
    if (next.revision < revisionFloor) {
        if (lastStaleDetailFloor != revisionFloor) {
            lastStaleDetailFloor = revisionFloor;
            requestDetail();
        } else {
            setMessage(L(
                "Received stale progression state; refresh the list again.",
                "Получено устаревшее состояние развития; обновите список ещё раз.",
            ));
        }
        return;
    }
    if (!sanitizeDetail(next)) {
        setMessage(L(
            "The server sent invalid progression state.",
            "Сервер прислал некорректное состояние развития.",
        ));
        return;
    }
    lastStaleDetailFloor = -1;
    detail = next;
    requestWorkforce(true);
    if (!catalogReady()) {
        setMessage(L(
            `Server catalog version (${next.catalogVersion}) does not match the client (${COMPANION_TRAINING_CATALOG_VERSION}).`,
            `Версия каталога сервера (${next.catalogVersion}) не совпадает с клиентом (${COMPANION_TRAINING_CATALOG_VERSION}).`,
        ));
    } else {
        message = L("Companion progression updated.", "Развитие спутника обновлено.");
    }
    refresh();
});

OnCustomPacket(OP_COMPANION_WORKFORCE_ERROR, packet => {
    const text = packet.ReadString();
    if (!pendingWorkforceAction || !isWorkforceErrorText(text)) return;
    pendingWorkforceError = text;
    message = workforceErrorDisplay(text);
    refresh();
});

OnCustomPacket(OP_COMPANION_WORKFORCE_STATE, packet => {
    const next = new WorkforceStateLocal();
    next.read(packet);
    if (pendingWorkforceToken <= 0 || next.requestToken != pendingWorkforceToken) return;
    if (next.revision < workforce.revision) {
        const revisionFloor = workforce.revision;
        pendingWorkforceToken = 0;
        pendingWorkforceAction = undefined;
        pendingWorkforceError = "";
        workforceRequestedAt = 0;
        if (lastStaleWorkforceFloor != revisionFloor) {
            lastStaleWorkforceFloor = revisionFloor;
            requestWorkforce();
        } else {
            queuedWorkforceAssignment = undefined;
            setMessage(L(
                "Received a stale workplace list; refresh it again.",
                "Получен устаревший список рабочих мест; обновите его ещё раз.",
            ));
        }
        return;
    }
    lastStaleWorkforceFloor = -1;
    const completedAction = pendingWorkforceAction;
    const completedError = pendingWorkforceError;
    workforce = next;
    workforceLoaded = true;
    workforceTimedOut = false;
    workforceRequestedAt = 0;
    pendingWorkforceToken = 0;
    pendingWorkforceAction = undefined;
    pendingWorkforceError = "";
    if (workforceRefreshHandler) workforceRefreshHandler();
    if (completedAction) {
        let assigned = false;
        for (let i = 0; i < next.targets.length; i++) {
            const target = next.targets[i];
            if (completedAction.action == WORKFORCE_ACTION_ASSIGN
                && target.targetKind == completedAction.targetKind
                && target.targetId == completedAction.targetId
                && target.workerId == completedAction.workerId) assigned = true;
            if (completedAction.action == WORKFORCE_ACTION_UNASSIGN
                && target.workerId == completedAction.workerId) assigned = true;
        }
        message = completedError ? workforceErrorDisplay(completedError)
            : completedAction.action == WORKFORCE_ACTION_ASSIGN
                ? assigned
                    ? L("Companion assigned to the base.", "Спутник назначен на базу.")
                    : L("The server did not apply the assignment.", "Назначение не применено сервером.")
                : !assigned
                    ? L("Companion removed from work.", "Спутник снят с работы.")
                    : L("The server did not apply the removal.", "Снятие не применено сервером.");
    } else if (queuedWorkforceAssignment && queuedWorkforceAssignment.waitingForState) {
        const queued = queuedWorkforceAssignment;
        const target = workforceTarget(queued.targetKind, queued.targetId);
        const companion = selectedSummary();
        const expired = GetTime() - queued.startedAt >= WORKFORCE_TIMEOUT_S;
        queuedWorkforceAssignment = undefined;
        if (expired) {
            message = L(
                "Assignment cancelled: the base list arrived too late.",
                "Назначение отменено: список базы пришёл слишком поздно.",
            );
        } else if (target && target.workerId == queued.workerId) {
            message = L(
                "The companion is already assigned to the selected workplace.",
                "Спутник уже назначен на выбранное рабочее место.",
            );
        } else if (!target) {
            message = L(
                "The selected workplace was not found after dismissal. Refresh the list.",
                "После отзыва выбранное рабочее место не найдено. Обновите список.",
            );
        } else if (target.workerId > 0) {
            message = L(
                "The workplace was occupied while the companion was being dismissed.",
                "Пока спутник отзывался, рабочее место заняли.",
            );
        } else if (!companion || companion.companionId != queued.workerId
            || !workforceCompatible(companion.professionId, target)) {
            message = L(
                "The selected companion is incompatible with this workplace.",
                "Выбранный спутник несовместим с этим рабочим местом.",
            );
        } else {
            selectedTargetKey = targetKey(target);
            message = L(
                "Companion dismissed. Assigning it to the base...",
                "Спутник отозван. Назначаю его на базу...",
            );
            sendWorkforceAction(WORKFORCE_ACTION_ASSIGN, target);
            return;
        }
    } else {
        message = next.truncated
            ? L("The workplace list is limited to 256 rows.", "Список рабочих мест ограничен 256 строками.")
            : L("Workplaces updated.", "Рабочие места обновлены.");
    }
    if (!selectedTarget()) selectedTargetKey = "";
    refresh();
});

export function companionWorkforceAssigned(companionId: number): boolean {
    for (let i = 0; i < workforce.targets.length; i++) {
        if (workforce.targets[i].workerId == companionId) return true;
    }
    return false;
}

export function requestCompanionWorkforceState(): void {
    requestWorkforce(true);
}

export function setCompanionWorkforceRefreshHandler(handler: () => void): void {
    workforceRefreshHandler = handler;
}

(_G as any).SLASH_COMPANIONPROGRESSION1 = "/companionprogress";
(_G as any).SLASH_COMPANIONPROGRESSION2 = "/спутникразвитие";
SlashCmdList.COMPANIONPROGRESSION = () => openCompanionProgression(selectedCompanionId);
