export type FaqReadStore = {
  fAQ: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
};

export async function readFaqs(
  store: FaqReadStore,
  query: { search?: unknown; category?: unknown },
) {
  const { search, category } = query;
  return store.fAQ.findMany({
    where: {
      ...(category ? { insuranceType: String(category) } : {}),
      ...(search
        ? {
            OR: [
              { question: { contains: String(search) } },
              { answer: { contains: String(search) } },
              { keywords: { contains: String(search) } },
            ],
          }
        : {}),
    },
    orderBy: { usageCount: 'desc' },
  });
}
