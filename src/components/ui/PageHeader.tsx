import React from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
};

export default function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="mt-0.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 p-2">
            {icon}
          </div>
        ) : null}
        <div>
          <h1 className="text-3xl font-bold text-gray-800">{title}</h1>
          {description ? <p className="text-gray-600 text-sm mt-1">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div> : null}
    </div>
  );
}

