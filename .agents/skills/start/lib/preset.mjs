const PRESET_NAMES = ['minimal', 'neon']

const namedPreset = (request) => {
  const text = String(request ?? '')
  if (/\bneon\b/iu.test(text) || /\bdatabase\b/iu.test(text) || /\bdrizzle\b/iu.test(text)) return 'neon'
  if (/\bminimal\b/iu.test(text) || /\bno database\b/iu.test(text)) return 'minimal'
  return
}

export const resolvePreset = ({ request = '', explicit } = {}) => {
  if (explicit != null && explicit !== '') {
    if (!PRESET_NAMES.includes(explicit)) return { ok: false, error: 'preset must be minimal or neon' }
    return { ok: true, preset: explicit }
  }
  return { ok: true, preset: namedPreset(request) ?? 'minimal' }
}
