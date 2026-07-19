import { RegisterAttributes, initAttributeSpells } from "./attributes";

export function Main(events: TSEvents) {
    initAttributeSpells();
    RegisterAttributes(events);
}
