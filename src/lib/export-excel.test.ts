import type { FacilityPc } from '../../shared/facility-pc-schema'
import { buildFacilityPcWorkbook, excelFileName } from './export-excel'

const rows: FacilityPc[] = [
  {
    id: 1,
    facilityName: '中央病院',
    pcName: 'PC-001',
    installedOn: '2026-09-26',
    osVersion: 'Windows 11',
    officeType: 'H&B',
    officeVersion: '2021',
    licenseKey: 'KEY-1',
    account: 'user1',
    password: 'secret',
    remarks: '1行目\n2行目',
  },
  { id: 2, facilityName: '東病院', pcName: 'PC-002', installedOn: '2025-01-05', osVersion: 'Windows 10', officeType: 'Pro', officeVersion: '2016', licenseKey: 'KEY-2', account: 'user2', password: 'pw', remarks: null },
]

describe('buildFacilityPcWorkbook', () => {
  it('見出し行と、パスワード・Keyを含む全項目を画面と同じ表記で出力する', async () => {
    const workbook = await buildFacilityPcWorkbook(rows)
    const sheet = workbook.getWorksheet('施設PC一覧')!
    const values = (rowNumber: number) => (sheet.getRow(rowNumber).values as unknown[]).slice(1)

    expect(values(1)).toEqual(['施設名', 'PC名', '設置日', 'OSバージョン', 'Office種類', 'Officeバージョン', 'Key', 'アカウント', 'パスワード', '備考'])
    expect(values(2)).toEqual(['中央病院', 'PC-001', '2026/09/26', 'Windows 11', 'H&B', '2021', 'KEY-1', 'user1', 'secret', '1行目\n2行目'])
    expect(values(3)).toEqual(['東病院', 'PC-002', '2025/01/05', 'Windows 10', 'Pro', '2016', 'KEY-2', 'user2', 'pw', ''])
    expect(sheet.rowCount).toBe(3)
  })
})

describe('excelFileName', () => {
  it('出力日をファイル名に入れる', () => {
    expect(excelFileName(new Date(2026, 8, 6))).toBe('施設PC一覧_20260906.xlsx')
  })
})
