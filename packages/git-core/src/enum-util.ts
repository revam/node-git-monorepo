
/**
 * Check if `value` is part of `enumConst`.
 *
 * @param value - Value to check.
 * @param Enum - Enumerable object.
 */
export function checkEnum<TEnum extends Record<string, any>>(value: unknown, Enum: TEnum): value is TEnum[keyof TEnum] {
  const type = typeof value;
  if (type === "string" || type === "number") {
    for (const v of Object.values(Enum)) {
      if (value === v) {
        return true;
      }
    }
  }
  return false;
}
