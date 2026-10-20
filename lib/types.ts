export type DataTypeKey =
  | 'pii' | 'health' | 'financial' | 'authentication' | 'communications'
  | 'location' | 'webHistory' | 'userActivity' | 'websiteContent';

export interface Details {
  category?: string;
  officialUrl?: string;
  homepageUrl?: string;
  supportUrl?: string;
  matureContent?: boolean;
  promoVideo?: string;
}

export interface Language {
  description?: string;
  promoVideo?: string;
  /** Keys into Package.blobs, in display order. */
  screenshots?: string[];
}

export interface Images {
  icon?: string;
  smallTile?: string;
  marquee?: string;
  screenshots: string[];
}

export interface Privacy {
  singlePurpose?: string;
  permissions?: Record<string, string>;
  hostPermission?: string;
  remoteCode?: boolean;
  remoteCodeJustification?: string;
  dataCollected?: DataTypeKey[];
  privacyPolicyUrl?: string;
}

export interface TestInstructions {
  username?: string;
  password?: string;
  instructions?: string;
}

/** Everything one dropped listing holds, normalized from either input format. */
export interface Package {
  format: 'meta' | 'cws-listing';
  name: string;
  itemId: string | null;
  loadedAt: number;
  details: Details;
  languages: Record<string, Language>;
  images: Images;
  privacy: Privacy;
  test: TestInstructions | null;
  notes: string[];
  blobs: Record<string, Blob>;
}

export interface FileEntry {
  path: string;
  blob: Blob;
}

export type PageKind = 'listing' | 'privacy' | 'distribution' | 'test'
  | 'installs' | 'impressions' | 'users' | 'ratings' | 'support' | 'item' | 'other';

export interface Page {
  kind: PageKind;
  itemId?: string;
}

export type RecordStatus = 'ok' | 'fail' | 'skip' | 'info';

export interface RunRecord {
  status: RecordStatus;
  text: string;
  /** Offered with a Copy button when a value could not be written. */
  copy?: string;
}

/**
 * How every apply/extract step reports. ok means the value was read back from
 * the page as written; check() throws Stopped once the user pressed Stop.
 */
export interface RunContext {
  records: RunRecord[];
  ok(text: string): void;
  fail(text: string, copy?: string): void;
  skip(text: string): void;
  info(text: string): void;
  progress(text: string): void;
  check(): void;
}

export interface PlanStep {
  text: string;
  destructive?: boolean;
  warn?: boolean;
}

export interface ListingOptions {
  descriptions: boolean;
  localizedImages: boolean;
  images: boolean;
  details: boolean;
}
