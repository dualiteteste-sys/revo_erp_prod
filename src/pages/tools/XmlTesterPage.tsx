import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { XMLParser } from 'fast-xml-parser';
import { FileCode, AlertCircle, CheckCircle2, Copy } from 'lucide-react';

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
            // Auto-parse on upload
            // handleParse() - não chamamos direto aqui pois o state xmlInput ainda não atualizou
        };
        reader.readAsText(file);
    };

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Testador de XML</h1>
                    <p className="text-muted-foreground mt-2">
                        Ferramenta para validar se o seu arquivo XML está sendo lido corretamente pelo sistema.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Input Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Entrada XML</CardTitle>
                        <CardDescription>Cole o conteúdo ou faça upload do arquivo.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <input
                                type="file"
                                accept=".xml"
                                onChange={handleFileUpload}
                                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-violet-50 file:text-violet-700
                  hover:file:bg-violet-100
                "
                            />
                        </div>
                        <Textarea
                            placeholder="<NFe>...</NFe>"
                            className="font-mono text-xs h-[500px]"
                            value={xmlInput}
                            onChange={(e) => setXmlInput(e.target.value)}
                        />
                        <Button onClick={handleParse} className="w-full">
                            <FileCode className="mr-2 h-4 w-4" />
                            Testar Parse
                        </Button>
                    </CardContent>
                </Card>

                {/* Output Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Resultado</CardTitle>
                        <CardDescription>Veja como o sistema interpreta este arquivo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Erro</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {parsedResult && (
                            <div className="space-y-4">
                                <Alert className="bg-green-50 border-green-200">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    <AlertTitle className="text-green-800">Sucesso</AlertTitle>
                                    <AlertDescription className="text-green-700">
                                        O arquivo foi processado. Verifique os detalhes abaixo.
                                    </AlertDescription>
                                </Alert>

                                <div className="relative">
                                    <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-auto h-[500px] text-xs font-mono">
                                        {parsedResult}
                                    </pre>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-2 right-2 text-slate-400 hover:text-white"
                                        onClick={() => navigator.clipboard.writeText(parsedResult)}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {!error && !parsedResult && (
                            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground border-2 border-dashed rounded-lg">
                                <FileCode className="h-12 w-12 mb-4 opacity-20" />
                                <p>O resultado aparecerá aqui.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
