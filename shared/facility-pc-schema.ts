import { z } from 'zod'

export const OFFICE_TYPES = ['Personal', 'H&B', 'Pro', 'Access'] as const
export const OFFICE_VERSIONS = ['2010', '2013', '2016', '2019', '2021', '2024'] as const
export const REMARKS_MAX_LENGTH = 500
export const DATE_INPUT_FORMAT_MESSAGE = 'yyyymmdd（8桁の数字）で入力してください'
export const PER_PAGE = 50
// 並べ替えできる列。SQL の列名に対応づけるので、ここに無い値は受け付けない
export const SORT_KEYS = ['facilityName', 'pcName', 'tag', 'installedOn', 'registeredOn'] as const

// 全項目が任意入力。空白だけ・未送信の項目は null として保存する
const blankToNull = (value: unknown) => (value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value)
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable())

const optionalText = optional(z.string().trim())

// Key は Microsoft のプロダクトキー（英数字25桁）。ハイフン付き・小文字で貼り付けられても、
// ハイフンを除いて大文字にそろえてから確かめ、ハイフンなしで保存する（表示時にハイフンを入れる）。
// 日本語入力のまま打たれた全角の英数字・ハイフンも、NFKC 正規化で半角にそろえてから扱う
const productKey = z
  .string()
  .transform((value) => value.normalize('NFKC').trim().replaceAll('-', '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{25}$/, 'Key は英数字25桁で入力してください'))

// 形式 → 実在する日付の順に確認し、最初に引っかかった理由だけを返す（pipe で前段が通ったときだけ後段を実行する）
const isoDate = z
  .string()
  .trim()
  // 画面の入力欄は yyyymmdd。画面側で yyyy-mm-dd に変換してから送るので、形式違いは入力欄の形式で伝える
  .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_INPUT_FORMAT_MESSAGE)
  .pipe(
    z
      .string()
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`)
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
      }, '存在しない日付です')
      // PostgreSQL の DATE には 0 年が無いため、保存時に 500 にならないよう先に弾く
      .refine((value) => value >= '0001-01-01', '存在しない日付です'),
  )

export const facilityPcInputSchema = z
  .object({
    facilityName: optionalText,
    pcName: optionalText,
    // 資産管理用の Tag（自由入力）。重複の禁止は DB の制約で行う（大文字・小文字を区別しない）
    tag: optionalText,
    installedOn: optional(isoDate),
    osVersion: optionalText,
    officeType: optional(z.enum(OFFICE_TYPES, '選択肢から選んでください')),
    officeVersion: optional(z.enum(OFFICE_VERSIONS, '選択肢から選んでください')),
    licenseKey: optional(productKey),
    account: optionalText,
    password: optionalText,
    // アカウント登録日（手入力）。DB に登録した日時（created_at）とは別
    registeredOn: optional(isoDate),
    remarks: optional(z.string().trim().max(REMARKS_MAX_LENGTH, `${REMARKS_MAX_LENGTH}文字以内で入力してください`)),
  })
  // 中身が空の行を誤って登録しないよう、全項目が空欄のときだけ弾く
  .refine((input) => Object.values(input).some((value) => value !== null), 'いずれかの項目を入力してください')

export const listQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  sort: z.enum(SORT_KEYS).default('facilityName'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
})

export type FacilityPcInput = z.infer<typeof facilityPcInputSchema>
export type SortKey = (typeof SORT_KEYS)[number]
export type SortOrder = z.infer<typeof listQuerySchema>['order']
export type ListQuery = { q?: string; sort: SortKey; order: SortOrder; page: number }
export type FacilityPc = FacilityPcInput & { id: number }
export type FacilityPcPage = { items: FacilityPc[]; total: number; page: number; perPage: number }

// ---- Excel 取り込み ----
export const IMPORT_MAX_ROWS = 1000

// 各行の値はここでは形だけ確かめ、中身は行ごとに facilityPcInputSchema で検証する（1行の誤りでリクエスト全体を弾かないため）
export const importRequestSchema = z.object({
  rows: z
    .array(z.object({ rowNumber: z.number().int().min(1), values: z.record(z.string(), z.unknown()) }))
    .min(1, '取り込む行がありません')
    .max(IMPORT_MAX_ROWS, `一度に取り込めるのは${IMPORT_MAX_ROWS}行までです`),
})

export type ImportRow = z.infer<typeof importRequestSchema>['rows'][number]
// field が null のものは、特定の項目に属さない理由（ファイル内の重複など）
export type ImportIssue = { field: keyof FacilityPcInput | null; message: string }
export type ImportRowError = { rowNumber: number; issues: ImportIssue[] }
export type ImportResult = { created: number; updated: number; errors: ImportRowError[] }
