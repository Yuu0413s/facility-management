import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import type { FacilityPcInput } from '../../shared/facility-pc-schema'
import { createFacilityPcRepository, DuplicateFacilityPcError, DuplicateTagError } from './facility-pcs-repository'

// 必ず .env.test（Neon のテスト用ブランチ）を読む。本番の .env は読まない
config({ path: '.env.test', quiet: true })
const databaseUrl = process.env.DATABASE_URL

const baseInput: FacilityPcInput = {
  facilityName: '中央病院',
  pcName: 'PC-001',
  tag: null,
  installedOn: '2026-09-26',
  osVersion: 'Windows 11',
  officeType: 'Pro',
  officeVersion: '2021',
  licenseKey: 'KEY-1',
  account: 'user1',
  password: 'secret',
  registeredOn: '2026-04-01',
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

    it('アカウント登録日は入力した日付を保存し、DB に登録した日時（created_at）とは関係ない', async () => {
      const created = await repository.create({ ...baseInput, registeredOn: '2020-01-15' })
      expect(created.registeredOn).toBe('2020-01-15')
      expect((await repository.listAll())[0].registeredOn).toBe('2020-01-15')
      const [row] = await sql`SELECT created_at > now() - interval '1 hour' AS recent FROM facility_pcs WHERE id = ${created.id}`
      expect(row.recent).toBe(true)
    })

    it('同じ施設に同じPC名は登録できない', async () => {
      await repository.create(baseInput)
      await expect(repository.create(baseInput)).rejects.toBeInstanceOf(DuplicateFacilityPcError)
    })

    it('Tag は大文字・小文字を区別せずに重複を禁止し、PC名の重複とは別のエラーにする', async () => {
      await repository.create({ ...baseInput, tag: 'TAG-0001' })
      const error = await repository.create({ ...baseInput, pcName: 'PC-002', tag: 'tag-0001' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(DuplicateTagError)
      expect((error as Error).message).toBe('同じTagがすでに登録されています')

      const pcError = await repository.create({ ...baseInput, tag: 'TAG-0002' }).catch((e: unknown) => e)
      expect(pcError).toBeInstanceOf(DuplicateFacilityPcError)
      expect((pcError as Error).message).toBe('同じ施設に同じPC名がすでに登録されています')
    })

    it('Tag が空欄の行はいくつでも登録できる', async () => {
      await repository.create({ ...baseInput, tag: null })
      await expect(repository.create({ ...baseInput, pcName: 'PC-002', tag: null })).resolves.toBeDefined()
    })

    it('Tag を保存・取得できる', async () => {
      const created = await repository.create({ ...baseInput, tag: 'TAG-0001' })
      expect((await repository.findById(created.id))?.tag).toBe('TAG-0001')
    })

    it('別の施設なら同じPC名を登録できる', async () => {
      await repository.create(baseInput)
      await expect(repository.create({ ...baseInput, facilityName: '東病院' })).resolves.toBeDefined()
    })
  })

  describe('空欄（NULL）の扱い', () => {
    const onlyNames = (facilityName: string | null, pcName: string | null): FacilityPcInput => ({
      facilityName,
      pcName,
      tag: null,
      installedOn: null,
      osVersion: null,
      officeType: null,
      officeVersion: null,
      licenseKey: null,
      account: null,
      password: null,
      registeredOn: null,
      remarks: null,
    })

    it('空欄の項目は null のまま保存・取得できる', async () => {
      const created = await repository.create(onlyNames('中央病院', 'PC-001'))
      expect(await repository.findById(created.id)).toEqual({ ...onlyNames('中央病院', 'PC-001'), id: created.id })
    })

    it('施設名かPC名が空欄の行は、重複チェックの対象外になる', async () => {
      await repository.create(onlyNames('中央病院', null))
      await expect(repository.create(onlyNames('中央病院', null))).resolves.toBeDefined()
      await repository.create(onlyNames(null, 'PC-001'))
      await expect(repository.create(onlyNames(null, 'PC-001'))).resolves.toBeDefined()
    })

    it.each(['asc', 'desc'] as const)('施設名で並べ替えると、施設名が空欄の行は %s でも最後', async (order) => {
      await repository.create(onlyNames(null, 'PC-0'))
      await repository.create(onlyNames('B病院', 'PC-1'))
      await repository.create(onlyNames('A病院', 'PC-2'))
      const result = await repository.list({ sort: 'facilityName', order, page: 1 })
      expect(result.items.map((item) => item.facilityName).at(-1)).toBeNull()
    })

    it.each(['asc', 'desc'] as const)('PC名で並べ替えると、PC名が空欄の行は %s でも最後', async (order) => {
      await repository.create(onlyNames('A病院', null))
      await repository.create(onlyNames('B病院', 'PC-1'))
      await repository.create(onlyNames('C病院', 'PC-2'))
      const result = await repository.list({ sort: 'pcName', order, page: 1 })
      expect(result.items.map((item) => item.pcName).at(-1)).toBeNull()
    })

    it('同じ施設の中では、PC名が空欄の行が最後', async () => {
      await repository.create(onlyNames('A病院', null))
      await repository.create(onlyNames('A病院', 'PC-1'))
      const result = await repository.list({ sort: 'facilityName', order: 'asc', page: 1 })
      expect(result.items.map((item) => item.pcName)).toEqual(['PC-1', null])
    })
  })

  describe('取り込み（upsertMany / findTagConflicts）', () => {
    it('施設名＋PC名が一致すれば上書き、なければ追加し、件数を返す（1本の SQL）', async () => {
      const existing = await repository.create({ ...baseInput, facilityName: 'A病院', pcName: 'PC-1', remarks: '古い' })
      const result = await repository.upsertMany([
        { ...baseInput, facilityName: 'A病院', pcName: 'PC-1', remarks: '新しい', tag: 'TAG-1' },
        { ...baseInput, facilityName: 'B病院', pcName: 'PC-1' },
        { ...baseInput, facilityName: 'C病院', pcName: null },
      ])
      expect(result).toEqual({ created: 2, updated: 1 })

      const updated = await repository.findById(existing.id)
      expect(updated).toMatchObject({ remarks: '新しい', tag: 'TAG-1', installedOn: '2026-09-26', registeredOn: '2026-04-01' })
      expect(await repository.listAll()).toHaveLength(3)
    })

    it('上書きするとき、取り込む側が空欄の項目は既存の値を残す（値の入っている項目だけ上書きする）', async () => {
      const existing = await repository.create({ ...baseInput, facilityName: 'A病院', pcName: 'PC-1', licenseKey: 'KEY-OLD', tag: 'TAG-OLD' })
      await repository.upsertMany([
        {
          facilityName: 'A病院',
          pcName: 'PC-1',
          tag: null,
          installedOn: null,
          osVersion: 'Windows 12',
          officeType: null,
          officeVersion: null,
          licenseKey: null,
          account: null,
          password: null,
          registeredOn: null,
          remarks: null,
        },
      ])
      const { id: _, ...kept } = (await repository.findById(existing.id))!
      const { id: __, ...before } = existing
      expect(kept).toEqual({ ...before, osVersion: 'Windows 12' })
    })

    it('Excel に無い既存の行はそのまま残す', async () => {
      await repository.create({ ...baseInput, facilityName: 'Z病院' })
      await repository.upsertMany([{ ...baseInput, facilityName: 'A病院' }])
      expect((await repository.listAll()).map((item) => item.facilityName)).toEqual(['A病院', 'Z病院'])
    })

    it('施設名かPC名が空欄の行は照合できないので、常に追加する', async () => {
      await repository.upsertMany([{ ...baseInput, facilityName: 'A病院', pcName: null }])
      const result = await repository.upsertMany([{ ...baseInput, facilityName: 'A病院', pcName: null }])
      expect(result).toEqual({ created: 1, updated: 0 })
    })

    it('Tag が DB の「別の」データと重複する行の行番号を返す（同じ施設名＋PC名の行を上書きする場合は重複とみなさない）', async () => {
      await repository.create({ ...baseInput, facilityName: 'A病院', pcName: 'PC-1', tag: 'TAG-1' })
      const conflicts = await repository.findTagConflicts([
        { rowNumber: 2, input: { ...baseInput, facilityName: 'A病院', pcName: 'PC-1', tag: 'tag-1' } },
        { rowNumber: 3, input: { ...baseInput, facilityName: 'B病院', pcName: 'PC-1', tag: 'TAG-1' } },
        { rowNumber: 4, input: { ...baseInput, facilityName: 'A病院', pcName: null, tag: 'TAG-1' } },
        { rowNumber: 5, input: { ...baseInput, facilityName: 'C病院', pcName: 'PC-1', tag: 'TAG-9' } },
        { rowNumber: 6, input: { ...baseInput, facilityName: 'D病院', pcName: 'PC-1', tag: null } },
      ])
      expect(conflicts).toEqual([3, 4])
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
      const result = await repository.list({ sort: 'facilityName', order: 'asc', page: 1 })
      expect(names(result.items)).toEqual(['A病院/PC-9', 'B病院/PC-1', 'B病院/PC-2'])
      expect(result).toMatchObject({ total: 3, page: 1, perPage: 50 })
    })

    it('降順では施設名を逆順にし、PC名は昇順のまま', async () => {
      await seed([['B病院', 'PC-2'], ['A病院', 'PC-9'], ['B病院', 'PC-1']])
      const result = await repository.list({ sort: 'facilityName', order: 'desc', page: 1 })
      expect(names(result.items)).toEqual(['B病院/PC-1', 'B病院/PC-2', 'A病院/PC-9'])
    })

    it('並び順は DB の設定によらず文字コード順（大文字が小文字より先）', async () => {
      await seed([['a病院', 'PC-1'], ['B病院', 'PC-1']])
      const result = await repository.list({ sort: 'facilityName', order: 'asc', page: 1 })
      expect(names(result.items)).toEqual(['B病院/PC-1', 'a病院/PC-1'])
    })

    it('PC名で並べ替えると、PC名の昇順・同じPC名は施設名の昇順', async () => {
      await seed([['C病院', 'PC-2'], ['A病院', 'PC-9'], ['B病院', 'PC-2']])
      const result = await repository.list({ sort: 'pcName', order: 'asc', page: 1 })
      expect(names(result.items)).toEqual(['B病院/PC-2', 'C病院/PC-2', 'A病院/PC-9'])
    })

    it('PC名の降順では、同じPC名の中は施設名の昇順のまま', async () => {
      await seed([['C病院', 'PC-2'], ['A病院', 'PC-9'], ['B病院', 'PC-2']])
      const result = await repository.list({ sort: 'pcName', order: 'desc', page: 1 })
      expect(names(result.items)).toEqual(['A病院/PC-9', 'B病院/PC-2', 'C病院/PC-2'])
    })

    describe('設置日・アカウント登録日での並べ替え', () => {
      const withDates = (facilityName: string, installedOn: string | null, registeredOn: string | null) =>
        repository.create({ ...baseInput, facilityName, pcName: 'PC-1', installedOn, registeredOn })

      beforeEach(async () => {
        await withDates('C病院', '2026-03-01', '2024-05-01')
        await withDates('A病院', null, null)
        await withDates('B病院', '2026-03-01', '2024-05-01')
        await withDates('D病院', '2025-01-01', '2023-01-01')
      })

      it('設置日の昇順。同じ日付は施設名の昇順、空欄は最後', async () => {
        const result = await repository.list({ sort: 'installedOn', order: 'asc', page: 1 })
        expect(result.items.map((item) => item.facilityName)).toEqual(['D病院', 'B病院', 'C病院', 'A病院'])
      })

      it('設置日の降順でも、同じ日付は施設名の昇順、空欄は最後', async () => {
        const result = await repository.list({ sort: 'installedOn', order: 'desc', page: 1 })
        expect(result.items.map((item) => item.facilityName)).toEqual(['B病院', 'C病院', 'D病院', 'A病院'])
      })

      it('アカウント登録日も、同じ日付は施設名の昇順、空欄は昇順・降順とも最後', async () => {
        const asc = await repository.list({ sort: 'registeredOn', order: 'asc', page: 1 })
        expect(asc.items.map((item) => item.facilityName)).toEqual(['D病院', 'B病院', 'C病院', 'A病院'])
        const desc = await repository.list({ sort: 'registeredOn', order: 'desc', page: 1 })
        expect(desc.items.map((item) => item.facilityName)).toEqual(['B病院', 'C病院', 'D病院', 'A病院'])
      })
    })

    it('施設名の部分一致で絞り込み、total も絞り込み後の件数になる', async () => {
      await seed([['中央病院', 'PC-1'], ['中央クリニック', 'PC-1'], ['東病院', 'PC-1']])
      const result = await repository.list({ q: '中央', sort: 'facilityName', order: 'asc', page: 1 })
      expect(names(result.items)).toEqual(['中央クリニック/PC-1', '中央病院/PC-1'])
      expect(result.total).toBe(2)
    })

    it('検索語は施設名か Tag のどちらかに含まれていれば見つかる', async () => {
      await repository.create({ ...baseInput, facilityName: '中央病院', pcName: 'PC-1', tag: 'ZZ-1' })
      await repository.create({ ...baseInput, facilityName: '東病院', pcName: 'PC-1', tag: '中央-99' })
      await repository.create({ ...baseInput, facilityName: '西病院', pcName: 'PC-1', tag: null })
      const result = await repository.list({ q: '中央', sort: 'facilityName', order: 'asc', page: 1 })
      expect(names(result.items)).toEqual(['中央病院/PC-1', '東病院/PC-1'])
      expect(result.total).toBe(2)
    })

    it.each(['asc', 'desc'] as const)('Tag で並べ替えると、空欄は %s でも最後', async (order) => {
      await repository.create({ ...baseInput, facilityName: 'A病院', tag: null })
      await repository.create({ ...baseInput, facilityName: 'B病院', tag: 'T-2' })
      await repository.create({ ...baseInput, facilityName: 'C病院', tag: 'T-1' })
      const result = await repository.list({ sort: 'tag', order, page: 1 })
      expect(result.items.map((item) => item.tag)).toEqual(order === 'asc' ? ['T-1', 'T-2', null] : ['T-2', 'T-1', null])
    })

    it('検索語の % と _ は普通の文字として扱う', async () => {
      await seed([['100%病院', 'PC-1'], ['1000病院', 'PC-1'], ['A_B病院', 'PC-1'], ['AXB病院', 'PC-1']])
      expect(names((await repository.list({ q: '%', sort: 'facilityName', order: 'asc', page: 1 })).items)).toEqual(['100%病院/PC-1'])
      expect(names((await repository.list({ q: '_', sort: 'facilityName', order: 'asc', page: 1 })).items)).toEqual(['A_B病院/PC-1'])
    })

    it('50件ごとに分割し、範囲外のページは空で total は保持する', async () => {
      await sql`
        INSERT INTO facility_pcs (facility_name, pc_name, installed_on, os_version, office_type, office_version, license_key, account, password)
        SELECT '病院', 'PC-' || lpad(n::text, 3, '0'), '2026-01-01', 'Win', 'Pro', '2021', 'K', 'a', 'p'
        FROM generate_series(1, 51) AS n
      `
      const page1 = await repository.list({ sort: 'facilityName', order: 'asc', page: 1 })
      const page2 = await repository.list({ sort: 'facilityName', order: 'asc', page: 2 })
      const page3 = await repository.list({ sort: 'facilityName', order: 'asc', page: 3 })
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
