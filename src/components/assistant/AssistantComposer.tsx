import React, { useState } from 'react';
import { SendHorizonal } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  disabled?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
};

export default function AssistantComposer({ disabled = false, onSubmit }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue('');
    await onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <label htmlFor="isa-composer" className="sr-only">
        Mensagem para a Isa
      </label>
      <textarea
        id="isa-composer"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        rows={3}
        placeholder="Pergunte sobre a tela atual, peça um roteiro de análise ou peça ajuda para entender o fluxo."
        className="w-full resize-none rounded-2xl border-0 bg-transparent px-2 py-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">A Isa responde com honestidade de escopo. Se algo ainda não estiver integrado, ela vai dizer explicitamente.</p>
        <Button type="submit" disabled={disabled || !value.trim()} className="gap-2 rounded-2xl">
          <SendHorizonal className="h-4 w-4" />
          Enviar
        </Button>
      </div>
    </form>
  );
}
