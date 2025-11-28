import React, { useState, useEffect } from 'react';
import { listRecebimentos, Recebimento } from '@/services/recebimento';
import { useNavigate } from 'react-router-dom';
import { Loader2, PackageCheck, AlertTriangle, CheckCircle, Clock, Plus, FileText } from 'lucide-react';

export default function RecebimentoListPage() {
    const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await listRecebimentos();
            setRecebimentos(data);
        } catch (error) {
            console.error('Erro ao carregar recebimentos:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pendente': return <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><Clock size={12} /> Pendente</span>;
            case 'em_conferencia': return <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><PackageCheck size={12} /> Em Conferência</span>;
            case 'divergente': return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><AlertTriangle size={12} /> Divergente</span>;
            case 'concluido': return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><CheckCircle size={12} /> Concluído</span>;
            default: return <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">{status}</span>;
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Recebimento de Mercadorias</h1>
                    <p className="text-gray-600">Gerencie a entrada e conferência de notas fiscais.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/app/suprimentos/recebimento-manual')}
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
                    >
                        <FileText size={18} />
                        Entrada Manual
                    </button>
                    <button
                        onClick={() => navigate('/app/nfe-input')}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-bold shadow-sm"
                    >
                        <PackageCheck size={18} />
                        Importar XML
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fornecedor / Cliente</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Total</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" /></td></tr>
                            ) : recebimentos.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">Nenhum recebimento registrado.</td></tr>
                            ) : (
                                recebimentos.map((rec) => (
                                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {new Date(rec.data_recebimento).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                            {rec.fiscal_nfe_imports?.emitente_nome || 'Desconhecido'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {rec.fiscal_nfe_imports?.numero ? (
                                                <>Nº {rec.fiscal_nfe_imports.numero} <span className="text-xs text-gray-400">(Série {rec.fiscal_nfe_imports.serie})</span></>
                                            ) : (
                                                <span className="italic text-gray-400">Sem número</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                            R$ {rec.fiscal_nfe_imports?.total_nf?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(rec.status)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => navigate(`/app/suprimentos/recebimento/${rec.id}`)}
                                                className="text-blue-600 hover:text-blue-800 font-medium text-sm hover:underline"
                                            >
                                                {rec.status === 'concluido' ? 'Visualizar' : 'Conferir'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
