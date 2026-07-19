const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require(path.join(__dirname, "../../../node_modules/typescript"));

function loadTsModule(file, globals = {}, moduleRequire = require) {
    const source = fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
    }).outputText;
    const module = { exports: {} };
    const names = ["exports", "module", "require", ...Object.keys(globals)];
    const values = [module.exports, module, moduleRequire, ...Object.values(globals)];
    new Function(...names, output)(...values);
    return module.exports;
}

const moduleRoot = path.join(__dirname, "..");
const shared = loadTsModule(path.join(moduleRoot, "shared/ComboSequence.ts"));
assert.strictEqual(shared.gainComboPoint(0), 1);
assert.strictEqual(shared.gainComboPoint(5), 5);
assert.strictEqual(shared.restoreComboPoints(1, 3), 4);
assert.strictEqual(shared.restoreComboPoints(4, 3), 5);

const SpellCastResult = {
    FAILED_IN_PROGRESS: 105,
    FAILED_NO_COMBO_POINTS: 78,
};
const SpellMissInfo = { NONE: 0, MISS: 1, BLOCK: 5, IMMUNE: 7 };

const combo = loadTsModule(
    path.join(moduleRoot, "livescripts/combo.ts"),
    {
        UTAG(mod, tag) {
            assert.strictEqual(mod, shared.COMBO_MODULE);
            assert.strictEqual(tag, shared.COMBO_AURA_TAG);
            return 900;
        },
        TAG(mod, tag) {
            assert.strictEqual(mod, shared.COMBO_MODULE);
            assert.strictEqual(tag, shared.COMBO_FINISHER_TAG);
            return [200];
        },
        SpellCastResult,
        SpellMissInfo,
    },
    requestPath => {
        if (requestPath === "../shared/ComboSequence") return shared;
        if (requestPath === "./grant") {
            return {
                isGrantedAbility(player, spellId) {
                    return player.granted.has(spellId);
                },
            };
        }
        return require(requestPath);
    },
);

function makeAura(owner, stacks) {
    return {
        stacks,
        GetStackAmount() { return this.stacks; },
        SetStackAmount(value) { this.stacks = value; },
        Remove() { owner.aura = undefined; },
    };
}

let nextGuid = 1;
function makeGuid(type = 4) {
    const counter = nextGuid++;
    return {
        GetType() { return type; },
        GetCounter() { return counter; },
    };
}

function makeUnit(type = 3) {
    const guid = makeGuid(type);
    return {
        ToUnit() { return this; },
        GetGUID() { return guid; },
    };
}

function makePlayer(granted = [100, 101, 200]) {
    const guid = makeGuid();
    const player = {
        granted: new Set(granted),
        aura: undefined,
        selection: undefined,
        objects: new Map(),
        nativePoints: 0,
        nativeTarget: undefined,
        dead: false,
        clearCalls: 0,
        timers: new Map(),
        ToPlayer() { return this; },
        ToUnit() { return this; },
        GetGUID() { return guid; },
        IsDead() { return this.dead; },
        GetAura(id) { return id === 900 ? this.aura : undefined; },
        AddAura(id, target) {
            assert.strictEqual(id, 900);
            assert.strictEqual(target, this);
            this.aura = makeAura(this, 1);
            return this.aura;
        },
        GetObject(key, initial) {
            if (!this.objects.has(key)) this.objects.set(key, initial);
            return this.objects.get(key);
        },
        ClearComboPoints() {
            this.clearCalls++;
            this.nativePoints = 0;
            this.nativeTarget = undefined;
        },
        AddComboPoints(target, count) {
            this.nativeTarget = target;
            this.nativePoints = count;
        },
        GetComboPoints() { return this.nativePoints; },
        GetSelection() { return this.selection; },
        AddNamedTimer(name, delay, callback) {
            this.timers.set(name, { delay, callback });
        },
    };
    return player;
}

function makeSpell(player, id, autoRepeat = false, target = player) {
    return {
        GetCaster() { return player; },
        GetEntry() { return id; },
        IsAutoRepeat() { return autoRepeat; },
        GetTarget() { return target; },
    };
}

function mutableResult() {
    return {
        value: undefined,
        set(value) { this.value = value; },
    };
}

// Every completed, granted non-finisher cast adds exactly one point and caps at five.
const builderPlayer = makePlayer();
const builder = makeSpell(builderPlayer, 100);
for (let i = 0; i < 8; i++) combo.handleComboAfterCast(builder);
assert.strictEqual(combo.comboAmount(builderPlayer), 5);
combo.handleComboAfterCast(makeSpell(builderPlayer, 101, true));
assert.strictEqual(combo.comboAmount(builderPlayer), 5);
combo.handleComboAfterCast(makeSpell(builderPlayer, 999));
assert.strictEqual(combo.comboAmount(builderPlayer), 5);

// A finisher cannot start at zero points.
const zeroPlayer = makePlayer();
const finisherAtZero = makeSpell(zeroPlayer, 200);
const noPoints = mutableResult();
combo.handleComboCheckCast(finisherAtZero, noPoints);
assert.strictEqual(noPoints.value, SpellCastResult.FAILED_NO_COMBO_POINTS);

// A miss returns points only after the whole hit batch has finished.
const missPlayer = makePlayer();
combo.setComboAmount(missPlayer, 3);
const missedFinisher = makeSpell(missPlayer, 200);
combo.handleComboCast(missedFinisher);
assert.strictEqual(combo.comboAmount(missPlayer), 0);
assert.strictEqual(missPlayer.nativePoints, 3);
assert.strictEqual(missPlayer.nativeTarget, missPlayer);
combo.handleComboBeforeHit(missedFinisher, SpellMissInfo.MISS);
assert.strictEqual(combo.comboAmount(missPlayer), 0);
assert.strictEqual(missPlayer.nativePoints, 3);
combo.handleComboAfterHit(missedFinisher);
const missResolution = missPlayer.timers.get("gem-abilities:combo-finisher-fallback");
assert.strictEqual(missResolution.delay, 0);
missResolution.callback(missPlayer, {});
assert.strictEqual(combo.comboAmount(missPlayer), 3);
assert.strictEqual(missPlayer.nativePoints, 3);
assert.strictEqual(missPlayer.nativeTarget, missPlayer);

// A successful effect spends the reservation only after all effects/targets.
const hitPlayer = makePlayer();
combo.setComboAmount(hitPlayer, 5);
const hitFinisher = makeSpell(hitPlayer, 200);
combo.handleComboCast(hitFinisher);
const spentFallback = hitPlayer.timers.get("gem-abilities:combo-finisher-fallback");
combo.handleComboAfterCast(makeSpell(hitPlayer, 100));
assert.strictEqual(combo.comboAmount(hitPlayer), 1);
assert.strictEqual(hitPlayer.nativePoints, 5);
hitPlayer.ClearComboPoints(); // external core cleanup while projectile is pending
combo.syncComboMirror(hitPlayer);
assert.strictEqual(hitPlayer.nativePoints, 5);
assert.strictEqual(hitPlayer.nativeTarget, hitPlayer);
combo.handleComboBeforeHit(hitFinisher, SpellMissInfo.NONE);
combo.handleComboAfterHit(hitFinisher);
assert.strictEqual(hitPlayer.nativePoints, 5);
const hitResolution = hitPlayer.timers.get("gem-abilities:combo-finisher-fallback");
assert.strictEqual(hitResolution.delay, 0);
hitResolution.callback(hitPlayer, {});
assert.strictEqual(combo.comboAmount(hitPlayer), 1);
assert.strictEqual(hitPlayer.nativePoints, 1);
hitPlayer.nativePoints = 4; // unrelated native resource acquired after impact
spentFallback.callback(hitPlayer, {});
assert.strictEqual(hitPlayer.nativePoints, 4);

// One landed target wins over misses in the same multi-target/effect batch.
const mixedPlayer = makePlayer();
combo.setComboAmount(mixedPlayer, 4);
const mixedFinisher = makeSpell(mixedPlayer, 200);
combo.handleComboCast(mixedFinisher);
combo.handleComboBeforeHit(mixedFinisher, SpellMissInfo.IMMUNE);
combo.handleComboAfterHit(mixedFinisher);
combo.handleComboBeforeHit(mixedFinisher, SpellMissInfo.NONE);
combo.handleComboAfterHit(mixedFinisher);
const mixedResolution = mixedPlayer.timers.get("gem-abilities:combo-finisher-fallback");
mixedResolution.callback(mixedPlayer, {});
assert.strictEqual(combo.comboAmount(mixedPlayer), 0);
assert.strictEqual(mixedPlayer.nativePoints, 0);

// Cancellation and the missing-target fallback both return reserved points.
const cancelPlayer = makePlayer();
combo.setComboAmount(cancelPlayer, 2);
const cancelled = makeSpell(cancelPlayer, 200);
combo.handleComboCast(cancelled);
combo.handleComboCancel(cancelled);
assert.strictEqual(combo.comboAmount(cancelPlayer), 2);
assert.strictEqual(cancelPlayer.nativePoints, 2);

combo.handleComboCast(cancelled);
const fallback = cancelPlayer.timers.get("gem-abilities:combo-finisher-fallback");
assert(fallback);
assert.strictEqual(fallback.delay, 5000);
fallback.callback(cancelPlayer, {});
assert.strictEqual(combo.comboAmount(cancelPlayer), 2);
assert.strictEqual(cancelPlayer.nativePoints, 2);

// The compatibility mirror follows target changes without moving the aura.
const targetPlayer = makePlayer();
const targetA = makeUnit();
const targetB = makeUnit();
combo.setComboAmount(targetPlayer, 4);
targetPlayer.selection = targetA;
combo.syncComboMirror(targetPlayer);
assert.strictEqual(targetPlayer.nativeTarget, targetA);
assert.strictEqual(combo.comboAmount(targetPlayer), 4);
const synchronizedClears = targetPlayer.clearCalls;
combo.syncComboMirror(targetPlayer);
assert.strictEqual(targetPlayer.clearCalls, synchronizedClears);
combo.syncComboMirror(targetPlayer, targetB, true);
assert.strictEqual(targetPlayer.nativeTarget, targetB);
assert.strictEqual(combo.comboAmount(targetPlayer), 4);

// A lost mirror stays absent while dead and is rebuilt after resurrection.
targetPlayer.ClearComboPoints();
targetPlayer.dead = true;
combo.syncComboMirror(targetPlayer);
assert.strictEqual(targetPlayer.nativePoints, 0);
targetPlayer.dead = false;
combo.syncComboMirror(targetPlayer);
assert.strictEqual(targetPlayer.nativePoints, 4);
assert.strictEqual(targetPlayer.nativeTarget, targetA);

// Native ADD_COMBO_POINTS is prevented only for a currently granted gem cast.
const effectPlayer = makePlayer();
const prevented = mutableResult();
combo.handleComboEffect(makeSpell(effectPlayer, 100), prevented, { GetType() { return 80; } });
assert.strictEqual(prevented.value, true);
const unrelated = mutableResult();
combo.handleComboEffect(makeSpell(effectPlayer, 999), unrelated, { GetType() { return 80; } });
assert.strictEqual(unrelated.value, undefined);

const gemsSource = fs.readFileSync(path.join(moduleRoot, "datascripts/gems.ts"), "utf8");
const comboSource = fs.readFileSync(path.join(moduleRoot, "livescripts/combo.ts"), "utf8");
const auraSource = fs.readFileSync(path.join(moduleRoot, "datascripts/combo.ts"), "utf8");
assert.match(gemsSource, /Attributes\.REQUIRES_STEALTH\.set\(false\)/);
assert.match(gemsSource, /const EFF_ATTACK_ME = 114;/);
assert.doesNotMatch(gemsSource, /Attributes\.REQ_COMBO_POINTS\.set\(false\)/);
assert.doesNotMatch(gemsSource, /spell\.Effects\.get\(i\)\.clear\(\)/);
assert.match(comboSource, /preventDefault\.set\(true\)/);
assert.match(comboSource, /player\.AddComboPoints\(target, points as int8\)/);
assert.match(comboSource, /events\.Spell\.OnAfterHit\(handleComboAfterHit\)/);
assert.match(comboSource, /UTAG\("gem-abilities", "spell\/player-combo-sequence"\)/);
assert.match(comboSource, /TAG\("gem-abilities", "spell\/player-combo-finisher"\)/);
assert.doesNotMatch(comboSource, /UTAG\(COMBO_MODULE|TAG\(COMBO_MODULE/);
assert.doesNotMatch(comboSource, /GetComboTarget\(/);
assert.doesNotMatch(auraSource, /IS_HIDDEN_IN_SPELLBOOK\.set\(true\)/);

console.log("player-bound combo sequence, finisher scaling bridge and miss recovery: ok");
