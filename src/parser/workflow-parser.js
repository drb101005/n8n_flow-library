const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const UI_ONLY_TYPES = new Set([
  "n8n-nodes-base.stickyNote",
  "n8n-nodes-base.noOp"
]);

const CATEGORY_CLASS_MAP = {
  trigger: "trigger",
  ai: "ai",
  vector: "vector",
  messaging: "messaging",
  logic: "logic",
  http: "http",
  action: "action"
};

function parseWorkflowFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const workflow = JSON.parse(raw);
  return parseWorkflow(workflow, { filePath });
}

function parseWorkflow(workflow, options = {}) {
  const filePath = options.filePath ? path.resolve(options.filePath) : null;
  const workflowName =
    workflow.name ||
    (filePath ? path.basename(filePath, path.extname(filePath)) : "workflow");
  const slug = createOutputSlug(workflowName);
  const tags = normalizeTags(workflow.tags);
  const category = filePath
    ? path.basename(path.dirname(filePath)).replace(/_/g, " ")
    : "Uncategorized";

  const sourceNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const renderableNodes = sourceNodes.filter(isRenderableNode);
  const nodes = buildNodes(renderableNodes);
  const nodeByName = new Map(nodes.map((node) => [node.name, node]));
  const edges = buildEdges(workflow.connections || {}, nodeByName);

  return {
    workflowName,
    slug,
    filePath,
    category,
    tags,
    nodes,
    edges
  };
}

function isRenderableNode(node) {
  if (!node || typeof node !== "object") {
    return false;
  }
  return !UI_ONLY_TYPES.has(node.type);
}

function buildNodes(renderableNodes) {
  const usedIds = new Set();
  return renderableNodes.map((node) => {
    const category = inferCategory(node);
    const mermaidId = uniqueMermaidId(
      sanitizeId(node.id || node.name || node.type),
      usedIds
    );
    const typeLabel = prettifyType(node.type);
    const importantParameters = extractImportantParameters(node);

    return {
      id: mermaidId,
      sourceId: node.id || null,
      name: node.name || typeLabel,
      type: node.type,
      typeLabel,
      category,
      className: CATEGORY_CLASS_MAP[category] || "action",
      rawParameters: node.parameters || {},
      switchRules: extractSwitchRules(node),
      fallbackOutput: extractFallbackOutput(node),
      importantParameters,
      label: formatNodeLabel(node.name || typeLabel, typeLabel, importantParameters)
    };
  });
}

function buildEdges(connections, nodeByName) {
  const edges = [];

  for (const [sourceName, channelMap] of Object.entries(connections)) {
    const sourceNode = nodeByName.get(sourceName);
    if (!sourceNode || !channelMap || typeof channelMap !== "object") {
      continue;
    }

    for (const [channelType, branchGroups] of Object.entries(channelMap)) {
      if (!Array.isArray(branchGroups)) {
        continue;
      }

      branchGroups.forEach((targets, branchIndex) => {
        if (!Array.isArray(targets)) {
          return;
        }

        targets.forEach((target) => {
          const targetNode = nodeByName.get(target.node);
          if (!targetNode) {
            return;
          }

          edges.push({
            from: sourceNode.id,
            to: targetNode.id,
            channelType,
            branchIndex,
            label: inferBranchLabel(sourceNode, channelType, branchIndex)
          });
        });
      });
    }
  }

  return edges;
}

function inferBranchLabel(sourceNode, channelType, branchIndex) {
  const readableChannelMap = {
    ai_tool: "Tool",
    ai_languageModel: "Model",
    ai_memory: "Memory",
    ai_embedding: "Embedding",
    ai_vectorStore: "Vector Store",
    ai_outputParser: "Parser",
    ai_document: "Document",
    ai_retriever: "Retriever"
  };

  if (readableChannelMap[channelType]) {
    return readableChannelMap[channelType];
  }

  if (sourceNode.type === "n8n-nodes-base.if") {
    return branchIndex === 0 ? "True" : "False";
  }

  if (sourceNode.type === "n8n-nodes-base.switch") {
    const rules = sourceNode.switchRules || [];
    if (branchIndex < rules.length) {
      return rules[branchIndex];
    }
    if (sourceNode.fallbackOutput === branchIndex) {
      return "Fallback";
    }
    return `Output ${branchIndex + 1}`;
  }

  if (channelType !== "main") {
    return prettifyType(channelType);
  }

  return "";
}

function inferCategory(node) {
  const type = String(node.type || "").toLowerCase();
  const name = String(node.name || "").toLowerCase();

  if (type.includes("trigger") || name.startsWith("when ")) {
    return "trigger";
  }
  if (
    type.includes("langchain") ||
    type.includes("openai") ||
    type.includes("anthropic") ||
    type.includes("gemini") ||
    type.includes("ollama") ||
    type.includes("mistral") ||
    type.includes(".agent") ||
    type.includes(".lm")
  ) {
    return "ai";
  }
  if (
    type.includes("vector") ||
    type.includes("pinecone") ||
    type.includes("qdrant") ||
    type.includes("weaviate") ||
    type.includes("supabasevector") ||
    type.includes("milvus")
  ) {
    return "vector";
  }
  if (
    type.includes("telegram") ||
    type.includes("slack") ||
    type.includes("discord") ||
    type.includes("whatsapp") ||
    type.includes("gmail") ||
    type.includes("email") ||
    type.includes("twilio") ||
    type.includes("line")
  ) {
    return "messaging";
  }
  if (
    type.includes(".if") ||
    type.includes(".switch") ||
    type.includes("merge") ||
    type.includes("router")
  ) {
    return "logic";
  }
  if (type.includes("httprequest") || type.endsWith(".httprequest")) {
    return "http";
  }
  return "action";
}

function extractImportantParameters(node) {
  const parameters = node.parameters || {};
  const type = String(node.type || "");
  const values = [];

  addParam(values, "Model", firstDefined(parameters.model, parameters.modelName));
  addParam(values, "Operation", parameters.operation);
  addParam(values, "Method", parameters.method);
  addParam(values, "URL", summarizeText(parameters.url, 48));
  addParam(values, "Resource", parameters.resource);
  addParam(values, "Table", firstDefined(parameters.table, parameters.tableName));
  addParam(
    values,
    "Collection",
    firstDefined(parameters.collection, parameters.collectionName)
  );
  addParam(values, "Index", parameters.index);
  addParam(values, "Prompt", summarizeText(parameters.text, 48));

  if (Array.isArray(parameters.updates) && parameters.updates.length > 0) {
    addParam(values, "Updates", parameters.updates.join(", "));
  }

  if (type === "n8n-nodes-base.switch" && Array.isArray(parameters.rules?.rules)) {
    values.push({
      key: "Rules",
      value: `${parameters.rules.rules.length} branch${parameters.rules.rules.length === 1 ? "" : "es"}`
    });
  }

  if (type === "n8n-nodes-base.if") {
    addParam(values, "Condition", parameters.combineOperation || parameters.options?.combineOperation);
  }

  if (type.includes("httpRequest")) {
    addParam(values, "Authentication", parameters.authentication);
  }

  if (type.includes("vector")) {
    addParam(values, "Mode", parameters.mode);
  }

  if (values.length === 0) {
    const genericKeys = [
      "mode",
      "language",
      "sheetName",
      "documentId",
      "channel",
      "queue",
      "toolDescription"
    ];

    for (const key of genericKeys) {
      if (values.length >= 3) {
        break;
      }
      addParam(values, prettifyKey(key), parameters[key]);
    }
  }

  return values.slice(0, 3);
}

function formatNodeLabel(name, typeLabel, parameters) {
  const lines = [name, `Type: ${typeLabel}`];
  for (const parameter of parameters) {
    lines.push(`${parameter.key}: ${parameter.value}`);
  }
  return lines.join("\n");
}

function addParam(target, key, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "object") {
    return;
  }
  target.push({
    key,
    value: String(value)
  });
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => {
      if (typeof tag === "string") {
        return tag.trim();
      }
      if (tag && typeof tag.name === "string") {
        return tag.name.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function uniqueMermaidId(baseId, usedIds) {
  let candidate = baseId || "node";
  let counter = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}_${counter}`;
    counter += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function sanitizeId(value) {
  const cleaned = String(value || "node")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `n_${cleaned}`;
}

function prettifyType(type) {
  const raw = String(type || "Node");
  const segment = raw.includes(".") ? raw.split(".").pop() : raw;
  return segment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettifyKey(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeText(value, maxLength) {
  if (!value || typeof value !== "string") {
    return value;
  }
  const flattened = value.replace(/\s+/g, " ").trim();
  if (flattened.length <= maxLength) {
    return flattened;
  }
  return `${flattened.slice(0, maxLength - 3)}...`;
}

function slugify(value) {
  return String(value || "workflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function createOutputSlug(value, maxLength = 72) {
  const baseSlug = slugify(value);
  if (baseSlug.length <= maxLength) {
    return baseSlug;
  }

  const hash = crypto.createHash("sha1").update(baseSlug).digest("hex").slice(0, 8);
  const trimmed = baseSlug.slice(0, maxLength - hash.length - 1).replace(/-+$/g, "");
  return `${trimmed}-${hash}`;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function extractSwitchRules(node) {
  if (node.type !== "n8n-nodes-base.switch") {
    return [];
  }

  const rules = Array.isArray(node.parameters?.rules?.rules)
    ? node.parameters.rules.rules
    : [];

  return rules.map((rule, index) => {
    const operation = rule.operation ? prettifyType(rule.operation) : `Rule ${index + 1}`;
    const comparedValue = firstDefined(rule.value2, rule.singleValue, rule.leftValue, rule.rightValue);
    return comparedValue ? `${operation}: ${comparedValue}` : operation;
  });
}

function extractFallbackOutput(node) {
  if (node.type !== "n8n-nodes-base.switch") {
    return null;
  }
  return Number.isInteger(node.parameters?.fallbackOutput)
    ? node.parameters.fallbackOutput
    : null;
}

module.exports = {
  createOutputSlug,
  parseWorkflow,
  parseWorkflowFile,
  slugify,
  prettifyType
};
