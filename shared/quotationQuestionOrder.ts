export function uniqueQuestionOrder(
  currentIds: string[],
  options: { preferredIds?: string[]; movedQuestion?: { id: string; requestedOrder: number } } = {},
): string[] {
  const uniqueCurrent = [...new Set(currentIds)];
  if (options.preferredIds?.length) {
    const valid = new Set(uniqueCurrent);
    const preferred = [...new Set(options.preferredIds)].filter(id => valid.has(id));
    return [...preferred, ...uniqueCurrent.filter(id => !preferred.includes(id))];
  }
  if (options.movedQuestion && uniqueCurrent.includes(options.movedQuestion.id)) {
    const ids = uniqueCurrent.filter(id => id !== options.movedQuestion!.id);
    const index = Math.max(0, Math.min(ids.length, Math.trunc(options.movedQuestion.requestedOrder) - 1));
    ids.splice(index, 0, options.movedQuestion.id);
    return ids;
  }
  return uniqueCurrent;
}

export function numberedQuestionOrder(ids: string[]): Array<{ id: string; order: number }> {
  return uniqueQuestionOrder(ids).map((id, index) => ({ id, order: index + 1 }));
}

