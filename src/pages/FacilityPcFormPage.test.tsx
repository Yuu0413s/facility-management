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
  licenseKey: 'ABCDE12345FGHIJ67890KLMNO',
  account: 'user1',
  password: 'secret',
  remarks: '1行目\n2行目',
  registeredOn: '2026-09-20',
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
  await user.type(screen.getByLabelText('設置日'), '20260926')
  await user.type(screen.getByLabelText('OSバージョン'), 'Windows 11')
  await user.selectOptions(screen.getByLabelText('Office種類'), 'H&B')
  await user.selectOptions(screen.getByLabelText('Officeバージョン'), '2021')
  await user.type(screen.getByLabelText('Key'), 'abcde-12345-fghij-67890-klmno')
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

    expect(createFacilityPc).toHaveBeenCalledWith({ ...saved, id: undefined, registeredOn: undefined })
    expect(await screen.findByText('一覧ページ ?order=desc&page=2')).toBeInTheDocument()
  })

  it('プルダウンの選択肢は決められた種類だけ', () => {
    renderPage('/new')
    const options = (label: string) =>
      Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((option) => option.value)
    expect(options('Office種類')).toEqual(['', 'Personal', 'H&B', 'Pro', 'Access'])
    expect(options('Officeバージョン')).toEqual(['', '2010', '2013', '2016', '2019', '2021', '2024'])
  })

  it('全項目が空欄のまま送信すると、API を呼ばずにフォームの上にエラーを表示する', async () => {
    renderPage('/new')
    await userEvent.click(screen.getByRole('button', { name: '登録する' }))
    expect(createFacilityPc).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('いずれかの項目を入力してください')
    expect(screen.getByLabelText('施設名')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('施設名とPC名だけで登録でき、空欄の項目は null で送る', async () => {
    vi.mocked(createFacilityPc).mockResolvedValue(saved)
    renderPage('/new')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('施設名'), '中央病院')
    await user.type(screen.getByLabelText('PC名'), 'PC-001')
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(createFacilityPc).toHaveBeenCalledWith({
      facilityName: '中央病院',
      pcName: 'PC-001',
      installedOn: null,
      osVersion: null,
      officeType: null,
      officeVersion: null,
      licenseKey: null,
      account: null,
      password: null,
      remarks: null,
    })
  })

  it('必須・任意のバッジを表示しない（全項目が任意のため）', () => {
    renderPage('/new')
    expect(screen.queryByText('必須')).not.toBeInTheDocument()
    expect(screen.queryByText('任意')).not.toBeInTheDocument()
  })

  it('設置日の見本の文字は yyyymmdd、Key はハイフンなし25桁', () => {
    renderPage('/new')
    expect(screen.getByLabelText('設置日')).toHaveAttribute('placeholder', 'yyyymmdd')
    expect(screen.getByLabelText('Key')).toHaveAttribute('placeholder', '英数字25桁（ハイフンなし）')
  })

  // yyyy-mm-dd は API のやり取りの形式と同じなので、画面側で弾かないとそのまま通ってしまう
  it.each(['2026/09/26', '2026-09-26', '2026926'])('設置日の %s（8桁の数字でない形）は受け付けない', async (typed) => {
    renderPage('/new')
    const user = await fillAll()
    await user.clear(screen.getByLabelText('設置日'))
    await user.type(screen.getByLabelText('設置日'), typed)
    await user.click(screen.getByRole('button', { name: '登録する' }))
    expect(screen.getByLabelText('設置日')).toHaveAccessibleDescription('yyyymmdd（8桁の数字）で入力してください')
    expect(createFacilityPc).not.toHaveBeenCalled()
  })

  it('Key が英数字25桁でなければ、API を呼ばずに Key の欄にエラーを表示する', async () => {
    renderPage('/new')
    const user = await fillAll()
    await user.clear(screen.getByLabelText('Key'))
    await user.type(screen.getByLabelText('Key'), 'ABCDE12345')
    await user.click(screen.getByRole('button', { name: '登録する' }))
    expect(screen.getByLabelText('Key')).toHaveAccessibleDescription('Key は英数字25桁で入力してください')
    expect(createFacilityPc).not.toHaveBeenCalled()
  })

  it('存在しない日付はエラーにする', async () => {
    renderPage('/new')
    const user = await fillAll()
    await user.clear(screen.getByLabelText('設置日'))
    await user.type(screen.getByLabelText('設置日'), '20260230')
    await user.click(screen.getByRole('button', { name: '登録する' }))
    expect(screen.getByLabelText('設置日')).toHaveAccessibleDescription('存在しない日付です')
    expect(createFacilityPc).not.toHaveBeenCalled()
  })

  it('カレンダーで選んだ日付を yyyymmdd で入力欄に反映する', () => {
    renderPage('/new')
    fireEvent.change(screen.getByLabelText('カレンダーから選択'), { target: { value: '2026-09-26' } })
    expect(screen.getByLabelText('設置日')).toHaveValue('20260926')
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
    expect(screen.getByLabelText('設置日')).toHaveValue('20260926')
    expect(screen.getByLabelText('備考')).toHaveValue('1行目\n2行目')

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('OSバージョン'))
    await user.type(screen.getByLabelText('OSバージョン'), 'Windows 11 24H2')
    await user.click(screen.getByRole('button', { name: '更新する' }))

    const { id: _, registeredOn: __, ...input } = saved
    expect(updateFacilityPc).toHaveBeenCalledWith(7, { ...input, osVersion: 'Windows 11 24H2' })
    expect(await screen.findByText(/一覧ページ/)).toBeInTheDocument()
  })

  it('空欄の項目がある既存データは、空の入力欄として表示する', async () => {
    vi.mocked(fetchFacilityPc).mockResolvedValue({
      ...saved,
      installedOn: null,
      officeType: null,
      licenseKey: null,
      remarks: null,
    })
    renderPage('/edit/7')
    expect(await screen.findByDisplayValue('中央病院')).toBeInTheDocument()
    expect(screen.getByLabelText('設置日')).toHaveValue('')
    expect(screen.getByLabelText('Office種類')).toHaveValue('')
    expect(screen.getByLabelText('Key')).toHaveValue('')
    expect(screen.getByLabelText('備考')).toHaveValue('')
  })

  it('データが見つからなければメッセージを表示する', async () => {
    vi.mocked(fetchFacilityPc).mockRejectedValue(new ApiError(404, '該当するデータが見つかりません'))
    renderPage('/edit/999')
    expect(await screen.findByRole('alert')).toHaveTextContent('該当するデータが見つかりません')
    expect(screen.queryByRole('button', { name: '更新する' })).not.toBeInTheDocument()
  })
})
