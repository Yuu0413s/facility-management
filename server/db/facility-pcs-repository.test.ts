import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import type { FacilityPcInput } from '../../shared/facility-pc-schema'
import { createFacilityPcRepository, DuplicateFacilityPcError } from './facility-pcs-repository'

// 必ず .env.test（Neon のテスト用ブランチ）を読む。本番の .env は読まない
config({ path: '.env.test', quiet: true })
const databaseUrl = process.env.DATABASE_URL

const baseInput: FacilityPcInput = {
  facilityName: '中央病院',
  pcName: 'PC-001',
  installedOn: '2026-09-26',
  osVersion: 'Windows 11',
  officeType: 'Pro',
  officeVersion: '2021',
  licenseKey: 'KEY-1',
  account: 'user1',
  password: 'secret',
  remarks: null,
}

describe.skipIf(!databaseUrl)('facilityPcRepository（Neon テスト用ブランチ）', () => {
  const sql = neon(databaseUrl!)
  const repository = createFacilityPcRepository(sql)

  const seed = async (rows: Array<[string, string]>) => {
    for (const [facilityName, pcName] of rows) {
      await repository.create({ ...baseInput, facilityName, pcName })
    }
  }

  beforeEach(async () => {
    await sql`DELETE FROM facility_pcs`
  })

  describe('create / findById', () => {
    it('登録した行を id 付きで返し、id で取得できる', async () => {
      const created = await repository.create({ ...baseInput, remarks: '1行目\n2行目' })
      expect(created).toEqual({ ...baseInput, remarks: '1行目\n2行目', id: expect.any(Number) })
      expect(await repository.findById(created.id)).toEqual(created)
    })

    it('存在しない id は null', async () => {
      expect(await repository.findById(999999)).toBeNull()
    })

    it('同じ施設に同じPC名は登録できない', async () => {
      await repository.create(baseInput)
      await expect(repository.create(baseInput)).rejects.toBeInstanceOf(DuplicateFacilityPcError)
    })

    it('別の施設なら同じPC名を登録できる', async () => {
      await repository.create(baseInput)
      await expect(repository.create({ ...baseInput, facilityName: '東病院' })).resolves.toBeDefined()
    })
  })

  describe('update', () => {
    it('内容を更新し、updated_at を進める', async () => {
      const created = await repository.create(baseInput)
      const updated = await repository.update(created.id, { ...baseInput, osVersion: 'Windows 11 24H2', remarks: 'メモ' })
      expect(updated).toEqual({ ...baseInput, id: created.id, osVersion: 'Windows 11 24H2', remarks: 'メモ' })

      const [row] = await sql`SELECT updated_at > created_at AS advanced FROM facility_pcs WHERE id = ${created.id}`
      expect(row.advanced).toBe(true)
    })

    it('存在しない id は null', async () => {
      expect(await repository.update(999999, baseInput)).toBeNull()
    })

    it('既存の組み合わせと重複する更新は弾く', async () => {
      await repository.create(baseInput)
      const other = await repository.create({ ...baseInput, pcName: 'PC-002' })
      await expect(repository.update(other.id, baseInput)).rejects.toBeInstanceOf(DuplicateFacilityPcError)
    })
  })

  describe('delete', () => {
    it('削除できたら true、存在しなければ false', async () => {
      const created = await repository.create(baseInput)
      expect(await repository.delete(created.id)).toBe(true)
      expect(await repository.findById(created.id)).toBeNull()
      expect(await repository.delete(created.id)).toBe(false)
    })
  })

  describe('list', () => {
    const names = (items: FacilityPcInput[]) => items.map((item) => `${item.facilityName}/${item.pcName}`)

    it('施設名の昇順・同じ施設名はPC名の昇順で並べる', async () => {
      await seed([['B病院', 'PC-2'], ['A病院', 'PC-9'], ['B病院', 'PC-1']])
      const result = await repository.list({ order: 'asc', page: 1 })
      expect(names(result.items)).toEqual(['A病院/PC-9', 'B病院/PC-1', 'B病院/PC-2'])
      expect(result).toMatchObject({ total: 3, page: 1, perPage: 50 })
    })

    it('降順では施設名を逆順にし、PC名は昇順のまま', async () => {
      await seed([['B病院', 'PC-2'], ['A病院', 'PC-9'], ['B病院', 'PC-1']])
      const result = await repository.list({ order: 'desc', page: 1 })
      expect(names(result.items)).toEqual(['B病院/PC-1', 'B病院/PC-2', 'A病院/PC-9'])
    })

    it('並び順は DB の設定によらず文字コード順（大文字が小文字より先）', async () => {
      await seed([['a病院', 'PC-1'], ['B病院', 'PC-1']])
      const result = await repository.list({ order: 'asc', page: 1 })
      expect(names(result.items)).toEqual(['B病院/PC-1', 'a病院/PC-1'])
    })

    it('施設名の部分一致で絞り込み、total も絞り込み後の件数になる', async () => {
      await seed([['中央病院', 'PC-1'], ['中央クリニック', 'PC-1'], ['東病院', 'PC-1']])
      const result = await repository.list({ q: '中央', order: 'asc', page: 1 })
      expect(names(result.items)).toEqual(['中央クリニック/PC-1', '中央病院/PC-1'])
      expect(result.total).toBe(2)
    })

    it('検索語の % と _ は普通の文字として扱う', async () => {
      await seed([['100%病院', 'PC-1'], ['1000病院', 'PC-1'], ['A_B病院', 'PC-1'], ['AXB病院', 'PC-1']])
      expect(names((await repository.list({ q: '%', order: 'asc', page: 1 })).items)).toEqual(['100%病院/PC-1'])
      expect(names((await repository.list({ q: '_', order: 'asc', page: 1 })).items)).toEqual(['A_B病院/PC-1'])
    })

    it('50件ごとに分割し、範囲外のページは空で total は保持する', async () => {
      await sql`
        INSERT INTO facility_pcs (facility_name, pc_name, installed_on, os_version, office_type, office_version, license_key, account, password)
        SELECT '病院', 'PC-' || lpad(n::text, 3, '0'), '2026-01-01', 'Win', 'Pro', '2021', 'K', 'a', 'p'
        FROM generate_series(1, 51) AS n
      `
      const page1 = await repository.list({ order: 'asc', page: 1 })
      const page2 = await repository.list({ order: 'asc', page: 2 })
      const page3 = await repository.list({ order: 'asc', page: 3 })
      expect(page1.items).toHaveLength(50)
      expect(page2.items.map((item) => item.pcName)).toEqual(['PC-051'])
      expect(page3.items).toEqual([])
      expect([page1.total, page2.total, page3.total]).toEqual([51, 51, 51])
    })
  })

  describe('listAll', () => {
    it('全件を施設名の昇順で返す', async () => {
      await seed([['B病院', 'PC-1'], ['A病院', 'PC-1']])
      expect((await repository.listAll()).map((item) => item.facilityName)).toEqual(['A病院', 'B病院'])
    })
  })
})
