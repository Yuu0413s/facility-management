import type { NeonQueryFunction } from '@neondatabase/serverless'
import {
  PER_PAGE,
  type FacilityPc,
  type FacilityPcInput,
  type FacilityPcPage,
  type ListQuery,
  type SortKey,
} from '../../shared/facility-pc-schema'

// 重複エラーの共通の親。API はこれを 409 にする
export class DuplicateError extends Error {}

export class DuplicateFacilityPcError extends DuplicateError {
  constructor() {
    super('同じ施設に同じPC名がすでに登録されています')
    this.name = 'DuplicateFacilityPcError'
  }
}

export class DuplicateTagError extends DuplicateError {
  constructor() {
    super('同じTagがすでに登録されています')
    this.name = 'DuplicateTagError'
  }
}

export type FacilityPcRepository = {
  list(query: ListQuery): Promise<FacilityPcPage>
  listAll(): Promise<FacilityPc[]>
  findById(id: number): Promise<FacilityPc | null>
  create(input: FacilityPcInput): Promise<FacilityPc>
  update(id: number, input: FacilityPcInput): Promise<FacilityPc | null>
  delete(id: number): Promise<boolean>
  // 取り込み用。DB の「別の」データと Tag が重複する行の行番号を返す
  findTagConflicts(rows: Array<{ rowNumber: number; input: FacilityPcInput }>): Promise<number[]>
  // 取り込み用。施設名＋PC名が一致すれば上書き、なければ追加する（1本の SQL）
  upsertMany(inputs: FacilityPcInput[]): Promise<{ created: number; updated: number }>
}

type Sql = NeonQueryFunction<false, false>

const UNIQUE_VIOLATION = '23505'

// 並び順は DB の既定の照合順序に任せず、文字コード順（COLLATE "C"）を明示する（設計 7-6）
// DATE 型はドライバが JS の Date に変換してタイムゾーンでずれるため、文字列で取り出す
const COLUMNS = `
  id,
  facility_name AS "facilityName",
  pc_name AS "pcName",
  tag,
  to_char(installed_on, 'YYYY-MM-DD') AS "installedOn",
  os_version AS "osVersion",
  office_type AS "officeType",
  office_version AS "officeVersion",
  license_key AS "licenseKey",
  account,
  password,
  to_char(registered_on, 'YYYY-MM-DD') AS "registeredOn",
  remarks
`

// 並べ替えの列はプレースホルダにできないため、許可済みの対応表からだけ組み立てる。
// primary: 並べ替える列の式。文字列の列だけ COLLATE "C"（文字コード順）を付ける（DATE・TIMESTAMPTZ には付けられない）
// ties: 同じ値が並んだときの順番（常に昇順）
// 空欄（NULL）は昇順・降順どちらでも最後に並べる（PostgreSQL の既定では降順で先頭になるため NULLS LAST を明示）
const BY_FACILITY_NAME = 'facility_name COLLATE "C" ASC NULLS LAST'
const BY_PC_NAME = 'pc_name COLLATE "C" ASC NULLS LAST'
const SORT_ORDERS: Record<SortKey, { primary: string; ties: string }> = {
  facilityName: { primary: 'facility_name COLLATE "C"', ties: BY_PC_NAME },
  pcName: { primary: 'pc_name COLLATE "C"', ties: BY_FACILITY_NAME },
  tag: { primary: 'tag COLLATE "C"', ties: `${BY_FACILITY_NAME}, ${BY_PC_NAME}` },
  installedOn: { primary: 'installed_on', ties: `${BY_FACILITY_NAME}, ${BY_PC_NAME}` },
  registeredOn: { primary: 'registered_on', ties: `${BY_FACILITY_NAME}, ${BY_PC_NAME}` },
}

// 登録・更新・取り込みで書き込む列と、入力の項目名の対応表。
// SQL のプレースホルダの番号や列の並びは、ここから組み立てる（手で番号を振って、ずれるのを防ぐ）
const WRITABLE_COLUMNS: Array<[column: string, field: keyof FacilityPcInput]> = [
  ['facility_name', 'facilityName'],
  ['pc_name', 'pcName'],
  ['tag', 'tag'],
  ['installed_on', 'installedOn'],
  ['os_version', 'osVersion'],
  ['office_type', 'officeType'],
  ['office_version', 'officeVersion'],
  ['license_key', 'licenseKey'],
  ['account', 'account'],
  ['password', 'password'],
  ['registered_on', 'registeredOn'],
  ['remarks', 'remarks'],
]
const WRITABLE_COLUMN_NAMES = WRITABLE_COLUMNS.map(([column]) => column).join(', ')

// json_to_recordset で JSON を表として読むときの列の型
const COLUMN_TYPES: Record<string, string> = { installed_on: 'date', registered_on: 'date' }
const RECORDSET_DEFINITION = WRITABLE_COLUMNS.map(([column]) => `${column} ${COLUMN_TYPES[column] ?? 'text'}`).join(', ')

// 入力を「列名 → 値」の JSON にする（json_to_recordset で列名どおりに読むため）
const toRecord = (input: FacilityPcInput) => Object.fromEntries(WRITABLE_COLUMNS.map(([column, field]) => [column, input[field]]))

// LIKE の特殊文字（\ % _）を普通の文字として扱う
const toContainsPattern = (keyword: string) => `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

// 重複エラー（23505）は、違反した制約の名前で原因を見分ける（db/migrations/003_add_tag.sql）
const TAG_UNIQUE_INDEX = 'facility_pcs_tag_lower_key'

const isUniqueViolation = (error: unknown): error is { code: string; constraint?: string } =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION

const rethrowDuplicate = (error: unknown): never => {
  if (isUniqueViolation(error)) {
    throw error.constraint === TAG_UNIQUE_INDEX ? new DuplicateTagError() : new DuplicateFacilityPcError()
  }
  throw error
}

export const createFacilityPcRepository = (sql: Sql): FacilityPcRepository => ({
  async list({ q, sort, order, page }) {
    const pattern = q === undefined ? null : toContainsPattern(q)
    // 検索語は施設名か Tag のどちらかに含まれていれば見つかる
    const where = `WHERE ($1::text IS NULL OR facility_name ILIKE $1 ESCAPE '\\' OR tag ILIKE $1 ESCAPE '\\')`
    // ORDER BY の方向はプレースホルダにできないため、許可済みの2値からだけ組み立てる
    const direction = order === 'desc' ? 'DESC' : 'ASC'
    const { primary, ties } = SORT_ORDERS[sort]

    // RepeatableRead で2本の SELECT に同じ時点のデータを見せ、items と total の食い違いを防ぐ
    const [items, counts] = await sql.transaction(
      [
        sql.query(
          `SELECT ${COLUMNS} FROM facility_pcs ${where}
           ORDER BY ${primary} ${direction} NULLS LAST, ${ties}, id ASC
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
    const rows = await sql.query(`SELECT ${COLUMNS} FROM facility_pcs ORDER BY ${BY_FACILITY_NAME}, ${BY_PC_NAME}, id ASC`)
    return rows as FacilityPc[]
  },

  async findById(id) {
    const rows = await sql.query(`SELECT ${COLUMNS} FROM facility_pcs WHERE id = $1`, [id])
    return (rows[0] as FacilityPc | undefined) ?? null
  },

  async create(input) {
    const rows = await sql
      .query(
        `INSERT INTO facility_pcs (${WRITABLE_COLUMN_NAMES})
         VALUES (${WRITABLE_COLUMNS.map((_, index) => `$${index + 1}`).join(', ')})
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
           ${WRITABLE_COLUMNS.map(([column], index) => `${column} = $${index + 1}`).join(', ')},
           updated_at = now()
         WHERE id = $${WRITABLE_COLUMNS.length + 1}
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

  async findTagConflicts(rows) {
    const withTag = rows.filter(({ input }) => input.tag !== null)
    if (withTag.length === 0) return []
    // 施設名とPC名がそろっていて同じ行を上書きする場合は、自分自身の Tag なので重複とみなさない
    const conflicts = await sql.query(
      `SELECT DISTINCT r.row_number AS "rowNumber"
       FROM json_to_recordset($1::json) AS r(row_number int, facility_name text, pc_name text, tag text)
       JOIN facility_pcs e ON lower(e.tag) = lower(r.tag)
       WHERE NOT (r.facility_name IS NOT NULL AND r.pc_name IS NOT NULL
                  AND e.facility_name = r.facility_name AND e.pc_name = r.pc_name)
       ORDER BY 1`,
      [
        JSON.stringify(
          withTag.map(({ rowNumber, input }) => ({
            row_number: rowNumber,
            facility_name: input.facilityName,
            pc_name: input.pcName,
            tag: input.tag,
          })),
        ),
      ],
    )
    return conflicts.map((row) => row.rowNumber as number)
  },

  async upsertMany(inputs) {
    if (inputs.length === 0) return { created: 0, updated: 0 }
    // Cloudflare では1リクエストで出せる外部通信の回数に上限があるため、全行を1本の SQL で書き込む。
    // xmax = 0 は「この文で新しく挿入された行」を表す（更新された行は 0 以外になる）
    const rows = await sql
      .query(
        `INSERT INTO facility_pcs (${WRITABLE_COLUMN_NAMES})
         SELECT ${WRITABLE_COLUMN_NAMES} FROM json_to_recordset($1::json) AS r(${RECORDSET_DEFINITION})
         ON CONFLICT (facility_name, pc_name) DO UPDATE SET
           ${WRITABLE_COLUMNS.map(([column]) => `${column} = EXCLUDED.${column}`).join(', ')},
           updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [JSON.stringify(inputs.map(toRecord))],
      )
      .catch(rethrowDuplicate)
    const created = rows.filter((row) => row.inserted).length
    return { created, updated: rows.length - created }
  },
})

const toParams = (input: FacilityPcInput) => WRITABLE_COLUMNS.map(([, field]) => input[field])
