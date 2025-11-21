import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingForm from "@/components/onboarding/OnboardingForm";
import { useAuth } from "@/contexts/AuthProvider";
import { useSupabase } from "@/providers/SupabaseProvider";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function OnboardingPage() {
  const { signOut, session } = useAuth();
  const supabase = useSupabase();
  const navigate = useNavigate();

  // ProtectedRoute já garante que existe sessão, mas por segurança:
  useEffect(() => {
    if (!session) {
      navigate("/auth/login", { replace: true });
    }
  }, [session, navigate]);

  if (!session) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative">
      <div className="absolute top-4 right-4">
        <button
          onClick={signOut}
          className="bg-white/50 px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-white/80 transition-colors"
        >
          Sair
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <OnboardingForm />
      </motion.div>
    </div>
  );
}
