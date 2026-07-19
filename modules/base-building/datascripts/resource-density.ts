import { SQL } from "wow/wotlk";

const OPEN_WORLD_MAPS = [0, 1, 530, 571];
const VANILLA_RESOURCE_NODES = [
    // Mining
    324, 1731, 1732, 1733, 1734, 1735, 2040, 2047, 175404,
    181555, 181556, 181557, 181569, 189978, 189979, 189980, 189981, 191133,
    // Herbalism
    1617, 1618, 1619, 1620, 1621, 1622, 1623, 1624, 1628,
    2041, 2042, 2043, 2044, 2045, 2046, 2866,
    3724, 3725, 3726, 3727, 3729, 3730,
    142140, 142141, 142142, 142143, 142144, 142145,
    176583, 176584, 176586, 176587, 176588, 176589,
    181166, 181270, 181271, 181275, 181276, 181277, 181278, 181279, 181280, 181281,
    183043, 183044, 183045,
    189973, 190169, 190170, 190171, 190172, 190173, 190175, 190176, 191019, 191303,
];

export function increasedPoolLimit(current: number, poolId: number, memberCount: number): number {
    if (current <= 1) return current;
    // ponytail: odd limits alternate rounding by stable pool id; use per-zone values only if balance testing needs them.
    return Math.min(memberCount, current + Math.floor((current + poolId % 2) / 2));
}

export function increaseVanillaResourceDensity(): void {
    const members = SQL.pool_members.queryAll({});
    const memberCounts: { [poolId: number]: number } = {};
    const parentByChild: { [poolId: number]: number } = {};
    const resourcePools: { [poolId: number]: boolean } = {};

    members.forEach(member => {
        const poolId = member.poolSpawnId.get();
        memberCounts[poolId] = (memberCounts[poolId] || 0) + 1;

        if (member.type.get() == 2) {
            parentByChild[member.spawnId.get()] = poolId;
            return;
        }
        if (member.type.get() != 1) return;

        const spawn = SQL.gameobject.query({ guid: member.spawnId.get() });
        if (!spawn) return;
        if (OPEN_WORLD_MAPS.indexOf(spawn.map.get()) < 0) return;
        if (VANILLA_RESOURCE_NODES.indexOf(spawn.id.get()) < 0) return;
        resourcePools[poolId] = true;
    });

    const roots: { [poolId: number]: boolean } = {};
    Object.keys(resourcePools).forEach(value => {
        let poolId = Number(value);
        while (parentByChild[poolId] !== undefined) poolId = parentByChild[poolId];
        roots[poolId] = true;
    });

    Object.keys(roots).forEach(value => {
        const poolId = Number(value);
        const pool = SQL.pool_template.query({ entry: poolId });
        if (!pool) return;
        pool.max_limit.set(increasedPoolLimit(
            pool.max_limit.get(),
            poolId,
            memberCounts[poolId] || 0,
        ));
    });
}
