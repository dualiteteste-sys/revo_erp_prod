import React from "react";

type ToastType = "success" | "error" | "warning" | "info";

export type ToastProps = {
  type?: ToastType;
  title?: string;
  message?: string;
  onClose?: () => void;
  // opcional: permite passar um ícone custom
  icon?: React.ReactNode;
  className?: string;
};

const toastConfig: Record<ToastType, { icon: React.ReactNode; className: string }> = {
  success: { icon: <span aria-hidden>✓</span>, className: "bg-green-600 text-white" },
  error:   { icon: <span aria-hidden>✕</span>, className: "bg-red-600 text-white" },
  warning: { icon: <span aria-hidden>!</span>, className: "bg-yellow-600 text-black" },
  info:    { icon: <span aria-hidden>i</span>, className: "bg-blue-600 text-white" },
};

export default function Toast(props: ToastProps) {
  const {
    type = "info",
    title,
    message,
    onClose,
    icon,
    className = "",
  } = props;

  // Fallback seguro: se vier um type inválido, cai para "info"
  const cfg = toastConfig[type as ToastType] ?? toastConfig.info;

  return (
    <div
      role="status"
      className={`pointer-events-auto w-full max-w-sm rounded-2xl shadow-lg ring-1 ring-black/10 p-3 flex gap-3 ${cfg.className} ${className}`}
      data-log="[UI][Toast]"
    >
      <div className="shrink-0">{icon ?? cfg.icon}</div>
      <div className="min-w-0">
        {title && <p className="font-semibold leading-5">{title}</p>}
        {message && <p className="text-sm opacity-90">{message}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="ml-auto rounded-md px-2 text-current/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
        >
          ×
        </button>
      )}
    </div>
  );
}
