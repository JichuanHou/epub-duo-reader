# EPUB Duo Reader

A lightweight browser-based EPUB reader that runs entirely on the client. Load local `.epub` files, browse chapters, adjust typography, and switch between light and dark themes without installing a native app.

## Features
- Local-file support (file picker + drag-and-drop) using [`epub.js`](https://github.com/futurepress/epub.js)
- Chapter navigation via auto-generated table of contents
- Keyboard, button, and swipe navigation backed by `epub.js` renditions
- Adjustable font size, selectable typefaces, and polished reader chrome inspired by native apps
- Duo-language translation panel powered by OpenAI (or any OpenAI-compatible endpoint) so you can compare languages side-by-side
- Persistent local library: uploaded books and reading progress stay cached via IndexedDB so you can hop back in without re-uploading
- Focus mode toggle that hides navigation/translation chrome for a distraction-free page
- Focus mode toggle that hides navigation/translation chrome for a distraction-free page

## Getting Started
1. Install dependencies (TypeScript only) and build:
   ```bash
   npm install
   npm run build     # or `npm run dev` to keep tsc watching
   ```
2. Serve `index.html` with any static HTTP server (the compiled assets live in `scripts/`):
   ```bash
   python3 -m http.server 4173
   ```
3. Visit `http://localhost:4173` to drop an EPUB file into the reader. Append `#demo` to the URL (e.g., `http://localhost:4173/#demo`) to auto-load a hosted sample book.

## Duo-Language Translation
1. Click **Settings** in the translation sidebar to configure provider, endpoint, model name (defaults to `gpt-4o-mini`), target language, and API key. `OpenAI` uses the default `https://api.openai.com/v1/chat/completions`, while `Custom endpoint` supports any OpenAI-compatible proxy/Azure host.
2. Enter the model identifier required by your provider (leave the default for OpenAI) and the matching API key. All values are stored in `localStorage` so you only enter them once per device.
3. Close the dialog, then click **Translate current view**. The reader gathers the text visible in the EPUB iframe and sends it to the chosen model/endpoint; the translated output appears in the right column.

Tips:
- If no text is visible (for example, on a cover page), load a chapter first.
- Keep an eye on API usage—each translation makes a call from the browser using your key.
- Use the menu button in the top-left to toggle focus mode whenever you want extra screen real estate.
- Translations are cached per page/language/provider/model. Once translated, revisiting the same spread reuses the result instantly (and persists when the book lives in the library).
- You can tweak the list of languages, providers, or the translation prompt inside `src/main.ts` if you need more control.

## Library & Progress
- When the app loads you land on the library homepage. Click **Add Book** (or drag an EPUB anywhere) once— the file is stored locally via IndexedDB.
- Selecting a book opens it immediately and restores your last location; progress updates automatically as you turn pages.
- Jump back to the homepage any time with the **Library** button in the top bar. All data stays on your device, so no uploads are required after the first import.

## Project Structure
```
.
├── index.html        # Shell that wires styles + scripts and loads epub.js via CDN
├── src/
│   └── main.ts       # TypeScript source for the reader logic
├── scripts/
│   └── main.js       # Generated JavaScript emitted by `npm run build`
├── styles/
│   └── main.css      # Layout, typography, and responsive styling
└── tsconfig.json     # Compiler configuration shared by build + watch commands
```

## Next Steps
- Add service worker caching to remember recent books
- Persist reader preferences (font size, theme)
- Bundle the project using Vite or another toolchain for easier future enhancements
