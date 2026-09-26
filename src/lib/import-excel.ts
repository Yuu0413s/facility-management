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

// Excel のセルは、文字・数値・日付のほか、リンク付きの文字（メールアドレスなど）や数式の結果などの形で入っている。
// エラー値（#N/A など）や結果を読めない数式を黙って空欄にすると、既存の値が残ったり行が読み飛ばされたりして
// 気づけない欠落になるため、読み取れない理由（error）として返す
type CellRead = { value: string | Date } | { error: string }

const readCell = (value: CellValue): CellRead => {
  if (value === null || value === undefined) return { value: '' }
  if (value instanceof Date) return { value }
  if (typeof value !== 'object') return { value: String(value) }
  if ('error' in value) return { error: `セルがエラー（${value.error}）になっています` }
  if ('richText' in value) return { value: value.richText.map((part) => part.text).join('') }
  if ('hyperlink' in value) return readCell(value.text as CellValue)
  if ('formula' in value || 'sharedFormula' in value) {
    return 'result' in value && value.result !== undefined
      ? readCell(value.result as CellValue)
      : { error: '数式の結果を読み取れません。Excel で開いて保存し直してください' }
  }
  return { error: 'セルの内容を読み取れません' }
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
  const duplicatedFields = new Set<Field>()
  sheet?.getRow(1).eachCell((cell, columnNumber) => {
    const header = readCell(cell.value)
    const field = 'value' in header ? FIELD_BY_LABEL.get(normalizeText(String(header.value))) : undefined
    if (!field) return
    // 同じ見出しが複数の列にあると、後ろの列の値で前の列の値を黙って上書きしてしまうため、取り込まずに伝える
    if ([...columns.values()].includes(field)) duplicatedFields.add(field)
    columns.set(columnNumber, field)
  })
  if (duplicatedFields.size > 0) {
    const labels = [...duplicatedFields].map((field) => `「${FACILITY_PC_LABELS[field]}」`).join('')
    throw new Error(`${labels}の見出しが複数の列にあります。1つにしてください`)
  }
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
      const cell = readCell(row.getCell(columnNumber).value)
      if ('error' in cell) {
        issues.push({ field, message: cell.error })
        continue
      }
      const cellValue = cell.value
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
