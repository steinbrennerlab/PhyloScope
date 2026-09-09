/** Stack-safe preorder traversal, preserving input child order. */
export function* walkTree(root, childKey = "ch") {
  const stack = root ? [root] : [];
  while (stack.length) {
    const node = stack.pop();
    yield node;
    const children = node[childKey] || [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}

export function collectAllTipNames(root) {
  const names = [];
  for (const node of walkTree(root)) if (!node.ch?.length) names.push(node.name);
  return names;
}

export function deepCopyNode(root) {
  const copy = { ...root };
  const stack = [[root, copy]];
  while (stack.length) {
    const [source, dest] = stack.pop();
    if (source.ch) {
      dest.ch = source.ch.map(child => ({ ...child }));
      source.ch.forEach((child, i) => stack.push([child, dest.ch[i]]));
    }
  }
  return copy;
}
