import { useEffect } from 'react';
import './Toast.css';

export interface ToastProps {
  message: string;
  duration?: number | undefined;
  onDismiss?: (() => void) | undefined;
}

/** Confirmation only. Four seconds, never carries an action, never blocks. */
export function Toast({ message, duration = 4000, onDismiss }: ToastProps) {
  useEffect(() => {
    const id = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(id);
  }, [duration, onDismiss]);

  return (
    <div className="toast" role="status" aria-live="polite" aria-atomic="true">
      <span className="tk" aria-hidden="true">
        ✓
      </span>{' '}
      {message}
    </div>
  );
}
