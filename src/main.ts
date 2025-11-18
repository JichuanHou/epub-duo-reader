const fileInput = getElement<HTMLInputElement>('fileInput');
const dropZone = getElement<HTMLDivElement>('dropZone');
const dropZoneLabel = dropZone.querySelector('p');
const viewer = getElement<HTMLDivElement>('viewer');
const nextBtn = getElement<HTMLButtonElement>('nextBtn');
const prevBtn = getElement<HTMLButtonElement>('prevBtn');
const tocList = getElement<HTMLUListElement>('tocList');
const fontFamilySelect = getElement<HTMLSelectElement>('fontFamily');
const fontSmaller = getElement<HTMLButtonElement>('fontSmaller');
const fontLarger = getElement<HTMLButtonElement>('fontLarger');
const progressLabel = getElement<HTMLSpanElement>('progressLabel');
const progressSlider = getElement<HTMLInputElement>('progressSlider');
const readingArea = getElement<HTMLElement>('readingArea');
const readerControls = getElement<HTMLDivElement>('readerControls');
const layoutToggle = getElement<HTMLButtonElement>('layoutToggle');
const languageSelect = getElement<HTMLSelectElement>('languageSelect');
const providerSelect = getElement<HTMLSelectElement>('providerSelect');
const modelInput = getElement<HTMLInputElement>('modelInput');
const apiEndpointInput = getElement<HTMLInputElement>('apiEndpointInput');
const apiKeyInput = getElement<HTMLInputElement>('apiKeyInput');
const translateBtn = getElement<HTMLButtonElement>('translateBtn');
const translationStatus = getElement<HTMLDivElement>('translationStatus');
const translationOutput = getElement<HTMLDivElement>('translationOutput');
const settingsDialog = getElement<HTMLDivElement>('translationSettings');
const openSettingsBtn = getElement<HTMLButtonElement>('openSettingsBtn');
const closeSettingsBtn = getElement<HTMLButtonElement>('closeSettingsBtn');
const libraryOverlay = getElement<HTMLDivElement>('libraryOverlay');
const closeLibraryBtn = getElement<HTMLButtonElement>('closeLibraryBtn');
const openLibraryBtn = getElement<HTMLButtonElement>('openLibraryBtn');
const addLibraryBookBtn = getElement<HTMLButtonElement>('addLibraryBookBtn');
const addLibraryBookFooter = getElement<HTMLButtonElement>('addLibraryBookFooter');
const libraryList = getElement<HTMLUListElement>('libraryList');
const libraryEmpty = getElement<HTMLDivElement>('libraryEmpty');
const readerLoading = getElement<HTMLDivElement>('readerLoading');
const readerLoadingText = getElement<HTMLParagraphElement>('readerLoadingText');

let sliderInteracting = false;
let controlsVisible = false;
let translationAbortController: AbortController | null = null;
const sessionTranslationCache = new Map<string, string>();
const scrollSyncCleanup: Array<() => void> = [];

const state: ReaderState = {
  book: null,
  rendition: null,
  toc: [],
  fileName: '',
  fontScale: 100,
  locationsReady: false,
  currentHref: '',
  targetLanguage: 'es',
  provider: 'openai',
  customEndpoint: '',
  customModel: 'gpt-4o-mini',
  libraryEntryId: null,
  pendingDisplayCfi: null,
  currentChapterId: null,
  lastScrollPercent: 0,
  focusMode: false,
};

const FONT_PRESETS: FontPreset[] = [
  { label: 'Publisher default', value: 'inherit' },
  { label: 'Inter (sans)', value: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  { label: 'Merriweather (serif)', value: "'Merriweather', 'Georgia', serif" },
  { label: 'Source Code (mono)', value: "'Source Code Pro', 'SFMono-Regular', Menlo, monospace" },
];

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh-Hans', label: 'Chinese (Simplified)' },
];

type Provider = 'openai' | 'custom';

interface ProviderOption {
  value: Provider;
  label: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: 'Custom endpoint' },
];

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const LIBRARY_DB_NAME = 'epub-duo-library';
const LIBRARY_STORE = 'books';
const TRANSLATION_STORE = 'translations';
const STORAGE_KEYS = {
  apiKey: 'epub-duo-openai-key',
  provider: 'epub-duo-provider',
  endpoint: 'epub-duo-endpoint',
  customModel: 'epub-duo-custom-model',
  focusMode: 'epub-duo-focus-mode',
  language: 'epub-duo-language',
  fontScale: 'epub-duo-font-scale',
};

let libraryDbPromise: Promise<IDBDatabase> | null = null;
let libraryCache: LibraryBookSummary[] = [];

const LIGHT_THEME: RenditionTheme = {
  body: {
    background: '#ffffff',
    color: '#1b1f32',
    padding: '1.5rem',
    lineHeight: 1.5,
  },
};

const DARK_THEME: RenditionTheme = {
  body: {
    background: '#0f111a',
    color: '#f5f6fb',
    padding: '1.5rem',
    lineHeight: 1.5,
  },
};

interface ReaderState {
  book: Book | null;
  rendition: Rendition | null;
  toc: TocItem[];
  fileName: string;
  fontScale: number;
  locationsReady: boolean;
  currentHref: string;
  targetLanguage: string;
  provider: Provider;
  customEndpoint: string;
  customModel: string;
  libraryEntryId: string | null;
  pendingDisplayCfi: string | null;
  currentChapterId: string | null;
  lastScrollPercent: number;
  focusMode: boolean;
}

interface FontPreset {
  label: string;
  value: string;
}

interface LanguageOption {
  label: string;
  value: string;
}

interface LibraryBookSummary {
  id: string;
  title: string;
  author: string;
  fileName: string;
  addedAt: number;
  lastProgress?: number;
}

interface LibraryRecord extends LibraryBookSummary {
  blob: Blob;
  lastCfi?: string;
}

interface LoadBookOptions {
  libraryId?: string | null;
  skipLibrarySave?: boolean;
  restoreCfi?: string | null;
}


function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

function destroyBook(): void {
  if (state.rendition) {
    state.rendition.destroy();
  }
  if (state.book) {
    state.book.destroy();
  }
  state.book = null;
  state.rendition = null;
  state.toc = [];
  state.locationsReady = false;
  state.currentHref = '';
  translationAbortController?.abort();
  translationAbortController = null;
  while (scrollSyncCleanup.length) {
    const cleanup = scrollSyncCleanup.pop();
    cleanup?.();
  }
  progressSlider.value = '0';
  progressSlider.disabled = true;
  progressLabel.textContent = '0%';
  translationOutput.textContent = '';
  updateTranslationStatus('No translation yet.');
  setDropZoneVisibility(true);
  if (dropZoneLabel) {
    dropZoneLabel.textContent = 'Drop EPUB file here';
  }
  state.libraryEntryId = null;
  state.pendingDisplayCfi = null;
  updateLibraryCloseAvailability();
  resetChapterList();
}

async function handleFile(file: File | undefined | null, options: LoadBookOptions = {}): Promise<void> {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.epub')) {
    alert('Please select a .epub file.');
    return;
  }

  try {
    showReaderLoading(options.libraryId ? 'Opening last location…' : 'Preparing book…');
    dropZone.classList.add('active');
    destroyBook();
    const buffer = await file.arrayBuffer();
    state.pendingDisplayCfi = options.restoreCfi ?? null;
    state.book = window.ePub(buffer);
    state.fileName = file.name.replace(/\.epub$/i, '');
    sliderInteracting = false;
    progressSlider.disabled = true;
    progressSlider.value = '0';
    progressLabel.textContent = '0%';
    viewer.innerHTML = '';
    state.rendition = state.book.renderTo('viewer', {
      width: '100%',
      height: '100%',
      flow: 'scrolled-doc',
      allowScriptedContent: true,
    });

    state.rendition.themes.register('light', LIGHT_THEME);
    state.rendition.themes.register('dark', DARK_THEME);
    state.rendition.themes.select('light');
    applyFontFromSelect();
    applyFontScale();
    bindRenditionShortcuts();
    state.rendition.on('relocated', handleRelocated);
    state.rendition.on('rendered', (content: any) => bindScrollSync(content));
    await state.rendition.display();

    const metadata = await state.book.loaded.metadata;
    updateMetadata(metadata);

    if (options.skipLibrarySave) {
      state.libraryEntryId = options.libraryId ?? null;
    } else {
      state.libraryEntryId = await saveBookToLibrary(buffer, metadata, file.name);
      await refreshLibraryList();
    }

    await state.book.ready;
    state.toc = state.book.navigation?.toc ?? [];
    populateToc();
    await prepareLocations();
    if (state.pendingDisplayCfi) {
      try {
        await state.rendition.display(state.pendingDisplayCfi);
      } catch (error) {
        console.warn('Unable to restore last location', error);
      }
      state.pendingDisplayCfi = null;
    }

    dropZone.classList.remove('active');
    if (dropZoneLabel) {
      dropZoneLabel.textContent = 'Drop more EPUB files to switch books';
    }
    setDropZoneVisibility(false);
    hideLibraryOverlay();
    updateLibraryCloseAvailability();
  } catch (error) {
    console.error(error);
    alert('Unable to load EPUB file. Please make sure it is valid.');
  } finally {
    hideReaderLoading();
  }
}

function updateMetadata(_: BookMetadata): void {
  // Intentionally no-op for now; metadata panel removed in this layout.
}

function resetChapterList(): void {
  tocList.innerHTML = '<li class="placeholder">Load a book to see its chapters.</li>';
}

function populateToc(): void {
  tocList.innerHTML = '';
  if (!state.toc.length) {
    const empty = document.createElement('li');
    empty.className = 'placeholder';
    empty.textContent = 'No chapters available';
    tocList.append(empty);
    return;
  }

  state.toc.forEach((item) => addTocEntry(item));
}

function addTocEntry(item: TocItem, depth = 0): void {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.href = item.href;
  button.textContent = item.label?.trim() || 'Untitled section';
  button.style.paddingLeft = `${0.75 + depth * 0.75}rem`;
  button.addEventListener('click', async () => {
    if (!state.rendition) return;
    state.currentHref = item.href;
    state.currentChapterId = extractChapterId(item.href);
    highlightChapter(item.href);
    try {
      await state.rendition.display(item.href);
    } catch (error) {
      console.error('Unable to display section', error);
    }
    await showCachedTranslationForCurrentLocation();
  });
  li.append(button);
  tocList.append(li);
  if (item.subitems?.length) {
    item.subitems.forEach((child) => addTocEntry(child, depth + 1));
  }
}

function highlightChapter(href: string): void {
  tocList.querySelectorAll('button').forEach((button) => {
    const target = button as HTMLButtonElement;
    target.classList.toggle('active', target.dataset.href === href);
  });
  state.currentChapterId = extractChapterId(href);
}

function setupEventListeners(): void {
  fileInput.addEventListener('change', (event) => {
    const target = event.currentTarget as HTMLInputElement;
    void handleFile(target.files?.[0] ?? null);
  });

  nextBtn.addEventListener('click', () => state.rendition?.next());
  prevBtn.addEventListener('click', () => state.rendition?.prev());

  fontSmaller.addEventListener('click', () => adjustFontScale(-10));
  fontLarger.addEventListener('click', () => adjustFontScale(10));

  fontFamilySelect.addEventListener('change', applyFontFromSelect);

  const startSliderInteraction = (): void => {
    if (progressSlider.disabled) return;
    sliderInteracting = true;
    showReaderControls();
  };
  const endSliderInteraction = (): void => {
    sliderInteracting = false;
  };

  ['pointerdown', 'touchstart'].forEach((eventName) => {
    progressSlider.addEventListener(eventName, startSliderInteraction);
  });

  ['pointerup', 'touchend', 'touchcancel', 'mouseleave', 'blur'].forEach((eventName) => {
    progressSlider.addEventListener(eventName, endSliderInteraction);
  });

  progressSlider.addEventListener('input', (event) => {
    if (progressSlider.disabled) return;
    const target = event.currentTarget as HTMLInputElement;
    progressLabel.textContent = `${target.value}%`;
  });

  progressSlider.addEventListener('change', (event) => {
    if (progressSlider.disabled || !state.book || !state.locationsReady) return;
    const target = event.currentTarget as HTMLInputElement;
    const percentage = Number(target.value) / 100;
    try {
      const cfi = state.book.locations.cfiFromPercentage(percentage);
      void state.rendition?.display(cfi);
    } catch (error) {
      console.warn('Unable to navigate to requested location', error);
    }
    sliderInteracting = false;
  });

  languageSelect.addEventListener('change', (event) => {
    const target = event.currentTarget as HTMLSelectElement;
    state.targetLanguage = target.value;
    persistLanguagePreference();
  });

  providerSelect.addEventListener('change', (event) => {
    const target = event.currentTarget as HTMLSelectElement;
    state.provider = (target.value as Provider) ?? 'openai';
    syncEndpointInputState();
    persistProviderSettings();
  });

  modelInput.addEventListener('input', (event) => {
    const target = event.currentTarget as HTMLInputElement;
    state.customModel = target.value.trim();
  });

  modelInput.addEventListener('blur', () => {
    state.customModel = modelInput.value.trim();
    persistProviderSettings();
  });

  apiEndpointInput.addEventListener('input', (event) => {
    const target = event.currentTarget as HTMLInputElement;
    state.customEndpoint = target.value.trim();
  });

  apiEndpointInput.addEventListener('blur', () => {
    state.customEndpoint = apiEndpointInput.value.trim();
    persistProviderSettings();
  });

  apiKeyInput.addEventListener('input', persistApiKey);
  apiKeyInput.addEventListener('blur', persistApiKey);

  translateBtn.addEventListener('click', () => {
    void translateCurrentView();
  });

  openSettingsBtn.addEventListener('click', () => {
    openSettingsDialog();
  });

  closeSettingsBtn.addEventListener('click', () => {
    closeSettingsDialog();
  });
  settingsDialog.addEventListener('click', (event) => {
    if (event.target === settingsDialog) {
      closeSettingsDialog();
    }
  });

  layoutToggle.addEventListener('click', () => {
    state.focusMode = !state.focusMode;
    applyFocusMode();
    persistFocusMode();
  });

  window.addEventListener('keydown', handleArrowNavigation);

  setupDragAndDrop();
  setupReaderControlsVisibility();

  openLibraryBtn.addEventListener('click', () => {
    showLibraryOverlay();
  });
  closeLibraryBtn.addEventListener('click', () => {
    if (!state.book) return;
    hideLibraryOverlay();
  });
  [addLibraryBookBtn, addLibraryBookFooter].forEach((button) => {
    button.addEventListener('click', () => fileInput.click());
  });
  libraryList.addEventListener('click', (event) => {
    const entry = (event.target as HTMLElement).closest<HTMLLIElement>('[data-book-id]');
    if (!entry) return;
    const id = entry.dataset.bookId;
    if (!id) return;
    void loadBookFromLibrary(id);
  });
}

function populateFontOptions(): void {
  fontFamilySelect.innerHTML = '';
  FONT_PRESETS.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.value;
    option.textContent = preset.label;
    fontFamilySelect.append(option);
  });
  fontFamilySelect.value = FONT_PRESETS[0]?.value ?? 'inherit';
}

function populateLanguageOptions(): void {
  languageSelect.innerHTML = '';
  LANGUAGE_OPTIONS.forEach((language) => {
    const option = document.createElement('option');
    option.value = language.value;
    option.textContent = language.label;
    languageSelect.append(option);
  });
  const fallback = LANGUAGE_OPTIONS[0]?.value ?? 'es';
  if (!state.targetLanguage) {
    state.targetLanguage = fallback;
  }
  languageSelect.value = state.targetLanguage;
}

function restoreApiKey(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.apiKey);
    if (stored) {
      apiKeyInput.value = stored;
    }
  } catch (error) {
    console.warn('Unable to access localStorage for API key', error);
  }
}

function persistApiKey(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
  } catch (error) {
    console.warn('Unable to persist API key', error);
  }
}

function populateProviderOptions(): void {
  providerSelect.innerHTML = '';
  PROVIDER_OPTIONS.forEach((provider) => {
    const option = document.createElement('option');
    option.value = provider.value;
    option.textContent = provider.label;
    providerSelect.append(option);
  });
  providerSelect.value = state.provider;
}

function restoreProviderSettings(): void {
  try {
    const storedProvider = localStorage.getItem(STORAGE_KEYS.provider) as Provider | null;
    if (storedProvider === 'openai' || storedProvider === 'custom') {
      state.provider = storedProvider;
    }
    const storedEndpoint = localStorage.getItem(STORAGE_KEYS.endpoint);
    if (storedEndpoint) {
      state.customEndpoint = storedEndpoint;
      apiEndpointInput.value = storedEndpoint;
    }
    const storedCustomModel = localStorage.getItem(STORAGE_KEYS.customModel);
    if (storedCustomModel) {
      state.customModel = storedCustomModel;
    }
  } catch (error) {
    console.warn('Unable to load provider preferences', error);
  }
  providerSelect.value = state.provider;
  if (!state.customModel) {
    state.customModel = DEFAULT_MODEL;
  }
  modelInput.value = state.customModel;
  syncEndpointInputState();
}

function persistProviderSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.provider, state.provider);
    localStorage.setItem(STORAGE_KEYS.endpoint, state.customEndpoint);
    localStorage.setItem(STORAGE_KEYS.customModel, state.customModel);
  } catch (error) {
    console.warn('Unable to persist provider settings', error);
  }
}

function syncEndpointInputState(): void {
  const isCustom = state.provider === 'custom';
  apiEndpointInput.disabled = !isCustom;
  if (!isCustom) {
    apiEndpointInput.placeholder = OPENAI_ENDPOINT;
  } else if (!apiEndpointInput.value) {
    apiEndpointInput.placeholder = 'https://your-endpoint/v1/chat/completions';
  }
  apiEndpointInput.value = state.customEndpoint;
}

function extractChapterId(reference: string | null): string | null {
  if (!reference) return null;
  const [path] = reference.split('#');
  return path || null;
}

function createLibraryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistLanguagePreference(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.language, state.targetLanguage);
  } catch (error) {
    console.warn('Unable to remember target language', error);
  }
}

function persistFontScalePreference(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.fontScale, String(state.fontScale));
  } catch (error) {
    console.warn('Unable to remember font size', error);
  }
}

function restoreReaderPreferences(): void {
  try {
    const storedLang = localStorage.getItem(STORAGE_KEYS.language);
    if (storedLang && LANGUAGE_OPTIONS.some((opt) => opt.value === storedLang)) {
      state.targetLanguage = storedLang;
    }
    const storedScale = localStorage.getItem(STORAGE_KEYS.fontScale);
    if (storedScale) {
      const parsed = Number(storedScale);
      if (!Number.isNaN(parsed)) {
        state.fontScale = clampFontScale(parsed);
      }
    }
  } catch (error) {
    console.warn('Unable to restore reading preferences', error);
  }
  languageSelect.value = state.targetLanguage;
}

async function refreshLibraryList(): Promise<void> {
  try {
    libraryCache = await fetchLibraryBooks();
    renderLibraryList(libraryCache);
  } catch (error) {
    console.error('Unable to refresh library', error);
  }
}

function renderLibraryList(books: LibraryBookSummary[]): void {
  libraryList.innerHTML = '';
  if (!books.length) {
    libraryEmpty.classList.remove('hidden');
    return;
  }
  libraryEmpty.classList.add('hidden');
  const sorted = [...books].sort((a, b) => b.addedAt - a.addedAt);
  sorted.forEach((book) => {
    const item = document.createElement('li');
    item.className = 'library-entry';
    item.dataset.bookId = book.id;
    const progressLabel = typeof book.lastProgress === 'number' ? `${book.lastProgress}% read` : 'Not started';
    item.innerHTML = `
      <p class="title">${book.title}</p>
      <p class="author">${book.author}</p>
      <span class="progress-pill">${progressLabel}</span>
    `;
    libraryList.append(item);
  });
}

function updateLibraryEntryProgress(id: string, percentage: number): void {
  const summary = libraryCache.find((book) => book.id === id);
  if (summary) {
    summary.lastProgress = percentage;
  }
  const entry = libraryList.querySelector<HTMLSpanElement>(`[data-book-id="${id}"] .progress-pill`);
  if (entry) {
    entry.textContent = `${percentage}% read`;
  }
}

function showLibraryOverlay(): void {
  libraryOverlay.classList.add('visible');
  updateLibraryCloseAvailability();
}

function hideLibraryOverlay(): void {
  libraryOverlay.classList.remove('visible');
}

function updateLibraryCloseAvailability(): void {
  const canClose = Boolean(state.book);
  closeLibraryBtn.disabled = !canClose;
  closeLibraryBtn.classList.toggle('disabled', !canClose);
}

function showReaderLoading(message: string): void {
  readerLoadingText.textContent = message;
  readerLoading.classList.remove('hidden');
}

function hideReaderLoading(): void {
  readerLoading.classList.add('hidden');
}

function buildTranslationCacheKey(sectionId: string | null, language: string, provider: Provider, model: string): string {
  return `${sectionId ?? 'page'}::${language}::${provider}::${model}`;
}

async function loadPersistentTranslation(bookId: string, key: string): Promise<string | null> {
  const db = await openLibraryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRANSLATION_STORE, 'readonly');
    const store = tx.objectStore(TRANSLATION_STORE);
    const request = store.get(`${bookId}::${key}`);
    request.onsuccess = () => {
      const record = request.result as { text?: string } | undefined;
      resolve(record?.text ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read translation cache'));
  });
}

async function savePersistentTranslation(bookId: string, key: string, text: string): Promise<void> {
  const db = await openLibraryDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TRANSLATION_STORE, 'readwrite');
    const store = tx.objectStore(TRANSLATION_STORE);
    store.put({ id: `${bookId}::${key}`, bookId, key, text, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save translation cache'));
  });
}

async function loadBookFromLibrary(id: string): Promise<void> {
  const record = await getLibraryRecord(id);
  if (!record) {
    alert('Unable to open this book. Try adding it again.');
    return;
  }
  const file = new File([record.blob], record.fileName || `${record.title}.epub`, {
    type: 'application/epub+zip',
  });
  hideLibraryOverlay();
  await handleFile(file, {
    libraryId: record.id,
    skipLibrarySave: true,
    restoreCfi: record.lastCfi ?? null,
  });
}

async function openLibraryDb(): Promise<IDBDatabase> {
  if (!libraryDbPromise) {
    libraryDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(LIBRARY_DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
          db.createObjectStore(LIBRARY_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(TRANSLATION_STORE)) {
          db.createObjectStore(TRANSLATION_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open library database'));
    });
  }
  return libraryDbPromise;
}

async function saveBookToLibrary(buffer: ArrayBuffer, metadata: BookMetadata, fileName: string): Promise<string> {
  const db = await openLibraryDb();
  const id = createLibraryId();
  const record: LibraryRecord = {
    id,
    title: metadata.title || fileName.replace(/\.epub$/i, ''),
    author: metadata.creator || metadata.creatorFileAs || 'Unknown author',
    fileName,
    addedAt: Date.now(),
    blob: new Blob([buffer], { type: 'application/epub+zip' }),
    lastProgress: 0,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(LIBRARY_STORE);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save book to library'));
  });

  return id;
}

async function fetchLibraryBooks(): Promise<LibraryBookSummary[]> {
  const db = await openLibraryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readonly');
    const store = tx.objectStore(LIBRARY_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const records = (request.result as LibraryRecord[]) || [];
      resolve(records.map(({ blob: _blob, lastCfi: _cfi, ...summary }) => summary));
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read library'));
  });
}

async function getLibraryRecord(id: string): Promise<LibraryRecord | null> {
  const db = await openLibraryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readonly');
    const store = tx.objectStore(LIBRARY_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as LibraryRecord) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load book from library'));
  });
}

async function updateLibraryProgressRecord(id: string, progress: { cfi?: string; percentage?: number }): Promise<void> {
  const db = await openLibraryDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(LIBRARY_STORE);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const record = getRequest.result as LibraryRecord | undefined;
      if (!record) {
        resolve();
        return;
      }
      if (progress.cfi) {
        record.lastCfi = progress.cfi;
      }
      if (typeof progress.percentage === 'number') {
        record.lastProgress = progress.percentage;
      }
      store.put(record);
    };
    getRequest.onerror = () => reject(getRequest.error ?? new Error('Failed to update book progress'));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to update book progress'));
  });
}

function restoreFocusMode(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.focusMode);
    state.focusMode = stored === 'true';
  } catch (error) {
    console.warn('Unable to read focus mode preference', error);
  }
  applyFocusMode();
}

function persistFocusMode(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.focusMode, String(state.focusMode));
  } catch (error) {
    console.warn('Unable to persist focus mode preference', error);
  }
}

function applyFocusMode(): void {
  document.body.classList.toggle('focus-mode', state.focusMode);
  layoutToggle.setAttribute('aria-pressed', String(state.focusMode));
  layoutToggle.title = state.focusMode ? 'Show side panels' : 'Hide side panels';
}

function applyFontFromSelect(): void {
  if (!state.rendition) return;
  const value = fontFamilySelect.value || 'inherit';
  state.rendition.themes.font(value);
}

function clampFontScale(value: number): number {
  return Math.min(140, Math.max(90, value));
}

function applyFontScale(): void {
  if (!state.rendition) return;
  state.fontScale = clampFontScale(state.fontScale);
  state.rendition.themes.fontSize(`${state.fontScale}%`);
}

function adjustFontScale(delta: number): void {
  state.fontScale = clampFontScale(state.fontScale + delta);
  applyFontScale();
  persistFontScalePreference();
}

function setupDragAndDrop(): void {
  const showDropHint = (): void => {
    dropZone.classList.remove('hidden');
    dropZone.classList.add('active');
  };

  const hideDropHint = (): void => {
    dropZone.classList.remove('active');
    if (state.book) {
      dropZone.classList.add('hidden');
    }
  };

  ['dragenter', 'dragover'].forEach((type) => {
    readingArea.addEventListener(type, (event) => {
      preventDefaults(event);
      showDropHint();
    });
    document.body.addEventListener(type, preventDefaults);
  });

  ['dragleave', 'drop'].forEach((type) => {
    readingArea.addEventListener(type, (event) => {
      preventDefaults(event);
      if (type === 'dragleave') {
        hideDropHint();
      }
    });
    document.body.addEventListener(type, preventDefaults);
  });

  const handleDropEvent = (event: DragEvent): void => {
    preventDefaults(event);
    hideDropHint();
    const file = event.dataTransfer?.files?.[0];
    void handleFile(file ?? null);
  };

  readingArea.addEventListener('drop', handleDropEvent);
  dropZone.addEventListener('drop', handleDropEvent);
}

function preventDefaults(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function setupReaderControlsVisibility(): void {
  const threshold = 120;
  readingArea.addEventListener('mousemove', (event) => {
    const rect = readingArea.getBoundingClientRect();
    const distanceFromBottom = rect.bottom - event.clientY;
    if (distanceFromBottom <= threshold) {
      showReaderControls();
    } else if (!readerControls.contains(document.activeElement)) {
      hideReaderControls();
    }
  });

  readingArea.addEventListener('mouseleave', () => {
    if (!readerControls.contains(document.activeElement)) {
      hideReaderControls();
    }
  });

  readerControls.addEventListener('focusin', showReaderControls);
  readerControls.addEventListener('focusout', () => {
    if (!readerControls.contains(document.activeElement)) {
      hideReaderControls();
    }
  });
}

async function prepareLocations(): Promise<void> {
  if (!state.book?.locations) {
    return;
  }
  try {
    await state.book.locations.generate(1600);
    state.locationsReady = true;
    progressSlider.disabled = false;
  } catch (error) {
    console.warn('Unable to build book locations', error);
  }
}

async function handleRelocated(location: any): Promise<void> {
  if (!location) return;
  const href = location.start?.href;
  if (href) {
    state.currentHref = href;
    highlightChapter(href);
  }
  const cfi = location.start?.cfi;
  if (!state.book || !cfi || !state.locationsReady) return;
  const percent = Math.round(state.book.locations.percentageFromCfi(cfi) * 100);
  updateProgress(percent);
  state.currentChapterId = extractChapterId(href || cfi);
  if (state.libraryEntryId) {
    void updateLibraryProgressRecord(state.libraryEntryId, { cfi, percentage: percent });
    updateLibraryEntryProgress(state.libraryEntryId, percent);
  }
  await showCachedTranslationForCurrentLocation();
}

function updateProgress(percent: number): void {
  const value = Math.min(100, Math.max(0, percent));
  progressLabel.textContent = `${value}%`;
  if (!sliderInteracting) {
    progressSlider.value = value.toString();
  }
  state.lastScrollPercent = value;
  scrollTranslationToPercent(value);
}

function extractVisibleText(): string {
  if (!state.rendition) return '';
  const contents = state.rendition.getContents?.() ?? [];
  const text = contents
    .map((content) => content.document?.body?.innerText?.trim() ?? '')
    .filter((value) => value.length)
    .join('\n\n');
  return text;
}

function getLanguageLabel(value: string): string {
  return LANGUAGE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function getProviderLabel(value: Provider): string {
  return PROVIDER_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function updateTranslationStatus(message: string, isError = false): void {
  translationStatus.dataset.message = message;
  translationStatus.dataset.state = isError ? 'error' : 'ok';
}

function renderTranslationText(text: string | null): void {
  translationOutput.innerHTML = '';
  if (!text) return;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    translationOutput.textContent = '';
    return;
  }
  paragraphs.forEach((paragraph) => {
    const element = document.createElement('p');
    element.textContent = paragraph.replace(/\n/g, ' ');
    translationOutput.appendChild(element);
  });
  scrollTranslationToPercent(state.lastScrollPercent);
}

function setTranslating(active: boolean): void {
  translateBtn.disabled = active;
  if (active) {
    translateBtn.textContent = 'Translating...';
  } else {
    translateBtn.textContent = 'Translate current view';
  }
}

function setDropZoneVisibility(visible: boolean): void {
  dropZone.classList.toggle('hidden', !visible);
}

function scrollTranslationToPercent(percent: number): void {
  const max = translationOutput.scrollHeight - translationOutput.clientHeight;
  if (max <= 0) {
    translationOutput.scrollTop = 0;
    return;
  }
  translationOutput.scrollTop = (Math.max(0, Math.min(100, percent)) / 100) * max;
}

function bindScrollSync(content: any): void {
  const doc = content?.document;
  if (!doc) return;
  const container = doc.scrollingElement || doc.documentElement;
  const handler = () => {
    const max = container.scrollHeight - container.clientHeight;
    const percent = max > 0 ? (container.scrollTop / max) * 100 : 0;
    state.lastScrollPercent = percent;
    scrollTranslationToPercent(percent);
  };
  container.addEventListener('scroll', handler, { passive: true });
  const cleanup = () => container.removeEventListener('scroll', handler);
  scrollSyncCleanup.push(cleanup);
  content?.on?.('destroy', cleanup);
}

function openSettingsDialog(): void {
  settingsDialog.classList.add('visible');
}

function closeSettingsDialog(): void {
  settingsDialog.classList.remove('visible');
}

async function translateCurrentView(): Promise<void> {
  if (!state.rendition) {
    updateTranslationStatus('Open a book to translate.', true);
    return;
  }
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    updateTranslationStatus('Enter your API key to translate.', true);
    return;
  }
  const sourceText = extractVisibleText();
  if (!sourceText) {
    updateTranslationStatus('Unable to find text in the current view.', true);
    return;
  }

  let endpoint = OPENAI_ENDPOINT;
  if (state.provider === 'custom') {
    endpoint = apiEndpointInput.value.trim() || state.customEndpoint.trim();
    if (!endpoint) {
      updateTranslationStatus('Enter an API endpoint for the custom provider.', true);
      return;
    }
    state.customEndpoint = endpoint;
    persistProviderSettings();
  }

  const location = (state.rendition as any)?.currentLocation?.() ?? null;
  const currentCfi = location?.start?.cfi ?? state.currentHref ?? null;
  const chapterId = state.currentChapterId ?? extractChapterId(currentCfi);
  const languageLabel = getLanguageLabel(state.targetLanguage);
  const model = state.customModel.trim() || DEFAULT_MODEL;
  const providerLabel = getProviderLabel(state.provider);
  const cacheKey = buildTranslationCacheKey(chapterId, state.targetLanguage, state.provider, model);
  const sessionKey = `${state.libraryEntryId ?? 'session'}::${cacheKey}`;

  if (sessionTranslationCache.has(sessionKey)) {
    renderTranslationText(sessionTranslationCache.get(sessionKey) ?? null);
    updateTranslationStatus(`Loaded cached translation via ${providerLabel}.`);
    return;
  }
  if (state.libraryEntryId) {
    const cached = await loadPersistentTranslation(state.libraryEntryId, cacheKey);
    if (cached) {
      sessionTranslationCache.set(sessionKey, cached);
      renderTranslationText(cached);
      updateTranslationStatus(`Loaded cached translation via ${providerLabel}.`);
      return;
    }
  }

  translationAbortController?.abort();
  translationAbortController = new AbortController();
  setTranslating(true);
  updateTranslationStatus(`Translating via ${providerLabel}...`);

  const payload = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You are a professional literary translator. Provide only the translated text, preserving paragraph breaks and inline emphasis.',
      },
      {
        role: 'user',
        content: `Translate the following passage into ${languageLabel}.\n\n${sourceText}`,
      },
    ],
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: translationAbortController.signal,
    });
    if (!response.ok) {
      throw new Error(`Translation request failed with status ${response.status}`);
    }
    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();
    if (!translatedText) {
      throw new Error('No translation returned');
    }
    renderTranslationText(translatedText);
    sessionTranslationCache.set(sessionKey, translatedText);
    if (state.libraryEntryId) {
      await savePersistentTranslation(state.libraryEntryId, cacheKey, translatedText);
    }
    updateTranslationStatus(`Translated to ${languageLabel} via ${providerLabel} (${model}).`);
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') {
      return;
    }
    console.error('Translation failed', error);
    updateTranslationStatus('Translation failed. See console for details.', true);
  } finally {
    setTranslating(false);
  }
}

function handleArrowNavigation(event: KeyboardEvent): void {
  if (!state.rendition) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    void state.rendition.next();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    void state.rendition.prev();
  }
}

async function showCachedTranslationForCurrentLocation(): Promise<void> {
  if (!state.rendition) {
    renderTranslationText(null);
    return;
  }
  const location = (state.rendition as any)?.currentLocation?.() ?? null;
  const currentCfi = location?.start?.cfi ?? null;
  const chapterId = state.currentChapterId ?? extractChapterId(currentCfi);
  const model = state.customModel.trim() || DEFAULT_MODEL;
  const cacheKey = buildTranslationCacheKey(chapterId, state.targetLanguage, state.provider, model);
  const sessionKey = `${state.libraryEntryId ?? 'session'}::${cacheKey}`;
  if (sessionTranslationCache.has(sessionKey)) {
    renderTranslationText(sessionTranslationCache.get(sessionKey) ?? null);
    return;
  }
  if (state.libraryEntryId) {
    const cached = await loadPersistentTranslation(state.libraryEntryId, cacheKey);
    renderTranslationText(cached ?? null);
    if (cached) {
      sessionTranslationCache.set(sessionKey, cached);
    }
  } else {
    renderTranslationText(null);
  }
}

function bindRenditionShortcuts(): void {
  if (!state.rendition) return;
  state.rendition.on('keyup', (event: KeyboardEvent) => handleArrowNavigation(event));
}

function showReaderControls(): void {
  if (controlsVisible) return;
  controlsVisible = true;
  readerControls.classList.add('visible');
}

function hideReaderControls(): void {
  if (!controlsVisible) return;
  controlsVisible = false;
  readerControls.classList.remove('visible');
}

async function loadSampleFromHash(): Promise<void> {
  if (window.location.hash !== '#demo') return;
  try {
    const response = await fetch('https://s3.amazonaws.com/epubjs/books/moby-dick.epub');
    if (!response.ok) return;
    const blob = await response.blob();
    const file = new File([blob], 'sample.epub');
    await handleFile(file);
  } catch (error) {
    console.error('Failed to fetch sample EPUB', error);
  }
}

populateFontOptions();
populateLanguageOptions();
restoreReaderPreferences();
populateProviderOptions();
refreshLibraryList();
restoreProviderSettings();
restoreApiKey();
restoreFocusMode();
updateTranslationStatus('No translation yet.');
updateLibraryCloseAvailability();
setupEventListeners();
void loadSampleFromHash();
