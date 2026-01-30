import React from 'react';
import { motion } from 'framer-motion';
import { MoreVertical, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Configuração de campo para exibição no card
 */
export interface FieldConfig<T> {
    /** Chave do campo no objeto de dados */
    key: keyof T;
    /** Label a ser exibido (opcional - se omitido, só mostra valor) */
    label?: string;
    /** Formato do valor */
    format?: 'text' | 'currency' | 'date' | 'datetime' | 'number' | 'percent';
    /** Classes CSS customizadas para o valor */
    className?: string;
}

/**
 * Configuração de ação no dropdown menu
 */
export interface ActionConfig<T> {
    /** Identificador único */
    key: string;
    /** Texto do botão */
    label: string;
    /** Ícone (componente Lucide) */
    icon?: LucideIcon;
    /** Callback ao clicar */
    onClick: (item: T) => void;
    /** Variante visual */
    variant?: 'default' | 'destructive';
    /** Condição para mostrar (opcional) */
    show?: (item: T) => boolean;
}

/**
 * Configuração de badge/status
 */
export interface BadgeConfig<T> {
    /** Chave do campo que determina o valor */
    key: keyof T;
    /** Mapeamento de valores para cores/labels */
    variants: Record<string, { label: string; color: 'green' | 'red' | 'yellow' | 'blue' | 'gray' }>;
}

export interface GenericMobileCardProps<T> {
    /** Dados do item */
    item: T;
    /** Campo para título principal */
    titleKey: keyof T;
    /** Campo para subtítulo (opcional) */
    subtitleKey?: keyof T;
    /** Ícone à esquerda (componente Lucide) */
    icon?: LucideIcon;
    /** Cor do ícone */
    iconColor?: string;
    /** Campos adicionais a exibir */
    fields?: FieldConfig<T>[];
    /** Campo para valor destacado (ex: preço) */
    valueKey?: keyof T;
    /** Formato do valor destacado */
    valueFormat?: 'currency' | 'number';
    /** Configuração de badge/status */
    badge?: BadgeConfig<T>;
    /** Ações disponíveis no menu dropdown */
    actions?: ActionConfig<T>[];
    /** Se o item está selecionado */
    selected?: boolean;
    /** Callback para toggle de seleção */
    onToggleSelect?: (id: string) => void;
    /** Chave para o ID do item (para seleção) */
    idKey?: keyof T;
    /** Click no card (se não tiver dropdown) */
    onClick?: (item: T) => void;
}

// Cores dos badges
const badgeColors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-600',
};

// Formatadores
function formatValue(value: unknown, format?: string): string {
    if (value === null || value === undefined) return '—';

    switch (format) {
        case 'currency':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
        case 'date':
            return new Date(String(value)).toLocaleDateString('pt-BR');
        case 'datetime':
            return new Date(String(value)).toLocaleString('pt-BR');
        case 'number':
            return new Intl.NumberFormat('pt-BR').format(Number(value));
        case 'percent':
            return `${Number(value).toFixed(1)}%`;
        default:
            return String(value);
    }
}

/**
 * GenericMobileCard - Card mobile genérico e configurável
 * 
 * Pode ser usado como base para criar cards de qualquer entidade,
 * configurando campos, ações e formatações via props.
 * 
 * @example
 * ```tsx
 * <GenericMobileCard
 *   item={partner}
 *   titleKey="nome"
 *   subtitleKey="documento"
 *   icon={Users}
 *   valueKey="saldo"
 *   valueFormat="currency"
 *   badge={{ key: 'status', variants: { ativo: { label: 'Ativo', color: 'green' } } }}
 *   actions={[
 *     { key: 'edit', label: 'Editar', icon: Edit, onClick: handleEdit },
 *     { key: 'delete', label: 'Excluir', icon: Trash2, onClick: handleDelete, variant: 'destructive' },
 *   ]}
 * />
 * ```
 */
export function GenericMobileCard<T extends Record<string, unknown>>({
    item,
    titleKey,
    subtitleKey,
    icon: Icon,
    iconColor = 'text-blue-500',
    fields = [],
    valueKey,
    valueFormat = 'currency',
    badge,
    actions = [],
    selected,
    onToggleSelect,
    idKey = 'id' as keyof T,
    onClick,
}: GenericMobileCardProps<T>): React.ReactElement {
    const title = String(item[titleKey] || '(Sem nome)');
    const subtitle = subtitleKey ? String(item[subtitleKey] || '') : undefined;
    const value = valueKey ? item[valueKey] : undefined;
    const badgeValue = badge ? String(item[badge.key] || '') : undefined;
    const badgeConfig = badge && badgeValue ? badge.variants[badgeValue] : undefined;
    const id = String(item[idKey] || '');

    const visibleActions = actions.filter(a => !a.show || a.show(item));

    return (
        <motion.div
            className={cn(
                'bg-white rounded-xl border p-4 transition-all duration-200',
                selected
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                    : 'border-gray-100 hover:border-gray-200 hover:shadow-sm',
                onClick && 'cursor-pointer'
            )}
            whileTap={onClick ? { scale: 0.98 } : undefined}
            onClick={onClick ? () => onClick(item) : undefined}
        >
            <div className="flex items-start gap-3">
                {/* Checkbox (se seleção habilitada) */}
                {onToggleSelect && (
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Selecionar ${title}`}
                    />
                )}

                {/* Ícone */}
                {Icon && (
                    <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center">
                        <Icon className={cn('w-5 h-5', iconColor)} />
                    </div>
                )}

                {/* Conteúdo principal */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>
                            )}
                        </div>

                        {/* Menu de ações */}
                        {visibleActions.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        className="p-1.5 -mr-1 rounded-lg hover:bg-gray-100 transition-colors"
                                        aria-label="Ações"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <MoreVertical className="w-4 h-4 text-gray-400" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                    {visibleActions.map((action) => (
                                        <DropdownMenuItem
                                            key={action.key}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                action.onClick(item);
                                            }}
                                            className={action.variant === 'destructive' ? 'text-red-600 focus:text-red-600' : undefined}
                                        >
                                            {action.icon && <action.icon className="w-4 h-4 mr-2" />}
                                            {action.label}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    {/* Campos adicionais */}
                    {fields.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                            {fields.map((field) => (
                                <span key={String(field.key)} className={cn('text-xs text-gray-500', field.className)}>
                                    {field.label && <span className="text-gray-400">{field.label}: </span>}
                                    {formatValue(item[field.key], field.format)}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Linha inferior com valor e badge */}
                    {(value !== undefined || badgeConfig) && (
                        <div className="flex items-center justify-between mt-2">
                            {value !== undefined && (
                                <span className="text-sm font-semibold text-gray-900">
                                    {formatValue(value, valueFormat)}
                                </span>
                            )}
                            {badgeConfig && (
                                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', badgeColors[badgeConfig.color])}>
                                    {badgeConfig.label}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

export default GenericMobileCard;
