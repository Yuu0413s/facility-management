export const toDisplayDate = (isoDate: string) => isoDate.replaceAll('-', '/')

// yyyy/m/d も受け付けて yyyy-mm-dd に揃える。形式外の値は変換せず、エラー判定は Zod スキーマに任せる
export const toIsoDate = (displayDate: string) => {
  const value = displayDate.trim()
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value)
  if (!match) return value
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
