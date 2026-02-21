export function toDriveLabel(absPath: string, diskPath?: string): string {
  if (diskPath) {
    const normalizedDisk = diskPath.replace(/\//g, '\\').toUpperCase();
    const match = normalizedDisk.match(/^([A-Z]:)/);
    if (match) {
      return `${match[1]}\\`;
    }
    return normalizedDisk;
  }

  const normalizedPath = absPath.replace(/\//g, '\\').toUpperCase();
  const match = normalizedPath.match(/^([A-Z]:)/);
  if (match?.[1]) {
    return `${match[1]}\\`;
  }
  return absPath || 'unknown';
}
