/**
 * Universal talent system — server logic.
 *
 * Talent tags are informational. Players may learn any talent they can afford;
 * matching abilities are their own build responsibility.
 */

import {
    TREE_CORE, TREE_COMPANION, RESET_ALL,
    TAG_NONE, TAG_FIRE, TAG_HEAL, TAG_MELEE, TAG_SHIELD, TAG_DOT,
    TAG_ARCANE, TAG_FROST, TAG_NATURE, TAG_SHADOW, TAG_HOLY,
    TALENT_MODULE, COMPANION_TALENT_REVISION_KEY,
    classPointsAt, specPointsAt, findNode, getTree, isSpecTree,
    talentDescription, talentName, tagName, treeName,
} from "../datascripts/shared/TalentDefs";
import {
    OP_STATE_REQUEST, OP_LEARN, OP_RESET,
    TalentState, SpentEntry, LearnRequest, ResetRequest, ErrorMsg,
} from "../shared/TalentMessages";
import { RetailTalentRevision, RetailTalentRow } from "./talent-db";
import { GEN_TALENTS } from "./generated_talents";

const SCHOOL_FIRE = 4;
const SCHOOL_NATURE = 8;
const SCHOOL_FROST = 16;
const SCHOOL_SHADOW = 32;
const SCHOOL_ARCANE = 64;
const SCHOOL_HOLY = 2;
const DAMAGE_CLASS_MELEE = 2;
const NON_COMPANION_TALENT_REVISION = 2;

function isRussian(player: TSPlayer): boolean {
    return Number(player.GetDbcLocale ? player.GetDbcLocale() : 8) == 8;
}

function playerText(player: TSPlayer, english: string, russian: string): string {
    return isRussian(player) ? russian : english;
}

/** Points spent in one specific tree. */
function spentInTree(container: DBContainer<RetailTalentRow>, treeId: number): number {
    return container.reduce((sum, row) => row.treeId == treeId ? sum + row.rank : sum, 0);
}

/** Points spent from the pool that feeds `treeId` (core pool or shared spec pool). */
function spentFromPool(container: DBContainer<RetailTalentRow>, treeId: number): number {
    if (treeId == TREE_CORE) {
        return spentInTree(container, TREE_CORE);
    }
    return container.reduce((sum, row) => isSpecTree(row.treeId) ? sum + row.rank : sum, 0);
}

function poolTotal(player: TSPlayer, treeId: number): number {
    return treeId == TREE_CORE
        ? classPointsAt(player.GetLevel())
        : specPointsAt(player.GetLevel());
}

function rowOf(container: DBContainer<RetailTalentRow>, treeId: number, nodeId: number): RetailTalentRow | undefined {
    return container.find(row => row.treeId == treeId && row.nodeId == nodeId);
}

function spellIdOf(rank: number | string): number {
    if (typeof rank == "number") return rank;
    const generated = GEN_TALENTS[rank];
    return generated !== undefined ? generated : 0;
}

function isNonCompanionTalentKey(key: string): boolean {
    return key.indexOf("core-") == 0
        || key.indexOf("magic-") == 0
        || key.indexOf("weapon-") == 0
        || key.indexOf("vital-") == 0;
}

/** Refund changed player trees once while leaving the companion tree intact. */
function applyNonCompanionTalentRevision(
    player: TSPlayer,
    container: DBContainer<RetailTalentRow>,
): void {
    const revision = RetailTalentRevision.get(player);
    if (revision.revision >= NON_COMPANION_TALENT_REVISION) return;

    let refunded = false;
    for (const key in GEN_TALENTS) {
        if (!isNonCompanionTalentKey(key)) continue;
        const spellId = GEN_TALENTS[key];
        if (spellId > 0 && player.HasSpell(spellId)) {
            player.RemoveSpell(spellId, false, false);
            refunded = true;
        }
    }
    container.forEach(row => {
        if (row.treeId == TREE_COMPANION) return;
        row.Delete();
        refunded = true;
    });
    container.Save();
    revision.revision = NON_COMPANION_TALENT_REVISION;
    revision.Save();

    if (refunded) {
        player.SendBroadcastMessage(playerText(
            player,
            "|cff33ff99Character talents were updated and reset. Points were refunded; companion talents were preserved.|r",
            "|cff33ff99Таланты персонажа обновлены и сброшены. Очки возвращены; таланты спутников сохранены.|r",
        ));
    }
}

function buildState(player: TSPlayer): TalentState {
    const container = RetailTalentRow.get(player);
    const state = new TalentState();
    state.classTotal = classPointsAt(player.GetLevel());
    state.specTotal = specPointsAt(player.GetLevel());
    container.forEach(row => {
        if (row.rank <= 0) return;
        state.spent.push(new SpentEntry(row.treeId, row.nodeId, row.rank));
    });
    return state;
}

class TalentClient {
    ready: boolean = false;
}

function talentClient(player: TSPlayer): TalentClient {
    return player.GetObject("talentClient", new TalentClient());
}

function bumpCompanionTalentRevision(player: TSPlayer): void {
    const current = Number(player.GetUInt(COMPANION_TALENT_REVISION_KEY, 0));
    player.SetUInt(
        COMPANION_TALENT_REVISION_KEY,
        current >= 0x7FFFFFFF ? 1 : current + 1,
    );
}

function sendState(player: TSPlayer): void {
    if (!talentClient(player).ready) return;
    buildState(player).write().SendToPlayer(player);
}

function reject(player: TSPlayer, message: string): void {
    if (!talentClient(player).ready) {
        player.SendBroadcastMessage("|cffff6060" + message + "|r");
        return;
    }
    new ErrorMsg(message).write().SendToPlayer(player);
    sendState(player);
}

function effectHasTag(effect: TSSpellEffectInfo, tag: number): boolean {
    const type = effect.GetType();
    const aura = effect.GetAura();
    if (tag == TAG_HEAL) {
        return type == SpellEffects.HEAL
            || type == SpellEffects.HEAL_MAX_HEALTH
            || type == SpellEffects.HEAL_PCT
            || aura == AuraType.PERIODIC_HEAL;
    }
    if (tag == TAG_MELEE) {
        return type == SpellEffects.ATTACK
            || type == SpellEffects.WEAPON
            || type == SpellEffects.WEAPON_DAMAGE
            || type == SpellEffects.WEAPON_DAMAGE_NOSCHOOL
            || type == SpellEffects.WEAPON_PERCENT_DAMAGE
            || type == SpellEffects.NORMALIZED_WEAPON_DMG;
    }
    if (tag == TAG_SHIELD) {
        return aura == AuraType.SCHOOL_ABSORB;
    }
    if (tag == TAG_DOT) {
        return aura == AuraType.PERIODIC_DAMAGE
            || aura == AuraType.PERIODIC_DAMAGE_PERCENT;
    }
    return false;
}

function spellHasTag(info: TSSpellInfo, tag: number): boolean {
    if (tag == TAG_NONE) return true;
    if (info.IsNull()) return false;
    // Learned talent ranks should not unlock more talents by themselves.
    if (info.GetTalentCost() > 0) return false;
    if (tag == TAG_FIRE && (info.GetSchoolMask() & SCHOOL_FIRE) != 0) return true;
    if (tag == TAG_NATURE && (info.GetSchoolMask() & SCHOOL_NATURE) != 0) return true;
    if (tag == TAG_FROST && (info.GetSchoolMask() & SCHOOL_FROST) != 0) return true;
    if (tag == TAG_SHADOW && (info.GetSchoolMask() & SCHOOL_SHADOW) != 0) return true;
    if (tag == TAG_ARCANE && (info.GetSchoolMask() & SCHOOL_ARCANE) != 0) return true;
    if (tag == TAG_HOLY && (info.GetSchoolMask() & SCHOOL_HOLY) != 0) return true;
    if (tag == TAG_MELEE && info.GetDmgClass() == DAMAGE_CLASS_MELEE) return true;

    for (let i = 0; i < 3; i++) {
        if (effectHasTag(info.GetEffect(i as any), tag)) return true;
    }
    return false;
}

function playerHasTag(player: TSPlayer, tag: number): boolean {
    if (tag == TAG_NONE) return true;
    const spellMap = player.GetSpellMap();
    for (const key in spellMap) {
        const spellId = Number(key);
        if (spellId <= 0) continue;
        const info = GetSpellInfo(spellId);
        if (info !== undefined && spellHasTag(info, tag)) return true;
    }
    return false;
}

function learnTalent(player: TSPlayer, treeId: number, nodeId: number): void {
    const tree = getTree(treeId);
    if (!tree) return reject(player, playerText(
        player,
        "Unknown talent tree.",
        "Неизвестная ветка талантов.",
    ));
    const node = findNode(tree, nodeId);
    if (!node) return reject(player, playerText(player, "Unknown talent.", "Неизвестный талант."));
    const localizedNodeName = talentName(tree.treeId, node, isRussian(player));

    const container = RetailTalentRow.get(player);
    const row = rowOf(container, treeId, nodeId);
    const curRank = row ? row.rank : 0;

    if (curRank >= node.ranks.length) {
        return reject(player, playerText(
            player,
            localizedNodeName + " is already at maximum rank.",
            localizedNodeName + " уже изучен до максимума.",
        ));
    }
    if (spentFromPool(container, treeId) >= poolTotal(player, treeId)) {
        return reject(player, playerText(
            player,
            "You have no unspent talent points.",
            "Нет свободных очков талантов.",
        ));
    }
    if (spentInTree(container, treeId) < node.gate) {
        const localizedTreeName = treeName(tree, isRussian(player));
        return reject(player, playerText(
            player,
            "You must spend " + node.gate + " points in " + localizedTreeName + ".",
            "Нужно вложить " + node.gate + " очк. в " + localizedTreeName + ".",
        ));
    }
    for (let i = 0; i < node.requires.length; i++) {
        const reqRow = rowOf(container, treeId, node.requires[i]);
        if (!reqRow || reqRow.rank <= 0) {
            const reqNode = findNode(tree, node.requires[i]);
            const requiredName = reqNode
                ? talentName(tree.treeId, reqNode, isRussian(player))
                : playerText(player, "from the previous node", "из предыдущего узла");
            return reject(player, playerText(
                player,
                "You first need the talent " + requiredName + ".",
                "Сначала нужен талант " + requiredName + ".",
            ));
        }
    }

    const newSpell = spellIdOf(node.ranks[curRank]);
    if (newSpell == 0) {
        return reject(player, playerText(
            player,
            "This talent's spell has not been built into the data yet.",
            "Заклинание этого таланта еще не собрано в данных.",
        ));
    }
    if (curRank > 0) {
        const oldSpell = spellIdOf(node.ranks[curRank - 1]);
        if (oldSpell != 0) player.RemoveSpell(oldSpell, false, false);
    }
    if (newSpell != 0) player.LearnSpell(newSpell);

    if (row) {
        row.rank = curRank + 1;
        row.MarkDirty();
    } else {
        const newRow = container.Add(new RetailTalentRow(player.GetGUIDLow()));
        newRow.treeId = treeId;
        newRow.nodeId = nodeId;
        newRow.rank = 1;
        newRow.MarkDirty();
    }
    container.Save();
    if (treeId == TREE_COMPANION) bumpCompanionTalentRevision(player);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff33ff99Learned: " + localizedNodeName + ", rank " + (curRank + 1) + ".|r",
        "|cff33ff99Изучено: " + localizedNodeName + ", ранг " + (curRank + 1) + ".|r",
    ));
    sendState(player);
}

function resetTalents(player: TSPlayer, treeId: number): void {
    const container = RetailTalentRow.get(player);
    container.forEach(row => {
        if (treeId != RESET_ALL && row.treeId != treeId) return;
        const tree = getTree(row.treeId);
        const node = tree ? findNode(tree, row.nodeId) : undefined;
        if (node && row.rank > 0 && row.rank <= node.ranks.length) {
            const spellId = spellIdOf(node.ranks[row.rank - 1]);
            if (spellId != 0) player.RemoveSpell(spellId, false, false);
        }
        row.Delete();
    });
    container.Save();
    if (treeId == TREE_COMPANION || treeId == RESET_ALL) {
        bumpCompanionTalentRevision(player);
    }
    sendState(player);
}

function listTalents(player: TSPlayer): void {
    const russian = isRussian(player);
    player.SendBroadcastMessage(playerText(
        player,
        "|cff33ff99Universal Talents: utalent learn <tree> <talent>|r",
        "|cff33ff99Универсальные таланты: utalent learn <ветка> <талант>|r",
    ));
    for (let treeId = 0; treeId <= TREE_COMPANION; treeId++) {
        const tree = getTree(treeId);
        if (!tree) continue;
        player.SendBroadcastMessage(tree.treeId + ": " + treeName(tree, russian));
        for (let i = 0; i < tree.nodes.length; i++) {
            const n = tree.nodes[i];
            const tag = n.requiredTag ? " [" + tagName(n.requiredTag, russian) + "]" : "";
            player.SendBroadcastMessage(
                "  " + n.id + ": " + talentName(tree.treeId, n, russian) + tag
                    + " - " + talentDescription(tree.treeId, n, russian),
            );
        }
    }
}

function listTags(player: TSPlayer): void {
    const russian = isRussian(player);
    player.SendBroadcastMessage(
        playerText(player, "Styles: ", "Стили: ")
        + tagName(TAG_FIRE, russian) + "=" + playerHasTag(player, TAG_FIRE)
        + " " + tagName(TAG_HEAL, russian) + "=" + playerHasTag(player, TAG_HEAL)
        + " " + tagName(TAG_MELEE, russian) + "=" + playerHasTag(player, TAG_MELEE)
        + " " + tagName(TAG_SHIELD, russian) + "=" + playerHasTag(player, TAG_SHIELD)
        + " " + tagName(TAG_DOT, russian) + "=" + playerHasTag(player, TAG_DOT)
        + " " + tagName(TAG_ARCANE, russian) + "=" + playerHasTag(player, TAG_ARCANE)
        + " " + tagName(TAG_FROST, russian) + "=" + playerHasTag(player, TAG_FROST)
        + " " + tagName(TAG_NATURE, russian) + "=" + playerHasTag(player, TAG_NATURE)
        + " " + tagName(TAG_SHADOW, russian) + "=" + playerHasTag(player, TAG_SHADOW)
        + " " + tagName(TAG_HOLY, russian) + "=" + playerHasTag(player, TAG_HOLY)
    );
}

function handleCommand(player: TSPlayer, raw: string): boolean {
    const cmd = raw.toLowerCase().split(" ");
    if (cmd[0] != "utalent" && cmd[0] != "utalents") return false;
    if (cmd.length == 1 || cmd[1] == "list") {
        listTalents(player);
        return true;
    }
    if (cmd[1] == "tags") {
        listTags(player);
        return true;
    }
    if (cmd[1] == "learn" && cmd.length >= 4) {
        learnTalent(player, Number(cmd[2]), Number(cmd[3]));
        return true;
    }
    if (cmd[1] == "reset") {
        resetTalents(player, cmd[2] == "all" || cmd.length < 3 ? RESET_ALL : Number(cmd[2]));
        return true;
    }
    player.SendBroadcastMessage(playerText(
        player,
        "Commands: utalent list | utalent tags | utalent learn <tree> <talent> | utalent reset [tree|all]",
        "Команды: utalent list | utalent tags | utalent learn <ветка> <талант> | utalent reset [ветка|all]",
    ));
    return true;
}

export function RegisterRetailTalents(events: TSEvents) {
    events.CustomPacket.OnReceive(OP_STATE_REQUEST, (opcode, packet, player) => {
        talentClient(player).ready = true;
        sendState(player);
    });

    events.CustomPacket.OnReceive(OP_LEARN, (opcode, packet, player) => {
        talentClient(player).ready = true;
        const req = new LearnRequest(0, 0);
        req.read(packet);
        learnTalent(player, req.treeId, req.nodeId);
    });

    events.CustomPacket.OnReceive(OP_RESET, (opcode, packet, player) => {
        talentClient(player).ready = true;
        const req = new ResetRequest(0);
        req.read(packet);
        resetTalents(player, req.treeId);
    });

    events.Player.OnCommand((player, command, found) => {
        if (handleCommand(player, command.get())) {
            found.set(true);
        }
    });

    events.Player.OnLogin((player, firstLogin) => {
        const container = RetailTalentRow.get(player);
        applyNonCompanionTalentRevision(player, container);
        let pruned = false;
        container.forEach(row => {
            const tree = getTree(row.treeId);
            const node = tree ? findNode(tree, row.nodeId) : undefined;
            if (!node || row.rank <= 0 || row.rank > node.ranks.length) {
                row.Delete();
                pruned = true;
                return;
            }
            const spellId = spellIdOf(node.ranks[row.rank - 1]);
            if (spellId == 0) {
                row.Delete();
                pruned = true;
                return;
            }
            if (spellId != 0 && !player.HasSpell(spellId)) {
                player.LearnSpell(spellId);
            }
        });
        if (pruned) container.Save();
        bumpCompanionTalentRevision(player);
    });

    events.Player.OnLevelChanged((player, oldLevel) => {
        const level = player.GetLevel();
        const gained =
            (classPointsAt(level) - classPointsAt(oldLevel)) +
            (specPointsAt(level) - specPointsAt(oldLevel));
        if (gained > 0) {
            player.SendBroadcastMessage(playerText(
                player,
                "|cff33ff99You gained a new talent point! Use /utalent.|r",
                "|cff33ff99Получено новое очко талантов! Используйте /utalent.|r",
            ));
            sendState(player);
        }
    });

    events.Player.OnSave(player => {
        RetailTalentRow.get(player).Save();
    });
}
