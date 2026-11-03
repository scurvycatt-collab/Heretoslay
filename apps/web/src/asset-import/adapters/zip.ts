/** Minimal ZIP writer (method 0 / stored). PNGs are already compressed, so storing is fine. */
export interface ZipEntry { name: string; data: Uint8Array }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Reject anything that could escape the extraction directory. */
export function isSafeZipPath(name: string): boolean {
  return /^[a-zA-Z0-9_.\-]+(\/[a-zA-Z0-9_.\-]+)*$/.test(name) && name.split("/").every((part) => part !== "." && part !== "..");
}

export function buildZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // 2026-01-01 00:00:00 in DOS format; fixed so the archive bytes are reproducible.
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const entry of entries) {
    if (!isSafeZipPath(entry.name)) throw new Error(`Đường dẫn ZIP không an toàn: ${entry.name}`);
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true); local.setUint32(18, entry.data.length, true); local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, entry.data);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true); head.setUint16(4, 20, true); head.setUint16(6, 20, true); head.setUint16(8, 0x0800, true);
    head.setUint16(10, 0, true); head.setUint16(12, dosTime, true); head.setUint16(14, dosDate, true);
    head.setUint32(16, crc, true); head.setUint32(20, entry.data.length, true); head.setUint32(24, entry.data.length, true);
    head.setUint16(28, name.length, true); head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + entry.data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/zip" });
}

/** Re-read an archive and return its entries; used to verify exports instead of trusting the writer. */
export async function readZip(blob: Blob): Promise<{ name: string; size: number; crc: number; crcOk: boolean }[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("ZIP thiếu end-of-central-directory.");
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const out: { name: string; size: number; crc: number; crcOk: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error("ZIP central directory hỏng.");
    const crc = view.getUint32(pos + 16, true), size = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true), local = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out.push({ name, size, crc, crcOk: crc32(bytes.subarray(dataStart, dataStart + size)) === crc });
    pos += 46 + nameLen + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
  return out;
}
