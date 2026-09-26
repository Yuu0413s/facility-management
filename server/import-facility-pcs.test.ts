import type { FacilityPcInput } from '../shared/facility-pc-schema'
import type { FacilityPcRepository } from './db/facility-pcs-repository'
import { importFacilityPcs } from './import-facility-pcs'

const setup = () => {
  const repository = {
    findTagIssues: vi.fn(async () => [] as Array<{ key: number; duplicateOfKey: number | null; existsInDb: boolean }>),
    upsertMany: vi.fn(async (inputs: FacilityPcInput[]) => ({ created: inputs.length, updated: 0 })),
  }
  return { repository, run: (rows: Array<{ rowNumber: number; values: Record<string, unknown> }>) => importFacilityPcs(repository as unknown as FacilityPcRepository, rows) }
}

describe('importFacilityPcs', () => {
  it('正しい行を入力のルールで整えてからまとめてアップサートし、件数を返す', async () => {
    const { repository, run } = setup()
    repository.upsertMany.mockResolvedValue({ created: 1, updated: 1 })
    const result = await run([
      { rowNumber: 2, values: { facilityName: ' 中央病院 ', pcName: 'PC-1', licenseKey: 'abcde-12345-fghij-67890-klmno' } },
      { rowNumber: 3, values: { facilityName: '東病院', pcName: 'PC-1' } },
    ])
    expect(result).toEqual({ created: 1, updated: 1, errors: [] })
    const [inputs] = repository.upsertMany.mock.calls[0]
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toMatchObject({ facilityName: '中央病院', licenseKey: 'ABCDE12345FGHIJ67890KLMNO', installedOn: null })
  })

  it('入力のルールに合わない行はエラーにし、項目ごとの理由を返す（正しい行は取り込む）', async () => {
    const { repository, run } = setup()
    const result = await run([
      { rowNumber: 2, values: { facilityName: 'A病院', licenseKey: '123', officeType: 'Home' } },
      { rowNumber: 3, values: { facilityName: 'B病院' } },
    ])
    expect(result.errors).toEqual([
      {
        rowNumber: 2,
        issues: [
          { field: 'officeType', message: '選択肢から選んでください' },
          { field: 'licenseKey', message: 'Key は英数字25桁で入力してください' },
        ],
      },
    ])
    expect(repository.upsertMany.mock.calls[0][0].map((input: FacilityPcInput) => input.facilityName)).toEqual(['B病院'])
  })

  it('ファイル内で同じ施設名＋PC名が複数行あれば、後から出てきた行をエラーにする', async () => {
    const { repository, run } = setup()
    const result = await run([
      { rowNumber: 2, values: { facilityName: 'A病院', pcName: 'PC-1' } },
      { rowNumber: 5, values: { facilityName: 'A病院', pcName: 'PC-1', remarks: '2回目' } },
      { rowNumber: 6, values: { facilityName: 'A病院', pcName: null } },
      { rowNumber: 7, values: { facilityName: 'A病院', pcName: null } },
    ])
    expect(result.errors).toEqual([{ rowNumber: 5, issues: [{ field: null, message: '2行目と施設名・PC名が重複しています' }] }])
    expect(repository.upsertMany.mock.calls[0][0]).toHaveLength(3)
  })

  it('Tag の重複（ファイル内・DB）は DB の判定結果を使い、ファイル内なら先の行番号を、DB なら登録済みであることを伝える', async () => {
    const { repository, run } = setup()
    // key は配列の位置。2つ目（5行目）が1つ目（2行目）と重複、3つ目（9行目）が DB と重複
    repository.findTagIssues.mockResolvedValue([
      { key: 1, duplicateOfKey: 0, existsInDb: false },
      { key: 2, duplicateOfKey: null, existsInDb: true },
    ])
    const result = await run([
      { rowNumber: 2, values: { facilityName: 'A病院', tag: 'TAG-1' } },
      { rowNumber: 5, values: { facilityName: 'B病院', tag: 'tag-1' } },
      { rowNumber: 9, values: { facilityName: 'C病院', tag: 'TAG-2' } },
      { rowNumber: 10, values: { facilityName: 'D病院', tag: 'TAG-3' } },
    ])
    expect(result.errors).toEqual([
      { rowNumber: 5, issues: [{ field: 'tag', message: '2行目とTagが重複しています' }] },
      { rowNumber: 9, issues: [{ field: 'tag', message: '同じTagがすでに登録されています' }] },
    ])
    expect(repository.upsertMany.mock.calls[0][0].map((input: FacilityPcInput) => input.facilityName)).toEqual(['A病院', 'D病院'])
  })

  it('findTagIssues には、施設名＋PC名の重複を取り除いた後の行を、配列の位置をキーにして渡す', async () => {
    const { repository, run } = setup()
    await run([
      { rowNumber: 2, values: { facilityName: 'A病院', pcName: 'PC-1', tag: 'T' } },
      { rowNumber: 3, values: { facilityName: 'A病院', pcName: 'PC-1', tag: 'U' } },
      { rowNumber: 4, values: { facilityName: 'B病院', tag: 'V' } },
    ])
    const [rows] = repository.findTagIssues.mock.calls[0] as unknown as [Array<{ key: number; input: FacilityPcInput }>]
    expect(rows.map(({ key, input }) => [key, input.tag])).toEqual([
      [0, 'T'],
      [1, 'V'],
    ])
  })

  it('取り込める行が無ければ DB に書き込まない', async () => {
    const { repository, run } = setup()
    const result = await run([{ rowNumber: 2, values: { officeType: 'Home' } }])
    expect(result.created).toBe(0)
    expect(repository.upsertMany).not.toHaveBeenCalled()
  })
})
