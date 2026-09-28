import { useId, useState, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}

export function Field({ label, children, hint, htmlFor }: FieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  suggestions?: string[];
  id?: string;
}

export function TextField({ label, value, onChange, placeholder, disabled, suggestions, id }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = suggestions?.length ? `${inputId}-list` : undefined;
  return (
    <Field label={label} htmlFor={inputId}>
      <input
        id={inputId}
        className="input"
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
      />
      {listId && (
        <datalist id={listId}>
          {suggestions!.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </Field>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}

export function TextAreaField({ label, value, onChange, rows = 3, disabled, id, placeholder }: TextAreaFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} htmlFor={inputId}>
      <textarea
        id={inputId}
        className="input"
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  /** 空欄 (未記入) を許可する場合に指定 */
  onClear?: () => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  suffix?: string;
  placeholder?: string;
}

function formatNumber(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '' : String(Math.round(v * 100) / 100);
}

/** 数値入力。入力途中の空欄や「-」を許容し、確定できる値のときだけ反映する */
export function NumberField({ label, value, onChange, onClear, min, max, step = 1, disabled, suffix, placeholder }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatNumber(value);
  return (
    <Field label={label} htmlFor={id}>
      <div className="input-with-suffix">
        <input
          id={id}
          className="input"
          type="text"
          inputMode="decimal"
          value={shown}
          placeholder={placeholder ?? (onClear ? '未記入' : undefined)}
          disabled={disabled}
          onChange={(e) => {
            const text = e.target.value.replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/,/g, '');
            setDraft(text);
            if (text.trim() === '') {
              onClear?.();
              return;
            }
            const n = Number(text);
            if (!Number.isFinite(n)) return;
            if ((min !== undefined && n < min) || (max !== undefined && n > max)) return;
            onChange(n);
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            let n = (value ?? 0) + (e.key === 'ArrowUp' ? step : -step);
            if (min !== undefined) n = Math.max(min, n);
            if (max !== undefined) n = Math.min(max, n);
            setDraft(null);
            onChange(n);
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
        {onClear && value !== null && !disabled && (
          <button type="button" className="btn small ghost" onClick={() => (setDraft(null), onClear())}>
            未記入
          </button>
        )}
      </div>
    </Field>
  );
}

interface ComboFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onAddOption?: (v: string) => void;
  disabled?: boolean;
}

/** 候補から選ぶか自由入力できる欄。候補にない値は「候補に追加」できる */
export function ComboField({ label, value, options, onChange, onAddOption, disabled }: ComboFieldProps) {
  const id = useId();
  const listId = `${id}-list`;
  const canAdd = !!onAddOption && value.trim() !== '' && !options.includes(value.trim());
  return (
    <Field label={label} htmlFor={id}>
      <div className="combo">
        <input
          id={id}
          className="input"
          type="text"
          value={value}
          list={listId}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`chip ${o === value ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
        {canAdd && (
          <button type="button" className="chip add" onClick={() => onAddOption!(value.trim())}>
            ＋「{value.trim()}」を候補に追加
          </button>
        )}
      </div>
    </Field>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  swatches: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function ColorField({ label, value, swatches, onChange, disabled }: ColorFieldProps) {
  return (
    <Field label={label}>
      <div className="swatches">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            aria-label={`色 ${c}`}
            disabled={disabled}
            onClick={() => onChange(c)}
          />
        ))}
        <input
          type="color"
          className="color-input"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          disabled={disabled}
          aria-label="任意の色"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Field>
  );
}

interface CheckFieldProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function CheckField({ label, checked, onChange, disabled }: CheckFieldProps) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
