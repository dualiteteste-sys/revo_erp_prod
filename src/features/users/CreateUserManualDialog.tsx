import * as React from "react";
import { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
import { manualCreateUser } from "@/services/users";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import Input from "@/components/ui/forms/Input";
import Select from "@/components/ui/forms/Select";
import { useToast } from "@/contexts/ToastProvider";

type Props = {
  onCreated?: () => void;
  defaultRole?: string;
};

const schema = z.object({
  email: z.string().email({ message: "Formato de e-mail inválido." }),
  password: z.string().min(8, { message: "Senha precisa ter pelo menos 8 caracteres." }),
  role: z.enum(["OWNER", "ADMIN", "FINANCE", "OPS", "READONLY"], {
    required_error: "Selecione um papel.",
    invalid_type_error: "Papel inválido.",
  }),
});

export default function CreateUserManualDialog({ onCreated, defaultRole = "ADMIN" }: Props) {
  const { addToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState(generateTempPassword());
  const [role, setRole] = React.useState(defaultRole);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string; role?: string }>({});

  function resetForm() {
    setEmail("");
    setPassword(generateTempPassword());
    setRole(defaultRole);
    setErrors({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = schema.safeParse({ email, password, role });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
        role: fieldErrors.role?.[0],
      });
      return;
    }

    setSubmitting(true);
    console.log("[FORM][USERS][CREATE_MANUAL] submit", { email, role });
    const resp = await manualCreateUser({ email, password, role });

    setSubmitting(false);
    if (!resp.ok) {
      addToast(humanizeError(resp.error), "error", "Erro ao criar usuário");
      return;
    }

    addToast(`E-mail: ${resp.email} • Role: ${resp.role} • Status: ${resp.status}`, "success", "Usuário incluído");
    setOpen(false);
    resetForm();
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Novo usuário (manual)
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby="create-user-manual-desc">
        <DialogHeader>
          <DialogTitle>Incluir usuário (manual)</DialogTitle>
          <DialogDescription id="create-user-manual-desc">
            Informe o e-mail, defina uma senha temporária e escolha o papel. O usuário aparecerá com status <strong>PENDING</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 pt-4">
          <Input
            label="E-mail"
            id="email"
            type="email"
            placeholder="usuario@empresa.com"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />

          <div>
            <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700" htmlFor="password">Senha temporária</label>
                <Button type="button" variant="secondary" size="sm" onClick={() => setPassword(generateTempPassword())}>
                    Gerar nova
                </Button>
            </div>
            <Input
                label=""
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
            />
            {errors.password ? null : <p className="text-xs text-gray-500 mt-1">Compartilhe esta senha ao entregar o acesso ao usuário.</p>}
          </div>

          <div>
            <Select label="Papel" id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="OWNER">OWNER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="FINANCE">FINANCE</option>
                <option value="OPS">OPS</option>
                <option value="READONLY">READONLY</option>
            </Select>
            {errors.role && <p className="text-sm text-red-600 mt-1">{errors.role}</p>}
          </div>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" className={cn(submitting && "opacity-90")} disabled={submitting}>
              {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>) : "Incluir usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function generateTempPassword() {
  // 12 chars, inclui letras + números; frontend apenas sugere, admin pode editar
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@$%*";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function humanizeError(code?: string) {
  switch (code) {
    case "PERMISSION_DENIED": return "Você não tem permissão para gerenciar usuários.";
    case "INVALID_PAYLOAD": return "Dados inválidos. Verifique e-mail, senha e papel.";
    case "INVALID_ROLE_SLUG": return "Papel (role) inválido.";
    case "NO_COMPANY_CONTEXT": return "Empresa ativa não encontrada.";
    case "AUTH_CREATE_FAILED": return "Falha ao criar usuário no Auth.";
    case "PASSWORD_UPDATE_FAILED": return "Falha ao atualizar senha do usuário.";
    case "LINK_FAILED": return "Falha ao vincular usuário à empresa.";
    default: return "Falha ao processar sua solicitação.";
  }
}
