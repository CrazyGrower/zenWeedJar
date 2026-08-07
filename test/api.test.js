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
});
