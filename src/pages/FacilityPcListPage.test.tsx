import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import type { FacilityPc, FacilityPcPage } from '../../shared/facility-pc-schema'
import { ApiError, deleteFacilityPc, fetchFacilityPcPage } from '../api/facility-pcs-client'
import { exportFacilityPcsToExcel } from '../lib/export-excel'
import { FacilityPcListPage } from './FacilityPcListPage'

vi.mock('../api/facility-pcs-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFacilityPcPage: vi.fn(),
  deleteFacilityPc: vi.fn(),
}))
vi.mock('../lib/export-excel', () => ({ exportFacilityPcsToExcel: vi.fn() }))

const pc: FacilityPc = {
  id: 7,
  facilityName: '中央病院',
  pcName: 'PC-001',
  tag: null,
  installedOn: '2026-09-26',
  osVersion: 'Windows 11',
  officeType: 'H&B',
  officeVersion: '2021',
  licenseKey: 'ABCDE12345FGHIJ67890KLMNO',
  account: 'user1',
  password: 'PASSWORD-SECRET',
  remarks: 'メモ',
  registeredOn: '2026-09-20',
}
const pageOf = (items: FacilityPc[], overrides: Partial<FacilityPcPage> = {}): FacilityPcPage => ({
  items,
  total: items.length,
  page: 1,
  perPage: 50,
  ...overrides,
})

function EditPageStub() {
  const location = useLocation()
  const state = location.state as { returnTo?: string } | null
  return (
    <>
      <p>編集ページ {location.pathname}</p>
      <p>戻り先 {state?.returnTo}</p>
    </>
  )
}

function BackButton() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>ブラウザの戻る</button>
}

const renderPage = (initialEntry = '/') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BackButton />
      <Routes>
        <Route path="/" element={<FacilityPcListPage />} />
        <Route path="/new" element={<p>登録ページ</p>} />
        <Route path="/edit/:id" element={<EditPageStub />} />
      </Routes>
    </MemoryRouter>,
  )

const lastQuery = () => vi.mocked(fetchFacilityPcPage).mock.lastCall?.[0]

beforeEach(() => {
  // 前のテストで使われずに残った mockResolvedValueOnce を持ち越さない
  vi.mocked(fetchFacilityPcPage).mockReset().mockResolvedValue(pageOf([pc]))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(exportFacilityPcsToExcel).mockReset()
})

describe('FacilityPcListPage', () => {
  it('1ページ目を施設名の昇順で取得し、全項目を表示する（日付は yyyy/mm/dd、Keyとパスワードは伏せる）', async () => {
    renderPage()
    const row = await screen.findByRole('row', { name: /中央病院/ })
    expect(lastQuery()).toEqual({ q: undefined, sort: 'facilityName', order: 'asc', page: 1 })
    for (const text of ['中央病院', 'PC-001', '2026/09/26', 'Windows 11', 'H&B', '2021', 'user1', '2026/09/20', 'メモ']) {
      expect(within(row).getByText(text)).toBeInTheDocument()
    }
    expect(within(row).queryByText('ABCDE12345FGHIJ67890KLMNO')).not.toBeInTheDocument()
    expect(within(row).queryByText('ABCDE-12345-FGHIJ-67890-KLMNO')).not.toBeInTheDocument()
    expect(within(row).queryByText('PASSWORD-SECRET')).not.toBeInTheDocument()
  })

  it('Key は表示ボタンを押すと5桁ごとにハイフンを入れて表示する', async () => {
    renderPage()
    const row = await screen.findByRole('row', { name: /中央病院/ })
    await userEvent.click(within(row).getByRole('button', { name: 'Keyを表示' }))
    expect(within(row).getByText('ABCDE-12345-FGHIJ-67890-KLMNO')).toBeInTheDocument()
  })

  it.each([
    ['Tag', 'tag'],
    ['設置日', 'installedOn'],
    ['アカウント登録日', 'registeredOn'],
  ] as const)('%s の見出しを押すとその列の昇順で並べ替え、もう一度押すと降順になる', async (label, sort) => {
    renderPage()
    const header = () => screen.findByRole('columnheader', { name: new RegExp(label) })
    await userEvent.click(within(await header()).getByRole('button'))
    await waitFor(() => expect(lastQuery()).toEqual({ q: undefined, sort, order: 'asc', page: 1 }))
    expect(await header()).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(await header()).getByRole('button'))
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort, order: 'desc' }))
  })

  it('「Tag」の列を「PC名」の次に表示する', async () => {
    vi.mocked(fetchFacilityPcPage).mockResolvedValue(pageOf([{ ...pc, tag: 'TAG-0001' }]))
    renderPage()
    const row = await screen.findByRole('row', { name: /中央病院/ })
    expect(within(row).getByText('TAG-0001')).toBeInTheDocument()
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.replace(/[▲▼↕]/g, '').trim())
    expect(headers.slice(0, 3)).toEqual(['施設名', 'PC名', 'Tag'])
  })

  it('「アカウント登録日」の列を「パスワード」と「備考」の間に表示する', async () => {
    renderPage()
    await screen.findByRole('row', { name: /中央病院/ })
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.replace(/[▲▼↕]/g, '').trim())
    expect(headers.slice(headers.indexOf('パスワード'), headers.indexOf('パスワード') + 3)).toEqual(['パスワード', 'アカウント登録日', '備考'])
  })

  it('施設名の見出しを押すたびに昇順・降順を切り替え、1ページ目に戻る', async () => {
    vi.mocked(fetchFacilityPcPage).mockResolvedValue(pageOf([pc], { total: 120 }))
    renderPage('/?page=2')
    const sortHeader = () => screen.findByRole('columnheader', { name: /施設名/ })
    expect(await sortHeader()).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(within(await sortHeader()).getByRole('button'))
    await waitFor(() => expect(lastQuery()).toEqual({ q: undefined, sort: 'facilityName', order: 'desc', page: 1 }))
    expect(await sortHeader()).toHaveAttribute('aria-sort', 'descending')

    await userEvent.click(within(await sortHeader()).getByRole('button'))
    await waitFor(() => expect(lastQuery()).toMatchObject({ order: 'asc' }))
  })

  it('PC名の見出しを押すとPC名の昇順、もう一度押すと降順になり、1ページ目に戻る', async () => {
    vi.mocked(fetchFacilityPcPage).mockResolvedValue(pageOf([pc], { total: 120 }))
    renderPage('/?page=2')
    const header = (name: RegExp) => screen.findByRole('columnheader', { name })

    await userEvent.click(within(await header(/PC名/)).getByRole('button'))
    await waitFor(() => expect(lastQuery()).toEqual({ q: undefined, sort: 'pcName', order: 'asc', page: 1 }))
    expect(await header(/PC名/)).toHaveAttribute('aria-sort', 'ascending')
    expect(await header(/施設名/)).not.toHaveAttribute('aria-sort')

    await userEvent.click(within(await header(/PC名/)).getByRole('button'))
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'pcName', order: 'desc' }))
    expect(await header(/PC名/)).toHaveAttribute('aria-sort', 'descending')
  })

  it('別の列の見出しを押すと、その列の昇順から始める', async () => {
    renderPage('/?sort=pcName&order=desc')
    await userEvent.click(within(await screen.findByRole('columnheader', { name: /施設名/ })).getByRole('button'))
    await waitFor(() => expect(lastQuery()).toEqual({ q: undefined, sort: 'facilityName', order: 'asc', page: 1 }))
  })

  it('施設名で検索すると1ページ目から取得し直す', async () => {
    renderPage('/?page=3')
    await userEvent.type(await screen.findByRole('searchbox', { name: '施設名・Tagで検索' }), '  中央 ')
    await userEvent.click(screen.getByRole('button', { name: '検索' }))
    await waitFor(() => expect(lastQuery()).toEqual({ q: '中央', sort: 'facilityName', order: 'asc', page: 1 }))
  })

  it('ブラウザの「戻る」で検索条件が戻ったら、検索欄の文字も戻す', async () => {
    renderPage('/?q=' + encodeURIComponent('中央'))
    const searchbox = await screen.findByRole('searchbox', { name: '施設名・Tagで検索' })
    expect(searchbox).toHaveValue('中央')

    await userEvent.clear(searchbox)
    await userEvent.type(searchbox, '東')
    await userEvent.click(screen.getByRole('button', { name: '検索' }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: '東' }))

    await userEvent.click(screen.getByRole('button', { name: 'ブラウザの戻る' }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: '中央' }))
    expect(screen.getByRole('searchbox', { name: '施設名・Tagで検索' })).toHaveValue('中央')
  })

  it('次のページへ移動できる', async () => {
    vi.mocked(fetchFacilityPcPage).mockResolvedValue(pageOf([pc], { total: 120 }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '次へ' }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }))
  })

  it('空欄の項目は何も表示せず、Keyとパスワードが空欄なら伏せ字も表示ボタンも出さない', async () => {
    const blank: FacilityPc = {
      id: 8,
      facilityName: '西病院',
      pcName: null,
      tag: null,
      installedOn: null,
      osVersion: null,
      officeType: null,
      officeVersion: null,
      licenseKey: null,
      account: null,
      password: null,
      remarks: null,
      registeredOn: null,
    }
    vi.mocked(fetchFacilityPcPage).mockResolvedValue(pageOf([blank]))
    renderPage()
    const row = await screen.findByRole('row', { name: /西病院/ })
    expect(within(row).queryByText('●●●●')).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /を表示/ })).not.toBeInTheDocument()
    expect(within(row).queryByText('null')).not.toBeInTheDocument()
  })

  it('削除の確認では、空欄の施設名・PC名を「（未入力）」と表示する', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    vi.mocked(fetchFacilityPcPage).mockResolvedValue(pageOf([{ ...pc, pcName: null }]))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '削除' }))
    expect(window.confirm).toHaveBeenCalledWith('「中央病院 / （未入力）」を削除します。よろしいですか？')
  })

  it('確認ダイアログで OK したら削除し、一覧を取得し直す', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteFacilityPc).mockResolvedValue()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '削除' }))

    expect(window.confirm).toHaveBeenCalledWith('「中央病院 / PC-001」を削除します。よろしいですか？')
    expect(deleteFacilityPc).toHaveBeenCalledWith(7)
    await waitFor(() => expect(fetchFacilityPcPage).toHaveBeenCalledTimes(2))
  })

  it('確認ダイアログでキャンセルしたら削除しない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '削除' }))
    expect(deleteFacilityPc).not.toHaveBeenCalled()
  })

  it('編集リンクは今の検索・並べ替え・ページの条件を引き継いで編集ページへ移動する', async () => {
    const listUrl = `/?q=${encodeURIComponent('中央')}&sort=pcName&order=desc&page=2`
    vi.mocked(fetchFacilityPcPage).mockResolvedValue(pageOf([pc], { total: 120, page: 2 }))
    renderPage(listUrl)
    await userEvent.click(await screen.findByRole('link', { name: '編集' }))
    expect(screen.getByText('編集ページ /edit/7')).toBeInTheDocument()
    expect(screen.getByText(`戻り先 ${listUrl}`)).toBeInTheDocument()
  })

  it('新規登録ページへ移動できる', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: '新規登録' }))
    expect(screen.getByText('登録ページ')).toBeInTheDocument()
  })

  describe('Excel出力メニュー', () => {
    const openMenu = async () => {
      const trigger = await screen.findByRole('button', { name: 'Excel出力' })
      await userEvent.click(trigger)
      return trigger
    }

    it('ボタンを押すとメニューが開き、全件出力とアカウント情報出力を選べる', async () => {
      renderPage()
      const trigger = await screen.findByRole('button', { name: 'Excel出力' })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('button', { name: '全件出力' })).not.toBeInTheDocument()

      await userEvent.click(trigger)
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('button', { name: '全件出力' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'アカウント情報出力' })).toBeInTheDocument()
    })

    it.each([
      ['全件出力', 'all'],
      ['アカウント情報出力', 'account'],
    ] as const)('「%s」を選ぶと %s で出力し、メニューを閉じる', async (label, kind) => {
      vi.mocked(exportFacilityPcsToExcel).mockResolvedValue()
      renderPage()
      await openMenu()
      await userEvent.click(screen.getByRole('button', { name: label }))

      expect(exportFacilityPcsToExcel).toHaveBeenCalledWith(kind)
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    })

    it('Esc キーでメニューを閉じ、ボタンにフォーカスを戻す', async () => {
      renderPage()
      const trigger = await openMenu()
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('button', { name: '全件出力' })).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })

    it('Tab でメニューの外へフォーカスが移ると閉じる', async () => {
      renderPage()
      await openMenu()
      await userEvent.tab()
      expect(screen.getByRole('button', { name: '全件出力' })).toHaveFocus()
      await userEvent.tab()
      expect(screen.getByRole('button', { name: 'アカウント情報出力' })).toHaveFocus()
      await userEvent.tab()
      expect(screen.getByRole('link', { name: '新規登録' })).toHaveFocus()
      expect(screen.queryByRole('button', { name: '全件出力' })).not.toBeInTheDocument()
    })

    it('Shift+Tab でメニューの外へフォーカスが移ると閉じる', async () => {
      renderPage()
      const trigger = await openMenu()
      expect(trigger).toHaveFocus()
      await userEvent.tab({ shift: true })
      expect(screen.queryByRole('button', { name: '全件出力' })).not.toBeInTheDocument()
    })

    it('移動先の無いフォーカス喪失（Safari でのクリックなど）では閉じない', async () => {
      renderPage()
      const trigger = await openMenu()
      fireEvent.blur(trigger, { relatedTarget: null })
      expect(screen.getByRole('button', { name: '全件出力' })).toBeInTheDocument()
    })

    it('aria-controls は開いているときだけ、実在するメニューを指す', async () => {
      renderPage()
      const trigger = await screen.findByRole('button', { name: 'Excel出力' })
      expect(trigger).not.toHaveAttribute('aria-controls')

      await userEvent.click(trigger)
      const controlsId = trigger.getAttribute('aria-controls')!
      expect(document.getElementById(controlsId)).toContainElement(screen.getByRole('button', { name: '全件出力' }))
    })

    it('メニューの外をクリックすると閉じる', async () => {
      renderPage()
      await openMenu()
      await userEvent.click(screen.getByRole('heading', { name: '施設PC一覧' }))
      expect(screen.queryByRole('button', { name: '全件出力' })).not.toBeInTheDocument()
      expect(exportFacilityPcsToExcel).not.toHaveBeenCalled()
    })

    it('出力中はボタンを押せず、失敗したらエラーを表示する', async () => {
      let reject!: (error: Error) => void
      vi.mocked(exportFacilityPcsToExcel).mockReturnValue(new Promise((_, r) => (reject = r)))
      renderPage()
      await openMenu()
      await userEvent.click(screen.getByRole('button', { name: 'アカウント情報出力' }))
      expect(screen.getByRole('button', { name: '出力中…' })).toBeDisabled()

      reject(new Error('通信に失敗しました（502）'))
      expect(await screen.findByRole('alert')).toHaveTextContent('通信に失敗しました（502）')
      expect(screen.getByRole('button', { name: 'Excel出力' })).toBeEnabled()
    })
  })

  it('0件ならその旨を表示する', async () => {
    vi.mocked(fetchFacilityPcPage).mockResolvedValue(pageOf([]))
    renderPage()
    expect(await screen.findByText('登録されたデータはありません')).toBeInTheDocument()
  })

  it('条件を変えた取得に失敗したら、前の条件の表を消して操作できないようにする', async () => {
    vi.mocked(fetchFacilityPcPage)
      .mockResolvedValueOnce(pageOf([pc], { total: 120 }))
      .mockRejectedValueOnce(new ApiError(500, 'サーバーでエラーが発生しました'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '次へ' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーでエラーが発生しました')
    expect(screen.queryByRole('row', { name: /中央病院/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('取得中は「読み込み中」を表示する', async () => {
    vi.mocked(fetchFacilityPcPage).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(await screen.findByText('読み込み中…')).toBeInTheDocument()
  })

  it('範囲外のページ（最終ページの最後の1件を削除した後など）は最終ページに移動する', async () => {
    vi.mocked(fetchFacilityPcPage)
      .mockResolvedValueOnce(pageOf([], { total: 50, page: 2 }))
      .mockResolvedValueOnce(pageOf([pc], { total: 50 }))
    renderPage('/?page=2')
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1 }))
    expect(await screen.findByRole('row', { name: /中央病院/ })).toBeInTheDocument()
  })

  it('取得に失敗したらエラーメッセージを表示する', async () => {
    vi.mocked(fetchFacilityPcPage).mockRejectedValue(new ApiError(500, 'サーバーでエラーが発生しました'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーでエラーが発生しました')
  })
})
