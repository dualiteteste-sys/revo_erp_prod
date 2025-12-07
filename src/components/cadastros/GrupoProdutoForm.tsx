import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ProdutoGrupo, ProdutoGrupoPayload } from '../../services/produtoGrupos';
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
    const { register, handleSubmit, reset, formState: { errors } } = useForm<ProdutoGrupoPayload>({
        defaultValues: {
            nome: '',
            parent_id: null
        }
    });

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

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
                label="Nome do Grupo"
                {...register('nome', { required: 'Nome é obrigatório' })}
                error={errors.nome?.message}
                placeholder="Ex: Parafusos, Ferramentas..."
            />

            {/* Future: Parent Group Select */}

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
