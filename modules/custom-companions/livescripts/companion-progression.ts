/** Persistence, workforce bridge, loot and trained-action runtime. */

import {
    CompanionSchemaRevision,
    CompanionTrainingEntry,
    CapturedCompanion,
} from "./companion-db";
import {
    COMPANION_PROFESSIONS,
    COMPANION_TRAITS,
    companionFamilyForCreatureType,
    companionKillIsGrey,
    companionMaskHas,
    companionProfessionById,
    companionProfessionForSeed,
    companionServiceRankDef,
    companionServiceRankForXp,
    companionTraitById,
    companionTraitForProfession,
    companionWorkXpDecision,
} from "../shared/CompanionProgression";
import {
    COMPANION_MANUAL_COUNT,
    COMPANION_TRAINING_FEATURE_COUNT,
    COMPANION_TRAINING_FEATURES,
    COMPANION_TRAINING_INITIAL_SLOTS,
    COMPANION_TRAINING_MAX_SLOTS,
    TRAINING_KIND_MANUAL,
    TRAINING_KIND_TOOL,
    TRAINING_PAYLOAD_ENEMY_DAMAGE,
    TRAINING_PAYLOAD_INTERRUPT,
    TRAINING_PAYLOAD_OWNER_HEAL,
    TRAINING_PAYLOAD_PASSIVE_CRIT,
    TRAINING_PAYLOAD_PASSIVE_DAMAGE,
    TRAINING_PAYLOAD_PASSIVE_DEFENSE,
    TRAINING_PAYLOAD_PASSIVE_HASTE,
    TRAINING_PAYLOAD_PASSIVE_HEALING,
    TRAINING_PAYLOAD_PASSIVE_HEALTH,
    TRAINING_PAYLOAD_PASSIVE_SUPPORT,
    TRAINING_PAYLOAD_PASSIVE_THREAT,
    TRAINING_PAYLOAD_SELF_HEAL,
    TRAINING_PAYLOAD_TAUNT,
    TRAINING_PAYLOAD_TOOL_BONUS,
    TRAINING_PAYLOAD_TOOL_PERIOD,
    TRAINING_PAYLOAD_TOOL_SAVE,
    companionManualDamage,
    companionManualHeal,
    companionNextSlotCost,
    companionPassiveAmount,
    companionToolBonusBps,
    companionTrainingCompatible,
    companionTrainingFeatureById,
} from "../shared/CompanionTraining";
import {
    COMPANION_ACTION_INSTALL,
    COMPANION_ACTION_LEARN_OR_RANK,
    COMPANION_ACTION_STUDY,
    COMPANION_ACTION_UNINSTALL,
    CompanionDetailFeatureState,
    CompanionDetailState,
    CompanionTrainingActionRequest,
} from "../shared/CompanionProgressionMessages";
import {
    COMPANION_TRAINING_CATALOG_COUNT,
    COMPANION_TRAINING_CATALOG_READY,
    COMPANION_TRAINING_CATALOG_VERSION,
    GEN_COMPANION_TRAINING_ITEMS,
    GEN_COMPANION_TRAINING_SPELLS,
} from "./generated_companion_training";

export const BASE_WORKFORCE_VISUAL_MARKER = "base-building:workforce-visual";
export const COMPANION_WORKFORCE_READY_KEY = "custom-companions:workforce-ready";

export const TRAINING_DISPATCH_NONE = 0;
export const TRAINING_DISPATCH_EMERGENCY = 1;
export const TRAINING_DISPATCH_INTERRUPT = 2;
export const TRAINING_DISPATCH_TAUNT = 3;
export const TRAINING_DISPATCH_OFFENSE = 4;

const CURRENT_SCHEMA_REVISION = 2;
const CREATURE_FLAG_EXTRA_DUNGEON_BOSS = 0x10000000;
const DISPATCH_STATE_KEY = "custom-companions:training-dispatch";
const PASSIVE_REVISION_KEY = "custom-companions:training-passive-revision";
const EXTRA_ACTION_GAP_MS = 4000;
const OFFENSIVE_ACTION_GAP_MS = 6000;
const SERVICE_XP_PER_EXPEDITION = 25;
const MAX_SERVICE_XP = 0x7fffffff;
const PERIOD_BPS_BY_RANK = [500, 800, 1200, 1600, 2000];
const SAVE_BPS_BY_RANK = [300, 500, 800, 1100, 1500];
const BONUS_BPS_BY_RANK = [400, 700, 1000, 1400, 1800];
const MARK_BPS_BY_RANK = [200, 300, 500, 700, 1000];

class FeatureCooldown {
    featureId: number = 0;
    readyAt: number = 0;
}

class TrainingDispatchState {
    cursor: number = 0;
    nextActionAt: number = 0;
    nextOffensiveAt: number = 0;
    cooldowns: FeatureCooldown[] = [];
}

function dispatchState(companion: TSCreature): TrainingDispatchState {
    return companion.GetObject(DISPATCH_STATE_KEY, new TrainingDispatchState());
}

function clampInt(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function recordById(
    collection: DBContainer<CapturedCompanion>,
    companionId: number,
): CapturedCompanion | undefined {
    let found: CapturedCompanion | undefined = undefined;
    collection.forEach(row => {
        if (!found && row.companionId == companionId) found = row;
    });
    return found;
}

function familyForEntry(entry: number): number {
    const template = GetCreatureTemplate(entry);
    return companionFamilyForCreatureType(template ? Number(template.GetType()) : 0);
}

function identitySeed(player: TSPlayer, row: CapturedCompanion, salt: number): number {
    return Number(player.GetGUIDLow())
        + Number(row.companionId) * 131
        + Number(row.entry) * 17
        + salt * 7919;
}

export function initializeCompanionProgression(
    player: TSPlayer,
    row: CapturedCompanion,
): void {
    const family = familyForEntry(Number(row.entry));
    row.professionId = companionProfessionForSeed(family, Math.random() * 0x7fffffff);
    row.innateTraitId = companionTraitForProfession(
        Number(row.professionId), Math.random() * 0x7fffffff,
    );
    row.serviceXp = 0;
    row.trainingCapacity = COMPANION_TRAINING_INITIAL_SLOTS;
    row.trainingProgress = 0;
    row.trainingRevision = 1;
}

function normalizeIdentity(player: TSPlayer, row: CapturedCompanion): boolean {
    let changed = false;
    const previousRevision = Number(row.trainingRevision);
    const family = familyForEntry(Number(row.entry));
    const profession = companionProfessionById(Number(row.professionId));
    if (!profession || !companionMaskHas(profession.familyMask, family)) {
        row.professionId = companionProfessionForSeed(family, identitySeed(player, row, 1));
        changed = true;
    }
    const trait = companionTraitById(Number(row.innateTraitId));
    const firstTraitId = (Number(row.professionId) - 1) * 4 + 1;
    if (!trait || Number(row.innateTraitId) < firstTraitId
        || Number(row.innateTraitId) >= firstTraitId + 4) {
        row.innateTraitId = companionTraitForProfession(
            Number(row.professionId), identitySeed(player, row, 2),
        );
        changed = true;
    }
    const serviceXp = clampInt(Number(row.serviceXp), 0, MAX_SERVICE_XP);
    if (serviceXp != Number(row.serviceXp)) {
        row.serviceXp = serviceXp;
        changed = true;
    }
    let capacity = clampInt(
        Number(row.trainingCapacity) || COMPANION_TRAINING_INITIAL_SLOTS,
        COMPANION_TRAINING_INITIAL_SLOTS,
        COMPANION_TRAINING_MAX_SLOTS,
    );
    let progress = Math.max(0, Math.floor(Number(row.trainingProgress) || 0));
    let nextCost = companionNextSlotCost(capacity);
    while (capacity < COMPANION_TRAINING_MAX_SLOTS && nextCost > 0 && progress >= nextCost) {
        progress -= nextCost;
        capacity++;
        nextCost = companionNextSlotCost(capacity);
    }
    if (capacity >= COMPANION_TRAINING_MAX_SLOTS) progress = 0;
    else if (nextCost > 0) progress = Math.min(progress, nextCost - 1);
    if (capacity != Number(row.trainingCapacity)) {
        row.trainingCapacity = capacity;
        changed = true;
    }
    if (progress != Number(row.trainingProgress)) {
        row.trainingProgress = progress;
        changed = true;
    }
    if (!(previousRevision > 0)) {
        row.trainingRevision = 1;
        changed = true;
    } else if (changed) {
        // Identity, capacity and service-XP repairs can all change the effects
        // exported to an assigned base worker. Publish a fresh snapshot.
        row.trainingRevision = previousRevision + 1;
    }
    if (changed) row.MarkDirty();
    return changed;
}

function normalizeTrainingRows(
    player: TSPlayer,
    collection: DBContainer<CapturedCompanion>,
): void {
    const training = CompanionTrainingEntry.get(player);
    const rows = training.ToArray();
    let changed = false;
    for (let i = 0; i < rows.length; i++) {
        const current = rows[i];
        if (current.IsDeleted()) continue;
        const companion = recordById(collection, Number(current.companionId));
        const feature = companionTrainingFeatureById(Number(current.featureId));
        if (!companion || !feature) {
            current.Delete();
            changed = true;
            continue;
        }
        const rank = clampInt(Number(current.rank), 1, 3);
        const rankProgress = rank == 2 ? clampInt(Number(current.rankProgress), 0, 2) : 0;
        const compatible = companionTrainingCompatible(
            feature,
            familyForEntry(Number(companion.entry)),
            Number(companion.professionId),
        );
        let slot = clampInt(Number(current.installedSlot), 0, COMPANION_TRAINING_MAX_SLOTS);
        if (slot > Number(companion.trainingCapacity) || !compatible) slot = 0;
        if (rank != Number(current.rank)
            || rankProgress != Number(current.rankProgress)
            || slot != Number(current.installedSlot)) {
            current.rank = rank;
            current.rankProgress = rankProgress;
            current.installedSlot = slot;
            current.MarkDirty();
            changed = true;
        }
        for (let j = i + 1; j < rows.length; j++) {
            const duplicate = rows[j];
            if (duplicate.IsDeleted()
                || duplicate.companionId != current.companionId
                || duplicate.featureId != current.featureId) continue;
            if (Number(duplicate.rank) > Number(current.rank)
                || (duplicate.rank == current.rank
                    && Number(duplicate.rankProgress) > Number(current.rankProgress))) {
                current.rank = clampInt(Number(duplicate.rank), 1, 3);
                current.rankProgress = current.rank == 2
                    ? clampInt(Number(duplicate.rankProgress), 0, 2)
                    : 0;
                current.MarkDirty();
            }
            if (current.installedSlot == 0 && Number(duplicate.installedSlot) > 0) {
                current.installedSlot = Number(duplicate.installedSlot);
                current.MarkDirty();
            }
            duplicate.Delete();
            changed = true;
        }
        // A duplicate may have supplied its raw slot after the first pass.
        // Validate the merged value again before installed effects are read.
        const mergedSlot = clampInt(
            Number(current.installedSlot), 0, COMPANION_TRAINING_MAX_SLOTS,
        );
        const validMergedSlot = mergedSlot <= Number(companion.trainingCapacity) && compatible
            ? mergedSlot
            : 0;
        if (validMergedSlot != Number(current.installedSlot)) {
            current.installedSlot = validMergedSlot;
            current.MarkDirty();
            changed = true;
        }
    }
    for (let i = 0; i < rows.length; i++) {
        const current = rows[i];
        if (current.IsDeleted() || Number(current.installedSlot) <= 0) continue;
        for (let j = 0; j < i; j++) {
            const earlier = rows[j];
            if (!earlier.IsDeleted()
                && earlier.companionId == current.companionId
                && earlier.installedSlot == current.installedSlot) {
                current.installedSlot = 0;
                current.MarkDirty();
                changed = true;
                break;
            }
        }
    }
    if (changed) {
        training.Save();
        // Training normalization changes installed effects even when identity
        // fields were already valid, so advance the public revision as well.
        collection.forEach(companion => touchCompanion(companion));
        collection.Save();
    }
}

export function normalizeCompanionProgression(
    player: TSPlayer,
    collection: DBContainer<CapturedCompanion>,
): void {
    let changed = false;
    collection.forEach(row => {
        if (normalizeIdentity(player, row)) changed = true;
    });
    if (changed) collection.Save();
    normalizeTrainingRows(player, collection);
    const revision = CompanionSchemaRevision.get(player);
    if (Number(revision.revision) < CURRENT_SCHEMA_REVISION) {
        revision.revision = CURRENT_SCHEMA_REVISION;
        revision.Save();
    }
}

function trainingRow(
    player: TSPlayer,
    companionId: number,
    featureId: number,
): CompanionTrainingEntry | undefined {
    let found: CompanionTrainingEntry | undefined = undefined;
    CompanionTrainingEntry.get(player).forEach(row => {
        if (!found && row.companionId == companionId && row.featureId == featureId) found = row;
    });
    return found;
}

function installedTrainingRow(
    player: TSPlayer,
    companionId: number,
    slot: number,
): CompanionTrainingEntry | undefined {
    let found: CompanionTrainingEntry | undefined = undefined;
    const rows = CompanionTrainingEntry.get(player).ToArray();
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].companionId == companionId && Number(rows[i].installedSlot) == slot) {
            found = rows[i];
            break;
        }
    }
    return found;
}

function trainingItemId(featureId: number): number {
    const value = GEN_COMPANION_TRAINING_ITEMS[featureId];
    return value === undefined ? 0 : Number(value);
}

function trainingSpellId(featureId: number): number {
    const value = GEN_COMPANION_TRAINING_SPELLS[featureId];
    return value === undefined ? 0 : Number(value);
}

export function installedCompanionFeatureCount(player: TSPlayer, companionId: number): number {
    let count = 0;
    CompanionTrainingEntry.get(player).forEach(row => {
        if (row.companionId == companionId && Number(row.installedSlot) > 0) count++;
    });
    return count;
}

export function buildCompanionDetail(
    player: TSPlayer,
    companion: CapturedCompanion,
    ackToken: number,
): CompanionDetailState {
    const state = new CompanionDetailState();
    state.ackToken = ackToken;
    state.companionId = Number(companion.companionId);
    state.revision = Number(companion.trainingRevision);
    state.family = familyForEntry(Number(companion.entry));
    state.professionId = Number(companion.professionId);
    state.innateTraitId = Number(companion.innateTraitId);
    state.serviceXp = Number(companion.serviceXp);
    state.serviceRank = companionServiceRankForXp(state.serviceXp);
    state.capacity = Number(companion.trainingCapacity);
    state.progress = Number(companion.trainingProgress);
    state.nextSlotCost = companionNextSlotCost(state.capacity);
    for (let i = 0; i < COMPANION_TRAINING_FEATURES.length; i++) {
        const definition = COMPANION_TRAINING_FEATURES[i];
        const learned = trainingRow(player, state.companionId, definition.id);
        const itemId = trainingItemId(definition.id);
        const inventoryCount = itemId > 0 ? Number(player.GetItemCount(itemId, false)) : 0;
        if (!learned && inventoryCount <= 0 && !companionTrainingCompatible(
            definition, state.family, state.professionId,
        )) continue;
        state.features.push(new CompanionDetailFeatureState(
            definition.id,
            learned ? Number(learned.rank) : 0,
            learned ? Number(learned.rankProgress) : 0,
            learned ? Number(learned.installedSlot) : 0,
            inventoryCount,
        ));
    }
    return state;
}

function consumeTrainingItem(player: TSPlayer, featureId: number): boolean {
    const itemId = trainingItemId(featureId);
    if (itemId <= 0 || !player.HasItem(itemId, 1, false)) return false;
    player.RemoveItemByEntry(itemId, 1);
    return true;
}

function touchCompanion(companion: CapturedCompanion): void {
    companion.trainingRevision = Math.max(1, Number(companion.trainingRevision) + 1);
    companion.MarkDirty();
}

export function isCompanionWorkforceAssigned(player: TSPlayer, companionId: number): boolean {
    return Number(player.GetUInt("base-building:workforce-ready", 0)) == 1
        && Number(player.GetUInt(
            "base-building:worker:" + companionId + ":assigned", 0,
        )) == 1;
}

export function companionText(player: TSPlayer, english: string, russian: string): string {
    return Number(player.GetDbcLocale()) == 8 ? russian : english;
}

export function applyCompanionTrainingAction(
    player: TSPlayer,
    companion: CapturedCompanion,
    request: CompanionTrainingActionRequest,
): string {
    if (player.IsDead() || player.IsInCombat()) return companionText(
        player,
        "Companion training is unavailable during combat or while dead.",
        "Обучение спутника недоступно во время боя или после смерти.",
    );
    if (Number(companion.expeditionEndAtMs) > 0) return companionText(
        player, "The companion is on an expedition.", "Спутник находится в экспедиции.",
    );
    if (Number(request.expectedRevision) != Number(companion.trainingRevision)) {
        return companionText(
            player,
            "Training state changed; the list was refreshed.",
            "Состояние обучения изменилось; список обновлён.",
        );
    }
    if (Number(request.expectedCatalogVersion) != COMPANION_TRAINING_CATALOG_VERSION) {
        return companionText(
            player,
            "The training catalog changed; reopen companion progression.",
            "Каталог обучения обновился; откройте развитие спутника заново.",
        );
    }
    const feature = companionTrainingFeatureById(Number(request.featureId));
    if (!feature) return companionText(
        player, "Unknown manual or tool.", "Неизвестное руководство или инструмент.",
    );
    const requiresCompatibility = request.action == COMPANION_ACTION_LEARN_OR_RANK
        || request.action == COMPANION_ACTION_INSTALL;
    if (requiresCompatibility && !companionTrainingCompatible(
        feature,
        familyForEntry(Number(companion.entry)),
        Number(companion.professionId),
    )) return companionText(
        player,
        "This manual is incompatible with the companion.",
        "Это руководство несовместимо с данным спутником.",
    );

    const training = CompanionTrainingEntry.get(player);
    let learned = trainingRow(player, Number(companion.companionId), feature.id);
    if (request.action == COMPANION_ACTION_LEARN_OR_RANK) {
        if (learned && Number(learned.rank) >= 3) return companionText(
            player,
            "Rank III is already reached; the item was not consumed.",
            "Достигнут III ранг; предмет не израсходован.",
        );
        if (!consumeTrainingItem(player, feature.id)) return companionText(
            player,
            "The required manual or tool is not in your bags.",
            "В сумках нет нужного руководства или инструмента.",
        );
        if (!learned) {
            learned = training.Add(new CompanionTrainingEntry(player.GetGUIDLow()));
            learned.companionId = Number(companion.companionId);
            learned.featureId = feature.id;
            learned.rank = 1;
            learned.rankProgress = 0;
            learned.installedSlot = 0;
        } else if (Number(learned.rank) == 1) {
            learned.rank = 2;
            learned.rankProgress = 0;
        } else {
            learned.rankProgress = Number(learned.rankProgress) + 1;
            if (Number(learned.rankProgress) >= 3) {
                learned.rank = 3;
                learned.rankProgress = 0;
            }
        }
        learned.MarkDirty();
    } else if (request.action == COMPANION_ACTION_STUDY) {
        if (Number(companion.trainingCapacity) >= COMPANION_TRAINING_MAX_SLOTS) {
            return companionText(
                player,
                "All 15 slots are already open; the item was not consumed.",
                "Все 15 ячеек уже открыты; предмет не израсходован.",
            );
        }
        if (!consumeTrainingItem(player, feature.id)) return companionText(
            player, "The selected item is not in your bags.", "В сумках нет выбранного предмета.",
        );
        companion.trainingProgress = Number(companion.trainingProgress) + 1;
        const cost = companionNextSlotCost(Number(companion.trainingCapacity));
        if (cost > 0 && Number(companion.trainingProgress) >= cost) {
            companion.trainingCapacity = Number(companion.trainingCapacity) + 1;
            companion.trainingProgress = 0;
        }
    } else if (request.action == COMPANION_ACTION_INSTALL) {
        const slot = Math.floor(Number(request.slot));
        if (!learned) return companionText(
            player,
            "Learn this manual or tool first.",
            "Сначала изучите это руководство или инструмент.",
        );
        if (slot <= 0 || slot > Number(companion.trainingCapacity)) return companionText(
            player, "This slot is not open yet.", "Эта ячейка ещё не открыта.",
        );
        training.forEach(other => {
            if (other.companionId == companion.companionId
                && Number(other.installedSlot) == slot
                && other.featureId != learned!.featureId) {
                other.installedSlot = 0;
                other.MarkDirty();
            }
        });
        learned.installedSlot = slot;
        learned.MarkDirty();
    } else if (request.action == COMPANION_ACTION_UNINSTALL) {
        if (!learned || Number(learned.installedSlot) == 0) return companionText(
            player, "The upgrade is not installed.", "Улучшение не установлено.",
        );
        learned.installedSlot = 0;
        learned.MarkDirty();
    } else {
        return companionText(player, "Unknown training action.", "Неизвестное действие обучения.");
    }

    touchCompanion(companion);
    training.Save();
    CapturedCompanion.get(player).Save();
    return "";
}

export function addCompanionServiceXp(
    player: TSPlayer,
    companion: CapturedCompanion,
    amount: number,
): void {
    const added = Math.max(0, Math.floor(amount));
    if (added <= 0) return;
    companion.serviceXp = Math.min(MAX_SERVICE_XP, Number(companion.serviceXp) + added);
    touchCompanion(companion);
    CapturedCompanion.get(player).Save();
}

export function completeCompanionExpeditionService(
    _player: TSPlayer,
    companion: CapturedCompanion,
): void {
    companion.serviceXp = Math.min(
        MAX_SERVICE_XP,
        Number(companion.serviceXp) + SERVICE_XP_PER_EXPEDITION,
    );
    touchCompanion(companion);
}

function installedToolBps(
    player: TSPlayer,
    companionId: number,
    payload: number,
): number {
    let total = 0;
    CompanionTrainingEntry.get(player).forEach(row => {
        if (row.companionId != companionId || Number(row.installedSlot) <= 0) return;
        const feature = companionTrainingFeatureById(Number(row.featureId));
        if (feature && feature.kind == TRAINING_KIND_TOOL && feature.payload == payload) {
            total += companionToolBonusBps(Number(row.rank));
        }
    });
    return total;
}

class CompanionWorkforceEffects {
    periodBps: number = 0;
    saveBps: number = 0;
    bonusBps: number = 0;
    bias: number = 0;
    markBps: number = 0;
    markProperty: number = 0;
}

function curveForServiceXp(values: number[], serviceXp: number): number {
    const rank = companionServiceRankForXp(serviceXp);
    return values[Math.max(0, Math.min(values.length - 1, rank - 1))];
}

function companionWorkforceEffects(
    player: TSPlayer,
    companion: CapturedCompanion,
): CompanionWorkforceEffects {
    const result = new CompanionWorkforceEffects();
    const profession = companionProfessionById(Number(companion.professionId));
    const trait = companionTraitById(Number(companion.innateTraitId));
    const serviceXp = Number(companion.serviceXp);
    const companionId = Number(companion.companionId);
    const periodBase = curveForServiceXp(PERIOD_BPS_BY_RANK, serviceXp);
    const saveBase = curveForServiceXp(SAVE_BPS_BY_RANK, serviceXp);
    const bonusBase = curveForServiceXp(BONUS_BPS_BY_RANK, serviceXp);
    const markBase = curveForServiceXp(MARK_BPS_BY_RANK, serviceXp);

    result.periodBps = Math.min(3500,
        (profession && profession.periodBps > 0 ? periodBase : 0)
        + (trait ? trait.periodBps : 0)
        + installedToolBps(player, companionId, TRAINING_PAYLOAD_TOOL_PERIOD));
    result.saveBps = Math.min(2500,
        (profession && profession.saveBps > 0 ? saveBase : 0)
        + (trait ? trait.saveBps : 0)
        + installedToolBps(player, companionId, TRAINING_PAYLOAD_TOOL_SAVE));
    result.bonusBps = Math.min(2500,
        (profession && profession.bonusBps > 0 ? bonusBase : 0)
        + (trait ? trait.bonusBps : 0)
        + installedToolBps(player, companionId, TRAINING_PAYLOAD_TOOL_BONUS));
    result.bias = profession ? clampInt(profession.bias, 0, 4) : 0;
    result.markProperty = trait && trait.markProperty >= 1001 && trait.markProperty <= 1007
        ? trait.markProperty
        : 0;
    result.markBps = result.markProperty > 0 ? Math.min(2000, markBase) : 0;
    return result;
}

export function companionExpeditionDurationMs(
    player: TSPlayer,
    companion: CapturedCompanion,
    baseDurationMs: number,
): number {
    const reduction = companionWorkforceEffects(player, companion).periodBps;
    return Math.max(60000, Math.floor(baseDurationMs * (10000 - reduction) / 10000));
}

export function companionExpeditionRewardBonus(
    player: TSPlayer,
    companion: CapturedCompanion,
): number {
    const bonus = companionWorkforceEffects(player, companion).bonusBps;
    return Math.max(0, Math.floor(bonus / 1000));
}

function workerKey(companionId: number, suffix: string): string {
    return "custom-companions:worker:" + companionId + ":" + suffix;
}

function baseWorkerKey(companionId: number, suffix: string): string {
    return "base-building:worker:" + companionId + ":" + suffix;
}

function publishWorkforceSnapshot(player: TSPlayer, companion: CapturedCompanion): void {
    const companionId = Number(companion.companionId);
    const rank = companionServiceRankForXp(Number(companion.serviceXp));
    const effects = companionWorkforceEffects(player, companion);
    const exists = GetCreatureTemplate(Number(companion.entry)) !== undefined;
    const eligible = exists && companion.active == 0 && Number(companion.expeditionEndAtMs) == 0;

    player.SetUInt(workerKey(companionId, "exists"), exists ? 1 : 0);
    player.SetUInt(workerKey(companionId, "eligible"), eligible ? 1 : 0);
    player.SetUInt(workerKey(companionId, "available"),
        eligible && !isCompanionWorkforceAssigned(player, companionId) ? 1 : 0);
    player.SetUInt(workerKey(companionId, "entry"), Number(companion.entry));
    player.SetUInt(workerKey(companionId, "profession"), Number(companion.professionId));
    player.SetUInt(workerKey(companionId, "trait"), Number(companion.innateTraitId));
    player.SetUInt(workerKey(companionId, "rank"), rank);
    player.SetUInt(workerKey(companionId, "period-bps"), effects.periodBps);
    player.SetUInt(workerKey(companionId, "save-bps"), effects.saveBps);
    player.SetUInt(workerKey(companionId, "bonus-bps"), effects.bonusBps);
    player.SetUInt(workerKey(companionId, "bias"), effects.bias);
    player.SetUInt(workerKey(companionId, "mark-bps"), effects.markBps);
    player.SetUInt(workerKey(companionId, "mark-property"), effects.markProperty);

    // Read every documented target field so a target revision always produces
    // a snapshot after base has finished writing its target selector.
    player.GetUInt(baseWorkerKey(companionId, "target-id"), 0);
    player.GetUInt(baseWorkerKey(companionId, "station"), 0);
    player.GetUInt(baseWorkerKey(companionId, "target-kind"), 0);
    player.GetUInt(baseWorkerKey(companionId, "generator-category"), 0);
    player.GetUInt(baseWorkerKey(companionId, "revision"), 0);
    // Commit marker is last so base never observes a new revision with stale payload.
    player.SetUInt(workerKey(companionId, "revision"), Number(companion.trainingRevision));
}

export function syncCompanionWorkforce(
    player: TSPlayer,
    collection: DBContainer<CapturedCompanion>,
    publishReady: boolean = false,
): number {
    const ackIds: number[] = [];
    const ackRevisions: number[] = [];
    let changed = false;
    let assignedActiveId = 0;
    collection.forEach(companion => {
        const companionId = Number(companion.companionId);
        const xpRevision = Number(player.GetUInt(workerKey(companionId, "xp-revision"), 0));
        const decision = companionWorkXpDecision(
            Number(companion.lastWorkXpRevision),
            xpRevision,
            Number(player.GetUInt(workerKey(companionId, "pending-xp"), 0)),
        );
        if (decision.commit) {
            if (decision.amount > 0) {
                companion.serviceXp = Math.min(
                    MAX_SERVICE_XP, Number(companion.serviceXp) + decision.amount,
                );
            }
            companion.lastWorkXpRevision = decision.nextRevision;
            touchCompanion(companion);
            changed = true;
        }
        if (xpRevision > 0) {
            // Replayed revisions are acknowledged again after the durable state
            // has either just been saved or was observed as already committed.
            ackIds.push(companionId);
            ackRevisions.push(xpRevision);
        }
        if (companion.active != 0 && isCompanionWorkforceAssigned(player, companionId)) {
            assignedActiveId = companionId;
        }
    });
    // Persistence precedes the transient acknowledgement. A crash before Save
    // replays the batch; a crash after Save observes lastWorkXpRevision and only
    // repeats the acknowledgement without granting XP twice.
    if (changed) collection.Save();
    for (let i = 0; i < ackIds.length; i++) {
        player.SetUInt(workerKey(ackIds[i], "xp-ack-revision"), ackRevisions[i]);
    }
    collection.forEach(companion => publishWorkforceSnapshot(player, companion));
    if (publishReady) player.SetUInt(COMPANION_WORKFORCE_READY_KEY, 1);
    return assignedActiveId;
}

export function clearCompanionWorkforceReady(player: TSPlayer): void {
    player.SetUInt(COMPANION_WORKFORCE_READY_KEY, 0);
}

function cooldownFor(state: TrainingDispatchState, featureId: number): FeatureCooldown {
    for (let i = 0; i < state.cooldowns.length; i++) {
        if (state.cooldowns[i].featureId == featureId) return state.cooldowns[i];
    }
    const value = new FeatureCooldown();
    value.featureId = featureId;
    state.cooldowns.push(value);
    return value;
}

export function companionDispatcherReady(companion: TSCreature, offensive: boolean): boolean {
    const state = dispatchState(companion);
    const now = Number(GetUnixTime());
    return now >= Number(state.nextActionAt)
        && (!offensive || now >= Number(state.nextOffensiveAt));
}

export function markCompanionDispatcherAction(companion: TSCreature, offensive: boolean): void {
    const state = dispatchState(companion);
    const now = Number(GetUnixTime());
    state.nextActionAt = now + EXTRA_ACTION_GAP_MS;
    if (offensive) state.nextOffensiveAt = now + OFFENSIVE_ACTION_GAP_MS;
}

function isPassivePayload(payload: number): boolean {
    return payload >= TRAINING_PAYLOAD_PASSIVE_DAMAGE
        && payload <= TRAINING_PAYLOAD_PASSIVE_THREAT;
}

export function syncInstalledTrainingPassives(
    companion: TSCreature,
    player: TSPlayer,
    persisted: CapturedCompanion,
): void {
    const revision = Number(persisted.trainingRevision);
    const combatMode = Number(persisted.combatMode);
    let refresh = Number(companion.GetUInt(PASSIVE_REVISION_KEY, 0)) != revision
        || Number(companion.GetUInt(PASSIVE_REVISION_KEY + ":mode", 0)) != combatMode;

    for (let i = 0; i < COMPANION_TRAINING_FEATURES.length; i++) {
        const feature = COMPANION_TRAINING_FEATURES[i];
        if (feature.kind != TRAINING_KIND_MANUAL || !isPassivePayload(feature.payload)) continue;
        const learned = trainingRow(player, Number(persisted.companionId), feature.id);
        const shouldHave = !!learned && Number(learned.installedSlot) > 0
            && (feature.payload != TRAINING_PAYLOAD_PASSIVE_THREAT || combatMode == 2);
        const spellId = trainingSpellId(feature.id);
        if (spellId > 0 && companion.HasAura(spellId) != shouldHave) refresh = true;
    }
    if (!refresh) return;

    const healthPct = Math.max(0, Math.min(1,
        Number(companion.GetHealth()) / Math.max(1, Number(companion.GetMaxHealth()))));
    for (let i = 0; i < COMPANION_TRAINING_FEATURES.length; i++) {
        const feature = COMPANION_TRAINING_FEATURES[i];
        if (feature.kind != TRAINING_KIND_MANUAL || !isPassivePayload(feature.payload)) continue;
        const spellId = trainingSpellId(feature.id);
        if (spellId > 0 && companion.HasAura(spellId)) companion.RemoveAura(spellId);
    }
    for (let i = 0; i < COMPANION_TRAINING_FEATURES.length; i++) {
        const feature = COMPANION_TRAINING_FEATURES[i];
        if (feature.kind != TRAINING_KIND_MANUAL || !isPassivePayload(feature.payload)) continue;
        if (feature.payload == TRAINING_PAYLOAD_PASSIVE_THREAT && combatMode != 2) continue;
        const learned = trainingRow(player, Number(persisted.companionId), feature.id);
        if (!learned || Number(learned.installedSlot) <= 0) continue;
        const spellId = trainingSpellId(feature.id);
        const amount = companionPassiveAmount(feature.payload, Number(learned.rank));
        if (spellId > 0 && amount != 0) {
            companion.CastCustomSpell(companion, spellId, true, amount, amount, amount);
        }
    }
    if (!companion.IsDead()) {
        companion.SetHealth(Math.max(1, Math.floor(Number(companion.GetMaxHealth()) * healthPct)));
    }
    companion.SetUInt(PASSIVE_REVISION_KEY, revision);
    companion.SetUInt(PASSIVE_REVISION_KEY + ":mode", combatMode);
}

function dispatchPhaseForPayload(payload: number): number {
    if (payload == TRAINING_PAYLOAD_OWNER_HEAL || payload == TRAINING_PAYLOAD_SELF_HEAL) {
        return TRAINING_DISPATCH_EMERGENCY;
    }
    if (payload == TRAINING_PAYLOAD_INTERRUPT) return TRAINING_DISPATCH_INTERRUPT;
    if (payload == TRAINING_PAYLOAD_TAUNT) return TRAINING_DISPATCH_TAUNT;
    if (payload == TRAINING_PAYLOAD_ENEMY_DAMAGE) return TRAINING_DISPATCH_OFFENSE;
    return TRAINING_DISPATCH_NONE;
}

function isBaseVisualTarget(target: TSUnit): boolean {
    const creature = target.ToCreature();
    return !!creature && isBaseWorkforceVisual(creature);
}

export function tryDispatchInstalledTrainingAction(
    companion: TSCreature,
    player: TSPlayer,
    persisted: CapturedCompanion,
    phase: number,
): number {
    const offensive = phase == TRAINING_DISPATCH_INTERRUPT
        || phase == TRAINING_DISPATCH_TAUNT
        || phase == TRAINING_DISPATCH_OFFENSE;
    if (!companionDispatcherReady(companion, offensive)) return TRAINING_DISPATCH_NONE;
    const state = dispatchState(companion);
    const now = Number(GetUnixTime());
    const family = familyForEntry(Number(persisted.entry));
    const trait = companionTraitById(Number(persisted.innateTraitId));
    const service = companionServiceRankDef(companionServiceRankForXp(Number(persisted.serviceXp)));
    for (let offset = 0; offset < COMPANION_TRAINING_MAX_SLOTS; offset++) {
        const slot = (state.cursor + offset) % COMPANION_TRAINING_MAX_SLOTS + 1;
        const learned = installedTrainingRow(
            player, Number(persisted.companionId), slot,
        );
        if (!learned) continue;
        const feature = companionTrainingFeatureById(Number(learned.featureId));
        if (!feature || feature.kind != TRAINING_KIND_MANUAL
            || !companionTrainingCompatible(feature, family, Number(persisted.professionId))) continue;
        if (dispatchPhaseForPayload(feature.payload) != phase) continue;
        const cooldown = cooldownFor(state, feature.id);
        if (now < Number(cooldown.readyAt)) continue;
        const spellId = trainingSpellId(feature.id);
        if (spellId <= 0) continue;
        let result = -1;
        if (feature.payload == TRAINING_PAYLOAD_ENEMY_DAMAGE) {
            if (Number(persisted.combatMode) == 1) continue;
            const target = companion.GetVictim();
            if (!target || target.IsDead()
                || isBaseVisualTarget(target)
                || companion.IsFriendlyTo(target) || target.IsFriendlyTo(companion)) continue;
            let amount = companionManualDamage(
                Number(companion.GetLevel()), Number(learned.rank), feature.coefficientPermille,
            );
            amount = Math.floor(amount * (10000 + service.combatBps
                + (trait ? trait.damageBps : 0)) / 10000);
            result = Number(companion.CastCustomSpell(target, spellId, true, amount, 0, 0));
        } else if (feature.payload == TRAINING_PAYLOAD_OWNER_HEAL) {
            if (player.IsDead() || Number(player.GetHealthPct()) >= 75) continue;
            let amount = companionManualHeal(
                Number(companion.GetLevel()), Number(learned.rank), feature.coefficientPermille,
            );
            amount = Math.floor(amount * (10000 + service.combatBps
                + (trait ? trait.healingBps : 0)) / 10000);
            result = Number(companion.CastCustomSpell(player, spellId, true, amount, 0, 0));
        } else if (feature.payload == TRAINING_PAYLOAD_SELF_HEAL) {
            if (Number(companion.GetHealthPct()) >= 65) continue;
            let amount = companionManualHeal(
                Number(companion.GetLevel()), Number(learned.rank), feature.coefficientPermille,
            );
            amount = Math.floor(amount * (10000 + service.combatBps
                + (trait ? trait.healingBps : 0)) / 10000);
            result = Number(companion.CastCustomSpell(companion, spellId, true, amount, 0, 0));
        } else if (feature.payload == TRAINING_PAYLOAD_INTERRUPT) {
            if (Number(persisted.combatMode) == 1) continue;
            const target = companion.GetVictim();
            if (!target || target.IsDead() || !target.IsCasting()
                || isBaseVisualTarget(target)
                || companion.IsFriendlyTo(target) || target.IsFriendlyTo(companion)) continue;
            result = Number(companion.CastSpell(target, spellId, true));
        } else if (feature.payload == TRAINING_PAYLOAD_TAUNT) {
            if (Number(persisted.combatMode) != 2) continue;
            const target = companion.GetVictim();
            if (!target || target.IsDead()
                || isBaseVisualTarget(target)
                || companion.IsFriendlyTo(target) || target.IsFriendlyTo(companion)) continue;
            result = Number(companion.CastSpell(target, spellId, true));
        }
        if (result != SpellCastResult.CAST_OK) continue;
        cooldown.readyAt = now + feature.cooldownMs;
        state.cursor = slot % COMPANION_TRAINING_MAX_SLOTS;
        return phase;
    }
    return TRAINING_DISPATCH_NONE;
}

export function isBaseWorkforceVisual(creature: TSCreature): boolean {
    return Number(creature.GetUInt(BASE_WORKFORCE_VISUAL_MARKER, 0)) == 1;
}

function trainingLootChance(creature: TSCreature): number {
    const rank = Number(creature.GetTemplate().GetRank());
    if (rank == 2 || rank == 4) return 0.10;
    if (rank == 1) return 0.05;
    if (rank == 3) return 0;
    return 0.02;
}

export function tryGenerateCompanionTrainingLoot(
    creature: TSCreature,
): void {
    const player = creature.GetLootRecipient();
    const map = creature.GetMap();
    const family = companionFamilyForCreatureType(Number(creature.GetTemplate().GetType()));
    if (!player || family == 0
        || isBaseWorkforceVisual(creature)
        || creature.IsFriendlyTo(player) || player.IsFriendlyTo(creature)
        || map.IsDungeon() || map.IsArena() || map.IsBG()
        || !creature.GetOwnerGUID().IsEmpty()
        || creature.GetGUID().IsVehicle()
        || Number(creature.GetTemplate().GetVehicleID()) != 0
        || creature.IsTrigger() || creature.IsWorldBoss() || creature.IsRacialLeader()
        || (Number(creature.GetTemplate().GetFlagsExtra()) & CREATURE_FLAG_EXTRA_DUNGEON_BOSS) != 0) return;
    if (companionKillIsGrey(Number(player.GetLevel()), Number(creature.GetLevel()))) return;
    const chance = trainingLootChance(creature);
    if (chance <= 0 || Math.random() >= chance) return;
    const pool: number[] = [];
    for (let i = 0; i < COMPANION_TRAINING_FEATURES.length; i++) {
        const feature = COMPANION_TRAINING_FEATURES[i];
        const itemId = trainingItemId(feature.id);
        if (itemId > 0 && companionMaskHas(feature.lootFamilyMask, family)) pool.push(itemId);
    }
    if (pool.length == 0) return;
    const itemId = pool[Math.floor(Math.random() * pool.length)];
    creature.GetLoot().AddItem(itemId, 1, 1, 0, false, 0);
}

export function companionCombatServiceXp(creature: TSCreature): number {
    const rank = Number(creature.GetTemplate().GetRank());
    if (rank == 2 || rank == 4) return 10;
    if (rank == 1) return 3;
    if (rank == 0) return 1;
    return 0;
}

export function validateCompanionProgressionConfig(): void {
    if (COMPANION_PROFESSIONS.length != 10
        || COMPANION_TRAITS.length != 40
        || COMPANION_TRAINING_FEATURES.length != COMPANION_TRAINING_FEATURE_COUNT
        || COMPANION_TRAINING_CATALOG_VERSION != 1
        || !COMPANION_TRAINING_CATALOG_READY
        || COMPANION_TRAINING_CATALOG_COUNT != COMPANION_TRAINING_FEATURE_COUNT) {
        throw new Error(
            "custom-companions training catalog is missing or stale: "
            + "run build data before build scripts no-inline",
        );
    }
    for (let featureId = 1; featureId <= COMPANION_TRAINING_FEATURE_COUNT; featureId++) {
        const itemId = trainingItemId(featureId);
        if (itemId <= 0 || !GetItemTemplate(itemId)) {
            throw new Error("custom-companions missing training item " + featureId);
        }
        if (featureId <= COMPANION_MANUAL_COUNT) {
            const spellId = trainingSpellId(featureId);
            if (spellId <= 0 || !GetSpellInfo(spellId)) {
                throw new Error("custom-companions missing manual helper " + featureId);
            }
        }
    }
}
