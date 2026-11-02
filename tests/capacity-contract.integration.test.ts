import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_SET_ID,
  canApplyCapacityConfig,
  deriveRoomCapacity,
  validateStartCapacity,
} from "../packages/protocol/src/index.ts";

test("capacity contract blocks unsupported expansion and enforces base/expansion boundaries", () => {
  const baseOnly = {
    supportedSetIds: [BASE_SET_ID],
    enabledSetIds: [BASE_SET_ID],
  };
  const unsupportedEnabled = {
    supportedSetIds: [BASE_SET_ID],
    enabledSetIds: [BASE_SET_ID, "hts.expansion.not-built.v1"],
  };
  const supportedButDisabled = {
    supportedSetIds: [BASE_SET_ID, "hts.expansion.demo.v1"],
    enabledSetIds: [BASE_SET_ID],
  };
  const supportedAndEnabled = {
    supportedSetIds: [BASE_SET_ID, "hts.expansion.demo.v1"],
    enabledSetIds: [BASE_SET_ID, "hts.expansion.demo.v1"],
  };

  assert.equal(deriveRoomCapacity(baseOnly), 6);
  assert.equal(validateStartCapacity(1, baseOnly), false);
  assert.equal(validateStartCapacity(2, baseOnly), true);
  assert.equal(validateStartCapacity(6, baseOnly), true);
  assert.equal(validateStartCapacity(7, baseOnly), false);

  assert.equal(deriveRoomCapacity(unsupportedEnabled), 6);
  assert.equal(validateStartCapacity(7, unsupportedEnabled), false);
  assert.equal(deriveRoomCapacity(supportedButDisabled), 6);
  assert.equal(validateStartCapacity(7, supportedButDisabled), false);

  assert.equal(deriveRoomCapacity(supportedAndEnabled), 8);
  assert.equal(validateStartCapacity(7, supportedAndEnabled), true);
  assert.equal(validateStartCapacity(8, supportedAndEnabled), true);
  assert.equal(validateStartCapacity(9, supportedAndEnabled), false);
  assert.equal(canApplyCapacityConfig(7, baseOnly), false);
});
