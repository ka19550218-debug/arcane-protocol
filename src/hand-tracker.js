import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

export async function startHandTracking(videoElement, canvasElement, onLandmarks) {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH },
    runningMode: 'VIDEO',
    numHands: 2,
  })
  const context = canvasElement.getContext('2d')
  let animationFrameId
  let lastVideoTime = -1

  function trackHands() {
    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resizeCanvasToVideo(canvasElement, videoElement)

      if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime
        const result = handLandmarker.detectForVideo(videoElement, performance.now())
        drawHands(context, canvasElement, result.landmarks)
        onLandmarks?.(result.landmarks, performance.now())
      }
    }

    animationFrameId = requestAnimationFrame(trackHands)
  }

  trackHands()

  return () => {
    cancelAnimationFrame(animationFrameId)
    handLandmarker.close()
    context.clearRect(0, 0, canvasElement.width, canvasElement.height)
  }
}

function resizeCanvasToVideo(canvasElement, videoElement) {
  if (
    canvasElement.width === videoElement.videoWidth &&
    canvasElement.height === videoElement.videoHeight
  ) {
    return
  }

  canvasElement.width = videoElement.videoWidth
  canvasElement.height = videoElement.videoHeight
}

function drawHands(context, canvasElement, hands) {
  context.clearRect(0, 0, canvasElement.width, canvasElement.height)

  hands.forEach((landmarks) => {
    context.strokeStyle = '#65f6ff'
    context.lineWidth = Math.max(2, canvasElement.width / 480)
    context.lineCap = 'round'

    HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
      const start = landmarks[startIndex]
      const end = landmarks[endIndex]

      context.beginPath()
      context.moveTo(start.x * canvasElement.width, start.y * canvasElement.height)
      context.lineTo(end.x * canvasElement.width, end.y * canvasElement.height)
      context.stroke()
    })

    context.fillStyle = '#f4f7ff'
    landmarks.forEach((landmark) => {
      context.beginPath()
      context.arc(
        landmark.x * canvasElement.width,
        landmark.y * canvasElement.height,
        Math.max(3, canvasElement.width / 240),
        0,
        Math.PI * 2,
      )
      context.fill()
    })
  })
}
