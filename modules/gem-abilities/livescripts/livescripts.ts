import { buildMaps } from "./maps";
import { AUTO_SHOT_SPELL, stripClassSpells } from "./strip";
import { applyManaResource, tickDeathKnight, drainDeathKnightOnCast } from "./resource";
import { recomputeAbilities } from "./grant";
import { grantAllProficiencies } from "./proficiencies";
import { grantAllSkills } from "./skills";
import { grantAllProfessions, initCustomProfessions, maybeUpgradeProfessions } from "./professions";
import { RegisterLoot } from "./loot";
import { fillSockets, RegisterSocketFill } from "./fill";
import { RegisterGemExtraction } from "./extraction";
import { RegisterComboSequence } from "./combo";
import { RegisterRandomMobs } from "./random_mobs";

// Poll as a fallback and also listen for CMSG_SOCKET_GEMS below. A negative
// repeat count is the backend's explicit indefinite-timer value.
const RECOMPUTE_INTERVAL = 2000;
const RECOMPUTE_LOOPS = -1;
const EQUIPMENT_SLOT_END = 19;
const PERIODIC_TIMER = "gem-abilities:periodic-recompute";
const SOCKET_TIMER = "gem-abilities:socket-recompute";

function scheduleRecompute(player: TSPlayer): void {
    // The packet hook runs before the socket operation is fully committed.
    player.AddNamedTimer(SOCKET_TIMER, 250, (owner, timer) => {
        const p = owner.ToPlayer();
        if (p) {
            recomputeAbilities(p);
        }
    });
}

export function Main(events: TSEvents) {
    initCustomProfessions();
    buildMaps();
    RegisterComboSequence(events);
    
    events.Player.OnLogin((player, firstLogin) => {
        applyManaResource(player);
        stripClassSpells(player);
        if (!player.HasSpell(AUTO_SHOT_SPELL)) player.LearnSpell(AUTO_SHOT_SPELL);
        grantAllProficiencies(player); // proficiency passives (client-side hint)
        grantAllSkills(player);        // real weapon/armor skill lines
        grantAllProfessions(player);   // все профессии до Grand Master (кап 450)
        // Starter gear is already equipped before Item.OnEquip can observe it.
        for (let slot = 0; slot < EQUIPMENT_SLOT_END; slot++) {
            const item = player.GetEquippedItemBySlot(slot);
            if (item) fillSockets(item);
        }
        recomputeAbilities(player);
        // Repeating fallback also repairs state after a livescript reload.
        player.AddNamedTimer(PERIODIC_TIMER, RECOMPUTE_INTERVAL, RECOMPUTE_LOOPS, (owner, timer) => {
            const p = owner.ToPlayer();
            if (p) {
                recomputeAbilities(p);
                tickDeathKnight(p); // keep DK hidden mana full + regen runic bar
                maybeUpgradeProfessions(p); // скилл упёрся в кап → следующий разряд
            }
        });
    });

    events.Item.OnEquip((item, player, slot, isMerge) => {
        recomputeAbilities(player);
        scheduleRecompute(player);
    });

    // There is no high-level socket-change event. Recompute just after the
    // client socket packet has been processed, so learning is immediate rather
    // than dependent on the fallback poll.
    events.WorldPacket.OnReceive((opcode, packet, player) => {
        if (opcode == Opcodes.CMSG_SOCKET_GEMS) {
            scheduleRecompute(player);
        }
    });

    // Upgrade/downgrade every socketed ranked ability immediately when the
    // character level changes; the timer remains only a socket-change fallback.
    events.Player.OnLevelChanged((player, oldLevel) => {
        recomputeAbilities(player);
    });

    // cosmetic: DK spends visible runic power when casting a gem ability
    events.Player.OnSpellCast((player, spell, skipCheck) => {
        drainDeathKnightOnCast(player);
    });

    // let any class equip any armor/weapon: override skill/proficiency/class
    // gates to OK (keep level/slot/bag errors intact)
    events.Item.OnCanEquip((item, player, slot, swap, notLoading, result) => {
        const r = result.get();
        if (r == InventoryResult.CANT_EQUIP_SKILL
            || r == InventoryResult.NO_REQUIRED_PROFICIENCY
            || r == InventoryResult.YOU_CAN_NEVER_USE_THAT_ITEM
            || r == InventoryResult.YOU_CAN_NEVER_USE_THAT_ITEM2) {
            result.set(InventoryResult.OK);
        }
    });

    RegisterLoot(events);
    RegisterSocketFill(events);
    RegisterGemExtraction(events);
    // Register after the ordinary gem-loot handler so x2/x3 reward mutations
    // also multiply any ability gem already generated for the corpse.
    RegisterRandomMobs(events);
}
