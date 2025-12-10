import React, { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Save, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthProvider';
import { useToast } from '../../contexts/ToastProvider';
import { Embalagem, createEmbalagem, updateEmbalagem } from '../../services/embalagens';
import { listUnidades, UnidadeMedida } from '../../services/unidades';
import { Button } from '../ui/button';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import Toggle from '../ui/forms/Toggle';
import PackagingIllustration from '../products/PackagingIllustration';
import { tipo_embalagem } from '../../types/database.types';
import Modal from '../ui/Modal';

interface EmbalagemFormPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    embalagem?: Embalagem | null;
}

const EmbalagemFormPanel: React.FC<EmbalagemFormPanelProps> = ({
    isOpen,
    onClose,
    onSave,
    embalagem
}) => {
    const { activeEmpresaId } = useAuth();
    const { addToast } = useToast();
    const [isSaving, setIsSaving] = React.useState(false);
    const [unidades, setUnidades] = React.useState<UnidadeMedida[]>([]);

    useEffect(() => {
        const loadUnidades = async () => {
            try {
                const data = await listUnidades();
                setUnidades(data);
            } catch (error) {
                console.error('Erro ao carregar unidades:', error);
                addToast('Erro ao carregar lista de unidades.', 'error');
            }
        };
        if (isOpen) {
            loadUnidades();
        }
    }, [isOpen, addToast]);

    const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<Partial<Embalagem>>({
        defaultValues: {
            tipo: 'pacote_caixa',
            ativo: true
        }
    });

    const tipo = useWatch({ control, name: 'tipo' }) || 'pacote_caixa';
    const ativo = useWatch({ control, name: 'ativo' }) ?? true;

    useEffect(() => {
        if (embalagem) {
            reset(embalagem);
        } else {
            reset({
                tipo: 'pacote_caixa',
                ativo: true,
                nome: '',
                codigo_interno: '',
                unidade_base: '',
                capacidade_embalagem: null,
                largura: null,
                altura: null,
                comprimento: null,
                diametro: null
            });
        }
    }, [embalagem, reset, isOpen]);

    const onSubmit = async (data: Partial<Embalagem>) => {
        if (!activeEmpresaId) {
            addToast('Empresa não identificada.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                ...data,
                // Ensure numeric fields are correctly parsed or null
                largura: data.largura ? Number(data.largura) : null,
                altura: data.altura ? Number(data.altura) : null,
                comprimento: data.comprimento ? Number(data.comprimento) : null,
                diametro: data.diametro ? Number(data.diametro) : null,
                capacidade_embalagem: data.capacidade_embalagem ? Number(data.capacidade_embalagem) : null,
            };

            if (embalagem?.id) {
                await updateEmbalagem(embalagem.id, payload);
                addToast('Embalagem atualizada com sucesso!', 'success');
            } else {
                await createEmbalagem({
                    ...payload,
                    nome: data.nome!,
                    empresa_id: activeEmpresaId // Always bind to current company
                });
                addToast('Embalagem criada com sucesso!', 'success');
            }
            onSave();
            onClose();
        } catch (error: any) {
            console.error(error);
            addToast(error.message || 'Erro ao salvar embalagem.', 'error');
        } finally {
            setIsSaving(false);
        }
    };


    const packagingTypes: { value: tipo_embalagem; label: string }[] = [
        { value: 'pacote_caixa', label: 'Caixa' },
        { value: 'pacote', label: 'Pacote' },
        { value: 'envelope', label: 'Envelope' },
        { value: 'rolo_cilindro', label: 'Rolo / Cilindro' },
        { value: 'outro', label: 'Outro' },
    ];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={embalagem ? 'Editar Embalagem' : 'Nova Embalagem'}
            size="lg"
        >
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
                <div className="space-y-4">
                    <Input
                        label="Nome da Embalagem"
                        placeholder="Ex: Caixa Padrão P"
                        {...register('nome', { required: 'Nome é obrigatório' })}
                        error={errors.nome?.message}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Código Interno"
                            placeholder="Ex: CX-001"
                            {...register('codigo_interno')}
                        />
                        <Select
                            label="Tipo"
                            {...register('tipo')}
                            onChange={(e) => setValue('tipo', e.target.value as tipo_embalagem)}
                        >
                            {packagingTypes.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <Select
                            label="Unidade Base"
                            {...register('unidade_base')}
                            onChange={(e) => setValue('unidade_base', e.target.value)}
                        >
                            <option value="">Selecione...</option>
                            {unidades.map(u => (
                                <option key={u.id} value={u.sigla}>{u.sigla} - {u.descricao}</option>
                            ))}
                        </Select>
                        <Input
                            label="Capacidade"
                            type="number"
                            step="0.001"
                            placeholder="0.000"
                            {...register('capacidade_embalagem')}
                        />
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="mb-4 flex justify-center">
                            <PackagingIllustration type={tipo} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {(tipo === 'pacote_caixa' || tipo === 'envelope' || tipo === 'pacote') && (
                                <Input
                                    label="Largura (cm)"
                                    type="number"
                                    step="0.1"
                                    {...register('largura')}
                                    placeholder="0.0"
                                />
                            )}
                            {(tipo === 'pacote_caixa' || tipo === 'pacote') && (
                                <Input
                                    label="Altura (cm)"
                                    type="number"
                                    step="0.1"
                                    {...register('altura')}
                                    placeholder="0.0"
                                />
                            )}
                            {(tipo === 'pacote_caixa' || tipo === 'envelope' || tipo === 'rolo_cilindro') && (
                                <Input
                                    label="Comprimento (cm)"
                                    type="number"
                                    step="0.1"
                                    {...register('comprimento')}
                                    placeholder="0.0"
                                />
                            )}
                            {tipo === 'rolo_cilindro' && (
                                <Input
                                    label="Diâmetro (cm)"
                                    type="number"
                                    step="0.1"
                                    {...register('diametro')}
                                    placeholder="0.0"
                                />
                            )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                            Dimensões usadas para cálculo de frete.
                        </p>
                    </div>

                    <Toggle
                        label="Ativo"
                        name="ativo"
                        description="Disponível para uso em produtos"
                        checked={ativo}
                        onChange={(checked) => setValue('ativo', checked)}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]">
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Salvar</>}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default EmbalagemFormPanel;
