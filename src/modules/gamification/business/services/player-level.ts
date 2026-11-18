export const levelThreshold = (level: number) => 25 * (level - 1) * (level + 2);
export function playerProgress(totalXp: number) {
  if (!Number.isSafeInteger(totalXp) || totalXp < 0) throw new Error('Invalid XP ledger total');
  let playerLevel = Math.max(1, Math.floor((Math.sqrt(9 + (4 * totalXp) / 25) - 1) / 2));
  while (levelThreshold(playerLevel + 1) <= totalXp) playerLevel++;
  while (levelThreshold(playerLevel) > totalXp) playerLevel--;
  const xpIntoLevel = totalXp - levelThreshold(playerLevel);
  const xpForNextLevel = levelThreshold(playerLevel + 1) - levelThreshold(playerLevel);
  return {
    totalXp,
    playerLevel,
    xpIntoLevel,
    xpForNextLevel,
    xpRemainingToNextLevel: xpForNextLevel - xpIntoLevel,
    levelProgressPercent: Math.floor((100 * xpIntoLevel) / xpForNextLevel),
  };
}
