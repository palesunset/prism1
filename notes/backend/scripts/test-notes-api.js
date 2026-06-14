import assert from 'node:assert/strict';

const base = process.env.NOTES_API_BASE ?? 'http://127.0.0.1:3002/api/notes';

async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json };
}

async function main() {
  const health = await req('GET', '/health');
  assert.equal(health.status, 200);

  const created = await req('POST', '', { title: 'CI note', content: 'hello' });
  assert.equal(created.status, 201);
  assert.ok(created.json.id);

  const id = created.json.id;
  const listed = await req('GET', '/');
  assert.equal(listed.status, 200);
  assert.ok(listed.json.notes.some((n) => n.id === id));

  const updated = await req('PUT', `/${id}`, { content: 'updated' });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.content, 'updated');

  const pinned = await req('POST', `/${id}/pin`);
  assert.equal(pinned.status, 200);
  assert.equal(pinned.json.pinned, true);

  const removed = await req('DELETE', `/${id}`);
  assert.equal(removed.status, 204);

  console.log('Notes API tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
