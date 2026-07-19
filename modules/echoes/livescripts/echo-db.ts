/** Persistent per-character card ranks/offers and the independent Echo collection. */

const RANKS_KEY = "EchoRanks";
const RANKS_FALLBACK = {} as DBContainer<EchoRankRow>;
const OFFER_KEY = "EchoOffer";
const OFFER_FALLBACK = {} as EchoOfferState;
const COLLECTION_KEY = "EchoCollection";
const COLLECTION_FALLBACK = {} as DBContainer<EchoCollectionRow>;
const COLLECTION_PROFILE_KEY = "EchoCollectionProfile";
const COLLECTION_PROFILE_FALLBACK = {} as EchoCollectionProfile;

@CharactersTable
export class EchoRankRow extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    echoIndex: uint32 = 0;
    @DBField
    rank: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<EchoRankRow> {
        const cached = player.GetObject(RANKS_KEY, RANKS_FALLBACK);
        if (cached != RANKS_FALLBACK) return cached;
        const loaded = LoadDBArrayEntry(EchoRankRow, player.GetGUIDLow());
        player.SetObject(RANKS_KEY, loaded);
        return loaded;
    }
}

/**
 * `offer1..3` store catalog index + 1 so zero remains the empty value.
 * Item-created offers mark `offerForPick` with bit 30; unmarked legacy
 * level-based offers are discarded by the current runtime.
 * `offerToken` is retained after a pick and incremented for the next offer.
 */
@CharactersTable
export class EchoOfferState extends DBEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    offerToken: uint32 = 0;
    @DBField
    offerForPick: uint32 = 0;
    @DBField
    offer1: uint32 = 0;
    @DBField
    offer2: uint32 = 0;
    @DBField
    offer3: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): EchoOfferState {
        const cached = player.GetObject(OFFER_KEY, OFFER_FALLBACK);
        if (cached != OFFER_FALLBACK) return cached;
        const loaded = LoadDBEntry(new EchoOfferState(player.GetGUIDLow()));
        player.SetObject(OFFER_KEY, loaded);
        return loaded;
    }
}

/** One row means that the character permanently owns this collection Echo. */
@CharactersTable
export class EchoCollectionRow extends DBArrayEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    echoIndex: uint32 = 0;
    /** Zero is inactive; positive values preserve a stable active-slot order. */
    @DBField
    activeSlot: uint32 = 0;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): DBContainer<EchoCollectionRow> {
        const cached = player.GetObject(COLLECTION_KEY, COLLECTION_FALLBACK);
        if (cached != COLLECTION_FALLBACK) return cached;
        const loaded = LoadDBArrayEntry(EchoCollectionRow, player.GetGUIDLow());
        player.SetObject(COLLECTION_KEY, loaded);
        return loaded;
    }
}

/** The acquisition method may change; the persisted limit is already future-proof. */
@CharactersTable
export class EchoCollectionProfile extends DBEntry {
    @DBPrimaryKey
    playerGUID: uint64 = 0;
    @DBField
    slotLimit: uint32 = 2;

    constructor(playerGUID: uint64) {
        super();
        this.playerGUID = playerGUID;
    }

    static get(player: TSPlayer): EchoCollectionProfile {
        const cached = player.GetObject(COLLECTION_PROFILE_KEY, COLLECTION_PROFILE_FALLBACK);
        if (cached != COLLECTION_PROFILE_FALLBACK) return cached;
        const loaded = LoadDBEntry(new EchoCollectionProfile(player.GetGUIDLow()));
        player.SetObject(COLLECTION_PROFILE_KEY, loaded);
        return loaded;
    }
}
