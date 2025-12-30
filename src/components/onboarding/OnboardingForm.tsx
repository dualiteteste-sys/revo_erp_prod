import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabase } from "@/providers/SupabaseProvider";
import { Loader2, Search } from "lucide-react";
import { useToast } from "@/contexts/ToastProvider";
import { fetchCnpjData } from "@/services/externalApis";
import { bootstrapEmpresaParaUsuarioAtual } from "@/services/session";
import { cnpjMask } from "@/lib/masks";

export default function OnboardingForm() {
  const supabase = useSupabase();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [form, setForm] = useState({ nome: "", fantasia: "", cnpj: "" });
  const [submitting, setSubmitting] = useState(false);
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const razaoSocialInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const finalValue = name === 'cnpj' ? cnpjMask(value) : value;
    setForm((s) => ({ ...s, [name]: finalValue }));
  };

  const handleFetchCnpjData = async () => {
    const cleanedCnpj = form.cnpj.replace(/\D/g, '');
    if (cleanedCnpj.length !== 14) {
      addToast('Por favor, insira um CNPJ válido com 14 dígitos.', 'warning');
      return;
    }

    setIsFetchingCnpj(true);
    try {
      const data = await fetchCnpjData(cleanedCnpj);
      setForm(prev => ({
        ...prev,
        nome: data.razao_social || '',
        fantasia: data.nome_fantasia || '',
      }));
      addToast('Dados da empresa preenchidos!', 'success');
      razaoSocialInputRef.current?.focus();
    } catch (apiError: any) {
      addToast('CNPJ não encontrado. Por favor, preencha os dados manualmente.', 'error');
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  const waitSession = async () => {
    const delays = [0, 200, 500, 1000];
    for (const ms of delays) {
      if (ms) await new Promise((r) => setTimeout(r, ms));
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) return data.session;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.nome.trim().length < 3) {
      setError('A Razão Social é obrigatória (mínimo 3 caracteres).');
      return;
    }
    setSubmitting(true);
    setError(null);

    const session = await waitSession();
    if (!session) {
      setSubmitting(false);
      setError("Sua sessão expirou. Faça login novamente.");
      return;
    }

    try {
      await bootstrapEmpresaParaUsuarioAtual({
        razao_social: form.nome,
        fantasia: form.fantasia || form.nome,
      });
      navigate("/app?onboarding=1", { replace: true });
    } catch (err: any) {
      const msg = String(err?.message || err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-glass-200 backdrop-blur-xl border border-white/30 rounded-3xl shadow-glass-lg p-8">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">Quase lá!</h1>
      <p className="text-center text-gray-600 mb-8">Vamos configurar os dados da sua primeira empresa.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700" htmlFor="cnpj">CNPJ</label>
          <div className="relative mt-1">
            <input
              id="cnpj" name="cnpj" type="text" value={form.cnpj} onChange={handleChange}
              onBlur={handleFetchCnpjData}
              className="w-full p-3 bg-white/50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition pr-12"
              placeholder="Digite o CNPJ para buscar"
            />
            <div className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-gray-500">
              {isFetchingCnpj ? <Loader2 className="animate-spin" /> : <Search />}
            </div>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700" htmlFor="nome">Razão Social</label>
          <input
            ref={razaoSocialInputRef} id="nome" name="nome" type="text" value={form.nome} onChange={handleChange} required
            className="w-full mt-1 p-3 bg-white/50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition"
            placeholder="Minha Empresa LTDA"
            disabled={isFetchingCnpj || submitting}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700" htmlFor="fantasia">Nome Fantasia (Opcional)</label>
          <input
            id="fantasia" name="fantasia" type="text" value={form.fantasia} onChange={handleChange}
            className="w-full mt-1 p-3 bg-white/50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition"
            placeholder="Nome Popular da Empresa"
            disabled={isFetchingCnpj || submitting}
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit" disabled={submitting || isFetchingCnpj}
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center mt-4"
        >
          {submitting ? <Loader2 className="animate-spin" /> : 'Criar Empresa e Acessar'}
        </button>
      </form>
    </div>
  );
}
