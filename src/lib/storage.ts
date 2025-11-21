import { supabase } from './supabaseClient';
import { callRpc } from '@/lib/api';

const BUCKET = 'product_images';

function extFromName(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function sanitizeName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export type UploadResult = { key: string; publicUrl: string };

export async function uploadProductImage(
  empresaId: string,
  produtoId: string,
  file: File
): Promise<UploadResult> {
  const { data: s } = await supabase.auth.getSession();
  if (!s?.session?.access_token) throw new Error('[MEDIA] Usuário não autenticado (sem session).');

  const ext = extFromName(file.name) || 'bin';
  const base = sanitizeName(file.name.replace(/\.[^.]+$/, '')) || 'file';
  const uuid = crypto.randomUUID();
  const key = `${empresaId}/${produtoId}/${base}-${uuid}.${ext}`;

  try {
    const { data, error } = await supabase.storage.from(BUCKET).upload(key, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
    });

    if (error) throw error;

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
    return { key: data!.path, publicUrl };
  } catch (error: any) {
    const errorMessage = error.message || '';
    
    if (errorMessage.includes('Failed to fetch')) {
      const friendlyHint =
        'Este arquivo parece estar apenas na nuvem (iCloud/OneDrive). ' +
        'Por favor, baixe-o para o seu dispositivo (clique com o botão direito > Download) e tente o upload novamente.';
      throw new Error(`Não foi possível ler o arquivo. ${friendlyHint}`);
    }

    if (errorMessage.includes('row-level security')) {
      throw new Error('[MEDIA] Sem permissão para gravar neste prefixo (RLS). Verifique a empresa do usuário.');
    }

    throw new Error(`[MEDIA] Falha no upload: ${errorMessage}`);
  }
}

/**
 * Remove a imagem do Storage e depois do banco de dados.
 */
export async function removeProductImage(imageId: string, imagePath: string): Promise<void> {
  // 1. Remove do Storage
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([imagePath]);
  if (storageError) {
    console.warn(`[MEDIA][DELETE] Falha ao remover do Storage, mas continuando para o DB:`, storageError);
  }

  // 2. Remove do DB via RPC
  try {
    await callRpc("delete_product_image_db", { p_image_id: imageId });
  } catch (rpcError) {
    throw new Error(`Falha ao remover registro da imagem: ${(rpcError as Error).message}`);
  }
}

/**
 * Define uma imagem como principal para um produto.
 */
export async function setPrincipalProductImage(produtoId: string, imageId: string): Promise<void> {
  try {
    await callRpc("set_principal_product_image", {
        p_produto_id: produtoId,
        p_imagem_id: imageId,
    });
  } catch (error) {
    throw new Error(`Falha ao definir imagem principal: ${(error as Error).message}`);
  }
}
