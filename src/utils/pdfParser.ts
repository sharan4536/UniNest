import * as pdfjsLib from 'pdfjs-dist';

// Utilize CDN for the worker to avoid bundler configuration complexities in Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Extracts raw textual data from a PDF file preserving rough tabular layout.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document from ArrayBuffer
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';

    // Iterate all pages
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Y-coordinate grouping to reconstruct line-by-line tabular parsing
        const rows: Record<number, { str: string; x: number }[]> = {};

        for (const item of content.items) {
            if ('str' in item && 'transform' in item) {
                const str = item.str.trim();
                // Skip purely visual empty layout chunks and spaces
                if (!str) continue;

                // item.transform array holds a transformation matrix [ScaleX, SkewY, SkewX, ScaleY, TranslateX, TranslateY]
                const yRaw = item.transform[5];
                const xRaw = item.transform[4];

                // Quantize Y coordinate by ~4 units to merge tokens that belong on the same visual line
                const yQuantized = Math.round(yRaw / 4) * 4;

                if (!rows[yQuantized]) {
                    rows[yQuantized] = [];
                }

                rows[yQuantized].push({ str, x: xRaw });
            }
        }

        // Sort rows from top to bottom (Y descending, since PDF origin is bottom-left)
        const sortedYKeys = Object.keys(rows)
            .map(Number)
            .sort((a, b) => b - a);

        for (const y of sortedYKeys) {
            const rowTokens = rows[y];
            // Sort items within exactly one row from left to right (X ascending)
            rowTokens.sort((a, b) => a.x - b.x);

            const rowText = rowTokens.map((t) => t.str).join('\t');
            fullText += rowText + '\n';
        }

        fullText += '\n'; // Add page separator newline
    }

    return fullText;
}
