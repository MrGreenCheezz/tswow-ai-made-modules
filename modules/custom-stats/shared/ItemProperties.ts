/** Stable per-item property catalog shared by the server and addon. */

export const ITEM_PROPERTY_VAMPIRISM = 1;
export const ITEM_PROPERTY_THORNS = 2;
export const ITEM_PROPERTY_MASTERY = 3;

export const ITEM_PROPERTY_MARK_BLOOD_STEEL = 1001;
export const ITEM_PROPERTY_MARK_FORTIFIED_ARMOR = 1002;
export const ITEM_PROPERTY_MARK_PRECISE_CUT = 1003;
export const ITEM_PROPERTY_MARK_RUNIC = 1004;
export const ITEM_PROPERTY_MARK_GUARDIAN = 1005;
export const ITEM_PROPERTY_MARK_LIVING_ARMOR = 1006;
export const ITEM_PROPERTY_MARK_GRAND_MASTER = 1007;

export const ITEM_PROPERTY_IDS = [
    ITEM_PROPERTY_VAMPIRISM,
    ITEM_PROPERTY_THORNS,
    ITEM_PROPERTY_MASTERY,
    ITEM_PROPERTY_MARK_BLOOD_STEEL,
    ITEM_PROPERTY_MARK_FORTIFIED_ARMOR,
    ITEM_PROPERTY_MARK_PRECISE_CUT,
    ITEM_PROPERTY_MARK_RUNIC,
    ITEM_PROPERTY_MARK_GUARDIAN,
    ITEM_PROPERTY_MARK_LIVING_ARMOR,
    ITEM_PROPERTY_MARK_GRAND_MASTER,
];

export const ITEM_PROPERTY_CATALOG_VERSION = 1;
export const ITEM_PROPERTY_SOURCE_LEGACY_GUID = 1;
export const ITEM_PROPERTY_SOURCE_BASE_CRAFT = 2;

export interface ItemPropertyRatings {
    vampirism: number;
    thorns: number;
    mastery: number;
}

export function isKnownItemProperty(propertyId: number): boolean {
    for (let i = 0; i < ITEM_PROPERTY_IDS.length; i++) {
        if (ITEM_PROPERTY_IDS[i] == propertyId) return true;
    }
    return false;
}

export function isMakerMarkProperty(propertyId: number): boolean {
    return propertyId >= ITEM_PROPERTY_MARK_BLOOD_STEEL
        && propertyId <= ITEM_PROPERTY_MARK_GRAND_MASTER;
}

export function itemPropertyLabel(propertyId: number, russian: boolean): string {
    if (propertyId == ITEM_PROPERTY_VAMPIRISM) return russian ? "Вампиризм" : "Vampirism";
    if (propertyId == ITEM_PROPERTY_THORNS) return russian ? "Шипы" : "Thorns";
    if (propertyId == ITEM_PROPERTY_MASTERY) return russian ? "Мастерство" : "Mastery";
    if (propertyId == ITEM_PROPERTY_MARK_BLOOD_STEEL) return russian ? "Клеймо кровавой стали" : "Bloodsteel Mark";
    if (propertyId == ITEM_PROPERTY_MARK_FORTIFIED_ARMOR) return russian ? "Клеймо закалённой брони" : "Fortified Armor Mark";
    if (propertyId == ITEM_PROPERTY_MARK_PRECISE_CUT) return russian ? "Клеймо точной огранки" : "Precision Cut Mark";
    if (propertyId == ITEM_PROPERTY_MARK_RUNIC) return russian ? "Рунное клеймо" : "Runic Mark";
    if (propertyId == ITEM_PROPERTY_MARK_GUARDIAN) return russian ? "Клеймо хранителя" : "Guardian's Mark";
    if (propertyId == ITEM_PROPERTY_MARK_LIVING_ARMOR) return russian ? "Клеймо живой брони" : "Living Armor Mark";
    if (propertyId == ITEM_PROPERTY_MARK_GRAND_MASTER) return russian ? "Клеймо великого мастера" : "Grand Master's Mark";
    return "";
}

/** A maker mark is deliberately one tooltip line; its total is split only when applied. */
export function itemPropertyTooltip(propertyId: number, value1: number, _value2: number, russian: boolean): string {
    const label = itemPropertyLabel(propertyId, russian);
    const value = Math.max(0, Math.floor(value1));
    return label.length > 0 && value > 0 ? `${label} +${value}` : "";
}

/** Compatibility helpers for existing scripts and contract tests. */
export function itemPropertyLabelRu(propertyId: number): string {
    return itemPropertyLabel(propertyId, true);
}

export function itemPropertyTooltipRu(propertyId: number, value1: number, value2: number): string {
    return itemPropertyTooltip(propertyId, value1, value2, true);
}

/** Deterministically preserves the stored total when a mark affects multiple ratings. */
export function itemPropertyRatings(propertyId: number, value1: number, _value2: number): ItemPropertyRatings {
    const total = Math.max(0, Math.floor(value1));
    const ratings: ItemPropertyRatings = { vampirism: 0, thorns: 0, mastery: 0 };
    if (propertyId == ITEM_PROPERTY_VAMPIRISM || propertyId == ITEM_PROPERTY_MARK_BLOOD_STEEL) {
        ratings.vampirism = total;
    } else if (propertyId == ITEM_PROPERTY_THORNS || propertyId == ITEM_PROPERTY_MARK_FORTIFIED_ARMOR) {
        ratings.thorns = total;
    } else if (propertyId == ITEM_PROPERTY_MASTERY || propertyId == ITEM_PROPERTY_MARK_PRECISE_CUT) {
        ratings.mastery = total;
    } else if (propertyId == ITEM_PROPERTY_MARK_RUNIC) {
        ratings.vampirism = Math.floor((total + 1) / 2);
        ratings.mastery = total - ratings.vampirism;
    } else if (propertyId == ITEM_PROPERTY_MARK_GUARDIAN) {
        ratings.thorns = Math.floor((total + 1) / 2);
        ratings.mastery = total - ratings.thorns;
    } else if (propertyId == ITEM_PROPERTY_MARK_LIVING_ARMOR) {
        ratings.vampirism = Math.floor((total + 1) / 2);
        ratings.thorns = total - ratings.vampirism;
    } else if (propertyId == ITEM_PROPERTY_MARK_GRAND_MASTER) {
        ratings.vampirism = Math.floor((total + 2) / 3);
        ratings.thorns = Math.floor((total + 1) / 3);
        ratings.mastery = total - ratings.vampirism - ratings.thorns;
    }
    return ratings;
}
