/** Persistent properties attached to one concrete item-instance GUID. */

import {
    ITEM_PROPERTY_CATALOG_VERSION,
    ITEM_PROPERTY_SOURCE_BASE_CRAFT,
    ITEM_PROPERTY_SOURCE_LEGACY_GUID,
    ItemPropertyRatings,
    isKnownItemProperty,
    isMakerMarkProperty,
    itemPropertyRatings,
} from "../shared/ItemProperties";
import { AFFIX_NONE, ItemAffixRoll, isAffixEligible, rollItemAffix } from "../shared/StatFormula";

const ITEM_CACHE_KEY = "custom-stats:item-property-cache";
const MAX_ITEM_PROPERTIES = 32;
const MAX_PROPERTY_VALUE = 1000000;
const UINT32_MAX = 4294967295;
const BRIDGE_MISSING_TIMEOUT_MS = 15000;
const externalItemMutation: { [guid: string]: number } = {};

export const PROPERTY_MUTATION_SUCCESS = 1;
export const PROPERTY_MUTATION_REJECTED = 2;

export const PROPERTY_REQUEST_NONCE_KEY = "custom-stats:property-request:nonce";
export const PROPERTY_REQUEST_ITEM_GUID_KEY = "custom-stats:property-request:item-guid";
export const PROPERTY_REQUEST_ITEM_ENTRY_KEY = "custom-stats:property-request:item-entry";
export const PROPERTY_REQUEST_PROPERTY_ID_KEY = "custom-stats:property-request:property-id";
export const PROPERTY_REQUEST_VALUE1_KEY = "custom-stats:property-request:value1";
export const PROPERTY_REQUEST_VALUE2_KEY = "custom-stats:property-request:value2";
export const PROPERTY_REQUEST_SOURCE_KIND_KEY = "custom-stats:property-request:source-kind";
export const PROPERTY_REQUEST_SOURCE_ID_KEY = "custom-stats:property-request:source-id";
export const PROPERTY_REQUEST_SOURCE_ENTRY_KEY = "custom-stats:property-request:source-entry";
export const PROPERTY_REQUEST_SOURCE_OWNER_KEY = "custom-stats:property-request:source-owner";
export const PROPERTY_REQUEST_ACK_NONCE_KEY = "custom-stats:property-request:ack-nonce";
export const PROPERTY_REQUEST_ACK_STATUS_KEY = "custom-stats:property-request:ack-status";

@CharactersTable
export class ItemInstanceState extends DBEntry {
    @DBPrimaryKey
    itemGuid: uint32 = 0;
    @DBField
    schemaVersion: uint32 = 0;
    @DBField
    revision: uint32 = 0;
    @DBField
    itemEntry: uint32 = 0;
    @DBField
    legacyAffixFrozen: uint32 = 0;
    @DBField
    createdAt: uint64 = 0;

    constructor(itemGuid: uint32) {
        super();
        this.itemGuid = itemGuid;
    }
}

@CharactersTable
export class ItemInstanceProperty extends DBArrayEntry {
    @DBPrimaryKey
    itemGuid: uint32 = 0;
    @DBField
    propertySerial: uint32 = 0;
    @DBField
    propertyId: uint32 = 0;
    @DBField
    value1: int32 = 0;
    @DBField
    value2: int32 = 0;
    @DBField
    sourceKind: uint32 = 0;
    @DBField
    sourceId: uint32 = 0;
    @DBField
    sourceEntry: uint32 = 0;
    @DBField
    sourceOwner: uint32 = 0;
    @DBField
    sourceNonce: uint32 = 0;
    @DBField
    flags: uint32 = 0;
    @DBField
    createdAt: uint64 = 0;

    constructor(itemGuid: uint32) {
        super();
        this.itemGuid = itemGuid;
    }
}

export interface ItemPropertyInput {
    propertyId: number;
    value1: number;
    value2: number;
    sourceKind: number;
    sourceId: number;
    sourceEntry: number;
    sourceOwner: number;
    sourceNonce: number;
    flags: number;
}

class CachedItemProperties {
    state: ItemInstanceState;
    properties: DBContainer<ItemInstanceProperty>;
    valid: boolean = true;
    externalRevision: number;

    constructor(itemGuid: number, itemEntry: number, externalRevision: number) {
        this.state = new ItemInstanceState(itemGuid);
        this.state.Load();
        this.properties = LoadDBArrayEntry(ItemInstanceProperty, itemGuid);
        this.externalRevision = externalRevision;
        if (this.state.itemEntry > 0 && this.state.itemEntry != itemEntry) this.valid = false;
    }
}

class ItemPropertyCache {
    byGuid: { [guid: string]: CachedItemProperties } = {};
}

function propertyCache(player: TSPlayer): ItemPropertyCache {
    return player.GetObject(ITEM_CACHE_KEY, new ItemPropertyCache());
}

function activeRows(record: CachedItemProperties): ItemInstanceProperty[] {
    const result: ItemInstanceProperty[] = [];
    const rows = record.properties.ToArray();
    for (let i = 0; i < rows.length; i++) {
        if (!rows[i].IsDeleted()) result.push(rows[i]);
    }
    return result;
}

function recordForGuid(
    player: TSPlayer,
    itemGuid: number,
    itemEntry: number,
): CachedItemProperties | undefined {
    if (itemGuid <= 0 || itemEntry <= 0) return undefined;
    const key = `${itemGuid}`;
    const cache = propertyCache(player);
    let record = cache.byGuid[key];
    const externalRevision = externalItemMutation[key] || 0;
    if (record === undefined || record.externalRevision != externalRevision) {
        record = new CachedItemProperties(itemGuid, itemEntry, externalRevision);
        cache.byGuid[key] = record;
    }
    return record.valid ? record : undefined;
}

function nextSerial(record: CachedItemProperties): number {
    const rows = activeRows(record);
    let serial = 0;
    for (let i = 0; i < rows.length; i++) serial = Math.max(serial, Number(rows[i].propertySerial));
    return serial < UINT32_MAX ? serial + 1 : 0;
}

function touchState(record: CachedItemProperties, itemEntry: number): void {
    record.state.schemaVersion = ITEM_PROPERTY_CATALOG_VERSION;
    record.state.itemEntry = itemEntry;
    if (record.state.createdAt <= 0) record.state.createdAt = GetUnixTime();
    record.state.revision = record.state.revision >= UINT32_MAX - 1
        ? 1
        : Number(record.state.revision) + 1;
    record.state.Save();
}

function legacyRow(record: CachedItemProperties): ItemInstanceProperty | undefined {
    const rows = activeRows(record);
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].sourceKind == ITEM_PROPERTY_SOURCE_LEGACY_GUID) return rows[i];
    }
    return undefined;
}

function freezeLegacyAffixForGuid(
    player: TSPlayer,
    itemGuid: number,
    itemEntry: number,
    itemClass: number,
    inventoryType: number,
    itemLevel: number,
    quality: number,
): CachedItemProperties | undefined {
    const record = recordForGuid(player, itemGuid, itemEntry);
    if (!record || record.state.legacyAffixFrozen > 0) return record;
    if (!isAffixEligible(itemClass, inventoryType, itemLevel)) return record;

    const affix = rollItemAffix(
        itemGuid,
        itemEntry,
        itemClass,
        inventoryType,
        itemLevel,
        quality,
    );
    if (affix.kind != AFFIX_NONE && !legacyRow(record)) {
        const serial = nextSerial(record);
        if (serial > 0) {
            const row = new ItemInstanceProperty(itemGuid);
            row.propertySerial = serial;
            row.propertyId = affix.kind;
            row.value1 = affix.value;
            row.sourceKind = ITEM_PROPERTY_SOURCE_LEGACY_GUID;
            row.sourceEntry = itemEntry;
            row.sourceNonce = itemGuid;
            row.createdAt = GetUnixTime();
            record.properties.Add(row);
            record.properties.Save();
        }
    }
    record.state.legacyAffixFrozen = 1;
    touchState(record, itemEntry);
    return record;
}

function freezeLegacyAffix(player: TSPlayer, item: TSItem): CachedItemProperties | undefined {
    return freezeLegacyAffixForGuid(
        player,
        Number(item.GetGUIDLow()),
        Number(item.GetEntry()),
        Number(item.GetClass()),
        Number(item.GetInventoryType()),
        Number(item.GetItemLevel()),
        Number(item.GetQuality()),
    );
}

function isUInt32(value: number): boolean {
    return value >= 0 && value <= UINT32_MAX && Math.floor(value) == value;
}

function validInput(input: ItemPropertyInput): boolean {
    return isKnownItemProperty(input.propertyId)
        && input.value1 > 0
        && input.value1 <= MAX_PROPERTY_VALUE
        && Math.floor(input.value1) == input.value1
        && Math.abs(input.value2) <= MAX_PROPERTY_VALUE
        && Math.floor(input.value2) == input.value2
        && isUInt32(input.sourceKind)
        && input.sourceKind > 0
        && isUInt32(input.sourceId)
        && isUInt32(input.sourceEntry)
        && isUInt32(input.sourceOwner)
        && isUInt32(input.sourceNonce)
        && input.sourceNonce > 0
        && isUInt32(input.flags);
}

function sourceMatch(row: ItemInstanceProperty, input: ItemPropertyInput): boolean {
    return row.sourceKind == input.sourceKind
        && row.sourceOwner == input.sourceOwner
        && row.sourceNonce == input.sourceNonce;
}

function payloadMatch(row: ItemInstanceProperty, input: ItemPropertyInput): boolean {
    return row.propertyId == input.propertyId
        && row.value1 == input.value1
        && row.value2 == input.value2
        && row.sourceId == input.sourceId
        && row.sourceEntry == input.sourceEntry
        && row.flags == input.flags;
}

export function listItemProperties(player: TSPlayer, item: TSItem): ItemInstanceProperty[] {
    const record = freezeLegacyAffix(player, item);
    return record ? activeRows(record) : [];
}

export function itemPropertyRevision(player: TSPlayer, item: TSItem): number {
    const record = freezeLegacyAffix(player, item);
    return record ? Number(record.state.revision) : 0;
}

export function legacyAffixForItem(player: TSPlayer, item: TSItem): ItemAffixRoll {
    const record = freezeLegacyAffix(player, item);
    const row = record ? legacyRow(record) : undefined;
    return row
        ? { kind: Number(row.propertyId), value: Number(row.value1) }
        : { kind: AFFIX_NONE, value: 0 };
}

export function ratingsForItem(player: TSPlayer, item: TSItem): ItemPropertyRatings {
    const total: ItemPropertyRatings = { vampirism: 0, thorns: 0, mastery: 0 };
    const rows = listItemProperties(player, item);
    for (let i = 0; i < rows.length; i++) {
        const contribution = itemPropertyRatings(rows[i].propertyId, rows[i].value1, rows[i].value2);
        total.vampirism += contribution.vampirism;
        total.thorns += contribution.thorns;
        total.mastery += contribution.mastery;
    }
    return total;
}

function addItemPropertyToRecord(
    record: CachedItemProperties | undefined,
    itemGuid: number,
    itemEntry: number,
    input: ItemPropertyInput,
): number {
    if (!validInput(input) || !record) return PROPERTY_MUTATION_REJECTED;

    const rows = activeRows(record);
    for (let i = 0; i < rows.length; i++) {
        if (!sourceMatch(rows[i], input)) continue;
        return payloadMatch(rows[i], input) ? PROPERTY_MUTATION_SUCCESS : PROPERTY_MUTATION_REJECTED;
    }
    if (rows.length >= MAX_ITEM_PROPERTIES) return PROPERTY_MUTATION_REJECTED;
    const serial = nextSerial(record);
    if (serial <= 0) return PROPERTY_MUTATION_REJECTED;

    const row = new ItemInstanceProperty(itemGuid);
    row.propertySerial = serial;
    row.propertyId = input.propertyId;
    row.value1 = input.value1;
    row.value2 = input.value2;
    row.sourceKind = input.sourceKind;
    row.sourceId = input.sourceId;
    row.sourceEntry = input.sourceEntry;
    row.sourceOwner = input.sourceOwner;
    row.sourceNonce = input.sourceNonce;
    row.flags = input.flags;
    row.createdAt = GetUnixTime();
    record.properties.Add(row);
    touchState(record, itemEntry);
    record.properties.Save();
    return PROPERTY_MUTATION_SUCCESS;
}

/** Add-once API. Replaying an identical source nonce succeeds without another row. */
export function addItemProperty(player: TSPlayer, item: TSItem, input: ItemPropertyInput): number {
    return addItemPropertyToRecord(
        freezeLegacyAffix(player, item),
        Number(item.GetGUIDLow()),
        Number(item.GetEntry()),
        input,
    );
}

function addItemPropertyByGuid(
    player: TSPlayer,
    itemGuid: number,
    itemEntry: number,
    input: ItemPropertyInput,
): number {
    const template = GetItemTemplate(itemEntry);
    if (!template) return PROPERTY_MUTATION_REJECTED;
    const status = addItemPropertyToRecord(
        freezeLegacyAffixForGuid(
            player,
            itemGuid,
            itemEntry,
            Number(template.GetClass()),
            Number(template.GetInventoryType()),
            Number(template.GetItemLevel()),
            Number(template.GetQuality()),
        ),
        itemGuid,
        itemEntry,
        input,
    );
    if (status == PROPERTY_MUTATION_SUCCESS) {
        const key = `${itemGuid}`;
        externalItemMutation[key] = (externalItemMutation[key] || 0) + 1;
    }
    return status;
}

export function replaceItemProperty(
    player: TSPlayer,
    item: TSItem,
    propertySerial: number,
    propertyId: number,
    value1: number,
    value2: number,
    flags: number,
): boolean {
    if (!isKnownItemProperty(propertyId)
        || value1 <= 0 || value1 > MAX_PROPERTY_VALUE || Math.floor(value1) != value1
        || Math.abs(value2) > MAX_PROPERTY_VALUE || Math.floor(value2) != value2
        || !isUInt32(flags)) return false;
    const record = freezeLegacyAffix(player, item);
    if (!record) return false;
    const rows = activeRows(record);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.propertySerial != propertySerial) continue;
        if (row.propertyId == propertyId && row.value1 == value1 && row.value2 == value2 && row.flags == flags) {
            return true;
        }
        row.propertyId = propertyId;
        row.value1 = value1;
        row.value2 = value2;
        row.flags = flags;
        row.MarkDirty();
        record.properties.Save();
        touchState(record, Number(item.GetEntry()));
        return true;
    }
    return false;
}

export function removeItemProperty(player: TSPlayer, item: TSItem, propertySerial: number): boolean {
    const record = freezeLegacyAffix(player, item);
    if (!record) return false;
    const rows = activeRows(record);
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].propertySerial != propertySerial) continue;
        rows[i].Delete();
        record.properties.Save();
        touchState(record, Number(item.GetEntry()));
        return true;
    }
    return false;
}

export function invalidateItemPropertyCache(player: TSPlayer, itemGuid: number): void {
    delete propertyCache(player).byGuid[`${itemGuid}`];
}

function deletePersistedItemProperties(player: TSPlayer, itemGuid: number): void {
    const properties = LoadDBArrayEntry(ItemInstanceProperty, itemGuid);
    const rows = properties.ToArray();
    for (let i = 0; i < rows.length; i++) rows[i].Delete();
    properties.Save();
    const state = new ItemInstanceState(itemGuid);
    if (state.Load()) state.Delete();
    invalidateItemPropertyCache(player, itemGuid);
}

function rejectBridge(player: TSPlayer, nonce: number): void {
    player.SetUInt(PROPERTY_REQUEST_ACK_STATUS_KEY, PROPERTY_MUTATION_REJECTED);
    player.SetUInt(PROPERTY_REQUEST_ACK_NONCE_KEY, nonce);
}

class MissingBridgeItem {
    nonce: number = 0;
    firstSeenAt: number = 0;
}

function missingBridgeItem(player: TSPlayer): MissingBridgeItem {
    return player.GetObject("custom-stats:property-request:missing", new MissingBridgeItem());
}

function missingBridgeExpired(player: TSPlayer, nonce: number): boolean {
    const pending = missingBridgeItem(player);
    const now = Number(GetUnixTime());
    if (pending.nonce != nonce || pending.firstSeenAt <= 0 || now < pending.firstSeenAt) {
        pending.nonce = nonce;
        pending.firstSeenAt = now;
        return false;
    }
    return now - pending.firstSeenAt >= BRIDGE_MISSING_TIMEOUT_MS;
}

function persistedItemEntry(itemGuid: number): number {
    const result = QueryCharacters(
        `SELECT itemEntry FROM item_instance WHERE guid = ${Math.floor(itemGuid)} LIMIT 1`,
    );
    return result.GetRow() ? Number(result.GetUInt32(0)) : 0;
}

function isBaseCraftPropertyTarget(itemEntry: number, propertyId: number): boolean {
    if (!isMakerMarkProperty(propertyId)) return false;
    const template = GetItemTemplate(itemEntry);
    return template !== undefined && isAffixEligible(
        Number(template.GetClass()),
        Number(template.GetInventoryType()),
        Number(template.GetItemLevel()),
    );
}

export function flushItemPropertyBridge(player: TSPlayer): void {
    const nonce = Number(player.GetUInt(PROPERTY_REQUEST_NONCE_KEY, 0));
    if (nonce <= 0) return;
    if (Number(player.GetUInt(PROPERTY_REQUEST_ACK_NONCE_KEY, 0)) == nonce
        && Number(player.GetUInt(PROPERTY_REQUEST_ACK_STATUS_KEY, 0)) > 0) return;

    const itemGuid = Number(player.GetUInt(PROPERTY_REQUEST_ITEM_GUID_KEY, 0));
    const itemEntry = Number(player.GetUInt(PROPERTY_REQUEST_ITEM_ENTRY_KEY, 0));
    const input: ItemPropertyInput = {
        propertyId: Number(player.GetUInt(PROPERTY_REQUEST_PROPERTY_ID_KEY, 0)),
        value1: Number(player.GetUInt(PROPERTY_REQUEST_VALUE1_KEY, 0)),
        value2: Number(player.GetUInt(PROPERTY_REQUEST_VALUE2_KEY, 0)),
        sourceKind: Number(player.GetUInt(PROPERTY_REQUEST_SOURCE_KIND_KEY, 0)),
        sourceId: Number(player.GetUInt(PROPERTY_REQUEST_SOURCE_ID_KEY, 0)),
        sourceEntry: Number(player.GetUInt(PROPERTY_REQUEST_SOURCE_ENTRY_KEY, 0)),
        sourceOwner: Number(player.GetUInt(PROPERTY_REQUEST_SOURCE_OWNER_KEY, 0)),
        sourceNonce: nonce,
        flags: 0,
    };
    if (itemGuid <= 0 || itemEntry <= 0 || !validInput(input)
        || input.sourceKind != ITEM_PROPERTY_SOURCE_BASE_CRAFT
        || input.sourceId <= 0 || input.sourceEntry <= 0
        || input.sourceOwner != Number(player.GetGUIDLow())
        || !isBaseCraftPropertyTarget(itemEntry, input.propertyId)) {
        rejectBridge(player, nonce);
        return;
    }

    // Inventory, equipment and both banks are available through GetItemByGUID.
    // Mail, trade and guild-bank transfers are resolved by the authoritative
    // item_instance row so properties continue following this exact GUID.
    const item = player.GetItemByGUID(itemGuid);
    if (item && Number(item.GetEntry()) != itemEntry) {
        rejectBridge(player, nonce);
        return;
    }
    let status = PROPERTY_MUTATION_REJECTED;
    if (item) {
        status = addItemProperty(player, item, input);
    } else {
        const persistedEntry = persistedItemEntry(itemGuid);
        if (persistedEntry <= 0) {
            // AddItem can precede its item_instance flush. Give that transient
            // state a bounded window; permanent disappearance is quarantined.
            if (missingBridgeExpired(player, nonce)) rejectBridge(player, nonce);
            return;
        }
        if (persistedEntry != itemEntry) {
            rejectBridge(player, nonce);
            return;
        }
        status = addItemPropertyByGuid(player, itemGuid, itemEntry, input);
    }
    player.SetUInt(PROPERTY_REQUEST_ACK_STATUS_KEY, status);
    player.SetUInt(PROPERTY_REQUEST_ACK_NONCE_KEY, nonce);
}

const pendingDestroyChecks: { [playerGuid: string]: number[] } = {};

function processDestroyChecks(player: TSPlayer): void {
    const key = `${Number(player.GetGUIDLow())}`;
    const pending = pendingDestroyChecks[key];
    if (pending === undefined) return;
    delete pendingDestroyChecks[key];
    for (let i = 0; i < pending.length; i++) {
        if (!player.GetItemByGUID(pending[i])) deletePersistedItemProperties(player, pending[i]);
    }
}

function queueDestroyCheck(player: TSPlayer, itemGuid: number): void {
    const playerKey = `${Number(player.GetGUIDLow())}`;
    let queue = pendingDestroyChecks[playerKey];
    if (queue === undefined) {
        queue = [];
        pendingDestroyChecks[playerKey] = queue;
    }
    for (let i = 0; i < queue.length; i++) {
        if (queue[i] == itemGuid) return;
    }
    queue.push(itemGuid);
    player.AddTimer(1, 1, (owner, timer) => {
        const current = owner.ToPlayer();
        if (current) processDestroyChecks(current);
    });
}

export function RegisterItemProperties(events: TSEvents): void {
    events.Item.OnRemove((item, player, cancel) => {
        invalidateItemPropertyCache(player, Number(item.GetGUIDLow()));
    });
    events.Item.OnDestroyEarly((item, player, canDestroy) => {
        if (canDestroy.get()) queueDestroyCheck(player, Number(item.GetGUIDLow()));
    });
    events.Player.OnLogout(player => {
        processDestroyChecks(player);
    });
}
