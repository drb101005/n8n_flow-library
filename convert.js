#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { parseWorkflowFile } = require("./src/parser/workflow-parser");
const { renderMermaidDiagram } = require("./src/renderer/mermaid-renderer");

function printUsage() {
  console.log("Usage: node convert.js <workflow.json> [output.mmd]");
}

function main() {
  const [, , inputPath, outputPathArg] = process.argv;

  if (!inputPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const absoluteInputPath = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(absoluteInputPath)) {
    console.error(`Input file not found: ${absoluteInputPath}`);
    process.exitCode = 1;
    return;
  }

  const parsed = parseWorkflowFile(absoluteInputPath);
  const mermaid = renderMermaidDiagram(parsed);
  const defaultOutputPath = path.join(
    path.dirname(absoluteInputPath),
    `${parsed.slug}.mmd`
  );
  const absoluteOutputPath = outputPathArg
    ? path.resolve(process.cwd(), outputPathArg)
    : defaultOutputPath;

  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, mermaid, "utf8");

  console.log(`Created Mermaid diagram: ${absoluteOutputPath}`);
}

main();

