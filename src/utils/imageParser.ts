import Tesseract from 'tesseract.js';

export async function extractTextFromImage(file: File): Promise<string> {
    const imageUrl = URL.createObjectURL(file);
    try {
        const worker = await Tesseract.createWorker('eng');

        // Using PSM 1 (Automatic page segmentation with OSD) 
        // or PSM 6 (Assume a single uniform block of text).
        // Often 6 or 4 works best for semi-tabular data, but manual bounding box reconstruction is safest.
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        });

        const ret = await worker.recognize(imageUrl);
        await worker.terminate();

        // Instead of using ret.data.text (which often mushes columns),
        // we use the word bounding boxes to reconstruct textual rows.
        const words = ret.data.words;
        if (!words || words.length === 0) return ret.data.text;

        // Group words by their vertical center coordinate
        const rows: Record<number, { text: string; x: number }[]> = {};

        for (const word of words) {
            if (!word.text.trim()) continue;

            const bbox = word.bbox;
            // Calculate vertical center of the word bounding box
            const yCenter = (bbox.y0 + bbox.y1) / 2;

            // Quantize the Y coordinate by a generous amount (e.g. 10-15 pixels)
            // to group words that are on the same line but might be slightly misaligned.
            // This threshold depends on image resolution, so 15 is a reasonable guess for screenshots.
            const yQuantized = Math.round(yCenter / 15) * 15;

            if (!rows[yQuantized]) {
                rows[yQuantized] = [];
            }

            rows[yQuantized].push({ text: word.text.trim(), x: bbox.x0 });
        }

        let fullText = '';
        // Sort rows top-to-bottom
        const sortedYKeys = Object.keys(rows)
            .map(Number)
            .sort((a, b) => a - b);

        for (const y of sortedYKeys) {
            const rowTokens = rows[y];
            // Sort words left-to-right
            rowTokens.sort((a, b) => a.x - b.x);

            const rowText = rowTokens.map((t) => t.text).join('\t');
            fullText += rowText + '\n';
        }

        return fullText;
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}
