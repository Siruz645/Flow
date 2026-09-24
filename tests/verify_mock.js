import { Flow } from './src/mock-flow-sdk.js';

async function testMock() {
  console.log('[Test] Testing Mock Flow SDK methods...');
  const gen = await Flow.generate.image({
    prompt: 'make elephant',
    modelDisplayName: '🍌 Nano Banana Pro'
  });
  console.log('[Test] Flow.generate.image result:', {
    hasMediaId: !!gen.mediaId,
    mimeType: gen.mimeType,
    base64Len: gen.base64.length
  });
  assert(gen.mediaId, 'mediaId must be present');

  const up = await Flow.upload({
    base64: gen.base64,
    mimeType: gen.mimeType,
    name: 'test upload'
  });
  console.log('[Test] Flow.upload result:', {
    hasMediaId: !!up.mediaId,
    mimeType: up.mimeType
  });
  assert(up.mediaId, 'uploaded mediaId must be present');

  console.log('[Test] ✅ ALL MOCK FLOW SDK METHODS WORK PERFECTLY!');
}

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

testMock().catch(console.error);
