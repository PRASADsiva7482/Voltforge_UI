import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/cn'

type FieldShellProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode
  hint?: ReactNode
  label: ReactNode
}

export function FieldShell({ children, className, hint, label, ...props }: FieldShellProps) {
  return (
    <label className={cn('vf-field', className)} {...props}>
      <span className="vf-field__label">{label}</span>
      {children}
      {hint ? <span className="vf-field__hint">{hint}</span> : null}
    </label>
  )
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  leftSlot?: ReactNode
}

export function TextInput({ className, leftSlot, ...props }: TextInputProps) {
  return (
    <span className={cn('vf-input-wrap', leftSlot && 'vf-input-wrap--with-icon')}>
      {leftSlot ? <span className="vf-input-wrap__icon">{leftSlot}</span> : null}
      <input className={cn('vf-input', className)} {...props} />
    </span>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('vf-input vf-textarea', className)} {...props} />
}

export function SelectField({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('vf-input vf-select', className)} {...props}>
      {children}
    </select>
  )
}
