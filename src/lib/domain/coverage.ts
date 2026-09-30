/** Pure matrix coverage metrics (shared by server and client). */
export function matrixCoverage(cos: { id: string; code: string }[], outcomes: { id: string; code: string }[], cells: { co_id: string; outcome_id: string; value: number }[]) {
  const mapped = cells.filter((c) => c.value > 0);
  const unmappedCos = cos.filter((c) => !mapped.some((m) => m.co_id === c.id)).map((c) => c.code);
  const unmappedOutcomes = outcomes.filter((o) => !mapped.some((m) => m.outcome_id === o.id)).map((o) => o.code);
  return {
    coCoverage: cos.length ? Math.round(((cos.length - unmappedCos.length) / cos.length) * 100) : 0,
    outcomeCoverage: outcomes.length ? Math.round(((outcomes.length - unmappedOutcomes.length) / outcomes.length) * 100) : 0,
    unmappedCos,
    unmappedOutcomes,
  };
}

