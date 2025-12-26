import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { nanoid } from 'nanoid';

export type RhDocEntityType = 'colaborador' | 'treinamento';

export type RhDoc = {
  id: string;
  titulo: string;
  descricao: string | null;
  arquivo_path: string;
  tamanho_bytes: number | null;
  versao: number;
  created_at: string;
};

const BUCKET = 'rh_docs';

export async function listRhDocs(entityType: RhDocEntityType, entityId: string, onlyLatest = true): Promise<RhDoc[]> {
  return callRpc<RhDoc[]>('rh_docs_list', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_only_latest: onlyLatest,
  });
}

export async function registerRhDoc(input: {
  entityType: RhDocEntityType;
  entityId: string;
  titulo: string;
  descricao?: string | null;
  arquivoPath: string;
  tamanhoBytes?: number | null;
}): Promise<string> {
  return callRpc<string>('rh_doc_register', {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_titulo: input.titulo,
    p_descricao: input.descricao ?? null,
    p_arquivo_path: input.arquivoPath,
    p_tamanho_bytes: input.tamanhoBytes ?? null,
  });
}

export async function uploadRhDoc(params: {
  empresaId: string;
  entityType: RhDocEntityType;
  entityId: string;
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
  const path = `${params.empresaId}/${params.entityType}/${params.entityId}/${filename}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, params.file, { upsert: false });
  if (error) throw new Error(error.message);

  await registerRhDoc({
    entityType: params.entityType,
    entityId: params.entityId,
    titulo: params.titulo,
    descricao: params.descricao ?? null,
    arquivoPath: path,
    tamanhoBytes: params.file.size,
  });

  return path;
}

export async function createRhDocSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error('Não foi possível gerar link do documento.');
  return data.signedUrl;
}

export async function deleteRhDoc(params: { id: string; arquivoPath: string }): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([params.arquivoPath]);
  if (storageError) throw new Error(storageError.message);

  await callRpc('rh_doc_delete', { p_id: params.id });
}

