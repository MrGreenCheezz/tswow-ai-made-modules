/**
 * Retail-style talent system — per-character persistence.
 * One row per (tree, node) with the current rank.
 */

@CharactersTable
export class RetailTalentRow extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    treeId: uint32 = 0;
    @DBField
    nodeId: uint32 = 0;
    @DBField
    rank: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<RetailTalentRow> {
        return player.GetObject('RetailTalents', LoadDBArrayEntry(RetailTalentRow, player.GetGUIDLow()));
    }
}

/** One-time schema/content migrations applied per character. */
@CharactersTable
export class RetailTalentRevision extends DBEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    revision: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): RetailTalentRevision {
        return player.GetObject(
            "RetailTalentRevision",
            LoadDBEntry(new RetailTalentRevision(player.GetGUIDLow())),
        );
    }
}
