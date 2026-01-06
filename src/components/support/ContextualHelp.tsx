import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import PageHelp from '@/components/support/PageHelp';
import { findHelpEntry } from '@/components/support/helpCatalog';

export default function ContextualHelp() {
  const location = useLocation();

  const entry = useMemo(() => findHelpEntry(location.pathname), [location.pathname]);
  if (!entry) return null;

  return (
    <div className="print:hidden">
      <PageHelp
        title={entry.title}
        whatIs={entry.whatIs}
        steps={entry.steps}
        links={entry.links}
        defaultOpen={false}
      />
    </div>
  );
}
