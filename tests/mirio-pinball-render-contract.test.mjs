import test from 'node:test';
import assert from 'node:assert/strict';
import {buildToyShutter} from '../js/pinball-art.js';
import {MARBLE_CLOCK_GATE,MARBLE_TOYS,PINBALL_TABLE} from '../js/marble-rules.js';

// The rendered obstacle must occupy the same line and radius as its collision.
test('the cuckoo door matches its physical capsule',()=>{
  const spec=MARBLE_TOYS[PINBALL_TABLE.CLOCK],mesh=buildToyShutter(spec);
  mesh.geometry.computeBoundingBox();const {min,max}=mesh.geometry.boundingBox;
  assert.equal(mesh.position.x,spec.mouth.x);assert.equal(mesh.position.z,-spec.mouth.y);
  const tolerance=1e-6,reach=spec.mouth.radius+MARBLE_CLOCK_GATE.barRadius;
  assert.ok(Math.abs(min.x+reach)<tolerance);assert.ok(Math.abs(max.x-reach)<tolerance);
  assert.ok(Math.abs(min.z+MARBLE_CLOCK_GATE.barRadius)<tolerance);
  assert.ok(Math.abs(max.z-MARBLE_CLOCK_GATE.barRadius)<tolerance);
});

test('open garden and orbit entrances have no decorative blocking door',()=>{
  assert.equal(buildToyShutter(MARBLE_TOYS[PINBALL_TABLE.GARDEN]),null);
  assert.equal(buildToyShutter(MARBLE_TOYS[PINBALL_TABLE.MOON]),null);
});
