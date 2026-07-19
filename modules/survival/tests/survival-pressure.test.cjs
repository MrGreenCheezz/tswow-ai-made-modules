const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));

const source = fs.readFileSync(path.join(__dirname, "../livescripts/survival.ts"), "utf8");
const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const moduleUnderTest = { exports: {} };
const oldUtag = global.UTAG;
global.UTAG = () => 1;
class FakeSurvivalData {
    static get(player) {
        return player.data;
    }
}
new Function("exports", "module", "require", output)(
    moduleUnderTest.exports,
    moduleUnderTest,
    id => {
        if (id === "../shared/SurvivalMessages") {
            return { OP_SURVIVAL_REQUEST: 60, SurvivalState: class {} };
        }
        if (id === "./survival-db") return { SurvivalData: FakeSurvivalData };
        throw new Error(`unexpected import ${id}`);
    },
);
global.UTAG = oldUtag;

const stage = moduleUnderTest.exports.survivalStage;
assert.deepStrictEqual(
    [100, 51, 50, 26, 25, 1, 0, -1].map(stage),
    [0, 0, 1, 1, 2, 2, 3, 3],
);

function makeInfo(auras, options = {}) {
    return {
        GetAttributes: () => options.attributes ?? 0x18000100,
        GetInterruptFlags: () => options.interruptFlags ?? 0x1,
        GetAuraInterruptFlags: () => options.auraInterruptFlags ?? 0x40080,
        GetEffect: index => ({ GetAura: () => auras[index] ?? 0 }),
        GetSpellLevel: () => options.spellLevel ?? 40,
        GetBaseLevel: () => options.baseLevel ?? 40,
    };
}

const foodDrinkKind = moduleUnderTest.exports.foodDrinkKind;
assert.strictEqual(foodDrinkKind(makeInfo([84])), 1);
assert.strictEqual(foodDrinkKind(makeInfo([85])), 2);
assert.strictEqual(foodDrinkKind(makeInfo([84, 85])), 3);
assert.strictEqual(foodDrinkKind(makeInfo([84], {
    attributes: 0x10000100,
    auraInterruptFlags: 0x10d,
})), 1); // underwater food
assert.strictEqual(foodDrinkKind(makeInfo([84], {
    attributes: 0x1c000100,
    auraInterruptFlags: 0x2,
})), 1); // stationary special food
assert.strictEqual(foodDrinkKind(makeInfo([85], { attributes: 0 })), 0);
assert.strictEqual(foodDrinkKind(makeInfo([85], { interruptFlags: 0 })), 0);
assert.strictEqual(foodDrinkKind(makeInfo([85], {
    attributes: 0x18000000,
    auraInterruptFlags: 0x3c8d,
})), 0); // combat mana-regeneration aura, not a drink

let afterCast;
const noop = () => {};
moduleUnderTest.exports.RegisterSurvival({
    GameObject: { OnGossipHello: noop },
    Creature: { OnGenerateLoot: noop },
    Player: { OnLogin: noop, OnSave: noop },
    Spell: { OnAfterCast: callback => { afterCast = callback; } },
    CustomPacket: { OnReceive: noop },
});

const timers = new Map();
const activeAuras = new Set();
const messages = [];
const objects = new Map();
const data = {
    hunger: 10,
    thirst: 20,
    saves: 0,
    Save() { this.saves++; },
};
const player = {
    data,
    GetLevel: () => 80,
    AddNamedTimer: (name, delay, repeats, callback) => {
        timers.set(name, { name, delay, repeats, callback });
    },
    HasAura: spellId => activeAuras.has(spellId),
    GetObject: (key, fallback) => {
        if (!objects.has(key)) objects.set(key, fallback);
        return objects.get(key);
    },
    SendBroadcastMessage: message => messages.push(message),
};
const owner = { ToPlayer: () => player };
function makeSpell(auras, entry, options = {}) {
    return {
        GetCaster: () => ({ ToPlayer: () => player }),
        GetSpellInfo: () => makeInfo(auras, { spellLevel: 8, baseLevel: 8, ...options }),
        GetEntry: () => entry,
    };
}

function fireTimer(name, stopped) {
    timers.get(name).callback(owner, { Stop: () => stopped.add(name) });
}

afterCast(makeSpell([84], 701), {});
afterCast(makeSpell([85], 702), {});
assert.deepStrictEqual([data.hunger, data.thirst, data.saves], [10, 20, 0]);
assert.deepStrictEqual([...timers.keys()].sort(), ["survival-consume-drink", "survival-consume-food"]);
assert.deepStrictEqual(
    [...timers.values()].map(timer => [timer.delay, timer.repeats]),
    [[8000, 0x0fffffff], [8000, 0x0fffffff]],
);

const stopped = new Set();
fireTimer("survival-consume-food", stopped);
fireTimer("survival-consume-drink", stopped); // movement removed both native auras
assert.deepStrictEqual([data.hunger, data.thirst, data.saves], [10, 20, 0]);
assert.deepStrictEqual([...stopped].sort(), ["survival-consume-drink", "survival-consume-food"]);

afterCast(makeSpell([84], 701), {});
afterCast(makeSpell([85], 702), {});
activeAuras.add(701);
activeAuras.add(702);
fireTimer("survival-consume-food", stopped);
fireTimer("survival-consume-drink", stopped);
assert.deepStrictEqual([data.hunger, data.thirst, data.saves], [20, 30, 2]);
assert.strictEqual(messages.length, 2);

fireTimer("survival-consume-food", stopped);
fireTimer("survival-consume-drink", stopped);
assert.deepStrictEqual([data.hunger, data.thirst, data.saves], [30, 40, 4]);
assert.strictEqual(messages.length, 4);

activeAuras.delete(701);
fireTimer("survival-consume-food", stopped);
fireTimer("survival-consume-drink", stopped);
assert.deepStrictEqual([data.hunger, data.thirst, data.saves], [30, 50, 5]);

data.thirst = 98;
fireTimer("survival-consume-drink", stopped);
assert.deepStrictEqual([data.thirst, data.saves, messages.length], [100, 6, 6]);
assert.match(messages.at(-1), /\+2 вода/);
fireTimer("survival-consume-drink", stopped);
assert.deepStrictEqual([data.thirst, data.saves, messages.length], [100, 6, 6]);

afterCast(makeSpell([85], 703, { attributes: 0 }), {});
assert.strictEqual(timers.size, 2);

console.log("survival thresholds, consumable signature and independent periodic restore: ok");
