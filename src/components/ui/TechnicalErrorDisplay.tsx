import React, { useState, useRef, useEffect } from 'react';
import { XCircle, Clipboard } from 'lucide-react';

interface TechnicalErrorDisplayProps {
  title: string;
  message: string;
  hint?: string;
}

const TechnicalErrorDisplay: React.FC<TechnicalErrorDisplayProps> = ({ title, message, hint }) => {
  const [copyText, setCopyText] = useState('Copy Details');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    const detailsToCopy = `Title: ${title}\n\nMessage: ${message}${hint ? `\n\nHint: ${hint}` : ''}`;
    navigator.clipboard.writeText(detailsToCopy).then(() => {
      setCopyText('Copied!');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        setCopyText('Copy Details');
      }, 2500);
    });
  };

  return (
    <div className="rounded-lg bg-red-50 p-4 border border-red-200 relative">
      <div className="flex">
        <div className="flex-shrink-0">
          <XCircle className="h-6 w-6 text-red-500" aria-hidden="true" />
        </div>
        <div className="ml-3 flex-1 md:flex md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-red-900">{title}</h3>
            <div className="mt-2 text-sm text-red-800">
              <pre className="font-mono whitespace-pre-wrap break-words">{message}</pre>
            </div>
            {hint && (
              <div className="mt-4">
                <div className="text-sm text-red-800">
                  <p className="font-bold">Hint:</p>
                  <pre className="font-mono whitespace-pre-wrap break-words">{hint}</pre>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 md:mt-0 md:ml-6">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-white px-3 py-2 text-sm font-medium text-red-800 shadow-sm ring-1 ring-inset ring-red-200 hover:bg-red-100 transition-all duration-200"
            >
              <Clipboard size={16} />
              {copyText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalErrorDisplay;
