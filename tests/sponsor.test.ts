import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('sponsor QR is the unchanged Alipay image from the approved reference project',()=>{
  const qr=readFileSync(new URL('../public/alipay-sponsor-qr.jpg',import.meta.url));
  assert.equal(qr.length,130330);
  assert.equal(createHash('sha256').update(qr).digest('hex'),'a93281a8d3e6fe78122ccb9b7d045f60d68a7defd664ed51b2f1ccc32fcd54a4');
});
