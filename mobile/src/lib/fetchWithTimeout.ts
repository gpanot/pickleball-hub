import { debugLog, debugError } from './debug'

/** RN-safe fetch timeout (AbortSignal.timeout is not available in Hermes). */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  ms = 10000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    debugError('fetchWithTimeout', `Timed out after ${ms}ms: ${url}`)
    controller.abort()
  }, ms)
  try {
    const start = Date.now()
    const res = await fetch(url, { ...init, signal: controller.signal })
    debugLog('fetchWithTimeout', `${url} → ${res.status} (${Date.now() - start}ms)`)
    return res
  } catch (e) {
    debugError('fetchWithTimeout', `${url} FAILED`, e)
    throw e
  } finally {
    clearTimeout(timer)
  }
}
