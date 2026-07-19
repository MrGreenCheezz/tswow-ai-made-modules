/**
 * Base-building — клиентское меню строительства в стиле tswow-store.
 *
 * /base (или /база), кнопка на миникарте. Слева категории построек, справа
 * карточки с иконкой, материалами и кнопкой «Чертёж» (сервер кладёт одноразовый
 * инструмент в сумку). Категория «Управление» — постраничный список всех объектов на текущей карте,
 * правка X/Y/Z, поворот и снос.
 * Категория «Все объекты» — полный каталог строительной части большого патча с 3D-preview.
 * Категория «Хранилище» и клик по GO станции открывают окно склада
 * (депозит/выдача, переработка руды и трав со временем).
 */

import {
    BUILDINGS, Building, buildingByKey, FLAG_TOOLTIP_NAME, HORDE_FLAG_TOOLTIP_NAME,
    STORAGE_KEY, SMELTER_KEY, LAB_KEY, COOKING_KEY,
    LEATHERWORKING_KEY, LOOM_KEY, INSCRIPTION_KEY,
    STONECUTTING_KEY, ENGINEERING_KEY, BUTCHER_KEY,
    LEATHER_ARMOR_KEY, PLATE_ARMOR_KEY, CLOTH_ARMOR_KEY,
    WEAPON_FORGE_KEY, JEWELRY_KEY, ORDERS_BOARD_KEY,
    SERVICE_EXPANSION_KEYS, DEFENSE_EXPANSION_KEYS,
    STATION_MAX_LEVEL, recipesFor, stationUpgradeMaterialCost,
    BuildingMaterial, DECORATION_MATERIAL_COST, buildingMaterialCost, materialCostText,
    setBuildingWoodItems,
} from "../shared/BaseCatalog";
import * as ResourceGenerators from "../shared/ResourceGenerators";
import {
    BaseState, StateRequest, ToolRequestMsg, FLAG_TOOL_KEY, RotateMsg, RemoveMsg, ClearBaseMsg, ErrorMsg,
    SelectMsg, ManageEntry, ManageState, MoveMsg, MOVE_AXIS_X, MOVE_AXIS_Y, MOVE_AXIS_Z,
    TooltipRequest, TooltipOwnerMsg, OP_BASE_STATE, OP_BASE_ERROR, OP_BASE_TOOLTIP, OP_BASE_MANAGE_STATE,
    OP_STORE_STATE, OP_STORE_DEPOSIT, OP_STORE_WITHDRAW,
    STORAGE_BUCKET_INPUT, STORAGE_BUCKET_OUTPUT,
    StorageState, StorageEntry, StorageRequest, StorageMoveMsg, StorageUpgradeMsg,
} from "../shared/BaseMessages";
import {
    createStoreWindow, createSidebar, createCardGrid, createActionButton,
    createNavArrows, createSidePanel, createListRow, StoreCard, ListRow,
    STORE_FONT, TEX_MAIN,
} from "./StoreStyle";
import { BUILDING_MODELS } from "./BuildingModels";
import * as PatchCatalog from "./PatchBuildingCatalog";
import * as WorkforceUI from "./workforce-ui";
import { localizedWireText, uiText } from "./locale";

const ROWS_PER_PANEL = 8;
const PATCH_DEFAULT_SCALE = 1;
const PATCH_DEFAULT_ROTATION = 0.61;
const PATCH_MIN_SCALE = 0.01;
const PATCH_MAX_SCALE = 10;
const PATCH_SCALE_STEP = 0.08;
const PATCH_SCALE_FINE_STEP = 0.02;
const PATCH_PAN_SENSITIVITY = 0.002;

/* ------------------------------- категории --------------------------------- */
interface Category {
    name: string;
    icon: string;
    keys: number[]; // ключи каталога; пусто для спец-панелей
    special?: "manage" | "storage" | "patch";
}

const CATEGORIES: Category[] = [
    { name: uiText("Management", "Управление"), icon: "Interface\\Icons\\INV_Misc_Gear_01", keys: [], special: "manage" },
    { name: uiText("All Objects", "Все объекты"), icon: "Interface\\Icons\\INV_Misc_Map_01", keys: [], special: "patch" },
    { name: uiText("Defense", "Оборона"), icon: "Interface\\Icons\\Ability_Defend", keys: [78, 79, 80, 81, ...DEFENSE_EXPANSION_KEYS] },
    { name: uiText("Hearth and Craft", "Очаг и ремесло"), icon: "Interface\\Icons\\Trade_BlackSmithing", keys: [6, 7, 8, 9] },
    { name: uiText("Services", "Службы"), icon: "Interface\\Icons\\INV_Misc_Note_01", keys: [
        57, 58, 59, 60, 61, 62, 63, 64, 91, 92, ORDERS_BOARD_KEY,
        ...SERVICE_EXPANSION_KEYS,
    ] },
    { name: uiText("Trainers", "Учителя"), icon: "Interface\\Icons\\INV_Misc_Book_09", keys: [65, 66, 67, 68, 69, 70, 71, 72, 73, 74] },
    { name: uiText("Production", "Производство"), icon: "Interface\\Icons\\Trade_Mining", keys: [
        12, 82, 83, 84, 85, 86, 87, 88, 89, 90,
        LEATHER_ARMOR_KEY, PLATE_ARMOR_KEY, CLOTH_ARMOR_KEY, WEAPON_FORGE_KEY, JEWELRY_KEY,
    ] },
    { name: uiText("Ore and Stone", "Руда и камень"), icon: "Interface\\Icons\\Trade_Mining", keys: ResourceGenerators.RESOURCE_GENERATORS
        .filter(def => def.category == "ore" || def.category == "stone").map(def => def.key) },
    { name: uiText("Herbs and Wood", "Травы и лес"), icon: "Interface\\Icons\\Trade_Herbalism", keys: ResourceGenerators.RESOURCE_GENERATORS
        .filter(def => def.category == "herb" || def.category == "wood").map(def => def.key) },
    { name: uiText("Fishing", "Рыбалка"), icon: "Interface\\Icons\\Trade_Fishing", keys: ResourceGenerators.RESOURCE_GENERATORS
        .filter(def => def.category == "fish" || def.category == "junk").map(def => def.key) },
    { name: uiText("Storage", "Хранилище"), icon: "Interface\\Icons\\INV_Crate_01", keys: [], special: "storage" },
];

const KEY_ICONS: { [key: number]: string } = {
    6: "Interface\\Icons\\Spell_Fire_Fire",
    7: "Interface\\Icons\\Spell_Fire_Fire",
    8: "Interface\\Icons\\Trade_BlackSmithing",
    9: "Interface\\Icons\\Trade_BlackSmithing",
    12: "Interface\\Icons\\INV_Misc_Food_15",
    57: "Interface\\Icons\\INV_Letter_15",
    58: "Interface\\Icons\\Spell_Arcane_TeleportOrgrimmar",
    59: "Interface\\Icons\\INV_Box_02",
    60: "Interface\\Icons\\INV_Drink_07",
    61: "Interface\\Icons\\INV_Misc_Food_15",
    62: "Interface\\Icons\\INV_Misc_Coin_02",
    63: "Interface\\Icons\\INV_Drink_05",
    64: "Interface\\Icons\\Ability_Repair",
    75: "Interface\\Icons\\Trade_Mining",
    76: "Interface\\Icons\\Trade_Herbalism",
    78: "Interface\\Icons\\Ability_Warrior_DefensiveStance",
    79: "Interface\\Icons\\Ability_Warrior_DefensiveStance",
    80: "Interface\\Icons\\INV_BannerPVP_02",
    81: "Interface\\Icons\\Spell_Holy_Heal",
    82: "Interface\\Icons\\INV_Crate_01",
    83: "Interface\\Icons\\INV_Ingot_02",
    84: "Interface\\Icons\\Trade_Alchemy",
    85: "Interface\\Icons\\Trade_LeatherWorking",
    86: "Interface\\Icons\\Trade_Tailoring",
    87: "Interface\\Icons\\INV_Inscription_Tradeskill01",
    88: "Interface\\Icons\\INV_Stone_SharpeningStone_05",
    89: "Interface\\Icons\\Trade_Engineering",
    90: "Interface\\Icons\\INV_Misc_Food_15",
    91: "Interface\\Icons\\Ability_Warrior_OffensiveStance",
    92: "Interface\\Icons\\Spell_Holy_Heal",
    93: "Interface\\Icons\\Trade_LeatherWorking",
    94: "Interface\\Icons\\INV_Chest_Plate04",
    95: "Interface\\Icons\\Trade_Tailoring",
    96: "Interface\\Icons\\Trade_BlackSmithing",
    97: "Interface\\Icons\\INV_Misc_Gem_01",
    99: "Interface\\Icons\\INV_Misc_Note_01",
    100: "Interface\\Icons\\Spell_Holy_Heal",
    101: "Interface\\Icons\\Spell_Holy_DispelMagic",
    102: "Interface\\Icons\\Ability_Repair",
    103: "Interface\\Icons\\Spell_Arcane_TeleportStormWind",
    104: "Interface\\Icons\\Ability_Warrior_BattleShout",
    105: "Interface\\Icons\\INV_Misc_Map_01",
    106: "Interface\\Icons\\Ability_Warrior_DefensiveStance",
    107: "Interface\\Icons\\Spell_Fire_FireBolt02",
    108: "Interface\\Icons\\INV_Weapon_Crossbow_01",
    109: "Interface\\Icons\\Spell_Frost_FrostNova",
    110: "Interface\\Icons\\Spell_Holy_DevotionAura",
    111: "Interface\\Icons\\INV_Misc_Bell_01",
    112: "Interface\\Icons\\INV_Enchant_AbyssCrystal",
};

function buildingIcon(key: number, catIcon: string): string {
    const generator = ResourceGenerators.resourceGeneratorByKey(key);
    if (generator) {
        if (generator.category == "ore" || generator.category == "stone") return "Interface\\Icons\\Trade_Mining";
        if (generator.category == "herb") return "Interface\\Icons\\Trade_Herbalism";
        if (generator.category == "wood") return "Interface\\Icons\\INV_Axe_01";
        return "Interface\\Icons\\Trade_Fishing";
    }
    return KEY_ICONS[key] || catIcon;
}

function materialOwned(material: BuildingMaterial): number {
    let count = 0;
    for (let i = 0; i < material.entries.length; i++) {
        count += GetItemCount(material.entries[i]);
    }
    return count;
}

function materialCostStatus(cost: BuildingMaterial[]): string {
    let text = "";
    for (let i = 0; i < cost.length; i++) {
        const owned = materialOwned(cost[i]);
        const color = owned >= cost[i].count ? "|cff40ff40" : "|cffff6060";
        if (i > 0) text += "\n";
        text += `${color}${uiText(cost[i].nameEn, cost[i].name)}: ${owned}/${cost[i].count}|r`;
    }
    return text;
}

function addMaterialCostTooltip(cost: BuildingMaterial[]): void {
    GameTooltip.AddLine(uiText("Materials:", "Материалы:"), 1, 0.82, 0);
    for (let i = 0; i < cost.length; i++) {
        const owned = materialOwned(cost[i]);
        const ready = owned >= cost[i].count;
        GameTooltip.AddLine(
            `${uiText(cost[i].nameEn, cost[i].name)}: ${owned}/${cost[i].count}`,
            ready ? 0.3 : 1,
            ready ? 1 : 0.25,
            ready ? 0.3 : 0.25,
        );
    }
}

/* --------------------------------- стейт ----------------------------------- */
let st = new BaseState();
let activeCat = 0;
let activePage = 0;
let lastMessage = uiText(
    "Place your base flag, then build near it.",
    "Поставьте флаг базы, затем стройте рядом с ним.",
);
let frame: WoWAPI.Frame | undefined;
let cards: StoreCard[] = [];
let cardModels: WoWAPI.PlayerModel[] = [];
let cardModelKeys: number[] = [];
let sidebar: ReturnType<typeof createSidebar> | undefined;
let pageText: WoWAPI.FontString | undefined;
let statusText: WoWAPI.FontString | undefined;
let messageText: WoWAPI.FontString | undefined;
let managePanel: WoWAPI.Frame | undefined;
let manageSt = new ManageState(0, 0, []);
let manageRows: ListRow[] = [];
const MANAGE_PAGE_SIZE = 5;
let managePage = 0;
let managePageText: WoWAPI.FontString | undefined;
let manageStepInput: WoWAPI.EditBox | undefined;
let manageSelectedText: WoWAPI.FontString | undefined;
let storagePanel: WoWAPI.Frame | undefined;
let patchPanel: WoWAPI.Frame | undefined;
let flagTooltipPending = false;

let patchRows: ListRow[] = [];
let patchRowRecords: number[] = [];
let patchMatches: number[] | undefined;
let patchPage = 0;
let patchSelected = -1;
let patchPageText: WoWAPI.FontString | undefined;
let patchModel: WoWAPI.PlayerModel | undefined;
let patchPreviewTitle: WoWAPI.FontString | undefined;
let patchPreviewInfo: WoWAPI.FontString | undefined;
let patchPreviewMessage: WoWAPI.FontString | undefined;
let patchModelRotation = PATCH_DEFAULT_ROTATION;
let patchModelScale = PATCH_DEFAULT_SCALE;

function patchEntry(record: number): number {
    return PatchCatalog.PATCH_BUILDINGS[record * PatchCatalog.PATCH_BUILDING_STRIDE] as number;
}

function patchName(record: number): string {
    return PatchCatalog.PATCH_BUILDINGS[record * PatchCatalog.PATCH_BUILDING_STRIDE + 1] as string;
}

function patchPath(record: number): string {
    return PatchCatalog.PATCH_BUILDINGS[record * PatchCatalog.PATCH_BUILDING_STRIDE + 2] as string;
}

function patchResultCount(): number {
    return patchMatches ? patchMatches.length : PatchCatalog.PATCH_BUILDING_COUNT;
}

function patchRecordAt(index: number): number {
    return patchMatches ? patchMatches[index] : index;
}

function clearPatchPreview(): void {
    patchSelected = -1;
    if (patchModel) {
        patchModel.SetScript("OnUpdate", null);
        patchModel.ClearModel();
        patchModel.Hide();
    }
    if (patchPreviewTitle) patchPreviewTitle.SetText(uiText("Select an object", "Выберите объект"));
    if (patchPreviewInfo) patchPreviewInfo.SetText("");
    if (patchPreviewMessage) {
        patchPreviewMessage.SetText(uiText("Select an object from the list on the left.", "Выберите объект в списке слева."));
        patchPreviewMessage.Show();
    }
}

function selectPatchRecord(record: number): void {
    if (!patchModel || !patchPreviewTitle || !patchPreviewInfo || !patchPreviewMessage) return;
    patchSelected = record;
    const entry = patchEntry(record);
    const name = patchName(record);
    const modelPath = patchPath(record);
    const marker = name.indexOf(" [PATCH");

    patchPreviewTitle.SetText(marker >= 0 ? name.substring(0, marker) : name);
    patchPreviewInfo.SetText(
        `entry ${entry}\n${modelPath}\n${uiText("Cost", "Стоимость")}: ${materialCostText(DECORATION_MATERIAL_COST, GetLocale() == "ruRU")}`,
    );
    patchModel.SetScript("OnUpdate", null);
    patchModel.ClearModel();

    patchModelRotation = PATCH_DEFAULT_ROTATION;
    patchModelScale = PATCH_DEFAULT_SCALE;
    patchModel.SetModel(modelPath);
    patchModel.SetPosition(0, 0, 0);
    patchModel.SetFacing(patchModelRotation);
    patchModel.SetModelScale(patchModelScale);
    patchPreviewMessage.Hide();
    patchModel.Show();
    refreshPatchBrowser();
}

function applyPatchFilter(query: string): void {
    const needle = query.trim().toLowerCase();
    patchMatches = undefined;
    if (needle != "") {
        const matches: number[] = [];
        for (let record = 0; record < PatchCatalog.PATCH_BUILDING_COUNT; record++) {
            if (
                `${patchEntry(record)}`.indexOf(needle) >= 0 ||
                patchName(record).toLowerCase().indexOf(needle) >= 0 ||
                patchPath(record).toLowerCase().indexOf(needle) >= 0
            ) {
                matches.push(record);
            }
        }
        patchMatches = matches;
    }
    patchPage = 0;
    clearPatchPreview();
    refreshPatchBrowser();
}

function refreshPatchBrowser(): void {
    const rowsPerPage = 10;
    const total = patchResultCount();
    const pages = Math.max(1, Math.ceil(total / rowsPerPage));
    patchPage = Math.max(0, Math.min(patchPage, pages - 1));

    for (let i = 0; i < patchRows.length; i++) {
        const resultIndex = patchPage * rowsPerPage + i;
        const row = patchRows[i];
        row.button.UnlockHighlight();
        if (resultIndex >= total) {
            row.button.Hide();
        } else {
            const record = patchRecordAt(resultIndex);
            const name = patchName(record);
            const marker = name.indexOf(" [PATCH");
            patchRowRecords[i] = record;
            row.label.SetText(marker >= 0 ? name.substring(0, marker) : name);
            row.count.SetText(`${patchEntry(record)}`);
            row.icon.SetTexture("Interface\\Icons\\INV_Misc_Gear_01");
            row.button.Show();
            if (record == patchSelected) row.button.LockHighlight();
        }
    }

    if (patchPageText) {
        patchPageText.SetText(total == 0
            ? uiText("0/0 — nothing found", "0/0 — ничего не найдено")
            : `${patchPage + 1}/${pages} — ${total}`);
    }
}

function setupPatchModelControls(model: WoWAPI.PlayerModel): void {
    model.EnableMouse(true);
    model.EnableMouseWheel(true);

    model.SetScript("OnMouseDown", (_self, button) => {
        const start = GetCursorPosition();
        if (button == "LeftButton") {
            model.SetScript("OnUpdate", () => {
                const cursor = GetCursorPosition();
                patchModelRotation += (cursor[0] - start[0]) / 100;
                model.SetFacing(patchModelRotation);
                start[0] = cursor[0];
            });
        } else if (button == "RightButton") {
            const camera = model.GetPosition();
            model.SetScript("OnUpdate", () => {
                const cursor = GetCursorPosition();
                const effectiveScale = model.GetEffectiveScale();
                const dx = (cursor[0] - start[0]) / effectiveScale;
                const dy = (cursor[1] - start[1]) / effectiveScale;
                const sensitivity = PATCH_PAN_SENSITIVITY / Math.max(patchModelScale, 0.1);
                model.SetPosition(
                    camera[0],
                    camera[1] + dx * sensitivity,
                    camera[2] + dy * sensitivity,
                );
            });
        } else if (button == "MiddleButton") {
            const camera = model.GetPosition();
            model.SetScript("OnUpdate", () => {
                const cursor = GetCursorPosition();
                const dx = (cursor[0] - start[0]) / model.GetEffectiveScale();
                const sensitivity = PATCH_PAN_SENSITIVITY / Math.max(patchModelScale, 0.1);
                model.SetPosition(camera[0] - dx * sensitivity, camera[1], camera[2]);
            });
        }
    });
    model.SetScript("OnMouseUp", () => model.SetScript("OnUpdate", null));
    model.SetScript("OnHide", () => model.SetScript("OnUpdate", null));
    model.SetScript("OnMouseWheel", (_self, delta) => {
        const step = IsShiftKeyDown() ? PATCH_SCALE_FINE_STEP : PATCH_SCALE_STEP;
        patchModelScale = Math.max(
            PATCH_MIN_SCALE,
            Math.min(PATCH_MAX_SCALE, patchModelScale + delta * step),
        );
        model.SetModelScale(patchModelScale);
    });
}

function setCardPreview(index: number, building: Building): boolean {
    const preview = cardModels[index];
    if (!preview) return false;

    if (building.kind == "npc") {
        preview.Hide();
        return false;
    }
    const model = BUILDING_MODELS[building.key];
    if (!model) {
        preview.Hide();
        return false;
    }
    // 3.3.5: не трогаем уже видимую модель и не вызываем ClearModel перед заменой.
    if (cardModelKeys[index] == building.key && preview.IsShown()) return true;

    preview.Hide();
    preview.SetPosition(0, 0, 0);
    preview.SetModel(model.path);
    preview.SetPosition(0, 0, 0);
    preview.SetFacing(0.5);
    preview.SetModelScale(model.scale);
    preview.Show();
    cardModelKeys[index] = building.key;
    return true;
}

function setMessage(message: string, chat: boolean = false): void {
    lastMessage = message;
    refresh();
    if (chat) print(`|cff40a0ff${uiText("Construction", "Строительство")}:|r ${message}`);
}

function sendPacket(packet: TSPacketWrite, pendingMessage: string): void {
    if (!(_G as any)._CLIENT_NETWORK) {
        setMessage(uiText(
            "The TSWoW client transport is not loaded. Fully restart the client through TSWoW.",
            "Клиентский транспорт TSWoW не загружен. Полностью перезапустите клиент через TSWoW.",
        ), true);
        return;
    }
    setMessage(pendingMessage);
    packet.Send();
}

function categoryBuildings(cat: Category): Building[] {
    const out: Building[] = [];
    for (let i = 0; i < cat.keys.length; i++) {
        const b = buildingByKey(cat.keys[i]);
        if (b) out.push(b);
    }
    return out;
}

function maxPage(): number {
    const cardsPerPage = 8;
    const list = categoryBuildings(CATEGORIES[activeCat]);
    return Math.max(0, Math.floor((list.length - 1) / cardsPerPage));
}

/* ------------------------------ главное окно ------------------------------- */
function ensureFrame(): WoWAPI.Frame {
    if (frame) return frame;
    const cardsPerPage = 8;

    frame = createStoreWindow("BaseBuildingFrame", uiText("Base Construction", "Строительство базы"));

    sidebar = createSidebar(frame, CATEGORIES.map(c => ({ name: c.name, icon: c.icon })), (i) => {
        activeCat = i;
        activePage = 0;
        refresh();
        if (CATEGORIES[i].special == "manage") requestManageState();
    });

    cards = createCardGrid(frame, (i) => {
        const list = categoryBuildings(CATEGORIES[activeCat]);
        const b = list[activePage * cardsPerPage + i];
        if (!b || !frame) return;
        GameTooltip.SetOwner(frame, "ANCHOR_CURSOR");
        GameTooltip.SetText(uiText(b.nameEn || b.name, b.name));
        const hint = uiText(b.hintEn || b.hint || "", b.hint || "");
        if (hint != "") GameTooltip.AddLine(hint, 0.8, 0.8, 0.8, true);
        addMaterialCostTooltip(buildingMaterialCost(b.key));
        GameTooltip.Show();
    }, () => GameTooltip.Hide());

    for (let i = 0; i < cards.length; i++) {
        const index = i;
        cards[i].action.label.ClearAllPoints();
        cards[i].action.label.SetPoint("CENTER");
        const preview = CreateFrame("PlayerModel", "", cards[i].frame);
        const previewSize = cards[i].frame.GetWidth() * 0.65;
        preview.SetSize(previewSize, previewSize);
        preview.SetPoint("TOP", cards[i].frame, "TOP", 0, -cards[i].frame.GetHeight() * 0.04);
        preview.SetFrameLevel(cards[i].frame.GetFrameLevel() + 2);
        preview.EnableMouse(false);
        preview.Hide();
        cardModels.push(preview);

        cards[i].action.button.SetScript("OnClick", () => {
            const list = categoryBuildings(CATEGORIES[activeCat]);
            const b = list[activePage * cardsPerPage + index];
            if (!b) return;
            if (CATEGORIES[activeCat].special == "storage") return;
            sendPacket(
                new ToolRequestMsg(b.key).write(),
                uiText(
                    `Blueprint request for “${b.nameEn || b.name}” sent...`,
                    `Запрос чертежа «${b.name}» отправлен...`,
                ),
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

    // статус (золото/флаг/лимит) — верх контентной зоны
    statusText = frame.CreateFontString(null, "OVERLAY", "GameFontNormal");
    statusText.SetFont(STORE_FONT, 12, "OUTLINE");
    statusText.SetPoint("TOPLEFT", frame, "TOPLEFT", frame.GetWidth() * 0.26, -44);
    statusText.SetJustifyH("LEFT");

    // сообщение сервера — низ окна
    messageText = frame.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    messageText.SetFont(STORE_FONT, 10, "OUTLINE");
    messageText.SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", frame.GetWidth() * 0.26, 14);
    messageText.SetWidth(frame.GetWidth() * 0.66);
    messageText.SetJustifyH("LEFT");

    buildManagePanel(frame);
    buildStorageCategoryPanel(frame);
    buildPatchBrowserPanel(frame);

    frame.SetScript("OnShow", () => {
        PlaySound("igMainMenuOpen");
        sendPacket(new StateRequest().write(), uiText("Requesting base status...", "Запрашиваю состояние базы..."));
        if (CATEGORIES[activeCat].special == "manage") requestManageState();
    });
    frame.HookScript("OnHide", () => clearManageSelection());

    if (sidebar) sidebar.setActive(0);
    return frame;
}

/* ------------------------- каталог большого патча ------------------------- */
function buildPatchBrowserPanel(parent: WoWAPI.Frame): void {
    const rowsPerPage = 10;
    const panel = CreateFrame("Frame", "", parent);
    panel.SetSize(parent.GetWidth() * 0.66, parent.GetHeight() * 0.72);
    panel.SetPoint("TOPLEFT", parent.GetWidth() * 0.28, -80);

    const gap = 10;
    const listWidth = panel.GetWidth() * 0.43;
    const previewWidth = panel.GetWidth() - listWidth - gap;
    const list = createSidePanel(panel, listWidth, panel.GetHeight(), uiText("Patch Objects", "Объекты патча"));
    list.SetPoint("TOPLEFT");
    const preview = createSidePanel(panel, previewWidth, panel.GetHeight(), uiText("Preview", "Предпросмотр"));
    preview.SetPoint("TOPRIGHT");

    const searchLabel = list.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    searchLabel.SetFont(STORE_FONT, 10, "OUTLINE");
    searchLabel.SetPoint("TOPLEFT", 12, -34);
    searchLabel.SetText(uiText("Search by name, path, or entry (Enter)", "Поиск по имени, пути или entry (Enter)"));

    const search = CreateFrame("EditBox", "BaseBuildingPatchSearch", list, "InputBoxTemplate");
    search.SetSize(list.GetWidth() - 24, 22);
    search.SetPoint("TOPLEFT", 12, -49);
    search.SetAutoFocus(false);
    search.SetMaxLetters(80);
    search.SetScript("OnEnterPressed", self => {
        applyPatchFilter(self.GetText());
        self.ClearFocus();
    });
    search.SetScript("OnEscapePressed", self => self.ClearFocus());

    const rowHeight = Math.max(24, Math.min(34, Math.floor((list.GetHeight() - 145) / rowsPerPage)));
    for (let i = 0; i < rowsPerPage; i++) {
        const index = i;
        const row = createListRow(list, list.GetWidth() - 16, rowHeight);
        row.button.SetPoint("TOPLEFT", 8, -78 - i * (rowHeight + 2));
        row.button.SetScript("OnClick", () => {
            const record = patchRowRecords[index];
            if (record !== undefined) selectPatchRecord(record);
        });
        patchRows.push(row);
    }

    patchPageText = createNavArrows(list, () => {
        if (patchPage > 0) patchPage--;
        refreshPatchBrowser();
    }, () => {
        const pages = Math.max(1, Math.ceil(patchResultCount() / rowsPerPage));
        if (patchPage < pages - 1) patchPage++;
        refreshPatchBrowser();
    });
    list.EnableMouseWheel(true);
    list.SetScript("OnMouseWheel", (_self, delta) => {
        const pages = Math.max(1, Math.ceil(patchResultCount() / rowsPerPage));
        patchPage = Math.max(0, Math.min(pages - 1, patchPage - delta));
        refreshPatchBrowser();
    });

    patchPreviewTitle = preview.CreateFontString(null, "OVERLAY", "GameFontNormal");
    patchPreviewTitle.SetFont(STORE_FONT, 12, "OUTLINE");
    patchPreviewTitle.SetPoint("TOP", 0, -34);
    patchPreviewTitle.SetWidth(preview.GetWidth() - 20);
    patchPreviewTitle.SetText(uiText("Select an object", "Выберите объект"));

    patchModel = CreateFrame("PlayerModel", "", preview);
    patchModel.SetSize(preview.GetWidth() - 20, preview.GetHeight() - 135);
    patchModel.SetPoint("TOP", 0, -55);
    patchModel.SetFrameLevel(preview.GetFrameLevel() + 2);
    setupPatchModelControls(patchModel);
    patchModel.Hide();

    patchPreviewMessage = preview.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    patchPreviewMessage.SetFont(STORE_FONT, 11, "OUTLINE");
    patchPreviewMessage.SetPoint("CENTER", 0, 15);
    patchPreviewMessage.SetWidth(preview.GetWidth() - 40);
    patchPreviewMessage.SetJustifyH("CENTER");
    patchPreviewMessage.SetText(uiText("Select an object from the list on the left.", "Выберите объект в списке слева."));

    patchPreviewInfo = preview.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    patchPreviewInfo.SetFont(STORE_FONT, 9, "OUTLINE");
    patchPreviewInfo.SetPoint("BOTTOM", 0, 64);
    patchPreviewInfo.SetWidth(preview.GetWidth() - 24);
    patchPreviewInfo.SetJustifyH("LEFT");

    const controls = preview.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    controls.SetFont(STORE_FONT, 10, "OUTLINE");
    controls.SetPoint("BOTTOM", 0, 43);
    controls.SetText(uiText(
        "LMB: rotate   RMB: pan   MMB: depth   wheel: scale",
        "ЛКМ: поворот   ПКМ: сдвиг   СКМ: глубина   колесо: масштаб",
    ));

    const buy = createActionButton(
        preview,
        preview.GetWidth() - 36,
        26,
        uiText("Get Placement Tool", "Получить установку"),
    );
    buy.button.SetPoint("BOTTOM", 0, 8);
    buy.button.SetScript("OnClick", () => {
        if (patchSelected < 0) {
            setMessage(uiText("Select an object from the list first.", "Сначала выберите объект в списке."));
            return;
        }
        const entry = patchEntry(patchSelected);
        const name = patchName(patchSelected);
        sendPacket(
            new ToolRequestMsg(entry).write(),
            uiText(`Getting placement tool “${name}”...`, `Получение установки «${name}»...`),
        );
    });

    refreshPatchBrowser();
    panel.Hide();
    patchPanel = panel;
}

/* --------------------------- панель «Управление» --------------------------- */
function manageButton(parent: WoWAPI.Frame, text: string, x: number, y: number, width: number, onClick: () => void): void {
    const btn = createActionButton(parent, width, 26, text);
    btn.button.SetPoint("TOPLEFT", x, y);
    btn.button.SetScript("OnClick", onClick);
}

function managedName(item: ManageEntry): string {
    const building = buildingByKey(item.catKey);
    if (building) return uiText(building.nameEn || building.name, building.name);
    for (let record = 0; record < PatchCatalog.PATCH_BUILDING_COUNT; record++) {
        if (patchEntry(record) == item.entry) {
            const name = patchName(record);
            const marker = name.indexOf(" [PATCH");
            return marker >= 0 ? name.substring(0, marker) : name;
        }
    }
    return uiText("Object", "Объект");
}

function selectedManageIndex(): number {
    for (let i = 0; i < manageSt.items.length; i++) {
        const item = manageSt.items[i];
        if (item.spawnGuid == manageSt.selectedGuid && item.entry == manageSt.selectedEntry) return i;
    }
    return -1;
}

function refreshManagePanel(): void {
    const pageCount = Math.max(1, Math.ceil(manageSt.items.length / MANAGE_PAGE_SIZE));
    managePage = Math.max(0, Math.min(managePage, pageCount - 1));
    const pageStart = managePage * MANAGE_PAGE_SIZE;
    for (let i = 0; i < manageRows.length; i++) {
        const row = manageRows[i];
        const item = manageSt.items[pageStart + i];
        if (!item) {
            row.button.UnlockHighlight();
            row.button.Hide();
        } else {
            const selected = item.spawnGuid == manageSt.selectedGuid && item.entry == manageSt.selectedEntry;
            if (selected) row.button.LockHighlight();
            else row.button.UnlockHighlight();
            row.button.Show();
            row.icon.SetTexture(buildingIcon(item.catKey, "Interface\\Icons\\INV_Misc_Gear_01"));
            row.label.SetText(`${selected ? "▶ " : ""}#${pageStart + i + 1} ${managedName(item)}`);
            row.count.SetText(`${item.entry} • ${Math.floor(item.distance * 10 + 0.5) / 10} ${uiText("yd", "ярд.")}`);
        }
    }

    if (managePageText) managePageText.SetText(
        `${managePage + 1}/${pageCount} • ${uiText("total", "всего")} ${manageSt.items.length}`,
    );

    if (!manageSelectedText) return;
    const index = selectedManageIndex();
    if (index >= 0) manageSelectedText.SetText(
        `|cffffd060${uiText("Selected", "Выбран")} #${index + 1}|r • entry ${manageSt.selectedEntry}`,
    );
    else manageSelectedText.SetText(uiText("|cffb0b0b0No object selected|r", "|cffb0b0b0Объект не выбран|r"));
}

function requestManageState(): void {
    managePage = 0;
    manageSt = new ManageState(0, 0, []);
    refreshManagePanel();
    sendPacket(new SelectMsg(0, 0).write(), uiText(
        "Loading your objects on the current map...",
        "Загружаю ваши объекты на текущей карте...",
    ));
}

function clearManageSelection(): void {
    manageSt = new ManageState(0, 0, []);
    refreshManagePanel();
    if ((_G as any)._CLIENT_NETWORK) new SelectMsg(0, 0).write().Send();
}

function requireManageSelection(): boolean {
    if (manageSt.selectedGuid != 0 && manageSt.selectedEntry != 0) return true;
    setMessage(uiText("Select an object from the list first.", "Сначала выберите объект в списке."));
    return false;
}

function moveManaged(axis: number, dir: number): void {
    if (!requireManageSelection()) return;
    const step = manageStepInput ? manageStepInput.GetNumber() : 0.25;
    if (!(step > 0)) {
        setMessage(uiText("The step must be greater than zero.", "Шаг должен быть больше нуля."));
        return;
    }
    sendPacket(new MoveMsg(axis, dir, step).write(), uiText(
        `Moving the selected object by ${step} yards...`,
        `Сдвигаю выбранный объект на ${step} ярда...`,
    ));
}

function repeatManageSelection(): void {
    const selected = manageSt.selectedGuid != 0 && manageSt.selectedEntry != 0;
    sendPacket(
        new SelectMsg(selected ? manageSt.selectedGuid : 0, selected ? manageSt.selectedEntry : 0).write(),
        selected
            ? uiText("Showing the selected object again...", "Повторно показываю выбранный объект...")
            : uiText("Refreshing the object list on the current map...", "Обновляю список объектов на текущей карте..."),
    );
}

function buildManagePanel(parent: WoWAPI.Frame): void {
    const upgradeCatKey = 77;
    const panel = CreateFrame("Frame", "", parent);
    panel.SetSize(parent.GetWidth() * 0.66, parent.GetHeight() * 0.72);
    panel.SetPoint("TOPLEFT", parent.GetWidth() * 0.28, -80);

    const gap = 10;
    const listWidth = panel.GetWidth() * 0.52;
    const list = createSidePanel(panel, listWidth, panel.GetHeight(), uiText("Base Objects", "Объекты базы"));
    list.SetPoint("TOPLEFT");
    const editor = createSidePanel(panel, panel.GetWidth() - listWidth - gap, panel.GetHeight(), uiText("Object Position", "Положение объекта"));
    editor.SetPoint("TOPRIGHT");

    for (let i = 0; i < MANAGE_PAGE_SIZE; i++) {
        const index = i;
        const row = createListRow(list, list.GetWidth() - 16, 34);
        row.button.SetPoint("TOPLEFT", 8, -38 - i * 37);
        row.label.SetWidth(Math.max(60, list.GetWidth() - 190));
        row.button.SetScript("OnClick", () => {
            const globalIndex = managePage * MANAGE_PAGE_SIZE + index;
            const item = manageSt.items[globalIndex];
            if (!item) return;
            sendPacket(new SelectMsg(item.spawnGuid, item.entry).write(), uiText(
                `Selecting object #${globalIndex + 1}...`,
                `Выбираю объект #${globalIndex + 1}...`,
            ));
        });
        manageRows.push(row);
    }

    manageButton(list, "◀", 8, -230, 40, () => {
        if (managePage > 0) {
            managePage--;
            refreshManagePanel();
        }
    });
    manageButton(list, "▶", list.GetWidth() - 48, -230, 40, () => {
        if ((managePage + 1) * MANAGE_PAGE_SIZE < manageSt.items.length) {
            managePage++;
            refreshManagePanel();
        }
    });
    managePageText = list.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    managePageText.SetFont(STORE_FONT, 9, "OUTLINE");
    managePageText.SetPoint("TOP", 0, -237);

    const listHint = list.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    listHint.SetFont(STORE_FONT, 9, "OUTLINE");
    listHint.SetPoint("TOPLEFT", 12, -264);
    listHint.SetWidth(list.GetWidth() - 24);
    listHint.SetJustifyH("LEFT");
    listHint.SetText(uiText(
        "All of your objects on the current map are shown; the selected object is marked in the world.",
        "Показаны все ваши объекты на текущей карте; выбранный объект отмечается в мире.",
    ));

    manageButton(list, uiText("Get Base Flag", "Получить флаг базы"), 8, -299, list.GetWidth() - 16, () => sendPacket(
        new ToolRequestMsg(FLAG_TOOL_KEY).write(),
        uiText("Base flag item request sent...", "Запрос предмета флага отправлен..."),
    ));
    const upgrade = createActionButton(
        list,
        list.GetWidth() - 16,
        44,
        `${uiText("Upgrade Base", "Улучшить базу")}\n${materialCostText(buildingMaterialCost(upgradeCatKey), GetLocale() == "ruRU")}`,
    );
    upgrade.button.SetPoint("TOPLEFT", 8, -333);
    upgrade.label.SetFont(STORE_FONT, 9, "OUTLINE");
    upgrade.label.SetWidth(list.GetWidth() - 32);
    upgrade.label.SetHeight(38);
    upgrade.label.SetJustifyH("CENTER");
    upgrade.button.SetScript("OnClick", () => sendPacket(
        new ToolRequestMsg(upgradeCatKey).write(),
        uiText("Upgrading base...", "Улучшение базы..."),
    ));
    const clear = createActionButton(list, list.GetWidth() - 16, 26, uiText("DELETE ENTIRE BASE", "УДАЛИТЬ ВСЮ БАЗУ"));
    clear.button.SetPoint("BOTTOMLEFT", 8, 10);
    clear.button.SetScript("OnClick", () => sendPacket(
        new ClearBaseMsg().write(),
        uiText("Full base deletion request sent...", "Запрос полного удаления базы отправлен..."),
    ));

    manageSelectedText = editor.CreateFontString(null, "OVERLAY", "GameFontNormal");
    manageSelectedText.SetFont(STORE_FONT, 11, "OUTLINE");
    manageSelectedText.SetPoint("TOPLEFT", 12, -38);
    manageSelectedText.SetWidth(editor.GetWidth() - 24);
    manageSelectedText.SetJustifyH("LEFT");

    const stepLabel = editor.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    stepLabel.SetFont(STORE_FONT, 10, "OUTLINE");
    stepLabel.SetPoint("TOPLEFT", 12, -72);
    stepLabel.SetText(uiText("Step, yards (0.05–5):", "Шаг, ярд. (0.05–5):"));

    manageStepInput = CreateFrame("EditBox", "BaseBuildingManageStep", editor, "InputBoxTemplate");
    manageStepInput.SetSize(editor.GetWidth() - 24, 22);
    manageStepInput.SetPoint("TOPLEFT", 12, -88);
    manageStepInput.SetAutoFocus(false);
    manageStepInput.SetMaxLetters(8);
    manageStepInput.SetText("0.25");
    manageStepInput.SetScript("OnEnterPressed", self => self.ClearFocus());
    manageStepInput.SetScript("OnEscapePressed", self => self.ClearFocus());

    const half = (editor.GetWidth() - 26) / 2;
    manageButton(editor, "X −", 8, -124, half, () => moveManaged(MOVE_AXIS_X, -1));
    manageButton(editor, "X +", 18 + half, -124, half, () => moveManaged(MOVE_AXIS_X, 1));
    manageButton(editor, "Y −", 8, -158, half, () => moveManaged(MOVE_AXIS_Y, -1));
    manageButton(editor, "Y +", 18 + half, -158, half, () => moveManaged(MOVE_AXIS_Y, 1));
    manageButton(editor, "Z −", 8, -192, half, () => moveManaged(MOVE_AXIS_Z, -1));
    manageButton(editor, "Z +", 18 + half, -192, half, () => moveManaged(MOVE_AXIS_Z, 1));
    manageButton(editor, uiText("↶ Left", "↶ Влево"), 8, -230, half, () => {
        if (requireManageSelection()) sendPacket(new RotateMsg(-1).write(), uiText("Rotating the selected object left...", "Поворачиваю выбранный объект влево..."));
    });
    manageButton(editor, uiText("Right ↷", "Вправо ↷"), 18 + half, -230, half, () => {
        if (requireManageSelection()) sendPacket(new RotateMsg(1).write(), uiText("Rotating the selected object right...", "Поворачиваю выбранный объект вправо..."));
    });
    manageButton(editor, uiText("Show Again / Refresh", "Показать снова / обновить"), 8, -268, editor.GetWidth() - 16, repeatManageSelection);
    manageButton(editor, uiText("Demolish Selected Object", "Снести выбранный объект"), 8, -306, editor.GetWidth() - 16, () => {
        if (requireManageSelection()) sendPacket(new RemoveMsg().write(), uiText("Demolishing the selected object...", "Сношу выбранный объект..."));
    });

    const editorHint = editor.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    editorHint.SetFont(STORE_FONT, 9, "OUTLINE");
    editorHint.SetPoint("TOPLEFT", 12, -346);
    editorHint.SetWidth(editor.GetWidth() - 24);
    editorHint.SetJustifyH("LEFT");
    editorHint.SetText(uiText(
        "X/Y move across the map, Z changes height. Rotation uses 15° steps.",
        "X/Y — по карте, Z — высота. Поворот выполняется с шагом 15°.",
    ));

    refreshManagePanel();
    panel.Hide();
    managePanel = panel;
}

/* ------------------------- категория «Хранилище» --------------------------- */
let pendingOpenStation = 0;

function storageCatButton(parent: WoWAPI.Frame, text: string, x: number, y: number, station: number): void {
    const btn = createActionButton(parent, 240, 28, text);
    btn.button.SetPoint("TOPLEFT", x, y);
    btn.button.SetScript("OnClick", () => {
        pendingOpenStation = station;
        sendPacket(new StorageRequest(station).write(), uiText("Requesting station contents...", "Запрашиваю содержимое станции..."));
    });
}

function buildStorageCategoryPanel(parent: WoWAPI.Frame): void {
    const panel = CreateFrame("Frame", "", parent);
    panel.SetSize(parent.GetWidth() * 0.66, parent.GetHeight() * 0.72);
    panel.SetPoint("TOPLEFT", parent.GetWidth() * 0.28, -80);

    const hint = panel.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    hint.SetFont(STORE_FONT, 11, "OUTLINE");
    hint.SetPoint("TOPLEFT", 4, -302);
    hint.SetWidth(panel.GetWidth() - 8);
    hint.SetJustifyH("LEFT");
    hint.SetText(uiText(
        "Open a station pool near your own building (10 yards), or click it in the world.\n\n" +
        "The material warehouse stores stacks of up to 24 ordinary item types. Equipment, non-stackable, quest, and conjured items are not accepted.\n\n" +
        "Regular processors use 5/4/3-minute cycles. Armor and jewelry workshops use 30/20/15 minutes; the weapon forge uses 60/40/30 minutes.\n\n" +
        "The loom still makes bolts. A separate tailoring workshop creates cloth armor. Random workshops use the highest-tier available material first and need no secondary reagents.",
        "Открывать пул станции можно рядом со своей постройкой (10 ярдов) — либо просто кликните по ней в мире.\n\n" +
        "Склад материалов хранит до 24 видов обычных предметов в стаках. Экипировка, одиночные, квестовые и сотворённые предметы не принимаются.\n\n" +
        "Обычные переработчики работают циклами 5/4/3 мин. Мастерские брони и украшений — 30/20/15 мин, оружейная кузница — 60/40/30 мин.\n\n" +
        "Ткацкий станок по-прежнему делает рулоны. Отдельная портняжная мастерская создаёт тканевую броню. Случайные мастерские сначала используют материал самого высокого доступного уровня и не требуют вторичных реагентов.",
    ));

    storageCatButton(panel, uiText("Material Warehouse", "Склад материалов"), 0, 0, STORAGE_KEY);
    storageCatButton(panel, uiText("Smelter", "Плавильня"), 0, -36, SMELTER_KEY);
    storageCatButton(panel, uiText("Alchemy Table", "Алхимический стол"), 0, -72, LAB_KEY);
    storageCatButton(panel, uiText("Cooking Table", "Кухонный стол"), 0, -108, COOKING_KEY);
    storageCatButton(panel, uiText("Tanning Bench", "Дубильный верстак"), 0, -144, LEATHERWORKING_KEY);
    storageCatButton(panel, uiText("Loom (bolts)", "Ткацкий станок (рулоны)"), 0, -180, LOOM_KEY);
    storageCatButton(panel, uiText("Scribe's Table", "Стол начертателя"), 0, -216, INSCRIPTION_KEY);
    storageCatButton(panel, uiText("Grinding Wheel", "Точильный круг"), 0, -252, STONECUTTING_KEY);

    storageCatButton(panel, uiText("Engineering Workbench", "Инженерный станок"), 250, 0, ENGINEERING_KEY);
    storageCatButton(panel, uiText("Butcher's Table", "Разделочный стол"), 250, -36, BUTCHER_KEY);
    storageCatButton(panel, uiText("Leather Armor Workshop", "Кожевенная мастерская"), 250, -72, LEATHER_ARMOR_KEY);
    storageCatButton(panel, uiText("Metal Armor Workshop", "Латная мастерская"), 250, -108, PLATE_ARMOR_KEY);
    storageCatButton(panel, uiText("Tailoring Workshop", "Портняжная мастерская"), 250, -144, CLOTH_ARMOR_KEY);
    storageCatButton(panel, uiText("Weapon Forge", "Оружейная кузница"), 250, -180, WEAPON_FORGE_KEY);
    storageCatButton(panel, uiText("Jewelry Workshop", "Ювелирная мастерская"), 250, -216, JEWELRY_KEY);

    panel.Hide();
    storagePanel = panel;
}

/* -------------------------------- refresh ---------------------------------- */
function refresh(): void {
    if (!frame) return;
    const cardsPerPage = 8;
    const cat = CATEGORIES[activeCat];
    if (activePage > maxPage()) activePage = maxPage();

    if (statusText) {
        const flagStr = st.hasFlag == 1
            ? uiText("|cff40ff40yes|r", "|cff40ff40есть|r")
            : uiText("|cffff6060no|r", "|cffff6060нет|r");
        statusText.SetText(uiText(
            `Flag: ${flagStr}    Buildings: ${st.count}/${st.max}`,
            `Флаг: ${flagStr}    Построек: ${st.count}/${st.max}`,
        ));
    }
    if (messageText) messageText.SetText(lastMessage);

    if (managePanel) (cat.special == "manage" ? managePanel.Show() : managePanel.Hide());
    if (storagePanel) (cat.special == "storage" ? storagePanel.Show() : storagePanel.Hide());
    if (patchPanel) (cat.special == "patch" ? patchPanel.Show() : patchPanel.Hide());
    if (cat.special == "manage") refreshManagePanel();
    if (cat.special == "patch") refreshPatchBrowser();

    const list = cat.special ? [] : categoryBuildings(cat);
    for (let i = 0; i < cards.length; i++) {
        const b = list[activePage * cardsPerPage + i];
        if (!b) {
            const preview = cardModels[i];
            if (preview) preview.Hide();
            cards[i].frame.Hide();
        } else {
            cards[i].frame.Show();
            cards[i].title.SetText(uiText(b.nameEn || b.name, b.name));
            cards[i].icon.SetTexture(buildingIcon(b.key, cat.icon));
            if (setCardPreview(i, b)) cards[i].icon.Hide();
            else cards[i].icon.Show();
            cards[i].action.label.SetText(uiText("Blueprint", "Чертёж"));
            cards[i].sub.SetText(materialCostStatus(buildingMaterialCost(b.key)));
            cards[i].setCost(undefined);
        }
    }

    if (pageText) {
        if (cat.special) pageText.SetText("");
        else pageText.SetText(`${activePage + 1}/${maxPage() + 1}`);
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

/* ------------------------------ окно склада -------------------------------- */
let storageFrame: WoWAPI.Frame | undefined;
let storageTitle: WoWAPI.FontString | undefined;
let storageCycle: WoWAPI.FontString | undefined;
let storeRows: ListRow[] = [];
let outputRows: ListRow[] = [];
let bagRows: ListRow[] = [];
let storePageText: WoWAPI.FontString | undefined;
let outputPageText: WoWAPI.FontString | undefined;
let bagPageText: WoWAPI.FontString | undefined;
let storageInputPanel: WoWAPI.Frame | undefined;
let storageOutputPanel: WoWAPI.Frame | undefined;
let storageBagPanel: WoWAPI.Frame | undefined;
let storageUpgrade: ReturnType<typeof createActionButton> | undefined;
let storageUnassign: ReturnType<typeof createActionButton> | undefined;
let storageProgress: WoWAPI.StatusBar | undefined;
let storageProgressText: WoWAPI.FontString | undefined;
let storageSpinner: WoWAPI.Texture | undefined;
let storageStateAt = 0;
let storageSpin = 0;
let storageRefreshSent = false;
let storagePage = 0;
let outputPage = 0;
let bagPage = 0;
let storageSt: StorageState | undefined;

interface BagItem {
    entry: number;
    count: number;
    icon: string;
    name: string;
}

declare function GetItemIcon(itemId: number): string;
declare function strmatch(str: string, pattern: string): string | undefined;

function scanBags(station: number): BagItem[] {
    const found: BagItem[] = [];
    const byEntry: { [entry: number]: number } = {};
    // фильтр станций: плавильня/стол принимают только входы своих рецептов
    let allowed: { [entry: number]: boolean } | undefined = undefined;
    if (station != STORAGE_KEY) {
        allowed = {};
        const accepted = storageSt && storageSt.station == station
            ? storageSt.acceptedInputs
            : recipesFor(station).map(recipe => recipe.input);
        for (let i = 0; i < accepted.length; i++) allowed[accepted[i]] = true;
    }

    for (let bag = 0; bag <= 4; bag++) {
        const bagId = bag as any;
        const slots = GetContainerNumSlots(bagId);
        for (let slot = 1; slot <= slots; slot++) {
            const link = GetContainerItemLink(bagId, slot);
            if (link) {
                const entryStr = strmatch(link, "item:(%d+)");
                if (entryStr) {
                    const entry = tonumber(entryStr) as number;
                    if (!allowed || allowed[entry]) {
                        const [_, count] = GetContainerItemInfo(bagId, slot);
                        if (byEntry[entry] === undefined) {
                            byEntry[entry] = found.length;
                            const [name] = GetItemInfo(entry);
                            found.push({
                                entry: entry,
                                count: count || 1,
                                icon: GetItemIcon(entry) || "Interface\\Icons\\INV_Misc_QuestionMark",
                                name: name || `#${entry}`,
                            });
                        } else {
                            found[byEntry[entry]].count += count || 1;
                        }
                    }
                }
            }
        }
    }
    return found;
}

function stationItems(bucket: number): StorageEntry[] {
    const found: StorageEntry[] = [];
    if (!storageSt) return found;
    for (let i = 0; i < storageSt.items.length; i++) {
        if (storageSt.items[i].bucket == bucket) found.push(storageSt.items[i]);
    }
    return found;
}

function renderStationRows(rows: ListRow[], items: StorageEntry[], page: number): number {
    const pages = Math.max(1, Math.ceil(items.length / ROWS_PER_PANEL));
    if (page >= pages) page = pages - 1;
    if (page < 0) page = 0;
    for (let i = 0; i < rows.length; i++) {
        const item = items[page * ROWS_PER_PANEL + i];
        if (!item) {
            rows[i].button.Hide();
        } else {
            rows[i].button.Show();
            rows[i].icon.SetTexture(GetItemIcon(item.itemEntry) || "Interface\\Icons\\INV_Misc_QuestionMark");
            rows[i].label.SetText(item.name);
            rows[i].count.SetText(`${item.count}`);
        }
    }
    return page;
}

function ensureStorageFrame(): WoWAPI.Frame {
    if (storageFrame) return storageFrame;

    const f = CreateFrame("Frame", "BaseStorageFrame", UIParent);
    UISpecialFrames.push("BaseStorageFrame");
    hooksecurefunc(f as any, "Show", () => {
        const globals = _G as any;
        const previous = globals.TSWOW_ActiveSystemWindow as WoWAPI.Frame | undefined;
        if (previous && previous != f && previous.IsShown()) previous.Hide();
        globals.TSWOW_ActiveSystemWindow = f;
    });
    f.SetSize(950, 470);
    f.SetScale(0.9 * Math.min(
        1,
        (UIParent.GetWidth() - 40) / 950,
        (UIParent.GetHeight() - 40) / 470,
    ));
    f.SetPoint("CENTER", UIParent, "CENTER", 0, 0);
    f.SetClampedToScreen(true);
    f.SetMovable(true);
    f.EnableMouse(true);
    f.RegisterForDrag("LeftButton");
    f.SetScript("OnDragStart", () => f.StartMoving());
    f.SetScript("OnDragStop", () => f.StopMovingOrSizing());
    f.SetFrameStrata("DIALOG");

    const background = f.CreateTexture(null, "BACKGROUND");
    background.SetAllPoints();
    background.SetTexture(TEX_MAIN);
    background.SetTexCoord(0, 0.789062500, 0, 0.539062500);

    storageTitle = f.CreateFontString(null, "OVERLAY", "GameFontNormal");
    storageTitle.SetFont(STORE_FONT, 15, "OUTLINE");
    storageTitle.SetPoint("TOPLEFT", 20, -8);
    storageTitle.SetShadowOffset(1, -1);
    storageTitle.SetJustifyH("LEFT");
    storageTitle.SetTextColor(1, 0.82, 0);

    storageCycle = f.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    storageCycle.SetFont(STORE_FONT, 10, "OUTLINE");
    storageCycle.SetPoint("TOPLEFT", 20, -28);
    storageCycle.SetJustifyH("LEFT");

    const closeBtn = CreateFrame("Button", "", f, "UIPanelCloseButton");
    closeBtn.SetSize(28, 28);
    closeBtn.SetPoint("TOPRIGHT", -4, -6);
    closeBtn.SetScript("OnClick", () => f.Hide());

    storageUpgrade = createActionButton(f, 360, 24, uiText("Upgrade Station", "Улучшить станцию"));
    storageUpgrade.button.SetPoint("TOPRIGHT", -34, -7);
    storageUpgrade.button.SetScript("OnClick", () => {
        if (!storageSt || storageSt.station == STORAGE_KEY || storageSt.upgradeAvailable <= 0) return;
        const building = buildingByKey(storageSt.station);
        sendPacket(
            new StorageUpgradeMsg(storageSt.station).write(),
            uiText(
                `Upgrading ${building ? building.nameEn || building.name : "station"}...`,
                `Улучшаю ${building ? building.name : "станцию"}...`,
            ),
        );
    });

    storageUnassign = createActionButton(f, 150, 20, uiText("Unassign Worker", "Снять работника"));
    storageUnassign.button.SetPoint("TOPRIGHT", -34, -34);
    storageUnassign.button.SetScript("OnClick", () => {
        if (storageSt) WorkforceUI.unassignStationWorker(storageSt.station);
    });

    storageSpinner = f.CreateTexture(null, "OVERLAY");
    storageSpinner.SetTexture("Interface\\Cooldown\\star4");
    storageSpinner.SetVertexColor(1, 0.72, 0.12, 1);
    storageSpinner.SetSize(20, 20);
    storageSpinner.SetPoint("TOPLEFT", 18, -33);
    storageSpinner.Hide();

    storageProgress = CreateFrame("StatusBar", "", f);
    storageProgress.SetSize(620, 14);
    storageProgress.SetPoint("TOPLEFT", 42, -36);
    storageProgress.SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar");
    storageProgress.SetStatusBarColor(1, 0.48, 0.05, 1);
    storageProgress.SetMinMaxValues(0, 1);
    const progressBg = storageProgress.CreateTexture(null, "BACKGROUND");
    progressBg.SetAllPoints();
    progressBg.SetTexture(0.08, 0.04, 0.01, 0.9);
    storageProgressText = storageProgress.CreateFontString(null, "OVERLAY", "GameFontHighlightSmall");
    storageProgressText.SetFont(STORE_FONT, 9, "OUTLINE");
    storageProgressText.SetPoint("CENTER", 0, 0);
    storageProgress.Hide();

    storageInputPanel = createSidePanel(f, 310, 408, uiText("Materials / Storage", "Сырьё / склад"));
    storageInputPanel.SetPoint("TOPLEFT", 0, -58);
    storageOutputPanel = createSidePanel(f, 310, 408, uiText("Output", "Результат"));
    storageOutputPanel.SetPoint("TOP", 0, -58);
    storageBagPanel = createSidePanel(f, 310, 408, uiText("Bags", "Сумки"));
    storageBagPanel.SetPoint("TOPRIGHT", 0, -58);

    const leftPanel = storageInputPanel;
    const outputPanel = storageOutputPanel;
    const rightPanel = storageBagPanel;

    for (let i = 0; i < ROWS_PER_PANEL; i++) {
        const index = i;
        const srow = createListRow(leftPanel, 262, 34);
        srow.button.SetPoint("TOP", 0, -34 - i * 37);
        srow.button.SetScript("OnClick", () => {
            if (!storageSt) return;
            const items = stationItems(STORAGE_BUCKET_INPUT);
            const item = items[storagePage * ROWS_PER_PANEL + index];
            if (!item) return;
            const count = IsShiftKeyDown() ? 1 : 0; // 0 = всё
            sendPacket(
                new StorageMoveMsg(
                    OP_STORE_WITHDRAW, storageSt.station, item.itemEntry, count, STORAGE_BUCKET_INPUT,
                ).write(),
                uiText(`Withdrawing: ${item.name}...`, `Забираю: ${item.name}...`),
            );
        });
        srow.button.SetScript("OnEnter", () => {
            if (!storageSt) return;
            const items = stationItems(STORAGE_BUCKET_INPUT);
            const item = items[storagePage * ROWS_PER_PANEL + index];
            if (!item) return;
            GameTooltip.SetOwner(srow.button, "ANCHOR_RIGHT");
            GameTooltip.SetHyperlink(`item:${item.itemEntry}`);
            GameTooltip.AddLine(uiText(
                "LMB — withdraw all, Shift+LMB — 1 item.",
                "ЛКМ — забрать всё, Shift+ЛКМ — 1 шт.",
            ), 0.6, 0.9, 0.6);
            GameTooltip.Show();
        });
        srow.button.SetScript("OnLeave", () => GameTooltip.Hide());
        storeRows.push(srow);

        const orow = createListRow(outputPanel, 262, 34);
        orow.button.SetPoint("TOP", 0, -34 - i * 37);
        orow.button.SetScript("OnClick", () => {
            if (!storageSt) return;
            const items = stationItems(STORAGE_BUCKET_OUTPUT);
            const item = items[outputPage * ROWS_PER_PANEL + index];
            if (!item) return;
            const count = IsShiftKeyDown() ? 1 : 0;
            sendPacket(
                new StorageMoveMsg(
                    OP_STORE_WITHDRAW, storageSt.station, item.itemEntry, count, STORAGE_BUCKET_OUTPUT,
                ).write(),
                uiText(`Withdrawing output: ${item.name}...`, `Забираю результат: ${item.name}...`),
            );
        });
        orow.button.SetScript("OnEnter", () => {
            if (!storageSt) return;
            const items = stationItems(STORAGE_BUCKET_OUTPUT);
            const item = items[outputPage * ROWS_PER_PANEL + index];
            if (!item) return;
            GameTooltip.SetOwner(orow.button, "ANCHOR_RIGHT");
            GameTooltip.SetHyperlink(`item:${item.itemEntry}`);
            GameTooltip.AddLine(uiText(
                "Finished output. LMB — withdraw all, Shift+LMB — 1 item.",
                "Готовый результат. ЛКМ — забрать всё, Shift+ЛКМ — 1 шт.",
            ), 0.6, 0.9, 0.6);
            GameTooltip.Show();
        });
        orow.button.SetScript("OnLeave", () => GameTooltip.Hide());
        outputRows.push(orow);

        const brow = createListRow(rightPanel, 262, 34);
        brow.button.SetPoint("TOP", 0, -34 - i * 37);
        brow.button.SetScript("OnClick", () => {
            if (!storageSt) return;
            const items = scanBags(storageSt.station);
            const item = items[bagPage * ROWS_PER_PANEL + index];
            if (!item) return;
            const count = IsShiftKeyDown() ? 1 : 0;
            sendPacket(
                new StorageMoveMsg(
                    OP_STORE_DEPOSIT, storageSt.station, item.entry, count, STORAGE_BUCKET_INPUT,
                ).write(),
                uiText(`Depositing: ${item.name}...`, `Кладу на хранение: ${item.name}...`),
            );
        });
        brow.button.SetScript("OnEnter", () => {
            if (!storageSt) return;
            const items = scanBags(storageSt.station);
            const item = items[bagPage * ROWS_PER_PANEL + index];
            if (!item) return;
            GameTooltip.SetOwner(brow.button, "ANCHOR_RIGHT");
            GameTooltip.SetHyperlink(`item:${item.entry}`);
            GameTooltip.AddLine(uiText(
                "LMB — deposit all, Shift+LMB — 1 item.",
                "ЛКМ — положить всё, Shift+ЛКМ — 1 шт.",
            ), 0.6, 0.9, 0.6);
            GameTooltip.Show();
        });
        brow.button.SetScript("OnLeave", () => GameTooltip.Hide());
        bagRows.push(brow);
    }

    // пагинация обеих панелей
    const mkArrow = (parent: WoWAPI.Frame, x: number, flip: boolean, onClick: () => void) => {
        const b = CreateFrame("Button", "", parent);
        b.SetSize(26, 22);
        b.SetPoint("BOTTOM", x, 14);
        const t = b.CreateTexture(null);
        t.SetAllPoints();
        t.SetTexture("Interface\\AddOns\\dh-store-assets\\StoreFrame_Main.blp");
        if (flip) t.SetTexCoord(0.93896484375, 0.96826171875, 0.84619140625, 0.87548828125);
        else t.SetTexCoord(0.84814453125, 0.87744140625, 0.84619140625, 0.87548828125);
        b.SetScript("OnClick", onClick);
        return b;
    };
    mkArrow(leftPanel, -30, false, () => { if (storagePage > 0) storagePage--; refreshStorage(); });
    mkArrow(leftPanel, 30, true, () => { storagePage++; refreshStorage(); });
    storePageText = leftPanel.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    storePageText.SetFont(STORE_FONT, 10, "OUTLINE");
    storePageText.SetPoint("BOTTOM", 0, 18);

    mkArrow(outputPanel, -30, false, () => { if (outputPage > 0) outputPage--; refreshStorage(); });
    mkArrow(outputPanel, 30, true, () => { outputPage++; refreshStorage(); });
    outputPageText = outputPanel.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    outputPageText.SetFont(STORE_FONT, 10, "OUTLINE");
    outputPageText.SetPoint("BOTTOM", 0, 18);

    mkArrow(rightPanel, -30, false, () => { if (bagPage > 0) bagPage--; refreshStorage(); });
    mkArrow(rightPanel, 30, true, () => { bagPage++; refreshStorage(); });
    bagPageText = rightPanel.CreateFontString(null, "OVERLAY", "GameFontNormalSmall");
    bagPageText.SetFont(STORE_FONT, 10, "OUTLINE");
    bagPageText.SetPoint("BOTTOM", 0, 18);

    const bagWatcher = CreateFrame("Frame");
    bagWatcher.RegisterEvent("BAG_UPDATE");
    bagWatcher.SetScript("OnEvent", () => {
        if (f.IsShown()) refreshStorage();
    });

    f.SetScript("OnUpdate", (_frame, elapsed) => {
        if (!f.IsShown() || !storageSt) return;
        if (storageSt.pendingProperties > 0
            && GetTime() - storageStateAt >= 3 && !storageRefreshSent) {
            storageRefreshSent = true;
            new StorageRequest(storageSt.station).write().Send();
        }
        if (storageSt.working != 1
            || !storageProgress || !storageProgressText || !storageSpinner) return;

        storageSpin = storageSpin + elapsed * 3;
        if (storageSpin > Math.PI * 2) storageSpin = storageSpin - Math.PI * 2;
        storageSpinner.SetRotation(storageSpin);
        storageSpinner.SetAlpha(0.65 + Math.sin(storageSpin * 2) * 0.25);

        const remaining = Math.max(0, storageSt.nextCycleS - (GetTime() - storageStateAt));
        const period = Math.max(1, storageSt.periodS);
        storageProgress.SetValue(Math.max(0, Math.min(1, (period - remaining) / period)));
        const seconds = Math.ceil(remaining);
        const minutes = Math.floor(seconds / 60);
        const tail = seconds - minutes * 60;
        storageProgressText.SetText(uiText(
            `Working • ${minutes}:${tail < 10 ? "0" : ""}${tail}`,
            `Идёт работа • ${minutes}:${tail < 10 ? "0" : ""}${tail}`,
        ));

        if (remaining <= 0 && !storageRefreshSent) {
            storageRefreshSent = true;
            new StorageRequest(storageSt.station).write().Send();
        }
    });

    f.Hide();
    storageFrame = f;
    return f;
}

function refreshStorage(): void {
    if (!storageFrame || !storageSt) return;

    const processing = storageSt.station != STORAGE_KEY;
    const frameWidth = processing ? 950 : 640;
    storageFrame.SetSize(frameWidth, 470);
    storageFrame.SetScale(0.9 * Math.min(
        1,
        (UIParent.GetWidth() - 40) / frameWidth,
        (UIParent.GetHeight() - 40) / 470,
    ));
    if (storageInputPanel && storageOutputPanel && storageBagPanel) {
        const panelY = processing ? -58 : -40;
        storageInputPanel.ClearAllPoints();
        storageInputPanel.SetPoint("TOPLEFT", 0, panelY);
        storageBagPanel.ClearAllPoints();
        storageBagPanel.SetPoint("TOPRIGHT", 0, panelY);
        storageOutputPanel.ClearAllPoints();
        storageOutputPanel.SetPoint("TOP", 0, panelY);
        if (processing) storageOutputPanel.Show();
        else storageOutputPanel.Hide();
    }

    const b = buildingByKey(storageSt.station);
    if (storageTitle) storageTitle.SetText(b
        ? uiText(b.nameEn || b.name, b.name)
        : uiText("Storage", "Хранилище"));
    if (storageCycle) {
        storageCycle.SetWidth(processing ? 500 : 590);
        const worker = WorkforceUI.stationWorker(storageSt.station);
        const workerText = worker && worker.workerId > 0
            ? uiText(
                ` Worker #${worker.workerId}, profession ${worker.profession}, rank ${worker.rank}: `
                    + `speed +${worker.periodBps / 100}%, savings ${worker.saveBps / 100}%, output ${worker.bonusBps / 100}%.`,
                ` Работник #${worker.workerId}, профессия ${worker.profession}, ранг ${worker.rank}: `
                    + `скорость +${worker.periodBps / 100}%, экономия ${worker.saveBps / 100}%, выход ${worker.bonusBps / 100}%.`,
            )
            : uiText(" No worker assigned.", " Работник не назначен.");
        const propertyText = (storageSt.pendingProperties > 0
            ? uiText(
                ` Property records pending: ${storageSt.pendingProperties}.`,
                ` Запись свойств ожидают: ${storageSt.pendingProperties}.`,
            )
            : "")
            + (storageSt.quarantinedOutputs > 0
                ? uiText(
                    ` Require review after a failure: ${storageSt.quarantinedOutputs}.`,
                    ` После сбоя требуют проверки: ${storageSt.quarantinedOutputs}.`,
                )
                : "");
        if (storageSt.station == STORAGE_KEY) {
            storageCycle.SetText(uiText(
                "Ordinary items: 24 types, up to 1000 each. Equipment and quest items are not accepted.",
                "Обычные предметы: 24 вида по 1000 шт. Экипировка и квестовые не принимаются.",
            ));
        } else if (storageSt.working == 1) {
            storageCycle.SetText(uiText(
                `Level ${storageSt.level + 1}/${STATION_MAX_LEVEL + 1}: `
                    + `${storageSt.batch} operations every ${Math.ceil(storageSt.periodS / 60)} min. Production is running.`,
                `Уровень ${storageSt.level + 1}/${STATION_MAX_LEVEL + 1}: `
                    + `${storageSt.batch} операций каждые ${Math.ceil(storageSt.periodS / 60)} мин. Производство запущено.`,
            ) + workerText + propertyText);
        } else {
            storageCycle.SetText(uiText(
                `Level ${storageSt.level + 1}/${STATION_MAX_LEVEL + 1}: waiting for materials or free output space.`,
                `Уровень ${storageSt.level + 1}/${STATION_MAX_LEVEL + 1}: ожидание сырья или свободного места для результата.`,
            ) + workerText + propertyText);
        }
    }
    if (storageUnassign) {
        const worker = processing ? WorkforceUI.stationWorker(storageSt.station) : undefined;
        if (worker && worker.workerId > 0) {
            storageUnassign.button.Show();
            storageUnassign.label.SetText(uiText(
                `Unassign Companion #${worker.workerId}`,
                `Снять спутника #${worker.workerId}`,
            ));
        } else {
            storageUnassign.button.Hide();
        }
    }
    if (storageProgress && storageSpinner) {
        if (processing && storageSt.working == 1) {
            storageProgress.Show();
            storageSpinner.Show();
        } else {
            storageProgress.Hide();
            storageSpinner.Hide();
        }
    }
    if (storageUpgrade) {
        if (!processing) {
            storageUpgrade.button.Hide();
        } else {
            storageUpgrade.button.Show();
            if (storageSt.upgradeAvailable > 0) {
                storageUpgrade.button.SetAlpha(1);
                storageUpgrade.label.SetText(uiText(
                    `Upgrade to level ${storageSt.level + 2}: ${materialCostText(
                        stationUpgradeMaterialCost(storageSt.station, storageSt.level), false,
                    )}`,
                    `Улучшить до уровня ${storageSt.level + 2}: ${materialCostText(
                        stationUpgradeMaterialCost(storageSt.station, storageSt.level), true,
                    )}`,
                ));
            } else {
                storageUpgrade.button.SetAlpha(0.6);
                storageUpgrade.label.SetText(uiText("Maximum Level", "Максимальный уровень"));
            }
        }
    }

    const inputItems = stationItems(STORAGE_BUCKET_INPUT);
    const totalPages = Math.max(1, Math.ceil(inputItems.length / ROWS_PER_PANEL));
    storagePage = renderStationRows(storeRows, inputItems, storagePage);
    if (storePageText) storePageText.SetText(`${storagePage + 1}/${totalPages}`);

    const resultItems = stationItems(STORAGE_BUCKET_OUTPUT);
    const outputPages = Math.max(1, Math.ceil(resultItems.length / ROWS_PER_PANEL));
    outputPage = renderStationRows(outputRows, resultItems, outputPage);
    if (outputPageText) outputPageText.SetText(`${outputPage + 1}/${outputPages}`);

    const bagItems = scanBags(storageSt.station);
    const bagPages = Math.max(1, Math.ceil(bagItems.length / ROWS_PER_PANEL));
    if (bagPage >= bagPages) bagPage = bagPages - 1;
    for (let i = 0; i < bagRows.length; i++) {
        const item = bagItems[bagPage * ROWS_PER_PANEL + i];
        if (!item) {
            bagRows[i].button.Hide();
        } else {
            bagRows[i].button.Show();
            bagRows[i].icon.SetTexture(item.icon);
            bagRows[i].label.SetText(item.name);
            bagRows[i].count.SetText(`${item.count}`);
        }
    }
    if (bagPageText) bagPageText.SetText(`${bagPage + 1}/${bagPages}`);
}

/* ---------------------------- пакеты от сервера ---------------------------- */
OnCustomPacket(OP_BASE_STATE, (packet) => {
    st = new BaseState();
    st.read(packet);
    setBuildingWoodItems(st.woodItems);
    ResourceGenerators.hydrateResourceGeneratorWoodItems(st.woodItems);
    setMessage(uiText(
        "Connected to the server. Select a category on the left.",
        "Связь с сервером установлена. Выберите категорию слева.",
    ));
});

OnCustomPacket(OP_BASE_MANAGE_STATE, (packet) => {
    const state = new ManageState(0, 0, []);
    state.read(packet);
    manageSt = state;
    const selectedIndex = selectedManageIndex();
    if (selectedIndex >= 0) managePage = Math.floor(selectedIndex / MANAGE_PAGE_SIZE);
    refreshManagePanel();
});

OnCustomPacket(OP_BASE_ERROR, (packet) => {
    const err = new ErrorMsg("");
    err.read(packet);
    setMessage(localizedWireText(err.message), true);
});

OnCustomPacket(OP_STORE_STATE, (packet) => {
    const state = new StorageState();
    state.read(packet);
    if (!storageSt || storageSt.station != state.station) {
        storagePage = 0;
        outputPage = 0;
        bagPage = 0;
    }
    storageStateAt = GetTime();
    storageRefreshSent = false;
    storageSt = state;
    WorkforceUI.requestWorkforceState();
    const f = ensureStorageFrame();
    if (state.openWindow == 1 || pendingOpenStation == state.station) {
        pendingOpenStation = 0;
        f.Show();
    }
    refreshStorage();
});

/* --------------------------------- запуск ---------------------------------- */
function installBootstrap(): void {
    let menuButton: WoWAPI.Button | undefined;
    let minimapAngle = (200 * Math.PI) / 180;

    function placeMinimapButton(btn: WoWAPI.Button): void {
        btn.SetPoint(
            "CENTER", Minimap, "CENTER",
            80 * Math.cos(minimapAngle),
            80 * Math.sin(minimapAngle),
        );
    }

    function ensureMenuButton(): void {
        if (menuButton) return;
        const btn = CreateFrame("Button", "BaseBuildingMinimapButton", Minimap);
        btn.SetSize(32, 32);
        btn.SetFrameStrata("MEDIUM");
        btn.SetFrameLevel(8);
        btn.RegisterForClicks("LeftButtonUp");
        btn.RegisterForDrag("LeftButton");
        btn.SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight");

        const icon = btn.CreateTexture("", "BACKGROUND");
        icon.SetTexture("Interface\\Icons\\INV_BannerPVP_02");
        icon.SetSize(20, 20);
        icon.SetPoint("CENTER", btn, "CENTER", 0, 1);
        icon.SetTexCoord(0.05, 0.95, 0.05, 0.95);

        const border = btn.CreateTexture("", "OVERLAY");
        border.SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder");
        border.SetSize(54, 54);
        border.SetPoint("TOPLEFT", btn, "TOPLEFT", 0, 0);

        placeMinimapButton(btn);

        btn.SetScript("OnClick", () => toggle());
        btn.SetScript("OnDragStart", () => {
            btn.SetScript("OnUpdate", () => {
                const [cx, cy] = GetCursorPosition();
                const scale = Minimap.GetEffectiveScale();
                const [mx, my] = Minimap.GetCenter();
                minimapAngle = Math.atan2(cy / scale - my, cx / scale - mx);
                btn.ClearAllPoints();
                placeMinimapButton(btn);
            });
        });
        btn.SetScript("OnDragStop", () => btn.SetScript("OnUpdate", null as any));
        btn.SetScript("OnEnter", () => {
            GameTooltip.SetOwner(btn, "ANCHOR_LEFT");
            GameTooltip.SetText(uiText("Base Construction", "Строительство базы"));
            GameTooltip.AddLine(
                uiText(
                    "LMB — open the menu (/base). Drag to move the button.",
                    "ЛКМ — открыть меню (/base). Перетащите, чтобы сдвинуть кнопку.",
                ),
                0.8, 0.8, 0.8, true,
            );
            GameTooltip.Show();
        });
        btn.SetScript("OnLeave", () => GameTooltip.Hide());
        menuButton = btn;
    }

    const materialWatcher = CreateFrame("Frame");
    materialWatcher.RegisterEvent("BAG_UPDATE");
    materialWatcher.SetScript("OnEvent", () => {
        if (frame && frame.IsShown()) refresh();
    });

    const bootstrap = CreateFrame("Frame");
    bootstrap.RegisterEvent("PLAYER_ENTERING_WORLD");
    bootstrap.SetScript("OnEvent", () => {
        ensureMenuButton();
        // Всегда синкаемся при входе: сервер помечает клиента «готовым», после чего
        // клик по складу/плавильне в мире может сразу открыть окно хранилища.
        if ((_G as any)._CLIENT_NETWORK) new StateRequest().write().Send();
    });
}

export function initBaseUI(): void {
    WorkforceUI.initWorkforceUI(refreshStorage);
    function isFlagTooltip(): boolean {
        const left = (_G as any).GameTooltipTextLeft1;
        const getText = left && left.GetText;
        const text = getText && getText(left);
        return text == FLAG_TOOLTIP_NAME || text == HORDE_FLAG_TOOLTIP_NAME
            || text == "Флаг базы" || text == "Base Flag";
    }

    (GameTooltip as any).HookScript("OnShow", () => {
        if (!isFlagTooltip()) return;
        flagTooltipPending = true;
        new TooltipRequest().write().Send();
    });
    (GameTooltip as any).HookScript("OnHide", () => {
        flagTooltipPending = false;
    });
    OnCustomPacket(OP_BASE_TOOLTIP, (packet) => {
        const msg = new TooltipOwnerMsg("");
        msg.read(packet);
        if (!flagTooltipPending || !GameTooltip.IsShown() || !isFlagTooltip()) return;
        flagTooltipPending = false;
        GameTooltip.AddLine(uiText(
            `|cff40a0ffPlayer's base:|r ${msg.owner}`,
            `|cff40a0ffБаза игрока:|r ${msg.owner}`,
        ));
        GameTooltip.Show();
    });
    installBootstrap();
    (_G as any).SLASH_BASEBUILD1 = "/base";
    (_G as any).SLASH_BASEBUILD2 = "/база";
    SlashCmdList.BASEBUILD = () => toggle();
}
