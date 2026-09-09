/**
 * Client-side parsers for PhyloScope standalone mode.
 * Ports of the Python parsers from app.py.
 */

/**
 * Parse a Newick string into the compact tree format { id, bl, name?, sup?, ch? }.
 * Preserve underscores literally so labels continue to match FASTA identifiers.
 */
export function parseNewick(s) {
  if (typeof s !== "string") throw new Error("Newick input must be text");
  let pos = 0;
  let nextId = 0;
  const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const fail = message => { throw new Error(`Invalid Newick at character ${pos + 1}: ${message}`); };

  function skipIgnored() {
    while (pos < s.length) {
      if (/\s/.test(s[pos])) { pos++; continue; }
      if (s[pos] !== "[") break;
      let depth = 1;
      pos++;
      while (pos < s.length && depth > 0) {
        if (s[pos] === "[") depth++;
        if (s[pos] === "]") depth--;
        pos++;
      }
      if (depth) fail("unclosed comment");
    }
  }

  function readNode(children) {
    skipIgnored();
    let label = "";
    const quoted = s[pos] === "'";
    if (quoted) {
      pos++;
      let closed = false;
      while (pos < s.length) {
        const char = s[pos++];
        if (char !== "'") { label += char; continue; }
        if (s[pos] === "'") { label += "'"; pos++; continue; }
        closed = true;
        break;
      }
      if (!closed) fail("unclosed quoted label");
    } else {
      while (pos < s.length && !/[\s()[\],:;']/.test(s[pos])) label += s[pos++];
    }
    skipIgnored();
    let bl = 0;
    let blText;
    if (s[pos] === ":") {
      pos++;
      skipIgnored();
      let token = "";
      while (pos < s.length && !/[\s()[\],:;']/.test(s[pos])) token += s[pos++];
      if (!numberPattern.test(token) || !Number.isFinite(Number(token))) fail("invalid branch length");
      bl = Number(token);
      blText = token;
      skipIgnored();
    }
    const node = { id: nextId++, bl };
    if (blText != null) node.blText = blText;
    if (children) node.ch = children;
    if (children && !quoted && numberPattern.test(label) && Number.isFinite(Number(label))) node.sup = Number(label);
    else if (label) node.name = label;
    return node;
  }

  const frames = [];
  let root;
  // Explicit frames also avoid consuming the JS call stack for deep trees.
  parse: while (true) {
    skipIgnored();
    if (pos >= s.length || s[pos] === ";") fail("expected a tree or subtree");
    if (s[pos] === "(") {
      frames.push([]);
      pos++;
      continue;
    }
    let node = readNode(null);
    while (true) {
      if (frames.length === 0) { root = node; break parse; }
      frames[frames.length - 1].push(node);
      skipIgnored();
      if (s[pos] === ",") { pos++; break; }
      if (s[pos] !== ")") fail("expected ',' or ')'");
      pos++;
      node = readNode(frames.pop());
    }
  }
  skipIgnored();
  if (s[pos] !== ";") fail("expected terminating ';'");
  pos++;
  skipIgnored();
  if (pos !== s.length) fail("unexpected content after the tree");
  return root;
}

/**
 * Parse FASTA text content into an object of { header: sequence }.
 */
export function parseFastaText(text) {
  const seqs = Object.create(null);
  let current = null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(">")) {
      current = line.substring(1).trim().split(/\s+/)[0];
      if (!current) throw new Error("FASTA contains an empty identifier");
      if (Object.hasOwn(seqs, current)) throw new Error(`Duplicate FASTA identifier: ${current}`);
      seqs[current] = [];
    } else if (current !== null) {
      seqs[current].push(line.trim());
    } else if (line.trim()) {
      throw new Error("FASTA sequence data appears before its identifier");
    }
  }
  const result = Object.create(null);
  for (const [k, v] of Object.entries(seqs)) {
    result[k] = v.join("");
    if (!result[k]) throw new Error(`Empty FASTA sequence: ${k}`);
  }
  if (!Object.keys(result).length) throw new Error("FASTA contains no sequences");
  return result;
}

/**
 * Convert a PROSITE-style pattern to a JavaScript regex string.
 */
export function prositeToRegex(pattern) {
  let text = pattern.trim().replace(/\.$/, "");
  const start = text.startsWith("<");
  // Anchors may be attached directly to the first/last element.
  if (start) text = text.slice(1).replace(/^-/, "");
  const terminal = text.endsWith(">");
  if (terminal) text = text.slice(0, -1).replace(/-$/, "");
  const parts = text.split("-");
  const result = parts.map((part, index) => {
    const match = part.match(/^([A-Za-z]|\[[A-Za-z]+>?\]|\{[A-Za-z]+\})(?:\((\d+)(?:,(\d+))?\))?$/);
    if (!match) throw new Error(`Invalid PROSITE element: ${part || "(empty)"}`);
    const token = match[1].toUpperCase();
    let atom = token === "X" ? "." : token.startsWith("{") ? `[^${token.slice(1, -1)}]` : token;
    if (token.includes(">")) {
      if (index !== parts.length - 1 || match[2]) throw new Error("Terminal alternative must be the final, unrepeated element");
      atom = `(?:[${token.slice(1, -2)}]|$)`;
    }
    if (match[2] != null) {
      const min = Number(match[2]), max = Number(match[3] ?? match[2]);
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min || max > 1000000) throw new Error("Invalid PROSITE repetition range");
      atom += match[3] == null ? `{${min}}` : `{${min},${max}}`;
    }
    return atom;
  });
  return (start ? "^" : "") + result.join("") + (terminal ? "$" : "");
}

/**
 * Parse a dataset cell into a number or null.
 */
export function parseNumericValue(value) {
  if (value == null) return null;
  const text = value.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower === "na" || lower === "nan" || lower === "#num!" || lower === "null") return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse a tab-delimited dataset text, keeping only rows matching tree tips.
 * @param {string} text - Raw text content of the dataset file.
 * @param {string} name - Filename for the returned object.
 * @param {Set<string>} treeTips - Set of tip names present in the tree.
 * @returns {{ data: object|null, error: string|null }}
 */
export function parseDatasetText(text, name, treeTips) {
  const lines = text.split(/\r?\n/);
  const rows = lines.map(line => line.split("\t"));

  if (rows.length === 0 || (rows.length === 1 && rows[0].join("").trim() === "")) {
    return { data: null, error: "Dataset file is empty" };
  }

  const header = rows[0];
  if (header.length < 2) {
    return { data: null, error: "Dataset file must have a taxa column and at least one value column" };
  }

  const columns = header.slice(1);
  if (columns.some(column => !column.trim()) || new Set(columns).size !== columns.length) {
    return { data: null, error: "Dataset value columns must have unique, nonempty names" };
  }
  const tipValues = Object.create(null);
  let matchedRowCount = 0;
  let unmatchedRowCount = 0;
  const matchedTipNames = [];
  let missingValueCount = 0;
  let minValue = null, maxValue = null;
  let invalidValueCount = 0;
  const invalidCells = [];
  const seen = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const tipName = (row[0] || "").trim();
    if (!tipName) continue;
    if (row.length > header.length) return { data: null, error: `Dataset row ${i + 1} has more values than the header` };
    if (seen.has(tipName)) return { data: null, error: `Duplicate dataset identifier: ${tipName}` };
    seen.add(tipName);
    const values = row.slice(1);
    if (!treeTips.has(tipName)) {
      unmatchedRowCount++;
      continue;
    }
    matchedRowCount++;
    matchedTipNames.push(tipName);
    const rowValues = Object.create(null);
    for (let idx = 0; idx < columns.length; idx++) {
      const rawValue = idx < values.length ? values[idx] : "";
      const numericValue = parseNumericValue(rawValue);
      if (numericValue === null) {
        missingValueCount++;
        if (rawValue.trim() && !/^(na|nan|#num!|null)$/i.test(rawValue.trim())) {
          invalidValueCount++;
          if (invalidCells.length < 10) invalidCells.push({ row: i + 1, column: columns[idx], value: rawValue });
        }
      } else {
        minValue = minValue == null ? numericValue : Math.min(minValue, numericValue);
        maxValue = maxValue == null ? numericValue : Math.max(maxValue, numericValue);
      }
      rowValues[columns[idx]] = { raw: rawValue, value: numericValue };
    }
    tipValues[tipName] = rowValues;
  }


  return {
    data: {
      name,
      columns,
      tip_values: tipValues,
      matched_tips: matchedTipNames.sort(),
      matched_row_count: matchedRowCount,
      unmatched_row_count: unmatchedRowCount,
      missing_value_count: missingValueCount,
      invalid_value_count: invalidValueCount,
      invalid_cells: invalidCells,
      min_value: minValue,
      max_value: maxValue,
    },
    error: null,
  };
}
