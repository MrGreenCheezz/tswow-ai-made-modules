import * as CompanionMessages from "../shared/CompanionMessages";
import {
    CompanionDetailRequest,
    CompanionTrainingActionRequest,
    OP_COMPANION_DETAIL_REQUEST,
    OP_COMPANION_TRAINING_ACTION,
} from "../shared/CompanionProgressionMessages";
import * as CompanionExpeditions from "../shared/CompanionExpeditions";
import {
    companionKillIsGrey,
    companionProfessionById,
    companionServiceRankForXp,
} from "../shared/CompanionProgression";
import * as CompanionRules from "../shared/CompanionRules";
import { CapturedCompanion } from "./companion-db";
import * as CompanionRuntime from "./companion-progression";
import {
    COMPANION_TALENT_CATALOG_COUNT,
    COMPANION_TALENT_CATALOG_READY,
    COMPANION_TALENT_CATALOG_VERSION,
    GEN_COMPANION_TALENTS,
} from "./generated_companion_talents";

const RECRUIT_CHANCE = 0.10;
const INITIAL_HEALTH = 0.20;
const FOLLOW_DISTANCE = 2.5;

const SUPPORT_RECAST_DELAY_MS = 6000;
const SUPPORT_HEAL_BELOW_PCT = 90;
const ACTION_DISPATCH_INTERVAL_MS = 1000;
const ACTION_DISPATCH_TIMER = "custom-companions:action-dispatch";
const WORKFORCE_SYNC_INTERVAL_MS = 2000;
const WORKFORCE_SYNC_TIMER = "custom-companions:workforce-sync";

const TALENT_SYNC_INTERVAL_MS = 250;
const TALENT_SYNC_TIMER = "custom-companions:talent-sync";
const TANK_TAUNT_SPELL = 355;
const TANK_TAUNT_COOLDOWN_MS = 8000;
const EXPECTED_TALENT_CATALOG_COUNT = 62;
const WOOD_EXPEDITION_ITEMS = [
    UTAG("base-building", "item/wood-tier-1"),
    UTAG("base-building", "item/wood-tier-2"),
    UTAG("base-building", "item/wood-tier-3"),
    UTAG("base-building", "item/wood-tier-4"),
    UTAG("base-building", "item/wood-tier-5"),
    UTAG("base-building", "item/wood-tier-6"),
];
// Shared string contract with retail-talents/TalentDefs. It is duplicated here
// because livescript modules compile independently.
const TALENT_REVISION_KEY = "custom-companions:talent-revision";
const TALENT_STATE_KEY = "custom-companions:talent-state";

function talentRankTags(id: string, count: number): string[] {
    const tags: string[] = [];
    for (let rank = 1; rank <= count; rank++) {
        tags.push("spell/talent-" + id + "-" + rank);
    }
    return tags;
}

function effectRankTags(id: string, count: number): string[] {
    const tags: string[] = [];
    for (let rank = 1; rank <= count; rank++) {
        tags.push("spell/effect-" + id + "-" + rank);
    }
    return tags;
}

const TALENT_DAMAGE = talentRankTags("companion-damage", 5);
const TALENT_ATTACK_HASTE = talentRankTags("companion-attack-haste", 3);
const TALENT_CAST_HASTE = talentRankTags("companion-cast-haste", 3);
const TALENT_HEALTH = talentRankTags("companion-health", 3);
const TALENT_CRIT = talentRankTags("companion-crit", 3);
const TALENT_DEFENSE = talentRankTags("companion-defense", 3);
const TALENT_UNITY = talentRankTags("companion-unity-aura", 3);
const TALENT_BLOOD_TRAIL = talentRankTags("companion-blood-trail", 3);
const TALENT_SPARK_ECHO = talentRankTags("companion-spark-echo", 3);
const TALENT_CARE_ECHO = talentRankTags("companion-care-echo", 2);
const TALENT_PACK_POWER = talentRankTags("companion-pack-power", 3);
const TALENT_PERFECT_BOND = talentRankTags("companion-perfect-bond", 1);
const TALENT_TANK_THREAT = talentRankTags("companion-tank-threat", 3);
const TALENT_TANK_TAUNT = talentRankTags("companion-tank-taunt", 1);

const EFFECT_OFFENSE = "spell/effect-companion-offense";
const EFFECT_RESILIENCE = "spell/effect-companion-resilience";
const EFFECT_CRIT = "spell/effect-companion-crit";
const EFFECT_UNITY = "spell/effect-companion-unity";
const EFFECT_TANK = "spell/effect-companion-tank";
const EFFECT_BLOOD_TRAIL = effectRankTags("companion-blood-trail", 3);
const EFFECT_SPARK_ECHO = effectRankTags("companion-spark-echo", 3);
const EFFECT_CARE_ECHO = effectRankTags("companion-care-echo", 2);
// Stable legacy payload IDs remain in the talent catalog, but runtime selection
// now comes from gem-abilities instead of these six custom damage spells.
const EFFECT_RANDOM_OFFENSE = [
    "spell/effect-companion-random-fire",
    "spell/effect-companion-random-frost",
    "spell/effect-companion-random-nature",
    "spell/effect-companion-random-shadow",
    "spell/effect-companion-random-holy",
    "spell/effect-companion-random-arcane",
];
const EFFECT_RANDOM_BENEFIT = [
    "spell/effect-companion-random-power",
    "spell/effect-companion-random-haste",
    "spell/effect-companion-random-guard",
    "spell/effect-companion-random-fortune",
];
const GEM_CLASS_ABILITY_CHOICES: number[] = TAG(
    "gem-abilities", "spell/class-ability-choice",
);
const GEM_RANDOM_ABILITY_ROOTS: number[] = [];

const COMPANION_KEY = "custom-companions:active";
const COMPANION_ID_KEY = "custom-companions:id";
const COMPANION_MODE_KEY = "custom-companions:combat-mode";
const MANAGED_DESPAWN_KEY = "custom-companions:managed-despawn";
const RUNTIME_KEY = "custom-companions:runtime";
const SUPPORT_SPELLS_KEY = "custom-companions:support-spells";
const CLIENT_KEY = "custom-companions:client";

// SetOwnerGUID intentionally does not call SetMinion/SetPetGUID, so this still
// is an ordinary Creature and never occupies the real hunter/warlock pet slot.
const UNIT_FLAG_PLAYER_CONTROLLED = 0x00000008;
const UNIT_FLAG_SKINNABLE = 0x04000000;
const UNIT_FLAGS_BLOCKING_COMPANION = 0x02010382 | UNIT_FLAG_SKINNABLE;

const SPELL_ATTR0_PASSIVE = 0x00000040;
const SPELL_ATTR0_CU_NEGATIVE = 0x00007000;
const TARGET_FLAG_OWNER_UNIT = 0x00000002 | 0x00000004 | 0x00000008 | 0x00000100;
const TARGET_FLAG_DEST_LOCATION = 0x00000040;
const TARGET_FLAG_UNIT_ENEMY = 0x00000080;
const CREATURE_FLAG_EXTRA_DUNGEON_BOSS = 0x10000000;

class RuntimeCompanion {
    companionId: number = 0;
    entry: number = 0;
    guid: number = 0;
    mapId: number = 0;
    instanceId: number = 0;
}

class CompanionClient {
    ready: boolean = false;
    protocolVersion: number = 0;
}

class SupportSpellSet {
    spells: number[] = [];
    cursor: number = 0;
    readyAt: number = 0;
}

class CompanionTalentSyncState {
    revision: number = 0;
    expectedAuras: number[] = [];
    tauntReadyAt: number = 0;
}

function runtime(player: TSPlayer): RuntimeCompanion {
    return player.GetObject(RUNTIME_KEY, new RuntimeCompanion());
}

function companionClient(player: TSPlayer): CompanionClient {
    return player.GetObject(CLIENT_KEY, new CompanionClient());
}

function playerText(player: TSPlayer, english: string, russian: string): string {
    return CompanionRuntime.companionText(player, english, russian);
}

function supportSpellSet(companion: TSCreature): SupportSpellSet {
    return companion.GetObject(SUPPORT_SPELLS_KEY, new SupportSpellSet());
}

function companionTalentSyncState(companion: TSCreature): CompanionTalentSyncState {
    return companion.GetObject(TALENT_STATE_KEY, new CompanionTalentSyncState());
}

function clearRuntime(player: TSPlayer): void {
    const ref = runtime(player);
    ref.companionId = 0;
    ref.entry = 0;
    ref.guid = 0;
    ref.mapId = 0;
    ref.instanceId = 0;
}

function clampHealthPct(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function normalizeCombatMode(value: number): number {
    if (value == CompanionMessages.COMPANION_MODE_PASSIVE) return CompanionMessages.COMPANION_MODE_PASSIVE;
    if (value == CompanionMessages.COMPANION_MODE_TANK) return CompanionMessages.COMPANION_MODE_TANK;
    return CompanionMessages.COMPANION_MODE_DEFENSE;
}

function recordById(
    container: DBContainer<CapturedCompanion>,
    companionId: number,
): CapturedCompanion | undefined {
    let found: CapturedCompanion | undefined = undefined;
    container.forEach(row => {
        if (!found && row.companionId == companionId) found = row;
    });
    return found;
}

function activeRecord(
    container: DBContainer<CapturedCompanion>,
): CapturedCompanion | undefined {
    let found: CapturedCompanion | undefined = undefined;
    container.forEach(row => {
        if (!found && row.active != 0) found = row;
    });
    return found;
}

function nextCompanionId(container: DBContainer<CapturedCompanion>): number {
    let next = 1;
    container.forEach(row => {
        if (row.companionId >= next) next = row.companionId + 1;
    });
    return next;
}

function normalizeCollection(player: TSPlayer): DBContainer<CapturedCompanion> {
    const container = CapturedCompanion.get(player);
    let nextId = nextCompanionId(container);
    let foundActive = false;
    let changed = false;
    container.forEach(row => {
        if (row.companionId == 0) {
            row.companionId = nextId++;
            row.MarkDirty();
            changed = true;
        }

        const healthPct = clampHealthPct(row.healthPct);
        if (healthPct != row.healthPct) {
            row.healthPct = healthPct;
            row.MarkDirty();
            changed = true;
        }

        const combatMode = normalizeCombatMode(Number(row.combatMode));
        if (combatMode != row.combatMode) {
            row.combatMode = combatMode;
            row.MarkDirty();
            changed = true;
        }

        if (!(Number(row.expeditionEndAtMs) >= 0)) {
            row.expeditionEndAtMs = 0;
            row.expeditionLevel = 0;
            row.expeditionRewardCount = 0;
            row.expeditionRewardEntry = 0;
            row.MarkDirty();
            changed = true;
        }

        if (Number(row.expeditionEndAtMs) > 0 && row.active != 0) {
            row.active = 0;
            row.MarkDirty();
            changed = true;
        }

        if (row.active == 0) return;
        if (!foundActive) {
            foundActive = true;
            if (row.active != 1) {
                row.active = 1;
                row.MarkDirty();
                changed = true;
            }
            return;
        }

        row.active = 0;
        row.MarkDirty();
        changed = true;
    });
    if (changed) container.Save();
    CompanionRuntime.normalizeCompanionProgression(player, container);
    return container;
}

function setOnlyActive(
    container: DBContainer<CapturedCompanion>,
    companionId: number,
): void {
    container.forEach(row => {
        const active = companionId != 0
            && row.companionId == companionId
            && Number(row.expeditionEndAtMs) == 0 ? 1 : 0;
        if (row.active == active) return;
        row.active = active;
        row.MarkDirty();
    });
}

function creatureName(entry: number): string {
    const template = GetCreatureTemplate(entry);
    return template ? template.GetName() : "NPC " + entry;
}

function expeditionSpecialty(row: CapturedCompanion): number {
    const profession = companionProfessionById(Number(row.professionId));
    if (profession) return profession.expeditionSpecialty;
    const template = GetCreatureTemplate(row.entry);
    return CompanionExpeditions.expeditionSpecialtyForCreatureType(template ? Number(template.GetType()) : 0);
}

function expeditionRewardForCompanion(row: CapturedCompanion, level: number): number {
    const specialty = expeditionSpecialty(row);
    if (specialty != CompanionExpeditions.EXPEDITION_SPECIALTY_WOOD) {
        return CompanionExpeditions.expeditionRewardItem(specialty, level);
    }
    const tierMap = [0, 1, 2, 3, 4, 4, 5, 5];
    return WOOD_EXPEDITION_ITEMS[tierMap[CompanionExpeditions.expeditionRewardTier(level)]];
}

function findRuntimeCompanion(map: TSMap, player: TSPlayer): TSCreature | undefined {
    const ref = runtime(player);
    if (ref.guid == 0
        || ref.mapId != Number(map.GetMapID())
        || ref.instanceId != Number(map.GetInstanceID())) return undefined;
    return map.GetCreature(CreateGUID(HighGuid.Unit, ref.entry, ref.guid));
}

function bindRuntime(
    player: TSPlayer,
    companion: TSCreature,
    row: CapturedCompanion,
): void {
    const ref = runtime(player);
    ref.companionId = row.companionId;
    ref.entry = Number(companion.GetEntry());
    ref.guid = Number(companion.GetGUIDLow());
    ref.mapId = Number(companion.GetMap().GetMapID());
    ref.instanceId = Number(companion.GetMap().GetInstanceID());
}

function syncOwnerState(companion: TSCreature, player: TSPlayer): void {
    if (Number(companion.GetFaction()) != Number(player.GetFaction())) {
        companion.SetFaction(player.GetFaction());
    }
    companion.SetOwnerGUID(player.GetGUID());
    // CREATEDBY lets the 3.3.5 client classify native damage as owner-created
    // without registering this ordinary Creature in the real pet/minion slot.
    companion.SetCreatorGUID(player.GetGUID());
    const ownerPhase = Number(player.GetPhaseMaskForSpawn());
    if (Number(companion.GetPhaseMask()) != ownerPhase) {
        companion.SetPhaseMask(ownerPhase, true, 0);
    }

    const flags = Number(companion.GetCoreUInt32(UnitFields.UNIT_FIELD_FLAGS));
    if ((flags & UNIT_FLAG_PLAYER_CONTROLLED) == 0) {
        companion.SetFlag(UnitFields.UNIT_FIELD_FLAGS, UNIT_FLAG_PLAYER_CONTROLLED);
    }
    if ((flags & UNIT_FLAGS_BLOCKING_COMPANION) != 0) {
        companion.RemoveFlag(UnitFields.UNIT_FIELD_FLAGS, UNIT_FLAGS_BLOCKING_COMPANION);
    }

    // UNIT_FIELD_BYTES_2 byte 1 contains PvP/FFA/sanctuary flags. Matching the
    // owner makes friendly spell and PvP target validation consistent.
    const ownerPvP = Number(player.GetCoreByte(UnitFields.UNIT_FIELD_BYTES_2, 1));
    if (Number(companion.GetCoreByte(UnitFields.UNIT_FIELD_BYTES_2, 1)) != ownerPvP) {
        companion.SetCoreByte(UnitFields.UNIT_FIELD_BYTES_2, 1, ownerPvP);
    }
}

function healthFraction(unit: TSUnit): number {
    const maxHealth = Math.max(1, Number(unit.GetMaxHealth()));
    return clampHealthPct(Number(unit.GetHealth()) / maxHealth);
}

function companionTalentSpell(tag: string): number {
    const spellId = GEN_COMPANION_TALENTS[tag];
    return spellId === undefined ? 0 : Number(spellId);
}

function companionTalentRank(player: TSPlayer, tags: string[]): number {
    for (let i = tags.length - 1; i >= 0; i--) {
        const spellId = companionTalentSpell(tags[i]);
        if (spellId > 0 && player.HasSpell(spellId)) return i + 1;
    }
    return 0;
}

function removeCompanionTalentAura(companion: TSCreature, tag: string): void {
    const spellId = companionTalentSpell(tag);
    if (spellId > 0) companion.RemoveAura(spellId);
}

function applyCompanionProcRank(
    companion: TSCreature,
    effectTags: string[],
    rank: number,
): number {
    for (let i = 0; i < effectTags.length; i++) {
        removeCompanionTalentAura(companion, effectTags[i]);
    }
    if (rank <= 0 || rank > effectTags.length) return 0;
    const spellId = companionTalentSpell(effectTags[rank - 1]);
    if (spellId > 0) {
        companion.AddAura(spellId, companion);
        return spellId;
    }
    return 0;
}

function castCompanionTalentAura(
    companion: TSCreature,
    tag: string,
    bp0: number,
    bp1: number,
    bp2: number,
): number {
    const spellId = companionTalentSpell(tag);
    if (spellId > 0) {
        companion.CastCustomSpell(companion, spellId, true, bp0, bp1, bp2);
        return spellId;
    }
    return 0;
}

function requiredSpellLevel(info: TSSpellInfo): number {
    const spellLevel = Number(info.GetSpellLevel());
    return spellLevel > 0 ? spellLevel : Number(info.GetBaseLevel());
}

/** Canonical rank-chain identity, matching gem-abilities/grant.ts. */
function rankedSpellRoot(spellId: number): number {
    if (spellId <= 0) return 0;
    const source = GetSpellInfo(spellId);
    if (!source) return 0;
    if (!source.IsRanked()) return Number(source.GetEntry());
    const first: TSSpellInfo | undefined = source.GetFirstRankSpell();
    if (first) return Number(first.GetEntry());

    let current: TSSpellInfo | undefined = source;
    for (let guard = 0; guard < 64 && current; guard++) {
        const previous: TSSpellInfo | undefined = current.GetPrevRankSpell();
        if (!previous || Number(previous.GetEntry()) == Number(current.GetEntry())) break;
        current = previous;
    }
    return current ? Number(current.GetEntry()) : Number(source.GetEntry());
}

// ponytail: TSWoW livescript projects cannot import each other, so this mirrors
// gem-abilities' short rank walk. Move it only when cross-module imports exist.
function gemAbilityForLevel(rootId: number, level: number): number {
    const root = GetSpellInfo(rootId);
    if (!root) return 0;
    let current: TSSpellInfo | undefined = root;
    let selected = root.IsRanked() ? Number(root.GetEntry()) : 0;
    for (let guard = 0; guard < 64 && current; guard++) {
        const need = requiredSpellLevel(current);
        if (need <= 0 || need <= level) selected = Number(current.GetEntry());
        if (!current.IsRanked()) break;
        const next: TSSpellInfo | undefined = current.GetNextRankSpell();
        if (!next || Number(next.GetEntry()) == Number(current.GetEntry())) break;
        current = next;
    }
    return selected;
}

function isRandomGemAbility(info: TSSpellInfo): boolean {
    let hasEffect = false;
    let unsafe = false;
    for (let i = 0; i < 3; i++) {
        const effect = info.GetEffect(i as SpellEffIndex);
        if (!effect.IsEffect()) continue;
        hasEffect = true;
        if (CompanionRules.isUnsafeRandomGemAbilityEffect(
            Number(effect.GetType()), Number(effect.GetAura()),
        )) unsafe = true;
    }
    return CompanionRules.canUseRandomGemAbility(
        Number(info.GetAttributes()),
        Number(info.GetExplicitTargetMask()),
        hasEffect,
        unsafe,
    );
}

function spellHasTankOnlyEffect(info: TSSpellInfo): boolean {
    for (let i = 0; i < 3; i++) {
        const effect = info.GetEffect(i as SpellEffIndex);
        if (effect.IsEffect() && CompanionRules.isTankOnlySpellEffect(
            Number(effect.GetType()), Number(effect.GetAura()),
        )) return true;
    }
    return false;
}

function addRandomGemAbilityRoot(rootId: number): void {
    if (rootId <= 0) return;
    for (let i = 0; i < GEM_RANDOM_ABILITY_ROOTS.length; i++) {
        if (GEM_RANDOM_ABILITY_ROOTS[i] == rootId) return;
    }
    const info = GetSpellInfo(rootId);
    if (info && isRandomGemAbility(info)) GEM_RANDOM_ABILITY_ROOTS.push(rootId);
}

function prepareRandomGemAbilities(): void {
    if (GEM_RANDOM_ABILITY_ROOTS.length > 0) return;
    for (let i = 0; i < GEM_CLASS_ABILITY_CHOICES.length; i++) {
        addRandomGemAbilityRoot(rankedSpellRoot(GEM_CLASS_ABILITY_CHOICES[i]));
    }
}

function castGemAbility(
    companion: TSCreature,
    player: TSPlayer,
    target: TSUnit,
    info: TSSpellInfo,
): number {
    const spellId = Number(info.GetEntry());
    const targets = Number(info.GetExplicitTargetMask());
    if ((targets & TARGET_FLAG_DEST_LOCATION) != 0) {
        return Number(companion.CastSpellAoF(
            target.GetX(), target.GetY(), target.GetZ(), spellId, true,
        ));
    }
    if ((Number(info.GetAttributesCu()) & SPELL_ATTR0_CU_NEGATIVE) != 0
        || (targets & TARGET_FLAG_UNIT_ENEMY) != 0) {
        return Number(companion.CastSpell(target, spellId, true));
    }
    if ((targets & TARGET_FLAG_OWNER_UNIT) != 0 || spellHeals(info)) {
        return Number(companion.CastSpell(player, spellId, true));
    }
    return Number(companion.CastSpell(companion, spellId, true));
}

function castRandomGemAbility(
    companion: TSCreature,
    player: TSPlayer,
    target: TSUnit,
    excludedRoot: number,
): void {
    const count = GEM_RANDOM_ABILITY_ROOTS.length;
    if (count == 0) return;
    const start = Math.floor(Math.random() * count);
    const tankMode = Number(companion.GetUInt(
        COMPANION_MODE_KEY, CompanionMessages.COMPANION_MODE_DEFENSE,
    )) == CompanionMessages.COMPANION_MODE_TANK;
    for (let offset = 0; offset < count; offset++) {
        const rootId = GEM_RANDOM_ABILITY_ROOTS[(start + offset) % count];
        if (rootId == excludedRoot) continue;
        const spellId = gemAbilityForLevel(rootId, Number(companion.GetLevel()));
        const info = GetSpellInfo(spellId);
        if (!info || !isRandomGemAbility(info)
            || (!tankMode && spellHasTankOnlyEffect(info))) continue;
        if (castGemAbility(companion, player, target, info) == SpellCastResult.CAST_OK) return;
    }
}

function handleRandomOffenseProc(
    effect: TSAuraEffect,
    application: TSAuraApplication,
    eventInfo: TSProcEventInfo,
    cancel: TSMutable<boolean, boolean>,
): void {
    // The native proc already resolved its chance and SQL cooldown. Replace its
    // fixed TriggerSpell with one safe, level-scaled gem-ability choice.
    cancel.set(true);
    const companion = application.GetTarget().ToCreature();
    if (!companion || !companion.GetBool(COMPANION_KEY, false)) return;
    const ownerUnit = companion.GetOwner();
    const player = ownerUnit ? ownerUnit.ToPlayer() : undefined;
    const target = eventInfo.GetProcTarget();
    if (!player || !target || target.IsDead()
        || companion.IsFriendlyTo(target) || target.IsFriendlyTo(companion)) return;
    const rank = companionTalentRank(player, TALENT_SPARK_ECHO);
    if (rank <= 0) return;
    const triggering: TSSpellInfo | undefined = eventInfo.GetSpellInfo();
    castRandomGemAbility(
        companion,
        player,
        target,
        triggering ? rankedSpellRoot(Number(triggering.GetEntry())) : 0,
    );
}

function handleRandomBenefitProc(
    effect: TSAuraEffect,
    application: TSAuraApplication,
    eventInfo: TSProcEventInfo,
    cancel: TSMutable<boolean, boolean>,
): void {
    cancel.set(true);
    const companion = application.GetTarget().ToCreature();
    if (!companion || !companion.GetBool(COMPANION_KEY, false)) return;
    const ownerUnit = companion.GetOwner();
    const player = ownerUnit ? ownerUnit.ToPlayer() : undefined;
    const target = eventInfo.GetProcTarget();
    if (!player || !target || target.IsDead()
        || (!companion.IsFriendlyTo(target) && !target.IsFriendlyTo(companion))) return;
    const rank = companionTalentRank(player, TALENT_CARE_ECHO);
    if (rank <= 0 || EFFECT_RANDOM_BENEFIT.length == 0) return;
    const index = Math.floor(Math.random() * EFFECT_RANDOM_BENEFIT.length);
    const spellId = companionTalentSpell(EFFECT_RANDOM_BENEFIT[index]);
    if (spellId <= 0) return;
    const pct = rank * 3;
    const firstAmount = index == 2 ? -pct : pct;
    companion.CastCustomSpell(target, spellId, true, firstAmount, pct, 0);
}

function syncCompanionTalents(companion: TSCreature, player: TSPlayer): void {
    if (companion.IsDead()) return;
    const healthPct = healthFraction(companion);
    const expectedAuras: number[] = [];

    removeCompanionTalentAura(companion, EFFECT_OFFENSE);
    removeCompanionTalentAura(companion, EFFECT_RESILIENCE);
    removeCompanionTalentAura(companion, EFFECT_CRIT);
    removeCompanionTalentAura(companion, EFFECT_UNITY);
    removeCompanionTalentAura(companion, EFFECT_TANK);

    const perfectBond = companionTalentRank(player, TALENT_PERFECT_BOND);
    const damagePct = companionTalentRank(player, TALENT_DAMAGE) * 2 + perfectBond * 5;
    const attackHastePct = companionTalentRank(player, TALENT_ATTACK_HASTE) * 3
        + perfectBond * 5;
    const castHastePct = companionTalentRank(player, TALENT_CAST_HASTE) * 3
        + perfectBond * 5;
    if (damagePct > 0 || attackHastePct > 0 || castHastePct > 0) {
        const spellId = castCompanionTalentAura(
            companion, EFFECT_OFFENSE, damagePct, attackHastePct, castHastePct,
        );
        if (spellId > 0) expectedAuras.push(spellId);
    }

    const healthPctBonus = companionTalentRank(player, TALENT_HEALTH) * 5;
    const damageTakenPct = companionTalentRank(player, TALENT_DEFENSE) * -4;
    if (healthPctBonus != 0 || damageTakenPct != 0) {
        const spellId = castCompanionTalentAura(
            companion, EFFECT_RESILIENCE, healthPctBonus, damageTakenPct, 0,
        );
        if (spellId > 0) expectedAuras.push(spellId);
    }

    const critPct = companionTalentRank(player, TALENT_CRIT) * 2;
    if (critPct > 0) {
        const spellId = castCompanionTalentAura(
            companion, EFFECT_CRIT, critPct, critPct, 0,
        );
        if (spellId > 0) expectedAuras.push(spellId);
    }

    const unityPct = companionTalentRank(player, TALENT_UNITY)
        + companionTalentRank(player, TALENT_PACK_POWER);
    if (unityPct > 0) {
        const spellId = castCompanionTalentAura(
            companion, EFFECT_UNITY, unityPct, unityPct, unityPct,
        );
        if (spellId > 0) expectedAuras.push(spellId);
    }

    const tankThreatPct = companionTalentRank(player, TALENT_TANK_THREAT) * 50;
    if (Number(companion.GetUInt(COMPANION_MODE_KEY, CompanionMessages.COMPANION_MODE_DEFENSE))
            == CompanionMessages.COMPANION_MODE_TANK && tankThreatPct > 0) {
        const spellId = castCompanionTalentAura(
            companion, EFFECT_TANK, tankThreatPct, 0, 0,
        );
        if (spellId > 0) expectedAuras.push(spellId);
    }

    const bloodTrailSpell = applyCompanionProcRank(
        companion,
        EFFECT_BLOOD_TRAIL,
        companionTalentRank(player, TALENT_BLOOD_TRAIL),
    );
    if (bloodTrailSpell > 0) expectedAuras.push(bloodTrailSpell);
    const sparkEchoSpell = applyCompanionProcRank(
        companion,
        EFFECT_SPARK_ECHO,
        companionTalentRank(player, TALENT_SPARK_ECHO),
    );
    if (sparkEchoSpell > 0) expectedAuras.push(sparkEchoSpell);
    const careEchoSpell = applyCompanionProcRank(
        companion,
        EFFECT_CARE_ECHO,
        companionTalentRank(player, TALENT_CARE_ECHO),
    );
    if (careEchoSpell > 0) expectedAuras.push(careEchoSpell);

    // Changing a max-health aura must preserve the same health percentage.
    const maxHealth = Math.max(1, Number(companion.GetMaxHealth()));
    companion.SetHealth(Math.max(1, Math.floor(maxHealth * healthPct)));
    const state = companionTalentSyncState(companion);
    state.revision = Number(player.GetUInt(TALENT_REVISION_KEY, 0));
    state.expectedAuras = expectedAuras;
}

function tryTankTaunt(
    companion: TSCreature,
    player: TSPlayer,
    selectedTarget?: TSUnit,
): boolean {
    if (Number(companion.GetUInt(COMPANION_MODE_KEY, CompanionMessages.COMPANION_MODE_DEFENSE))
            != CompanionMessages.COMPANION_MODE_TANK
        || companionTalentRank(player, TALENT_TANK_TAUNT) <= 0) return false;
    const target = selectedTarget || companion.GetVictim();
    if (!target || target.IsDead()) return false;
    const targetCreature = target.ToCreature();
    if ((targetCreature && CompanionRuntime.isBaseWorkforceVisual(targetCreature))
        || companion.IsFriendlyTo(target) || target.IsFriendlyTo(companion)) return false;
    const state = companionTalentSyncState(companion);
    const now = Number(GetUnixTime());
    if (now < Number(state.tauntReadyAt || 0)) return false;
    if (Number(companion.CastSpell(target, TANK_TAUNT_SPELL, true))
            != SpellCastResult.CAST_OK) return false;
    state.tauntReadyAt = now + TANK_TAUNT_COOLDOWN_MS;
    return true;
}

function startTalentSyncTimer(companion: TSCreature): void {
    companion.AddNamedTimer(TALENT_SYNC_TIMER, TALENT_SYNC_INTERVAL_MS, -1, (owner, timer) => {
        const creature = owner.ToCreature();
        if (!creature || creature.IsDead()) return;
        const unitOwner = creature.GetOwner();
        const player = unitOwner ? unitOwner.ToPlayer() : undefined;
        if (!player) return;
        const revision = Number(player.GetUInt(TALENT_REVISION_KEY, 0));
        const state = companionTalentSyncState(creature);
        let missingAura = false;
        for (let i = 0; i < state.expectedAuras.length; i++) {
            if (!creature.HasAura(state.expectedAuras[i])) missingAura = true;
        }
        if (!CompanionRules.shouldSyncCompanionTalents(revision, state.revision, missingAura)) return;
        syncCompanionTalents(creature, player);
    });
}

function updateRecordHealth(row: CapturedCompanion, companion: TSCreature): void {
    const healthPct = companion.IsDead() ? 0 : healthFraction(companion);
    if (row.healthPct == healthPct) return;
    row.healthPct = healthPct;
    row.MarkDirty();
}

function syncCompanionLevel(
    companion: TSCreature,
    player: TSPlayer,
    healthPct: number,
): void {
    companion.SetLevel(player.GetLevel());
    companion.UpdateLevelDependantStats();
    const maxHealth = Math.max(1, Number(companion.GetMaxHealth()));
    companion.SetHealth(Math.max(1, Math.floor(maxHealth * clampHealthPct(healthPct))));
}

function addSupportSpell(set: SupportSpellSet, spellId: number): void {
    if (spellId <= 0) return;
    for (let i = 0; i < set.spells.length; i++) {
        if (set.spells[i] == spellId) return;
    }
    set.spells.push(spellId);
}

function auraIsUnsafeForOwner(aura: AuraType): boolean {
    return aura == AuraType.MOD_POSSESS
        || aura == AuraType.MOD_CHARM
        || aura == AuraType.MOD_FEAR
        || aura == AuraType.MOD_CONFUSE
        || aura == AuraType.MOD_STUN
        || aura == AuraType.MOD_THREAT
        || aura == AuraType.MOD_TAUNT
        || aura == AuraType.MOD_TOTAL_THREAT
        || aura == AuraType.MOD_ROOT
        || aura == AuraType.MOD_SILENCE
        || aura == AuraType.MOD_PACIFY
        || aura == AuraType.MOD_PACIFY_SILENCE
        || aura == AuraType.MOD_SHAPESHIFT
        || aura == AuraType.TRANSFORM
        || aura == AuraType.MOUNTED
        || aura == AuraType.MOD_POSSESS_PET
        || aura == AuraType.AOE_CHARM
        || aura == AuraType.CONTROL_VEHICLE
        || aura == AuraType.MOD_FACTION
        || aura == AuraType.PHASE
        || aura == AuraType.CLONE_CASTER;
}

function isHealingEffect(effect: TSSpellEffectInfo): boolean {
    const type = effect.GetType();
    return type == SpellEffects.HEAL
        || type == SpellEffects.HEAL_MAX_HEALTH
        || type == SpellEffects.HEAL_MECHANICAL
        || type == SpellEffects.SPIRIT_HEAL
        || type == SpellEffects.HEAL_PCT
        || effect.GetAura() == AuraType.PERIODIC_HEAL;
}

function isUsefulSupportEffect(effect: TSSpellEffectInfo): boolean {
    if (!effect.IsEffect()) return false;
    const type = effect.GetType();
    if (isHealingEffect(effect)
        || type == SpellEffects.ENERGIZE
        || type == SpellEffects.ENERGIZE_PCT
        || type == SpellEffects.DISPEL
        || type == SpellEffects.DISPEL_MECHANIC
        || type == SpellEffects.SANCTUARY
        || type == SpellEffects.REMOVE_AURA) return true;

    if (type == SpellEffects.APPLY_AURA
        || type == SpellEffects.APPLY_AREA_AURA_PARTY
        || type == SpellEffects.APPLY_AREA_AURA_RAID
        || type == SpellEffects.APPLY_AREA_AURA_PET
        || type == SpellEffects.APPLY_AREA_AURA_FRIEND
        || type == SpellEffects.APPLY_AREA_AURA_OWNER) {
        return !auraIsUnsafeForOwner(effect.GetAura());
    }
    return false;
}

function spellSupportInfo(spellId: number): TSSpellInfo | undefined {
    const info = GetSpellInfo(spellId);
    if (!info) return undefined;
    if ((Number(info.GetAttributes()) & SPELL_ATTR0_PASSIVE) != 0
        || (Number(info.GetAttributesCu()) & SPELL_ATTR0_CU_NEGATIVE) != 0) return undefined;

    const targets = Number(info.GetExplicitTargetMask());
    if ((targets & TARGET_FLAG_OWNER_UNIT) == 0
        || (targets & TARGET_FLAG_UNIT_ENEMY) != 0) return undefined;

    let useful = false;
    for (let i = 0; i < 3; i++) {
        if (isUsefulSupportEffect(info.GetEffect(i as SpellEffIndex))) useful = true;
    }
    return useful ? info : undefined;
}

function spellHeals(info: TSSpellInfo): boolean {
    for (let i = 0; i < 3; i++) {
        if (isHealingEffect(info.GetEffect(i as SpellEffIndex))) return true;
    }
    return false;
}

function loadSupportSpells(companion: TSCreature): SupportSpellSet {
    const set = supportSpellSet(companion);
    set.spells = [];
    set.cursor = 0;
    set.readyAt = 0;

    const template = companion.GetTemplate();
    addSupportSpell(set, Number(template.GetSpellA()));
    addSupportSpell(set, Number(template.GetSpellB()));
    addSupportSpell(set, Number(template.GetSpellC()));
    addSupportSpell(set, Number(template.GetSpellD()));
    addSupportSpell(set, Number(template.GetSpellE()));
    addSupportSpell(set, Number(template.GetSpellF()));
    addSupportSpell(set, Number(template.GetSpellG()));
    addSupportSpell(set, Number(template.GetSpellH()));

    // SmartAI cast actions are not exposed as a runtime list. Reading their
    // spell IDs once per summon preserves the original AI while allowing its
    // positive owner-targeted spells to supplement that AI.
    const entry = Number(companion.GetEntry());
    const result = QueryWorld(
        "SELECT DISTINCT action_param1 FROM smart_scripts"
        + " WHERE source_type = 0 AND entryorguid = " + entry
        + " AND action_type = 11 AND action_param1 <> 0",
    );
    while (result.GetRow()) addSupportSpell(set, Number(result.GetUInt32(0)));

    const supported: number[] = [];
    for (let i = 0; i < set.spells.length; i++) {
        if (spellSupportInfo(set.spells[i])) supported.push(set.spells[i]);
    }
    set.spells = supported;
    return set;
}

function trySupportOwner(companion: TSCreature): boolean {
    if (companion.IsDead() || companion.IsCasting()) return false;
    const owner = companion.GetOwner();
    const player = owner ? owner.ToPlayer() : undefined;
    if (!player || player.IsDead()) return false;

    syncOwnerState(companion, player);
    const set = supportSpellSet(companion);
    if (set.spells.length == 0) return false;
    const now = Number(GetUnixTime());
    if (now < set.readyAt) return false;

    for (let offset = 0; offset < set.spells.length; offset++) {
        const index = (set.cursor + offset) % set.spells.length;
        const spellId = set.spells[index];
        const info = spellSupportInfo(spellId);
        if (!info || companion.HasCooldown(spellId, 0, false)) continue;

        const heals = spellHeals(info);
        if (heals && Number(player.GetHealthPct()) >= SUPPORT_HEAL_BELOW_PCT) continue;
        if (player.HasAura(spellId)) continue;

        if (Number(companion.CastSpell(player, spellId, false)) == SpellCastResult.CAST_OK) {
            set.cursor = (index + 1) % set.spells.length;
            set.readyAt = now + SUPPORT_RECAST_DELAY_MS;
            return true;
        }
    }
    return false;
}

function startActionDispatcher(companion: TSCreature): void {
    loadSupportSpells(companion);
    companion.AddNamedTimer(ACTION_DISPATCH_TIMER, ACTION_DISPATCH_INTERVAL_MS, -1, (owner, timer) => {
        const creature = owner.ToCreature();
        if (!creature || creature.IsDead() || creature.IsCasting()) return;
        const ownerUnit = creature.GetOwner();
        const player = ownerUnit ? ownerUnit.ToPlayer() : undefined;
        if (!player || player.IsDead() || !CompanionRuntime.companionDispatcherReady(creature, false)) return;
        const companionId = Number(creature.GetUInt(COMPANION_ID_KEY, 0));
        const persisted = recordById(CapturedCompanion.get(player), companionId);
        if (!persisted) return;
        CompanionRuntime.syncInstalledTrainingPassives(creature, player, persisted);

        // One successful extra cast per tick: emergency recovery, interrupt,
        // trained/native taunt, original positive support, then offense.
        const recovery = CompanionRuntime.tryDispatchInstalledTrainingAction(
            creature, player, persisted, CompanionRuntime.TRAINING_DISPATCH_EMERGENCY,
        );
        if (recovery == CompanionRuntime.TRAINING_DISPATCH_EMERGENCY) {
            CompanionRuntime.markCompanionDispatcherAction(creature, false);
            return;
        }
        const interrupt = CompanionRuntime.tryDispatchInstalledTrainingAction(
            creature, player, persisted, CompanionRuntime.TRAINING_DISPATCH_INTERRUPT,
        );
        if (interrupt == CompanionRuntime.TRAINING_DISPATCH_INTERRUPT) {
            CompanionRuntime.markCompanionDispatcherAction(creature, true);
            return;
        }
        const trainedTaunt = CompanionRuntime.tryDispatchInstalledTrainingAction(
            creature, player, persisted, CompanionRuntime.TRAINING_DISPATCH_TAUNT,
        );
        if (trainedTaunt == CompanionRuntime.TRAINING_DISPATCH_TAUNT) {
            CompanionRuntime.markCompanionDispatcherAction(creature, true);
            return;
        }
        if (CompanionRuntime.companionDispatcherReady(creature, true) && tryTankTaunt(creature, player)) {
            CompanionRuntime.markCompanionDispatcherAction(creature, true);
            return;
        }
        if (trySupportOwner(creature)) {
            CompanionRuntime.markCompanionDispatcherAction(creature, false);
            return;
        }
        const offense = CompanionRuntime.tryDispatchInstalledTrainingAction(
            creature, player, persisted, CompanionRuntime.TRAINING_DISPATCH_OFFENSE,
        );
        if (offense == CompanionRuntime.TRAINING_DISPATCH_OFFENSE) {
            CompanionRuntime.markCompanionDispatcherAction(creature, true);
        }
    });
}

function applyCombatMode(companion: TSCreature, combatMode: number): void {
    const mode = normalizeCombatMode(combatMode);
    companion.SetUInt(COMPANION_MODE_KEY, mode);
    if (mode == CompanionMessages.COMPANION_MODE_PASSIVE) {
        companion.StopSpellCast(0);
        companion.AttackStop();
        companion.ClearInCombat();
        companion.SetReactState(0);
        return;
    }
    companion.SetReactState(1);
}

function configureCompanion(
    companion: TSCreature,
    player: TSPlayer,
    row: CapturedCompanion,
): void {
    companion.SetBool(COMPANION_KEY, true);
    companion.SetUInt(COMPANION_ID_KEY, row.companionId);
    companion.SetBool(MANAGED_DESPAWN_KEY, false);
    companion.SetNPCFlags(0);
    companion.SetLootMode(0);
    companion.GetLoot().SetGeneratesNormally(false);
    syncOwnerState(companion, player);
    syncCompanionLevel(companion, player, row.healthPct);
    applyCombatMode(companion, Number(row.combatMode));
    syncCompanionTalents(companion, player);
    CompanionRuntime.syncInstalledTrainingPassives(companion, player, row);
    startTalentSyncTimer(companion);
    companion.MoveFollow(player, FOLLOW_DISTANCE, Math.PI);
    bindRuntime(player, companion, row);
    startActionDispatcher(companion);
}

function spawnCompanion(
    map: TSMap,
    player: TSPlayer,
    row: CapturedCompanion,
    x: number,
    y: number,
    z: number,
    o: number,
): TSCreature | undefined {
    if (player.IsDead()
        || Number(row.expeditionEndAtMs) > 0
        || !GetCreatureTemplate(row.entry)) return undefined;

    // TSMap.SpawnCreature creates an ordinary TempSummon with the original
    // creature_template AI and does not invoke a special pet/summon AI path.
    const companion = map.SpawnCreature(
        row.entry, x, y, z, o, 0, player.GetPhaseMaskForSpawn(),
    );
    if (!companion) return undefined;
    configureCompanion(companion, player, row);
    return companion;
}

function spawnNearPlayer(
    player: TSPlayer,
    row: CapturedCompanion,
): TSCreature | undefined {
    const angle = Number(player.GetO()) + Math.PI;
    return spawnCompanion(
        player.GetMap(),
        player,
        row,
        Number(player.GetX()) + Math.cos(angle) * FOLLOW_DISTANCE,
        Number(player.GetY()) + Math.sin(angle) * FOLLOW_DISTANCE,
        Number(player.GetZ()),
        Number(player.GetO()),
    );
}

function snapshotActiveHealth(player: TSPlayer): void {
    const companion = findRuntimeCompanion(player.GetMap(), player);
    if (!companion) return;
    const row = recordById(CapturedCompanion.get(player), runtime(player).companionId);
    if (row) updateRecordHealth(row, companion);
}

function despawnRuntime(
    map: TSMap,
    player: TSPlayer,
    deactivate: boolean,
): void {
    const container = CapturedCompanion.get(player);
    const ref = runtime(player);
    const row = ref.companionId == 0 ? undefined : recordById(container, ref.companionId);
    const companion = findRuntimeCompanion(map, player);
    if (companion) {
        if (row) updateRecordHealth(row, companion);
        companion.SetBool(MANAGED_DESPAWN_KEY, true);
        companion.DespawnOrUnsummon(0);
    }
    if (deactivate) setOnlyActive(container, 0);
    clearRuntime(player);
    container.Save();
}

function synchronizeCompanionWorkforce(
    player: TSPlayer,
    publishReady: boolean = false,
): void {
    const container = CapturedCompanion.get(player);
    const assignedActiveId = CompanionRuntime.syncCompanionWorkforce(player, container, publishReady);
    if (assignedActiveId <= 0) return;
    if (runtime(player).companionId == assignedActiveId) {
        despawnRuntime(player.GetMap(), player, true);
    } else {
        const row = recordById(container, assignedActiveId);
        if (row && row.active != 0) {
            row.active = 0;
            row.MarkDirty();
            container.Save();
        }
    }
    sendState(player);
}

function startWorkforceSyncTimer(player: TSPlayer): void {
    player.AddNamedTimer(WORKFORCE_SYNC_TIMER, WORKFORCE_SYNC_INTERVAL_MS, -1, (owner, timer) => {
        const activePlayer = owner.ToPlayer();
        if (!activePlayer) return;
        synchronizeCompanionWorkforce(activePlayer);
    });
}

function restoreActive(map: TSMap, player: TSPlayer): void {
    const container = normalizeCollection(player);
    if (player.IsDead()) {
        setOnlyActive(container, 0);
        container.Save();
        synchronizeCompanionWorkforce(player);
        return;
    }
    const row = activeRecord(container);
    if (!row) return;
    if (CompanionRuntime.isCompanionWorkforceAssigned(player, Number(row.companionId))) {
        row.active = 0;
        row.MarkDirty();
        container.Save();
        synchronizeCompanionWorkforce(player);
        return;
    }

    const existing = findRuntimeCompanion(map, player);
    if (existing && !existing.IsDead()
        && runtime(player).companionId == row.companionId) {
        syncOwnerState(existing, player);
        return;
    }
    if (existing) despawnRuntime(map, player, false);
    else clearRuntime(player);

    if (!spawnNearPlayer(player, row)) {
        row.active = 0;
        row.MarkDirty();
        container.Save();
        synchronizeCompanionWorkforce(player);
        sendError(
            player,
            "Failed to summon the saved companion.",
            "Не удалось призвать сохранённого спутника.",
        );
    }
}

function buildState(player: TSPlayer): CompanionMessages.CompanionState {
    snapshotActiveHealth(player);
    const container = normalizeCollection(player);
    const state = new CompanionMessages.CompanionState();
    state.selectedProtocolVersion = CompanionMessages.COMPANION_PROTOCOL_VERSION;
    const nowMs = Number(GetUnixTime());
    const active = activeRecord(container);
    state.activeId = active ? active.companionId : 0;
    container.forEach(row => {
        state.companions.push(new CompanionMessages.CompanionStateEntry(
            row.companionId,
            row.entry,
            creatureName(row.entry),
            clampHealthPct(row.healthPct),
            normalizeCombatMode(Number(row.combatMode)),
            expeditionSpecialty(row),
            CompanionExpeditions.expeditionRemainingSeconds(Number(row.expeditionEndAtMs), nowMs),
            Number(row.professionId),
            Number(row.innateTraitId),
            Number(row.serviceXp),
            companionServiceRankForXp(Number(row.serviceXp)),
            Number(row.trainingCapacity),
            Number(row.trainingProgress),
            Number(row.trainingRevision),
            CompanionRuntime.installedCompanionFeatureCount(player, Number(row.companionId)),
        ));
    });
    return state;
}

function sendState(player: TSPlayer): void {
    const client = companionClient(player);
    if (!client.ready) return;
    const state = buildState(player);
    // PlayerModel:SetCreature resolves its display through the client's
    // creature cache. Prime every saved entry so previews work before the
    // companion has ever been spawned during this client session.
    for (let i = 0; i < state.companions.length; i++) {
        player.SendCreatureQueryPacket(state.companions[i].entry);
    }
    state.write(client.protocolVersion).SendToPlayer(player);
}

function sendCompanionDetail(
    player: TSPlayer,
    companionId: number,
    requestToken: number,
): void {
    const client = companionClient(player);
    if (!client.ready || client.protocolVersion < CompanionMessages.COMPANION_PROTOCOL_VERSION) return;
    const row = recordById(normalizeCollection(player), companionId);
    if (!row) {
        sendError(
            player,
            "This companion does not belong to your character.",
            "Этот спутник не принадлежит вашему персонажу.",
        );
        return;
    }
    CompanionRuntime.buildCompanionDetail(player, row, requestToken).write().SendToPlayer(player);
}

function validPacketInteger(value: number, allowZero: boolean = false): boolean {
    return value == value && value <= 0xffffffff
        && Math.floor(value) == value && (allowZero ? value >= 0 : value > 0);
}

function sendError(player: TSPlayer, english: string, russian?: string): void {
    const message = russian === undefined ? english : playerText(player, english, russian);
    if (!companionClient(player).ready) {
        player.SendBroadcastMessage("|cffff6060" + message + "|r");
        return;
    }
    new CompanionMessages.CompanionError(message).write().SendToPlayer(player);
    sendState(player);
}

function dismissActive(player: TSPlayer): void {
    despawnRuntime(player.GetMap(), player, true);
    synchronizeCompanionWorkforce(player);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff66ff66Companion dismissed. It remains in your collection.|r",
        "|cff66ff66Спутник отозван. Он остаётся в вашей коллекции.|r",
    ));
    sendState(player);
}

function activateCompanion(player: TSPlayer, companionId: number): void {
    if (companionId == 0) {
        dismissActive(player);
        return;
    }
    if (player.IsDead()) {
        sendError(
            player,
            "You cannot summon a companion while dead.",
            "Нельзя призвать спутника после смерти персонажа.",
        );
        return;
    }

    const container = normalizeCollection(player);
    const selected = recordById(container, companionId);
    if (!selected) {
        sendError(
            player,
            "This companion does not belong to your character.",
            "Этот спутник не принадлежит вашему персонажу.",
        );
        return;
    }
    if (CompanionRuntime.isCompanionWorkforceAssigned(player, companionId)) {
        sendError(
            player,
            "This companion is assigned as a base worker.",
            "Этот спутник назначен работником базы.",
        );
        return;
    }
    const expeditionRemaining = CompanionExpeditions.expeditionRemainingSeconds(
        Number(selected.expeditionEndAtMs),
        Number(GetUnixTime()),
    );
    if (expeditionRemaining >= 0) {
        sendError(
            player,
            expeditionRemaining > 0
                ? `The companion is still on an expedition: about ${Math.ceil(expeditionRemaining / 60)} min.`
                : "The companion has returned from the expedition; claim its reward first.",
            expeditionRemaining > 0
                ? `Спутник ещё в экспедиции: примерно ${Math.ceil(expeditionRemaining / 60)} мин.`
                : "Спутник вернулся из экспедиции — сначала заберите его награду.",
        );
        return;
    }
    if (!GetCreatureTemplate(selected.entry)) {
        sendError(
            player,
            "This companion's template no longer exists on the server.",
            "Шаблон этого спутника больше не существует на сервере.",
        );
        return;
    }

    const current = activeRecord(container);
    if (current && current.companionId == companionId) {
        const existing = findRuntimeCompanion(player.GetMap(), player);
        if (existing && !existing.IsDead()
            && runtime(player).companionId == companionId) {
            syncOwnerState(existing, player);
            sendState(player);
            return;
        }
        if (existing) despawnRuntime(player.GetMap(), player, false);
        else clearRuntime(player);
    } else {
        despawnRuntime(player.GetMap(), player, true);
    }

    setOnlyActive(container, companionId);
    container.Save();
    synchronizeCompanionWorkforce(player);
    if (!spawnNearPlayer(player, selected)) {
        setOnlyActive(container, 0);
        container.Save();
        synchronizeCompanionWorkforce(player);
        sendError(
            player,
            "Failed to summon the companion near your character.",
            "Не удалось призвать спутника рядом с персонажем.",
        );
        return;
    }

    player.SendBroadcastMessage(playerText(
        player,
        "|cff66ff66" + creatureName(selected.entry) + " #" + companionId + " summoned.|r",
        "|cff66ff66" + creatureName(selected.entry) + " #" + companionId + " призван.|r",
    ));
    sendState(player);
}

function setCompanionMode(player: TSPlayer, companionId: number, combatMode: number): void {
    if (companionId <= 0 || Math.floor(companionId) != companionId) {
        sendError(player, "Invalid companion ID.", "Некорректный идентификатор спутника.");
        return;
    }
    if (combatMode != CompanionMessages.COMPANION_MODE_DEFENSE
        && combatMode != CompanionMessages.COMPANION_MODE_PASSIVE
        && combatMode != CompanionMessages.COMPANION_MODE_TANK) {
        sendError(player, "Unknown companion behavior mode.", "Неизвестный режим поведения спутника.");
        return;
    }

    const container = normalizeCollection(player);
    const row = recordById(container, companionId);
    if (!row) {
        sendError(
            player,
            "This companion does not belong to your character.",
            "Этот спутник не принадлежит вашему персонажу.",
        );
        return;
    }

    if (row.combatMode != combatMode) {
        row.combatMode = combatMode;
        row.MarkDirty();
        container.Save();
    }

    if (row.active != 0 && runtime(player).companionId == companionId) {
        const companion = findRuntimeCompanion(player.GetMap(), player);
        if (companion && !companion.IsDead()) {
            applyCombatMode(companion, combatMode);
            syncCompanionTalents(companion, player);
            CompanionRuntime.syncInstalledTrainingPassives(companion, player, row);
            companion.MoveFollow(player, FOLLOW_DISTANCE, Math.PI);
        }
    }

    const modeName = combatMode == CompanionMessages.COMPANION_MODE_PASSIVE
        ? playerText(player, "Do not attack", "Не атаковать")
        : combatMode == CompanionMessages.COMPANION_MODE_TANK
            ? playerText(player, "Tank", "Танк") : playerText(player, "Defense", "Защита");
    player.SendBroadcastMessage(playerText(
        player,
        "|cff66ff66Companion mode: " + modeName + ".|r",
        "|cff66ff66Режим спутника: " + modeName + ".|r",
    ));
    sendState(player);
}

function expeditionRecord(
    player: TSPlayer,
    companionId: number,
): [DBContainer<CapturedCompanion>, CapturedCompanion] | undefined {
    if (companionId <= 0 || Math.floor(companionId) != companionId) {
        sendError(player, "Invalid companion ID.", "Некорректный идентификатор спутника.");
        return undefined;
    }
    const container = normalizeCollection(player);
    const row = recordById(container, companionId);
    if (!row) {
        sendError(
            player,
            "This companion does not belong to your character.",
            "Этот спутник не принадлежит вашему персонажу.",
        );
        return undefined;
    }
    return [container, row];
}

function startExpedition(player: TSPlayer, companionId: number): void {
    const found = expeditionRecord(player, companionId);
    if (!found) return;
    const [container, row] = found;
    if (CompanionRuntime.isCompanionWorkforceAssigned(player, companionId)) {
        sendError(
            player,
            "This companion is assigned as a base worker.",
            "Этот спутник назначен работником базы.",
        );
        return;
    }
    if (row.active != 0 || runtime(player).companionId == companionId) {
        sendError(player, "Dismiss this companion first.", "Сначала отзовите этого спутника.");
        return;
    }
    if (Number(row.expeditionEndAtMs) > 0) {
        sendError(
            player,
            "This companion is already on an expedition.",
            "Этот спутник уже находится в экспедиции.",
        );
        return;
    }

    let expeditionCount = 0;
    container.forEach(other => {
        if (Number(other.expeditionEndAtMs) > 0) expeditionCount++;
    });
    if (expeditionCount >= CompanionExpeditions.EXPEDITION_CONCURRENT_CAP) {
        sendError(
            player,
            "Wait for the current expedition to return and claim its reward first.",
            "Сначала дождитесь возвращения текущей экспедиции и заберите награду.",
        );
        return;
    }

    const level = Math.max(1, Math.min(80, Number(player.GetLevel())));
    const rewardEntry = expeditionRewardForCompanion(row, level);
    if (!GetItemTemplate(rewardEntry)) {
        sendError(
            player,
            "No reward is configured for this companion's specialty.",
            "Для специализации этого спутника не настроена награда.",
        );
        return;
    }
    const durationMs = CompanionRuntime.companionExpeditionDurationMs(player, row, CompanionExpeditions.EXPEDITION_DURATION_MS);
    row.expeditionEndAtMs = Number(GetUnixTime()) + durationMs;
    row.expeditionLevel = level;
    row.expeditionRewardCount = CompanionExpeditions.expeditionRewardCount(level)
        + CompanionRuntime.companionExpeditionRewardBonus(player, row);
    row.expeditionRewardEntry = rewardEntry;
    row.MarkDirty();
    container.Save();
    synchronizeCompanionWorkforce(player);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff66ff66" + creatureName(row.entry) + " #" + row.companionId
            + " leaves on an expedition for about "
            + Math.max(1, Math.ceil(durationMs / 60000)) + " min.|r",
        "|cff66ff66" + creatureName(row.entry) + " #" + row.companionId
            + " отправляется в экспедицию примерно на "
            + Math.max(1, Math.ceil(durationMs / 60000)) + " мин.|r",
    ));
    sendState(player);
}

function clearExpedition(row: CapturedCompanion): void {
    row.expeditionEndAtMs = 0;
    row.expeditionLevel = 0;
    row.expeditionRewardCount = 0;
    row.expeditionRewardEntry = 0;
}

function claimExpedition(player: TSPlayer, companionId: number): void {
    const found = expeditionRecord(player, companionId);
    if (!found) return;
    const [container, row] = found;
    const remaining = CompanionExpeditions.expeditionRemainingSeconds(
        Number(row.expeditionEndAtMs),
        Number(GetUnixTime()),
    );
    if (remaining < 0) {
        sendError(
            player,
            "This companion is not on an expedition.",
            "Этот спутник не находится в экспедиции.",
        );
        return;
    }
    if (remaining > 0) {
        sendError(
            player,
            `The companion returns in about ${Math.ceil(remaining / 60)} min.`,
            `Спутник вернётся примерно через ${Math.ceil(remaining / 60)} мин.`,
        );
        return;
    }

    const pending = Math.floor(Number(row.expeditionRewardCount));
    if (pending <= 0) {
        clearExpedition(row);
        row.MarkDirty();
        container.Save();
        synchronizeCompanionWorkforce(player);
        sendError(
            player,
            "The expedition ended without a reward.",
            "Экспедиция завершилась без награды.",
        );
        return;
    }

    const itemEntry = Math.floor(Number(row.expeditionRewardEntry));
    if (itemEntry <= 0 || !GetItemTemplate(itemEntry)) {
        clearExpedition(row);
        row.MarkDirty();
        container.Save();
        synchronizeCompanionWorkforce(player);
        sendError(
            player,
            "The expedition reward no longer exists.",
            "Награда экспедиции больше не существует.",
        );
        return;
    }
    const before = Number(player.GetItemCount(itemEntry, false));
    player.AddItem(itemEntry, pending);
    const added = Math.min(
        pending,
        Math.max(0, Number(player.GetItemCount(itemEntry, false)) - before),
    );
    if (added <= 0) {
        sendError(
            player,
            "Free some bag space to claim the expedition reward.",
            "Освободите место в сумках, чтобы забрать награду экспедиции.",
        );
        return;
    }

    row.expeditionRewardCount = pending - added;
    if (row.expeditionRewardCount == 0) {
        clearExpedition(row);
        CompanionRuntime.completeCompanionExpeditionService(player, row);
    }
    row.MarkDirty();
    container.Save();
    synchronizeCompanionWorkforce(player);
    if (row.expeditionRewardCount > 0) {
        player.SendBroadcastMessage(playerText(
            player,
            `|cffffcc00Received: ${added}. Bags lacked room for ${row.expeditionRewardCount} more.|r`,
            `|cffffcc00Получено: ${added}. В сумках не хватило места ещё для ${row.expeditionRewardCount}.|r`,
        ));
    } else {
        player.SendBroadcastMessage(playerText(
            player,
            `|cff66ff66Expedition complete. The companion brought ${added} resources.|r`,
            `|cff66ff66Экспедиция завершена. Спутник принёс ресурсов: ${added}.|r`,
        ));
    }
    sendState(player);
}

function handleExpedition(player: TSPlayer, companionId: number, action: number): void {
    if (action == CompanionMessages.COMPANION_EXPEDITION_START) {
        startExpedition(player, companionId);
        return;
    }
    if (action == CompanionMessages.COMPANION_EXPEDITION_CLAIM) {
        claimExpedition(player, companionId);
        return;
    }
    sendError(player, "Unknown expedition action.", "Неизвестное действие экспедиции.");
}

function commandCompanionAttack(player: TSPlayer, companionId: number): void {
    if (companionId == 0) {
        companionId = runtime(player).companionId;
        if (companionId <= 0) {
            sendError(player, "Summon a companion first.", "Сначала призовите спутника.");
            return;
        }
    }
    if (companionId <= 0 || Math.floor(companionId) != companionId) {
        sendError(player, "Invalid companion ID.", "Некорректный идентификатор спутника.");
        return;
    }
    const row = recordById(normalizeCollection(player), companionId);
    if (!row) {
        sendError(
            player,
            "This companion does not belong to your character.",
            "Этот спутник не принадлежит вашему персонажу.",
        );
        return;
    }
    if (row.active == 0 || runtime(player).companionId != companionId) {
        sendError(player, "Summon this companion first.", "Сначала призовите этого спутника.");
        return;
    }
    const companion = findRuntimeCompanion(player.GetMap(), player);
    if (!companion || companion.IsDead()) {
        sendError(
            player,
            "The active companion is currently unavailable.",
            "Активный спутник сейчас недоступен.",
        );
        return;
    }
    const target = player.GetSelection();
    if (!target) {
        sendError(player, "Select an attack target first.", "Сначала выберите цель для атаки.");
        return;
    }
    if (target.IsDead()) {
        sendError(
            player,
            "You cannot order an attack on a dead target.",
            "Нельзя приказать атаковать мёртвую цель.",
        );
        return;
    }
    const targetCreature = target.ToCreature();
    if (targetCreature && CompanionRuntime.isBaseWorkforceVisual(targetCreature)) {
        sendError(
            player,
            "The base worker is only a visual representation of the companion.",
            "Рабочий базы является только визуальным представлением спутника.",
        );
        return;
    }
    const eitherFriendly = player.IsFriendlyTo(target) || target.IsFriendlyTo(player);
    if (eitherFriendly || !CompanionRules.canCommandCompanionAttack(
        false, eitherFriendly, player.IsHostileTo(target), true,
    )) {
        sendError(
            player,
            "You cannot order an attack on a friendly target.",
            "Нельзя приказать атаковать дружественную цель.",
        );
        return;
    }
    syncOwnerState(companion, player);
    companion.AttackStart(target);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff66ff66The companion was ordered to attack the selected target.|r",
        "|cff66ff66Спутнику приказано атаковать выбранную цель.|r",
    ));
}

function attackWithCompanion(
    player: TSPlayer,
    target: TSUnit,
    combatConfirmed: boolean,
): void {
    const targetCreature = target.ToCreature();
    if (targetCreature && CompanionRuntime.isBaseWorkforceVisual(targetCreature)) return;
    if (!CompanionRules.canCommandCompanionAttack(
        target.IsDead(),
        player.IsFriendlyTo(target) || target.IsFriendlyTo(player),
        player.IsHostileTo(target),
        combatConfirmed,
    )) return;
    const companion = findRuntimeCompanion(player.GetMap(), player);
    if (!companion || companion.IsDead()) return;
    const row = recordById(CapturedCompanion.get(player), runtime(player).companionId);
    if (!row || normalizeCombatMode(Number(row.combatMode)) == CompanionMessages.COMPANION_MODE_PASSIVE) return;
    syncOwnerState(companion, player);
    companion.AttackStart(target); // dispatches to the original CreatureAI/SmartAI
}

function playerForKiller(killer: TSUnit | undefined): TSPlayer | undefined {
    if (!killer) return undefined;
    const player = killer.ToPlayer();
    if (player) return player;
    const controller = killer.GetController();
    return controller ? controller.ToPlayer() : undefined;
}

function canRecruit(player: TSPlayer, killed: TSCreature): boolean {
    if (player.IsDead()
        || CompanionRuntime.isBaseWorkforceVisual(killed)
        || !CompanionRules.canRecruitCompanionTarget(
            killed.IsFriendlyTo(player) || player.IsFriendlyTo(killed),
        )
        || !killed.GetOwnerGUID().IsEmpty()
        || killed.GetGUID().IsVehicle()
        || Number(killed.GetTemplate().GetVehicleID()) != 0
        || killed.IsTrigger()
        || killed.IsWorldBoss()
        || killed.IsRacialLeader()
        || (Number(killed.GetTemplate().GetFlagsExtra())
            & CREATURE_FLAG_EXTRA_DUNGEON_BOSS) != 0) return false;

    // Keep special instance/quest C++ scripts out of a portable companion.
    // ScriptID 0 still includes the normal AI and SmartAI used by most NPCs.
    return Number(killed.GetTemplate().GetScriptID()) == 0;
}

function tryRecruit(player: TSPlayer, killed: TSCreature): void {
    if (!canRecruit(player, killed) || Math.random() >= RECRUIT_CHANCE) return;
    const container = normalizeCollection(player);
    const entry = Number(killed.GetEntry());

    const row = container.Add(new CapturedCompanion(player.GetGUIDLow()));
    row.companionId = nextCompanionId(container);
    row.entry = entry;
    row.healthPct = INITIAL_HEALTH;
    row.active = activeRecord(container) ? 0 : 1;
    CompanionRuntime.initializeCompanionProgression(player, row);
    row.MarkDirty();
    container.Save();

    if (row.active != 0) {
        const companion = spawnCompanion(
            player.GetMap(),
            player,
            row,
            Number(killed.GetX()),
            Number(killed.GetY()),
            Number(killed.GetZ()),
            Number(killed.GetO()),
        );
        if (!companion) {
            row.active = 0;
            row.MarkDirty();
            container.Save();
        }
    }
    synchronizeCompanionWorkforce(player);

    const suffix = row.active != 0
        ? playerText(
            player,
            " becomes your active companion.",
            " становится вашим активным спутником.",
        )
        : playerText(
            player,
            " was added to your companion collection.",
            " добавлен в коллекцию спутников.",
        );
    player.SendBroadcastMessage(
        "|cff66ff66" + killed.GetName() + " #" + row.companionId + suffix + "|r",
    );
    sendState(player);
}

function rewardActiveCompanionCombatService(
    player: TSPlayer,
    killed: TSCreature,
): void {
    if (CompanionRuntime.isBaseWorkforceVisual(killed)
        || killed.IsFriendlyTo(player) || player.IsFriendlyTo(killed)
        || !killed.GetOwnerGUID().IsEmpty()
        || companionKillIsGrey(Number(player.GetLevel()), Number(killed.GetLevel()))) return;
    const amount = CompanionRuntime.companionCombatServiceXp(killed);
    if (amount <= 0) return;
    const companion = findRuntimeCompanion(player.GetMap(), player);
    if (!companion || companion.IsDead()) return;
    const row = recordById(CapturedCompanion.get(player), runtime(player).companionId);
    if (!row || row.active == 0) return;
    CompanionRuntime.addCompanionServiceXp(player, row, amount);
    synchronizeCompanionWorkforce(player);
}

function deactivateDeadCompanion(companion: TSCreature): void {
    // TrinityCore may add this from skinning_loot after death even though the
    // companion has no normal loot. It must never become a farmable corpse.
    companion.RemoveFlag(UnitFields.UNIT_FIELD_FLAGS, UNIT_FLAG_SKINNABLE);
    companion.SetBool(MANAGED_DESPAWN_KEY, true);
    const owner = companion.GetOwner();
    const player = owner ? owner.ToPlayer() : undefined;
    if (!player) return;

    const container = CapturedCompanion.get(player);
    const companionId = Number(companion.GetUInt(COMPANION_ID_KEY, 0));
    const row = recordById(container, companionId);
    if (row) {
        row.healthPct = 0;
        row.active = 0;
        row.MarkDirty();
    }
    clearRuntime(player);
    container.Save();
    synchronizeCompanionWorkforce(player);
    player.SendBroadcastMessage(playerText(
        player,
        "|cffff6060" + companion.GetName() + " #" + companionId
            + " dies but remains in your collection. The next summon restores it with 1 health.|r",
        "|cffff6060" + companion.GetName() + " #" + companionId
            + " погибает, но остаётся в вашей коллекции. Следующий призыв вернёт его с 1 ед. здоровья.|r",
    ));
    sendState(player);
}

function deactivateForOwnerDeath(player: TSPlayer): void {
    const active = activeRecord(CapturedCompanion.get(player));
    if (!active && runtime(player).guid == 0) return;
    despawnRuntime(player.GetMap(), player, true);
    synchronizeCompanionWorkforce(player);
    sendState(player);
}

function handleUnexpectedDespawn(companion: TSCreature): void {
    if (!companion.GetBool(COMPANION_KEY, false)
        || companion.GetBool(MANAGED_DESPAWN_KEY, false)) return;
    const owner = companion.GetOwner();
    const player = owner ? owner.ToPlayer() : undefined;
    if (!player) return;

    const container = CapturedCompanion.get(player);
    const row = recordById(
        container,
        Number(companion.GetUInt(COMPANION_ID_KEY, 0)),
    );
    if (row) {
        updateRecordHealth(row, companion);
        row.active = 0;
        row.MarkDirty();
    }
    clearRuntime(player);
    container.Save();
    synchronizeCompanionWorkforce(player);
    sendState(player);
}

function rehydrateCompanion(companion: TSCreature): void {
    if (!companion.GetBool(COMPANION_KEY, false)) return;
    const owner = companion.GetOwner();
    const player = owner ? owner.ToPlayer() : undefined;
    if (!player) return;

    const container = normalizeCollection(player);
    const entry = Number(companion.GetEntry());
    const current = findRuntimeCompanion(companion.GetMap(), player);
    let companionId = Number(companion.GetUInt(COMPANION_ID_KEY, 0));
    let row = companionId == 0 ? undefined : recordById(container, companionId);
    if (!row && companionId == 0) {
        const active = activeRecord(container);
        const currentIsThis = current
            ? Number(current.GetGUIDLow()) == Number(companion.GetGUIDLow())
            : false;
        if (active && active.entry == entry && (!current || currentIsThis)) {
            row = active;
            companionId = active.companionId;
        }
    }
    if (row && row.entry != entry) {
        row = undefined;
        companionId = 0;
    }
    if (!row) {
        if (companionId == 0) companionId = nextCompanionId(container);
        row = container.Add(new CapturedCompanion(player.GetGUIDLow()));
        row.companionId = companionId;
        row.entry = entry;
        row.healthPct = companion.IsDead() ? 0 : healthFraction(companion);
        row.active = activeRecord(container) ? 0 : 1;
        CompanionRuntime.initializeCompanionProgression(player, row);
        row.MarkDirty();
        container.Save();
    }

    if (companion.IsDead()) {
        row.healthPct = 0;
        row.active = 0;
        row.MarkDirty();
        container.Save();
        synchronizeCompanionWorkforce(player);
        companion.SetBool(MANAGED_DESPAWN_KEY, true);
        companion.DespawnOrUnsummon(0);
        return;
    }

    if (CompanionRuntime.isCompanionWorkforceAssigned(player, Number(row.companionId))) {
        row.active = 0;
        row.MarkDirty();
        container.Save();
        synchronizeCompanionWorkforce(player);
        companion.SetBool(MANAGED_DESPAWN_KEY, true);
        companion.DespawnOrUnsummon(0);
        return;
    }

    if (row.active == 0 || (current && Number(current.GetGUIDLow()) != Number(companion.GetGUIDLow()))) {
        synchronizeCompanionWorkforce(player);
        companion.SetBool(MANAGED_DESPAWN_KEY, true);
        companion.DespawnOrUnsummon(0);
        return;
    }

    updateRecordHealth(row, companion);
    configureCompanion(companion, player, row);
    container.Save();
    synchronizeCompanionWorkforce(player);
}

function validateConfig(): void {
    prepareRandomGemAbilities();
    CompanionRuntime.validateCompanionProgressionConfig();
    if (COMPANION_TALENT_CATALOG_VERSION != 1
        || !COMPANION_TALENT_CATALOG_READY
        || COMPANION_TALENT_CATALOG_COUNT != EXPECTED_TALENT_CATALOG_COUNT) {
        throw new Error(
            "custom-companions talent catalog is missing or stale: "
            + "run build data before build scripts no-inline",
        );
    }
    if (GEM_CLASS_ABILITY_CHOICES.length == 0
        || GEM_RANDOM_ABILITY_ROOTS.length == 0) {
        throw new Error(
            "custom-companions gem ability choices are missing or unsafe: "
            + "run build data before build scripts no-inline",
        );
    }
    const rankTagSets: string[][] = [
        TALENT_DAMAGE,
        TALENT_ATTACK_HASTE,
        TALENT_CAST_HASTE,
        TALENT_HEALTH,
        TALENT_CRIT,
        TALENT_DEFENSE,
        TALENT_UNITY,
        TALENT_BLOOD_TRAIL,
        TALENT_SPARK_ECHO,
        TALENT_CARE_ECHO,
        TALENT_PACK_POWER,
        TALENT_PERFECT_BOND,
        TALENT_TANK_THREAT,
        TALENT_TANK_TAUNT,
        EFFECT_BLOOD_TRAIL,
        EFFECT_SPARK_ECHO,
        EFFECT_CARE_ECHO,
    ];
    for (let setIndex = 0; setIndex < rankTagSets.length; setIndex++) {
        const tags = rankTagSets[setIndex];
        for (let tagIndex = 0; tagIndex < tags.length; tagIndex++) {
            if (companionTalentSpell(tags[tagIndex]) <= 0) {
                throw new Error(
                    "custom-companions talent catalog is missing tag " + tags[tagIndex]
                    + ": run build data before build scripts no-inline",
                );
            }
        }
    }
    const effectTags = [
        EFFECT_OFFENSE, EFFECT_RESILIENCE, EFFECT_CRIT, EFFECT_UNITY, EFFECT_TANK,
    ];
    for (let i = 0; i < EFFECT_RANDOM_OFFENSE.length; i++) {
        effectTags.push(EFFECT_RANDOM_OFFENSE[i]);
    }
    for (let i = 0; i < EFFECT_RANDOM_BENEFIT.length; i++) {
        effectTags.push(EFFECT_RANDOM_BENEFIT[i]);
    }
    for (let i = 0; i < effectTags.length; i++) {
        if (companionTalentSpell(effectTags[i]) <= 0) {
            throw new Error(
                "custom-companions talent catalog is missing tag " + effectTags[i]
                + ": run build data before build scripts no-inline",
            );
        }
    }
    if (RECRUIT_CHANCE <= 0 || RECRUIT_CHANCE > 1
        || INITIAL_HEALTH <= 0 || INITIAL_HEALTH > 1
        || ACTION_DISPATCH_INTERVAL_MS < 500
        || TALENT_SYNC_INTERVAL_MS < 100
        || TANK_TAUNT_COOLDOWN_MS < 1000
        || CompanionExpeditions.EXPEDITION_DURATION_MS < 60000
        || CompanionExpeditions.EXPEDITION_CONCURRENT_CAP < 1) {
        throw new Error("[custom-companions] invalid configuration");
    }
    for (let i = 0; i < WOOD_EXPEDITION_ITEMS.length; i++) {
        if (WOOD_EXPEDITION_ITEMS[i] <= 0 || !GetItemTemplate(WOOD_EXPEDITION_ITEMS[i])) {
            throw new Error(
                "custom-companions missing base-building item/wood-tier-" + (i + 1),
            );
        }
    }
}

export function Main(events: TSEvents) {
    validateConfig();

    for (let i = 0; i < EFFECT_SPARK_ECHO.length; i++) {
        events.Spell.OnEffectProc(
            companionTalentSpell(EFFECT_SPARK_ECHO[i]), handleRandomOffenseProc,
        );
    }
    for (let i = 0; i < EFFECT_CARE_ECHO.length; i++) {
        events.Spell.OnEffectProc(
            companionTalentSpell(EFFECT_CARE_ECHO[i]), handleRandomBenefitProc,
        );
    }
    // Preserve the original CreatureAI, but cancel its explicit spell-based
    // taunt/threat components unless the player deliberately enabled Tank.
    events.Spell.OnEffect((spell, cancel, info) => {
        const caster = spell.GetCaster().ToCreature();
        if (!caster || !caster.GetBool(COMPANION_KEY, false)
            || Number(caster.GetUInt(COMPANION_MODE_KEY, CompanionMessages.COMPANION_MODE_DEFENSE))
                == CompanionMessages.COMPANION_MODE_TANK) return;
        if (CompanionRules.isTankOnlySpellEffect(Number(info.GetType()), Number(info.GetAura()))) {
            cancel.set(true);
        }
    });

    events.CustomPacket.OnReceive(CompanionMessages.OP_COMPANION_REQUEST, (opcode, packet, player) => {
        const client = companionClient(player);
        const request = new CompanionMessages.CompanionStateRequest();
        request.read(packet);
        client.ready = true;
        client.protocolVersion = request.protocolVersion >= CompanionMessages.COMPANION_PROTOCOL_VERSION
            ? CompanionMessages.COMPANION_PROTOCOL_VERSION
            : request.protocolVersion >= CompanionMessages.COMPANION_PROTOCOL_EXPEDITIONS_VERSION
                ? CompanionMessages.COMPANION_PROTOCOL_EXPEDITIONS_VERSION
                : 0;
        sendState(player);
    });

    events.CustomPacket.OnReceive(CompanionMessages.OP_COMPANION_ACTIVATE, (opcode, packet, player) => {
        const request = new CompanionMessages.CompanionActivateRequest(0);
        request.read(packet);
        activateCompanion(player, request.companionId);
    });

    events.CustomPacket.OnReceive(CompanionMessages.OP_COMPANION_ATTACK, (opcode, packet, player) => {
        const request = new CompanionMessages.CompanionAttackRequest(0);
        request.read(packet);
        commandCompanionAttack(player, request.companionId);
    });

    events.CustomPacket.OnReceive(CompanionMessages.OP_COMPANION_MODE, (opcode, packet, player) => {
        const request = new CompanionMessages.CompanionModeRequest(0, CompanionMessages.COMPANION_MODE_DEFENSE);
        request.read(packet);
        setCompanionMode(player, request.companionId, request.combatMode);
    });

    events.CustomPacket.OnReceive(CompanionMessages.OP_COMPANION_EXPEDITION, (opcode, packet, player) => {
        const request = new CompanionMessages.CompanionExpeditionRequest(0, 0);
        request.read(packet);
        handleExpedition(player, request.companionId, request.action);
    });

    events.CustomPacket.OnReceive(OP_COMPANION_DETAIL_REQUEST, (opcode, packet, player) => {
        if (!companionClient(player).ready
            || companionClient(player).protocolVersion < CompanionMessages.COMPANION_PROTOCOL_VERSION) {
            sendError(
                player,
                "Companion progression requires an updated client module.",
                "Развитие спутников требует обновлённый клиентский модуль.",
            );
            return;
        }
        const request = new CompanionDetailRequest();
        request.read(packet);
        if (!validPacketInteger(request.companionId)
            || !validPacketInteger(request.requestToken, true)) {
            sendError(
                player,
                "Invalid companion progression request.",
                "Некорректный запрос развития спутника.",
            );
            return;
        }
        sendCompanionDetail(player, request.companionId, request.requestToken);
    });

    events.CustomPacket.OnReceive(OP_COMPANION_TRAINING_ACTION, (opcode, packet, player) => {
        if (!companionClient(player).ready
            || companionClient(player).protocolVersion < CompanionMessages.COMPANION_PROTOCOL_VERSION) {
            sendError(
                player,
                "Companion progression requires an updated client module.",
                "Развитие спутников требует обновлённый клиентский модуль.",
            );
            return;
        }
        const request = new CompanionTrainingActionRequest();
        request.read(packet);
        if (!validPacketInteger(request.requestToken, true)
            || !validPacketInteger(request.expectedRevision)
            || !validPacketInteger(request.expectedCatalogVersion)
            || !validPacketInteger(request.companionId)
            || !validPacketInteger(request.action)
            || !validPacketInteger(request.featureId)
            || !validPacketInteger(request.slot, true)) {
            sendError(
                player,
                "Invalid companion progression action.",
                "Некорректное действие развития спутника.",
            );
            return;
        }
        const row = recordById(normalizeCollection(player), request.companionId);
        if (!row) {
            sendError(
                player,
                "This companion does not belong to your character.",
                "Этот спутник не принадлежит вашему персонажу.",
            );
            return;
        }
        const error = CompanionRuntime.applyCompanionTrainingAction(player, row, request);
        if (error.length > 0) {
            sendError(player, error);
            sendCompanionDetail(player, request.companionId, request.requestToken);
            return;
        }
        const active = findRuntimeCompanion(player.GetMap(), player);
        if (active && runtime(player).companionId == request.companionId) {
            CompanionRuntime.syncInstalledTrainingPassives(active, player, row);
        }
        synchronizeCompanionWorkforce(player);
        sendCompanionDetail(player, request.companionId, request.requestToken);
        sendState(player);
    });

    events.Unit.OnDeath((victim, killer) => {
        const killed = victim.ToCreature();
        if (killed) {
            if (killed.GetBool(COMPANION_KEY, false)) {
                deactivateDeadCompanion(killed);
                return;
            }
            if (CompanionRuntime.isBaseWorkforceVisual(killed)) return;
            const player = playerForKiller(killer);
            if (player) {
                rewardActiveCompanionCombatService(player, killed);
                tryRecruit(player, killed);
            }
            return;
        }

        const player = victim.ToPlayer();
        if (player) deactivateForOwnerDeath(player);
    });

    events.Unit.OnEnterCombatWith((me, other) => {
        const first = me.ToPlayer();
        if (first) attackWithCompanion(first, other, true);
        const second = other.ToPlayer();
        if (second) attackWithCompanion(second, me, true);
    });

    events.Unit.OnSetTarget(unit => {
        const player = unit.ToPlayer();
        if (!player || !player.IsInCombat()) return;
        const target = player.GetSelection();
        if (target) attackWithCompanion(player, target, false);
    });

    events.Creature.OnDespawn(companion => handleUnexpectedDespawn(companion));
    events.Creature.OnReload(companion => rehydrateCompanion(companion));
    events.Creature.OnGenerateLoot((creature, _killer) => {
        CompanionRuntime.tryGenerateCompanionTrainingLoot(creature);
    });

    // A player OwnerGUID makes TrinityCore classify this kill as PvP, which
    // already skips PvE reputation/quest/achievement credit. Keep an explicit
    // XP guard as a second line of defence for custom reward paths.
    events.Player.OnGiveXP((_player, amount, victim) => {
        if (!victim) return;
        const companion = victim.ToCreature();
        if (companion && (companion.GetBool(COMPANION_KEY, false)
            || CompanionRuntime.isBaseWorkforceVisual(companion))) amount.set(0);
    });

    events.Player.OnLevelChanged(player => {
        const companion = findRuntimeCompanion(player.GetMap(), player);
        if (!companion || companion.IsDead()) return;
        const container = CapturedCompanion.get(player);
        const row = recordById(container, runtime(player).companionId);
        const healthPct = healthFraction(companion);
        if (row) {
            row.healthPct = healthPct;
            row.MarkDirty();
        }
        syncCompanionLevel(companion, player, healthPct);
        if (row) container.Save();
    });

    events.Player.OnLogin(player => {
        CompanionRuntime.clearCompanionWorkforceReady(player);
        normalizeCollection(player);
        synchronizeCompanionWorkforce(player, true);
        startWorkforceSyncTimer(player);
        restoreActive(player.GetMap(), player);
    });

    events.Player.OnSave(player => {
        snapshotActiveHealth(player);
        CapturedCompanion.get(player).Save();
        synchronizeCompanionWorkforce(player);
    });

    events.Player.OnLogout(player => {
        CompanionRuntime.clearCompanionWorkforceReady(player);
        despawnRuntime(player.GetMap(), player, false);
    });

    events.Map.OnPlayerLeave((map, player) => despawnRuntime(map, player, false));
    events.Map.OnPlayerEnter((map, player) => {
        synchronizeCompanionWorkforce(player);
        restoreActive(map, player);
    });
}
