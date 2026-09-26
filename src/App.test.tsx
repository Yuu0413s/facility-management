import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { fetchFacilityPcPage } from './api/facility-pcs-client'
import { App } from './App'

vi.mock('./api/facility-pcs-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFacilityPcPage: vi.fn(),
}))

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('App のルーティング', () => {
  beforeEach(() => {
    vi.mocked(fetchFacilityPcPage).mockResolvedValue({ items: [], total: 0, page: 1, perPage: 50 })
  })

  it.each([
    ['/', '施設PC一覧'],
    ['/new', '施設PC情報の新規登録'],
    ['/unknown', '施設PC一覧'],
  ])('%s は「%s」を表示する', async (path, heading) => {
    renderAt(path)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })
})
