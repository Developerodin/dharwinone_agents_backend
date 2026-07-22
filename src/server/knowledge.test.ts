// @vitest-environment node
// Port-fidelity tests for knowledge (port of backend/studio/knowledge.py).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as knowledge from "./knowledge";

let repoRoot: string;

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-knowledge-"));
});

afterEach(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe("read", () => {
  it("returns {} when knowledge.yaml doesn't exist", () => {
    expect(knowledge.read({ repo_root: repoRoot })).toEqual({});
  });
});

describe("write / read round-trip", () => {
  it("round-trips stack, rules, design_tokens, deploy_branch", () => {
    const data = {
      stack: ["react", "tailwind"],
      rules: ["keep it simple", "no inline styles"],
      design_tokens: { primary: "#0055ff", radius: "8px" },
      deploy_branch: "main",
    };
    const written = knowledge.write({ repo_root: repoRoot }, data);
    expect(written).toEqual(data);
    expect(knowledge.read({ repo_root: repoRoot })).toEqual(data);
  });

  it("round-trips empty list/object values", () => {
    const data = { stack: [], design_tokens: {} };
    knowledge.write({ repo_root: repoRoot }, data);
    expect(knowledge.read({ repo_root: repoRoot })).toEqual(data);
  });

  it("uses a custom knowledge_path when the project sets one", () => {
    knowledge.write({ repo_root: repoRoot, knowledge_path: "custom.yaml" }, { deploy_branch: "dev" });
    expect(fs.existsSync(path.join(repoRoot, "custom.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "knowledge.yaml"))).toBe(false);
    expect(knowledge.read({ repo_root: repoRoot, knowledge_path: "custom.yaml" })).toEqual({
      deploy_branch: "dev",
    });
  });
});

describe("validation", () => {
  it("rejects unknown keys", () => {
    expect(() => knowledge.write({ repo_root: repoRoot }, { bogus: true })).toThrow(
      knowledge.KnowledgeError,
    );
  });

  it("rejects a non-list stack / rules", () => {
    expect(() => knowledge.write({ repo_root: repoRoot }, { stack: "react" })).toThrow(
      knowledge.KnowledgeError,
    );
    expect(() => knowledge.write({ repo_root: repoRoot }, { rules: "be nice" })).toThrow(
      knowledge.KnowledgeError,
    );
  });

  it("rejects non-string design_tokens values", () => {
    expect(() =>
      knowledge.write({ repo_root: repoRoot }, { design_tokens: { primary: 5 } }),
    ).toThrow(knowledge.KnowledgeError);
  });

  it("rejects a non-string deploy_branch", () => {
    expect(() => knowledge.write({ repo_root: repoRoot }, { deploy_branch: 1 })).toThrow(
      knowledge.KnowledgeError,
    );
  });

  it("surfaces KnowledgeError from read() when the on-disk file has an unknown key", () => {
    fs.writeFileSync(path.join(repoRoot, "knowledge.yaml"), "bogus: yes\n", "utf-8");
    expect(() => knowledge.read({ repo_root: repoRoot })).toThrow(knowledge.KnowledgeError);
  });
});

describe("buildPromptContext", () => {
  it("returns '' when there's no knowledge file", () => {
    expect(knowledge.buildPromptContext({ repo_root: repoRoot })).toBe("");
  });

  it("returns '' (not throwing) when the on-disk file is invalid", () => {
    fs.writeFileSync(path.join(repoRoot, "knowledge.yaml"), "bogus: yes\n", "utf-8");
    expect(knowledge.buildPromptContext({ repo_root: repoRoot })).toBe("");
  });

  it("renders stack/rules/design_tokens/deploy_branch in order", () => {
    knowledge.write(
      { repo_root: repoRoot },
      {
        stack: ["react"],
        rules: ["keep it simple"],
        design_tokens: { primary: "blue" },
        deploy_branch: "main",
      },
    );
    const ctx = knowledge.buildPromptContext({ repo_root: repoRoot });
    expect(ctx).toBe(
      [
        "PROJECT KNOWLEDGE:",
        "Stack: react",
        "Rules:",
        "  - keep it simple",
        "Design tokens:",
        "  primary: blue",
        "Deploy branch: main",
      ].join("\n"),
    );
  });
});
