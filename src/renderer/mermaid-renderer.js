function renderMermaidDiagram(parsedWorkflow) {
  const lines = ["graph TD"];

  for (const node of parsedWorkflow.nodes) {
    lines.push(`  ${node.id}["${escapeMermaidLabel(node.label)}"]`);
  }

  if (parsedWorkflow.nodes.length > 0) {
    lines.push("");
  }

  for (const edge of parsedWorkflow.edges) {
    const label = edge.label ? `|${escapeMermaidLabel(edge.label)}| ` : "";
    lines.push(`  ${edge.from} -->${label}${edge.to}`);
  }

  lines.push("");
  lines.push("  classDef trigger fill:#dff7e3,stroke:#2f855a,color:#163826,stroke-width:1px;");
  lines.push("  classDef ai fill:#e6f0ff,stroke:#285ea8,color:#10294f,stroke-width:1px;");
  lines.push("  classDef vector fill:#efe7ff,stroke:#6b46c1,color:#322659,stroke-width:1px;");
  lines.push("  classDef messaging fill:#fff1db,stroke:#c05621,color:#5a2d12,stroke-width:1px;");
  lines.push("  classDef logic fill:#ffe2e2,stroke:#c53030,color:#5a1f1f,stroke-width:1px;");
  lines.push("  classDef http fill:#e6fffb,stroke:#0f766e,color:#134e4a,stroke-width:1px;");
  lines.push("  classDef action fill:#f4f4f5,stroke:#52525b,color:#27272a,stroke-width:1px;");
  lines.push("");

  for (const node of parsedWorkflow.nodes) {
    lines.push(`  class ${node.id} ${node.className};`);
  }

  return `${lines.join("\n")}\n`;
}

function escapeMermaidLabel(value) {
  return String(value || "")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "")
    .replace(/\n/g, "<br/>");
}

module.exports = {
  renderMermaidDiagram
};

