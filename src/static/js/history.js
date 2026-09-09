export function captureState(state) {
  return {
    // Tree operations replace topology objects, so view-state snapshots can
    // share them instead of cloning every node on each control interaction.
    treeData: state.treeData,
    treeRerooted: state.treeRerooted,
    collapsedNodes: new Set(state.collapsedNodes),
    exportNodeId: state.exportNodeId,
    selectedTip: state.selectedTip,
    speciesColors: { ...state.speciesColors },
    fullTreeData: state.fullTreeData,
    scale: state.scale,
    tx: state.tx,
    ty: state.ty,
    hiddenTips: new Set(state.hiddenTips),
    nodeLabels: { ...state.nodeLabels },
    nodeLabelIcons: { ...state.nodeLabelIcons },
    nodeLabelColors: { ...state.nodeLabelColors },
    cladeColors: { ...state.cladeColors },
    tipMarkers: JSON.parse(JSON.stringify(state.tipMarkers)),
    labelFontSize: state.labelFontSize,
    layoutMode: state.layoutMode,
    usePhylogram: state.usePhylogram,
    showTipLabels: state.showTipLabels,
    tipLabelSize: state.tipLabelSize,
    dotSize: state.dotSize,
    showBootstraps: state.showBootstraps,
    showLengths: state.showLengths,
    tipSpacing: state.tipSpacing,
    triangleScale: state.triangleScale,
    uniformTriangles: state.uniformTriangles,
    fastMode: state.fastMode,
  };
}

export function restoreHistoryState(state, snapshot) {
  state.treeData = snapshot.treeData;
  state.treeRerooted = snapshot.treeRerooted ?? false;
  state.collapsedNodes = snapshot.collapsedNodes;
  state.exportNodeId = snapshot.exportNodeId;
  state.selectedTip = snapshot.selectedTip;
  state.selectedNameTips = new Set();
  state.speciesColors = snapshot.speciesColors || state.speciesColors;
  state.fullTreeData = snapshot.fullTreeData;
  state.scale = snapshot.scale;
  state.tx = snapshot.tx;
  state.ty = snapshot.ty;
  state.hiddenTips = snapshot.hiddenTips;
  state.nodeLabels = snapshot.nodeLabels;
  state.nodeLabelIcons = snapshot.nodeLabelIcons || {};
  state.nodeLabelColors = snapshot.nodeLabelColors || {};
  state.cladeColors = snapshot.cladeColors || {};
  state.tipMarkers = snapshot.tipMarkers || {};
  // Restore display settings (use fallback defaults for older snapshots)
  state.labelFontSize = snapshot.labelFontSize ?? state.labelFontSize;
  state.layoutMode = snapshot.layoutMode ?? state.layoutMode;
  state.usePhylogram = snapshot.usePhylogram ?? state.usePhylogram;
  state.showTipLabels = snapshot.showTipLabels ?? state.showTipLabels;
  state.tipLabelSize = snapshot.tipLabelSize ?? state.tipLabelSize;
  state.dotSize = snapshot.dotSize ?? state.dotSize;
  state.showBootstraps = snapshot.showBootstraps ?? state.showBootstraps;
  state.showLengths = snapshot.showLengths ?? state.showLengths;
  state.tipSpacing = snapshot.tipSpacing ?? state.tipSpacing;
  state.triangleScale = snapshot.triangleScale ?? state.triangleScale;
  state.uniformTriangles = snapshot.uniformTriangles ?? state.uniformTriangles;
  state.fastMode = snapshot.fastMode ?? state.fastMode;
}
