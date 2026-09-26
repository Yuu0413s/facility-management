type Props = { page: number; perPage: number; total: number; onChange: (page: number) => void }

export function Pagination({ page, perPage, total, onChange }: Props) {
  const lastPage = Math.max(1, Math.ceil(total / perPage))

  return (
    <nav className="pagination" aria-label="ページ送り">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        前へ
      </button>
      <span>
        {page} / {lastPage} ページ（全 {total} 件）
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= lastPage}>
        次へ
      </button>
    </nav>
  )
}
