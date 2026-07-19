/** Server-authoritative card selection, boss-book collection, and aura runtime. */

import { ECHOES } from "../datascripts/shared/EchoDefs";
import { COLLECTION_ECHOES } from "../datascripts/shared/CollectionEchoDefs";
import {
    rollEchoOffer,
    validateEchoChoice,
} from "../shared/EchoRoll";
import {
    ECHO_ERROR_CONTEXT_CARD,
    ECHO_ERROR_CONTEXT_COLLECTION,
    ECHO_ERROR_CONTEXT_GENERAL,
    OP_ECHO_CHOOSE,
    OP_ECHO_COLLECTION_SET_ACTIVE,
    OP_ECHO_STATE_REQUEST,
    EchoChooseRequest,
    EchoCollectionSetActiveRequest,
    EchoErrorMsg,
    EchoOfferEntry,
    EchoStateMsg,
    EchoStateRequest,
} from "../shared/EchoMessages";
import {
    EchoCollectionProfile,
    EchoCollectionRow,
    EchoOfferState,
    EchoRankRow,
} from "./echo-db";
import {
    isAdvancedEchoDamageHelper,
    removeAdvancedEchoRuntime,
    resetAdvancedEchoRuntime,
} from "./advanced-echoes";

class EchoLocale {
    static Russian(player: TSPlayer): boolean {
        return Number(player.GetDbcLocale ? player.GetDbcLocale() : 8) == 8;
    }

    static Text(player: TSPlayer, english: string, russian: string): string {
        return EchoLocale.Russian(player) ? russian : english;
    }

    static Name(player: TSPlayer, echoIndex: number, collection: boolean): string {
        if (collection) {
            return EchoLocale.Russian(player)
                ? COLLECTION_ECHOES[echoIndex].nameRu
                : COLLECTION_ECHOES[echoIndex].name;
        }
        return EchoLocale.Russian(player) ? ECHOES[echoIndex].nameRu : ECHOES[echoIndex].name;
    }
}

const playerText = EchoLocale.Text;

// Tag macros are compile-time substitutions. Keep every lookup literal and in
// exactly the same stable order as ECHOES.
const ECHO_SPELL_IDS: TSArray<number> = [
    UTAG("echoes", "spell/strength-training"),
    UTAG("echoes", "spell/agility-boost"),
    UTAG("echoes", "spell/mind-expansion"),
    UTAG("echoes", "spell/spiritual-fortitude"),
    UTAG("echoes", "spell/iron-constitution"),
    UTAG("echoes", "spell/mana-regeneration"),
    UTAG("echoes", "spell/reinforced-shielding"),
    UTAG("echoes", "spell/mystic-potency"),
    UTAG("echoes", "spell/brutal-might"),
    UTAG("echoes", "spell/warm-blooded"),
    UTAG("echoes", "spell/hardened-skin"),
    UTAG("echoes", "spell/hardened-resolve"),
    UTAG("echoes", "spell/swift-step"),
    UTAG("echoes", "spell/enhanced-recovery"),
    UTAG("echoes", "spell/keen-aim"),
    UTAG("echoes", "spell/crushing-force"),
    UTAG("echoes", "spell/quick-hands"),
    UTAG("echoes", "spell/armor-penetration"),
    UTAG("echoes", "spell/expertise-drills"),
    UTAG("echoes", "spell/mana-reservoir"),
    UTAG("echoes", "spell/steady-channeling"),
    UTAG("echoes", "spell/steady-casting"),
    UTAG("echoes", "spell/subtle-presence"),
    UTAG("echoes", "spell/provoking-presence"),
    UTAG("echoes", "spell/efficient-casting"),
    UTAG("echoes", "spell/glass-canon"),
    UTAG("echoes", "spell/leadfoot"),
    UTAG("echoes", "spell/fortress-soul"),
    UTAG("echoes", "spell/the-last-wall"),
    UTAG("echoes", "spell/overwhelming-restoration"),
];

const ECHO_CHOICE_USE_SPELL = UTAG("echoes", "spell/echo-choice-use");
const ECHO_RESET_USE_SPELL = UTAG("echoes", "spell/echo-reset-use");
const COLLECTION_SLOT_EXPAND_ITEM = UTAG("echoes", "item/collection-slot-expand");
const ECHO_VENDOR = UTAG("echoes", "npc/echo-vendor");

// Literal tags are compile-time substitutions. Keep all three arrays aligned
// with the stable COLLECTION_ECHOES order.
const COLLECTION_SPELL_IDS: TSArray<number> = [
    UTAG("echoes", "spell/collection-blade-tempest"),
    UTAG("echoes", "spell/collection-broodmothers-fury"),
    UTAG("echoes", "spell/collection-call-of-the-lich-king"),
    UTAG("echoes", "spell/collection-chill-of-the-bone-wyrm"),
    UTAG("echoes", "spell/collection-frostfire-paradox"),
    UTAG("echoes", "spell/collection-frostguard-carapace"),
    UTAG("echoes", "spell/collection-mutagenic-fumes"),
    UTAG("echoes", "spell/collection-nether-lords-command"),
    UTAG("echoes", "spell/collection-overwhelming-restoration"),
    UTAG("echoes", "spell/collection-sanctum-sentries"),
    UTAG("echoes", "spell/collection-spellweave"),
    UTAG("echoes", "spell/collection-twin-casting"),
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

const COLLECTION_BOOK_USE_SPELL_IDS: TSArray<number> = [
    UTAG("echoes", "spell/collection-book-use-blade-tempest"),
    UTAG("echoes", "spell/collection-book-use-broodmothers-fury"),
    UTAG("echoes", "spell/collection-book-use-call-of-the-lich-king"),
    UTAG("echoes", "spell/collection-book-use-chill-of-the-bone-wyrm"),
    UTAG("echoes", "spell/collection-book-use-frostfire-paradox"),
    UTAG("echoes", "spell/collection-book-use-frostguard-carapace"),
    UTAG("echoes", "spell/collection-book-use-mutagenic-fumes"),
    UTAG("echoes", "spell/collection-book-use-nether-lords-command"),
    UTAG("echoes", "spell/collection-book-use-overwhelming-restoration"),
    UTAG("echoes", "spell/collection-book-use-sanctum-sentries"),
    UTAG("echoes", "spell/collection-book-use-spellweave"),
    UTAG("echoes", "spell/collection-book-use-twin-casting"),
    UTAG("echoes", "spell/collection-book-use-blighted-sky"),
    UTAG("echoes", "spell/collection-book-use-brittle-forging"),
    UTAG("echoes", "spell/collection-book-use-broodmothers-webbing"),
    UTAG("echoes", "spell/collection-book-use-champions-rally"),
    UTAG("echoes", "spell/collection-book-use-cinders-of-the-sanctum"),
    UTAG("echoes", "spell/collection-book-use-constellations"),
    UTAG("echoes", "spell/collection-book-use-curse-of-the-plaguebringer"),
    UTAG("echoes", "spell/collection-book-use-dark-nucleus"),
    UTAG("echoes", "spell/collection-book-use-deathwhispers-barrier"),
    UTAG("echoes", "spell/collection-book-use-defile"),
    UTAG("echoes", "spell/collection-book-use-demonic-awakening"),
    UTAG("echoes", "spell/collection-book-use-scorched-path"),
    UTAG("echoes", "spell/collection-book-use-slime-spray"),
    UTAG("echoes", "spell/collection-book-use-slimebound-husk"),
    UTAG("echoes", "spell/collection-book-use-static-overflow"),
    UTAG("echoes", "spell/collection-book-use-stone-shatter"),
    UTAG("echoes", "spell/collection-book-use-storm-conductor"),
    UTAG("echoes", "spell/collection-book-use-twilight-combustion"),
    UTAG("echoes", "spell/collection-book-use-twilight-equilibrium"),
    UTAG("echoes", "spell/collection-book-use-widows-venom"),
];

const COLLECTION_BOOK_ITEM_IDS: TSArray<number> = [
    UTAG("echoes", "item/collection-book-blade-tempest"),
    UTAG("echoes", "item/collection-book-broodmothers-fury"),
    UTAG("echoes", "item/collection-book-call-of-the-lich-king"),
    UTAG("echoes", "item/collection-book-chill-of-the-bone-wyrm"),
    UTAG("echoes", "item/collection-book-frostfire-paradox"),
    UTAG("echoes", "item/collection-book-frostguard-carapace"),
    UTAG("echoes", "item/collection-book-mutagenic-fumes"),
    UTAG("echoes", "item/collection-book-nether-lords-command"),
    UTAG("echoes", "item/collection-book-overwhelming-restoration"),
    UTAG("echoes", "item/collection-book-sanctum-sentries"),
    UTAG("echoes", "item/collection-book-spellweave"),
    UTAG("echoes", "item/collection-book-twin-casting"),
    UTAG("echoes", "item/collection-book-blighted-sky"),
    UTAG("echoes", "item/collection-book-brittle-forging"),
    UTAG("echoes", "item/collection-book-broodmothers-webbing"),
    UTAG("echoes", "item/collection-book-champions-rally"),
    UTAG("echoes", "item/collection-book-cinders-of-the-sanctum"),
    UTAG("echoes", "item/collection-book-constellations"),
    UTAG("echoes", "item/collection-book-curse-of-the-plaguebringer"),
    UTAG("echoes", "item/collection-book-dark-nucleus"),
    UTAG("echoes", "item/collection-book-deathwhispers-barrier"),
    UTAG("echoes", "item/collection-book-defile"),
    UTAG("echoes", "item/collection-book-demonic-awakening"),
    UTAG("echoes", "item/collection-book-scorched-path"),
    UTAG("echoes", "item/collection-book-slime-spray"),
    UTAG("echoes", "item/collection-book-slimebound-husk"),
    UTAG("echoes", "item/collection-book-static-overflow"),
    UTAG("echoes", "item/collection-book-stone-shatter"),
    UTAG("echoes", "item/collection-book-storm-conductor"),
    UTAG("echoes", "item/collection-book-twilight-combustion"),
    UTAG("echoes", "item/collection-book-twilight-equilibrium"),
    UTAG("echoes", "item/collection-book-widows-venom"),
];

const BLADE_ZONE = UTAG("echoes", "spell/collection-blade-tempest-zone");
const BLADE_HIT = UTAG("echoes", "spell/collection-blade-tempest-hit");
const SEARING_CINDERS = UTAG("echoes", "spell/collection-searing-cinders");
const BROODMOTHER_ICD = UTAG("echoes", "spell/collection-broodmother-icd");
const DEEP_BREATH_HIT = UTAG("echoes", "spell/collection-deep-breath-hit");
const SOUL_FRAGMENT = UTAG("echoes", "spell/collection-soul-fragment");
const LICH_SERVANTS = UTAG("echoes", "spell/collection-lich-servants");
const LICH_SERVANT_HIT = UTAG("echoes", "spell/collection-lich-servant-hit");
const LICH_SERVANT_ENTRY = UTAG("echoes", "npc/collection-lich-servant");
const RIME = UTAG("echoes", "spell/collection-rime");
const CHILL_ICD = UTAG("echoes", "spell/collection-chill-icd");
const BRITTLE = UTAG("echoes", "spell/collection-brittle");
const FROST_BREATH_HIT = UTAG("echoes", "spell/collection-frost-breath-hit");
const BITING_COLD = UTAG("echoes", "spell/collection-biting-cold");
const FROSTFIRE_SHATTER_HIT = UTAG("echoes", "spell/collection-frostfire-shatter-hit");
const FROSTGUARD_BUFF = UTAG("echoes", "spell/collection-frostguard-buff");
const FROSTGUARD_ICD = UTAG("echoes", "spell/collection-frostguard-icd");
const MUTAGENIC_CLOUD = UTAG("echoes", "spell/collection-mutagenic-cloud");
const MUTAGENIC_ICD = UTAG("echoes", "spell/collection-mutagenic-icd");
const MUTAGENIC_HIT = UTAG("echoes", "spell/collection-mutagenic-hit");
const MUTAGENIC_VISUAL = UTAG("echoes", "spell/collection-mutagenic-visual");
const NETHER_PORTAL = UTAG("echoes", "spell/collection-nether-portal");
const NETHER_ICD = UTAG("echoes", "spell/collection-nether-icd");
const NETHER_LIGHTNING_HIT = UTAG("echoes", "spell/collection-nether-lightning-hit");
const NETHER_FLAMESTRIKE_HIT = UTAG("echoes", "spell/collection-nether-flamestrike-hit");
const NETHER_FLAMES = UTAG("echoes", "spell/collection-nether-flames");
const NETHER_FLAMES_TICK = UTAG("echoes", "spell/collection-nether-flames-tick");
const NETHER_PORTAL_ENTRY = UTAG("echoes", "npc/collection-nether-portal");
const SANCTUM_MARK = UTAG("echoes", "spell/collection-sanctum-mark");
const SANCTUM_SENTRY_HIT = UTAG("echoes", "spell/collection-sanctum-sentry-hit");
const SANCTUM_SENTRY_ENTRY = UTAG("echoes", "npc/collection-sanctum-sentry");
const SPELLWEAVE_DAMAGE = UTAG("echoes", "spell/collection-spellweave-damage");
const SPELLWEAVE_HEALING = UTAG("echoes", "spell/collection-spellweave-healing");

// One table keeps the generated Lua chunk below Lua 5.1's 200-active-local limit.
const RULES = {
    offerMarker: 0x40000000,
    minSlots: 2,
    maxSlots: 10,
    crystalGold: 30000,
    vendorTrade: 1,
    vendorExpandSlots: 2,
    bookDropChance: 0.02,
    schoolPhysical: 1,
    schoolFire: 4,
    schoolFrost: 16,
    playerControlled: 0x00000008,
    blockingMinion: 0x02010382 | 0x04000000,
    inertPortal: 0x00000100 | 0x00000200 | 0x02000000,
    lichDurationMs: 30000,
    lichMaximum: 6,
    portalDurationMs: 10000,
    minionFollowDistance: 2.5,
};

const COLLECTION_HELPER_DAMAGE_IDS: TSArray<number> = [
    BLADE_HIT,
    SEARING_CINDERS,
    DEEP_BREATH_HIT,
    LICH_SERVANT_HIT,
    SANCTUM_SENTRY_HIT,
    FROST_BREATH_HIT,
    FROSTFIRE_SHATTER_HIT,
    MUTAGENIC_HIT,
    NETHER_LIGHTNING_HIT,
    NETHER_FLAMESTRIKE_HIT,
    NETHER_FLAMES_TICK,
];

class EchoClientState {
    ready: boolean = false;
    collectionAckToken: number = 0;
}

class EchoCollectionRuntimeState {
    lastTargetGUID: TSGUID | undefined = undefined;
    bladeMaps: TSArray<number> = [];
    bladeX: TSArray<number> = [];
    bladeY: TSArray<number> = [];
    bladeZ: TSArray<number> = [];
    bladeTicks: TSArray<number> = [];
    cinderTargetGUIDs: TSArray<TSGUID> = [];
    frostTargetGUIDs: TSArray<TSGUID> = [];
    poisonMap: number = -1;
    poisonX: number = 0;
    poisonY: number = 0;
    poisonZ: number = 0;
    flamesMap: number = -1;
    flamesX: number = 0;
    flamesY: number = 0;
    flamesZ: number = 0;
    twinCast: boolean = false;
    echoMinionMap: number = -1;
    echoMinionInstance: number = -1;
    lichServantGUIDs: TSArray<number> = [];
    sanctumSentryGUIDs: TSArray<number> = [];
    netherPortalGUID: number = 0;
}

function echoClient(player: TSPlayer): EchoClientState {
    return player.GetObject("EchoClient", new EchoClientState());
}

function collectionRuntime(player: TSPlayer): EchoCollectionRuntimeState {
    return player.GetObject("EchoCollectionRuntime", new EchoCollectionRuntimeState());
}

function echoMinionsAreOnMap(runtime: EchoCollectionRuntimeState, map: TSMap): boolean {
    return runtime.echoMinionMap == Number(map.GetMapID())
        && runtime.echoMinionInstance == Number(map.GetInstanceID());
}

function clearEchoMinionMapIfEmpty(runtime: EchoCollectionRuntimeState): void {
    if (runtime.lichServantGUIDs.length > 0
        || runtime.sanctumSentryGUIDs.length > 0
        || runtime.netherPortalGUID > 0) return;
    runtime.echoMinionMap = -1;
    runtime.echoMinionInstance = -1;
}

function bindEchoMinionsToMap(runtime: EchoCollectionRuntimeState, map: TSMap): void {
    if (runtime.echoMinionMap >= 0 && !echoMinionsAreOnMap(runtime, map)) {
        runtime.lichServantGUIDs = [];
        runtime.sanctumSentryGUIDs = [];
        runtime.netherPortalGUID = 0;
    }
    runtime.echoMinionMap = Number(map.GetMapID());
    runtime.echoMinionInstance = Number(map.GetInstanceID());
}

function findEchoMinion(map: TSMap, entry: number, guidLow: number): TSCreature | undefined {
    return map.GetCreature(CreateGUID(HighGuid.Unit, entry, guidLow));
}

function compactEchoMinionGUIDs(
    player: TSPlayer,
    entry: number,
    guids: TSArray<number>,
): TSArray<number> {
    const runtime = collectionRuntime(player);
    const map = player.GetMap();
    const alive: TSArray<number> = [];
    if (!echoMinionsAreOnMap(runtime, map)) return alive;
    for (let i = 0; i < guids.length; i++) {
        const minion = findEchoMinion(map, entry, guids[i]);
        if (!minion || minion.IsDead()) {
            if (minion) minion.DespawnOrUnsummon(0);
            continue;
        }
        alive.push(guids[i]);
    }
    return alive;
}

function compactLichServants(player: TSPlayer): TSArray<number> {
    const runtime = collectionRuntime(player);
    runtime.lichServantGUIDs = compactEchoMinionGUIDs(
        player,
        LICH_SERVANT_ENTRY,
        runtime.lichServantGUIDs,
    );
    clearEchoMinionMapIfEmpty(runtime);
    return runtime.lichServantGUIDs;
}

function compactSanctumSentries(player: TSPlayer): TSArray<number> {
    const runtime = collectionRuntime(player);
    runtime.sanctumSentryGUIDs = compactEchoMinionGUIDs(
        player,
        SANCTUM_SENTRY_ENTRY,
        runtime.sanctumSentryGUIDs,
    );
    clearEchoMinionMapIfEmpty(runtime);
    return runtime.sanctumSentryGUIDs;
}

function findNetherPortal(player: TSPlayer): TSCreature | undefined {
    const runtime = collectionRuntime(player);
    const map = player.GetMap();
    if (runtime.netherPortalGUID <= 0 || !echoMinionsAreOnMap(runtime, map)) return undefined;
    const portal = findEchoMinion(map, NETHER_PORTAL_ENTRY, runtime.netherPortalGUID);
    if (portal && !portal.IsDead()) return portal;
    if (portal) portal.DespawnOrUnsummon(0);
    runtime.netherPortalGUID = 0;
    clearEchoMinionMapIfEmpty(runtime);
    return undefined;
}

function despawnEchoMinionGUIDs(map: TSMap, entry: number, guids: TSArray<number>): void {
    for (let i = 0; i < guids.length; i++) {
        const minion = findEchoMinion(map, entry, guids[i]);
        if (minion) minion.DespawnOrUnsummon(0);
    }
}

function despawnLichServants(map: TSMap, player: TSPlayer): void {
    const runtime = collectionRuntime(player);
    if (!echoMinionsAreOnMap(runtime, map)) return;
    despawnEchoMinionGUIDs(map, LICH_SERVANT_ENTRY, runtime.lichServantGUIDs);
    runtime.lichServantGUIDs = [];
    clearEchoMinionMapIfEmpty(runtime);
}

function despawnSanctumSentries(map: TSMap, player: TSPlayer): void {
    const runtime = collectionRuntime(player);
    if (!echoMinionsAreOnMap(runtime, map)) return;
    despawnEchoMinionGUIDs(map, SANCTUM_SENTRY_ENTRY, runtime.sanctumSentryGUIDs);
    runtime.sanctumSentryGUIDs = [];
    clearEchoMinionMapIfEmpty(runtime);
}

function despawnNetherPortal(map: TSMap, player: TSPlayer): void {
    const runtime = collectionRuntime(player);
    if (!echoMinionsAreOnMap(runtime, map)) return;
    if (runtime.netherPortalGUID > 0) {
        const portal = findEchoMinion(map, NETHER_PORTAL_ENTRY, runtime.netherPortalGUID);
        if (portal) portal.DespawnOrUnsummon(0);
    }
    runtime.netherPortalGUID = 0;
    clearEchoMinionMapIfEmpty(runtime);
}

function despawnAllEchoMinions(map: TSMap, player: TSPlayer): void {
    const runtime = collectionRuntime(player);
    if (!echoMinionsAreOnMap(runtime, map)) return;
    despawnEchoMinionGUIDs(map, LICH_SERVANT_ENTRY, runtime.lichServantGUIDs);
    despawnEchoMinionGUIDs(map, SANCTUM_SENTRY_ENTRY, runtime.sanctumSentryGUIDs);
    if (runtime.netherPortalGUID > 0) {
        const portal = findEchoMinion(map, NETHER_PORTAL_ENTRY, runtime.netherPortalGUID);
        if (portal) portal.DespawnOrUnsummon(0);
    }
    runtime.lichServantGUIDs = [];
    runtime.sanctumSentryGUIDs = [];
    runtime.netherPortalGUID = 0;
    clearEchoMinionMapIfEmpty(runtime);
}

function clearEchoMinionsOnMap(map: TSMap, player: TSPlayer): void {
    despawnAllEchoMinions(map, player);
    if (player.HasAura(LICH_SERVANTS)) player.RemoveAura(LICH_SERVANTS);
}

function configureEchoMinion(
    minion: TSCreature,
    player: TSPlayer,
    followAngle: number,
    followsPlayer: boolean,
): void {
    minion.SetNPCFlags(0);
    minion.SetLootMode(0);
    minion.GetLoot().SetGeneratesNormally(false);
    minion.SetFaction(player.GetFaction());
    minion.SetOwnerGUID(player.GetGUID());
    minion.SetCreatorGUID(player.GetGUID());
    minion.SetPhaseMask(player.GetPhaseMaskForSpawn(), true, 0);

    if (followsPlayer) {
        const flags = Number(minion.GetCoreUInt32(UnitFields.UNIT_FIELD_FLAGS));
        if ((flags & RULES.playerControlled) == 0) {
            minion.SetFlag(UnitFields.UNIT_FIELD_FLAGS, RULES.playerControlled);
        }
        if ((flags & RULES.blockingMinion) != 0) {
            minion.RemoveFlag(UnitFields.UNIT_FIELD_FLAGS, RULES.blockingMinion);
        }
        minion.SetCoreByte(
            UnitFields.UNIT_FIELD_BYTES_2,
            1,
            player.GetCoreByte(UnitFields.UNIT_FIELD_BYTES_2, 1),
        );
        minion.SetLevel(player.GetLevel());
        minion.UpdateLevelDependantStats();
        minion.SetHealth(minion.GetMaxHealth());
    }
    minion.StopSpellCast(0);
    minion.AttackStop();
    minion.ClearInCombat();
    minion.SetReactState(0);
    if (followsPlayer) minion.MoveFollow(player, RULES.minionFollowDistance, followAngle);
}

function spawnEchoMinion(
    player: TSPlayer,
    entry: number,
    despawnMs: number,
    followAngle: number,
): TSCreature | undefined {
    if (player.IsDead()) return undefined;
    const map = player.GetMap();
    const angle = Number(player.GetO()) + followAngle;
    const minion = map.SpawnCreature(
        entry,
        Number(player.GetX()) + Math.cos(angle) * RULES.minionFollowDistance,
        Number(player.GetY()) + Math.sin(angle) * RULES.minionFollowDistance,
        Number(player.GetZ()),
        Number(player.GetO()),
        despawnMs,
        player.GetPhaseMaskForSpawn(),
    );
    if (!minion) return undefined;
    configureEchoMinion(minion, player, followAngle, true);
    bindEchoMinionsToMap(collectionRuntime(player), map);
    return minion;
}

function spawnNetherPortal(player: TSPlayer, target: TSUnit): TSCreature | undefined {
    if (player.IsDead()) return undefined;
    const map = player.GetMap();
    despawnNetherPortal(map, player);
    const angle = Number(player.GetO()) + Math.PI / 2;
    const portal = map.SpawnCreature(
        NETHER_PORTAL_ENTRY,
        Number(target.GetX()) + Math.cos(angle) * 3,
        Number(target.GetY()) + Math.sin(angle) * 3,
        Number(target.GetZ()),
        angle + Math.PI,
        RULES.portalDurationMs,
        player.GetPhaseMaskForSpawn(),
    );
    if (!portal) return undefined;
    // A portal is scenery with owner-scaled scripted damage, not a combat pet.
    // Keep its inert template flags and level instead of briefly presenting it
    // to the client as a level-scaled player-controlled NPC.
    configureEchoMinion(portal, player, 0, false);
    portal.MoveIdle();
    portal.SetRooted(true);
    portal.SetFlag(UnitFields.UNIT_FIELD_FLAGS, RULES.inertPortal);
    bindEchoMinionsToMap(collectionRuntime(player), map);
    collectionRuntime(player).netherPortalGUID = Number(portal.GetGUIDLow());
    return portal;
}

function playerSpellPower(player: TSPlayer): number {
    let power = 0;
    for (let school = 1; school <= 6; school++) {
        power = Math.max(power, Number(player.GetBaseSpellPower(school)));
    }
    return power;
}

function playerAttackPower(player: TSPlayer): number {
    const base = Number(player.GetCoreInt32(UnitFields.UNIT_FIELD_ATTACK_POWER));
    const positive = Number(player.GetCoreUInt16(UnitFields.UNIT_FIELD_ATTACK_POWER_MODS, 0));
    const negative = Number(player.GetCoreUInt16(UnitFields.UNIT_FIELD_ATTACK_POWER_MODS, 1));
    const multiplier = 1 + Number(player.GetCoreFloat(UnitFields.UNIT_FIELD_ATTACK_POWER_MULTIPLIER));
    return Math.max(0, (base + positive - negative) * multiplier);
}

function lichServantDamage(player: TSPlayer): number {
    return Math.max(1, Math.floor(5 + playerSpellPower(player) * 0.10 + playerAttackPower(player) * 0.05));
}

function sanctumSentryDamage(player: TSPlayer): number {
    return Math.max(1, Math.floor(2 + playerSpellPower(player) * 0.025 + playerAttackPower(player) * 0.0125));
}

function netherLightningDamage(player: TSPlayer): number {
    return Math.max(1, Math.floor(
        25 + Number(player.GetBaseSpellPower(2)) * 1.25 + playerAttackPower(player) * 0.625,
    ));
}

function netherFlamestrikeDamage(player: TSPlayer): number {
    return Math.max(1, Math.floor(
        40 + Number(player.GetBaseSpellPower(2)) * 2 + playerAttackPower(player),
    ));
}

function netherPortalOwner(unit: TSUnit): TSPlayer | undefined {
    const creature = unit.ToCreature();
    if (!creature || Number(creature.GetEntry()) != NETHER_PORTAL_ENTRY) return undefined;
    const owner = creature.GetOwner();
    return owner ? owner.ToPlayer() : undefined;
}

function syncLichServantController(player: TSPlayer, count: number, refresh: boolean): void {
    if (count <= 0) {
        if (player.HasAura(LICH_SERVANTS)) player.RemoveAura(LICH_SERVANTS);
        return;
    }
    let aura = player.GetAura(LICH_SERVANTS, player.GetGUID());
    if (!aura) aura = player.AddAura(LICH_SERVANTS, player);
    if (!aura) return;
    aura.SetStackAmount(count as uint8);
    if (refresh && Number(aura.GetMaxDuration()) > 0) {
        aura.SetDuration(Number(aura.GetMaxDuration()));
    }
}

function ensureSanctumSentries(player: TSPlayer): TSArray<number> {
    const runtime = collectionRuntime(player);
    const guids = compactSanctumSentries(player);
    while (guids.length < 2) {
        const followAngle = guids.length == 0 ? Math.PI * 0.65 : Math.PI * 1.35;
        const sentry = spawnEchoMinion(player, SANCTUM_SENTRY_ENTRY, 0, followAngle);
        if (!sentry) break;
        guids.push(Number(sentry.GetGUIDLow()));
        runtime.sanctumSentryGUIDs = guids;
    }
    return guids;
}

function targetHasOwnSanctumMark(player: TSPlayer, target: TSUnit): boolean {
    const guids = compactSanctumSentries(player);
    for (let i = 0; i < guids.length; i++) {
        if (target.HasAura(
            SANCTUM_MARK,
            CreateGUID(HighGuid.Unit, SANCTUM_SENTRY_ENTRY, guids[i]),
        )) return true;
    }
    return false;
}

function emptyRanks(): TSArray<number> {
    const ranks: TSArray<number> = [];
    for (let i = 0; i < ECHOES.length; i++) ranks.push(0);
    return ranks;
}

function ranksOf(container: DBContainer<EchoRankRow>): TSArray<number> {
    const ranks = emptyRanks();
    container.forEach(row => {
        const index = Number(row.echoIndex);
        const rank = Number(row.rank);
        if (index >= 0 && index < ranks.length && index == Math.floor(index) && rank > 0) {
            ranks[index] += Math.floor(rank);
        }
    });
    for (let i = 0; i < ranks.length; i++) {
        if (ranks[i] > ECHOES[i].maxStack) ranks[i] = ECHOES[i].maxStack;
    }
    return ranks;
}

function pickedRanks(ranks: TSArray<number>): number {
    let picked = 0;
    for (let i = 0; i < ranks.length; i++) picked += ranks[i];
    return picked;
}

function offerIndices(offer: EchoOfferState): TSArray<number> {
    const result: TSArray<number> = [];
    const encoded: TSArray<number> = [
        Number(offer.offer1),
        Number(offer.offer2),
        Number(offer.offer3),
    ];
    for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] > 0) result.push(encoded[i] - 1);
    }
    return result;
}

function clearOffer(offer: EchoOfferState): void {
    offer.offerForPick = 0;
    offer.offer1 = 0;
    offer.offer2 = 0;
    offer.offer3 = 0;
    offer.Save();
}

function storedOfferIsCurrent(
    offer: EchoOfferState,
    ranks: TSArray<number>,
    nextPick: number,
): boolean {
    if (Number(offer.offerForPick) != RULES.offerMarker + nextPick
        || Number(offer.offerToken) <= 0) return false;
    const indices = offerIndices(offer);
    if (indices.length < 1 || indices.length > 3) return false;
    for (let i = 0; i < indices.length; i++) {
        for (let j = 0; j < i; j++) {
            if (indices[i] == indices[j]) return false;
        }
        if (!validateEchoChoice(ranks, indices, indices[i])) return false;
    }
    return true;
}

/** Lua-compatible per-offer PRNG; the offer is persisted before it is sent. */
function offerRandom(player: TSPlayer, token: number, nextPick: number): () => number {
    const modulus = 2147483647;
    let seed = (
        Number(GetCurrTime())
        + Number(player.GetGUIDLow()) * 31
        + token * 131
        + nextPick * 17
    ) % modulus;
    if (seed <= 0) seed = 1;
    return () => {
        seed = (seed * 48271) % modulus;
        return seed / modulus;
    };
}

/** Returns only an item-created offer; state requests never create a free roll. */
function currentOffer(player: TSPlayer, ranks: TSArray<number>): EchoOfferState {
    const offer = EchoOfferState.get(player);
    const picked = pickedRanks(ranks);
    if (Number(offer.offerForPick) == 0) {
        if (Number(offer.offer1) != 0 || Number(offer.offer2) != 0 || Number(offer.offer3) != 0) clearOffer(offer);
        return offer;
    }
    if (!storedOfferIsCurrent(offer, ranks, picked + 1)) clearOffer(offer);
    return offer;
}

class EchoCollectionSnapshot {
    unlocked: TSArray<number> = [];
    activeSlots: TSArray<number> = [];
}

function collectionSlotLimit(player: TSPlayer): number {
    const profile = EchoCollectionProfile.get(player);
    const raw = Math.floor(Number(profile.slotLimit));
    const limit = Math.max(RULES.minSlots, Math.min(RULES.maxSlots, raw || RULES.minSlots));
    if (Number(profile.slotLimit) != limit) {
        profile.slotLimit = limit;
        profile.Save();
    }
    return limit;
}

function collectionSlotCrystalCost(slotLimit: number): number {
    return 1 << (slotLimit - RULES.minSlots);
}

function canExpandCollectionSlots(player: TSPlayer): boolean {
    const limit = collectionSlotLimit(player);
    if (limit >= RULES.maxSlots) {
        return reject(player, playerText(
            player,
            "The maximum limit of 10 active auras has been reached.",
            "Достигнут максимальный лимит в 10 активных аур.",
        ), ECHO_ERROR_CONTEXT_COLLECTION);
    }
    const crystals = collectionSlotCrystalCost(limit);
    if (Number(player.GetItemCount(COLLECTION_SLOT_EXPAND_ITEM, false)) < crystals) {
        return reject(
            player,
            playerText(
                player,
                "The next slot requires " + crystals + " crystals ("
                    + (crystals * RULES.crystalGold) + " gold).",
                "Для следующего слота нужно кристаллов: " + crystals
                    + " (" + (crystals * RULES.crystalGold) + " золота).",
            ),
            ECHO_ERROR_CONTEXT_COLLECTION,
        );
    }
    return true;
}

function expandCollectionSlots(player: TSPlayer): boolean {
    if (!canExpandCollectionSlots(player)) return false;
    const profile = EchoCollectionProfile.get(player);
    const limit = collectionSlotLimit(player);
    const crystals = collectionSlotCrystalCost(limit);
    player.RemoveItemByEntry(COLLECTION_SLOT_EXPAND_ITEM, crystals);
    profile.slotLimit = limit + 1;
    profile.Save();
    player.SendBroadcastMessage(playerText(
        player,
        "|cff33ff99Echo: active slot " + (limit + 1) + "/" + RULES.maxSlots
            + " unlocked; crystals spent: " + crystals + ".|r",
        "|cff33ff99Эхо: открыт активный слот " + (limit + 1) + "/" + RULES.maxSlots
            + "; потрачено кристаллов: " + crystals + ".|r",
    ));
    sendState(player);
    return true;
}

function showEchoVendorMenu(creature: TSCreature, player: TSPlayer): void {
    const limit = collectionSlotLimit(player);
    player.GossipClearMenu();
    player.GossipMenuAddItem(
        GossipOptionIcon.VENDOR,
        playerText(player, "Show me the Echo goods.", "Покажите товары Эхо."),
        0,
        RULES.vendorTrade,
    );
    if (limit < RULES.maxSlots) {
        const crystals = collectionSlotCrystalCost(limit);
        player.GossipMenuAddItem(
            GossipOptionIcon.MONEY_BAG,
            playerText(
                player,
                "Unlock slot " + (limit + 1) + "/" + RULES.maxSlots
                    + " — " + crystals + " crystals ("
                    + (crystals * RULES.crystalGold) + " gold).",
                "Открыть слот " + (limit + 1) + "/" + RULES.maxSlots
                    + " — " + crystals + " кристаллов ("
                    + (crystals * RULES.crystalGold) + " золота).",
            ),
            0,
            RULES.vendorExpandSlots,
            false,
            playerText(
                player,
                "Spend " + crystals + " crystals to unlock a new slot?",
                "Потратить " + crystals + " кристаллов и открыть новый слот?",
            ),
        );
    }
    player.GossipSendTextMenu(
        creature,
        playerText(
            player,
            "Active aura slots: " + limit + "/" + RULES.maxSlots + ".",
            "Активных слотов аур: " + limit + "/" + RULES.maxSlots + ".",
        ),
    );
}

function collectionSnapshot(player: TSPlayer): EchoCollectionSnapshot {
    const result = new EchoCollectionSnapshot();
    for (let i = 0; i < COLLECTION_ECHOES.length; i++) {
        result.unlocked.push(0);
        result.activeSlots.push(0);
    }
    EchoCollectionRow.get(player).forEach(row => {
        const index = Number(row.echoIndex);
        if (index < 0 || index >= COLLECTION_ECHOES.length || index != Math.floor(index)) return;
        result.unlocked[index] = 1;
        result.activeSlots[index] = Math.floor(Number(row.activeSlot));
    });
    return result;
}

function collectionRow(player: TSPlayer, echoIndex: number): EchoCollectionRow | undefined {
    return EchoCollectionRow.get(player).find(row => Number(row.echoIndex) == echoIndex);
}

function removeCollectionRuntimeAuras(player: TSPlayer, echoIndex: number): void {
    removeAdvancedEchoRuntime(player, echoIndex);
    const ids: TSArray<number> = [];
    const runtime = collectionRuntime(player);
    if (echoIndex == 0) {
        ids.push(BLADE_ZONE);
        runtime.bladeMaps = [];
        runtime.bladeX = [];
        runtime.bladeY = [];
        runtime.bladeZ = [];
        runtime.bladeTicks = [];
    }
    if (echoIndex == 1) {
        ids.push(BROODMOTHER_ICD);
        removeTrackedCinders(player);
    }
    if (echoIndex == 2) {
        ids.push(SOUL_FRAGMENT);
        ids.push(LICH_SERVANTS);
        despawnLichServants(player.GetMap(), player);
    }
    if (echoIndex == 3) {
        ids.push(RIME);
        ids.push(CHILL_ICD);
        removeTrackedFrostDebuff(player, BRITTLE);
    }
    if (echoIndex == 4) removeTrackedFrostDebuff(player, BITING_COLD);
    if (echoIndex == 5) {
        ids.push(FROSTGUARD_BUFF);
        ids.push(FROSTGUARD_ICD);
    }
    if (echoIndex == 6) {
        ids.push(MUTAGENIC_CLOUD);
        ids.push(MUTAGENIC_ICD);
        runtime.poisonMap = -1;
    }
    if (echoIndex == 7) {
        ids.push(NETHER_PORTAL);
        ids.push(NETHER_ICD);
        ids.push(NETHER_FLAMES);
        runtime.flamesMap = -1;
        despawnNetherPortal(player.GetMap(), player);
    }
    if (echoIndex == 9) despawnSanctumSentries(player.GetMap(), player);
    if (echoIndex == 10) {
        ids.push(SPELLWEAVE_DAMAGE);
        ids.push(SPELLWEAVE_HEALING);
    }
    for (let i = 0; i < ids.length; i++) {
        if (player.HasAura(ids[i])) player.RemoveAura(ids[i]);
    }
}

function resetCollectionMapRuntime(player: TSPlayer): void {
    clearEchoMinionsOnMap(player.GetMap(), player);
    resetAdvancedEchoRuntime(player);
    const runtime = collectionRuntime(player);
    runtime.lastTargetGUID = undefined;
    runtime.bladeMaps = [];
    runtime.bladeX = [];
    runtime.bladeY = [];
    runtime.bladeZ = [];
    runtime.bladeTicks = [];
    runtime.cinderTargetGUIDs = [];
    removeTrackedFrostDebuff(player, BRITTLE);
    removeTrackedFrostDebuff(player, BITING_COLD);
    runtime.frostTargetGUIDs = [];
    runtime.poisonMap = -1;
    runtime.flamesMap = -1;
    const temporary: TSArray<number> = [
        BLADE_ZONE,
        MUTAGENIC_CLOUD,
        NETHER_PORTAL,
        NETHER_FLAMES,
    ];
    for (let i = 0; i < temporary.length; i++) {
        if (player.HasAura(temporary[i])) player.RemoveAura(temporary[i]);
    }
}

function syncCollectionAura(player: TSPlayer, echoIndex: number, active: boolean): void {
    const spellId = COLLECTION_SPELL_IDS[echoIndex];
    if (spellId <= 0) return;
    if (!active) {
        if (player.HasAura(spellId)) player.RemoveAura(spellId);
        if (player.HasSpell(spellId)) player.RemoveSpell(spellId, false, false);
        removeCollectionRuntimeAuras(player, echoIndex);
        return;
    }
    // Controller spells are passive. Learning them gives the core a durable
    // owner for reapplying the marker after death, login, and map changes.
    if (!player.HasSpell(spellId)) player.LearnSpell(spellId);
    if (!player.HasAura(spellId)) player.AddAura(spellId, player);
}

/** Canonicalize ownership/slots before exposing or applying collection state. */
function reconcileCollection(player: TSPlayer): void {
    const container = EchoCollectionRow.get(player);
    const rows: TSArray<EchoCollectionRow | undefined> = [];
    const usedSlots: TSArray<boolean> = [];
    const limit = collectionSlotLimit(player);
    let changed = false;
    // Do not nil-fill this sparse lookup. Lua 5.1 translates push(undefined)
    // into table[#table + 1] = nil, so #rows stays zero and active auras are
    // never restored after login, reload, or a map change.
    for (let i = 0; i <= RULES.maxSlots; i++) usedSlots.push(false);

    container.forEach(row => {
        const index = Number(row.echoIndex);
        if (index < 0 || index >= COLLECTION_ECHOES.length || index != Math.floor(index)) {
            row.Delete();
            changed = true;
            return;
        }
        const prior = rows[index];
        if (prior) {
            if (Number(prior.activeSlot) == 0 && Number(row.activeSlot) > 0) {
                prior.activeSlot = Math.floor(Number(row.activeSlot));
                prior.MarkDirty();
            }
            row.Delete();
            changed = true;
            return;
        }
        rows[index] = row;
    });

    for (let i = 0; i < COLLECTION_ECHOES.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const slot = Math.floor(Number(row.activeSlot));
        if (slot < 0 || slot > limit || (slot > 0 && usedSlots[slot])) {
            row.activeSlot = 0;
            row.MarkDirty();
            changed = true;
        } else if (slot > 0) {
            usedSlots[slot] = true;
        }
    }
    if (changed) container.Save();

    for (let i = 0; i < COLLECTION_ECHOES.length; i++) {
        const row = rows[i];
        syncCollectionAura(player, i, row !== undefined && Number(row.activeSlot) > 0);
    }
}

function appendCollectionState(player: TSPlayer, state: EchoStateMsg): void {
    const snapshot = collectionSnapshot(player);
    state.collectionSlotLimit = collectionSlotLimit(player);
    for (let i = 0; i < COLLECTION_ECHOES.length; i++) {
        state.collectionSpellIds.push(COLLECTION_SPELL_IDS[i]);
        state.collectionUnlocked.push(snapshot.unlocked[i]);
        state.collectionActiveSlots.push(snapshot.activeSlots[i]);
    }
    state.collectionAckToken = echoClient(player).collectionAckToken;
}

/** Consumes no state until the new anti-reroll offer is ready to persist. */
function createOffer(player: TSPlayer, ranks: TSArray<number>): boolean {
    const offer = currentOffer(player, ranks);
    if (Number(offer.offerForPick) != 0) return false;
    const picked = pickedRanks(ranks);
    const nextPick = picked + 1;
    const nextToken = Number(offer.offerToken) >= 0x7ffffffe
        ? 1
        : Number(offer.offerToken) + 1;
    const normalizedToken = nextToken <= 0 ? 1 : nextToken;
    const indices = rollEchoOffer(ranks, offerRandom(player, normalizedToken, nextPick), 3);
    if (indices.length == 0) return false;
    offer.offerToken = normalizedToken;
    offer.offerForPick = RULES.offerMarker + nextPick;
    offer.offer1 = indices.length > 0 ? indices[0] + 1 : 0;
    offer.offer2 = indices.length > 1 ? indices[1] + 1 : 0;
    offer.offer3 = indices.length > 2 ? indices[2] + 1 : 0;
    offer.Save();
    return true;
}

function buildState(player: TSPlayer): EchoStateMsg {
    const ranks = ranksOf(EchoRankRow.get(player));
    const picked = pickedRanks(ranks);
    const offer = currentOffer(player, ranks);
    const pending = Number(offer.offerForPick) != 0 ? 1 : 0;
    const state = new EchoStateMsg();
    state.level = Number(player.GetLevel());
    state.earned = picked + pending;
    state.picked = picked;
    state.pending = pending;
    state.offerToken = pending > 0 ? Number(offer.offerToken) : 0;
    for (let i = 0; i < ECHOES.length; i++) {
        state.spellIds.push(ECHO_SPELL_IDS[i]);
        state.ranks.push(ranks[i]);
    }
    if (pending > 0) {
        const indices = offerIndices(offer);
        for (let i = 0; i < indices.length; i++) {
            state.offers.push(new EchoOfferEntry(indices[i]));
        }
    }
    appendCollectionState(player, state);
    return state;
}

function sendState(player: TSPlayer): void {
    if (!echoClient(player).ready) return;
    buildState(player).write().SendToPlayer(player);
}

function reject(
    player: TSPlayer,
    message: string,
    context: number = ECHO_ERROR_CONTEXT_GENERAL,
): false {
    if (!echoClient(player).ready) {
        player.SendBroadcastMessage(playerText(
            player,
            "|cffff6060Echo: " + message + "|r",
            "|cffff6060Эхо: " + message + "|r",
        ));
        return false;
    }
    new EchoErrorMsg(message, context).write().SendToPlayer(player);
    sendState(player);
    return false;
}

function syncEchoAura(player: TSPlayer, echoIndex: number, rank: number, refresh: boolean): void {
    const spellId = ECHO_SPELL_IDS[echoIndex];
    if (spellId <= 0) return;
    if (rank <= 0) {
        if (player.HasAura(spellId)) player.RemoveAura(spellId);
        if (player.HasSpell(spellId)) player.RemoveSpell(spellId, false, false);
        return;
    }
    if (!player.HasSpell(spellId)) player.LearnSpell(spellId);
    if (refresh && player.HasAura(spellId)) player.RemoveAura(spellId);
    let aura = player.GetAura(spellId);
    if (!aura) aura = player.AddAura(spellId, player);
    if (aura) aura.SetStackAmount(rank as uint8);
}

function hasLevelScaling(echoIndex: number): boolean {
    const effects = ECHOES[echoIndex].effects;
    for (let i = 0; i < effects.length; i++) {
        if (effects[i].pointsPerLevel != 0) return true;
    }
    return false;
}

/** Canonicalize corrupt/duplicate rows, then make spells and auras match them. */
function reconcilePlayer(player: TSPlayer): void {
    const container = EchoRankRow.get(player);
    const rows: TSArray<EchoRankRow | undefined> = [];
    let changed = false;
    for (let i = 0; i < ECHOES.length; i++) rows.push(undefined);

    container.forEach(row => {
        const index = Number(row.echoIndex);
        const rawRank = Number(row.rank);
        if (index < 0
            || index >= ECHOES.length
            || index != Math.floor(index)
            || rawRank <= 0
            || rawRank != Math.floor(rawRank)) {
            row.Delete();
            changed = true;
            return;
        }
        const rank = Math.min(rawRank, ECHOES[index].maxStack);
        const prior = rows[index];
        if (prior) {
            prior.rank = Math.min(Number(prior.rank) + rank, ECHOES[index].maxStack);
            prior.MarkDirty();
            row.Delete();
            changed = true;
            return;
        }
        rows[index] = row;
        if (Number(row.rank) != rank) {
            row.rank = rank;
            row.MarkDirty();
            changed = true;
        }
    });
    if (changed) container.Save();

    const ranks = ranksOf(container);
    for (let i = 0; i < ECHOES.length; i++) syncEchoAura(player, i, ranks[i], false);
    reconcileCollection(player);
}

function refreshLevelScaling(player: TSPlayer): void {
    const ranks = ranksOf(EchoRankRow.get(player));
    for (let i = 0; i < ECHOES.length; i++) {
        if (ranks[i] > 0 && hasLevelScaling(i)) syncEchoAura(player, i, ranks[i], true);
    }
}

function rankRow(
    player: TSPlayer,
    container: DBContainer<EchoRankRow>,
    echoIndex: number,
): EchoRankRow {
    const existing = container.find(row => Number(row.echoIndex) == echoIndex);
    if (existing) return existing;
    const row = new EchoRankRow(player.GetGUIDLow());
    row.echoIndex = echoIndex;
    row.rank = 0;
    container.Add(row);
    return row;
}

/** The only mutation path for both OP88 and `echo choose`. */
function chooseEcho(player: TSPlayer, offerToken: number, echoIndex: number): boolean {
    if (offerToken <= 0
        || offerToken != Math.floor(offerToken)
        || echoIndex < 0
        || echoIndex >= ECHOES.length
        || echoIndex != Math.floor(echoIndex)) {
        return reject(player, playerText(player, "Invalid choice.", "Некорректный выбор."), ECHO_ERROR_CONTEXT_CARD);
    }

    const container = EchoRankRow.get(player);
    const ranks = ranksOf(container);
    const picked = pickedRanks(ranks);
    const offer = currentOffer(player, ranks);
    const indices = offerIndices(offer);
    if (Number(offer.offerForPick) != RULES.offerMarker + picked + 1
        || Number(offer.offerToken) != offerToken
        || !validateEchoChoice(ranks, indices, echoIndex)) {
        return reject(player, playerText(
            player,
            "This offer has expired; the state was refreshed.",
            "Предложение устарело; состояние обновлено.",
        ), ECHO_ERROR_CONTEXT_CARD);
    }

    const row = rankRow(player, container, echoIndex);
    row.rank = ranks[echoIndex] + 1;
    row.MarkDirty();
    container.Save();

    // Saving the rank first makes a crash between these writes harmless: the
    // old offerForPick no longer matches picked + 1 after relog.
    clearOffer(offer);
    syncEchoAura(player, echoIndex, Number(row.rank), false);
    if (!echoClient(player).ready) {
        player.SendBroadcastMessage(playerText(
            player,
            "|cff33ff99Echo chosen: " + EchoLocale.Name(player, echoIndex, false)
                + " (" + Number(row.rank) + "/" + ECHOES[echoIndex].maxStack + ").|r",
            "|cff33ff99Эхо выбрано: " + EchoLocale.Name(player, echoIndex, false)
                + " (" + Number(row.rank) + "/" + ECHOES[echoIndex].maxStack + ").|r",
        ));
    }
    sendState(player);
    return true;
}

function showEchoList(player: TSPlayer): void {
    const ranks = ranksOf(EchoRankRow.get(player));
    const picked = pickedRanks(ranks);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff33ff99Echo: ranks chosen — " + picked + ".|r",
        "|cff33ff99Эхо: выбрано рангов — " + picked + ".|r",
    ));
    for (let i = 0; i < ranks.length; i++) {
        if (ranks[i] > 0) {
            player.SendBroadcastMessage(
                "  " + EchoLocale.Name(player, i, false) + ": " + ranks[i] + "/" + ECHOES[i].maxStack,
            );
        }
    }
    const offer = currentOffer(player, ranks);
    const indices = offerIndices(offer);
    if (Number(offer.offerForPick) == 0) {
        player.SendBroadcastMessage(playerText(
            player,
            "There is no active choice. Use an Echo Crystal.",
            "Нет активного выбора. Используйте Кристалл Эхо.",
        ));
        return;
    }
    for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        player.SendBroadcastMessage(
            playerText(
                player,
                "  echo choose " + (i + 1) + " — " + EchoLocale.Name(player, index, false)
                    + " (current rank: " + ranks[index] + ").",
                "  echo choose " + (i + 1) + " — " + EchoLocale.Name(player, index, false)
                    + " (текущий ранг: " + ranks[index] + ").",
            ),
        );
    }
}

function canActivateChoice(player: TSPlayer): boolean {
    const ranks = ranksOf(EchoRankRow.get(player));
    const offer = currentOffer(player, ranks);
    if (Number(offer.offerForPick) != 0) {
        player.SendBroadcastMessage(playerText(
            player,
            "|cffff6060Finish your current Echo choice first.|r",
            "|cffff6060Сначала завершите текущий выбор Эхо.|r",
        ));
        sendState(player);
        return false;
    }
    if (rollEchoOffer(ranks, () => 0, 1).length == 0) {
        player.SendBroadcastMessage(playerText(
            player,
            "|cffff6060Every available Echo has already reached maximum rank.|r",
            "|cffff6060Все доступные Эхо уже достигли максимального ранга.|r",
        ));
        return false;
    }
    return true;
}

function activateChoice(player: TSPlayer): void {
    const ranks = ranksOf(EchoRankRow.get(player));
    if (!createOffer(player, ranks)) return;
    player.SendBroadcastMessage(playerText(
        player,
        "|cff33ff99Crystal activated. Choose one of the offered Echoes.|r",
        "|cff33ff99Кристалл активирован. Выберите одно из предложенных Эхо.|r",
    ));
    sendState(player);
}

function canResetEchoes(player: TSPlayer): boolean {
    const ranks = ranksOf(EchoRankRow.get(player));
    const offer = currentOffer(player, ranks);
    if (pickedRanks(ranks) > 0 || Number(offer.offerForPick) != 0) return true;
    player.SendBroadcastMessage(playerText(
        player,
        "|cffff6060This character has no card Echoes to remove. This item does not reset the book collection.|r",
        "|cffff6060У персонажа нет карточных Эхо для удаления. Коллекция книг этим предметом не сбрасывается.|r",
    ));
    return false;
}

function resetEchoes(player: TSPlayer): void {
    const container = EchoRankRow.get(player);
    container.forEach(row => row.Delete());
    container.Save();
    clearOffer(EchoOfferState.get(player));
    for (let i = 0; i < ECHOES.length; i++) syncEchoAura(player, i, 0, false);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff33ff99All card Echo ranks and the unfinished choice were removed. The book collection was not changed.|r",
        "|cff33ff99Все ранги карточных Эхо и незавершённый выбор удалены. Коллекция книг не затронута.|r",
    ));
    sendState(player);
}

function collectionBookIndex(spellId: number): number {
    for (let i = 0; i < COLLECTION_BOOK_USE_SPELL_IDS.length; i++) {
        if (COLLECTION_BOOK_USE_SPELL_IDS[i] == spellId) return i;
    }
    return -1;
}

function activeCollectionCount(snapshot: EchoCollectionSnapshot): number {
    let count = 0;
    for (let i = 0; i < snapshot.activeSlots.length; i++) {
        if (snapshot.activeSlots[i] > 0) count++;
    }
    return count;
}

function setCollectionActive(player: TSPlayer, echoIndex: number, desiredActive: number): boolean {
    if (echoIndex < 0
        || echoIndex >= COLLECTION_ECHOES.length
        || echoIndex != Math.floor(echoIndex)
        || (desiredActive != 0 && desiredActive != 1)) {
        return reject(player, playerText(
            player,
            "Invalid collection change.",
            "Некорректное изменение коллекции.",
        ), ECHO_ERROR_CONTEXT_COLLECTION);
    }
    reconcileCollection(player);
    const row = collectionRow(player, echoIndex);
    if (!row) {
        return reject(
            player,
            playerText(
                player,
                "This Echo has not been added to the collection yet.",
                "Это Эхо ещё не добавлено в коллекцию.",
            ),
            ECHO_ERROR_CONTEXT_COLLECTION,
        );
    }

    const currentlyActive = Number(row.activeSlot) > 0;
    if ((desiredActive == 1) == currentlyActive) {
        sendState(player);
        return true;
    }

    if (desiredActive == 0) {
        row.activeSlot = 0;
        row.MarkDirty();
        EchoCollectionRow.get(player).Save();
        syncCollectionAura(player, echoIndex, false);
        player.SendBroadcastMessage(playerText(
            player,
            "|cff80c0ffEcho deactivated: " + EchoLocale.Name(player, echoIndex, true) + ".|r",
            "|cff80c0ffЭхо отключено: " + EchoLocale.Name(player, echoIndex, true) + ".|r",
        ));
        sendState(player);
        return true;
    }

    const snapshot = collectionSnapshot(player);
    const limit = collectionSlotLimit(player);
    if (activeCollectionCount(snapshot) >= limit) {
        return reject(
            player,
            playerText(
                player,
                "All active slots are occupied (" + limit + "/" + limit + ").",
                "Все активные слоты заняты (" + limit + "/" + limit + ").",
            ),
            ECHO_ERROR_CONTEXT_COLLECTION,
        );
    }
    const used: TSArray<boolean> = [];
    for (let i = 0; i <= RULES.maxSlots; i++) used.push(false);
    for (let i = 0; i < snapshot.activeSlots.length; i++) {
        const slot = snapshot.activeSlots[i];
        if (slot > 0 && slot <= RULES.maxSlots) used[slot] = true;
    }
    let freeSlot = 1;
    while (freeSlot <= limit && used[freeSlot]) freeSlot++;
    if (freeSlot > limit) {
        return reject(
            player,
            playerText(
                player,
                "No free active slot was found.",
                "Свободный активный слот не найден.",
            ),
            ECHO_ERROR_CONTEXT_COLLECTION,
        );
    }

    row.activeSlot = freeSlot;
    row.MarkDirty();
    EchoCollectionRow.get(player).Save();
    syncCollectionAura(player, echoIndex, true);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff33ff99Echo active: " + EchoLocale.Name(player, echoIndex, true)
            + " (slot " + freeSlot + "/" + limit + ").|r",
        "|cff33ff99Эхо активно: " + EchoLocale.Name(player, echoIndex, true)
            + " (слот " + freeSlot + "/" + limit + ").|r",
    ));
    sendState(player);
    return true;
}

function canLearnCollectionBook(player: TSPlayer, echoIndex: number): boolean {
    if (echoIndex < 0 || echoIndex >= COLLECTION_ECHOES.length) {
        return reject(player, playerText(
            player,
            "Unknown Echo book.",
            "Неизвестная книга Эхо.",
        ), ECHO_ERROR_CONTEXT_COLLECTION);
    }
    reconcileCollection(player);
    if (collectionRow(player, echoIndex)) {
        return reject(
            player,
            playerText(
                player,
                "Echo “" + EchoLocale.Name(player, echoIndex, true)
                    + "” is already in the collection; the book was not consumed.",
                "Эхо «" + EchoLocale.Name(player, echoIndex, true)
                    + "» уже есть в коллекции; книга не израсходована.",
            ),
            ECHO_ERROR_CONTEXT_COLLECTION,
        );
    }
    return true;
}

function learnCollectionBook(player: TSPlayer, echoIndex: number): void {
    if (collectionRow(player, echoIndex)) return;
    const row = new EchoCollectionRow(player.GetGUIDLow());
    row.echoIndex = echoIndex;
    row.activeSlot = 0;
    const container = EchoCollectionRow.get(player);
    container.Add(row);
    container.Save();
    player.SendBroadcastMessage(playerText(
        player,
        "|cffb060ffEcho Collection expanded: " + EchoLocale.Name(player, echoIndex, true)
            + ". Open /echoes to activate it.|r",
        "|cffb060ffКоллекция Эхо пополнена: " + EchoLocale.Name(player, echoIndex, true)
            + ". Откройте /echoes, чтобы активировать его.|r",
    ));
    sendState(player);
}

function showCollectionList(player: TSPlayer): void {
    reconcileCollection(player);
    const snapshot = collectionSnapshot(player);
    const active = activeCollectionCount(snapshot);
    let unlocked = 0;
    for (let i = 0; i < snapshot.unlocked.length; i++) {
        unlocked += snapshot.unlocked[i];
    }
    player.SendBroadcastMessage(playerText(
        player,
        "|cffb060ffEcho Collection: unlocked " + unlocked
            + "/" + COLLECTION_ECHOES.length + ", active " + active + "/" + collectionSlotLimit(player) + ".|r",
        "|cffb060ffКоллекция Эхо: изучено " + unlocked
            + "/" + COLLECTION_ECHOES.length + ", активно " + active + "/" + collectionSlotLimit(player) + ".|r",
    ));
    for (let i = 0; i < COLLECTION_ECHOES.length; i++) {
        const status = snapshot.unlocked[i] == 0
            ? playerText(player, "not unlocked", "не изучено")
            : snapshot.activeSlots[i] > 0
                ? playerText(
                    player,
                    "active, slot " + snapshot.activeSlots[i],
                    "активно, слот " + snapshot.activeSlots[i],
                )
                : playerText(player, "unlocked", "изучено");
        player.SendBroadcastMessage(
            "  " + (i + 1) + ". " + EchoLocale.Name(player, i, true) + " — " + status + ".",
        );
    }
}

function isCollectionActive(player: TSPlayer, echoIndex: number): boolean {
    const spellId = COLLECTION_SPELL_IDS[echoIndex];
    if (spellId > 0 && player.HasAura(spellId)) return true;
    const row = collectionRow(player, echoIndex);
    if (!row || Number(row.activeSlot) <= 0) return false;
    // The persisted slot is authoritative. Repair a missing passive marker on
    // demand so one failed aura application cannot silently disable an Echo.
    syncCollectionAura(player, echoIndex, true);
    return true;
}

export function isCollectionDamageHelper(spellId: number): boolean {
    if (isAdvancedEchoDamageHelper(spellId)) return true;
    for (let i = 0; i < COLLECTION_HELPER_DAMAGE_IDS.length; i++) {
        if (COLLECTION_HELPER_DAMAGE_IDS[i] == spellId) return true;
    }
    return false;
}

function refreshedAura(caster: TSPlayer, target: TSUnit, spellId: number): TSAura | undefined {
    let aura = target.GetAura(spellId, caster.GetGUID());
    if (!aura) aura = caster.AddAura(spellId, target);
    if (aura && Number(aura.GetMaxDuration()) > 0) aura.SetDuration(Number(aura.GetMaxDuration()));
    return aura;
}

function addAuraStack(
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

function rememberCollectionTarget(player: TSPlayer, target: TSUnit): void {
    collectionRuntime(player).lastTargetGUID = target.GetGUID();
}

function collectionTarget(player: TSPlayer): TSUnit | undefined {
    const guid = collectionRuntime(player).lastTargetGUID;
    if (!guid) return undefined;
    const target = player.GetUnit(guid);
    if (!target || Number(target.GetHealth()) <= 0 || !isCollectionEnemyTarget(player, target)) {
        return undefined;
    }
    return target;
}

function sameCollectionGUID(left: TSGUID, right: TSGUID): boolean {
    return Number(left.GetType()) == Number(right.GetType())
        && Number(left.GetCounter()) == Number(right.GetCounter());
}

/** Neutral attackable creatures are enemies too; only self/friendly targets are excluded. */
function isCollectionEnemyTarget(player: TSPlayer, target: TSUnit): boolean {
    if (target.IsDead() || sameCollectionGUID(player.GetGUID(), target.GetGUID())) return false;
    return !player.IsFriendlyTo(target) && !target.IsFriendlyTo(player);
}

function rememberCinderTarget(player: TSPlayer, target: TSUnit): void {
    const runtime = collectionRuntime(player);
    const compacted: TSArray<TSGUID> = [];
    const targetGUID = target.GetGUID();
    let found = false;
    for (let i = 0; i < runtime.cinderTargetGUIDs.length; i++) {
        const guid = runtime.cinderTargetGUIDs[i];
        const unit = player.GetUnit(guid);
        if (!unit || !unit.GetAura(SEARING_CINDERS, player.GetGUID())) continue;
        compacted.push(guid);
        if (sameCollectionGUID(guid, targetGUID)) found = true;
    }
    if (!found) compacted.push(targetGUID);
    runtime.cinderTargetGUIDs = compacted;
}

function removeTrackedCinders(player: TSPlayer): void {
    const runtime = collectionRuntime(player);
    const targets = runtime.cinderTargetGUIDs;
    runtime.cinderTargetGUIDs = [];
    for (let i = 0; i < targets.length; i++) {
        const target = player.GetUnit(targets[i]);
        if (!target) continue;
        const aura = target.GetAura(SEARING_CINDERS, player.GetGUID());
        if (aura) aura.Remove();
    }
}

function rememberFrostTarget(player: TSPlayer, target: TSUnit): void {
    const runtime = collectionRuntime(player);
    const compacted: TSArray<TSGUID> = [];
    const targetGUID = target.GetGUID();
    let found = false;
    for (let i = 0; i < runtime.frostTargetGUIDs.length; i++) {
        const guid = runtime.frostTargetGUIDs[i];
        const unit = player.GetUnit(guid);
        if (!unit
            || (!unit.GetAura(BRITTLE, player.GetGUID())
                && !unit.GetAura(BITING_COLD, player.GetGUID()))) continue;
        compacted.push(guid);
        if (sameCollectionGUID(guid, targetGUID)) found = true;
    }
    if (!found) compacted.push(targetGUID);
    runtime.frostTargetGUIDs = compacted;
}

function removeTrackedFrostDebuff(player: TSPlayer, spellId: number): void {
    const runtime = collectionRuntime(player);
    const remaining: TSArray<TSGUID> = [];
    for (let i = 0; i < runtime.frostTargetGUIDs.length; i++) {
        const target = player.GetUnit(runtime.frostTargetGUIDs[i]);
        if (!target) continue;
        const aura = target.GetAura(spellId, player.GetGUID());
        if (aura) aura.Remove();
        if (target.GetAura(BRITTLE, player.GetGUID())
            || target.GetAura(BITING_COLD, player.GetGUID())) {
            remaining.push(runtime.frostTargetGUIDs[i]);
        }
    }
    runtime.frostTargetGUIDs = remaining;
}

function hasOwnPeriodicDamage(player: TSPlayer, target: TSUnit): boolean {
    const applications = target.GetAuraApplications();
    for (let i = 0; i < applications.length; i++) {
        const aura = applications[i].GetAura();
        if (!aura) continue;
        const casterGUID = aura.GetCasterGUID();
        if (!casterGUID.IsPlayer() || Number(casterGUID.GetCounter()) != Number(player.GetGUIDLow())) continue;
        const info = GetSpellInfo(Number(aura.GetAuraID()));
        if (!info) continue;
        for (let effectIndex = 0; effectIndex < 3; effectIndex++) {
            const effect = info.GetEffect(effectIndex as SpellEffIndex);
            if (!effect) continue;
            const auraType = effect.GetAura();
            if (auraType == AuraType.PERIODIC_DAMAGE
                || auraType == AuraType.PERIODIC_DAMAGE_PERCENT) return true;
        }
    }
    return false;
}

function castAtHostileUnitsInFront(
    player: TSPlayer,
    spellId: number,
    range: number,
    arc: number,
    debuffId: number = 0,
): void {
    const units = player.GetUnitsInRange(range, 0, 1);
    for (let i = 0; i < units.length; i++) {
        const target = units[i];
        if (!isCollectionEnemyTarget(player, target) || !player.IsInFront(target, arc)) continue;
        player.CastSpell(target, spellId, true);
        if (debuffId > 0) {
            refreshedAura(player, target, debuffId);
            if (debuffId == BRITTLE) rememberFrostTarget(player, target);
        }
    }
}

function triggerBladeTempest(player: TSPlayer, target: TSUnit): void {
    if (!isCollectionActive(player, 0)
        || !hasOwnPeriodicDamage(player, target)
        || Math.random() >= 0.05) return;
    const runtime = collectionRuntime(player);
    runtime.bladeMaps.push(Number(player.GetMapID()));
    runtime.bladeX.push(Number(target.GetX()));
    runtime.bladeY.push(Number(target.GetY()));
    runtime.bladeZ.push(Number(target.GetZ()));
    runtime.bladeTicks.push(8);
    refreshedAura(player, player, BLADE_ZONE);
}

function triggerBroodmothersFury(player: TSPlayer, target: TSUnit): void {
    if (!isCollectionActive(player, 1) || Math.random() >= 0.30) return;
    const stacks = addAuraStack(player, target, SEARING_CINDERS, 5);
    rememberCinderTarget(player, target);
    if (stacks < 5 || player.HasAura(BROODMOTHER_ICD)) return;
    const cinders = target.GetAura(SEARING_CINDERS, player.GetGUID());
    if (cinders) cinders.Remove();
    refreshedAura(player, player, BROODMOTHER_ICD);
    castAtHostileUnitsInFront(player, DEEP_BREATH_HIT, 40, Math.PI / 2);
}

function triggerChill(player: TSPlayer): void {
    if (!isCollectionActive(player, 3) || player.HasAura(CHILL_ICD)) return;
    const stacks = addAuraStack(player, player, RIME, 12);
    if (stacks < 12) return;
    player.RemoveAura(RIME);
    refreshedAura(player, player, CHILL_ICD);
    castAtHostileUnitsInFront(player, FROST_BREATH_HIT, 40, Math.PI / 2, BRITTLE);
}

function triggerFrostfire(
    player: TSPlayer,
    target: TSUnit,
    schoolMask: number,
    allowShatter: boolean = true,
): void {
    if (!isCollectionActive(player, 4)) return;
    if ((schoolMask & RULES.schoolFrost) != 0) {
        addAuraStack(player, target, BITING_COLD, 10);
        rememberFrostTarget(player, target);
    }
    if (!allowShatter || (schoolMask & RULES.schoolFire) == 0) return;
    const bitingCold = target.GetAura(BITING_COLD, player.GetGUID());
    const stacks = bitingCold ? Number(bitingCold.GetStackAmount()) : 0;
    if (!bitingCold || stacks < 6) return;
    bitingCold.Remove();
    for (let stack = 0; stack < stacks && !target.IsDead(); stack++) {
        player.CastSpell(target, FROSTFIRE_SHATTER_HIT, true);
    }
    const nearby = target.GetUnitsInRange(8, 0, 1);
    for (let i = 0; i < nearby.length; i++) {
        const unit = nearby[i];
        if (!isCollectionEnemyTarget(player, unit)) continue;
        for (let stack = 0; stack < stacks && !unit.IsDead(); stack++) {
            player.CastSpell(unit, FROSTFIRE_SHATTER_HIT, true);
        }
    }
}

function triggerNetherPortal(player: TSPlayer, target: TSUnit): void {
    if (!isCollectionActive(player, 7)
        || player.HasAura(NETHER_PORTAL)
        || findNetherPortal(player) !== undefined
        || player.HasAura(NETHER_ICD)
        || Math.random() >= 0.15) return;
    if (!spawnNetherPortal(player, target)) return;
    if (!refreshedAura(player, player, NETHER_PORTAL)) {
        despawnNetherPortal(player.GetMap(), player);
        return;
    }
    refreshedAura(player, player, NETHER_ICD);
}

function processOutgoingDirectDamage(
    player: TSPlayer,
    target: TSUnit,
    schoolMask: number,
): void {
    if (!isCollectionEnemyTarget(player, target)) return;
    rememberCollectionTarget(player, target);
    if ((schoolMask & RULES.schoolPhysical) != 0) triggerBladeTempest(player, target);
    triggerBroodmothersFury(player, target);
    if ((schoolMask & RULES.schoolFrost) != 0) triggerChill(player);
    triggerFrostfire(player, target, schoolMask);
    triggerNetherPortal(player, target);
}

function outgoingDamageMultiplier(player: TSPlayer, target: TSUnit, schoolMask: number): number {
    let multiplier = 1;
    if (isCollectionActive(player, 3)
        && (schoolMask & RULES.schoolFrost) != 0
        && target.HasAura(BRITTLE, player.GetGUID())) multiplier *= 1.10;
    if (isCollectionActive(player, 9)
        && targetHasOwnSanctumMark(player, target)) multiplier *= 1.10;
    return multiplier;
}

function maybeTriggerFrostguard(player: TSPlayer, incomingDamage: number): void {
    if (!isCollectionActive(player, 5)
        || player.HasAura(FROSTGUARD_ICD)
        || incomingDamage <= 0) return;
    const health = Number(player.GetHealth());
    const maximum = Number(player.GetMaxHealth());
    if (maximum <= 0 || health * 2 < maximum || (health - incomingDamage) * 2 >= maximum) return;
    refreshedAura(player, player, FROSTGUARD_BUFF);
    refreshedAura(player, player, FROSTGUARD_ICD);
}

class EchoSpellKinds {
    damaging: boolean = false;
    healing: boolean = false;
}

function echoSpellKinds(info: TSSpellInfo): EchoSpellKinds {
    const result = new EchoSpellKinds();
    for (let index = 0; index < 3; index++) {
        const effect = info.GetEffect(index as SpellEffIndex);
        if (!effect) continue;
        const type = effect.GetType();
        if (type == SpellEffects.SCHOOL_DAMAGE
            || type == SpellEffects.HEALTH_LEECH
            || type == SpellEffects.WEAPON
            || type == SpellEffects.WEAPON_DAMAGE
            || type == SpellEffects.WEAPON_DAMAGE_NOSCHOOL
            || type == SpellEffects.WEAPON_PERCENT_DAMAGE
            || type == SpellEffects.NORMALIZED_WEAPON_DMG) result.damaging = true;
        if (type == SpellEffects.HEAL
            || type == SpellEffects.HEAL_MAX_HEALTH
            || type == SpellEffects.HEAL_MECHANICAL
            || type == SpellEffects.SPIRIT_HEAL
            || type == SpellEffects.HEAL_PCT) result.healing = true;
    }
    return result;
}

function twinFamilyAllowed(family: number): boolean {
    return (family >= 3 && family <= 11)
        || family == 15;
}

function handleEchoSpellCast(spell: TSSpell): void {
    const player = spell.GetCaster().ToPlayer();
    if (!player || spell.IsAutoRepeat()) return;
    const spellId = Number(spell.GetEntry());
    if (isCollectionDamageHelper(spellId)
        || collectionBookIndex(spellId) >= 0
        || spellId == ECHO_CHOICE_USE_SPELL
        || spellId == ECHO_RESET_USE_SPELL) return;
    const info = spell.GetSpellInfo();
    if (!info) return;
    const kinds = echoSpellKinds(info);

    if (isCollectionActive(player, 10)) {
        if (kinds.healing) refreshedAura(player, player, SPELLWEAVE_DAMAGE);
        if (kinds.damaging) refreshedAura(player, player, SPELLWEAVE_HEALING);
    }

    const runtime = collectionRuntime(player);
    if (runtime.twinCast) {
        runtime.twinCast = false;
        return;
    }
    if (!isCollectionActive(player, 11)
        || (!kinds.damaging && !kinds.healing)
        || !twinFamilyAllowed(Number(info.GetSpellFamilyName()))
        || Math.random() >= 0.35) return;
    const targetObject = spell.GetTarget();
    if (!targetObject) return;
    const target = targetObject.ToUnit();
    if (!target || target.IsDead()) return;
    runtime.twinCast = true;
    player.CastSpell(target, spellId, true);
    // The duplicate's synchronous OnAfterCast clears this guard. If a core
    // spell never reaches OnAfterCast, the next normal cast clears it safely.
}

function onBladeTempestTick(effect: TSAuraEffect): void {
    const ownerObject = effect.GetAura().GetOwner();
    const player = ownerObject ? ownerObject.ToPlayer() : undefined;
    if (!player || !isCollectionActive(player, 0)) {
        effect.GetAura().Remove();
        return;
    }
    const runtime = collectionRuntime(player);
    const maps: TSArray<number> = [];
    const x: TSArray<number> = [];
    const y: TSArray<number> = [];
    const z: TSArray<number> = [];
    const ticks: TSArray<number> = [];
    const currentMap = Number(player.GetMapID());
    for (let i = 0; i < runtime.bladeTicks.length; i++) {
        const remaining = runtime.bladeTicks[i];
        if (remaining <= 0 || runtime.bladeMaps[i] != currentMap) continue;
        player.CastSpellAoF(
            runtime.bladeX[i],
            runtime.bladeY[i],
            runtime.bladeZ[i],
            BLADE_HIT,
            true,
        );
        if (remaining <= 1) continue;
        maps.push(runtime.bladeMaps[i]);
        x.push(runtime.bladeX[i]);
        y.push(runtime.bladeY[i]);
        z.push(runtime.bladeZ[i]);
        ticks.push(remaining - 1);
    }
    runtime.bladeMaps = maps;
    runtime.bladeX = x;
    runtime.bladeY = y;
    runtime.bladeZ = z;
    runtime.bladeTicks = ticks;
    if (ticks.length == 0) effect.GetAura().Remove();
}

function onLichServantsTick(effect: TSAuraEffect): void {
    const ownerObject = effect.GetAura().GetOwner();
    const player = ownerObject ? ownerObject.ToPlayer() : undefined;
    if (!player) return;
    if (!isCollectionActive(player, 2)) {
        despawnLichServants(player.GetMap(), player);
        effect.GetAura().Remove();
        return;
    }
    const guids = compactLichServants(player);
    if (guids.length == 0) {
        effect.GetAura().Remove();
        return;
    }
    syncLichServantController(player, guids.length, false);
    const target = collectionTarget(player);
    if (!target) return;
    const map = player.GetMap();
    const damage = lichServantDamage(player);
    for (let i = 0; i < guids.length; i++) {
        const servant = findEchoMinion(map, LICH_SERVANT_ENTRY, guids[i]);
        if (servant) servant.CastCustomSpell(target, LICH_SERVANT_HIT, true, damage, 0, 0);
    }
}

function onMutagenicCloudTick(effect: TSAuraEffect): void {
    const ownerObject = effect.GetAura().GetOwner();
    const player = ownerObject ? ownerObject.ToPlayer() : undefined;
    if (!player || !isCollectionActive(player, 6)) return;
    const runtime = collectionRuntime(player);
    if (runtime.poisonMap < 0 || runtime.poisonMap != Number(player.GetMapID())) {
        effect.GetAura().Remove();
        return;
    }
    player.CastSpellAoF(runtime.poisonX, runtime.poisonY, runtime.poisonZ, MUTAGENIC_VISUAL, true);
    player.CastSpellAoF(runtime.poisonX, runtime.poisonY, runtime.poisonZ, MUTAGENIC_HIT, true);
}

function onNetherPortalTick(effect: TSAuraEffect): void {
    const ownerObject = effect.GetAura().GetOwner();
    const player = ownerObject ? ownerObject.ToPlayer() : undefined;
    if (!player) return;
    if (!isCollectionActive(player, 7)) {
        despawnNetherPortal(player.GetMap(), player);
        effect.GetAura().Remove();
        return;
    }
    const portal = findNetherPortal(player);
    if (!portal) {
        effect.GetAura().Remove();
        return;
    }
    const target = collectionTarget(player);
    if (!target) return;
    portal.SetFacingToObject(target);
    const lightningDamage = netherLightningDamage(player);
    const lightningResult = portal.CastCustomSpell(
        target,
        NETHER_LIGHTNING_HIT,
        false,
        lightningDamage,
        0,
        0,
    );
    // A normal cast sends SPELL_START and therefore exposes the portal's bolt
    // visual. If the core rejects that cast, retain the mechanical hit without
    // pretending that the periodic ground fire was the direct attack.
    if (Number(lightningResult) != SpellCastResult.FAILED_SUCCESS) {
        portal.DealDamage(
            target,
            lightningDamage,
            false,
            SpellSchools.SHADOW,
            NETHER_LIGHTNING_HIT,
        );
    }
    if (Math.random() >= 0.25) return;
    const runtime = collectionRuntime(player);
    runtime.flamesMap = Number(player.GetMapID());
    runtime.flamesX = Number(target.GetX());
    runtime.flamesY = Number(target.GetY());
    runtime.flamesZ = Number(target.GetZ());
    // Keep the impact triggered so it cannot replace the still-flying normal
    // bolt in the portal's current-spell slot. Its InstantAreaKit is delivered
    // by SPELL_GO and therefore does not need a separate SPELL_START packet.
    portal.CastSpellAoF(
        runtime.flamesX,
        runtime.flamesY,
        runtime.flamesZ,
        NETHER_FLAMESTRIKE_HIT,
        true,
    );
    const burstDamage = netherFlamestrikeDamage(player);
    portal.DealDamage(
        target,
        burstDamage,
        false,
        SpellSchools.FIRE,
        NETHER_FLAMESTRIKE_HIT,
    );
    const nearby = target.GetUnitsInRange(5, 0, 1);
    for (let i = 0; i < nearby.length; i++) {
        const unit = nearby[i];
        if (sameCollectionGUID(unit.GetGUID(), target.GetGUID())
            || !isCollectionEnemyTarget(player, unit)) continue;
        portal.DealDamage(
            unit,
            burstDamage,
            false,
            SpellSchools.FIRE,
            NETHER_FLAMESTRIKE_HIT,
        );
    }
    refreshedAura(player, player, NETHER_FLAMES);
}

function onNetherPortalRemoved(
    effect: TSAuraEffect,
    application: TSAuraApplication,
    type: uint32,
): void {
    const player = application.GetTarget().ToPlayer();
    if (player) despawnNetherPortal(player.GetMap(), player);
}

function onNetherFlamesTick(effect: TSAuraEffect): void {
    const ownerObject = effect.GetAura().GetOwner();
    const player = ownerObject ? ownerObject.ToPlayer() : undefined;
    if (!player || !isCollectionActive(player, 7)) return;
    const runtime = collectionRuntime(player);
    if (runtime.flamesMap < 0 || runtime.flamesMap != Number(player.GetMapID())) {
        effect.GetAura().Remove();
        return;
    }
    player.CastSpellAoF(runtime.flamesX, runtime.flamesY, runtime.flamesZ, NETHER_FLAMES_TICK, true);
}

function onSanctumSentriesTick(effect: TSAuraEffect): void {
    const ownerObject = effect.GetAura().GetOwner();
    const player = ownerObject ? ownerObject.ToPlayer() : undefined;
    if (!player) return;
    if (player.IsDead() || !player.IsInCombat() || !isCollectionActive(player, 9)) {
        despawnSanctumSentries(player.GetMap(), player);
        return;
    }
    const guids = ensureSanctumSentries(player);
    const target = collectionTarget(player);
    if (!target) return;
    const map = player.GetMap();
    const damage = sanctumSentryDamage(player);
    for (let i = 0; i < guids.length; i++) {
        const sentry = findEchoMinion(map, SANCTUM_SENTRY_ENTRY, guids[i]);
        if (!sentry) continue;
        sentry.CastSpell(target, SANCTUM_MARK, true);
        sentry.CastCustomSpell(target, SANCTUM_SENTRY_HIT, true, damage, 0, 0);
    }
}

function onCollectionCreatureKill(player: TSPlayer, killed: TSCreature): void {
    if (player.IsDead()
        || player.IsFriendlyTo(killed)
        || killed.IsFriendlyTo(player)) return;
    if (isCollectionActive(player, 2)) {
        const servants = compactLichServants(player);
        if (servants.length < RULES.lichMaximum) {
            const fragments = addAuraStack(player, player, SOUL_FRAGMENT, 6);
            if (fragments >= 6) {
                const followAngle = servants.length * Math.PI * 2 / RULES.lichMaximum;
                const servant = spawnEchoMinion(
                    player,
                    LICH_SERVANT_ENTRY,
                    RULES.lichDurationMs,
                    followAngle,
                );
                if (servant) {
                    player.RemoveAura(SOUL_FRAGMENT);
                    servants.push(Number(servant.GetGUIDLow()));
                    collectionRuntime(player).lichServantGUIDs = servants;
                    syncLichServantController(player, servants.length, true);
                }
            }
        }
    }

    if (isCollectionActive(player, 6) && !player.HasAura(MUTAGENIC_ICD)) {
        const runtime = collectionRuntime(player);
        runtime.poisonMap = Number(player.GetMapID());
        runtime.poisonX = Number(killed.GetX());
        runtime.poisonY = Number(killed.GetY());
        runtime.poisonZ = Number(killed.GetZ());
        refreshedAura(player, player, MUTAGENIC_CLOUD);
        refreshedAura(player, player, MUTAGENIC_ICD);
    }
}

function collectionPlayerForKiller(killer: TSUnit | undefined): TSPlayer | undefined {
    if (!killer) return undefined;
    const player = killer.ToPlayer();
    if (player) return player;
    const controller = killer.GetController();
    return controller ? controller.ToPlayer() : undefined;
}

function isEchoBookBoss(creature: TSCreature): boolean {
    const template = creature.GetTemplate();
    return creature.IsWorldBoss()
        || Number(template.GetRank()) == 3
        || (Number(template.GetFlagsExtra()) & 0x10000000) != 0;
}

function handleCommand(player: TSPlayer, raw: string): boolean {
    const parts = raw.toLowerCase().split(" ");
    if (parts[0] == "echoes") {
        if (parts.length == 1 || parts[1] == "list") {
            showCollectionList(player);
            return true;
        }
        if ((parts[1] == "activate" || parts[1] == "deactivate") && parts.length >= 3) {
            const index = Number(parts[2]) - 1;
            setCollectionActive(player, index, parts[1] == "activate" ? 1 : 0);
            return true;
        }
        player.SendBroadcastMessage(playerText(
            player,
            `Commands: echoes | echoes list | echoes activate <1..${COLLECTION_ECHOES.length}> | echoes deactivate <1..${COLLECTION_ECHOES.length}>.`,
            `Команды: echoes | echoes list | echoes activate <1..${COLLECTION_ECHOES.length}> | echoes deactivate <1..${COLLECTION_ECHOES.length}>.`,
        ));
        return true;
    }
    if (parts[0] != "echo") return false;
    if (parts.length == 1 || parts[1] == "list") {
        showEchoList(player);
        return true;
    }
    if (parts[1] == "choose" && parts.length >= 3) {
        const slot = Number(parts[2]);
        const ranks = ranksOf(EchoRankRow.get(player));
        const offer = currentOffer(player, ranks);
        const indices = offerIndices(offer);
        if (slot < 1 || slot > indices.length || slot != Math.floor(slot)) {
            return reject(player, playerText(
                player,
                "Usage: echo choose <1..3>.",
                "Используйте: echo choose <1..3>.",
            ), ECHO_ERROR_CONTEXT_CARD);
        }
        chooseEcho(player, Number(offer.offerToken), indices[slot - 1]);
        return true;
    }
    player.SendBroadcastMessage(playerText(
        player,
        "Card commands: echo | echo list | echo choose <1..3>. Book collection: echoes.",
        "Команды карточек: echo | echo list | echo choose <1..3>. Коллекция книг: echoes.",
    ));
    return true;
}

export function RegisterEchoes(events: TSEvents): void {
    for (let i = 0; i < COLLECTION_BOOK_USE_SPELL_IDS.length; i++) {
        events.Spell.OnCheckCast(COLLECTION_BOOK_USE_SPELL_IDS[i], (spell, result) => {
            const player = spell.GetCaster().ToPlayer();
            const echoIndex = collectionBookIndex(Number(spell.GetEntry()));
            if (!player || !canLearnCollectionBook(player, echoIndex)) {
                result.set(SpellCastResult.FAILED_DONT_REPORT);
            }
        });
        events.Spell.OnEffect(COLLECTION_BOOK_USE_SPELL_IDS[i], (spell, cancel, info, mode) => {
            if (mode != SpellEffectHandleMode.HIT_TARGET) return;
            cancel.set(true);
            const player = spell.GetCaster().ToPlayer();
            const echoIndex = collectionBookIndex(Number(spell.GetEntry()));
            if (player && echoIndex >= 0) learnCollectionBook(player, echoIndex);
        });
    }

    events.Spell.OnCheckCast(ECHO_CHOICE_USE_SPELL, (spell, result) => {
        const player = spell.GetCaster().ToPlayer();
        if (!player || !canActivateChoice(player)) result.set(SpellCastResult.FAILED_DONT_REPORT);
    });

    events.Spell.OnEffect(ECHO_CHOICE_USE_SPELL, (spell, cancel, info, mode) => {
        if (mode != SpellEffectHandleMode.HIT_TARGET) return;
        cancel.set(true);
        const player = spell.GetCaster().ToPlayer();
        if (player) activateChoice(player);
    });

    events.Spell.OnCheckCast(ECHO_RESET_USE_SPELL, (spell, result) => {
        const player = spell.GetCaster().ToPlayer();
        if (!player || !canResetEchoes(player)) result.set(SpellCastResult.FAILED_DONT_REPORT);
    });

    events.Spell.OnEffect(ECHO_RESET_USE_SPELL, (spell, cancel, info, mode) => {
        if (mode != SpellEffectHandleMode.HIT_TARGET) return;
        cancel.set(true);
        const player = spell.GetCaster().ToPlayer();
        if (player) resetEchoes(player);
    });

    events.Creature.OnGossipHello(ECHO_VENDOR, (creature, player, cancel) => {
        cancel.set(true);
        showEchoVendorMenu(creature, player);
    });

    events.Creature.OnGossipSelect(ECHO_VENDOR, (creature, player, menuId, selection, cancel) => {
        cancel.set(true);
        if (selection == RULES.vendorTrade) {
            player.GossipComplete();
            player.SendListInventory(creature);
            return;
        }
        if (selection == RULES.vendorExpandSlots && expandCollectionSlots(player)) {
            player.GossipComplete();
            return;
        }
        showEchoVendorMenu(creature, player);
    });

    events.CustomPacket.OnReceive(OP_ECHO_STATE_REQUEST, (opcode, packet, player) => {
        echoClient(player).ready = true;
        const request = new EchoStateRequest();
        request.read(packet);
        sendState(player);
    });

    events.CustomPacket.OnReceive(OP_ECHO_CHOOSE, (opcode, packet, player) => {
        echoClient(player).ready = true;
        const request = new EchoChooseRequest(0, 0);
        request.read(packet);
        chooseEcho(player, Number(request.offerToken), Number(request.echoIndex));
    });

    events.CustomPacket.OnReceive(OP_ECHO_COLLECTION_SET_ACTIVE, (opcode, packet, player) => {
        const client = echoClient(player);
        client.ready = true;
        const request = new EchoCollectionSetActiveRequest(0, 0, 0);
        request.read(packet);
        const requestToken = Number(request.requestToken);
        client.collectionAckToken = requestToken > 0
            && requestToken == Math.floor(requestToken)
            && requestToken <= 0x7ffffffe
            ? requestToken
            : 0;
        if (client.collectionAckToken == 0) {
            reject(
                player,
                playerText(
                    player,
                    "Invalid collection request number.",
                    "Некорректный номер запроса коллекции.",
                ),
                ECHO_ERROR_CONTEXT_COLLECTION,
            );
            return;
        }
        setCollectionActive(player, Number(request.echoIndex), Number(request.active));
    });

    events.Creature.OnGenerateLoot((creature, killer) => {
        if (!isEchoBookBoss(creature)
            || COLLECTION_BOOK_ITEM_IDS.length == 0
            || Math.random() >= RULES.bookDropChance) return;
        const index = Math.floor(Math.random() * COLLECTION_BOOK_ITEM_IDS.length);
        const loot = creature.GetLoot();
        if (loot.GetLootOwnerGUID().IsEmpty()) {
            const recipient = creature.GetLootRecipient();
            if (recipient !== undefined) loot.SetLootOwner(recipient.GetGUID());
            else if (killer !== undefined) loot.SetLootOwner(killer.GetGUID());
        }
        loot.AddItem(COLLECTION_BOOK_ITEM_IDS[index], 1, 1, 0, false, 0);
    });

    events.Spell.OnDamageLate((spell, damage, info, type, isCrit, effectMask) => {
        const attackerUnit = info.GetAttacker();
        const attacker = attackerUnit.ToPlayer();
        const portalOwner = netherPortalOwner(attackerUnit);
        const damageOwner = attacker || portalOwner;
        const target = info.GetTarget();
        const schoolMask = Number(info.GetSchoolMask());
        const spellId = Number(info.GetSpellID());
        if (damageOwner) {
            const multiplier = outgoingDamageMultiplier(damageOwner, target, schoolMask);
            if (multiplier != 1) damage.set(Math.floor(Number(damage.get()) * multiplier));
        }
        const victim = target.ToPlayer();
        if (victim) maybeTriggerFrostguard(victim, Number(damage.get()));
        if (!attacker
            || Number(damage.get()) <= 0
            || isCollectionDamageHelper(spellId)) return;
        processOutgoingDirectDamage(attacker, target, schoolMask);
    });

    events.Spell.OnPeriodicDamage((effect, damage) => {
        const auraType = effect.GetAuraType();
        if (auraType != AuraType.PERIODIC_DAMAGE
            && auraType != AuraType.PERIODIC_DAMAGE_PERCENT) return;
        const auraId = Number(effect.GetAura().GetAuraID());
        const helperDamage = isCollectionDamageHelper(auraId);
        const casterUnit = effect.GetCaster();
        const ownerObject = effect.GetAura().GetOwner();
        const caster = casterUnit ? casterUnit.ToPlayer() : undefined;
        const target = ownerObject ? ownerObject.ToUnit() : undefined;
        if (!target) return;
        if (auraId == SEARING_CINDERS && caster && !isCollectionActive(caster, 1)) {
            damage.set(0);
            effect.GetAura().Remove();
            return;
        }
        if (caster) {
            const schoolMask = Number(effect.GetSpellInfo().GetSchoolMask());
            const multiplier = outgoingDamageMultiplier(caster, target, schoolMask);
            if (multiplier != 1) damage.set(Math.floor(Number(damage.get()) * multiplier));
            if (!helperDamage
                && Number(damage.get()) > 0
                && isCollectionEnemyTarget(caster, target)) {
                rememberCollectionTarget(caster, target);
                if ((schoolMask & RULES.schoolFrost) != 0) {
                    triggerChill(caster);
                    triggerFrostfire(caster, target, schoolMask, false);
                }
            }
        }
        const victim = target.ToPlayer();
        if (victim) maybeTriggerFrostguard(victim, Number(damage.get()));
    });

    events.Unit.OnMeleeDamageLate((info, damage, type, index) => {
        const attacker = info.GetAttacker().ToPlayer();
        const target = info.GetTarget();
        const component = Number(index);
        const schoolMask = component == 0 ? Number(info.GetSchool1()) : Number(info.GetSchool2());
        if (attacker) {
            const multiplier = outgoingDamageMultiplier(attacker, target, schoolMask);
            if (multiplier != 1) damage.set(Math.floor(Number(damage.get()) * multiplier));
        }
        const victim = target.ToPlayer();
        if (victim && component == 1) {
            maybeTriggerFrostguard(
                victim,
                Number(info.GetDamage1()) + Number(info.GetDamage2()),
            );
        }
        if (!attacker || component != 1) return;
        const total = Number(info.GetDamage1()) + Number(info.GetDamage2());
        if (total > 0) {
            processOutgoingDirectDamage(
                attacker,
                target,
                Number(info.GetSchool1()) | Number(info.GetSchool2()),
            );
        }
    });

    events.Spell.OnAfterCast((spell, cancel) => handleEchoSpellCast(spell));
    events.Spell.OnTick(BLADE_ZONE, onBladeTempestTick);
    events.Spell.OnTick(LICH_SERVANTS, onLichServantsTick);
    events.Spell.OnTick(MUTAGENIC_CLOUD, onMutagenicCloudTick);
    events.Spell.OnTick(NETHER_PORTAL, onNetherPortalTick);
    events.Spell.OnRemove(NETHER_PORTAL, onNetherPortalRemoved);
    events.Spell.OnTick(NETHER_FLAMES, onNetherFlamesTick);
    events.Spell.OnTick(COLLECTION_SPELL_IDS[9], onSanctumSentriesTick);
    events.Unit.OnDeath((victim, killer) => {
        const killed = victim.ToCreature();
        const player = collectionPlayerForKiller(killer);
        if (killed && player) onCollectionCreatureKill(player, killed);
    });

    events.Player.OnCommand((player, command, found) => {
        if (handleCommand(player, command.get())) found.set(true);
    });

    events.Player.OnLogin((player, firstLogin) => {
        echoClient(player).ready = false;
        resetCollectionMapRuntime(player);
        reconcilePlayer(player);
    });

    events.Player.OnReload((player, firstLogin) => {
        echoClient(player).ready = false;
        resetCollectionMapRuntime(player);
        reconcilePlayer(player);
    });

    events.Player.OnLogout(player => clearEchoMinionsOnMap(player.GetMap(), player));
    events.Map.OnPlayerLeave((map, player) => clearEchoMinionsOnMap(map, player));

    events.Player.OnLevelChanged((player, oldLevel) => refreshLevelScaling(player));

    events.Player.OnMapChanged(player => {
        resetCollectionMapRuntime(player);
        reconcilePlayer(player);
        sendState(player);
    });

    events.Player.OnSave(player => {
        EchoRankRow.get(player).Save();
        EchoOfferState.get(player).Save();
        EchoCollectionRow.get(player).Save();
        EchoCollectionProfile.get(player).Save();
    });
}
