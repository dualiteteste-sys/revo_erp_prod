import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { popModalContext, pushModalContext, updateModalContext } from "@/lib/telemetry/modalContextStack"
import { getRoutePathname } from "@/lib/telemetry/routeSnapshot"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  traceName?: string
  traceRoute?: string
  traceParams?: Record<string, unknown>
}

function inferModalTitleFromContent(contentEl: HTMLElement | null): string | null {
  try {
    if (!contentEl) return null
    const titleEl = contentEl.querySelector("[data-modal-title]")
    const txt = (titleEl?.textContent ?? "").replace(/\s+/g, " ").trim()
    return txt ? txt.slice(0, 140) : null
  } catch {
    return null
  }
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, traceName, traceRoute, traceParams, ...props }, ref) => {
  const localRef = React.useRef<HTMLElement | null>(null)
  const modalIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const id = pushModalContext({
      kind: "dialog",
      name: traceName ?? null,
      logicalRoute: traceRoute ?? null,
      params: traceParams ?? null,
      baseRouteAtOpen: getRoutePathname(),
    })
    modalIdRef.current = id

    const raf = window.requestAnimationFrame(() => {
      if (traceName) return
      const title = inferModalTitleFromContent(localRef.current)
      if (title) updateModalContext(id, { name: title })
    })

    return () => {
      window.cancelAnimationFrame(raf)
      popModalContext(id)
      modalIdRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const id = modalIdRef.current
    if (!id) return
    if (traceName !== undefined || traceRoute !== undefined || traceParams !== undefined) {
      updateModalContext(id, {
        name: traceName ?? undefined,
        logicalRoute: traceRoute ?? undefined,
        params: traceParams ?? undefined,
      })
    }
  }, [traceName, traceRoute, traceParams])

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={(node) => {
          localRef.current = node as unknown as HTMLElement | null
          if (typeof ref === "function") ref(node)
          else if (ref) (ref as unknown as React.MutableRefObject<React.ElementRef<typeof DialogPrimitive.Content> | null>).current = node
        }}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full min-w-[50vw] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className
        )}
        {...props}
      >
        {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-modal-title=""
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
