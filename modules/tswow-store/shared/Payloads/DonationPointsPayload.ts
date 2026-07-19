import { ClientCallbackOperations } from "../Messages";

export class DonationPointsPayload {
    points: number = 0;

    read(read: TSPacketRead): DonationPointsPayload {
        this.points = read.ReadUInt32();

        return this;
    }

    BuildPacket(): TSPacketWrite {
        let packet = CreateCustomPacket(ClientCallbackOperations.GET_POINTS, 0);
        packet.WriteUInt32(this.points);
        return packet;
    }
}
