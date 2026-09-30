import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLocalEndpoint, validateQuiz } from '../validation.js';
import { parseHost, parseFileId } from '../context_utils.js';
import fs from 'node:fs';

test('AI requests stay on the permitted loopback service', () => {
  assert.equal(validateLocalEndpoint('http://localhost:10086/v1/chat/completions'), 'http://localhost:10086/v1/chat/completions');
  for (const url of ['https://example.com', 'http://localhost:9999', 'http://user:pass@localhost:10086', 'file:///tmp/data']) assert.throws(() => validateLocalEndpoint(url));
});
test('quiz validation preserves zero points and rejects unusable model output', () => {
  const good = {title:'Quiz', questions:[{title:'Name',type:'short_answer',points:0},{title:'Pick',type:'multiple_choice',options:['A','B'],correctAnswer:'A',points:1}]};
  assert.equal(validateQuiz(good),good);
  for (const q of [{...good,questions:[]},{...good,questions:[{title:'Pick',type:'multiple_choice',options:['A',' A ']}]},{...good,questions:[{...good.questions[1],correctAnswer:'C'}]},{...good,questions:[{...good.questions[0],points:-1}]}]) assert.throws(() => validateQuiz(q));
});
test('workspace context identifies source documents', () => {
  const url='https://docs.google.com/presentation/d/abc_123/edit';
  assert.equal(parseHost(url),'slides');
  assert.equal(parseFileId(url),'abc_123');
  assert.equal(parseHost('https://example.com/document/d/abc/edit'),'unknown');
});
test('manifest references available assets', () => {
  const root = new URL('../',import.meta.url);
  const m=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
  for (const file of [m.background.service_worker,...Object.values(m.icons),...m.content_scripts.flatMap(c=>c.js)]) assert.ok(fs.existsSync(new URL(file,root)), file);
});
