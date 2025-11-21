import { KanbanOs } from "@/services/os";
import { KanbanColumns } from "./OsKanbanBoard";

export type ColumnId = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'future' | 'no_date';

const columnOrder: ColumnId[] = ['overdue', 'today', 'tomorrow', 'this_week', 'next_week', 'future', 'no_date'];

const getStartOfDate = (date: Date): Date => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
};

export const groupOsByDate = (osList: KanbanOs[]): KanbanColumns => {
    const today = getStartOfDate(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    
    const endOfNextWeek = new Date(endOfWeek);
    endOfNextWeek.setDate(endOfWeek.getDate() + 7);

    const columns: KanbanColumns = {
        overdue: { id: 'overdue', title: 'Atrasadas', items: [] },
        today: { id: 'today', title: 'Hoje', items: [] },
        tomorrow: { id: 'tomorrow', title: 'Amanhã', items: [] },
        this_week: { id: 'this_week', title: 'Esta Semana', items: [] },
        next_week: { id: 'next_week', title: 'Próxima Semana', items: [] },
        future: { id: 'future', title: 'Futuras', items: [] },
        no_date: { id: 'no_date', title: 'Sem Data', items: [] },
    };

    osList.forEach(os => {
        if (!os.data_prevista) {
            columns.no_date.items.push(os);
            return;
        }

        const osDate = getStartOfDate(new Date(os.data_prevista));

        if (osDate < today) {
            columns.overdue.items.push(os);
        } else if (osDate.getTime() === today.getTime()) {
            columns.today.items.push(os);
        } else if (osDate.getTime() === tomorrow.getTime()) {
            columns.tomorrow.items.push(os);
        } else if (osDate > tomorrow && osDate <= endOfWeek) {
            columns.this_week.items.push(os);
        } else if (osDate > endOfWeek && osDate <= endOfNextWeek) {
            columns.next_week.items.push(os);
        } else {
            columns.future.items.push(os);
        }
    });

    // Sort items within each column by numero
    for (const columnId in columns) {
        columns[columnId as ColumnId].items.sort((a, b) => Number(a.numero) - Number(b.numero));
    }

    return columns;
};

export const getNewDateForColumn = (columnId: ColumnId): string | null => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    switch (columnId) {
        case 'today':
            return today.toISOString().split('T')[0];
        case 'tomorrow':
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            return tomorrow.toISOString().split('T')[0];
        case 'this_week':
            const endOfWeek = new Date(today);
            endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
            return endOfWeek.toISOString().split('T')[0];
        case 'next_week':
            const endOfNextWeek = new Date(today);
            endOfNextWeek.setDate(today.getDate() + 14 - today.getDay());
            return endOfNextWeek.toISOString().split('T')[0];
        case 'no_date':
            return null;
        case 'overdue':
             return today.toISOString().split('T')[0];
        case 'future':
            const futureDate = new Date(today);
            futureDate.setDate(today.getDate() + 15);
            return futureDate.toISOString().split('T')[0];
        default:
            return null;
    }
};
