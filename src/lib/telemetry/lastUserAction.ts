import { recordBreadcrumb } from "@/lib/telemetry/breadcrumbsBuffer";

type LastUserAction = {
  at: number;
  route: string | null;
  label: string;
};

let lastAction: LastUserAction | null = null;
let initialized = false;

function safeText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}

function describeTarget(target: EventTarget | null): string | null {
  try {
    if (!(target instanceof Element)) return null;

    const el = target.closest("[data-action],button,a,[role='button'],input,select,textarea,label") ?? target;
    const dataAction = el.getAttribute("data-action");
    if (dataAction) return `action:${safeText(dataAction)}`;

    const aria = el.getAttribute("aria-label");
    if (aria) return `aria:${safeText(aria)}`;

    const title = el.getAttribute("title");
    if (title) return `title:${safeText(title)}`;

    const text = (el.textContent ?? "").trim();
    if (text) return safeText(text);

    const name = (el.getAttribute("name") ?? "").trim();
    if (name) return `name:${safeText(name)}`;

    const id = (el.getAttribute("id") ?? "").trim();
    if (id) return `#${safeText(id)}`;

    return el.tagName.toLowerCase();
  } catch {
    return null;
  }
}

export function setupLastUserActionTracking() {
  if (typeof window === "undefined") return;
  if (initialized) return;
  initialized = true;

  window.addEventListener(
    "click",
    (ev) => {
      const label = describeTarget(ev.target) ?? "click";
      lastAction = {
        at: Date.now(),
        route: window.location?.pathname ?? null,
        label,
      };
      recordBreadcrumb({ type: "click", message: label, data: { route: lastAction.route } });
    },
    { capture: true }
  );
}

export function getLastUserAction(): { route: string | null; label: string; ageMs: number } | null {
  if (!lastAction) return null;
  return {
    route: lastAction.route,
    label: lastAction.label,
    ageMs: Date.now() - lastAction.at,
  };
}
