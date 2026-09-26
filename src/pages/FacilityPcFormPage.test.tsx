import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { FacilityPc } from '../../shared/facility-pc-schema'
import { ApiError, createFacilityPc, fetchFacilityPc, updateFacilityPc } from '../api/facility-pcs-client'
import { FacilityPcFormPage } from './FacilityPcFormPage'

vi.mock('../api/facility-pcs-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFacilityPc: vi.fn(),
  createFacilityPc: vi.fn(),
  updateFacilityPc: vi.fn(),
}))

const saved: FacilityPc = {
  id: 7,
  facilityName: '中央病院',
  pcName: 'PC-001',
  installedOn: '2026-09-26',
  osVersion: 'Windows 11',
  officeType: 'H&B',
  officeVersion: '2021',
  licenseKey: 'KEY-1',
  account: 'user1',
  password: 'secret',
  remarks: '1行目\n2行目',
}

function ListStub() {
  const location = useLocation()
  return <p>一覧ページ {location.search}</p>
}

const renderPage = (entry: string | { pathname: string; state: unknown }) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<ListStub />} />
        <Route path="/new" element={<FacilityPcFormPage />} />
        <Route path="/edit/:id" element={<FacilityPcFormPage />} />
      </Routes>
    </MemoryRouter>,
  )

const fillAll = async () => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('施設名'), ' 中央病院 ')
  await user.type(screen.getByLabelText('PC名'), 'PC-001')
  await user.type(screen.getByLabelText('設置日'), '2026/9/26')
  await user.type(screen.getByLabelText('OSバージョン'), 'Windows 11')
  await user.selectOptions(screen.getByLabelText('Office種類'), 'H&B')
  await user.selectOptions(screen.getByLabelText('Officeバージョン'), '2021')
  await user.type(screen.getByLabelText('Key'), 'KEY-1')
  await user.type(screen.getByLabelText('アカウント'), 'user1')
  await user.type(screen.getByLabelText('パスワード'), 'secret')
  await user.type(screen.getByLabelText('備考'), '1行目{Enter}2行目')
  return user
}

afterEach(() => vi.clearAllMocks())

describe('FacilityPcFormPage（新規登録）', () => {
  it('入力内容を整えて登録し、一覧に戻る', async () => {
    vi.mocked(createFacilityPc).mockResolvedValue(saved)
    renderPage({ pathname: '/new', state: { returnTo: '/?order=desc&page=2' } })
    const user = await fillAll()
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(createFacilityPc).toHaveBeenCalledWith({ ...saved, id: undefined })
    expect(await screen.findByText('一覧ページ ?order=desc&page=2')).toBeInTheDocument()
  })

  it('プルダウンの選択肢は決められた種類だけ', () => {
    renderPage('/new')
    const options = (label: string) =>
      Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((option) => option.value)
    expect(options('Office種類')).toEqual(['', 'Personal', 'H&B', 'Pro', 'Access'])
    expect(options('Officeバージョン')).toEqual(['', '2010', '2013', '2016', '2019', '2021', '2024'])
  })

  it('未入力のまま送信すると、API を呼ばずに項目ごとのエラーを表示する', async () => {
    renderPage('/new')
    await userEvent.click(screen.getByRole('button', { name: '登録する' }))
    expect(createFacilityPc).not.toHaveBeenCalled()
    expect(screen.getByLabelText('施設名')).toHaveAccessibleDescription('入力してください')
    expect(screen.getByLabelText('Office種類')).toHaveAccessibleDescription('選択してください')
    expect(screen.getByLabelText('備考')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('存在しない日付はエラーにする', async () => {
    renderPage('/new')
    const user = await fillAll()
    await user.clear(screen.getByLabelText('設置日'))
    await user.type(screen.getByLabelText('設置日'), '2026/02/30')
    await user.click(screen.getByRole('button', { name: '登録する' }))
    expect(screen.getByLabelText('設置日')).toHaveAccessibleDescription('存在しない日付です')
    expect(createFacilityPc).not.toHaveBeenCalled()
  })

  it('カレンダーで選んだ日付を yyyy/mm/dd で入力欄に反映する', () => {
    renderPage('/new')
    fireEvent.change(screen.getByLabelText('カレンダーから選択'), { target: { value: '2026-09-26' } })
    expect(screen.getByLabelText('設置日')).toHaveValue('2026/09/26')
  })

  it('備考の文字数を表示する', async () => {
    renderPage('/new')
    await userEvent.type(screen.getByLabelText('備考'), 'あいう')
    expect(screen.getByText('3 / 500')).toBeInTheDocument()
  })

  it('重複エラー（409）はサーバーのメッセージを表示し、ページに留まる', async () => {
    vi.mocked(createFacilityPc).mockRejectedValue(new ApiError(409, '同じ施設に同じPC名がすでに登録されています'))
    renderPage('/new')
    const user = await fillAll()
    await user.click(screen.getByRole('button', { name: '登録する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('同じ施設に同じPC名がすでに登録されています')
    expect(screen.queryByText(/一覧ページ/)).not.toBeInTheDocument()
  })

  it('サーバーの項目エラー（400）を該当項目に表示する', async () => {
    vi.mocked(createFacilityPc).mockRejectedValue(new ApiError(400, '入力内容に誤りがあります', { pcName: ['入力してください'] }))
    renderPage('/new')
    const user = await fillAll()
    await user.click(screen.getByRole('button', { name: '登録する' }))
    await waitFor(() => expect(screen.getByLabelText('PC名')).toHaveAccessibleDescription('入力してください'))
  })
})

describe('FacilityPcFormPage（編集）', () => {
  it('既存データを読み込んでフォームに表示し、更新して一覧に戻る', async () => {
    vi.mocked(fetchFacilityPc).mockResolvedValue(saved)
    vi.mocked(updateFacilityPc).mockResolvedValue(saved)
    renderPage('/edit/7')

    expect(await screen.findByDisplayValue('中央病院')).toBeInTheDocument()
    expect(fetchFacilityPc).toHaveBeenCalledWith(7)
    expect(screen.getByLabelText('設置日')).toHaveValue('2026/09/26')
    expect(screen.getByLabelText('備考')).toHaveValue('1行目\n2行目')

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('OSバージョン'))
    await user.type(screen.getByLabelText('OSバージョン'), 'Windows 11 24H2')
    await user.click(screen.getByRole('button', { name: '更新する' }))

    const { id: _, ...input } = saved
    expect(updateFacilityPc).toHaveBeenCalledWith(7, { ...input, osVersion: 'Windows 11 24H2' })
    expect(await screen.findByText(/一覧ページ/)).toBeInTheDocument()
  })

  it('データが見つからなければメッセージを表示する', async () => {
    vi.mocked(fetchFacilityPc).mockRejectedValue(new ApiError(404, '該当するデータが見つかりません'))
    renderPage('/edit/999')
    expect(await screen.findByRole('alert')).toHaveTextContent('該当するデータが見つかりません')
    expect(screen.queryByRole('button', { name: '更新する' })).not.toBeInTheDocument()
  })
})
