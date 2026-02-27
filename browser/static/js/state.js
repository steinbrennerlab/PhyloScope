export const state = {
  treeData: null,
  speciesMap: {},
  tipToSpecies: {},
  speciesColors: {},
  nameMatches: new Set(),
  motifMatches: new Set(),
  sharedNodes: new Set(),
  collapsedNodes: new Set(),
  nodeById: {},
  tipLengths: {},
  selectedNodeTips: [],
  motifList: [],
  showLengths: false,
  usePhylogram: true,
  tipSpacing: 16,
  layoutMode: "rectangular",
  showTipLabels: true,
  showBootstraps: false,
  uniformTriangles: false,
  triangleScale: 100,
  exportNodeId: null,
  allTipNames: [],
  fullTreeData: null,
  hasFasta: false,
  fastMode: false,
  selectedTip: null,
  renderCache: null,
  renderCacheKey: null,
  hiddenTips: new Set(),
  nodeLabels: {},
  parentMap: {},
  undoStack: [],
  redoStack: [],
  inputDir: "",
  scale: 1,
  tx: 20,
  ty: 20,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  browserCurrentDir: null,
  browserParentDir: null,
};

export const dom = {
  svg: document.getElementById("tree-svg"),
  group: document.getElementById("tree-group"),
  tooltip: document.getElementById("tooltip"),
  setupOverlay: document.getElementById("setup-overlay"),
  setupPathInput: document.getElementById("setup-path"),
  setupLoadBtn: document.getElementById("setup-load"),
  setupError: document.getElementById("setup-error"),
  browserPanel: document.getElementById("setup-browser"),
  browserDirList: document.getElementById("browser-dir-list"),
  browserCurrentPath: document.getElementById("browser-current-path"),
  browserUpBtn: document.getElementById("browser-up"),
  browserSelectBtn: document.getElementById("browser-select"),
  browserValidIndicator: document.getElementById("browser-valid-indicator"),
  detectedFilesPanel: document.getElementById("detected-files"),
  detectedNwkInput: document.getElementById("detected-nwk"),
  detectedAaInput: document.getElementById("detected-aa"),
  detectedOrthoSpan: document.getElementById("detected-ortho"),
};

export const PALETTE = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
  "#dcbeff", "#9A6324", "#fffac8", "#800000", "#aaffc3",
  "#808000", "#ffd8b1", "#000075", "#a9a9a9", "#e6beff",
  "#1abc9c", "#d35400", "#2c3e50", "#8e44ad", "#16a085",
  "#c0392b", "#2980b9", "#f39c12", "#27ae60", "#e74c3c",
  "#9b59b6", "#1abc9c", "#34495e", "#e67e22", "#3498db",
  "#2ecc71", "#e91e63", "#00bcd4", "#ff9800", "#795548",
];

export const MOTIF_PALETTE = [
  "#e22222", "#2563eb", "#16a085", "#e67e22", "#8e44ad",
  "#c0392b", "#27ae60", "#d35400", "#2980b9", "#f39c12",
];

export const INLINE_STYLES = {
  ".tip-label": "font-size:10px;font-family:system-ui,sans-serif",
  ".motif-match": "stroke:#e22;stroke-width:2",
  ".shared-node": "fill:#ff6600;stroke:#c40;stroke-width:1.5",
  ".collapsed-triangle": "fill:#cde;stroke:#89a",
  ".bootstrap-label": "font-size:8px;fill:#666",
  ".node-label": "font-size:10px;font-weight:bold;fill:#333;font-family:system-ui,sans-serif",
};

export function resetClientState() {
  state.treeData = null;
  state.speciesMap = {};
  state.tipToSpecies = {};
  state.speciesColors = {};
  state.nameMatches = new Set();
  state.motifMatches = new Set();
  state.sharedNodes = new Set();
  state.collapsedNodes = new Set();
  state.nodeById = {};
  state.tipLengths = {};
  state.selectedNodeTips = [];
  state.motifList = [];
  state.showLengths = false;
  state.usePhylogram = true;
  state.tipSpacing = 16;
  state.layoutMode = "rectangular";
  state.showTipLabels = true;
  state.showBootstraps = false;
  state.uniformTriangles = false;
  state.triangleScale = 100;
  state.exportNodeId = null;
  state.allTipNames = [];
  state.fullTreeData = null;
  state.hasFasta = false;
  state.fastMode = false;
  state.selectedTip = null;
  state.renderCache = null;
  state.renderCacheKey = null;
  state.hiddenTips = new Set();
  state.nodeLabels = {};
  state.parentMap = {};
  state.undoStack = [];
  state.redoStack = [];
  state.inputDir = "";
  state.scale = 1;
  state.tx = 20;
  state.ty = 20;
  state.dragging = false;
  state.dragStartX = 0;
  state.dragStartY = 0;
}
