import { supabase as client } from './supabaseClient';

// Re-export the singleton instance from supabaseClient.ts
// This resolves the "Multiple GoTrueClient instances" warning.
export const supabase = client;
