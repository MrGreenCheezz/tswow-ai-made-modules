import { ClientCallbackOperations } from "../Messages";

export class StoreItem {
    Name: string = "";
    NameEn: string = "";
    Flags: number = 0;
    ID: number = 0;
    Cost: number = 0;
    Description: string = "";
    DescriptionEn: string = "";
    Category: number = 0;
    PurchaseID: number = 0;
    ExtraID: number = 0;
}

export enum StoreItemFlags {
    iSCreature = 1,
    isEquipment = 2,
    isSale10 = 4,
    isSale20 = 8,
    isSale50 = 16,
}

export class StoreItemCollection {
    MaxItems: number = 0;
    Items: TSArray<StoreItem> = [];
}

export class StoreItemPayload {
    MaxTabs: number = 0;
    AllItems: TSArray<StoreItemCollection> = [];
    read(read: TSPacketRead): StoreItemPayload {
        this.MaxTabs = read.ReadUInt32();
        for (let i = 0; i < this.MaxTabs; i++) {
            let storeItemCol = new StoreItemCollection();
            storeItemCol.MaxItems = read.ReadUInt32();
            for (let h = 0; h < storeItemCol.MaxItems; h++) {
                let item = new StoreItem();
                item.ID = read.ReadUInt32();
                item.Flags = read.ReadUInt32();
                item.Cost = read.ReadUInt32();
                item.Name = read.ReadString();
                item.Description = read.ReadString();
                item.Category = read.ReadUInt32();
                item.PurchaseID = read.ReadUInt32();
                item.ExtraID = read.ReadUInt32();
                storeItemCol.Items.push(item);
            }
            this.AllItems.push(storeItemCol);
        }
        return this;
    }

    BuildPacket(russian: boolean = true): TSPacketWrite {
        let packet = CreateCustomPacket(ClientCallbackOperations.RECEIVE_ITEMS, 0);
        packet.WriteUInt32(this.MaxTabs);
        this.AllItems.forEach((storeItemCol) => {
            packet.WriteUInt32(storeItemCol.MaxItems);
            storeItemCol.Items.forEach((item) => {
                packet.WriteUInt32(item.ID);
                packet.WriteUInt32(item.Flags);
                packet.WriteUInt32(item.Cost);
                packet.WriteString(russian ? item.Name : (item.NameEn || item.Name));
                packet.WriteString(russian ? item.Description : (item.DescriptionEn || item.Description));
                packet.WriteUInt32(item.Category);
                packet.WriteUInt32(item.PurchaseID);
                packet.WriteUInt32(item.ExtraID);
            });
        });
        return packet;
    }
}
