import * as React from "react";
import { z } from "zod";
import { Copy, Loader2 } from "lucide-react";
import { inviteUser } from "@/services/users";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/forms/Input";
import Select from "@/components/ui/forms/Select";
import { useToast } from "@/contexts/ToastProvider";

const schema = z.object({
  email: z.string().email({ message: "Formato de e-mail inválido." }),
  role: z.string().min(1, { message: "Selecione um papel." }),
});

type Props = {
  onClose: () => void;
  onInviteSent: () => void;
};

export function InviteUserDialog({ onClose, onInviteSent }: Props) {
  const { addToast } = useToast();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("VIEWER");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; role?: string }>({});
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const [inviteResult, setInviteResult] = React.useState<{ action?: string; link?: string } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setDialogError(null);
    setInviteResult(null);

    const parsed = schema.safeParse({ email, role });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        role: fieldErrors.role?.[0],
      });
      return;
    }

    setLoading(true);
    try {
      const res = await inviteUser(email, role);

      if (!res.ok) {
        throw new Error(res.error ?? "Erro desconhecido ao convidar usuário.");
      }

      const link = res.action_link || res?.data?.action_link || null;
      const action = res.action || res?.data?.action || undefined;

      setInviteResult({ action, link: link ?? undefined });

      addToast(
        action === "link_only"
          ? `Não foi possível enviar e-mail automaticamente. Copie o link do convite e envie ao usuário.`
          : `Convite enviado com sucesso para ${email}.`,
        action === "link_only" ? "warning" : "success",
        "Convite"
      );
      onInviteSent();
    } catch (err: any) {
      const errorMessage = err?.message ?? "Falha ao enviar o convite.";
      setDialogError(errorMessage);
      addToast(errorMessage, "error", "Falha no Convite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-4">
      {inviteResult ? (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 text-blue-950 p-4 rounded-xl">
            <div className="font-semibold">Convite preparado</div>
            <div className="text-sm mt-1">
              {inviteResult.action === "link_only"
                ? "O e-mail não foi enviado automaticamente (rate limit/SMTP/spam). Você pode copiar o link e enviar por WhatsApp/Slack."
                : "Se o e-mail não chegar, copie o link abaixo e envie ao usuário."}
            </div>
          </div>

          {inviteResult.link ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-slate-900">Link do convite</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={inviteResult.link}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50"
                  aria-label="Link do convite"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteResult.link!);
                      addToast("Link copiado.", "success");
                    } catch {
                      addToast("Não foi possível copiar o link.", "error");
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                  <span className="ml-2">Copiar</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-950 p-4 rounded-xl text-sm">
              Link não disponível (tente reenviar o convite).
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}

      {dialogError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-4 rounded-r-lg" role="alert">
          <p className="font-bold">Erro no Convite</p>
          <p className="text-sm">{dialogError}</p>
        </div>
      )}

      {inviteResult ? null : (
      <Input
        label="E-mail"
        id="email"
        type="email"
        placeholder="email@empresa.com"
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      )}

      {inviteResult ? null : (
      <div>
        <Select label="Papel" id="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="VIEWER">Leitura</option>
          <option value="MEMBER">Membro</option>
          <option value="OPS">Operações</option>
          <option value="FINANCE">Financeiro</option>
          <option value="ADMIN">Admin</option>
        </Select>
        {errors.role && <p className="text-sm text-red-600 mt-1">{errors.role}</p>}
      </div>
      )}

      {inviteResult ? null : (
      <div className="flex gap-2 justify-end pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          aria-label="Cancelar convite"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading}
          aria-label="Confirmar envio do convite"
        >
          {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>) : "Enviar convite"}
        </Button>
      </div>
      )}
    </form>
  );
}
