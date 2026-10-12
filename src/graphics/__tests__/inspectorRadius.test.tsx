import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react';

jest.mock('../../login/api.tsx', () => {
  const api = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return {
    __esModule: true, default: api, DEFAULT_BACKEND: 'http://backend.test', RELAY_ORIGIN: 'http://127.0.0.1:8787',
    isOverlayRoute: () => false, isUsingRelay: () => false, getBackendOrigin: () => 'http://backend.test', getRelayOrigin: () => null,
    markRelayUnreachable: jest.fn(), markRelayReachable: jest.fn(),
  };
});

// eslint-disable-next-line import/first
import { createEmptyLayout } from '../schema/layoutSchema.js';
// eslint-disable-next-line import/first
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
// eslint-disable-next-line import/first
import { Inspector } from '../editor/Inspector.tsx';
// eslint-disable-next-line import/first
import { editorReducer, initEditor } from '../editor/store.ts';

// FillSection and CustomCssSection once shared key={el.id}: React mixed the two up and the
// Radius field kept showing the old value even though the layer had changed.
test('editing a rectangle radius updates the field and the canvas', () => {
  const base: any = { ...(createEmptyLayout() as any), elements: [{ id: 'r', type: 'rect', name: 'Rectangle', x: 0, y: 0, w: 320, h: 180, style: { fill: '#f00', radius: 8 } }] };
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  function Harness() {
    const [st, setSt] = useState(() => initEditor(base));
    const exec = (cmd: any) => cmd && setSt((s: any) => editorReducer(s, { type: 'exec', cmd } as any));
    return (
      <>
        <Inspector {...({ doc: st.doc, selected: ['r'], exec } as any)} />
        <LayoutRenderer layout={st.doc} state={null} fit={1} mode="editor" />
      </>
    );
  }
  const { container, getByText } = render(<Harness />);
  const input = getByText(/^Radius$/).closest('label')!.querySelector('input')!;
  fireEvent.change(input, { target: { value: '30' } });

  expect(input.value).toBe('30');
  const radii = Array.from(container.querySelectorAll<HTMLElement>('[data-element-id="r"] *')).map((n) => n.style.borderRadius).filter(Boolean);
  expect(radii).toContain('30px');
  expect(errors.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false);
  errors.mockRestore();
});
