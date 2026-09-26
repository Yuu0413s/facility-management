import type { FacilityPc } from '../../shared/facility-pc-schema'
import { buildFacilityPcWorkbook, excelFileName } from './export-excel'

const rows: FacilityPc[] = [
  {
    id: 1,
    facilityName: '中央病院',
    pcName: 'PC-001',
    tag: null,
    installedOn: '2026-09-26',
    osVersion: 'Windows 11',
    officeType: 'H&B',
    officeVersion: '2021',
    licenseKey: 'ABCDE12345FGHIJ67890KLMNO',
    account: 'user1',
    password: 'secret',
    remarks: '1行目\n2行目',
    registeredOn: '2026-09-20',
  },
  { id: 2, facilityName: '東病院', pcName: 'PC-002', tag: null, installedOn: '2025-01-05', osVersion: 'Windows 10', officeType: 'Pro', officeVersion: '2016', licenseKey: 'KEY-2', account: 'user2', password: 'pw', remarks: null, registeredOn: '2026-01-02' },
  { id: 3, facilityName: '西病院', pcName: null, tag: null, installedOn: null, osVersion: null, officeType: null, officeVersion: null, licenseKey: null, account: null, password: null, remarks: null, registeredOn: null },
]

describe('buildFacilityPcWorkbook', () => {
  it('見出し行と、パスワード・Key・アカウント登録日を含む全項目を画面と同じ表記で出力する（Key は5桁ごとにハイフン、形式外の既存データはそのまま）', async () => {
    const workbook = await buildFacilityPcWorkbook(rows, 'all')
    const sheet = workbook.getWorksheet('施設PC一覧')!
    const values = (rowNumber: number) => (sheet.getRow(rowNumber).values as unknown[]).slice(1)

    expect(values(1)).toEqual(['施設名', 'PC名', 'Tag', '設置日', 'OSバージョン', 'Office種類', 'Officeバージョン', 'Key', 'アカウント', 'パスワード', 'アカウント登録日', '備考'])
    expect(values(2)).toEqual(['中央病院', 'PC-001', '', '2026/09/26', 'Windows 11', 'H&B', '2021', 'ABCDE-12345-FGHIJ-67890-KLMNO', 'user1', 'secret', '2026/09/20', '1行目\n2行目'])
    expect(values(3)).toEqual(['東病院', 'PC-002', '', '2025/01/05', 'Windows 10', 'Pro', '2016', 'KEY-2', 'user2', 'pw', '2026/01/02', ''])
    // 空欄の項目は空のセルにする
    expect(values(4)).toEqual(['西病院', '', '', '', '', '', '', '', '', '', '', ''])
    expect(sheet.rowCount).toBe(4)
  })
})

describe('buildFacilityPcWorkbook（アカウント情報）', () => {
  it('PC名・アカウント・パスワードの3列だけを全件出力する', async () => {
    const workbook = await buildFacilityPcWorkbook(rows, 'account')
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['アカウント情報'])
    const sheet = workbook.getWorksheet('アカウント情報')!
    const values = (rowNumber: number) => (sheet.getRow(rowNumber).values as unknown[]).slice(1)

    expect(values(1)).toEqual(['PC名', 'アカウント', 'パスワード'])
    expect(values(2)).toEqual(['PC-001', 'user1', 'secret'])
    expect(values(3)).toEqual(['PC-002', 'user2', 'pw'])
    expect(values(4)).toEqual(['', '', ''])
    expect(sheet.rowCount).toBe(4)
    expect(sheet.columnCount).toBe(3)
  })
})

describe('excelFileName', () => {
  it.each([
    ['all', '施設PC一覧_20260906.xlsx'],
    ['account', 'アカウント情報_20260906.xlsx'],
  ] as const)('%s は出力日を入れて %s にする', (kind, expected) => {
    expect(excelFileName(kind, new Date(2026, 8, 6))).toBe(expected)
  })
})
