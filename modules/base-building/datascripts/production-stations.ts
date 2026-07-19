import { std } from "wow/wotlk";

const MODNAME = "base-building";

function clearGameObjectData(go: any): void {
    for (let i = 0; i <= 23; i++) go[`Data${i}`].set(0);
}

/** Приватный кликабельный шаблон: не изменяет stock-объекты мира. */
function makeStation(
    id: string,
    nameEn: string,
    nameRu: string,
    parent: number,
    display: number,
    tag: string,
): any {
    const go = std.GameObjectTemplates.Generic.create(MODNAME, id, parent);
    clearGameObjectData(go);
    go.Type.GOOBER.set();
    clearGameObjectData(go);
    go.Faction.set(0);
    go.Flags.set(0);
    go.Display.set(display);
    go.Name.enGB.set(nameEn);
    go.Name.ruRU.set(nameRu);
    go.Tags.addUnique(MODNAME, tag);
    return go;
}

export const LEATHER_ARMOR_STATION = makeStation(
    "leather-armor-station",
    "Leather Armor Workshop",
    "Кожевенная мастерская",
    2693,
    62423,
    "go/station-leather-armor",
);

export const PLATE_ARMOR_STATION = makeStation(
    "plate-armor-station",
    "Metal Armor Workshop",
    "Латная мастерская",
    2692,
    197,
    "go/station-plate-armor",
);

export const CLOTH_ARMOR_STATION = makeStation(
    "cloth-armor-station",
    "Tailoring Workshop",
    "Портняжная мастерская",
    2694,
    76204,
    "go/station-cloth-armor",
);

export const WEAPON_FORGE_STATION = makeStation(
    "weapon-forge-station",
    "Weapon Forge",
    "Оружейная кузница",
    2692,
    197,
    "go/station-weapon-forge",
);

export const JEWELRY_STATION = makeStation(
    "jewelry-station",
    "Jewelry Workshop",
    "Ювелирная мастерская",
    2697,
    87212,
    "go/station-jewelry",
);
