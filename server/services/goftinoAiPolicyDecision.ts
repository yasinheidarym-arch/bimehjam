export type GoftinoAiPolicyInput = {
  goftinoTopicId: string;
  goftinoTopicTitle: string;
  insuranceCategoryId: string | null;
};

export type GoftinoAiPolicyDecision =
  | { kind: 'ALLOW'; scope: 'CATEGORY' | 'GENERAL'; policy: GoftinoAiPolicyInput }
  | { kind: 'HANDOFF'; policy: GoftinoAiPolicyInput | null; reason: 'UNKNOWN_TOPIC' | 'DISABLED' };

export type GoftinoAiResponseMode = 'AI' | 'SILENT' | 'HANDOFF_MESSAGE';

/** Resolves only a stable identifier; titles never authorize insurance access. */
export function decideGoftinoAiPolicy(
  policy: GoftinoAiPolicyInput | null,
  enabled: boolean,
): GoftinoAiPolicyDecision {
  if (!policy) return { kind: 'HANDOFF', policy: null, reason: 'UNKNOWN_TOPIC' };
  if (!enabled) return { kind: 'HANDOFF', policy, reason: 'DISABLED' };
  return { kind: 'ALLOW', scope: policy.insuranceCategoryId ? 'CATEGORY' : 'GENERAL', policy };
}

/** Disabled catalog topics must produce no customer-visible AI activity. */
export function goftinoAiResponseMode(decision: GoftinoAiPolicyDecision): GoftinoAiResponseMode {
  if (decision.kind === 'ALLOW') return 'AI';
  return decision.reason === 'DISABLED' ? 'SILENT' : 'HANDOFF_MESSAGE';
}
