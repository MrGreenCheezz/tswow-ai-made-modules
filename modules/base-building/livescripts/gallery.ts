import { baseText, localizedTemplateNames } from "./base";

const GALLERY_COMMAND = "gogallery";
const GALLERY_PAGE_SIZE = 16;
const GALLERY_COLUMNS = 4;
const GALLERY_SPACING = 35;
const GALLERY_STATE_KEY = "baseBuildingGallery";

class GalleryState {
    page = 1;
    filter = "";
    mapId = 0;
    entries: number[] = [];
    guids: number[] = [];
}

interface GalleryRow {
    entry: number;
    displayId: number;
    name: string;
}

function galleryState(player: TSPlayer): GalleryState {
    return player.GetObject(GALLERY_STATE_KEY, new GalleryState());
}

/** Only these characters can reach the LIKE clause below. */
export function sanitizeGalleryFilter(value: string): string {
    let result = "";
    for (let i = 0; i < value.length && result.length < 40; i++) {
        const code = value.charCodeAt(i);
        if (
            (code >= 48 && code <= 57) ||
            (code >= 65 && code <= 90) ||
            (code >= 97 && code <= 122) ||
            code == 32 || code == 45
        ) {
            result += value[i];
        }
    }
    return result.trim();
}

/** Zero-based row and column; exported for the small layout check. */
export function gallerySlot(index: number): [number, number] {
    return [Math.floor(index / GALLERY_COLUMNS), index % GALLERY_COLUMNS];
}

function clearGallery(player: TSPlayer): void {
    const state = galleryState(player);
    if (state.mapId == player.GetMapID()) {
        for (let i = 0; i < state.guids.length; i++) {
            const go = player.GetMap().GetGameObject(
                CreateGUID(HighGuid.GameObject, state.entries[i], state.guids[i]),
            );
            if (go) go.RemoveFromWorld(false);
        }
    }
    state.entries = [];
    state.guids = [];
    state.mapId = 0;
}

function patchWhere(filter: string): string {
    const search = filter == "" ? "" : ` AND name LIKE '%${filter}%'`;
    return `name LIKE '%[PATCH]%'${search}`;
}

function patchCount(filter: string): number {
    const result = QueryWorld(`SELECT COUNT(*) FROM gameobject_template WHERE ${patchWhere(filter)}`);
    return result.GetRow() ? Number(result.GetUInt32(0)) : 0;
}

function patchPage(page: number, filter: string): GalleryRow[] {
    const offset = (page - 1) * GALLERY_PAGE_SIZE;
    const result = QueryWorld(
        "SELECT entry, displayId, name FROM gameobject_template" +
        ` WHERE ${patchWhere(filter)} ORDER BY entry LIMIT ${offset}, ${GALLERY_PAGE_SIZE}`,
    );
    const rows: GalleryRow[] = [];
    while (result.GetRow()) {
        rows.push({
            entry: Number(result.GetUInt32(0)),
            displayId: Number(result.GetUInt32(1)),
            name: result.GetString(2),
        });
    }
    return rows;
}

function showGallery(player: TSPlayer, requestedPage: number, filter: string): void {
    const total = patchCount(filter);
    if (total == 0) {
        player.SendBroadcastMessage(baseText(
            player,
            `Nothing was found in the patch for “${filter}”.`,
            `В патче ничего не найдено по запросу «${filter}».`,
        ));
        return;
    }

    const pages = Math.ceil(total / GALLERY_PAGE_SIZE);
    const page = Math.max(1, Math.min(Math.floor(requestedPage), pages));
    const rows = patchPage(page, filter);
    clearGallery(player);

    const state = galleryState(player);
    state.page = page;
    state.filter = filter;
    state.mapId = Number(player.GetMapID());

    const map = player.GetMap();
    const phase = Number(player.GetPhaseMaskForSpawn());
    const originX = Number(player.GetX());
    const originY = Number(player.GetY());
    const originZ = Number(player.GetZ());
    const orientation = Number(player.GetO());
    const forwardX = Math.cos(orientation);
    const forwardY = Math.sin(orientation);
    const rightX = -forwardY;
    const rightY = forwardX;

    player.SendBroadcastMessage(baseText(
        player,
        `Patch showroom: page ${page}/${pages}, ${total} found` +
            (filter == "" ? "." : `, search “${filter}”.`),
        `Шоурум патча: страница ${page}/${pages}, найдено ${total}` +
            (filter == "" ? "." : `, поиск «${filter}».`),
    ));

    rows.forEach((row, index) => {
        const name = localizedTemplateNames.gameObject(player, row.entry, row.name);
        const slot = gallerySlot(index);
        const forward = GALLERY_SPACING * (slot[0] + 1);
        const sideways = GALLERY_SPACING * (slot[1] - (GALLERY_COLUMNS - 1) / 2);
        const x = originX + forwardX * forward + rightX * sideways;
        const y = originY + forwardY * forward + rightY * sideways;
        let z = Number(map.GetHeight(x, y, phase));
        if (z < -50000 || z > 50000) z = originZ;

        const go = map.SpawnGameObject(row.entry, x, y, z, orientation + Math.PI, 0, phase);
        const position = baseText(
            player,
            `row ${slot[0] + 1}, slot ${slot[1] + 1}`,
            `ряд ${slot[0] + 1}, место ${slot[1] + 1}`,
        );
        if (go) {
            state.entries.push(row.entry);
            state.guids.push(Number(go.GetGUIDLow()));
            player.SendBroadcastMessage(
                `[${position}] entry=${row.entry}, display=${row.displayId}: ${name}`,
            );
        } else {
            player.SendBroadcastMessage(baseText(
                player,
                `[${position}] NOT SPAWNED entry=${row.entry}, display=${row.displayId}: ${name}`,
                `[${position}] НЕ СОЗДАН entry=${row.entry}, display=${row.displayId}: ${name}`,
            ));
        }
    });

    player.SendBroadcastMessage(baseText(
        player,
        ".gogallery next | .gogallery prev | .gogallery clear | .gogallery <page> <search>",
        ".gogallery next | .gogallery prev | .gogallery clear | .gogallery <страница> <поиск>",
    ));
}

function handleGalleryCommand(player: TSPlayer, raw: string): boolean {
    const parts = raw.trim().split(" ");
    if (parts[0] != GALLERY_COMMAND) return false;

    if (Number(player.GetGMRank()) < 1) {
        player.SendBroadcastMessage(baseText(player, "This command is available only to GMs.", "Команда доступна только GM."));
        return true;
    }

    const state = galleryState(player);
    const action = parts.length > 1 ? parts[1].toLowerCase() : "";
    if (action == "clear") {
        clearGallery(player);
        player.SendBroadcastMessage(baseText(player, "Showroom objects removed.", "Объекты шоурума убраны."));
        return true;
    }
    if (action == "next") {
        showGallery(player, state.page + 1, state.filter);
        return true;
    }
    if (action == "prev") {
        showGallery(player, state.page - 1, state.filter);
        return true;
    }

    const requestedPage = Number(action);
    if (action != "" && requestedPage == requestedPage) {
        showGallery(player, requestedPage, sanitizeGalleryFilter(parts.slice(2).join(" ")));
    } else {
        showGallery(player, 1, sanitizeGalleryFilter(parts.slice(1).join(" ")));
    }
    return true;
}

export function RegisterBuildingGallery(events: TSEvents): void {
    events.Player.OnCommand((player, command, found) => {
        if (handleGalleryCommand(player, command.get())) found.set(true);
    });
    events.Player.OnLogout(player => clearGallery(player));
}
