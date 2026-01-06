import { callRpc } from '@/lib/api';

export type DevSchemaDiagnostics = {
  now: string;
  db: string;
  migrations: { version: string }[];
  functions_public: number;
  views_public: number;
  overloaded_public: { proname: string; overloads: number }[];
};

export async function getDevSchemaDiagnostics(limit = 50): Promise<DevSchemaDiagnostics> {
  return callRpc<DevSchemaDiagnostics>('dev_schema_diagnostics', { p_limit: limit });
}

export async function reloadPostgrestSchemaCache(): Promise<void> {
  return callRpc('dev_postgrest_reload', {});
}

