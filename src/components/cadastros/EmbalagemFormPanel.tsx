import React, { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Loader2, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthProvider';
import { useToast } from '../../contexts/ToastProvider';
import { Embalagem, createEmbalagem, updateEmbalagem } from '../../services/embalagens';
import { Button } from '../ui/button';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import Toggle from '../ui/forms/Toggle';
import PackagingIllustration from '../products/PackagingIllustration';
import { tipo_embalagem } from '../../types/database.types';

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
        { value: 'pacote_caixa', label: 'Pacote / Caixa' },
        { value: 'envelope', label: 'Envelope' },
        { value: 'rolo_cilindro', label: 'Rolo / Cilindro' },
        { value: 'outro', label: 'Outro' },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-gray-100"
                    >
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <Package className="w-6 h-6 text-blue-600" />
                                {embalagem ? 'Editar Embalagem' : 'Nova Embalagem'}
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-4">
                                <Input
                                    label="Nome da Embalagem"
                                    placeholder="Ex: Caixa Padrão P"
                                    {...register('nome', { required: 'Nome é obrigatório' })}
                                    error={errors.nome?.message}
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

                                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                    <div className="mb-4 flex justify-center">
                                        <PackagingIllustration type={tipo} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        {(tipo === 'pacote_caixa' || tipo === 'envelope') && (
                                            <Input
                                                label="Largura (cm)"
                                                type="number"
                                                step="0.1"
                                                {...register('largura')}
                                                placeholder="0.0"
                                            />
                                        )}
                                        {tipo === 'pacote_caixa' && (
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
                        </form>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <Button variant="outline" onClick={onClose} disabled={isSaving}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSubmit(onSubmit)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]">
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Salvar</>}
                            </Button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default EmbalagemFormPanel;
