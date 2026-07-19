/**
 * Rare loose EXOTIC gem in corpse loot, never directly to inventory.
 * Классовые камни больше не падают сами — они предустановлены в броню
 * (см. fill.ts); свободный дроп — только экзотика под пустое гнездо.
 */

import { exoticItemIds } from "./maps";

const DROP_CHANCE = 0.02;

export function RegisterLoot(events: TSEvents): void {
    events.Creature.OnGenerateLoot((creature, killer) => {
        if (exoticItemIds.length === 0) {
            return;
        }
        if (Math.random() >= DROP_CHANCE) {
            return;
        }
        const idx = Math.floor(Math.random() * exoticItemIds.length);
        const loot = creature.GetLoot();

        // Creatures without a normal loot table may not have an owner yet.
        // Prefer Trinity's selected recipient (group rules included), then the
        // actual killer supplied by the loot-generation event.
        if (loot.GetLootOwnerGUID().IsEmpty()) {
            const recipient = creature.GetLootRecipient();
            if (recipient !== undefined) {
                loot.SetLootOwner(recipient.GetGUID());
            } else if (killer !== undefined) {
                loot.SetLootOwner(killer.GetGUID());
            }
        }

        // Pass every argument explicitly: the Lua binding exposes the raw
        // six-argument method and does not preserve C++ default parameters.
        loot.AddItem(exoticItemIds[idx], 1, 1, 0, false, 0);
    });
}
