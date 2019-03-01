
/**
 * Check if `value` is part of `Enum`.
 *
 * @privateRemarks
 *
 * Enum can only be a string record
 *
 * @param value - Value to check.
 * @param Enum - Enumerable object.
 */
export function checkEnum<TEnum extends Record<string, unknown>>(value: unknown, Enum: TEnum): value is TEnum[keyof TEnum] {
  if (typeof value === "string") {
    // Key of a enumable record of numbers
    if (typeof Enum[value] === "number") {
      return false;
    }
    for (const v of Object.values(Enum)) {
      if (value === v) {
        return true;
      }
    }
  }
  return false;
}
