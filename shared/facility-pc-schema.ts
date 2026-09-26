import { z } from 'zod'

export const OFFICE_TYPES = ['Personal', 'H&B', 'Pro', 'Access'] as const
export const OFFICE_VERSIONS = ['2010', '2013', '2016', '2019', '2021', '2024'] as const
export const REMARKS_MAX_LENGTH = 500
export const PER_PAGE = 50

const requiredText = z.string().trim().min(1, '入力してください')

// 形式だけでなく、2026-02-30 のような存在しない日付も弾く
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy/mm/dd 形式で入力してください')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, '存在しない日付です')

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
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
})

export type FacilityPcInput = z.infer<typeof facilityPcInputSchema>
export type ListQuery = z.infer<typeof listQuerySchema>
export type SortOrder = ListQuery['order']
export type FacilityPc = FacilityPcInput & { id: number }
export type FacilityPcPage = { items: FacilityPc[]; total: number; page: number; perPage: number }
