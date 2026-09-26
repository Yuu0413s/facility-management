import { facilityPcInputSchema, listQuerySchema } from './facility-pc-schema'

const validInput = {
  facilityName: '中央病院',
  pcName: 'PC-001',
  installedOn: '2026-09-26',
  osVersion: 'Windows 11 24H2',
  officeType: 'H&B',
  officeVersion: '2021',
  licenseKey: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
  account: 'user@example.com',
  password: 'p@ss word',
  remarks: '1行目\n2行目',
}

describe('facilityPcInputSchema', () => {
  it('正しい入力を受け付ける', () => {
    const result = facilityPcInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('文字列の前後の空白を取り除く', () => {
    const result = facilityPcInputSchema.parse({ ...validInput, facilityName: '  中央病院 ', pcName: '\tPC-001 ' })
    expect(result.facilityName).toBe('中央病院')
    expect(result.pcName).toBe('PC-001')
  })

  it.each(['facilityName', 'pcName', 'installedOn', 'osVersion', 'licenseKey', 'account', 'password'] as const)(
    '%s が空白だけなら弾く',
    (field) => {
      const result = facilityPcInputSchema.safeParse({ ...validInput, [field]: '   ' })
      expect(result.success).toBe(false)
    },
  )

  it('備考は省略でき、空文字は null になる', () => {
    const { remarks: _, ...withoutRemarks } = validInput
    expect(facilityPcInputSchema.parse(withoutRemarks).remarks).toBeNull()
    expect(facilityPcInputSchema.parse({ ...validInput, remarks: '  ' }).remarks).toBeNull()
  })

  it('備考は改行を保持し、500文字まで受け付ける', () => {
    expect(facilityPcInputSchema.parse(validInput).remarks).toBe('1行目\n2行目')
    expect(facilityPcInputSchema.safeParse({ ...validInput, remarks: 'あ'.repeat(500) }).success).toBe(true)
    expect(facilityPcInputSchema.safeParse({ ...validInput, remarks: 'あ'.repeat(501) }).success).toBe(false)
  })

  it('項目が送られてこなかった場合も日本語のメッセージを返す', () => {
    const result = facilityPcInputSchema.safeParse({})
    expect(result.success).toBe(false)
    expect(result.error?.issues.find((issue) => issue.path[0] === 'pcName')?.message).toBe('入力してください')
    expect(result.error?.issues.find((issue) => issue.path[0] === 'installedOn')?.message).toBe('入力してください')
  })

  it('Office種類は4種以外を弾く', () => {
    expect(facilityPcInputSchema.safeParse({ ...validInput, officeType: 'Home' }).success).toBe(false)
  })

  it('Officeバージョンは6種以外を弾く', () => {
    expect(facilityPcInputSchema.safeParse({ ...validInput, officeVersion: '2007' }).success).toBe(false)
  })

  it.each(['2026/09/26', '2026-9-26', '2026-02-30', '2026-13-01', 'abc'])('設置日 %s を弾く', (installedOn) => {
    expect(facilityPcInputSchema.safeParse({ ...validInput, installedOn }).success).toBe(false)
  })

  it('設置日が空欄なら「入力してください」だけを返す', () => {
    const result = facilityPcInputSchema.safeParse({ ...validInput, installedOn: '' })
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['入力してください'])
  })

  it('年が 0000 の日付は DB に保存できないので弾く', () => {
    expect(facilityPcInputSchema.safeParse({ ...validInput, installedOn: '0000-01-01' }).success).toBe(false)
    expect(facilityPcInputSchema.safeParse({ ...validInput, installedOn: '0001-01-01' }).success).toBe(true)
  })

  it('うるう日を受け付ける', () => {
    expect(facilityPcInputSchema.safeParse({ ...validInput, installedOn: '2024-02-29' }).success).toBe(true)
  })
})

describe('listQuerySchema', () => {
  it('省略時は order=asc, page=1, q=undefined', () => {
    expect(listQuerySchema.parse({})).toEqual({ order: 'asc', page: 1, q: undefined })
  })

  it('文字列のページ番号を数値に変換する', () => {
    expect(listQuerySchema.parse({ page: '3', order: 'desc', q: ' 中央 ' })).toEqual({ page: 3, order: 'desc', q: '中央' })
  })

  it('空白だけの検索語は undefined として扱う', () => {
    expect(listQuerySchema.parse({ q: '  ' }).q).toBeUndefined()
  })

  it.each(['0', '-1', '1.5', 'abc'])('page=%s を弾く', (page) => {
    expect(listQuerySchema.safeParse({ page }).success).toBe(false)
  })

  it('order は asc/desc 以外を弾く', () => {
    expect(listQuerySchema.safeParse({ order: 'random' }).success).toBe(false)
  })
})
