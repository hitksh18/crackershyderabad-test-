import { auth } from '../firebase';

/**
 * Fetch wrapper that attaches the caller's Firebase ID token.
 *
 * The admin API verifies this token and resolves the caller's role server-side.
 * Client-side route guards decide what a user *sees*; this is what decides what
 * they can actually *do*.
 */
export async function authFetch(url, options = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('You need to be signed in to do that.');
  }

  const token = await user.getIdToken();

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, { ...options, headers });
}

/**
 * Turn a failed response into a message worth showing a person.
 * Server responses are already scrubbed of internals; this adds sensible
 * wording for the status codes the API actually returns.
 */
export async function readApiError(response, fallback = 'Something went wrong. Please try again.') {
  let serverMessage = '';

  try {
    const data = await response.json();
    serverMessage = data?.error || '';
  } catch {
    // Non-JSON body — fall through to the status-based wording.
  }

  if (response.status === 401) return 'Your session has expired. Please sign in again.';
  if (response.status === 403) return serverMessage || 'You do not have permission to do that.';
  if (response.status === 429) return 'Too many attempts. Please wait a moment and try again.';

  return serverMessage || fallback;
}
