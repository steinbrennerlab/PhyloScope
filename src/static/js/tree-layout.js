import { walkTree } from "./tree-traversal.js";

/** Derive layout coordinates without DOM access or recursive calls. */
export function layoutTree(tree, options, metadata, tipCounts) {
  const mode = options.layoutMode;
  const radial = mode === "circular";
  const unrooted = mode === "unrooted";
  const spacing = options.tipSpacing / 16;
  const total = metadata.layoutLeafCounts.get(tree.id) || 0;
  let leafIndex = 0;
  let root = null;
  const stack = [{ node: tree, parent: null, start: 0, wedge: 2 * Math.PI }];
  while (stack.length) {
    const { node, parent, start, wedge } = stack.pop();
    if (!metadata.visibleTipCounts.get(node.id)) continue;
    const result = { ...node };
    if (parent) parent.layoutChildren.push(result);
    else root = result;
    const depth = parent ? (radial ? parent.r : parent.x) : 0;
    if (unrooted) {
      const length = options.usePhylogram ? (node.bl || 0) * 300 * spacing : 20 * spacing;
      result.parentX = parent?.x || 0;
      result.parentY = parent?.y || 0;
      result.angle = start + wedge / 2;
      result.x = result.parentX + length * Math.cos(result.angle);
      result.y = result.parentY + length * Math.sin(result.angle);
    } else if (radial) {
      result.parentR = depth;
      result.r = depth + (options.usePhylogram ? (node.bl || 0) * 300 * spacing : 15 * spacing);
    } else {
      result.parentX = depth;
      result.x = depth + (options.usePhylogram ? (node.bl || 0) * 800 : 20);
    }
    const collapsed = options.collapsedNodes.has(node.id) && node.ch;
    if (collapsed) {
      result.collapsed = true;
      result.tipCount = tipCounts[node.id];
    }
    if (collapsed || !node.ch?.length) {
      if (radial) result.angle = leafIndex++ / total * 2 * Math.PI;
      else if (!unrooted) {
        const height = (options.uniformTriangles ? 30 : Math.min(result.tipCount * 2, 40)) * options.triangleScale / 100;
        const slots = collapsed ? Math.max(1, Math.ceil(height / options.tipSpacing)) : 1;
        result.y = (leafIndex + (collapsed ? slots / 2 : 0)) * options.tipSpacing;
        leafIndex += slots;
      }
      continue;
    }
    result.layoutChildren = [];
    let angle = start;
    const count = node.ch.reduce((sum, child) => sum + (metadata.layoutLeafCounts.get(child.id) || 0), 0);
    const children = [];
    for (const child of node.ch) {
      const childWedge = count ? (metadata.layoutLeafCounts.get(child.id) || 0) / count * wedge : 0;
      children.push({ node: child, parent: result, start: angle, wedge: childWedge });
      angle += childWedge;
    }
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  if (!unrooted) {
    const order = [...walkTree(root, "layoutChildren")];
    const key = radial ? "angle" : "y";
    for (let i = order.length - 1; i >= 0; i--) {
      const node = order[i], children = node.layoutChildren;
      if (children?.length) node[key] = (children[0][key] + children[children.length - 1][key]) / 2;
    }
  }
  return root;
}
