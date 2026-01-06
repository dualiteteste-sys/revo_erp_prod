import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({ 
  title = "Ocorreu um erro", 
  message, 
  onRetry, 
  className = "" 
}) => {
  return (
    <div className={`bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center text-center max-w-lg mx-auto ${className}`}>
      <div className="bg-red-100 p-3 rounded-full mb-4">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <h3 className="text-lg font-bold text-red-900 mb-2">{title}</h3>
      <p className="text-red-700 mb-6 text-sm leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-red-200 text-red-700 font-medium rounded-lg hover:bg-red-50 hover:border-red-300 transition-[transform,colors,box-shadow] duration-150 ease-out shadow-sm active:scale-[0.98]"
        >
          <RefreshCw size={16} />
          Tentar Novamente
        </button>
      )}
    </div>
  );
};

export default ErrorAlert;
