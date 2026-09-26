import { useState } from 'react'

type Props = { value: string; label: string }

export function SecretCell({ value, label }: Props) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <span className="secret-cell">
      <span className="secret-value">{isVisible ? value : '●●●●'}</span>
      <button type="button" className="link-button" onClick={() => setIsVisible(!isVisible)}>
        <span className="visually-hidden">{label}を</span>
        {isVisible ? '隠す' : '表示'}
      </button>
    </span>
  )
}
