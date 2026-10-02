/** Small strict query evaluator for synthetic isolation fixtures, never a database substitute. */
export function matches(
  document: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$and")
      return (expected as Record<string, unknown>[]).every((part) =>
        matches(document, part),
      );
    if (key === "$or")
      return (expected as Record<string, unknown>[]).some((part) =>
        matches(document, part),
      );
    const actual = document[key];
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof Date) &&
      !("toHexString" in expected)
    ) {
      return Object.entries(expected).every(([operator, value]) => {
        switch (operator) {
          case "$exists":
            return (actual !== undefined) === value;
          case "$ne":
            return String(actual) !== String(value);
          case "$in":
            return (value as unknown[]).some((item) => String(actual) === String(item));
          case "$gt":
            return (actual as number) > value;
          case "$gte":
            return (actual as number) >= value;
          case "$lt":
            return (actual as number) < value;
          case "$lte":
            return (actual as number) <= value;
          default:
            throw new Error("Unsupported test query operator: " + operator);
        }
      });
    }
    return expected === null ? actual == null : String(actual) === String(expected);
  });
}
