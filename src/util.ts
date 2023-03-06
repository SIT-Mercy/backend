export function arraysEqualNoOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (const item of a) {
    if (!b.includes(item)) {
      return false
    }
  }
  return true
}
