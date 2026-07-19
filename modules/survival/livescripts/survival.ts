/**
 * Survival logic: hunger & thirst deplete over time; every eight uninterrupted
 * seconds of FOOD/DRINK restore the matching bar by an amount scaled to the
 * item's level vs the character's level; running empty applies starvation or
 * dehydration (thirst) drain. State is pushed to the client for the UI (only
 * after the client asks first — client-extension ready-flag pattern).
 */

import { OP_SURVIVAL_REQUEST, SurvivalState } from "../shared/SurvivalMessages";
import { SurvivalData } from "./survival-db";

// tuning
const DEPLETE_INTERVAL = 30000;  // ms per tick
const REPEATING_TIMER_LOOPS = 0x0fffffff;
const HUNGER_PER_TICK = 2;
const THIRST_PER_TICK = 3;       // thirst drops a bit faster
const MIN_RESTORE = 5;           // a too-low-level item still gives a little
const STARVE_FRACTION = 0.02;    // max-health fraction drained per empty-hunger tick
const DEHYDRATE_FRACTION = 0.03; // max-health fraction drained per empty-thirst tick
const PRESSURE_THRESHOLD = 50;   // first progressive debuff stack
const WARN_THRESHOLD = 25;       // one-shot warning when a bar first drops below this

function tr(player: TSPlayer, english: string, russian: string): string {
    return Number(player.GetDbcLocale ? player.GetDbcLocale() : 8) == 8 ? russian : english;
}

// context multipliers: fighting is hungry work, resting at an inn barely burns anything
const COMBAT_MULT = 2;
const RESTING_MULT = 0.25;
const HOT_ZONE_THIRST_MULT = 1.75;

// UpdateFields.h: PLAYER_FLAGS = OBJECT_END(0x6) + 0x8E (UNIT_END) + 0x2 = 150
const PLAYER_FLAGS = 150;
const PLAYER_FLAGS_RESTING = 0x20;

// base-building integration: the "Кров" aura near your own base housing counts
// as resting; clicking the water barrel / stew cauldron buildings restores the
// bars. UTAG resolves at build time; GO entries duplicated from
// base-building/shared/BaseCatalog.ts (GO templates have no tags).
const SHELTER_BUFF_SPELL = UTAG("base-building", "base-shelter-buff");
const HEARTH_BUFF_SPELL = UTAG("base-building", "base-hearth-buff");
const GO_WATER_ENTRY = 2131;
const GO_FOOD_ENTRY = 2148;
const SOURCE_RESTORE = 50;      // bar points per use
const SOURCE_COOLDOWN_S = 60;

// freezing: stacks build up in cold zones unless warmed (own campfire aura,
// resting in a tavern/city). At max stacks health drains every tick.
const FREEZE_MAX_STACKS = 10;
const FREEZE_WARM_RATE = 3;      // stacks removed per tick while warm
const FREEZE_DRAIN_FRACTION = 0.03;
const COLD_ZONES: { [zone: number]: boolean } = {
    1: true,    // Dun Morogh
    618: true,  // Winterspring
    65: true,   // Dragonblight
    66: true,   // Zul'Drak
    67: true,   // Storm Peaks
    210: true,  // Icecrown
    394: true,  // Grizzly Hills
    495: true,  // Howling Fjord
    2817: true, // Crystalsong Forest
    3537: true, // Borean Tundra
    4197: true, // Wintergrasp
};

// deserts & volcanic zones drain thirst faster (wotlk zone ids); plain object,
// NOT CreateDictionary (broken in the lua backend)
const HOT_ZONES: { [zone: number]: boolean } = {
    3: true,    // Badlands
    8: true,    // Blasted Lands
    14: true,   // Durotar
    46: true,   // Burning Steppes
    51: true,   // Searing Gorge
    400: true,  // Thousand Needles
    405: true,  // Desolace
    440: true,  // Tanaris
    490: true,  // Un'Goro Crater
    1377: true, // Silithus
    3483: true, // Hellfire Peninsula
};

// Item.OnUse is not fired by this core, so food/drink is identified from the
// successful spell. Aura 84/85 alone is insufficient: many combat regen buffs
// use it too. Real consumables also share these interrupt/attribute flags.
const AURA_FOOD = 84;
const AURA_DRINK = 85;
// ponytail: verified WotLK food/drink allow-list; add a signature only when a
// real custom consumable demonstrably uses different interruption flags.
const CONSUMABLE_ATTRIBUTE = 0x10000000;
const CONSUMABLE_INTERRUPT_FLAGS = 0x1;
const CONSUMABLE_AURA_INTERRUPT_STANDARD = 0x40080;
const CONSUMABLE_AURA_INTERRUPT_UNDERWATER = 0x10d;
const CONSUMABLE_AURA_INTERRUPT_IMMOBILE = 0x2;
const CONSUME_DELAY_MS = 8000;
const CONSUME_TIMER = "survival-consume";
const KIND_NONE = 0;
const KIND_FOOD = 1;
const KIND_DRINK = 2;

let STARVING_SPELL = 0;
let DEHYDRATED_SPELL = 0;
let HUNGRY_SPELL = 0;
let THIRSTY_SPELL = 0;
let FREEZING_SPELL = 0;
let WELL_FED_SPELL = 0;

export function initSurvivalSpells(): void {
    HUNGRY_SPELL = GetID("Spell", "survival", "hungry");
    THIRSTY_SPELL = GetID("Spell", "survival", "thirsty");
    STARVING_SPELL = GetID("Spell", "survival", "starving");
    DEHYDRATED_SPELL = GetID("Spell", "survival", "dehydrated");
    FREEZING_SPELL = GetID("Spell", "survival", "freezing");
    WELL_FED_SPELL = GetID("Spell", "survival", "well-fed");
}

// «Сытый и довольный»: обе шкалы выше порога → +статы (аура рефрешится тиком)
const WELL_FED_THRESHOLD = 75;

// походный костёр: расходник, выдаётся новым персонажам
const CAMP_ITEM_ID = UTAG("survival", "camp-item");
const CAMP_ITEM_START_COUNT = 5;

// готовка: мясо падает со зверей, котёл на базе варит из него похлёбку
const MEAT_ITEM_ID = UTAG("survival", "raw-meat");
const STEW_ITEM_ID = UTAG("survival", "stew-item");
const MEAT_DROP_CHANCE = 0.6;
const CREATURE_TYPE_BEAST = 1;
const COOK_PER_CLICK = 5;

// тепло снимает «Переохлаждение» и у ЛЮБОГО серверного костра (походного,
// кулинарного, лагерного) — не только у своего базового
const WARM_GO_ENTRIES = [29784, 1798, 184724, 184364, 184395, 184396, 181288, 180434];
const WARM_RANGE = 6.0;

function nearWarmFire(player: TSPlayer): boolean {
    for (const entry of WARM_GO_ENTRIES) {
        if (player.GetGameObjectsInRange(WARM_RANGE, entry, 0).length > 0) return true;
    }
    return false;
}

class SurvivalClient {
    ready: boolean = false;
}

function survivalClient(player: TSPlayer): SurvivalClient {
    return player.GetObject('survivalClient', new SurvivalClient());
}

function clamp(v: number): number {
    return v < 0 ? 0 : (v > 100 ? 100 : v);
}

/** 0 healthy, 1 pressured, 2 critical, 3 empty/severe. */
export function survivalStage(value: number): number {
    if (value <= 0) return 3;
    if (value <= WARN_THRESHOLD) return 2;
    if (value <= PRESSURE_THRESHOLD) return 1;
    return 0;
}

/** Bit mask: 1 = food, 2 = drink. */
export function foodDrinkKind(info: TSSpellInfo): number {
    const auraInterrupt = Number(info.GetAuraInterruptFlags());
    if ((Number(info.GetAttributes()) & CONSUMABLE_ATTRIBUTE) == 0
        || (Number(info.GetInterruptFlags()) & CONSUMABLE_INTERRUPT_FLAGS) == 0
        || (auraInterrupt != CONSUMABLE_AURA_INTERRUPT_STANDARD
            && auraInterrupt != CONSUMABLE_AURA_INTERRUPT_UNDERWATER
            && auraInterrupt != CONSUMABLE_AURA_INTERRUPT_IMMOBILE)) {
        return KIND_NONE;
    }
    let kind = KIND_NONE;
    for (let i = 0; i < 3; i++) {
        const aura = info.GetEffect(i as any).GetAura();
        if (aura == AURA_FOOD) kind |= KIND_FOOD;
        if (aura == AURA_DRINK) kind |= KIND_DRINK;
    }
    return kind;
}

/** Restore amount scaled by the food/drink spell level vs the character level. */
function restoreForSpell(player: TSPlayer, info: TSSpellInfo): number {
    let lvl = info.GetSpellLevel();
    if (lvl <= 0) lvl = info.GetBaseLevel();
    const charLevel = player.GetLevel();
    // no usable spell level -> treat as on-level (full-ish)
    const ratio = charLevel > 0 ? (lvl > 0 ? lvl / charLevel : 1) : 1;
    let restore = Math.floor(100 * ratio);
    if (restore < MIN_RESTORE) restore = MIN_RESTORE;
    if (restore > 100) restore = 100;
    return restore;
}

export function sendSurvival(player: TSPlayer): void {
    if (!survivalClient(player).ready) {
        return;
    }
    const d = SurvivalData.get(player);
    const st = new SurvivalState();
    st.hunger = d.hunger;
    st.thirst = d.thirst;
    st.write().SendToPlayer(player);
}

function drain(player: TSPlayer, fraction: number): void {
    const dmg = Math.floor(player.GetMaxHealth() * fraction);
    const cur = player.GetHealth();
    if (dmg > 0 && cur > dmg + 1) {
        player.SetHealth(cur - dmg);
    }
}

function syncPressureAura(player: TSPlayer, spellId: number, stage: number): void {
    if (spellId == 0) return;
    const stacks = stage >= 3 ? 0 : stage;
    const aura = player.GetAura(spellId);
    if (stacks <= 0) {
        if (aura) player.RemoveAura(spellId);
        return;
    }
    if (!aura) {
        const applied = player.AddAura(spellId, player);
        if (applied && stacks > 1) applied.SetStackAmount(stacks);
    } else if (aura.GetStackAmount() != stacks) {
        aura.SetStackAmount(stacks);
    }
}

/** Keep progressive and severe debuff icons in sync with the bars. */
function updateDebuffs(player: TSPlayer, d: SurvivalData): void {
    const hungerStage = survivalStage(d.hunger);
    const thirstStage = survivalStage(d.thirst);
    syncPressureAura(player, HUNGRY_SPELL, hungerStage);
    syncPressureAura(player, THIRSTY_SPELL, thirstStage);

    if (STARVING_SPELL != 0 && hungerStage == 3) {
        if (!player.HasAura(STARVING_SPELL)) {
            player.AddAura(STARVING_SPELL, player);
        }
    } else if (STARVING_SPELL != 0) {
        player.RemoveAura(STARVING_SPELL);
    }
    if (DEHYDRATED_SPELL != 0 && thirstStage == 3) {
        if (!player.HasAura(DEHYDRATED_SPELL)) {
            player.AddAura(DEHYDRATED_SPELL, player);
        }
    } else if (DEHYDRATED_SPELL != 0) {
        player.RemoveAura(DEHYDRATED_SPELL);
    }
}

/** One-shot chat warnings on downward threshold crossings (no per-tick spam). */
function warnCrossings(player: TSPlayer, prevHunger: number, hunger: number,
                       prevThirst: number, thirst: number): void {
    if (prevHunger > PRESSURE_THRESHOLD && hunger <= PRESSURE_THRESHOLD) {
        player.SendBroadcastMessage(tr(player, "|cffffa020Hunger is beginning to weaken you.|r", "|cffffa020Голод начинает ослаблять вас.|r"));
    }
    if (prevHunger > WARN_THRESHOLD && hunger <= WARN_THRESHOLD) {
        player.SendBroadcastMessage(tr(player, "|cffff6020You are starving — eat something.|r", "|cffff6020Вы сильно истощены — пора поесть.|r"));
    }
    if (prevHunger > 0 && hunger <= 0) {
        player.SendBroadcastMessage(tr(player, "|cffff2020You are dying of hunger!|r", "|cffff2020Вы умираете от голода!|r"));
    }
    if (prevThirst > PRESSURE_THRESHOLD && thirst <= PRESSURE_THRESHOLD) {
        player.SendBroadcastMessage(tr(player, "|cff60b8ffThirst is beginning to slow you down.|r", "|cff60b8ffЖажда начинает замедлять вас.|r"));
    }
    if (prevThirst > WARN_THRESHOLD && thirst <= WARN_THRESHOLD) {
        player.SendBroadcastMessage(tr(player, "|cff40a0ffYou are severely dehydrated — drink something.|r", "|cff40a0ffСильное обезвоживание — пора попить.|r"));
    }
    if (prevThirst > 0 && thirst <= 0) {
        player.SendBroadcastMessage(tr(player, "|cff2080ffYou are dying of thirst!|r", "|cff2080ffВы умираете от жажды!|r"));
    }
}

function tick(player: TSPlayer): void {
    const d = SurvivalData.get(player);

    let mult = 1;
    if (player.IsInCombat()) {
        mult = COMBAT_MULT;
    } else if (player.HasFlag(PLAYER_FLAGS, PLAYER_FLAGS_RESTING) || player.HasAura(SHELTER_BUFF_SPELL)) {
        mult = RESTING_MULT; // таверна/город или своя база («Кров»)
    }
    let thirstMult = mult;
    if (HOT_ZONES[player.GetZoneID()]) {
        thirstMult *= HOT_ZONE_THIRST_MULT;
    }

    const prevHunger = d.hunger;
    const prevThirst = d.thirst;
    d.hunger = clamp(d.hunger - HUNGER_PER_TICK * mult);
    d.thirst = clamp(d.thirst - THIRST_PER_TICK * thirstMult);
    d.Save();

    warnCrossings(player, prevHunger, d.hunger, prevThirst, d.thirst);

    // separate exhaustion effects
    if (d.hunger <= 0) {
        drain(player, STARVE_FRACTION);
    }
    if (d.thirst <= 0) {
        drain(player, DEHYDRATE_FRACTION);
    }
    updateDebuffs(player, d);
    updateWellFed(player, d);
    tickFreezing(player);
    sendSurvival(player);
}

/** Позитивная петля: держи обе шкалы >= 75 — получай +статы. */
function updateWellFed(player: TSPlayer, d: SurvivalData): void {
    if (WELL_FED_SPELL == 0) return;
    if (d.hunger >= WELL_FED_THRESHOLD && d.thirst >= WELL_FED_THRESHOLD) {
        player.AddAura(WELL_FED_SPELL, player); // рефреш длительности
    } else if (player.HasAura(WELL_FED_SPELL)) {
        player.RemoveAura(WELL_FED_SPELL);
    }
}

/** Переохлаждение: холодная зона наращивает стаки, тепло снимает их. */
function tickFreezing(player: TSPlayer): void {
    if (FREEZING_SPELL == 0) return;
    const inCold = COLD_ZONES[player.GetZoneID()] !== undefined;
    const warmed = player.HasAura(HEARTH_BUFF_SPELL)
        || player.HasFlag(PLAYER_FLAGS, PLAYER_FLAGS_RESTING)
        || nearWarmFire(player);
    const aura = player.GetAura(FREEZING_SPELL);

    if (inCold && !warmed) {
        if (!aura) {
            player.AddAura(FREEZING_SPELL, player);
            player.SendBroadcastMessage(tr(player, "|cff80ccffYou are starting to freeze — find a fire!|r", "|cff80ccffВы начинаете замерзать — найдите огонь!|r"));
            return;
        }
        const stacks = aura.GetStackAmount();
        if (stacks < FREEZE_MAX_STACKS) {
            aura.SetStackAmount(stacks + 1);
            if (stacks + 1 == FREEZE_MAX_STACKS) {
                player.SendBroadcastMessage(tr(player, "|cff2080ffYou are frozen stiff! The cold is hurting you.|r", "|cff2080ffВы окоченели! Холод наносит урон.|r"));
            }
        } else {
            drain(player, FREEZE_DRAIN_FRACTION);
        }
        return;
    }

    if (aura) {
        const stacks = aura.GetStackAmount();
        if (stacks <= FREEZE_WARM_RATE) {
            player.RemoveAura(FREEZING_SPELL);
        } else {
            aura.SetStackAmount(stacks - FREEZE_WARM_RATE);
        }
    }
}

/* --------------- источники еды/воды на базе (base-building) ---------------- */
class SourceCooldowns {
    water: number = 0;
    food: number = 0;
}

function sourceCooldowns(player: TSPlayer): SourceCooldowns {
    return player.GetObject('survivalSources', new SourceCooldowns());
}

/** Котёл + мясо в сумках = похлёбки (без кулдауна; до COOK_PER_CLICK за клик). */
function tryCookMeat(player: TSPlayer): boolean {
    const meat = player.GetItemCount(MEAT_ITEM_ID, false);
    if (meat <= 0) return false;
    const n = meat < COOK_PER_CLICK ? meat : COOK_PER_CLICK;
    player.RemoveItemByEntry(MEAT_ITEM_ID, n);
    if (!player.AddItem(STEW_ITEM_ID, n)) {
        player.AddItem(MEAT_ITEM_ID, n); // сумки полны — вернуть мясо
        player.SendBroadcastMessage(tr(player, "Could not cook: make room in your bags.", "Не удалось сварить: освободите место в сумках."));
        return true;
    }
    player.SendBroadcastMessage(tr(player, `|cffff6020Stews cooked: ${n}.|r`, `|cffff6020Сварено похлёбок: ${n}.|r`));
    return true;
}

function useBaseSource(player: TSPlayer, isWater: boolean): void {
    if (!isWater && tryCookMeat(player)) {
        return; // готовка приоритетнее бесплатного перекуса
    }
    const cd = sourceCooldowns(player);
    // ВНИМАНИЕ: GetUnixTime() ядра возвращает МИЛЛИСЕКУНДЫ
    const now = Math.floor(Number(GetUnixTime()) / 1000);
    const last = isWater ? cd.water : cd.food;
    if (now - last < SOURCE_COOLDOWN_S) {
        const left = SOURCE_COOLDOWN_S - (now - last);
        player.SendBroadcastMessage(tr(player, `Not ready yet — wait ${left} sec.`, `Ещё не готово — подождите ${left} сек.`));
        return;
    }
    if (isWater) cd.water = now; else cd.food = now;

    const d = SurvivalData.get(player);
    if (isWater) {
        d.thirst = clamp(d.thirst + SOURCE_RESTORE);
        player.SendBroadcastMessage(tr(player, "|cff40a0ffYou drink fresh water.|r", "|cff40a0ffВы напились свежей воды.|r"));
    } else {
        d.hunger = clamp(d.hunger + SOURCE_RESTORE);
        player.SendBroadcastMessage(tr(player, "|cffff6020You eat some hot stew.|r", "|cffff6020Вы поели горячей похлёбки.|r"));
    }
    d.Save();
    updateDebuffs(player, d);
    updateWellFed(player, d);
    sendSurvival(player);
}

function startConsumeTimer(player: TSPlayer, spellId: number, amount: number, kind: number): void {
    const timerName = CONSUME_TIMER + (kind == KIND_FOOD ? "-food" : "-drink");
    player.AddNamedTimer(timerName, CONSUME_DELAY_MS, REPEATING_TIMER_LOOPS, (owner, timer) => {
        const current = owner.ToPlayer();
        if (!current || !current.HasAura(spellId)) {
            timer.Stop();
            return;
        }
        const d = SurvivalData.get(current);
        const before = kind == KIND_FOOD ? d.hunger : d.thirst;
        const after = clamp(before + amount);
        if (after == before) return;
        if (kind == KIND_FOOD) {
            d.hunger = after;
            current.SendBroadcastMessage(tr(current, "|cffff6020+" + (after - before) + " satiety|r", "|cffff6020+" + (after - before) + " сытость|r"));
        } else {
            d.thirst = after;
            current.SendBroadcastMessage(tr(current, "|cff40a0ff+" + (after - before) + " water|r", "|cff40a0ff+" + (after - before) + " вода|r"));
        }
        d.Save();
        updateDebuffs(current, d);
        updateWellFed(current, d);
        sendSurvival(current);
    });
}

export function RegisterSurvival(events: TSEvents): void {
    events.GameObject.OnGossipHello(GO_WATER_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        useBaseSource(player, true);
    });
    events.GameObject.OnGossipHello(GO_FOOD_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        useBaseSource(player, false);
    });

    // «Свежее мясо» со зверей — сырьё для котла
    events.Creature.OnGenerateLoot((creature, killer) => {
        if (MEAT_ITEM_ID == 0) return;
        if (creature.GetCreatureType() != CREATURE_TYPE_BEAST) return;
        if (Math.random() >= MEAT_DROP_CHANCE) return;
        const loot = creature.GetLoot();
        // как в gem-abilities/loot.ts: без владельца лут может не открыться
        if (loot.GetLootOwnerGUID().IsEmpty()) {
            const recipient = creature.GetLootRecipient();
            if (recipient !== undefined) {
                loot.SetLootOwner(recipient.GetGUID());
            } else if (killer !== undefined) {
                loot.SetLootOwner(killer.GetGUID());
            }
        }
        loot.AddItem(MEAT_ITEM_ID, 1, 2, 0, false, 0);
    });

    events.Player.OnLogin((player, firstLogin) => {
        if (firstLogin && CAMP_ITEM_ID != 0) {
            player.AddItem(CAMP_ITEM_ID, CAMP_ITEM_START_COUNT); // стартовый набор костров
        }
        const d = SurvivalData.get(player); // load/create
        updateDebuffs(player, d);           // restore debuff icons on login
        updateWellFed(player, d);
        player.AddTimer(DEPLETE_INTERVAL, REPEATING_TIMER_LOOPS, (owner, timer) => {
            const current = owner.ToPlayer();
            if (current !== undefined) tick(current);
        });
    });

    // Restore every eight uninterrupted seconds while the native aura remains.
    // Food and drink use separate named timers so starting one cannot replace
    // the other's progress.
    events.Spell.OnAfterCast((spell, cancel) => {
        const player = spell.GetCaster().ToPlayer();
        if (!player) return;
        const info = spell.GetSpellInfo();
        const kind = foodDrinkKind(info);
        if (kind == KIND_NONE) return;
        const amount = restoreForSpell(player, info);
        const spellId = Number(spell.GetEntry());
        if ((kind & KIND_FOOD) != 0) startConsumeTimer(player, spellId, amount, KIND_FOOD);
        if ((kind & KIND_DRINK) != 0) startConsumeTimer(player, spellId, amount, KIND_DRINK);
    });

    events.CustomPacket.OnReceive(OP_SURVIVAL_REQUEST, (opcode, packet, player) => {
        survivalClient(player).ready = true;
        sendSurvival(player);
    });

    events.Player.OnSave(player => {
        SurvivalData.get(player).Save();
    });
}
