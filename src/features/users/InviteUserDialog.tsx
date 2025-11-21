import * as React from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
  const [role, setRole] = React.useState("READONLY");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; role?: string }>({});
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setDialogError(null);

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

      addToast(`Convite enviado com sucesso para ${email}.`, "success", "Convite Enviado");
      onInviteSent();
      onClose();
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
      {dialogError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-4 rounded-r-lg" role="alert">
          <p className="font-bold">Erro no Convite</p>
          <p className="text-sm">{dialogError}</p>
        </div>
      )}

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

      <div>
        <Select label="Papel" id="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="READONLY">Leitura</option>
          <option value="OPS">Operações</option>
          <option value="FINANCE">Financeiro</option>
          <option value="ADMIN">Admin</option>
        </Select>
        {errors.role && <p className="text-sm text-red-600 mt-1">{errors.role}</p>}
      </div>

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
    </form>
  );
}
