import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deletePendingInvitation } from "@/services/users";

type Props = {
  userId: string;
  status: string; // "PENDING" para convites
  onRemoved?: (userId: string) => void;
};

export default function RemoveInviteButton({ userId, status, onRemoved }: Props) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (loading || status !== "PENDING") return;
    setLoading(true);
    try {
      const removed = await deletePendingInvitation(userId);
      if (removed > 0) {
        console.log("[RPC][DELETE_INVITE] removed", { userId, removed });
        onRemoved?.(userId);
      } else {
        console.warn("[RPC][DELETE_INVITE] nada removido (idempotente)", { userId });
      }
    } catch (err: any) {
      console.error("[RPC][DELETE_INVITE] error", err);
      alert(err?.message ?? "Falha ao remover convite. Veja o console para detalhes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || status !== "PENDING"}
      className="flex items-center gap-1.5 text-xs px-2 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title={status === "PENDING" ? "Remover convite" : "Somente convites pendentes podem ser removidos"}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      {loading ? "Removendo..." : "Remover"}
    </button>
  );
}
