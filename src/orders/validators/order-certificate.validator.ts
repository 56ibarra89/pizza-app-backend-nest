export function hasValeNotePrefix(note?: string | null): boolean {
  if (typeof note !== 'string') return false;
  return note.trim().toLocaleLowerCase('es').startsWith('vale:');
}

export function extractCertificateSerialFromNote(
  note?: string | null,
): string | null {
  if (!hasValeNotePrefix(note)) return null;
  const trimmed = note!.trim();
  const serial = trimmed.slice('vale:'.length).trim().toUpperCase();
  if (!serial || /\s/.test(serial)) {
    return null;
  }
  return serial;
}
