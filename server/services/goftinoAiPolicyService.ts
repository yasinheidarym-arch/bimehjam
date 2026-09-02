import prisma from '../db/client';
import { decideGoftinoAiPolicy, GoftinoAiPolicyInput, GoftinoAiPolicyDecision } from './goftinoAiPolicyDecision';

export { decideGoftinoAiPolicy, GOFTINO_AI_ALLOWED, GOFTINO_HUMAN_ONLY } from './goftinoAiPolicyDecision';
export type { GoftinoAiPolicyInput, GoftinoAiPolicyDecision } from './goftinoAiPolicyDecision';

export async function resolveGoftinoAiPolicy(goftinoTopicId?: string | null): Promise<GoftinoAiPolicyDecision> {
  if (!goftinoTopicId) return decideGoftinoAiPolicy([], goftinoTopicId);

  const policy = await prisma.goftinoAiResponsePolicy.findUnique({
    where: { goftinoTopicId },
    include: { insuranceCategory: { select: { id: true, status: true } } },
  });

  if (!policy) return decideGoftinoAiPolicy([], goftinoTopicId);

  const normalized: GoftinoAiPolicyInput = {
    goftinoTopicId: policy.goftinoTopicId,
    goftinoTopicTitle: policy.goftinoTopicTitle,
    insuranceCategoryId: policy.insuranceCategoryId,
    active: policy.active && policy.insuranceCategory.status === 'ACTIVE',
    mode: policy.mode,
    fallbackMessage: policy.fallbackMessage,
  };

  return decideGoftinoAiPolicy([normalized], goftinoTopicId);
}
