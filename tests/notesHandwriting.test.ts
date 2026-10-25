import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptedEnglish, acceptedLineEnglish, convertedElements, handwritingLines, recognitionInk, restoredInk } from '../src/lib/notes/handwriting';
import { noteFontFamily, noteFontSpec, validNoteFont } from '../src/lib/notes/fonts';
import { emptyLibrary, newNotebook, type InkStroke, type NoteText } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';

const stroke = (id: string, x: number, y: number, h = 20): InkStroke => ({ id, kind: 'stroke', tool: 'pen', width: 2.5, color: '#243442', pressure: true,
  points: [{ x, y, p: .4, t: 0 }, { x: x + 10, y: y + h, p: .7, t: 15 }] });

test('line recognition groups delayed dots with letters and orders separate English lines', () => {
  const strokes = [stroke('lower', 30, 85), stroke('letter', 10, 20), stroke('letter2', 30, 20), stroke('dot', 19, 16, 0)];
  const lines = handwritingLines(strokes);
  assert.equal(lines.length, 2);
  assert.deepEqual(new Set(lines[0].strokes.map(stroke => stroke.id)), new Set(['letter', 'letter2', 'dot']));
  assert.equal(lines[1].strokes[0].id, 'lower');
});

test('empty, unsupported and degenerate recognition results preserve original handwriting', () => {
  assert.equal(acceptedEnglish(' '), null); assert.equal(acceptedEnglish('العربية'), null); assert.equal(acceptedEnglish('...'), null); assert.equal(acceptedEnglish('123'), '123');
  assert.equal(acceptedEnglish('abcabcabcabcabcabcabc'), null);
  assert.equal(acceptedEnglish('  Biology   lecture 2. '), 'Biology lecture 2.');
  assert.equal(acceptedLineEnglish('HelpLearn to editCommunity.', { x: 0, y: 0, w: 224, h: 76 }), null);
  const page = newNotebook('test').pages[0]; page.elements = [stroke('one', 15, 20)];
  const lines = handwritingLines(page.elements as InkStroke[]), before = structuredClone(page);
  assert.equal(convertedElements(page, lines, [''], 'caveat', 24), null);
  assert.equal(convertedElements(page, lines, [], 'caveat', 24), null);
  assert.equal(convertedElements({ ...page, elements: [] }, lines, ['Lecture'], 'caveat', 24), null);
  assert.deepEqual(page, before);
});

test('conversion replaces only its sources atomically and keeps restorable ink through serialization', () => {
  const notebook = newNotebook('test'), page = notebook.pages[0];
  const untouched = stroke('untouched', 180, 180), selected = stroke('selected', 15, 20);
  page.elements = [untouched, selected];
  const elements = convertedElements(page, handwritingLines([selected]), ['Hello'], 'courgette', 24)!;
  assert.equal(elements[0], untouched);
  const text = elements[1] as NoteText; assert.equal(text.kind, 'text'); assert.equal(text.fontFamily, 'courgette');
  assert.deepEqual(text.sourceInk, [selected]); assert.notEqual(text.sourceInk![0].points, selected.points);
  page.elements = elements;
  const saved = JSON.parse(JSON.stringify({ ...emptyLibrary(), notebooks: [notebook] }));
  assert.doesNotThrow(() => validateNotesLibrary(saved));
  const restored = restoredInk({ ...text, x: text.x + 30, y: text.y + 40 });
  assert.equal(restored[0].points[0].p, selected.points[0].p);
  assert.notEqual(restored[0].id, selected.id);
  assert.equal(restored[0].points[0].x, selected.points[0].x + 30);
  assert.equal(restored[0].points[0].y, selected.points[0].y + 40);
  const rotated = restoredInk({ ...text, rotation: 90, transform: [1.2, 0, 0, .8] });
  assert.ok(Math.abs(rotated[0].transform![1] - 1.2) < .00001);
  assert.ok(Math.abs(rotated[0].transform![2] + .8) < .00001);
  const corrupt = structuredClone(saved); corrupt.notebooks[0].pages[0].elements[1].sourceInk = [text];
  assert.throws(() => validateNotesLibrary(corrupt));
});

test('font identity is shared and imported IDs cannot become arbitrary CSS or URLs', () => {
  for (const font of ['sans', 'serif', 'mono', 'courgette', 'freehand', 'caveat', 'kalam', 'patrickhand', 'dancingscript']) assert.ok(validNoteFont(font));
  assert.ok(validNoteFont('font:12345678-1234-4234-8234-123456789abc'));
  for (const invalid of ['url(https://example.com)', 'font:../../private', 'missing', undefined]) assert.equal(validNoteFont(invalid), false);
  assert.ok(noteFontSpec(24, { fontFamily: 'courgette' }).includes(noteFontFamily('courgette')));
});

test('underlines and isolated diagrams stay ink while neighboring letters and dots remain eligible', () => {
  const text: NoteText = { id: 'text', kind: 'text', text: 'like that', x: 10, y: 10, w: 120, h: 30, fontSize: 22, fontFamily: 'caveat', color: '#111' };
  const underline: InkStroke = { ...stroke('underline', 10, 45), points: Array.from({ length: 20 }, (_, i) => ({ x: 10 + i * 5, y: 45, p: .5, t: i * 10 })) };
  assert.equal(handwritingLines([underline], [text]).length, 0);
  const circle: InkStroke = { ...stroke('circle', 20, 100), points: Array.from({ length: 65 }, (_, i) => ({ x: 80 + 60 * Math.cos(i * Math.PI / 32), y: 160 + 60 * Math.sin(i * Math.PI / 32), p: .5, t: i * 10 })) };
  assert.equal(handwritingLines([circle]).length, 0);
  const letter = stroke('letter', 10, 20), dot: InkStroke = { ...stroke('dot', 16, 15), points: [{ x: 16, y: 15, p: .5, t: 20 }] };
  assert.equal(handwritingLines([dot]).length, 0);
  assert.deepEqual(new Set(handwritingLines([letter, dot])[0].strokes.map(stroke => stroke.id)), new Set(['letter', 'dot']));
});

test('recognition preserves the visible glyph geometry and source ink while normalizing only its color', () => {
  const original = stroke('normalized', 20, 30), before = structuredClone(original);
  original.tuning = { style: 'fountain', streamline: 1, smoothing: 1, pressureSensitivity: 1, tipFlatness: 1, tipSharpness: 1, speedSensitivity: 1 };
  const normalized = recognitionInk(handwritingLines([original])[0])[0];
  assert.equal(normalized.points, original.points);
  assert.equal(normalized.tuning!.style, 'fountain'); assert.equal(normalized.tuning!.streamline, 1);
  assert.equal(normalized.color, '#000000'); assert.equal(normalized.pressure, original.pressure);
  assert.deepEqual(original.points, before.points); assert.equal(original.tuning.tipFlatness, 1);
});
