import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';
import { supabase } from '@/lib/supabaseClient';

export type Empresa = Database['public']['Tables']['empresas']['Row'];
export type EmpresaUpdate = Partial<Database['public']['Tables']['empresas']['Row']>;
export type ProvisionEmpresaInput = {
    razao_social: string;
    fantasia: string;
    email?: string | null;
};

const LOGO_BUCKET = 'company_logos';

/**
 * Atualiza os dados da empresa ativa usando uma RPC segura.
 */
export async function updateCompany(updateData: EmpresaUpdate): Promise<Empresa> {
    try {
        const data = await callRpc<Empresa>('update_active_company', {
            p_patch: updateData,
        });
        return data;
    } catch (error: any) {
        console.error('Error updating company via RPC:', error);

        // Check for duplicate CNPJ error
        const msg = error?.message || '';
        const details = error?.details || '';
        if (
            msg.includes('duplicate key') ||
            details.includes('duplicate key') ||
            msg.includes('empresas_cnpj_key') ||
            details.includes('empresas_cnpj_key')
        ) {
            throw new Error('Empresa já foi cadastrada em nosso sistema.');
        }

        throw new Error('Não foi possível atualizar os dados da empresa.');
    }
}

/**
 * Cria uma nova empresa para o usuário logado via RPC.
 * Diferente do bootstrap, esta função sempre tenta criar uma nova empresa.
 */
export async function provisionCompany(input: ProvisionEmpresaInput): Promise<Empresa> {
    try {
        // Use explicit provision RPC to create a NEW company
        const data = await callRpc<Empresa | Empresa[]>('provision_empresa_for_current_user', {
            p_razao_social: input.razao_social,
            p_fantasia: input.fantasia,
            p_email: input.email ?? null,
        });

        // Handle potential array return if RPC behavior varies (PostgREST quirks)
        if (Array.isArray(data)) {
            if (data.length === 0) throw new Error("A criação da empresa não retornou dados.");
            return data[0];
        }

        if (!data) {
            throw new Error("A criação da empresa não retornou dados.");
        }
        return data;
    } catch (error) {
        console.error('[SERVICE][PROVISION_COMPANY] error', error);
        throw error;
    }
}

function sanitizeName(name: string) {
    return name
        .normalize('NFKD')
        .replace(/[^\w.\- ]+/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 80);
}

/**
 * Faz o upload do logo da empresa.
 * @returns O caminho (key) do arquivo no bucket.
 */
export async function uploadCompanyLogo(empresaId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const sanitizedName = sanitizeName(file.name.replace(/\.[^/.]+$/, ""));
    const fileName = `${sanitizedName}-${Date.now()}.${fileExt}`;
    const filePath = `${empresaId}/${fileName}`;

    const { data, error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, file, {
        upsert: true,
    });

    if (error) {
        console.error('Error uploading logo:', error);
        throw new Error('Falha ao enviar o logo.');
    }

    return data.path;
}

/**
 * Remove o logo da empresa do storage.
 */
export async function deleteCompanyLogo(logoPath: string): Promise<void> {
    if (!logoPath) {
        console.warn("deleteCompanyLogo called with empty path");
        return;
    }

    const { error } = await supabase.storage.from(LOGO_BUCKET).remove([logoPath]);

    if (error) {
        console.error('Error deleting logo:', error);
        throw new Error('Falha ao remover o logo.');
    }
}

/**
 * Remove o usuário atual da empresa especificada.
 */
export async function leaveCompany(empresaId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado.");

    const { error } = await supabase
        .from('empresa_usuarios')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('user_id', user.id);

    if (error) {
        console.error('Error leaving company:', error);
        throw new Error('Falha ao sair da empresa.');
    }
}
