export async function captureFrame(sourceId: string, maxWidth = 1600): Promise<string> {
  const stream = await (navigator.mediaDevices as any).getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxWidth: 1920,
        maxHeight: 1200
      }
    }
  }) as MediaStream

  try {
    const video = document.createElement('video')
    video.srcObject = stream
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play().then(() => resolve()).catch(reject)
      }
      video.onerror = () => reject(new Error('video load error'))
    })
    await new Promise(r => requestAnimationFrame(() => r(null)))

    const w0 = video.videoWidth, h0 = video.videoHeight
    const scale = w0 > maxWidth ? maxWidth / w0 : 1
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    return dataUrl.split(',')[1]
  } finally {
    stream.getTracks().forEach(t => t.stop())
  }
}

export function dataUrlFromBase64(b64: string) {
  return `data:image/jpeg;base64,${b64}`
}
