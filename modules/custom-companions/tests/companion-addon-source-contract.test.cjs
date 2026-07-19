const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));
const tstl = require(path.join(__dirname, "../../../node_modules/typescript-to-lua"));

const addonFile = path.join(__dirname, "../addon/addon.ts");
const progressionFile = path.join(__dirname, "../addon/CompanionProgressionUI.ts");
const trainingFile = path.join(__dirname, "../shared/CompanionTraining.ts");
const livescriptFile = path.join(__dirname, "../livescripts/livescripts.ts");
const baseWorkforceFile = path.join(__dirname, "../../base-building/livescripts/workforce.ts");
const addonSource = fs.readFileSync(addonFile, "utf8");
const progressionSource = fs.readFileSync(progressionFile, "utf8");
const trainingSource = fs.readFileSync(trainingFile, "utf8");
const livescriptSource = fs.readFileSync(livescriptFile, "utf8");
const baseWorkforceSource = fs.readFileSync(baseWorkforceFile, "utf8");

assert.doesNotMatch(progressionSource, /\bcontinue\s*;/, "Lua 5.1 target does not support continue");
assert.doesNotMatch(trainingSource, /\.replace\s*\(\s*\//, "TSTL does not support regex literals");
assert.doesNotMatch(trainingSource, /\bString\s*\(/, "TS String() emits an unavailable Lua global");

function count(source, pattern) {
    return (source.match(pattern) || []).length;
}

function between(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0, `missing source marker: ${start}`);
    assert.ok(to > from, `missing source marker after ${start}: ${end}`);
    return source.slice(from, to);
}

function assertOrdered(source, fragments, label) {
    let cursor = -1;
    for (const fragment of fragments) {
        const position = source.indexOf(fragment, cursor + 1);
        assert.ok(position > cursor, `${label}: missing or out-of-order '${fragment}'`);
        cursor = position;
    }
}

assert.strictEqual(count(addonSource, /OnCustomPacket\(OP_COMPANION_STATE,/g), 1);
assert.strictEqual(count(addonSource, /OnCustomPacket\(OP_COMPANION_SUMMARY_V3,/g), 1);
const v2Handler = between(
    addonSource,
    "OnCustomPacket(OP_COMPANION_STATE",
    "OnCustomPacket(OP_COMPANION_SUMMARY_V3",
);
const v3Handler = between(
    addonSource,
    "OnCustomPacket(OP_COMPANION_SUMMARY_V3",
    "OnCustomPacket(OP_COMPANION_ERROR",
);
for (const [handler, read] of [
    [v2Handler, "state.read(packet);"],
    [v3Handler, "state.read(packet, COMPANION_PROTOCOL_VERSION);"],
]) {
    assert.strictEqual(count(handler, /state = new CompanionState\(\);/g), 1);
    assert.strictEqual(count(handler, /state\.read\(packet/g), 1);
    assert.strictEqual(count(handler, /updateCompanionProgressionSummary\(state\);/g), 1);
    assert.match(handler, new RegExp(read.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(v2Handler, /COMPANION_PROTOCOL_VERSION/);
const summaryUpdate = between(
    progressionSource,
    "export function updateCompanionProgressionSummary",
    "export function reportCompanionProgressionError",
);
assertOrdered(summaryUpdate, [
    "summary.selectedProtocolVersion < COMPANION_PROTOCOL_VERSION",
    "detail = undefined",
    "detailFeatures = {}",
    "pendingDetailToken = 0",
], "v2 fallback reset");
assertOrdered(summaryUpdate, [
    "queuedWorkforceAssignment.startedAt = GetTime()",
    "queuedWorkforceAssignment.waitingForState = true",
    "requestWorkforce(true)",
], "active companion recall must refresh workforce before assignment");
assertOrdered(summaryUpdate, [
    "if (!selectedExists)",
    "detailFeatures = {}",
    "selectedFeatureId = 0",
    "libraryPage = 0",
], "automatic companion fallback must reset the filtered library selection");
assert.match(
    summaryUpdate,
    /GetTime\(\) - queuedWorkforceAssignment\.startedAt >= WORKFORCE_TIMEOUT_S/,
    "late recall acknowledgements must not revive an expired assignment",
);

assert.match(trainingSource, /COMPANION_TRAINING_FEATURE_COUNT\s*=\s*80;/);
assert.match(trainingSource, /COMPANION_TRAINING_MAX_SLOTS\s*=\s*15;/);
assert.doesNotMatch(progressionSource, /MAX_COMPANIONS/);
assert.match(progressionSource, /const MAX_WORKFORCE_TARGETS = 256;/);
assert.match(progressionSource, /const COMPANIONS_PER_PAGE = 8;/);
assert.match(progressionSource, /const LIBRARY_PER_PAGE = 7;/);
assert.match(progressionSource, /const TARGETS_PER_PAGE = 7;/);
assert.match(progressionSource, /i < COMPANION_TRAINING_MAX_SLOTS/);
const libraryFeatureFilter = between(
    progressionSource,
    "function libraryFeatures()",
    "function libraryMaxPage()",
);
assertOrdered(libraryFeatureFilter, [
    "detailReady()",
    "companionTrainingCompatible(feature, detail.family, detail.professionId)",
    "features.push(feature)",
], "library compatibility filter");
assert.match(progressionSource, /libraryFeatures\(\)\.length - 1\) \/ LIBRARY_PER_PAGE/);
assert.match(
    progressionSource,
    /next\.capacity > COMPANION_TRAINING_MAX_SLOTS/,
);

const workforceRequest = between(
    progressionSource,
    "class WorkforceRequestLocal",
    "interface WorkforceTargetLocal",
);
assert.deepStrictEqual(
    [...workforceRequest.matchAll(/packet\.WriteDouble\(this\.(\w+)\)/g)].map(match => match[1]),
    ["action", "workerId", "targetKind", "targetId", "expectedRevision", "requestToken"],
);

const workforceState = between(
    progressionSource,
    "class WorkforceStateLocal",
    "interface PendingWorkforceAction",
);
assertOrdered(workforceState, [
    "this.revision = safeUInt(read.ReadDouble())",
    "this.requestToken = safeUInt(read.ReadDouble())",
    "const rawCount = read.ReadDouble()",
], "workforce state header");
assert.deepStrictEqual(
    [...workforceState.matchAll(
        /(\w+):\s+(?:safeUInt\()?read\.Read(?:Double|String)\(\)\)?/g,
    )].map(match => match[1]),
    [
        "targetKind", "targetId", "catKey", "generatorCategory", "name",
        "workerId", "workerEntry", "profession", "trait", "rank",
        "periodBps", "saveBps", "bonusBps", "biasSelector", "markBps",
        "markProperty", "pendingXP",
    ],
);
assert.match(workforceState, /safeCount\(rawCount, MAX_WORKFORCE_TARGETS\)/);

const detailHandler = between(
    progressionSource,
    "OnCustomPacket(OP_COMPANION_DETAIL",
    "OnCustomPacket(OP_COMPANION_WORKFORCE_ERROR",
);
assertOrdered(detailHandler, [
    "pendingDetailToken <= 0",
    "next.ackToken != pendingDetailToken",
    "next.companionId != selectedCompanionId",
    "next.revision < revisionFloor",
], "detail stale-state gate");
assertOrdered(detailHandler, [
    "pendingDetailToken = 0",
    "pendingDetailRequestedAt = 0",
    "detail = next",
    "requestWorkforce(true)",
], "accepted detail must clear its timeout and refresh base assignments");

const progressionErrorHandler = between(
    progressionSource,
    "export function reportCompanionProgressionError",
    "export function openCompanionProgression",
);
assert.doesNotMatch(
    progressionErrorHandler,
    /queuedWorkforceAssignment\s*=\s*undefined/,
    "a generic OP67 error must not silently cancel a queued base assignment",
);
assertOrdered(progressionErrorHandler, [
    "pendingDetailToken = 0",
    "pendingDetailRequestedAt = 0",
    "requestDetail()",
], "detail errors must release and retry the pending request");

const baseErrorHandler = between(
    progressionSource,
    "OnCustomPacket(OP_COMPANION_WORKFORCE_ERROR",
    "OnCustomPacket(OP_COMPANION_WORKFORCE_STATE",
);
assert.match(baseErrorHandler, /if \(!pendingWorkforceAction \|\|/);
assert.match(baseErrorHandler, /isWorkforceErrorText\(text\)/);
assert.match(baseErrorHandler, /pendingWorkforceError = text/);
assert.match(baseErrorHandler, /message = workforceErrorDisplay\(text\)/);
const workforceErrors = [...baseWorkforceSource.matchAll(
    /sendWorkforceError\(player, msg, "([^"]+)"\)/g,
)].map(match => match[1]);
for (const error of workforceErrors) {
    assert.ok(
        progressionSource.includes('text == "' + error + '"'),
        "workforce OP57 whitelist is missing: " + error,
    );
    assert.ok(
        count(progressionSource, new RegExp(error.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) >= 2,
        "workforce wire token lacks a display-only translation: " + error,
    );
}

const workforceHandler = between(
    progressionSource,
    "OnCustomPacket(OP_COMPANION_WORKFORCE_STATE",
    "(_G as any).SLASH_COMPANIONPROGRESSION1",
);
assert.strictEqual(count(progressionSource, /OnCustomPacket\(OP_COMPANION_WORKFORCE_STATE,/g), 1);
assertOrdered(workforceHandler, [
    "pendingWorkforceToken <= 0",
    "next.requestToken != pendingWorkforceToken",
    "next.revision < workforce.revision",
], "workforce stale-state gate");
assert.match(workforceHandler, /workforceLoaded = true/);
assert.match(progressionSource, /const OP_COMPANION_WORKFORCE_STATE = 99/);
assert.match(progressionSource, /const OP_COMPANION_WORKFORCE_ERROR = 100/);
assert.match(progressionSource, /const TOKEN_MIN = 1000000000/);
assert.doesNotMatch(progressionSource, /OnCustomPacket\(OP_WORKFORCE_STATE/);
assert.doesNotMatch(progressionSource, /OnCustomPacket\(OP_BASE_ERROR/);
assert.match(workforceHandler, /completedError \? workforceErrorDisplay\(completedError\)/);
assert.match(workforceHandler, /workforceTarget\(queued\.targetKind, queued\.targetId\)/);
assert.match(workforceHandler, /GetTime\(\) - queued\.startedAt >= WORKFORCE_TIMEOUT_S/);
assert.match(workforceHandler, /sendWorkforceAction\(WORKFORCE_ACTION_ASSIGN, target\)/);
assert.match(workforceHandler, /if \(workforceRefreshHandler\) workforceRefreshHandler\(\)/);
assert.match(progressionSource, /export function companionWorkforceAssigned/);
assert.match(progressionSource, /export function requestCompanionWorkforceState/);
assert.match(progressionSource, /export function setCompanionWorkforceRefreshHandler/);
assert.match(
    progressionSource,
    /new CompanionTrainingActionRequest\(\s*token,\s*detail\.revision,\s*COMPANION_TRAINING_CATALOG_VERSION,\s*selectedCompanionId,\s*action,\s*featureId,\s*slot,/s,
);
assert.match(
    progressionSource,
    /new WorkforceRequestLocal\(\s*action,\s*workerId,\s*target\.targetKind,\s*target\.targetId,\s*workforce\.revision,\s*token,/s,
);

const libraryRefresh = between(
    progressionSource,
    "function refreshLibrary()",
    "function refreshBase()",
);
const slotRefresh = between(
    progressionSource,
    "function refreshSlots()",
    "function refreshLibrary()",
);
const slotInstallGate = slotRefresh.match(
    /setActionEnabled\(installButton,[\s\S]*?\);/,
);
assert.ok(slotInstallGate, "slot-tab install gate is missing");
assert.match(slotInstallGate[0], /state\.rank > 0/);
assert.doesNotMatch(
    slotInstallGate[0],
    /hasConsumable|inventoryCount/,
    "slot-tab installation must never require a physical item",
);
const libraryPanel = between(
    progressionSource,
    "function buildLibraryPanel",
    "function buildBasePanel",
);
assert.match(
    libraryPanel,
    /libraryInstallButton[\s\S]*COMPANION_ACTION_INSTALL, selectedFeatureId, selectedSlot/,
    "the library must expose direct installation into the selected slot",
);
assert.match(libraryPanel, /"В ячейку: бесплатно"/);
assert.match(libraryPanel, /"Разобрать предмет"/);
assert.strictEqual(
    count(libraryPanel, /libraryFeatures\(\)\[libraryPage \* LIBRARY_PER_PAGE \+ index\]/g),
    2,
    "library click and tooltip must use the filtered list",
);
assertOrdered(libraryRefresh, [
    "const features = libraryFeatures()",
    "const feature = features[libraryPage * LIBRARY_PER_PAGE + i]",
], "library rows must use the filtered list");
assert.doesNotMatch(libraryRefresh, /Несовместимо/);
assert.match(libraryRefresh, /const ready = detailReady\(\)/);
const featureTooltip = between(
    progressionSource,
    "function showFeatureTooltip",
    "function showTargetTooltip",
);
assert.match(featureTooltip, /feature\.descriptionRu/);
assert.match(featureTooltip, /feature\.description/);
assert.match(featureTooltip, /feature\.kind == TRAINING_KIND_MANUAL/);
assert.match(featureTooltip, /Подходит семействам/);
assert.match(featureTooltip, /trainingFamiliesRu\(feature\.familyMask\)/);
assert.doesNotMatch(progressionSource, /Особенность результата: селектор/);
assert.match(
    libraryRefresh,
    /setActionEnabled\(learnButton, hasConsumable && compatible && rank < 3\)/,
    "learning must still enforce family/profession compatibility",
);
assert.match(
    libraryRefresh,
    /setActionEnabled\(studyButton, hasConsumable\s*&& !!detail/s,
    "any displayed owned item must remain usable as slot-study material",
);
assert.doesNotMatch(
    libraryRefresh,
    /setActionEnabled\(studyButton,[^;]*compatible/s,
    "slot study must not add a redundant compatibility gate",
);
const libraryInstallGate = libraryRefresh.match(
    /setActionEnabled\(libraryInstallButton,[\s\S]*?\);/,
);
assert.ok(libraryInstallGate, "library install gate is missing");
assert.match(libraryInstallGate[0], /state\.rank > 0/);
assert.match(libraryInstallGate[0], /selectedSlot <= detail\.capacity/);
assert.doesNotMatch(
    libraryInstallGate[0],
    /hasConsumable|inventoryCount/,
    "installing a learned feature must never require a physical item",
);

const workforceRequestFlow = between(
    progressionSource,
    "function requestWorkforce",
    "function sendTrainingAction",
);
assert.match(workforceRequestFlow, /WORKFORCE_TIMEOUT_S/);
assert.match(workforceRequestFlow, /force: boolean = false/);
const frameBuild = between(
    progressionSource,
    "function ensureFrame",
    "function showSlotTooltip",
);
assert.match(frameBuild, /HookScript\("OnUpdate"/);
assert.match(frameBuild, /RegisterEvent\("BAG_UPDATE"\)/);
assert.match(frameBuild, /detailRefreshAt = GetTime\(\) \+ 0\.2/);
assert.match(frameBuild, /now - pendingDetailRequestedAt >= WORKFORCE_TIMEOUT_S/);
assertOrdered(frameBuild, [
    "pendingDetailToken = 0",
    "pendingDetailRequestedAt = 0",
    "requestDetail()",
], "timed-out detail requests must be retried");
assert.match(frameBuild, /pendingWorkforceToken = 0/);
assert.match(frameBuild, /workforceTimedOut = true/);

const mainFrameBuild = between(addonSource, "function ensureFrame", "function refresh");
assert.match(mainFrameBuild, /requestCompanionWorkforceState\(\)/);
assert.match(mainFrameBuild, /workforceStateReady = false/);
assert.match(mainFrameBuild, /now - workforceRequestedAt >= WORKFORCE_RESPONSE_TIMEOUT_S/);
assert.match(mainFrameBuild, /Сервер базы не ответил\. Повторяю проверку назначений/);
assert.match(addonSource, /setCompanionWorkforceRefreshHandler\(\(\) =>/);
assert.match(addonSource, /workforceStateReady = true/);
assert.match(addonSource, /if \(workforceResponseDelayed\) lastMessage = L\(/);
assert.match(addonSource, /companionWorkforceAssigned\(companion\.companionId\)/);
assert.match(addonSource, /Дождитесь проверки назначений на базе/);
assert.match(addonSource, /companion\.companionId != state\.activeId && assigned/);
assert.match(addonSource, /const unavailable = active \|\| !workforceStateReady \|\| assigned \|\| slotOccupied/);
assert.match(addonSource, /const blocked = !active && \(!workforceStateReady \|\| assigned\)/);
assert.match(addonSource, /!workforceStateReady \? L\("Checking base", "Проверка базы"\)/);
assert.match(addonSource, /assigned \? L\("At base", "На базе"\)/);
const recallFlow = between(
    progressionSource,
    "function sendOrQueueWorkforceAction",
    "function sanitizeDetail",
);
assert.match(recallFlow, /new CompanionActivateRequest\(0\)/);
assert.match(recallFlow, /queuedWorkforceAssignment/);
const baseRefresh = between(
    progressionSource,
    "function refreshBase()",
    "function refreshTabs()",
);
assert.match(baseRefresh, /workforceCompatible\(companion\.professionId, target\)/);
assert.match(baseRefresh, /L\("compatible", "совместимо"\).*L\("not suitable", "не подходит"\)/s);
assert.match(baseRefresh, /Сервер базы не ответил/);
assert.match(baseRefresh, /Список загружен: функциональных станков и генераторов на базе нет/);
assert.match(baseRefresh, /!workforceTimedOut && !occupiedByOther/);

assert.match(addonSource, /const RU = GetLocale\(\) == "ruRU"/);
assert.match(progressionSource, /const RU = GetLocale\(\) == "ruRU"/);
assert.match(progressionSource, /L\(feature\.name, feature\.nameRu\)/);
assert.match(progressionSource, /L\(feature\.description, feature\.descriptionRu\)/);
assert.match(progressionSource, /function workforceErrorDisplay\(text: string\)/);
assert.match(progressionSource, /if \(RU\) return text/);
assert.match(livescriptSource, /function playerText\(player: TSPlayer/);
assert.match(livescriptSource, /CompanionRuntime\.companionText\(player, english, russian\)/);

function luaTopLevelLocalCount(source) {
    const result = tstl.transpileString(source, {
        luaTarget: tstl.LuaTarget.Lua51,
        noImplicitSelf: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        skipLibCheck: true,
    });
    assert.ok(result.file && result.file.lua, "TypeScriptToLua must emit an audit artifact");
    assert.doesNotMatch(result.file.lua, /\bString\s*\(/, "generated Lua must not call the missing String global");
    let locals = 0;
    for (const line of result.file.lua.split(/\r?\n/)) {
        if (!line.startsWith("local ")) continue;
        if (/^local function\s+/.test(line)) {
            locals++;
            continue;
        }
        const declaration = line.slice("local ".length);
        const equals = declaration.indexOf("=");
        const names = (equals >= 0 ? declaration.slice(0, equals) : declaration)
            .split(",")
            .map(name => name.trim())
            .filter(Boolean);
        locals += names.length;
    }
    return locals;
}

const addonLocals = luaTopLevelLocalCount(addonSource);
const progressionLocals = luaTopLevelLocalCount(progressionSource);
const livescriptLocals = luaTopLevelLocalCount(livescriptSource);
luaTopLevelLocalCount(trainingSource);
assert.ok(addonLocals <= 180, `addon.lua local headroom lost: ${addonLocals}/200`);
assert.ok(
    progressionLocals <= 180,
    `CompanionProgressionUI.lua local headroom lost: ${progressionLocals}/200`,
);
assert.ok(livescriptLocals <= 180, `livescripts.lua local headroom lost: ${livescriptLocals}/200`);

console.log(
    `companion source contracts: ok (Lua top-level locals ${addonLocals}/${progressionLocals}/${livescriptLocals})`,
);
