// Favourites and recently inserted items in the Insert panel (editor/insertMemory.ts).

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RECENT_LIMIT, loadInsertMemory, withFavorite, withRecent } from '../editor/insertMemory.ts';
import { InsertPanel } from '../editor/InsertPanel.tsx';
import { createEmptyLayout } from '../schema/layoutSchema.js';

beforeEach(() => window.localStorage.clear());

test('recent: newest first, no duplicates, capped', () => {
  let m = { recent: [], favorites: [] } as { recent: string[]; favorites: string[] };
  for (let i = 0; i < RECENT_LIMIT + 3; i++) m = withRecent(m, `kind:k${i}`);
  m = withRecent(m, 'kind:k5');
  expect(m.recent[0]).toBe('kind:k5');
  expect(m.recent.length).toBe(RECENT_LIMIT);
  expect(new Set(m.recent).size).toBe(m.recent.length);
  expect(withFavorite(withFavorite(m, 'kind:text'), 'kind:text').favorites).toEqual([]);
});

test('a broken or missing store reads as empty', () => {
  window.localStorage.setItem('ss.designer.insertMemory', '{not json');
  expect(loadInsertMemory()).toEqual({ recent: [], favorites: [] });
});

test('inserting shows the item under recent; a star makes it a favourite; search covers elements', () => {
  const onInsert = jest.fn();
  render(<InsertPanel doc={createEmptyLayout() as any} selected={[]} onInsert={onInsert} />);
  expect(screen.queryByTestId('insert-quick')).toBeNull();

  fireEvent.click(screen.getByText('Rectangle'));
  expect(onInsert).toHaveBeenCalledTimes(1);
  expect(within(screen.getByTestId('insert-quick')).getByText('Rectangle')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Add Text to favourites' }));
  expect(within(screen.getByTestId('insert-quick')).getAllByRole('button')[0]).toHaveTextContent('★ Text');
  expect(loadInsertMemory().favorites).toEqual(['kind:text']);

  fireEvent.change(screen.getByLabelText('Search elements and live parts'), { target: { value: 'circle' } });
  expect(screen.getByText('Circle')).toBeInTheDocument();
  expect(screen.queryByText('Rectangle')).toBeNull();
});
