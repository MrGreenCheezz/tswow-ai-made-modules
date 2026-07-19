/** Persistent per-character companion collection. */

const COLLECTION_KEY = "custom-companions:collection";
const COLLECTION_FALLBACK = {} as DBContainer<CapturedCompanion>;
const TRAINING_KEY = "custom-companions:training";
const TRAINING_FALLBACK = {} as DBContainer<CompanionTrainingEntry>;
const SCHEMA_REVISION_KEY = "custom-companions:schema-revision";

@CharactersTable
export class CapturedCompanion extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;

    /** Stable player-local ID used by addon requests. */
    @DBField
    companionId: uint32 = 0;

    /** creature_template.entry. */
    @DBField
    entry: uint32 = 0;

    /** Saved as a fraction in the range 0..1. */
    @DBField
    healthPct: float = 0;

    /** Exactly one row per player may be active. */
    @DBField
    active: uint32 = 0;

    /** 0 = защита, 1 = не атаковать, 2 = танк. */
    @DBField
    combatMode: uint32 = 0;

    /** Абсолютное время возвращения из экспедиции; GetUnixTime() в миллисекундах. */
    @DBField
    expeditionEndAtMs: uint64 = 0;

    /** Уровень владельца фиксируется при отправке и определяет тир награды. */
    @DBField
    expeditionLevel: uint32 = 0;

    /** Остаток награды: сохраняется при частично заполненных сумках. */
    @DBField
    expeditionRewardCount: uint32 = 0;

    /** Конкретный предмет фиксируется при старте, чтобы таблицы наград можно было менять безопасно. */
    @DBField
    expeditionRewardEntry: uint32 = 0;

    /** Saved identity; never re-derived after migration unless the catalog entry is invalid. */
    @DBField
    professionId: uint32 = 0;

    @DBField
    innateTraitId: uint32 = 0;

    /** Persistent service progression shared by expeditions and the workforce bridge. */
    @DBField
    serviceXp: uint32 = 0;

    /** Last base-building XP batch durably applied before its transient acknowledgement. */
    @DBField
    lastWorkXpRevision: uint32 = 0;

    /** Two free slots, then the public manual-study curve up to fifteen. */
    @DBField
    trainingCapacity: uint32 = 0;

    @DBField
    trainingProgress: uint32 = 0;

    /** Incremented after every identity/training mutation for stale UI requests. */
    @DBField
    trainingRevision: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<CapturedCompanion> {
        const cached = player.GetObject(COLLECTION_KEY, COLLECTION_FALLBACK);
        if (cached != COLLECTION_FALLBACK) return cached;

        const loaded = LoadDBArrayEntry(CapturedCompanion, player.GetGUIDLow());
        player.SetObject(COLLECTION_KEY, loaded);
        return loaded;
    }
}

/** One learned manual/tool per (player, companionId, featureId). */
@CharactersTable
export class CompanionTrainingEntry extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;

    @DBField
    companionId: uint32 = 0;

    @DBField
    featureId: uint32 = 0;

    @DBField
    rank: uint32 = 0;

    /** Exact duplicate progress for rank II -> III. */
    @DBField
    rankProgress: uint32 = 0;

    /** 0 = learned but not installed, otherwise a generic slot 1..15. */
    @DBField
    installedSlot: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<CompanionTrainingEntry> {
        const cached = player.GetObject(TRAINING_KEY, TRAINING_FALLBACK);
        if (cached != TRAINING_FALLBACK) return cached;
        const loaded = LoadDBArrayEntry(CompanionTrainingEntry, player.GetGUIDLow());
        player.SetObject(TRAINING_KEY, loaded);
        return loaded;
    }
}

/** Per-character one-time schema/content migrations for companion persistence. */
@CharactersTable
export class CompanionSchemaRevision extends DBEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;

    @DBField
    revision: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): CompanionSchemaRevision {
        return player.GetObject(
            SCHEMA_REVISION_KEY,
            LoadDBEntry(new CompanionSchemaRevision(player.GetGUIDLow())),
        );
    }
}
