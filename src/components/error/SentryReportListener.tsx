import React, { useEffect, useRef, useState } from "react";
import { ReportIssueDialog } from "@/components/error/ReportIssueDialog";

type Detail = { eventId: string; message?: string };

export function SentryReportListener() {
  const lastShownEventIdRef = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    const onCaptured = (evt: Event) => {
      const detail = (evt as CustomEvent<Detail>).detail;
      if (!detail?.eventId) return;
      if (lastShownEventIdRef.current === detail.eventId) return;
      lastShownEventIdRef.current = detail.eventId;

      setEventId(detail.eventId);
      setDialogOpen(true);
    };

    window.addEventListener("revo:sentry_error_captured", onCaptured as any);
    return () => window.removeEventListener("revo:sentry_error_captured", onCaptured as any);
  }, []);

  return (
    <ReportIssueDialog open={dialogOpen} onOpenChange={setDialogOpen} sentryEventId={eventId} />
  );
}
