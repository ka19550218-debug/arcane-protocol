// Ratios use lengths within each finger, so they do not depend on camera distance.
export const FINGER_STATE_THRESHOLDS = Object.freeze({
  EXTENDED_PIP_ANGLE: 155,
  EXTENDED_DIP_ANGLE: 150,
  CURLED_JOINT_ANGLE: 150,
  CURLED_TOTAL_FLEXION_ANGLE: 60,
  CURLED_TIP_TO_CHAIN_RATIO: 0.65,
  FIST_MAX_AVERAGE_TIP_EXTENSION_PALM_RATIO: 0.35,
  FIST_CLOSE_TIP_EXTENSION_PALM_RATIO: 0.55,
  FIST_MIN_CLOSE_TIP_COUNT: 3,
  FIST_IDEAL_TIP_EXTENSION_PALM_RATIO: 0.1,
  FIST_LOW_QUALITY_TIP_EXTENSION_PALM_RATIO: 0.6,
  MIN_GEOMETRY_LENGTH: 0.001,
  V_SIGN_MIN_SEPARATION_PALM_RATIO: 0.3,
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

// Screen-plane spread avoids mistaking depth noise for two separated fingers.
export function getVSignSeparation(hand) {
  return distance(hand[8], hand[12], false) /
    Math.max(distance(hand[5], hand[17], false), FINGER_STATE_THRESHOLDS.MIN_GEOMETRY_LENGTH)
}

export function getFingerStates(hand) {
  return Object.fromEntries(
    Object.entries(getFingerDiagnostics(hand)).map(([name, diagnostics]) => [name, diagnostics.state]),
  )
}

export function getFingerDiagnostics(hand) {
  const diagnostics = Object.fromEntries(
    Object.entries(FINGERS).map(([name, indices]) => [name, getMainFingerDiagnostics(hand, indices)]),
  )
  diagnostics.THUMB = getThumbDiagnostics(hand)
  return diagnostics
}

// Fingertip projections past their MCPs along the palm axis. A folded fingertip
// stays near the palm; the aggregate avoids rejecting a fist for one noisy tip.
export function getFistTipMetrics(hand) {
  const wrist = hand[0]
  const knuckles = [5, 9, 13, 17]
  const palmAxis = knuckles.reduce((sum, index) => ({
    x: sum.x + (hand[index].x - wrist.x) / knuckles.length,
    y: sum.y + (hand[index].y - wrist.y) / knuckles.length,
    z: sum.z + ((hand[index].z ?? 0) - (wrist.z ?? 0)) / knuckles.length,
  }), { x: 0, y: 0, z: 0 })
  const palmLengthSquared = palmAxis.x ** 2 + palmAxis.y ** 2 + palmAxis.z ** 2
  if (palmLengthSquared < FINGER_STATE_THRESHOLDS.MIN_GEOMETRY_LENGTH ** 2) {
    return { averageExtension: Infinity, closeTipCount: 0, tipExtensions: [] }
  }

  const tipExtensions = knuckles.map((baseIndex) => {
    const base = hand[baseIndex]
    const tip = hand[baseIndex + 3]
    return (
      (tip.x - base.x) * palmAxis.x +
      (tip.y - base.y) * palmAxis.y +
      ((tip.z ?? 0) - (base.z ?? 0)) * palmAxis.z
    ) / palmLengthSquared
  })
  return {
    averageExtension: tipExtensions.reduce((sum, value) => sum + value, 0) / tipExtensions.length,
    closeTipCount: tipExtensions.filter(
      (value) => value <= FINGER_STATE_THRESHOLDS.FIST_CLOSE_TIP_EXTENSION_PALM_RATIO,
    ).length,
    tipExtensions,
  }
}

function getMainFingerDiagnostics(hand, [baseIndex, pipIndex, dipIndex, tipIndex]) {
  const [base, pip, dip, tip] = [baseIndex, pipIndex, dipIndex, tipIndex].map((index) => hand[index])
  const baseToPip = distance(base, pip, true)
  const pipToDip = distance(pip, dip, true)
  const dipToTip = distance(dip, tip, true)
  if (Math.min(baseToPip, pipToDip, dipToTip) < FINGER_STATE_THRESHOLDS.MIN_GEOMETRY_LENGTH) {
    return { state: 'PARTIAL' }
  }

  const pipAngle = angleDegrees(base, pip, dip, false)
  const dipAngle = angleDegrees(pip, dip, tip, false)
  const pipAngle3d = angleDegrees(base, pip, dip, true)
  const dipAngle3d = angleDegrees(pip, dip, tip, true)
  const tipToChain = distance(base, tip, true) / (baseToPip + pipToDip + dipToTip)
  const totalFlexion = Math.max(0, 360 - pipAngle3d - dipAngle3d)

  // A straight 2D trace remains extended even if noisy depth bends the 3D trace.
  // The 3D angles also protect a straight finger seen from an oblique camera view.
  let state = 'PARTIAL'
  if (
    (pipAngle >= FINGER_STATE_THRESHOLDS.EXTENDED_PIP_ANGLE &&
      dipAngle >= FINGER_STATE_THRESHOLDS.EXTENDED_DIP_ANGLE) ||
    (pipAngle3d >= FINGER_STATE_THRESHOLDS.EXTENDED_PIP_ANGLE &&
      dipAngle3d >= FINGER_STATE_THRESHOLDS.EXTENDED_DIP_ANGLE)
  ) state = 'EXTENDED'

  // Natural fists often have one strongly folded joint and one nearly straight
  // distal joint. Total flexion plus fingertip travel captures that shape without
  // accepting a merely bent finger.
  if (state !== 'EXTENDED' &&
    Math.min(pipAngle3d, dipAngle3d) <= FINGER_STATE_THRESHOLDS.CURLED_JOINT_ANGLE &&
    totalFlexion >= FINGER_STATE_THRESHOLDS.CURLED_TOTAL_FLEXION_ANGLE &&
    tipToChain <= FINGER_STATE_THRESHOLDS.CURLED_TIP_TO_CHAIN_RATIO
  ) state = 'CURLED'

  return { state, pipAngle, dipAngle, pipAngle3d, dipAngle3d, totalFlexion, tipToChain }
}

function getThumbDiagnostics(hand) {
  const base = hand[1]
  const mcp = hand[2]
  const ip = hand[3]
  const tip = hand[4]
  const mcpAngle = angleDegrees(base, mcp, ip, true)
  const ipAngle = angleDegrees(mcp, ip, tip, true)
  const tipToBase = distance(base, tip, true) /
    Math.max(distance(base, mcp, true), FINGER_STATE_THRESHOLDS.MIN_GEOMETRY_LENGTH)

  let state = 'PARTIAL'
  if (
    mcpAngle >= FINGER_STATE_THRESHOLDS.THUMB_EXTENDED_JOINT_ANGLE &&
    ipAngle >= FINGER_STATE_THRESHOLDS.THUMB_EXTENDED_JOINT_ANGLE
  ) state = 'EXTENDED'
  else if (
    Math.min(mcpAngle, ipAngle) <= FINGER_STATE_THRESHOLDS.THUMB_CURLED_JOINT_ANGLE ||
    tipToBase <= FINGER_STATE_THRESHOLDS.THUMB_CURLED_TIP_TO_BASE_RATIO
  ) state = 'CURLED'
  return { state, mcpAngle, ipAngle, tipToBase }
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
