const fs = require("node:fs");
const path = require("node:path");
const { parseWorkflowFile, slugify } = require("../parser/workflow-parser");
const { renderMermaidDiagram } = require("../renderer/mermaid-renderer");

function findWorkflowFiles(rootDir) {
  const results = [];
  walk(rootDir, results);
  return results.filter((filePath) => filePath.toLowerCase().endsWith(".json"));
}

function buildCatalog(options) {
  const workflowsRoot = path.resolve(options.workflowsRoot);
  const diagramsRoot = path.resolve(options.diagramsRoot);
  const previewsRoot = path.resolve(options.previewsRoot);
  const dataRoot = path.resolve(options.dataRoot);
  const sourcesRoot = path.resolve(options.sourcesRoot);

  fs.mkdirSync(diagramsRoot, { recursive: true });
  fs.mkdirSync(previewsRoot, { recursive: true });
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(sourcesRoot, { recursive: true });
  emptyDirectory(diagramsRoot);
  emptyDirectory(previewsRoot);
  emptyDirectory(sourcesRoot);
  emptyDirectory(dataRoot);

  const workflowFiles = findWorkflowFiles(workflowsRoot);
  const items = [];
  const skipped = [];

  for (const workflowFile of workflowFiles) {
    let parsed;
    try {
      parsed = parseWorkflowFile(workflowFile);
    } catch (error) {
      skipped.push({
        file: path.relative(process.cwd(), workflowFile).replace(/\\/g, "/"),
        reason: error.message
      });
      continue;
    }
    const categorySlug = slugify(parsed.category);
    const outputDir = path.join(diagramsRoot, categorySlug);
    const outputFile = path.join(outputDir, `${parsed.slug}.mmd`);
    const previewFile = path.join(previewsRoot, categorySlug, `${parsed.slug}.png`);
    const sourceFile = path.join(sourcesRoot, categorySlug, `${parsed.slug}.json`);
    const relativeJsonPath = path.relative(process.cwd(), workflowFile).replace(/\\/g, "/");
    const tagSet = new Set([
      ...parsed.tags,
      parsed.category,
      ...parsed.nodes.map((node) => node.typeLabel),
      ...parsed.nodes.map((node) => node.category)
    ]);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(path.dirname(previewFile), { recursive: true });
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(outputFile, renderMermaidDiagram(parsed), "utf8");
    fs.copyFileSync(workflowFile, sourceFile);

    items.push({
      name: parsed.workflowName,
      slug: parsed.slug,
      category: parsed.category,
      categorySlug,
      sourcePath: toWebPath(sourceFile),
      repositorySourcePath: relativeJsonPath,
      diagramPath: toWebPath(outputFile),
      previewPath: toWebPath(previewFile),
      nodeCount: parsed.nodes.length,
      edgeCount: parsed.edges.length,
      tags: Array.from(tagSet).filter(Boolean).sort(),
      summary: summarizeWorkflow(parsed)
    });
  }

  items.sort((left, right) => left.name.localeCompare(right.name));
  const categories = Array.from(new Set(items.map((item) => item.category))).sort();
  const catalog = {
    generatedAt: new Date().toISOString(),
    totals: {
      workflows: items.length,
      categories: categories.length,
      skipped: skipped.length
    },
    categories,
    items,
    skipped
  };

  const dataFile = path.join(dataRoot, "workflows.json");
  fs.writeFileSync(dataFile, JSON.stringify(catalog, null, 2), "utf8");

  return {
    catalog,
    workflowFiles
  };
}

function summarizeWorkflow(parsed) {
  const topNodes = parsed.nodes.slice(0, 4).map((node) => node.name);
  return topNodes.join(" -> ");
}

function toWebPath(filePath) {
  const relative = path.relative(path.resolve("docs"), filePath).replace(/\\/g, "/");
  return `./${relative}`;
}

function walk(currentPath, results) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, results);
      continue;
    }
    results.push(absolutePath);
  }
}

function emptyDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return;
  }

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    fs.rmSync(path.join(directoryPath, entry.name), { recursive: true, force: true });
  }
}

module.exports = {
  buildCatalog,
  findWorkflowFiles
};
