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
const parallelView = getElement<HTMLDivElement>('parallelView');
const parallelRows = getElement<HTMLDivElement>('parallelRows');
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
const chapterTextCache = new Map<string, string>();
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
  lastOriginalParagraphs: [],
  autoTranslateEnabled: false,
  chapterIndex: [],
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
  lastOriginalParagraphs: string[];
  autoTranslateEnabled: boolean;
  chapterIndex: ChapterNavEntry[];
}

interface ChapterNavEntry {
  id: string;
  href: string;
  originalHref: string;
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
  chapterTextCache.clear();
  while (scrollSyncCleanup.length) {
    const cleanup = scrollSyncCleanup.pop();
    cleanup?.();
  }
  hideParallelView();
  state.lastOriginalParagraphs = [];
  progressSlider.value = '0';
  progressSlider.disabled = true;
  progressLabel.textContent = '0%';
  parallelRows.textContent = '';
  updateTranslationStatus('No translation yet.');
  setDropZoneVisibility(true);
  if (dropZoneLabel) {
    dropZoneLabel.textContent = 'Drop EPUB file here';
  }
  state.libraryEntryId = null;
  state.pendingDisplayCfi = null;
  state.chapterIndex = [];
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
  rebuildChapterIndex();
}

function rebuildChapterIndex(): void {
  const flattened: ChapterNavEntry[] = [];
  const walk = (items: TocItem[]): void => {
    items.forEach((item) => {
      const resolvedHref = normalizeTocHref(item.href) ?? item.href ?? '';
      if (resolvedHref) {
        const id = extractChapterId(resolvedHref) ?? resolvedHref;
        flattened.push({
          id,
          href: resolvedHref,
          originalHref: item.href ?? resolvedHref,
        });
      }
      if (item.subitems?.length) {
        walk(item.subitems);
      }
    });
  };
  if (state.toc.length) {
    walk(state.toc);
  }
  state.chapterIndex = flattened;
}

function normalizeTocHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  const [path, hash] = trimmed.split('#');
  let resolvedPath = path || trimmed;
  try {
    const section = state.book?.spine?.get?.(resolvedPath);
    if (section?.href) {
      resolvedPath = section.href;
    }
  } catch (error) {
    console.warn('Unable to resolve TOC href', href, error);
  }
  if (!resolvedPath) {
    return null;
  }
  return hash ? `${resolvedPath}#${hash}` : resolvedPath;
}

function buildChapterDisplayAttempts(primary?: string | null, fallback?: string | null): string[] {
  const attempts: string[] = [];
  const addAttempt = (value: string | null | undefined): void => {
    const trimmed = value?.trim();
    if (trimmed && !attempts.includes(trimmed)) {
      attempts.push(trimmed);
    }
  };
  const normalizedPrimary = primary ? normalizeTocHref(primary) ?? primary : null;
  const normalizedFallback =
    fallback && fallback !== primary ? normalizeTocHref(fallback) ?? fallback : null;
  addAttempt(normalizedPrimary);
  addAttempt(normalizedFallback);
  addAttempt(primary);
  if (fallback && fallback !== primary) {
    addAttempt(fallback);
  }
  attempts.slice().forEach((existing) => {
    addAttempt(extractChapterId(existing));
  });
  return attempts;
}

async function ensureRenditionHasContent(retries = 3, delay = 60): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const hasContent = Boolean(state.rendition?.getContents?.()?.length);
    if (hasContent) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return Boolean(state.rendition?.getContents?.()?.length);
}

async function displayChapterTarget(target: string, fallback?: string | null): Promise<void> {
  if (!state.rendition) return;
  const attempts = buildChapterDisplayAttempts(target, fallback);
  if (!attempts.length) return;
  for (const href of attempts) {
    try {
      await state.rendition.display(href);
      const hasContent = await ensureRenditionHasContent();
      if (hasContent) {
        return;
      }
    } catch (error) {
      console.warn('Unable to display section', href, error);
    }
  }
  console.warn('Unable to render chapter for target', target);
}

function getSpineSection(target: string | null): SpineSection | null {
  if (!target || !state.book?.spine?.get) return null;
  const normalized = normalizeTocHref(target) ?? target;
  return state.book.spine.get(normalized) ?? state.book.spine.get(target) ?? null;
}

function collectParagraphsFromBody(body: Element): string[] {
  const blocks = Array.from(
    body.querySelectorAll('p, li, blockquote, section, article, pre, h1, h2, h3, h4, h5, h6'),
  )
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
    .filter((value): value is string => Boolean(value));
  if (blocks.length) {
    return blocks;
  }
  const fallback = body.textContent?.replace(/\s+/g, ' ').trim();
  return fallback ? [fallback] : [];
}

async function getChapterTextContent(target: string | null): Promise<{ text: string; paragraphs: string[] } | null> {
  if (!target || !state.book?.spine?.get) return null;
  const normalized = normalizeTocHref(target) ?? target;
  if (!normalized) return null;
  if (chapterTextCache.has(normalized)) {
    const cachedText = chapterTextCache.get(normalized) ?? '';
    const paragraphs = splitIntoParagraphs(cachedText);
    return { text: cachedText, paragraphs };
  }
  const section = getSpineSection(normalized);
  if (!section) return null;
  const request = state.book.load?.bind(state.book);
  try {
    await section.load(request);
  } catch (error) {
    console.warn('Unable to load section contents for translation', normalized, error);
    return null;
  }
  const body = section.document?.querySelector('body');
  if (!body) return null;
  const paragraphs = collectParagraphsFromBody(body);
  if (!paragraphs.length) return null;
  const text = paragraphs.join('\n\n');
  chapterTextCache.set(normalized, text);
  return { text, paragraphs };
}

function getCurrentChapterReference(): string | null {
  const location = (state.rendition as any)?.currentLocation?.() ?? null;
  const currentCfi = location?.start?.cfi ?? null;
  return state.currentChapterId ?? extractChapterId(currentCfi) ?? state.currentHref ?? null;
}

function getAdjacentChapterHref(direction: 'next' | 'prev'): string | null {
  const current = getCurrentChapterReference();
  const section = getSpineSection(current);
  if (!section) return null;
  const neighbor = direction === 'next' ? section.next?.() : section.prev?.();
  return neighbor?.href ?? null;
}

async function navigateToChapterOffset(offset: number): Promise<void> {
  if (!state.chapterIndex.length) return;
  const currentRef = getCurrentChapterReference();
  const normalized =
    normalizeTocHref(currentRef ?? '') ?? currentRef ?? state.chapterIndex[0]?.href ?? null;
  const currentId = normalized ? extractChapterId(normalized) ?? normalized : null;
  let currentIndex = currentId
    ? state.chapterIndex.findIndex((entry) => entry.id === currentId)
    : -1;
  if (currentIndex === -1) {
    currentIndex = offset > 0 ? -1 : state.chapterIndex.length;
  }
  let targetIndex = currentIndex + offset;
  targetIndex = Math.min(state.chapterIndex.length - 1, Math.max(0, targetIndex));
  if (targetIndex === currentIndex || targetIndex < 0 || targetIndex >= state.chapterIndex.length) {
    return;
  }
  const targetChapter = state.chapterIndex[targetIndex];
  await navigateToChapterEntry(targetChapter);
}

async function navigateToChapterEntry(entry: ChapterNavEntry): Promise<void> {
  if (!entry) return;
  state.currentHref = entry.href;
  state.currentChapterId = entry.id;
  highlightChapter(entry.id);
  try {
    await displayChapterTarget(entry.href, entry.originalHref);
  } catch (error) {
    console.error('Unable to display section from shortcut', error);
  }
  await showCachedTranslationForCurrentLocation();
}

function addTocEntry(item: TocItem, depth = 0): void {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  const resolvedTarget = normalizeTocHref(item.href) ?? item.href ?? '';
  const highlightTarget = extractChapterId(resolvedTarget) ?? resolvedTarget;
  button.dataset.href = highlightTarget ?? '';
  button.textContent = item.label?.trim() || 'Untitled section';
  button.style.paddingLeft = `${0.75 + depth * 0.75}rem`;
  if (!resolvedTarget) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.title = 'This entry has no readable section';
  }
  button.addEventListener('click', async () => {
    if (!state.rendition || !resolvedTarget) return;
    const highlightValue = highlightTarget ?? extractChapterId(resolvedTarget) ?? resolvedTarget;
    state.currentHref = highlightValue;
    state.currentChapterId = extractChapterId(highlightValue) ?? highlightValue;
    highlightChapter(highlightValue);
    try {
      await displayChapterTarget(resolvedTarget, item.href);
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
  window.addEventListener('keydown', handleChapterShortcut);

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

function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const tagName = element.tagName;
  if (!tagName) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return false;
}

function handleChapterShortcut(event: KeyboardEvent): void {
  if (!state.chapterIndex.length) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (isEditableElement(event.target as Element | null)) return;
  event.preventDefault();
  const offset = event.key === 'ArrowRight' ? 1 : -1;
  void navigateToChapterOffset(offset);
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

async function readCachedTranslation(cacheKey: string, sessionKey: string): Promise<string | null> {
  if (sessionTranslationCache.has(sessionKey)) {
    return sessionTranslationCache.get(sessionKey) ?? null;
  }
  if (!state.libraryEntryId) {
    return null;
  }
  const cached = await loadPersistentTranslation(state.libraryEntryId, cacheKey);
  if (cached) {
    sessionTranslationCache.set(sessionKey, cached);
  }
  return cached ?? null;
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
  hideParallelView();
  const percent = Math.round(state.book.locations.percentageFromCfi(cfi) * 100);
  updateProgress(percent);
  state.currentChapterId = extractChapterId(href || cfi);
  if (state.libraryEntryId) {
    void updateLibraryProgressRecord(state.libraryEntryId, { cfi, percentage: percent });
    updateLibraryEntryProgress(state.libraryEntryId, percent);
  }
  await showCachedTranslationForCurrentLocation();
  if (state.autoTranslateEnabled) {
    void autoTranslateUpcomingChapter();
  }
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

function splitIntoParagraphs(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function renderParallelColumns(originalParagraphs: string[], translationText: string | null): void {
  if (!translationText) {
    hideParallelView();
    return;
  }
  const translatedParagraphs = splitIntoParagraphs(translationText);
  parallelRows.innerHTML = '';
  const max = Math.max(originalParagraphs.length, translatedParagraphs.length);
  for (let i = 0; i < max; i += 1) {
    const row = document.createElement('div');
    row.className = 'parallel-row';

    const originalWrapper = document.createElement('div');
    originalWrapper.className = 'parallel-cell original';
    const originalElement = document.createElement('p');
    originalElement.textContent = originalParagraphs[i] ?? '';
    originalWrapper.appendChild(originalElement);
    row.appendChild(originalWrapper);

    const translatedWrapper = document.createElement('div');
    translatedWrapper.className = 'parallel-cell translated';
    const translatedElement = document.createElement('p');
    translatedElement.textContent = translatedParagraphs[i] ?? '';
    translatedWrapper.appendChild(translatedElement);
    row.appendChild(translatedWrapper);

    parallelRows.appendChild(row);
  }
  parallelView.classList.remove('hidden');
  viewer.classList.add('hidden');
  scrollTranslationToPercent(state.lastScrollPercent);
}

function renderTranslationText(text: string | null): void {
  if (!state.lastOriginalParagraphs.length) {
    state.lastOriginalParagraphs = splitIntoParagraphs(extractVisibleText());
  }
  renderParallelColumns(state.lastOriginalParagraphs, text);
}

function setTranslating(active: boolean): void {
  translateBtn.disabled = active;
  if (active) {
    translateBtn.textContent = 'Translating...';
  } else {
    translateBtn.textContent = 'Translate chapter';
  }
}

function setDropZoneVisibility(visible: boolean): void {
  dropZone.classList.toggle('hidden', !visible);
}

function scrollTranslationToPercent(percent: number): void {
  if (parallelView.classList.contains('hidden')) {
    parallelView.scrollTop = 0;
    return;
  }
  const max = parallelView.scrollHeight - parallelView.clientHeight;
  if (max <= 0) {
    parallelView.scrollTop = 0;
    return;
  }
  const clamped = Math.max(0, Math.min(100, percent));
  parallelView.scrollTop = (clamped / 100) * max;
}

function hideParallelView(): void {
  parallelView.classList.add('hidden');
  viewer.classList.remove('hidden');
  parallelRows.innerHTML = '';
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

interface ChapterTranslationResult {
  success: boolean;
  fromCache: boolean;
}

interface ChapterTranslationOptions {
  showResult: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  providerLabel: string;
  languageLabel: string;
  signal: AbortSignal;
}

interface ChapterTranslationBatchOptions {
  announceStatus: boolean;
  triggeredByUser: boolean;
}

async function translateChapterTarget(
  targetHref: string,
  options: ChapterTranslationOptions,
): Promise<ChapterTranslationResult> {
  const normalizedTarget = normalizeTocHref(targetHref) ?? targetHref;
  const chapterId = extractChapterId(normalizedTarget) ?? normalizedTarget ?? null;
  if (!chapterId) {
    if (options.showResult) {
      updateTranslationStatus('Unable to determine the current chapter for translation.', true);
    }
    return { success: false, fromCache: false };
  }

  const chapterText = await getChapterTextContent(normalizedTarget);
  if (!chapterText || !chapterText.text) {
    if (options.showResult) {
      updateTranslationStatus('Unable to read text from this chapter for translation.', true);
    }
    return { success: false, fromCache: false };
  }

  if (options.showResult) {
    state.lastOriginalParagraphs = chapterText.paragraphs;
  }

  const cacheKey = buildTranslationCacheKey(chapterId, state.targetLanguage, state.provider, options.model);
  const sessionKey = `${state.libraryEntryId ?? 'session'}::${cacheKey}`;
  const cached = await readCachedTranslation(cacheKey, sessionKey);
  if (cached) {
    if (options.showResult) {
      renderParallelColumns(chapterText.paragraphs, cached);
    }
    return { success: true, fromCache: true };
  }

  const payload = {
    model: options.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You are a professional literary translator. Provide only the translated text, preserving paragraph breaks and inline emphasis.',
      },
      {
        role: 'user',
        content: `Translate the following passage into ${options.languageLabel}.\n\n${chapterText.text}`,
      },
    ],
  };

  try {
    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Translation request failed with status ${response.status}`);
    }
    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();
    if (!translatedText) {
      throw new Error('No translation returned');
    }
    if (options.showResult) {
      renderParallelColumns(chapterText.paragraphs, translatedText);
    }
    sessionTranslationCache.set(sessionKey, translatedText);
    if (state.libraryEntryId) {
      await savePersistentTranslation(state.libraryEntryId, cacheKey, translatedText);
    }
    return { success: true, fromCache: false };
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') {
      return { success: false, fromCache: false };
    }
    if (options.showResult) {
      console.error('Translation failed', error);
      updateTranslationStatus('Translation failed. See console for details.', true);
    } else {
      console.warn('Prefetch translation failed', targetHref, error);
    }
    return { success: false, fromCache: false };
  }
}

async function runChapterTranslationBatch(options: ChapterTranslationBatchOptions): Promise<void> {
  if (!state.rendition || !state.book) {
    if (options.announceStatus) {
      updateTranslationStatus('Open a book to translate.', true);
    }
    return;
  }
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    if (options.announceStatus) {
      updateTranslationStatus('Enter your API key to translate.', true);
    }
    return;
  }

  let endpoint = OPENAI_ENDPOINT;
  if (state.provider === 'custom') {
    endpoint = apiEndpointInput.value.trim() || state.customEndpoint.trim();
    if (!endpoint) {
      if (options.announceStatus) {
        updateTranslationStatus('Enter an API endpoint for the custom provider.', true);
      }
      return;
    }
    state.customEndpoint = endpoint;
    persistProviderSettings();
  }

  const currentChapterHref = getCurrentChapterReference();
  if (!currentChapterHref) {
    if (options.announceStatus) {
      updateTranslationStatus('Navigate to a chapter before translating.', true);
    }
    return;
  }

  const nextChapterHref = getAdjacentChapterHref('next');
  const languageLabel = getLanguageLabel(state.targetLanguage);
  const model = state.customModel.trim() || DEFAULT_MODEL;
  const providerLabel = getProviderLabel(state.provider);
  const batchLabel = nextChapterHref ? 'current and next chapters' : 'current chapter';

  translationAbortController?.abort();
  translationAbortController = new AbortController();
  if (options.triggeredByUser) {
    state.autoTranslateEnabled = true;
    setTranslating(true);
  }
  if (options.announceStatus) {
    updateTranslationStatus(`Translating ${batchLabel} via ${providerLabel}...`);
  }

  const tasks: Array<Promise<ChapterTranslationResult>> = [
    translateChapterTarget(currentChapterHref, {
      showResult: true,
      endpoint,
      apiKey,
      model,
      providerLabel,
      languageLabel,
      signal: translationAbortController.signal,
    }),
  ];

  if (nextChapterHref) {
    tasks.push(
      translateChapterTarget(nextChapterHref, {
        showResult: false,
        endpoint,
        apiKey,
        model,
        providerLabel,
        languageLabel,
        signal: translationAbortController.signal,
      }),
    );
  }

  try {
    const results = await Promise.all(tasks);
    const currentResult = results[0];
    if (options.announceStatus && currentResult.success) {
      let message = currentResult.fromCache
        ? `Loaded cached translation via ${providerLabel}.`
        : `Translated to ${languageLabel} via ${providerLabel} (${model}).`;
      if (results.length > 1 && results[1].success) {
        message += ' Prefetched the next chapter in parallel.';
      }
      updateTranslationStatus(message);
    }
  } finally {
    if (options.triggeredByUser) {
      setTranslating(false);
    }
  }
}

async function autoTranslateUpcomingChapter(): Promise<void> {
  if (!state.autoTranslateEnabled) return;
  await runChapterTranslationBatch({ announceStatus: false, triggeredByUser: false });
}

async function translateCurrentView(): Promise<void> {
  await runChapterTranslationBatch({ announceStatus: true, triggeredByUser: true });
}

function handleArrowNavigation(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
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
    hideParallelView();
    return;
  }
  const currentHref = getCurrentChapterReference();
  const chapterContent = await getChapterTextContent(currentHref);
  if (chapterContent) {
    state.lastOriginalParagraphs = chapterContent.paragraphs;
  } else {
    state.lastOriginalParagraphs = splitIntoParagraphs(extractVisibleText());
  }
  const normalizedChapter = normalizeTocHref(currentHref ?? '') ?? currentHref ?? null;
  const chapterId = normalizedChapter ? extractChapterId(normalizedChapter) ?? normalizedChapter : null;
  const model = state.customModel.trim() || DEFAULT_MODEL;
  const cacheKey = buildTranslationCacheKey(chapterId, state.targetLanguage, state.provider, model);
  const sessionKey = `${state.libraryEntryId ?? 'session'}::${cacheKey}`;
  const cached = await readCachedTranslation(cacheKey, sessionKey);
  if (cached) {
    renderTranslationText(cached);
  } else {
    hideParallelView();
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
