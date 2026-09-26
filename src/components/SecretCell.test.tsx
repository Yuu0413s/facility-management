import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SecretCell } from './SecretCell'

describe('SecretCell', () => {
  it('最初は伏せ字で表示し、クリックで表示・再クリックで隠す', async () => {
    render(<SecretCell value="p@ss" label="パスワード" />)
    expect(screen.queryByText('p@ss')).not.toBeInTheDocument()
    expect(screen.getByText('●●●●')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'パスワードを表示' }))
    expect(screen.getByText('p@ss')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'パスワードを隠す' }))
    expect(screen.queryByText('p@ss')).not.toBeInTheDocument()
  })
})
