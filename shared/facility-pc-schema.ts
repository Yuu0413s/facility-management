import { z } from 'zod'

export const OFFICE_TYPES = ['Personal', 'H&B', 'Pro', 'Access'] as const
export const OFFICE_VERSIONS = ['2010', '2013', '2016', '2019', '2021', '2024'] as const
export const REMARKS_MAX_LENGTH = 500
export const PER_PAGE = 50
// 並べ替えできる列。SQL の列名に対応づけるので、ここに無い値は受け付けない
export const SORT_KEYS = ['facilityName', 'pcName'] as const

const requiredText = z.string('入力してください').trim().min(1, '入力してください')

// 空欄 → 形式 → 実在する日付の順に確認し、最初に引っかかった理由だけを返す
const isoDate = z
  .string('入力してください')
  .trim()
  .min(1, '入力してください')
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy/mm/dd 形式で入力してください')
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`)
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
      }, '存在しない日付です')
      // PostgreSQL の DATE には 0 年が無いため、保存時に 500 にならないよう先に弾く
      .refine((value) => value >= '0001-01-01', '存在しない日付です'),
  )

export const facilityPcInputSchema = z.object({
  facilityName: requiredText,
  pcName: requiredText,
  installedOn: isoDate,
  osVersion: requiredText,
  officeType: z.enum(OFFICE_TYPES, '選択してください'),
  officeVersion: z.enum(OFFICE_VERSIONS, '選択してください'),
  licenseKey: requiredText,
  account: requiredText,
  password: requiredText,
  remarks: z
    .string()
    .trim()
    .max(REMARKS_MAX_LENGTH, `${REMARKS_MAX_LENGTH}文字以内で入力してください`)
    .nullish()
    .transform((value) => value || null),
})

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
