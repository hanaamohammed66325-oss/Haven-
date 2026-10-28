import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteTokenFrom, joinPath } from "../src/lib/study/inviteLink";

const TOKEN = "0123456789abcdef0123456789abcdef";

test("a pasted invite link, message or bare token gives the token", () => {
  assert.equal(inviteTokenFrom(`https://havenstudent.com/join/?t=${TOKEN}`), TOKEN);
  assert.equal(inviteTokenFrom(`  https://havenstudent.com/join?t=${TOKEN.toUpperCase()}  `), TOKEN);
  assert.equal(inviteTokenFrom(`انضم إلى مجموعة «فيزياء» للدراسة معًا في Haven: https://havenstudent.com/join/?t=${TOKEN}`), TOKEN);
  assert.equal(inviteTokenFrom(`http://192.168.8.200:3000/join/?x=1&t=${TOKEN}`), TOKEN);
  assert.equal(inviteTokenFrom(TOKEN), TOKEN);
});

test("anything that is not an invite gives nothing", () => {
  for (const text of ["", "hello", `https://havenstudent.com/study/?g=${TOKEN}`, `https://havenstudent.com/join/?t=${TOKEN}0`,
    `https://havenstudent.com/join/?t=${TOKEN.slice(1)}`, `https://havenstudent.com/join/?token=${TOKEN}`]) {
    assert.equal(inviteTokenFrom(text), null, text);
  }
});

test("the app opens its own join page with the token", () => {
  assert.equal(joinPath(TOKEN), `/join/?t=${TOKEN}`);
});
