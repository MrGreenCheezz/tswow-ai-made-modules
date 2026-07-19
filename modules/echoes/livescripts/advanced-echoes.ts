/** Active mechanics for the append-only advanced Echo collection entries 12..31. */

import { EchoCollectionRow } from "./echo-db";

const ADVANCED_START_INDEX = 12;

const ADV_BLIGHTED_SKY = 0;
const ADV_BRITTLE_FORGING = 1;
const ADV_WEBBING = 2;
const ADV_CHAMPIONS_RALLY = 3;
const ADV_CINDERS = 4;
const ADV_CONSTELLATIONS = 5;
const ADV_PLAGUEBRINGER = 6;
const ADV_DARK_NUCLEUS = 7;
const ADV_DEATHWHISPER = 8;
const ADV_DEFILE = 9;
const ADV_DEMONIC = 10;
const ADV_SCORCHED_PATH = 11;
const ADV_SLIME_SPRAY = 12;
const ADV_SLIMEBOUND = 13;
const ADV_STATIC_OVERFLOW = 14;
const ADV_STONE_SHATTER = 15;
const ADV_STORM_CONDUCTOR = 16;
const ADV_TWILIGHT_COMBUSTION = 17;
const ADV_TWILIGHT_EQUILIBRIUM = 18;
const ADV_WIDOWS_VENOM = 19;

// Every tag lookup must remain a literal so the livescript compiler can replace it.
const ADVANCED_CONTROLLER_IDS: TSArray<number> = [
    UTAG("echoes", "spell/collection-blighted-sky"),
    UTAG("echoes", "spell/collection-brittle-forging"),
    UTAG("echoes", "spell/collection-broodmothers-webbing"),
    UTAG("echoes", "spell/collection-champions-rally"),
    UTAG("echoes", "spell/collection-cinders-of-the-sanctum"),
    UTAG("echoes", "spell/collection-constellations"),
    UTAG("echoes", "spell/collection-curse-of-the-plaguebringer"),
    UTAG("echoes", "spell/collection-dark-nucleus"),
    UTAG("echoes", "spell/collection-deathwhispers-barrier"),
    UTAG("echoes", "spell/collection-defile"),
    UTAG("echoes", "spell/collection-demonic-awakening"),
    UTAG("echoes", "spell/collection-scorched-path"),
    UTAG("echoes", "spell/collection-slime-spray"),
    UTAG("echoes", "spell/collection-slimebound-husk"),
    UTAG("echoes", "spell/collection-static-overflow"),
    UTAG("echoes", "spell/collection-stone-shatter"),
    UTAG("echoes", "spell/collection-storm-conductor"),
    UTAG("echoes", "spell/collection-twilight-combustion"),
    UTAG("echoes", "spell/collection-twilight-equilibrium"),
    UTAG("echoes", "spell/collection-widows-venom"),
];

const BLIGHT = UTAG("echoes", "spell/collection-blight");
const BLIGHT_ICD = UTAG("echoes", "spell/collection-blight-icd");
const BLIGHT_HIT = UTAG("echoes", "spell/collection-blighted-sky-hit");
const STUN_2 = UTAG("echoes", "spell/collection-advanced-stun-2");
const HEAT = UTAG("echoes", "spell/collection-heat");
const BRITTLE = UTAG("echoes", "spell/collection-brittle-state");
const HEAT_LOCK = UTAG("echoes", "spell/collection-heat-lock");
const BRITTLE_HIT = UTAG("echoes", "spell/collection-brittle-shatter-hit");
const WEBBING_ICD = UTAG("echoes", "spell/collection-webbing-icd");
const WEBBING_HIT = UTAG("echoes", "spell/collection-webbing-hit");
const STUN_3 = UTAG("echoes", "spell/collection-advanced-stun-3");
const RALLY = UTAG("echoes", "spell/collection-rally");
const ENCOURAGING_CRY = UTAG("echoes", "spell/collection-encouraging-cry");
const CHAMPION_HEAL = UTAG("echoes", "spell/collection-champion-heal");
const CINDERS = UTAG("echoes", "spell/collection-sanctum-cinders");
const CINDERS_ICD = UTAG("echoes", "spell/collection-sanctum-cinders-icd");
const CINDER_HIT = UTAG("echoes", "spell/collection-sanctum-cyclone-hit");
const CINDER_VISUAL = UTAG("echoes", "spell/collection-sanctum-cyclone-visual");
const FALLING_STARS = UTAG("echoes", "spell/collection-falling-stars");
const FALLING_STAR_HIT = UTAG("echoes", "spell/collection-falling-star-hit");
const BIG_BANG_HIT = UTAG("echoes", "spell/collection-big-bang-hit");
const CONTAGION = UTAG("echoes", "spell/collection-contagion");
const PLAGUEBRINGER_CURSE = UTAG("echoes", "spell/collection-plaguebringer-curse");
const PLAGUEBRINGER_CURSE_HIT = UTAG("echoes", "spell/collection-plaguebringer-curse-hit");
const DARK_NUCLEUS = UTAG("echoes", "spell/collection-dark-nucleus-active");
const DARK_NUCLEUS_ICD = UTAG("echoes", "spell/collection-dark-nucleus-icd");
const DARK_LANCE_HIT = UTAG("echoes", "spell/collection-dark-lance-hit");
const DEATHWHISPER_BARRIER = UTAG("echoes", "spell/collection-deathwhisper-barrier");
const DEATHWHISPER_ICD = UTAG("echoes", "spell/collection-deathwhisper-icd");
const DEATHWHISPER_PULSE = UTAG("echoes", "spell/collection-deathwhisper-pulse");
const DEFILE_HIT = UTAG("echoes", "spell/collection-defile-hit");
const DEFILE_VISUAL = UTAG("echoes", "spell/collection-defile-visual");
const DEMONIC_FORM = UTAG("echoes", "spell/collection-demonic-form");
const DEMONIC_ICD = UTAG("echoes", "spell/collection-demonic-icd");
const DEMONIC_HEAL = UTAG("echoes", "spell/collection-demonic-heal");
const DEMONIC_CLEAVE = UTAG("echoes", "spell/collection-demonic-cleave");
const SCORCHED_HIT = UTAG("echoes", "spell/collection-scorched-path-hit");
const SCORCHED_SLOW = UTAG("echoes", "spell/collection-scorched-path-slow");
const SCORCHED_VISUAL = UTAG("echoes", "spell/collection-scorched-path-visual");
const MUTATED_INFECTION = UTAG("echoes", "spell/collection-mutated-infection");
const MUTATED_PLAGUE = UTAG("echoes", "spell/collection-mutated-plague");
const STICKY_SLIME_HIT = UTAG("echoes", "spell/collection-sticky-slime-hit");
const STICKY_SLIME_VISUAL = UTAG("echoes", "spell/collection-sticky-slime-visual");
const MOLTEN_BLOOD = UTAG("echoes", "spell/collection-molten-blood");
const SHED_SKIN = UTAG("echoes", "spell/collection-shed-skin");
const POISON_SLIME_HIT = UTAG("echoes", "spell/collection-poison-slime-hit");
const POISON_SLIME_VISUAL = UTAG("echoes", "spell/collection-poison-slime-visual");
const STATIC_OVERFLOW_ICD = UTAG("echoes", "spell/collection-static-overflow-icd");
const STATIC_OVERFLOW_HIT = UTAG("echoes", "spell/collection-static-overflow-hit");
const STONE_SHATTER_MARK = UTAG("echoes", "spell/collection-stone-shatter-mark");
const STONE_SHATTER_HIT = UTAG("echoes", "spell/collection-stone-shatter-hit");
const STORM_COUNT = UTAG("echoes", "spell/collection-storm-conductor-count");
const STORM_HIT = UTAG("echoes", "spell/collection-storm-conductor-hit");
const BURNING_COMBUSTION = UTAG("echoes", "spell/collection-burning-combustion");
const SOUL_CONSUMPTION = UTAG("echoes", "spell/collection-soul-consumption");
const TWILIGHT_RIFT_HIT = UTAG("echoes", "spell/collection-twilight-rift-hit");
const TWILIGHT_RIFT_VISUAL = UTAG("echoes", "spell/collection-twilight-rift-visual");
const LIGHT_ESSENCE = UTAG("echoes", "spell/collection-light-essence");
const DARK_ESSENCE = UTAG("echoes", "spell/collection-dark-essence");
const LIGHT_CHARGE = UTAG("echoes", "spell/collection-light-charge");
const DARK_CHARGE = UTAG("echoes", "spell/collection-dark-charge");
const EQUILIBRIUM_ICD = UTAG("echoes", "spell/collection-equilibrium-icd");
const EQUILIBRIUM_SHADOW_HIT = UTAG("echoes", "spell/collection-equilibrium-shadow-hit");
const EQUILIBRIUM_HOLY_HIT = UTAG("echoes", "spell/collection-equilibrium-holy-hit");
const TOXICITY = UTAG("echoes", "spell/collection-toxicity");
const WIDOWS_VENOM_ICD = UTAG("echoes", "spell/collection-widows-venom-icd");
const WIDOWS_VOLLEY_HIT = UTAG("echoes", "spell/collection-widows-volley-hit");
const WIDOWS_VENOM_DOT = UTAG("echoes", "spell/collection-widows-venom-dot");

const ADVANCED_DAMAGE_HELPERS: TSArray<number> = [
    STUN_2, STUN_3, CHAMPION_HEAL, DEATHWHISPER_BARRIER,
    DEMONIC_HEAL, SCORCHED_SLOW,
    BLIGHT_HIT, BRITTLE_HIT, WEBBING_HIT, CINDER_HIT,
    FALLING_STAR_HIT, BIG_BANG_HIT, PLAGUEBRINGER_CURSE_HIT,
    DARK_LANCE_HIT, DEATHWHISPER_PULSE, DEFILE_HIT,
    DEMONIC_CLEAVE, SCORCHED_HIT, MUTATED_INFECTION,
    MUTATED_PLAGUE, STICKY_SLIME_HIT, POISON_SLIME_HIT,
    STATIC_OVERFLOW_HIT, STONE_SHATTER_HIT, STORM_HIT,
    BURNING_COMBUSTION, SOUL_CONSUMPTION, TWILIGHT_RIFT_HIT,
    EQUILIBRIUM_SHADOW_HIT, EQUILIBRIUM_HOLY_HIT,
    WIDOWS_VOLLEY_HIT, WIDOWS_VENOM_DOT,
];

const SCHOOL_PHYSICAL = 1;
const SCHOOL_HOLY = 2;
const SCHOOL_FIRE = 4;
const SCHOOL_NATURE = 8;
const SCHOOL_FROST = 16;
const SCHOOL_SHADOW = 32;
const SCHOOL_ARCANE = 64;
const MAX_TIMED_ZONES = 24;
const MAX_TRACKED_TARGETS = 256;

class TimedZones {
    maps: TSArray<number> = [];
    x: TSArray<number> = [];
    y: TSArray<number> = [];
    z: TSArray<number> = [];
    ticks: TSArray<number> = [];

    add(map: number, x: number, y: number, z: number, ticks: number): void {
        if (this.ticks.length >= MAX_TIMED_ZONES) {
            const maps: TSArray<number> = [];
            const nextX: TSArray<number> = [];
            const nextY: TSArray<number> = [];
            const nextZ: TSArray<number> = [];
            const nextTicks: TSArray<number> = [];
            const first = this.ticks.length - MAX_TIMED_ZONES + 1;
            for (let i = first; i < this.ticks.length; i++) {
                maps.push(this.maps[i]);
                nextX.push(this.x[i]);
                nextY.push(this.y[i]);
                nextZ.push(this.z[i]);
                nextTicks.push(this.ticks[i]);
            }
            this.maps = maps;
            this.x = nextX;
            this.y = nextY;
            this.z = nextZ;
            this.ticks = nextTicks;
        }
        this.maps.push(map);
        this.x.push(x);
        this.y.push(y);
        this.z.push(z);
        this.ticks.push(ticks);
    }

    clear(): void {
        this.maps = [];
        this.x = [];
        this.y = [];
        this.z = [];
        this.ticks = [];
    }
}

class AdvancedEchoRuntime {
    lastTargetGUID: TSGUID | undefined = undefined;
    trackedTargets: TSArray<TSGUID> = [];
    plagueVisited: TSArray<TSGUID> = [];
    healingGuard: boolean = false;
    darkNucleusAbsorbed: number = 0;
    darkNucleusLimit: number = 0;
    cinderMap: number = -1;
    cinderX: number = 0;
    cinderY: number = 0;
    cinderZ: number = 0;
    cinderTicks: number = 0;
    defileMap: number = -1;
    defileX: number = 0;
    defileY: number = 0;
    defileZ: number = 0;
    defileTicks: number = 0;
    defileGrowth: number = 0;
    huskMap: number = -1;
    huskX: number = 0;
    huskY: number = 0;
    huskZ: number = 0;
    huskTicks: number = 0;
    staticChargeTicks: number = 0;
    lastMoveMap: number = -1;
    lastMoveX: number = 0;
    lastMoveY: number = 0;
    lastMoveZ: number = 0;
    scorched: TimedZones = new TimedZones();
    slime: TimedZones = new TimedZones();
    twilight: TimedZones = new TimedZones();
}

function advancedRuntime(player: TSPlayer): AdvancedEchoRuntime {
    return player.GetObject("AdvancedEchoRuntime", new AdvancedEchoRuntime());
}

function advancedActive(player: TSPlayer, localIndex: number): boolean {
    if (localIndex < 0 || localIndex >= ADVANCED_CONTROLLER_IDS.length) return false;
    const spellId = ADVANCED_CONTROLLER_IDS[localIndex];
    if (player.HasAura(spellId)) return true;
    const collectionIndex = ADVANCED_START_INDEX + localIndex;
    const row = EchoCollectionRow.get(player).find(
        entry => Number(entry.echoIndex) == collectionIndex,
    );
    if (!row || Number(row.activeSlot) <= 0) return false;
    if (!player.HasSpell(spellId)) player.LearnSpell(spellId);
    if (!player.HasAura(spellId)) player.AddAura(spellId, player);
    return true;
}

function sameGUID(left: TSGUID, right: TSGUID): boolean {
    return Number(left.GetType()) == Number(right.GetType())
        && Number(left.GetCounter()) == Number(right.GetCounter());
}

function enemyTarget(player: TSPlayer, target: TSUnit): boolean {
    if (target.IsDead() || sameGUID(player.GetGUID(), target.GetGUID())) return false;
    return !player.IsFriendlyTo(target) && !target.IsFriendlyTo(player);
}

function trackTarget(player: TSPlayer, target: TSUnit): void {
    const runtime = advancedRuntime(player);
    const guid = target.GetGUID();
    for (let i = 0; i < runtime.trackedTargets.length; i++) {
        if (sameGUID(runtime.trackedTargets[i], guid)) return;
    }
    if (runtime.trackedTargets.length >= MAX_TRACKED_TARGETS) {
        const retained: TSArray<TSGUID> = [];
        const first = runtime.trackedTargets.length - MAX_TRACKED_TARGETS + 1;
        for (let i = first; i < runtime.trackedTargets.length; i++) {
            retained.push(runtime.trackedTargets[i]);
        }
        runtime.trackedTargets = retained;
    }
    runtime.trackedTargets.push(guid);
}

function rememberTarget(player: TSPlayer, target: TSUnit): void {
    advancedRuntime(player).lastTargetGUID = target.GetGUID();
}

function latestTarget(player: TSPlayer): TSUnit | undefined {
    const guid = advancedRuntime(player).lastTargetGUID;
    if (!guid) return undefined;
    const target = player.GetUnit(guid);
    if (!target || target.IsDead() || !enemyTarget(player, target)) return undefined;
    return target;
}

function spellPower(player: TSPlayer): number {
    let value = 0;
    for (let school = 1; school <= 6; school++) {
        value = Math.max(value, Number(player.GetBaseSpellPower(school)));
    }
    return value;
}

function attackPower(player: TSPlayer): number {
    const base = Number(player.GetCoreInt32(UnitFields.UNIT_FIELD_ATTACK_POWER));
    const positive = Number(player.GetCoreUInt16(UnitFields.UNIT_FIELD_ATTACK_POWER_MODS, 0));
    const negative = Number(player.GetCoreUInt16(UnitFields.UNIT_FIELD_ATTACK_POWER_MODS, 1));
    const multiplier = 1 + Number(player.GetCoreFloat(UnitFields.UNIT_FIELD_ATTACK_POWER_MULTIPLIER));
    return Math.max(0, (base + positive - negative) * multiplier);
}

function scaledDamage(player: TSPlayer, base: number, sp: number, ap: number): number {
    return Math.max(1, Math.floor(base + spellPower(player) * sp + attackPower(player) * ap));
}

function refreshAura(caster: TSPlayer, target: TSUnit, spellId: number): TSAura | undefined {
    let aura = target.GetAura(spellId, caster.GetGUID());
    if (!aura) aura = caster.AddAura(spellId, target);
    if (aura && Number(aura.GetMaxDuration()) > 0) aura.SetDuration(Number(aura.GetMaxDuration()));
    return aura;
}

function addStack(
    caster: TSPlayer,
    target: TSUnit,
    spellId: number,
    maximum: number,
): number {
    let aura = target.GetAura(spellId, caster.GetGUID());
    const current = aura ? Number(aura.GetStackAmount()) : 0;
    if (!aura) aura = caster.AddAura(spellId, target);
    if (!aura) return current;
    const next = Math.min(maximum, current + 1);
    aura.SetStackAmount(next as uint8);
    if (Number(aura.GetMaxDuration()) > 0) aura.SetDuration(Number(aura.GetMaxDuration()));
    return next;
}

function ownAura(caster: TSPlayer, target: TSUnit, spellId: number): TSAura | undefined {
    return target.GetAura(spellId, caster.GetGUID());
}

function removeOwnAura(caster: TSPlayer, target: TSUnit, spellId: number): void {
    const aura = ownAura(caster, target, spellId);
    if (aura) aura.Remove();
}

function castDamage(player: TSPlayer, target: TSUnit, spellId: number, amount: number): void {
    if (!enemyTarget(player, target)) return;
    player.CastCustomSpell(target, spellId, true, Math.max(1, Math.floor(amount)));
}

function enemiesAround(player: TSPlayer, center: TSUnit, radius: number): TSArray<TSUnit> {
    const result: TSArray<TSUnit> = [];
    if (enemyTarget(player, center) && !center.IsDead()) result.push(center);
    const nearby = center.GetUnitsInRange(radius, 0, 1);
    for (let i = 0; i < nearby.length; i++) {
        const unit = nearby[i];
        if (!enemyTarget(player, unit) || unit.IsDead()) continue;
        let duplicate = false;
        for (let j = 0; j < result.length; j++) {
            if (sameGUID(result[j].GetGUID(), unit.GetGUID())) duplicate = true;
        }
        if (!duplicate) result.push(unit);
    }
    return result;
}

function zoneEnemies(
    player: TSPlayer,
    mapId: number,
    x: number,
    y: number,
    z: number,
    radius: number,
): TSArray<TSUnit> {
    const result: TSArray<TSUnit> = [];
    if (Number(player.GetMapID()) != mapId) return result;
    const units = player.GetUnitsInRange(100, 0, 1);
    const radius2 = radius * radius;
    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (!enemyTarget(player, unit) || unit.IsDead()) continue;
        const dx = Number(unit.GetX()) - x;
        const dy = Number(unit.GetY()) - y;
        const dz = Number(unit.GetZ()) - z;
        if (dx * dx + dy * dy + dz * dz <= radius2) result.push(unit);
    }
    return result;
}

function hitUnits(
    player: TSPlayer,
    units: TSArray<TSUnit>,
    spellId: number,
    amount: number,
    controlId: number = 0,
    stackId: number = 0,
): void {
    for (let i = 0; i < units.length; i++) {
        castDamage(player, units[i], spellId, amount);
        if (!units[i].IsDead() && controlId > 0) player.CastSpell(units[i], controlId, true);
        if (!units[i].IsDead() && stackId > 0) addStack(player, units[i], stackId, 5);
    }
}

function hitArea(
    player: TSPlayer,
    center: TSUnit,
    radius: number,
    spellId: number,
    amount: number,
    controlId: number = 0,
): void {
    hitUnits(player, enemiesAround(player, center, radius), spellId, amount, controlId);
}

function hitAdditional(
    player: TSPlayer,
    center: TSUnit,
    excluded: TSUnit,
    radius: number,
    maximum: number,
    spellId: number,
    amount: number,
): void {
    const units = enemiesAround(player, center, radius);
    let hits = 0;
    for (let i = 0; i < units.length && hits < maximum; i++) {
        if (sameGUID(units[i].GetGUID(), excluded.GetGUID())) continue;
        castDamage(player, units[i], spellId, amount);
        hits++;
    }
}

function tickTimedZones(
    player: TSPlayer,
    zones: TimedZones,
    radius: number,
    spellId: number,
    amount: number,
    controlId: number = 0,
    stackId: number = 0,
    visualId: number = 0,
): void {
    const next = new TimedZones();
    for (let i = 0; i < zones.ticks.length; i++) {
        if (zones.ticks[i] <= 0) continue;
        const units = zoneEnemies(
            player, zones.maps[i], zones.x[i], zones.y[i], zones.z[i], radius,
        );
        if (visualId > 0 && Number(player.GetMapID()) == zones.maps[i]) {
            player.CastSpellAoF(zones.x[i], zones.y[i], zones.z[i], visualId, true);
        }
        hitUnits(player, units, spellId, amount, controlId, stackId);
        if (zones.ticks[i] > 1) {
            next.add(zones.maps[i], zones.x[i], zones.y[i], zones.z[i], zones.ticks[i] - 1);
        }
    }
    zones.maps = next.maps;
    zones.x = next.x;
    zones.y = next.y;
    zones.z = next.z;
    zones.ticks = next.ticks;
}

function controllerLocalIndex(spellId: number): number {
    for (let i = 0; i < ADVANCED_CONTROLLER_IDS.length; i++) {
        if (ADVANCED_CONTROLLER_IDS[i] == spellId) return i;
    }
    return -1;
}

export function isAdvancedEchoDamageHelper(spellId: number): boolean {
    for (let i = 0; i < ADVANCED_DAMAGE_HELPERS.length; i++) {
        if (ADVANCED_DAMAGE_HELPERS[i] == spellId) return true;
    }
    return false;
}

function removePlayerAuras(player: TSPlayer, ids: TSArray<number>): void {
    for (let i = 0; i < ids.length; i++) {
        if (player.HasAura(ids[i])) player.RemoveAura(ids[i]);
    }
}

function removeTrackedAuras(player: TSPlayer, ids: TSArray<number>): void {
    const targets = advancedRuntime(player).trackedTargets;
    for (let i = 0; i < targets.length; i++) {
        const target = player.GetUnit(targets[i]);
        if (!target) continue;
        for (let j = 0; j < ids.length; j++) removeOwnAura(player, target, ids[j]);
    }
}

export function removeAdvancedEchoRuntime(player: TSPlayer, echoIndex: number): void {
    const local = echoIndex - ADVANCED_START_INDEX;
    if (local < 0 || local >= ADVANCED_CONTROLLER_IDS.length) return;
    const runtime = advancedRuntime(player);
    if (local == ADV_BLIGHTED_SKY) removePlayerAuras(player, [BLIGHT, BLIGHT_ICD]);
    if (local == ADV_BRITTLE_FORGING) removeTrackedAuras(player, [HEAT, BRITTLE, HEAT_LOCK]);
    if (local == ADV_WEBBING) removePlayerAuras(player, [WEBBING_ICD]);
    if (local == ADV_CHAMPIONS_RALLY) {
        removePlayerAuras(player, [RALLY]);
        removeTrackedAuras(player, [ENCOURAGING_CRY]);
    }
    if (local == ADV_CINDERS) {
        removePlayerAuras(player, [CINDERS, CINDERS_ICD]);
        runtime.cinderTicks = 0;
    }
    if (local == ADV_CONSTELLATIONS) removePlayerAuras(player, [FALLING_STARS]);
    if (local == ADV_PLAGUEBRINGER) {
        removeTrackedAuras(player, [CONTAGION, PLAGUEBRINGER_CURSE]);
        runtime.plagueVisited = [];
    }
    if (local == ADV_DARK_NUCLEUS) {
        removePlayerAuras(player, [DARK_NUCLEUS, DARK_NUCLEUS_ICD]);
        runtime.darkNucleusAbsorbed = 0;
        runtime.darkNucleusLimit = 0;
    }
    if (local == ADV_DEATHWHISPER) removePlayerAuras(player, [DEATHWHISPER_BARRIER, DEATHWHISPER_ICD]);
    if (local == ADV_DEFILE) {
        runtime.defileTicks = 0;
        runtime.defileGrowth = 0;
    }
    if (local == ADV_DEMONIC) removePlayerAuras(player, [DEMONIC_FORM, DEMONIC_ICD]);
    if (local == ADV_SCORCHED_PATH) {
        runtime.scorched.clear();
        runtime.lastMoveMap = -1;
    }
    if (local == ADV_SLIME_SPRAY) {
        removeTrackedAuras(player, [MUTATED_INFECTION, MUTATED_PLAGUE]);
        runtime.slime.clear();
    }
    if (local == ADV_SLIMEBOUND) {
        removePlayerAuras(player, [MOLTEN_BLOOD, SHED_SKIN]);
        runtime.huskTicks = 0;
    }
    if (local == ADV_STATIC_OVERFLOW) {
        removePlayerAuras(player, [STATIC_OVERFLOW_ICD]);
        runtime.staticChargeTicks = 0;
    }
    if (local == ADV_STONE_SHATTER) removeTrackedAuras(player, [STONE_SHATTER_MARK]);
    if (local == ADV_STORM_CONDUCTOR) removePlayerAuras(player, [STORM_COUNT]);
    if (local == ADV_TWILIGHT_COMBUSTION) {
        removeTrackedAuras(player, [BURNING_COMBUSTION, SOUL_CONSUMPTION]);
        runtime.twilight.clear();
    }
    if (local == ADV_TWILIGHT_EQUILIBRIUM) {
        removePlayerAuras(player, [LIGHT_ESSENCE, DARK_ESSENCE, LIGHT_CHARGE, DARK_CHARGE, EQUILIBRIUM_ICD]);
    }
    if (local == ADV_WIDOWS_VENOM) {
        removePlayerAuras(player, [TOXICITY, WIDOWS_VENOM_ICD]);
        removeTrackedAuras(player, [WIDOWS_VENOM_DOT]);
    }
}

export function resetAdvancedEchoRuntime(player: TSPlayer): void {
    if (player.HasAura(DARK_NUCLEUS)) player.RemoveAura(DARK_NUCLEUS);
    if (player.HasAura(DEATHWHISPER_BARRIER)) player.RemoveAura(DEATHWHISPER_BARRIER);
    player.SetObject("AdvancedEchoRuntime", new AdvancedEchoRuntime());
}

function triggerBlightedSky(player: TSPlayer, target: TSUnit): void {
    if (player.HasAura(BLIGHT_ICD)) return;
    const stacks = addStack(player, player, BLIGHT, 5);
    if (stacks < 5) return;
    player.RemoveAura(BLIGHT);
    refreshAura(player, player, BLIGHT_ICD);
    hitArea(player, target, 8, BLIGHT_HIT, scaledDamage(player, 40, 0.8, 0.4), STUN_2);
}

function triggerBrittleForging(player: TSPlayer, target: TSUnit, isCrit: boolean): void {
    const brittle = ownAura(player, target, BRITTLE);
    if (brittle && isCrit) {
        brittle.Remove();
        refreshAura(player, target, HEAT_LOCK);
        hitArea(player, target, 8, BRITTLE_HIT, scaledDamage(player, 30, 1, 0.5));
        return;
    }
    if (brittle || ownAura(player, target, HEAT_LOCK)) return;
    trackTarget(player, target);
    if (addStack(player, target, HEAT, 8) < 8) return;
    removeOwnAura(player, target, HEAT);
    refreshAura(player, target, BRITTLE);
}

function triggerCinders(player: TSPlayer): void {
    if (player.HasAura(CINDERS_ICD)) return;
    if (addStack(player, player, CINDERS, 12) < 12) return;
    player.RemoveAura(CINDERS);
    refreshAura(player, player, CINDERS_ICD);
    const runtime = advancedRuntime(player);
    runtime.cinderMap = Number(player.GetMapID());
    runtime.cinderX = Number(player.GetX());
    runtime.cinderY = Number(player.GetY());
    runtime.cinderZ = Number(player.GetZ());
    runtime.cinderTicks = 8;
}

function triggerConstellations(player: TSPlayer, target: TSUnit): void {
    if (Math.random() >= 0.25) return;
    castDamage(player, target, FALLING_STAR_HIT, scaledDamage(player, 20, 0.5, 0.25));
    if (addStack(player, player, FALLING_STARS, 5) < 5) return;
    player.RemoveAura(FALLING_STARS);
    const units = enemiesAround(player, target, 10);
    if (units.length == 0) return;
    const divided = Math.max(1, Math.floor(scaledDamage(player, 100, 2.5, 1.25) / units.length));
    hitUnits(player, units, BIG_BANG_HIT, divided);
}

function triggerPlaguebringer(player: TSPlayer, target: TSUnit): void {
    if (ownAura(player, target, PLAGUEBRINGER_CURSE)) return;
    trackTarget(player, target);
    if (addStack(player, target, CONTAGION, 8) < 8) return;
    removeOwnAura(player, target, CONTAGION);
    const runtime = advancedRuntime(player);
    removeTrackedAuras(player, [PLAGUEBRINGER_CURSE]);
    runtime.plagueVisited = [target.GetGUID()];
    refreshAura(player, target, PLAGUEBRINGER_CURSE);
}

function triggerSlimeSpray(player: TSPlayer, target: TSUnit): void {
    if (ownAura(player, target, MUTATED_INFECTION)
        || Math.random() >= 0.15) return;
    refreshAura(player, target, MUTATED_INFECTION);
    trackTarget(player, target);
}

function triggerStaticOverflow(player: TSPlayer, target: TSUnit): void {
    const runtime = advancedRuntime(player);
    if (player.HasAura(STATIC_OVERFLOW_ICD) || runtime.staticChargeTicks < 10) return;
    runtime.staticChargeTicks = 0;
    refreshAura(player, player, STATIC_OVERFLOW_ICD);
    hitAdditional(
        player, target, target, 12, 3, STATIC_OVERFLOW_HIT,
        scaledDamage(player, 20, 0.4, 0.2),
    );
}

function triggerStoneShatter(player: TSPlayer, target: TSUnit): void {
    if (ownAura(player, target, STONE_SHATTER_MARK)) return;
    refreshAura(player, target, STONE_SHATTER_MARK);
    trackTarget(player, target);
}

function triggerStormConductor(player: TSPlayer, target: TSUnit): void {
    if (addStack(player, player, STORM_COUNT, 5) < 5) return;
    player.RemoveAura(STORM_COUNT);
    const amount = scaledDamage(player, 30, 0.75, 0.375);
    castDamage(player, target, STORM_HIT, amount);
    hitAdditional(player, target, target, 12, 3, STORM_HIT, amount);
}

function triggerTwilightCombustion(player: TSPlayer, target: TSUnit, schoolMask: number): void {
    trackTarget(player, target);
    if ((schoolMask & SCHOOL_FIRE) != 0) refreshAura(player, target, BURNING_COMBUSTION);
    if ((schoolMask & SCHOOL_SHADOW) != 0) refreshAura(player, target, SOUL_CONSUMPTION);
    if (!ownAura(player, target, BURNING_COMBUSTION)
        || !ownAura(player, target, SOUL_CONSUMPTION)) return;
    removeOwnAura(player, target, BURNING_COMBUSTION);
    removeOwnAura(player, target, SOUL_CONSUMPTION);
    advancedRuntime(player).twilight.add(
        Number(player.GetMapID()), Number(target.GetX()), Number(target.GetY()), Number(target.GetZ()), 8,
    );
}

function ensureEquilibriumEssence(player: TSPlayer): void {
    if (player.HasAura(LIGHT_ESSENCE) || player.HasAura(DARK_ESSENCE)) return;
    refreshAura(player, player, LIGHT_ESSENCE);
}

function triggerTwilightEquilibrium(player: TSPlayer, target: TSUnit, schoolMask: number): void {
    ensureEquilibriumEssence(player);
    if (player.HasAura(EQUILIBRIUM_ICD)) return;
    const lightSchool = (schoolMask & (SCHOOL_HOLY | SCHOOL_FIRE | SCHOOL_NATURE)) != 0;
    const darkSchool = (schoolMask & (SCHOOL_SHADOW | SCHOOL_FROST | SCHOOL_ARCANE)) != 0;
    if (player.HasAura(LIGHT_ESSENCE)) {
        if (lightSchool) addStack(player, player, LIGHT_CHARGE, 8);
        if (!darkSchool) return;
        const charges = player.HasAura(LIGHT_CHARGE) ? Number(player.GetAura(LIGHT_CHARGE)!.GetStackAmount()) : 0;
        if (charges <= 0) return;
        player.RemoveAura(LIGHT_CHARGE);
        player.RemoveAura(LIGHT_ESSENCE);
        refreshAura(player, player, DARK_ESSENCE);
        refreshAura(player, player, EQUILIBRIUM_ICD);
        hitArea(
            player, target, 8, EQUILIBRIUM_SHADOW_HIT,
            scaledDamage(player, 0, 0.15, 0.075) * charges,
        );
        return;
    }
    if (darkSchool) addStack(player, player, DARK_CHARGE, 8);
    if (!lightSchool) return;
    const charges = player.HasAura(DARK_CHARGE) ? Number(player.GetAura(DARK_CHARGE)!.GetStackAmount()) : 0;
    if (charges <= 0) return;
    player.RemoveAura(DARK_CHARGE);
    player.RemoveAura(DARK_ESSENCE);
    refreshAura(player, player, LIGHT_ESSENCE);
    refreshAura(player, player, EQUILIBRIUM_ICD);
    hitArea(
        player, target, 8, EQUILIBRIUM_HOLY_HIT,
        scaledDamage(player, 0, 0.15, 0.075) * charges,
    );
}

function triggerWidowsVenom(player: TSPlayer): void {
    if (player.HasAura(WIDOWS_VENOM_ICD)) return;
    if (addStack(player, player, TOXICITY, 10) < 10) return;
    player.RemoveAura(TOXICITY);
    refreshAura(player, player, WIDOWS_VENOM_ICD);
    const units = enemiesAround(player, player, 10);
    const amount = scaledDamage(player, 40, 1, 0.5);
    for (let i = 0; i < units.length; i++) {
        castDamage(player, units[i], WIDOWS_VOLLEY_HIT, amount);
        refreshAura(player, units[i], WIDOWS_VENOM_DOT);
        trackTarget(player, units[i]);
    }
}

function handleOutgoingDamage(
    player: TSPlayer,
    target: TSUnit,
    schoolMask: number,
    amount: number,
    isCrit: boolean,
    direct: boolean,
    spellId: number,
): void {
    if (amount <= 0 || !enemyTarget(player, target) || isAdvancedEchoDamageHelper(spellId)) return;
    rememberTarget(player, target);
    if (advancedActive(player, ADV_BLIGHTED_SKY) && (schoolMask & SCHOOL_SHADOW) != 0) {
        triggerBlightedSky(player, target);
    }
    if (advancedActive(player, ADV_BRITTLE_FORGING) && (schoolMask & SCHOOL_FIRE) != 0) {
        triggerBrittleForging(player, target, isCrit);
    }
    if (advancedActive(player, ADV_CINDERS) && (schoolMask & SCHOOL_FIRE) != 0) triggerCinders(player);
    if (advancedActive(player, ADV_CONSTELLATIONS) && isCrit) triggerConstellations(player, target);
    if (advancedActive(player, ADV_PLAGUEBRINGER) && (schoolMask & SCHOOL_SHADOW) != 0) {
        triggerPlaguebringer(player, target);
    }
    if (advancedActive(player, ADV_SLIME_SPRAY) && direct) triggerSlimeSpray(player, target);
    if (advancedActive(player, ADV_STATIC_OVERFLOW) && direct) triggerStaticOverflow(player, target);
    if (advancedActive(player, ADV_STONE_SHATTER) && direct) triggerStoneShatter(player, target);
    if (advancedActive(player, ADV_STORM_CONDUCTOR) && direct) triggerStormConductor(player, target);
    if (advancedActive(player, ADV_TWILIGHT_COMBUSTION)
        && (schoolMask & (SCHOOL_FIRE | SCHOOL_SHADOW)) != 0) {
        triggerTwilightCombustion(player, target, schoolMask);
    }
    if (advancedActive(player, ADV_TWILIGHT_EQUILIBRIUM)) {
        triggerTwilightEquilibrium(player, target, schoolMask);
    }
    if (advancedActive(player, ADV_WIDOWS_VENOM) && (schoolMask & SCHOOL_NATURE) != 0) {
        triggerWidowsVenom(player);
    }
    if (advancedActive(player, ADV_DEMONIC) && player.HasAura(DEMONIC_FORM) && direct) {
        const runtime = advancedRuntime(player);
        runtime.healingGuard = true;
        player.CastCustomSpell(player, DEMONIC_HEAL, true, Math.max(1, Math.floor(amount * 0.1)));
        runtime.healingGuard = false;
        hitAdditional(
            player, target, target, 8, 1, DEMONIC_CLEAVE,
            Math.max(1, Math.floor(amount * 0.3)),
        );
    }
}

function fireDarkNucleus(player: TSPlayer): void {
    const runtime = advancedRuntime(player);
    const target = latestTarget(player);
    if (target && runtime.darkNucleusAbsorbed > 0) {
        castDamage(player, target, DARK_LANCE_HIT, runtime.darkNucleusAbsorbed * 2);
    }
    runtime.darkNucleusAbsorbed = 0;
    runtime.darkNucleusLimit = 0;
    if (player.HasAura(DARK_NUCLEUS)) player.RemoveAura(DARK_NUCLEUS);
}

function handleIncomingDamage(
    player: TSPlayer,
    attacker: TSUnit | undefined,
    damage: any,
    direct: boolean,
    triggerResponse: boolean = true,
    additionalIncoming: number = 0,
): void {
    const raw = Math.max(0, Number(damage.get()));
    let extra = Math.max(0, additionalIncoming);
    if (raw <= 0 && (!triggerResponse || extra <= 0)) return;
    if (triggerResponse && attacker && enemyTarget(player, attacker)) rememberTarget(player, attacker);
    const runtime = advancedRuntime(player);

    if (direct && advancedActive(player, ADV_DARK_NUCLEUS)) {
        if (!player.HasAura(DARK_NUCLEUS)
            && !player.HasAura(DARK_NUCLEUS_ICD)
            && triggerResponse
            && Math.random() < 0.20) {
            refreshAura(player, player, DARK_NUCLEUS);
            refreshAura(player, player, DARK_NUCLEUS_ICD);
            runtime.darkNucleusAbsorbed = 0;
            runtime.darkNucleusLimit = Math.max(1, Math.floor(Number(player.GetMaxHealth()) * 0.20));
        }
        if (player.HasAura(DARK_NUCLEUS) && runtime.darkNucleusLimit > runtime.darkNucleusAbsorbed) {
            const absorb = Math.min(
                Math.floor(raw * 0.20),
                runtime.darkNucleusLimit - runtime.darkNucleusAbsorbed,
            );
            if (absorb > 0) {
                damage.set(Math.max(0, raw - absorb));
                runtime.darkNucleusAbsorbed += absorb;
                if (runtime.darkNucleusAbsorbed >= runtime.darkNucleusLimit) fireDarkNucleus(player);
            }
        }
    }
    if (!triggerResponse) return;

    const maximumHealth = Math.max(1, Number(player.GetMaxHealth()));
    let projectedDamage = Math.max(0, Number(damage.get())) + extra;
    let projectedPct = (Number(player.GetHealth()) - projectedDamage) * 100 / maximumHealth;
    if (advancedActive(player, ADV_DEATHWHISPER)
        && projectedPct < 40
        && !player.HasAura(DEATHWHISPER_BARRIER)
        && !player.HasAura(DEATHWHISPER_ICD)) {
        const mana = Number(player.GetMaxPower(0));
        const capacity = mana > 0
            ? Math.floor(mana * 0.25)
            : Math.floor(Number(player.GetMaxHealth()) * 0.125);
        const incoming = Math.max(0, Number(damage.get()));
        const absorbed = Math.min(incoming, Math.max(1, capacity));
        damage.set(incoming - absorbed);
        const remaining = Math.max(0, capacity - absorbed);
        if (remaining > 0) {
            player.CastCustomSpell(player, DEATHWHISPER_BARRIER, true, remaining);
            extra = Math.max(0, extra - remaining);
        }
        refreshAura(player, player, DEATHWHISPER_ICD);
    }
    projectedDamage = Math.max(0, Number(damage.get())) + extra;
    projectedPct = (Number(player.GetHealth()) - projectedDamage) * 100 / maximumHealth;
    if (advancedActive(player, ADV_WEBBING)
        && projectedPct < 35
        && !player.HasAura(WEBBING_ICD)) {
        refreshAura(player, player, WEBBING_ICD);
        hitArea(player, player, 10, WEBBING_HIT, scaledDamage(player, 30, 1, 0.5), STUN_3);
    }
    if (advancedActive(player, ADV_DEMONIC)
        && projectedPct < 35
        && !player.HasAura(DEMONIC_FORM)
        && !player.HasAura(DEMONIC_ICD)) {
        refreshAura(player, player, DEMONIC_FORM);
        refreshAura(player, player, DEMONIC_ICD);
    }
    if (direct && advancedActive(player, ADV_SLIMEBOUND)) {
        if (addStack(player, player, MOLTEN_BLOOD, 5) >= 5) {
            player.RemoveAura(MOLTEN_BLOOD);
            runtime.huskMap = Number(player.GetMapID());
            runtime.huskX = Number(player.GetX());
            runtime.huskY = Number(player.GetY());
            runtime.huskZ = Number(player.GetZ());
            runtime.huskTicks = 8;
            refreshAura(player, player, SHED_SKIN);
        }
    }
}

function lowestInjuredFriendly(player: TSPlayer, around: TSUnit, excluded: TSUnit): TSUnit | undefined {
    let best: TSUnit | undefined = undefined;
    let bestPct = 101;
    const playerDx = Number(player.GetX()) - Number(around.GetX());
    const playerDy = Number(player.GetY()) - Number(around.GetY());
    const playerDz = Number(player.GetZ()) - Number(around.GetZ());
    if (!sameGUID(player.GetGUID(), excluded.GetGUID())
        && playerDx * playerDx + playerDy * playerDy + playerDz * playerDz <= 15 * 15
        && !player.IsFullHealth()) {
        best = player;
        bestPct = Number(player.GetHealthPct());
    }
    const units = around.GetUnitsInRange(15, 0, 1);
    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (sameGUID(unit.GetGUID(), excluded.GetGUID())
            || !player.IsFriendlyTo(unit)
            || unit.IsFullHealth()) continue;
        const pct = Number(unit.GetHealthPct());
        if (pct < bestPct) {
            best = unit;
            bestPct = pct;
        }
    }
    return best;
}

function hasEncouragingCry(player: TSPlayer, currentTarget: TSUnit): boolean {
    if (ownAura(player, currentTarget, ENCOURAGING_CRY)) return true;
    const tracked = advancedRuntime(player).trackedTargets;
    for (let i = 0; i < tracked.length; i++) {
        const target = player.GetUnit(tracked[i]);
        if (target && ownAura(player, target, ENCOURAGING_CRY)) return true;
    }
    return false;
}

function handleHeal(healer: TSUnit, target: TSUnit, heal: TSMutableNumber<uint32>): void {
    const player = healer.ToPlayer();
    if (!player || !advancedActive(player, ADV_CHAMPIONS_RALLY)) return;
    const runtime = advancedRuntime(player);
    if (runtime.healingGuard || Number(heal.get()) <= 0) return;
    if (hasEncouragingCry(player, target)) {
        const ally = lowestInjuredFriendly(player, target, target);
        if (ally) {
            runtime.healingGuard = true;
            player.CastCustomSpell(
                ally, CHAMPION_HEAL, true,
                Math.max(1, Math.floor(Number(heal.get()) * 0.30)),
            );
            runtime.healingGuard = false;
        }
    }
    if (addStack(player, player, RALLY, 5) < 5) return;
    player.RemoveAura(RALLY);
    runtime.healingGuard = true;
    player.CastCustomSpell(target, CHAMPION_HEAL, true, Math.floor(50 + spellPower(player)));
    runtime.healingGuard = false;
    refreshAura(player, target, ENCOURAGING_CRY);
    trackTarget(player, target);
}

function tickController(effect: TSAuraEffect): void {
    const aura = effect.GetAura();
    const owner = aura.GetOwner().ToPlayer();
    if (!owner) return;
    const local = controllerLocalIndex(Number(aura.GetAuraID()));
    if (local < 0) return;
    const runtime = advancedRuntime(owner);
    if (local == ADV_CINDERS && runtime.cinderTicks > 0) {
        if (runtime.cinderMap == Number(owner.GetMapID())) {
            owner.CastSpellAoF(
                runtime.cinderX, runtime.cinderY, runtime.cinderZ, CINDER_VISUAL, true,
            );
        }
        hitUnits(
            owner,
            zoneEnemies(owner, runtime.cinderMap, runtime.cinderX, runtime.cinderY, runtime.cinderZ, 8),
            CINDER_HIT,
            scaledDamage(owner, 15, 0.3, 0.15),
        );
        runtime.cinderTicks--;
    }
    if (local == ADV_DEFILE && runtime.defileTicks > 0) {
        if (runtime.defileMap == Number(owner.GetMapID())) {
            owner.CastSpellAoF(
                runtime.defileX, runtime.defileY, runtime.defileZ, DEFILE_VISUAL, true,
            );
        }
        hitUnits(
            owner,
            zoneEnemies(
                owner, runtime.defileMap, runtime.defileX, runtime.defileY, runtime.defileZ,
                6 + runtime.defileGrowth,
            ),
            DEFILE_HIT,
            Math.floor(scaledDamage(owner, 20, 0.4, 0.2) * (1 + runtime.defileGrowth * 0.20)),
        );
        runtime.defileTicks--;
    }
    if (local == ADV_SCORCHED_PATH) {
        tickTimedZones(
            owner, runtime.scorched, 3, SCORCHED_HIT,
            scaledDamage(owner, 8, 0.2, 0.1), SCORCHED_SLOW, 0, SCORCHED_VISUAL,
        );
        const mapId = Number(owner.GetMapID());
        const x = Number(owner.GetX());
        const y = Number(owner.GetY());
        const z = Number(owner.GetZ());
        if (runtime.lastMoveMap != mapId) {
            runtime.lastMoveMap = mapId;
            runtime.lastMoveX = x;
            runtime.lastMoveY = y;
            runtime.lastMoveZ = z;
        } else if (owner.IsInCombat() && owner.IsMoving()) {
            const dx = x - runtime.lastMoveX;
            const dy = y - runtime.lastMoveY;
            const dz = z - runtime.lastMoveZ;
            if (dx * dx + dy * dy + dz * dz >= 1) {
                runtime.scorched.add(mapId, runtime.lastMoveX, runtime.lastMoveY, runtime.lastMoveZ, 5);
            }
            runtime.lastMoveX = x;
            runtime.lastMoveY = y;
            runtime.lastMoveZ = z;
        } else {
            runtime.lastMoveX = x;
            runtime.lastMoveY = y;
            runtime.lastMoveZ = z;
        }
    }
    if (local == ADV_SLIME_SPRAY) {
        tickTimedZones(
            owner, runtime.slime, 6, STICKY_SLIME_HIT,
            scaledDamage(owner, 10, 0.3, 0.15), 0, MUTATED_PLAGUE, STICKY_SLIME_VISUAL,
        );
    }
    if (local == ADV_SLIMEBOUND && runtime.huskTicks > 0) {
        if (runtime.huskMap == Number(owner.GetMapID())) {
            owner.CastSpellAoF(
                runtime.huskX, runtime.huskY, runtime.huskZ, POISON_SLIME_VISUAL, true,
            );
        }
        hitUnits(
            owner,
            zoneEnemies(owner, runtime.huskMap, runtime.huskX, runtime.huskY, runtime.huskZ, 6),
            POISON_SLIME_HIT,
            scaledDamage(owner, 15, 0.5, 0.25),
        );
        runtime.huskTicks--;
    }
    if (local == ADV_TWILIGHT_COMBUSTION) {
        tickTimedZones(
            owner, runtime.twilight, 6, TWILIGHT_RIFT_HIT,
            scaledDamage(owner, 20, 0.6, 0.3), 0, 0, TWILIGHT_RIFT_VISUAL,
        );
    }
    if (local == ADV_STATIC_OVERFLOW) {
        if (!owner.IsInCombat()) runtime.staticChargeTicks = 0;
        else if (runtime.staticChargeTicks < 10) runtime.staticChargeTicks++;
    }
    if (local == ADV_TWILIGHT_EQUILIBRIUM) ensureEquilibriumEssence(owner);
}

function tickDarkNucleus(effect: TSAuraEffect): void {
    const player = effect.GetAura().GetOwner().ToPlayer();
    if (!player || !advancedActive(player, ADV_DARK_NUCLEUS)) return;
    if (Number(effect.GetAura().GetDuration()) <= 0) fireDarkNucleus(player);
}

function tickDeathwhisper(effect: TSAuraEffect): void {
    const player = effect.GetAura().GetOwner().ToPlayer();
    if (!player || !advancedActive(player, ADV_DEATHWHISPER)) return;
    hitArea(
        player, player, 8, DEATHWHISPER_PULSE,
        scaledDamage(player, 20, 0.4, 0.2),
    );
}

function tickPlaguebringer(effect: TSAuraEffect): void {
    const aura = effect.GetAura();
    const player = effect.GetCaster() ? effect.GetCaster()!.ToPlayer() : undefined;
    const target = aura.GetOwner().ToUnit();
    if (!player || !target || !advancedActive(player, ADV_PLAGUEBRINGER)) return;
    castDamage(
        player,
        target,
        PLAGUEBRINGER_CURSE_HIT,
        scaledDamage(player, 15, 0.5, 0.25),
    );
    const remaining = Number(aura.GetDuration());
    if (remaining <= 0) return;
    const runtime = advancedRuntime(player);
    const units = enemiesAround(player, target, 10);
    for (let i = 0; i < units.length; i++) {
        const guid = units[i].GetGUID();
        if (sameGUID(guid, target.GetGUID()) || ownAura(player, units[i], PLAGUEBRINGER_CURSE)) continue;
        let visited = false;
        for (let j = 0; j < runtime.plagueVisited.length; j++) {
            if (sameGUID(runtime.plagueVisited[j], guid)) visited = true;
        }
        if (visited) continue;
        const next = player.AddAura(PLAGUEBRINGER_CURSE, units[i]);
        if (!next) continue;
        next.SetDuration(remaining);
        runtime.plagueVisited.push(guid);
        trackTarget(player, units[i]);
        aura.Remove();
        return;
    }
}

function addSlimePool(player: TSPlayer, target: TSUnit): void {
    advancedRuntime(player).slime.add(
        Number(player.GetMapID()), Number(target.GetX()), Number(target.GetY()), Number(target.GetZ()), 8,
    );
}

function handleMarkedDeath(victim: TSUnit): void {
    const applications = victim.GetAuraApplications();
    for (let applicationIndex = 0; applicationIndex < applications.length; applicationIndex++) {
        const aura = applications[applicationIndex].GetAura();
        const auraId = Number(aura.GetAuraID());
        if (auraId != MUTATED_INFECTION && auraId != STONE_SHATTER_MARK) continue;
        const casterObject = aura.GetCaster();
        const caster = casterObject ? casterObject.ToPlayer() : undefined;
        if (!caster) continue;
        if (auraId == MUTATED_INFECTION
            && Number(aura.GetDuration()) > 0
            && advancedActive(caster, ADV_SLIME_SPRAY)) {
            addSlimePool(caster, victim);
            aura.Remove();
            continue;
        }
        if (auraId == STONE_SHATTER_MARK && advancedActive(caster, ADV_STONE_SHATTER)) {
            aura.Remove();
            const units = enemiesAround(caster, victim, 8);
            const amount = scaledDamage(caster, 20, 0.5, 0.25);
            for (let i = 0; i < units.length; i++) {
                if (!sameGUID(units[i].GetGUID(), victim.GetGUID())) {
                    castDamage(caster, units[i], STONE_SHATTER_HIT, amount);
                }
            }
        }
    }
}

function tickInfection(effect: TSAuraEffect): void {
    const aura = effect.GetAura();
    const player = effect.GetCaster() ? effect.GetCaster()!.ToPlayer() : undefined;
    const target = aura.GetOwner().ToUnit();
    if (!player || !target || !advancedActive(player, ADV_SLIME_SPRAY)) return;
    addStack(player, target, MUTATED_PLAGUE, 5);
    trackTarget(player, target);
    if (Number(aura.GetDuration()) <= 0) {
        addSlimePool(player, target);
    }
}

function handleCreatureKill(player: TSPlayer, killed: TSCreature): void {
    if (player.IsDead()
        || player.IsFriendlyTo(killed)
        || killed.IsFriendlyTo(player)) return;
    if (advancedActive(player, ADV_DEFILE)) {
        const runtime = advancedRuntime(player);
        const x = Number(killed.GetX());
        const y = Number(killed.GetY());
        const z = Number(killed.GetZ());
        const dx = x - runtime.defileX;
        const dy = y - runtime.defileY;
        const dz = z - runtime.defileZ;
        const inside = runtime.defileTicks > 0
            && runtime.defileMap == Number(player.GetMapID())
            && dx * dx + dy * dy + dz * dz <= (6 + runtime.defileGrowth) * (6 + runtime.defileGrowth);
        if (inside) {
            if (runtime.defileGrowth < 5) {
                runtime.defileGrowth++;
                runtime.defileTicks += 2;
            }
        } else {
            runtime.defileMap = Number(player.GetMapID());
            runtime.defileX = x;
            runtime.defileY = y;
            runtime.defileZ = z;
            runtime.defileTicks = 10;
            runtime.defileGrowth = 0;
        }
    }
}

function advancedPlayerForKiller(killer: TSUnit | undefined): TSPlayer | undefined {
    if (!killer) return undefined;
    const player = killer.ToPlayer();
    if (player) return player;
    const controller = killer.GetController();
    return controller ? controller.ToPlayer() : undefined;
}

export function RegisterAdvancedEchoes(
    events: TSEvents,
    isCollectionDamageHelper: (spellId: number) => boolean,
): void {
    for (let i = 0; i < ADVANCED_CONTROLLER_IDS.length; i++) {
        events.Spell.OnTick(ADVANCED_CONTROLLER_IDS[i], tickController);
    }
    events.Spell.OnTick(DARK_NUCLEUS, tickDarkNucleus);
    events.Spell.OnTick(DEATHWHISPER_BARRIER, tickDeathwhisper);
    events.Spell.OnTick(PLAGUEBRINGER_CURSE, tickPlaguebringer);
    events.Spell.OnTick(MUTATED_INFECTION, tickInfection);

    events.Spell.OnDamageLate((spell, damage, info, type, isCrit, effectMask) => {
        const victim = info.GetTarget().ToPlayer();
        if (victim) handleIncomingDamage(victim, info.GetAttacker(), damage, true);
        const player = info.GetAttacker().ToPlayer();
        const spellId = Number(info.GetSpellID());
        if (player && !isCollectionDamageHelper(spellId)) {
            handleOutgoingDamage(
                player,
                info.GetTarget(),
                Number(info.GetSchoolMask()),
                Number(damage.get()),
                isCrit,
                true,
                spellId,
            );
        }
    });

    events.Spell.OnPeriodicDamage((effect, damage) => {
        const auraId = Number(effect.GetAura().GetAuraID());
        const caster = effect.GetCaster();
        const target = effect.GetAura().GetOwner().ToUnit();
        if (!target) return;
        if (isCollectionDamageHelper(auraId)) return;
        const player = caster ? caster.ToPlayer() : undefined;
        if (!player) return;
        handleOutgoingDamage(
            player,
            target,
            Number(effect.GetSpellInfo().GetSchoolMask()),
            Number(damage.get()),
            false,
            false,
            auraId,
        );
    });

    events.Unit.OnMeleeDamageLate((info, damage, type, index) => {
        const component = Number(index);
        const victim = info.GetTarget().ToPlayer();
        if (victim) {
            handleIncomingDamage(
                victim,
                info.GetAttacker(),
                damage,
                true,
                component == 0,
                component == 0 ? Number(info.GetDamage2()) : 0,
            );
        }
        const attacker = info.GetAttacker().ToPlayer();
        if (attacker && component == 1) {
            const amount = Number(info.GetDamage1()) + Number(info.GetDamage2());
            handleOutgoingDamage(
                attacker,
                info.GetTarget(),
                SCHOOL_PHYSICAL,
                amount,
                Number(info.GetMeleeHitOutcome()) == 6,
                true,
                0,
            );
        }
    });

    events.Unit.OnCalcHeal(handleHeal);
    events.Unit.OnDeathEarly((victim, killer) => handleMarkedDeath(victim));
    events.Unit.OnDeath((victim, killer) => {
        const killed = victim.ToCreature();
        const player = advancedPlayerForKiller(killer);
        if (killed && player) handleCreatureKill(player, killed);
    });
}
