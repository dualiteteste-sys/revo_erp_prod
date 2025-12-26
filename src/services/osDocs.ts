import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { nanoid } from 'nanoid';

export type OsDoc = {
  id: string;
  titulo: string;
  descricao: string | null;
  arquivo_path: string;
  tamanho_bytes: number | null;
  created_at: string;
};

const BUCKET = 'os_docs';

export async function listOsDocs(osId: string): Promise<OsDoc[]> {
  return callRpc<OsDoc[]>('os_docs_list', { p_os_id: osId });
}

export async function registerOsDoc(input: {
  osId: string;
  titulo: string;
  descricao?: string | null;
  arquivoPath: string;
  tamanhoBytes?: number | null;
}): Promise<string> {
  return callRpc<string>('os_doc_register', {
    p_os_id: input.osId,
    p_titulo: input.titulo,
    p_descricao: input.descricao ?? null,
    p_arquivo_path: input.arquivoPath,
    p_tamanho_bytes: input.tamanhoBytes ?? null,
  });
}

export async function uploadOsDoc(params: {
  empresaId: string;
  osId: string;
  titulo: string;
  descricao?: string | null;
  file: File;
}): Promise<string> {
  const ext = params.file.name.split('.').pop() || 'bin';
  const safeTitle = params.titulo
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'doc';
  const filename = `${safeTitle}-${Date.now()}-${nanoid(6)}.${ext}`;
  const path = `${params.empresaId}/os/${params.osId}/${filename}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, params.file, { upsert: false });
  if (error) throw new Error(error.message);

  await registerOsDoc({
    osId: params.osId,
    titulo: params.titulo,
    descricao: params.descricao ?? null,
    arquivoPath: path,
    tamanhoBytes: params.file.size,
  });

  return path;
}

export async function createOsDocSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error('Não foi possível gerar link do documento.');
  return data.signedUrl;
}

export async function deleteOsDoc(params: { id: string; arquivoPath: string }): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([params.arquivoPath]);
  if (storageError) throw new Error(storageError.message);

  await callRpc('os_doc_delete', { p_id: params.id });
}

