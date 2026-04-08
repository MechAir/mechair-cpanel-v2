'use client'

import { useEffect, useRef, useCallback } from 'react'

// ─── AWS IoT WebSocket Config ─────────────────────────────────────────────────
const IOT_ENDPOINT = 'a92woj9ctycen-ats.iot.ap-south-1.amazonaws.com'
const IDENTITY_POOL_ID = 'ap-south-1:f8c65bba-cd6c-4776-9996-b7d7bfab6ac8'
const REGION = 'ap-south-1'

// ─── SigV4 WebSocket URL signer ───────────────────────────────────────────────
async function getSignedUrl(credentials: {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}): Promise<string> {
  const { accessKeyId, secretAccessKey, sessionToken } = credentials

  const now = new Date()
  const amzdate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const datestamp = amzdate.slice(0, 8)

  const host = IOT_ENDPOINT
  const algorithm = 'AWS4-HMAC-SHA256'
  const service = 'iotdevicegateway'
  const credentialScope = `${datestamp}/${REGION}/${service}/aws4_request`

  const enc = new TextEncoder()

  async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  }

  async function sha256(data: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(data))
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const canonicalQuerystring = [
    `X-Amz-Algorithm=${algorithm}`,
    `X-Amz-Credential=${encodeURIComponent(`${accessKeyId}/${credentialScope}`)}`,
    `X-Amz-Date=${amzdate}`,
    `X-Amz-Security-Token=${encodeURIComponent(sessionToken)}`,
    `X-Amz-SignedHeaders=host`,
  ].join('&')

  const canonicalHeaders = `host:${host}\n`
  const payloadHash = await sha256('')
  const canonicalRequest = `GET\n/mqtt\n${canonicalQuerystring}\n${canonicalHeaders}\nhost\n${payloadHash}`
  const stringToSign = `${algorithm}\n${amzdate}\n${credentialScope}\n${await sha256(canonicalRequest)}`

  const signingKey = await hmac(
    await hmac(
      await hmac(
        await hmac(enc.encode(`AWS4${secretAccessKey}`), datestamp),
        REGION
      ),
      service
    ),
    'aws4_request'
  )

  const signature = Array.from(new Uint8Array(await hmac(signingKey, stringToSign)))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  return `wss://${host}/mqtt?${canonicalQuerystring}&X-Amz-Signature=${signature}`
}

// ─── Cognito Identity credentials ─────────────────────────────────────────────
async function getCognitoCredentials() {
  // Step 1: Get identity id
  const idRes = await fetch(`https://cognito-identity.${REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AmazonCognitoIdentity.GetId',
    },
    body: JSON.stringify({
      IdentityPoolId: IDENTITY_POOL_ID,
      AccountId: '532260185847',
    }),
  })
  const { IdentityId } = await idRes.json()

  // Step 2: Get credentials for identity
  const credRes = await fetch(`https://cognito-identity.${REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AmazonCognitoIdentity.GetCredentialsForIdentity',
    },
    body: JSON.stringify({ IdentityId }),
  })
  const { Credentials } = await credRes.json()
  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretKey,
    sessionToken: Credentials.SessionToken,
  }
}

// ─── MQTT over WebSocket (minimal implementation) ─────────────────────────────
function encodeMqttConnect(clientId: string): Uint8Array {
  const protocolName = 'MQTT'
  const protocolLevel = 4 // MQTT 3.1.1
  const connectFlags = 0x02 // Clean session
  const keepAlive = 60

  const clientIdBytes = new TextEncoder().encode(clientId)
  const remainingLength = 10 + clientIdBytes.length + 2

  const buf = new Uint8Array(2 + remainingLength)
  let i = 0
  buf[i++] = 0x10 // CONNECT
  buf[i++] = remainingLength
  // Protocol name length
  buf[i++] = 0; buf[i++] = 4
  // Protocol name
  for (const c of protocolName) buf[i++] = c.charCodeAt(0)
  buf[i++] = protocolLevel
  buf[i++] = connectFlags
  buf[i++] = (keepAlive >> 8) & 0xff; buf[i++] = keepAlive & 0xff
  // Client ID length
  buf[i++] = (clientIdBytes.length >> 8) & 0xff
  buf[i++] = clientIdBytes.length & 0xff
  // Client ID
  for (const b of clientIdBytes) buf[i++] = b
  return buf
}

function encodeMqttSubscribe(topic: string, packetId: number): Uint8Array {
  const topicBytes = new TextEncoder().encode(topic)
  const remainingLength = 2 + 2 + topicBytes.length + 1

  const buf = new Uint8Array(2 + remainingLength)
  let i = 0
  buf[i++] = 0x82 // SUBSCRIBE
  buf[i++] = remainingLength
  buf[i++] = (packetId >> 8) & 0xff; buf[i++] = packetId & 0xff
  buf[i++] = (topicBytes.length >> 8) & 0xff; buf[i++] = topicBytes.length & 0xff
  for (const b of topicBytes) buf[i++] = b
  buf[i++] = 0x00 // QoS 0
  return buf
}

function decodeMqttPublish(data: ArrayBuffer): { topic: string; payload: string } | null {
  const buf = new Uint8Array(data)
  if ((buf[0] & 0xf0) !== 0x30) return null // Not PUBLISH
  let i = 1
  // Decode remaining length
  let multiplier = 1; let remainingLength = 0
  do { remainingLength += (buf[i] & 127) * multiplier; multiplier *= 128 } while (buf[i++] & 128)
  // Topic
  const topicLen = (buf[i] << 8) | buf[i + 1]; i += 2
  const topic = new TextDecoder().decode(buf.slice(i, i + topicLen)); i += topicLen
  // Payload
  const payload = new TextDecoder().decode(buf.slice(i))
  return { topic, payload }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export type IoTMessage = {
  topic: string
  payload: Record<string, any>
}

export function useIoT(
  topics: string[],
  onMessage: (msg: IoTMessage) => void
) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let ws: WebSocket | null = null
    let destroyed = false
    let pingInterval: ReturnType<typeof setInterval>

    const connect = async () => {
      try {
        const credentials = await getCognitoCredentials()
        const url = await getSignedUrl(credentials)

        ws = new WebSocket(url, ['mqtt'])
        wsRef.current = ws
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          if (destroyed) return
          const clientId = `mechair-web-${Math.random().toString(36).slice(2)}`
          ws!.send(encodeMqttConnect(clientId))
        }

        ws.onmessage = (event) => {
          if (destroyed) return
          const buf = event.data as ArrayBuffer
          const first = new Uint8Array(buf)[0]

          // CONNACK (0x20) — subscribe to all topics
          if ((first & 0xf0) === 0x20) {
            topics.forEach((topic, idx) => {
              ws!.send(encodeMqttSubscribe(topic, idx + 1))
            })
            // Ping every 30s to keep alive
            pingInterval = setInterval(() => {
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(new Uint8Array([0xC0, 0x00])) // PINGREQ
              }
            }, 30000)
          }

          // PUBLISH — decode and call handler
          const msg = decodeMqttPublish(buf)
          if (msg) {
            try {
              const payload = JSON.parse(msg.payload)
              onMessageRef.current({ topic: msg.topic, payload })
            } catch {}
          }
        }

        ws.onclose = () => {
          clearInterval(pingInterval)
          if (!destroyed) {
            // Reconnect after 3 seconds
            setTimeout(connect, 3000)
          }
        }

        ws.onerror = () => {
          ws?.close()
        }

      } catch (err) {
        console.error('IoT connect error:', err)
        if (!destroyed) setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      destroyed = true
      clearInterval(pingInterval)
      ws?.close()
      wsRef.current = null
    }
  }, [topics.join(',')])
}
