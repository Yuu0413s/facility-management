import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import {
  DATE_INPUT_FORMAT_MESSAGE,
  OFFICE_TYPES,
  OFFICE_VERSIONS,
  REMARKS_MAX_LENGTH,
  facilityPcInputSchema,
  type FacilityPc,
  type FacilityPcInput,
} from '../../shared/facility-pc-schema'
import { ApiError, createFacilityPc, fetchFacilityPc, updateFacilityPc, type FieldErrors } from '../api/facility-pcs-client'
import { isDateInputFormat, toInputDate, toIsoDate } from '../lib/date'
import { FACILITY_PC_LABELS as LABELS } from '../lib/facility-pc-labels'

type Field = keyof FacilityPcInput
type FormValues = Record<Field, string>

const EMPTY_VALUES: FormValues = {
  facilityName: '',
  pcName: '',
  installedOn: '',
  osVersion: '',
  officeType: '',
  officeVersion: '',
  licenseKey: '',
  account: '',
  password: '',
  remarks: '',
}

// 空欄（null）の項目は、空の入力欄として表示する
const toFormValues = ({ id: _, registeredOn: __, ...pc }: FacilityPc): FormValues => ({
  ...(Object.fromEntries(Object.entries(pc).map(([field, value]) => [field, value ?? ''])) as FormValues),
  installedOn: toInputDate(pc.installedOn),
})

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '予期しないエラーが発生しました')

export function FacilityPcFormPage() {
  const { id: rawId } = useParams()
  const id = rawId === undefined ? null : Number(rawId)
  const isEdit = id !== null
  const navigate = useNavigate()
  const location = useLocation()
  // 一覧で見ていたページ・検索条件に戻す（外部 URL に飛ばないよう、アプリ内のパスだけ受け付ける）
  const state = location.state as { returnTo?: string } | null
  const returnTo = state?.returnTo?.startsWith('/') ? state.returnTo : '/'

  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(isEdit)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const datePickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (id === null) return
    let isCancelled = false
    fetchFacilityPc(id)
      .then((pc) => !isCancelled && setValues(toFormValues(pc)))
      .catch((e: unknown) => !isCancelled && setLoadError(errorMessage(e)))
      .finally(() => !isCancelled && setIsLoading(false))
    return () => {
      isCancelled = true
    }
  }, [id])

  const setValue = (field: Field, value: string) => setValues((current) => ({ ...current, [field]: value }))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    // サーバーと同じ Zod スキーマで先に確認し、明らかな入力ミスは通信せずに知らせる
    const parsed = facilityPcInputSchema.safeParse({ ...values, installedOn: toIsoDate(values.installedOn) })
    // 入力欄は yyyymmdd だけを受け付ける。スキーマは API 用の yyyy-mm-dd を正しい形とするため、
    // 入力欄に yyyy-mm-dd と打たれるとすり抜けてしまう。入力欄の形式はここで確かめる
    const hasInvalidDateFormat = values.installedOn.trim() !== '' && !isDateInputFormat(values.installedOn)
    if (!parsed.success || hasInvalidDateFormat) {
      const { formErrors, fieldErrors } = parsed.success ? { formErrors: [], fieldErrors: {} } : z.flattenError(parsed.error)
      setFieldErrors(hasInvalidDateFormat ? { ...fieldErrors, installedOn: [DATE_INPUT_FORMAT_MESSAGE] } : fieldErrors)
      // 「いずれかの項目を入力してください」は特定の項目に属さないので、フォームの上に出す
      setFormError(formErrors[0] ?? null)
      return
    }
    setFieldErrors({})
    setIsSubmitting(true)
    try {
      if (id === null) {
        await createFacilityPc(parsed.data)
      } else {
        await updateFacilityPc(id, parsed.data)
      }
      navigate(returnTo)
    } catch (e) {
      if (e instanceof ApiError) setFieldErrors(e.fieldErrors)
      setFormError(errorMessage(e))
      setIsSubmitting(false)
    }
  }

  const openDatePicker = () => {
    const picker = datePickerRef.current
    if (!picker) return
    try {
      picker.showPicker()
    } catch {
      // showPicker 非対応のブラウザでは、日付入力欄にフォーカスして標準の操作に任せる
      picker.focus()
    }
  }

  const title = isEdit ? '施設PC情報の編集' : '施設PC情報の新規登録'

  if (isLoading) {
    return (
      <main className="page">
        <h1>{title}</h1>
        <p>読み込み中…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="page">
        <h1>{title}</h1>
        <p className="error" role="alert">
          {loadError}
        </p>
        <Link to={returnTo}>一覧に戻る</Link>
      </main>
    )
  }

  const textField = (field: Field, placeholder?: string) => (
    <FormField field={field} errors={fieldErrors[field]}>
      {(props) => (
        <input
          {...props}
          type="text"
          placeholder={placeholder}
          value={values[field]}
          onChange={(event) => setValue(field, event.target.value)}
        />
      )}
    </FormField>
  )

  const selectField = (field: 'officeType' | 'officeVersion', options: readonly string[]) => (
    <FormField field={field} errors={fieldErrors[field]}>
      {(props) => (
        <select {...props} value={values[field]} onChange={(event) => setValue(field, event.target.value)}>
          <option value="">選択してください</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </FormField>
  )

  const isoInstalledOn = toIsoDate(values.installedOn)

  return (
    <main className="page">
      <h1>{title}</h1>
      <form className="facility-pc-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}

        {textField('facilityName')}
        {textField('pcName')}

        <FormField field="installedOn" errors={fieldErrors.installedOn}>
          {(props) => (
            <div className="date-input">
              <input
                {...props}
                type="text"
                inputMode="numeric"
                placeholder="yyyymmdd"
                value={values.installedOn}
                onChange={(event) => setValue('installedOn', event.target.value)}
              />
              <button type="button" onClick={openDatePicker}>
                カレンダーを開く
              </button>
              <input
                ref={datePickerRef}
                type="date"
                className="date-picker"
                aria-label="カレンダーから選択"
                tabIndex={-1}
                value={/^\d{4}-\d{2}-\d{2}$/.test(isoInstalledOn) ? isoInstalledOn : ''}
                onChange={(event) => event.target.value && setValue('installedOn', toInputDate(event.target.value))}
              />
            </div>
          )}
        </FormField>

        {textField('osVersion')}
        {selectField('officeType', OFFICE_TYPES)}
        {selectField('officeVersion', OFFICE_VERSIONS)}
        {textField('licenseKey', '英数字25桁（ハイフンなし）')}
        {textField('account')}
        {textField('password')}

        <FormField field="remarks" errors={fieldErrors.remarks}>
          {(props) => (
            <>
              <textarea
                {...props}
                rows={4}
                value={values.remarks}
                onChange={(event) => setValue('remarks', event.target.value)}
              />
              <span className="counter">
                {values.remarks.length} / {REMARKS_MAX_LENGTH}
              </span>
            </>
          )}
        </FormField>

        <div className="actions">
          <Link to={returnTo}>キャンセル</Link>
          <button type="submit" className="primary" disabled={isSubmitting}>
            {isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </main>
  )
}

type ControlProps = { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }

function FormField({
  field,
  errors,
  children,
}: {
  field: Field
  errors?: string[]
  children: (props: ControlProps) => ReactNode
}) {
  const controlId = `field-${field}`
  const errorId = `${controlId}-error`
  const hasError = Boolean(errors?.length)

  return (
    <div className="form-field">
      <div className="field-label">
        <label htmlFor={controlId}>{LABELS[field]}</label>
      </div>
      {children({ id: controlId, 'aria-invalid': hasError, 'aria-describedby': hasError ? errorId : undefined })}
      {hasError && (
        <p id={errorId} className="field-error">
          {errors![0]}
        </p>
      )}
    </div>
  )
}
