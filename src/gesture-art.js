// Local vector instructions: consistent in every browser, no remote art/fonts.
export function gestureArt(id) {
  if (id.startsWith('SWIPE_')) return `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="46" stroke="currentColor" opacity=".18"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="${id === 'SWIPE_LEFT' ? 'translate(120 0) scale(-1 1)' : ''}"><path d="M26 60h64m-20-20 20 20-20 20"/><path d="M20 42h24M20 78h24" opacity=".4"/></g></svg>`
  const extended = id === 'OPEN_PALM' ? [true, true, true, true] : id === 'V_SIGN' ? [true, true, false, false] : id === 'POINT' ? [true, false, false, false] : [false, false, false, false]
  return `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="52" stroke="currentColor" opacity=".15"/><g stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M38 62 25 54q-9-3-6 7l15 24q5 10 14 13v10h37V97q12-10 12-30v-8" fill="currentColor" fill-opacity=".05"/>${extended.map((open, index) => {
    const x = 38 + index * 15
    const top = [19, 12, 22, 36][index]
    const angle = id === 'V_SIGN' && index < 2 ? (index === 0 ? -16 : 16) : 0
    return open ? `<path transform="rotate(${angle} ${x + 7} 64)" d="M${x} 64V${top + 7}q0-7 7-7t7 7v${64 - top - 7}"/>` : `<rect x="${x}" y="48" width="14" height="24" rx="7"/>`
  }).join('')}<path d="M49 86h29" opacity=".45"/></g></svg>`
}
