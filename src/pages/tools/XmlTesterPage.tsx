import React, { useState } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import { XMLParser } from 'fast-xml-parser';
import { FileCode, AlertCircle, CheckCircle2, Copy, FileUp, Loader2 } from 'lucide-react';

export default function XmlTesterPage() {
    const [xmlInput, setXmlInput] = useState('');
    const [parsedResult, setParsedResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleParse = () => {
        setError(null);
        setParsedResult(null);

        if (!xmlInput.trim()) {
            setError('Por favor, insira um conteúdo XML.');
            return;
        }

        try {
            // Lógica IDÊNTICA ao NfeInputPage.tsx
            // Remove namespaces via regex before parsing to handle <ns:tag>
            const cleanXml = xmlInput.replace(/<(\/?)[a-zA-Z0-9]+:/g, '<$1');

            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "@_"
            });

            const jsonData = parser.parse(cleanXml);

            // Tenta identificar a estrutura
            const root = jsonData.nfeProc ? jsonData.nfeProc.NFe : jsonData.NFe;

            const result = {
                raw_parse: jsonData,
                detected_root: root ? 'NFe Encontrada' : 'NFe NÃO Encontrada',
                infNFe: root?.infNFe ? 'infNFe Encontrada' : 'infNFe NÃO Encontrada',
                id: root?.infNFe?.['@_Id'] || 'ID não encontrado'
            };

            setParsedResult(JSON.stringify(result, null, 2));
        } catch (e: any) {
            setError(`Erro ao fazer parse: ${e.message}`);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setXmlInput(content);
        };
        reader.readAsText(file);
    };

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-800">Testador de XML</h1>
                    <p className="text-gray-600 mt-2">
                        Ferramenta para validar se o seu arquivo XML está sendo lido corretamente pelo sistema.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Input Section */}
                <GlassCard className="p-6">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">Entrada XML</h2>
                        <p className="text-sm text-gray-500">Cole o conteúdo ou faça upload do arquivo.</p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-center w-full">
                            <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <FileUp className="w-8 h-8 mb-3 text-gray-400" />
                                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Clique para enviar</span> ou arraste</p>
                                    <p className="text-xs text-gray-500">XML (MAX. 10MB)</p>
                                </div>
                                <input id="dropzone-file" type="file" className="hidden" accept=".xml" onChange={handleFileUpload} />
                            </label>
                        </div>

                        <textarea
                            placeholder="<NFe>...</NFe>"
                            className="w-full h-[500px] p-4 font-mono text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none bg-white"
                            value={xmlInput}
                            onChange={(e) => setXmlInput(e.target.value)}
                        />

                        <button
                            onClick={handleParse}
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <FileCode className="h-4 w-4" />
                            Testar Parse
                        </button>
                    </div>
                </GlassCard>

                {/* Output Section */}
                <GlassCard className="p-6">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">Resultado</h2>
                        <p className="text-sm text-gray-500">Veja como o sistema interpreta este arquivo.</p>
                    </div>

                    <div className="h-full">
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                                <div>
                                    <h3 className="text-sm font-medium text-red-800">Erro</h3>
                                    <div className="text-sm text-red-700 mt-1">{error}</div>
                                </div>
                            </div>
                        )}

                        {parsedResult && (
                            <div className="space-y-4 h-full">
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                                    <div>
                                        <h3 className="text-sm font-medium text-green-800">Sucesso</h3>
                                        <div className="text-sm text-green-700 mt-1">
                                            O arquivo foi processado. Verifique os detalhes abaixo.
                                        </div>
                                    </div>
                                </div>

                                <div className="relative h-[500px]">
                                    <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-auto h-full text-xs font-mono">
                                        {parsedResult}
                                    </pre>
                                    <button
                                        className="absolute top-2 right-2 p-2 text-slate-400 hover:text-white bg-slate-800/50 rounded-md transition-colors"
                                        onClick={() => navigator.clipboard.writeText(parsedResult)}
                                        title="Copiar JSON"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {!error && !parsedResult && (
                            <div className="flex flex-col items-center justify-center h-[400px] text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                                <FileCode className="h-12 w-12 mb-4 opacity-20" />
                                <p>O resultado aparecerá aqui.</p>
                            </div>
                        )}
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
