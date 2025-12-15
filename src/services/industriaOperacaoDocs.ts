import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { nanoid } from 'nanoid';

export type OperacaoDoc = {
  id: string;
  operacao_id: string;
  titulo: string;
  descricao: string | null;
  arquivo_path: string;
  tamanho_bytes: number | null;
  versao: number;
  created_at: string;
};

const BUCKET = 'industria_operacao_docs';

export async function listOperacaoDocs(operacaoId: string, onlyLatest = true): Promise<OperacaoDoc[]> {
  return callRpc<OperacaoDoc[]>('industria_operacao_docs_list', {
    p_operacao_id: operacaoId,
    p_only_latest: onlyLatest,
  });
}

export async function registerOperacaoDoc(input: {
  operacaoId: string;
  titulo: string;
  descricao?: string | null;
  arquivoPath: string;
  tamanhoBytes?: number | null;
}): Promise<string> {
  return callRpc<string>('industria_operacao_doc_register', {
    p_operacao_id: input.operacaoId,
    p_titulo: input.titulo,
    p_descricao: input.descricao ?? null,
    p_arquivo_path: input.arquivoPath,
    p_tamanho_bytes: input.tamanhoBytes ?? null,
  });
}

export async function uploadOperacaoDoc(params: {
  empresaId: string;
  operacaoId: string;
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
  const path = `${params.empresaId}/${params.operacaoId}/${filename}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, params.file, { upsert: false });
  if (error) throw new Error(error.message);

  await registerOperacaoDoc({
    operacaoId: params.operacaoId,
    titulo: params.titulo,
    descricao: params.descricao ?? null,
    arquivoPath: path,
    tamanhoBytes: params.file.size,
  });

  return path;
}

export async function createOperacaoDocSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error('Não foi possível gerar link do documento.');
  return data.signedUrl;
}

export async function deleteOperacaoDoc(params: { id: string; arquivoPath: string }): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([params.arquivoPath]);
  if (storageError) throw new Error(storageError.message);

  await callRpc('industria_operacao_doc_delete', { p_id: params.id });
}
