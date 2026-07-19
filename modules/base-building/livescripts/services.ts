/**
 * Дополнительные службы базы (keys 100..105).
 *
 * Все активные GO повторно проверяют владельца, дистанцию, бой и persistent
 * cooldown на сервере. Геральдист использует штатный NPC flag донора и не
 * требует livescript-обработчика.
 */

import {
    CLEANSING_FONT_KEY, REPAIR_STATION_KEY, CAPITAL_PORTAL_KEY, TACTICAL_TABLE_KEY,
    CLEANSING_COOLDOWN_S, REPAIR_COOLDOWN_S, CAPITAL_PORTAL_COOLDOWN_S,
    PRACTICE_RAID_COOLDOWN_S, SERVICE_USE_RANGE,
    SUPPLY_COOLDOWN_S, RAID_COOLDOWN_S, LIMIT_BY_LEVEL, DEFENSE_BUILDING_KEYS,
    cooldownWaitSeconds,
} from "../shared/BaseCatalog";
import { resourceGeneratorByKey } from "../shared/ResourceGenerators";
import { BaseFlag, BaseBuilding } from "./base-db";
import { baseText, dist2, nowUnix, normTime } from "./base";
import { raidStatusText, startPracticeRaid, stopPracticeRaid } from "./raids";

const CLEANSING_FONT_ENTRY = UTAG("base-building", "go/base-cleansing-font");
const REPAIR_STATION_ENTRY = UTAG("base-building", "go/base-repair-station");
const CAPITAL_PORTAL_ENTRY = UTAG("base-building", "go/base-capital-portal");
const TACTICAL_TABLE_ENTRY = UTAG("base-building", "go/base-tactical-table");

const SPELL_PURIFY_DISEASE_POISON = 1152;
const SPELL_REMOVE_CURSE = 475;

const TACTICAL_SUMMARY = 1;
const TACTICAL_START_PRACTICE = 2;
const TACTICAL_STOP_PRACTICE = 3;

interface PortalDestination {
    selection: number;
    nameEn: string;
    nameRu: string;
    minLevel: number;
    map: number;
    x: number;
    y: number;
    z: number;
    o: number;
}

const ALLIANCE_PORTALS: PortalDestination[] = [
    { selection: 1, nameEn: "Stormwind", nameRu: "Штормград", minLevel: 1, map: 0, x: -8833.38, y: 628.628, z: 94.0066, o: 1.06535 },
    { selection: 2, nameEn: "Ironforge", nameRu: "Стальгорн", minLevel: 1, map: 0, x: -4918.88, y: -940.406, z: 501.564, o: 5.42347 },
    { selection: 3, nameEn: "Darnassus", nameRu: "Дарнас", minLevel: 1, map: 1, x: 9949.56, y: 2284.21, z: 1341.4, o: 1.59587 },
    { selection: 4, nameEn: "The Exodar", nameRu: "Экзодар", minLevel: 1, map: 530, x: -3965.7, y: -11653.6, z: -138.844, o: 0.852154 },
];

const HORDE_PORTALS: PortalDestination[] = [
    { selection: 1, nameEn: "Orgrimmar", nameRu: "Оргриммар", minLevel: 1, map: 1, x: 1629.36, y: -4373.39, z: 31.2564, o: 3.54839 },
    { selection: 2, nameEn: "Thunder Bluff", nameRu: "Громовой Утёс", minLevel: 1, map: 1, x: -1277.37, y: 124.804, z: 131.287, o: 5.22274 },
    { selection: 3, nameEn: "Undercity", nameRu: "Подгород", minLevel: 1, map: 0, x: 1584.07, y: 241.987, z: -52.1534, o: 0.049647 },
    { selection: 4, nameEn: "Silvermoon City", nameRu: "Луносвет", minLevel: 1, map: 530, x: 9487.69, y: -7279.2, z: 14.2866, o: 6.16478 },
];

const NEUTRAL_PORTALS: PortalDestination[] = [
    { selection: 5, nameEn: "Shattrath City (58+)", nameRu: "Шаттрат (58+)", minLevel: 58, map: 530, x: -1838.16, y: 5301.79, z: -12.428, o: 5.9517 },
    { selection: 6, nameEn: "Dalaran (68+)", nameRu: "Даларан (68+)", minLevel: 68, map: 571, x: 5804.15, y: 624.771, z: 647.767, o: 1.64 },
];

function factionPortals(player: TSPlayer): PortalDestination[] {
    return Number(player.GetTeam()) == TeamId.ALLIANCE ? ALLIANCE_PORTALS : HORDE_PORTALS;
}

function portalDestination(player: TSPlayer, selection: number): PortalDestination | undefined {
    const faction = factionPortals(player);
    for (let i = 0; i < faction.length; i++) {
        if (faction[i].selection == selection) return faction[i];
    }
    for (let i = 0; i < NEUTRAL_PORTALS.length; i++) {
        if (NEUTRAL_PORTALS[i].selection == selection) return NEUTRAL_PORTALS[i];
    }
    return undefined;
}

function ownedRowAtObject(player: TSPlayer, obj: TSGameObject, key: number): BaseBuilding | undefined {
    let exact: BaseBuilding | undefined = undefined;
    let fallback: BaseBuilding | undefined = undefined;
    let fallbackCount = 0;
    const guid = Number(obj.GetGUIDLow());
    BaseBuilding.get(player).forEach(row => {
        if (exact || row.catKey != key || row.entry != obj.GetEntry() || row.mapId != obj.GetMapID()) return;
        if (Number(row.spawnGuid) == guid) {
            exact = row;
            return;
        }
        // Старые строки могли сохранить устаревший runtime GUID. Координаты
        // безопасны только как однозначный migration fallback.
        if (dist2(row.x, row.y, obj.GetX(), obj.GetY()) <= 1.0) {
            fallback = row;
            fallbackCount++;
        }
    });
    return exact || (fallbackCount == 1 ? fallback : undefined);
}

function canUseOwnedService(player: TSPlayer, obj: TSGameObject, key: number): boolean {
    if (!ownedRowAtObject(player, obj, key)) {
        player.SendBroadcastMessage(baseText(player, "Only the base owner can use this service.", "Эту службу может использовать только владелец базы."));
        return false;
    }
    if (Number(player.GetDistance(obj)) > SERVICE_USE_RANGE) {
        player.SendBroadcastMessage(baseText(player, "Move closer to the building.", "Подойдите ближе к постройке."));
        return false;
    }
    if (player.IsDead()) {
        player.SendBroadcastMessage(baseText(player, "You cannot use this service while dead.", "Этой службой нельзя пользоваться после смерти."));
        return false;
    }
    return true;
}

function requireOutOfCombat(player: TSPlayer): boolean {
    if (!player.IsInCombat()) return true;
    player.SendBroadcastMessage(baseText(player, "You cannot use this service in combat.", "Этой службой нельзя пользоваться в бою."));
    return false;
}

function requireCooldown(player: TSPlayer, lastUse: number, cooldown: number, nameEn: string, nameRu: string): boolean {
    const wait = cooldownWaitSeconds(normTime(lastUse), nowUnix(), cooldown);
    if (wait <= 0) return true;
    player.SendBroadcastMessage(baseText(
        player,
        `${nameEn} will be ready in ${Math.ceil(wait / 60)} min.`,
        `${nameRu} будет готово через ${Math.ceil(wait / 60)} мин.`,
    ));
    return false;
}

function formatWait(player: TSPlayer, wait: number): string {
    if (wait <= 0) return baseText(player, "ready", "готово");
    if (wait >= 3600) return baseText(player, `${Math.ceil(wait / 3600)} hr`, `${Math.ceil(wait / 3600)} ч`);
    return baseText(player, `${Math.ceil(wait / 60)} min`, `${Math.ceil(wait / 60)} мин`);
}

function containsKey(keys: number[], key: number): boolean {
    for (let i = 0; i < keys.length; i++) if (keys[i] == key) return true;
    return false;
}

function tacticalSummary(player: TSPlayer): string {
    const flag = BaseFlag.get(player);
    const now = nowUnix();
    let generators = 0;
    let readyGenerators = 0;
    let defenses = 0;
    BaseBuilding.get(player).forEach(row => {
        const generator = resourceGeneratorByKey(row.catKey);
        if (generator) {
            generators++;
            const last = normTime(Number(row.lastHarvest));
            if (last <= 0 || (last <= now && last + generator.periodS <= now)) readyGenerators++;
        }
        if (containsKey(DEFENSE_BUILDING_KEYS, row.catKey)) defenses++;
    });

    const level = Math.min(flag.baseLevel, LIMIT_BY_LEVEL.length - 1);
    const supplyWait = cooldownWaitSeconds(normTime(Number(flag.lastSupply)), now, SUPPLY_COOLDOWN_S);
    const raidWait = cooldownWaitSeconds(normTime(Number(flag.lastRaid)), now, RAID_COOLDOWN_S);
    const practiceWait = cooldownWaitSeconds(normTime(Number(flag.lastPracticeRaid)), now, PRACTICE_RAID_COOLDOWN_S);
    return baseText(
        player,
        `Base level: ${level + 1}; buildings ${BaseBuilding.get(player).Size()}/${LIMIT_BY_LEVEL[level]}; `
            + `defenses ${defenses}; generators ready ${readyGenerators}/${generators}; `
            + `supplies: ${formatWait(player, supplyWait)}; regular raid: ${formatWait(player, raidWait)}; `
            + `practice raid: ${formatWait(player, practiceWait)}. ${raidStatusText(player)}`,
        `Уровень базы: ${level + 1}; построек ${BaseBuilding.get(player).Size()}/${LIMIT_BY_LEVEL[level]}; `
            + `оборона ${defenses}; генераторы готовы ${readyGenerators}/${generators}; `
            + `припасы: ${formatWait(player, supplyWait)}; обычный набег: ${formatWait(player, raidWait)}; `
            + `учебный набег: ${formatWait(player, practiceWait)}. ${raidStatusText(player)}`,
    );
}

function showPortalMenu(obj: TSGameObject, player: TSPlayer): void {
    player.GossipClearMenu();
    const faction = factionPortals(player);
    for (let i = 0; i < faction.length; i++) {
        player.GossipMenuAddItem(GossipOptionIcon.TAXI, baseText(player, faction[i].nameEn, faction[i].nameRu), 0, faction[i].selection);
    }
    for (let i = 0; i < NEUTRAL_PORTALS.length; i++) {
        const destination = NEUTRAL_PORTALS[i];
        if (player.GetLevel() >= destination.minLevel) {
            player.GossipMenuAddItem(GossipOptionIcon.TAXI, baseText(player, destination.nameEn, destination.nameRu), 0, destination.selection);
        }
    }
    player.GossipSendMenu(1, obj);
}

function showTacticalMenu(obj: TSGameObject, player: TSPlayer): void {
    player.GossipClearMenu();
    player.GossipMenuAddItem(GossipOptionIcon.CHAT, baseText(player, "Base status summary", "Сводка состояния базы"), 0, TACTICAL_SUMMARY);
    player.GossipMenuAddItem(GossipOptionIcon.BATTLE, baseText(player, "Start practice raid", "Начать учебный набег"), 0, TACTICAL_START_PRACTICE);
    player.GossipMenuAddItem(GossipOptionIcon.INTERACT_1, baseText(player, "Stop practice raid", "Остановить учебный набег"), 0, TACTICAL_STOP_PRACTICE);
    player.GossipSendMenu(1, obj);
}

export function RegisterBaseServices(events: TSEvents): void {
    events.GameObject.OnGossipHello(CLEANSING_FONT_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        if (!canUseOwnedService(player, obj, CLEANSING_FONT_KEY) || !requireOutOfCombat(player)) return;
        const flag = BaseFlag.get(player);
        if (!requireCooldown(player, Number(flag.lastCleanse), CLEANSING_COOLDOWN_S, "Cleansing Font", "Купель очищения")) return;

        player.CastSpell(player, SPELL_PURIFY_DISEASE_POISON, true);
        player.CastSpell(player, SPELL_REMOVE_CURSE, true);
        flag.lastCleanse = nowUnix();
        flag.Save();
        player.SendBroadcastMessage(baseText(player, "The font removed one poison, disease, and curse effect, if present.", "Купель сняла по одному эффекту яда, болезни и проклятия, если они были."));
    });

    events.GameObject.OnGossipHello(REPAIR_STATION_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        if (!canUseOwnedService(player, obj, REPAIR_STATION_KEY) || !requireOutOfCombat(player)) return;
        const flag = BaseFlag.get(player);
        if (!requireCooldown(player, Number(flag.lastRepair), REPAIR_COOLDOWN_S, "Repair Rack", "Ремонтная стойка")) return;

        player.DurabilityRepairAll(false, 1, false);
        flag.lastRepair = nowUnix();
        flag.Save();
        player.SendBroadcastMessage(baseText(player, "The repair rack fully repaired your equipment.", "Ремонтная стойка полностью починила вашу экипировку."));
    });

    events.GameObject.OnGossipHello(CAPITAL_PORTAL_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        if (!canUseOwnedService(player, obj, CAPITAL_PORTAL_KEY) || !requireOutOfCombat(player)) return;
        const flag = BaseFlag.get(player);
        if (!requireCooldown(player, Number(flag.lastPortal), CAPITAL_PORTAL_COOLDOWN_S, "Navigation Portal", "Навигационный портал")) return;
        showPortalMenu(obj, player);
    });

    events.GameObject.OnGossipSelect(CAPITAL_PORTAL_ENTRY, (obj, player, menuId, selection, cancel) => {
        cancel.set(true);
        if (!canUseOwnedService(player, obj, CAPITAL_PORTAL_KEY) || !requireOutOfCombat(player)) return;
        const destination = portalDestination(player, Number(selection));
        if (!destination || player.GetLevel() < destination.minLevel) {
            player.SendBroadcastMessage(baseText(player, "This destination is unavailable to you.", "Этот переход вам недоступен."));
            player.GossipComplete();
            return;
        }
        const flag = BaseFlag.get(player);
        if (!requireCooldown(player, Number(flag.lastPortal), CAPITAL_PORTAL_COOLDOWN_S, "Navigation Portal", "Навигационный портал")) return;

        player.GossipComplete();
        if (!player.Teleport(destination.map, destination.x, destination.y, destination.z, destination.o)) {
            player.SendBroadcastMessage(baseText(player, "Teleportation failed; the portal cooldown was not started.", "Переход не удался; перезарядка портала не началась."));
            return;
        }
        flag.lastPortal = nowUnix();
        flag.Save();
    });

    events.GameObject.OnGossipHello(TACTICAL_TABLE_ENTRY, (obj, player, cancel) => {
        cancel.set(true);
        if (!canUseOwnedService(player, obj, TACTICAL_TABLE_KEY)) return;
        showTacticalMenu(obj, player);
    });

    events.GameObject.OnGossipSelect(TACTICAL_TABLE_ENTRY, (obj, player, menuId, selection, cancel) => {
        cancel.set(true);
        if (!canUseOwnedService(player, obj, TACTICAL_TABLE_KEY)) return;
        player.GossipComplete();
        if (selection == TACTICAL_SUMMARY) {
            player.SendBroadcastMessage(tacticalSummary(player));
            return;
        }
        if (selection == TACTICAL_STOP_PRACTICE) {
            stopPracticeRaid(player);
            return;
        }
        if (selection != TACTICAL_START_PRACTICE || !requireOutOfCombat(player)) return;

        const flag = BaseFlag.get(player);
        if (!requireCooldown(player, Number(flag.lastPracticeRaid), PRACTICE_RAID_COOLDOWN_S, "Practice Raid", "Учебный набег")) return;
        startPracticeRaid(player);
    });
}
