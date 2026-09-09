/** Serialize plain session records without a recursion limit on nested trees.
 * Compact JSON avoids quadratic indentation size in highly nested trees.
 */
export function stringifySession(value) {
  const parts = [];
  const ancestors = new Set();
  const stack = [{ value }];
  while (stack.length) {
    const frame = stack.pop();
    if (frame.text != null) { parts.push(frame.text); continue; }
    if (frame.close) { ancestors.delete(frame.value); parts.push(frame.close); continue; }
    const item = frame.value;
    if (!item || typeof item !== "object") {
      parts.push(JSON.stringify(item) ?? "null");
      continue;
    }
    if (ancestors.has(item)) throw new Error("Cannot save a cyclic session");
    ancestors.add(item);
    const array = Array.isArray(item);
    const entries = array ? Array.from(item, (entry, i) => [i, entry]) : Object.entries(item).filter(([, entry]) => entry !== undefined);
    parts.push(array ? "[" : "{");
    stack.push({ value: item, close: array ? "]" : "}" });
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, entry] = entries[i];
      stack.push({ value: entry });
      if (!array) stack.push({ text: JSON.stringify(key) + ":" });
      if (i > 0) stack.push({ text: "," });
    }
  }
  return parts.join("") + "\n";
}
