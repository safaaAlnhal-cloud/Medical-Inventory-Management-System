// The one error type services throw, for both the mock layer and the real API.
// `message` is always safe to show to the user.
export class ApiError extends Error {
  constructor(message, { status = 0, fieldErrors = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const DEFAULT_MESSAGES = {
  400: 'The request could not be processed. Please check your input.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested record was not found.',
  409: 'This change conflicts with existing data.',
  422: 'Some of the submitted values are not valid.',
};

// Converts an Axios failure into an ApiError so raw Axios messages never reach the UI.
// Expected error body: { message: string, errors?: { [field]: string } }
export const toApiError = (error) => {
  if (error instanceof ApiError) return error;
  const response = error?.response;
  if (!response) {
    const timedOut = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
    return new ApiError(timedOut ? 'The server took too long to respond. Please try again.' : 'Unable to reach the server. Check your connection and try again.');
  }

  const body = response.data;
  const message = typeof body?.message === 'string' && body.message.trim()
    ? body.message
    : DEFAULT_MESSAGES[response.status] || (response.status >= 500 ? 'The server ran into a problem. Please try again later.' : 'Something went wrong. Please try again.');
  return new ApiError(message, { status: response.status, fieldErrors: body?.errors ?? null });
};

// Per-field messages of a failed request ({ [field]: message }), or {} when there are none.
// Forms show them under the matching input.
export const getFieldErrors = (error) => (error instanceof ApiError && error.fieldErrors) || {};

// A rejected value that belongs to one form field. Used by the mock-side validation.
export const fieldError = (field, message, status = 422) => new ApiError(message, { status, fieldErrors: { [field]: message } });

export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') =>
  error instanceof ApiError && error.message ? error.message : fallback;
