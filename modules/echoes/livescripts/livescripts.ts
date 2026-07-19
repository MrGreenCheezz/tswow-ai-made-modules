import { isCollectionDamageHelper, RegisterEchoes } from "./echoes";
import { RegisterAdvancedEchoes } from "./advanced-echoes";

export function Main(events: TSEvents): void {
    RegisterEchoes(events);
    RegisterAdvancedEchoes(events, isCollectionDamageHelper);
}
