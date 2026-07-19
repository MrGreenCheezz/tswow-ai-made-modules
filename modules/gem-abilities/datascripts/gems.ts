/**
 * Generate one gem per spell taught by class trainers plus a reviewed fallback
 * of starter/quest/active-talent class abilities, and emit the runtime id table.
 *
 * std.Gems.create(mod, id, ...) registers item as `<id>-item` and enchantment
 * as `<id>-enchantment`. GetID can't resolve these at runtime, so we write the
 * spell/item/enchant ids to livescripts/generated_pool.ts here.
 *
 * v2: каждому классовому камню добавляются метаданные для предустановки в
 * броню (см. livescripts/fill.ts):
 *   - armorMask: 1 ткань, 2 кожа, 4 кольчуга, 8 латы (маска, по классам
 *     тренеров: ткань=жрец/маг/лок(+рестор-шаман), кожа=друид/рога(+энх-шаман),
 *     кольчуга=охотник(+кастер-шаман), латы=воин/пал/дк)
 *   - role: 0 дпс, 1 хил (эффекты лечения), 2 танк (таунты + список)
 * Плюс отдельный "экзотический" пул из не-классовых заклинаний — редкий
 * свободный дроп (см. livescripts/loot.ts).
 *
 * NOTE: this is a large pool (~thousands of gems) — `build data` will be slow.
 */

import { DBC, SQL, std } from "wow/wotlk";
import * as fs from "fs";
import * as path from "path";
import { ABILITY_POOL, GEM_MODULE } from "./pool_data";
import { createRandomMobProcAura } from "./random_mobs";
import { ENGLISH_SPELL_TEXT } from "./english_spell_text";
import {
    ARMOR_OVERRIDES, ENHANCEMENT_NAMES, HEAL_NAMES, ROLE_OVERRIDES, TANK_NAMES,
} from "./spec_data";

declare const __dirname: string;

const CLASS_TRAINER = 0; // TrainerRequirementType.CLASS
const CLASS_IDS: { [id: number]: boolean } = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: true, 7: true, 8: true, 9: true, 11: true,
};

// class masks (1 << (classId - 1))
const MASK_WARRIOR = 1, MASK_PALADIN = 2, MASK_HUNTER = 4, MASK_ROGUE = 8,
    MASK_PRIEST = 16, MASK_DK = 32, MASK_SHAMAN = 64, MASK_MAGE = 128,
    MASK_WARLOCK = 256, MASK_DRUID = 1024;

// armor bits / roles (shared contract with livescripts/maps.ts+fill.ts)
const CLOTH = 1, LEATHER = 2, MAIL = 4, PLATE = 8, ALL_ARMOR = 15;
const ROLE_DPS = 0, ROLE_HEAL = 1, ROLE_TANK = 2;

// Spell.dbc SpellClassSet (SpellFamilyName) — КАНОНИЧНАЯ принадлежность спелла
// классу; главный источник (маски тренеров в этой кастомной world-БД грязные —
// мульти-классовые тренеры добавляют лишние биты)
const FAMILY_TO_MASK: { [family: number]: number } = {
    3: MASK_MAGE, 4: MASK_WARRIOR, 5: MASK_WARLOCK, 6: MASK_PRIEST,
    7: MASK_DRUID, 8: MASK_ROGUE, 9: MASK_HUNTER, 10: MASK_PALADIN,
    11: MASK_SHAMAN, 15: MASK_DK,
};

// spell effect/aura ids (3.3.5)
const EFF_APPLY_AURA = 6;
const EFF_ADD_COMBO_POINTS = 80;
const EFF_ATTACK_ME = 114;
const COMBO_FINISHER_TAG = "spell/player-combo-finisher";
const HEAL_EFFECTS: { [e: number]: boolean } = { 10: true, 67: true, 75: true, 136: true };
const AURA_HEALS: { [a: number]: boolean } = { 8: true, 20: true };
const AURA_TAUNT = 11;
// weapon strikes + temporary weapon imbues → "enhancement" for shaman
const WEAPON_EFFECTS: { [e: number]: boolean } = { 17: true, 31: true, 54: true, 58: true, 121: true };

// exotic pool: conservative filter over all non-class spells
const EXOTIC_CAP = 200;
const ATTR0_PASSIVE = 0x40;
// teleports, quest credit, resurrects, item/enchant creation, summons,
// learn-spell, languages, skills, gameobject spawns, player summons
const EXOTIC_EXCLUDE_EFFECTS: { [e: number]: boolean } = {
    5: true, 16: true, 18: true, 24: true, 28: true, 36: true, 39: true,
    44: true, 50: true, 53: true, 54: true, 56: true, 57: true, 59: true,
    85: true, 95: true, 113: true,
};
// shapeshift/transform reference creature displays — high display ids crash
// this client (see tswow-gotchas), keep them out of the random pool
const EXOTIC_EXCLUDE_AURAS: { [a: number]: boolean } = { 36: true, 56: true };

// Clone from a gem item that already has an Item.dbc row. Some stock
// GemProperties are shared by multiple items, so Gem.Item.get() is ambiguous.
const BASE_GEM_ITEM = std.Items.filter(item =>
    item.GemProperties.get() > 0 && item.DBCRow.exists()
)[0];
const BASE_GEM = std.Gems.load(BASE_GEM_ITEM.GemProperties.get());

type Pending = {
    spellId: number;
    itemId: number;
    enchantId: number;
    role: number;
    weaponStrike: boolean;
    lowerNames: string[];
    family: number;
};

const pending: Pending[] = [];
const exoticRows: string[] = [];
const spellClassMask: { [id: number]: number } = {};
const seen: { [id: number]: boolean } = {};

// diagnostics: count every path so a silent failure can't hide (see the
// summary console.log at the bottom)
const diag = {
    trainers: 0, classTrainers: 0, trainerSpells: 0, trainerSpellsMatched: 0,
    dupes: 0, notExists: 0, noName: 0, built: 0, clippedDesc: 0,
    trainerErrors: 0, trainerSpellErrors: 0, buildErrors: 0,
    exoticScanned: 0, exoticBuilt: 0, exoticErrors: 0,
    maskSource: { family: 0, skill: 0, trainer: 0, unknown: 0 },
    armor: { cloth: 0, leather: 0, mail: 0, plate: 0, all: 0 },
    roles: { dps: 0, heal: 0, tank: 0 },
    combo: { finishers: 0, nativeGenerators: 0, stealthRequirementsRemoved: 0 },
    randomMobs: { procAuras: 0, procAuraErrors: 0 },
    english: { missingMap: 0, genericSamples: [] as number[] },
};

// item_template.description is varchar(255) — longer spell descriptions
// abort the whole SQL save, so clip them
function clip(s: string): string {
    if (s.length > 250) {
        diag.clippedDesc++;
        return s.substring(0, 247) + "...";
    }
    return s;
}
const errorSamples: string[] = [];
function sampleError(where: string, e: any) {
    if (errorSamples.length < 5) {
        errorSamples.push(where + ": " + (e && e.stack ? e.stack : e));
    }
}

function nameIn(list: string[], lowerNames: string[]): boolean {
    for (let i = 0; i < list.length; i++) {
        for (let nameIndex = 0; nameIndex < lowerNames.length; nameIndex++) {
            if (list[i] === lowerNames[nameIndex]) return true;
        }
    }
    return false;
}

// 1) collect trainer ids that teach playable classes, with their class mask.
const classTrainerMask: { [id: number]: number } = {};
SQL.trainer.queryAll({}).forEach((trainer) => {
    diag.trainers++;
    try {
        let mask = trainer.classMask.get();
        const requiredClass = trainer.Requirement.get();
        if (trainer.Type.get() == CLASS_TRAINER && CLASS_IDS[requiredClass]) {
            mask |= 1 << (requiredClass - 1);
        }
        if (mask != 0) {
            classTrainerMask[trainer.Id.get()] = mask;
            diag.classTrainers++;
        }
    } catch (e) { diag.trainerErrors++; sampleError("trainer", e); }
});

type Created = {
    itemId: number;
    enchantId: number;
    role: number;
    weaponStrike: boolean;
    lowerNames: string[];
    family: number;
};

/** Create the gem item+enchant for a spell and classify its role by effects. */
function createGem(spellId: number): Created | undefined {
    if (!std.Spells.Exists(spellId)) {
        diag.notExists++;
        return undefined; // dangling skill-line reference to a missing spell
    }
    const spell = std.Spells.load(spellId);
    if (!(spell as any)) {
        return undefined; // load returned nothing (broken row)
    }
    const english = ENGLISH_SPELL_TEXT[spellId];
    const enNameRaw = spell.Name.enGB.get();
    const ruNameRaw = spell.Name.ruRU.get();
    if (!english && (!enNameRaw || enNameRaw == "") && (!ruNameRaw || ruNameRaw == "")) {
        diag.noName++;
        return undefined; // skip internal/nameless spells
    }
    if (!english) {
        diag.english.missingMap++;
        if (diag.english.genericSamples.length < 5) {
            diag.english.genericSamples.push(spellId);
        }
    }
    // Never copy ruRU into enGB. New/custom trainer spells remain buildable
    // with an explicit diagnostic and a safe language-neutral identifier.
    const enName = english ? english[0] : (enNameRaw || "Spell " + spellId);
    const enDesc = clip(english ? english[1] : (spell.Description.enGB.get() || ""));
    const ruName = ruNameRaw || enNameRaw || enName;
    const ruDesc = clip(spell.Description.ruRU.get() || "") || enDesc;

    // Capture native finisher metadata before making the spell universally
    // usable. PointsPerCombo is a fallback for unusual imported rows whose
    // native requirement flags are missing.
    let isFinisher = spell.Attributes.REQ_COMBO_POINTS.get()
        || spell.Attributes.REQ_COMBO_POINTS2.get();
    for (let i = 0; i < 3; i++) {
        if (spell.row.EffectPointsPerCombo.getIndex(i) != 0) isFinisher = true;
    }
    if (isFinisher) {
        spell.Tags.add(GEM_MODULE, COMBO_FINISHER_TAG);
        diag.combo.finishers++;
    }

    // role classification from raw effect/aura columns
    let role = ROLE_DPS;
    let weaponStrike = false;
    for (let i = 0; i < 3; i++) {
        const eff = spell.row.Effect.getIndex(i);
        const aura = spell.row.EffectAura.getIndex(i);
        if (eff == EFF_ATTACK_ME || (eff == EFF_APPLY_AURA && aura == AURA_TAUNT)) {
            role = ROLE_TANK;
        }
        if (role != ROLE_TANK
            && (HEAL_EFFECTS[eff] || (eff == EFF_APPLY_AURA && AURA_HEALS[aura]))) {
            role = ROLE_HEAL;
        }
        if (WEAPON_EFFECTS[eff]) weaponStrike = true;
    }

    // Unified power/form usability. Stealth is the one source requirement
    // removed in DBC. Native combo flags/effects stay intact so creatures and
    // NPCBots using these shared stock IDs retain their original mechanics;
    // livescripts mirror the player-bound aura for gem casts and suppress the
    // native generator effect only for the gem user at runtime.
    spell.Power.setMana(50, 0);
    spell.row.ShapeshiftMask.set(BigInt(0));
    spell.row.ShapeshiftExclude.set(BigInt(0));
    // Ability gems must not inherit class-totem or profession-tool requirements.
    spell.row.RequiredTotemCategoryID.set([0, 0]);
    spell.Attributes.NOT_SHAPESHIFTED.set(false);
    spell.FacingCasterFlags.clearAll();
    if (spell.Attributes.REQUIRES_STEALTH.get()) {
        diag.combo.stealthRequirementsRemoved++;
    }
    spell.Attributes.REQUIRES_STEALTH.set(false);
    for (let i = 0; i < 3; i++) {
        if (spell.row.Effect.getIndex(i) == EFF_ADD_COMBO_POINTS) {
            diag.combo.nativeGenerators++;
        }
    }

    // don't pass colour to create() (its gem.Type.set runs before the item
    // is linked and throws) — set the type afterwards.
    const gem = std.Gems.create(
        GEM_MODULE, "gem-" + spellId, undefined,
        BASE_GEM.ID, 0, BASE_GEM_ITEM.ID,
    );
    gem.Type.set("PRISMATIC");
    gem.Name.enGB.set(enName + " Gem");
    gem.Name.ruRU.set("Камень: " + ruName);
    gem.Description.enGB.set(enDesc);
    gem.Description.ruRU.set(ruDesc);
    gem.EffectDescription.enGB.set("Teaches: " + enName);
    gem.EffectDescription.ruRU.set("Обучает: " + ruName);

    // Preserve the old one-aura-per-ability design so the rolled spell is
    // visible on the creature. A broken payload driver must not remove its
    // otherwise valid gem from the generated catalog.
    try {
        createRandomMobProcAura(spellId, enName);
        diag.randomMobs.procAuras++;
    } catch (e) {
        diag.randomMobs.procAuraErrors++;
        sampleError("randomMobProc(" + spellId + ")", e);
    }

    return {
        itemId: gem.Item.get().ID,
        enchantId: gem.Enchantment.get(),
        role: role,
        weaponStrike: weaponStrike,
        lowerNames: [enName.toLowerCase(), ruName.toLowerCase()],
        family: spell.row.SpellClassSet.get(),
    };
}

function buildGem(spellId: number): void {
    if (spellId <= 0 || seen[spellId]) {
        diag.dupes++;
        return;
    }
    seen[spellId] = true;
    // one broken/weird spell must never abort the whole build
    try {
        const created = createGem(spellId);
        if (!created) return;
        pending.push({
            spellId: spellId,
            itemId: created.itemId,
            enchantId: created.enchantId,
            role: created.role,
            weaponStrike: created.weaponStrike,
            lowerNames: created.lowerNames,
            family: created.family,
        });
        diag.built++;
    } catch (e) {
        diag.buildErrors++; sampleError("buildGem(" + spellId + ")", e);
    }
}

// 2) Seed starter/quest/talent abilities that may not have trainer_spell rows.
// buildGem deduplicates them against the trainer scan below.
ABILITY_POOL.forEach(spellId => {
    buildGem(spellId);
    if (std.Spells.Exists(spellId)) {
        std.Spells.load(spellId).Tags.add(GEM_MODULE, "spell/class-ability-choice");
    }
});

// 3) every spell taught by a class trainer (class mask accumulates across ALL
// trainers/rows, including duplicates — a spell shared by two classes gets
// both bits even though the gem is only created once)
SQL.trainer_spell.queryAll({}).forEach((trainerSpell) => {
    diag.trainerSpells++;
    try {
        const trainerMask = classTrainerMask[trainerSpell.TrainerId.get()];
        const rowMask = trainerSpell.classMask.get();
        if (trainerMask !== undefined || rowMask != 0) {
            diag.trainerSpellsMatched++;
            const spellId = trainerSpell.SpellId.get();
            spellClassMask[spellId] =
                (spellClassMask[spellId] || 0) | (trainerMask || 0) | rowMask;
            buildGem(spellId);
        }
    } catch (e) { diag.trainerSpellErrors++; sampleError("trainerSpell", e); }
});

// 3.5) class fallback по skill line: сиды из ABILITY_POOL без строк тренера
// (например «Снежная буря» ранга 1) иначе получают armorMask=15 и падают в
// любую броню — маг-заклинание в кольчужном шлеме.
// Reusable profession tools are intentionally optional. Spell focuses (forge,
// anvil, campfire, etc.) and reagents remain native and unchanged.
const ITEM_FREE_PROFESSION_SKILLS: { [skill: number]: boolean } = {
    129: true, 164: true, 165: true, 171: true, 182: true, 185: true,
    186: true, 197: true, 202: true, 333: true, 356: true, 393: true,
    755: true, 773: true,
};
// Trinity recognizes these stock inscription spells as loot-crafting only
// while their virtuoso-inscription-kit category remains present.
const STOCK_LOOT_CRAFTING_SPELLS: { [spell: number]: boolean } = {
    48247: true, 59480: true, 59487: true, 59491: true,
    59502: true, 59503: true, 59504: true, 64051: true,
};
const CLASS_SKILL_MASK: { [skill: number]: number } = {
    26: MASK_WARRIOR, 256: MASK_WARRIOR, 257: MASK_WARRIOR,
    594: MASK_PALADIN, 267: MASK_PALADIN, 184: MASK_PALADIN,
    50: MASK_HUNTER, 163: MASK_HUNTER, 51: MASK_HUNTER,
    253: MASK_ROGUE, 38: MASK_ROGUE, 39: MASK_ROGUE,
    613: MASK_PRIEST, 56: MASK_PRIEST, 78: MASK_PRIEST,
    770: MASK_DK, 771: MASK_DK, 772: MASK_DK,
    375: MASK_SHAMAN, 373: MASK_SHAMAN, 374: MASK_SHAMAN,
    237: MASK_MAGE, 8: MASK_MAGE, 6: MASK_MAGE,
    355: MASK_WARLOCK, 354: MASK_WARLOCK, 593: MASK_WARLOCK,
    574: MASK_DRUID, 134: MASK_DRUID, 573: MASK_DRUID,
};
const skillClassMask: { [spell: number]: number } = {};
DBC.SkillLineAbility.queryAll({} as any).forEach((row) => {
    const skill = row.SkillLine.get();
    const spellId = row.Spell.get();
    const m = CLASS_SKILL_MASK[skill];
    if (m !== undefined) {
        skillClassMask[spellId] = (skillClassMask[spellId] || 0) | m;
    }
    if (ITEM_FREE_PROFESSION_SKILLS[skill]
        && !STOCK_LOOT_CRAFTING_SPELLS[spellId]
        && std.Spells.Exists(spellId)) {
        std.Spells.load(spellId).RequiredTotems.clearAll();
    }
});

// 4) resolve armor mask per gem (needs the final accumulated class masks)
function armorFor(mask: number, role: number, p: Pending): number {
    if (mask == 0) return ALL_ARMOR; // seeded/unknown source — allow anywhere
    let armor = 0;
    if (mask & (MASK_PRIEST | MASK_MAGE | MASK_WARLOCK)) armor |= CLOTH;
    if (mask & (MASK_ROGUE | MASK_DRUID)) armor |= LEATHER;
    if (mask & MASK_HUNTER) armor |= MAIL;
    if (mask & (MASK_WARRIOR | MASK_PALADIN | MASK_DK)) armor |= PLATE;
    if (mask & MASK_SHAMAN) {
        // спек-эвристика: лечение → ткань, удары/имбьюи → кожа, остальное → кольчуга
        if (role == ROLE_HEAL) armor |= CLOTH;
        else if (p.weaponStrike || nameIn(ENHANCEMENT_NAMES, p.lowerNames)) armor |= LEATHER;
        else armor |= MAIL;
    }
    return armor == 0 ? ALL_ARMOR : armor;
}

type RewardCandidate = {
    rootSpell: number;
    spellId: number;
    itemId: number;
    rank: number;
};

const rewardByRoot: { [rootSpell: number]: RewardCandidate } = {};

/** One representative item per rank chain; every rank-specific gem is already
 * a runtime alias of the same level-scaled ability. */
function considerOrderReward(spellId: number, itemId: number): void {
    const spell = std.Spells.load(spellId);
    const ranked = spell.Rank.exists();
    const first = ranked ? spell.Rank.getFirstSpell() : spellId;
    const rootSpell = first > 0 ? first : spellId;
    const candidate: RewardCandidate = {
        rootSpell: rootSpell,
        spellId: spellId,
        itemId: itemId,
        rank: ranked ? spell.Rank.getRank() : 0,
    };
    const old = rewardByRoot[rootSpell];
    const candidateIsRoot = candidate.spellId == candidate.rootSpell;
    const oldIsRoot = old !== undefined && old.spellId == old.rootSpell;
    if (old === undefined
        || (candidateIsRoot && !oldIsRoot)
        || (candidateIsRoot == oldIsRoot && candidate.rank < old.rank)
        || (candidateIsRoot == oldIsRoot && candidate.rank == old.rank && candidate.itemId < old.itemId)) {
        rewardByRoot[rootSpell] = candidate;
    }
}

const rows: string[] = [];
pending.forEach((p) => {
    let role = p.role;
    if (ROLE_OVERRIDES[p.spellId] !== undefined) role = ROLE_OVERRIDES[p.spellId];
    else {
        if (role != ROLE_TANK && nameIn(TANK_NAMES, p.lowerNames)) role = ROLE_TANK;
        if (role == ROLE_DPS && nameIn(HEAL_NAMES, p.lowerNames)) role = ROLE_HEAL;
    }
    let armor = ARMOR_OVERRIDES[p.spellId];
    if (armor === undefined) {
        // приоритет источников класса: SpellFamilyName (канон, ровно один
        // класс) → skill line → маски тренеров (самые грязные — в этой БД
        // есть мульти-классовые тренеры, юнион даёт лишние биты)
        let mask = FAMILY_TO_MASK[p.family];
        if (mask !== undefined) diag.maskSource.family++;
        else if (skillClassMask[p.spellId] !== undefined) {
            mask = skillClassMask[p.spellId];
            diag.maskSource.skill++;
        } else if (spellClassMask[p.spellId] !== undefined && spellClassMask[p.spellId] != 0) {
            mask = spellClassMask[p.spellId];
            diag.maskSource.trainer++;
        } else {
            mask = 0;
            diag.maskSource.unknown++;
        }
        armor = armorFor(mask, role, p);
    }

    if (armor == ALL_ARMOR) diag.armor.all++;
    else {
        if (armor & CLOTH) diag.armor.cloth++;
        if (armor & LEATHER) diag.armor.leather++;
        if (armor & MAIL) diag.armor.mail++;
        if (armor & PLATE) diag.armor.plate++;
    }
    if (role == ROLE_DPS) diag.roles.dps++;
    else if (role == ROLE_HEAL) diag.roles.heal++;
    else diag.roles.tank++;

    rows.push("    [" + p.spellId + ", " + p.itemId + ", " + p.enchantId
        + ", " + armor + ", " + role + "],");
    considerOrderReward(p.spellId, p.itemId);
});

// 5) exotic pool: rare loose-drop gems built from NON-class spells.
// Conservative deterministic filter (first EXOTIC_CAP by spell id); replace
// with a curated list in spec_data-style when ready.
DBC.Spell.queryAll({} as any).forEach((row) => {
    if (exoticRows.length >= EXOTIC_CAP) return;
    try {
        const id = row.ID.get();
        if (id <= 0 || seen[id]) return; // class gems already own this spell
        diag.exoticScanned++;
        if (row.Attributes.get() & ATTR0_PASSIVE) return;
        const level = row.SpellLevel.get();
        if (level < 1 || level > 80) return;
        if (row.Effect.getIndex(0) == 0) return;
        for (let i = 0; i < 3; i++) {
            const eff = row.Effect.getIndex(i);
            if (eff != 0 && EXOTIC_EXCLUDE_EFFECTS[eff]) return;
            if (eff == EFF_APPLY_AURA && EXOTIC_EXCLUDE_AURAS[row.EffectAura.getIndex(i)]) return;
        }
        seen[id] = true;
        const created = createGem(id);
        if (!created) return;
        exoticRows.push("    [" + id + ", " + created.itemId + ", " + created.enchantId + "],");
        considerOrderReward(id, created.itemId);
        diag.exoticBuilt++;
    } catch (e) {
        diag.exoticErrors++; sampleError("exotic(" + row.ID.get() + ")", e);
    }
});

// 6) emit portable runtime contracts next to their owning modules
const rewardRoots = Object.keys(rewardByRoot).map(Number);
rewardRoots.sort((a, b) => a - b);
if (rewardRoots.length == 0 || exoticRows.length == 0) {
    throw new Error("Order reward catalog must include class and exotic ability gems");
}
const rewardRows: string[] = [];
rewardRoots.forEach(rootSpell => {
    const reward = rewardByRoot[rootSpell];
    std.Items.load(reward.itemId).Tags.add("gem-abilities", "item/order-reward-stone");
    rewardRows.push("    [" + reward.rootSpell + ", " + reward.itemId + "],");
});

const OUT_PATH = path.resolve(__dirname, "..", "..", "livescripts", "generated_pool.ts");
const REWARD_PATH = path.resolve(
    __dirname,
    "..", "..", "..", "base-building", "shared", "generated", "AbilityGemRewards.ts",
);
const contents =
    "/**\n" +
    " * AUTO-GENERATED by datascripts/gems.ts during `build data`. Do not edit.\n" +
    " * GEN_POOL rows: [spellId, gemItemId, socketEnchantId, armorMask, role]\n" +
    " *   armorMask: 1 ткань, 2 кожа, 4 кольчуга, 8 латы; role: 0 дпс, 1 хил, 2 танк\n" +
    " * GEN_EXOTIC rows: [spellId, gemItemId, socketEnchantId] — редкий свободный дроп\n" +
    " */\n" +
    "export const GEN_POOL: number[][] = [\n" +
    rows.join("\n") + "\n" +
    "];\n" +
    "\n" +
    "export const GEN_EXOTIC: number[][] = [\n" +
    exoticRows.join("\n") + "\n" +
    "];\n";
const rewardContents =
    "/** AUTO-GENERATED by gem-abilities/datascripts/gems.ts during `build data`. */\n"
    + "// One row per canonical ability: [canonicalRootSpellId, gemItemId].\n"
    + "// Includes class abilities and the filtered exotic/world pool.\n"
    + "export const ORDER_REWARD_GEM_CATALOG_VERSION: number = 1;\n"
    + "export const ORDER_REWARD_GEM_CATALOG_READY = true;\n"
    + "export const ORDER_REWARD_GEMS: number[][] = [\n"
    + rewardRows.join("\n") + "\n];\n";

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.mkdirSync(path.dirname(REWARD_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, contents, "utf8");
fs.writeFileSync(REWARD_PATH, rewardContents, "utf8");
console.log("[gem-abilities] generated " + rows.length + " ability gems + "
    + exoticRows.length + " exotic gems");
console.log("[gem-abilities] order reward catalog: " + rewardRows.length
    + " canonical ability gems");
console.log("[gem-abilities] diag: " + JSON.stringify(diag));
errorSamples.forEach((s) => console.log("[gem-abilities] sample error — " + s));
