/**
 * Random field enemies built from the ability-gem catalog:
 * - 25% receive one safe, level-appropriate native damage-proc aura;
 * - 1% become 300%-speed/300%-damage Overloaded enemies with x3 rewards;
 * - ordinary enemies can become Franken-rares, summon a revenge pack, or
 *   release a fleeing goblin carrying an Echo crystal and scaled money.
 */

import {
    ESCAPED_LOOT_CHANCE_PERCENT,
    FRANKEN_HEALTH_MULTIPLIER,
    FRANKEN_RARE_CHANCE_PERCENT,
    FRANKEN_SCALE,
    OVERLOADED_CHANCE_PERCENT,
    OVERLOADED_REWARD_MULTIPLIER,
    RANDOM_PROC_ASSIGN_CHANCE_PERCENT,
    REVENGE_CHAMPION_HEALTH_MULTIPLIER,
    REVENGE_CHAMPION_SCALE,
    REVENGE_MAX_KILLS,
    REVENGE_MIN_KILLS,
    SPECIAL_REWARD_MULTIPLIER,
    canUseRandomMobProcSpell,
    isUnsafeRandomMobAbilityEffect,
    multiplyCapped,
    rollPercent,
} from "../shared/RandomMobRules";
import { isRussian, localizedCreatureName, playerText } from "./localization";

const UINT32_MAX = 0xffffffff;
const MAX_ABILITY_LEVEL = 80;
const ESCAPED_LOOT_DESPAWN_MS = 60000;
const ESCAPED_LOOT_FLEE_MS = 45000;

const STATE_PREFIX = "gem-abilities:random-mob:";
const ROLLED_KEY = STATE_PREFIX + "rolled";
const PROC_AURA_ONE_KEY = STATE_PREFIX + "proc-aura-1";
const PROC_AURA_TWO_KEY = STATE_PREFIX + "proc-aura-2";
const REWARD_MULTIPLIER_KEY = STATE_PREFIX + "reward-multiplier";
const EVENT_KIND_KEY = STATE_PREFIX + "event-kind";
const BASE_SCALE_KEY = STATE_PREFIX + "base-scale";
const SCALE_FACTOR_KEY = STATE_PREFIX + "scale-factor";
const BASE_HEALTH_KEY = STATE_PREFIX + "base-health";
const HEALTH_FACTOR_KEY = STATE_PREFIX + "health-factor";

const REVENGE_SPECIES_KEY = STATE_PREFIX + "revenge-species";
const REVENGE_KILLS_KEY = STATE_PREFIX + "revenge-kills";
const REVENGE_THRESHOLD_KEY = STATE_PREFIX + "revenge-threshold";

const EVENT_NONE = 0;
const EVENT_ESCAPED_LOOT = 1;
const EVENT_REVENGE_CHAMPION = 2;
const EVENT_REVENGE_REINFORCEMENT = 3;

const EFFECT_INDICES: SpellEffIndex[] = [
    SpellEffIndex.EFFECT_0,
    SpellEffIndex.EFFECT_1,
    SpellEffIndex.EFFECT_2,
];

const FRANKEN_SIZES: string[] = [
    "Карманный", "Неприлично огромный", "Слегка квадратный",
    "Подозрительно пушистый", "Чересчур нарядный", "Почти легендарный",
];
const FRANKEN_SIZES_EN: string[] = [
    "Pocket-sized", "Indecently huge", "Slightly square",
    "Suspiciously fluffy", "Excessively fancy", "Almost legendary",
];
const FRANKEN_TEMPERS: string[] = [
    "яростный", "чихающе-грозный", "обиженный", "невыспавшийся",
    "театральный", "хаотически воспитанный",
];
const FRANKEN_TEMPERS_EN: string[] = [
    "furious", "sneeze-menacing", "offended", "sleep-deprived",
    "theatrical", "chaotically well-mannered",
];
const FRANKEN_JOBS: string[] = [
    "некромант", "бухгалтер", "коллекционер сапог", "повелитель ложек",
    "дрессировщик слизней", "заместитель финального босса",
];
const FRANKEN_JOBS_EN: string[] = [
    "necromancer", "accountant", "boot collector", "lord of spoons",
    "slime trainer", "deputy final boss",
];

class ProcRankChoice {
    auraId: uint32 = 0;
    spellId: uint32 = 0;
    requiredLevel: uint32 = 0;
    rank: uint8 = 0;
    ranked: boolean = false;
}

class ProcChain {
    rootId: uint32 = 0;
    choices: TSArray<ProcRankChoice> = [];
}

const procChains: TSArray<ProcChain> = [];
let overloadedAuraId: uint32 = 0;
let escapedLootEntry: uint32 = 0;
let escapedLootRewardItemId: uint32 = 0;

function randomIntInclusive(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function requiredSpellLevel(info: TSSpellInfo): number {
    const spellLevel = Number(info.GetSpellLevel());
    return spellLevel > 0 ? spellLevel : Number(info.GetBaseLevel());
}

/** Canonical identity shared by every rank-specific gem and proc driver. */
function rankedSpellRoot(spellId: number): number {
    if (spellId <= 0) return 0;
    const source = GetSpellInfo(spellId);
    if (source === undefined) return 0;
    if (!source.IsRanked()) return Number(source.GetEntry());
    const first: TSSpellInfo | undefined = source.GetFirstRankSpell();
    if (first !== undefined) return Number(first.GetEntry());

    let current: TSSpellInfo | undefined = source;
    for (let guard = 0; guard < 64 && current !== undefined; guard++) {
        const previous: TSSpellInfo | undefined = current.GetPrevRankSpell();
        if (previous === undefined
            || Number(previous.GetEntry()) == Number(current.GetEntry())) break;
        current = previous;
    }
    return current === undefined ? Number(source.GetEntry()) : Number(current.GetEntry());
}

function safeProcPayload(info: TSSpellInfo): boolean {
    let hasEffect = false;
    let unsafe = false;
    let comboScaled = false;
    for (let i = 0; i < EFFECT_INDICES.length; i++) {
        const effect = info.GetEffect(EFFECT_INDICES[i]);
        if (!effect.IsEffect()) continue;
        hasEffect = true;
        if (Number(effect.GetPointsPerComboPoint()) != 0) comboScaled = true;
        if (isUnsafeRandomMobAbilityEffect(
            Number(effect.GetType()),
            Number(effect.GetAura()),
        )) unsafe = true;
    }
    return canUseRandomMobProcSpell(
        Number(info.GetAttributes()),
        Number(info.GetAttributesCu()),
        Number(info.GetExplicitTargetMask()),
        hasEffect,
        unsafe,
        comboScaled,
    );
}

function prepareProcChains(): void {
    const auraIds: number[] = TAG("gem-abilities", "spell/random-mob-damage-proc");
    const chainByRoot: { [rootId: number]: ProcChain } = {};
    for (let i = 0; i < auraIds.length; i++) {
        const auraInfo = GetSpellInfo(auraIds[i]);
        if (auraInfo === undefined) continue;
        const payloadId = Number(
            auraInfo.GetEffect(SpellEffIndex.EFFECT_0).GetTriggerSpell(),
        );
        const payload = GetSpellInfo(payloadId);
        if (payload === undefined || !safeProcPayload(payload)) continue;

        const rootId = rankedSpellRoot(payloadId);
        if (rootId <= 0) continue;
        let chain = chainByRoot[rootId];
        if (chain === undefined) {
            chain = new ProcChain();
            chain.rootId = rootId as uint32;
            chainByRoot[rootId] = chain;
            procChains.push(chain);
        }
        const choice = new ProcRankChoice();
        choice.auraId = auraIds[i] as uint32;
        choice.spellId = payloadId as uint32;
        choice.requiredLevel = Math.max(0, requiredSpellLevel(payload)) as uint32;
        choice.rank = payload.IsRanked() ? payload.GetRank() : 0;
        choice.ranked = payload.IsRanked();
        chain.choices.push(choice);
    }
    if (procChains.length == 0) {
        throw new Error(
            "gem-abilities random enemies have no safe proc auras; run build data before build scripts",
        );
    }
}

function prepareStaticIds(): void {
    overloadedAuraId = UTAG("gem-abilities", "spell/random-mob-overloaded") as uint32;
    escapedLootEntry = UTAG("gem-abilities", "npc/escaped-loot") as uint32;
    const echoRewards: number[] = TAG("echoes", "item/echo-choice");
    if (echoRewards.length > 0) escapedLootRewardItemId = echoRewards[0] as uint32;
    if (overloadedAuraId == 0 || escapedLootEntry == 0) {
        throw new Error(
            "gem-abilities random-enemy tags are missing; run build data before build scripts",
        );
    }
}

function bestAuraForLevel(chain: ProcChain, requestedLevel: number): number {
    const level = Math.max(1, Math.min(MAX_ABILITY_LEVEL, requestedLevel));
    let bestAura = 0;
    let bestRank = -1;
    let bestRequiredLevel = -1;
    for (let i = 0; i < chain.choices.length; i++) {
        const choice = chain.choices[i];
        const rootFallback = choice.ranked && choice.spellId == chain.rootId;
        const allowed = rootFallback || choice.requiredLevel <= level;
        if (!allowed) continue;
        const strength = choice.ranked ? Number(choice.rank) : Number(choice.requiredLevel);
        const bestStrength = choice.ranked ? bestRank : bestRequiredLevel;
        if (bestAura == 0
            || strength > bestStrength
            || (strength == bestStrength
                && Number(choice.requiredLevel) > bestRequiredLevel)) {
            bestAura = Number(choice.auraId);
            if (choice.ranked) bestRank = strength;
            bestRequiredLevel = Number(choice.requiredLevel);
        }
    }
    return bestAura;
}

/** Uniform by canonical ability, not by number of ranks in its chain. */
function chooseProcAura(level: number, excludedAura: number): number {
    if (procChains.length == 0) return 0;
    const start = Math.floor(Math.random() * procChains.length);
    for (let offset = 0; offset < procChains.length; offset++) {
        const index = (start + offset) % procChains.length;
        const auraId = bestAuraForLevel(procChains[index], level);
        if (auraId > 0 && auraId != excludedAura) return auraId;
    }
    return 0;
}

function ensureProcAuraCount(creature: TSCreature, wanted: number): void {
    let first = Number(creature.GetUInt(PROC_AURA_ONE_KEY, 0));
    let second = Number(creature.GetUInt(PROC_AURA_TWO_KEY, 0));
    if (first > 0 && !creature.HasAura(first)) first = 0;
    if (second > 0 && !creature.HasAura(second)) second = 0;

    if (wanted >= 1 && first == 0) {
        first = chooseProcAura(Number(creature.GetLevel()), second);
        if (first > 0 && creature.AddAura(first, creature) !== undefined) {
            creature.SetUInt(PROC_AURA_ONE_KEY, first as uint32);
        } else {
            first = 0;
        }
    }
    if (wanted >= 2 && second == 0) {
        second = chooseProcAura(Number(creature.GetLevel()), first);
        if (second > 0 && creature.AddAura(second, creature) !== undefined) {
            creature.SetUInt(PROC_AURA_TWO_KEY, second as uint32);
        }
    }
}

function setRewardMultiplierAtLeast(creature: TSCreature, multiplier: number): void {
    const current = Number(creature.GetUInt(REWARD_MULTIPLIER_KEY, 1));
    if (multiplier > current) {
        creature.SetUInt(REWARD_MULTIPLIER_KEY, multiplier as uint32);
    }
}

function setScaleFactorAtLeast(creature: TSCreature, factor: number): void {
    let base = Number(creature.GetFloat(BASE_SCALE_KEY, 0));
    if (base <= 0) {
        base = Number(creature.GetScale());
        creature.SetFloat(BASE_SCALE_KEY, base);
    }
    const current = Number(creature.GetFloat(SCALE_FACTOR_KEY, 1));
    if (factor > current) {
        creature.SetFloat(SCALE_FACTOR_KEY, factor);
        creature.SetScale(base * factor);
    }
}

function setHealthFactorAtLeast(creature: TSCreature, factor: number): void {
    let base = Number(creature.GetUInt(BASE_HEALTH_KEY, 0));
    if (base <= 0) {
        base = Number(creature.GetMaxHealth());
        creature.SetUInt(BASE_HEALTH_KEY, base as uint32);
    }
    const current = Number(creature.GetFloat(HEALTH_FACTOR_KEY, 1));
    if (factor > current) {
        const health = multiplyCapped(base, factor, UINT32_MAX);
        creature.SetFloat(HEALTH_FACTOR_KEY, factor);
        creature.SetMaxHealth(health as uint32);
        creature.SetHealth(health as uint32);
    }
}

function resetSpawnState(creature: TSCreature): void {
    // Temp summons receive their event marker immediately after SpawnCreature,
    // while Trinity fires JustAppeared on their first update. Preserve setup
    // already applied to runners/champions/reinforcements before that update.
    if (Number(creature.GetUInt(EVENT_KIND_KEY, EVENT_NONE)) != EVENT_NONE
        || !coreModifierCandidate(creature)) return;

    const first = Number(creature.GetUInt(PROC_AURA_ONE_KEY, 0));
    const second = Number(creature.GetUInt(PROC_AURA_TWO_KEY, 0));
    if (first > 0) creature.RemoveAura(first);
    if (second > 0) creature.RemoveAura(second);
    if (overloadedAuraId > 0) creature.RemoveAura(overloadedAuraId);

    creature.SetUInt(PROC_AURA_ONE_KEY, 0);
    creature.SetUInt(PROC_AURA_TWO_KEY, 0);
    creature.SetUInt(REWARD_MULTIPLIER_KEY, 1);
    creature.SetUInt(EVENT_KIND_KEY, EVENT_NONE);
    creature.SetBool(ROLLED_KEY, false);

    let baseScale = Number(creature.GetFloat(BASE_SCALE_KEY, 0));
    if (baseScale <= 0) {
        baseScale = Number(creature.GetScale());
        creature.SetFloat(BASE_SCALE_KEY, baseScale);
    }
    creature.SetFloat(SCALE_FACTOR_KEY, 1);
    creature.SetScale(baseScale);

    let baseHealth = Number(creature.GetUInt(BASE_HEALTH_KEY, 0));
    if (baseHealth <= 0) {
        baseHealth = Number(creature.GetMaxHealth());
        creature.SetUInt(BASE_HEALTH_KEY, baseHealth as uint32);
    }
    creature.SetFloat(HEALTH_FACTOR_KEY, 1);
    creature.SetMaxHealth(baseHealth as uint32);
    creature.SetHealth(baseHealth as uint32);
}

function playerBehind(unit: TSUnit): TSPlayer | undefined {
    const direct = unit.ToPlayer();
    if (direct !== undefined) return direct;
    const controller = unit.GetController();
    return controller === undefined ? undefined : controller.ToPlayer();
}

function hasPlayerOwner(creature: TSCreature): boolean {
    const owner = creature.GetOwnerGUID();
    if (!owner.IsEmpty() && owner.IsPlayer()) return true;
    const charmer = creature.GetCharmerGUID();
    return !charmer.IsEmpty() && charmer.IsPlayer();
}

function coreModifierCandidate(creature: TSCreature): boolean {
    const kind = Number(creature.GetUInt(EVENT_KIND_KEY, EVENT_NONE));
    if (kind == EVENT_ESCAPED_LOOT) return false;
    if (creature.IsTrigger() || hasPlayerOwner(creature)) return false;
    if (creature.GetGUID().IsVehicle()) return false;
    return Number(creature.GetTemplate().GetVehicleID()) == 0;
}

/** Conservative subset for extra spawns: core 25%/1% mutations still include
 * bosses and scripted enemies, but world events never clone their scripts. */
function ordinaryEventCandidate(creature: TSCreature): boolean {
    return coreModifierCandidate(creature)
        && Number(creature.GetUInt(EVENT_KIND_KEY, EVENT_NONE)) == EVENT_NONE
        && Number(creature.GetDBTableGUIDLow()) > 0
        && !creature.IsWorldBoss()
        && !creature.IsRacialLeader()
        && Number(creature.GetTemplate().GetScriptID()) == 0
        && creature.GetTemplate().GetAIName() == "";
}

function funnyFrankenTitle(creatureName: string, russian: boolean): string {
    const sizes = russian ? FRANKEN_SIZES : FRANKEN_SIZES_EN;
    const tempers = russian ? FRANKEN_TEMPERS : FRANKEN_TEMPERS_EN;
    const jobs = russian ? FRANKEN_JOBS : FRANKEN_JOBS_EN;
    return sizes[randomIntInclusive(0, sizes.length - 1)] + " "
        + tempers[randomIntInclusive(0, tempers.length - 1)] + " "
        + jobs[randomIntInclusive(0, jobs.length - 1)] + "-"
        + creatureName;
}

function applyFrankenRare(creature: TSCreature, player: TSPlayer): void {
    ensureProcAuraCount(creature, 2);
    setScaleFactorAtLeast(creature, FRANKEN_SCALE);
    setHealthFactorAtLeast(creature, FRANKEN_HEALTH_MULTIPLIER);
    setRewardMultiplierAtLeast(creature, SPECIAL_REWARD_MULTIPLIER);
    const russian = isRussian(player);
    const title = funnyFrankenTitle(localizedCreatureName(player, creature), russian);
    player.SendBroadcastMessage(playerText(
        player,
        "|cffffa000[Franken-rare]|r ‘" + title
            + "’ joins the fight: two random abilities and x2 rewards!",
        "|cffffa000[Франкен-редкий]|r «" + title
            + "» вступает в бой: две случайные способности и награда x2!",
    ));
}

function applyOverloaded(creature: TSCreature, player: TSPlayer): void {
    creature.AddAura(overloadedAuraId, creature);
    setScaleFactorAtLeast(creature, 1.25);
    setRewardMultiplierAtLeast(creature, OVERLOADED_REWARD_MULTIPLIER);
    const name = localizedCreatureName(player, creature);
    player.SendBroadcastMessage(playerText(
        player,
        "|cffff2020[Catastrophic Overload]|r " + name
            + ": 300% attack speed and damage. x3 rewards!",
        "|cffff2020[Катастрофическая перегрузка]|r " + name
            + ": 300% скорости атаки и урона. Награда x3!",
    ));
}

function handleFirstPlayerCombat(creature: TSCreature, target: TSUnit): void {
    if (creature.GetBool(ROLLED_KEY, false)) return;
    const player = playerBehind(target);
    if (player === undefined || player.InBG() || player.InArena()) return;
    if (creature.IsFriendlyTo(player) || player.IsFriendlyTo(creature)) return;
    if (!coreModifierCandidate(creature)) return;

    creature.SetBool(ROLLED_KEY, true);
    if (rollPercent(Math.random(), RANDOM_PROC_ASSIGN_CHANCE_PERCENT)) {
        const previousAura = Number(creature.GetUInt(PROC_AURA_ONE_KEY, 0));
        ensureProcAuraCount(creature, 1);
        if (previousAura == 0
            && Number(creature.GetUInt(PROC_AURA_ONE_KEY, 0)) > 0) {
            const name = localizedCreatureName(player, creature);
            player.SendBroadcastMessage(playerText(
                player,
                "|cffb060ff[Instability]|r " + name
                    + " gained a random ability: every attack may trigger it!",
                "|cffb060ff[Нестабильность]|r " + name
                    + " получил случайную способность: каждый его удар может вызвать её!",
            ));
        }
    }
    if (ordinaryEventCandidate(creature)
        && rollPercent(Math.random(), FRANKEN_RARE_CHANCE_PERCENT)) {
        applyFrankenRare(creature, player);
    }
    if (rollPercent(Math.random(), OVERLOADED_CHANCE_PERCENT)) {
        applyOverloaded(creature, player);
    }
}

function speciesKey(creature: TSCreature): number {
    const family = Number(creature.GetTemplate().GetFamily());
    return family > 0 ? 0x80000000 + family : Number(creature.GetEntry());
}

function configureSummonLevel(summon: TSCreature, level: number): void {
    summon.SetLevel(Math.max(1, Math.min(MAX_ABILITY_LEVEL, level)) as uint8);
    summon.UpdateLevelDependantStats();
}

function spawnRevengePack(player: TSPlayer, killed: TSCreature): void {
    const entry = Number(killed.GetEntry());
    const x = Number(killed.GetX());
    const y = Number(killed.GetY());
    const z = Number(killed.GetZ());
    const o = Number(killed.GetO());
    const level = Number(killed.GetLevel());
    const champion = player.SpawnCreature(
        entry,
        x + 2,
        y,
        z,
        o,
        TempSummonType.TIMED_OR_DEAD_DESPAWN,
        120000,
    );
    if (champion === undefined) return;

    champion.SetUInt(EVENT_KIND_KEY, EVENT_REVENGE_CHAMPION);
    configureSummonLevel(champion, level);
    ensureProcAuraCount(champion, 2);
    setScaleFactorAtLeast(champion, REVENGE_CHAMPION_SCALE);
    setHealthFactorAtLeast(champion, REVENGE_CHAMPION_HEALTH_MULTIPLIER);
    setRewardMultiplierAtLeast(champion, SPECIAL_REWARD_MULTIPLIER);
    champion.SetReactState(ReactStates.AGGRESSIVE);

    for (let i = 0; i < 2; i++) {
        const angle = o + (i == 0 ? 2.1 : -2.1);
        const reinforcement = player.SpawnCreature(
            entry,
            x + Math.cos(angle) * 3,
            y + Math.sin(angle) * 3,
            z,
            o,
            TempSummonType.TIMED_OR_DEAD_DESPAWN,
            120000,
        );
        if (reinforcement !== undefined) {
            reinforcement.SetUInt(EVENT_KIND_KEY, EVENT_REVENGE_REINFORCEMENT);
            configureSummonLevel(reinforcement, level);
            reinforcement.SetReactState(ReactStates.AGGRESSIVE);
            reinforcement.AttackStart(player);
        }
    }

    const name = localizedCreatureName(player, killed);
    player.SendBroadcastMessage(playerText(
        player,
        "|cffff6020[Species Revenge]|r " + name
            + " will tolerate this no longer: a champion has arrived with reinforcements!",
        "|cffff6020[Месть вида]|r " + name
            + " больше не намерены это терпеть: прибыл чемпион с подкреплением!",
    ));
    champion.AttackStart(player);
}

function handleSpeciesKill(player: TSPlayer, killed: TSCreature): void {
    if (player.InBG() || player.InArena() || !ordinaryEventCandidate(killed)) return;
    if (killed.IsFriendlyTo(player) || player.IsFriendlyTo(killed)) return;

    const key = speciesKey(killed);
    let kills = Number(player.GetUInt(REVENGE_KILLS_KEY, 0));
    let threshold = Number(player.GetUInt(REVENGE_THRESHOLD_KEY, 0));
    if (Number(player.GetUInt(REVENGE_SPECIES_KEY, 0)) != key) {
        player.SetUInt(REVENGE_SPECIES_KEY, key as uint32);
        kills = 0;
        threshold = randomIntInclusive(REVENGE_MIN_KILLS, REVENGE_MAX_KILLS);
        player.SetUInt(REVENGE_THRESHOLD_KEY, threshold as uint32);
    }

    kills++;
    player.SetUInt(REVENGE_KILLS_KEY, kills as uint32);
    if (kills < threshold) return;

    player.SetUInt(REVENGE_SPECIES_KEY, 0);
    player.SetUInt(REVENGE_KILLS_KEY, 0);
    player.SetUInt(REVENGE_THRESHOLD_KEY, 0);
    spawnRevengePack(player, killed);
}

function spawnEscapedLoot(killed: TSCreature, killer: TSPlayer): void {
    const runner = killer.SpawnCreature(
        escapedLootEntry,
        Number(killed.GetX()),
        Number(killed.GetY()),
        Number(killed.GetZ()),
        Number(killed.GetO()),
        // Absolute timer keeps running after the runner enters combat, while
        // still leaving its corpse and bonus gem available until expiry.
        TempSummonType.TIMED_DESPAWN,
        ESCAPED_LOOT_DESPAWN_MS,
    );
    if (runner === undefined) return;
    runner.SetUInt(EVENT_KIND_KEY, EVENT_ESCAPED_LOOT);
    runner.SetBool(ROLLED_KEY, true);
    configureSummonLevel(runner, Number(killed.GetLevel()));
    const health = multiplyCapped(
        Number(killed.GetMaxHealth()),
        0.35,
        UINT32_MAX,
    );
    runner.SetMaxHealth(Math.max(1, health) as uint32);
    runner.SetHealth(Math.max(1, health) as uint32);
    runner.SetFaction(14);
    runner.SetReactState(ReactStates.PASSIVE);
    runner.SetSpeed(UnitMoveType.RUN, 1.65, true);
    runner.MoveFleeing(killer, ESCAPED_LOOT_FLEE_MS);
    killer.SendBroadcastMessage(playerText(
        killer,
        "|cff40ff40[Escaped Loot]|r A goblin jumped out of the corpse carrying an Echo crystal and a purse!",
        "|cff40ff40[Сбежавшая добыча]|r Из трупа выскочил гоблин с кристаллом Эхо и кошельком!",
    ));
}

function addEscapedLootReward(creature: TSCreature, killer: TSPlayer | undefined): void {
    const loot = creature.GetLoot();
    if (loot.GetLootOwnerGUID().IsEmpty()) {
        const recipient = creature.GetLootRecipient();
        if (recipient !== undefined) loot.SetLootOwner(recipient.GetGUID());
        else if (killer !== undefined) loot.SetLootOwner(killer.GetGUID());
    }
    loot.SetMoney(multiplyCapped(
        Number(creature.GetLevel()),
        1000,
        UINT32_MAX,
    ) as uint32);
    if (escapedLootRewardItemId > 0) {
        loot.AddItem(escapedLootRewardItemId, 1, 1, 0, false, 0);
    }
}

/** Multiply normal resolved loot without duplicating quest-only entries or
 * violating unique-count/stack limits. Money and kill XP are handled too. */
function multiplyCreatureLoot(creature: TSCreature, multiplier: number): void {
    if (multiplier <= 1) return;
    const loot = creature.GetLoot();
    loot.SetMoney(multiplyCapped(
        Number(loot.GetMoney()),
        multiplier,
        UINT32_MAX,
    ) as uint32);

    const itemCount = Number(loot.GetItemCount());
    for (let i = 0; i < itemCount; i++) {
        const item = loot.GetItem(i as uint32);
        const template = item.GetTemplate();
        const originalCount = Number(item.GetCount());
        let total = multiplyCapped(originalCount, multiplier, UINT32_MAX);
        const uniqueLimit = Number(template.GetMaxCount());
        if (uniqueLimit > 0) total = Math.min(total, uniqueLimit);
        // LootItem::count is uint8. CanStoreNewItem later splits this count
        // across inventory slots while preserving the original DB conditions,
        // group-roll metadata and random property on this exact loot row.
        item.SetCount(Math.min(255, total) as uint8);
    }
}

function handleGeneratedLoot(creature: TSCreature, killer: TSPlayer | undefined): void {
    const kind = Number(creature.GetUInt(EVENT_KIND_KEY, EVENT_NONE));
    if (kind == EVENT_ESCAPED_LOOT) {
        addEscapedLootReward(creature, killer);
        return;
    }

    if (killer !== undefined
        && ordinaryEventCandidate(creature)
        && rollPercent(Math.random(), ESCAPED_LOOT_CHANCE_PERCENT)) {
        spawnEscapedLoot(creature, killer);
    }
    multiplyCreatureLoot(
        creature,
        Number(creature.GetUInt(REWARD_MULTIPLIER_KEY, 1)),
    );
}

export function RegisterRandomMobs(events: TSEvents): void {
    prepareStaticIds();
    prepareProcChains();

    events.Creature.OnJustAppeared(resetSpawnState);
    events.Creature.OnJustEnteredCombat(handleFirstPlayerCombat);
    events.Creature.OnGenerateLoot(handleGeneratedLoot);
    events.Player.OnCreatureKill(handleSpeciesKill);
    events.Player.OnGiveXP((player, amount, victim) => {
        if (victim === undefined) return; // quest/exploration XP has no victim
        const creature = victim.ToCreature();
        if (creature === undefined) return;
        const kind = Number(creature.GetUInt(EVENT_KIND_KEY, EVENT_NONE));
        if (kind == EVENT_ESCAPED_LOOT) {
            amount.set(0);
            return;
        }
        const multiplier = Number(creature.GetUInt(REWARD_MULTIPLIER_KEY, 1));
        if (multiplier > 1) {
            amount.set(multiplyCapped(
                Number(amount.get()),
                multiplier,
                UINT32_MAX,
            ) as uint32);
        }
    });
}
