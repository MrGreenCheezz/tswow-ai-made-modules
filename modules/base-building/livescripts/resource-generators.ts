/** Player-operated exact-resource generators. Nothing is granted automatically. */

import {
    GO_MINE_ENTRY, GO_GARDEN_ENTRY, masteryExtraCopy,
} from "../shared/BaseCatalog";
import {
    RESOURCE_GENERATORS, RESOURCE_GENERATOR_YIELDS,
    ResourceGeneratorDef, resourceGeneratorByKey,
} from "../shared/ResourceGenerators";
import { BaseBuilding } from "./base-db";
import {
    dist2, liveGameObject, localizedTemplateNames, nowUnix, normTime,
    removeCarriedItems, removeStoredGameObject, spawnDecorativeVisible,
    baseText,
} from "./base";
import {
    awardWorkerServiceXP, effectiveWorkerPeriod, workerBonusOutput, workerForGenerator,
} from "./workforce";

const GATHER_SPELL = UTAG("base-building", "spell/resource-generator-gather");
const READY_EFFECT_ENTRY = UTAG("base-building", "go/resource-generator-ready-effect");
const WOODCUTTING_SKILL = GetID("SkillLine", "base-building", "woodcutting");
const GENERATOR_USE_RANGE = 8.0;
const FISHING_CAPTURE_RANGE = 8.0;
const READY_EFFECT_Z_OFFSET = 0.35;
const READY_EFFECT_FLAGS = 0x04 | 0x10;
const EFFECT_TIMER_MS = 30000;
const EFFECT_TIMER_LOOPS = 0x0fffffff;

const SALVAGE_CLOTH: number[][] = [
    [1, 2589], [75, 2592], [150, 4306], [225, 4338], [300, 14047], [325, 21877], [350, 33470],
];
const SALVAGE_LEATHER: number[][] = [
    [1, 2318], [75, 2319], [150, 4234], [225, 4304], [275, 8170], [325, 21887], [350, 33568],
];

function skillId(def: ResourceGeneratorDef): number {
    if (def.skill == "mining") return 186;
    if (def.skill == "herbalism") return 182;
    if (def.skill == "fishing") return 356;
    return WOODCUTTING_SKILL;
}

function gatherSkill(player: TSPlayer, def: ResourceGeneratorDef): number {
    const id = skillId(def);
    return player.HasSkill(id) ? Number(player.GetSkillValue(id)) : 0;
}

function requireGatherSkill(player: TSPlayer, def: ResourceGeneratorDef): boolean {
    const value = gatherSkill(player, def);
    if (value >= def.requiredSkill) return true;
    player.SendBroadcastMessage(baseText(
        player,
        `Gathering “${def.nameEn}” requires skill ${def.requiredSkill}; current skill is ${value}.`,
        `Для добычи «${def.nameRu}» требуется навык ${def.requiredSkill}; сейчас ${value}.`,
    ));
    return false;
}

function ownedGeneratorRow(player: TSPlayer, object: TSGameObject): BaseBuilding | undefined {
    let exact: BaseBuilding | undefined = undefined;
    let fallback: BaseBuilding | undefined = undefined;
    let fallbackCount = 0;
    const guid = Number(object.GetGUIDLow());
    BaseBuilding.get(player).forEach(row => {
        if (exact || !resourceGeneratorByKey(row.catKey) || row.mapId != object.GetMapID()) return;
        if (row.entry != object.GetEntry()) return;
        if (Number(row.spawnGuid) == guid) {
            exact = row;
            return;
        }
        // Coordinate matching is only a migration fallback for a single stale
        // legacy row. Multiple same-entry generators may intentionally overlap.
        if (dist2(row.x, row.y, object.GetX(), object.GetY()) <= 1.0) {
            fallback = row;
            fallbackCount++;
        }
    });
    return exact || (fallbackCount == 1 ? fallback : undefined);
}

function secondsUntilReady(
    player: TSPlayer,
    row: BaseBuilding,
    def: ResourceGeneratorDef,
    now: number,
): number {
    const last = normTime(Number(row.lastHarvest));
    const period = effectiveWorkerPeriod(def.periodS, workerForGenerator(player, row.buildingId));
    // Rows created by the old mine/garden implementation may have no stamp.
    // Treat them as ready once instead of resetting a full period every check.
    if (last <= 0) return 0;
    if (last > now) return period;
    return Math.max(0, last + period - now);
}

function weightedYield(): number {
    let totalWeight = 0;
    for (let i = 0; i < RESOURCE_GENERATOR_YIELDS.length; i++) {
        totalWeight += RESOURCE_GENERATOR_YIELDS[i].weight;
    }
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < RESOURCE_GENERATOR_YIELDS.length; i++) {
        roll -= RESOURCE_GENERATOR_YIELDS[i].weight;
        if (roll < 0) return RESOURCE_GENERATOR_YIELDS[i].count;
    }
    return RESOURCE_GENERATOR_YIELDS[RESOURCE_GENERATOR_YIELDS.length - 1].count;
}

function salvageOutput(maxRequiredSkill: number): number {
    const candidates: number[] = [];
    for (let i = 0; i < RESOURCE_GENERATORS.length; i++) {
        const def = RESOURCE_GENERATORS[i];
        if (def.category == "fish" || def.category == "junk" || def.output.entry <= 0) continue;
        if (def.requiredSkill <= maxRequiredSkill) candidates.push(def.output.entry);
    }
    for (let i = 0; i < SALVAGE_CLOTH.length; i++) {
        if (SALVAGE_CLOTH[i][0] <= maxRequiredSkill) candidates.push(SALVAGE_CLOTH[i][1]);
    }
    for (let i = 0; i < SALVAGE_LEATHER.length; i++) {
        if (SALVAGE_LEATHER[i][0] <= maxRequiredSkill) candidates.push(SALVAGE_LEATHER[i][1]);
    }
    return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : 6291;
}

interface HarvestRoll {
    item: number;
    baseCount: number;
    masteryCount: number;
    total: number;
    doubled: boolean;
    workerCount: number;
}

function rollHarvest(player: TSPlayer, row: BaseBuilding, def: ResourceGeneratorDef, now: number): HarvestRoll {
    const last = normTime(Number(row.lastHarvest));
    const worker = workerForGenerator(player, row.buildingId);
    const doubled = last > 0 && now - last >= effectiveWorkerPeriod(def.doubleReadyS, worker);
    const baseCount = weightedYield() * (doubled ? 2 : 1);
    const workerCount = workerBonusOutput(worker) ? 1 : 0;
    const item = def.outputPool == "junk"
        ? salvageOutput(def.requiredSkill)
        : def.output.entry;
    const masteryBps = Number(player.GetUInt("custom-stats:mastery-bps", 0));
    let masteryCount = 0;
    for (let i = 0; i < baseCount; i++) {
        masteryCount += masteryExtraCopy(masteryBps, Math.random());
    }
    return {
        item: item,
        baseCount: baseCount,
        masteryCount: masteryCount,
        total: baseCount + masteryCount + workerCount,
        doubled: doubled,
        workerCount: workerCount,
    };
}

export function clearResourceGeneratorReadyEffect(player: TSPlayer, row: BaseBuilding): void {
    if (row.readyEffectGuid == 0) return;
    removeStoredGameObject(
        player,
        row.readyEffectGuid,
        READY_EFFECT_ENTRY,
        row.x,
        row.y,
        row.mapId,
    );
    row.readyEffectGuid = 0;
    row.MarkDirty();
}

function consumeGeneratorReadiness(player: TSPlayer, row: BaseBuilding, now: number): void {
    row.lastHarvest = now;
    clearResourceGeneratorReadyEffect(player, row);
    row.MarkDirty();
    BaseBuilding.get(player).Save();
}

function completeHarvest(player: TSPlayer, row: BaseBuilding, roll: HarvestRoll, now: number): void {
    consumeGeneratorReadiness(player, row, now);
    awardWorkerServiceXP(player, workerForGenerator(player, row.buildingId), 2);
    const name = localizedTemplateNames.item(player, roll.item);
    const doubled = roll.doubled ? baseText(player, " Long waiting doubled the base yield.", " Долгое ожидание удвоило базовую добычу.") : "";
    const mastery = roll.masteryCount > 0 ? baseText(player, ` Mastery: +${roll.masteryCount}.`, ` Мастерство: +${roll.masteryCount}.`) : "";
    const worker = roll.workerCount > 0 ? baseText(player, ` Worker: +${roll.workerCount}.`, ` Работник: +${roll.workerCount}.`) : "";
    player.SendBroadcastMessage(baseText(player, `Gathered: ${name} x${roll.total}.`, `Добыто: ${name} x${roll.total}.`) + doubled + mastery + worker);
}

function grantDirectHarvest(player: TSPlayer, row: BaseBuilding, def: ResourceGeneratorDef): void {
    const now = nowUnix();
    const wait = secondsUntilReady(player, row, def, now);
    if (wait > 0) {
        player.SendBroadcastMessage(baseText(player, `The resource is not ready yet. About ${Math.ceil(wait / 60)} min remaining.`, `Ресурс ещё не готов. Осталось около ${Math.ceil(wait / 60)} мин.`));
        return;
    }
    if (!requireGatherSkill(player, def)) return;
    const roll = rollHarvest(player, row, def, now);
    if (roll.item <= 0) {
        player.SendBroadcastMessage(baseText(player, "The generator resource is unresolved. Run build data first.", "Ресурс генератора не разрешён. Сначала выполните build data."));
        return;
    }

    const before = Number(player.GetItemCount(roll.item, false));
    player.AddItem(roll.item, roll.total);
    const added = Math.max(0, Number(player.GetItemCount(roll.item, false)) - before);
    if (added != roll.total) {
        const rolledBack = added > 0 ? removeCarriedItems(player, roll.item, added) : 0;
        if (rolledBack != added) {
            consumeGeneratorReadiness(player, row, now);
            player.SendBroadcastMessage(baseText(
                player,
                `The partial harvest could not be fully rolled back; ${added - rolledBack} remained and readiness was consumed.`,
                `Частичная добыча не смогла полностью откатиться; оставлено ${added - rolledBack}, готовность израсходована.`,
            ));
            return;
        }
        player.SendBroadcastMessage(baseText(player, "Free space in your bags; the harvest remains in the generator.", "Освободите место в сумках: добыча осталась в генераторе."));
        return;
    }
    completeHarvest(player, row, roll, now);
}

function startGather(object: TSGameObject, player: TSPlayer): void {
    const row = ownedGeneratorRow(player, object);
    if (!row) {
        player.SendBroadcastMessage(baseText(player, "Only the generator's owner can gather here.", "Добывать здесь может только владелец генератора."));
        return;
    }
    const def = resourceGeneratorByKey(row.catKey);
    if (!def || def.nativeFishing) return;
    const wait = secondsUntilReady(player, row, def, nowUnix());
    if (wait > 0) {
        player.SendBroadcastMessage(baseText(player, `The resource is not ready yet. About ${Math.ceil(wait / 60)} min remaining.`, `Ресурс ещё не готов. Осталось около ${Math.ceil(wait / 60)} мин.`));
        return;
    }
    if (!requireGatherSkill(player, def)) return;
    if (Number(player.GetDistance(object)) > GENERATOR_USE_RANGE) {
        player.SendBroadcastMessage(baseText(player, "Move closer to the generator.", "Подойдите ближе к генератору."));
        return;
    }
    if (player.IsCasting()) {
        player.SendBroadcastMessage(baseText(player, "Finish your current action first.", "Сначала завершите текущее действие."));
        return;
    }
    player.CastSpell(object, GATHER_SPELL, false);
}

function readyFishingGeneratorNear(player: TSPlayer, bobber: TSGameObject): BaseBuilding | undefined {
    const now = nowUnix();
    const range2 = FISHING_CAPTURE_RANGE * FISHING_CAPTURE_RANGE;
    let selected: BaseBuilding | undefined = undefined;
    let bestDistance2 = range2 + 1;
    BaseBuilding.get(player).forEach(row => {
        const def = resourceGeneratorByKey(row.catKey);
        if (!def || !def.nativeFishing || row.mapId != bobber.GetMapID()) return;
        if (secondsUntilReady(player, row, def, now) != 0 || gatherSkill(player, def) < def.requiredSkill) return;
        const distance2 = dist2(row.x, row.y, bobber.GetX(), bobber.GetY());
        if (distance2 <= range2 && distance2 < bestDistance2) {
            selected = row;
            bestDistance2 = distance2;
        }
    });
    return selected;
}

function harvestFishingHole(
    row: BaseBuilding,
    player: TSPlayer,
    loot: TSLoot,
): void {
    const def = resourceGeneratorByKey(row.catKey);
    if (!def || !def.nativeFishing) return;
    const now = nowUnix();
    const wait = secondsUntilReady(player, row, def, now);
    if (wait > 0) return;
    if (!requireGatherSkill(player, def)) return;
    const roll = rollHarvest(player, row, def, now);
    if (roll.item <= 0) {
        player.SendBroadcastMessage(baseText(player, "The fishing-hole loot table is unresolved. Run build data first.", "Таблица добычи лунки не разрешена. Сначала выполните build data."));
        return;
    }
    // This callback is reached only after a successful normal fishing cast.
    // Replace its zone loot and start the cooldown only after the whole custom
    // stack was placed in bags.
    loot.SetGeneratesNormally(false);
    loot.Clear();
    const before = Number(player.GetItemCount(roll.item, false));
    player.AddItem(roll.item, roll.total);
    const added = Math.max(0, Number(player.GetItemCount(roll.item, false)) - before);
    if (added != roll.total) {
        const rolledBack = added > 0 ? removeCarriedItems(player, roll.item, added) : 0;
        if (rolledBack != added) {
            consumeGeneratorReadiness(player, row, now);
            player.SendBroadcastMessage(baseText(
                player,
                `The partial harvest could not be fully rolled back; ${added - rolledBack} remained and readiness was consumed.`,
                `Частичная добыча не смогла полностью откатиться; оставлено ${added - rolledBack}, готовность израсходована.`,
            ));
            return;
        }
        player.SendBroadcastMessage(baseText(player, "Free space in your bags; the harvest remains in the fishing hole.", "Освободите место в сумках: добыча осталась в лунке."));
        return;
    }
    completeHarvest(player, row, roll, now);
}

function syncReadyEffects(player: TSPlayer): void {
    if (!player.IsInWorld()) return;
    const now = nowUnix();
    let changed = false;
    BaseBuilding.get(player).forEach(row => {
        const def = resourceGeneratorByKey(row.catKey);
        if (!def || row.mapId != player.GetMapID()) return;
        const ready = secondsUntilReady(player, row, def, now) == 0;
        const live = row.readyEffectGuid == 0
            ? undefined
            : liveGameObject(player, row.readyEffectGuid, READY_EFFECT_ENTRY);
        const ownLive = live && dist2(live.GetX(), live.GetY(), row.x, row.y) <= 1.0
            ? live
            : undefined;
        if (ready && !ownLive) {
            const effect = spawnDecorativeVisible(
                player,
                READY_EFFECT_ENTRY,
                row.x,
                row.y,
                row.z + READY_EFFECT_Z_OFFSET,
                row.o,
                row.phaseMask,
            );
            if (effect) {
                effect.SetFlag(GameObjectFields.GAMEOBJECT_FLAGS, READY_EFFECT_FLAGS);
                row.readyEffectGuid = effect.GetGUIDLow();
                row.MarkDirty();
                changed = true;
            }
        } else if (!ready && row.readyEffectGuid != 0) {
            clearResourceGeneratorReadyEffect(player, row);
            changed = true;
        }
    });
    if (changed) BaseBuilding.get(player).Save();
}

export function RegisterResourceGenerators(events: TSEvents): void {
    for (let i = 0; i < RESOURCE_GENERATORS.length; i++) {
        const def = RESOURCE_GENERATORS[i];
        if (!def.nativeFishing) {
            events.GameObject.OnGossipHello(def.entry, (object, player, cancel) => {
                cancel.set(true);
                startGather(object, player);
            });
        }
    }

    // The object passed here is the player's bobber. Inert pool markers do not
    // hijack other players' fishing; only a ready generator owned by this
    // player and close to the bobber replaces the normal zone loot.
    events.GameObject.OnGenerateFishLoot((bobber, player, loot, isJunk) => {
        const row = readyFishingGeneratorNear(player, bobber);
        if (row) harvestFishingHole(row, player, loot);
    });

    // Saved pre-redesign generators remain usable as exact copper/peacebloom generators.
    events.GameObject.OnGossipHello(GO_MINE_ENTRY, (object, player, cancel) => {
        cancel.set(true);
        startGather(object, player);
    });
    events.GameObject.OnGossipHello(GO_GARDEN_ENTRY, (object, player, cancel) => {
        cancel.set(true);
        startGather(object, player);
    });

    events.Spell.OnAfterCast(GATHER_SPELL, (spell, cancel) => {
        const player = spell.GetCaster().ToPlayer();
        const object = spell.GetTarget().ToGameObject();
        if (!player || !object) return;
        const row = ownedGeneratorRow(player, object);
        if (!row) return;
        const def = resourceGeneratorByKey(row.catKey);
        if (!def || def.nativeFishing) return;
        grantDirectHarvest(player, row, def);
    });

    events.Player.OnLogin((player, firstLogin) => {
        player.AddTimer(6000, 1, (owner, timer) => {
            const active = owner.ToPlayer();
            if (active) syncReadyEffects(active);
        });
        player.AddTimer(EFFECT_TIMER_MS, EFFECT_TIMER_LOOPS, (owner, timer) => {
            const active = owner.ToPlayer();
            if (active) syncReadyEffects(active);
        });
    });
}
