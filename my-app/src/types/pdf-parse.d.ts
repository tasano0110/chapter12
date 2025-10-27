declare module "pdf-parse" {
  interface PdfParseResult {
    text?: string;
    info?: unknown;
    metadata?: unknown;
    version?: string;
  }
  function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}

