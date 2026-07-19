/**
 * Все профессии доступны всем, но ПРОКАЧИВАЮТСЯ: на логине выдаётся только
 * ранг «Ученик» (кап 75); когда скилл упирается в кап текущего ранга,
 * следующий ранг выучивается автоматически (проверка на периодическом
 * таймере gem-abilities — НЕ отдельным таймером, см. гочу про AddTimer).
 * Ранги выше положенного по скиллу снимаются (откат для персонажей,
 * получивших Grand Master во время тестов; ядро при этом само клампит
 * кап скилла и отучивает рецепты выше нового значения при логине).
 *
 * Id — стандартные ранговые спеллы 3.3.5, проверены по Spell.dbc датасета.
 * Лимит «2 основные профессии» ядро применяет только в UI тренера.
 */

import { playerText } from "./localization";

interface ProfChain {
    skill: number;   // SkillLine id
    ranks: number[]; // спеллы рангов: Apprentice..Grand Master
    grantedSpells?: number[]; // служебные спеллы профессии, которые должны быть известны всегда
}

const PROFESSIONS: ProfChain[] = [
    { skill: 164, ranks: [2018, 3100, 3538, 9785, 29844, 51300] },   // Кузнечное дело
    { skill: 165, ranks: [2108, 3104, 3811, 10662, 32549, 51302] },  // Кожевничество
    { skill: 197, ranks: [3908, 3909, 3910, 12180, 26790, 51309] },  // Портняжное дело
    { skill: 202, ranks: [4036, 4037, 4038, 12656, 30350, 51306] },  // Инженерное дело
    { skill: 333, ranks: [7411, 7412, 7413, 13920, 28029, 51313] },  // Наложение чар
    { skill: 755, ranks: [25229, 25230, 28894, 28895, 28897, 51311] }, // Ювелирное дело
    { skill: 773, ranks: [45357, 45358, 45359, 45360, 45361, 45363] }, // Начертание
    { skill: 171, ranks: [2259, 3101, 3464, 11611, 28596, 51304] },  // Алхимия
    { skill: 182, ranks: [2366, 2368, 3570, 11993, 28695, 50300] },  // Травничество
    { skill: 186, ranks: [2575, 2576, 3564, 10248, 29354, 50310] },  // Горное дело
    { skill: 393, ranks: [8613, 8617, 8618, 10768, 32678, 50305] },  // Снятие шкур
    { skill: 185, ranks: [2550, 3102, 3413, 18260, 33359, 51296] },  // Кулинария
    { skill: 129, ranks: [3273, 3274, 7924, 10846, 27028, 45542] },  // Первая помощь
    { skill: 356, ranks: [7620, 7731, 7732, 18248, 33095, 51294] },  // Рыбная ловля
];

const RANK_CAPS = [75, 150, 225, 300, 375, 450];
let customProfessionsInitialized = false;

/** Подключает профессии других модулей после того, как доступны generated IDs/tags. */
export function initCustomProfessions(): void {
    if (customProfessionsInitialized) return;
    customProfessionsInitialized = true;
    PROFESSIONS.push({
        skill: GetID("SkillLine", "base-building", "woodcutting"),
        ranks: [
            UTAG("base-building", "spell/woodcutting-rank-1"),
            UTAG("base-building", "spell/woodcutting-rank-2"),
            UTAG("base-building", "spell/woodcutting-rank-3"),
            UTAG("base-building", "spell/woodcutting-rank-4"),
            UTAG("base-building", "spell/woodcutting-rank-5"),
            UTAG("base-building", "spell/woodcutting-rank-6"),
        ],
        grantedSpells: [UTAG("base-building", "spell/woodcutting-gather")],
    });
}

/** Положенный ранг для данного значения скилла (0 = Ученик). */
function requiredRank(skillValue: number): number {
    let rank = 0;
    for (let i = 0; i < RANK_CAPS.length - 1; i++) {
        if (skillValue >= RANK_CAPS[i]) rank = i + 1;
    }
    return rank;
}

function knownRank(player: TSPlayer, chain: ProfChain): number {
    let rank = -1;
    for (let i = 0; i < chain.ranks.length; i++) {
        if (player.HasSpell(chain.ranks[i])) rank = i;
    }
    return rank;
}

function ensureApprenticeSkill(player: TSPlayer, chain: ProfChain): void {
    if (!player.HasSkill(chain.skill) || Number(player.GetSkillValue(chain.skill)) < 1) {
        player.SetSkill(chain.skill, 1, 1, RANK_CAPS[0]);
    }
}

/** Логин: выдать «Ученика» отсутствующим профессиям, снять лишние ранги. */
export function grantAllProfessions(player: TSPlayer): void {
    for (let i = 0; i < PROFESSIONS.length; i++) {
        const chain = PROFESSIONS[i];
        if (chain.grantedSpells) {
            for (let s = 0; s < chain.grantedSpells.length; s++) {
                if (!player.HasSpell(chain.grantedSpells[s])) player.LearnSpell(chain.grantedSpells[s]);
            }
        }
        const known = knownRank(player, chain);
        if (known == -1) {
            player.LearnSpell(chain.ranks[0]);
            ensureApprenticeSkill(player, chain);
            continue;
        }
        const value = Number(player.GetSkillValue(chain.skill));
        const required = requiredRank(value);
        for (let r = chain.ranks.length - 1; r > required && r > 0; r--) {
            if (player.HasSpell(chain.ranks[r])) {
                player.RemoveSpell(chain.ranks[r], false, false);
            }
        }
        ensureApprenticeSkill(player, chain);
    }
}

/**
 * Периодически (из существующего 2с-таймера gem-abilities): скилл упёрся
 * в кап текущего ранга → выучить следующий ранг.
 */
export function maybeUpgradeProfessions(player: TSPlayer): void {
    for (let i = 0; i < PROFESSIONS.length; i++) {
        const chain = PROFESSIONS[i];
        const known = knownRank(player, chain);
        if (known < 0 || known >= chain.ranks.length - 1) continue;
        const value = Number(player.GetSkillValue(chain.skill));
        if (value >= RANK_CAPS[known]) {
            player.LearnSpell(chain.ranks[known + 1]);
            player.SendBroadcastMessage(playerText(
                player,
                "|cff40ff40Profession upgraded: the next rank is now available.|r",
                "|cff40ff40Профессия повышена: открыт следующий разряд.|r",
            ));
        }
    }
}
