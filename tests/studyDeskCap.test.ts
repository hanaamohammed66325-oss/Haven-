import { test } from "node:test";
import assert from "node:assert/strict";
import { validDesks } from "../src/lib/study/rules";
import { DemoStudyServer, DEMO_GROUP } from "../src/lib/study/demo";

test("desk cap counts registered members, not online members", async () => {
  const server = new DemoStudyServer("Owner", "#a8d98a", "#edb7c8", 0);
  server.members.splice(3);
  assert.equal(validDesks(3, 3), true);
  assert.equal(validDesks(4, 3), false);
  assert.equal(validDesks(2, 1), false);
  assert.equal(validDesks(11, 12), false);
  await assert.rejects(server.transport.openSitting(DEMO_GROUP, 4), /invalid_desks/);
  await server.transport.openSitting(DEMO_GROUP, 3);
  await assert.rejects(server.transport.setDesks(DEMO_GROUP, 4), /invalid_desks/);
  await server.transport.setDesks(DEMO_GROUP, 2);
  server.members.splice(2);
  await assert.rejects(server.transport.setDesks(DEMO_GROUP, 3), /invalid_desks/);
});
