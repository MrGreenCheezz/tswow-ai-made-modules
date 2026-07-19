export function isRussian(player: TSPlayer): boolean {
    return Number(player.GetDbcLocale ? player.GetDbcLocale() : 8) == 8;
}

export function playerText(player: TSPlayer, english: string, russian: string): string {
    return isRussian(player) ? russian : english;
}

const RU_CREATURE_NAME_QUERY = PrepareWorldQuery(
    "SELECT `Name` FROM `creature_template_locale` WHERE `entry` = ? AND `locale` = 'ruRU'",
);
const ruCreatureNames: { [entry: number]: string } = {};

export function localizedCreatureName(player: TSPlayer, creature: TSCreature): string {
    const fallback = creature.GetName();
    // DB locale is the original client locale; DBC locale may be a fallback.
    if (Number(player.GetDbLocaleIndex()) != 8) return fallback;
    const entry = Number(creature.GetEntry());
    let name = ruCreatureNames[entry];
    if (name === undefined) {
        const result = RU_CREATURE_NAME_QUERY.Create().SetUInt32(0, entry as uint32).Send();
        name = result.GetRow() ? result.GetString(0) : "";
        ruCreatureNames[entry] = name;
    }
    return name || fallback;
}
