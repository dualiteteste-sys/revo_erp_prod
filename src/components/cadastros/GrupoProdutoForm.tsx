import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ProdutoGrupo, ProdutoGrupoPayload, listProdutoGrupos } from '../../services/produtoGrupos';
import Input from '../ui/forms/Input';
import { Button } from '../ui/button';

interface GrupoProdutoFormProps {
    grupo?: ProdutoGrupo | null;
    onSave: (payload: ProdutoGrupoPayload) => Promise<void>;
    onCancel: () => void;
    isLoading?: boolean;
}

const GrupoProdutoForm: React.FC<GrupoProdutoFormProps> = ({
    grupo,
    onSave,
    onCancel,
    isLoading
}) => {
    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProdutoGrupoPayload>({
        defaultValues: {
            nome: '',
            parent_id: null
        }
    });

    const [allGrupos, setAllGrupos] = useState<ProdutoGrupo[]>([]);
    const parentId = watch('parent_id');

    useEffect(() => {
        listProdutoGrupos().then(setAllGrupos).catch(console.error);
    }, []);

    useEffect(() => {
        if (grupo) {
            reset({
                id: grupo.id,
                nome: grupo.nome,
                parent_id: grupo.parent_id
            });
        } else {
            reset({
                nome: '',
                parent_id: null
            });
        }
    }, [grupo, reset]);

    const onSubmit = async (data: ProdutoGrupoPayload) => {
        await onSave(data);
    };

    // Filter out the current group and its descendants to prevent circular references
    const availableParents = allGrupos.filter((g) => g.id !== grupo?.id);

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
                label="Nome do Grupo"
                {...register('nome', { required: 'Nome é obrigatório' })}
                error={errors.nome?.message}
                placeholder="Ex: Parafusos, Ferramentas..."
            />

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grupo Pai</label>
                <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    value={parentId ?? ''}
                    onChange={(e) => setValue('parent_id', e.target.value || null)}
                >
                    <option value="">Nenhum (raiz)</option>
                    {availableParents.map((g) => (
                        <option key={g.id} value={g.id}>
                            {'—'.repeat(g.depth ?? 0)} {g.nome}
                        </option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Deixe vazio para criar um grupo raiz.</p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Salvando...' : 'Salvar'}
                </Button>
            </div>
        </form>
    );
};

export default GrupoProdutoForm;
