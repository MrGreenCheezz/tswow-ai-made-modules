/** Generates the 50 combat manuals, 30 profession tools and safe helper spells. */

import { std } from "wow/wotlk";
import * as fs from "fs";
import * as path from "path";
import {
    DS_ACTIVE_MANUAL_COUNT as COMPANION_ACTIVE_MANUAL_COUNT,
    DATASCRIPT_TRAINING_FEATURES as COMPANION_TRAINING_FEATURES,
    DS_TRAINING_KIND_MANUAL as TRAINING_KIND_MANUAL,
    DS_PAYLOAD_ENEMY_DAMAGE as TRAINING_PAYLOAD_ENEMY_DAMAGE,
    DS_PAYLOAD_INTERRUPT as TRAINING_PAYLOAD_INTERRUPT,
    DS_PAYLOAD_PASSIVE_CRIT as TRAINING_PAYLOAD_PASSIVE_CRIT,
    DS_PAYLOAD_PASSIVE_DAMAGE as TRAINING_PAYLOAD_PASSIVE_DAMAGE,
    DS_PAYLOAD_PASSIVE_DEFENSE as TRAINING_PAYLOAD_PASSIVE_DEFENSE,
    DS_PAYLOAD_PASSIVE_HASTE as TRAINING_PAYLOAD_PASSIVE_HASTE,
    DS_PAYLOAD_PASSIVE_HEALING as TRAINING_PAYLOAD_PASSIVE_HEALING,
    DS_PAYLOAD_PASSIVE_HEALTH as TRAINING_PAYLOAD_PASSIVE_HEALTH,
    DS_PAYLOAD_PASSIVE_SUPPORT as TRAINING_PAYLOAD_PASSIVE_SUPPORT,
    DS_PAYLOAD_PASSIVE_THREAT as TRAINING_PAYLOAD_PASSIVE_THREAT,
    DS_PAYLOAD_TAUNT as TRAINING_PAYLOAD_TAUNT,
    DatascriptTrainingFeatureDef as CompanionTrainingFeatureDef,
} from "./TrainingCatalog";

const MODULE = "custom-companions";
const GENERATED_ITEMS: { [id: number]: number } = {};
const GENERATED_SPELLS: { [id: number]: number } = {};

function createCombatHelper(definition: CompanionTrainingFeatureDef): number {
    const enemy = definition.payload == TRAINING_PAYLOAD_ENEMY_DAMAGE
        || definition.payload == TRAINING_PAYLOAD_INTERRUPT
        || definition.payload == TRAINING_PAYLOAD_TAUNT;
    const spell = std.Spells.create(
        MODULE,
        "training-helper-" + definition.key,
        enemy ? 12654 : 2061,
    );
    spell.Name.enGB.set(definition.name).Name.ruRU.set(definition.nameRu);
    spell.Description.enGB.set(definition.description)
        .Description.ruRU.set(definition.descriptionRu);
    spell.Icon.setPath(definition.icon);
    spell.Family.set(0);
    spell.Power.setMana(0, 0);
    spell.CastTime.setSimple(0, 0, 0);
    spell.Range.setSimple(0, 40);
    spell.Duration.setSimple(0);
    spell.Levels.set(0, 0, 0);
    spell.Attributes.clearAll();
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.Attributes.CANT_CRIT.set(true);
    spell.Attributes.IGNORE_BONUSES.set(true);
    spell.BonusData.DirectBonus.set(0);
    spell.BonusData.APBonus.set(0);
    spell.Effects.clearAll();
    if (definition.payload == TRAINING_PAYLOAD_ENEMY_DAMAGE) {
        spell.Effects.addGet().Type.SCHOOL_DAMAGE.set()
            .ImplicitTargetA.UNIT_TARGET_ENEMY.set().DamageBase.set(1);
    } else if (definition.payload == TRAINING_PAYLOAD_INTERRUPT) {
        spell.Effects.addGet().Type.INTERRUPT_CAST.set()
            .ImplicitTargetA.UNIT_TARGET_ENEMY.set();
    } else if (definition.payload == TRAINING_PAYLOAD_TAUNT) {
        spell.Effects.addGet().Type.ATTACK_ME.set()
            .ImplicitTargetA.UNIT_TARGET_ENEMY.set();
    } else {
        spell.Effects.addGet().Type.HEAL.set()
            .ImplicitTargetA.UNIT_TARGET_ALLY.set().HealBase.set(1);
    }
    spell.Tags.addUnique(MODULE, "spell/manual/" + definition.id);
    return Number(spell.ID);
}

function createPassiveHelper(definition: CompanionTrainingFeatureDef): number {
    const spell = std.Spells.create(
        MODULE,
        "training-helper-" + definition.key,
        1459,
    );
    spell.Name.enGB.set(definition.name).Name.ruRU.set(definition.nameRu);
    spell.Description.enGB.set(definition.description)
        .Description.ruRU.set(definition.descriptionRu);
    spell.Icon.setPath(definition.icon);
    spell.Family.set(0);
    spell.Power.setMana(0, 0);
    spell.CastTime.setSimple(0, 0, 0);
    spell.Range.setSimple(0, 0);
    spell.Duration.setSimple(-1);
    spell.Levels.set(0, 0, 0);
    spell.Attributes.clearAll();
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.Attributes.CANT_CRIT.set(true);
    spell.Attributes.IS_PASSIVE.set(true);
    spell.Attributes.IS_HIDDEN_IN_SPELLBOOK.set(true);
    spell.Attributes.IS_HIDDEN_FROM_LOG.set(true);
    spell.Attributes.CANT_BE_CANCELED.set(true);
    spell.Attributes.NOT_STEALABLE.set(true);
    spell.Attributes.HIDE_FROM_AURA_BAR.set(true);
    spell.Effects.clearAll();

    if (definition.payload == TRAINING_PAYLOAD_PASSIVE_DAMAGE) {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_DONE.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(127 as any).PercentBase.set(1);
    } else if (definition.payload == TRAINING_PAYLOAD_PASSIVE_HEALING) {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HEALING_DONE_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(126 as any).PercentBase.set(1);
    } else if (definition.payload == TRAINING_PAYLOAD_PASSIVE_HEALTH) {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_INCREASE_HEALTH_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(1);
    } else if (definition.payload == TRAINING_PAYLOAD_PASSIVE_DEFENSE) {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_DAMAGE_PERCENT_TAKEN.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(127 as any).PercentBase.set(-1);
    } else if (definition.payload == TRAINING_PAYLOAD_PASSIVE_HASTE) {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_MELEE_HASTE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(1);
    } else if (definition.payload == TRAINING_PAYLOAD_PASSIVE_CRIT) {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_WEAPON_CRIT_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(1);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_SPELL_CRIT_CHANCE.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(1);
    } else if (definition.payload == TRAINING_PAYLOAD_PASSIVE_SUPPORT) {
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_CASTING_SPEED_NOT_STACK.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(1);
        spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_HEALING_DONE_PERCENT.set()
            .ImplicitTargetA.UNIT_CASTER.set().Schools.set(126 as any).PercentBase.set(1);
    } else if (definition.payload == TRAINING_PAYLOAD_PASSIVE_THREAT) {
        const threat = spell.Effects.addGet();
        threat.Type.APPLY_AURA.set().Aura.MOD_THREAT.set()
            .ImplicitTargetA.UNIT_CASTER.set().PercentBase.set(1);
        threat.MiscValueA.set(127);
    } else {
        throw new Error("Unknown companion passive payload " + definition.payload);
    }
    spell.Tags.addUnique(MODULE, "spell/manual/" + definition.id);
    return Number(spell.ID);
}

function createTrainingItem(definition: CompanionTrainingFeatureDef): number {
    const item = std.Items.create(MODULE, "training-item-" + definition.key, 6948);
    item.Name.enGB.set(
        definition.kind == TRAINING_KIND_MANUAL
            ? "Companion Manual: " + definition.name
            : "Profession Tool: " + definition.name,
    );
    item.Name.ruRU.set(
        definition.kind == TRAINING_KIND_MANUAL
            ? "Руководство спутника: " + definition.nameRu
            : "Профессиональный инструмент: " + definition.nameRu,
    );
    item.Description.enGB.set(definition.description);
    item.Description.ruRU.set(definition.descriptionRu);
    item.Class.OTHER_MISC.set();
    item.Quality.BLUE.set();
    item.Bonding.NO_BOUNDS.set();
    item.MaxCount.set(0);
    item.MaxStack.set(20);
    item.Price.setAsGold(0, 0, 1);
    item.Flags.clearAll();
    item.Spells.clearAll();
    item.DisplayInfo.setSimpleIcon(
        MODULE,
        "training-item-" + definition.key + "-icon",
        definition.icon,
    );
    item.Tags.addUnique(
        MODULE,
        definition.kind == TRAINING_KIND_MANUAL
            ? "item/manual/" + definition.id
            : "item/tool/" + definition.id,
    );
    return Number(item.ID);
}

for (let i = 0; i < COMPANION_TRAINING_FEATURES.length; i++) {
    const definition = COMPANION_TRAINING_FEATURES[i];
    GENERATED_ITEMS[definition.id] = createTrainingItem(definition);
    GENERATED_SPELLS[definition.id] = definition.kind != TRAINING_KIND_MANUAL
        ? 0
        : definition.id <= COMPANION_ACTIVE_MANUAL_COUNT
            ? createCombatHelper(definition)
            : createPassiveHelper(definition);
}

const ids = Object.keys(GENERATED_ITEMS).map(Number).sort((a, b) => a - b);
const itemLines = ids.map(id => `    [${id}]: ${GENERATED_ITEMS[id]},`);
const spellLines = ids.map(id => `    [${id}]: ${GENERATED_SPELLS[id]},`);
const output =
    "/** AUTO-GENERATED by custom-companions datascripts. Do not edit. */\n"
    + "export const COMPANION_TRAINING_CATALOG_VERSION = 1;\n"
    + "export const COMPANION_TRAINING_CATALOG_READY = true;\n"
    + `export const COMPANION_TRAINING_CATALOG_COUNT = ${ids.length};\n`
    + "export const GEN_COMPANION_TRAINING_ITEMS: { [id: number]: number } = {\n"
    + itemLines.join("\n") + "\n};\n"
    + "export const GEN_COMPANION_TRAINING_SPELLS: { [id: number]: number } = {\n"
    + spellLines.join("\n") + "\n};\n";

const outputPath = path.resolve(
    // Datascripts execute from datascripts/build, so two parents reach the
    // owning module root (the same convention used by gem-abilities).
    __dirname, "..", "..", "livescripts", "generated_companion_training.ts",
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, "utf8");
