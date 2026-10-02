const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  const csrfToken = readCookie('XSRF-TOKEN')
  if (csrfToken && options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    headers.set('X-XSRF-TOKEN', decodeURIComponent(csrfToken))
  }
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options, headers, credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    const offline = new Error('The clinic server could not be reached. Your changes remain saved on this device.')
    offline.status = 0
    throw offline
  }
  const contentType = response.headers.get('content-type') || ''
  const payload = response.status === 204 ? null : contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    const message = payload?.message || payload?.error || (response.status >= 500
      ? 'The clinic API is unavailable. Check the Spring Boot server and try again.'
      : `Request failed (${response.status}).`)
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  if (response.status !== 204 && payload === null) {
    const error = new Error('The clinic API did not return JSON. Confirm the Spring Boot server is running.')
    error.status = response.status
    throw error
  }
  return payload
}

function readCookie(name) {
  return document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`))?.slice(name.length + 1)
}

export async function getCsrf() {
  return request('/api/auth/csrf')
}

export const api = request
