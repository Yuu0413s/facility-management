export const toDisplayDate = (isoDate: string | null) => (isoDate ? isoDate.replaceAll('-', '/') : '')

// 入力欄では yyyymmdd（8桁の数字）で扱う
export const toInputDate = (isoDate: string | null) => (isoDate ? isoDate.replaceAll('-', '') : '')

// 日本語入力のまま打たれた全角の数字も受け付けるよう、NFKC 正規化で半角にそろえる
const normalizeDateInput = (inputDate: string) => inputDate.normalize('NFKC').trim()

// 入力欄の形式（yyyymmdd の8桁の数字）になっているか
export const isDateInputFormat = (inputDate: string) => /^\d{8}$/.test(normalizeDateInput(inputDate))

// yyyymmdd を yyyy-mm-dd に変換する。形式外の値は変換せず、エラー判定は Zod スキーマに任せる
export const toIsoDate = (inputDate: string) => {
  const value = normalizeDateInput(inputDate)
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value
}
