import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Pagination from '../Pagination';

describe('Pagination', () => {
  it('permite navegar sem totalCount quando hasNextPage=true', () => {
    const onPageChange = vi.fn();

    render(
      <Pagination
        currentPage={1}
        totalCount={null}
        itemsOnPage={50}
        hasNextPage={true}
        pageSize={50}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText(/total indisponível/i)).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => {
        if (!node || (node as HTMLElement).tagName !== 'SPAN') return false;
        const text = (node.textContent ?? '').replace(/\\s+/g, ' ').trim();
        return text === 'Página 1';
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText((_, node) => (node?.textContent ?? '').replace(/\\s+/g, ' ').includes('Página 1 de')),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Próxima página/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('mostra paginação determinística quando totalCount é conhecido', () => {
    const onPageChange = vi.fn();

    render(<Pagination currentPage={1} totalCount={120} pageSize={50} onPageChange={onPageChange} />);

    expect(
      screen.getByText((_, node) => {
        if (!node || (node as HTMLElement).tagName !== 'SPAN') return false;
        const text = (node.textContent ?? '').replace(/\\s+/g, ' ').trim();
        return text === 'Página 1 de 3';
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Próxima página/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
