import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useAppStore } from '../store';

export function Section({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const stored = useAppStore((state) => state.openSections[id]);
  const setSectionOpen = useAppStore((state) => state.setSectionOpen);
  const open = stored ?? defaultOpen;
  const panelId = useId();
  return (
    <section className={`section${open ? ' open' : ''}`}>
      <button
        type="button"
        className="section-header"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setSectionOpen(id, !open)}
      >
        <Icon name="chevron" size={14} />
        <span>{title}</span>
      </button>
      {open && (
        <div className="section-body" id={panelId}>
          {children}
        </div>
      )}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  digits,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  digits?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const decimals = digits ?? (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
  return (
    <div className="field slider-field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor={id} className="slider-value">
        {value.toFixed(decimals)}
        {unit}
      </output>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle${disabled ? ' disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="field color-field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <code className="slider-value">{value}</code>
    </div>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="field select-field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        onChange={(event) => {
          const match = options.find((option) => String(option.value) === event.target.value);
          if (match) onChange(match.value);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          className={option.value === value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
