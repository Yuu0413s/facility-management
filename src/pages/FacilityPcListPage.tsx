import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listQuerySchema, type FacilityPc, type FacilityPcPage, type ListQuery } from '../../shared/facility-pc-schema'
import { deleteFacilityPc, fetchFacilityPcPage } from '../api/facility-pcs-client'
import { Pagination } from '../components/Pagination'
import { SecretCell } from '../components/SecretCell'
import { toDisplayDate } from '../lib/date'
import { exportFacilityPcsToExcel } from '../lib/export-excel'
import { FACILITY_PC_LABELS as LABELS } from '../lib/facility-pc-labels'

const DEFAULT_QUERY: ListQuery = { order: 'asc', page: 1 }

// 検索条件は URL に持たせる。編集ページから戻ったときやリロード時も同じ一覧を再現するため
const parseQuery = (searchParams: URLSearchParams): ListQuery => {
  const result = listQuerySchema.safeParse(Object.fromEntries(searchParams))
  return result.success ? result.data : DEFAULT_QUERY
}

const toSearchParams = ({ q, order, page }: ListQuery) => {
  const params = new URLSearchParams({ order, page: String(page) })
  if (q) params.set('q', q)
  return params
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '予期しないエラーが発生しました')

export function FacilityPcListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = parseQuery(searchParams)
  const { q, order, page } = query

  const [keyword, setKeyword] = useState(q ?? '')
  const [result, setResult] = useState<FacilityPcPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    // 条件を素早く切り替えたとき、古いリクエストの結果で上書きしないようにする
    let isCancelled = false
    setError(null)
    // 前の条件の表を残すと、失敗時に別の条件のデータを編集・削除できてしまうため、一度消す
    setResult(null)
    fetchFacilityPcPage({ q, order, page })
      .then((data) => {
        if (isCancelled) return
        // 最終ページの最後の1件を削除したときなど、範囲外のページにいたら最終ページへ移る。
        // 前の条件の結果と取り違えないよう、この取得の結果だけで判定する
        const lastPage = Math.max(1, Math.ceil(data.total / data.perPage))
        if (data.page > lastPage) {
          setSearchParams(toSearchParams({ q, order, page: lastPage }), { replace: true })
          return
        }
        setResult(data)
      })
      .catch((e: unknown) => !isCancelled && setError(errorMessage(e)))
    return () => {
      isCancelled = true
    }
  }, [q, order, page, reloadCount, setSearchParams])

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
    if (!window.confirm(`「${pc.facilityName} / ${pc.pcName}」を削除します。よろしいですか？`)) return
    try {
      await deleteFacilityPc(pc.id)
      setReloadCount((count) => count + 1)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await exportFacilityPcsToExcel()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setIsExporting(false)
    }
  }

  const returnTo = `/?${searchParams}`

  return (
    <main className="page">
      <header className="page-header">
        <h1>施設PC一覧</h1>
        <div className="actions">
          <button type="button" onClick={handleExport} disabled={isExporting}>
            {isExporting ? '出力中…' : 'Excel出力'}
          </button>
          <Link className="button primary" to="/new" state={{ returnTo }}>
            新規登録
          </Link>
        </div>
      </header>

      <form className="search" role="search" onSubmit={handleSearch}>
        <input
          type="search"
          aria-label="施設名で検索"
          placeholder="施設名で検索"
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

      {!result && !error && <p>読み込み中…</p>}

      {result && (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th aria-sort={order === 'asc' ? 'ascending' : 'descending'}>
                    <button
                      type="button"
                      className="sort-button"
                      onClick={() => updateQuery({ order: order === 'asc' ? 'desc' : 'asc', page: 1 })}
                    >
                      {LABELS.facilityName} {order === 'asc' ? '▲' : '▼'}
                    </button>
                  </th>
                  <th>{LABELS.pcName}</th>
                  <th>{LABELS.installedOn}</th>
                  <th>{LABELS.osVersion}</th>
                  <th>{LABELS.officeType}</th>
                  <th>{LABELS.officeVersion}</th>
                  <th>{LABELS.licenseKey}</th>
                  <th>{LABELS.account}</th>
                  <th>{LABELS.password}</th>
                  <th>{LABELS.remarks}</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="empty">
                      登録されたデータはありません
                    </td>
                  </tr>
                ) : (
                  result.items.map((pc) => (
                    <tr key={pc.id}>
                      <td>{pc.facilityName}</td>
                      <td>{pc.pcName}</td>
                      <td>{toDisplayDate(pc.installedOn)}</td>
                      <td>{pc.osVersion}</td>
                      <td>{pc.officeType}</td>
                      <td>{pc.officeVersion}</td>
                      <td>
                        <SecretCell value={pc.licenseKey} label={LABELS.licenseKey} />
                      </td>
                      <td>{pc.account}</td>
                      <td>
                        <SecretCell value={pc.password} label={LABELS.password} />
                      </td>
                      <td className="remarks">{pc.remarks}</td>
                      <td className="row-actions">
                        <Link to={`/edit/${pc.id}`} state={{ returnTo }}>
                          編集
                        </Link>
                        <button type="button" className="danger" onClick={() => handleDelete(pc)}>
                          削除
                        </button>
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
