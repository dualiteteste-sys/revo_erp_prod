export type OnboardingIntent = {
    planSlug: "ESSENCIAL" | "PRO" | "MAX" | "INDUSTRIA" | "SCALE" | "START" | "ULTRA";
    billingCycle: "monthly" | "yearly";
    type: "trial" | "subscribe";
};
