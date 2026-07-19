/**
 * Universal talent system and its bilingual data catalog.
 *
 * Trees are not class-bound. Tags describe which ability style the talent
 * supports; they do not gate learning.
 */

export const TREE_CORE = 0;
export const TREE_FIRE = 1;
export const TREE_WEAPON = 2;
export const TREE_VITALITY = 3;
export const TREE_COMPANION = 4;
export const RESET_ALL = 255;
export const TALENT_MODULE = "retail-talents";
export const COMPANION_TALENT_REVISION_KEY = "custom-companions:talent-revision";

export const TAG_NONE = 0;
export const TAG_FIRE = 1;
export const TAG_HEAL = 2;
export const TAG_MELEE = 3;
export const TAG_SHIELD = 4;
export const TAG_DOT = 5;
export const TAG_ARCANE = 6;
export const TAG_FROST = 7;
export const TAG_NATURE = 8;
export const TAG_SHADOW = 9;
export const TAG_HOLY = 10;
export const TAG_MAGIC = 11;

export interface TalentNode {
    id: number;
    name: string;
    ranks: (number | string)[];
    row: number;
    col: number;
    requires: number[];
    gate: number;
    desc: string;
    requiredTag?: number;
}

export interface TalentTree {
    treeId: number;
    name: string;
    background: string;
    nodes: TalentNode[];
}

interface TalentTranslation {
    name: string;
    desc: string;
}

const ENGLISH_TALENTS: { [key: string]: TalentTranslation } = {
    "0:1": { name: "Toughness", desc: "Taking physical damage grants a stack of Toughness for 6 sec. Each stack reduces all damage taken by 2%, up to a number of stacks equal to this talent's rank." },
    "0:2": { name: "Conviction", desc: "A critical damage or healing effect grants a stack of Conviction for 6 sec. Each stack increases your damage and healing by 2%, up to a number of stacks equal to this talent's rank." },
    "0:3": { name: "Inner Reserve", desc: "Critical effects have a 33% chance per rank to restore 1% of your maximum health. Cannot occur more than once every 5 sec." },
    "0:7": { name: "Victor's Might", desc: "After you kill an enemy, your damage and healing are increased by 2% per rank for 8 sec." },
    "0:4": { name: "Pursuit", desc: "After you kill an enemy, your movement speed is increased by 20% per rank for 8 sec." },
    "0:5": { name: "Retaliatory Stance", desc: "After you dodge, parry, or block, your damage and healing are increased by 3% per rank for 6 sec." },
    "0:8": { name: "Course Correction", desc: "When your attack misses, is resisted, dodged, or parried, your melee and spell hit chance is increased by 10% per rank for 6 sec." },
    "0:9": { name: "Foresight", desc: "After you dodge, parry, or block, the critical chance of your attacks and spells is increased by 10% per rank for 4 sec." },
    "0:10": { name: "Stoneskin", desc: "Receiving a critical strike coats you in stone for 12 sec., granting armor that scales with your level." },
    "0:6": { name: "Regal Bearing", desc: "Receiving a critical strike increases all attributes by 10% for 10 sec. Cannot occur more than once every 45 sec." },
    "0:11": { name: "Second Wind", desc: "Being hit by an enemy ability restores 10% of your maximum health per rank over 10 sec. Cannot occur more than once every 20 sec." },
    "0:12": { name: "Stoicism", desc: "Reduces the duration of stun effects used against you by 10% per rank." },

    "1:1": { name: "Spellweaving", desc: "Dealing damage or healing with a spell grants a stack of Weaving for 8 sec. Each stack increases spell damage and healing by 2%, up to a number of stacks equal to this talent's rank." },
    "1:2": { name: "Precise Formula", desc: "Increases spell hit chance by 1% per rank. This foundation talent does not affect weapon attacks." },
    "1:3": { name: "Critical Weaving", desc: "Increases spell critical chance by 1% per rank and enables the tree's critical-effect talents." },
    "1:37": { name: "Ignite", desc: "Critical spell damage has a chance to ignite the target for 6 sec.; the burn scales with spell power." },
    "1:4": { name: "Arcane Clarity", desc: "Critical Arcane damage restores 1% of your maximum mana per rank. Cannot occur more than once every 5 sec." },
    "1:5": { name: "Natural Impulse", desc: "Direct Nature damage or healing has a 20% chance per rank to increase spell casting speed by 5% per rank for 6 sec." },
    "1:6": { name: "Luminosity", desc: "Holy damage has a 20% chance per rank to restore 1% of your maximum health per rank. Cannot occur more than once every 3 sec." },
    "1:14": { name: "Frostbite", desc: "Frost damage has a chance to freeze the target in place for 5 sec. Cannot occur more than once every 8 sec." },
    "1:15": { name: "Gloom", desc: "Shadow damage has a chance to stun the target for 3 sec. Cannot occur more than once every 10 sec." },
    "1:8": { name: "Conserved Energy", desc: "A critical spell effect reduces spell costs by 10% per rank for 6 sec." },
    "1:9": { name: "Instant Weaving", desc: "Grants a cooldown that makes your next eligible spell of any school instant." },
    "1:11": { name: "Mastery of Schools", desc: "Grants a cooldown that empowers your next spell of any school." },
    "1:17": { name: "Magic Echo", desc: "Spell damage has a 5% chance per rank to trigger an additional Arcane pulse that scales with spell power. Cannot occur more than once every 2 sec." },
    "1:22": { name: "Force Flow", desc: "A critical spell effect increases spell damage and healing by 3% per rank for 6 sec." },
    "1:31": { name: "Nature's Grace", desc: "A critical spell effect has a chance to hasten your next spell cast." },

    "2:1": { name: "Battle Rhythm", desc: "A direct physical attack grants a stack of Battle Rhythm for 6 sec. Each stack increases physical damage by 2%, up to a number of stacks equal to this talent's rank." },
    "2:2": { name: "Vengeance", desc: "Any critical damage you deal increases all damage dealt for 8 sec." },
    "2:3": { name: "Cruelty", desc: "Increases weapon critical strike chance by 1% per rank and enables the tree's critical-strike talents." },
    "2:4": { name: "The Art of War", desc: "A critical melee strike makes your next spell instant." },
    "2:7": { name: "Impale", desc: "A critical physical strike increases physical damage taken by the target by 4% per rank for 6 sec." },
    "2:8": { name: "Deep Wounds", desc: "Critical melee strikes cause the target to bleed for 12 sec.; the bleed scales with attack power." },
    "2:13": { name: "Shockwave", desc: "Direct physical attacks have a 3% chance per rank to deal an additional physical strike that scales with attack power. Cannot occur more than once every 2 sec." },
    "2:9": { name: "Heavy Hand", desc: "Melee attacks have a small chance to stun the target for 2 sec. Cannot occur more than once every 10 sec." },
    "2:11": { name: "Flurry", desc: "A critical strike hastens your next 3 melee attacks." },
    "2:5": { name: "Bloodthirst", desc: "A critical physical strike restores 1% of your maximum health per rank. Cannot occur more than once every 4 sec." },
    "2:12": { name: "Iron Grip", desc: "When an enemy dodges or parries your physical attack, or the attack misses, your weapon hit and critical chance are increased by 15% per rank for 6 sec." },
    "2:14": { name: "Battle Ward", desc: "A critical physical strike surrounds you with a shield that scales with your level. Cannot occur more than once every 10 sec." },
    "2:6": { name: "Battle Trance", desc: "Killing an enemy sends you into a fury, greatly increasing attack speed for 10 sec." },
    "2:10": { name: "Execution", desc: "Killing an enemy restores 5% of your maximum health per rank." },
    "2:15": { name: "Unstoppable", desc: "A critical physical strike has a 20% chance to increase physical damage and attack speed by 10% for 8 sec. Cannot occur more than once every 20 sec." },

    "3:1": { name: "Gift of Life", desc: "A critical heal surrounds the target with an additional shield whose strength scales with your level." },
    "3:2": { name: "Enlightenment", desc: "A critical heal of any school restores 1% of your maximum mana per rank." },
    "3:3": { name: "Bulwark", desc: "Blocking reduces all damage taken by 4% per rank for 6 sec." },
    "3:11": { name: "Spiritual Focus", desc: "After taking damage, your spell casts are completely protected from pushback for 3 sec. per rank. Cannot occur more than once every 10 sec." },
    "3:4": { name: "Spark of Life", desc: "A critical heal also heals the target over 9 sec.; the effect scales with spell power." },
    "3:5": { name: "Ward", desc: "Receiving a critical strike surrounds you with a shield that scales with your level." },
    "3:8": { name: "Grace", desc: "A critical heal has a 20% chance per rank to hasten your next eligible spell cast." },
    "3:9": { name: "Survival Instinct", desc: "Receiving a critical strike increases healing received for 10 sec." },
    "3:12": { name: "Meditation", desc: "Taking damage restores 1% of your maximum mana per rank. Cannot occur more than once every 10 sec." },
    "3:10": { name: "Life Resonance", desc: "A critical heal restores 1% of your maximum health per rank." },
    "3:6": { name: "Light in Battle", desc: "Holy damage has a chance to heal you; the healing scales with spell power." },
    "3:7": { name: "Light's Retribution", desc: "Blocking an attack scorches the attacker with Holy damage that scales with spell power." },

    "4:1": { name: "Battle Companion", desc: "Increases all damage dealt by your active companion by 2% per rank." },
    "4:2": { name: "Quick Learner", desc: "Increases your companion's melee and ranged attack speed by 3% per rank." },
    "4:3": { name: "Clear Command", desc: "Increases your companion's spell casting speed by 3% per rank." },
    "4:4": { name: "Strong Bond", desc: "Increases your companion's maximum health by 5% per rank." },
    "4:5": { name: "Predatory Instinct", desc: "Increases the critical chance of your companion's attacks and spells by 2% per rank." },
    "4:6": { name: "Loyal Defender", desc: "Reduces all damage taken by your companion by 4% per rank." },
    "4:7": { name: "Aura of Unity", desc: "Your active companion empowers itself, its owner, and the owner's group within 40 yards, increasing damage and attack and casting speed by 1% per rank." },
    "4:8": { name: "Blood Trail", desc: "Your companion's direct physical attacks have a 5% chance per rank to cause bleeding." },
    "4:9": { name: "Unpredictable Magic", desc: "When your companion deals direct spell damage, it has a 5% chance per rank to cast another random eligible class ability from the gem pool: an offensive ability on the enemy, or a beneficial ability on itself or its owner. Cannot occur more than once every 3 sec." },
    "4:10": { name: "Good Omen", desc: "Healing your companion has a 10% chance per rank to apply one random beneficial effect to the target for 10 sec." },
    "4:11": { name: "Pack Strength", desc: "Further increases the effects of Aura of Unity by 1% per rank." },
    "4:12": { name: "Perfect Bond", desc: "Further increases your active companion's damage, attack speed, and casting speed by 5%." },
    "4:13": { name: "Commanding Roar", desc: "While in Tank mode, your companion generates 50% more threat per rank." },
    "4:14": { name: "Pack Guardian", desc: "While in Tank mode, your companion gains a universal taunt with an 8 sec. internal cooldown." },
};

export function talentName(treeId: number, node: TalentNode, russian: boolean): string {
    if (russian) return node.name;
    const translation = ENGLISH_TALENTS[treeId + ":" + node.id];
    return translation ? translation.name : node.name;
}

export function talentDescription(treeId: number, node: TalentNode, russian: boolean): string {
    if (russian) return node.desc;
    const translation = ENGLISH_TALENTS[treeId + ":" + node.id];
    return translation ? translation.desc : node.desc;
}

export function treeName(tree: TalentTree, russian: boolean): string {
    if (russian) return tree.name;
    if (tree.treeId == TREE_CORE) return "CORE";
    if (tree.treeId == TREE_FIRE) return "MAGIC";
    if (tree.treeId == TREE_WEAPON) return "WEAPONS";
    if (tree.treeId == TREE_VITALITY) return "VITALITY";
    if (tree.treeId == TREE_COMPANION) return "COMPANIONS";
    return tree.name;
}

/** Core points: level 10, 12, 14 ... 80 -> 36 total. */
export function classPointsAt(level: number): number {
    return level < 10 ? 0 : Math.floor((level - 8) / 2);
}

/** Specialization points: level 11, 13 ... 79 -> 35 total. */
export function specPointsAt(level: number): number {
    return level < 11 ? 0 : Math.floor((level - 9) / 2);
}

export function findNode(tree: TalentTree, id: number): TalentNode | undefined {
    for (let i = 0; i < tree.nodes.length; i++) {
        if (tree.nodes[i].id === id) return tree.nodes[i];
    }
    return undefined;
}

export function isSpecTree(treeId: number): boolean {
    return treeId == TREE_FIRE
        || treeId == TREE_WEAPON
        || treeId == TREE_VITALITY
        || treeId == TREE_COMPANION;
}

export function tagName(tag: number, russian = true): string {
    if (tag == TAG_FIRE) return russian ? "Огонь" : "Fire";
    if (tag == TAG_HEAL) return russian ? "Лечение" : "Healing";
    if (tag == TAG_MELEE) return russian ? "Ближний бой" : "Melee";
    if (tag == TAG_SHIELD) return russian ? "Щит" : "Shield";
    if (tag == TAG_DOT) return russian ? "Периодический урон" : "Damage over time";
    if (tag == TAG_ARCANE) return russian ? "Тайная магия" : "Arcane";
    if (tag == TAG_FROST) return russian ? "Лед" : "Frost";
    if (tag == TAG_NATURE) return russian ? "Природа" : "Nature";
    if (tag == TAG_SHADOW) return russian ? "Тьма" : "Shadow";
    if (tag == TAG_HOLY) return russian ? "Свет" : "Holy";
    if (tag == TAG_MAGIC) return russian ? "Магия" : "Magic";
    return "";
}

function rankIds(id: string, count: number): string[] {
    const ranks: string[] = [];
    for (let i = 1; i <= count; i++) {
        ranks.push(id + "-" + i);
    }
    return ranks;
}

export function getTree(treeId: number): TalentTree | undefined {
    if (treeId === TREE_CORE) return CORE_TREE;
    if (treeId === TREE_FIRE) return FIRE_TREE;
    if (treeId === TREE_WEAPON) return WEAPON_TREE;
    if (treeId === TREE_VITALITY) return VITALITY_TREE;
    if (treeId === TREE_COMPANION) return COMPANION_TREE;
    return undefined;
}

export const CORE_TREE: TalentTree = {
    treeId: TREE_CORE,
    name: "ОСНОВА",
    background: "Interface\\TalentFrame\\MageArcane",
    nodes: [
        { id: 1, name: "Закалка", ranks: rankIds("core-toughness", 5), row: 0, col: 0, requires: [], gate: 0,
          desc: "Получение физического урона на 6 сек. дает заряд «Закалки». Каждый заряд снижает весь получаемый урон на 2%, а максимум зарядов равен рангу таланта." },
        { id: 2, name: "Убежденность", ranks: rankIds("core-conviction", 5), row: 0, col: 1, requires: [], gate: 0,
          desc: "Критический урон или исцеление на 6 сек. дает заряд «Убежденности». Каждый заряд усиливает ваш урон и исцеление на 2%, а максимум зарядов равен рангу таланта." },
        { id: 3, name: "Внутренний резерв", ranks: rankIds("core-wisdom", 3), row: 0, col: 2, requires: [], gate: 0,
          desc: "Критические эффекты с вероятностью 33% за ранг восстанавливают 1% максимального здоровья. Не чаще раза в 5 сек." },
        { id: 7, name: "Могущество победителя", ranks: rankIds("core-might", 5), row: 0, col: 3, requires: [], gate: 0,
          desc: "После убийства ваш урон и исцеление увеличиваются на 2% за ранг на 8 сек." },
        { id: 4, name: "Погоня", ranks: rankIds("core-pursuit", 2), row: 1, col: 0, requires: [7], gate: 5,
          desc: "После убийства скорость передвижения увеличивается на 20% за ранг на 8 сек." },
        { id: 5, name: "Ответная стойка", ranks: rankIds("core-deflection", 5), row: 1, col: 1, requires: [1], gate: 5,
          desc: "Уклонение, парирование или блокирование на 6 сек. увеличивает ваш урон и исцеление на 3% за ранг." },
        { id: 8, name: "Исправленная ошибка", ranks: rankIds("core-precision", 3), row: 1, col: 2, requires: [2], gate: 5,
          desc: "Промах, сопротивление, уклонение или парирование вашей атаки на 6 сек. повышает шанс попадания атаками и заклинаниями на 10% за ранг." },
        { id: 9, name: "Предвидение", ranks: rankIds("core-foresight", 5), row: 2, col: 0, requires: [5], gate: 10,
          desc: "Уклонение, парирование или блокирование на 4 сек. повышает шанс критического эффекта атак и заклинаний на 10% за ранг." },
        { id: 10, name: "Каменная кожа", ranks: rankIds("core-stoneskin", 3), row: 3, col: 2, requires: [], gate: 10,
          desc: "Полученный критический удар на 12 сек. покрывает вас каменной коркой; её броня растет с уровнем персонажа." },
        { id: 6, name: "Королевская стать", ranks: rankIds("core-kings", 1), row: 3, col: 1, requires: [2, 3], gate: 15,
          desc: "Полученный критический удар на 10 сек. увеличивает все характеристики на 10%. Не чаще раза в 45 сек." },
        { id: 11, name: "Второе дыхание", ranks: rankIds("core-secondwind", 2), row: 4, col: 0, requires: [10], gate: 15,
          desc: "Попадание вражеской способностью запускает восстановление 10% максимального здоровья за ранг в течение 10 сек. Не чаще раза в 20 сек." },
        { id: 12, name: "Стоицизм", ranks: rankIds("core-stoicism", 3), row: 5, col: 0, requires: [11], gate: 20,
          desc: "Сокращает длительность получаемых оглушений на 10% за ранг." },
    ],
};

export const FIRE_TREE: TalentTree = {
    treeId: TREE_FIRE,
    name: "МАГИЯ",
    background: "Interface\\TalentFrame\\MageFire",
    nodes: [
        { id: 1, name: "Плетение заклинаний", ranks: rankIds("magic-power", 3), row: 0, col: 0, requires: [], gate: 0, requiredTag: TAG_MAGIC,
          desc: "Урон или исцеление заклинанием на 8 сек. дает заряд «Плетения». Каждый заряд усиливает урон и исцеление заклинаний на 2%, а максимум зарядов равен рангу таланта." },
        { id: 2, name: "Точная формула", ranks: rankIds("magic-hit", 3), row: 0, col: 1, requires: [], gate: 0, requiredTag: TAG_MAGIC,
          desc: "Повышает шанс попадания заклинаниями на 1% за ранг. Этот опорный талант не влияет на атаки оружием." },
        { id: 3, name: "Критическое плетение", ranks: rankIds("magic-crit", 3), row: 0, col: 2, requires: [], gate: 0, requiredTag: TAG_MAGIC,
          desc: "Повышает шанс критического эффекта заклинаний на 1% за ранг и запускает связанные с критами таланты ветки." },
        { id: 37, name: "Воспламенение", ranks: rankIds("magic-ignite", 3), row: 1, col: 2, requires: [3], gate: 5, requiredTag: TAG_MAGIC,
          desc: "Критический урон заклинанием с шансом поджигает цель на 6 сек.; урон горения растет от силы заклинаний." },
        { id: 4, name: "Чародейская ясность", ranks: rankIds("magic-cost", 3), row: 1, col: 0, requires: [1], gate: 5, requiredTag: TAG_ARCANE,
          desc: "Критический урон тайной магией восстанавливает 1% максимального запаса маны за ранг. Не чаще раза в 5 сек." },
        { id: 5, name: "Природный импульс", ranks: rankIds("magic-haste", 3), row: 1, col: 1, requires: [1], gate: 5, requiredTag: TAG_NATURE,
          desc: "Прямой урон или исцеление магией природы с вероятностью 20% за ранг на 6 сек. ускоряет произнесение заклинаний на 5% за ранг." },
        { id: 6, name: "Светоносность", ranks: rankIds("magic-heal", 3), row: 1, col: 3, requires: [1], gate: 5, requiredTag: TAG_HOLY,
          desc: "Урон от магии Света с вероятностью 20% за ранг восстанавливает 1% максимального здоровья за ранг. Не чаще раза в 3 сек." },
        { id: 14, name: "Обморожение", ranks: rankIds("magic-frostgrip", 3), row: 2, col: 0, requires: [1], gate: 10, requiredTag: TAG_FROST,
          desc: "Урон от льда с шансом примораживает цель к земле на 5 сек. Не чаще раза в 8 сек." },
        { id: 15, name: "Сумрак", ranks: rankIds("magic-shadowdaze", 3), row: 2, col: 1, requires: [1], gate: 10, requiredTag: TAG_SHADOW,
          desc: "Урон от тьмы с шансом оглушает цель на 3 сек. Не чаще раза в 10 сек." },
        { id: 8, name: "Сбереженная энергия", ranks: rankIds("magic-regen", 3), row: 2, col: 2, requires: [3], gate: 10, requiredTag: TAG_MAGIC,
          desc: "Критический эффект заклинания на 6 сек. снижает стоимость заклинаний на 10% за ранг." },
        { id: 9, name: "Мгновенное плетение", ranks: ["magic-instant-cast"], row: 2, col: 3, requires: [1], gate: 10, requiredTag: TAG_MAGIC,
          desc: "Дает кулдаун: следующее подходящее заклинание любой школы произносится мгновенно." },
        { id: 11, name: "Владычество школ", ranks: ["magic-mastery"], row: 3, col: 0, requires: [3], gate: 10, requiredTag: TAG_MAGIC,
          desc: "Дает кулдаун для усиления следующего заклинания любой школы." },
        { id: 17, name: "Отзвук магии", ranks: rankIds("magic-school-resonance", 3), row: 3, col: 1, requires: [1], gate: 15, requiredTag: TAG_MAGIC,
          desc: "Урон заклинанием с вероятностью 5% за ранг вызывает дополнительный чародейский импульс, усиленный силой заклинаний. Не чаще раза в 2 сек." },
        { id: 22, name: "Поток силы", ranks: rankIds("magic-force-flow", 3), row: 4, col: 0, requires: [17], gate: 20, requiredTag: TAG_MAGIC,
          desc: "Критический эффект заклинания на 6 сек. увеличивает урон и исцеление заклинаний на 3% за ранг." },
        { id: 31, name: "Благодать природы", ranks: rankIds("magic-natures-grace", 2), row: 5, col: 0, requires: [3, 17], gate: 25, requiredTag: TAG_MAGIC,
          desc: "Критический эффект заклинания с шансом ускоряет произнесение следующего заклинания." },
    ],
};

export const WEAPON_TREE: TalentTree = {
    treeId: TREE_WEAPON,
    name: "ОРУЖИЕ",
    background: "Interface\\TalentFrame\\WarriorArms",
    nodes: [
        { id: 1, name: "Боевой ритм", ranks: rankIds("weapon-mastery", 5), row: 0, col: 0, requires: [], gate: 0, requiredTag: TAG_MELEE,
          desc: "Прямая физическая атака на 6 сек. дает заряд «Боевого ритма». Каждый заряд увеличивает физический урон на 2%, а максимум зарядов равен рангу таланта." },
        { id: 2, name: "Возмездие", ranks: rankIds("weapon-vengeance", 3), row: 0, col: 2, requires: [], gate: 0, requiredTag: TAG_MELEE,
          desc: "Любой ваш критический урон на 8 сек. увеличивает весь наносимый урон." },
        { id: 3, name: "Жестокость", ranks: rankIds("weapon-cruelty", 3), row: 1, col: 2, requires: [], gate: 0, requiredTag: TAG_MELEE,
          desc: "Повышает шанс критического удара оружием на 1% за ранг и запускает связанные с критами таланты ветки." },
        { id: 4, name: "Искусство войны", ranks: rankIds("weapon-artofwar", 1), row: 2, col: 1, requires: [1], gate: 5, requiredTag: TAG_MELEE,
          desc: "Критический удар в ближнем бою делает следующее заклинание мгновенным." },
        { id: 7, name: "Пронзание", ranks: rankIds("weapon-impale", 2), row: 1, col: 3, requires: [3], gate: 5, requiredTag: TAG_MELEE,
          desc: "Критический физический удар на 6 сек. увеличивает получаемый целью физический урон на 4% за ранг." },
        { id: 8, name: "Глубокие раны", ranks: rankIds("weapon-deepwounds", 3), row: 3, col: 0, requires: [7], gate: 10, requiredTag: TAG_MELEE,
          desc: "Критические удары в ближнем бою вызывают на 12 сек. кровотечение, усиленное силой атаки." },
        { id: 13, name: "Ударная волна", ranks: rankIds("weapon-shockwave", 3), row: 2, col: 2, requires: [1], gate: 10, requiredTag: TAG_MELEE,
          desc: "Прямые физические атаки с вероятностью 3% за ранг наносят усиленный силой атаки физический удар. Не чаще раза в 2 сек." },
        { id: 9, name: "Тяжелая рука", ranks: rankIds("weapon-heavyhand", 2), row: 4, col: 1, requires: [], gate: 15, requiredTag: TAG_MELEE,
          desc: "Удары в ближнем бою с небольшим шансом оглушают цель на 2 сек. Не чаще раза в 10 сек." },
        { id: 11, name: "Шквал", ranks: rankIds("weapon-flurry", 5), row: 4, col: 3, requires: [], gate: 15, requiredTag: TAG_MELEE,
          desc: "Критический удар ускоряет следующие 3 атаки ближнего боя." },
        { id: 5, name: "Кровожадность", ranks: rankIds("weapon-bloodlust", 3), row: 3, col: 2, requires: [3], gate: 15, requiredTag: TAG_MELEE,
          desc: "Критический физический удар восстанавливает 1% максимального здоровья за ранг. Не чаще раза в 4 сек." },
        { id: 12, name: "Железная хватка", ranks: rankIds("weapon-grip", 2), row: 4, col: 0, requires: [1], gate: 15, requiredTag: TAG_MELEE,
          desc: "Если враг уклонился, парировал или вы промахнулись физической атакой, шанс попадания и критического удара оружием повышается на 15% за ранг на 6 сек." },
        { id: 14, name: "Боевая закалка", ranks: rankIds("weapon-battle-ward", 3), row: 4, col: 2, requires: [2], gate: 15, requiredTag: TAG_MELEE,
          desc: "Критический физический удар окружает вас растущим с уровнем щитом. Не чаще раза в 10 сек." },
        { id: 6, name: "Упоение битвой", ranks: rankIds("weapon-warstorm", 1), row: 5, col: 2, requires: [4, 11], gate: 20, requiredTag: TAG_MELEE,
          desc: "Убийство врага вызывает прилив ярости: скорость атаки резко возрастает на 10 сек." },
        { id: 10, name: "Расправа", ranks: rankIds("weapon-execution", 2), row: 5, col: 0, requires: [8], gate: 20, requiredTag: TAG_MELEE,
          desc: "Убийство врага восстанавливает 5% максимального здоровья за ранг." },
        { id: 15, name: "Неудержимость", ranks: rankIds("weapon-unstoppable", 1), row: 6, col: 1, requires: [6, 8, 11], gate: 25, requiredTag: TAG_MELEE,
          desc: "Критический физический удар с вероятностью 20% на 8 сек. увеличивает физический урон и скорость атак на 10%. Не чаще раза в 20 сек." },
    ],
};

export const VITALITY_TREE: TalentTree = {
    treeId: TREE_VITALITY,
    name: "ЖИВУЧЕСТЬ",
    background: "Interface\\TalentFrame\\PaladinHoly",
    nodes: [
        { id: 1, name: "Дар жизни", ranks: rankIds("vital-gift", 3), row: 0, col: 1, requires: [], gate: 0, requiredTag: TAG_HEAL,
          desc: "Критическое исцеление окружает цель дополнительным щитом, сила которого растет с вашим уровнем." },
        { id: 2, name: "Просветление", ranks: rankIds("vital-clarity", 3), row: 0, col: 2, requires: [], gate: 0, requiredTag: TAG_HEAL,
          desc: "Критическое исцеление любой школы возвращает 1% максимального запаса маны за ранг." },
        { id: 3, name: "Оплот", ranks: rankIds("vital-bulwark", 3), row: 1, col: 3, requires: [], gate: 0, requiredTag: TAG_SHIELD,
          desc: "Блокирование на 6 сек. снижает весь получаемый урон на 4% за ранг." },
        { id: 11, name: "Духовное средоточие", ranks: rankIds("vital-focus", 3), row: 1, col: 0, requires: [], gate: 0, requiredTag: TAG_HEAL,
          desc: "Получение урона на 3 сек. за ранг полностью защищает произносимые заклинания от задержки. Не чаще раза в 10 сек." },
        { id: 4, name: "Искра жизни", ranks: rankIds("vital-lifespark", 3), row: 2, col: 1, requires: [1], gate: 5, requiredTag: TAG_HEAL,
          desc: "Критическое исцеление дополнительно лечит цель 9 сек.; эффект усиливается силой заклинаний." },
        { id: 5, name: "Оберег", ranks: rankIds("vital-ward", 3), row: 2, col: 3, requires: [3], gate: 5, requiredTag: TAG_SHIELD,
          desc: "Полученный критический удар окружает вас растущим с уровнем щитом." },
        { id: 8, name: "Милость", ranks: rankIds("vital-grace", 5), row: 2, col: 2, requires: [], gate: 5, requiredTag: TAG_HEAL,
          desc: "Критическое исцеление с вероятностью 20% за ранг ускоряет следующее подходящее заклинание." },
        { id: 9, name: "Инстинкт выживания", ranks: rankIds("vital-instinct", 2), row: 3, col: 0, requires: [5], gate: 10,
          desc: "Полученный критический удар на 10 сек. увеличивает получаемое вами исцеление." },
        { id: 12, name: "Медитация", ranks: rankIds("vital-meditation", 3), row: 4, col: 0, requires: [], gate: 15, requiredTag: TAG_HEAL,
          desc: "Получение урона восстанавливает 1% максимального запаса маны за ранг. Не чаще раза в 10 сек." },
        { id: 10, name: "Резонанс жизни", ranks: rankIds("vital-resonance", 5), row: 4, col: 2, requires: [1, 4], gate: 15, requiredTag: TAG_HEAL,
          desc: "Критическое исцеление восстанавливает вам 1% максимального здоровья за ранг." },
        { id: 6, name: "Свет в бою", ranks: rankIds("vital-lightindark", 2), row: 5, col: 1, requires: [4], gate: 20, requiredTag: TAG_HOLY,
          desc: "Урон от магии Света с шансом исцеляет вас; лечение усиливается силой заклинаний." },
        { id: 7, name: "Возмездие Света", ranks: rankIds("vital-lightguard", 2), row: 5, col: 3, requires: [5], gate: 20, requiredTag: TAG_SHIELD,
          desc: "Блокирование удара обжигает атакующего магией Света, усиленной силой заклинаний." },
    ],
};

export const COMPANION_TREE: TalentTree = {
    treeId: TREE_COMPANION,
    name: "СПУТНИКИ",
    background: "Interface\\TalentFrame\\HunterBeastMastery",
    nodes: [
        { id: 1, name: "Боевой напарник", ranks: rankIds("companion-damage", 5), row: 0, col: 0, requires: [], gate: 0,
          desc: "Увеличивает весь урон активного спутника на 2% за ранг." },
        { id: 2, name: "Быстрая выучка", ranks: rankIds("companion-attack-haste", 3), row: 0, col: 1, requires: [], gate: 0,
          desc: "Увеличивает скорость ближних и дальних атак спутника на 3% за ранг." },
        { id: 3, name: "Чёткая команда", ranks: rankIds("companion-cast-haste", 3), row: 0, col: 2, requires: [], gate: 0,
          desc: "Увеличивает скорость произнесения заклинаний спутника на 3% за ранг." },
        { id: 4, name: "Крепкая связь", ranks: rankIds("companion-health", 3), row: 0, col: 3, requires: [], gate: 0,
          desc: "Увеличивает максимальный запас здоровья спутника на 5% за ранг." },
        { id: 5, name: "Хищный инстинкт", ranks: rankIds("companion-crit", 3), row: 1, col: 1, requires: [1], gate: 5,
          desc: "Повышает шанс критического эффекта атак и заклинаний спутника на 2% за ранг." },
        { id: 6, name: "Верный защитник", ranks: rankIds("companion-defense", 3), row: 1, col: 3, requires: [4], gate: 5,
          desc: "Снижает весь получаемый спутником урон на 4% за ранг." },
        { id: 7, name: "Аура единства", ranks: rankIds("companion-unity-aura", 3), row: 2, col: 2, requires: [2, 3], gate: 10,
          desc: "Активный спутник усиливает себя, владельца и его группу в радиусе 40 м: урон и скорость атак и заклинаний повышаются на 1% за ранг." },
        { id: 8, name: "Кровавый след", ranks: rankIds("companion-blood-trail", 3), row: 3, col: 0, requires: [2], gate: 15,
          desc: "Прямые физические атаки спутника с вероятностью 5% за ранг вызывают кровотечение." },
        { id: 9, name: "Непредсказуемая магия", ranks: rankIds("companion-spark-echo", 3), row: 3, col: 2, requires: [3], gate: 15,
          desc: "Когда спутник наносит прямой урон заклинанием, с вероятностью 5% за ранг он применяет другую случайную подходящую классовую способность из набора камней: атакующую — по врагу, полезную — по себе или владельцу. Не чаще раза в 3 сек." },
        { id: 10, name: "Добрый знак", ranks: rankIds("companion-care-echo", 2), row: 3, col: 3, requires: [4], gate: 15,
          desc: "Исцеление спутника с вероятностью 10% за ранг накладывает на цель один случайный полезный эффект на 10 сек." },
        { id: 11, name: "Сила стаи", ranks: rankIds("companion-pack-power", 3), row: 4, col: 2, requires: [7], gate: 20,
          desc: "Дополнительно усиливает эффекты «Ауры единства» на 1% за ранг." },
        { id: 12, name: "Совершенная связь", ranks: rankIds("companion-perfect-bond", 1), row: 5, col: 2, requires: [1, 7], gate: 25,
          desc: "Увеличивает урон, скорость атак и скорость заклинаний активного спутника ещё на 5%." },
        { id: 13, name: "Властный рык", ranks: rankIds("companion-tank-threat", 3), row: 2, col: 3, requires: [6], gate: 10,
          desc: "В режиме «Танк» спутник создаёт на 50% больше угрозы за ранг." },
        { id: 14, name: "Страж стаи", ranks: rankIds("companion-tank-taunt", 1), row: 3, col: 1, requires: [13], gate: 15,
          desc: "В режиме «Танк» спутник получает универсальную провокацию с внутренней перезарядкой 8 сек." },
    ],
};
