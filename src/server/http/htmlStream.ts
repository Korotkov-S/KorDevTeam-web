import { Transform } from "node:stream";

export function createHtmlResponseStream() {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      // React's UTF-8 streaming buffer can include unused NUL padding.
      // Filter bytes without decoding chunks, which may split a UTF-8 character.
      callback(null, chunk.includes(0) ? chunk.filter(byte => byte !== 0) : chunk);
    },
  });
}
