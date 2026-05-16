'use client'

import { useEffect, useRef } from 'react'

const IOT_ENDPOINT = 'aza2ym6h5xfcf-ats.iot.ap-south-1.amazonaws.com'
const REGION = 'ap-south-1'
const IDENTITY_POOL_ID = 'ap-south-1:d56bf494-b8f0-4139-8f27-44d705065ffc'

async function getCognitoCredentials() {
  let identityId = typeof window !== 'undefined' ? localStorage.getItem('mechair_identity_id') : null

  if (!identityId) {
    const idRes = await fetch('https://cognito-identity.ap-south-1.amazonaws.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityService.GetId',
      },
      body: JSON.stringify({ IdentityPoolId: IDENTITY_POOL_ID }),
    })
    const idData = await idRes.json()
    if (!idData.IdentityId) throw new Error('GetId failed: ' + JSON.stringify(idData))
    identityId = idData.IdentityId
    if (typeof window !== 'undefined') {
      localStorage.setItem('mechair_identity_id', identityId!)
    }
  }

  const credRes = await fetch('https://cognito-identity.ap-south-1.amazonaws.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity',
    },
    body: JSON.stringify({ IdentityId: identityId }),
  })
  const credData = await credRes.json()
  if (!credData.Credentials) throw new Error('GetCredentials failed: ' + JSON.stringify(credData))

  return {
    accessKeyId: credData.Credentials.AccessKeyId,
    secretAccessKey: credData.Credentials.SecretKey,
    sessionToken: credData.Credentials.SessionToken,
  }
}

// ─── Proper SigV4 signed URL for IoT Core WebSocket ──────────────────────────
async function getSignedUrl(creds: { accessKeyId: string; secretAccessKey: string; sessionToken: string }) {
  const { accessKeyId, secretAccessKey, sessionToken } = creds
  const now = new Date()
  const amzdate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '')
  const datestamp = amzdate.slice(0, 8)

  const service = 'iotdevicegateway'
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${datestamp}/${REGION}/${service}/aws4_request`

  const enc = new TextEncoder()

  async function sha256Hex(data: string) {
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(data))
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  }

  // Canonical query params MUST be alphabetically sorted, and security token comes AFTER signing
  const canonicalParams = [
    ['X-Amz-Algorithm', algorithm],
    ['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzdate],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  canonicalParams.sort((a, b) => a[0].localeCompare(b[0]))

  const canonicalQuerystring = canonicalParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const canonicalHeaders = `host:${IOT_ENDPOINT}\n`
  const payloadHash = await sha256Hex('')
  const canonicalRequest = `GET\n/mqtt\n${canonicalQuerystring}\n${canonicalHeaders}\nhost\n${payloadHash}`
  const stringToSign = `${algorithm}\n${amzdate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`

  const kDate = await hmac(enc.encode(`AWS4${secretAccessKey}`), datestamp)
  const kRegion = await hmac(kDate, REGION)
  const kService = await hmac(kRegion, service)
  const kSigning = await hmac(kService, 'aws4_request')
  const sigBuf = await hmac(kSigning, stringToSign)
  const signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

  // Session token is appended AFTER signing
  return `wss://${IOT_ENDPOINT}/mqtt?${canonicalQuerystring}&X-Amz-Signature=${signature}&X-Amz-Security-Token=${encodeURIComponent(sessionToken)}`
}

// ─── MQTT packet encoding ────────────────────────────────────────────────────
function encodeMqttConnect(clientId: string): Uint8Array {
  const clientIdBytes = new TextEncoder().encode(clientId)
  const remainingLength = 10 + 2 + clientIdBytes.length
  const buf = new Uint8Array(2 + remainingLength)
  let i = 0
  buf[i++] = 0x10
  buf[i++] = remainingLength
  buf[i++] = 0; buf[i++] = 4
  'MQTT'.split('').forEach(c => (buf[i++] = c.charCodeAt(0)))
  buf[i++] = 4
  buf[i++] = 0x02
  buf[i++] = 0; buf[i++] = 60
  buf[i++] = (clientIdBytes.length >> 8) & 0xff
  buf[i++] = clientIdBytes.length & 0xff
  clientIdBytes.forEach(b => (buf[i++] = b))
  return buf
}

function encodeMqttSubscribe(topic: string, packetId: number): Uint8Array {
  const topicBytes = new TextEncoder().encode(topic)
  const remainingLength = 2 + 2 + topicBytes.length + 1
  const buf = new Uint8Array(2 + remainingLength)
  let i = 0
  buf[i++] = 0x82
  buf[i++] = remainingLength
  buf[i++] = (packetId >> 8) & 0xff; buf[i++] = packetId & 0xff
  buf[i++] = (topicBytes.length >> 8) & 0xff; buf[i++] = topicBytes.length & 0xff
  topicBytes.forEach(b => (buf[i++] = b))
  buf[i++] = 0x00
  return buf
}

function decodeMqttPublish(data: ArrayBuffer): { topic: string; payload: string } | null {
  const buf = new Uint8Array(data)
  if ((buf[0] & 0xf0) !== 0x30) return null
  let i = 1
  let multiplier = 1
  let remainingLength = 0
  do {
    remainingLength += (buf[i] & 127) * multiplier
    multiplier *= 128
  } while (buf[i++] & 128)
  const topicLen = (buf[i] << 8) | buf[i + 1]; i += 2
  const topic = new TextDecoder().decode(buf.slice(i, i + topicLen)); i += topicLen
  const payload = new TextDecoder().decode(buf.slice(i))
  return { topic, payload }
}

export type IoTMessage = {
  topic: string
  payload: Record<string, any>
}

export function useIoT(topics: string[], onMessage: (msg: IoTMessage) => void) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let ws: WebSocket | null = null
    let destroyed = false
    let pingInterval: ReturnType<typeof setInterval>

    const connect = async () => {
      try {
        const creds = await getCognitoCredentials()
        const url = await getSignedUrl(creds)
        console.log('[IoT] Connecting to WebSocket...')

        ws = new WebSocket(url, ['mqtt'])
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          if (destroyed) return
          console.log('[IoT] WebSocket open, sending MQTT CONNECT')
          const clientId = `mechair-web-${Math.random().toString(36).slice(2)}`
          ws!.send(encodeMqttConnect(clientId))
        }

        ws.onmessage = (event) => {
          if (destroyed) return
          const buf = event.data as ArrayBuffer
          const first = new Uint8Array(buf)[0]

          if ((first & 0xf0) === 0x20) {
            console.log('[IoT] MQTT CONNACK received, subscribing to', topics)
            topics.forEach((topic, idx) => {
              ws!.send(encodeMqttSubscribe(topic, idx + 1))
            })
            pingInterval = setInterval(() => {
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(new Uint8Array([0xC0, 0x00]))
              }
            }, 30000)
          }

          const msg = decodeMqttPublish(buf)
          if (msg) {
            console.log('[IoT] Message on', msg.topic)
            try {
              const payload = JSON.parse(msg.payload)
              onMessageRef.current({ topic: msg.topic, payload })
            } catch {}
          }
        }

        ws.onclose = (e) => {
          console.log('[IoT] WebSocket closed, code:', e.code, 'reason:', e.reason)
          clearInterval(pingInterval)
          if (!destroyed) setTimeout(connect, 3000)
        }

        ws.onerror = (e) => {
          console.error('[IoT] WebSocket error', e)
        }
      } catch (err) {
        console.error('[IoT] Connect error:', err)
        if (!destroyed) setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      destroyed = true
      clearInterval(pingInterval)
      ws?.close()
    }
  }, [topics.join(',')])
}
