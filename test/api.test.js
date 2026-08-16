import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDb } from '../db.js';
import { createApp } from '../app.js';

function appWithDb() { return createApp(openDb(':memory:')); }

test('GET /api/jars returns the seeds', async () => {
  const res = await request(appWithDb()).get('/api/jars');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 4);
});

test('POST /api/jars creates a jar', async () => {
  const app = appWithDb();
  const res = await request(app).post('/api/jars').send({ name: 'Kush', weight_g: 10 });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Kush');
  const list = await request(app).get('/api/jars');
  assert.equal(list.body.length, 5);
});

test('POST /api/jars rejects invalid payload with 400', async () => {
  const res = await request(appWithDb()).post('/api/jars').send({ weight_g: 5 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('PUT /api/jars/:id updates a jar', async () => {
  const app = appWithDb();
  const first = (await request(app).get('/api/jars')).body[0];
  const res = await request(app).put(`/api/jars/${first.id}`).send({ weight_g: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body.weight_g, 1);
});

test('PUT /api/jars/:id returns 404 for unknown id', async () => {
  const res = await request(appWithDb()).put('/api/jars/9999').send({ weight_g: 1 });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'jar not found');
});

test('DELETE /api/jars/:id removes a jar', async () => {
  const app = appWithDb();
  const first = (await request(app).get('/api/jars')).body[0];
  const res = await request(app).delete(`/api/jars/${first.id}`);
  assert.equal(res.status, 204);
  const list = await request(app).get('/api/jars');
  assert.equal(list.body.length, 3);
});

test('DELETE /api/jars/:id returns 404 for unknown id', async () => {
  const res = await request(appWithDb()).delete('/api/jars/9999');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'jar not found');
});

test('malformed JSON body yields a JSON error body, not an HTML stack trace', async () => {
  const res = await request(appWithDb())
    .post('/api/jars')
    .set('Content-Type', 'application/json')
    .send('{not valid json');
  assert.equal(res.status, 400);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(typeof res.body.error, 'string');
  assert.ok(res.body.error.length > 0);
});

test('GET /api/events returns an empty array on a fresh db', async () => {
  const res = await request(appWithDb()).get('/api/events');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('a created jar shows up in the journal', async () => {
  const app = appWithDb();
  await request(app).post('/api/jars').send({ name: 'Kush', weight_g: 10 });
  const res = await request(app).get('/api/events');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].kind, 'add');
  assert.equal(res.body[0].jar_name, 'Kush');
  assert.equal(res.body[0].delta_g, 10);
  assert.equal(res.body[0].total_after_g, 247);
});

test('GET /api/events?limit=N returns the N most recent', async () => {
  const app = appWithDb();
  await request(app).post('/api/jars').send({ name: 'One', weight_g: 1 });
  await request(app).post('/api/jars').send({ name: 'Two', weight_g: 2 });
  await request(app).post('/api/jars').send({ name: 'Three', weight_g: 3 });
  const res = await request(app).get('/api/events?limit=2');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((e) => e.jar_name), ['Three', 'Two']);
});

test('GET /api/events rejects a nonsense limit with 400', async () => {
  const app = appWithDb();
  for (const limit of ['abc', '0', '-3', '1.5', '', '9999']) {
    const res = await request(app).get(`/api/events?limit=${limit}`);
    assert.equal(res.status, 400, `limit=${limit} should be rejected`);
    assert.ok(res.body.error);
  }
});
