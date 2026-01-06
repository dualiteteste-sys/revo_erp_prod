import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import PageHelp from '@/components/support/PageHelp';
import { findHelpEntry } from '@/components/support/helpCatalog';

export default function ContextualHelp() {
  const location = useLocation();

  const entry = useMemo(() => findHelpEntry(location.pathname), [location.pathname]);
  if (!entry) return null;

  return (
    <div className="print:hidden mt-2 mb-6">
      <PageHelp
        title={entry.title}
        whatIs={entry.whatIs}
        steps={entry.steps}
        dependsOn={entry.dependsOn}
        connectsWith={entry.connectsWith}
        fillPerfectly={entry.fillPerfectly}
        commonMistakes={entry.commonMistakes}
        links={entry.links}
        defaultOpen={false}
      />
    </div>
  );
}
