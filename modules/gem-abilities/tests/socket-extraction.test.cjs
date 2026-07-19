const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));

function loadTsModule(file, globals = {}, moduleRequire = require) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
    }).outputText;
    const module = { exports: {} };
    const names = ["exports", "module", "require", ...Object.keys(globals)];
    const values = [module.exports, module, moduleRequire, ...Object.values(globals)];
    new Function(...names, output)(...values);
    return module.exports;
}

function createPacket(opcode) {
    return {
        opcode,
        values: [],
        WriteDouble(value) { this.values.push(value); },
    };
}

function packetReader(values) {
    let index = 0;
    return {
        ReadDouble() { return values[index++]; },
        consumed() { return index; },
    };
}

const moduleRoot = path.join(__dirname, "..");
const messages = loadTsModule(path.join(moduleRoot, "shared/SocketMessages.ts"), {
    CreateCustomPacket: createPacket,
});

const request = new messages.GemExtractRequest(messages.GEM_LOCATION_CONTAINER, 4, 12);
const packet = request.write();
const decoded = new messages.GemExtractRequest();
const reader = packetReader(packet.values);
decoded.read(reader);
assert.deepStrictEqual(decoded, request);
assert.strictEqual(packet.opcode, 85);
assert.strictEqual(messages.OP_GEM_EXTRACT, 85);
assert.strictEqual(reader.consumed(), packet.values.length);

assert.deepStrictEqual(
    messages.resolveSocketItemPosition(messages.GEM_LOCATION_EQUIPMENT, 0, 1),
    [255, 0],
);
assert.deepStrictEqual(
    messages.resolveSocketItemPosition(messages.GEM_LOCATION_EQUIPMENT, 0, 19),
    [255, 18],
);
assert.deepStrictEqual(
    messages.resolveSocketItemPosition(messages.GEM_LOCATION_CONTAINER, 0, 1),
    [255, 23],
);
assert.deepStrictEqual(
    messages.resolveSocketItemPosition(messages.GEM_LOCATION_CONTAINER, 4, 1),
    [22, 0],
);
for (const invalid of [
    [messages.GEM_LOCATION_EQUIPMENT, 0, 0],
    [messages.GEM_LOCATION_EQUIPMENT, 1, 1],
    [messages.GEM_LOCATION_CONTAINER, 0, 17],
    [messages.GEM_LOCATION_CONTAINER, 5, 1],
    [messages.GEM_LOCATION_CONTAINER, 1, 1.5],
    [99, 0, 1],
]) {
    assert.deepStrictEqual(messages.resolveSocketItemPosition(...invalid), []);
}

const generatedPool = loadTsModule(path.join(moduleRoot, "livescripts/generated_pool.ts"));
const maps = loadTsModule(
    path.join(moduleRoot, "livescripts/maps.ts"),
    {},
    requestPath => requestPath === "./generated_pool" ? generatedPool : require(requestPath),
);
maps.buildMaps();
const allRows = generatedPool.GEN_POOL.concat(generatedPool.GEN_EXOTIC);
assert(allRows.length > 0);
for (const row of allRows) {
    assert(row[1] > 0 && row[2] > 0);
    assert.strictEqual(maps.itemForEnchant(row[2]), row[1]);
}
assert.strictEqual(maps.itemForEnchant(0), 0);
assert.strictEqual(maps.itemForEnchant(0x7fffffff), 0);

let gemByEnchant = new Map();
let staticSocketCount = 3;
let disabledItems = [];
let recomputedPlayers = [];
const extraction = loadTsModule(
    path.join(moduleRoot, "livescripts/extraction.ts"),
    {},
    requestPath => {
        if (requestPath === "../shared/SocketMessages") return messages;
        if (requestPath === "./fill") return {
            disableAutoFill(item) { disabledItems.push(item); },
            templateSocketCount() { return staticSocketCount; },
        };
        if (requestPath === "./grant") return {
            recomputeAbilities(player) { recomputedPlayers.push(player); },
        };
        if (requestPath === "./maps") return {
            itemForEnchant(enchant) { return gemByEnchant.get(enchant) || 0; },
        };
        return require(requestPath);
    },
);

function createItem(enchantments, clearFailsAt = 0) {
    const live = new Map(Object.entries(enchantments).map(([slot, enchant]) => [Number(slot), enchant]));
    return {
        live,
        clearCalls: [],
        setCalls: [],
        saveCalls: 0,
        GetTemplate() { return {}; },
        GetEnchantmentID(slot) { return live.get(slot) || 0; },
        // Trinity's IsLocked means "a lockable item has not been unlocked",
        // not "the item is busy". Ordinary equipment commonly returns true.
        IsLocked() { return true; },
        IsInTrade() { return false; },
        ClearEnchantment(slot) {
            this.clearCalls.push(slot);
            if (slot === clearFailsAt) return false;
            if (!live.get(slot)) return false;
            live.set(slot, 0);
            return true;
        },
        SetEnchantment(enchant, slot) {
            this.setCalls.push([enchant, slot]);
            live.set(slot, enchant);
            return true;
        },
        SaveToDB() { this.saveCalls++; },
    };
}

function createPlayer(item, addResults) {
    return {
        addResults: addResults.slice(),
        addCalls: [],
        removeCalls: [],
        messages: [],
        IsAlive() { return true; },
        IsInCombat() { return false; },
        GetItemByPos() { return item; },
        AddItem(entry, count) {
            this.addCalls.push([entry, count]);
            return this.addResults.shift();
        },
        RemoveItem(added, count) { this.removeCalls.push([added, count]); },
        SendBroadcastMessage(message) { this.messages.push(message); },
    };
}

function resetRuntimeState() {
    gemByEnchant = new Map([[101, 1001], [102, 1002]]);
    staticSocketCount = 3;
    disabledItems = [];
    recomputedPlayers = [];
}

const extractionRequest = new messages.GemExtractRequest(
    messages.GEM_LOCATION_EQUIPMENT, 0, 1,
);

// A partial bag reservation must roll back without touching the sockets.
resetRuntimeState();
const reservedFirst = { id: "first" };
const bagFailureItem = createItem({ 2: 101, 3: 102 });
const bagFailurePlayer = createPlayer(bagFailureItem, [reservedFirst, undefined]);
extraction.extractAbilityGems(bagFailurePlayer, extractionRequest);
assert.deepStrictEqual(bagFailurePlayer.addCalls, [[1001, 1], [1002, 1]]);
assert.deepStrictEqual(bagFailurePlayer.removeCalls, [[reservedFirst, 1]]);
assert.deepStrictEqual(bagFailureItem.clearCalls, []);
assert.deepStrictEqual(disabledItems, []);
assert.deepStrictEqual(recomputedPlayers, []);

// A rare ClearEnchantment failure restores already-cleared sockets and removes
// every reserved gem, leaving neither a marker nor a learned-spell recompute.
resetRuntimeState();
const clearFirst = { id: "clear-first" };
const clearSecond = { id: "clear-second" };
const clearFailureItem = createItem({ 2: 101, 3: 102 }, 3);
const clearFailurePlayer = createPlayer(clearFailureItem, [clearFirst, clearSecond]);
extraction.extractAbilityGems(clearFailurePlayer, extractionRequest);
assert.deepStrictEqual(clearFailureItem.clearCalls, [2, 3]);
assert.deepStrictEqual(clearFailureItem.setCalls, [[101, 2]]);
assert.strictEqual(clearFailureItem.GetEnchantmentID(2), 101);
assert.strictEqual(clearFailureItem.GetEnchantmentID(3), 102);
assert.deepStrictEqual(clearFailurePlayer.removeCalls, [[clearSecond, 1], [clearFirst, 1]]);
assert.deepStrictEqual(disabledItems, []);
assert.deepStrictEqual(recomputedPlayers, []);

// Success extracts only catalogued ability gems, leaves an ordinary gem, drops
// the now-invalid static socket bonus, persists the anti-refill marker and syncs spells.
resetRuntimeState();
const successItem = createItem({ 2: 101, 3: 102, 4: 999, 5: 500 });
const successPlayer = createPlayer(successItem, [{ id: "one" }, { id: "two" }]);
extraction.extractAbilityGems(successPlayer, extractionRequest);
assert.deepStrictEqual(successItem.clearCalls, [2, 3, 5]);
assert.strictEqual(successItem.GetEnchantmentID(2), 0);
assert.strictEqual(successItem.GetEnchantmentID(3), 0);
assert.strictEqual(successItem.GetEnchantmentID(4), 999);
assert.strictEqual(successItem.GetEnchantmentID(5), 0);
assert.strictEqual(successItem.saveCalls, 1);
assert.deepStrictEqual(disabledItems, [successItem]);
assert.deepStrictEqual(recomputedPlayers, [successPlayer]);

// Removing only an extra prismatic socket must preserve a valid static bonus.
resetRuntimeState();
staticSocketCount = 1;
gemByEnchant = new Map([[102, 1002]]);
const prismaticItem = createItem({ 2: 999, 4: 102, 5: 500 });
const prismaticPlayer = createPlayer(prismaticItem, [{ id: "extra" }]);
extraction.extractAbilityGems(prismaticPlayer, extractionRequest);
assert.deepStrictEqual(prismaticItem.clearCalls, [4]);
assert.strictEqual(prismaticItem.GetEnchantmentID(5), 500);

const extractionSource = fs.readFileSync(path.join(moduleRoot, "livescripts/extraction.ts"), "utf8");
const fillSource = fs.readFileSync(path.join(moduleRoot, "livescripts/fill.ts"), "utf8");
const livescriptsSource = fs.readFileSync(path.join(moduleRoot, "livescripts/livescripts.ts"), "utf8");
const addonSource = fs.readFileSync(path.join(moduleRoot, "addon/socketing.ts"), "utf8");
assert.match(extractionSource, /player\.IsAlive\(\)/);
assert.match(extractionSource, /player\.IsInCombat\(\)/);
assert.doesNotMatch(extractionSource, /item\.IsLocked\(\)/);
assert.match(extractionSource, /item\.IsInTrade\(\)/);
assert(extractionSource.indexOf("player.AddItem") < extractionSource.indexOf("item.ClearEnchantment"));
assert.match(extractionSource, /removeAddedItems\(player, added\)/);
assert.match(extractionSource, /disableAutoFill\(item\)/);
assert.match(extractionSource, /removedStaticSocket.*BONUS_ENCHANTMENT_SLOT/s);
assert.match(fillSource, /class GemAutoFillDisabled extends DBEntry/);
assert.match(fillSource, /if \(autoFillDisabled\(item\)\) return/);
assert.match(
    livescriptsSource,
    /events\.Player\.OnLogin\([\s\S]*GetEquippedItemBySlot\(slot\)[\s\S]*fillSockets\(item\)[\s\S]*recomputeAbilities\(player\)/,
    "equipped starter gear must be filled before login ability recomputation",
);
assert.match(addonSource, /"ItemSocketingFrame_LoadUI"/);
assert.match(addonSource, /"SocketInventoryItem"/);
assert.match(addonSource, /"SocketContainerItem"/);
assert.match(addonSource, /GetNewSocketInfo\(i\)/);
assert.match(addonSource, /Извлечь камни/);

console.log("ability gem extraction protocol, location mapping and safety invariants: ok");
