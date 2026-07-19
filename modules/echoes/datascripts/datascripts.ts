import { std } from "wow/wotlk";
import { ECHOES, EchoEffectDef } from "./shared/EchoDefs";
import { COLLECTION_ECHOES } from "./shared/CollectionEchoDefs";

const MODULE = "echoes";

function addEffect(spell: any, definition: EchoEffectDef): void {
    const effect = spell.Effects.addGet();
    effect.Type.APPLY_AURA.set();
    (effect.Aura as any)[definition.aura].set();
    effect.ImplicitTargetA.UNIT_CASTER.set();
    effect.PointsDieSides.set(1);
    // PointsBase is a shifted TSWoW cell: with one die side, set() accepts the
    // effective value and writes the source-compatible raw value minus one.
    effect.PointsBase.set(definition.pointsBase);
    effect.PointsPerLevel.set(definition.pointsPerLevel);
    effect.AuraPeriod.set(definition.period);
    effect.MiscValueA.set(definition.miscA);
    effect.MiscValueB.set(definition.miscB);
    effect.TriggerSpell.set(0);
}

for (const definition of ECHOES) {
    const spell = std.Spells.create(MODULE, definition.key);
    spell.Name.enGB.set(definition.name);
    spell.Name.ruRU.set(definition.nameRu);
    spell.Description.enGB.set(definition.description);
    spell.Description.ruRU.set(definition.descriptionRu);
    spell.AuraDescription.enGB.set(definition.description);
    spell.AuraDescription.ruRU.set(definition.descriptionRu);
    spell.Icon.setPath(definition.icon);
    spell.Duration.setSimple(-1);
    spell.Stacks.set(definition.maxStack == 1 ? 0 : definition.maxStack);
    spell.DispelType.set("DISPEL_NONE");
    spell.Attributes.clearAll();
    spell.Attributes.IS_PASSIVE.set(true);
    spell.Attributes.IS_HIDDEN_IN_SPELLBOOK.set(true);
    spell.Attributes.IS_HIDDEN_FROM_LOG.set(true);
    spell.Attributes.CANT_BE_CANCELED.set(true);
    spell.Attributes.NO_THREAT.set(true);
    spell.Attributes.NOT_STEALABLE.set(true);
    spell.Attributes.PERSISTS_DEATH.set(true);
    spell.Attributes.HIDE_FROM_AURA_BAR.set(true);
    spell.SchoolMask.clearAll();
    spell.Effects.clearAll();
    for (const effect of definition.effects) addEffect(spell, effect);
    spell.Tags.addUnique(MODULE, "spell/" + definition.key);
}

const choiceSpell = std.Spells.create(MODULE, "echo-choice-use");
choiceSpell.Name.enGB.set("Invoke an Echo Choice");
choiceSpell.Name.ruRU.set("Призвать выбор Эхо");
choiceSpell.Description.enGB.set("Offers one choice from up to three Echoes.");
choiceSpell.Description.ruRU.set("Предлагает выбрать одно Эхо из трёх доступных!");
choiceSpell.Icon.setPath("Interface\\Icons\\INV_Enchant_AbyssCrystal");
choiceSpell.Attributes.clearAll();
choiceSpell.TargetType.clearAll();
choiceSpell.CastTime.setSimple(0, 0, 0);
choiceSpell.Range.setSimple(0, 0);
choiceSpell.Effects.clearAll();
choiceSpell.Effects.addGet().Type.SCRIPT_EFFECT.set().ImplicitTargetA.UNIT_CASTER.set();
choiceSpell.Tags.addUnique(MODULE, "spell/echo-choice-use");

const choiceItem = std.Items.create(MODULE, "echo-choice-item", 6948);
choiceItem.Name.enGB.set("Echo Crystal");
choiceItem.Name.ruRU.set("Кристалл Эхо");
choiceItem.Description.enGB.set("Use: offers one choice from up to three Echoes. Finish the current choice before using another crystal.");
choiceItem.Description.ruRU.set("Использование: предлагает выбрать одно Эхо из трёх доступных. Завершите текущий выбор перед использованием следующего кристалла.");
choiceItem.Class.OTHER_MISC.set();
choiceItem.Quality.BLUE.set();
choiceItem.Bonding.BINDS_ON_USE.set();
choiceItem.MaxCount.set(0);
choiceItem.MaxStack.set(20);
choiceItem.Price.setAsGold(0, 5, 1);
choiceItem.Flags.clearAll();
choiceItem.Spells.clearAll();
choiceItem.DisplayInfo.setSimpleIcon(MODULE, "echo-choice-item-icon", "Interface\\Icons\\INV_Enchant_AbyssCrystal");
choiceItem.Spells.addMod(slot => {
    slot.Spell.set(choiceSpell.ID);
    slot.Trigger.set(0);
    slot.Charges.set(1, "DELETE_ITEM");
    slot.Cooldown.set(1000);
    slot.CategoryCooldown.set(-1);
});
choiceItem.Tags.addUnique(MODULE, "item/echo-choice");

const resetSpell = std.Spells.create(MODULE, "echo-reset-use");
resetSpell.Name.enGB.set("Erase All Echoes");
resetSpell.Name.ruRU.set("Стереть все Эхо");
resetSpell.Description.enGB.set("Removes every Echo rank obtained from card choices and discards the unfinished choice. Does not affect the boss-book collection.");
resetSpell.Description.ruRU.set("Удаляет все ранги Эхо, полученные через карточки, и отменяет незавершённый выбор. Не затрагивает коллекцию из книг с боссов.");
resetSpell.Icon.setPath("Interface\\Icons\\INV_Enchant_VoidCrystal");
resetSpell.Attributes.clearAll();
resetSpell.TargetType.clearAll();
resetSpell.CastTime.setSimple(0, 0, 0);
resetSpell.Range.setSimple(0, 0);
resetSpell.Effects.clearAll();
resetSpell.Effects.addGet().Type.SCRIPT_EFFECT.set().ImplicitTargetA.UNIT_CASTER.set();
resetSpell.Tags.addUnique(MODULE, "spell/echo-reset-use");

const resetItem = std.Items.create(MODULE, "echo-reset-item", 6948);
resetItem.Name.enGB.set("Crystal of Oblivion");
resetItem.Name.ruRU.set("Кристалл забвения");
resetItem.Description.enGB.set("Use: permanently removes all card-choice Echo ranks and discards the unfinished choice. Does not affect the boss-book collection.");
resetItem.Description.ruRU.set("Использование: навсегда удаляет все ранги карточных Эхо и отменяет незавершённый выбор. Не затрагивает коллекцию из книг с боссов.");
resetItem.Class.OTHER_MISC.set();
resetItem.Quality.PURPLE.set();
resetItem.Bonding.BINDS_ON_USE.set();
resetItem.MaxCount.set(0);
resetItem.MaxStack.set(20);
resetItem.Price.setAsGold(0, 10, 1);
resetItem.Flags.clearAll();
resetItem.Spells.clearAll();
resetItem.DisplayInfo.setSimpleIcon(MODULE, "echo-reset-item-icon", "Interface\\Icons\\INV_Enchant_VoidCrystal");
resetItem.Spells.addMod(slot => {
    slot.Spell.set(resetSpell.ID);
    slot.Trigger.set(0);
    slot.Charges.set(1, "DELETE_ITEM");
    slot.Cooldown.set(1000);
    slot.CategoryCooldown.set(-1);
});
resetItem.Tags.addUnique(MODULE, "item/echo-reset");

const collectionSlotItem = std.Items.create(MODULE, "echo-collection-slot", 6948);
collectionSlotItem.Name.enGB.set("Echo Slot Crystal");
collectionSlotItem.Name.ruRU.set("Кристалл ячейки эха");
collectionSlotItem.Description.enGB.set("Bring these to the Echo Merchant to unlock collection aura slots. The first additional slot costs 1 crystal; each later slot costs twice as many, up to 128.");
collectionSlotItem.Description.ruRU.set("Отнесите эти кристаллы торговцу эха, чтобы разблокировать ячейки для аур коллекции. Первая дополнительная ячейка стоит 1 кристалл, а каждая следующая — вдвое больше, вплоть до 128.");
collectionSlotItem.Class.OTHER_MISC.set();
collectionSlotItem.Quality.PURPLE.set();
collectionSlotItem.Bonding.BINDS_ON_PICKUP.set();
collectionSlotItem.MaxCount.set(0);
collectionSlotItem.MaxStack.set(128);
collectionSlotItem.Price.setAsGold(0, 30000, 1);
collectionSlotItem.Flags.clearAll();
collectionSlotItem.Spells.clearAll();
collectionSlotItem.DisplayInfo.setSimpleIcon(MODULE, "echo-collection-slot-icon", "Interface\\Icons\\INV_Enchant_EssenceMysticalLarge");
collectionSlotItem.Tags.addUnique(MODULE, "item/collection-slot-expand");

const echoVendor = std.CreatureTemplates.create(MODULE, "echo-vendor", 5193);
echoVendor.Name.enGB.set("Echo Merchant");
echoVendor.Name.ruRU.set("Торговец Эхо");
echoVendor.Subname.enGB.set("Echo Crystals");
echoVendor.Subname.ruRU.set("Кристаллы Эхо");
echoVendor.NPCFlags.clearAll();
echoVendor.NPCFlags.VENDOR.set(true);
echoVendor.NPCFlags.GOSSIP.set(true);
echoVendor.UnitFlags.clearAll();
echoVendor.FlagsExtra.clearAll();
echoVendor.FlagsExtra.NO_XP.set(true);
echoVendor.row.lootid.set(0);
echoVendor.row.pickpocketloot.set(0);
echoVendor.row.skinloot.set(0);
echoVendor.FactionTemplate.set(35);
echoVendor.AIName.set("");
echoVendor.row.ScriptName.set("");
echoVendor.Vendor.forEach(item => item.delete());
echoVendor.Vendor.add(choiceItem.ID);
echoVendor.Vendor.add(resetItem.ID);
echoVendor.Vendor.add(collectionSlotItem.ID);
echoVendor.Tags.addUnique(MODULE, "npc/echo-vendor");

function createEchoMinion(
    key: string,
    parent: number,
    nameEn: string,
    nameRu: string,
    tag: string,
): any {
    const creature = std.CreatureTemplates.create(MODULE, key, parent);
    creature.Name.enGB.set(nameEn);
    creature.Name.ruRU.set(nameRu);
    creature.Subname.enGB.set("Echo Companion");
    creature.Subname.ruRU.set("Спутник Эхо");
    creature.NPCFlags.clearAll();
    creature.UnitFlags.clearAll();
    creature.Difficulty.Heroic5Man.set(0);
    creature.Difficulty.Heroic10Man.set(0);
    creature.Difficulty.Heroic25Man.set(0);
    creature.FlagsExtra.clearAll();
    creature.FlagsExtra.NO_XP.set(true);
    creature.row.lootid.set(0);
    creature.row.pickpocketloot.set(0);
    creature.row.skinloot.set(0);
    creature.FactionTemplate.set(35);
    creature.AIName.set("");
    creature.row.ScriptName.set("");
    creature.Level.set(1, 1);
    creature.Stats.set(1, 1, 1, 0, 1);
    creature.Tags.addUnique(MODULE, tag);
    return creature;
}

createEchoMinion(
    "collection-lich-servant",
    26125,
    "Servant of the Lich King",
    "Слуга Короля-лича",
    "npc/collection-lich-servant",
);

createEchoMinion(
    "collection-sanctum-sentry",
    34014,
    "Sanctum Sentry",
    "Страж святилища",
    "npc/collection-sanctum-sentry",
);

const netherPortalCreature = createEchoMinion(
    "collection-nether-portal",
    24961,
    "Nether Lord's Portal",
    "Портал владыки Пустоты",
    "npc/collection-nether-portal",
);
netherPortalCreature.UnitFlags.set(["IMMUNE_TO_PC", "IMMUNE_TO_NPC", "NOT_SELECTABLE"]);
netherPortalCreature.row.unit_flags2.set(0);

function configureTriggeredAura(spell: any, durationMs: number, maxStacks: number = 0): void {
    spell.Family.set(0);
    spell.Power.setMana(0, 0);
    spell.CastTime.setSimple(0, 0, 0);
    spell.Range.setSimple(0, 100);
    spell.Duration.setSimple(durationMs);
    spell.Stacks.set(maxStacks);
    spell.DispelType.set("DISPEL_NONE");
    spell.Attributes.clearAll();
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.Attributes.CANT_CRIT.set(true);
    spell.Attributes.NOT_STEALABLE.set(true);
    spell.SchoolMask.clearAll();
    spell.Effects.clearAll();
}

// Triggered casts still play the caster kits from SpellVisual on the client.
// Clone the visual before clearing only those kits so shared native visuals and
// the proc's missile, impact, and area effects remain intact.
function suppressPassiveProcAnimation(spell: any): void {
    if (spell.Visual.get() == 0) return;
    spell.Visual.getRefCopy()
        .PrecastKit.set(0)
        .CastKit.set(0);
}

function hideInternalAura(spell: any): void {
    spell.Attributes.HIDE_FROM_AURA_BAR.set(true);
    spell.Attributes.IS_HIDDEN_IN_SPELLBOOK.set(true);
    spell.Attributes.IS_HIDDEN_FROM_LOG.set(true);
    spell.Attributes.CANT_BE_CANCELED.set(true);
}

function createDummyAura(
    key: string,
    name: string,
    nameRu: string,
    icon: string,
    durationMs: number,
    maxStacks: number = 0,
    periodMs: number = 0,
    enemy: boolean = false,
    hidden: boolean = false,
): any {
    const spell = std.Spells.create(MODULE, key, 588);
    spell.Name.enGB.set(name);
    spell.Name.ruRU.set(nameRu);
    spell.AuraDescription.enGB.set(name);
    spell.AuraDescription.ruRU.set(nameRu);
    spell.Icon.setPath(icon);
    configureTriggeredAura(spell, durationMs, maxStacks);
    if (hidden) hideInternalAura(spell);
    if (enemy) spell.Attributes.IS_NEGATIVE.set(true);
    const aura = spell.Effects.addGet();
    aura.Type.APPLY_AURA.set();
    if (periodMs > 0) aura.Aura.PERIODIC_DUMMY.set();
    else aura.Aura.DUMMY.set();
    if (enemy) aura.ImplicitTargetA.UNIT_TARGET_ENEMY.set();
    else aura.ImplicitTargetA.UNIT_CASTER.set();
    aura.AuraPeriod.set(periodMs);
    spell.Tags.addUnique(MODULE, "spell/" + key);
    return spell;
}

function createPeriodicDamageAura(
    key: string,
    name: string,
    nameRu: string,
    icon: string,
    durationMs: number,
    maxStacks: number,
    base: number,
    spellPower: number,
    attackPower: number,
    periodMs: number,
    schools: string[] = ["FIRE"],
): any {
    const spell = std.Spells.create(MODULE, key, 12654);
    spell.Name.enGB.set(name);
    spell.Name.ruRU.set(nameRu);
    spell.AuraDescription.enGB.set(name);
    spell.AuraDescription.ruRU.set(nameRu);
    spell.Icon.setPath(icon);
    configureTriggeredAura(spell, durationMs, maxStacks);
    spell.Attributes.IS_NEGATIVE.set(true);
    spell.SchoolMask.clearAll();
    for (let i = 0; i < schools.length; i++) (spell.SchoolMask as any)[schools[i]].set(true);
    spell.BonusData.DotBonus.set(spellPower);
    spell.BonusData.APDotBonus.set(attackPower);
    const aura = spell.Effects.addGet();
    aura.Type.APPLY_AURA.set();
    aura.Aura.PERIODIC_DAMAGE.set();
    aura.ImplicitTargetA.UNIT_TARGET_ENEMY.set();
    aura.PointsDieSides.set(1);
    aura.PointsBase.set(base);
    aura.AuraPeriod.set(periodMs);
    spell.Tags.addUnique(MODULE, "spell/" + key);
    return spell;
}

function createDamageSpell(
    key: string,
    name: string,
    nameRu: string,
    icon: string,
    schools: string[],
    base: number,
    spellPower: number,
    attackPower: number,
    passivePlayerCast: boolean = false,
): any {
    const spell = std.Spells.create(MODULE, key, 12654);
    spell.Name.enGB.set(name);
    spell.Name.ruRU.set(nameRu);
    spell.Description.enGB.set(name);
    spell.Description.ruRU.set(nameRu);
    spell.Icon.setPath(icon);
    spell.Family.set(0);
    spell.Power.setMana(0, 0);
    spell.CastTime.setSimple(0, 0, 0);
    spell.Range.setSimple(0, 100);
    spell.Duration.setSimple(0);
    spell.Levels.set(0, 0, 0);
    spell.Attributes.clearAll();
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.Attributes.CANT_CRIT.set(true);
    spell.SchoolMask.clearAll();
    for (let i = 0; i < schools.length; i++) (spell.SchoolMask as any)[schools[i]].set(true);
    spell.BonusData.DirectBonus.set(spellPower);
    spell.BonusData.APBonus.set(attackPower);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.SCHOOL_DAMAGE.set()
        .ImplicitTargetA.UNIT_TARGET_ENEMY.set().DamageBase.set(base);
    // Triggered helpers inherit a generic visual from their native parent.
    // Assign deliberate client-native visuals so every collection proc is
    // readable and distinct in combat.
    if (key == "collection-blade-tempest-hit") {
        spell.Visual.set(10384);
        spell.Speed.set(30);
    } else if (key == "collection-deep-breath-hit") spell.Visual.set(8256);
    else if (key == "collection-lich-servant-hit") {
        spell.Visual.set(10755);
        spell.Speed.set(24);
    } else if (key == "collection-sanctum-sentry-hit") spell.Visual.set(9882);
    else if (key == "collection-frost-breath-hit") spell.Visual.set(7862);
    else if (key == "collection-frostfire-shatter-hit") spell.Visual.set(11612);
    else if (key == "collection-mutagenic-hit") spell.Visual.set(10381);
    else if (key == "collection-blighted-sky-hit") spell.Visual.set(7732);
    else if (key == "collection-brittle-shatter-hit") spell.Visual.set(963);
    else if (key == "collection-webbing-hit") spell.Visual.set(6596);
    else if (key == "collection-sanctum-cyclone-hit") spell.Visual.set(143);
    else if (key == "collection-falling-star-hit") spell.Visual.set(1264);
    else if (key == "collection-big-bang-hit") spell.Visual.set(965);
    else if (key == "collection-plaguebringer-curse-hit") spell.Visual.set(11624);
    else if (key == "collection-dark-lance-hit") {
        spell.Visual.set(64);
        spell.Speed.set(20);
    } else if (key == "collection-deathwhisper-pulse") spell.Visual.set(8069);
    else if (key == "collection-defile-hit") spell.Visual.set(8069);
    else if (key == "collection-demonic-cleave") spell.Visual.set(7684);
    else if (key == "collection-scorched-path-hit") spell.Visual.set(143);
    else if (key == "collection-sticky-slime-hit") spell.Visual.set(6596);
    else if (key == "collection-poison-slime-hit") spell.Visual.set(6596);
    else if (key == "collection-static-overflow-hit") spell.Visual.set(36);
    else if (key == "collection-stone-shatter-hit") {
        spell.Visual.set(12594);
        spell.Speed.set(60);
    } else if (key == "collection-storm-conductor-hit") spell.Visual.set(36);
    else if (key == "collection-equilibrium-shadow-hit") spell.Visual.set(7732);
    else if (key == "collection-equilibrium-holy-hit") spell.Visual.set(3643);
    else if (key == "collection-widows-volley-hit") spell.Visual.set(6596);
    if (passivePlayerCast) suppressPassiveProcAnimation(spell);
    spell.Tags.addUnique(MODULE, "spell/" + key);
    return spell;
}

function createAreaDamageSpell(
    key: string,
    name: string,
    nameRu: string,
    icon: string,
    schools: string[],
    base: number,
    spellPower: number,
    attackPower: number,
    radius: number,
    passivePlayerCast: boolean = false,
): any {
    const spell = createDamageSpell(
        key, name, nameRu, icon, schools, base, spellPower, attackPower,
        passivePlayerCast,
    );
    const hit = spell.Effects.get(0);
    hit.ImplicitTargetA.UNIT_DEST_AREA_ENEMY.set();
    hit.Radius.setSimple(radius);
    return spell;
}

function createAreaVisualSpell(
    key: string,
    name: string,
    nameRu: string,
    icon: string,
    visual: number,
): any {
    const spell = std.Spells.create(MODULE, key, 12654);
    spell.Name.enGB.set(name);
    spell.Name.ruRU.set(nameRu);
    spell.Description.enGB.set("Visual marker for an Echo area.");
    spell.Description.ruRU.set("Визуальная отметка области Эхо.");
    spell.Icon.setPath(icon);
    configureTriggeredAura(spell, 0);
    spell.TargetType.clearAll();
    spell.TargetType.DEST_LOCATION.set(true);
    spell.Visual.set(visual);
    spell.Speed.set(0);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.DUMMY.set().ImplicitTargetA.DEST_DEST.set();
    suppressPassiveProcAnimation(spell);
    spell.Tags.addUnique(MODULE, "spell/" + key);
    return spell;
}

// Collection controller auras deliberately have their own IDs. In particular,
// this prevents collection deactivation from removing the old card-system copy
// of Overwhelming Restoration.
for (let definitionIndex = 0; definitionIndex < COLLECTION_ECHOES.length; definitionIndex++) {
    const definition = COLLECTION_ECHOES[definitionIndex];
    const spell = std.Spells.create(MODULE, "collection-" + definition.key);
    spell.Name.enGB.set(definition.name);
    spell.Name.ruRU.set(definition.nameRu);
    spell.Description.enGB.set(definition.description);
    spell.Description.ruRU.set(definition.descriptionRu);
    spell.AuraDescription.enGB.set(definition.description);
    spell.AuraDescription.ruRU.set(definition.descriptionRu);
    spell.Icon.setPath(definition.icon);
    spell.Duration.setSimple(-1);
    spell.Stacks.set(0);
    spell.DispelType.set("DISPEL_NONE");
    spell.Attributes.clearAll();
    spell.Attributes.IS_PASSIVE.set(true);
    spell.Attributes.IS_HIDDEN_IN_SPELLBOOK.set(true);
    spell.Attributes.CANT_BE_CANCELED.set(true);
    spell.Attributes.NO_THREAT.set(true);
    spell.Attributes.NOT_STEALABLE.set(true);
    spell.Attributes.PERSISTS_DEATH.set(true);
    spell.Attributes.HIDE_FROM_AURA_BAR.set(true);
    spell.SchoolMask.clearAll();
    spell.Effects.clearAll();
    if (definition.key == "overwhelming-restoration") {
        addEffect(spell, {
            aura: "MOD_HEALING_DONE_PERCENT",
            pointsBase: 30,
            pointsPerLevel: 0,
            period: 0,
            miscA: 127,
            miscB: 0,
        });
        addEffect(spell, {
            aura: "MOD_POWER_COST_SCHOOL_PCT",
            pointsBase: 500,
            pointsPerLevel: 0,
            period: 0,
            miscA: 126,
            miscB: 1,
        });
    } else {
        const marker = spell.Effects.addGet();
        marker.Type.APPLY_AURA.set();
        if (definition.key == "sanctum-sentries" || definitionIndex >= 12) {
            marker.Aura.PERIODIC_DUMMY.set();
            marker.AuraPeriod.set(definitionIndex >= 12 ? 1000 : 2000);
        } else {
            marker.Aura.DUMMY.set();
        }
        marker.ImplicitTargetA.UNIT_CASTER.set();
    }
    spell.Tags.addUnique(MODULE, "spell/collection-" + definition.key);
}

const ICON_BLADE = "Interface\\Icons\\warrior_talent_icon_ravager";
const ICON_BROOD = "Interface\\Icons\\Achievement_Boss_Onyxia";
const ICON_LICH = "Interface\\Icons\\achievement_raid_torghast_kel-thuzad";
const ICON_CHILL = "Interface\\Icons\\Ability_Mage_ChilledToTheBone";
const ICON_PARADOX = "Interface\\Icons\\inv_10_blacksmithing_craftedbar_frostfirealloy";
const ICON_FROSTGUARD = "Interface\\Icons\\inv_10_jewelcrafting_gem3primal_frost_cut_transparent";
const ICON_FUMES = "Interface\\Icons\\Ability_Rogue_DeviousPoisons";
const ICON_NETHER = "Interface\\Icons\\achievement_boss_argus_femaleeredar";
const ICON_SANCTUM = "Interface\\Icons\\Ability_Mount_BlackPanther";
const ICON_SPELLWEAVE = "Interface\\Icons\\ability_evoker_innatemagic5";

createDummyAura("collection-blade-tempest-zone", "Blade Tempest", "Буря клинков", ICON_BLADE, 8000, 0, 1000, false, true);
createPeriodicDamageAura("collection-searing-cinders", "Searing Cinders", "Тлеющие угли", ICON_BROOD, 8000, 5, 5, 0.15, 0.075, 1000);
createDummyAura("collection-broodmother-icd", "Deep Breath Cooldown", "Восстановление глубокого дыхания", ICON_BROOD, 6000, 0, 0, false, true);
createDummyAura("collection-soul-fragment", "Soul Fragment", "Фрагмент души", ICON_LICH, -1, 6);
createDummyAura("collection-lich-servants", "Servants of the Lich King", "Слуги Короля-лича", ICON_LICH, 30000, 6, 2000);
createDummyAura("collection-rime", "Rime", "Изморозь", ICON_CHILL, -1, 12);
createDummyAura("collection-chill-icd", "Rime Cooldown", "Восстановление изморози", ICON_CHILL, 4000, 0, 0, false, true);
createDummyAura("collection-brittle", "Brittle", "Хрупкость", ICON_CHILL, 5000, 0, 0, true);
createDummyAura("collection-biting-cold", "Biting Cold", "Лютый холод", ICON_PARADOX, 6000, 10, 0, true);

const frostguardBuff = std.Spells.create(MODULE, "collection-frostguard-buff", 588);
frostguardBuff.Name.enGB.set("Frostguard Carapace");
frostguardBuff.Name.ruRU.set("Панцирь ледяного стража");
frostguardBuff.AuraDescription.enGB.set("Damage taken reduced by 15%.");
frostguardBuff.AuraDescription.ruRU.set("Получаемый урон снижен на 15%.");
frostguardBuff.Icon.setPath(ICON_FROSTGUARD);
configureTriggeredAura(frostguardBuff, 6000);
frostguardBuff.Visual.set(11151);
const frostguardEffect = frostguardBuff.Effects.addGet();
frostguardEffect.Type.APPLY_AURA.set();
frostguardEffect.Aura.MOD_DAMAGE_PERCENT_TAKEN.set();
frostguardEffect.ImplicitTargetA.UNIT_CASTER.set();
frostguardEffect.PointsDieSides.set(1);
frostguardEffect.PointsBase.set(-15);
frostguardEffect.MiscValueA.set(127);
frostguardBuff.Tags.addUnique(MODULE, "spell/collection-frostguard-buff");
createDummyAura("collection-frostguard-icd", "Frostguard Cooldown", "Восстановление ледяного стража", ICON_FROSTGUARD, 45000, 0, 0, false, true);

createDummyAura("collection-mutagenic-cloud", "Poison Cloud", "Ядовитое облако", ICON_FUMES, 20000, 0, 1000, false, true);
createDummyAura("collection-mutagenic-icd", "Mutagenic Fumes Cooldown", "Восстановление мутагенных испарений", ICON_FUMES, 8000, 0, 0, false, true);
createDummyAura("collection-nether-portal", "Nether Portal", "Портал Пустоты", ICON_NETHER, 10000, 0, 2000);
createDummyAura("collection-nether-icd", "Nether Portal Cooldown", "Восстановление портала Пустоты", ICON_NETHER, 6000, 0, 0, false, true);
createDummyAura("collection-nether-flames", "Fel Flames", "Пламя Скверны", ICON_NETHER, 4000, 0, 1000, false, true);
createDummyAura("collection-sanctum-mark", "Sanctum Sentries", "Метка стражей святилища", ICON_SANCTUM, 4000, 0, 0, true);

const spellweaveDamage = std.Spells.create(MODULE, "collection-spellweave-damage", 588);
spellweaveDamage.Name.enGB.set("Spellweave: Damage");
spellweaveDamage.Name.ruRU.set("Сплетение чар: урон");
spellweaveDamage.AuraDescription.enGB.set("Magic spell damage increased by 10%.");
spellweaveDamage.AuraDescription.ruRU.set("Урон от магических заклинаний увеличен на 10%.");
spellweaveDamage.Icon.setPath(ICON_SPELLWEAVE);
configureTriggeredAura(spellweaveDamage, 4000);
const spellweaveDamageEffect = spellweaveDamage.Effects.addGet();
spellweaveDamageEffect.Type.APPLY_AURA.set();
spellweaveDamageEffect.Aura.MOD_DAMAGE_PERCENT_DONE.set();
spellweaveDamageEffect.ImplicitTargetA.UNIT_CASTER.set();
spellweaveDamageEffect.PointsDieSides.set(1);
spellweaveDamageEffect.PointsBase.set(10);
spellweaveDamageEffect.MiscValueA.set(126);
spellweaveDamage.Tags.addUnique(MODULE, "spell/collection-spellweave-damage");

const spellweaveHealing = std.Spells.create(MODULE, "collection-spellweave-healing", 588);
spellweaveHealing.Name.enGB.set("Spellweave: Healing");
spellweaveHealing.Name.ruRU.set("Сплетение чар: исцеление");
spellweaveHealing.AuraDescription.enGB.set("Healing done increased by 10%.");
spellweaveHealing.AuraDescription.ruRU.set("Эффективность исходящего исцеления увеличена на 10%.");
spellweaveHealing.Icon.setPath(ICON_SPELLWEAVE);
configureTriggeredAura(spellweaveHealing, 4000);
const spellweaveHealingEffect = spellweaveHealing.Effects.addGet();
spellweaveHealingEffect.Type.APPLY_AURA.set();
spellweaveHealingEffect.Aura.MOD_HEALING_DONE_PERCENT.set();
spellweaveHealingEffect.ImplicitTargetA.UNIT_CASTER.set();
spellweaveHealingEffect.PointsDieSides.set(1);
spellweaveHealingEffect.PointsBase.set(10);
spellweaveHealingEffect.MiscValueA.set(127);
spellweaveHealing.Tags.addUnique(MODULE, "spell/collection-spellweave-healing");

createAreaDamageSpell("collection-blade-tempest-hit", "Blade Tempest", "Буря клинков", ICON_BLADE, ["PHYSICAL"], 30, 0.6, 0.3, 8, true);
createDamageSpell("collection-deep-breath-hit", "Deep Breath", "Глубокое дыхание", ICON_BROOD, ["FIRE"], 50, 2, 1, true);
createDamageSpell("collection-lich-servant-hit", "Servant Strike", "Удар слуги", ICON_LICH, ["FROST", "SHADOW"], 5, 0, 0);
createDamageSpell("collection-sanctum-sentry-hit", "Sanctum Claw", "Коготь святилища", ICON_SANCTUM, ["PHYSICAL"], 2, 0, 0);
createDamageSpell("collection-frost-breath-hit", "Frost Breath", "Морозное дыхание", ICON_CHILL, ["FROST"], 30, 1.75, 0.875, true);
createDamageSpell("collection-frostfire-shatter-hit", "Frostfire Shatter", "Раскол ледяного огня", ICON_PARADOX, ["FROST"], 3, 0.15, 0.075, true);
createAreaDamageSpell("collection-mutagenic-hit", "Poison Cloud", "Ядовитое облако", ICON_FUMES, ["NATURE"], 5, 0.2, 0.1, 10, true);
// Spell 38718 keeps AcidBurn.mdx exclusively in PersistentAreaKit, so a DUMMY
// destination cast cannot render it. Recast this harmless dynamic area on each
// one-second cloud tick; the short overlap keeps the visual continuous.
const mutagenicVisual = std.Spells.create(MODULE, "collection-mutagenic-visual", 38718);
mutagenicVisual.Name.enGB.set("Poison Cloud");
mutagenicVisual.Name.ruRU.set("Ядовитое облако");
mutagenicVisual.Description.enGB.set("Visual marker for Mutagenic Fumes.");
mutagenicVisual.Description.ruRU.set("Визуальная отметка мутагенных испарений.");
mutagenicVisual.Icon.setPath(ICON_FUMES);
configureTriggeredAura(mutagenicVisual, 1500);
hideInternalAura(mutagenicVisual);
mutagenicVisual.Attributes.IS_NEGATIVE.set(true);
mutagenicVisual.TargetType.clearAll();
mutagenicVisual.TargetType.DEST_LOCATION.set(true);
const mutagenicVisualArea = mutagenicVisual.Effects.addGet();
mutagenicVisualArea.Type.PERSISTENT_AREA_AURA.set();
mutagenicVisualArea.Aura.PERIODIC_DUMMY.set();
mutagenicVisualArea.ImplicitTargetA.DEST_DEST.set();
mutagenicVisualArea.ImplicitTargetB.UNIT_DEST_AREA_ENEMY.set();
mutagenicVisualArea.Radius.setSimple(10);
mutagenicVisualArea.AuraPeriod.set(1000);
mutagenicVisual.Visual.getRefCopy()
    .PersistentAreaKit.getRefCopy()
    .WorldEffect.getRefCopy()
    .Scale.Scale.set(1);
mutagenicVisual.Tags.addUnique(MODULE, "spell/collection-mutagenic-visual");
const netherLightningHit = createDamageSpell("collection-nether-lightning-hit", "Fel Bolt", "Разряд Скверны", ICON_NETHER, ["FIRE", "SHADOW"], 25, 1.25, 0.625);
// These two visuals use portal-safe attachment points. The bolt launches from
// the model origin, while the flamestrike has an instant area kit and does not
// depend on a persistent-area aura to become visible.
netherLightningHit.Visual.set(8312);
netherLightningHit.Speed.set(12);
netherLightningHit.BonusData.DirectBonus.set(0);
netherLightningHit.BonusData.APBonus.set(0);
const netherFlamestrikeHit = createAreaDamageSpell("collection-nether-flamestrike-hit", "Fel Flamestrike", "Огненный удар Скверны", ICON_NETHER, ["FIRE", "SHADOW"], 40, 2, 1, 5);
netherFlamestrikeHit.Visual.set(8394);
// The runtime applies the one-time burst explicitly from the portal so its
// owner-scaled damage is guaranteed and appears under the NPC in combat logs.
// This spell exists only to deliver the destination impact visual.
netherFlamestrikeHit.Effects.get(0).Type.DUMMY.set();
netherFlamestrikeHit.BonusData.DirectBonus.set(0);
netherFlamestrikeHit.BonusData.APBonus.set(0);
const netherFlamesTick = createAreaDamageSpell("collection-nether-flames-tick", "Fel Flames", "Пламя Скверны", ICON_NETHER, ["FIRE", "SHADOW"], 10, 0.4, 0.2, 5);
netherFlamesTick.Visual.set(10379);
suppressPassiveProcAnimation(netherFlamesTick);

function createAdvancedDamage(
    key: string,
    name: string,
    nameRu: string,
    icon: string,
    schools: string[],
): any {
    const spell = createDamageSpell(key, name, nameRu, icon, schools, 1, 0, 0, true);
    spell.BonusData.DirectBonus.set(0);
    spell.BonusData.APBonus.set(0);
    return spell;
}

function createAdvancedDot(
    key: string,
    name: string,
    nameRu: string,
    icon: string,
    schools: string[],
    durationMs: number,
    periodMs: number,
    base: number,
    spellPower: number,
    attackPower: number,
    maxStacks: number = 0,
): any {
    const spell = createPeriodicDamageAura(
        key, name, nameRu, icon, durationMs, maxStacks,
        base, spellPower, attackPower, periodMs, schools,
    );
    if (key == "collection-mutated-infection"
        || key == "collection-mutated-plague"
        || key == "collection-widows-venom-dot") spell.Visual.set(8197);
    else if (key == "collection-burning-combustion") spell.Visual.set(2638);
    else if (key == "collection-soul-consumption") spell.Visual.set(8629);
    return spell;
}

function createAdvancedStun(key: string, durationMs: number): any {
    const spell = std.Spells.create(MODULE, key, 12809);
    spell.Name.enGB.set("Echo Stun");
    spell.Name.ruRU.set("Оглушение Эхо");
    configureTriggeredAura(spell, durationMs);
    spell.Attributes.IS_NEGATIVE.set(true);
    spell.Effects.addGet().Type.APPLY_AURA.set().Aura.MOD_STUN.set()
        .ImplicitTargetA.UNIT_TARGET_ENEMY.set();
    if (key == "collection-advanced-stun-3") spell.Visual.set(5920);
    suppressPassiveProcAnimation(spell);
    spell.Tags.addUnique(MODULE, "spell/" + key);
    return spell;
}

function addAdvancedAuraEffect(
    spell: any,
    auraName: string,
    amount: number,
    targetEnemy: boolean = false,
    miscA: number = 127,
): void {
    const effect = spell.Effects.addGet();
    effect.Type.APPLY_AURA.set();
    (effect.Aura as any)[auraName].set();
    if (targetEnemy) effect.ImplicitTargetA.UNIT_TARGET_ENEMY.set();
    else effect.ImplicitTargetA.UNIT_TARGET_ALLY.set();
    effect.PointsDieSides.set(1);
    effect.PointsBase.set(amount);
    effect.MiscValueA.set(miscA);
}

function createAdvancedBuff(
    key: string,
    name: string,
    nameRu: string,
    icon: string,
    durationMs: number,
    effects: { aura: string; amount: number; miscA?: number }[],
): any {
    const spell = std.Spells.create(MODULE, key, 588);
    spell.Name.enGB.set(name);
    spell.Name.ruRU.set(nameRu);
    spell.AuraDescription.enGB.set(name);
    spell.AuraDescription.ruRU.set(nameRu);
    spell.Icon.setPath(icon);
    configureTriggeredAura(spell, durationMs);
    for (let i = 0; i < effects.length; i++) {
        addAdvancedAuraEffect(
            spell,
            effects[i].aura,
            effects[i].amount,
            false,
            effects[i].miscA === undefined ? 127 : effects[i].miscA!,
        );
    }
    if (key == "collection-demonic-form") spell.Visual.set(12118);
    spell.Tags.addUnique(MODULE, "spell/" + key);
    return spell;
}

function createAdvancedHeal(key: string, name: string, nameRu: string, icon: string): any {
    const spell = std.Spells.create(MODULE, key, 2061);
    spell.Name.enGB.set(name);
    spell.Name.ruRU.set(nameRu);
    spell.Icon.setPath(icon);
    spell.Family.set(0);
    spell.Power.setMana(0, 0);
    spell.CastTime.setSimple(0, 0, 0);
    spell.Range.setSimple(0, 100);
    spell.Attributes.clearAll();
    spell.Attributes.CANT_TRIGGER_PROC.set(true);
    spell.Attributes.CANT_CRIT.set(true);
    spell.BonusData.DirectBonus.set(0);
    spell.BonusData.APBonus.set(0);
    spell.Effects.clearAll();
    spell.Effects.addGet().Type.HEAL.set().ImplicitTargetA.UNIT_TARGET_ALLY.set().HealBase.set(1);
    suppressPassiveProcAnimation(spell);
    spell.Tags.addUnique(MODULE, "spell/" + key);
    return spell;
}

const ICON_ADV_SHADOW = "Interface\\Icons\\inv_10_enchanting2_magicswirl_blue";
const ICON_ADV_FIRE = "Interface\\Icons\\inv_10_blacksmithing_craftedbar_frostfirealloy";
const ICON_ADV_NATURE = "Interface\\Icons\\Ability_Rogue_DeviousPoisons";
const ICON_ADV_HOLY = "Interface\\Icons\\Ability_Druid_HealingInstincts";
const ICON_ADV_ARCANE = "Interface\\Icons\\ability_titankeeper_phasing";

// Destination-only helpers render persistent ground kits even when a zone has
// no target inside it; mechanics and damage remain server-authoritative.
createAreaVisualSpell("collection-sanctum-cyclone-visual", "Fire Cyclone", "Огненный циклон", ICON_ADV_FIRE, 10379);
createAreaVisualSpell("collection-defile-visual", "Defile", "Осквернение", ICON_ADV_SHADOW, 10406);
createAreaVisualSpell("collection-scorched-path-visual", "Scorched Path", "Обожжённый путь", ICON_ADV_FIRE, 11498);
createAreaVisualSpell("collection-sticky-slime-visual", "Sticky Slime", "Липкая слизь", ICON_ADV_NATURE, 8964);
createAreaVisualSpell("collection-poison-slime-visual", "Poison Slime", "Ядовитая слизь", ICON_ADV_NATURE, 8699);
createAreaVisualSpell("collection-twilight-rift-visual", "Twilight Rift", "Сумеречный разлом", "Interface\\Icons\\achievement_boss_argus_femaleeredar", 9166);

createDummyAura("collection-blight", "Blight", "Скверна", ICON_ADV_SHADOW, -1, 5);
createDummyAura("collection-blight-icd", "Blighted Sky Cooldown", "Восстановление Чумного неба", ICON_ADV_SHADOW, 8000, 0, 0, false, true);
createAdvancedDamage("collection-blighted-sky-hit", "Blighted Sky", "Чумное небо", ICON_ADV_SHADOW, ["SHADOW"]);
createAdvancedStun("collection-advanced-stun-2", 2000);

createDummyAura("collection-heat", "Heat", "Жар", ICON_ADV_FIRE, 8000, 8, 0, true);
createDummyAura("collection-brittle-state", "Brittle", "Хрупкость", ICON_ADV_FIRE, 6000, 0, 0, true);
createDummyAura("collection-heat-lock", "Heat Lockout", "Невосприимчивость к Жару", ICON_ADV_FIRE, 8000, 0, 0, true, true);
createAdvancedDamage("collection-brittle-shatter-hit", "Brittle Shatter", "Раскол Хрупкости", ICON_ADV_FIRE, ["FIRE"]);

createDummyAura("collection-webbing-icd", "Webbing Cooldown", "Восстановление Паутины", ICON_ADV_NATURE, 45000, 0, 0, false, true);
createAdvancedDamage("collection-webbing-hit", "Broodmother's Webbing", "Паутина Матери стаи", ICON_ADV_NATURE, ["NATURE"]);
createAdvancedStun("collection-advanced-stun-3", 3000);

createDummyAura("collection-rally", "Rally", "Сбор", ICON_ADV_HOLY, 12000, 5);
createAdvancedBuff("collection-encouraging-cry", "Encouraging Cry", "Ободряющий клич", ICON_ADV_HOLY, 8000, [
    { aura: "MOD_DAMAGE_PERCENT_TAKEN", amount: -15 },
    { aura: "MOD_HEALING_PCT", amount: 20 },
]);
createAdvancedHeal("collection-champion-heal", "Champion's Rally", "Боевой клич чемпиона", ICON_ADV_HOLY);

createDummyAura("collection-sanctum-cinders", "Cinders", "Угли", ICON_ADV_FIRE, -1, 12);
createDummyAura("collection-sanctum-cinders-icd", "Cinders Cooldown", "Восстановление Углей", ICON_ADV_FIRE, 6000, 0, 0, false, true);
createAdvancedDamage("collection-sanctum-cyclone-hit", "Fire Cyclone", "Огненный циклон", ICON_ADV_FIRE, ["FIRE"]);

createDummyAura("collection-falling-stars", "Falling Stars", "Падающие звёзды", ICON_ADV_ARCANE, -1, 5);
createAdvancedDamage("collection-falling-star-hit", "Falling Star", "Падающая звезда", ICON_ADV_ARCANE, ["ARCANE"]);
createAdvancedDamage("collection-big-bang-hit", "Big Bang", "Большой взрыв", ICON_ADV_ARCANE, ["ARCANE"]);

createDummyAura("collection-contagion", "Contagion", "Заражение", ICON_ADV_SHADOW, 10000, 8, 0, true);
createDummyAura("collection-plaguebringer-curse", "Plaguebringer's Curse", "Проклятие Чумотворца", ICON_ADV_SHADOW, 8000, 0, 2000, true);
createAdvancedDamage("collection-plaguebringer-curse-hit", "Plaguebringer's Curse", "Проклятие Чумотворца", ICON_ADV_SHADOW, ["SHADOW"]);

createDummyAura("collection-dark-nucleus-active", "Dark Nucleus", "Тёмное ядро", ICON_ADV_SHADOW, 6000, 0, 1000);
createDummyAura("collection-dark-nucleus-icd", "Dark Nucleus Cooldown", "Восстановление Тёмного ядра", ICON_ADV_SHADOW, 20000, 0, 0, false, true);
createAdvancedDamage("collection-dark-lance-hit", "Empowered Shadow Lance", "Усиленное копьё Тьмы", ICON_ADV_SHADOW, ["SHADOW"]);

const deathwhisperBarrier = std.Spells.create(MODULE, "collection-deathwhisper-barrier", 17);
deathwhisperBarrier.Name.enGB.set("Deathwhisper's Barrier");
deathwhisperBarrier.Name.ruRU.set("Барьер Смертного Шёпота");
deathwhisperBarrier.Icon.setPath("Interface\\Icons\\inv_shield_1h_earthendungeon_c_02");
configureTriggeredAura(deathwhisperBarrier, 8000);
deathwhisperBarrier.BonusData.DirectBonus.set(0);
deathwhisperBarrier.BonusData.APBonus.set(0);
deathwhisperBarrier.BonusData.DotBonus.set(0);
deathwhisperBarrier.BonusData.APDotBonus.set(0);
deathwhisperBarrier.Effects.addGet().Type.APPLY_AURA.set().Aura.SCHOOL_ABSORB.set()
    .ImplicitTargetA.UNIT_CASTER.set().DamageBase.set(1).School.set(["PHYSICAL", "HOLY", "FIRE", "NATURE", "FROST", "SHADOW", "ARCANE"]);
deathwhisperBarrier.Effects.addGet().Type.APPLY_AURA.set().Aura.PERIODIC_DUMMY.set()
    .ImplicitTargetA.UNIT_CASTER.set().AuraPeriod.set(1000);
suppressPassiveProcAnimation(deathwhisperBarrier);
deathwhisperBarrier.Tags.addUnique(MODULE, "spell/collection-deathwhisper-barrier");
createDummyAura("collection-deathwhisper-icd", "Deathwhisper Cooldown", "Восстановление Барьера", ICON_ADV_SHADOW, 45000, 0, 0, false, true);
createAdvancedDamage("collection-deathwhisper-pulse", "Deathwhisper Pulse", "Импульс Смертного Шёпота", ICON_ADV_SHADOW, ["SHADOW"]);

createAdvancedDamage("collection-defile-hit", "Defile", "Осквернение", ICON_ADV_SHADOW, ["SHADOW"]);
createAdvancedBuff("collection-demonic-form", "Demonic Awakening", "Демоническое пробуждение", "Interface\\Icons\\inv_plate_raidwarrior_o_01helm", 10000, [
    { aura: "MOD_DAMAGE_PERCENT_DONE", amount: 20 },
]);
createDummyAura("collection-demonic-icd", "Demonic Awakening Cooldown", "Восстановление Демонического пробуждения", ICON_ADV_SHADOW, 60000, 0, 0, false, true);
createAdvancedHeal("collection-demonic-heal", "Demonic Leech", "Демоническое похищение", ICON_ADV_SHADOW);
createAdvancedDamage("collection-demonic-cleave", "Demonic Cleave", "Демонический удар", ICON_ADV_SHADOW, ["SHADOW"]);

createAdvancedDamage("collection-scorched-path-hit", "Scorched Path", "Обожжённый путь", ICON_ADV_FIRE, ["FIRE"]);
const scorchedSlow = std.Spells.create(MODULE, "collection-scorched-path-slow", 31589);
scorchedSlow.Name.enGB.set("Scorched Path");
scorchedSlow.Name.ruRU.set("Обожжённый путь");
configureTriggeredAura(scorchedSlow, 2000);
scorchedSlow.Attributes.IS_NEGATIVE.set(true);
addAdvancedAuraEffect(scorchedSlow, "MOD_DECREASE_SPEED", -30, true);
suppressPassiveProcAnimation(scorchedSlow);
scorchedSlow.Tags.addUnique(MODULE, "spell/collection-scorched-path-slow");

createAdvancedDot("collection-mutated-infection", "Mutated Infection", "Мутировавшая инфекция", ICON_ADV_NATURE, ["NATURE"], 8000, 2000, 10, 0.3, 0.15);
createAdvancedDot("collection-mutated-plague", "Mutated Plague", "Мутировавшая чума", ICON_ADV_NATURE, ["NATURE", "SHADOW"], 8000, 2000, 4, 0.075, 0.0375, 5);
createAdvancedDamage("collection-sticky-slime-hit", "Sticky Slime", "Липкая слизь", ICON_ADV_NATURE, ["NATURE"]);

createDummyAura("collection-molten-blood", "Molten Blood", "Расплавленная кровь", ICON_ADV_NATURE, 12000, 5);
createAdvancedBuff("collection-shed-skin", "Shed Skin", "Сброшенная кожа", ICON_ADV_NATURE, 6000, [
    { aura: "MOD_INCREASE_SPEED", amount: 30 },
    { aura: "MOD_DAMAGE_PERCENT_TAKEN", amount: -15 },
]);
createAdvancedDamage("collection-poison-slime-hit", "Poison Slime", "Ядовитая слизь", ICON_ADV_NATURE, ["NATURE"]);

createDummyAura("collection-static-overflow-icd", "Static Overflow Cooldown", "Восстановление Избытка статики", ICON_ADV_NATURE, 10000, 0, 0, false, true);
createAdvancedDamage("collection-static-overflow-hit", "Static Overflow", "Избыток статики", ICON_ADV_NATURE, ["NATURE"]);
createDummyAura("collection-stone-shatter-mark", "Shatter", "Раскол", "Interface\\Icons\\inv_ability_mountainthanewarrior_thorimsmight", 12000, 0, 0, true);
createAdvancedDamage("collection-stone-shatter-hit", "Stone Shatter", "Каменный раскол", "Interface\\Icons\\inv_ability_mountainthanewarrior_thorimsmight", ["PHYSICAL"]);
createDummyAura("collection-storm-conductor-count", "Storm Conductor", "Проводник бури", ICON_ADV_NATURE, -1, 5);
createAdvancedDamage("collection-storm-conductor-hit", "Chain Lightning", "Цепная молния", ICON_ADV_NATURE, ["NATURE"]);

createAdvancedDot("collection-burning-combustion", "Burning Combustion", "Огненное горение", ICON_ADV_FIRE, ["FIRE"], 6000, 1000, 5, 0.1, 0.05);
createAdvancedDot("collection-soul-consumption", "Soul Consumption", "Поглощение души", ICON_ADV_SHADOW, ["SHADOW"], 6000, 1000, 5, 0.1, 0.05);
createAdvancedDamage("collection-twilight-rift-hit", "Twilight Rift", "Сумеречный разлом", "Interface\\Icons\\achievement_boss_argus_femaleeredar", ["FIRE", "SHADOW"]);

createDummyAura("collection-light-essence", "Light Essence", "Сущность Света", ICON_ADV_HOLY, -1);
createDummyAura("collection-dark-essence", "Dark Essence", "Тёмная сущность", ICON_ADV_SHADOW, -1);
createDummyAura("collection-light-charge", "Light Charge", "Светлый заряд", ICON_ADV_HOLY, 12000, 8);
createDummyAura("collection-dark-charge", "Dark Charge", "Тёмный заряд", ICON_ADV_SHADOW, 12000, 8);
createDummyAura("collection-equilibrium-icd", "Equilibrium Shift", "Смена равновесия", ICON_ADV_SHADOW, 1000, 0, 0, false, true);
createAdvancedDamage("collection-equilibrium-shadow-hit", "Dark Explosion", "Тёмный взрыв", ICON_ADV_SHADOW, ["SHADOW"]);
createAdvancedDamage("collection-equilibrium-holy-hit", "Light Explosion", "Взрыв Света", ICON_ADV_HOLY, ["HOLY"]);

createDummyAura("collection-toxicity", "Toxicity", "Ядовитость", ICON_ADV_NATURE, -1, 10);
createDummyAura("collection-widows-venom-icd", "Widow's Venom Cooldown", "Восстановление Яда вдовы", ICON_ADV_NATURE, 8000, 0, 0, false, true);
createAdvancedDamage("collection-widows-volley-hit", "Venom Volley", "Залп ядовитых стрел", ICON_ADV_NATURE, ["NATURE"]);
createAdvancedDot("collection-widows-venom-dot", "Widow's Venom", "Яд вдовы", ICON_ADV_NATURE, ["NATURE"], 6000, 1000, 10, 0.25, 0.125);

for (const definition of COLLECTION_ECHOES) {
    const useSpell = std.Spells.create(MODULE, "collection-book-use-" + definition.key);
    useSpell.Name.enGB.set("Learn Echo: " + definition.name);
    useSpell.Name.ruRU.set("Изучить Эхо: " + definition.nameRu);
    useSpell.Description.enGB.set("Adds this Echo to your character collection.");
    useSpell.Description.ruRU.set("Добавляет это Эхо в коллекцию персонажа.");
    useSpell.Icon.setPath(definition.icon);
    useSpell.Attributes.clearAll();
    useSpell.TargetType.clearAll();
    useSpell.CastTime.setSimple(0, 0, 0);
    useSpell.Range.setSimple(0, 0);
    useSpell.Effects.clearAll();
    useSpell.Effects.addGet().Type.SCRIPT_EFFECT.set().ImplicitTargetA.UNIT_CASTER.set();
    useSpell.Tags.addUnique(MODULE, "spell/collection-book-use-" + definition.key);

    const book = std.Items.create(MODULE, "collection-book-" + definition.key, 6948);
    book.Name.enGB.set("Echo Book: " + definition.name);
    book.Name.ruRU.set("Книга Эхо: " + definition.nameRu);
    book.Description.enGB.set("Use: permanently adds this Echo to your collection. A duplicate book is not consumed.");
    book.Description.ruRU.set("Использование: навсегда добавляет это Эхо в коллекцию. Повторная книга не расходуется.");
    book.Class.OTHER_MISC.set();
    book.Quality.PURPLE.set();
    book.Bonding.BINDS_ON_USE.set();
    book.MaxCount.set(0);
    book.MaxStack.set(1);
    book.Flags.clearAll();
    book.Spells.clearAll();
    book.DisplayInfo.setSimpleIcon(MODULE, "collection-book-" + definition.key + "-icon", definition.icon);
    book.Spells.addMod(slot => {
        slot.Spell.set(useSpell.ID);
        slot.Trigger.set(0);
        slot.Charges.set(1, "DELETE_ITEM");
        slot.Cooldown.set(1000);
        slot.CategoryCooldown.set(-1);
    });
    book.Tags.addUnique(MODULE, "item/collection-book-" + definition.key);
}
