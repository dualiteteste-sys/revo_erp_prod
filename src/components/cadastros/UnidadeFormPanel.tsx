import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Toggle from '@/components/ui/forms/Toggle';
import { createUnidade, updateUnidade, UnidadeMedida } from '@/services/unidades';

interface Props {
    data: UnidadeMedida | null;
    onSaveSuccess: () => void;
    onClose: () => void;
}

export default function UnidadeFormPanel({ data, onSaveSuccess, onClose }: Props) {
    const { addToast } = useToast();
    const { activeEmpresaId } = useAuth();
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState<Partial<UnidadeMedida>>({
        ativo: true,
    });

    useEffect(() => {
        if (data) {
            setFormData(data);
        } else {
            setFormData({ ativo: true });
        }
    }, [data]);

    const handleChange = (field: keyof UnidadeMedida, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!formData.sigla) {
            addToast('A sigla é obrigatória.', 'error');
            return;
        }
        if (!formData.descricao) {
            addToast('A descrição é obrigatória.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            if (data?.id) {
                await updateUnidade(data.id, {
                    sigla: formData.sigla,
                    descricao: formData.descricao,
                    ativo: formData.ativo
                });
                addToast('Unidade atualizada com sucesso!', 'success');
            } else {
                if (!activeEmpresaId) {
                    addToast('Empresa ativa não identificada.', 'error');
                    setIsSaving(false);
                    return;
                }

                await createUnidade({
                    sigla: formData.sigla!,
                    descricao: formData.descricao!,
                    ativo: formData.ativo ?? true,
                    empresa_id: activeEmpresaId
                });
                addToast('Unidade criada com sucesso!', 'success');
            }
            onSaveSuccess();
        } catch (e: any) {
            if (e.message?.includes('violates unique constraint') || e.code === '23505') {
                addToast('Já existe uma unidade com esta sigla.', 'error');
            } else {
                addToast('Erro ao salvar unidade.', 'error');
                console.error(e);
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
                <Section title="Dados da Unidade" description="Defina a sigla e descrição da unidade de medida.">
                    <Input
                        label="Sigla"
                        name="sigla"
                        value={formData.sigla || ''}
                        onChange={e => handleChange('sigla', e.target.value.toUpperCase())}
                        className="sm:col-span-2"
                        placeholder="Ex: CX"
                        maxLength={6}
                        required
                    />
                    <Input
                        label="Descrição"
                        name="descricao"
                        value={formData.descricao || ''}
                        onChange={e => handleChange('descricao', e.target.value)}
                        className="sm:col-span-4"
                        placeholder="Ex: Caixa com X unidades"
                        required
                    />
                    <div className="sm:col-span-6 mt-4">
                        <Toggle
                            label="Ativo"
                            name="ativo"
                            checked={formData.ativo !== false}
                            onChange={checked => handleChange('ativo', checked)}
                            description="Desative para ocultar esta unidade nas seleções."
                        />
                    </div>
                </Section>
                {data?.empresa_id === null && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-yellow-700">
                                    Esta é uma unidade padrão do sistema e não pode ser excluída, apenas editada localmente se o sistema permitir (atualmente somente visualização para padrão).
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
                <div className="flex gap-3">
                    <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                        Cancelar
                    </button>
                    {data?.empresa_id !== null && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Salvar
                        </button>
                    )}
                    {data?.empresa_id === null && (
                        <button disabled className="bg-gray-300 text-white font-bold py-2 px-4 rounded-lg cursor-not-allowed">
                            Sistema (Somente Leitura)
                        </button>
                    )}
                </div>
            </footer>
        </div>
    );
}
