import { initCombatStatSpells, RegisterCombatStats } from "./combat-stats";
import { RegisterMastery } from "./mastery";
import { RegisterItemProperties } from "./item-properties";
import { RegisterStatsCore } from "./stats-core";

export function Main(events: TSEvents) {
    initCombatStatSpells();
    RegisterItemProperties(events);
    RegisterStatsCore(events);
    RegisterCombatStats(events);
    RegisterMastery(events);
}
