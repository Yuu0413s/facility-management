import type { FacilityPcInput } from '../../shared/facility-pc-schema'

// 一覧表・入力フォーム・Excel で同じ順番・同じ表記を使う
export const FACILITY_PC_LABELS = {
  facilityName: '施設名',
  pcName: 'PC名',
  installedOn: '設置日',
  osVersion: 'OSバージョン',
  officeType: 'Office種類',
  officeVersion: 'Officeバージョン',
  licenseKey: 'Key',
  account: 'アカウント',
  password: 'パスワード',
  remarks: '備考',
} as const satisfies Record<keyof FacilityPcInput, string>

export const FACILITY_PC_FIELDS = Object.keys(FACILITY_PC_LABELS) as Array<keyof FacilityPcInput>
