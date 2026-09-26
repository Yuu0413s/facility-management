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

  it.each([
    'facilityName',
    'pcName',
    'installedOn',
    'osVersion',
    'officeType',
    'officeVersion',
    'licenseKey',
    'account',
    'password',
  ] as const)('%s は任意入力で、空白だけなら null として受け付ける', (field) => {
    const result = facilityPcInputSchema.safeParse({ ...validInput, [field]: '   ' })
    expect(result.success).toBe(true)
    expect(result.data?.[field]).toBeNull()
  })

  it('施設名とPC名だけでも登録でき、送られてこない項目は null になる', () => {
    expect(facilityPcInputSchema.parse({ facilityName: '中央病院', pcName: 'PC-001' })).toEqual({
      facilityName: '中央病院',
      pcName: 'PC-001',
      installedOn: null,
      osVersion: null,
      officeType: null,
      officeVersion: null,
      licenseKey: null,
      account: null,
      password: null,
      remarks: null,
    })
  })

  it('1項目だけでも入力されていれば受け付ける（備考だけでもよい）', () => {
    expect(facilityPcInputSchema.safeParse({ remarks: 'メモ' }).success).toBe(true)
  })

  it.each([
    ['何も送られてこない', {}],
    ['すべて空白', Object.fromEntries(Object.keys(validInput).map((key) => [key, '  ']))],
  ])('%s場合は「いずれかの項目を入力してください」だけを返す', (_, input) => {
    const result = facilityPcInputSchema.safeParse(input)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['いずれかの項目を入力してください'])
  })

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

  describe('Key（プロダクトキー）', () => {
    it('ハイフン付き・小文字で入力されても、ハイフンを除いて大文字の25桁にする', () => {
      const result = facilityPcInputSchema.parse({ ...validInput, licenseKey: ' abcde-12345-fghij-67890-klmno ' })
      expect(result.licenseKey).toBe('ABCDE12345FGHIJ67890KLMNO')
    })

    it('全角の英数字・ハイフンは半角にしてから確かめる（日本語入力のまま打った場合）', () => {
      const result = facilityPcInputSchema.parse({ ...validInput, licenseKey: 'ａｂｃｄｅ１２３４５－ＦＧＨＩＪ６７８９０ＫＬＭＮＯ' })
      expect(result.licenseKey).toBe('ABCDE12345FGHIJ67890KLMNO')
    })

    it('ハイフンなしの25桁はそのまま受け付ける', () => {
      expect(facilityPcInputSchema.parse({ ...validInput, licenseKey: 'ABCDE12345FGHIJ67890KLMNO' }).licenseKey).toBe('ABCDE12345FGHIJ67890KLMNO')
    })

    it.each(['ABCDE12345FGHIJ67890KLMN', 'ABCDE12345FGHIJ67890KLMNOA', 'ABCDE12345FGHIJ67890KLMN!', '-----'])('%s（英数字25桁でない）は弾く', (licenseKey) => {
      const result = facilityPcInputSchema.safeParse({ ...validInput, licenseKey })
      expect(result.error?.issues.map((issue) => issue.message)).toEqual(['Key は英数字25桁で入力してください'])
    })
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

  it('年が 0000 の日付は DB に保存できないので弾く', () => {
    expect(facilityPcInputSchema.safeParse({ ...validInput, installedOn: '0000-01-01' }).success).toBe(false)
    expect(facilityPcInputSchema.safeParse({ ...validInput, installedOn: '0001-01-01' }).success).toBe(true)
  })

  it('形式が違う設置日には、画面の入力形式（yyyymmdd）でメッセージを返す', () => {
    const result = facilityPcInputSchema.safeParse({ ...validInput, installedOn: '2026/09/26' })
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['yyyymmdd（8桁の数字）で入力してください'])
  })

  it('うるう日を受け付ける', () => {
    expect(facilityPcInputSchema.safeParse({ ...validInput, installedOn: '2024-02-29' }).success).toBe(true)
  })
})

describe('listQuerySchema', () => {
  it('省略時は sort=facilityName, order=asc, page=1, q=undefined', () => {
    expect(listQuerySchema.parse({})).toEqual({ sort: 'facilityName', order: 'asc', page: 1, q: undefined })
  })

  it('文字列のページ番号を数値に変換する', () => {
    expect(listQuerySchema.parse({ page: '3', sort: 'pcName', order: 'desc', q: ' 中央 ' })).toEqual({
      page: 3,
      sort: 'pcName',
      order: 'desc',
      q: '中央',
    })
  })

  it('空白だけの検索語は undefined として扱う', () => {
    expect(listQuerySchema.parse({ q: '  ' }).q).toBeUndefined()
  })

  it.each(['0', '-1', '1.5', 'abc'])('page=%s を弾く', (page) => {
    expect(listQuerySchema.safeParse({ page }).success).toBe(false)
  })

  it.each(['installedOn', 'registeredOn'] as const)('sort=%s（設置日・登録日）を受け付ける', (sort) => {
    expect(listQuerySchema.parse({ sort }).sort).toBe(sort)
  })

  it('sort は決められた列以外を弾く（列名を SQL に埋め込むため）', () => {
    expect(listQuerySchema.safeParse({ sort: 'password' }).success).toBe(false)
    expect(listQuerySchema.safeParse({ sort: 'pc_name; DROP TABLE facility_pcs' }).success).toBe(false)
  })

  it('order は asc/desc 以外を弾く', () => {
    expect(listQuerySchema.safeParse({ order: 'random' }).success).toBe(false)
  })
})
