/**
 * Store — загрузка товаров из world-таблицы store_items.
 * Переписано под lua-бэкенд: без CreateDictionary (см. storePacketCallbacks).
 */
import { StoreItem, StoreItemCollection, StoreItemPayload } from "../../shared/Payloads/StoreItemPayload";

export function setupItems(itemDict: { [tab: number]: { [index: number]: StoreItem } }) {
    // очистить прошлый кеш (reload store_items)
    for (const key in itemDict) {
        delete itemDict[Number(key)];
    }
    const items = retrieveItems();
    items.AllItems.forEach((collection, i) => {
        const collDict: { [index: number]: StoreItem } = {};
        collection.Items.forEach((item, j) => {
            collDict[j] = item;
        });
        itemDict[i] = collDict;
    });
    return items;
}

function retrieveItems() {
    const payload = new StoreItemPayload();
    const filteredItems: StoreItemCollection[] = [];
    const categories: number[] = [];
    const catItems: { [category: number]: StoreItem[] } = {};
    const data = QueryWorld(
        "SELECT id, flags, cost, name, description, "
        + "COALESCE(NULLIF(name_en, ''), name), "
        + "COALESCE(NULLIF(description_en, ''), description), "
        + "category, purchase_id, extra_id FROM store_items;"
    );
    while (data.GetRow()) {
        const item = new StoreItem();
        item.ID = data.GetUInt32(0);
        item.Flags = data.GetUInt32(1);
        item.Cost = data.GetUInt32(2);
        item.Name = data.GetString(3);
        item.Description = data.GetString(4);
        item.NameEn = data.GetString(5);
        item.DescriptionEn = data.GetString(6);
        item.Category = data.GetUInt32(7);
        item.PurchaseID = data.GetUInt32(8);
        item.ExtraID = data.GetUInt32(9);

        if (catItems[item.Category] === undefined) {
            catItems[item.Category] = [];
            categories.push(item.Category);
        }
        catItems[item.Category].push(item);
    }

    categories.forEach(category => {
        const listToAdd = new StoreItemCollection();
        listToAdd.MaxItems = catItems[category].length;
        listToAdd.Items = catItems[category];
        filteredItems.push(listToAdd);
    });
    payload.MaxTabs = filteredItems.length;
    payload.AllItems = filteredItems;

    return payload;
}
