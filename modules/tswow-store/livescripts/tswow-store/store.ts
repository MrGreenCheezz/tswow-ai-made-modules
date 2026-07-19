import { StorePacketCallbacks } from "./storePacketCallbacks";

export function StoreLiveScript(events: TSEvents) {
    if (!verifyItemsInDB()) {
        return;
    }
    StorePacketCallbacks(events);
}

function verifyItemsInDB() {
    const data = QueryWorld(`SELECT purchase_id, id FROM store_items;`);
    while (data.GetRow()) {
        const itemID = data.GetUInt32(0);
        if (!GetItemTemplate(itemID)) {
            // console.log недоступен в lua-бэкенде; просто не поднимаем магазин
            return false;
        }
    }
    return true;
}
