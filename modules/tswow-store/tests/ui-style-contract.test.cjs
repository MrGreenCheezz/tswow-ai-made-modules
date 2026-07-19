const assert = require("assert");
const fs = require("fs");
const path = require("path");
const tstl = require(path.resolve(__dirname, "..", "..", "..", "node_modules", "typescript-to-lua"));

const modulesDir = path.resolve(__dirname, "../..");

function source(file) {
    return fs.readFileSync(file, "utf8");
}

function addonSources(directory) {
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "build") continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...addonSources(full));
        else if (entry.name.endsWith(".ts") && entry.name !== "global.d.ts") result.push(full);
    }
    return result;
}

function topLevelLuaLocals(contents) {
    const lua = tstl.transpileString(contents, {
        luaTarget: tstl.LuaTarget.Lua51,
        noImplicitSelf: true,
    }).file.lua;
    return lua.split(/\r?\n/)
        .filter(line => line.startsWith("local "))
        .reduce((count, line) => count + (
            line.startsWith("local function ")
                ? 1
                : line.slice(6).split("=")[0].split(",").length
        ), 0);
}

const addonModules = fs.readdirSync(modulesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(modulesDir, entry.name, "addon")))
    .map(entry => entry.name)
    .sort();

// A literal assigned to an English DBC field must actually be English. This
// catches the easiest way a ruRU source tree can silently poison enGB output.
for (const moduleEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!moduleEntry.isDirectory() || moduleEntry.name === "default") continue;
    const roots = ["addon", "datascripts", "livescripts", "shared"]
        .map(name => path.join(modulesDir, moduleEntry.name, name))
        .filter(directory => fs.existsSync(directory));
    const contents = roots.flatMap(addonSources).map(source).join("\n");
    const englishLiteralPatterns = [
        /\.enGB\.set\(\s*"((?:\\.|[^"\\])*)"\s*\)/g,
        /\.enGB\.set\(\s*'((?:\\.|[^'\\])*)'\s*\)/g,
        /\.enGB\.set\(\s*`((?:\\.|[^`\\])*)`\s*\)/g,
        /\benGB\s*:\s*"((?:\\.|[^"\\])*)"/g,
        /\benGB\s*:\s*'((?:\\.|[^'\\])*)'/g,
        /\benGB\s*:\s*`((?:\\.|[^`\\])*)`/g,
    ];
    for (const pattern of englishLiteralPatterns) {
        for (const match of contents.matchAll(pattern)) {
            assert(
                !/[\u0400-\u04ff]/.test(match[1]),
                `${moduleEntry.name} writes Cyrillic text to an enGB field: ${match[0]}`,
            );
        }
    }
    assert.doesNotMatch(
        contents,
        /\.enGB\.get\(\)\s*\|\|[^;\n]*\.ruRU\.get\(\)/,
        `${moduleEntry.name} must not fall back from missing English DBC text to Russian`,
    );
}

for (const moduleName of addonModules) {
    const contents = addonSources(path.join(modulesDir, moduleName, "addon"))
        .map(source)
        .join("\n");
    assert.match(contents, /GetLocale\(\)/, `${moduleName} addon must select text from the client locale`);
    assert.match(contents, /ruRU/, `${moduleName} addon must preserve the Russian locale`);
}

const runtimeLocaleModules = [
    "echoes",
    "base-building",
    "custom-companions",
    "custom-stats",
    "gem-abilities",
    "retail-talents",
    "survival",
    "tswow-store",
];
for (const moduleName of runtimeLocaleModules) {
    const contents = addonSources(path.join(modulesDir, moduleName, "livescripts"))
        .map(source)
        .join("\n");
    assert.match(contents, /GetDbcLocale\(\)/, `${moduleName} runtime must select text from the player locale`);
    const directMessage = /Send(?:Broadcast|AreaTrigger)Message\(\s*(["'`])[^\n]*/g;
    for (const match of contents.matchAll(directMessage)) {
        const call = match[0];
        const localizedInline = /(?:baseText|playerText|companionText|localize|tr)\(/.test(call);
        assert(
            localizedInline || !/[\u0400-\u04ff]/.test(call),
            `${moduleName} runtime must not send a direct Russian-only message: ${call}`,
        );
    }
}

for (const moduleName of addonModules) {
    for (const file of addonSources(path.join(modulesDir, moduleName, "addon"))) {
        const contents = source(file);
        assert(
            !contents.includes("Fonts\\\\FRIZQT__.TTF"),
            `${path.relative(modulesDir, file)} must use the native shared font instead of a hardcoded font path`,
        );
        assert(
            !contents.includes("UI-ActionButton-Border"),
            `${path.relative(modulesDir, file)} must not overlay icons with the bright action-button border`,
        );
    }
}

const styleCopies = ["base-building", "retail-talents", "custom-companions"]
    .map(moduleName => source(path.join(modulesDir, moduleName, "addon", "StoreStyle.ts")));
assert.strictEqual(styleCopies[1], styleCopies[0], "retail-talents StoreStyle copy drifted");
assert.strictEqual(styleCopies[2], styleCopies[0], "custom-companions StoreStyle copy drifted");
assert.match(styleCopies[0], /STORE_STYLE_RUSSIAN = GetLocale\(\) == "ruRU"/);
assert.match(styleCopies[0], /STORE_STYLE_RUSSIAN \? "Выбрать" : "Select"/);
assert.match(styleCopies[0], /SetScale\(0\.9 \* Math\.min/);
assert.match(styleCopies[0], /function registerExclusiveWindow[\s\S]*hooksecurefunc\(frame as any, "Show"[\s\S]*TSWOW_ActiveSystemWindow/);
assert.match(styleCopies[0], /left\.SetPoint\("BOTTOM", parent, "BOTTOM", -80, 24\)[\s\S]*right\.SetPoint\("BOTTOM", parent, "BOTTOM", 80, 24\)[\s\S]*pageText\.SetJustifyH\("CENTER"\)/);
const baseUiSource = source(path.join(modulesDir, "base-building", "addon", "base-ui.ts"));
const baseUiLocalCount = topLevelLuaLocals(baseUiSource);
assert.ok(
    baseUiLocalCount <= 195,
    `base-building UI must stay below Lua 5.1's 200-local chunk limit (got ${baseUiLocalCount})`,
);
for (const [moduleName, relativeFile] of [
    ["base-building", "livescripts/base.ts"],
    ["custom-stats", "livescripts/mastery.ts"],
    ["gem-abilities", "livescripts/localization.ts"],
    ["gem-abilities", "livescripts/random_mobs.ts"],
]) {
    const file = path.join(modulesDir, moduleName, relativeFile);
    const count = topLevelLuaLocals(source(file));
    assert.ok(
        count <= 195,
        `${moduleName}/${relativeFile} must stay below Lua 5.1's 200-local chunk limit (got ${count})`,
    );
}
assert.match(baseUiSource, /function installBootstrap\(\): void \{[\s\S]*BaseBuildingMinimapButton/);
assert.match(baseUiSource, /BaseStorageFrame[\s\S]*hooksecurefunc\(f as any, "Show"[\s\S]*TSWOW_ActiveSystemWindow/);
assert.match(
    baseUiSource,
    /const upgrade = createActionButton\([\s\S]*44,[\s\S]*uiText\("Upgrade Base", "Улучшить базу"\)[\s\S]*materialCostText\(buildingMaterialCost\(upgradeCatKey\)/,
);
assert.strictEqual((baseUiSource.match(/SetScale\(0\.9 \* Math\.min/g) || []).length, 2);
const echoUiSource = source(path.join(modulesDir, "echoes", "addon", "echo-ui.ts"));
assert.match(echoUiSource, /hooksecurefunc\(target as any, "Show"[\s\S]*configureDialogWindow[\s\S]*registerExclusiveWindow\(target\)[\s\S]*SetScale\(0\.9 \* Math\.min/);
const simpleButtonSource = source(path.join(modulesDir, "simple-button-addon", "addon", "addon.ts"));
assert.match(simpleButtonSource, /hooksecurefunc\(target as any, "Show"[\s\S]*registerExclusiveWindow\(talents\)[\s\S]*SetScale\(0\.9 \* Math\.min/);
const companionUiSource = source(path.join(modulesDir, "custom-companions", "addon", "addon.ts"));
assert.match(companionUiSource, /createSidePanel\(parent, 270, 400/);
assert.match(companionUiSource, /createCardBadges[\s\S]*installedCount/);
const companionProgressionUiSource = source(path.join(modulesDir, "custom-companions", "addon", "CompanionProgressionUI.ts"));
assert.match(companionProgressionUiSource, /createCompanionBadge[\s\S]*Справка по терминам и значкам/);
assert.match(companionProgressionUiSource, /TAB_HELP[\s\S]*helpPanel\.Show\(\)/);
assert.match(companionProgressionUiSource, /createActionButton\(parent, 30, 23, "<"\)[\s\S]*text\.SetWidth\(54\)[\s\S]*createActionButton\(parent, 30, 23, ">"\)/);
assert.match(companionProgressionUiSource, /createListRow\(libraryPanel, 700, 38\)[\s\S]*flat\.SetTexture\(0\.08, 0\.055, 0\.025, 0\.96\)[\s\S]*librarySelectionText\.SetHeight\(40\)/);
assert.match(source(path.join(modulesDir, "survival", "addon", "survival-ui.ts")), /SetClampedToScreen\(true\)/);
assert.match(source(path.join(modulesDir, "tswow-store", "addon", "tswow-store", "StoreUI.ts")), /configureStoreFrame/);
assert.match(source(path.join(modulesDir, "tswow-store", "addon", "tswow-store", "StoreUI.ts")), /registerExclusiveWindow\(shopMainFrame\)/);
assert.match(source(path.join(modulesDir, "tswow-store", "addon", "tswow-store", "Theme.ts")), /TSWOW_ActiveSystemWindow[\s\S]*SetScale\(0\.9 \* Math\.min/);
assert.match(source(path.join(modulesDir, "tswow-store", "datascripts", "tswow-store.ts")), /name_en VARCHAR\(100\)[\s\S]*description_en VARCHAR\(255\)/);
assert.match(source(path.join(modulesDir, "tswow-store", "shared", "Payloads", "StoreItemPayload.ts")), /BuildPacket\(russian: boolean = true\)[\s\S]*item\.NameEn \|\| item\.Name/);

assert.match(source(path.join(modulesDir, "custom-companions", "livescripts", "livescripts.ts")), /function sendError[\s\S]*if \(!companionClient\(player\)\.ready\) \{[\s\S]*SendBroadcastMessage[\s\S]*return;[\s\S]*CompanionError/);
assert.match(source(path.join(modulesDir, "base-building", "livescripts", "base.ts")), /function sendError[\s\S]*if \(!baseClient\(player\)\.ready\) \{[\s\S]*SendBroadcastMessage[\s\S]*return;[\s\S]*new ErrorMsg/);
assert.match(source(path.join(modulesDir, "retail-talents", "livescripts", "talents.ts")), /function reject[\s\S]*if \(!talentClient\(player\)\.ready\) \{[\s\S]*SendBroadcastMessage[\s\S]*return;[\s\S]*new ErrorMsg/);
assert.match(source(path.join(modulesDir, "echoes", "livescripts", "echoes.ts")), /function reject[\s\S]*if \(!echoClient\(player\)\.ready\) \{[\s\S]*SendBroadcastMessage[\s\S]*return false;[\s\S]*new EchoErrorMsg/);

console.log(`UI style contract: ok (${addonModules.length} addon modules)`);
