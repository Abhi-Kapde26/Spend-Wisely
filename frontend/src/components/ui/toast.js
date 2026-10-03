/** Thin helpers over react-toastify (SPEC §5: toasts on success/error). */
import { toast } from 'react-toastify';

export function toastSuccess(message) {
  toast.success(message);
}

export function toastError(message) {
  toast.error(message);
}

export function toastWarning(message) {
  toast.warning(message);
}

export function toastInfo(message) {
  toast.info(message);
}

export function errorMessage(err, fallback = 'Something went wrong.') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  return err.message || fallback;
}

/** Toast an thrown `{message}` object. */
export function toastApiError(err, fallback) {
  toast.error(errorMessage(err, fallback));
}
