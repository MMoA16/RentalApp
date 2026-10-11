addEventListener('fetch', event => event.respondWith(handle(event.request)))

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
}

function normalizeLedgerPayload(payload) {
  if (!payload) return []

  if (Array.isArray(payload)) return payload

  if (payload && Array.isArray(payload.properties)) return payload.properties

  if (payload && Array.isArray(payload.entries)) return payload.entries

  return []
}

async function handle(request) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(request.url)

  if (url.pathname === '/' || url.pathname === '/health') {
    return new Response(JSON.stringify({
      ok: true,
      service: 'rental-manager-worker',
      dataModel: 'monthly-ledger',
      routes: ['/api/properties']
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }

  if (!url.pathname.startsWith('/api/properties')) return new Response('Not found', { status: 404 })

  if (request.method === 'GET') {
    const raw = await RENTAL_KV.get('shared')
    const parsed = raw ? JSON.parse(raw) : []
    const normalized = normalizeLedgerPayload(parsed)
    return new Response(JSON.stringify(normalized), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    const text = await request.text()
    const parsed = text ? JSON.parse(text) : []
    const normalized = normalizeLedgerPayload(parsed)
    await RENTAL_KV.put('shared', JSON.stringify(normalized))
    return new Response(JSON.stringify({ ok: true, count: normalized.length, dataModel: 'monthly-ledger' }), { headers: CORS })
  }

  return new Response('Method not allowed', { status: 405 })
}
