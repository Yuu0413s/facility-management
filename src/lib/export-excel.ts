import type { FacilityPc, FacilityPcInput } from '../../shared/facility-pc-schema'
import { fetchAllFacilityPcs } from '../api/facility-pcs-client'
import { toDisplayDate } from './date'
import { FACILITY_PC_FIELDS, FACILITY_PC_LABELS } from './facility-pc-labels'

export type ExportKind = 'all' | 'account'

// 出力の種類ごとのシート名（ファイル名にも使う）と列
const EXPORT_DEFINITIONS: Record<ExportKind, { sheetName: string; fields: Array<keyof FacilityPcInput> }> = {
  all: { sheetName: '施設PC一覧', fields: FACILITY_PC_FIELDS },
  account: { sheetName: 'アカウント情報', fields: ['pcName', 'account', 'password'] },
}

// ExcelJS は大きいので、出力ボタンを押したときだけ読み込む
export const buildFacilityPcWorkbook = async (rows: FacilityPc[], kind: ExportKind) => {
  const { sheetName, fields } = EXPORT_DEFINITIONS[kind]
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })

  sheet.columns = fields.map((field) => ({
    header: FACILITY_PC_LABELS[field],
    key: field,
    width: field === 'remarks' ? 40 : 18,
  }))
  sheet.getRow(1).font = { bold: true }

  for (const row of rows) {
    // 空欄（null）の項目は空のセルにする
    const cells = Object.fromEntries(fields.map((field) => [field, row[field] ?? '']))
    sheet.addRow({ ...cells, installedOn: toDisplayDate(row.installedOn) })
  }
  if (fields.includes('remarks')) {
    sheet.getColumn('remarks').alignment = { wrapText: true, vertical: 'top' }
  }

  return workbook
}

export const excelFileName = (kind: ExportKind, date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  const { sheetName } = EXPORT_DEFINITIONS[kind]
  return `${sheetName}_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.xlsx`
}

export const exportFacilityPcsToExcel = async (kind: ExportKind) => {
  const workbook = await buildFacilityPcWorkbook(await fetchAllFacilityPcs(), kind)
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = excelFileName(kind, new Date())
  link.click()
  URL.revokeObjectURL(url)
}
