import { emptyLibrary, newId, NOTE_SCROLL_DIRECTIONS, NOTE_ZOOM_LIMIT_RANGE, NOTE_SHAPES, type DrawingTool, type NoteElement, type NotePage, type NotesLibrary, type Notebook } from "./types";
import { validNoteFont } from './fonts';
import { withDeviceDataLock } from '../accountReset';
import { assertLocalScopeGeneration } from '../accountResetLocal';

async function writeScope<T>(scope: string, work: () => Promise<T>): Promise<T> {
  return withDeviceDataLock(async () => { await assertLocalScopeGeneration(scope); return work(); });
}

const DATABASE_NAME = "haven-notes";
// Version 2 keeps the exact stores while fencing pre-reset legacy writers.
const DATABASE_VERSION = 2;
const LIBRARIES_STORE = "libraries";
const ASSETS_STORE = "assets";
const STORES = [LIBRARIES_STORE, ASSETS_STORE];

export type NotesStorageErrorCode = "unavailable" | "blocked" | "incompatible" | "corrupt" | "failed";

/** A storage failure with a stable category for UI retry decisions. */
export class NotesStorageError extends Error {
  readonly code: NotesStorageErrorCode;
  readonly cause?: unknown;

  constructor(code: NotesStorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "NotesStorageError";
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Raised when the library changed after the caller read its revision. */
export class NotesConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number;

  constructor(expectedRevision: number, currentRevision: number) {
    super(`Notes changed in another tab (expected revision ${expectedRevision}, current revision ${currentRevision}).`);
    this.name = "NotesConflictError";
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface LibraryRecord {
  scope: string;
  library: NotesLibrary;
}

interface AssetRecord {
  scope: string;
  id: string;
  blob: Blob;
}

type ValidationSource = "stored" | "input";
type TransactionWork<T> = (
  transaction: IDBTransaction,
  done: (value: T) => void,
  fail: (error: unknown) => void,
) => void;

function validationError(source: ValidationSource, code: "corrupt" | "incompatible", message: string): never {
  if (source === "stored") throw new NotesStorageError(code, message);
  throw new TypeError(message);
}

function objectValue(value: unknown, path: string, source: ValidationSource): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    validationError(source, "corrupt", `${path} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string, source: ValidationSource): string {
  if (typeof value !== "string") validationError(source, "corrupt", `${path} is not a string.`);
  return value;
}

function idValue(value: unknown, path: string, source: ValidationSource): string {
  const result = stringValue(value, path, source);
  if (!result) validationError(source, "corrupt", `${path} is empty.`);
  return result;
}

function finiteNumber(value: unknown, path: string, source: ValidationSource): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    validationError(source, "corrupt", `${path} is not a finite number.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string, source: ValidationSource): number {
  const result = finiteNumber(value, path, source);
  if (!Number.isSafeInteger(result) || result < 0) {
    validationError(source, "corrupt", `${path} is not a non-negative integer.`);
  }
  return result;
}

function positiveNumber(value: unknown, path: string, source: ValidationSource): number {
  const result = finiteNumber(value, path, source);
  if (result <= 0) validationError(source, "corrupt", `${path} must be positive.`);
  return result;
}

function booleanValue(value: unknown, path: string, source: ValidationSource): boolean {
  if (typeof value !== "boolean") validationError(source, "corrupt", `${path} is not a boolean.`);
  return value;
}

function nullableString(value: unknown, path: string, source: ValidationSource): string | null {
  if (value === null) return null;
  return stringValue(value, path, source);
}

function arrayValue(value: unknown, path: string, source: ValidationSource): unknown[] {
  if (!Array.isArray(value)) validationError(source, "corrupt", `${path} is not an array.`);
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], path: string, source: ValidationSource): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    validationError(source, "corrupt", `${path} has an unsupported value.`);
  }
  return value as T;
}

const DRAWING_TOOLS = ["pen", "pencil", "highlighter", ...NOTE_SHAPES] as const satisfies readonly DrawingTool[];
const PAPER_STYLES = ["plain", "ruled", "grid", "dots"] as const;
const NOTEBOOK_COVERS = ["linen", "minimal", "arch", "none"] as const;

function validatePoint(value: unknown, path: string, source: ValidationSource): void {
  const point = objectValue(value, path, source);
  finiteNumber(point.x, `${path}.x`, source);
  finiteNumber(point.y, `${path}.y`, source);
  finiteNumber(point.p, `${path}.p`, source);
  finiteNumber(point.t, `${path}.t`, source);
  if (point.angle !== undefined) {
    const angle = finiteNumber(point.angle, `${path}.angle`, source);
    if (angle < 0 || angle >= 360) validationError(source, "corrupt", `${path}.angle is outside 0–360.`);
  }
}

function validateElement(value: unknown, path: string, source: ValidationSource): void {
  const element = objectValue(value, path, source) as Partial<NoteElement> & Record<string, unknown>;
  idValue(element.id, `${path}.id`, source);
  if (element.rotation !== undefined) {
    const rotation = finiteNumber(element.rotation, `${path}.rotation`, source);
    if (rotation < -180 || rotation > 180) validationError(source, "corrupt", `${path}.rotation is outside the supported range.`);
  }
  if (element.transform !== undefined) {
    const matrix = arrayValue(element.transform, `${path}.transform`, source);
    if (matrix.length !== 4) validationError(source, "corrupt", `${path}.transform must contain four coefficients.`);
    matrix.forEach((value, index) => finiteNumber(value, `${path}.transform[${index}]`, source));
    const [a, b, c, d] = matrix as number[];
    const determinant = a * d - b * c;
    if (!Number.isFinite(determinant) || determinant <= 0) validationError(source, "corrupt", `${path}.transform must be invertible and preserve orientation.`);
  }
  if (element.groupId !== undefined) idValue(element.groupId, `${path}.groupId`, source);
  if (element.kind === "stroke") {
    if (element.renderer !== undefined && element.renderer !== 2 && element.renderer !== 3 && element.renderer !== 4) validationError(source, "corrupt", `${path}.renderer has an unsupported value.`);
    if (element.shapePath !== undefined) {
      const fitted = objectValue(element.shapePath, `${path}.shapePath`, source);
      booleanValue(fitted.closed, `${path}.shapePath.closed`, source);
      if (!NOTE_SHAPES.includes(element.tool as typeof NOTE_SHAPES[number])) validationError(source, 'corrupt', `${path}.shapePath requires a geometric tool.`);
    }
    if (element.nibAngle !== undefined) {
      const angle = finiteNumber(element.nibAngle, `${path}.nibAngle`, source);
      if (angle < 0 || angle >= 360) validationError(source, "corrupt", `${path}.nibAngle is outside 0–360.`);
    }
    if (element.transformOrigin !== undefined) {
      const origin = arrayValue(element.transformOrigin, `${path}.transformOrigin`, source);
      if (origin.length !== 2) validationError(source, "corrupt", `${path}.transformOrigin must contain two coordinates.`);
      origin.forEach((value, index) => finiteNumber(value, `${path}.transformOrigin[${index}]`, source));
    }
    oneOf(element.tool, DRAWING_TOOLS, `${path}.tool`, source);
    stringValue(element.color, `${path}.color`, source);
    positiveNumber(element.width, `${path}.width`, source);
    if (element.fillColor !== undefined) stringValue(element.fillColor, `${path}.fillColor`, source);
    if (element.fillOpacity !== undefined) {
      const opacity = finiteNumber(element.fillOpacity, `${path}.fillOpacity`, source);
      if (opacity < 0 || opacity > 1) validationError(source, "corrupt", `${path}.fillOpacity is outside 0–1.`);
    }
    if (element.cornerRadius !== undefined) {
      const radius = finiteNumber(element.cornerRadius, `${path}.cornerRadius`, source);
      if (radius < 0 || radius > 1000) validationError(source, "corrupt", `${path}.cornerRadius is outside the supported range.`);
    }
    if (element.tuning !== undefined) {
      const tuning = objectValue(element.tuning, `${path}.tuning`, source);
      oneOf(tuning.style, ['fountain', 'ball', 'brush'], `${path}.tuning.style`, source);
      if (tuning.response !== undefined) {
        const response = finiteNumber(tuning.response, `${path}.tuning.response`, source);
        if (response < 0 || response > 1) validationError(source, 'corrupt', `${path}.tuning.response is outside 0–1.`);
      }
      for (const key of ['smoothing', 'streamline', 'pressureSensitivity', 'tipSharpness', 'tipFlatness', 'speedSensitivity']) {
        const amount = finiteNumber(tuning[key], `${path}.tuning.${key}`, source);
        if (amount < 0 || amount > 1) validationError(source, "corrupt", `${path}.tuning.${key} is outside 0–1.`);
      }
    }
    if (element.highlight !== undefined) {
      const highlight = objectValue(element.highlight, `${path}.highlight`, source);
      if (highlight.response !== undefined) {
        const response = finiteNumber(highlight.response, `${path}.highlight.response`, source);
        if (response < 0 || response > 1) validationError(source, 'corrupt', `${path}.highlight.response is outside 0–1.`);
      }
      for (const key of ['stabilization', 'opacity']) {
        const amount = finiteNumber(highlight[key], `${path}.highlight.${key}`, source);
        if (amount < 0 || amount > 1) validationError(source, "corrupt", `${path}.highlight.${key} is outside 0–1.`);
      }
      booleanValue(highlight.straight, `${path}.highlight.straight`, source);
    }
    booleanValue(element.pressure, `${path}.pressure`, source);
    const points = arrayValue(element.points, `${path}.points`, source);
    points.forEach((point, index) => validatePoint(point, `${path}.points[${index}]`, source));
    return;
  }
  if (element.kind === "text") {
    finiteNumber(element.x, `${path}.x`, source);
    finiteNumber(element.y, `${path}.y`, source);
    positiveNumber(element.w, `${path}.w`, source);
    positiveNumber(element.h, `${path}.h`, source);
    stringValue(element.text, `${path}.text`, source);
    positiveNumber(element.fontSize, `${path}.fontSize`, source);
    stringValue(element.color, `${path}.color`, source);
    if (element.fontFamily !== undefined && !validNoteFont(element.fontFamily)) validationError(source, 'corrupt', `${path}.fontFamily is unsupported.`);
    if (element.handwritingTool !== undefined) oneOf(element.handwritingTool, ['pen', 'pencil'], `${path}.handwritingTool`, source);
    if (element.sourceInk !== undefined) {
      const ink = arrayValue(element.sourceInk, `${path}.sourceInk`, source);
      if (!ink.length || ink.length > 256) validationError(source, 'corrupt', `${path}.sourceInk exceeds the supported range.`);
      ink.forEach((stroke, index) => {
        if (objectValue(stroke, `${path}.sourceInk[${index}]`, source).kind !== 'stroke') validationError(source, 'corrupt', `${path}.sourceInk must contain ink only.`);
        validateElement(stroke, `${path}.sourceInk[${index}]`, source);
      });
    }
    for (const key of ['bold', 'italic', 'underline', 'strikethrough']) {
      if (element[key] !== undefined) booleanValue(element[key], `${path}.${key}`, source);
    }
    if (element.alignment !== undefined) oneOf(element.alignment, ['auto', 'left', 'center', 'right'], `${path}.alignment`, source);
    if (element.lineSpacing !== undefined) {
      const spacing = finiteNumber(element.lineSpacing, `${path}.lineSpacing`, source);
      if (spacing < 1 || spacing > 3) validationError(source, 'corrupt', `${path}.lineSpacing is outside the supported range.`);
    }
    return;
  }
  if (element.kind === "image") {
    idValue(element.assetId, `${path}.assetId`, source);
    finiteNumber(element.x, `${path}.x`, source);
    finiteNumber(element.y, `${path}.y`, source);
    positiveNumber(element.w, `${path}.w`, source);
    positiveNumber(element.h, `${path}.h`, source);
    return;
  }
  validationError(source, "corrupt", `${path}.kind is unsupported.`);
}

function validatePage(value: unknown, path: string, source: ValidationSource): void {
  const page = objectValue(value, path, source);
  idValue(page.id, `${path}.id`, source);
  positiveNumber(page.width, `${path}.width`, source);
  positiveNumber(page.height, `${path}.height`, source);
  if (page.rotation !== undefined && ![0, 90, 180, 270].includes(finiteNumber(page.rotation, `${path}.rotation`, source))) {
    validationError(source, 'corrupt', `${path}.rotation is unsupported.`);
  }
  oneOf(page.paper, PAPER_STYLES, `${path}.paper`, source);
  stringValue(page.paperColor, `${path}.paperColor`, source);
  if (page.background !== undefined) {
    const background = objectValue(page.background, `${path}.background`, source);
    idValue(background.assetId, `${path}.background.assetId`, source);
    nonNegativeInteger(background.pageIndex, `${path}.background.pageIndex`, source);
  }
  const elements = arrayValue(page.elements, `${path}.elements`, source);
  elements.forEach((element, index) => validateElement(element, `${path}.elements[${index}]`, source));
  booleanValue(page.bookmarked, `${path}.bookmarked`, source);
  if (page.outlineTitle !== undefined) stringValue(page.outlineTitle, `${path}.outlineTitle`, source);
}

function validateNotebook(value: unknown, path: string, source: ValidationSource): void {
  const notebook = objectValue(value, path, source) as Partial<Notebook> & Record<string, unknown>;
  idValue(notebook.id, `${path}.id`, source);
  nullableString(notebook.folderId, `${path}.folderId`, source);
  if (notebook.dividerId !== undefined) stringValue(notebook.dividerId, `${path}.dividerId`, source);
  stringValue(notebook.title, `${path}.title`, source);
  stringValue(notebook.color, `${path}.color`, source);
  if (notebook.kind !== undefined) oneOf(notebook.kind, ['lecture', 'note'] as const, `${path}.kind`, source);
  oneOf(notebook.cover, NOTEBOOK_COVERS, `${path}.cover`, source);
  if (notebook.scrollDirection !== undefined) oneOf(notebook.scrollDirection, NOTE_SCROLL_DIRECTIONS, `${path}.scrollDirection`, source);
  if (notebook.zoomLimits !== undefined) {
    const limits = objectValue(notebook.zoomLimits, `${path}.zoomLimits`, source);
    const min = finiteNumber(limits.min, `${path}.zoomLimits.min`, source);
    const max = finiteNumber(limits.max, `${path}.zoomLimits.max`, source);
    if (min < NOTE_ZOOM_LIMIT_RANGE.min || max > NOTE_ZOOM_LIMIT_RANGE.max || min >= max) {
      validationError(source, "corrupt", `${path}.zoomLimits are outside the supported range.`);
    }
  }
  if (notebook.documentSettings !== undefined) {
    const settings = objectValue(notebook.documentSettings, `${path}.documentSettings`, source);
    if (settings.locked !== undefined) booleanValue(settings.locked, `${path}.documentSettings.locked`, source);
    if (settings.stylusPressure !== undefined) booleanValue(settings.stylusPressure, `${path}.documentSettings.stylusPressure`, source);
    if (settings.drawWithFinger !== undefined) booleanValue(settings.drawWithFinger, `${path}.documentSettings.drawWithFinger`, source);
    if (settings.palmRejection !== undefined) booleanValue(settings.palmRejection, `${path}.documentSettings.palmRejection`, source);
    if (settings.showStatusBar !== undefined) booleanValue(settings.showStatusBar, `${path}.documentSettings.showStatusBar`, source);
    if (settings.pullToAddPage !== undefined) booleanValue(settings.pullToAddPage, `${path}.documentSettings.pullToAddPage`, source);
    if (settings.autoAdvanceZoom !== undefined) booleanValue(settings.autoAdvanceZoom, `${path}.documentSettings.autoAdvanceZoom`, source);
    if (settings.autoScreenLock !== undefined) booleanValue(settings.autoScreenLock, `${path}.documentSettings.autoScreenLock`, source);
    if (settings.hoverPreview !== undefined) booleanValue(settings.hoverPreview, `${path}.documentSettings.hoverPreview`, source);
    if (settings.showImageTool !== undefined) booleanValue(settings.showImageTool, `${path}.documentSettings.showImageTool`, source);
    if (settings.toolbarTools !== undefined) {
      const toolbarTools = arrayValue(settings.toolbarTools, `${path}.documentSettings.toolbarTools`, source);
      toolbarTools.forEach((tool, index) => oneOf(tool, ['pen', 'pencil', 'highlighter', 'eraser', 'lasso', 'text', 'hand', 'line', 'rectangle', 'ellipse'], `${path}.documentSettings.toolbarTools[${index}]`, source));
      if (new Set(toolbarTools).size !== toolbarTools.length) validationError(source, 'corrupt', `${path}.documentSettings.toolbarTools contains duplicates.`);
    }
    booleanValue(settings.showPageNumbers, `${path}.documentSettings.showPageNumbers`, source);
    oneOf(settings.toolbarPosition, ['top', 'bottom', 'left', 'right'], `${path}.documentSettings.toolbarPosition`, source);
    oneOf(settings.sidebarPosition, ['start', 'end'], `${path}.documentSettings.sidebarPosition`, source);
    oneOf(settings.undoRedoPosition, ['header', 'toolbar'], `${path}.documentSettings.undoRedoPosition`, source);
  }
  const pages = arrayValue(notebook.pages, `${path}.pages`, source);
  pages.forEach((page, index) => validatePage(page, `${path}.pages[${index}]`, source));
  if (notebook.pageTrash !== undefined) {
    const trash = arrayValue(notebook.pageTrash, `${path}.pageTrash`, source);
    trash.forEach((entry, index) => {
      const item = objectValue(entry, `${path}.pageTrash[${index}]`, source);
      validatePage(item.page, `${path}.pageTrash[${index}].page`, source);
      nonNegativeInteger(item.index, `${path}.pageTrash[${index}].index`, source);
      finiteNumber(item.deletedAt, `${path}.pageTrash[${index}].deletedAt`, source);
    });
  }
  finiteNumber(notebook.createdAt, `${path}.createdAt`, source);
  finiteNumber(notebook.updatedAt, `${path}.updatedAt`, source);
  if (notebook.deletedAt !== null) finiteNumber(notebook.deletedAt, `${path}.deletedAt`, source);
  booleanValue(notebook.starred, `${path}.starred`, source);
}

function validateLibrary(value: unknown, source: ValidationSource): asserts value is NotesLibrary {
  const library = objectValue(value, "library", source);
  if (library.schema !== 1) validationError(source, "incompatible", "The stored Notes schema is unsupported.");
  nonNegativeInteger(library.revision, "library.revision", source);

  const folders = arrayValue(library.folders, "library.folders", source);
  folders.forEach((value, index) => {
    const folder = objectValue(value, `library.folders[${index}]`, source);
    idValue(folder.id, `library.folders[${index}].id`, source);
    nullableString(folder.parentId, `library.folders[${index}].parentId`, source);
    stringValue(folder.title, `library.folders[${index}].title`, source);
    stringValue(folder.color, `library.folders[${index}].color`, source);
    nullableString(folder.courseId, `library.folders[${index}].courseId`, source);
    if (folder.dividerId !== undefined) stringValue(folder.dividerId, `library.folders[${index}].dividerId`, source);
    if (folder.promptAtClass !== undefined) booleanValue(folder.promptAtClass, `library.folders[${index}].promptAtClass`, source);
  });

  if (library.dividers !== undefined) arrayValue(library.dividers, 'library.dividers', source).forEach((value, index) => {
    const divider = objectValue(value, `library.dividers[${index}]`, source);
    idValue(divider.id, `library.dividers[${index}].id`, source);
    stringValue(divider.title, `library.dividers[${index}].title`, source);
    nonNegativeInteger(divider.createdAt, `library.dividers[${index}].createdAt`, source);
  });

  const notebooks = arrayValue(library.notebooks, "library.notebooks", source);
  notebooks.forEach((value, index) => validateNotebook(value, `library.notebooks[${index}]`, source));
}

/** Validates a library supplied by the Notes UI before it is persisted. */
export function validateNotesLibrary(library: unknown): asserts library is NotesLibrary {
  validateLibrary(library, "input");
}

function validateScope(scope: string): void {
  if (typeof scope !== "string" || scope.trim().length === 0) {
    throw new TypeError("Notes storage scope must be a non-empty string.");
  }
}

function clonePage(page: NotePage): NotePage {
  return {
    ...page,
    background: page.background ? { ...page.background } : undefined,
    elements: page.elements.map((element) => {
      if (element.kind === "stroke") return { ...element, ...(element.shapePath ? { shapePath: { ...element.shapePath } } : {}), points: element.points.map((point) => ({ ...point })) };
      if (element.kind === 'text' && element.sourceInk) return { ...element, sourceInk: element.sourceInk.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })) };
      return { ...element };
    }),
  };
}

function cloneLibrary(library: NotesLibrary, revision = library.revision): NotesLibrary {
  return {
    schema: 1,
    revision,
    dividers: library.dividers?.map(divider => ({ ...divider })),
    folders: library.folders.map((folder) => ({ ...folder })),
    notebooks: library.notebooks.map((notebook) => ({
      ...notebook,
      pages: notebook.pages.map(clonePage),
      pageTrash: notebook.pageTrash?.map(entry => ({ ...entry, page: clonePage(entry.page) })),
    })),
  };
}

function readLibraryRecord(value: unknown, scope: string): NotesLibrary {
  const record = objectValue(value, "library record", "stored");
  if (record.scope !== scope) throw new NotesStorageError("corrupt", "The stored Notes scope does not match the requested scope.");
  validateLibrary(record.library, "stored");
  return cloneLibrary(record.library);
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function readAssetRecord(value: unknown, scope: string, id: string): Blob {
  const record = objectValue(value, "asset record", "stored") as Partial<AssetRecord> & Record<string, unknown>;
  if (record.scope !== scope || record.id !== id) {
    throw new NotesStorageError("corrupt", "The stored Notes asset scope does not match the requested scope.");
  }
  if (!isBlob(record.blob)) throw new NotesStorageError("corrupt", "The stored Notes asset is not a Blob.");
  return record.blob;
}

function openDatabase(): Promise<IDBDatabase> {
  const factory = (globalThis as typeof globalThis & { indexedDB?: IDBFactory }).indexedDB;
  if (!factory) return Promise.reject(new NotesStorageError("unavailable", "IndexedDB is unavailable in this environment."));

  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    let blocked = false;
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(new NotesStorageError("unavailable", "Notes storage could not be opened.", error));
      return;
    }
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    request.onupgradeneeded = () => {
      try {
        const database = request.result;
        if (!database.objectStoreNames.contains(LIBRARIES_STORE)) {
          database.createObjectStore(LIBRARIES_STORE, { keyPath: "scope" });
        }
        if (!database.objectStoreNames.contains(ASSETS_STORE)) {
          database.createObjectStore(ASSETS_STORE, { keyPath: ["scope", "id"] });
        }
      } catch (error) {
        try {
          request.transaction?.abort();
        } catch {
          // The open request will still report the upgrade failure.
        }
        rejectOnce(new NotesStorageError("incompatible", "The Notes storage schema could not be created.", error));
      }
    };
    request.onblocked = () => {
      blocked = true;
      rejectOnce(new NotesStorageError("blocked", "Notes storage is blocked by another open database connection."));
    };
    request.onerror = () => {
      rejectOnce(request.error ?? new NotesStorageError("failed", "Notes storage could not be opened."));
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (blocked || settled) {
        database.close();
        return;
      }
      settled = true;
      resolve(database);
    };
  });
}

function transaction<T>(mode: IDBTransactionMode, work: TransactionWork<T>): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    let idbTransaction: IDBTransaction;
    try {
      idbTransaction = database.transaction(STORES, mode);
    } catch (error) {
      database.close();
      reject(new NotesStorageError("failed", "The Notes storage transaction could not be started.", error));
      return;
    }

    let value: T | undefined;
    let hasValue = false;
    let operationError: unknown;
    let settled = false;

    const close = () => database.close();
    const fail = (error: unknown) => {
      if (operationError === undefined) operationError = error;
      try {
        idbTransaction.abort();
      } catch {
        if (!settled) {
          settled = true;
          close();
          reject(operationError);
        }
      }
    };
    const done = (nextValue: T) => {
      value = nextValue;
      hasValue = true;
    };

    idbTransaction.oncomplete = () => {
      close();
      if (settled) return;
      settled = true;
      if (operationError !== undefined) {
        reject(operationError);
      } else if (!hasValue) {
        reject(new NotesStorageError("failed", "The Notes transaction completed without a result."));
      } else {
        resolve(value as T);
      }
    };
    idbTransaction.onabort = () => {
      close();
      if (settled) return;
      settled = true;
      reject(operationError ?? idbTransaction.error ?? new NotesStorageError("failed", "The Notes transaction was aborted."));
    };
    // Request errors normally abort the transaction. Wait for onabort so a
    // failed write can never be reported as a successful commit.
    idbTransaction.onerror = () => {};

    try {
      work(idbTransaction, done, fail);
    } catch (error) {
      fail(error);
    }
  }));
}

export function loadLibrary(scope: string): Promise<NotesLibrary> {
  try {
    validateScope(scope);
  } catch (error) {
    return Promise.reject(error);
  }
  return transaction<NotesLibrary>("readonly", (idbTransaction, done, fail) => {
    const store = idbTransaction.objectStore(LIBRARIES_STORE);
    let request: IDBRequest<unknown>;
    try {
      request = store.get(scope);
    } catch (error) {
      fail(error);
      return;
    }
    request.onerror = () => fail(request.error ?? new NotesStorageError("failed", "Notes library could not be read."));
    request.onsuccess = () => {
      try {
        done(request.result === undefined ? emptyLibrary() : readLibraryRecord(request.result, scope));
      } catch (error) {
        fail(error);
      }
    };
  });
}

export function saveLibrary(scope: string, library: NotesLibrary, expectedRevision: number): Promise<number> {
  try {
    validateScope(scope);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new TypeError("Notes expectedRevision must be a non-negative integer.");
    }
    validateNotesLibrary(library);
  } catch (error) {
    return Promise.reject(error);
  }

  return writeScope(scope, () => transaction<number>("readwrite", (idbTransaction, done, fail) => {
    const store = idbTransaction.objectStore(LIBRARIES_STORE);
    let request: IDBRequest<unknown>;
    try {
      request = store.get(scope);
    } catch (error) {
      fail(error);
      return;
    }
    request.onerror = () => fail(request.error ?? new NotesStorageError("failed", "Notes library could not be read before saving."));
    request.onsuccess = () => {
      try {
        const currentRevision = request.result === undefined ? 0 : readLibraryRecord(request.result, scope).revision;
        if (currentRevision !== expectedRevision) {
          fail(new NotesConflictError(expectedRevision, currentRevision));
          return;
        }
        const nextRevision = currentRevision + 1;
        const nextLibrary = cloneLibrary(library, nextRevision);
        const put = store.put({ scope, library: nextLibrary } satisfies LibraryRecord);
        put.onerror = () => fail(put.error ?? new NotesStorageError("failed", "Notes library could not be saved."));
        done(nextRevision);
      } catch (error) {
        fail(error);
      }
    };
  }));
}

export function saveAsset(scope: string, blob: Blob): Promise<string> {
  try {
    validateScope(scope);
    if (!isBlob(blob)) throw new TypeError("Notes assets must be Blob instances.");
  } catch (error) {
    return Promise.reject(error);
  }
  let id: string;
  try { id = newId(); }
  catch (error) { return Promise.reject(new NotesStorageError("unavailable", "Secure asset identifiers are unavailable.", error)); }

  return writeScope(scope, () => transaction<string>("readwrite", (idbTransaction, done, fail) => {
    const store = idbTransaction.objectStore(ASSETS_STORE);
    try {
      const put = store.put({ scope, id, blob } satisfies AssetRecord);
      put.onerror = () => fail(put.error ?? new NotesStorageError("failed", "Notes asset could not be saved."));
      done(id);
    } catch (error) {
      fail(error);
    }
  }));
}

export function loadAsset(scope: string, id: string): Promise<Blob | null> {
  try {
    validateScope(scope);
    if (typeof id !== "string" || id.length === 0) throw new TypeError("Notes asset id must be a non-empty string.");
  } catch (error) {
    return Promise.reject(error);
  }

  return transaction<Blob | null>("readonly", (idbTransaction, done, fail) => {
    const store = idbTransaction.objectStore(ASSETS_STORE);
    let request: IDBRequest<unknown>;
    try {
      request = store.get([scope, id]);
    } catch (error) {
      fail(error);
      return;
    }
    request.onerror = () => fail(request.error ?? new NotesStorageError("failed", "Notes asset could not be read."));
    request.onsuccess = () => {
      try {
        done(request.result === undefined ? null : readAssetRecord(request.result, scope, id));
      } catch (error) {
        fail(error);
      }
    };
  });
}
