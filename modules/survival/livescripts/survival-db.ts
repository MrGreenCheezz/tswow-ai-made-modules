/**
 * Per-character hunger/thirst persistence (0..100 each, start full).
 */

@CharactersTable
export class SurvivalData extends DBEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    hunger: float = 100;
    @DBField
    thirst: float = 100;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): SurvivalData {
        return player.GetObject('Survival', LoadDBEntry(new SurvivalData(player.GetGUIDLow())));
    }
}
