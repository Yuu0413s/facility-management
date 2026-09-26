import { z } from 'zod'
import {
  facilityPcInputSchema,
  type FacilityPcInput,
  type ImportIssue,
  type ImportResult,
  type ImportRow,
  type ImportRowError,
} from '../shared/facility-pc-schema'
import type { FacilityPcRepository } from './db/facility-pcs-repository'

type ValidRow = { rowNumber: number; input: FacilityPcInput }

const toIssues = (error: z.ZodError): ImportIssue[] =>
  error.issues.map((issue) => ({
    field: typeof issue.path[0] === 'string' ? (issue.path[0] as keyof FacilityPcInput) : null,
    message: issue.message,
  }))

// ファイル内で同じキーを持つ行は、後から出てきた行をエラーにする。
// 1本の SQL の中で同じ行を2回更新できない（PostgreSQL がエラーにする）ため、送る前に取り除く
const rejectDuplicatesInFile = (
  rows: ValidRow[],
  keyOf: (input: FacilityPcInput) => string | null,
  issueFor: (firstRowNumber: number) => ImportIssue,
) => {
  const firstRowNumbers = new Map<string, number>()
  const accepted: ValidRow[] = []
  const errors: ImportRowError[] = []
  for (const row of rows) {
    const key = keyOf(row.input)
    const firstRowNumber = key === null ? undefined : firstRowNumbers.get(key)
    if (firstRowNumber !== undefined) {
      errors.push({ rowNumber: row.rowNumber, issues: [issueFor(firstRowNumber)] })
      continue
    }
    if (key !== null) firstRowNumbers.set(key, row.rowNumber)
    accepted.push(row)
  }
  return { accepted, errors }
}

// 施設名とPC名の両方がそろっているときだけ照合できる（どちらかが空欄なら常に追加）
const facilityPcKey = ({ facilityName, pcName }: FacilityPcInput) =>
  facilityName !== null && pcName !== null ? JSON.stringify([facilityName, pcName]) : null


export const importFacilityPcs = async (repository: FacilityPcRepository, rows: ImportRow[]): Promise<ImportResult> => {
  const errors: ImportRowError[] = []

  // 1. 各行を登録・編集と同じ入力のルールで検証する（正しい行だけ次に進める）
  const valid: ValidRow[] = []
  for (const { rowNumber, values } of rows) {
    const parsed = facilityPcInputSchema.safeParse(values)
    if (parsed.success) valid.push({ rowNumber, input: parsed.data })
    else errors.push({ rowNumber, issues: toIssues(parsed.error) })
  }

  // 2. ファイル内の重複
  const byFacilityPc = rejectDuplicatesInFile(valid, facilityPcKey, (first) => ({
    field: null,
    message: `${first}行目と施設名・PC名が重複しています`,
  }))
  errors.push(...byFacilityPc.errors)

  // 3. Tag の重複（ファイル内・DB の別のデータ）を、DB の重複禁止と同じ基準（PostgreSQL の lower()）で1本の SQL で確かめる。
  //    照合には利用者が送った行番号ではなく配列の位置を使う（行番号が一意だと決めつけないため）
  const candidates = byFacilityPc.accepted
  const tagIssues = await repository.findTagIssues(candidates.map(({ input }, key) => ({ key, input })))
  const rejectedKeys = new Set<number>()
  for (const { key, duplicateOfKey } of tagIssues) {
    rejectedKeys.add(key)
    // ファイル内の重複を優先して伝える（そちらを直せば DB との重複も分かりやすくなるため）。それ以外は DB との重複
    const message =
      duplicateOfKey !== null ? `${candidates[duplicateOfKey].rowNumber}行目とTagが重複しています` : '同じTagがすでに登録されています'
    errors.push({ rowNumber: candidates[key].rowNumber, issues: [{ field: 'tag', message }] })
  }
  const toWrite = candidates.filter((_, key) => !rejectedKeys.has(key))

  // 4. 残りを1本の SQL でアップサートする
  const { created, updated } =
    toWrite.length === 0 ? { created: 0, updated: 0 } : await repository.upsertMany(toWrite.map((row) => row.input))

  return { created, updated, errors: errors.sort((a, b) => a.rowNumber - b.rowNumber) }
}
