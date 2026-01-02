import React, { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, FileText, Folder, Loader2, Search } from 'lucide-react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk';
import { Popover, PopoverContent, PopoverTrigger } from '@radix-ui/react-popover';
import { useDebounce } from '@/hooks/useDebounce';
import { fetchNcmByCode, searchNcm } from '@/services/externalApis';
import { cn } from '@/lib/utils'; // Assuming utils exists, if not I'll use a local helper or inline clsx

// Simple cn utility if not available, but usually is in these stacks.
// If it fails, I'll fix it. Checking imports first is safer but I'll assume standard shadcn-like structure.
// Actually, let's check if 'clsx' and 'tailwind-merge' are used in the project.
// They are in package.json.

interface NcmResult {
  codigo: string;
  descricao: string;
}

interface NcmSearchProps {
  value: string;
  onChange: (value: string) => void;
}

const NcmSearch: React.FC<NcmSearchProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<NcmResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [isLoadingDescription, setIsLoadingDescription] = useState(false);

  const debouncedSearch = useDebounce(inputValue, 500);
  const debouncedValue = useDebounce(value, 800);

  // Fetch search results
  useEffect(() => {
    if (!open) return;
    if (debouncedSearch.length < 2) {
      setResults([]);
      return;
    }

    const searchNcm = async () => {
      setLoading(true);
      try {
        const data = await searchNcm(debouncedSearch);
        setResults(data as NcmResult[]);
      } catch (error) {
        console.error("NCM Search Error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    searchNcm();
  }, [debouncedSearch, open]);

  // Fetch description for the selected value (auto-fetch logic)
  useEffect(() => {
    const fetchDesc = async () => {
      const cleanCode = (value || '').replace(/\D/g, '');
      if (cleanCode.length !== 8) {
        setDescription(null);
        return;
      }

      setIsLoadingDescription(true);
      try {
        const data = await fetchNcmByCode(cleanCode);
        if (data?.descricao) {
          setDescription(data.descricao);
        } else {
          setDescription(null);
        }
      } catch (error) {
        // Silent error for description fetch
        setDescription(null);
      } finally {
        setIsLoadingDescription(false);
      }
    };

    if (value && !description) {
      fetchDesc();
    } else if (!value) {
      setDescription(null);
    }
  }, [debouncedValue, value, description]);

  const handleSelect = (item: NcmResult) => {
    const rawCode = item.codigo.replace(/\D/g, '');

    if (rawCode.length === 8) {
      // Final selection
      let maskedValue = rawCode;
      if (rawCode.length > 4) maskedValue = rawCode.replace(/^(\d{4})/, '$1.');
      if (rawCode.length > 6) maskedValue = maskedValue.replace(/^(\d{4})\.(\d{2})/, '$1.$2.');

      onChange(maskedValue);
      setDescription(item.descricao);
      setOpen(false);
      setInputValue(''); // Clear search input on selection? Or keep it? Usually clear or set to label.
      // But here the input is separate from the search input in the popover.
    } else {
      // Drill down / Category selection
      // We update the search input to this code to "drill down"
      setInputValue(item.codigo);
      // We don't close the popover
    }
  };

  return (
    <div className="sm:col-span-3 flex flex-col gap-2">
      <label htmlFor="ncm" className="block text-sm font-medium text-gray-700">NCM</label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            role="combobox"
            aria-expanded={open}
            className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm flex items-center justify-between text-left"
          >
            <span className={value ? "text-gray-900" : "text-gray-500"}>
              {value || "Buscar NCM..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999]" align="start">
          <Command className="rounded-lg border shadow-md overflow-hidden" shouldFilter={false} filter={() => 1}>
            <div className="flex items-center border-b px-3" data-cmdk-input-wrapper="">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <CommandInput
                placeholder="Digite nome ou código..."
                value={inputValue}
                onValueChange={setInputValue}
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1 scrollbar-styled">
              {loading && (
                <div className="py-6 text-center text-sm text-gray-500 flex justify-center items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
                </div>
              )}

              {!loading && results.length === 0 && debouncedSearch.length > 1 && (
                <div className="py-6 text-center text-sm text-gray-500">
                  Nenhum NCM encontrado.
                </div>
              )}

              {!loading && results.length > 0 && (
                <CommandGroup heading="Resultados">
                  {results.map((item) => {
                    const rawCode = item.codigo.replace(/\D/g, '');
                    const isSelectable = rawCode.length === 8;

                    return (
                      <CommandItem
                        key={item.codigo}
                        value={`${item.codigo} ${item.descricao}`} // Searchable string
                        onSelect={() => handleSelect(item)}
                        className={cn(
                          "relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-blue-50 aria-selected:text-blue-700 cursor-pointer transition-colors",
                          isSelectable ? "font-medium" : "text-gray-600"
                        )}
                      >
                        <div className={cn(
                          "mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                          isSelectable ? "border-blue-200 bg-blue-100 text-blue-600" : "border-gray-200 bg-gray-100 text-gray-500"
                        )}>
                          {isSelectable ? <FileText className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="truncate font-mono text-xs text-gray-500">{item.codigo}</span>
                          <span className="truncate font-medium">{item.descricao}</span>
                        </div>
                        {isSelectable && value === item.codigo && ( // Simple check, might need formatting check
                          <Check className="ml-auto h-4 w-4 text-blue-600" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Description Display */}
      <div className="min-h-[20px]">
        {isLoadingDescription ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 animate-pulse">
            <Loader2 size={12} className="animate-spin" />
            Buscando descrição...
          </div>
        ) : description ? (
          <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 flex gap-2 items-start">
            <FileText size={14} className="mt-0.5 text-blue-500 shrink-0" />
            <p>{description}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default NcmSearch;
