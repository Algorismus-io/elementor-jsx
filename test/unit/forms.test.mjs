/**
 * Atomic forms — the kit's form API (e-form container + Pro field widgets). Envelope shapes
 * verified against atomic-form 4.1.4 + Pro 4.1.0 source and a live browser-submit probe
 * (2026-07-22): form saves, renders real <form>/<input>/<textarea>/<select>/<checkbox>/<button>,
 * and collect-submissions writes wp_e_submissions rows. Live E2E lives in integration/pro.test.mjs.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  form, field, formInput, formTextarea, formSelect, formCheckbox, formLabel, formSubmit,
  KV, EMAIL_ACTION, assertTree, S, N, B, sect, P0, SZ,
} from '../../../.claude/skills/elementor-ultra/lib/kit.mjs';
import { resetIds, allNodes, deskProps } from '../helpers.mjs';

beforeEach(() => resetIds());

test('KV: key-value envelope; value defaults to key', () => {
  assert.deepEqual(KV('mining', 'Mining'), { $$type: 'key-value', value: { key: S('mining'), value: S('Mining') } });
  assert.deepEqual(KV('Oil & Gas').value.value, S('Oil & Gas'));
});

test('EMAIL_ACTION: email envelope with defaults ([all-fields], html) and full optional set', () => {
  const min = EMAIL_ACTION({ to: 'a@b.c' });
  assert.equal(min.$$type, 'email');
  assert.deepEqual(min.value.to, S('a@b.c'));
  assert.deepEqual(min.value.message, S('[all-fields]'));
  assert.deepEqual(min.value['send-as'], S('html'));
  const full = EMAIL_ACTION({ to: 'a@b.c', subject: 'Hi', from: 'noreply@b.c', fromName: 'Site', replyTo: 'r@b.c', cc: 'c@b.c', bcc: 'b@b.c', sendAs: 'plain' });
  assert.deepEqual(full.value['from-name'], S('Site'));
  assert.deepEqual(full.value['reply-to'], S('r@b.c'));
  assert.deepEqual(full.value['send-as'], S('plain'));
});

test('formInput: settings shape — _cssid identity, type enum, required/readonly booleans', () => {
  const i = formInput('f-email', { type: 'email', required: true, placeholder: 'you@work.com' });
  assert.equal(i.widgetType, 'e-form-input');
  assert.deepEqual(i.settings._cssid, S('f-email'));
  assert.deepEqual(i.settings.type, S('email'));
  assert.deepEqual(i.settings.required, B(true));
  assert.deepEqual(i.settings.readonly, B(false));
  assert.deepEqual(i.settings.placeholder, S('you@work.com'));
});

test('formInput: rejects non-enum types at build (validator enum text|email|number|tel|password)', () => {
  assert.throws(() => formInput('x', { type: 'date' }), /enum is text\|email\|number\|tel\|password/);
  for (const t of ['text', 'email', 'number', 'tel', 'password']) formInput('x' + t, { type: t });
});

test('formTextarea: rows number envelope + resizable default', () => {
  const t = formTextarea('f-msg', { rows: 6, required: true });
  assert.equal(t.widgetType, 'e-form-textarea');
  assert.deepEqual(t.settings.rows, N(6));
  assert.deepEqual(t.settings.resizable, B(true));
  assert.deepEqual(t.settings._cssid, S('f-msg'));
});

test('formSelect: options accept strings and [value,label] pairs → options envelope of KVs', () => {
  const s = formSelect('industry', ['Oil & Gas', ['mining', 'Mining']], { required: true });
  assert.equal(s.widgetType, 'e-form-select');
  assert.deepEqual(s.settings.name, S('industry'));
  assert.equal(s.settings.options.$$type, 'options');
  assert.deepEqual(s.settings.options.value[0], KV('Oil & Gas'));
  assert.deepEqual(s.settings.options.value[1], KV('mining', 'Mining'));
  assert.deepEqual(s.settings.multiple, B(false));
});

test('formCheckbox / formLabel / formSubmit shapes', () => {
  const c = formCheckbox('consent', { required: true });
  assert.deepEqual(c.settings.value, S('on'));
  assert.deepEqual(c.settings.checked, B(false));
  const l = formLabel('f-name', 'Your name');
  assert.equal(l.widgetType, 'e-form-label');
  assert.deepEqual(l.settings['input-id'], S('f-name'));
  assert.equal(l.settings.text.value.content.value, 'Your name');
  const b = formSubmit('Send it');
  assert.equal(b.widgetType, 'e-form-submit-button');
  assert.deepEqual(b.settings.tag, S('button'));
  assert.equal(b.settings.text.value.content.value, 'Send it');
});

test('field: label+input pair, ids linked, full-width column', () => {
  const f = field('f-name', 'Your name', { required: true });
  const [label, input] = allNodes([f]).filter((n) => n.elType === 'widget');
  assert.equal(label.settings['input-id'].value, 'f-name');
  assert.equal(input.settings._cssid.value, 'f-name');
  assert.deepEqual(deskProps(f).width, SZ(100, '%'));
});

test('form: e-form element — name, action envelopes (FULL string envelopes in the array), email/webhook', () => {
  const f = form({ name: 'contact', actions: ['email', 'collect-submissions'], email: EMAIL_ACTION({ to: 'a@b.c' }), webhook: 'https://hooks.test/x' }, [formSubmit()]);
  assert.equal(f.elType, 'e-form');
  assert.deepEqual(f.settings['form-name'], S('contact'));
  // items are S() envelopes — bare strings 422 at the validator (live-probed)
  assert.deepEqual(f.settings['actions-after-submit'], { $$type: 'string-array', value: [S('email'), S('collect-submissions')] });
  assert.equal(f.settings.email.$$type, 'email');
  assert.deepEqual(f.settings.webhook_url, S('https://hooks.test/x'));
  assert.equal(f.elements.length, 1);
});

test('form: a full contact form composes and passes assertTree', () => {
  const page = [sect('section', { padding: P0, gap: SZ(16) }, [
    form({ name: 'contact', actions: ['collect-submissions'] }, [
      field('f-name', 'Your name', { required: true }),
      field('f-email', 'Work email', { type: 'email', required: true }),
      formSelect('industry', ['A', 'B']),
      formCheckbox('consent', { required: true }),
      formSubmit('Send message'),
    ]),
  ])];
  assert.doesNotThrow(() => assertTree(page));
});
