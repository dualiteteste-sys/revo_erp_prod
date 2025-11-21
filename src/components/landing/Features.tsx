import React from 'react';
import { featureCategories } from '../../config/pricingConfig';
import { Check, Minus } from 'lucide-react';

const Features: React.FC = () => {
    const renderValue = (value: string | boolean) => {
        if (typeof value === 'boolean') {
            return value ? <Check className="text-green-500 mx-auto" /> : <Minus className="text-gray-400 mx-auto" />;
        }
        return <span className="text-gray-700 text-sm">{value}</span>;
    };

    return (
        <section id="features" className="py-20 bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
                        Compare os Recursos
                    </h2>
                    <p className="mt-4 text-lg text-gray-600">
                        Encontre o plano perfeito com os recursos que sua empresa precisa.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 sticky left-0 bg-gray-100">Recurso</th>
                                <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Start</th>
                                <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 border-2 border-y-0 border-blue-500 bg-blue-50">Pro</th>
                                <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Max</th>
                                <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Ultra</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {featureCategories.map((category) => (
                                <React.Fragment key={category.name}>
                                    <tr>
                                        <td colSpan={5} className="bg-gray-100 px-4 py-2 text-sm font-bold text-gray-800 sm:pl-6 sticky left-0">
                                            {category.name}
                                        </td>
                                    </tr>
                                    {category.features.map((feature) => (
                                        <tr key={feature.name}>
                                            <td className="py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 sticky left-0 bg-white">{feature.name}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-center text-sm text-gray-500">{renderValue(feature.start)}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-center text-sm text-gray-500 bg-blue-50/50">{renderValue(feature.pro)}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-center text-sm text-gray-500">{renderValue(feature.max)}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-center text-sm text-gray-500">{renderValue(feature.ultra)}</td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
};

export default Features;
