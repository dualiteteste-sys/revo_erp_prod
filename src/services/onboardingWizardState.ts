import { callRpc } from "@/lib/api";

export type OnboardingWizardStateRow = {
  empresa_id: string;
  wizard_dismissed_at: string | null;
  last_step_key: string | null;
  steps: Record<string, unknown>;
};

export async function onboardingWizardStateGet(): Promise<OnboardingWizardStateRow | null> {
  const rows = await callRpc<OnboardingWizardStateRow[]>("onboarding_wizard_state_get", {});
  return rows?.[0] ?? null;
}

export async function onboardingWizardStateUpsert(input: {
  wizard_dismissed_at?: string | null;
  last_step_key?: string | null;
  steps?: Record<string, unknown> | null;
  replace_steps?: boolean;
}): Promise<OnboardingWizardStateRow | null> {
  const rows = await callRpc<OnboardingWizardStateRow[]>("onboarding_wizard_state_upsert", {
    p_wizard_dismissed_at: input.wizard_dismissed_at ?? null,
    p_last_step_key: input.last_step_key ?? null,
    p_steps: input.steps ?? null,
    p_replace_steps: input.replace_steps ?? false,
  });
  return rows?.[0] ?? null;
}

