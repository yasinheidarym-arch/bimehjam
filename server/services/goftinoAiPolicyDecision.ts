export type GoftinoAiPolicyInput = {
  goftinoTopicId: string;
  goftinoTopicTitle: string;
  insuranceCategoryId: string;
};

export type GoftinoAiPolicyDecision =
  | { kind: 'ALLOW'; policy: GoftinoAiPolicyInput }
  | { kind: 'HANDOFF'; policy: GoftinoAiPolicyInput | null; reason: 'UNKNOWN_TOPIC' | 'DISABLED' | 'INVALID_CATEGORY' };

/** Resolves only a stable identifier; titles never authorize insurance access. */
export function decideGoftinoAiPolicy(
  policy: GoftinoAiPolicyInput | null,
  enabled: boolean,
): GoftinoAiPolicyDecision {
  if (!policy) return { kind: 'HANDOFF', policy: null, reason: 'UNKNOWN_TOPIC' };
  if (!policy.insuranceCategoryId) return { kind: 'HANDOFF', policy, reason: 'INVALID_CATEGORY' };
  if (!enabled) return { kind: 'HANDOFF', policy, reason: 'DISABLED' };
  return { kind: 'ALLOW', policy };
}
