import type { InkPoint, NoteElement, NotePage, NoteTransform } from './types';

type Point = { x: number; y: number };

const normalizeRotation = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;

/** Rotate the editable page coordinates together with its PDF or paper background. */
export function rotateNotePage(page: NotePage, direction: 'clockwise' | 'counterclockwise'): NotePage {
  const clockwise = direction === 'clockwise';
  const angle = clockwise ? 90 : 270;
  const rotate = (point: Point): Point => clockwise
    ? { x: page.height - point.y, y: point.x }
    : { x: point.y, y: page.width - point.x };
  const rotateMatrix = (matrix: NoteTransform): NoteTransform => {
    const [a, b, c, d] = matrix;
    return [d, -c, -b, a];
  };
  const elements: NoteElement[] = page.elements.map(element => {
    if (element.kind === 'stroke') {
      const points: InkPoint[] = element.points.map(point => ({
        ...point, ...rotate(point),
        ...(point.angle === undefined ? {} : { angle: (point.angle + angle) % 360 }),
      }));
      const origin = element.transformOrigin ? rotate({ x: element.transformOrigin[0], y: element.transformOrigin[1] }) : null;
      return {
        ...element, points,
        ...(element.nibAngle === undefined ? {} : { nibAngle: (element.nibAngle + angle) % 360 }),
        ...(element.transform ? { transform: rotateMatrix(element.transform) } : {}),
        ...(origin ? { transformOrigin: [origin.x, origin.y] as [number, number] } : {}),
      };
    }
    const center = rotate({ x: element.x + element.w / 2, y: element.y + element.h / 2 });
    return {
      ...element, x: center.x - element.w / 2, y: center.y - element.h / 2,
      rotation: normalizeRotation((element.rotation ?? 0) + angle),
    };
  });
  return {
    ...page, width: page.height, height: page.width,
    rotation: ((page.rotation ?? 0) + angle) % 360 as NotePage['rotation'],
    elements,
  };
}
