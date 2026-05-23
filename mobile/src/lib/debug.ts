/**
 * Production-safe debug logging.
 * Always logs (including release APK builds) so issues can be diagnosed
 * via `adb logcat` or on-device log viewers.
 * Each log is prefixed with [TheHub] for easy filtering:
 *   adb logcat | grep "\[TheHub\]"
 */

const TAG = '[TheHub]'

export function debugLog(scope: string, message: string, data?: unknown) {
  const line = `${TAG}[${scope}] ${message}`
  if (data !== undefined) {
    console.log(line, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  } else {
    console.log(line)
  }
}

export function debugWarn(scope: string, message: string, data?: unknown) {
  const line = `${TAG}[${scope}] ${message}`
  if (data !== undefined) {
    console.warn(line, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  } else {
    console.warn(line)
  }
}

export function debugError(scope: string, message: string, error?: unknown) {
  const line = `${TAG}[${scope}] ${message}`
  if (error instanceof Error) {
    console.error(line, { message: error.message, name: error.name, stack: error.stack })
  } else if (error !== undefined) {
    console.error(line, error)
  } else {
    console.error(line)
  }
}
