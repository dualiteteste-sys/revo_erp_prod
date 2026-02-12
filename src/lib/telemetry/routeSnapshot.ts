type RouterLocationLike = { pathname: string };
type RouterStateLike = { location: RouterLocationLike };

export type RouterLike = {
  state: RouterStateLike;
  subscribe: (fn: (state: RouterStateLike) => void) => () => void;
};

let routePathnameSnapshot: string | null = null;

function normalizePathname(value: string | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return v.startsWith("/") ? v : `/${v}`;
}

export function setRoutePathnameSnapshot(pathname: string | null) {
  routePathnameSnapshot = normalizePathname(pathname);
}

export function getRoutePathnameSnapshot(): string | null {
  if (routePathnameSnapshot) return routePathnameSnapshot;
  if (typeof window === "undefined") return null;
  return normalizePathname(window.location?.pathname ?? null);
}

// Compat/ergonomia: nomes mais curtos para uso em logging/telemetria.
export const setRoutePathname = setRoutePathnameSnapshot;
export const getRoutePathname = getRoutePathnameSnapshot;

export function initRouteSnapshot(router: RouterLike) {
  setRoutePathnameSnapshot(router.state.location.pathname);
  return router.subscribe((state) => {
    setRoutePathnameSnapshot(state.location.pathname);
  });
}
