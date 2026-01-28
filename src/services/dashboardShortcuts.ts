import { callRpc } from '@/lib/api';

/**
 * Get saved shortcut IDs for current user/empresa
 */
export async function getShortcuts(): Promise<string[]> {
    const result = await callRpc<string[]>('dashboard_shortcuts_get');
    return result ?? [];
}

/**
 * Save shortcut IDs for current user/empresa
 */
export async function setShortcuts(ids: string[]): Promise<void> {
    await callRpc('dashboard_shortcuts_set', { p_ids: ids });
}
