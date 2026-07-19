const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require(path.resolve(__dirname, "../../../node_modules/typescript"));

function loadTypeScriptModule(file) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    const module = { exports: {} };
    Function("module", "exports", "require", output)(module, module.exports, require);
    return module.exports;
}

const catalog = loadTypeScriptModule(path.resolve(__dirname, "../shared/ItemProperties.ts"));
const messages = loadTypeScriptModule(path.resolve(__dirname, "../shared/StatMessages.ts"));

assert.deepEqual(catalog.ITEM_PROPERTY_IDS, [1, 2, 3, 1001, 1002, 1003, 1004, 1005, 1006, 1007]);
assert.deepEqual(
    [messages.OP_AFFIX_REQUEST, messages.OP_AFFIX, messages.OP_ITEM_PROPERTIES_REQUEST, messages.OP_ITEM_PROPERTIES],
    [76, 77, 97, 98],
);
assert.equal(catalog.ITEM_PROPERTY_SOURCE_LEGACY_GUID, 1);
assert.equal(catalog.ITEM_PROPERTY_SOURCE_BASE_CRAFT, 2);

for (const propertyId of catalog.ITEM_PROPERTY_IDS) {
    assert.equal(catalog.isKnownItemProperty(propertyId), true);
    assert.ok(catalog.itemPropertyTooltipRu(propertyId, 17, 0).includes("+17"));
    const ratings = catalog.itemPropertyRatings(propertyId, 17, 0);
    assert.equal(
        ratings.vampirism + ratings.thorns + ratings.mastery,
        17,
        `property ${propertyId} must preserve its stored total`,
    );
}
assert.deepEqual(catalog.itemPropertyRatings(1004, 5, 0), { vampirism: 3, thorns: 0, mastery: 2 });
assert.deepEqual(catalog.itemPropertyRatings(1007, 8, 0), { vampirism: 3, thorns: 3, mastery: 2 });
assert.equal(catalog.itemPropertyTooltipRu(1007, 8, 0).split("+").length, 2, "a maker mark stays one line");

const storeSource = fs.readFileSync(path.resolve(__dirname, "../livescripts/item-properties.ts"), "utf8");
assert.match(storeSource, /class ItemInstanceState extends DBEntry/);
assert.match(storeSource, /class ItemInstanceProperty extends DBArrayEntry/);
assert.equal((storeSource.match(/@CharactersTable/g) || []).length, 2);
assert.match(storeSource, /legacyAffixFrozen/);
assert.match(storeSource, /rollItemAffix\(/);
assert.match(storeSource, /sourceNonce/);
assert.match(storeSource, /payloadMatch/);
assert.match(storeSource, /SELECT itemEntry FROM item_instance WHERE guid/);
assert.match(storeSource, /BRIDGE_MISSING_TIMEOUT_MS = 15000/);
assert.match(storeSource, /persistedItemEntry\(itemGuid\)/);
assert.match(storeSource, /isMakerMarkProperty\(propertyId\)/);
assert.match(storeSource, /addItemPropertyByGuid\(player, itemGuid, itemEntry, input\)/);
assert.match(storeSource, /record\.externalRevision != externalRevision/);
assert.match(storeSource, /externalItemMutation\[key\] = \(externalItemMutation\[key\] \|\| 0\) \+ 1/);
const genericAddSource = storeSource.substring(
    storeSource.indexOf("export function addItemProperty("),
    storeSource.indexOf("function addItemPropertyByGuid("),
);
assert.doesNotMatch(genericAddSource, /isAffixEligible/, "the generic GUID store must not be gear-only");
assert.match(storeSource, /record\.properties\.Save\(\);[\s\S]*?PROPERTY_REQUEST_ACK_STATUS_KEY/);
assert.match(storeSource, /events\.Item\.OnRemove[\s\S]*?invalidateItemPropertyCache/);
assert.match(storeSource, /events\.Item\.OnDestroyEarly[\s\S]*?queueDestroyCheck/);
assert.match(storeSource, /if \(!player\.GetItemByGUID\(pending\[i\]\)\) deletePersistedItemProperties/);
assert.match(storeSource, /events\.Player\.OnLogout[\s\S]*?processDestroyChecks/);
assert.doesNotMatch(storeSource, /OnRemove[\s\S]{0,250}deletePersistedItemProperties/);

for (const key of [
    "nonce", "item-guid", "item-entry", "property-id", "value1", "value2",
    "source-kind", "source-id", "source-entry", "source-owner", "ack-nonce", "ack-status",
]) {
    assert.ok(storeSource.includes(`custom-stats:property-request:${key}`), `bridge key ${key} is missing`);
}

const coreSource = fs.readFileSync(path.resolve(__dirname, "../livescripts/stats-core.ts"), "utf8");
assert.match(coreSource, /ratingsForItem\(player, item\)/);
assert.match(coreSource, /flushItemPropertyBridge\(player\)/);
assert.match(coreSource, /OnReceive\(OP_AFFIX_REQUEST/);
assert.match(coreSource, /OnReceive\(OP_ITEM_PROPERTIES_REQUEST/);
assert.match(coreSource, /state\.requestToken = request\.requestToken/);
assert.doesNotMatch(coreSource, /rollItemAffix\(/);
const sendItemPropertiesSource = coreSource.slice(
    coreSource.indexOf("function sendItemProperties("),
    coreSource.indexOf("export function RegisterStatsCore("),
);
assert.match(
    sendItemPropertiesSource,
    /flushItemPropertyBridge\(player\);[\s\S]*?new ItemPropertiesState\(\)/,
    "a tooltip snapshot must include a just-published crafted property",
);

const resolverSource = fs.readFileSync(path.resolve(__dirname, "../livescripts/item-affixes.ts"), "utf8");
assert.match(resolverSource, /slot >= BANK_SLOT_ITEM_START \+ 1 && slot <= BANK_SLOT_ITEM_END/);
assert.match(resolverSource, /GetItemByPos\(INVENTORY_SLOT_BAG_0, slot - 1\)/);

const addonSource = fs.readFileSync(path.resolve(__dirname, "../addon/stats-ui.ts"), "utf8");
assert.match(addonSource, /new ItemPropertiesRequest\(location, bag, slot, hoverRequestToken\)/);
assert.match(addonSource, /state\.requestToken == hoverRequestToken/);
assert.match(addonSource, /for \(let i = 0; i < state\.properties\.length; i\+\+\)/);
assert.match(addonSource, /OnCustomPacket\(OP_ITEM_PROPERTIES/);
const addPropertiesSource = addonSource.slice(
    addonSource.indexOf("function addProperties("),
    addonSource.indexOf("function requestProperties("),
);
assert.equal(
    (addPropertiesSource.match(/GameTooltip\.Show\(\)/g) || []).length,
    1,
    "all property lines must resize the tooltip only once",
);
assert.match(addPropertiesSource, /if \(added\)[\s\S]*?GameTooltip\.Show\(\);[\s\S]*?pauseTooltipRefresh\(\)/);
assert.match(addonSource, /function pauseTooltipRefresh\(\)[\s\S]*?updateTooltip = 0x7fffffff/);
assert.match(addonSource, /function resumeTooltipRefresh\(\)[\s\S]*?if \(!tooltipRefreshPaused\) return;[\s\S]*?updateTooltip = 0/);
const requestPropertiesSource = addonSource.slice(
    addonSource.indexOf("function requestProperties("),
    addonSource.indexOf("function clearShownPropertyLines("),
);
assert.match(addonSource, /let hoverState: ItemPropertiesState \| undefined/);
assert.match(requestPropertiesSource, /const sameHover = location == hoverLocation/);
assert.match(requestPropertiesSource, /if \(hoverState !== undefined\)[\s\S]*?addProperties\(hoverState/);
assert.match(requestPropertiesSource, /if \(hoverRequestToken > 0\) return;/);
const clearLinesSource = addonSource.slice(
    addonSource.indexOf("function clearShownPropertyLines("),
    addonSource.indexOf("function clearItemCache("),
);
assert.doesNotMatch(clearLinesSource, /hoverRequestToken|hoverState/);
assert.match(addonSource, /HookScript\("OnTooltipCleared", clearShownPropertyLines\)/);
assert.match(addonSource, /HookScript\("OnHide", clearItemCache\)/);
assert.match(addonSource, /RegisterEvent\("PLAYERBANKSLOTS_CHANGED"\)/);
assert.match(addonSource, /RegisterEvent\("PLAYERBANKBAGSLOTS_CHANGED"\)/);
assert.match(addonSource, /event == "PLAYERBANKSLOTS_CHANGED"[\s\S]*?event == "PLAYERBANKBAGSLOTS_CHANGED"[\s\S]*?clearItemCache\(\)/);
assert.match(addonSource, /RegisterEvent\("MODIFIER_STATE_CHANGED"\)/);
assert.match(addonSource, /event == "MODIFIER_STATE_CHANGED"[\s\S]*?resumeTooltipRefresh\(\);[\s\S]*?return;/);
assert.match(addonSource, /state\.itemEntry == hoverEntry[\s\S]*?tooltipHasTrackedItem[\s\S]*?GameTooltip\.IsShown\(\)/);
assert.match(addonSource, /hoverRequestToken = 0;[\s\S]*?hoverState = state;[\s\S]*?addProperties\(state/);
assert.doesNotMatch(addonSource, /new AffixRequest/);

const messageSource = fs.readFileSync(path.resolve(__dirname, "../shared/StatMessages.ts"), "utf8");
assert.match(messageSource, /class ItemPropertiesRequest[\s\S]*?requestToken/);
assert.match(messageSource, /class ItemPropertiesState[\s\S]*?requestToken/);

console.log("custom-stats persistent item-property contracts: ok");
