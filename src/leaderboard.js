export const LEADERBOARD_KEY = 'arcane.records.v1'
const LIMIT = 10

export function readRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]')
    if (!Array.isArray(records)) return []
    return records.filter((entry) => Number.isFinite(entry?.score) &&
      ['VEX', 'NEX', 'AERIS'].includes(entry.hero) &&
      ['STORY', 'BOSS RUSH'].includes(entry.mode) &&
      ['VICTORY', 'DEFEAT'].includes(entry.result) && Number.isFinite(entry.timestamp))
      .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp).slice(0, LIMIT)
  } catch {
    return []
  }
}

export function saveRecord({ score, hero, mode, result }) {
  const record = { score, hero, mode, result, timestamp: Date.now() }
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(
      [...readRecords(), record].sort((a, b) => b.score - a.score || b.timestamp - a.timestamp).slice(0, LIMIT),
    ))
  } catch {
    // Storage may be disabled or full. A completed run must still reach its result screen.
  }
}
