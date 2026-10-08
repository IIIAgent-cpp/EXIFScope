export interface ExifGPS {
    latitude: number;
    longitude: number;
}
export interface RawExifData {
    make?: string | null;
    model?: string | null;
    date?: string | null;
    dateOriginal?: string | null;
    exposureTime?: number | null;
    fNumber?: number | null;
    iso?: number | null;
    focalLength?: number | null;
    gps?: ExifGPS;
}
export interface ImageResult {
    index: number;
    type: string;
    location: string;
    url: string;
    dimensions: string;
    altText: string;
    cameraMake: string;
    cameraModel: string;
    dateTaken: string;
    exposure: string;
    aperture: string;
    iso: string;
    gpsCoordinates: string;
    status: string;
    rawExif?: RawExifData | null;
}
export interface AnalyzeOptions {
    rangeBytes?: number;
    rootElement?: Document | Element | ShadowRoot;
    logToConsole?: boolean;
}
export interface ImageSource {
    type: string;
    where: string;
    src: string;
    img: HTMLImageElement | null;
}
export declare function parseImageExif(arrayBuffer: ArrayBuffer): RawExifData | null;
export declare function analyzeExif(options?: AnalyzeOptions): Promise<ImageResult[]>;
