# Browser dependencies

All assets are hosted with the application. No user document is sent to an OCR API.

- tesseract.js 5.1.1: dist/tesseract.min.js, dist/worker.min.js; Apache-2.0.
- tesseract.js-core 5.1.1: non-SIMD LSTM WASM and loader; Apache-2.0.
- pdfjs-dist 4.10.38: build/pdf.mjs, build/pdf.worker.mjs; Apache-2.0.
- tessdata_fast 4.1.0: kor.traineddata, eng.traineddata, gzip-compressed; Apache-2.0. Source: https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0

The three npm archives were checked against the registry's SHA-512 dist.integrity before extraction. License files are alongside the assets. Model files were fetched over verified HTTPS from the versioned upstream tag.
