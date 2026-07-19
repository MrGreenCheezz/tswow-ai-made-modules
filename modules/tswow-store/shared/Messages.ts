export enum  ClientCallbackOperations
{
    //Store Operations
    REQUEST_ITEMS,
    RECEIVE_ITEMS,
    BUY_ITEM,
    GET_POINTS,
    REQUEST_POINTS,
    ERROR,

};

//dont reuse IDs
export class SimpleMessagePayload {
    //all vars here
    op: number = ClientCallbackOperations.REQUEST_ITEMS
    message: string = ""

    //constructor, self explanatory
    constructor(opcode: number, message: string) {
        this.message = message;
        this.op = opcode;
    }

    //parsing the packet
    read(read: TSPacketRead): void {
        this.message = read.ReadString()
    }
    //writing the packet
    write(): TSPacketWrite {
        //you can default the size to 0, it will find it's own size. sometimes string brick this. i default to 2000 whenever it acts up
        let packet = CreateCustomPacket(this.op, 0);
        packet.WriteString(this.message);
        return packet;
    }
}

export class ServerToClientPayload {
    op: number = -1

    //constructor, self explanatory
    constructor(opcode: number) {
        this.op = opcode;
    }

    //parsing the packet
    read(read: TSPacketRead): void {
    }
    //writing the packet
    write(): TSPacketWrite {
        //you can default the size to 0, it will find it's own size. sometimes string brick this. i default to 2000 whenever it acts up
        let packet = CreateCustomPacket(this.op, 0);
        return packet;
    }
}

