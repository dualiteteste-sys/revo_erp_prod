import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { type OsItemSearchResult } from '@/services/os';
import {
  PlanoCaracteristica,
  PlanoInspecaoDetalhe,
  PlanoInspecaoPayload,
  deletePlanoCaracteristica,
  getPlanoInspecao,
  upsertPlanoInspecao
} from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import PlanoCaracteristicaModal from './PlanoCaracteristicaModal';
import { getRoteiroDetails, listRoteiros, RoteiroEtapa, RoteiroListItem } from '@/services/industriaRoteiros';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  planoId?: string | null;
  onSaved: () => void;
}

interface PlanoFormState {
  id?: string;
  nome: string;
  produto_id: string;
  tipo: 'IP' | 'IF';
  severidade: string;
  aql: string;
  amostragem: string;
  roteiro_id: string;
  roteiro_etapa_id: string;
  ativo: boolean;
}

const defaultForm: PlanoFormState = {
  nome: '',
  produto_id: '',
  tipo: 'IP',
  severidade: '',
  aql: '',
  amostragem: '',
  roteiro_id: '',
  roteiro_etapa_id: '',
  ativo: true
};

export default function PlanoInspecaoFormModal({ isOpen, onClose, planoId, onSaved }: Props) {
  const { addToast } = useToast();
  const [form, setForm] = useState<PlanoFormState>(defaultForm);
  const [produtoSelecionado, setProdutoSelecionado] = useState<{ id: string; nome: string } | null>(null);
  const [roteiros, setRoteiros] = useState<RoteiroListItem[]>([]);
  const [etapas, setEtapas] = useState<RoteiroEtapa[]>([]);
  const [caracteristicas, setCaracteristicas] = useState<PlanoCaracteristica[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [caracteristicaModalOpen, setCaracteristicaModalOpen] = useState(false);
  const [editingCaracteristica, setEditingCaracteristica] = useState<PlanoCaracteristica | null>(null);

  const resetState = () => {
    setForm(defaultForm);
    setProdutoSelecionado(null);
    setRoteiros([]);
    setEtapas([]);
    setCaracteristicas([]);
    setEditingCaracteristica(null);
    setCaracteristicaModalOpen(false);
  };

  const loadPlano = async (id: string, showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await getPlanoInspecao(id);
      hydrateFromDetails(data);
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar plano.', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const hydrateFromDetails = async (data: PlanoInspecaoDetalhe) => {
    setForm({
      id: data.id,
      nome: data.nome,
      produto_id: data.produto_id,
      tipo: data.tipo,
      severidade: data.severidade || '',
      aql: data.aql || '',
      amostragem: data.amostragem || '',
      roteiro_id: data.roteiro_id || '',
      roteiro_etapa_id: data.roteiro_etapa_id || '',
      ativo: data.ativo
    });
    setProdutoSelecionado({ id: data.produto_id, nome: data.produto_nome });
    setCaracteristicas(data.caracteristicas || []);

    if (data.produto_id) {
      await fetchRoteiros(data.produto_id, data.roteiro_id || null, data.roteiro_etapa_id || null);
    } else {
      setRoteiros([]);
      setEtapas([]);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }
    if (planoId) {
      loadPlano(planoId, true);
    } else {
      resetState();
    }
  }, [isOpen, planoId]);

  const fetchRoteiros = async (produtoId: string, selectedRoteiro?: string | null, selectedEtapa?: string | null) => {
    try {
      const data = await listRoteiros(undefined, produtoId, 'producao', true);
      setRoteiros(data);
      if (selectedRoteiro) {
        await fetchEtapas(selectedRoteiro, selectedEtapa);
      } else {
        setEtapas([]);
      }
    } catch (error) {
      console.error('[PlanosInspecao] Erro ao listar roteiros', error);
      setRoteiros([]);
    }
  };

  const fetchEtapas = async (roteiroId: string, etapaId?: string | null) => {
    try {
      const detalhes = await getRoteiroDetails(roteiroId);
      setEtapas(detalhes.etapas || []);
      if (etapaId && !detalhes.etapas.some((et) => et.id === etapaId)) {
        setForm(prev => ({ ...prev, roteiro_etapa_id: '' }));
      }
    } catch (error) {
      console.error('[PlanosInspecao] Erro ao carregar etapas', error);
      setEtapas([]);
    }
  };

  const handleProductSelect = async (item: OsItemSearchResult) => {
    setProdutoSelecionado({ id: item.id, nome: item.descricao });
    setForm(prev => ({ ...prev, produto_id: item.id, roteiro_id: '', roteiro_etapa_id: '' }));
    setCaracteristicas([]); // keep same? characteristics remain; they refer to plan. On new plan no char yet.
    await fetchRoteiros(item.id);
  };

  const handleRoteiroChange = async (value: string) => {
    setForm(prev => ({ ...prev, roteiro_id: value, roteiro_etapa_id: '' }));
    if (value) {
      await fetchEtapas(value);
    } else {
      setEtapas([]);
    }
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      addToast('Informe o nome do plano.', 'error');
      return;
    }
    if (!produtoSelecionado?.id) {
      addToast('Selecione um produto.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: PlanoInspecaoPayload = {
        id: form.id,
        nome: form.nome.trim(),
        produto_id: produtoSelecionado.id,
        tipo: form.tipo,
        severidade: form.severidade || undefined,
        aql: form.aql || undefined,
        amostragem: form.amostragem || undefined,
        roteiro_id: form.roteiro_id || null,
        roteiro_etapa_id: form.roteiro_etapa_id || null,
        ativo: form.ativo
      };

      const savedId = await upsertPlanoInspecao(payload);
      addToast('Plano salvo com sucesso!', 'success');
      onSaved();
      setForm(prev => ({ ...prev, id: savedId }));
      await loadPlano(savedId, false);
    } catch (error: any) {
      addToast(error.message || 'Erro ao salvar plano.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCaracteristica = async (caracteristicaId: string) => {
    if (!confirm('Remover esta característica?')) return;
    try {
      await deletePlanoCaracteristica(caracteristicaId);
      addToast('Característica removida.', 'success');
      if (form.id) {
        await loadPlano(form.id, false);
      }
    } catch (error: any) {
      addToast(error.message || 'Erro ao remover característica.', 'error');
    }
  };

  const openCaracteristicaModal = (caracteristica?: PlanoCaracteristica) => {
    if (!form.id) {
      addToast('Salve o plano antes de adicionar características.', 'warning');
      return;
    }
    setEditingCaracteristica(caracteristica || null);
    setCaracteristicaModalOpen(true);
  };

  const handleCaracteristicaSuccess = async () => {
    if (form.id) {
      await loadPlano(form.id, false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={form.id ? 'Editar Plano de Inspeção' : 'Novo Plano de Inspeção'}
        size="5xl"
      >
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-blue-600 gap-3">
              <Loader2 className="animate-spin" />
              Carregando...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nome do Plano"
                  value={form.nome}
                  onChange={(e) => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex.: IP Roscagem - Classe A"
                />
                <Select
                  label="Tipo de Inspeção"
                  value={form.tipo}
                  onChange={(e) => setForm(prev => ({ ...prev, tipo: e.target.value as 'IP' | 'IF' }))}
                >
                  <option value="IP">Inspeção em Processo (IP)</option>
                  <option value="IF">Inspeção Final (IF)</option>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Produto</label>
                {produtoSelecionado ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-800">{produtoSelecionado.nome}</p>
                      <p className="text-xs text-blue-600">ID: {produtoSelecionado.id}</p>
                    </div>
                    <Button variant="ghost" onClick={() => { setProdutoSelecionado(null); setForm(prev => ({ ...prev, produto_id: '', roteiro_id: '', roteiro_etapa_id: '' })); }}>
                      Trocar
                    </Button>
                  </div>
                ) : (
                  <ItemAutocomplete
                    onSelect={handleProductSelect}
                    clearOnSelect
                    placeholder="Buscar produto..."
                  />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                  label="Roteiro (opcional)"
                  value={form.roteiro_id}
                  onChange={(e) => handleRoteiroChange(e.target.value)}
                  disabled={!produtoSelecionado}
                >
                  <option value="">Aplicar a todos os roteiros</option>
                  {roteiros.map((rot) => (
                    <option key={rot.id} value={rot.id}>
                      {rot.descricao || rot.codigo || 'Roteiro sem descrição'}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Etapa específica"
                  value={form.roteiro_etapa_id}
                  onChange={(e) => setForm(prev => ({ ...prev, roteiro_etapa_id: e.target.value }))}
                  disabled={!form.roteiro_id || etapas.length === 0}
                >
                  <option value="">Todas as etapas do roteiro</option>
                  {etapas.map((etapa) => (
                    <option key={etapa.id} value={etapa.id}>
                      {etapa.sequencia} - {etapa.centro_trabalho_nome || etapa.tipo_operacao}
                    </option>
                  ))}
                </Select>

                <div className="flex items-center">
                  <label className="flex items-center space-x-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={form.ativo}
                      onChange={(e) => setForm(prev => ({ ...prev, ativo: e.target.checked }))}
                    />
                    <span>Plano ativo</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Severidade"
                  value={form.severidade}
                  onChange={(e) => setForm(prev => ({ ...prev, severidade: e.target.value }))}
                  placeholder="Ex.: Nível II"
                />
                <Input
                  label="AQL"
                  value={form.aql}
                  onChange={(e) => setForm(prev => ({ ...prev, aql: e.target.value }))}
                  placeholder="Ex.: 1.5%"
                />
                <Input
                  label="Amostragem"
                  value={form.amostragem}
                  onChange={(e) => setForm(prev => ({ ...prev, amostragem: e.target.value }))}
                  placeholder="Ex.: ANSI Z1.4"
                />
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-gray-500">
                  Configure as regras de inspeção e, após salvar, cadastre as características a serem avaliadas.
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Fechar
                  </Button>
                  <Button onClick={handleSave} disabled={saving || !produtoSelecionado}>
                    {saving ? 'Salvando...' : 'Salvar Plano'}
                  </Button>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Características do Plano</h3>
                    <p className="text-xs text-gray-500">Tolerâncias, instrumentos e observações.</p>
                  </div>
                  <Button size="sm" onClick={() => openCaracteristicaModal()} disabled={!form.id}>
                    <Plus className="w-4 h-4 mr-1" /> Nova Característica
                  </Button>
                </div>
                {!form.id ? (
                  <p className="text-sm text-gray-500">Salve o plano para liberar o cadastro de características.</p>
                ) : caracteristicas.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma característica cadastrada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                        <tr>
                          <th className="px-3 py-2 text-left">Descrição</th>
                          <th className="px-3 py-2 text-left">Tolerância</th>
                          <th className="px-3 py-2 text-left">Unidade</th>
                          <th className="px-3 py-2 text-left">Instrumento</th>
                          <th className="px-3 py-2 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caracteristicas.map((car) => (
                          <tr key={car.id} className="border-t">
                            <td className="px-3 py-2 font-medium text-gray-800">{car.descricao}</td>
                            <td className="px-3 py-2 text-gray-600">
                              {car.tolerancia_min !== null && car.tolerancia_min !== undefined ? car.tolerancia_min : '-'} /
                              {car.tolerancia_max !== null && car.tolerancia_max !== undefined ? ` ${car.tolerancia_max}` : ' -'}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{car.unidade || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{car.instrumento || '-'}</td>
                            <td className="px-3 py-2 text-center space-x-2">
                              <button
                                type="button"
                                className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs"
                                onClick={() => openCaracteristicaModal(car)}
                              >
                                <Pencil size={14} /> Editar
                              </button>
                              <button
                                type="button"
                                className="text-red-600 hover:text-red-800 inline-flex items-center gap-1 text-xs"
                                onClick={() => handleDeleteCaracteristica(car.id)}
                              >
                                <Trash2 size={14} /> Excluir
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      {form.id && (
        <PlanoCaracteristicaModal
          isOpen={caracteristicaModalOpen}
          onClose={() => setCaracteristicaModalOpen(false)}
          planoId={form.id}
          caracteristica={editingCaracteristica}
          onSuccess={handleCaracteristicaSuccess}
        />
      )}
    </>
  );
}
