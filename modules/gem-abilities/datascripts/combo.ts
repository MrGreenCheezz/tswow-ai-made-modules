import { std } from "wow/wotlk";

// Kept local because the datascript tsconfig intentionally confines rootDir
// to this directory; livescripts share the same stable strings via shared/.
const COMBO_MODULE = "gem-abilities";
const COMBO_AURA_TAG = "spell/player-combo-sequence";
const COMBO_MAX_STACKS = 5;

/**
 * Visible source of truth for combo points on every class. Zero points means
 * that the aura is absent; its icon stack count displays values from 1 to 5.
 */
const combo = std.Spells.create(COMBO_MODULE, "player-combo-sequence");
combo.Name.enGB.set("Combo Sequence");
combo.Name.ruRU.set("Серия приёмов");
combo.Description.enGB.set(
    "A player-bound combat resource. Non-finisher ability casts add one point; finishing moves spend all points. Switching targets does not remove it.",
);
combo.Description.ruRU.set(
    "Привязанный к персонажу боевой ресурс. Незавершающие способности дают один приём, а завершающие расходуют все приёмы. Смена цели не сбрасывает серию.",
);
combo.AuraDescription.enGB.set(
    "The stack count is your current combo sequence (maximum 5).",
);
combo.AuraDescription.ruRU.set(
    "Количество эффектов — текущая серия приёмов персонажа (максимум 5).",
);
combo.Icon.setPath("ability_rogue_eviscerate");
combo.Duration.setSimple(-1);
combo.Stacks.set(COMBO_MAX_STACKS);
combo.DispelType.set("DISPEL_NONE");
combo.Attributes.CANT_BE_CANCELED.set(true);
combo.Attributes.NOT_STEALABLE.set(true);
combo.Attributes.PERSISTS_DEATH.set(true);
combo.Attributes.IS_NEGATIVE.set(false);
combo.Effects.addGet()
    .Type.APPLY_AURA.set()
    .Aura.DUMMY.set()
    .ImplicitTargetA.UNIT_CASTER.set();
combo.Tags.addUnique(COMBO_MODULE, COMBO_AURA_TAG);
