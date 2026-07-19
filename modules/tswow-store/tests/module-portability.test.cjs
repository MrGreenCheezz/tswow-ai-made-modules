const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulesDir = path.resolve(__dirname, "../..");
const portableModules = [
    "attributes",
    "echoes",
    "base-building",
    "craft-all",
    "custom-companions",
    "custom-stats",
    "gem-abilities",
    "retail-talents",
    "simple-button-addon",
    "survival",
    "tswow-store",
];
const endpointNames = new Set(["addon", "assets", "datascripts", "livescripts", "shared"]);
const sourceExtensions = new Set([".ts", ".js", ".cjs", ".lua", ".xml", ".toc", ".conf", ".json"]);
const forbiddenPackagedExtensions = new Set([".bat", ".cmd", ".exe", ".md", ".ps1", ".py", ".rar", ".zip"]);
const absolutePath = /["'`](?:[A-Za-z]:[\\/]|\/(?:home|Users|opt|var|tmp)\/)/;

function walk(directory, callback) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "build" || entry.name === ".vscode") continue;
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(filename, callback);
        else callback(filename);
    }
}

for (const moduleName of portableModules) {
    const moduleDir = path.join(modulesDir, moduleName);
    assert.ok(fs.statSync(moduleDir).isDirectory(), `missing module ${moduleName}`);
    for (const endpoint of fs.readdirSync(moduleDir, { withFileTypes: true })) {
        if (!endpoint.isDirectory() || !endpointNames.has(endpoint.name)) continue;
        walk(path.join(moduleDir, endpoint.name), filename => {
            if (endpoint.name === "assets") {
                assert.ok(
                    !forbiddenPackagedExtensions.has(path.extname(filename).toLowerCase()),
                    `${path.relative(modulesDir, filename)} is a source/tool file that TSWoW would package`,
                );
            }
            if (!sourceExtensions.has(path.extname(filename).toLowerCase())) return;
            if (path.basename(filename) === "global.d.ts" || path.basename(filename) === "tsconfig.json") return;
            const source = fs.readFileSync(filename, "utf8");
            assert.doesNotMatch(
                source,
                absolutePath,
                `${path.relative(modulesDir, filename)} contains a machine-specific absolute path`,
            );
        });
    }
}

const retailDatascript = fs.readFileSync(
    path.join(modulesDir, "retail-talents", "datascripts", "datascripts.ts"),
    "utf8",
);
assert.match(retailDatascript, /path\.resolve\([\s\S]*generated_talents\.ts/);
assert.match(retailDatascript, /path\.resolve\([\s\S]*generated_companion_talents\.ts/);
assert.doesNotMatch(retailDatascript, /F:[\\/]tswowRoot/i);

const gemEntry = fs.readFileSync(
    path.join(modulesDir, "gem-abilities", "datascripts", "datascripts.ts"),
    "utf8",
);
assert.doesNotMatch(gemEntry, /login_credentials/);

const baseData = path.join(modulesDir, "base-building", "datascripts", "data", "PatchForBuildings");
assert.ok(fs.existsSync(path.join(baseData, "GameObjectDisplayInfo.dbc")));
assert.ok(fs.existsSync(path.join(baseData, "gameobject_template_trinity_atakke_edit.sql")));
const woodcutting = fs.readFileSync(
    path.join(modulesDir, "base-building", "datascripts", "woodcutting.ts"),
    "utf8",
);
assert.match(woodcutting, /requiredSkill:\s*1,\s*treeDisplay:\s*7459/);

assert.equal(fs.existsSync(path.join(modulesDir, "modern-models")), false);
const portabilityGuide = fs.readFileSync(path.join(modulesDir, "PORTABILITY.md"), "utf8");
assert.match(portabilityGuide, /Client\.Patches\s*=\s*\["all"\]/);
assert.match(portabilityGuide, /custom-npcbots/);
assert.match(portabilityGuide, /modern-models/);
assert.match(portabilityGuide, /build all/);

console.log(`module portability: ${portableModules.length} stock-TSWoW modules checked`);
