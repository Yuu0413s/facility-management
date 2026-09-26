import ExcelJS from 'exceljs'
import type { FacilityPc } from '../../shared/facility-pc-schema'
import { facilityPcInputSchema } from '../../shared/facility-pc-schema'
import { buildFacilityPcWorkbook } from './export-excel'
import { readFacilityPcWorkbook } from './import-excel'

// テスト用に、見出し行と値の行から .xlsx を作る
const toXlsx = async (rows: unknown[][], sheetName = 'Sheet1') => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  for (const row of rows) sheet.addRow(row)
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

describe('readFacilityPcWorkbook', () => {
  it('1行目の見出しの名前で列を対応づけ、Excel 上の行番号を付けて返す（並び順は自由、知らない列は無視）', async () => {
    const buffer = await toXlsx([
      ['メモ欄', 'PC名', '施設名', 'Tag'],
      ['無視される', 'PC-001', '中央病院', 'TAG-1'],
    ])
    const result = await readFacilityPcWorkbook(buffer)
    expect(result.rows).toEqual([{ rowNumber: 2, values: { facilityName: '中央病院', pcName: 'PC-001', tag: 'TAG-1' } }])
    expect(result.errors).toEqual([])
  })

  it('全件出力した Excel をそのまま取り込むと、元のデータに戻る（バックアップからの復元）', async () => {
    const original: FacilityPc = {
      id: 1,
      facilityName: '中央病院',
      pcName: 'PC-001',
      tag: 'TAG-0001',
      installedOn: '2026-09-26',
      osVersion: 'Windows 11',
      officeType: 'H&B',
      officeVersion: '2021',
      licenseKey: 'ABCDE12345FGHIJ67890KLMNO',
      account: 'user@example.com',
      password: 'p@ss',
      registeredOn: '2024-05-01',
      remarks: '1行目\n2行目',
    }
    const blank: FacilityPc = { ...original, id: 2, pcName: null, tag: null, installedOn: null, licenseKey: null, registeredOn: null, remarks: null }
    const exported = await buildFacilityPcWorkbook([original, blank], 'all')
    const { rows, errors } = await readFacilityPcWorkbook((await exported.xlsx.writeBuffer()) as ArrayBuffer)

    expect(errors).toEqual([])
    const { id: _, ...originalInput } = original
    const { id: __, ...blankInput } = blank
    expect(rows.map((row) => facilityPcInputSchema.parse(row.values))).toEqual([originalInput, blankInput])
  })

  it('全件出力と同じ見出し（全項目）を読み取れる', async () => {
    const buffer = await toXlsx([
      ['施設名', 'PC名', 'Tag', '設置日', 'OSバージョン', 'Office種類', 'Officeバージョン', 'Key', 'アカウント', 'パスワード', 'アカウント登録日', '備考'],
      ['中央病院', 'PC-001', 'TAG-1', '2026/09/26', 'Win11', 'H&B', '2021', 'ABCDE-12345-FGHIJ-67890-KLMNO', 'user1', 'pw', '2024/05/01', 'メモ'],
    ])
    const [row] = (await readFacilityPcWorkbook(buffer)).rows
    expect(row.values).toEqual({
      facilityName: '中央病院',
      pcName: 'PC-001',
      tag: 'TAG-1',
      installedOn: '2026-09-26',
      osVersion: 'Win11',
      officeType: 'H&B',
      officeVersion: '2021',
      licenseKey: 'ABCDE-12345-FGHIJ-67890-KLMNO',
      account: 'user1',
      password: 'pw',
      registeredOn: '2024-05-01',
      remarks: 'メモ',
    })
  })

  it('日付は yyyy/mm/dd・yyyymmdd・Excel の日付セルのどれでも読み取る（日付セルは UTC の年月日）', async () => {
    const buffer = await toXlsx([
      ['施設名', '設置日', 'アカウント登録日'],
      ['A病院', '2026/9/5', '20240501'],
      ['B病院', new Date(Date.UTC(2026, 8, 26)), 20240501],
      ['C病院', '２０２６０９２６', null],
    ])
    const { rows } = await readFacilityPcWorkbook(buffer)
    expect(rows.map((row) => [row.values.installedOn, row.values.registeredOn])).toEqual([
      ['2026-09-05', '2024-05-01'],
      ['2026-09-26', '2024-05-01'],
      ['2026-09-26', ''],
    ])
  })

  it('日付として読めない値は、その行をエラーにして送らない', async () => {
    const buffer = await toXlsx([
      ['施設名', '設置日'],
      ['A病院', '2026年9月5日'],
      ['B病院', '2026/09/05'],
    ])
    const result = await readFacilityPcWorkbook(buffer)
    expect(result.rows.map((row) => row.rowNumber)).toEqual([3])
    expect(result.errors).toEqual([
      { rowNumber: 2, issues: [{ field: 'installedOn', message: '日付は yyyy/mm/dd か yyyymmdd の形で入力してください' }] },
    ])
  })

  it('数値・リンク付きの文字（メールアドレスなど）・数式のセルも文字にそろえる', async () => {
    const buffer = await toXlsx([
      ['施設名', 'PC名', 'アカウント', 'Officeバージョン'],
      ['A病院', 12345, { text: 'user@example.com', hyperlink: 'mailto:user@example.com' }, { formula: '2000+21', result: 2021 }],
    ])
    const [row] = (await readFacilityPcWorkbook(buffer)).rows
    expect(row.values).toMatchObject({ pcName: '12345', account: 'user@example.com', officeVersion: '2021' })
  })

  it('エラーのセル（#N/A など）や、結果を読めない数式は、黙って空欄にせず、その行をエラーにする', async () => {
    const buffer = await toXlsx([
      ['施設名', 'PC名', 'アカウント'],
      ['A病院', { error: '#N/A' }, 'user1'],
      ['B病院', { formula: 'VLOOKUP(1,X,2)', result: { error: '#REF!' } }, 'user2'],
      ['C病院', 'PC-3', { formula: 'A1&B1' }],
      [null, { error: '#DIV/0!' }, null],
      ['E病院', 'PC-5', 'user5'],
    ])
    const result = await readFacilityPcWorkbook(buffer)
    expect(result.rows.map((row) => row.rowNumber)).toEqual([6])
    expect(result.skipped).toBe(0)
    expect(result.errors).toEqual([
      { rowNumber: 2, issues: [{ field: 'pcName', message: 'セルがエラー（#N/A）になっています' }] },
      { rowNumber: 3, issues: [{ field: 'pcName', message: 'セルがエラー（#REF!）になっています' }] },
      { rowNumber: 4, issues: [{ field: 'account', message: '数式の結果を読み取れません。Excel で開いて保存し直してください' }] },
      { rowNumber: 5, issues: [{ field: 'pcName', message: 'セルがエラー（#DIV/0!）になっています' }] },
    ])
  })

  it('全項目が空欄の行は読み飛ばし、件数を返す', async () => {
    const buffer = await toXlsx([
      ['施設名', 'PC名'],
      ['A病院', null],
      [null, '  '],
      [null, null],
      ['B病院', 'PC-1'],
    ])
    const result = await readFacilityPcWorkbook(buffer)
    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 5])
    expect(result.skipped).toBe(2)
  })

  it('最初のシートだけを読む', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('一覧').addRows([['施設名'], ['A病院']])
    workbook.addWorksheet('別シート').addRows([['施設名'], ['B病院']])
    const result = await readFacilityPcWorkbook((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
    expect(result.rows.map((row) => row.values.facilityName)).toEqual(['A病院'])
  })

  it('知っている見出しが1つも無ければ、取り込めない理由を伝える', async () => {
    const buffer = await toXlsx([['名前', '番号'], ['A', '1']])
    await expect(readFacilityPcWorkbook(buffer)).rejects.toThrow('1行目に「施設名」「PC名」などの見出しが見つかりません')
  })

  it('1,000行を超えるファイルは取り込まずに分割を案内する', async () => {
    const buffer = await toXlsx([['施設名'], ...Array.from({ length: 1001 }, (_, index) => [`病院${index}`])])
    await expect(readFacilityPcWorkbook(buffer)).rejects.toThrow('一度に取り込めるのは1000行までです')
  })

  it('Excel ファイルとして読めなければ、その旨を伝える', async () => {
    await expect(readFacilityPcWorkbook(new TextEncoder().encode('not excel').buffer as ArrayBuffer)).rejects.toThrow(
      'Excel ファイル（.xlsx）として読み込めませんでした',
    )
  })
})
