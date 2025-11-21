import React, { useState, useEffect } from 'react';
import { ProductFormData } from '../ProductFormPanel';
import Input from '../../ui/forms/Input';
import TextArea from '../../ui/forms/TextArea';
import Section from '../../ui/forms/Section';
import { useAuth } from '../../../contexts/AuthProvider';
import { useSupabase } from '@/providers/SupabaseProvider';

interface AdditionalDataTabProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: any) => void;
}

const DisabledDisplay: React.FC<{label: string, value: string, placeholder: string, loading: boolean}> = ({ label, value, placeholder, loading }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <div className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-500 cursor-not-allowed min-h-[46px] flex items-center">
      {loading ? 'Carregando...' : value || placeholder}
    </div>
    <p className="text-xs text-gray-400 mt-1">Busca por nome será habilitada em breve.</p>
  </div>
);

const AdditionalDataTab: React.FC<AdditionalDataTabProps> = ({ data, onChange }) => {
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const [brandName, setBrandName] = useState('');
  const [measurementTableName, setMeasurementTableName] = useState('');
  const [parentProductName, setParentProductName] = useState('');
  const [isLoadingNames, setIsLoadingNames] = useState(false);

  useEffect(() => {
    const fetchRelatedNames = async () => {
      if (!activeEmpresa) return;
      setIsLoadingNames(true);

      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

      // Brand
      if (data.marca_id && uuidRegex.test(data.marca_id)) {
        const { data: brand } = await supabase.from('marcas').select('nome').eq('id', data.marca_id).single();
        setBrandName(brand?.nome || data.marca_id);
      } else {
        setBrandName(data.marca_id || '');
      }

      // Measurement Table
      if (data.tabela_medidas_id) {
        const { data: table } = await supabase.from('tabelas_medidas').select('nome').eq('id', data.tabela_medidas_id).single();
        setMeasurementTableName(table?.nome || data.tabela_medidas_id);
      } else {
        setMeasurementTableName('');
      }

      // Parent Product
      if (data.produto_pai_id) {
        const { data: product } = await supabase.from('produtos').select('nome').eq('id', data.produto_pai_id).single();
        setParentProductName(product?.nome || data.produto_pai_id);
      } else {
        setParentProductName('');
      }

      setIsLoadingNames(false);
    };

    fetchRelatedNames();
  }, [data.marca_id, data.tabela_medidas_id, data.produto_pai_id, activeEmpresa, supabase]);

  const handleBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setBrandName(newName);
    onChange('marca_id', newName); // Passa o nome da marca para a lógica de salvar
  };

  return (
    <div>
      <Section
        title="Relacionamentos"
        description="Associe este produto a outras entidades do sistema."
      >
        <Input
          label="Marca"
          name="marca"
          value={isLoadingNames && data.marca_id ? 'Carregando...' : brandName}
          onChange={handleBrandChange}
          placeholder="Digite o nome da marca"
        />
        
        <DisabledDisplay
          label="Tabela de Medidas"
          value={measurementTableName}
          placeholder="Nenhuma tabela selecionada"
          loading={isLoadingNames && !!data.tabela_medidas_id}
        />
        
        <div className="sm:col-span-2">
          <DisabledDisplay
            label="Produto Pai (para variações)"
            value={parentProductName}
            placeholder="Nenhum produto pai selecionado"
            loading={isLoadingNames && !!data.produto_pai_id}
          />
        </div>
      </Section>
      <Section
        title="Conteúdo Adicional"
        description="Enriqueça a página do produto com mais informações."
      >
        <div className="sm:col-span-2">
            <Input
                label="URL do Vídeo"
                name="video_url"
                value={data.video_url || ''}
                onChange={(e) => onChange('video_url', e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
            />
        </div>
        <div className="sm:col-span-2">
            <TextArea
                label="Descrição Complementar"
                name="descricao_complementar"
                value={data.descricao_complementar || ''}
                onChange={(e) => onChange('descricao_complementar', e.target.value)}
                rows={5}
            />
        </div>
      </Section>
    </div>
  );
};

export default AdditionalDataTab;
