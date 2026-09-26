import { toDisplayDate, toIsoDate } from './date'

describe('toDisplayDate', () => {
  it('yyyy-mm-dd を yyyy/mm/dd にする', () => {
    expect(toDisplayDate('2026-09-26')).toBe('2026/09/26')
  })

  it('空欄（null）は空文字にする', () => {
    expect(toDisplayDate(null)).toBe('')
  })
})

describe('toIsoDate', () => {
  it('yyyy/mm/dd を yyyy-mm-dd にする', () => {
    expect(toIsoDate('2026/09/26')).toBe('2026-09-26')
  })

  it('月日が1桁でも0埋めする', () => {
    expect(toIsoDate(' 2026/9/5 ')).toBe('2026-09-05')
  })

  it.each(['', '2026-09-26', '2026/09', '26/09/26', 'abc'])('形式が違う %s はそのまま返し、判定はスキーマに任せる', (value) => {
    expect(toIsoDate(value)).toBe(value.trim())
  })
})
