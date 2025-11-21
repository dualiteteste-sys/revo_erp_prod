import React, { createContext, useContext, ReactNode } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/types/database.types';

const SupabaseContext = createContext<SupabaseClient<Database> | undefined>(undefined);

export const SupabaseProvider = ({ children }: { children: ReactNode }) => {
  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  );
};

/**
 * Custom hook to access the Supabase client instance.
 * Throws an error if used outside of a SupabaseProvider.
 */
export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};
