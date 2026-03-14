import React from 'react';
import type { ProductFormData } from '../ProductFormPanel';

interface FiscalTabProps {
  data: ProductFormData;
  onChange: (field: string, value: any) => void;
}

export default function FiscalTab({ data, onChange }: FiscalTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Dados Fiscais</h3>
        <p className="text-sm text-slate-500 mb-4">
          Configure os defaults fiscais deste produto. Esses valores serão preenchidos automaticamente ao
          adicionar o produto em uma NF-e.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* NCM */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            NCM <span className="text-xs text-slate-400">(8 dígitos)</span>
          </label>
          <input
            type="text"
            value={(data as any).ncm ?? ''}
            onChange={(e) => onChange('ncm', e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Ex: 73181500"
            maxLength={8}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm font-mono"
          />
          <p className="text-xs text-slate-400 mt-1">Nomenclatura Comum do Mercosul</p>
        </div>

        {/* CFOP Padrão */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            CFOP padrão <span className="text-xs text-slate-400">(4 dígitos)</span>
          </label>
          <input
            type="text"
            value={(data as any).cfop_padrao ?? ''}
            onChange={(e) => onChange('cfop_padrao', e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="Ex: 5102"
            maxLength={4}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm font-mono"
          />
          <p className="text-xs text-slate-400 mt-1">Código fiscal de operação padrão para saída</p>
        </div>

        {/* CST Padrão */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            CST padrão <span className="text-xs text-slate-400">(Regime Normal)</span>
          </label>
          <input
            type="text"
            value={(data as any).cst_padrao ?? ''}
            onChange={(e) => onChange('cst_padrao', e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Ex: 00"
            maxLength={2}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm font-mono"
          />
          <p className="text-xs text-slate-400 mt-1">Código de Situação Tributária do ICMS</p>
        </div>

        {/* CSOSN Padrão */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            CSOSN padrão <span className="text-xs text-slate-400">(Simples Nacional)</span>
          </label>
          <input
            type="text"
            value={(data as any).csosn_padrao ?? ''}
            onChange={(e) => onChange('csosn_padrao', e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="Ex: 102"
            maxLength={3}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm font-mono"
          />
          <p className="text-xs text-slate-400 mt-1">Código de Situação da Operação no Simples Nacional</p>
        </div>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Como funciona:</strong> Ao adicionar este produto em uma NF-e, os campos NCM, CFOP, CST e CSOSN
        serão preenchidos automaticamente com os valores configurados aqui. Você pode alterar os valores
        individualmente em cada item da NF-e.
      </div>
    </div>
  );
}
