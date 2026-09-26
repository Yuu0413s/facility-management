import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  listQuerySchema,
  type FacilityPc,
  type FacilityPcPage,
  type ImportRowError,
  type ListQuery,
  type SortKey,
  type SortOrder,
} from '../../shared/facility-pc-schema'
import { deleteFacilityPc, fetchFacilityPcPage, importFacilityPcs } from '../api/facility-pcs-client'
import { Pagination } from '../components/Pagination'
import { SecretCell } from '../components/SecretCell'
import { toDisplayDate } from '../lib/date'
import { formatProductKey } from '../lib/product-key'
import { exportFacilityPcsToExcel, type ExportKind } from '../lib/export-excel'
import { readFacilityPcWorkbook } from '../lib/import-excel'
import { FACILITY_PC_LABELS as LABELS } from '../lib/facility-pc-labels'

const DEFAULT_QUERY: ListQuery = { sort: 'facilityName', order: 'asc', page: 1 }

// 検索条件は URL に持たせる。編集ページから戻ったときやリロード時も同じ一覧を再現するため
const parseQuery = (searchParams: URLSearchParams): ListQuery => {
  const result = listQuerySchema.safeParse(Object.fromEntries(searchParams))
  return result.success ? result.data : DEFAULT_QUERY
}

const toSearchParams = ({ q, sort, order, page }: ListQuery) => {
  const params = new URLSearchParams({ sort, order, page: String(page) })
  if (q) params.set('q', q)
  return params
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '予期しないエラーが発生しました')

export function FacilityPcListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = parseQuery(searchParams)
  const { q, sort, order, page } = query

  const [keyword, setKeyword] = useState(q ?? '')
  const [result, setResult] = useState<FacilityPcPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 条件を素早く切り替えたとき、古いリクエストの結果で上書きしないようにする
    let isCancelled = false
    setError(null)
    // 前の条件の表を残すと、失敗時に別の条件のデータを編集・削除できてしまうため、一度消す
    setResult(null)
    fetchFacilityPcPage({ q, sort, order, page })
      .then((data) => {
        if (isCancelled) return
        // 最終ページの最後の1件を削除したときなど、範囲外のページにいたら最終ページへ移る。
        // 前の条件の結果と取り違えないよう、この取得の結果だけで判定する
        const lastPage = Math.max(1, Math.ceil(data.total / data.perPage))
        if (data.page > lastPage) {
          setSearchParams(toSearchParams({ q, sort, order, page: lastPage }), { replace: true })
          return
        }
        setResult(data)
      })
      .catch((e: unknown) => !isCancelled && setError(errorMessage(e)))
    return () => {
      isCancelled = true
    }
  }, [q, sort, order, page, reloadCount, setSearchParams])

  // ブラウザの「戻る・進む」で URL の検索語が変わったら、検索欄の文字もそれに合わせる
  useEffect(() => {
    setKeyword(q ?? '')
  }, [q])

  const updateQuery = (next: Partial<ListQuery>) => setSearchParams(toSearchParams({ ...query, ...next }))

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    updateQuery({ q: keyword.trim() || undefined, page: 1 })
  }

  const handleDelete = async (pc: FacilityPc) => {
    const orBlank = (value: string | null) => value ?? '（未入力）'
    if (!window.confirm(`「${orBlank(pc.facilityName)} / ${orBlank(pc.pcName)}」を削除します。よろしいですか？`)) return
    try {
      await deleteFacilityPc(pc.id)
      setReloadCount((count) => count + 1)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleExport = async (kind: ExportKind) => {
    setIsExporting(true)
    try {
      await exportFacilityPcsToExcel(kind)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportFile = async (file: File) => {
    if (!window.confirm(`「${file.name}」を取り込みます。同じ施設名＋PC名のデータは上書きされます。よろしいですか？`)) return
    setIsImporting(true)
    setError(null)
    setImportSummary(null)
    try {
      const read = await readFacilityPcWorkbook(await file.arrayBuffer())
      const result = read.rows.length === 0 ? { created: 0, updated: 0, errors: [] } : await importFacilityPcs(read.rows)
      setImportSummary({
        created: result.created,
        updated: result.updated,
        skipped: read.skipped,
        // 読み取りの時点で分かった誤りと、サーバーで分かった誤りを、行番号の順に並べる
        errors: [...read.errors, ...result.errors].sort((a, b) => a.rowNumber - b.rowNumber),
      })
      setReloadCount((count) => count + 1)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setIsImporting(false)
    }
  }

  const returnTo = `/?${searchParams}`

  return (
    <main className="page">
      <header className="page-header">
        <h1>施設PC一覧</h1>
        <div className="actions">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? '取り込み中…' : 'Excel取り込み'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            aria-label="取り込む Excel ファイル"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              // 同じファイルを続けて選び直しても change が起きるよう、選択を毎回空に戻す
              event.target.value = ''
              if (file) void handleImportFile(file)
            }}
          />
          <ExportMenu isExporting={isExporting} onSelect={handleExport} />
          <Link className="button primary" to="/new" state={{ returnTo }}>
            新規登録
          </Link>
        </div>
      </header>

      <form className="search" role="search" onSubmit={handleSearch}>
        <input
          type="search"
          aria-label="施設名・Tagで検索"
          placeholder="施設名・Tagで検索"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <button type="submit">検索</button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {importSummary && <ImportSummaryPanel summary={importSummary} onClose={() => setImportSummary(null)} />}

      {!result && !error && <p>読み込み中…</p>}

      {result && (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <SortableHeader column="facilityName" sort={sort} order={order} onSort={updateQuery} />
                  <SortableHeader column="pcName" sort={sort} order={order} onSort={updateQuery} />
                  <SortableHeader column="tag" sort={sort} order={order} onSort={updateQuery} />
                  <SortableHeader column="installedOn" sort={sort} order={order} onSort={updateQuery} />
                  <th>{LABELS.osVersion}</th>
                  <th>{LABELS.officeType}</th>
                  <th>{LABELS.officeVersion}</th>
                  <th>{LABELS.licenseKey}</th>
                  <th>{LABELS.account}</th>
                  <th>{LABELS.password}</th>
                  <SortableHeader column="registeredOn" sort={sort} order={order} onSort={updateQuery} />
                  <th>{LABELS.remarks}</th>
                  <th className="actions-column">操作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="empty">
                      登録されたデータはありません
                    </td>
                  </tr>
                ) : (
                  result.items.map((pc) => (
                    <tr key={pc.id}>
                      <td>{pc.facilityName}</td>
                      <td>{pc.pcName}</td>
                      <td>{pc.tag}</td>
                      <td>{toDisplayDate(pc.installedOn)}</td>
                      <td>{pc.osVersion}</td>
                      <td>{pc.officeType}</td>
                      <td>{pc.officeVersion}</td>
                      <td>
                        {pc.licenseKey && <SecretCell value={formatProductKey(pc.licenseKey)} label={LABELS.licenseKey} />}
                      </td>
                      <td>{pc.account}</td>
                      <td>
                        {pc.password && <SecretCell value={pc.password} label={LABELS.password} />}
                      </td>
                      <td>{toDisplayDate(pc.registeredOn)}</td>
                      <td className="remarks">{pc.remarks}</td>
                      <td className="actions-column">
                        <div className="row-actions">
                          <Link to={`/edit/${pc.id}`} state={{ returnTo }}>
                            編集
                          </Link>
                          <button type="button" className="danger" onClick={() => handleDelete(pc)}>
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} perPage={result.perPage} total={result.total} onChange={(next) => updateQuery({ page: next })} />
        </>
      )}
    </main>
  )
}

const EXPORT_OPTIONS: Array<{ kind: ExportKind; label: string }> = [
  { kind: 'all', label: '全件出力' },
  { kind: 'account', label: 'アカウント情報出力' },
]

function ExportMenu({ isExporting, onSelect }: { isExporting: boolean; onSelect: (kind: ExportKind) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // 開いている間だけ、外側のクリックと Esc キーで閉じられるようにする
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div
      className="export-menu"
      ref={containerRef}
      // Tab / Shift+Tab でフォーカスがメニューの外へ出たら閉じる（開いたまま取り残さない）。
      // 移動先が無い場合（Safari はクリックしたボタンにフォーカスを移さない）は閉じない。
      // ここで閉じると選んだ項目のクリックが届く前に消えるため。外側のクリックは pointerdown 側で閉じる
      onBlur={(event) => {
        const { relatedTarget } = event
        if (relatedTarget && !event.currentTarget.contains(relatedTarget)) setIsOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        // 閉じている間はメニューが DOM に無いので、存在しない id を指さないようにする
        aria-controls={isOpen ? 'export-menu-options' : undefined}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
      >
        {isExporting ? '出力中…' : 'Excel出力'}
      </button>
      {isOpen && (
        <div id="export-menu-options" className="export-menu-options">
          {EXPORT_OPTIONS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setIsOpen(false)
                onSelect(kind)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SortableHeader({
  column,
  sort,
  order,
  onSort,
}: {
  column: SortKey
  sort: SortKey
  order: SortOrder
  onSort: (next: Pick<ListQuery, 'sort' | 'order' | 'page'>) => void
}) {
  const isActive = column === sort
  // 並べ替え中の列なら昇順・降順を切り替え、別の列ならその列の昇順から始める
  const nextOrder: SortOrder = isActive && order === 'asc' ? 'desc' : 'asc'

  return (
    <th aria-sort={isActive ? (order === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="sort-button" onClick={() => onSort({ sort: column, order: nextOrder, page: 1 })}>
        {LABELS[column]}{' '}
        <span className={isActive ? 'sort-indicator' : 'sort-indicator inactive'} aria-hidden="true">
          {isActive ? (order === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

type ImportSummary = { created: number; updated: number; skipped: number; errors: ImportRowError[] }

function ImportSummaryPanel({ summary, onClose }: { summary: ImportSummary; onClose: () => void }) {
  const { created, updated, skipped, errors } = summary
  return (
    <section className="import-summary" role="status">
      <div className="import-summary-header">
        <p>
          取り込みが完了しました：追加 {created}件・上書き {updated}件・読み飛ばし（空行） {skipped}件・エラー {errors.length}件
        </p>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
      {errors.length > 0 && (
        <>
          <p className="error">次の行は取り込めませんでした。Excel を直して、もう一度取り込んでください。</p>
          <table>
            <thead>
              <tr>
                <th>行</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {errors.map(({ rowNumber, issues }) => (
                <tr key={rowNumber}>
                  <td>{rowNumber}行目</td>
                  <td>
                    {issues.map(({ field, message }) => (
                      <div key={`${field}-${message}`}>{field ? `${LABELS[field]}: ${message}` : message}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
