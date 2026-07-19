const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "echoes.ts"), "utf8");
const expected = [
    "strength-training", "agility-boost", "mind-expansion", "spiritual-fortitude",
    "iron-constitution", "mana-regeneration", "reinforced-shielding", "mystic-potency",
    "brutal-might", "warm-blooded", "hardened-skin", "hardened-resolve", "swift-step",
    "enhanced-recovery", "keen-aim", "crushing-force", "quick-hands", "armor-penetration",
    "expertise-drills", "mana-reservoir", "steady-channeling", "steady-casting",
    "subtle-presence", "provoking-presence", "efficient-casting", "glass-canon", "leadfoot",
    "fortress-soul", "the-last-wall", "overwhelming-restoration",
];
const actual = [...source.matchAll(/UTAG\("echoes", "spell\/([^"]+)"\)/g)]
    .map(match => match[1])
    .filter(key => expected.includes(key));

assert.deepEqual(actual, expected, "literal spell tags must stay aligned with ECHOES");
assert.match(source, /offer\.Save\(\);[\s\S]*return true;/, "offers must be saved before use");
assert.match(source, /OnCheckCast\(ECHO_CHOICE_USE_SPELL/);
assert.match(source, /OnEffect\(ECHO_RESET_USE_SPELL/);
assert.doesNotMatch(source, /earnedEchoPicks|PLAYER_LEVEL_UP/);
assert.doesNotMatch(source, /AddTimer|setTimeout/, "runtime must not capture players in timers");

const reconcileCollectionSource = source.match(
    /function reconcileCollection\([\s\S]*?(?=\nfunction appendCollectionState)/,
)[0];
assert.doesNotMatch(
    reconcileCollectionSource,
    /rows\.push\(undefined\)|rows\.length/,
    "Lua sparse collection rows must never depend on nil insertion or the # operator",
);
assert.equal(
    [...reconcileCollectionSource.matchAll(
        /for \(let i = 0; i < COLLECTION_ECHOES\.length; i\+\+\)/g,
    )].length,
    2,
    "collection reconciliation must validate and synchronize every catalog index",
);
console.log("Echo runtime contract OK");
