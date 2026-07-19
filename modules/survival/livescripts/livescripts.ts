import { RegisterSurvival, initSurvivalSpells } from "./survival";

export function Main(events: TSEvents) {
    initSurvivalSpells();
    RegisterSurvival(events);
}
