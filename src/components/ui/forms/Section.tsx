import React from 'react';

interface SectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, description, children }) => (
  <div className="pt-8 mt-8 border-t border-gray-200 first:mt-0 first:pt-0 first:border-t-0">
    <div>
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-6 gap-6">
      {children}
    </div>
  </div>
);

export default Section;
