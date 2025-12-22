// src/components/users/ResendInviteButton.tsx
import React from "react";
import { RefreshCw } from "lucide-react";
import { resendInvite } from "@/services/users";
import { useToast } from "@/contexts/ToastProvider";

type Props = {
  userId?: string | null;
  email?: string | null;
  className?: string;
};

export default function ResendInviteButton({ userId, email, className }: Props) {
  const [loading, setLoading] = React.useState(false);
  const { addToast } = useToast();

  const onClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const payload =
        userId ? { user_id: userId } :
        email  ? { email } :
        null;

      if (!payload) {
        addToast("Não foi possível identificar o destinatário do convite.", "error");
        return;
      }

      console.log("[RESEND] invoke resend-invite", payload);
      const res = await resendInvite(payload as any);
      console.log("[RESEND] ok", res);

      const action = res?.action;
      const link   = res?.data?.link as string | undefined;

      if (action === "generated_link" && link) {
        try {
          await navigator.clipboard.writeText(link);
          addToast("Convite reenviado via link. A URL foi copiada para sua área de transferência.", "success");
        } catch {
          addToast(`Convite reenviado via link. Copie e envie ao usuário: ${link}`, "info");
        }
      } else if (action === "invited") {
        addToast("Convite reenviado por e-mail com sucesso.", "success");
      } else {
        addToast("A solicitação foi processada.", "success");
      }
    } catch (err: any) {
      console.error("[RESEND] exception", err);
      addToast(err?.message || "Falha ao reenviar convite.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={className || "inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"}
      disabled={loading}
      title="Reenviar convite"
    >
      <RefreshCw className="h-4 w-4" />
      {loading ? "Reenviando..." : "Reenviar"}
    </button>
  );
}
