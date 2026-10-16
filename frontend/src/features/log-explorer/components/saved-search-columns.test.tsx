import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogExplorerTabConfig } from '../types/log-explorer.types'
import type { SavedQuery, SavedQueryInput } from '../services/saved-queries-http.service'
import { LogExplorerView } from './LogExplorerView'

const store = vi.hoisted(() => ({ rows: [] as SavedQuery[], create: vi.fn() }))
vi.mock('../services/saved-queries-http.service', () => ({
  savedQueriesHttpService: {
    list: async () => store.rows,
    create: (input: SavedQueryInput) => {
      store.create(input)
      store.rows.push({ id: String(store.rows.length), ...input } as SavedQuery)
      return Promise.resolve(store.rows[store.rows.length - 1])
    },
    remove: async () => {},
  },
}))
vi.mock('../services/log-explorer-http.service', () => ({
  DEFAULT_DATASET: 'logs',
  LogExplorerHttpError: class extends Error {},
  logExplorerHttpService: {
    datasets: async () => ['logs', 'events'],
    dataTypes: async () => ['test-type'],
    fields: async () => [],
    search: async () => ({ data: [], total: 0 }),
  },
}))
vi.mock('./QueryBar', () => ({
  QueryBar: ({ onSelect }: { onSelect: (ds: string, dt: string | null) => void }) =>
    <>
      <button onClick={() => onSelect('events', null)}>change dataset</button>
      <button onClick={() => onSelect('logs', 'test-type')}>select type</button>
      <button onClick={() => onSelect('logs', null)}>all types</button>
    </>,
}))
vi.mock('./FieldSidebar', () => ({
  FieldSidebar: ({ onToggleColumn, onResetColumns }: { onToggleColumn: (field: string) => void; onResetColumns: () => void }) =>
    <>
      <button onClick={() => onToggleColumn('log.user')}>toggle user</button>
      <button onClick={onResetColumns}>reset columns</button>
    </>,
}))
vi.mock('./log-table', () => ({
  LogTable: ({ columns }: { columns: string[] }) => <output data-testid="columns">{JSON.stringify(columns)}</output>,
}))
vi.mock('./HistogramStrip', () => ({ HistogramStrip: () => null }))
vi.mock('./ChartPanel', () => ({ ChartPanel: () => null }))
vi.mock('@/shared/components/filters/CustomFilterBar', () => ({ CustomFilterBar: () => null }))

const initial: LogExplorerTabConfig = {
  id: 'tab', name: 'Search', dataset: 'logs', patternStr: null,
  range: { from: 'now-1h', to: 'now', interval: 'hour' },
  filters: [{ field: 'protocol', operator: 'IS', value: 'TCP' }],
  columns: ['log.duration', 'log.user'], searchInput: '', appliedQuery: '',
  sqlMode: false, sqlInput: '', appliedSql: '', viewMode: 'table',
}

async function openView(config = initial) {
  const result = render(<MemoryRouter><LogExplorerView initial={config} onConfigChange={vi.fn()} /></MemoryRouter>)
  fireEvent.click(screen.getByText('logExplorer.saved.title'))
  await waitFor(() => expect(screen.queryByText('logExplorer.saved.loading')).not.toBeInTheDocument())
  return result
}

async function save(name: string) {
  fireEvent.click(screen.getByText('logExplorer.saved.saveCurrent'))
  fireEvent.change(screen.getByPlaceholderText('logExplorer.saved.namePlaceholder'), { target: { value: name } })
  fireEvent.click(screen.getByText('logExplorer.saved.save'))
  await waitFor(() => expect(store.create).toHaveBeenCalled())
}

beforeEach(() => {
  store.rows = []
  store.create.mockClear()
  localStorage.clear()
})

describe('saved-search columns', () => {
  it('switches type layouts, resets only the current type and persists both layouts', async () => {
    const notification = vi.spyOn(toast, 'success')
    const onConfigChange = vi.fn()
    render(<MemoryRouter><LogExplorerView initial={initial} onConfigChange={onConfigChange} /></MemoryRouter>)
    await waitFor(() => expect(onConfigChange).toHaveBeenCalled())
    fireEvent.click(screen.getByText('select type'))
    expect(screen.getByTestId('columns')).toHaveTextContent('[]')
    fireEvent.click(screen.getByText('toggle user'))
    expect(screen.getByTestId('columns')).toHaveTextContent('["log.user"]')
    fireEvent.click(screen.getByText('all types'))
    expect(screen.getByTestId('columns')).toHaveTextContent('["log.duration","log.user"]')
    fireEvent.click(screen.getByText('select type'))
    expect(screen.getByTestId('columns')).toHaveTextContent('["log.user"]')
    fireEvent.click(screen.getByText('reset columns'))
    expect(screen.getByTestId('columns')).toHaveTextContent('[]')
    fireEvent.click(screen.getByText('all types'))
    expect(screen.getByTestId('columns')).toHaveTextContent('["log.duration","log.user"]')
    expect(onConfigChange.mock.lastCall?.[0].columnLayouts).toEqual({
      '["logs",null]': initial.columns, '["logs","test-type"]': [],
    })
    act(() => notification.mock.lastCall?.[1]?.action && (notification.mock.lastCall[1].action as unknown as { onClick: () => void }).onClick())
    expect(screen.getByTestId('columns')).toHaveTextContent('["log.duration","log.user"]')
    expect(onConfigChange.mock.lastCall?.[0].columnLayouts['["logs","test-type"]']).toEqual(['log.user'])
    notification.mockRestore()
  })

  it('saves current columns in order and restores them in a fresh view', async () => {
    const view = await openView()
    fireEvent.click(screen.getByText('toggle user'))
    fireEvent.click(screen.getByText('toggle user'))
    await save('Ordered columns')
    const state = JSON.parse(store.rows[0].filters)
    expect(state.columns).toEqual(['log.duration', 'log.user'])
    expect(state.filters).toEqual(initial.filters)
    expect(state.range).toEqual(initial.range)
    view.unmount()
    await openView({ ...initial, columns: ['unrelated'] })
    fireEvent.click(screen.getByText('Ordered columns'))
    expect(screen.getByTestId('columns')).toHaveTextContent('["log.duration","log.user"]')
  })

  it('captures edits made only to the selected columns', async () => {
    await openView()
    fireEvent.click(screen.getByText('toggle user'))
    await save('Column edit')
    expect(JSON.parse(store.rows[0].filters).columns).toEqual(['log.duration'])
  })

  it('captures the latest dataset and columns', async () => {
    await openView()
    fireEvent.click(screen.getByText('change dataset'))
    fireEvent.click(screen.getByText('toggle user'))
    await save('Latest state')
    expect(JSON.parse(store.rows[0].filters)).toMatchObject({ dataset: 'events', columns: ['log.user'] })
  })

  it.each([undefined, [], 'invalid', ['log.user', 7, null]])('restores compatible columns from %j', async (columns) => {
    store.rows = [{ id: 'old', name: 'Old search', dataset: '', filters: JSON.stringify({ ...initial, columns }) } as SavedQuery]
    await openView()
    fireEvent.click(screen.getByText('Old search'))
    expect(screen.getByTestId('columns')).toHaveTextContent(JSON.stringify(Array.isArray(columns) ? columns.filter(c => typeof c === 'string') : []))
  })
})
