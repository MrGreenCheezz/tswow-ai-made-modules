/**
 * Набеги на базу — PvE-событие.
 *
 * Пока владелец находится у своего флага, раз в минуту бросается кубик; не чаще
 * раза в час (BaseFlag.lastRaid) стартует набег: предупреждение, через 20 секунд
 * (через 40 со сторожевым гонгом)
 * по кольцу вокруг флага спавнится волна ВРАЖДЕБНЫХ ВСЕМ мобов (фракции 14/16),
 * подобранных ИЗ ДИАПАЗОНА УРОВНЯ ИГРОКА (запрос по creature_template — честно
 * на любом уровне). Перебил всех до таймаута — золото + свёрток ресурсов.
 * Построенные «Стражники базы» скриптово вступают в бой с волной.
 *
 * ВАЖНО (краш-фикс): у ядра tswow TSTimers::tick НЕ переживает AddTimer из
 * колбэка таймера (push_back реаллоцирует вектор под итерацией → UB → краш
 * lua_gettop по мусорному стейту). Поэтому здесь ОДИН таймер-насос (5с),
 * созданный в OnLogin, и конечный автомат фаз вместо вложенных таймеров.
 */

import {
    RADIUS_BY_LEVEL, RAID_COOLDOWN_S, RAID_CHANCE, RAID_MIN_LEVEL, RAID_BASE_COUNT,
    GUARD_KEYS, HEALER_KEY,
    SHIELDBEARER_KEY, BATTLE_MAGE_KEY, BALLISTA_KEY,
    FROST_TRAP_KEY, RUNIC_OBELISK_KEY, WATCH_GONG_KEY,
    PRACTICE_RAID_DURATION_S, buildingByKey, buildingName,
} from "../shared/BaseCatalog";
import { BaseFlag, BaseBuilding } from "./base-db";
import { resourceGeneratorByKey } from "../shared/ResourceGenerators";
import { clearResourceGeneratorReadyEffect } from "./resource-generators";
import {
    dist2, ORE_TIERS, HERB_TIERS, randomResourceForSkill, gatherSkill,
    MINING_SKILL, HERBALISM_SKILL, nowUnix, normTime, removeStoredBuilding,
    prepareBuildingRemoval, baseText, isRussianClient,
} from "./base";

const PUMP_INTERVAL_MS = 5000;   // единственный таймер набегов
const PUMP_LOOPS = 0x0fffffff;
const PUMPS_PER_ROLL = 12;       // 12 × 5с = минутная проверка шанса
const WARNING_PUMPS = 4;         // 4 × 5с = 20с предупреждения
const GONG_WARNING_PUMPS = 8;    // сторожевой гонг замечает волну за 40с
const FIGHT_PUMPS = 60;          // 60 × 5с = 5 минут на бой
const PRACTICE_WARNING_PUMPS = 1;
const PRACTICE_FIGHT_PUMPS = PRACTICE_RAID_DURATION_S * 1000 / PUMP_INTERVAL_MS;
const RAIDER_SAFETY_DURATION_MS = 10 * 60 * 1000; // аварийный despawn при logout/сбое cleanup
const RAID_NEAR_FLAG = 50.0;     // «игрок на базе», ярды
const RAID_RING_EXTRA = 8.0;     // спавн чуть за радиусом стройки
const RAID_POOL_LIMIT = 40;
const RAID_GOLD_PER_LEVEL = 1000; // медь за уровень (×(1+уровень базы))
const RAID_RESOURCE_COUNT = 3;
const GUARD_ASSIST_RANGE = 60.0;
const HEAL_SPELL = 2061;
const HEAL_RANGE = 35.0;
const HEAL_THRESHOLD = 90.0;
const HEAL_FRACTION = 0.15;
const SHIELDBEARER_PRIORITY_RANGE = 20.0;
const BATTLE_MAGE_RANGE = 25.0;
const BATTLE_MAGE_TARGETS = 3;
const BATTLE_MAGE_PERIOD_PUMPS = 2;
const BALLISTA_RANGE = 40.0;
const FROST_TRAP_RANGE = 10.0;
const RUNIC_OBELISK_RANGE = 15.0;

const BATTLE_MAGE_BOLT = UTAG("base-building", "spell/base-battle-mage-bolt");
const BALLISTA_SHOT = UTAG("base-building", "spell/base-ballista-shot");
const FROST_TRAP_SLOW = UTAG("base-building", "spell/base-frost-trap-slow");
const RUNIC_BULWARK = UTAG("base-building", "spell/base-runic-bulwark");

const PHASE_IDLE = 0;
const PHASE_WARNING = 1;
const PHASE_FIGHT = 2;

class RaidState {
    phase: number = PHASE_IDLE;
    rollPumps: number = 0;   // счётчик до следующей минутной проверки
    phasePumps: number = 0;  // счётчик внутри фазы
    warningTargetPumps: number = WARNING_PUMPS;
    fightTargetPumps: number = FIGHT_PUMPS;
    practice: boolean = false;
    mapId: number = 0;
    instanceId: number = 0;
    entries: number[] = [];  // entry каждого рейдера волны
    guids: number[] = [];    // low guid каждого рейдера волны
    pool: number[] = [];
}

function raidState(player: TSPlayer): RaidState {
    return player.GetObject("baseRaid", new RaidState());
}

interface RaidDefender {
    key: number;
    unit: TSCreature;
}

interface RaiderDistance {
    unit: TSCreature;
    distance: number;
}

function resetRaidState(st: RaidState): void {
    st.phase = PHASE_IDLE;
    st.rollPumps = 0;
    st.phasePumps = 0;
    st.warningTargetPumps = WARNING_PUMPS;
    st.fightTargetPumps = FIGHT_PUMPS;
    st.practice = false;
    st.mapId = 0;
    st.instanceId = 0;
    st.entries = [];
    st.guids = [];
    st.pool = [];
}

function plannedRaidCount(flag: BaseFlag): number {
    return RAID_BASE_COUNT + flag.baseLevel * 2;
}

function bindRaidMap(player: TSPlayer, st: RaidState): void {
    st.mapId = Number(player.GetMapID());
    st.instanceId = Number(player.GetInstanceID());
}

function isRaidOnMap(map: TSMap, st: RaidState): boolean {
    return Number(map.GetMapID()) == st.mapId && Number(map.GetInstanceID()) == st.instanceId;
}

function hasBuildingOnMap(player: TSPlayer, key: number): boolean {
    let found = false;
    const mapId = player.GetMapID();
    BaseBuilding.get(player).forEach(row => {
        if (!found && row.catKey == key && row.mapId == mapId) found = true;
    });
    return found;
}

/** Кандидаты-рейдеры из диапазона уровня игрока (звери/гуманоиды, враждебные всем). */
function pickRaiderPool(level: number): number[] {
    const q = "SELECT entry FROM creature_template"
        + " WHERE minlevel <= " + (level + 1)
        + " AND maxlevel >= " + (level - 1)
        + " AND `rank` = 0"
        + " AND faction IN (14, 16)"
        + " AND type IN (1, 7)"
        + " AND modelid1 > 0"
        + " AND ScriptName = ''"
        + " AND AIName = ''"
        + " AND (flags_extra & 2) = 0"
        + " AND (unit_flags & 0x300) = 0"
        + " LIMIT " + RAID_POOL_LIMIT;
    const res = QueryWorld(q);
    const pool: number[] = [];
    while (res.GetRow()) {
        pool.push(Number(res.GetUInt32(0)));
    }
    return pool;
}

function isGuardKey(catKey: number): boolean {
    for (let i = 0; i < GUARD_KEYS.length; i++) {
        if (GUARD_KEYS[i] == catKey) return true;
    }
    return false;
}

function engageGuard(guard: TSCreature, target: TSCreature): void {
    // Для стрелка это вызывает штатный TrinityCore ArcherAI: он сам входит в бой,
    // держит дальность и повторяет spell1. Обычный страж начинает ближнюю атаку.
    guard.AttackStart(target);
}

function healDefenders(healer: TSCreature, player: TSPlayer, guards: RaidDefender[]): void {
    if (healer.IsCasting()) return;
    let target: TSUnit | undefined = undefined;
    let lowest = HEAL_THRESHOLD;
    const range2 = HEAL_RANGE * HEAL_RANGE;
    if (!player.IsDead()
        && dist2(healer.GetX(), healer.GetY(), player.GetX(), player.GetY()) <= range2) {
        const pct = Number(player.GetHealthPct());
        if (pct < lowest) { lowest = pct; target = player; }
    }
    for (let i = 0; i < guards.length; i++) {
        const guard = guards[i].unit;
        if (!guard.IsDead()
            && dist2(healer.GetX(), healer.GetY(), guard.GetX(), guard.GetY()) <= range2) {
            const pct = Number(guard.GetHealthPct());
            if (pct < lowest) { lowest = pct; target = guard; }
        }
    }
    if (!target) return;
    healer.AttackStop();
    const amount = Math.max(1, Math.floor(Number(target.GetMaxHealth()) * HEAL_FRACTION));
    healer.CastCustomSpell(target, HEAL_SPELL, false, amount);
}

/** Защитники владельца рядом с флагом — натравить на волну (плюс их фракция
 *  1665 сама агрит монстров в радиусе агро). */
function assistGuards(player: TSPlayer, flag: BaseFlag, raiders: TSCreature[]): void {
    if (raiders.length == 0) return;
    const map = player.GetMap();
    let idx = 0;
    BaseBuilding.get(player).forEach(row => {
        if (!isGuardKey(row.catKey) || row.mapId != player.GetMapID()) return;
        if (dist2(row.x, row.y, flag.x, flag.y) > GUARD_ASSIST_RANGE * GUARD_ASSIST_RANGE) return;
        const guard = map.GetCreature(CreateGUID(HighGuid.Unit, row.entry, row.spawnGuid));
        if (!guard || guard.IsDead()) return;
        if (row.catKey == HEALER_KEY || row.catKey == BATTLE_MAGE_KEY || row.catKey == BALLISTA_KEY) return;
        engageGuard(guard, raiders[idx % raiders.length]);
        idx++;
    });
}

function spawnWave(player: TSPlayer, flag: BaseFlag, st: RaidState): void {
    const map = player.GetMap();
    const count = plannedRaidCount(flag);
    const lvl = flag.baseLevel < RADIUS_BY_LEVEL.length ? flag.baseLevel : RADIUS_BY_LEVEL.length - 1;
    const ring = RADIUS_BY_LEVEL[lvl] + RAID_RING_EXTRA;
    const phaseMask = player.GetPhaseMaskForSpawn();

    st.guids = [];
    st.entries = [];
    const spawned: TSCreature[] = [];
    for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / count;
        const x = flag.x + Math.cos(angle) * ring;
        const y = flag.y + Math.sin(angle) * ring;
        let z = map.GetHeight(x, y, phaseMask);
        if (!z || z < flag.z - 50 || z > flag.z + 50) z = flag.z; // страховка от дыр в vmap
        const entry = st.pool[Math.floor(Math.random() * st.pool.length)];
        const c = map.SpawnCreature(
            entry, x, y, z, angle + Math.PI, RAIDER_SAFETY_DURATION_MS, phaseMask,
        );
        if (c) {
            // «дом» рейдера — флаг: при потере цели эвейд сам стягивает его к базе
            // (иначе он возвращался в точку спавна на кольце и стоял без дела)
            c.SetHomePosition(flag.x, flag.y, flag.z, angle + Math.PI);
            c.AttackStart(player);
            st.guids.push(c.GetGUIDLow());
            st.entries.push(entry);
            spawned.push(c);
        }
    }

    if (st.guids.length == 0) {
        const practice = st.practice;
        resetRaidState(st);
        player.SendBroadcastMessage(practice
            ? baseText(player, "|cffff6060[PRACTICE] Failed to spawn the practice wave.|r", "|cffff6060[ТРЕНИРОВКА] Не удалось создать учебную волну.|r")
            : baseText(player, "|cffff6060Failed to spawn the raid wave.|r", "|cffff6060Не удалось создать волну набега.|r"));
        return;
    }
    st.phase = PHASE_FIGHT;
    st.phasePumps = 0;
    if (st.practice) {
        flag.lastPracticeRaid = nowUnix();
        flag.Save();
    }
    player.SendBroadcastMessage(st.practice
        ? baseText(
            player,
            `|cffffa040[PRACTICE] Practice wave started: ${st.guids.length} enemies, time limit ${PRACTICE_RAID_DURATION_S} seconds.|r`,
            `|cffffa040[ТРЕНИРОВКА] Учебная волна началась: ${st.guids.length} врагов, время — ${PRACTICE_RAID_DURATION_S} секунд.|r`,
        )
        : baseText(
            player,
            `|cffff4040Raid started: ${st.guids.length} enemies are attacking your base!|r`,
            `|cffff4040Набег начался: ${st.guids.length} врагов атакуют вашу базу!|r`,
        ));
    assistGuards(player, flag, spawned);
}

/** Обход живых временных призывов по полному creature GUID (entry + counter). */
function forEachAliveRaiderOnMap(map: TSMap, st: RaidState, cb: (c: TSCreature) => void): void {
    if (!isRaidOnMap(map, st)) return;
    for (let i = 0; i < st.guids.length; i++) {
        const c = map.GetCreature(CreateGUID(HighGuid.Unit, st.entries[i], st.guids[i]));
        if (c && !c.IsDead()) cb(c);
    }
}

function forEachAliveRaider(player: TSPlayer, st: RaidState, cb: (c: TSCreature) => void): void {
    forEachAliveRaiderOnMap(player.GetMap(), st, cb);
}

function despawnRemaining(player: TSPlayer, st: RaidState): void {
    forEachAliveRaider(player, st, c => c.DespawnOrUnsummon(0));
}

function clearRaidOnMap(map: TSMap, player: TSPlayer): void {
    const st = raidState(player);
    if (st.phase == PHASE_IDLE || !isRaidOnMap(map, st)) return;
    forEachAliveRaiderOnMap(map, st, c => c.DespawnOrUnsummon(0));
    resetRaidState(st);
}

function rollRaidStart(player: TSPlayer, st: RaidState): void {
    if (player.GetLevel() < RAID_MIN_LEVEL) return;
    if (player.IsDead() || player.IsInCombat()) return;

    const flag = BaseFlag.get(player);
    if (flag.hasFlag == 0 || flag.mapId != player.GetMapID()) return;
    if (dist2(player.GetX(), player.GetY(), flag.x, flag.y) > RAID_NEAR_FLAG * RAID_NEAR_FLAG) return;

    const now = nowUnix();
    if (now - normTime(Number(flag.lastRaid)) < RAID_COOLDOWN_S) return;
    if (Math.random() >= RAID_CHANCE) return;

    const pool = pickRaiderPool(player.GetLevel());
    if (pool.length == 0) return;

    flag.lastRaid = now;
    flag.Save();
    const gong = hasBuildingOnMap(player, WATCH_GONG_KEY);
    st.pool = pool;
    st.phase = PHASE_WARNING;
    st.phasePumps = 0;
    st.warningTargetPumps = gong ? GONG_WARNING_PUMPS : WARNING_PUMPS;
    st.fightTargetPumps = FIGHT_PUMPS;
    st.practice = false;
    bindRaidMap(player, st);
    const seconds = st.warningTargetPumps * PUMP_INTERVAL_MS / 1000;
    const prefix = gong
        ? baseText(player, "The warning gong has sounded the alarm! ", "Сторожевой гонг поднял тревогу! ")
        : "";
    player.SendBroadcastMessage(baseText(
        player,
        `|cffff4040${prefix}The raid will begin in ${seconds} seconds. Expected enemies: ${plannedRaidCount(flag)}.|r`,
        `|cffff4040${prefix}Набег начнётся через ${seconds} секунд. Ожидается врагов: ${plannedRaidCount(flag)}.|r`,
    ));
}

function pump(player: TSPlayer): void {
    const st = raidState(player);

    if (st.phase == PHASE_IDLE) {
        st.rollPumps++;
        if (st.rollPumps >= PUMPS_PER_ROLL) {
            st.rollPumps = 0;
            rollRaidStart(player, st);
        }
        return;
    }

    // Нельзя искать GUID волны в новой карте/копии инстанса: это давало
    // ложную победу после телепорта. Map.OnPlayerLeave обычно уже очистил
    // волну; эта проверка остаётся страховкой порядка событий.
    if (!isRaidOnMap(player.GetMap(), st)) {
        resetRaidState(st);
        return;
    }

    if (st.phase == PHASE_WARNING) {
        st.phasePumps++;
        if (st.phasePumps >= st.warningTargetPumps) {
            const flag = BaseFlag.get(player);
            if (flag.hasFlag == 0 || flag.mapId != player.GetMapID()) { // базу снесли за время предупреждения
                resetRaidState(st);
                return;
            }
            spawnWave(player, flag, st);
        }
        return;
    }

    // PHASE_FIGHT: осада — каждый насос заново сцепляем свободных бойцов
    const siegeFlag = BaseFlag.get(player);
    if (siegeFlag.hasFlag == 0 || siegeFlag.mapId != player.GetMapID()) {
        const practice = st.practice;
        despawnRemaining(player, st);
        resetRaidState(st);
        player.SendBroadcastMessage(practice
            ? baseText(player, "[PRACTICE] Wave recalled: the base no longer exists on this map.", "[ТРЕНИРОВКА] Волна отозвана: база больше не существует на этой карте.")
            : baseText(player, "Raid stopped: the base no longer exists on this map.", "Набег прекращён: база больше не существует на этой карте."));
        return;
    }
    st.phasePumps++;
    const aliveRaiders: TSCreature[] = [];
    forEachAliveRaider(player, st, c => { aliveRaiders.push(c); });
    if (aliveRaiders.length > 0) {
        engageSiege(player, siegeFlag, aliveRaiders, st.phasePumps);
    }
    if (aliveRaiders.length == 0) {
        const practice = st.practice;
        resetRaidState(st);
        if (practice) {
            player.SendBroadcastMessage(baseText(player, "|cff40ff40[PRACTICE] Practice wave defeated.|r", "|cff40ff40[ТРЕНИРОВКА] Учебная волна уничтожена.|r"));
            return;
        }
        const flag = BaseFlag.get(player);
        const level = player.GetLevel();
        player.ModifyMoney(level * RAID_GOLD_PER_LEVEL * (1 + flag.baseLevel));
        player.AddItem(randomResourceForSkill(ORE_TIERS, gatherSkill(player, MINING_SKILL)), RAID_RESOURCE_COUNT);
        player.AddItem(randomResourceForSkill(HERB_TIERS, gatherSkill(player, HERBALISM_SKILL)), RAID_RESOURCE_COUNT);
        player.SendBroadcastMessage(baseText(player, "|cff40ff40Raid repelled! Reward: gold, ore, and herbs.|r", "|cff40ff40Набег отбит! Награда: золото, руда и травы.|r"));
        return;
    }
    if (st.phasePumps >= st.fightTargetPumps) {
        const practice = st.practice;
        despawnRemaining(player, st);
        resetRaidState(st);
        if (practice) {
            player.SendBroadcastMessage(baseText(
                player,
                `|cffffa040[PRACTICE] ${PRACTICE_RAID_DURATION_S} seconds elapsed. The practice wave was recalled without rewards or damage to the base.|r`,
                `|cffffa040[ТРЕНИРОВКА] ${PRACTICE_RAID_DURATION_S} секунд истекли. Учебная волна отозвана без награды и ущерба базе.|r`,
            ));
        } else {
            lootBase(player);
        }
    }
}

const RAID_REENGAGE_RANGE = GUARD_ASSIST_RANGE;

/** Живые защитники владельца у флага. */
function aliveGuards(player: TSPlayer, flag: BaseFlag): RaidDefender[] {
    const map = player.GetMap();
    const out: RaidDefender[] = [];
    BaseBuilding.get(player).forEach(row => {
        if (!isGuardKey(row.catKey) || row.mapId != player.GetMapID()) return;
        if (dist2(row.x, row.y, flag.x, flag.y) > GUARD_ASSIST_RANGE * GUARD_ASSIST_RANGE) return;
        const g = map.GetCreature(CreateGUID(HighGuid.Unit, row.entry, row.spawnGuid));
        if (g && !g.IsDead()) out.push({ key: row.catKey, unit: g });
    });
    return out;
}

function nearestRaiders(
    source: TSCreature,
    raiders: TSCreature[],
    range: number,
    limit: number,
): TSCreature[] {
    const found: RaiderDistance[] = [];
    const range2 = range * range;
    for (let i = 0; i < raiders.length; i++) {
        const distance = dist2(source.GetX(), source.GetY(), raiders[i].GetX(), raiders[i].GetY());
        if (distance <= range2) found.push({ unit: raiders[i], distance: distance });
    }
    found.sort((a, b) => a.distance - b.distance);
    const result: TSCreature[] = [];
    for (let i = 0; i < found.length && i < limit; i++) result.push(found[i].unit);
    return result;
}

function castBattleMage(mage: TSCreature, player: TSPlayer, raiders: TSCreature[], phasePumps: number): void {
    mage.AttackStop();
    if (phasePumps % BATTLE_MAGE_PERIOD_PUMPS != 0 || mage.IsCasting()) return;
    const targets = nearestRaiders(mage, raiders, BATTLE_MAGE_RANGE, BATTLE_MAGE_TARGETS);
    const damage = Math.max(1, player.GetLevel() * 4);
    for (let i = 0; i < targets.length; i++) {
        mage.CastCustomSpell(targets[i], BATTLE_MAGE_BOLT, true, damage);
    }
}

function fireBallista(ballista: TSCreature, player: TSPlayer, raiders: TSCreature[]): void {
    ballista.AttackStop();
    if (ballista.IsCasting()) return;
    const targets = nearestRaiders(ballista, raiders, BALLISTA_RANGE, 1);
    if (targets.length == 0) return;
    ballista.CastCustomSpell(targets[0], BALLISTA_SHOT, true, Math.max(1, player.GetLevel() * 5));
}

/** Ловушки работают только по существам текущей волны; обелиски — только по
 * владельцу и его живым защитникам. Поэтому эти эффекты не задевают PvP и
 * случайных существ открытого мира. */
function applyRaidStructures(player: TSPlayer, guards: RaidDefender[], raiders: TSCreature[]): void {
    const mapId = player.GetMapID();
    const trapRange2 = FROST_TRAP_RANGE * FROST_TRAP_RANGE;
    const obeliskRange2 = RUNIC_OBELISK_RANGE * RUNIC_OBELISK_RANGE;
    BaseBuilding.get(player).forEach(row => {
        if (row.mapId != mapId) return;
        if (row.catKey == FROST_TRAP_KEY) {
            for (let i = 0; i < raiders.length; i++) {
                const raider = raiders[i];
                if (dist2(row.x, row.y, raider.GetX(), raider.GetY()) <= trapRange2) {
                    player.AddAura(FROST_TRAP_SLOW, raider);
                }
            }
            return;
        }
        if (row.catKey != RUNIC_OBELISK_KEY) return;
        if (!player.IsDead() && dist2(row.x, row.y, player.GetX(), player.GetY()) <= obeliskRange2) {
            player.AddAura(RUNIC_BULWARK, player);
        }
        for (let i = 0; i < guards.length; i++) {
            const guard = guards[i].unit;
            if (dist2(row.x, row.y, guard.GetX(), guard.GetY()) <= obeliskRange2) {
                player.AddAura(RUNIC_BULWARK, guard);
            }
        }
    });
}

/**
 * Постоянная сцепка осады (каждый насос): свободные рейдеры атакуют ближайшего
 * защитника или игрока рядом, иначе идут к флагу; свободные защитники атакуют
 * ближайшего рейдера. Разовый AttackStart при спавне теряется после эвейда —
 * без ре-энгейджа стороны стояли без дела.
 */
function engageSiege(player: TSPlayer, flag: BaseFlag, raiders: TSCreature[], phasePumps: number): void {
    const guards = aliveGuards(player, flag);
    const r2 = RAID_REENGAGE_RANGE * RAID_REENGAGE_RANGE;
    const shieldRange2 = SHIELDBEARER_PRIORITY_RANGE * SHIELDBEARER_PRIORITY_RANGE;

    for (let i = 0; i < raiders.length; i++) {
        const r = raiders[i];
        let target: TSUnit | undefined = undefined;
        let bestD = shieldRange2;
        for (let g = 0; g < guards.length; g++) {
            if (guards[g].key != SHIELDBEARER_KEY) continue;
            const shield = guards[g].unit;
            const d = dist2(r.GetX(), r.GetY(), shield.GetX(), shield.GetY());
            if (d <= bestD) { bestD = d; target = shield; }
        }
        if (!target) {
            bestD = r2;
            for (let g = 0; g < guards.length; g++) {
                const guard = guards[g].unit;
                const d = dist2(r.GetX(), r.GetY(), guard.GetX(), guard.GetY());
                if (d <= bestD) { bestD = d; target = guard; }
            }
        }
        if (!target && !player.IsDead()
            && dist2(r.GetX(), r.GetY(), player.GetX(), player.GetY()) <= r2) {
            target = player;
        }
        if (target) {
            r.AttackStart(target);
        } else {
            r.MoveTo(0, flag.x, flag.y, flag.z, true); // маршируют к флагу (дом там же)
        }
    }

    applyRaidStructures(player, guards, raiders);

    for (let g = 0; g < guards.length; g++) {
        const defender = guards[g];
        const gu = defender.unit;
        if (defender.key == HEALER_KEY) {
            healDefenders(gu, player, guards);
        } else if (defender.key == BATTLE_MAGE_KEY) {
            castBattleMage(gu, player, raiders, phasePumps);
        } else if (defender.key == BALLISTA_KEY) {
            fireBallista(gu, player, raiders);
        } else {
            let target: TSCreature | undefined = undefined;
            let bestD = r2;
            for (let i = 0; i < raiders.length; i++) {
                const d = dist2(gu.GetX(), gu.GetY(), raiders[i].GetX(), raiders[i].GetY());
                if (d <= bestD) { bestD = d; target = raiders[i]; }
            }
            if (target) engageGuard(gu, target);
        }
    }
}

/** Провал обороны: рейдеры разграбляют базу перед уходом. */
function lootBase(player: TSPlayer): void {
    const container = BaseBuilding.get(player);
    // Сбрасывается только готовность ресурсных генераторов; производственные
    // станции и обычный декор не используют lastHarvest и не затрагиваются.
    let plundered = false;
    const now = nowUnix();
    container.forEach(row => {
        if (resourceGeneratorByKey(row.catKey)
            && Number(row.lastHarvest) != 0
            && normTime(Number(row.lastHarvest)) < now) {
            clearResourceGeneratorReadyEffect(player, row);
            row.lastHarvest = now;
            row.MarkDirty();
            plundered = true;
        }
    });
    // одна случайная постройка (не защитник) разрушена, без возврата денег
    const rows: BaseBuilding[] = [];
    container.forEach(row => {
        if (!isGuardKey(row.catKey)) rows.push(row);
    });
    let destroyedName = "";
    if (rows.length > 0) {
        const row = rows[Math.floor(Math.random() * rows.length)];
        const b = buildingByKey(row.catKey);
        destroyedName = b
            ? buildingName(b, isRussianClient(player))
            : baseText(player, "building", "постройка");
        removeStoredBuilding(player, row);
        prepareBuildingRemoval(player, row);
        row.Delete();
    }
    if (plundered || destroyedName != "") container.Save();

    if (destroyedName != "") {
        player.SendBroadcastMessage(baseText(
            player,
            `|cffff2020The base has been plundered! Destroyed: ${destroyedName}. Building stockpiles were stolen.|r`,
            `|cffff2020База разграблена! Разрушено: ${destroyedName}. Накопления построек украдены.|r`,
        ));
    } else {
        player.SendBroadcastMessage(baseText(player, "|cffff2020The raiders left after plundering the building stockpiles.|r", "|cffff2020Налётчики ушли, разграбив накопления построек.|r"));
    }
}

/** Учебная волна использует настоящих рейдеров и защитные механики, но не
 * трогает часовой cooldown, не выдаёт награду и не грабит базу. */
export function startPracticeRaid(player: TSPlayer): boolean {
    const st = raidState(player);
    if (st.phase != PHASE_IDLE) {
        player.SendBroadcastMessage(baseText(player, "A raid or practice raid is already active.", "Набег или тренировка уже активны."));
        return false;
    }
    if (player.IsDead() || player.IsInCombat()) {
        player.SendBroadcastMessage(baseText(player, "You must be alive and out of combat to start a practice raid.", "Тренировку можно начать только живым и вне боя."));
        return false;
    }

    const flag = BaseFlag.get(player);
    if (flag.hasFlag == 0 || flag.mapId != player.GetMapID()) {
        player.SendBroadcastMessage(baseText(player, "A flag for your base is required on this map to start practice.", "Для тренировки нужен флаг вашей базы на этой карте."));
        return false;
    }
    if (player.GetLevel() < RAID_MIN_LEVEL) {
        player.SendBroadcastMessage(baseText(player, `Practice raids are available from level ${RAID_MIN_LEVEL}.`, `Тренировка доступна с ${RAID_MIN_LEVEL}-го уровня.`));
        return false;
    }
    const pool = pickRaiderPool(player.GetLevel());
    if (pool.length == 0) {
        player.SendBroadcastMessage(baseText(player, "No suitable opponents were found for your level.", "Не нашлось подходящих противников вашего уровня."));
        return false;
    }

    st.pool = pool;
    st.phase = PHASE_WARNING;
    st.rollPumps = 0;
    st.phasePumps = 0;
    st.warningTargetPumps = PRACTICE_WARNING_PUMPS;
    st.fightTargetPumps = PRACTICE_FIGHT_PUMPS;
    st.practice = true;
    bindRaidMap(player, st);
    player.SendBroadcastMessage(baseText(
        player,
        `Practice started: ${plannedRaidCount(flag)} opponents will appear in a few seconds for ${PRACTICE_RAID_DURATION_S} seconds.`,
        `Тренировка запущена: через несколько секунд появятся ${plannedRaidCount(flag)} противников на ${PRACTICE_RAID_DURATION_S} секунд.`,
    ));
    return true;
}

export function stopPracticeRaid(player: TSPlayer): boolean {
    const st = raidState(player);
    if (st.phase == PHASE_IDLE) {
        player.SendBroadcastMessage(baseText(player, "No practice raid is active.", "Учебный набег не запущен."));
        return false;
    }
    if (!st.practice) {
        player.SendBroadcastMessage(baseText(player, "A real raid is underway and cannot be stopped from the tactical table.", "Идёт настоящий набег — его нельзя остановить с тактического стола."));
        return false;
    }
    despawnRemaining(player, st);
    resetRaidState(st);
    player.SendBroadcastMessage(baseText(player, "Practice raid stopped without rewards or damage to the base.", "Учебный набег остановлен без награды и ущерба базе."));
    return true;
}

export function raidStatusText(player: TSPlayer): string {
    const st = raidState(player);
    if (st.phase == PHASE_IDLE) return baseText(player, "No raid or practice raid is currently active.", "Сейчас набег или тренировка не активны.");
    const name = st.practice
        ? baseText(player, "Practice raid", "Учебный набег")
        : baseText(player, "Real raid", "Настоящий набег");
    if (st.phase == PHASE_WARNING) {
        const seconds = Math.max(0, st.warningTargetPumps - st.phasePumps) * PUMP_INTERVAL_MS / 1000;
        return baseText(player, `${name}: the wave will appear in about ${seconds} sec.`, `${name}: волна появится примерно через ${seconds} сек.`);
    }
    let alive = 0;
    forEachAliveRaider(player, st, raider => { alive++; });
    const seconds = Math.max(0, st.fightTargetPumps - st.phasePumps) * PUMP_INTERVAL_MS / 1000;
    return baseText(player, `${name}: ${alive} enemies alive, about ${seconds} sec. remaining.`, `${name}: живых противников ${alive}, осталось примерно ${seconds} сек.`);
}

/** Тестовый форс набега (GM-команда .baseraid): без кулдауна/шанса/дистанции. */
function forceRaid(player: TSPlayer): void {
    const st = raidState(player);
    if (st.phase != PHASE_IDLE) {
        player.SendBroadcastMessage(baseText(player, "[TEST] A raid is already active or announced.", "[ТЕСТ] Набег уже идёт или анонсирован."));
        return;
    }
    const flag = BaseFlag.get(player);
    if (flag.hasFlag == 0 || flag.mapId != player.GetMapID()) {
        player.SendBroadcastMessage(baseText(player, "[TEST] A base flag is required on this map.", "[ТЕСТ] Нужен флаг базы на этой карте."));
        return;
    }
    const pool = pickRaiderPool(player.GetLevel());
    if (pool.length == 0) {
        player.SendBroadcastMessage(baseText(player, "[TEST] No creatures were found for your level.", "[ТЕСТ] Не нашлось мобов вашего уровня."));
        return;
    }
    flag.lastRaid = nowUnix();
    flag.Save();
    st.pool = pool;
    st.phase = PHASE_WARNING;
    st.phasePumps = 0;
    st.warningTargetPumps = 1; // волна на следующем насосе (до 5 секунд)
    st.fightTargetPumps = FIGHT_PUMPS;
    st.practice = false;
    bindRaidMap(player, st);
    player.SendBroadcastMessage(baseText(
        player,
        `|cffff4040[TEST] ${plannedRaidCount(flag)} opponents will appear in a few seconds.|r`,
        `|cffff4040[ТЕСТ] Через несколько секунд появятся ${plannedRaidCount(flag)} противников.|r`,
    ));
}

export function RegisterBaseRaids(events: TSEvents): void {
    events.Player.OnLogin((player, firstLogin) => {
        // единственный таймер набегов; НИКОГДА не добавлять таймеры из его колбэка
        player.AddTimer(PUMP_INTERVAL_MS, PUMP_LOOPS, (owner, timer) => {
            const activePlayer = owner.ToPlayer();
            if (!activePlayer) return;
            pump(activePlayer);
        });
    });

    events.Player.OnLogout(player => clearRaidOnMap(player.GetMap(), player));
    events.Map.OnPlayerLeave((map, player) => clearRaidOnMap(map, player));

    // .baseraid — мгновенно устроить набег на свою базу (только GM)
    events.Player.OnCommand((player, command, found) => {
        if (command.get() != "baseraid") return;
        found.set(true);
        if (Number(player.GetGMRank()) < 1) {
            player.SendBroadcastMessage(baseText(player, "This command is available only to GMs.", "Команда доступна только GM."));
            return;
        }
        forceRaid(player);
    });
}
