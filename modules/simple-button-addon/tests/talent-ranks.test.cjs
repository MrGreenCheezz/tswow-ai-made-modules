const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "addon", "addon.ts"), "utf8");
const talents = [...source.matchAll(
    /\{ id: "([^"]+)", name: "[^"]+", spell: (\d+), rank: "(\d+)\/(\d+)"/g,
)].map(match => ({
    id: match[1],
    spell: Number(match[2]),
    shownRank: Number(match[3]),
    maxRank: Number(match[4]),
}));

// Max-rank IDs from TrinityCore's canonical 3.3.5 spell_ranks chains.
const maxRankBySpell = new Map([
    [16818, 5], [57814, 5], [16847, 3], [35364, 2], [16822, 2], [16840, 3],
    [61346, 3], [16820, 2], [16913, 5], [16924, 3], [33591, 3], [57851, 3],
    [33956, 3], [16899, 3], [33596, 2], [48396, 3], [33602, 3], [48393, 3],
    [33607, 5], [48525, 3], [48514, 2], [48511, 3], [16938, 5], [16862, 5],
    [16949, 3], [16999, 2], [16931, 3], [24866, 2], [16944, 3], [16968, 2],
    [16975, 3], [37117, 2], [48410, 2], [16941, 2], [33873, 2], [57881, 3],
    [24894, 5], [33856, 3], [34300, 2], [33957, 3], [57877, 3], [33867, 3],
    [48485, 3], [48495, 3], [48491, 3], [51269, 5],
]);

const multiRankTalents = talents.filter(talent => talent.maxRank > 1);
assert.equal(multiRankTalents.length, 46);
for (const talent of multiRankTalents) {
    assert.equal(talent.shownRank, talent.maxRank, `${talent.id} is not displayed as fully ranked`);
    assert.equal(
        maxRankBySpell.get(talent.spell),
        talent.maxRank,
        `${talent.id} does not use its exact max-rank spell ID`,
    );
}
assert.equal(talents.find(talent => talent.id === "feral-charge").spell, 49377);

console.log("simple-button talent rank checks passed");
