/**
 * craft-all: make every equippable weapon/armor item craftable by a fitting
 * profession. For each item we clone the "shape" of the EXISTING recipe of
 * that profession whose output item level is closest: required skill,
 * skill-up thresholds, cast time, icon/visual and station. Material comes
 * from the closest original equipment recipe of the same profession/category:
 * only its dominant primary reagent is used, scaled by relative quality
 * (green ×1 … epic ×5).
 *
 * Recipes are auto-learned when the profession skill reaches the required
 * rank (SkillLineAbility.AcquireMethod = LEARN_WITH_SKILL; the core calls
 * LearnSkillRewardedSpells on login and on every skill change).
 *
 * ruRU client: spell names must be written to BOTH enGB and ruRU columns
 * (the client only reads its own locale). Russian item names come from
 * SQL item_template_locale, preloaded into a map in one pass.
 */

import { std } from "wow/wotlk";
import { SQL } from "wow/wotlk";
import * as fs from "fs";
import * as path from "path";

declare const __dirname: string;

const MOD = "craft-all";

// profession skill line ids
const BLACKSMITHING = 164;
const LEATHERWORKING = 165;
const TAILORING = 197;
const ENGINEERING = 202;
const ENCHANTING = 333;
const JEWELCRAFTING = 755;
const INSCRIPTION = 773;
const ALCHEMY = 171;
const CRAFT_PROFS = [
    BLACKSMITHING, LEATHERWORKING, TAILORING, ENGINEERING,
    ENCHANTING, JEWELCRAFTING, INSCRIPTION,
];
// scanned only to mark their outputs as "already craftable"
const SCAN_ONLY_PROFS = [185 /*Cooking*/, 129 /*First Aid*/, 186 /*Mining*/];

// Shared runtime contract. Keep these values in sync with the generated file.
const STATION_LEATHER_ARMOR = 1;
const STATION_METAL_ARMOR = 2;
const STATION_CLOTH_ARMOR = 3;
const STATION_JEWELRY = 4;
const STATION_WEAPON = 5;
const STATION_ALCHEMY = 6;

// reagent cost factor by item quality (poor..heirloom); the multiplier for a
// generated recipe is factor(item) / factor(sample output)
const QFACTOR = [0.5, 0.75, 1, 2, 5, 10, 10, 10];

// item class/subclass ids (item_template)
const CLASS_WEAPON = 2;
const CLASS_ARMOR = 4;

// junk/name filters: service items that should never be craftable
const BAD_NAME_PARTS = ["Monster - ", "Deprecated", "DEPRECATED", "[PH]", "(test)", "(Test)", "TEST "];

interface StationRecipe {
    station: number;
    outputItem: number;
    recipeSpell: number;
    profession: number;
    minSkill: number;
    tier: number;
    dominantItem: number;
    dominantCount: number;
}

const stationRecipes: { [outputItem: number]: StationRecipe } = {};
interface ReagentInfo {
    itemClass: number;
    itemLevel: number;
    requiredLevel: number;
    name: string;
}
const reagentInfoCache: { [item: number]: ReagentInfo } = {};
const SECONDARY_REAGENT_NAMES = [
    "dye", "pearl", "thread", "flux", "vial", "coal", "charcoal",
    "parchment", "vellum", "salt",
];

function hasBadName(name: string): boolean {
    for (const bad of BAD_NAME_PARTS) {
        if (name.indexOf(bad) >= 0) return true;
    }
    return false;
}

function stationFor(cls: number, sub: number, inv: number): number {
    if (cls == CLASS_WEAPON) return STATION_WEAPON;
    if (cls == CLASS_ARMOR) {
        if (sub == 1) return STATION_CLOTH_ARMOR;
        if (sub == 2) return STATION_LEATHER_ARMOR;
        if (sub == 3 || sub == 4) return STATION_METAL_ARMOR;
        if (sub == 0 && (inv == 2 || inv == 11 || inv == 12)) return STATION_JEWELRY;
    }
    if (cls == 0 && sub >= 1 && sub <= 3) return STATION_ALCHEMY;
    return 0;
}

function reagentInfo(itemId: number): ReagentInfo | undefined {
    if (reagentInfoCache[itemId] !== undefined) return reagentInfoCache[itemId];
    const row = SQL.item_template.query({ entry: itemId });
    if (row === undefined) return undefined;
    const info: ReagentInfo = {
        itemClass: row.class.get(),
        itemLevel: row.ItemLevel.get(),
        requiredLevel: row.RequiredLevel.get(),
        name: row.name.get().toLowerCase(),
    };
    reagentInfoCache[itemId] = info;
    return info;
}

function isSecondaryReagent(info: ReagentInfo): boolean {
    for (let i = 0; i < SECONDARY_REAGENT_NAMES.length; i++) {
        if (info.name.indexOf(SECONDARY_REAGENT_NAMES[i]) >= 0) return true;
    }
    return false;
}

/**
 * A station consumes one meaningful material, never finished gear or quest
 * items. Trade goods cover leather, metal, cloth, inks, elementals and rare
 * catalysts; gems are valid for jewelry/engineering/enchanting. Only alchemy
 * may use a finished consumable (for recipes such as endless potions).
 */
function isPrimaryReagent(station: number, _profession: number, itemId: number): boolean {
    const info = reagentInfo(itemId);
    if (info === undefined || isSecondaryReagent(info)) return false;
    if (info.itemClass == 7 || info.itemClass == 3) return true;
    return station == STATION_ALCHEMY && info.itemClass == 0;
}

function dominantReagent(
    station: number,
    profession: number,
    reagents: number[],
    counts: number[],
): { item: number; count: number } | undefined {
    let item = 0, count = 0;
    for (let i = 0; i < reagents.length; i++) {
        const reagent = reagents[i];
        const amount = counts[i] || 0;
        if (reagent <= 0 || amount <= 0) continue;
        if (isPrimaryReagent(station, profession, reagent) && amount > count) {
            item = reagent;
            count = amount;
        }
    }
    if (item > 0) return { item: item, count: count };
    return undefined;
}

function recipeTier(minSkill: number): number {
    return Math.min(5, Math.floor((Math.max(1, minSkill) - 1) / 75) + 1);
}

/** Five world-material bands; recipe skill is only a fallback for malformed data. */
function materialTier(itemId: number, minSkill: number): number {
    const info = reagentInfo(itemId);
    if (!info) return recipeTier(minSkill);
    const level = Math.max(info.itemLevel, info.requiredLevel);
    if (level >= 68) return 5;
    if (level >= 58) return 4;
    if (level >= 40) return 3;
    if (level >= 20) return 2;
    return 1;
}

function recordStationRecipe(
    profession: number,
    outputItem: number,
    recipeSpell: number,
    minSkill: number,
    reagents: number[],
    counts: number[],
): void {
    const out = SQL.item_template.query({ entry: outputItem });
    if (out === undefined || out.Quality.get() == 6 || hasBadName(out.name.get())) return;
    const station = stationFor(out.class.get(), out.subclass.get(), out.InventoryType.get());
    if (station == 0 || (station == STATION_ALCHEMY && profession != ALCHEMY)) return;
    const dominant = dominantReagent(station, profession, reagents, counts);
    if (dominant === undefined) return;

    const row: StationRecipe = {
        station: station,
        outputItem: outputItem,
        recipeSpell: recipeSpell,
        profession: profession,
        minSkill: minSkill,
        tier: materialTier(dominant.item, minSkill),
        dominantItem: dominant.item,
        dominantCount: dominant.count,
    };
    const old = stationRecipes[outputItem];
    if (old === undefined || row.minSkill < old.minSkill
        || (row.minSkill == old.minSkill && row.recipeSpell < old.recipeSpell)) {
        stationRecipes[outputItem] = row;
    }
}

/** Profession for an item, or 0 to skip. */
function professionFor(cls: number, sub: number, inv: number): number {
    if (cls == CLASS_WEAPON) {
        switch (sub) {
            case 0: case 1: case 4: case 5: case 6: case 7: case 8:
            case 13: case 14: case 15: case 17:
                return BLACKSMITHING;           // melee weapons
            case 2: case 3: case 16: case 18: case 20:
                return ENGINEERING;             // bows/guns/thrown/crossbows/fishing poles
            case 19:
                return ENCHANTING;              // wands
            case 10:
                return INSCRIPTION;             // staves
            default:
                return 0;
        }
    }
    if (cls == CLASS_ARMOR) {
        switch (sub) {
            case 1: return TAILORING;           // cloth (incl. cloaks)
            case 2: return LEATHERWORKING;      // leather
            case 3: return LEATHERWORKING;      // mail (dragonscale tradition)
            case 4: return BLACKSMITHING;       // plate
            case 5: case 6: return BLACKSMITHING; // bucklers/shields
            case 7: case 8: case 9: case 10:
                return INSCRIPTION;             // librams/idols/totems/sigils
            case 0:
                // misc armor: route by inventory slot
                if (inv == 2 || inv == 11 || inv == 12) return JEWELCRAFTING; // neck/ring/trinket
                if (inv == 23) return INSCRIPTION;                            // held in off-hand
                return TAILORING;                                             // shirts/tabards/the rest
            default:
                return 0;
        }
    }
    return 0;
}

interface Sample {
    ilvl: number;
    minSkill: number;
    trivialLow: number;
    trivialHigh: number;
    castIndex: number;
    focus: number;
    totems: number[];
    icon: number;
    visuals: number[];
}

interface MaterialSample {
    ilvl: number;
    outQuality: number;
    dominantItem: number;
    dominantCount: number;
}

// ---------------------------------------------------------------------------
// 1) preload ruRU item names (one pass; per-item locale lookups are slow)
const ruNames: { [item: number]: string } = {};
SQL.item_template_locale.queryAll({ locale: "ruRU" }).forEach(row => {
    ruNames[row.ID.get()] = row.Name.get();
});

// 2) collect existing recipes: per-profession samples + global "already
//    craftable" output set
const samples: { [prof: number]: Sample[] } = {};
const materialSamples: { [prof: number]: MaterialSample[] } = {};
const materialSamplesByStation: {
    [prof: number]: { [station: number]: MaterialSample[] };
} = {};
const alreadyCraftable: { [item: number]: boolean } = {};
let sampleCount = 0;
let materialSampleCount = 0;

for (const profId of CRAFT_PROFS.concat([ALCHEMY], SCAN_ONLY_PROFS)) {
    const isCraftProf = CRAFT_PROFS.indexOf(profId) >= 0;
    const isStationProf = isCraftProf || profId == ALCHEMY;
    if (isCraftProf) {
        samples[profId] = [];
        materialSamples[profId] = [];
        materialSamplesByStation[profId] = {};
    }
    std.Professions.load(profId).Recipes.forEach(r => {
        const outId = r.OutputItem.get();
        if (outId <= 0) return;
        alreadyCraftable[outId] = true;
        if (!isStationProf) return;

        const out = SQL.item_template.query({ entry: outId });
        if (out === undefined) return;
        const spell = r.AsSpell();
        const slas = spell.SkillLines.get();
        if (slas.length == 0) return;
        const sla = slas[0];
        const reagents = spell.row.Reagent.get();
        const counts = spell.row.ReagentCount.get();
        let hasReagent = false;
        for (let i = 0; i < reagents.length; i++) {
            if (reagents[i] > 0 && counts[i] > 0) hasReagent = true;
        }
        if (!hasReagent) return; // discovery/summon oddities are useless as samples

        const minSkill = Math.min(450, Math.max(
            1,
            sla.MinSkillRank.get(),
            sla.TrivialRank.Low.get() - 25,
        ));
        recordStationRecipe(profId, outId, spell.ID, minSkill, reagents, counts);
        if (!isCraftProf) return;

        // У большинства ванильных рецептов SLA.MinSkillRank = 1 (реальный порог —
        // в данных тренера), поэтому выводим порог из жёлтого порога скиллапов:
        // рецепт «оранжевый» примерно на 25 очков ниже жёлтого. Иначе все 23k
        // рецептов выучились бы разом на скилле 1.
        samples[profId].push({
            ilvl: out.ItemLevel.get(),
            minSkill: minSkill,
            trivialLow: sla.TrivialRank.Low.get(),
            trivialHigh: sla.TrivialRank.High.get(),
            castIndex: spell.row.CastingTimeIndex.get(),
            focus: spell.row.RequiresSpellFocus.get(),
            totems: spell.row.RequiredTotemCategoryID.get(),
            icon: spell.row.SpellIconID.get(),
            visuals: spell.row.SpellVisualID.get(),
        });
        sampleCount++;

        const outClass = out.class.get();
        const outSub = out.subclass.get();
        const outInv = out.InventoryType.get();
        if (out.Quality.get() != 6 && !hasBadName(out.name.get())
            && professionFor(outClass, outSub, outInv) == profId) {
            const station = stationFor(outClass, outSub, outInv);
            const dominant = dominantReagent(station, profId, reagents, counts);
            if (dominant !== undefined) {
                const material: MaterialSample = {
                    ilvl: out.ItemLevel.get(),
                    outQuality: out.Quality.get(),
                    dominantItem: dominant.item,
                    dominantCount: dominant.count,
                };
                materialSamples[profId].push(material);
                if (materialSamplesByStation[profId][station] === undefined) {
                    materialSamplesByStation[profId][station] = [];
                }
                materialSamplesByStation[profId][station].push(material);
                materialSampleCount++;
            }
        }
    });
}
for (const profId of CRAFT_PROFS) {
    samples[profId].sort((a, b) => a.ilvl - b.ilvl);
    materialSamples[profId].sort((a, b) => a.ilvl - b.ilvl);
    const byStation = materialSamplesByStation[profId];
    Object.keys(byStation).forEach(key => {
        byStation[Number(key)].sort((a, b) => a.ilvl - b.ilvl);
    });
}

/** Sample with output ilvl closest to the target (samples sorted by ilvl). */
function closestSample<T extends { ilvl: number }>(list: T[], ilvl: number): T {
    let lo = 0, hi = list.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (list[mid].ilvl < ilvl) lo = mid; else hi = mid;
    }
    return (Math.abs(list[hi].ilvl - ilvl) < Math.abs(list[lo].ilvl - ilvl)) ? list[hi] : list[lo];
}

// 3) generate a recipe for every eligible weapon/armor item
const profObjs: { [prof: number]: ReturnType<typeof std.Professions.load> } = {};
for (const profId of CRAFT_PROFS) profObjs[profId] = std.Professions.load(profId);

const diag = {
    created: 0, skipExisting: 0, skipNoMap: 0, skipName: 0,
    skipQuality: 0, skipNoSample: 0, skipNoMaterial: 0, ruMissing: 0,
};
const perProf: { [prof: number]: number } = {};
// распределение по порогу изучения (разряды по 75) — рецепты должны быть
// размазаны по прокачке, а не выучиваться все на скилле 1
const skillBuckets = [0, 0, 0, 0, 0, 0];

std.Items.filter(item => {
    const cls = item.Class.getClass();
    if (cls != CLASS_WEAPON && cls != CLASS_ARMOR) return false;

    const quality = item.Quality.get();
    if (quality == 6) { diag.skipQuality++; return false; } // artifact = GM items

    const id = item.ID;
    if (alreadyCraftable[id]) { diag.skipExisting++; return false; }

    const en = item.Name.enGB.get();
    if (hasBadName(en)) { diag.skipName++; return false; }

    const sub = item.Class.getSubclass();
    const inv = item.InventoryType.get();
    const profId = professionFor(cls, sub, inv);
    if (profId == 0) { diag.skipNoMap++; return false; }
    const list = samples[profId];
    if (list.length == 0) { diag.skipNoSample++; return false; }
    const ilvl = item.ItemLevel.get();
    const s = closestSample(list, ilvl);
    const sameStation = materialSamplesByStation[profId][stationFor(cls, sub, inv)];
    const materials = sameStation !== undefined && sameStation.length > 0
        ? sameStation
        : materialSamples[profId];
    if (materials.length == 0) { diag.skipNoMaterial++; return false; }
    const material = closestSample(materials, ilvl);

    const recipe = profObjs[profId].Recipes.addGet(MOD, `recipe-${id}`);
    const spell = recipe.AsSpell();

    // output: exactly 1 of the item (classic craft spells use base 0, die 1)
    const eff = spell.Effects.get(0);
    eff.ItemType.set(id);
    eff.PointsBase.set(0);
    eff.PointsDieSides.set(1);

    // ruRU client reads only its own locale column — write both
    const ru = ruNames[id];
    if (ru === undefined) diag.ruMissing++;
    spell.Name.enGB.set(en);
    spell.Name.ruRU.set(ru !== undefined && ru != "" ? ru : en);

    // clone the sample's shape
    spell.row.CastingTimeIndex.set(s.castIndex);
    spell.row.RequiresSpellFocus.set(s.focus);
    spell.row.RequiredTotemCategoryID.set(s.totems.slice() as any);
    spell.row.SpellIconID.set(s.icon);
    spell.row.SpellVisualID.set(s.visuals.slice() as any);

    // One dominant material from a comparable original equipment recipe.
    const mult = QFACTOR[quality] / QFACTOR[material.outQuality];
    const scaled = Math.max(1, Math.ceil(material.dominantCount * mult));
    spell.Reagents.clearAll();
    spell.Reagents.add(material.dominantItem, scaled);

    // auto-learn at the sample's required skill; same skill-up thresholds
    const sla = spell.SkillLines.get()[0];
    sla.AcquireMethod.LEARN_WITH_SKILL.set();
    sla.MinSkillRank.set(s.minSkill);
    sla.TrivialRank.set(s.trivialLow, s.trivialHigh);
    let bucket = Math.floor((s.minSkill - 1) / 75);
    if (bucket > 5) bucket = 5;
    skillBuckets[bucket]++;
    recordStationRecipe(
        profId, id, spell.ID, s.minSkill,
        [material.dominantItem], [scaled],
    );

    diag.created++;
    perProf[profId] = (perProf[profId] || 0) + 1;
    return false;
});

const catalog = Object.keys(stationRecipes).map(key => stationRecipes[Number(key)]);
catalog.sort((a, b) => a.station - b.station
    || a.tier - b.tier
    || a.minSkill - b.minSkill
    || a.dominantItem - b.dominantItem
    || a.outputItem - b.outputItem
    || a.recipeSpell - b.recipeSpell);

const stationCounts = [0, 0, 0, 0, 0, 0, 0];
catalog.forEach(row => {
    if (row.station < STATION_LEATHER_ARMOR || row.station > STATION_ALCHEMY
        || row.outputItem <= 0 || row.recipeSpell <= 0 || row.profession <= 0
        || row.minSkill <= 0 || row.tier < 1 || row.tier > 5
        || row.dominantItem <= 0 || row.dominantCount <= 0) {
        throw new Error("Invalid base station recipe contract row: " + JSON.stringify(row));
    }
    stationCounts[row.station]++;
});
for (let station = STATION_LEATHER_ARMOR; station <= STATION_ALCHEMY; station++) {
    if (stationCounts[station] == 0) {
        throw new Error("Base station recipe catalog has no rows for station " + station);
    }
}

const catalogRows = catalog.map(row => "    ["
    + [
        row.station, row.outputItem, row.recipeSpell, row.profession,
        row.minSkill, row.tier, row.dominantItem, row.dominantCount,
    ].join(", ")
    + "],");
const catalogContents =
    "/** AUTO-GENERATED by craft-all/datascripts/datascripts.ts during `build data`. */\n"
    + "// Row: [station, outputItem, recipeSpell, professionSkillLine, minSkill, tier1to5, dominantItem, dominantCount]\n"
    + "export const CRAFT_STATION_LEATHER_ARMOR = 1;\n"
    + "export const CRAFT_STATION_METAL_ARMOR = 2;\n"
    + "export const CRAFT_STATION_CLOTH_ARMOR = 3;\n"
    + "export const CRAFT_STATION_JEWELRY = 4;\n"
    + "export const CRAFT_STATION_WEAPON = 5;\n"
    + "export const CRAFT_STATION_ALCHEMY = 6;\n\n"
    + "export const CRAFT_STATION_CATALOG_VERSION: number = 2;\n"
    + "export const CRAFT_STATION_CATALOG_READY = true;\n"
    + "export const CRAFT_STATION_RECIPES: number[][] = [\n"
    + catalogRows.join("\n") + "\n];\n";
const catalogPath = path.resolve(
    __dirname,
    "..", "..", "..", "base-building", "shared", "generated", "CraftStationRecipes.ts",
);
fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
fs.writeFileSync(catalogPath, catalogContents, "utf8");

// diag summary — keep this; read-only runs are our only test harness
console.log(`[craft-all] samples=${sampleCount} materialSamples=${materialSampleCount}`
    + ` created=${diag.created}`
    + ` skipExisting=${diag.skipExisting} skipNoMap=${diag.skipNoMap}`
    + ` skipName=${diag.skipName} skipQuality=${diag.skipQuality}`
    + ` skipNoSample=${diag.skipNoSample} skipNoMaterial=${diag.skipNoMaterial}`
    + ` ruMissing=${diag.ruMissing}`);
console.log(`[craft-all] recipes by skill rank (1-75/76-150/.../376-450): ${skillBuckets.join("/")}`);
console.log(`[craft-all] per profession: BS=${perProf[BLACKSMITHING] || 0}`
    + ` LW=${perProf[LEATHERWORKING] || 0} Tailor=${perProf[TAILORING] || 0}`
    + ` Eng=${perProf[ENGINEERING] || 0} Ench=${perProf[ENCHANTING] || 0}`
    + ` JC=${perProf[JEWELCRAFTING] || 0} Inscr=${perProf[INSCRIPTION] || 0}`);
console.log(`[craft-all] base station catalog: ${catalog.length} deterministic outputs`);
