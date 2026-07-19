/** Per-player cache of custom stat totals and recursion guards. */

export class CustomStats {
    vampirism: number = 0;
    thorns: number = 0;
    mastery: number = 0;
    playerLevel: number = 0;
    internalEffect: boolean = false;
}

export function getStats(player: TSPlayer): CustomStats {
    return player.GetObject("custom-stats:totals", new CustomStats());
}
