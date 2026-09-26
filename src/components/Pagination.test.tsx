import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination'

describe('Pagination', () => {
  it('現在ページ・総ページ数・総件数を表示する', () => {
    render(<Pagination page={2} perPage={50} total={120} onChange={() => {}} />)
    expect(screen.getByText('2 / 3 ページ（全 120 件）')).toBeInTheDocument()
  })

  it('前へ・次へでページを移動する', async () => {
    const onChange = vi.fn()
    render(<Pagination page={2} perPage={50} total={120} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '前へ' }))
    await userEvent.click(screen.getByRole('button', { name: '次へ' }))
    expect(onChange.mock.calls).toEqual([[1], [3]])
  })

  it('先頭では前へ、末尾では次へを押せない', () => {
    const { rerender } = render(<Pagination page={1} perPage={50} total={120} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled()
    rerender(<Pagination page={3} perPage={50} total={120} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled()
  })

  it('0件でも 1 / 1 ページとして表示し、どちらも押せない', () => {
    render(<Pagination page={1} perPage={50} total={0} onChange={() => {}} />)
    expect(screen.getByText('1 / 1 ページ（全 0 件）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled()
  })
})
