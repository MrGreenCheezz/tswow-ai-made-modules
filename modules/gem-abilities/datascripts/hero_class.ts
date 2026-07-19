/**
 * Universal Hero class for the gem-ability ruleset.
 *
 * Built-in classes remain intact for existing characters and references. The
 * character-creation GlueXML wrapper only presents HERO during normal creation.
 */

import { LUAXML, std } from "wow/wotlk";

const PLAYABLE_RACES = [
    "HUMAN", "ORC", "DWARF", "NIGHTELF", "UNDEAD",
    "TAUREN", "GNOME", "TROLL", "BLOODELF", "DRAENEI",
];

const LEGACY_ARCHAEOLOGIST_RACES = [
    "HUMAN", "DWARF", "GNOME", "NIGHTELF", "TROLL", "UNDEAD", "BLOODELF",
];

const paladin = std.Classes.load("PALADIN");
const paladinIcon = paladin.UI.ButtonTCoords.get();
const hunterIcon = std.Classes.load("HUNTER").UI.ButtonTCoords.get();

// ID 12 belongs to the formerly active Archaeologist module in this dataset.
// Keep a lightweight compatibility row instead of leaving a gap before HERO.
// ChrClasses is indexed natively by the client and only tolerates the stock
// missing ID 10; a missing custom ID can crash before GlueXML finishes loading.
const LEGACY_ARCHAEOLOGIST = std.Classes
    .create("cra-customclass-archaeologist", "Archaeologist", "HUNTER")
    .Name.enGB.set("Archaeologist")
    .Name.ruRU.set("Археолог")
    .Roles.clear()
    .Roles.Damage.set(1)
    .Races.add(LEGACY_ARCHAEOLOGIST_RACES as any);

LEGACY_ARCHAEOLOGIST.row.Name_Male.enGB.set("Archaeologist");
LEGACY_ARCHAEOLOGIST.row.Name_Male.ruRU.set("Археолог");
LEGACY_ARCHAEOLOGIST.row.Name_Female.enGB.set("Archaeologist");
LEGACY_ARCHAEOLOGIST.row.Name_Female.ruRU.set("Археолог");
LEGACY_ARCHAEOLOGIST.UI.ButtonTCoords.set(
    hunterIcon[0], hunterIcon[1], hunterIcon[2], hunterIcon[3]
);
LEGACY_ARCHAEOLOGIST.UI.Description.set(
    "A preserved compatibility class. It is unavailable during normal character creation."
);
LEGACY_ARCHAEOLOGIST.UI.DisabledText.set("This class is preserved for compatibility only.");
LEGACY_ARCHAEOLOGIST.UI.Info.add("Preserved for existing Archaeologist characters.");

export const HERO_CLASS = std.Classes.create("gem-abilities", "hero", "PALADIN")
    .Name.enGB.set("Hero")
    .Name.ruRU.set("Герой")
    .Roles.Damage.set(1)
    .Roles.Healer.set(1)
    .Roles.Tank.set(1)
    .DisplayPower.set(0)
    .Stats.MeleePowerType.WARRIOR.set()
    .Stats.RangedPowerType.HUNTER.set()
    .Races.add(PLAYABLE_RACES as any)
    .Tags.addUnique("gem-abilities", "hero-class");

HERO_CLASS.row.Name_Male.enGB.set("Hero");
HERO_CLASS.row.Name_Male.ruRU.set("Герой");
HERO_CLASS.row.Name_Female.enGB.set("Hero");
HERO_CLASS.row.Name_Female.ruRU.set("Герой");
HERO_CLASS.UI.Color.set(0xD9A441);
HERO_CLASS.UI.ButtonTCoords.set(paladinIcon[0], paladinIcon[1], paladinIcon[2], paladinIcon[3]);
HERO_CLASS.UI.ButtonPos.setPos(0, -420);
HERO_CLASS.UI.Description.set(
    "A universal hero. Gains abilities from gems and can use any weapon or armor."
);
HERO_CLASS.UI.DisabledText.set("Hero is available to every playable race.");
HERO_CLASS.UI.Info.add("Hero abilities are determined by gems socketed into equipment.");
HERO_CLASS.UI.Info.add("Can use every type of weapon and armor.");
HERO_CLASS.UI.Info.add("Can specialize in damage, healing, or defense.");

// Glue screens load before normal addons, so this must be a LUAXML datascript
// patch. Keep all built-in classes available for paid services and existing
// characters; hide them only during ordinary character creation.
LUAXML.file("Interface/GlueXML/CharacterCreate.lua").before(
    "function SetCharacterRace(id)",
    `if GetLocale() == "ruRU" then
    CLASS_ARCHAEOLOGIST = "Археолог"
    CLASS_ARCHAEOLOGIST_FEMALE = "Археолог"
    ARCHAEOLOGIST_DISABLED = "Этот класс сохранён только для совместимости."
    CLASS_INFO_ARCHAEOLOGIST0 = "Сохранён для существующих персонажей класса Археолог."
    CLASS_HERO = "Герой"
    CLASS_HERO_FEMALE = "Герой"
    HERO_DISABLED = "Герой доступен всем игровым расам."
    CLASS_INFO_HERO0 = "Способности героя определяются камнями в экипировке."
    CLASS_INFO_HERO1 = "Может использовать любые типы оружия и брони."
    CLASS_INFO_HERO2 = "Может развиваться в урон, лечение или защиту."
end

local GemAbilities_OriginalEnumerateClasses = CharacterCreateEnumerateClasses
function CharacterCreateEnumerateClasses(...)
    GemAbilities_OriginalEnumerateClasses(...)
    if PAID_SERVICE_TYPE then
        return
    end

    local heroIndex = nil
    local argumentCount = select("#", ...)
    for i = 1, argumentCount, 3 do
        if strupper(select(i + 1, ...)) == "HERO" then
            heroIndex = (i + 2) / 3
            break
        end
    end
    if not heroIndex then
        return
    end

    for i = 1, CharacterCreate.numClasses do
        local button = _G["CharacterCreateClassButton" .. i]
        if button then
            if i == heroIndex then
                button:Show()
                button.enable = true
                button:Enable()
                SetButtonDesaturated(button)
                _G["CharacterCreateClassButton" .. i .. "DisableTexture"]:Hide()
            else
                button:Hide()
            end
        end
    end

    SetSelectedClass(heroIndex)
end
`
);
