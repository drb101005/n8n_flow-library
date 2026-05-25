#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildCatalog } = require("../src/catalog/build-catalog");

function main() {
  const args = new Set(process.argv.slice(2));
  const shouldGeneratePng = args.has("--png");
  const repoRoot = path.resolve(__dirname, "..");
  const docsRoot = path.join(repoRoot, "docs");
  const result = buildCatalog({
    workflowsRoot: path.join(repoRoot, "n8n"),
    diagramsRoot: path.join(docsRoot, "diagrams"),
    previewsRoot: path.join(docsRoot, "previews"),
    dataRoot: path.join(docsRoot, "data"),
    sourcesRoot: path.join(docsRoot, "sources")
  });

  if (shouldGeneratePng) {
    generatePngPreviews(result.catalog.items, repoRoot);
  }

  writeIndexReadme(result.catalog, repoRoot);
  console.log(
    `Catalog built for ${result.catalog.totals.workflows} workflows across ${result.catalog.totals.categories} categories.`
  );
  if (result.catalog.totals.skipped > 0) {
    console.warn(`Skipped ${result.catalog.totals.skipped} invalid JSON files. See docs/data/workflows.json for details.`);
  }
}

function generatePngPreviews(items, repoRoot) {
  const cliPath = path.join(
    repoRoot,
    "node_modules",
    "@mermaid-js",
    "mermaid-cli",
    "src",
    "cli.js"
  );

  if (!fs.existsSync(cliPath)) {
    throw new Error("Mermaid CLI is not installed. Run npm install first.");
  }

  for (const item of items) {
    const inputPath = path.resolve(repoRoot, "docs", item.diagramPath.replace("./", ""));
    const outputPath = path.resolve(repoRoot, "docs", item.previewPath.replace("./", ""));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const result = spawnSync(
      process.execPath,
      [cliPath, "-i", inputPath, "-o", outputPath, "-b", "transparent", "-s", "2"],
      {
        cwd: repoRoot,
        stdio: "inherit"
      }
    );

    if (result.status !== 0) {
      throw new Error(`PNG generation failed for ${item.name}`);
    }
  }
}

function writeIndexReadme(catalog, repoRoot) {
  const outputPath = path.join(repoRoot, "docs", "data", "summary.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: catalog.generatedAt,
        workflows: catalog.totals.workflows,
        categories: catalog.categories,
        skipped: catalog.skipped
      },
      null,
      2
    ),
    "utf8"
  );
}

main();
