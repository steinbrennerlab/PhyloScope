const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// A small DOM stand-in for state and session tests. Rendering functions are
// tested separately against their generated markup; this is not a browser.
function element() {
  const selectors = new Map();
  return {
    style: {}, dataset: {}, options: [], value: "", children: [], innerHTML: "", textContent: "",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, setAttribute() {}, append() {}, remove() {},
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    querySelector(selector) {
      if (!selectors.has(selector)) {
        const child = element(); child.parentNode = this; selectors.set(selector, child);
      }
      return selectors.get(selector);
    }, querySelectorAll() { return []; },
    closest() { return element(); },
    getBoundingClientRect() { return { width: 1000, height: 800 }; },
  };
}

async function harness({ stubRenderer = false, expose = {}, withoutDocument = false } = {}) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element, createDocumentFragment: element,
    querySelector: element, querySelectorAll: () => [], addEventListener() {},
  };
  const context = vm.createContext({
    console, ...(!withoutDocument ? { document } : {}), window: { addEventListener() {} },
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    setTimeout() {}, clearTimeout() {},
  });
  const modules = new Map();
  function getModule(file) {
    file = path.resolve(file);
    if (!modules.has(file)) {
      let source = fs.readFileSync(file, "utf8");
      const basename = path.basename(file);
      if (stubRenderer && basename === "renderer.js") {
        const names = [...source.matchAll(/export (?:async )?function (\w+)/g)].map(match => match[1]);
        modules.set(file, new vm.SyntheticModule(names, function () {
          for (const name of names) this.setExport(name, () => {});
        }, { context, identifier: file }));
      } else {
        if (expose[basename]) source += `\nexport { ${expose[basename].join(", ")} };`;
        modules.set(file, new vm.SourceTextModule(source, { context, identifier: file }));
      }
    }
    return modules.get(file);
  }
  return {
    document,
    async load(name) {
      const mod = getModule(path.join(__dirname, "../static/js", `${name}.js`));
      if (mod.status === "unlinked") await mod.link((specifier, parent) => getModule(path.resolve(path.dirname(parent.identifier), specifier)));
      if (mod.status !== "evaluated") await mod.evaluate();
      return mod.namespace;
    },
  };
}

module.exports = { harness, plain: value => JSON.parse(JSON.stringify(value)) };
