/**
 * Checks if two Uint8Arrays are equal
 */
export const isEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((d, i) => d === b[i]);
};
