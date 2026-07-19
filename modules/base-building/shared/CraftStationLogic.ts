/** Pure selection rule shared by runtime and the executable fixture test. */
export function selectHighestTierCraftRecipe(
    executableRows: number[][],
    roll01: number,
    bias: number = 0,
): number[] | undefined {
    let bestTier = 0;
    const best: number[][] = [];
    for (let i = 0; i < executableRows.length; i++) {
        const row = executableRows[i];
        if (row.length >= 8) {
            const tier = Math.floor(row[5]);
            if (tier > bestTier) {
                bestTier = tier;
                while (best.length > 0) best.pop();
                best.push(row);
            } else if (tier == bestTier) {
                best.push(row);
            }
        }
    }
    if (best.length == 0) return undefined;
    const roll = Math.max(0, Math.min(0.999999, roll01));
    if (bias <= 0) return best[Math.floor(roll * best.length)];
    // Bias only changes weights inside the already-selected highest tier.
    // Output ids provide a stable four-way partition without duplicating the
    // generated item catalog in livescripts.
    const bucket = (Math.floor(bias) - 1) % 4;
    let total = 0;
    for (let i = 0; i < best.length; i++) total += best[i][1] % 4 == bucket ? 2.5 : 1;
    let weighted = roll * total;
    for (let i = 0; i < best.length; i++) {
        weighted -= best[i][1] % 4 == bucket ? 2.5 : 1;
        if (weighted < 0) return best[i];
    }
    return best[best.length - 1];
}
