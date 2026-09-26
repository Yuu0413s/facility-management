import { formatProductKey } from './product-key'

describe('formatProductKey', () => {
  it('英数字25桁を5桁ごとにハイフンで区切る', () => {
    expect(formatProductKey('ABCDE12345FGHIJ67890KLMNO')).toBe('ABCDE-12345-FGHIJ-67890-KLMNO')
  })

  it('空欄（null）は空文字にする', () => {
    expect(formatProductKey(null)).toBe('')
  })

  it.each(['KEY-1', 'ABCDE12345FGHIJ67890KLMN', 'ABCDE-12345-FGHIJ-67890-KLMNO'])('25桁の英数字でない既存データ %s は、そのまま返す', (value) => {
    expect(formatProductKey(value)).toBe(value)
  })
})
