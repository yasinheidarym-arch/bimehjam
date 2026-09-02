export const GOFTINO_AI_ALLOWED = 'AI_ALLOWED';
export const GOFTINO_HUMAN_ONLY = 'HUMAN_ONLY';

export type GoftinoAiPolicyInput = {
  goftinoTopicId: string;
  goftinoTopicTitle: string;
  insuranceCategoryId: string;
  active: boolean;
  mode: string;
  fallbackMessage?: string | null;
};

export type GoftinoAiPolicyDecision =
  | { kind: 'ALLOW'; policy: GoftinoAiPolicyInput }
  | { kind: 'HANDOFF'; policy: GoftinoAiPolicyInput | null; reason: 'UNKNOWN_TOPIC' | 'INACTIVE_POLICY' | 'HUMAN_ONLY' };

/** Resolves only a stable identifier; titles never authorize insurance access. */
export function decideGoftinoAiPolicy(
  policies: GoftinoAiPolicyInput[],
  goftinoTopicId?: string | null,
): GoftinoAiPolicyDecision {
  if (!goftinoTopicId) return { kind: 'HANDOFF', policy: null, reason: 'UNKNOWN_TOPIC' };
  const policy = policies.find((item) => item.goftinoTopicId === goftinoTopicId) || null;
  if (!policy) return { kind: 'HANDOFF', policy: null, reason: 'UNKNOWN_TOPIC' };
  if (!policy.active) return { kind: 'HANDOFF', policy, reason: 'INACTIVE_POLICY' };
  if (policy.mode !== GOFTINO_AI_ALLOWED) return { kind: 'HANDOFF', policy, reason: 'HUMAN_ONLY' };
  return { kind: 'ALLOW', policy };
}
