import type { NeonQueryFunction } from '@neondatabase/serverless'
import {
  PER_PAGE,
  type FacilityPc,
  type FacilityPcInput,
  type FacilityPcPage,
  type ListQuery,
} from '../../shared/facility-pc-schema'

export class DuplicateFacilityPcError extends Error {
  constructor() {
    super('同じ施設に同じPC名がすでに登録されています')
    this.name = 'DuplicateFacilityPcError'
  }
}

export type FacilityPcRepository = {
  list(query: ListQuery): Promise<FacilityPcPage>
  listAll(): Promise<FacilityPc[]>
  findById(id: number): Promise<FacilityPc | null>
  create(input: FacilityPcInput): Promise<FacilityPc>
  update(id: number, input: FacilityPcInput): Promise<FacilityPc | null>
  delete(id: number): Promise<boolean>
}

type Sql = NeonQueryFunction<false, false>

const UNIQUE_VIOLATION = '23505'

// 並び順は DB の既定の照合順序に任せず、文字コード順（COLLATE "C"）を明示する（設計 7-6）
// DATE 型はドライバが JS の Date に変換してタイムゾーンでずれるため、文字列で取り出す
const COLUMNS = `
  id,
  facility_name AS "facilityName",
  pc_name AS "pcName",
  to_char(installed_on, 'YYYY-MM-DD') AS "installedOn",
  os_version AS "osVersion",
  office_type AS "officeType",
  office_version AS "officeVersion",
  license_key AS "licenseKey",
  account,
  password,
  remarks
`

// LIKE の特殊文字（\ % _）を普通の文字として扱う
const toContainsPattern = (keyword: string) => `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION

const rethrowDuplicate = (error: unknown): never => {
  if (isUniqueViolation(error)) throw new DuplicateFacilityPcError()
  throw error
}

export const createFacilityPcRepository = (sql: Sql): FacilityPcRepository => ({
  async list({ q, order, page }) {
    const pattern = q === undefined ? null : toContainsPattern(q)
    const where = `WHERE ($1::text IS NULL OR facility_name ILIKE $1 ESCAPE '\\')`
    // ORDER BY の方向はプレースホルダにできないため、許可済みの2値からだけ組み立てる
    const direction = order === 'desc' ? 'DESC' : 'ASC'

    // RepeatableRead で2本の SELECT に同じ時点のデータを見せ、items と total の食い違いを防ぐ
    const [items, counts] = await sql.transaction(
      [
        sql.query(
          `SELECT ${COLUMNS} FROM facility_pcs ${where}
           ORDER BY facility_name COLLATE "C" ${direction}, pc_name COLLATE "C" ASC, id ASC
           LIMIT $2 OFFSET $3`,
          [pattern, PER_PAGE, (page - 1) * PER_PAGE],
        ),
        sql.query(`SELECT count(*)::int AS total FROM facility_pcs ${where}`, [pattern]),
      ],
      { isolationLevel: 'RepeatableRead', readOnly: true },
    )

    return { items: items as FacilityPc[], total: counts[0].total as number, page, perPage: PER_PAGE }
  },

  async listAll() {
    const rows = await sql.query(`SELECT ${COLUMNS} FROM facility_pcs ORDER BY facility_name COLLATE "C" ASC, pc_name COLLATE "C" ASC, id ASC`)
    return rows as FacilityPc[]
  },

  async findById(id) {
    const rows = await sql.query(`SELECT ${COLUMNS} FROM facility_pcs WHERE id = $1`, [id])
    return (rows[0] as FacilityPc | undefined) ?? null
  },

  async create(input) {
    const rows = await sql
      .query(
        `INSERT INTO facility_pcs
           (facility_name, pc_name, installed_on, os_version, office_type, office_version, license_key, account, password, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${COLUMNS}`,
        toParams(input),
      )
      .catch(rethrowDuplicate)
    return rows[0] as FacilityPc
  },

  async update(id, input) {
    const rows = await sql
      .query(
        `UPDATE facility_pcs SET
           facility_name = $1, pc_name = $2, installed_on = $3, os_version = $4, office_type = $5,
           office_version = $6, license_key = $7, account = $8, password = $9, remarks = $10,
           updated_at = now()
         WHERE id = $11
         RETURNING ${COLUMNS}`,
        [...toParams(input), id],
      )
      .catch(rethrowDuplicate)
    return (rows[0] as FacilityPc | undefined) ?? null
  },

  async delete(id) {
    const rows = await sql.query('DELETE FROM facility_pcs WHERE id = $1 RETURNING id', [id])
    return rows.length > 0
  },
})

const toParams = (input: FacilityPcInput) => [
  input.facilityName,
  input.pcName,
  input.installedOn,
  input.osVersion,
  input.officeType,
  input.officeVersion,
  input.licenseKey,
  input.account,
  input.password,
  input.remarks,
]
