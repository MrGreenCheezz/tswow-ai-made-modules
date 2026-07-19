/**
 * M2/MDX-пути и проверенный масштаб из GameObjectDisplayInfo/VMAP.
 * WMO не поддерживаются Model-frame клиента 3.3.5 и остаются с 2D-иконкой.
 */
export const BUILDING_MODELS: { [key: number]: { path: string; scale: number } } = {
    0: { path: "World\\Generic\\Buildings\\HumanTentMedium\\HumanTentMedium.mdx", scale: 0.281 }, // display 7194
    5: { path: "World\\Generic\\Human\\Passive Doodads\\DogHouses\\DogHouse.mdx", scale: 0.75 }, // display 154
    6: { path: "World\\Azeroth\\Elwynn\\PassiveDoodads\\Campfire\\ElwynnCampfire.mdx", scale: 0.75 }, // display 192
    7: { path: "WORLD\\GENERIC\\HUMAN\\PASSIVE DOODADS\\BRAZIERS\\STORMWINDBRAZIER01.MDX", scale: 0.75 }, // display 602
    8: { path: "World\\Azeroth\\BurningSteppes\\PassiveDoodads\\OrcFoundryPit\\OrcSmallFoundryPit.mdx", scale: 0.75 }, // display 209
    9: { path: "World\\SkillActivated\\TradeskillEnablers\\Tradeskill_Anvil_01.mdx", scale: 0.75 }, // display 273
    10: { path: "World\\Goober\\G_Barrel.mdx", scale: 0.75 }, // display 334
    11: { path: "World\\Goober\\G_Crate02.mdx", scale: 0.75 }, // display 336
    12: { path: "WORLD\\GENERIC\\ORC\\PASSIVE DOODADS\\TABLECOOKER\\ORCTABLECOOKER01FIRE.MDX", scale: 0.75 }, // display 331
    13: { path: "World\\Generic\\Human\\Passive Doodads\\BeerKegs\\BeerKeg02.mdx", scale: 0.75 }, // display 319
    20: { path: "World\\Generic\\bloodelf\\passive doodads\\be_fence_001.mdx", scale: 0.75 }, // display 99582
    21: { path: "World\\Azeroth\\duskwood\\passivedoodads\\irongate\\cemetarygate01.mdx", scale: 0.296 }, // display 99488
    22: { path: "World\\Azeroth\\duskwood\\passivedoodads\\fence\\duskwoodfencesegment02.mdx", scale: 0.75 }, // display 99486
    23: { path: "World\\Azeroth\\duskwood\\passivedoodads\\fence\\duskwoodfencepost.mdx", scale: 0.75 }, // display 99485
    24: { path: "World\\Azeroth\\duskwood\\passivedoodads\\coveredbridge\\duskwoodcoveredbridge.mdx", scale: 0.094 }, // display 99484
    25: { path: "World\\Azeroth\\burningsteppes\\passivedoodads\\bridges\\burningropebridge.mdx", scale: 0.084 }, // display 99481
    26: { path: "World\\Azeroth\\stranglethorn\\passivedoodads\\bridge\\stranglechasmbridge.mdx", scale: 0.122 }, // display 99490
    27: { path: "World\\Azeroth\\duskwood\\buildings\\gypsywagon\\gypsywagon.mdx", scale: 0.403 }, // display 99483
    28: { path: "World\\Azeroth\\westfall\\passivedoodads\\furniture\\westfallbed01.mdx", scale: 0.75 }, // display 99494
    29: { path: "World\\Azeroth\\stranglethorn\\passivedoodads\\trolldungeonfountain\\trolldungeonfountain.mdx", scale: 0.75 }, // display 99493
    30: { path: "World\\Azeroth\\stranglethorn\\passivedoodads\\serpentstatue02\\serpentstatue02.mdx", scale: 0.75 }, // display 99492
    31: { path: "World\\Azeroth\\burningsteppes\\passivedoodads\\lotharstatue\\lotharstatue.mdx", scale: 0.098 }, // display 99482
    32: { path: "World\\Expansion02\\doodads\\generic\\scourge\\sc_tent1.mdx", scale: 0.139 }, // display 97944
    33: { path: "World\\Expansion02\\doodads\\generic\\scourge\\sc_tent1_destroyed.mdx", scale: 0.139 }, // display 97943
    34: { path: "World\\Expansion02\\doodads\\generic\\scourge\\sc_wall_01.mdx", scale: 0.267 }, // display 97926
    35: { path: "World\\Expansion02\\doodads\\generic\\scourge\\sc_wall_02.mdx", scale: 0.464 }, // display 97925
    36: { path: "World\\Expansion02\\doodads\\generic\\scourge\\sc_wall_02_ramp.mdx", scale: 0.517 }, // display 97923
    37: { path: "World\\Expansion02\\doodads\\generic\\scourge\\sc_trench_c_long.mdx", scale: 0.75 }, // display 97940
    38: { path: "World\\Expansion02\\doodads\\generic\\scourge\\sc_wagon_broken.mdx", scale: 0.18 }, // display 97927
    39: { path: "World\\Expansion02\\doodads\\generic\\nd_winterorc\\nd_winterorc_wall_gatefx.mdx", scale: 0.75 }, // display 97899
    40: { path: "World\\Expansion02\\doodads\\generic\\nd_winterorc\\nd_winterorc_wallfx.mdx", scale: 0.75 }, // display 97897
    57: { path: "World\\Generic\\PassiveDoodads\\PostBoxes\\PostBoxDwarf.mdx", scale: 0.75 }, // display 1947
    58: { path: "World\\Generic\\ActiveDoodads\\MeetingStones\\Meetingstone02.mdx", scale: 0.431 }, // display 5491
    59: { path: "World\\Generic\\ActiveDoodads\\Chest01\\Chest01.mdx", scale: 0.75 }, // display 10
    60: { path: "World\\Goober\\G_Barrel.mdx", scale: 0.75 }, // display 334
    61: { path: "World\\Generic\\Human\\Passive Doodads\\Cauldrons\\Cauldron.mdx", scale: 0.75 }, // display 216
    75: { path: "World\\SkillActivated\\TradeskillNodes\\copper_Miningnode_01.mdx", scale: 0.61 }, // display 310
    76: { path: "World\\SkillActivated\\TradeskillNodes\\Bush_Peacebloom01.mdx", scale: 0.75 }, // display 269
    80: { path: "World\\Generic\\PVP\\BattlefieldBanners\\BattlefieldBannerAlliance.mdx", scale: 0.676 }, // display 5651
    82: { path: "World\\Goober\\G_Crate01.mdx", scale: 0.75 }, // display 335
    83: { path: "WORLD\\GENERIC\\DWARF\\PASSIVE DOODADS\\BRAZIERS\\DWARVENBRAZIER02.MDX", scale: 0.75 }, // display 197
    84: { path: "World\\Generic\\Human\\Passive Doodads\\Tables\\DuskwoodTable01.mdx", scale: 0.75 }, // display 234
    85: { path: "World\\Expansion02\\Doodads\\Dalaran\\Tradeskill_Leatherworking_01.mdx", scale: 0.75 }, // display 62423
    86: { path: "World\\EXPANSION01\\DOODADS\\GENERIC\\BLOODELF\\Loom\\BE_Loom_01.mdx", scale: 0.75 }, // display 76204
    87: { path: "World\\GENERIC\\HUMAN\\PASSIVE DOODADS\\Scribestations\\GeneralScribestation01.mdx", scale: 0.75 }, // display 87212
    88: { path: "World\\GENERIC\\DWARF\\PASSIVE DOODADS\\SharpeningWheel\\DwarvenSharpeningWheel01.mdx", scale: 0.75 }, // display 87838
    89: { path: "World\\SKILLACTIVATED\\TRADESKILLENABLERS\\Engineering_Autolathe_01.mdx", scale: 0.75 }, // display 83332
    90: { path: "World\\GENERIC\\ORC\\PASSIVE DOODADS\\MeatRacks\\RawMeatRack01.mdx", scale: 0.75 }, // display 86784
    92: { path: "World\\Generic\\Human\\Passive Doodads\\Altars\\Altar01.mdx", scale: 0.75 }, // display 7355
};
