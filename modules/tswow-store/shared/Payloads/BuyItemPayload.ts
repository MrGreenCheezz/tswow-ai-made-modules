import { ClientCallbackOperations } from "../Messages";

export class BuyItemPayload {
  TabIndex: number = 0;
  ItemIndex: number = 0;

  read(read: TSPacketRead): BuyItemPayload {
    this.TabIndex = read.ReadUInt32();
    this.ItemIndex = read.ReadUInt32();

    return this;
  }

  BuildPacket(): TSPacketWrite {
    let packet = CreateCustomPacket(ClientCallbackOperations.BUY_ITEM, 0);

    packet.WriteUInt32(this.TabIndex);
    packet.WriteUInt32(this.ItemIndex);

    return packet;
  }
}
