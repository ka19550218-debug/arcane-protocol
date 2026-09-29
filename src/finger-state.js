// Ratios use lengths within each finger, so they do not depend on camera distance.
export const FINGER_STATE_THRESHOLDS = Object.freeze({
  EXTENDED_PIP_ANGLE: 155,
  EXTENDED_DIP_ANGLE: 150,
  CURLED_PIP_ANGLE: 135,
  CURLED_DIP_ANGLE: 145,
  CURLED_PLANAR_JOINT_ANGLE: 150,
  CURLED_TIP_TO_CHAIN_RATIO: 0.72,
  FIST_MAX_TIP_EXTENSION_PALM_RATIO: 0.35,
  FIST_IDEAL_TIP_EXTENSION_PALM_RATIO: 0.1,
  FIST_LOW_QUALITY_TIP_EXTENSION_PALM_RATIO: 0.6,
  MIN_GEOMETRY_LENGTH: 0.001,
  THUMB_EXTENDED_JOINT_ANGLE: 155,
  THUMB_CURLED_JOINT_ANGLE: 140,
  THUMB_CURLED_TIP_TO_BASE_RATIO: 1.35,
})

const FINGERS = {
  INDEX: [5, 6, 7, 8],
  MIDDLE: [9, 10, 11, 12],
  RING: [13, 14, 15, 16],
  PINKY: [17, 18, 19, 20],
}

export function getFingerStates(hand) {
  const states = Object.fromEntries(
    Object.entries(FINGERS).map(([name, indices]) => [name, getMainFingerState(hand, indices)]),
  )
  states.THUMB = getThumbState(hand)
  return states
}

// Largest fingertip projection past its MCP along the wrist-to-knuckles axis.
// A folded fingertip stays near the palm; the ratio is invariant to hand size and rotation.
export function getFistTipExtension(hand) {
  const wrist = hand[0]
  const knuckles = [5, 9, 13, 17]
  const palmAxis = knuckles.reduce((sum, index) => ({
    x: sum.x + (hand[index].x - wrist.x) / knuckles.length,
    y: sum.y + (hand[index].y - wrist.y) / knuckles.length,
    z: sum.z + ((hand[index].z ?? 0) - (wrist.z ?? 0)) / knuckles.length,
  }), { x: 0, y: 0, z: 0 })
  const palmLengthSquared = palmAxis.x ** 2 + palmAxis.y ** 2 + palmAxis.z ** 2
  if (palmLengthSquared < FINGER_STATE_THRESHOLDS.MIN_GEOMETRY_LENGTH ** 2) return Infinity

  return Math.max(...knuckles.map((baseIndex) => {
    const base = hand[baseIndex]
    const tip = hand[baseIndex + 3]
    return (
      (tip.x - base.x) * palmAxis.x +
      (tip.y - base.y) * palmAxis.y +
      ((tip.z ?? 0) - (base.z ?? 0)) * palmAxis.z
    ) / palmLengthSquared
  }))
}

function getMainFingerState(hand, [baseIndex, pipIndex, dipIndex, tipIndex]) {
  const [base, pip, dip, tip] = [baseIndex, pipIndex, dipIndex, tipIndex].map((index) => hand[index])
  const baseToPip = distance(base, pip, true)
  const pipToDip = distance(pip, dip, true)
  const dipToTip = distance(dip, tip, true)
  if (Math.min(baseToPip, pipToDip, dipToTip) < FINGER_STATE_THRESHOLDS.MIN_GEOMETRY_LENGTH) {
    return 'PARTIAL'
  }

  const pipAngle = angleDegrees(base, pip, dip, false)
  const dipAngle = angleDegrees(pip, dip, tip, false)
  const pipAngle3d = angleDegrees(base, pip, dip, true)
  const dipAngle3d = angleDegrees(pip, dip, tip, true)
  const tipToChain = distance(base, tip, true) / (baseToPip + pipToDip + dipToTip)

  // A straight 2D trace remains extended even if noisy depth bends the 3D trace.
  // The 3D angles also protect a straight finger seen from an oblique camera view.
  if (
    (pipAngle >= FINGER_STATE_THRESHOLDS.EXTENDED_PIP_ANGLE &&
      dipAngle >= FINGER_STATE_THRESHOLDS.EXTENDED_DIP_ANGLE) ||
    (pipAngle3d >= FINGER_STATE_THRESHOLDS.EXTENDED_PIP_ANGLE &&
      dipAngle3d >= FINGER_STATE_THRESHOLDS.EXTENDED_DIP_ANGLE)
  ) return 'EXTENDED'

  // Both joints must bend; projected bend and fingertip travel corroborate it.
  if (
    pipAngle3d <= FINGER_STATE_THRESHOLDS.CURLED_PIP_ANGLE &&
    dipAngle3d <= FINGER_STATE_THRESHOLDS.CURLED_DIP_ANGLE &&
    Math.min(pipAngle, dipAngle) <= FINGER_STATE_THRESHOLDS.CURLED_PLANAR_JOINT_ANGLE &&
    tipToChain <= FINGER_STATE_THRESHOLDS.CURLED_TIP_TO_CHAIN_RATIO
  ) return 'CURLED'

  return 'PARTIAL'
}

function getThumbState(hand) {
  const base = hand[1]
  const mcp = hand[2]
  const ip = hand[3]
  const tip = hand[4]
  const mcpAngle = angleDegrees(base, mcp, ip, true)
  const ipAngle = angleDegrees(mcp, ip, tip, true)
  const tipToBase = distance(base, tip, true) /
    Math.max(distance(base, mcp, true), FINGER_STATE_THRESHOLDS.MIN_GEOMETRY_LENGTH)

  if (
    mcpAngle >= FINGER_STATE_THRESHOLDS.THUMB_EXTENDED_JOINT_ANGLE &&
    ipAngle >= FINGER_STATE_THRESHOLDS.THUMB_EXTENDED_JOINT_ANGLE
  ) return 'EXTENDED'
  if (
    Math.min(mcpAngle, ipAngle) <= FINGER_STATE_THRESHOLDS.THUMB_CURLED_JOINT_ANGLE ||
    tipToBase <= FINGER_STATE_THRESHOLDS.THUMB_CURLED_TIP_TO_BASE_RATIO
  ) return 'CURLED'
  return 'PARTIAL'
}

function distance(first, second, useDepth) {
  return Math.hypot(
    first.x - second.x,
    first.y - second.y,
    useDepth ? (first.z ?? 0) - (second.z ?? 0) : 0,
  )
}

function angleDegrees(first, vertex, last, useDepth) {
  const firstVector = [first.x - vertex.x, first.y - vertex.y, useDepth ? (first.z ?? 0) - (vertex.z ?? 0) : 0]
  const lastVector = [last.x - vertex.x, last.y - vertex.y, useDepth ? (last.z ?? 0) - (vertex.z ?? 0) : 0]
  const magnitude = Math.hypot(...firstVector) * Math.hypot(...lastVector)
  if (magnitude === 0) return 0
  const cosine = firstVector.reduce((sum, value, index) => sum + value * lastVector[index], 0) / magnitude
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * (180 / Math.PI)
}
