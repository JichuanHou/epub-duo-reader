"use strict";
const fileInput = getElement('fileInput');
const dropZone = getElement('dropZone');
const dropZoneLabel = dropZone.querySelector('p');
const viewer = getElement('viewer');
const nextBtn = getElement('nextBtn');
const prevBtn = getElement('prevBtn');
const tocList = getElement('tocList');
const fontFamilySelect = getElement('fontFamily');
const fontSmaller = getElement('fontSmaller');
const fontLarger = getElement('fontLarger');
const progressLabel = getElement('progressLabel');
const progressSlider = getElement('progressSlider');
const readingArea = getElement('readingArea');
const readerControls = getElement('readerControls');
const layoutToggle = getElement('layoutToggle');
const languageSelect = getElement('languageSelect');
const providerSelect = getElement('providerSelect');
const modelInput = getElement('modelInput');
const apiEndpointInput = getElement('apiEndpointInput');
const apiKeyInput = getElement('apiKeyInput');
const translateBtn = getElement('translateBtn');
const translationStatus = getElement('translationStatus');
const parallelView = getElement('parallelView');
const parallelRows = getElement('parallelRows');
const settingsDialog = getElement('translationSettings');
const openSettingsBtn = getElement('openSettingsBtn');
const closeSettingsBtn = getElement('closeSettingsBtn');
const libraryOverlay = getElement('libraryOverlay');
const closeLibraryBtn = getElement('closeLibraryBtn');
const openLibraryBtn = getElement('openLibraryBtn');
const addLibraryBookBtn = getElement('addLibraryBookBtn');
const addLibraryBookFooter = getElement('addLibraryBookFooter');
const libraryList = getElement('libraryList');
const libraryEmpty = getElement('libraryEmpty');
const readerLoading = getElement('readerLoading');
const readerLoadingText = getElement('readerLoadingText');
let sliderInteracting = false;
let controlsVisible = false;
let translationAbortController = null;
const sessionTranslationCache = new Map();
const chapterTextCache = new Map();
const scrollSyncCleanup = [];
const state = {
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
const FONT_PRESETS = [
    { label: 'Publisher default', value: 'inherit' },
    { label: 'Inter (sans)', value: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    { label: 'Merriweather (serif)', value: "'Merriweather', 'Georgia', serif" },
    { label: 'Source Code (mono)', value: "'Source Code Pro', 'SFMono-Regular', Menlo, monospace" },
];
const LANGUAGE_OPTIONS = [
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'ja', label: 'Japanese' },
    { value: 'zh-Hans', label: 'Chinese (Simplified)' },
];
const PROVIDER_OPTIONS = [
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
let libraryDbPromise = null;
let libraryCache = [];
const LIGHT_THEME = {
    body: {
        background: '#ffffff',
        color: '#1b1f32',
        padding: '1.5rem',
        lineHeight: 1.5,
    },
};
const DARK_THEME = {
    body: {
        background: '#0f111a',
        color: '#f5f6fb',
        padding: '1.5rem',
        lineHeight: 1.5,
    },
};
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Element with id "${id}" not found`);
    }
    return element;
}
function destroyBook() {
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
async function handleFile(file, options = {}) {
    if (!file)
        return;
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
        state.rendition.on('rendered', (content) => bindScrollSync(content));
        await state.rendition.display();
        const metadata = await state.book.loaded.metadata;
        updateMetadata(metadata);
        if (options.skipLibrarySave) {
            state.libraryEntryId = options.libraryId ?? null;
        }
        else {
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
            }
            catch (error) {
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
    }
    catch (error) {
        console.error(error);
        alert('Unable to load EPUB file. Please make sure it is valid.');
    }
    finally {
        hideReaderLoading();
    }
}
function updateMetadata(_) {
    // Intentionally no-op for now; metadata panel removed in this layout.
}
function resetChapterList() {
    tocList.innerHTML = '<li class="placeholder">Load a book to see its chapters.</li>';
}
function populateToc() {
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
function rebuildChapterIndex() {
    const flattened = [];
    const walk = (items) => {
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
function normalizeTocHref(href) {
    if (!href)
        return null;
    const trimmed = href.trim();
    if (!trimmed)
        return null;
    const [path, hash] = trimmed.split('#');
    let resolvedPath = path || trimmed;
    try {
        const section = state.book?.spine?.get?.(resolvedPath);
        if (section?.href) {
            resolvedPath = section.href;
        }
    }
    catch (error) {
        console.warn('Unable to resolve TOC href', href, error);
    }
    if (!resolvedPath) {
        return null;
    }
    return hash ? `${resolvedPath}#${hash}` : resolvedPath;
}
function buildChapterDisplayAttempts(primary, fallback) {
    const attempts = [];
    const addAttempt = (value) => {
        const trimmed = value?.trim();
        if (trimmed && !attempts.includes(trimmed)) {
            attempts.push(trimmed);
        }
    };
    const normalizedPrimary = primary ? normalizeTocHref(primary) ?? primary : null;
    const normalizedFallback = fallback && fallback !== primary ? normalizeTocHref(fallback) ?? fallback : null;
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
async function ensureRenditionHasContent(retries = 3, delay = 60) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const hasContent = Boolean(state.rendition?.getContents?.()?.length);
        if (hasContent) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return Boolean(state.rendition?.getContents?.()?.length);
}
async function displayChapterTarget(target, fallback) {
    if (!state.rendition)
        return;
    const attempts = buildChapterDisplayAttempts(target, fallback);
    if (!attempts.length)
        return;
    for (const href of attempts) {
        try {
            await state.rendition.display(href);
            const hasContent = await ensureRenditionHasContent();
            if (hasContent) {
                return;
            }
        }
        catch (error) {
            console.warn('Unable to display section', href, error);
        }
    }
    console.warn('Unable to render chapter for target', target);
}
function getSpineSection(target) {
    if (!target || !state.book?.spine?.get)
        return null;
    const normalized = normalizeTocHref(target) ?? target;
    return state.book.spine.get(normalized) ?? state.book.spine.get(target) ?? null;
}
function collectParagraphsFromBody(body) {
    const blocks = Array.from(body.querySelectorAll('p, li, blockquote, section, article, pre, h1, h2, h3, h4, h5, h6'))
        .map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
        .filter((value) => Boolean(value));
    if (blocks.length) {
        return blocks;
    }
    const fallback = body.textContent?.replace(/\s+/g, ' ').trim();
    return fallback ? [fallback] : [];
}
async function getChapterTextContent(target) {
    if (!target || !state.book?.spine?.get)
        return null;
    const normalized = normalizeTocHref(target) ?? target;
    if (!normalized)
        return null;
    if (chapterTextCache.has(normalized)) {
        const cachedText = chapterTextCache.get(normalized) ?? '';
        const paragraphs = splitIntoParagraphs(cachedText);
        return { text: cachedText, paragraphs };
    }
    const section = getSpineSection(normalized);
    if (!section)
        return null;
    const request = state.book.load?.bind(state.book);
    try {
        await section.load(request);
    }
    catch (error) {
        console.warn('Unable to load section contents for translation', normalized, error);
        return null;
    }
    const body = section.document?.querySelector('body');
    if (!body)
        return null;
    const paragraphs = collectParagraphsFromBody(body);
    if (!paragraphs.length)
        return null;
    const text = paragraphs.join('\n\n');
    chapterTextCache.set(normalized, text);
    return { text, paragraphs };
}
function getCurrentChapterReference() {
    const location = state.rendition?.currentLocation?.() ?? null;
    const currentCfi = location?.start?.cfi ?? null;
    return state.currentChapterId ?? extractChapterId(currentCfi) ?? state.currentHref ?? null;
}
function getAdjacentChapterHref(direction) {
    const current = getCurrentChapterReference();
    const section = getSpineSection(current);
    if (!section)
        return null;
    const neighbor = direction === 'next' ? section.next?.() : section.prev?.();
    return neighbor?.href ?? null;
}
async function navigateToChapterOffset(offset) {
    if (!state.chapterIndex.length)
        return;
    const currentRef = getCurrentChapterReference();
    const normalized = normalizeTocHref(currentRef ?? '') ?? currentRef ?? state.chapterIndex[0]?.href ?? null;
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
async function navigateToChapterEntry(entry) {
    if (!entry)
        return;
    state.currentHref = entry.href;
    state.currentChapterId = entry.id;
    highlightChapter(entry.id);
    try {
        await displayChapterTarget(entry.href, entry.originalHref);
    }
    catch (error) {
        console.error('Unable to display section from shortcut', error);
    }
    await showCachedTranslationForCurrentLocation();
}
function addTocEntry(item, depth = 0) {
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
        if (!state.rendition || !resolvedTarget)
            return;
        const highlightValue = highlightTarget ?? extractChapterId(resolvedTarget) ?? resolvedTarget;
        state.currentHref = highlightValue;
        state.currentChapterId = extractChapterId(highlightValue) ?? highlightValue;
        highlightChapter(highlightValue);
        try {
            await displayChapterTarget(resolvedTarget, item.href);
        }
        catch (error) {
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
function highlightChapter(href) {
    tocList.querySelectorAll('button').forEach((button) => {
        const target = button;
        target.classList.toggle('active', target.dataset.href === href);
    });
    state.currentChapterId = extractChapterId(href);
}
function setupEventListeners() {
    fileInput.addEventListener('change', (event) => {
        const target = event.currentTarget;
        void handleFile(target.files?.[0] ?? null);
    });
    nextBtn.addEventListener('click', () => state.rendition?.next());
    prevBtn.addEventListener('click', () => state.rendition?.prev());
    fontSmaller.addEventListener('click', () => adjustFontScale(-10));
    fontLarger.addEventListener('click', () => adjustFontScale(10));
    fontFamilySelect.addEventListener('change', applyFontFromSelect);
    const startSliderInteraction = () => {
        if (progressSlider.disabled)
            return;
        sliderInteracting = true;
        showReaderControls();
    };
    const endSliderInteraction = () => {
        sliderInteracting = false;
    };
    ['pointerdown', 'touchstart'].forEach((eventName) => {
        progressSlider.addEventListener(eventName, startSliderInteraction);
    });
    ['pointerup', 'touchend', 'touchcancel', 'mouseleave', 'blur'].forEach((eventName) => {
        progressSlider.addEventListener(eventName, endSliderInteraction);
    });
    progressSlider.addEventListener('input', (event) => {
        if (progressSlider.disabled)
            return;
        const target = event.currentTarget;
        progressLabel.textContent = `${target.value}%`;
    });
    progressSlider.addEventListener('change', (event) => {
        if (progressSlider.disabled || !state.book || !state.locationsReady)
            return;
        const target = event.currentTarget;
        const percentage = Number(target.value) / 100;
        try {
            const cfi = state.book.locations.cfiFromPercentage(percentage);
            void state.rendition?.display(cfi);
        }
        catch (error) {
            console.warn('Unable to navigate to requested location', error);
        }
        sliderInteracting = false;
    });
    languageSelect.addEventListener('change', (event) => {
        const target = event.currentTarget;
        state.targetLanguage = target.value;
        persistLanguagePreference();
    });
    providerSelect.addEventListener('change', (event) => {
        const target = event.currentTarget;
        state.provider = target.value ?? 'openai';
        syncEndpointInputState();
        persistProviderSettings();
    });
    modelInput.addEventListener('input', (event) => {
        const target = event.currentTarget;
        state.customModel = target.value.trim();
    });
    modelInput.addEventListener('blur', () => {
        state.customModel = modelInput.value.trim();
        persistProviderSettings();
    });
    apiEndpointInput.addEventListener('input', (event) => {
        const target = event.currentTarget;
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
        if (!state.book)
            return;
        hideLibraryOverlay();
    });
    [addLibraryBookBtn, addLibraryBookFooter].forEach((button) => {
        button.addEventListener('click', () => fileInput.click());
    });
    libraryList.addEventListener('click', (event) => {
        const entry = event.target.closest('[data-book-id]');
        if (!entry)
            return;
        const id = entry.dataset.bookId;
        if (!id)
            return;
        void loadBookFromLibrary(id);
    });
}
function isEditableElement(element) {
    if (!element)
        return false;
    const tagName = element.tagName;
    if (!tagName)
        return false;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName))
        return true;
    if (element.isContentEditable)
        return true;
    return false;
}
function handleChapterShortcut(event) {
    if (!state.chapterIndex.length)
        return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
        return;
    if (isEditableElement(event.target))
        return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    void navigateToChapterOffset(offset);
}
function populateFontOptions() {
    fontFamilySelect.innerHTML = '';
    FONT_PRESETS.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.value;
        option.textContent = preset.label;
        fontFamilySelect.append(option);
    });
    fontFamilySelect.value = FONT_PRESETS[0]?.value ?? 'inherit';
}
function populateLanguageOptions() {
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
function restoreApiKey() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.apiKey);
        if (stored) {
            apiKeyInput.value = stored;
        }
    }
    catch (error) {
        console.warn('Unable to access localStorage for API key', error);
    }
}
function persistApiKey() {
    try {
        localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
    }
    catch (error) {
        console.warn('Unable to persist API key', error);
    }
}
function populateProviderOptions() {
    providerSelect.innerHTML = '';
    PROVIDER_OPTIONS.forEach((provider) => {
        const option = document.createElement('option');
        option.value = provider.value;
        option.textContent = provider.label;
        providerSelect.append(option);
    });
    providerSelect.value = state.provider;
}
function restoreProviderSettings() {
    try {
        const storedProvider = localStorage.getItem(STORAGE_KEYS.provider);
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
    }
    catch (error) {
        console.warn('Unable to load provider preferences', error);
    }
    providerSelect.value = state.provider;
    if (!state.customModel) {
        state.customModel = DEFAULT_MODEL;
    }
    modelInput.value = state.customModel;
    syncEndpointInputState();
}
function persistProviderSettings() {
    try {
        localStorage.setItem(STORAGE_KEYS.provider, state.provider);
        localStorage.setItem(STORAGE_KEYS.endpoint, state.customEndpoint);
        localStorage.setItem(STORAGE_KEYS.customModel, state.customModel);
    }
    catch (error) {
        console.warn('Unable to persist provider settings', error);
    }
}
function syncEndpointInputState() {
    const isCustom = state.provider === 'custom';
    apiEndpointInput.disabled = !isCustom;
    if (!isCustom) {
        apiEndpointInput.placeholder = OPENAI_ENDPOINT;
    }
    else if (!apiEndpointInput.value) {
        apiEndpointInput.placeholder = 'https://your-endpoint/v1/chat/completions';
    }
    apiEndpointInput.value = state.customEndpoint;
}
function extractChapterId(reference) {
    if (!reference)
        return null;
    const [path] = reference.split('#');
    return path || null;
}
function createLibraryId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function persistLanguagePreference() {
    try {
        localStorage.setItem(STORAGE_KEYS.language, state.targetLanguage);
    }
    catch (error) {
        console.warn('Unable to remember target language', error);
    }
}
function persistFontScalePreference() {
    try {
        localStorage.setItem(STORAGE_KEYS.fontScale, String(state.fontScale));
    }
    catch (error) {
        console.warn('Unable to remember font size', error);
    }
}
function restoreReaderPreferences() {
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
    }
    catch (error) {
        console.warn('Unable to restore reading preferences', error);
    }
    languageSelect.value = state.targetLanguage;
}
async function refreshLibraryList() {
    try {
        libraryCache = await fetchLibraryBooks();
        renderLibraryList(libraryCache);
    }
    catch (error) {
        console.error('Unable to refresh library', error);
    }
}
function renderLibraryList(books) {
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
function updateLibraryEntryProgress(id, percentage) {
    const summary = libraryCache.find((book) => book.id === id);
    if (summary) {
        summary.lastProgress = percentage;
    }
    const entry = libraryList.querySelector(`[data-book-id="${id}"] .progress-pill`);
    if (entry) {
        entry.textContent = `${percentage}% read`;
    }
}
function showLibraryOverlay() {
    libraryOverlay.classList.add('visible');
    updateLibraryCloseAvailability();
}
function hideLibraryOverlay() {
    libraryOverlay.classList.remove('visible');
}
function updateLibraryCloseAvailability() {
    const canClose = Boolean(state.book);
    closeLibraryBtn.disabled = !canClose;
    closeLibraryBtn.classList.toggle('disabled', !canClose);
}
function showReaderLoading(message) {
    readerLoadingText.textContent = message;
    readerLoading.classList.remove('hidden');
}
function hideReaderLoading() {
    readerLoading.classList.add('hidden');
}
function buildTranslationCacheKey(sectionId, language, provider, model) {
    return `${sectionId ?? 'page'}::${language}::${provider}::${model}`;
}
async function loadPersistentTranslation(bookId, key) {
    const db = await openLibraryDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TRANSLATION_STORE, 'readonly');
        const store = tx.objectStore(TRANSLATION_STORE);
        const request = store.get(`${bookId}::${key}`);
        request.onsuccess = () => {
            const record = request.result;
            resolve(record?.text ?? null);
        };
        request.onerror = () => reject(request.error ?? new Error('Failed to read translation cache'));
    });
}
async function savePersistentTranslation(bookId, key, text) {
    const db = await openLibraryDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(TRANSLATION_STORE, 'readwrite');
        const store = tx.objectStore(TRANSLATION_STORE);
        store.put({ id: `${bookId}::${key}`, bookId, key, text, updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save translation cache'));
    });
}
async function readCachedTranslation(cacheKey, sessionKey) {
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
async function loadBookFromLibrary(id) {
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
async function openLibraryDb() {
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
async function saveBookToLibrary(buffer, metadata, fileName) {
    const db = await openLibraryDb();
    const id = createLibraryId();
    const record = {
        id,
        title: metadata.title || fileName.replace(/\.epub$/i, ''),
        author: metadata.creator || metadata.creatorFileAs || 'Unknown author',
        fileName,
        addedAt: Date.now(),
        blob: new Blob([buffer], { type: 'application/epub+zip' }),
        lastProgress: 0,
    };
    await new Promise((resolve, reject) => {
        const tx = db.transaction(LIBRARY_STORE, 'readwrite');
        const store = tx.objectStore(LIBRARY_STORE);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save book to library'));
    });
    return id;
}
async function fetchLibraryBooks() {
    const db = await openLibraryDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(LIBRARY_STORE, 'readonly');
        const store = tx.objectStore(LIBRARY_STORE);
        const request = store.getAll();
        request.onsuccess = () => {
            const records = request.result || [];
            resolve(records.map(({ blob: _blob, lastCfi: _cfi, ...summary }) => summary));
        };
        request.onerror = () => reject(request.error ?? new Error('Failed to read library'));
    });
}
async function getLibraryRecord(id) {
    const db = await openLibraryDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(LIBRARY_STORE, 'readonly');
        const store = tx.objectStore(LIBRARY_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error ?? new Error('Failed to load book from library'));
    });
}
async function updateLibraryProgressRecord(id, progress) {
    const db = await openLibraryDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(LIBRARY_STORE, 'readwrite');
        const store = tx.objectStore(LIBRARY_STORE);
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const record = getRequest.result;
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
function restoreFocusMode() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.focusMode);
        state.focusMode = stored === 'true';
    }
    catch (error) {
        console.warn('Unable to read focus mode preference', error);
    }
    applyFocusMode();
}
function persistFocusMode() {
    try {
        localStorage.setItem(STORAGE_KEYS.focusMode, String(state.focusMode));
    }
    catch (error) {
        console.warn('Unable to persist focus mode preference', error);
    }
}
function applyFocusMode() {
    document.body.classList.toggle('focus-mode', state.focusMode);
    layoutToggle.setAttribute('aria-pressed', String(state.focusMode));
    layoutToggle.title = state.focusMode ? 'Show side panels' : 'Hide side panels';
}
function applyFontFromSelect() {
    if (!state.rendition)
        return;
    const value = fontFamilySelect.value || 'inherit';
    state.rendition.themes.font(value);
}
function clampFontScale(value) {
    return Math.min(140, Math.max(90, value));
}
function applyFontScale() {
    if (!state.rendition)
        return;
    state.fontScale = clampFontScale(state.fontScale);
    state.rendition.themes.fontSize(`${state.fontScale}%`);
}
function adjustFontScale(delta) {
    state.fontScale = clampFontScale(state.fontScale + delta);
    applyFontScale();
    persistFontScalePreference();
}
function setupDragAndDrop() {
    const showDropHint = () => {
        dropZone.classList.remove('hidden');
        dropZone.classList.add('active');
    };
    const hideDropHint = () => {
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
    const handleDropEvent = (event) => {
        preventDefaults(event);
        hideDropHint();
        const file = event.dataTransfer?.files?.[0];
        void handleFile(file ?? null);
    };
    readingArea.addEventListener('drop', handleDropEvent);
    dropZone.addEventListener('drop', handleDropEvent);
}
function preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
}
function setupReaderControlsVisibility() {
    const threshold = 120;
    readingArea.addEventListener('mousemove', (event) => {
        const rect = readingArea.getBoundingClientRect();
        const distanceFromBottom = rect.bottom - event.clientY;
        if (distanceFromBottom <= threshold) {
            showReaderControls();
        }
        else if (!readerControls.contains(document.activeElement)) {
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
async function prepareLocations() {
    if (!state.book?.locations) {
        return;
    }
    try {
        await state.book.locations.generate(1600);
        state.locationsReady = true;
        progressSlider.disabled = false;
    }
    catch (error) {
        console.warn('Unable to build book locations', error);
    }
}
async function handleRelocated(location) {
    if (!location)
        return;
    const href = location.start?.href;
    if (href) {
        state.currentHref = href;
        highlightChapter(href);
    }
    const cfi = location.start?.cfi;
    if (!state.book || !cfi || !state.locationsReady)
        return;
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
function updateProgress(percent) {
    const value = Math.min(100, Math.max(0, percent));
    progressLabel.textContent = `${value}%`;
    if (!sliderInteracting) {
        progressSlider.value = value.toString();
    }
    state.lastScrollPercent = value;
    scrollTranslationToPercent(value);
}
function extractVisibleText() {
    if (!state.rendition)
        return '';
    const contents = state.rendition.getContents?.() ?? [];
    const text = contents
        .map((content) => content.document?.body?.innerText?.trim() ?? '')
        .filter((value) => value.length)
        .join('\n\n');
    return text;
}
function getLanguageLabel(value) {
    return LANGUAGE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
function getProviderLabel(value) {
    return PROVIDER_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
function updateTranslationStatus(message, isError = false) {
    translationStatus.dataset.message = message;
    translationStatus.dataset.state = isError ? 'error' : 'ok';
}
function splitIntoParagraphs(text) {
    if (!text)
        return [];
    return text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}
function renderParallelColumns(originalParagraphs, translationText) {
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
function renderTranslationText(text) {
    if (!state.lastOriginalParagraphs.length) {
        state.lastOriginalParagraphs = splitIntoParagraphs(extractVisibleText());
    }
    renderParallelColumns(state.lastOriginalParagraphs, text);
}
function setTranslating(active) {
    translateBtn.disabled = active;
    if (active) {
        translateBtn.textContent = 'Translating...';
    }
    else {
        translateBtn.textContent = 'Translate chapter';
    }
}
function setDropZoneVisibility(visible) {
    dropZone.classList.toggle('hidden', !visible);
}
function scrollTranslationToPercent(percent) {
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
function hideParallelView() {
    parallelView.classList.add('hidden');
    viewer.classList.remove('hidden');
    parallelRows.innerHTML = '';
}
function bindScrollSync(content) {
    const doc = content?.document;
    if (!doc)
        return;
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
function openSettingsDialog() {
    settingsDialog.classList.add('visible');
}
function closeSettingsDialog() {
    settingsDialog.classList.remove('visible');
}
async function translateChapterTarget(targetHref, options) {
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
                content: 'You are a professional literary translator. Provide only the translated text, preserving paragraph breaks and inline emphasis.',
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
    }
    catch (error) {
        if (error.name === 'AbortError') {
            return { success: false, fromCache: false };
        }
        if (options.showResult) {
            console.error('Translation failed', error);
            updateTranslationStatus('Translation failed. See console for details.', true);
        }
        else {
            console.warn('Prefetch translation failed', targetHref, error);
        }
        return { success: false, fromCache: false };
    }
}
async function runChapterTranslationBatch(options) {
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
    const tasks = [
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
        tasks.push(translateChapterTarget(nextChapterHref, {
            showResult: false,
            endpoint,
            apiKey,
            model,
            providerLabel,
            languageLabel,
            signal: translationAbortController.signal,
        }));
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
    }
    finally {
        if (options.triggeredByUser) {
            setTranslating(false);
        }
    }
}
async function autoTranslateUpcomingChapter() {
    if (!state.autoTranslateEnabled)
        return;
    await runChapterTranslationBatch({ announceStatus: false, triggeredByUser: false });
}
async function translateCurrentView() {
    await runChapterTranslationBatch({ announceStatus: true, triggeredByUser: true });
}
function handleArrowNavigation(event) {
    if (event.defaultPrevented)
        return;
    if (!state.rendition)
        return;
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        void state.rendition.next();
    }
    else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void state.rendition.prev();
    }
}
async function showCachedTranslationForCurrentLocation() {
    if (!state.rendition) {
        hideParallelView();
        return;
    }
    const currentHref = getCurrentChapterReference();
    const chapterContent = await getChapterTextContent(currentHref);
    if (chapterContent) {
        state.lastOriginalParagraphs = chapterContent.paragraphs;
    }
    else {
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
    }
    else {
        hideParallelView();
    }
}
function bindRenditionShortcuts() {
    if (!state.rendition)
        return;
    state.rendition.on('keyup', (event) => handleArrowNavigation(event));
}
function showReaderControls() {
    if (controlsVisible)
        return;
    controlsVisible = true;
    readerControls.classList.add('visible');
}
function hideReaderControls() {
    if (!controlsVisible)
        return;
    controlsVisible = false;
    readerControls.classList.remove('visible');
}
async function loadSampleFromHash() {
    if (window.location.hash !== '#demo')
        return;
    try {
        const response = await fetch('https://s3.amazonaws.com/epubjs/books/moby-dick.epub');
        if (!response.ok)
            return;
        const blob = await response.blob();
        const file = new File([blob], 'sample.epub');
        await handleFile(file);
    }
    catch (error) {
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
