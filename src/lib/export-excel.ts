import type { FacilityPc } from '../../shared/facility-pc-schema'
import { fetchAllFacilityPcs } from '../api/facility-pcs-client'
import { toDisplayDate } from './date'
import { FACILITY_PC_FIELDS, FACILITY_PC_LABELS } from './facility-pc-labels'

const SHEET_NAME = '施設PC一覧'

// ExcelJS は大きいので、出力ボタンを押したときだけ読み込む
export const buildFacilityPcWorkbook = async (rows: FacilityPc[]) => {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] })

  sheet.columns = FACILITY_PC_FIELDS.map((field) => ({
    header: FACILITY_PC_LABELS[field],
    key: field,
    width: field === 'remarks' ? 40 : 18,
  }))
  sheet.getRow(1).font = { bold: true }

  for (const row of rows) {
    sheet.addRow({ ...row, installedOn: toDisplayDate(row.installedOn), remarks: row.remarks ?? '' })
  }
  sheet.getColumn('remarks').alignment = { wrapText: true, vertical: 'top' }

  return workbook
}

export const excelFileName = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${SHEET_NAME}_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.xlsx`
}

export const exportFacilityPcsToExcel = async () => {
  const workbook = await buildFacilityPcWorkbook(await fetchAllFacilityPcs())
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = excelFileName(new Date())
  link.click()
  URL.revokeObjectURL(url)
}
