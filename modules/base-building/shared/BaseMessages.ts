/**
 * Base-building — client<->server protocol (shared).
 *
 * Кодек как в retail-talents: числа — Double, строки — String, списки с префиксом
 * длины. Сервер отвечает на любое действие полным BaseState (ресинк меню).
 * Опкоды 40-51 и 60-61 заняты; база использует 52-59, 62-63, 68-74 и 95-96.
 */

export const OP_BASE_REQUEST = 52; // C->S: клиент готов, запросить состояние
export const OP_BASE_STATE   = 53; // S->C: деньги, есть-ли-флаг, кол-во построек
export const OP_BASE_SELECT  = 54; // C->S: выбрать ближайшую постройку; 0/0 — сброс/запрос списка
export const OP_BASE_ROTATE  = 55; // C->S: довернуть выбранную постройку (dir: -1/+1)
export const OP_BASE_REMOVE  = 56; // C->S: снести выбранную постройку
export const OP_BASE_ERROR   = 57; // S->C: текст сообщения/ошибки
export const OP_BASE_FLAG    = 58; // C->S: legacy-подтверждение прямой установки флага
export const OP_BASE_TOOLTIP = 59; // C->S/S->C: запрос/ответ владельца флага для tooltip
export const OP_BASE_CLEAR   = 62; // C->S: снести флаг и все постройки базы
export const OP_BASE_TOOL    = 63; // C->S: купить/выдать инструмент по catalog key или exact patch entry
// 64-67 заняты custom-companions.
export const OP_STORE_STATE    = 68; // S->C: содержимое пула станции (+флаг «открыть окно»)
export const OP_STORE_REQUEST  = 69; // C->S: запросить содержимое пула станции
export const OP_STORE_DEPOSIT  = 70; // C->S: положить предмет из сумок в пул станции
export const OP_STORE_WITHDRAW = 71; // C->S: забрать предмет из пула станции в сумки
export const OP_STORE_UPGRADE  = 72; // C->S: улучшить перерабатывающую станцию
export const OP_BASE_MANAGE_STATE = 73; // S->C: ближайшие постройки и текущий выбор
export const OP_BASE_MOVE         = 74; // C->S: сдвинуть выбранную постройку по оси
// 75-94 заняты другими модулями.
export const OP_WORKFORCE_REQUEST = 95; // C->S: запрос/назначение/снятие работника
export const OP_WORKFORCE_STATE   = 96; // S->C: authoritative targets and assignments
export const OP_COMPANION_WORKFORCE_STATE = 99; // S->C: то же состояние для UI развития спутников
export const OP_COMPANION_WORKFORCE_ERROR = 100; // S->C: ошибка назначения для UI развития спутников
export const COMPANION_WORKFORCE_TOKEN_MIN = 1000000000;

export const FLAG_TOOL_KEY = -1;
export const MOVE_AXIS_X = 0;
export const MOVE_AXIS_Y = 1;
export const MOVE_AXIS_Z = 2;

export class StateRequest {
    read(_read: TSPacketRead): void { _read.ReadDouble(); }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_REQUEST, 0);
        p.WriteDouble(0);
        return p;
    }
}

export class BaseState {
    hasFlag: number = 0;    // 0/1
    count: number = 0;      // построек размещено
    max: number = 0;        // лимит
    woodItems: TSArray<number> = []; // числовые ID древесины для клиентского каталога

    read(read: TSPacketRead): void {
        this.hasFlag = read.ReadDouble();
        this.count = read.ReadDouble();
        this.max = read.ReadDouble();
        this.woodItems = [];
        const woodCount = read.ReadDouble();
        for (let i = 0; i < woodCount; i++) this.woodItems.push(read.ReadDouble());
    }

    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_STATE, 0);
        p.WriteDouble(this.hasFlag);
        p.WriteDouble(this.count);
        p.WriteDouble(this.max);
        p.WriteDouble(this.woodItems.length);
        for (let i = 0; i < this.woodItems.length; i++) p.WriteDouble(this.woodItems[i]);
        return p;
    }
}

export class SelectMsg {
    key: number = 0;   // runtime spawnGuid
    entry: number = 0;
    constructor(key: number = 0, entry: number = 0) {
        this.key = key;
        this.entry = entry;
    }
    read(read: TSPacketRead): void {
        this.key = read.ReadDouble();
        this.entry = read.ReadDouble();
    }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_SELECT, 0);
        p.WriteDouble(this.key);
        p.WriteDouble(this.entry);
        return p;
    }
}

export class ManageEntry {
    spawnGuid: number = 0;
    entry: number = 0;
    catKey: number = 0;
    distance: number = 0;

    constructor(spawnGuid: number, entry: number, catKey: number, distance: number) {
        this.spawnGuid = spawnGuid;
        this.entry = entry;
        this.catKey = catKey;
        this.distance = distance;
    }
}

/** S->C: все собственные постройки на текущей карте и их текущий выбор. */
export class ManageState {
    selectedGuid: number = 0;
    selectedEntry: number = 0;
    items: TSArray<ManageEntry> = [];

    constructor(selectedGuid: number = 0, selectedEntry: number = 0, items: TSArray<ManageEntry> = []) {
        this.selectedGuid = selectedGuid;
        this.selectedEntry = selectedEntry;
        this.items = items;
    }

    read(read: TSPacketRead): void {
        this.selectedGuid = read.ReadDouble();
        this.selectedEntry = read.ReadDouble();
        this.items = [];
        const count = read.ReadDouble();
        for (let i = 0; i < count; i++) {
            this.items.push(new ManageEntry(
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
            ));
        }
    }

    write(): TSPacketWrite {
        const p = CreateCustomPacket(OP_BASE_MANAGE_STATE, 0);
        p.WriteDouble(this.selectedGuid);
        p.WriteDouble(this.selectedEntry);
        p.WriteDouble(this.items.length);
        for (let i = 0; i < this.items.length; i++) {
            p.WriteDouble(this.items[i].spawnGuid);
            p.WriteDouble(this.items[i].entry);
            p.WriteDouble(this.items[i].catKey);
            p.WriteDouble(this.items[i].distance);
        }
        return p;
    }
}

export class MoveMsg {
    axis: number = MOVE_AXIS_X;
    dir: number = 1;
    step: number = 0;

    constructor(axis: number, dir: number, step: number) {
        this.axis = axis;
        this.dir = dir;
        this.step = step;
    }

    read(read: TSPacketRead): void {
        this.axis = read.ReadDouble();
        this.dir = read.ReadDouble();
        this.step = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const p = CreateCustomPacket(OP_BASE_MOVE, 0);
        p.WriteDouble(this.axis);
        p.WriteDouble(this.dir);
        p.WriteDouble(this.step);
        return p;
    }
}

export class FlagMsg {
    read(_read: TSPacketRead): void { _read.ReadDouble(); }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_FLAG, 0);
        p.WriteDouble(0);
        return p;
    }
}

export class RotateMsg {
    dir: number = 1; // -1 влево, +1 вправо
    constructor(dir: number) { this.dir = dir; }
    read(read: TSPacketRead): void { this.dir = read.ReadDouble(); }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_ROTATE, 0);
        p.WriteDouble(this.dir);
        return p;
    }
}

export class RemoveMsg {
    read(_read: TSPacketRead): void { _read.ReadDouble(); }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_REMOVE, 0);
        p.WriteDouble(0);
        return p;
    }
}

export class ClearBaseMsg {
    read(_read: TSPacketRead): void { _read.ReadDouble(); }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_CLEAR, 0);
        p.WriteDouble(0);
        return p;
    }
}

export class ToolRequestMsg {
    key: number = FLAG_TOOL_KEY;
    constructor(key: number) { this.key = key; }
    read(read: TSPacketRead): void { this.key = read.ReadDouble(); }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_TOOL, 0);
        p.WriteDouble(this.key);
        return p;
    }
}

export class ErrorMsg {
    message: string = "";
    constructor(message: string) { this.message = message; }
    read(read: TSPacketRead): void { this.message = read.ReadString(); }
    write(opcode: number = OP_BASE_ERROR): TSPacketWrite {
        let p = CreateCustomPacket(opcode, 0);
        p.WriteString(this.message);
        return p;
    }
}

/* ----------------------- хранилище и переработка --------------------------- */
export const STORAGE_BUCKET_INPUT = 0;  // обычный склад использует тот же основной пул
export const STORAGE_BUCKET_OUTPUT = 1;

export class StorageEntry {
    itemEntry: number = 0;
    count: number = 0;
    bucket: number = STORAGE_BUCKET_INPUT;
    name: string = "";

    constructor(itemEntry: number, count: number, bucket: number, name: string) {
        this.itemEntry = itemEntry;
        this.count = count;
        this.bucket = bucket;
        this.name = name;
    }
}

/** S->C: полное содержимое пула станции. openWindow=1 — клиент открывает окно. */
export class StorageState {
    station: number = 0;
    openWindow: number = 0;
    nextCycleS: number = 0; // секунд до следующего цикла переработки (0 — не станция)
    working: number = 0;    // 1, если есть сырьё и место для результата
    level: number = 0;      // внутренний уровень 0..2
    periodS: number = 0;
    batch: number = 0;
    upgradeAvailable: number = 0; // 1, если доступен следующий уровень
    pendingProperties: number = 0; // выданные предметы ожидают записи свойств
    quarantinedOutputs: number = 0; // аварийные выдачи, требующие ручной проверки
    acceptedInputs: TSArray<number> = []; // белый список сырья; клиент не обязан знать полный каталог рецептов
    items: TSArray<StorageEntry> = [];

    read(read: TSPacketRead): void {
        this.station = read.ReadDouble();
        this.openWindow = read.ReadDouble();
        this.nextCycleS = read.ReadDouble();
        this.working = read.ReadDouble();
        this.level = read.ReadDouble();
        this.periodS = read.ReadDouble();
        this.batch = read.ReadDouble();
        this.upgradeAvailable = read.ReadDouble();
        this.acceptedInputs = [];
        const acceptedCount = read.ReadDouble();
        for (let i = 0; i < acceptedCount; i++) this.acceptedInputs.push(read.ReadDouble());
        this.items = [];
        const count = read.ReadDouble();
        for (let i = 0; i < count; i++) {
            this.items.push(new StorageEntry(
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadDouble(),
                read.ReadString(),
            ));
        }
        // Optional trailing extension: an old server returns the supplied
        // defaults, while an old client can ignore these final bytes.
        this.pendingProperties = read.ReadDouble(0);
        this.quarantinedOutputs = read.ReadDouble(0);
    }

    write(): TSPacketWrite {
        const p = CreateCustomPacket(OP_STORE_STATE, 0);
        p.WriteDouble(this.station);
        p.WriteDouble(this.openWindow);
        p.WriteDouble(this.nextCycleS);
        p.WriteDouble(this.working);
        p.WriteDouble(this.level);
        p.WriteDouble(this.periodS);
        p.WriteDouble(this.batch);
        p.WriteDouble(this.upgradeAvailable);
        p.WriteDouble(this.acceptedInputs.length);
        for (let i = 0; i < this.acceptedInputs.length; i++) p.WriteDouble(this.acceptedInputs[i]);
        p.WriteDouble(this.items.length);
        for (let i = 0; i < this.items.length; i++) {
            p.WriteDouble(this.items[i].itemEntry);
            p.WriteDouble(this.items[i].count);
            p.WriteDouble(this.items[i].bucket);
            p.WriteString(this.items[i].name);
        }
        p.WriteDouble(this.pendingProperties);
        p.WriteDouble(this.quarantinedOutputs);
        return p;
    }
}

export class StorageRequest {
    station: number = 0;
    constructor(station: number) { this.station = station; }
    read(read: TSPacketRead): void { this.station = read.ReadDouble(); }
    write(): TSPacketWrite {
        const p = CreateCustomPacket(OP_STORE_REQUEST, 0);
        p.WriteDouble(this.station);
        return p;
    }
}

export class StorageMoveMsg {
    station: number = 0;
    itemEntry: number = 0;
    count: number = 0; // 0 при выдаче = «всё»
    bucket: number = STORAGE_BUCKET_INPUT;

    constructor(opcode: number, station: number, itemEntry: number, count: number, bucket: number) {
        this.op = opcode;
        this.station = station;
        this.itemEntry = itemEntry;
        this.count = count;
        this.bucket = bucket;
    }
    private op: number = OP_STORE_DEPOSIT;

    read(read: TSPacketRead): void {
        this.station = read.ReadDouble();
        this.itemEntry = read.ReadDouble();
        this.count = read.ReadDouble();
        this.bucket = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const p = CreateCustomPacket(this.op, 0);
        p.WriteDouble(this.station);
        p.WriteDouble(this.itemEntry);
        p.WriteDouble(this.count);
        p.WriteDouble(this.bucket);
        return p;
    }
}

export class StorageUpgradeMsg {
    station: number = 0;
    constructor(station: number) { this.station = station; }
    read(read: TSPacketRead): void { this.station = read.ReadDouble(); }
    write(): TSPacketWrite {
        const p = CreateCustomPacket(OP_STORE_UPGRADE, 0);
        p.WriteDouble(this.station);
        return p;
    }
}

/* ------------------------------ работники базы ----------------------------- */
export const WORKFORCE_ACTION_STATE = 0;
export const WORKFORCE_ACTION_ASSIGN = 1;
export const WORKFORCE_ACTION_UNASSIGN = 2;
export const WORKFORCE_TARGET_STATION = 1;
export const WORKFORCE_TARGET_GENERATOR = 2;

export class WorkforceRequest {
    action: number = WORKFORCE_ACTION_STATE;
    workerId: number = 0;
    targetKind: number = 0;
    targetId: number = 0;
    expectedRevision: number = 0;
    requestToken: number = 0;

    constructor(
        action: number = WORKFORCE_ACTION_STATE,
        workerId: number = 0,
        targetKind: number = 0,
        targetId: number = 0,
        expectedRevision: number = 0,
        requestToken: number = 0,
    ) {
        this.action = action;
        this.workerId = workerId;
        this.targetKind = targetKind;
        this.targetId = targetId;
        this.expectedRevision = expectedRevision;
        this.requestToken = requestToken;
    }

    read(read: TSPacketRead): void {
        this.action = read.ReadDouble();
        this.workerId = read.ReadDouble();
        this.targetKind = read.ReadDouble();
        this.targetId = read.ReadDouble();
        this.expectedRevision = read.ReadDouble();
        this.requestToken = read.ReadDouble();
    }

    write(): TSPacketWrite {
        const p = CreateCustomPacket(OP_WORKFORCE_REQUEST, 0);
        p.WriteDouble(this.action);
        p.WriteDouble(this.workerId);
        p.WriteDouble(this.targetKind);
        p.WriteDouble(this.targetId);
        p.WriteDouble(this.expectedRevision);
        p.WriteDouble(this.requestToken);
        return p;
    }
}

export class WorkforceTarget {
    targetKind: number = 0;
    targetId: number = 0;
    catKey: number = 0;
    generatorCategory: number = 0;
    name: string = "";
    workerId: number = 0;
    workerEntry: number = 0;
    profession: number = 0;
    trait: number = 0;
    rank: number = 0;
    periodBps: number = 0;
    saveBps: number = 0;
    bonusBps: number = 0;
    bias: number = 0;
    markBps: number = 0;
    markProperty: number = 0;
    pendingXP: number = 0;
}

export class WorkforceState {
    revision: number = 0;
    requestToken: number = 0;
    targets: TSArray<WorkforceTarget> = [];

    read(read: TSPacketRead): void {
        this.revision = read.ReadDouble();
        this.requestToken = read.ReadDouble();
        this.targets = [];
        const count = read.ReadDouble();
        for (let i = 0; i < count; i++) {
            const row = new WorkforceTarget();
            row.targetKind = read.ReadDouble();
            row.targetId = read.ReadDouble();
            row.catKey = read.ReadDouble();
            row.generatorCategory = read.ReadDouble();
            row.name = read.ReadString();
            row.workerId = read.ReadDouble();
            row.workerEntry = read.ReadDouble();
            row.profession = read.ReadDouble();
            row.trait = read.ReadDouble();
            row.rank = read.ReadDouble();
            row.periodBps = read.ReadDouble();
            row.saveBps = read.ReadDouble();
            row.bonusBps = read.ReadDouble();
            row.bias = read.ReadDouble();
            row.markBps = read.ReadDouble();
            row.markProperty = read.ReadDouble();
            row.pendingXP = read.ReadDouble();
            this.targets.push(row);
        }
    }

    write(opcode: number = OP_WORKFORCE_STATE): TSPacketWrite {
        const p = CreateCustomPacket(opcode, 0);
        p.WriteDouble(this.revision);
        p.WriteDouble(this.requestToken);
        p.WriteDouble(this.targets.length);
        for (let i = 0; i < this.targets.length; i++) {
            const row = this.targets[i];
            p.WriteDouble(row.targetKind);
            p.WriteDouble(row.targetId);
            p.WriteDouble(row.catKey);
            p.WriteDouble(row.generatorCategory);
            p.WriteString(row.name);
            p.WriteDouble(row.workerId);
            p.WriteDouble(row.workerEntry);
            p.WriteDouble(row.profession);
            p.WriteDouble(row.trait);
            p.WriteDouble(row.rank);
            p.WriteDouble(row.periodBps);
            p.WriteDouble(row.saveBps);
            p.WriteDouble(row.bonusBps);
            p.WriteDouble(row.bias);
            p.WriteDouble(row.markBps);
            p.WriteDouble(row.markProperty);
            p.WriteDouble(row.pendingXP);
        }
        return p;
    }
}

export class TooltipRequest {
    read(_read: TSPacketRead): void { _read.ReadDouble(); }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_TOOLTIP, 0);
        p.WriteDouble(0);
        return p;
    }
}

export class TooltipOwnerMsg {
    owner: string = "";
    constructor(owner: string) { this.owner = owner; }
    read(read: TSPacketRead): void { this.owner = read.ReadString(); }
    write(): TSPacketWrite {
        let p = CreateCustomPacket(OP_BASE_TOOLTIP, 0);
        p.WriteString(this.owner);
        return p;
    }
}
