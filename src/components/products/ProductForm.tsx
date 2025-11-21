import React, { useState, useEffect } from 'react';
import { Product, ProductInsert, ProductUpdate } from '../../hooks/useProducts';
import { Loader2 } from 'lucide-react';

interface ProductFormProps {
  product?: Product | null;
  onSave: (data: ProductInsert | ProductUpdate) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

const ProductForm: React.FC<ProductFormProps> = ({ product, onSave, onCancel, isSaving }) => {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('un');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setSku(product.sku);
      setPrice((product.price_cents / 100).toFixed(2).replace('.', ','));
      setUnit(product.unit);
      setActive(product.active);
    } else {
      setName('');
      setSku('');
      setPrice('');
      setUnit('un');
      setActive(true);
    }
  }, [product]);

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value) {
        const numberValue = parseInt(value, 10);
        const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(numberValue / 100);
        setPrice(formatted);
    } else {
        setPrice('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !sku.trim()) {
      setError('Nome e SKU são obrigatórios.');
      return;
    }

    const priceInCents = Math.round(parseFloat(price.replace(/\./g, '').replace(',', '.')) * 100);
    if (isNaN(priceInCents) || priceInCents < 0) {
        setError('O preço informado é inválido.');
        return;
    }

    const formData = {
      name: name.trim(),
      sku: sku.trim(),
      price_cents: priceInCents,
      unit,
      active,
    };

    try {
      await onSave(formData);
    } catch (e: any) {
      if (e.message.includes('products_empresa_id_sku_key')) {
        setError('Já existe um produto com este SKU para esta empresa.');
      } else {
        setError(e.message || 'Ocorreu um erro ao salvar o produto.');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">{error}</p>}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome do Produto</label>
          <input
            type="text"
            name="name"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3"
          />
        </div>

        <div>
          <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU</label>
          <input
            type="text"
            name="sku"
            id="sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3"
          />
        </div>

        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700">Preço (R$)</label>
          <input
            type="text"
            name="price"
            id="price"
            value={price}
            onChange={handlePriceChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3"
            placeholder="0,00"
          />
        </div>

        <div>
          <label htmlFor="unit" className="block text-sm font-medium text-gray-700">Unidade</label>
          <input
            type="text"
            name="unit"
            id="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3"
          />
        </div>

        <div>
          <label htmlFor="active" className="block text-sm font-medium text-gray-700">Status</label>
          <select
            id="active"
            name="active"
            value={String(active)}
            onChange={(e) => setActive(e.target.value === 'true')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3"
          >
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
      </div>

      <div className="pt-5">
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" /> : 'Salvar Produto'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default ProductForm;
