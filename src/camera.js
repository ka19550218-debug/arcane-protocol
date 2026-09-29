const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: 'user',
  },
}

export async function startCamera(videoElement) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is not supported by this browser.')
  }

  let stream

  try {
    stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
    videoElement.srcObject = stream
    await videoElement.play()
    return stream
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop())
    throw new Error(getCameraErrorMessage(error))
  }
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

function getCameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access and reload the page.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found. Connect a camera and reload the page.'
    case 'NotReadableError':
      return 'The camera is already in use by another application. Close it and reload the page.'
    default:
      return 'The camera could not be started. Please reload the page and try again.'
  }
}
