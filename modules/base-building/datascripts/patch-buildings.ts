import { DBC, SQL } from "wow/wotlk";
import { PATCH_BUILDING_ENTRIES, isPatchBuildingEntry } from "./PatchBuildingEntries";

declare const require: any;
declare const __dirname: string;

const fs = require("fs");
const path = require("path");

const PATCH_DIR = path.join(__dirname, "..", "data", "PatchForBuildings");
const DISPLAY_INFO_DBC = path.join(PATCH_DIR, "GameObjectDisplayInfo.dbc");
const TEMPLATE_SQL = path.join(PATCH_DIR, "gameobject_template_trinity_atakke_edit.sql");
// MAP_OBJECT (14) is not rendered when dynamically spawned by the 3.3.5 client.
// An empty TRAP is rendered normally and has no mouseover interaction or action.
const DECORATIVE_GO_TYPE = 6;

function dbcString(buffer: any, offset: number): string {
    let end = offset;
    while (end < buffer.length && buffer[end] != 0) end++;
    return buffer.toString("utf8", offset, end);
}

function importDisplayInfo(): void {
    const buffer = fs.readFileSync(DISPLAY_INFO_DBC);
    if (buffer.toString("ascii", 0, 4) != "WDBC") {
        throw new Error(`Invalid DBC magic in ${DISPLAY_INFO_DBC}`);
    }

    const rowCount = buffer.readUInt32LE(4);
    const fieldCount = buffer.readUInt32LE(8);
    const recordSize = buffer.readUInt32LE(12);
    if (fieldCount != 19 || recordSize != 76) {
        throw new Error(`Unexpected GameObjectDisplayInfo.dbc layout: ${fieldCount} fields, ${recordSize} bytes`);
    }

    const requiredDisplayIds: { [id: number]: boolean } = {};
    const templateSql = fs.readFileSync(TEMPLATE_SQL, "utf8");
    const templateInsert = /^INSERT INTO `gameobject_template` VALUES \((.*)\);$/gm;
    let templateMatch: RegExpExecArray | null;
    while ((templateMatch = templateInsert.exec(templateSql)) != null) {
        const values = parseSqlValues(templateMatch[1]);
        const entry = numberValue(values, 0);
        if (isPatchBuildingEntry(entry)) {
            requiredDisplayIds[numberValue(values, 2)] = true;
        }
    }

    const existingDisplayIds: { [id: number]: boolean } = {};
    DBC.GameObjectDisplayInfo.queryAll({}).forEach(row => {
        existingDisplayIds[row.ID.get()] = true;
    });

    const stringsOffset = 20 + rowCount * recordSize;

    for (let i = 0; i < rowCount; i++) {
        const rowOffset = 20 + i * recordSize;
        const id = buffer.readUInt32LE(rowOffset);
        if (!requiredDisplayIds[id] || existingDisplayIds[id]) continue;

        const sound: number[] = [];
        for (let j = 0; j < 10; j++) {
            sound.push(buffer.readInt32LE(rowOffset + (2 + j) * 4));
        }

        DBC.GameObjectDisplayInfo.add(id, {
            ModelName: dbcString(buffer, stringsOffset + buffer.readUInt32LE(rowOffset + 4)),
            Sound: sound,
            GeoBoxMinX: buffer.readFloatLE(rowOffset + 12 * 4),
            GeoBoxMinY: buffer.readFloatLE(rowOffset + 13 * 4),
            GeoBoxMinZ: buffer.readFloatLE(rowOffset + 14 * 4),
            GeoBoxMaxX: buffer.readFloatLE(rowOffset + 15 * 4),
            GeoBoxMaxY: buffer.readFloatLE(rowOffset + 16 * 4),
            GeoBoxMaxZ: buffer.readFloatLE(rowOffset + 17 * 4),
            ObjectEffectPackageID: buffer.readInt32LE(rowOffset + 18 * 4),
        });
        existingDisplayIds[id] = true;
    }

    Object.keys(requiredDisplayIds).forEach(rawId => {
        const id = Number(rawId);
        if (!existingDisplayIds[id]) {
            throw new Error(`Missing GameObjectDisplayInfo ${id} for the patch building catalog`);
        }
    });
    if (Object.keys(requiredDisplayIds).length == 0) {
        throw new Error("Patch building catalog did not resolve any display IDs");
    }
}

function parseSqlValues(raw: string): string[] {
    const values: string[] = [];
    let value = "";
    let inString = false;

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch == "\\" && inString && i + 1 < raw.length) {
            value += raw[i + 1];
            i++;
            continue;
        }
        if (ch == "'") {
            inString = !inString;
            continue;
        }
        if (ch == "," && !inString) {
            values.push(value.trim());
            value = "";
            continue;
        }
        value += ch;
    }

    values.push(value.trim());
    return values;
}

function numberValue(values: string[], index: number): number {
    return Number(values[index]);
}

function importTemplates(): void {
    const sql = fs.readFileSync(TEMPLATE_SQL, "utf8");
    const insert = /^INSERT INTO `gameobject_template` VALUES \((.*)\);$/gm;
    let match: RegExpExecArray | null;
    let imported = 0;

    while ((match = insert.exec(sql)) != null) {
        const values = parseSqlValues(match[1]);
        if (values.length != 35) {
            throw new Error(`Unexpected gameobject_template value count ${values.length}: ${match[0]}`);
        }
        const entry = numberValue(values, 0);
        if (!isPatchBuildingEntry(entry)) continue;

        const row: any = {
            // PatchForBuildings is a decoration catalog. GENERIC (5) templates
            // are client-interactive even when runtime flags say otherwise.
            type: DECORATIVE_GO_TYPE,
            displayId: numberValue(values, 2),
            name: values[3],
            IconName: values[4],
            castBarCaption: values[5],
            unk1: values[6],
            size: numberValue(values, 7),
            AIName: values[32],
            ScriptName: values[33],
            VerifiedBuild: numberValue(values, 34),
        };

        for (let i = 0; i <= 23; i++) row[`Data${i}`] = 0;

        SQL.gameobject_template.add(entry, row);
        imported++;
    }

    if (imported != PATCH_BUILDING_ENTRIES.length) {
        throw new Error(
            `Patch building catalog expected ${PATCH_BUILDING_ENTRIES.length} templates, found ${imported}`,
        );
    }
}

importDisplayInfo();
importTemplates();
