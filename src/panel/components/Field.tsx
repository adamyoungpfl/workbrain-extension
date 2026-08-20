import type { ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import './Field.css';

type Common = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string | undefined;
  error?: string | undefined;
};

export type FieldProps =
  | (Common & { as?: 'input' | undefined } & Omit<
        InputHTMLAttributes<HTMLInputElement>,
        'id' | 'value' | 'onChange'
      >)
  | (Common & { as: 'textarea' } & Omit<
        TextareaHTMLAttributes<HTMLTextAreaElement>,
        'id' | 'value' | 'onChange'
      >);

/** Grey border means your turn to type. Errors say what to do, never what went wrong. */
export function Field({ id, label, value, onChange, help, error, as, className, ...rest }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const classes = ['field', error ? 'field-err' : '', className].filter(Boolean).join(' ');

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChange(e.target.value);
  }

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {as === 'textarea' ? (
        <textarea
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          id={id}
          className={classes}
          value={value}
          onChange={handleChange}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          id={id}
          className={classes}
          value={value}
          onChange={handleChange}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      )}
      {help && (
        <div className="field-help" id={helpId}>
          {help}
        </div>
      )}
      {error && (
        <div className="field-errmsg" id={errorId}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5M12 16h.01" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
