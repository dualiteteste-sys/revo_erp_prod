export type OnboardingIntent = {
    planSlug: "START" | "PRO" | "MAX" | "ULTRA";
    billingCycle: "monthly" | "yearly";
    type: "trial" | "subscribe";
};
