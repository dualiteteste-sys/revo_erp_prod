import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { callRpc } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { QualidadeMotivo } from '@/services/industriaProducao';

export default function MotivosRefugoPage() {
    const [motivos, setMotivos] = useState<QualidadeMotivo[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { addToast } = useToast();

    // Form State
    const [formData, setFormData] = useState({
        codigo: '',
        descricao: '',
        tipo: 'refugo'
    });

    const fetchMotivos = async () => {
        setLoading(true);
        try {
            const data = await callRpc<QualidadeMotivo[]>('qualidade_get_motivos');
            setMotivos(data || []);
        } catch (e: any) {
            addToast('Erro ao carregar motivos: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMotivos();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Direct insert via supabase client would be easier if exposed, but let's assume we need an RPC or direct table access
            // Since I haven't made an Upsert RPC, let's use the table directly if RLS allows (Policy was "Enable all access for authenticated users")
            // We'll use the supabase check here (mocked as callRpc for now, but really should use supabase client)

            // WAIT: I should use the supabase client directly as I set "FOR ALL" policy.
            // But adhering to the 'callRpc' pattern... I'll check if I can use a generic insert.
            // Let's assume there's a `qualidade_adicionar_motivo` we can create, OR use `supabase.from().insert()`.
            // I'll assume standard direct access for "Master Data" is fine given the policy.

            // Since I don't have the supabase client imported here directly, I'll fallback to creating a small RPC in the previous migration file or just use `callRpc` to a generic 'insert_record'? No.

            // Let's add the RPC to the migration file I just created! It's safer.
            await callRpc('qualidade_adicionar_motivo', {
                p_codigo: formData.codigo,
                p_descricao: formData.descricao,
                p_tipo: formData.tipo
            });

            addToast('Motivo adicionado com sucesso!', 'success');
            setIsModalOpen(false);
            setFormData({ codigo: '', descricao: '', tipo: 'refugo' });
            fetchMotivos();
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este motivo?')) return;
        try {
            await callRpc('qualidade_excluir_motivo', { p_id: id });
            addToast('Motivo excluído.', 'success');
            fetchMotivos();
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Motivos de Qualidade</h1>
                    <p className="text-gray-500 mt-1">Gerencie os motivos de refugo, bloqueio e devolução.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 shadow-sm transition-all"
                >
                    <Plus size={20} />
                    Novo Motivo
                </button>
            </div>

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Código</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Descrição</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {motivos.map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 font-mono text-sm text-gray-700 font-medium">{m.codigo}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{m.descricao}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                        ${m.tipo === 'refugo' ? 'bg-red-100 text-red-800' :
                                            m.tipo === 'bloqueio' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {m.tipo || 'refugo'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => handleDelete(m.id)}
                                        className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                                        title="Excluir"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {motivos.length === 0 && !loading && (
                            <tr>
                                <td colSpan={4} className="text-center py-12 text-gray-400 flex flex-col items-center justify-center gap-2">
                                    <Trash2 size={48} className="opacity-20 mb-2" />
                                    <p>Nenhum motivo cadastrado.</p>
                                    <p className="text-sm">Clique em "Novo Motivo" para começar.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo Motivo">
                <form onSubmit={handleSubmit} className="space-y-6 p-6">
                    <Input
                        label="Código"
                        value={formData.codigo}
                        onChange={e => setFormData({ ...formData, codigo: e.target.value })}
                        placeholder="Ex: DIM-01"
                        required
                    />
                    <Input
                        label="Descrição"
                        value={formData.descricao}
                        onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                        placeholder="Ex: Dimensão fora da tolerância"
                        required
                    />
                    <Select
                        label="Tipo"
                        value={formData.tipo}
                        onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                    >
                        <option value="refugo">Refugo</option>
                        <option value="bloqueio">Bloqueio</option>
                        <option value="devolucao">Devolução</option>
                    </Select>
                    <div className="flex justify-end pt-4">
                        <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded hover:bg-green-700 flex gap-2 items-center shadow-sm">
                            <Save size={18} /> Salvar
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
