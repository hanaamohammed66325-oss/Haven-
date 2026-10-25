import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementBounds, expandSelectionGroups, groupElements, reorderElements, strokeHitTest, ungroupElements } from '../src/lib/notes/ink';
import { constrainShapeEnd, recognizeHeldShape, shapePaths } from '../src/lib/notes/shapes';
import { emptyLibrary, newNotebook, NOTE_SHAPES, type InkStroke } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';
import { DEFAULT_INK_TUNING } from '../src/lib/notes/notesPreferences';

const sample = (tool: InkStroke['tool']): InkStroke => ({
  id: tool, kind: 'stroke', tool, color: '#243442', width: 3, pressure: false,
  points: [{ x: 100, y: 100, p: .5, t: 1 }, { x: 220, y: 180, p: .5, t: 2 }],
  fillColor: '#42766c', fillOpacity: .4,
});

test('every listed shape has editable finite geometry and validates for saved notebooks', () => {
  const notebook = newNotebook('Shapes');
  notebook.pages[0].elements = NOTE_SHAPES.map(sample);
  assert.doesNotThrow(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
  for (const shape of notebook.pages[0].elements as InkStroke[]) {
    const paths = shapePaths(shape);
    assert.ok(paths.length > 0, `${shape.tool} has a path`);
    assert.ok(paths.every(path => path.points.length >= 2 && path.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
    const bounds = elementBounds(shape);
    assert.ok(bounds.w > 0 && bounds.h > 0, `${shape.tool} has selectable bounds`);
  }
});

test('fill hits the interior only when visible; line and arrow remain unfilled', () => {
  const rectangle = sample('rectangle');
  assert.equal(strokeHitTest(rectangle, { x: 160, y: 140 }, 2), true);
  assert.equal(strokeHitTest({ ...rectangle, fillOpacity: 0 }, { x: 160, y: 140 }, 2), false);
  assert.equal(strokeHitTest(sample('line'), { x: 160, y: 140 }, 2), true);
  assert.equal(strokeHitTest(sample('arrow'), { x: 160, y: 145 }, 2), false);
});

test('square and circle constrain both sides; straight lines snap at 15 degree steps', () => {
  const start = { x: 100, y: 100 }, end = { x: 150, y: 120 };
  assert.deepEqual(constrainShapeEnd('square', start, end), { x: 150, y: 150 });
  assert.deepEqual(constrainShapeEnd('circle', start, { x: 50, y: 80 }), { x: 50, y: 50 });
  const snapped = constrainShapeEnd('line', start, end, true);
  assert.ok(Math.abs(Math.atan2(snapped.y - start.y, snapped.x - start.x) * 180 / Math.PI - 15) < .001);
});

test('shape style rejects invalid opacity and rounded corners without affecting legacy ink', () => {
  const notebook = newNotebook('Shapes');
  notebook.pages[0].elements = [sample('rectangle')];
  const library = { ...emptyLibrary(), notebooks: [notebook] };
  assert.doesNotThrow(() => validateNotesLibrary(library));
  (notebook.pages[0].elements[0] as InkStroke).fillOpacity = 2;
  assert.throws(() => validateNotesLibrary(library));
  (notebook.pages[0].elements[0] as InkStroke).fillOpacity = 0;
  (notebook.pages[0].elements[0] as InkStroke).cornerRadius = -1;
  assert.throws(() => validateNotesLibrary(library));
});

test('groups select together and retain one-step stacking order', () => {
  const shapes = [sample('rectangle'), sample('triangle'), sample('star')];
  const grouped = groupElements(shapes, ['rectangle', 'triangle'], 'group-1');
  assert.deepEqual(expandSelectionGroups(grouped, ['triangle']), ['rectangle', 'triangle']);
  assert.deepEqual(reorderElements(grouped, ['triangle'], 'forward').map(shape => shape.id), ['star', 'rectangle', 'triangle']);
  assert.deepEqual(reorderElements(grouped, ['rectangle'], 'backward').map(shape => shape.id), ['rectangle', 'triangle', 'star']);
  assert.ok(ungroupElements(grouped, ['rectangle']).every(shape => !shape.groupId));
});

test('draw-and-hold recognizes intentional lines and closed circles, leaving writing untouched', () => {
  const line = sample('pen');
  line.points = Array.from({ length: 9 }, (_, index) => ({ x: 100 + index * 20, y: 100 + index * 4, p: .5, t: index }));
  assert.equal(recognizeHeldShape(line)?.tool, 'line');
  const naturalLine = sample('pen');
  naturalLine.points = Array.from({ length: 13 }, (_, index) => ({ x: 100 + index * 12, y: 100 + index * 2 + Math.sin(index * 1.8) * 3, p: .5, t: index }));
  assert.equal(recognizeHeldShape(naturalLine)?.tool, 'line');
  const circle = sample('pencil');
  circle.points = Array.from({ length: 33 }, (_, index) => ({
    x: 170 + Math.cos(index * Math.PI / 16) * 65,
    y: 170 + Math.sin(index * Math.PI / 16) * 65,
    p: .5, t: index,
  }));
  assert.equal(recognizeHeldShape(circle)?.tool, 'circle');
  const writing = sample('pen');
  writing.points = [{ x: 100, y: 100, p: .5, t: 1 }, { x: 140, y: 105, p: .5, t: 2 }, { x: 115, y: 125, p: .5, t: 3 }, { x: 160, y: 135, p: .5, t: 4 }, { x: 130, y: 150, p: .5, t: 5 }, { x: 180, y: 158, p: .5, t: 6 }];
  assert.equal(recognizeHeldShape(writing), null);
});

test('saved pen settings and stylus angle are validated before persistence', () => {
  const notebook = newNotebook('Ink settings');
  notebook.pages[0].elements = [{ ...sample('pen'), tuning: DEFAULT_INK_TUNING, points: [{ x: 1, y: 2, p: .5, t: 1, angle: 359 }] }];
  const library = { ...emptyLibrary(), notebooks: [notebook] };
  assert.doesNotThrow(() => validateNotesLibrary(library));
  (notebook.pages[0].elements[0] as InkStroke).tuning = { ...DEFAULT_INK_TUNING, smoothing: 2 };
  assert.throws(() => validateNotesLibrary(library));
  (notebook.pages[0].elements[0] as InkStroke).tuning = DEFAULT_INK_TUNING;
  (notebook.pages[0].elements[0] as InkStroke).points[0].angle = 400;
  assert.throws(() => validateNotesLibrary(library));
});

test('held small lines snap straight and near-axis lines become exactly horizontal or vertical', () => {
  for (const vertical of [false, true]) {
    const line = sample('pen');
    line.points = Array.from({ length: 12 }, (_, i) => ({ x: 100 + (vertical ? Math.sin(i) * .8 : i * 3.5), y: 100 + (vertical ? i * 3.5 : Math.sin(i) * .8), p: .5, t: i }));
    const recognized = recognizeHeldShape(line)!;
    assert.equal(recognized.tool, 'line');
    assert.ok(Math.abs(recognized.points[0][vertical ? 'x' : 'y'] - recognized.points[1][vertical ? 'x' : 'y']) < .00001);
  }
});

test('held squares and circles have equal dimensions; tilted squares preserve their angle', () => {
  const outline = sample('pen');
  const corners = [[0,0],[60,0],[60,52],[0,52],[0,0]];
  outline.points = corners.slice(0,-1).flatMap(([x,y], edge) => Array.from({ length: 12 }, (_, i) => ({ x: 100+x+(corners[edge+1][0]-x)*i/12, y: 100+y+(corners[edge+1][1]-y)*i/12, p: .5, t: edge*12+i })));
  outline.points.push(outline.points[0]);
  for (const degrees of [0,30,45]) {
    const theta = degrees * Math.PI / 180;
    const rotated = { ...outline, points: outline.points.map(point => ({ ...point, x: 130 + (point.x-130)*Math.cos(theta) - (point.y-126)*Math.sin(theta), y: 126 + (point.x-130)*Math.sin(theta) + (point.y-126)*Math.cos(theta) })) };
    const recognized = recognizeHeldShape(rotated)!;
    assert.equal(recognized.tool, 'square');
    const [a,b] = recognized.points;
    assert.ok(Math.abs(Math.abs(b.x-a.x)-Math.abs(b.y-a.y)) < .00001);
    assert.ok(Math.abs((recognized.rotation ?? 0)-degrees) <= 3);
  }
  const circle = { ...outline, points: Array.from({ length: 49 }, (_, i) => ({ x: 100+27*Math.cos(i*Math.PI/24), y: 100+25*Math.sin(i*Math.PI/24), p: .5, t: i })) };
  const recognized = recognizeHeldShape(circle)!;
  assert.equal(recognized.tool, 'circle');
  assert.ok(Math.abs(recognized.points[1].x-recognized.points[0].x-recognized.points[1].y+recognized.points[0].y) < .00001);
});
