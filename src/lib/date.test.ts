import { toDisplayDate, toInputDate, toIsoDate } from './date'

describe('toDisplayDate', () => {
  it('yyyy-mm-dd を yyyy/mm/dd にする', () => {
    expect(toDisplayDate('2026-09-26')).toBe('2026/09/26')
  })

  it('空欄（null）は空文字にする', () => {
    expect(toDisplayDate(null)).toBe('')
  })
})

describe('toInputDate', () => {
  it('yyyy-mm-dd を入力欄用の yyyymmdd にする', () => {
    expect(toInputDate('2026-09-26')).toBe('20260926')
  })

  it('空欄（null）は空文字にする', () => {
    expect(toInputDate(null)).toBe('')
  })
})

describe('toIsoDate', () => {
  it('yyyymmdd を yyyy-mm-dd にする（前後の空白は除く）', () => {
    expect(toIsoDate(' 20260926 ')).toBe('2026-09-26')
  })

  it.each(['', '2026/09/26', '2026-09-26', '2026926', '202609261', 'abcdefgh'])(
    '8桁の数字でない %s はそのまま返し、判定はスキーマに任せる',
    (value) => {
      expect(toIsoDate(value)).toBe(value.trim())
    },
  )
})
