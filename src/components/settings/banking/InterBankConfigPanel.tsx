import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Wifi, WifiOff, Upload, CheckCircle, AlertCircle, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import Section from '@/components/ui/forms/Section';
import { useToast } from '@/contexts/ToastProvider';
import {
  getInterConfig,
  saveInterConfig,
  saveInterSecrets,
  testInterConnection,
  type InterConfig,
} from '@/services/interBanking';

export default function InterBankConfigPanel() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<InterConfig | null>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [pixChave, setPixChave] = useState('');
  const [ambiente, setAmbiente] = useState<'sandbox' | 'producao'>('sandbox');
  const [isActive, setIsActive] = useState(false);

  // File state
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await getInterConfig();
      setConfig(data);
      setClientId(data.client_id || '');
      setPixChave(data.pix_chave || '');
      setAmbiente(data.ambiente || 'sandbox');
      setIsActive(data.is_active || false);
    } catch (e: any) {
      addToast(e.message || 'Erro ao carregar configuração.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save plain config via RPC
      await saveInterConfig({
        client_id: clientId,
        pix_chave: pixChave,
        ambiente,
        is_active: isActive,
      });

      // Save secrets via Edge Function (encrypted)
      const secrets: Record<string, string> = {};
      if (clientSecret) secrets.client_secret = clientSecret;
      if (certFile) secrets.cert_pem = await readFileAsText(certFile);
      if (keyFile) secrets.key_pem = await readFileAsText(keyFile);

      if (Object.keys(secrets).length > 0) {
        await saveInterSecrets(secrets);
      }

      addToast('Configuração Inter salva com sucesso!', 'success');
      setClientSecret('');
      setCertFile(null);
      setKeyFile(null);
      await loadConfig();
    } catch (e: any) {
      addToast(e.message || 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testInterConnection();
      if (result.ok) {
        addToast('Conexão com Inter OK! Escopos: ' + (result.scopes || '').split(' ').length + ' autorizados.', 'success');
      } else {
        addToast('Falha na conexão: ' + (result.error || 'Erro desconhecido'), 'error');
      }
      await loadConfig();
    } catch (e: any) {
      addToast(e.message || 'Erro ao testar conexão.', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-orange-100 rounded-lg">
          <Landmark className="text-orange-600" size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Banco Inter</h2>
          <p className="text-sm text-gray-500">Integração para emissão de boletos e PIX via API.</p>
        </div>
        {config?.configured && (
          <div className="ml-auto">
            {config.last_error ? (
              <span className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle size={16} /> Erro
              </span>
            ) : config.last_token_at ? (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle size={16} /> Conectado
              </span>
            ) : null}
          </div>
        )}
      </div>

      <Section title="Credenciais OAuth 2.0" description="Obtidas no Portal do Desenvolvedor Inter.">
        <Select
          label="Ambiente"
          value={ambiente}
          onChange={(e) => setAmbiente(e.target.value as any)}
          className="sm:col-span-3"
        >
          <option value="sandbox">Sandbox (Testes)</option>
          <option value="producao">Produção</option>
        </Select>

        <div className="sm:col-span-3 flex items-end">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Integração ativa
          </label>
        </div>

        <Input
          label="Client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="sm:col-span-3"
          placeholder="Obtido no portal Inter"
        />
        <Input
          label="Client Secret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          className="sm:col-span-3"
          placeholder={config?.has_client_secret ? '••••••••••• (já configurado)' : 'Cole aqui'}
        />
      </Section>

      <Section title="Certificado mTLS" description="Arquivos .crt e .key gerados no Portal Inter.">
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Certificado (.crt)
            {config?.has_cert && <span className="ml-2 text-green-600 text-xs">(já enviado)</span>}
          </label>
          <label className="flex items-center gap-2 p-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
            <Upload size={18} className="text-gray-400" />
            <span className="text-sm text-gray-600">
              {certFile ? certFile.name : 'Clique para selecionar .crt'}
            </span>
            <input
              type="file"
              accept=".crt,.pem,.cer"
              className="hidden"
              onChange={(e) => setCertFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Chave Privada (.key)
            {config?.has_key && <span className="ml-2 text-green-600 text-xs">(já enviada)</span>}
          </label>
          <label className="flex items-center gap-2 p-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
            <Upload size={18} className="text-gray-400" />
            <span className="text-sm text-gray-600">
              {keyFile ? keyFile.name : 'Clique para selecionar .key'}
            </span>
            <input
              type="file"
              accept=".key,.pem"
              className="hidden"
              onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>
      </Section>

      <Section title="PIX" description="Chave PIX cadastrada na conta Inter para cobranças.">
        <Input
          label="Chave PIX"
          value={pixChave}
          onChange={(e) => setPixChave(e.target.value)}
          className="sm:col-span-6"
          placeholder="email@empresa.com, CPF, telefone ou chave aleatória"
        />
      </Section>

      {config?.last_error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <strong>Último erro:</strong> {config.last_error}
        </div>
      )}

      <div className="flex items-center gap-3 mt-6">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          Salvar
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || !config?.configured}
          className="gap-2"
        >
          {testing ? (
            <Loader2 className="animate-spin" size={18} />
          ) : config?.last_token_at ? (
            <Wifi size={18} />
          ) : (
            <WifiOff size={18} />
          )}
          Testar Conexão
        </Button>
      </div>
    </div>
  );
}
