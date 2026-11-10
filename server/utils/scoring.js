export function calculateScore(distanceKm, hintsUsed = 0, isCorrect = false) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new TypeError('distanceKm must be a non-negative finite number');
  }
  if (![0, 1, 2].includes(hintsUsed)) {
    throw new RangeError('hintsUsed must be 0, 1 or 2');
  }

  const hintMultiplier = [1, 0.8, 0.6][hintsUsed];
  const distanceScore = isCorrect ? 1000 : 1000 * Math.exp(-distanceKm / 2000);
  return Math.max(0, Math.round(distanceScore * hintMultiplier));
}
