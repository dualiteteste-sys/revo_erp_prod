import { supabase } from './supabaseClient';

// Re-use the main client instance but with specific headers if needed, 
// or just export the same instance if the config is compatible.
// For now, to avoid "Multiple GoTrueClient", we will reuse the main instance.
// If specific public-only config is needed, we might need a different approach,
// but usually reusing the same client is safer for auth state.

export const supabasePublic = supabase;
