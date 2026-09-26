import type { CellValue } from 'exceljs'
import { IMPORT_MAX_ROWS, type FacilityPcInput, type ImportRow, type ImportRowError } from '../../shared/facility-pc-schema'
import { FACILITY_PC_FIELDS, FACILITY_PC_LABELS } from './facility-pc-labels'

type Field = keyof FacilityPcInput

export type ReadResult = {
  rows: ImportRow[]
  // 全項目が空欄で読み飛ばした行の数
  skipped: number
  // 送る前に分かった誤り（日付として読めないなど）
  errors: ImportRowError[]
}

const DATE_FIELDS: ReadonlySet<Field> = new Set(['installedOn', 'registeredOn'])
const DATE_FORMAT_MESSAGE = '日付は yyyy/mm/dd か yyyymmdd の形で入力してください'

// 見出しの表記ゆれ（全角英数字・前後の空白）を吸収して、項目名に対応づける
const normalizeText = (value: string) => value.normalize('NFKC').trim()
const FIELD_BY_LABEL = new Map(FACILITY_PC_FIELDS.map((field) => [normalizeText(FACILITY_PC_LABELS[field]), field]))

// Excel のセルは、文字・数値・日付のほか、リンク付きの文字（メールアドレスなど）や数式の結果などの形で入っている
const toCellValue = (value: CellValue): string | Date => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('hyperlink' in value) return toCellValue(value.text as CellValue)
    if ('result' in value) return toCellValue(value.result as CellValue)
    // #N/A などのエラー値は空欄として扱う
    if ('error' in value) return ''
  }
  return String(value)
}

// Excel の日付セルは UTC の 0 時として読み込まれるので、UTC の年月日を使う（時差で前日にずれないように）
const toIsoFromDate = (date: Date) => date.toISOString().slice(0, 10)

// yyyy/mm/dd（月日は1桁でもよい）、yyyymmdd（全角でもよい）、日付セルを yyyy-mm-dd にする。読めなければ null
const toIsoDate = (value: string | Date): string | null => {
  if (value instanceof Date) return toIsoFromDate(value)
  const text = normalizeText(value)
  if (text === '') return ''
  const slashed = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text)
  if (slashed) return `${slashed[1]}-${slashed[2].padStart(2, '0')}-${slashed[3].padStart(2, '0')}`
  const digits = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  return digits ? `${digits[1]}-${digits[2]}-${digits[3]}` : null
}

export const readFacilityPcWorkbook = async (buffer: ArrayBuffer): Promise<ReadResult> => {
  // ExcelJS は大きいので、取り込むときだけ読み込む
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new Error('Excel ファイル（.xlsx）として読み込めませんでした')
  }

  const sheet = workbook.worksheets[0]
  const columns = new Map<number, Field>()
  sheet?.getRow(1).eachCell((cell, columnNumber) => {
    const field = FIELD_BY_LABEL.get(normalizeText(String(toCellValue(cell.value))))
    if (field) columns.set(columnNumber, field)
  })
  if (!sheet || columns.size === 0) {
    throw new Error('1行目に「施設名」「PC名」などの見出しが見つかりません。全件出力した Excel と同じ見出しにしてください')
  }

  const rows: ImportRow[] = []
  const errors: ImportRowError[] = []
  let skipped = 0

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const values: Partial<Record<Field, string>> = {}
    const issues: ImportRowError['issues'] = []

    for (const [columnNumber, field] of columns) {
      const cellValue = toCellValue(row.getCell(columnNumber).value)
      if (DATE_FIELDS.has(field)) {
        const isoDate = toIsoDate(cellValue)
        if (isoDate === null) issues.push({ field, message: DATE_FORMAT_MESSAGE })
        values[field] = isoDate ?? ''
      } else {
        values[field] = cellValue instanceof Date ? toIsoFromDate(cellValue) : cellValue
      }
    }

    if (issues.length === 0 && Object.values(values).every((value) => value.trim() === '')) {
      skipped++
      continue
    }
    if (rows.length + errors.length >= IMPORT_MAX_ROWS) {
      throw new Error(`一度に取り込めるのは${IMPORT_MAX_ROWS}行までです。ファイルを分けてください`)
    }
    if (issues.length > 0) errors.push({ rowNumber, issues })
    else rows.push({ rowNumber, values })
  }

  return { rows, skipped, errors }
}
