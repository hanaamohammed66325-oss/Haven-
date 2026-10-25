import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLine, lineTensor } from '../public/notes-handwriting/ctc.mjs';

test('English OCR keeps proportions, uses BGR normalization and zero right padding', () => {
  const pixels = new Uint8Array(8*4*4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([255,128,0,255],i);
  const input = lineTensor(pixels,8,4), plane = 48*320;
  assert.equal(input.width,320); assert.equal(input.data.length,3*plane);
  assert.equal(input.data[0],-1); assert.ok(Math.abs(input.data[plane]-(128/127.5-1))<.00001); assert.equal(input.data[2*plane],1);
  assert.equal(input.data[96],0); // 8:4 becomes 96:48, not 320:48 stretched text.
  const wide = lineTensor(new Uint8Array(800*40*4),800,40);
  assert.equal(wide.width,960);
});

test('CTC merges alternate alignments while preserving letters repeated across a blank', () => {
  const dictionary = ['', 'l', 'o', ' '];
  const probs = Float32Array.from([.01,.97,.01,.01, .01,.97,.01,.01, .97,.01,.01,.01, .01,.97,.01,.01, .01,.01,.97,.01]);
  assert.equal(decodeLine(probs,5,4,dictionary),'llo');
  assert.equal(decodeLine(Float32Array.from([.99,.003,.003,.004]),1,4,dictionary),'');
  // A greedy "a" path loses to the summed probabilities of the "b" prefix.
  assert.equal(decodeLine(Float32Array.from([.35,.4,.25, .4,.1,.5]),2,3,['','a','b']),'b');
});
