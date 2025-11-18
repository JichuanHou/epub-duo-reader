interface TocItem {
  id?: string;
  href: string;
  label?: string;
  subitems?: TocItem[];
}

interface BookMetadata {
  creator?: string;
  creatorFileAs?: string;
  language?: string;
  publisher?: string;
  title?: string;
}

interface RenditionTheme {
  [selector: string]: Record<string, string | number>;
}

interface Rendition {
  display(target?: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  destroy(): void;
  on(event: string, callback: (event: any) => void): void;
  getContents(): RenditionContent[];
  themes: {
    register(name: string, theme: RenditionTheme): void;
    select(name: string): void;
    fontSize(value: string): void;
    font(value: string): void;
  };
}

interface RenditionContent {
  document: Document;
  window: Window;
}

interface Book {
  renderTo(element: HTMLElement | string, options?: Record<string, unknown>): Rendition;
  loaded: {
    metadata: Promise<BookMetadata>;
  };
  navigation?: {
    toc: TocItem[];
  };
  ready: Promise<void>;
  locations: {
    generate(spread?: number): Promise<void>;
    percentageFromCfi(cfi: string): number;
    cfiFromPercentage(percentage: number): string;
  };
  destroy(): void;
  load(path: string): Promise<Document>;
  spine?: {
    get(target: string | number): SpineSection | null | undefined;
  };
}

interface Window {
  ePub(input: ArrayBuffer | string, options?: Record<string, unknown>): Book;
}

interface SpineSection {
  href: string;
  index: number;
  document?: Document;
  load(request?: (path: string) => Promise<Document>): Promise<Element>;
  next?: () => SpineSection | null | undefined;
  prev?: () => SpineSection | null | undefined;
}
