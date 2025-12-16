import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  CentroTrabalho,
  CentroTrabalhoPayload,
  getCentroCalendarioSemanal,
  upsertCentroCalendarioSemanal,
  saveCentroTrabalho
} from '@/services/industriaCentros';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import Toggle from '@/components/ui/forms/Toggle';

interface Props {
  centro: CentroTrabalho | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function CentroTrabalhoFormPanel({ centro, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [formData, setFormData] = useState<CentroTrabalhoPayload>({
    ativo: true,
    tipo_uso: 'ambos'
  });

  const [calendarHours, setCalendarHours] = useState<number[]>(() => Array.from({ length: 7 }).map(() => 0));
  const [calendarDirty, setCalendarDirty] = useState(false);

  const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const applyDefaultCalendar = (hoursPerWeekday: number) => {
    // 0=Dom, 6=Sáb
    setCalendarHours([0, hoursPerWeekday, hoursPerWeekday, hoursPerWeekday, hoursPerWeekday, hoursPerWeekday, 0]);
  };

  useEffect(() => {
    if (centro) {
      setFormData(centro);
    }
  }, [centro]);

  useEffect(() => {
    if (!centro?.id) {
      const base = Number(centro?.capacidade_horas_dia ?? formData.capacidade_horas_dia ?? 8) || 8;
      applyDefaultCalendar(base);
      setCalendarDirty(false);
      return;
    }

    setCalendarLoading(true);
    getCentroCalendarioSemanal(centro.id)
      .then((rows) => {
        if (!rows?.length) {
          const base = Number(centro.capacidade_horas_dia ?? 8) || 8;
          applyDefaultCalendar(base);
          setCalendarDirty(false);
          return;
        }
        const next = Array.from({ length: 7 }).map(() => 0);
        for (const row of rows) {
          if (row.dow >= 0 && row.dow <= 6) next[row.dow] = Number(row.capacidade_horas) || 0;
        }
        setCalendarHours(next);
        setCalendarDirty(false);
      })
      .catch((e: any) => {
        addToast(e?.message || 'Não foi possível carregar o calendário do centro.', 'error');
      })
      .finally(() => setCalendarLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centro?.id]);

  const handleChange = (field: keyof CentroTrabalhoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (calendarDirty) return;
    if (!centro?.id) {
      const base = Number(formData.capacidade_horas_dia ?? 8) || 8;
      applyDefaultCalendar(base);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.capacidade_horas_dia]);

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O nome é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveCentroTrabalho(formData);
      if (saved?.id) {
        await upsertCentroCalendarioSemanal(
          saved.id,
          calendarHours.map((capacidade_horas, dow) => ({ dow, capacidade_horas }))
        );
      }
      addToast('Centro de trabalho salvo com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Identificação" description="Dados básicos do centro de trabalho.">
          <Input
            label="Nome"
            name="nome"
            value={formData.nome || ''}
            onChange={e => handleChange('nome', e.target.value)}
            required
            className="sm:col-span-4"
          />
          <Input
            label="Código"
            name="codigo"
            value={formData.codigo || ''}
            onChange={e => handleChange('codigo', e.target.value)}
            className="sm:col-span-2"
          />
          <div className="sm:col-span-6">
            <Toggle
              label="Ativo"
              name="ativo"
              checked={formData.ativo !== false}
              onChange={checked => handleChange('ativo', checked)}
            />
          </div>
          <TextArea
            label="Descrição"
            name="descricao"
            value={formData.descricao || ''}
            onChange={e => handleChange('descricao', e.target.value)}
            rows={3}
            className="sm:col-span-6"
          />
        </Section>

        <Section title="Capacidade e Uso" description="Definições operacionais.">
          <Select
            label="Tipo de Uso"
            name="tipo_uso"
            value={formData.tipo_uso || 'ambos'}
            onChange={e => handleChange('tipo_uso', e.target.value)}
            className="sm:col-span-3"
          >
            <option value="producao">Produção</option>
            <option value="beneficiamento">Beneficiamento</option>
            <option value="ambos">Ambos</option>
          </Select>

          <Input
            label="Tempo de Setup (min)"
            name="setup"
            type="number"
            value={formData.tempo_setup_min || ''}
            onChange={e => handleChange('tempo_setup_min', parseInt(e.target.value))}
            className="sm:col-span-3"
          />

          <Input
            label="Capacidade (Unidades/Hora)"
            name="capacidade"
            type="number"
            value={formData.capacidade_unidade_hora || ''}
            onChange={e => handleChange('capacidade_unidade_hora', parseFloat(e.target.value))}
            className="sm:col-span-3"
          />
          <Input
            label="Capacidade disponível (horas/dia)"
            name="capacidade_horas_dia"
            type="number"
            value={formData.capacidade_horas_dia ?? ''}
            onChange={e => handleChange('capacidade_horas_dia', parseFloat(e.target.value))}
            className="sm:col-span-3"
          />

          <div className="sm:col-span-3 flex items-center justify-around bg-gray-50 rounded-lg border border-gray-200 px-4 py-2">
            <div className="text-center">
              <span className="block text-xs text-gray-500 font-medium uppercase">Por Minuto</span>
              <span className="text-lg font-bold text-blue-600">
                {formData.capacidade_unidade_hora && formData.capacidade_unidade_hora > 0
                  ? (formData.capacidade_unidade_hora / 60).toFixed(2)
                  : '-'}
              </span>
              <span className="text-xs text-gray-400 ml-1">un/min</span>
            </div>
            <div className="h-8 w-px bg-gray-300"></div>
            <div className="text-center">
              <span className="block text-xs text-gray-500 font-medium uppercase">Por Segundo</span>
              <span className="text-lg font-bold text-blue-600">
                {formData.capacidade_unidade_hora && formData.capacidade_unidade_hora > 0
                  ? (formData.capacidade_unidade_hora / 3600).toFixed(4)
                  : '-'}
              </span>
              <span className="text-xs text-gray-400 ml-1">un/s</span>
            </div>
          </div>

          <div className="sm:col-span-6 mt-2">
            <Toggle
              label="Requer Inspeção ao Final"
              name="inspecao"
              checked={formData.requer_inspecao_final || false}
              onChange={checked => handleChange('requer_inspecao_final', checked)}
            />
          </div>
        </Section>

        <Section
          title="Calendário semanal (capacidade finita)"
          description="Defina a capacidade por dia da semana (h/dia). O PCP usa estes valores para calcular carga x capacidade."
        >
          <div className="sm:col-span-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-sm px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
              onClick={() => {
                const base = Number(formData.capacidade_horas_dia ?? 8) || 8;
                applyDefaultCalendar(base);
                setCalendarDirty(true);
              }}
              disabled={calendarLoading}
            >
              Aplicar padrão (Seg–Sex = capacidade/dia)
            </button>
            <button
              type="button"
              className="text-sm px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
              onClick={() => {
                const base = Number(formData.capacidade_horas_dia ?? 8) || 8;
                setCalendarHours([0, base, base, base, base, base, base / 2]);
                setCalendarDirty(true);
              }}
              disabled={calendarLoading}
            >
              Padrão com sábado (Sáb = 50%)
            </button>
            {calendarLoading && (
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Carregando calendário…
              </span>
            )}
          </div>

          {DOW_LABELS.map((label, dow) => (
            <Input
              key={label}
              label={`${label} (h)`}
              name={`cal_${dow}`}
              type="number"
              step="0.5"
              value={calendarHours[dow] ?? 0}
              onChange={(e) => {
                const value = Math.max(0, Number(e.target.value) || 0);
                setCalendarHours((prev) => prev.map((v, i) => (i === dow ? value : v)));
                setCalendarDirty(true);
              }}
              className="sm:col-span-2"
            />
          ))}
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || calendarLoading}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>
    </div>
  );
}
