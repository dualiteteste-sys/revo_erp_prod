import { lazy, ComponentType } from 'react';

/**
 * A wrapper around React.lazy that automatically reloads the page
 * if a dynamic import fails (e.g., due to a new deployment).
 */
export function lazyImport<T extends ComponentType<any>>(
    factory: () => Promise<{ default: T }>
) {
    return lazy(async () => {
        try {
            return await factory();
        } catch (error: any) {
            const message = error?.message || '';
            // Check for common chunk load errors
            if (
                message.includes('Failed to fetch dynamically imported module') ||
                message.includes('Importing a module script failed') ||
                message.includes('error loading dynamically imported module')
            ) {
                // Prevent infinite reload loops if the error persists after reload
                const storageKey = `lazy_reload_${window.location.pathname}`;
                const lastReload = sessionStorage.getItem(storageKey);
                const now = Date.now();

                if (!lastReload || now - parseInt(lastReload) > 10000) {
                    sessionStorage.setItem(storageKey, now.toString());
                    window.location.reload();
                    // Return a never-resolving promise to wait for reload
                    return new Promise(() => { });
                }
            }
            throw error;
        }
    });
}
