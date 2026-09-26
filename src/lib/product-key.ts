// プロダクトキーは英数字25桁で保存している。表示するときだけ5桁ごとにハイフンを入れる。
// 25桁の形になっていない既存データは、手を加えずにそのまま表示する
export const formatProductKey = (key: string | null) => {
  if (!key) return ''
  return /^[A-Z0-9]{25}$/.test(key) ? key.match(/.{5}/g)!.join('-') : key
}
