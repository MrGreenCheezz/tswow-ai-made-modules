/**
 * Spend one shared station budget fairly across recipes.
 *
 * A failed recipe is skipped for the current pass. Any success resets the
 * miss counter so a single available recipe can still consume the full budget.
 */
export function runRoundRobinStationBudget(
    recipeCount: number,
    operationBudget: number,
    startCursor: number,
    tryOperation: (recipeIndex: number) => boolean,
): number {
    const count = Math.max(0, Math.floor(recipeCount));
    const budget = Math.max(0, Math.floor(operationBudget));
    if (count == 0 || budget == 0) return 0;

    let cursor = Math.floor(startCursor) % count;
    if (cursor < 0) cursor += count;
    let misses = 0;
    let completed = 0;
    while (completed < budget && misses < count) {
        const succeeded = tryOperation(cursor);
        cursor = (cursor + 1) % count;
        if (succeeded) {
            completed++;
            misses = 0;
        } else {
            misses++;
        }
    }
    return completed;
}
