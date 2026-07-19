/**
 * Universal talent system — данные.
 *
 * Все таланты — кастомные генерённые спеллы, привязанные к ШКОЛАМ магии и
 * ТИПАМ урона, а не к заклинаниям конкретных классов:
 *   - несколько опорных стат-пассивок для spell hit/crit и weapon crit;
 *   - основная часть талантов — временные реакции, заряды и ответные эффекты;
 *   - проки: DATA-DRIVEN аура PROC_TRIGGER_SPELL + строка spell_proc с
 *     фильтрами школы/крита/типа + кастомный триггер-спелл. Для двух случайных
 *     проков спутника livescript сохраняет штатные шанс/ICD, но выбирает один
 *     безопасный payload из каталога. НИКАКИХ клонов скриптованных талантов
 *     (Ignite/Illumination и т.п.) — их C++ SpellScript привязан к оригинальным
 *     id и на клонах мертв (см. tswow-gotchas).
 *
 * ВАЖНО: enum SpellProcFlags в tswow СДВИНУТ относительно ядра — procFlags
 * задаются СЫРЫМИ битами из SpellMgr.h ядра (см. константы PF_* ниже).
 *
 * В конце пишется livescripts/generated_talents.ts — мост "строковый id ранга
 * из TalentDefs → числовой spell id" (GetID/UTAG в lua-рантайме не работают).
 */

import { std } from "wow/wotlk";
import * as fs from "fs";
import * as path from "path";
import {
    COMPANION_TREE, CORE_TREE, FIRE_TREE, VITALITY_TREE, WEAPON_TREE,
    TalentTree, talentDescription, talentName,
} from "./shared/TalentDefs";

const TALENT_MODULE = "retail-talents";
const MAGIC_SCHOOLS = ["HOLY", "FIRE", "NATURE", "FROST", "SHADOW", "ARCANE"];
const ALL_SCHOOLS = ["PHYSICAL", "HOLY", "FIRE", "NATURE", "FROST", "SHADOW", "ARCANE"];

type LocalizedTalentText = { name: string; desc: string };
const TALENT_TEXT_BY_RANK: { [key: string]: LocalizedTalentText } = {};
const TALENT_TEXT_BY_PREFIX: { [key: string]: LocalizedTalentText } = {};
const TALENT_TEXT_BY_RUSSIAN_NAME: { [key: string]: LocalizedTalentText } = {};
const TALENT_TREES: TalentTree[] = [
    CORE_TREE, FIRE_TREE, WEAPON_TREE, VITALITY_TREE, COMPANION_TREE,
];

for (const tree of TALENT_TREES) {
    for (const node of tree.nodes) {
        const english = {
            name: talentName(tree.treeId, node, false),
            desc: talentDescription(tree.treeId, node, false),
        };
        TALENT_TEXT_BY_RUSSIAN_NAME[node.name] = english;
        for (const rank of node.ranks) {
            if (typeof rank != "string") continue;
            TALENT_TEXT_BY_RANK[rank] = english;
            TALENT_TEXT_BY_PREFIX[rank.replace(/-\d+$/, "")] = english;
        }
    }
}

const INTERNAL_ENGLISH_TEXT: { [russianName: string]: LocalizedTalentText } = {
    "Выучка спутника": { name: "Companion Training", desc: "The companion's damage and attack and casting speed are increased." },
    "Стойкость спутника": { name: "Companion Resilience", desc: "Maximum health is increased and damage taken is reduced." },
    "Глубокая рана": { name: "Deep Wound", desc: "Bleeds every 3 sec." },
    "Случайный огненный шар": { name: "Random Fireball", desc: "A random companion combat spell." },
    "Случайная ледяная стрела": { name: "Random Frostbolt", desc: "A random companion combat spell." },
    "Случайная молния": { name: "Random Lightning Bolt", desc: "A random companion combat spell." },
    "Случайная стрела Тьмы": { name: "Random Shadow Bolt", desc: "A random companion combat spell." },
    "Случайная кара": { name: "Random Smite", desc: "A random companion combat spell." },
    "Случайный чародейский импульс": { name: "Random Arcane Blast", desc: "A random companion combat spell." },
    "Случайная сила": { name: "Random Strength", desc: "Damage dealt is increased." },
    "Случайная стремительность": { name: "Random Swiftness", desc: "Attack and casting speed are increased." },
    "Случайный оберег": { name: "Random Ward", desc: "Damage taken is reduced." },
    "Случайная удача": { name: "Random Fortune", desc: "Critical chance is increased." },
};

function englishTalentText(key: string, russianName: string, russianDesc: string): LocalizedTalentText {
    const exact = TALENT_TEXT_BY_RANK[key];
    if (exact) return exact;
    for (const prefix in TALENT_TEXT_BY_PREFIX) {
        if (key == prefix || key.indexOf(prefix + "-") >= 0) return TALENT_TEXT_BY_PREFIX[prefix];
    }
    const named = TALENT_TEXT_BY_RUSSIAN_NAME[russianName] || INTERNAL_ENGLISH_TEXT[russianName];
    if (named) return named;
    if (/[А-Яа-яЁё]/.test(russianName + russianDesc)) {
        throw new Error(`[retail-talents] missing English DBC text for ${key || russianName}`);
    }
    return { name: russianName, desc: russianDesc };
}

function setTalentText(spell: any, key: string, russianName: string, russianDesc: string): void {
    const english = englishTalentText(key, russianName, russianDesc);
    spell.Name.enGB.set(english.name).Name.ruRU.set(russianName);
    spell.Description.enGB.set(english.desc).Description.ruRU.set(russianDesc);
    spell.AuraDescription.enGB.set(english.desc).AuraDescription.ruRU.set(russianDesc);
}

// сырые procFlags ЯДРА (tswow/cores/TrinityCore/src/server/game/Spells/SpellMgr.h)
const PF_KILL = 0x2;
const PF_DONE_MELEE_AUTO = 0x4;
const PF_TAKEN_MELEE_AUTO = 0x8;
const PF_DONE_SPELL_MELEE = 0x10;
const PF_TAKEN_SPELL_MELEE = 0x20;
const PF_DONE_RANGED_AUTO = 0x40;
const PF_TAKEN_RANGED_AUTO = 0x80;
const PF_DONE_SPELL_RANGED = 0x100;
const PF_TAKEN_SPELL_RANGED = 0x200;
const PF_DONE_NONE_POS = 0x400;
const PF_DONE_NONE_NEG = 0x1000;
const PF_TAKEN_NONE_NEG = 0x2000;
const PF_DONE_MAGIC_POS = 0x4000;
const PF_DONE_MAGIC_NEG = 0x10000;
const PF_TAKEN_MAGIC_NEG = 0x20000;

// составные маски
const PF_MELEE_DONE = PF_DONE_MELEE_AUTO | PF_DONE_SPELL_MELEE;
const PF_PHYSICAL_DONE = PF_MELEE_DONE | PF_DONE_RANGED_AUTO | PF_DONE_SPELL_RANGED;
const PF_SPELL_DMG_DONE = PF_DONE_NONE_NEG | PF_DONE_MAGIC_NEG;
const PF_HEAL_DONE = PF_DONE_NONE_POS | PF_DONE_MAGIC_POS;
const PF_ANY_DMG_DONE = PF_PHYSICAL_DONE | PF_SPELL_DMG_DONE;
const PF_DONE_HIT = PF_MELEE_DONE | PF_SPELL_DMG_DONE | PF_HEAL_DONE;
const PF_PLAYER_DONE_HIT = PF_PHYSICAL_DONE | PF_SPELL_DMG_DONE | PF_HEAL_DONE;
const PF_TAKEN_HIT = PF_TAKEN_MELEE_AUTO | PF_TAKEN_SPELL_MELEE | PF_TAKEN_RANGED_AUTO
    | PF_TAKEN_SPELL_RANGED | PF_TAKEN_NONE_NEG | PF_TAKEN_MAGIC_NEG;

// spell_proc HitMask / SpellTypeMask (совпадают с ядром)
const HIT_CRITICAL = 0x2;
const HIT_MISS = 0x4;
const HIT_FULL_RESIST = 0x8;
const HIT_DODGE = 0x10;
const HIT_PARRY = 0x20;
const HIT_BLOCK = 0x40;
const TYPE_DAMAGE = 0x1;
const TYPE_HEAL = 0x2;

// школы (SchoolMask)
const SCH_PHYSICAL = 1, SCH_HOLY = 2, SCH_NATURE = 8;
const SCH_FROST = 16, SCH_SHADOW = 32, SCH_ARCANE = 64;

// мост строковый-id → spell-id
const GEN: { [key: string]: number } = {};
const COMPANION_GEN: { [tag: string]: number } = {};
function reg(key: string, spellId: number): void {
    GEN[key] = spellId;
}

function regCompanionTag(tag: string, spellId: number): void {
    if (COMPANION_GEN[tag] !== undefined) {
        throw new Error(`[retail-talents] duplicate companion spell tag: ${tag}`);
    }
    COMPANION_GEN[tag] = spellId;
}

/* ------------------------------ стат-пассивки ------------------------------ */

type Kind = "spellHit" | "spellCrit" | "meleeCrit" | "stunDuration";

type Spec = {
    id: string;
    name: string;
    desc: string;
    icon: string;
    kind: Kind;
    values: number[];
};

const MECHANIC_STUN = 12;

function addStatEffect(spell: any, kind: Kind, value: number): void {
    if (kind == "spellHit") {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_SPELL_HIT_CHANCE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(value);
    } else if (kind == "spellCrit") {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_SPELL_CRIT_CHANCE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(value);
    } else if (kind == "meleeCrit") {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_WEAPON_CRIT_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(value);
    } else if (kind == "stunDuration") {
        const effect = spell.Effects.addGet();
        effect.Type.APPLY_AURA.set().Aura.MECHANIC_DURATION_MOD.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(-value);
        // Trinity's CalculateSpellDuration reads the mechanic number from
        // MiscValueA. The std Mechanics accessor for aura 232 writes MiscValueB.
        effect.MiscValueA.set(MECHANIC_STUN);
    }
}

const PASSIVES: Spec[] = [
    { id: "magic-hit", name: "Точная формула", desc: "Повышает шанс попадания заклинаниями.", icon: "spell_holy_searinglight", kind: "spellHit", values: [1, 2, 3] },
    { id: "magic-crit", name: "Критическое плетение", desc: "Повышает шанс критического эффекта заклинаний.", icon: "spell_arcane_studentofmagic", kind: "spellCrit", values: [1, 2, 3] },
    { id: "weapon-cruelty", name: "Жестокость", desc: "Повышает шанс критического удара оружием.", icon: "ability_rogue_eviscerate", kind: "meleeCrit", values: [1, 2, 3] },
    { id: "core-stoicism", name: "Стоицизм", desc: "Сокращает длительность получаемых оглушений.", icon: "spell_holy_stoicism", kind: "stunDuration", values: [10, 20, 30] },
];

for (const spec of PASSIVES) {
    for (let i = 0; i < spec.values.length; i++) {
        const rank = i + 1;
        const key = `${spec.id}-${rank}`;
        const spell = std.Spells.create(TALENT_MODULE, key, 11069);
        setTalentText(spell, key, spec.name, spec.desc);
        spell.Icon.setPath(spec.icon);
        spell.Duration.setSimple(-1);
        spell.Attributes.IS_PASSIVE.set(true);
        spell.SchoolMask.clearAll().Effects.clearAll();
        addStatEffect(spell, spec.kind, spec.values[i]);
        reg(key, spell.ID);
    }
}

// Старые ранги магической ветки остаются инертными сущностями, чтобы не
// перераспределять уже выданные постоянные spell id. Login-миграция снимает
// их с персонажа и возвращает очки; новые сборки их больше не показывают.
const LEGACY_RANKS: { id: string; count: number }[] = [
    { id: "magic-power", count: 2 },
    { id: "magic-crit", count: 2 },
    { id: "magic-cost", count: 2 },
    { id: "magic-school-resonance", count: 2 },
    { id: "magic-force-flow", count: 2 },
    { id: "magic-crit-damage", count: 3 },
    { id: "magic-clarity", count: 3 },
    { id: "magic-stability", count: 3 },
    { id: "magic-inner-spark", count: 3 },
    { id: "magic-bright-channel", count: 3 },
    { id: "magic-clean-formula", count: 3 },
    { id: "magic-quiet-weave", count: 2 },
    { id: "magic-astral-focus", count: 5 },
    { id: "magic-fast-formula", count: 3 },
    { id: "magic-free-pulse", count: 3 },
    { id: "magic-absolute-hit", count: 3 },
    { id: "magic-great-flare", count: 3 },
    { id: "magic-great-heal", count: 3 },
    { id: "magic-quick-will", count: 2 },
    { id: "magic-energy-cascade", count: 3 },
    { id: "magic-stable-mana", count: 3 },
    { id: "magic-focus-limit", count: 2 },
    { id: "magic-archmage", count: 5 },
    { id: "magic-high-healer", count: 5 },
    { id: "magic-superconductivity", count: 3 },
    { id: "magic-perfect-formula", count: 3 },
];

for (const legacy of LEGACY_RANKS) {
    const firstRank = legacy.id == "magic-power"
        || legacy.id == "magic-crit"
        || legacy.id == "magic-cost"
        || legacy.id == "magic-school-resonance"
        || legacy.id == "magic-force-flow" ? 4 : 1;
    for (let rank = firstRank; rank < firstRank + legacy.count; rank++) {
        const key = `${legacy.id}-${rank}`;
        const spell = std.Spells.create(TALENT_MODULE, key, 11069);
        spell.Name.enGB.set("Legacy Talent").Name.ruRU.set("Устаревший талант");
        spell.Description.enGB.set("This rank has been replaced by the new talent system.")
            .Description.ruRU.set("Этот ранг заменен новой системой талантов.");
        spell.AuraDescription.enGB.set("This rank has been replaced by the new talent system.")
            .AuraDescription.ruRU.set("Этот ранг заменен новой системой талантов.");
        spell.Duration.setSimple(-1);
        spell.Attributes.IS_PASSIVE.set(true);
        spell.SchoolMask.clearAll().Effects.clearAll();
        reg(key, spell.ID);
    }
}

/* ------------------------- ветка спутников -------------------------------
 * Изучаемые игроком спеллы — пустые пассивные маркеры. Реальные ауры
 * накладываются на обычного Creature через CastCustomSpell, поэтому один
 * payload обслуживает все ранги и не занимает настоящий pet/minion slot. */

type CompanionMarkerSpec = {
    id: string;
    name: string;
    desc: string;
    icon: string;
    ranks: number;
};

const COMPANION_MARKERS: CompanionMarkerSpec[] = [
    { id: "companion-damage", name: "Боевой напарник", desc: "Увеличивает весь урон активного спутника на 2% за ранг.", icon: "ability_hunter_sickem", ranks: 5 },
    { id: "companion-attack-haste", name: "Быстрая выучка", desc: "Увеличивает скорость атак спутника на 3% за ранг.", icon: "ability_hunter_serpentswiftness", ranks: 3 },
    { id: "companion-cast-haste", name: "Чёткая команда", desc: "Увеличивает скорость заклинаний спутника на 3% за ранг.", icon: "spell_nature_bloodlust", ranks: 3 },
    { id: "companion-health", name: "Крепкая связь", desc: "Увеличивает максимальное здоровье спутника на 5% за ранг.", icon: "ability_hunter_mendpet", ranks: 3 },
    { id: "companion-crit", name: "Хищный инстинкт", desc: "Повышает шанс критического эффекта спутника на 2% за ранг.", icon: "ability_hunter_ferociousinspiration", ranks: 3 },
    { id: "companion-defense", name: "Верный защитник", desc: "Снижает получаемый спутником урон на 4% за ранг.", icon: "ability_hunter_longevity", ranks: 3 },
    { id: "companion-unity-aura", name: "Аура единства", desc: "Спутник усиливает себя, владельца и его группу в радиусе 40 м.", icon: "ability_hunter_aspectmastery", ranks: 3 },
    { id: "companion-blood-trail", name: "Кровавый след", desc: "Физические атаки спутника могут вызвать кровотечение.", icon: "ability_druid_ferociousbite", ranks: 3 },
    { id: "companion-spark-echo", name: "Непредсказуемая магия", desc: "Прямой урон заклинаниями спутника может вызвать другую случайную подходящую классовую способность из набора камней: атакующую — по врагу, полезную — по себе или владельцу.", icon: "spell_arcane_blast", ranks: 3 },
    { id: "companion-care-echo", name: "Добрый знак", desc: "Исцеление спутника может наложить на цель случайный полезный эффект.", icon: "spell_holy_blessingofprotection", ranks: 2 },
    { id: "companion-pack-power", name: "Сила стаи", desc: "Дополнительно усиливает «Ауру единства» на 1% за ранг.", icon: "ability_hunter_frenzy", ranks: 3 },
    { id: "companion-perfect-bond", name: "Совершенная связь", desc: "Увеличивает урон и обе скорости спутника ещё на 5%.", icon: "ability_hunter_beastmastery", ranks: 1 },
    { id: "companion-tank-threat", name: "Властный рык", desc: "В режиме «Танк» спутник создаёт на 50% больше угрозы за ранг.", icon: "ability_warrior_defensivestance", ranks: 3 },
    { id: "companion-tank-taunt", name: "Страж стаи", desc: "В режиме «Танк» спутник получает универсальную провокацию.", icon: "spell_nature_reincarnation", ranks: 1 },
];

for (const spec of COMPANION_MARKERS) {
    for (let i = 0; i < spec.ranks; i++) {
        const rank = i + 1;
        const key = `${spec.id}-${rank}`;
        const spell = std.Spells.create(TALENT_MODULE, key, 11069);
        setTalentText(spell, key, spec.name, spec.desc);
        spell.Icon.setPath(spec.icon);
        spell.Duration.setSimple(-1);
        spell.Attributes.IS_PASSIVE.set(true);
        spell.Attributes.CANT_BE_CANCELED.set(true);
        spell.Attributes.HIDE_FROM_AURA_BAR.set(true);
        spell.SchoolMask.clearAll().Effects.clearAll();
        const tag = `spell/talent-${key}`;
        spell.Tags.addUnique(TALENT_MODULE, tag);
        regCompanionTag(tag, spell.ID);
        reg(key, spell.ID);
    }
}

function companionPayload(
    id: string,
    name: string,
    desc: string,
    icon: string,
    base: number = 11069,
    hidden: boolean = true,
): any {
    const spell = std.Spells.create(TALENT_MODULE, id, base);
    setTalentText(spell, id, name, desc);
    spell.Icon.setPath(icon);
    spell.Duration.setSimple(-1);
    spell.Attributes.IS_PASSIVE.set(true);
    spell.Attributes.CANT_BE_CANCELED.set(true);
    spell.Attributes.HIDE_FROM_AURA_BAR.set(hidden);
    spell.Family.set(0);
    spell.SchoolMask.clearAll().Effects.clearAll();
    const tag = `spell/effect-${id}`;
    spell.Tags.addUnique(TALENT_MODULE, tag);
    regCompanionTag(tag, spell.ID);
    return spell;
}

const COMPANION_OFFENSE = companionPayload(
    "companion-offense", "Выучка спутника",
    "Урон и скорость атак и заклинаний спутника увеличены.",
    "ability_hunter_beastcall",
);
COMPANION_OFFENSE.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
    .ImplicitTargetA.UNIT_CASTER.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(0);
COMPANION_OFFENSE.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_MELEE_RANGED_HASTE.set()
    .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(0);
COMPANION_OFFENSE.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_CASTING_SPEED_NOT_STACK.set()
    .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(0);

const COMPANION_RESILIENCE = companionPayload(
    "companion-resilience", "Стойкость спутника",
    "Максимальное здоровье увеличено, получаемый урон снижен.",
    "ability_hunter_mendpet",
);
COMPANION_RESILIENCE.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_INCREASE_HEALTH_PERCENT.set()
    .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(0);
COMPANION_RESILIENCE.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_TAKEN.set()
    .ImplicitTargetA.UNIT_CASTER.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(0);

const COMPANION_CRIT = companionPayload(
    "companion-crit", "Хищный инстинкт",
    "Шанс критического эффекта атак и заклинаний увеличен.",
    "ability_hunter_ferociousinspiration",
);
COMPANION_CRIT.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_WEAPON_CRIT_PERCENT.set()
    .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(0);
COMPANION_CRIT.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_SPELL_CRIT_CHANCE.set()
    .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(0);

const COMPANION_UNITY = companionPayload(
    "companion-unity", "Аура единства",
    "Урон и скорость атак и заклинаний группы увеличены.",
    "ability_hunter_aspectmastery", 465, false,
);
COMPANION_UNITY.SchoolMask.HOLY.set(true);
COMPANION_UNITY.Effects.addGet().Type.APPLY_AREA_AURA_PARTY.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
    .ImplicitTargetA.UNIT_CASTER.set().Radius.setSimple(40)
    .Schools.set(ALL_SCHOOLS as any).PercentBase.set(0);
COMPANION_UNITY.Effects.addGet().Type.APPLY_AREA_AURA_PARTY.set().Aura.MOD_MELEE_RANGED_HASTE.set()
    .ImplicitTargetA.UNIT_CASTER.set().Radius.setSimple(40).PercentBase.set(0);
COMPANION_UNITY.Effects.addGet().Type.APPLY_AREA_AURA_PARTY.set().Aura.MOD_CASTING_SPEED_NOT_STACK.set()
    .ImplicitTargetA.UNIT_CASTER.set().Radius.setSimple(40).PercentBase.set(0);

const COMPANION_TANK = companionPayload(
    "companion-tank", "Властный рык",
    "Создаваемая спутником угроза увеличена в режиме «Танк».",
    "ability_warrior_defensivestance",
);
const companionTankThreat = COMPANION_TANK.Effects.addGet();
companionTankThreat.Type.APPLY_AURA.set().Aura.MOD_THREAT.set()
    .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(0);
// SPELL_AURA_MOD_THREAT reads its school mask from EffectMiscValueA.
companionTankThreat.MiscValueA.set(127);

/* ------------------------- триггеры для проков ------------------------------
 * Каждый триггер — кастомный спелл на базе ПРОВЕРЕННОГО data-driven спелла
 * (руты/станы/бафы) либо скелет 12654/588 с полностью замененными эффектами.
 * SpellFamily всегда 0, стоимость 0 — триггеры кастуются проком бесплатно.  */

function suppressPassiveProcAnimation(spell: any): void {
    if (spell.Visual.get() == 0) return;
    spell.Visual.getRefCopy()
        .PrecastKit.set(0)
        .CastKit.set(0);
}

function makeTrigger(
    key: string,
    base: number,
    edit: (spell: any) => void,
    suppressCasterAnimation: boolean = true,
): number {
    const spell = std.Spells.create(TALENT_MODULE, `t-${key}`, base);
    spell.Family.set(0);
    spell.Power.setMana(0, 0);
    spell.CastTime.setSimple(0, 0, 0);
    edit(spell);
    if (suppressCasterAnimation) suppressPassiveProcAnimation(spell);
    reg(`t-${key}`, spell.ID);
    return spell.ID;
}

function fullClassMask(spell: any): void {
    spell.ClassMask.set(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF);
    for (let i = 0; i < spell.Effects.length; i++) {
        spell.Effects.get(i).ClassMask.set(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF);
    }
}

function nameTrigger(spell: any, name: string, desc: string): void {
    setTalentText(spell, "", name, desc);
}

function makeCleanAuraTrigger(
    key: string,
    name: string,
    desc: string,
    icon: string,
    durationMs: number,
    maxStacks: number,
    edit: (spell: any) => void,
): number {
    return makeTrigger(key, 588, spell => {
        nameTrigger(spell, name, desc);
        spell.Icon.setPath(icon);
        spell.Attributes.clearAll();
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.Duration.setSimple(durationMs);
        spell.row.ProcCharges.set(0);
        if (maxStacks > 0) spell.Stacks.set(maxStacks);
        spell.SchoolMask.clearAll().Effects.clearAll();
        edit(spell);
    });
}

function makeCompanionTrigger(
    key: string,
    tagId: string,
    base: number,
    edit: (spell: any) => void,
): number {
    return makeTrigger(key, base, spell => {
        edit(spell);
        const tag = `spell/effect-${tagId}`;
        spell.Tags.addUnique(TALENT_MODULE, tag);
        regCompanionTag(tag, spell.ID);
    }, false);
}

function configureCompanionRandomDamage(
    spell: any,
    name: string,
    icon: string,
    school: string,
): void {
    nameTrigger(spell, name, "Случайное боевое заклинание спутника.");
    spell.Icon.setPath(icon);
    spell.Attributes.clearAll();
    spell.Attributes.CANT_CRIT.set(true);
    spell.Attributes.IGNORE_BONUSES.set(true);
    spell.Duration.setSimple(0);
    spell.SchoolMask.clearAll();
    if (school == "HOLY") spell.SchoolMask.HOLY.set(true);
    else if (school == "FIRE") spell.SchoolMask.FIRE.set(true);
    else if (school == "NATURE") spell.SchoolMask.NATURE.set(true);
    else if (school == "FROST") spell.SchoolMask.FROST.set(true);
    else if (school == "SHADOW") spell.SchoolMask.SHADOW.set(true);
    else spell.SchoolMask.ARCANE.set(true);
    spell.Effects.clearAll();
    const effect = spell.Effects.addGet();
    effect.Type.SCHOOL_DAMAGE.set()
        .ImplicitTargetA.UNIT_TARGET_ENEMY.set().DamageBase.set(1);
    effect.BonusMultiplier.set(0);
}

function configureCompanionRandomBenefit(
    spell: any,
    name: string,
    desc: string,
    icon: string,
): void {
    nameTrigger(spell, name, desc);
    spell.Icon.setPath(icon);
    spell.Attributes.clearAll();
    spell.Duration.setSimple(10000);
    spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
    spell.Effects.clearAll();
}

// ОСНОВА: универсальные реакции вместо постоянной россыпи характеристик.
const coreToughnessIds = [1, 2, 3, 4, 5].map((stacks, i) => makeCleanAuraTrigger(
    `core-toughness-${i + 1}`, "Закалка", "Получаемый урон снижен.",
    "spell_holy_devotionaura", 6000, stacks, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_TAKEN.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(-2);
    },
));

const coreConvictionIds = [1, 2, 3, 4, 5].map((stacks, i) => makeCleanAuraTrigger(
    `core-conviction-${i + 1}`, "Убежденность", "Урон и исцеление усилены.",
    "spell_holy_retributionaura", 6000, stacks, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(2);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HEALING_DONE_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(MAGIC_SCHOOLS as any).PercentBase.set(2);
    },
));

const coreWisdomId = makeTrigger("core-wisdom-heal", 12654, spell => {
    nameTrigger(spell, "Внутренний резерв", "Восстанавливает 1% максимального здоровья.");
    spell.Icon.setPath("spell_holy_magicalsentry");
    spell.Attributes.clearAll();
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.HEAL_PCT.set()
        .ImplicitTargetA.UNIT_CASTER.set().HealPctBase.set(1);
});

const corePursuitIds = [20, 40].map((pct, i) => makeCleanAuraTrigger(
    `core-pursuit-${i + 1}`, "Погоня", "Скорость передвижения увеличена.",
    "ability_rogue_sprint", 8000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_INCREASE_SPEED.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
    },
));

const coreDeflectionIds = [3, 6, 9, 12, 15].map((pct, i) => makeCleanAuraTrigger(
    `core-deflection-${i + 1}`, "Ответная стойка", "Урон и исцеление усилены.",
    "ability_parry", 6000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(pct);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HEALING_DONE_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(MAGIC_SCHOOLS as any).PercentBase.set(pct);
    },
));

const coreKingsId = makeCleanAuraTrigger(
    "core-kings", "Королевская стать", "Все характеристики увеличены.",
    "spell_magic_greaterblessingofkings", 10000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_TOTAL_STAT_PERCENTAGE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(10).Stat.ALL.set();
    },
);

const coreMightIds = [2, 4, 6, 8, 10].map((pct, i) => makeCleanAuraTrigger(
    `core-might-${i + 1}`, "Могущество победителя", "Урон и исцеление усилены.",
    "spell_holy_fistofjustice", 8000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(pct);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HEALING_DONE_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(MAGIC_SCHOOLS as any).PercentBase.set(pct);
    },
));

const corePrecisionIds = [10, 20, 30].map((pct, i) => makeCleanAuraTrigger(
    `core-precision-${i + 1}`, "Исправленная ошибка", "Шанс попадания увеличен.",
    "ability_marksmanship", 6000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HIT_CHANCE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_SPELL_HIT_CHANCE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
    },
));

const coreForesightIds = [10, 20, 30, 40, 50].map((pct, i) => makeCleanAuraTrigger(
    `core-foresight-${i + 1}`, "Предвидение", "Шанс критического эффекта увеличен.",
    "spell_shadow_twilight", 4000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_WEAPON_CRIT_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_SPELL_CRIT_CHANCE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
    },
));

// МАГИЯ: общий поток заклинаний и отдельные реакции школ.
const magicPowerIds = [1, 2, 3].map((stacks, i) => makeCleanAuraTrigger(
    `magic-power-${i + 1}`, "Плетение заклинаний", "Урон и исцеление заклинаний усилены.",
    "spell_arcane_arcanepotency", 8000, stacks, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(MAGIC_SCHOOLS as any).PercentBase.set(2);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HEALING_DONE_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(MAGIC_SCHOOLS as any).PercentBase.set(2);
    },
));

const magicArcaneManaIds = [1, 2, 3].map((pct, i) => makeTrigger(
    `magic-arcane-mana-${i + 1}`, 12654, spell => {
        nameTrigger(spell, "Чародейская ясность", "Восстанавливает ману.");
        spell.Icon.setPath("spell_arcane_arcane01");
        spell.Attributes.clearAll();
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.SchoolMask.clearAll().SchoolMask.ARCANE.set(true);
        spell.Effects.clearAll();
        spell.Effects.addGet().Type.ENERGIZE_PCT.set()
            .ImplicitTargetA.UNIT_CASTER.set().PowerType.MANA.set().PowerPctBase.set(pct);
    },
));

const magicNatureIds = [5, 10, 15].map((pct, i) => makeCleanAuraTrigger(
    `magic-nature-${i + 1}`, "Природный импульс", "Заклинания произносятся быстрее.",
    "spell_nature_lightning", 6000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_CASTING_SPEED_NOT_STACK.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
    },
));

const magicHolyHealIds = [1, 2, 3].map((pct, i) => makeTrigger(
    `magic-holy-heal-${i + 1}`, 12654, spell => {
        nameTrigger(spell, "Светоносность", "Восстанавливает здоровье.");
        spell.Icon.setPath("spell_holy_healingaura");
        spell.Attributes.clearAll();
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
        spell.Effects.clearAll();
        spell.Effects.addGet().Type.HEAL_PCT.set()
            .ImplicitTargetA.UNIT_CASTER.set().HealPctBase.set(pct);
    },
));

const magicEnergyIds = [10, 20, 30].map((pct, i) => makeCleanAuraTrigger(
    `magic-energy-${i + 1}`, "Сбереженная энергия", "Стоимость заклинаний снижена.",
    "spell_frost_manarecharge", 6000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_POWER_COST_SCHOOL_PCT.set()
            .ImplicitTargetA.UNIT_CASTER.set().School.set(MAGIC_SCHOOLS as any).PercentBase.set(-pct);
    },
));

const magicEchoIds = [75, 150, 225].map((damage, i) => makeTrigger(
    `magic-echo-${i + 1}`, 12654, spell => {
        nameTrigger(spell, "Отзвук магии", "Наносит дополнительный урон тайной магией.");
        spell.Icon.setPath("spell_arcane_blast");
        spell.Attributes.clearAll();
        spell.Attributes.CANT_CRIT.set(true);
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.Levels.set(0, 0, 0);
        spell.BonusData.DirectBonus.set((i + 1) * 0.10);
        spell.SchoolMask.clearAll().SchoolMask.ARCANE.set(true);
        spell.Duration.setSimple(0);
        spell.Effects.clearAll();
        spell.Effects.addGet().Type.SCHOOL_DAMAGE.set()
            .ImplicitTargetA.UNIT_TARGET_ENEMY.set().DamageBase.set(damage);
    },
));

const magicForceIds = [3, 6, 9].map((pct, i) => makeCleanAuraTrigger(
    `magic-force-${i + 1}`, "Поток силы", "Урон и исцеление заклинаний усилены.",
    "spell_holy_divineillumination", 6000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(MAGIC_SCHOOLS as any).PercentBase.set(pct);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HEALING_DONE_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(MAGIC_SCHOOLS as any).PercentBase.set(pct);
    },
));

// ОРУЖИЕ: накопление темпа, критические окна и ответ на неудачные атаки.
const weaponMasteryIds = [1, 2, 3, 4, 5].map((stacks, i) => makeCleanAuraTrigger(
    `weapon-mastery-${i + 1}`, "Боевой ритм", "Физический урон увеличен.",
    "ability_warrior_savageblow", 6000, stacks, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(["PHYSICAL"] as any).PercentBase.set(2);
    },
));

const weaponBloodlustIds = [1, 2, 3].map((pct, i) => makeTrigger(
    `weapon-bloodlust-${i + 1}`, 12654, spell => {
        nameTrigger(spell, "Кровожадность", "Восстанавливает здоровье.");
        spell.Icon.setPath("spell_nature_bloodlust");
        spell.Attributes.clearAll();
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.SchoolMask.clearAll().SchoolMask.PHYSICAL.set(true);
        spell.Effects.clearAll();
        spell.Effects.addGet().Type.HEAL_PCT.set()
            .ImplicitTargetA.UNIT_CASTER.set().HealPctBase.set(pct);
    },
));

const weaponImpaleIds = [4, 8].map((pct, i) => makeCleanAuraTrigger(
    `weapon-impale-${i + 1}`, "Пронзание", "Получаемый физический урон увеличен.",
    "ability_searingarrow", 6000, 1, spell => {
        spell.Attributes.IS_NEGATIVE.set(true);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_TAKEN.set()
            .ImplicitTargetA.UNIT_TARGET_ENEMY.set().Schools.set(["PHYSICAL"] as any).PercentBase.set(pct);
    },
));

const weaponShockwaveIds = [60, 120, 180].map((damage, i) => makeTrigger(
    `weapon-shockwave-${i + 1}`, 12654, spell => {
        nameTrigger(spell, "Ударная волна", "Наносит дополнительный физический урон.");
        spell.Icon.setPath("ability_warrior_shockwave");
        spell.Attributes.clearAll();
        spell.Attributes.CANT_CRIT.set(true);
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.Levels.set(0, 0, 0);
        spell.BonusData.APBonus.set((i + 1) * 0.05);
        spell.SchoolMask.clearAll().SchoolMask.PHYSICAL.set(true);
        spell.Duration.setSimple(0);
        spell.Effects.clearAll();
        spell.Effects.addGet().Type.SCHOOL_DAMAGE.set()
            .ImplicitTargetA.UNIT_TARGET_ENEMY.set().DamageBase.set(damage);
    },
));

const weaponGripIds = [15, 30].map((pct, i) => makeCleanAuraTrigger(
    `weapon-grip-${i + 1}`, "Железная хватка", "Шанс попадания и критического удара оружием увеличен.",
    "ability_meleedamage", 6000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HIT_CHANCE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_WEAPON_CRIT_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
    },
));

const weaponWardIds = [250, 500, 750].map((absorb, i) => makeTrigger(
    `weapon-ward-${i + 1}`, 17, spell => {
        nameTrigger(spell, "Боевая закалка", "Поглощает входящий урон.");
        spell.Icon.setPath("ability_warrior_shieldmastery");
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.Levels.set(0, 0, 0);
        spell.Duration.setSimple(10000);
        const effect = spell.Effects.get(0);
        effect.ImplicitTargetA.UNIT_CASTER.set()
            .PointsBase.set(absorb - 1).PointsDieSides.set(1);
        effect.PointsPerLevel.set((i + 1) * 4);
    },
));

const weaponUnstoppableId = makeCleanAuraTrigger(
    "weapon-unstoppable", "Неудержимость", "Физический урон и скорость атак увеличены.",
    "ability_warrior_endlessrage", 8000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(["PHYSICAL"] as any).PercentBase.set(10);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_MELEE_RANGED_HASTE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(10);
    },
);

// ЖИВУЧЕСТЬ: критическое лечение и защитные ответы поддерживают друг друга.
const vitalGiftIds = [200, 400, 600].map((absorb, i) => makeTrigger(
    `vital-gift-${i + 1}`, 17, spell => {
        nameTrigger(spell, "Дар жизни", "Поглощает входящий урон.");
        spell.Icon.setPath("spell_holy_flashheal");
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.Levels.set(0, 0, 0);
        spell.Duration.setSimple(10000);
        const effect = spell.Effects.get(0);
        effect.PointsBase.set(absorb - 1).PointsDieSides.set(1);
        effect.PointsPerLevel.set((i + 1) * 3);
    },
));

const vitalBulwarkIds = [4, 8, 12].map((pct, i) => makeCleanAuraTrigger(
    `vital-bulwark-${i + 1}`, "Оплот", "Получаемый урон снижен.",
    "ability_defend", 6000, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_TAKEN.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(-pct);
    },
));

const vitalFocusIds = [3000, 6000, 9000].map((duration, i) => makeCleanAuraTrigger(
    `vital-focus-${i + 1}`, "Духовное средоточие", "Урон не задерживает произнесение заклинаний.",
    "spell_arcane_mindmastery", duration, 1, spell => {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.REDUCE_PUSHBACK.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(ALL_SCHOOLS as any).PointsBase.set(100);
    },
));

const vitalMeditationIds = [1, 2, 3].map((pct, i) => makeTrigger(
    `vital-meditation-${i + 1}`, 12654, spell => {
        nameTrigger(spell, "Медитация", "Восстанавливает ману.");
        spell.Icon.setPath("spell_nature_sleep");
        spell.Attributes.clearAll();
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
        spell.Effects.clearAll();
        spell.Effects.addGet().Type.ENERGIZE_PCT.set()
            .ImplicitTargetA.UNIT_CASTER.set().PowerType.MANA.set().PowerPctBase.set(pct);
    },
));

const vitalResonanceIds = [1, 2, 3, 4, 5].map((pct, i) => makeTrigger(
    `vital-resonance-${i + 1}`, 12654, spell => {
        nameTrigger(spell, "Резонанс жизни", "Восстанавливает здоровье целителю.");
        spell.Icon.setPath("spell_holy_holyguidance");
        spell.Attributes.clearAll();
        spell.Attributes.CANT_CRIT.set(true);
        spell.Attributes.CANT_TRIGGER_PROC.set(true);
        spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
        spell.Effects.clearAll();
        spell.Effects.addGet().Type.HEAL_PCT.set()
            .ImplicitTargetA.UNIT_CASTER.set().HealPctBase.set(pct);
    },
));

// ponytail: data-driven spell-power scaling; a share of the triggering crit would require one runtime proc handler.
const burnIds = [40, 80, 120].map((tick, i) => makeTrigger(`burn-${i + 1}`, 12654, spell => {
    nameTrigger(spell, "Воспламенение", "Горит, получая усиливаемый силой заклинаний урон каждые 2 сек.");
    spell.Attributes.IGNORE_BONUSES.set(false);
    spell.Levels.set(0, 0, 0);
    spell.BonusData.DotBonus.set((i + 1) * 0.04);
    spell.Duration.setSimple(6000);
    spell.Effects.get(0).PointsBase.set(tick - 1).PointsDieSides.set(1);
}));

// приморозка: Frostbite root 12494 (data-driven)
const frostgripId = makeTrigger("frostgrip", 12494, spell => {
    nameTrigger(spell, "Обморожение", "Приморожен к земле.");
});

// оглушение тьмой: база Concussion Blow 12809 (15269/Blackout в этом DBC нет),
// оставляем чистый стан без урона
const shadowdazeId = makeTrigger("shadowdaze", 12809, spell => {
    nameTrigger(spell, "Сумрак", "Оглушен тьмой.");
    spell.SchoolMask.clearAll().SchoolMask.SHADOW.set(true);
    spell.Duration.setSimple(3000);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_STUN.set()
        .ImplicitTargetA.UNIT_TARGET_ENEMY.set();
});

// благодать природы: бафф 16886 (следующее заклинание быстрее), маска на все
const graceId = makeTrigger("grace", 16886, spell => {
    nameTrigger(spell, "Благодать природы", "Следующее заклинание произносится быстрее.");
    fullClassMask(spell);
});

const vitalGraceId = makeTrigger("vital-grace", 16886, spell => {
    nameTrigger(spell, "Милость", "Следующее подходящее заклинание произносится быстрее.");
    fullClassMask(spell);
});

// искусство войны: 59578 даёт -100% времени каста; 53489 снимает только 750 мс
const artofwarId = makeTrigger("artofwar", 59578, spell => {
    nameTrigger(spell, "Искусство войны", "Следующее заклинание произносится мгновенно.");
    fullClassMask(spell);
});

// шквал: бафы Flurry 12966-12970 (+скорость атаки, 3 заряда)
const FLURRY_BASES = [12966, 12967, 12968, 12969, 12970];
const flurryIds = FLURRY_BASES.map((base, i) => makeTrigger(`flurry-${i + 1}`, base, spell => {
    nameTrigger(spell, "Шквал", "Скорость атаки ближнего боя увеличена.");
}));

// возмездие: бафф Vengeance 20050 → урон ВСЕХ школ
const vengeanceIds = [4, 7, 10].map((pct, i) => makeTrigger(`vengeance-${i + 1}`, 20050, spell => {
    nameTrigger(spell, "Возмездие", "Весь наносимый урон увеличен.");
    spell.Duration.setSimple(8000);
    for (let j = 0; j < spell.Effects.length; j++) {
        const eff = spell.Effects.get(j);
        eff.PointsBase.set(pct - 1).PointsDieSides.set(1);
        eff.MiscValueA.set(127); // все школы (MOD_DAMAGE_PERCENT_DONE misc = маска школ)
    }
}));

// Кровотечение масштабируется от силы атаки штатной записью spell_bonus_data.
const bleedIds = [20, 40, 60].map((tick, i) => makeTrigger(`bleed-${i + 1}`, 12721, spell => {
    nameTrigger(spell, "Глубокая рана", "Истекает кровью каждые 3 сек.");
    spell.Attributes.IGNORE_BONUSES.set(false);
    spell.Levels.set(0, 0, 0);
    spell.BonusData.APDotBonus.set((i + 1) * 0.01);
    spell.Duration.setSimple(12000);
    spell.Effects.get(0).PointsBase.set(tick - 1).PointsDieSides.set(1);
}));

// упоение битвой: бафф скорости атаки после убийства (без зарядов)
const warstormId = makeTrigger("warstorm", 12970, spell => {
    nameTrigger(spell, "Упоение битвой", "Скорость атаки резко увеличена.");
    spell.Duration.setSimple(10000);
    spell.row.ProcCharges.set(0);
});

// тяжелая рука: стан 2 сек (база Concussion Blow, без урона)
const heavyhandId = makeTrigger("heavyhand", 12809, spell => {
    nameTrigger(spell, "Тяжелая рука", "Оглушен ударом.");
    spell.Duration.setSimple(2000);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_STUN.set()
        .ImplicitTargetA.UNIT_TARGET_ENEMY.set();
});

// расправа: убийство лечит % макс. здоровья (скелет)
const executionIds = [5, 10].map((pct, i) => makeTrigger(`execution-${i + 1}`, 12654, spell => {
    nameTrigger(spell, "Расправа", "Убийство восстанавливает здоровье.");
    spell.Attributes.clearAll();
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.HEAL_PCT.set()
        .ImplicitTargetA.UNIT_CASTER.set().HealPctBase.set(pct);
}));

// каменная кожа: бафф брони на базе Inner Fire 588
const stoneskinIds = [500, 1000, 1500].map((armor, i) => makeTrigger(`stoneskin-${i + 1}`, 588, spell => {
    nameTrigger(spell, "Каменная кожа", "Броня увеличена.");
    spell.Levels.set(0, 0, 0);
    spell.Duration.setSimple(12000);
    spell.row.ProcCharges.set(0);
    const effect = spell.Effects.get(0);
    effect.PointsBase.set(armor - 1).PointsDieSides.set(1);
    effect.PointsPerLevel.set((i + 1) * 5);
}));

// второе дыхание: реген % здоровья (скелет, OBS_MOD_HEALTH)
const secondwindIds = [10, 20].map((pct, i) => makeTrigger(`secondwind-${i + 1}`, 588, spell => {
    nameTrigger(spell, "Второе дыхание", "Быстро восстанавливает здоровье.");
    spell.Duration.setSimple(10000);
    spell.row.ProcCharges.set(0);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.APPLY_AURA.set().Aura.OBS_MOD_HEALTH.set()
        .ImplicitTargetA.UNIT_CASTER.set().HealPctBase.set(pct / 5)
        .AuraPeriod.set(2000);
}));

// искра жизни: HoT на цель исцеления (база Rejuvenation 774)
const lifesparkIds = [25, 50, 75].map((tick, i) => makeTrigger(`lifespark-${i + 1}`, 774, spell => {
    nameTrigger(spell, "Искра жизни", "Постепенно восстанавливает здоровье.");
    spell.Attributes.IGNORE_BONUSES.set(false);
    spell.Levels.set(0, 0, 0);
    spell.BonusData.DotBonus.set((i + 1) * 0.03);
    spell.Duration.setSimple(9000);
    spell.Effects.get(0).PointsBase.set(tick - 1).PointsDieSides.set(1);
}));

// Просветление возвращает долю максимальной маны и не устаревает с экипировкой.
const clarityIds = [1, 2, 3].map((pct, i) => makeTrigger(`clarity-${i + 1}`, 12654, spell => {
    nameTrigger(spell, "Просветление", "Восстанавливает ману.");
    spell.Attributes.clearAll();
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.ENERGIZE_PCT.set()
        .ImplicitTargetA.UNIT_CASTER.set().PowerType.MANA.set().PowerPctBase.set(pct);
}));

// оберег: щит-поглощение (база PW:S 17; клон теряет "ослабленную душу" — и хорошо)
const wardIds = [300, 600, 900].map((absorb, i) => makeTrigger(`ward-${i + 1}`, 17, spell => {
    nameTrigger(spell, "Оберег", "Поглощает входящий урон.");
    spell.Levels.set(0, 0, 0);
    spell.Duration.setSimple(12000);
    const effect = spell.Effects.get(0);
    effect.ImplicitTargetA.UNIT_CASTER.set()
        .PointsBase.set(absorb - 1).PointsDieSides.set(1);
    effect.PointsPerLevel.set((i + 1) * 4);
}));

// инстинкт выживания: +получаемое исцеление (скелет)
const instinctIds = [10, 20].map((pct, i) => makeTrigger(`instinct-${i + 1}`, 588, spell => {
    nameTrigger(spell, "Инстинкт выживания", "Получаемое исцеление увеличено.");
    spell.Duration.setSimple(10000);
    spell.row.ProcCharges.set(0);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HEALING_PCT.set()
        .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(pct);
}));

// возмездие света: урон светом атакующему (скелет, прямой урон)
const lightguardIds = [100, 200].map((dmg, i) => makeTrigger(`lightguard-${i + 1}`, 12654, spell => {
    nameTrigger(spell, "Возмездие Света", "Обжигает магией Света.");
    spell.Attributes.clearAll();
    spell.Attributes.CANT_CRIT.set(true);
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.Levels.set(0, 0, 0);
    spell.BonusData.DirectBonus.set((i + 1) * 0.05);
    spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
    spell.Duration.setSimple(0);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.SCHOOL_DAMAGE.set()
        .ImplicitTargetA.UNIT_TARGET_ENEMY.set().DamageBase.set(dmg);
}));

// свет в бою: самолечение от урона светом (скелет)
const lightindarkIds = [150, 300].map((heal, i) => makeTrigger(`lightindark-${i + 1}`, 12654, spell => {
    nameTrigger(spell, "Свет в бою", "Свет исцеляет вас.");
    spell.Attributes.clearAll();
    spell.Attributes.CANT_CRIT.set(true);
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.Levels.set(0, 0, 0);
    spell.BonusData.DirectBonus.set((i + 1) * 0.10);
    spell.SchoolMask.clearAll().SchoolMask.HOLY.set(true);
    spell.Duration.setSimple(0);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.HEAL.set()
        .ImplicitTargetA.UNIT_CASTER.set().HealBase.set(heal);
}));

// Таланты спутника: кровотечение и безопасные случайные пулы.
const companionBleedIds = [20, 40, 60].map((tick, i) => makeTrigger(
    `companion-bleed-${i + 1}`, 12721, spell => {
        nameTrigger(spell, "Кровавый след", "Истекает кровью каждые 3 сек.");
        spell.Duration.setSimple(12000);
        spell.Effects.get(0).PointsBase.set(tick - 1).PointsDieSides.set(1);
    }, false,
));

const companionRandomOffenseIds = [
    makeCompanionTrigger("companion-spark-1", "companion-random-fire", 133, spell =>
        configureCompanionRandomDamage(spell, "Случайный огненный шар", "spell_fire_flamebolt", "FIRE")),
    makeCompanionTrigger("companion-spark-2", "companion-random-frost", 116, spell =>
        configureCompanionRandomDamage(spell, "Случайная ледяная стрела", "spell_frost_frostbolt02", "FROST")),
    makeCompanionTrigger("companion-spark-3", "companion-random-nature", 403, spell =>
        configureCompanionRandomDamage(spell, "Случайная молния", "spell_nature_lightning", "NATURE")),
    makeCompanionTrigger("companion-random-shadow", "companion-random-shadow", 686, spell =>
        configureCompanionRandomDamage(spell, "Случайная стрела Тьмы", "spell_shadow_shadowbolt", "SHADOW")),
    makeCompanionTrigger("companion-random-holy", "companion-random-holy", 585, spell =>
        configureCompanionRandomDamage(spell, "Случайная кара", "spell_holy_holysmite", "HOLY")),
    makeCompanionTrigger("companion-random-arcane", "companion-random-arcane", 30451, spell =>
        configureCompanionRandomDamage(spell, "Случайный чародейский импульс", "spell_arcane_blast", "ARCANE")),
];
const companionSparkIds = [
    companionRandomOffenseIds[0],
    companionRandomOffenseIds[1],
    companionRandomOffenseIds[2],
];

const companionRandomBenefitIds = [
    makeCompanionTrigger("companion-care-1", "companion-random-power", 2061, spell => {
        configureCompanionRandomBenefit(
            spell, "Случайная сила", "Наносимый урон увеличен.", "ability_warrior_battleshout",
        );
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_TARGET_ALLY.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(0);
    }),
    makeCompanionTrigger("companion-care-2", "companion-random-haste", 2061, spell => {
        configureCompanionRandomBenefit(
            spell, "Случайная стремительность", "Скорость атак и заклинаний увеличена.", "spell_nature_bloodlust",
        );
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_MELEE_RANGED_HASTE.set()
            .ImplicitTargetA.UNIT_TARGET_ALLY.set().PercentBase.set(0);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_CASTING_SPEED_NOT_STACK.set()
            .ImplicitTargetA.UNIT_TARGET_ALLY.set().PercentBase.set(0);
    }),
    makeCompanionTrigger("companion-care-3", "companion-random-guard", 2061, spell => {
        configureCompanionRandomBenefit(
            spell, "Случайный оберег", "Получаемый урон снижен.", "spell_nature_stoneclawtotem",
        );
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_TAKEN.set()
            .ImplicitTargetA.UNIT_TARGET_ALLY.set().Schools.set(ALL_SCHOOLS as any).PercentBase.set(0);
    }),
    makeCompanionTrigger("companion-care-4", "companion-random-fortune", 2061, spell => {
        configureCompanionRandomBenefit(
            spell, "Случайная удача", "Шанс критического эффекта увеличен.", "ability_hunter_ferociousinspiration",
        );
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_WEAPON_CRIT_PERCENT.set()
            .ImplicitTargetA.UNIT_TARGET_ALLY.set().PercentBase.set(0);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_SPELL_CRIT_CHANCE.set()
            .ImplicitTargetA.UNIT_TARGET_ALLY.set().PercentBase.set(0);
    }),
];
const companionCareIds = [companionRandomBenefitIds[0], companionRandomBenefitIds[1]];

/* ------------------------------ прок-пассивки ------------------------------
 * Аура PROC_TRIGGER_SPELL + spell_proc (сырые procFlags ядра).            */

type ProcSpec = {
    id: string;
    name: string;
    desc: string;
    icon: string;
    /** триггеры по рангам; если триггер один — шанc растет по рангам */
    triggers: number[];
    chances: number[];
    procFlags: number;
    hitMask?: number;
    schoolMask?: number;
    typeMask?: number;
    cooldownMs?: number;
};

const PROCS: ProcSpec[] = [
    // ОСНОВА
    { id: "core-toughness", name: "Закалка", desc: "Физический урон накапливает защитные заряды.",
      icon: "spell_holy_devotionaura", triggers: coreToughnessIds, chances: [100, 100, 100, 100, 100],
      procFlags: PF_TAKEN_HIT, schoolMask: SCH_PHYSICAL, typeMask: TYPE_DAMAGE },
    { id: "core-conviction", name: "Убежденность", desc: "Критические эффекты накапливают боевые заряды.",
      icon: "spell_holy_retributionaura", triggers: coreConvictionIds, chances: [100, 100, 100, 100, 100],
      procFlags: PF_ANY_DMG_DONE | PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_DAMAGE | TYPE_HEAL },
    { id: "core-wisdom", name: "Внутренний резерв", desc: "Критический эффект может восстановить здоровье.",
      icon: "spell_holy_magicalsentry", triggers: [coreWisdomId, coreWisdomId, coreWisdomId], chances: [33, 66, 100],
      procFlags: PF_ANY_DMG_DONE | PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_DAMAGE | TYPE_HEAL,
      cooldownMs: 5000 },
    { id: "core-pursuit", name: "Погоня", desc: "Убийство временно ускоряет передвижение.",
      icon: "ability_rogue_sprint", triggers: corePursuitIds, chances: [100, 100], procFlags: PF_KILL },
    { id: "core-deflection", name: "Ответная стойка", desc: "Избежание удара временно усиливает урон и исцеление.",
      icon: "ability_parry", triggers: coreDeflectionIds, chances: [100, 100, 100, 100, 100],
      procFlags: PF_TAKEN_HIT, hitMask: HIT_DODGE | HIT_PARRY | HIT_BLOCK },
    { id: "core-kings", name: "Королевская стать", desc: "Полученный критический удар временно усиливает все характеристики.",
      icon: "spell_magic_greaterblessingofkings", triggers: [coreKingsId], chances: [100],
      procFlags: PF_TAKEN_HIT, hitMask: HIT_CRITICAL, cooldownMs: 45000 },
    { id: "core-might", name: "Могущество победителя", desc: "Убийство временно усиливает урон и исцеление.",
      icon: "spell_holy_fistofjustice", triggers: coreMightIds, chances: [100, 100, 100, 100, 100],
      procFlags: PF_KILL },
    { id: "core-precision", name: "Исправленная ошибка", desc: "Неудачная атака временно повышает шанс попадания.",
      icon: "ability_marksmanship", triggers: corePrecisionIds, chances: [100, 100, 100],
      procFlags: PF_ANY_DMG_DONE, hitMask: HIT_MISS | HIT_FULL_RESIST | HIT_DODGE | HIT_PARRY,
      typeMask: TYPE_DAMAGE },
    { id: "core-foresight", name: "Предвидение", desc: "Избежание удара временно повышает шанс критического эффекта.",
      icon: "spell_shadow_twilight", triggers: coreForesightIds, chances: [100, 100, 100, 100, 100],
      procFlags: PF_TAKEN_HIT, hitMask: HIT_DODGE | HIT_PARRY | HIT_BLOCK },
    { id: "core-stoneskin", name: "Каменная кожа", desc: "Полученный крит увеличивает броню.",
      icon: "inv_stone_15", triggers: stoneskinIds, chances: [100, 100, 100],
      procFlags: PF_TAKEN_HIT, hitMask: HIT_CRITICAL },
    { id: "core-secondwind", name: "Второе дыхание", desc: "Попадание вражеской способностью запускает восстановление здоровья.",
      icon: "ability_hunter_onewithnature", triggers: secondwindIds, chances: [100, 100],
      procFlags: PF_TAKEN_SPELL_MELEE | PF_TAKEN_SPELL_RANGED | PF_TAKEN_MAGIC_NEG | PF_TAKEN_NONE_NEG,
      cooldownMs: 20000 },

    // МАГИЯ
    { id: "magic-power", name: "Плетение заклинаний", desc: "Урон и исцеление заклинаниями накапливают усиливающие заряды.",
      icon: "spell_arcane_arcanepotency", triggers: magicPowerIds, chances: [100, 100, 100],
      procFlags: PF_SPELL_DMG_DONE | PF_HEAL_DONE, typeMask: TYPE_DAMAGE | TYPE_HEAL },
    { id: "magic-ignite", name: "Воспламенение", desc: "Критический урон заклинанием поджигает цель.",
      icon: "spell_fire_incinerate", triggers: burnIds, chances: [35, 70, 100],
      procFlags: PF_SPELL_DMG_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_DAMAGE },
    { id: "magic-cost", name: "Чародейская ясность", desc: "Критический урон тайной магией восстанавливает ману.",
      icon: "spell_arcane_arcane01", triggers: magicArcaneManaIds, chances: [100, 100, 100],
      procFlags: PF_SPELL_DMG_DONE, hitMask: HIT_CRITICAL, schoolMask: SCH_ARCANE, typeMask: TYPE_DAMAGE,
      cooldownMs: 5000 },
    { id: "magic-haste", name: "Природный импульс", desc: "Заклинания природы могут временно ускорить произнесение.",
      icon: "spell_nature_lightning", triggers: magicNatureIds, chances: [20, 40, 60],
      procFlags: PF_SPELL_DMG_DONE | PF_HEAL_DONE, schoolMask: SCH_NATURE, typeMask: TYPE_DAMAGE | TYPE_HEAL },
    { id: "magic-heal", name: "Светоносность", desc: "Урон Светом может восстановить здоровье.",
      icon: "spell_holy_healingaura", triggers: magicHolyHealIds, chances: [20, 40, 60],
      procFlags: PF_SPELL_DMG_DONE, schoolMask: SCH_HOLY, typeMask: TYPE_DAMAGE, cooldownMs: 3000 },
    { id: "magic-regen", name: "Сбереженная энергия", desc: "Критический эффект временно снижает стоимость заклинаний.",
      icon: "spell_frost_manarecharge", triggers: magicEnergyIds, chances: [100, 100, 100],
      procFlags: PF_SPELL_DMG_DONE | PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_DAMAGE | TYPE_HEAL },
    { id: "magic-frostgrip", name: "Обморожение", desc: "Урон от льда примораживает цель.",
      icon: "spell_frost_frostarmor", triggers: [frostgripId, frostgripId, frostgripId], chances: [5, 10, 15],
      procFlags: PF_SPELL_DMG_DONE, schoolMask: SCH_FROST, typeMask: TYPE_DAMAGE, cooldownMs: 8000 },
    { id: "magic-shadowdaze", name: "Сумрак", desc: "Урон от тьмы оглушает цель.",
      icon: "spell_shadow_gathershadows", triggers: [shadowdazeId, shadowdazeId, shadowdazeId], chances: [4, 7, 10],
      procFlags: PF_SPELL_DMG_DONE, schoolMask: SCH_SHADOW, typeMask: TYPE_DAMAGE, cooldownMs: 10000 },
    { id: "magic-school-resonance", name: "Отзвук магии", desc: "Урон заклинанием может вызвать дополнительный чародейский импульс.",
      icon: "spell_arcane_blast", triggers: magicEchoIds, chances: [5, 10, 15],
      procFlags: PF_SPELL_DMG_DONE, typeMask: TYPE_DAMAGE, cooldownMs: 2000 },
    { id: "magic-force-flow", name: "Поток силы", desc: "Критический эффект временно усиливает урон и исцеление заклинаний.",
      icon: "spell_holy_divineillumination", triggers: magicForceIds, chances: [100, 100, 100],
      procFlags: PF_SPELL_DMG_DONE | PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_DAMAGE | TYPE_HEAL },
    { id: "magic-natures-grace", name: "Благодать природы", desc: "Критический эффект ускоряет следующее заклинание.",
      icon: "spell_nature_naturesblessing", triggers: [graceId, graceId], chances: [50, 100],
      procFlags: PF_SPELL_DMG_DONE | PF_HEAL_DONE, hitMask: HIT_CRITICAL },

    // ОРУЖИЕ
    { id: "weapon-mastery", name: "Боевой ритм", desc: "Прямые физические атаки накапливают усиливающие заряды.",
      icon: "ability_warrior_savageblow", triggers: weaponMasteryIds, chances: [100, 100, 100, 100, 100],
      procFlags: PF_PHYSICAL_DONE, schoolMask: SCH_PHYSICAL, typeMask: TYPE_DAMAGE },
    { id: "weapon-vengeance", name: "Возмездие", desc: "Критический урон увеличивает весь наносимый урон.",
      icon: "ability_racial_avatar", triggers: vengeanceIds, chances: [100, 100, 100],
      procFlags: PF_ANY_DMG_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_DAMAGE },
    { id: "weapon-artofwar", name: "Искусство войны", desc: "Критический удар делает следующее заклинание мгновенным.",
      icon: "ability_paladin_artoftheprotector", triggers: [artofwarId], chances: [100],
      procFlags: PF_MELEE_DONE, hitMask: HIT_CRITICAL },
    { id: "weapon-bloodlust", name: "Кровожадность", desc: "Критический физический удар восстанавливает здоровье.",
      icon: "spell_nature_bloodlust", triggers: weaponBloodlustIds, chances: [100, 100, 100],
      procFlags: PF_PHYSICAL_DONE, hitMask: HIT_CRITICAL, schoolMask: SCH_PHYSICAL, typeMask: TYPE_DAMAGE,
      cooldownMs: 4000 },
    { id: "weapon-warstorm", name: "Упоение битвой", desc: "Убийство вызывает прилив ярости.",
      icon: "warrior_talent_icon_furyintheblood", triggers: [warstormId], chances: [100],
      procFlags: PF_KILL },
    { id: "weapon-impale", name: "Пронзание", desc: "Критический физический удар делает цель уязвимее.",
      icon: "ability_searingarrow", triggers: weaponImpaleIds, chances: [100, 100],
      procFlags: PF_PHYSICAL_DONE, hitMask: HIT_CRITICAL, schoolMask: SCH_PHYSICAL, typeMask: TYPE_DAMAGE },
    { id: "weapon-deepwounds", name: "Глубокие раны", desc: "Критические удары вызывают кровотечение.",
      icon: "ability_backstab", triggers: bleedIds, chances: [100, 100, 100],
      procFlags: PF_MELEE_DONE, hitMask: HIT_CRITICAL },
    { id: "weapon-heavyhand", name: "Тяжелая рука", desc: "Удары могут оглушить цель.",
      icon: "ability_warrior_punishingblow", triggers: [heavyhandId, heavyhandId], chances: [3, 6],
      procFlags: PF_MELEE_DONE, cooldownMs: 10000 },
    { id: "weapon-execution", name: "Расправа", desc: "Убийство восстанавливает здоровье.",
      icon: "ability_warrior_bloodfrenzy", triggers: executionIds, chances: [100, 100],
      procFlags: PF_KILL },
    { id: "weapon-flurry", name: "Шквал", desc: "Критический удар ускоряет атаки.",
      icon: "ability_ghoulfrenzy", triggers: flurryIds, chances: [100, 100, 100, 100, 100],
      procFlags: PF_MELEE_DONE, hitMask: HIT_CRITICAL },
    { id: "weapon-grip", name: "Железная хватка", desc: "Неудачная физическая атака временно повышает шанс попадания и критического удара.",
      icon: "ability_meleedamage", triggers: weaponGripIds, chances: [100, 100],
      procFlags: PF_PHYSICAL_DONE, hitMask: HIT_MISS | HIT_DODGE | HIT_PARRY, typeMask: TYPE_DAMAGE },
    { id: "weapon-shockwave", name: "Ударная волна", desc: "Физическая атака может нанести дополнительный удар.",
      icon: "ability_warrior_shockwave", triggers: weaponShockwaveIds, chances: [3, 6, 9],
      procFlags: PF_PHYSICAL_DONE, schoolMask: SCH_PHYSICAL, typeMask: TYPE_DAMAGE, cooldownMs: 2000 },
    { id: "weapon-battle-ward", name: "Боевая закалка", desc: "Критический физический удар дает поглощающий щит.",
      icon: "ability_warrior_shieldmastery", triggers: weaponWardIds, chances: [100, 100, 100],
      procFlags: PF_PHYSICAL_DONE, hitMask: HIT_CRITICAL, schoolMask: SCH_PHYSICAL, typeMask: TYPE_DAMAGE,
      cooldownMs: 10000 },
    { id: "weapon-unstoppable", name: "Неудержимость", desc: "Критический физический удар может вызвать неудержимый натиск.",
      icon: "ability_warrior_endlessrage", triggers: [weaponUnstoppableId], chances: [20],
      procFlags: PF_PHYSICAL_DONE, hitMask: HIT_CRITICAL, schoolMask: SCH_PHYSICAL, typeMask: TYPE_DAMAGE,
      cooldownMs: 20000 },

    // ЖИВУЧЕСТЬ
    { id: "vital-gift", name: "Дар жизни", desc: "Критическое исцеление окружает цель щитом.",
      icon: "spell_holy_flashheal", triggers: vitalGiftIds, chances: [100, 100, 100],
      procFlags: PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_HEAL },
    { id: "vital-clarity", name: "Просветление", desc: "Критическое исцеление возвращает ману.",
      icon: "spell_holy_enlightenment", triggers: clarityIds, chances: [100, 100, 100],
      procFlags: PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_HEAL },
    { id: "vital-bulwark", name: "Оплот", desc: "Блокирование временно снижает получаемый урон.",
      icon: "ability_defend", triggers: vitalBulwarkIds, chances: [100, 100, 100],
      procFlags: PF_TAKEN_MELEE_AUTO | PF_TAKEN_SPELL_MELEE, hitMask: HIT_BLOCK },
    { id: "vital-focus", name: "Духовное средоточие", desc: "Получение урона временно защищает заклинания от задержки.",
      icon: "spell_arcane_mindmastery", triggers: vitalFocusIds, chances: [100, 100, 100],
      procFlags: PF_TAKEN_HIT, typeMask: TYPE_DAMAGE, cooldownMs: 10000 },
    { id: "vital-lifespark", name: "Искра жизни", desc: "Критическое исцеление продолжает лечить цель.",
      icon: "spell_holy_flashheal", triggers: lifesparkIds, chances: [100, 100, 100],
      procFlags: PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_HEAL },
    { id: "vital-ward", name: "Оберег", desc: "Полученный крит дает поглощающий щит.",
      icon: "spell_holy_powerwordshield", triggers: wardIds, chances: [100, 100, 100],
      procFlags: PF_TAKEN_HIT, hitMask: HIT_CRITICAL },
    { id: "vital-lightindark", name: "Свет в бою", desc: "Урон Светом исцеляет вас.",
      icon: "spell_holy_holysmite", triggers: lightindarkIds, chances: [30, 60],
      procFlags: PF_SPELL_DMG_DONE, schoolMask: SCH_HOLY, typeMask: TYPE_DAMAGE },
    { id: "vital-lightguard", name: "Возмездие Света", desc: "Блокирование обжигает атакующего.",
      icon: "spell_holy_sealofprotection", triggers: lightguardIds, chances: [100, 100],
      procFlags: PF_TAKEN_MELEE_AUTO | PF_TAKEN_SPELL_MELEE, hitMask: HIT_BLOCK },
    { id: "vital-instinct", name: "Инстинкт выживания", desc: "Полученный крит усиливает получаемое исцеление.",
      icon: "ability_druid_tigersfury", triggers: instinctIds, chances: [100, 100],
      procFlags: PF_TAKEN_HIT, hitMask: HIT_CRITICAL },
    { id: "vital-grace", name: "Милость", desc: "Критическое исцеление может ускорить следующее заклинание.",
      icon: "spell_holy_sealofsacrifice", triggers: [vitalGraceId, vitalGraceId, vitalGraceId, vitalGraceId, vitalGraceId],
      chances: [20, 40, 60, 80, 100], procFlags: PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_HEAL },
    { id: "vital-meditation", name: "Медитация", desc: "Получение урона восстанавливает ману.",
      icon: "spell_nature_sleep", triggers: vitalMeditationIds, chances: [100, 100, 100],
      procFlags: PF_TAKEN_HIT, typeMask: TYPE_DAMAGE, cooldownMs: 10000 },
    { id: "vital-resonance", name: "Резонанс жизни", desc: "Критическое исцеление восстанавливает здоровье целителю.",
      icon: "spell_holy_holyguidance", triggers: vitalResonanceIds, chances: [100, 100, 100, 100, 100],
      procFlags: PF_HEAL_DONE, hitMask: HIT_CRITICAL, typeMask: TYPE_HEAL },
];

for (const proc of PROCS) {
    for (let i = 0; i < proc.triggers.length; i++) {
        const rank = i + 1;
        const key = `${proc.id}-${rank}`;
        const spell = std.Spells.create(TALENT_MODULE, key, 11069);
        setTalentText(spell, key, proc.name, proc.desc);
        spell.Icon.setPath(proc.icon);
        spell.Duration.setSimple(-1);
        spell.Attributes.IS_PASSIVE.set(true);
        spell.SchoolMask.clearAll().Effects.clearAll();
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.PROC_TRIGGER_SPELL.set()
            .ImplicitTargetA.UNIT_CASTER.set().TriggeredSpell.set(proc.triggers[i]);
        spell.Proc.mod(p => {
            (p.TriggerMask as any).set(proc.procFlags);
            p.Chance.set(proc.chances[i]);
            // TriggerMask/Chance are DBC-backed; force the SQL row now so all
            // following SQL filters, including PhaseMask, modify that row.
            p.ProcsPerMinute.set(0);
            if (proc.hitMask !== undefined) (p.HitMask as any).set(proc.hitMask);
            if (proc.schoolMask !== undefined) (p.SchoolMask as any).set(proc.schoolMask);
            if (proc.typeMask !== undefined) (p.TypeMask as any).set(proc.typeMask);
            if (p.HasSQL() && (proc.procFlags & PF_PLAYER_DONE_HIT) != 0) p.PhaseMask.HIT.set(true);
        });
        if (!spell.Proc.HasSQL()) {
            throw new Error(`[retail-talents] missing spell_proc row for ${proc.id}`);
        }
        spell.Proc.getSQL().Cooldown.set(proc.cooldownMs || 0);
        reg(key, spell.ID);
    }
}

// Эти ауры не изучаются игроком: livescript спутников накладывает один
// подходящий ранг по уникальному тегу. Сам proc остаётся штатным spell_proc.
const COMPANION_PROCS: ProcSpec[] = [
    { id: "companion-blood-trail", name: "Кровавый след",
      desc: "Прямые физические атаки могут вызвать кровотечение.",
      icon: "ability_druid_ferociousbite", triggers: companionBleedIds, chances: [5, 10, 15],
      procFlags: PF_PHYSICAL_DONE, schoolMask: SCH_PHYSICAL, typeMask: TYPE_DAMAGE,
      cooldownMs: 3000 },
    { id: "companion-spark-echo", name: "Непредсказуемая магия",
      desc: "Прямой урон может вызвать другую случайную подходящую классовую способность из набора камней.",
      icon: "spell_arcane_blast", triggers: companionSparkIds, chances: [5, 10, 15],
      procFlags: PF_SPELL_DMG_DONE, typeMask: TYPE_DAMAGE, cooldownMs: 3000 },
    { id: "companion-care-echo", name: "Добрый знак",
      desc: "Исцеление может наложить на цель один случайный полезный эффект.",
      icon: "spell_holy_blessingofprotection", triggers: companionCareIds, chances: [10, 20],
      procFlags: PF_HEAL_DONE, typeMask: TYPE_HEAL, cooldownMs: 5000 },
];

for (const proc of COMPANION_PROCS) {
    for (let i = 0; i < proc.triggers.length; i++) {
        const rank = i + 1;
        const spell = std.Spells.create(
            TALENT_MODULE, `${proc.id}-effect-${rank}`, 11069,
        );
        setTalentText(spell, `${proc.id}-effect-${rank}`, proc.name, proc.desc);
        spell.Icon.setPath(proc.icon);
        spell.Duration.setSimple(-1);
        spell.Attributes.IS_PASSIVE.set(true);
        spell.Attributes.CANT_BE_CANCELED.set(true);
        spell.Attributes.HIDE_FROM_AURA_BAR.set(true);
        spell.Family.set(0);
        spell.SchoolMask.clearAll().Effects.clearAll();
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.PROC_TRIGGER_SPELL.set()
            .ImplicitTargetA.UNIT_CASTER.set().TriggeredSpell.set(proc.triggers[i]);
        spell.Proc.mod(p => {
            (p.TriggerMask as any).set(proc.procFlags);
            p.Chance.set(proc.chances[i]);
            // Materialize spell_proc before writing SQL-only filters below.
            p.ProcsPerMinute.set(0);
            if (proc.hitMask !== undefined) (p.HitMask as any).set(proc.hitMask);
            if (proc.schoolMask !== undefined) (p.SchoolMask as any).set(proc.schoolMask);
            if (proc.typeMask !== undefined) (p.TypeMask as any).set(proc.typeMask);
            if (p.HasSQL() && (proc.procFlags & PF_DONE_HIT) != 0) p.PhaseMask.HIT.set(true);
        });
        if (!spell.Proc.HasSQL()) {
            throw new Error(`[retail-talents] missing spell_proc row for ${proc.id}`);
        }
        spell.Proc.getSQL().Cooldown.set(proc.cooldownMs || 0);
        const tag = `spell/effect-${proc.id}-${rank}`;
        spell.Tags.addUnique(TALENT_MODULE, tag);
        regCompanionTag(tag, spell.ID);
    }
}

/* ------------------------------ активки МАГИИ ------------------------------ */

const ACTIVES = [
    { id: "magic-instant-cast", base: 12043, name: "Мгновенное плетение", desc: "Следующее подходящее заклинание произносится мгновенно." },
    { id: "magic-mastery", base: 16166, name: "Владычество школ", desc: "Усиливает следующее заклинание." },
];

for (const active of ACTIVES) {
    const spell = std.Spells.create(TALENT_MODULE, active.id, active.base);
    setTalentText(spell, active.id, active.name, active.desc);
    spell.Family.set(0);
    spell.Proc.SpellFamily.set(0);
    spell.Proc.PhaseMask.CAST.set(true);
    fullClassMask(spell);
    reg(active.id, spell.ID);
}

const legacySwiftness = std.Spells.create(TALENT_MODULE, "magic-swiftness", 11069);
legacySwiftness.Name.enGB.set("Legacy Talent").Name.ruRU.set("Устаревший талант");
legacySwiftness.Description.enGB.set("This talent has been replaced by Instant Weaving.")
    .Description.ruRU.set("Этот талант заменен «Мгновенным плетением».");
legacySwiftness.AuraDescription.enGB.set("This talent has been replaced by Instant Weaving.")
    .AuraDescription.ruRU.set("Этот талант заменен «Мгновенным плетением».");
legacySwiftness.Duration.setSimple(-1);
legacySwiftness.Attributes.IS_PASSIVE.set(true);
legacySwiftness.SchoolMask.clearAll().Effects.clearAll();
reg("magic-swiftness", legacySwiftness.ID);

/* ------------------------------ мост для lua ------------------------------- */

const OUT_PATH = path.resolve(
    __dirname, "..", "..", "livescripts", "generated_talents.ts",
);
const keys = Object.keys(GEN).sort();
const lines = keys.map(k => `    ["${k}"]: ${GEN[k]},`);
const contents =
    "/**\n" +
    " * AUTO-GENERATED by datascripts/datascripts.ts during `build data`. Do not edit.\n" +
    " * Мост: строковый id ранга таланта (TalentDefs) -> числовой spell id.\n" +
    " */\n" +
    "export const GEN_TALENTS: { [key: string]: number } = {\n" +
    lines.join("\n") + "\n" +
    "};\n";
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, contents, "utf8");

const COMPANION_OUT_PATH = path.resolve(
    __dirname,
    "..", "..", "..", "custom-companions", "livescripts", "generated_companion_talents.ts",
);
const companionKeys = Object.keys(COMPANION_GEN).sort();
const companionLines = companionKeys.map(
    k => `    ["${k}"]: ${COMPANION_GEN[k]},`,
);
const companionContents =
    "/**\n" +
    " * AUTO-GENERATED by retail-talents datascripts during `build data`. Do not edit.\n" +
    " * Bridge: stable retail-talents tag -> numeric spell id for custom-companions Lua.\n" +
    " */\n" +
    "export const COMPANION_TALENT_CATALOG_VERSION: number = 1;\n" +
    "export const COMPANION_TALENT_CATALOG_READY: boolean = true;\n" +
    `export const COMPANION_TALENT_CATALOG_COUNT: number = ${companionKeys.length};\n` +
    "export const GEN_COMPANION_TALENTS: { [tag: string]: number } = {\n" +
    companionLines.join("\n") + "\n" +
    "};\n";
fs.mkdirSync(path.dirname(COMPANION_OUT_PATH), { recursive: true });
fs.writeFileSync(COMPANION_OUT_PATH, companionContents, "utf8");
console.log(
    "[retail-talents] generated " + keys.length + " talent spells and "
    + companionKeys.length + " companion tag links",
);
