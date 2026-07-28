// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnumAnswer, parseServicesAnswer } from "./siteChatMachine";

const MULTI_DEPT_SUGGESTED = [
  "Emergency & Trauma",
  "ICU & Critical Care",
  "General Surgery",
  "Diagnostics & Imaging",
  "Maternity & NICU",
  "Pediatrics",
  "Cardiology",
  "Orthopedics",
];

describe("parseServicesAnswer", () => {
  it("returns suggested list when user confirms with yes", () => {
    expect(parseServicesAnswer("yes", MULTI_DEPT_SUGGESTED)).toEqual(MULTI_DEPT_SUGGESTED);
    expect(parseServicesAnswer("Looks good!", MULTI_DEPT_SUGGESTED)).toEqual(MULTI_DEPT_SUGGESTED);
  });

  it("merges extras when user says add", () => {
    expect(parseServicesAnswer("add Oncology, Nephrology", MULTI_DEPT_SUGGESTED)).toEqual([
      ...MULTI_DEPT_SUGGESTED,
      "Oncology",
      "Nephrology",
    ]);
  });

  it("returns a custom comma-separated list", () => {
    expect(parseServicesAnswer("Root Canal, Teeth Cleaning", [])).toEqual([
      "Root Canal",
      "Teeth Cleaning",
    ]);
  });

  it("dedupes case-insensitively", () => {
    expect(parseServicesAnswer("add cardiology", MULTI_DEPT_SUGGESTED)).toEqual(MULTI_DEPT_SUGGESTED);
  });
});

describe("parseEnumAnswer", () => {
  const options = ["dental_clinic", "general_multi_department", "diagnostic_lab"];
  const optionLabels = {
    dental_clinic: "Dental clinic",
    general_multi_department: "General multi-department hospital",
    diagnostic_lab: "Diagnostic center",
  };

  it("matches canonical enum values", () => {
    expect(parseEnumAnswer("dental_clinic", options, optionLabels)).toBe("dental_clinic");
  });

  it("matches human-readable labels", () => {
    expect(parseEnumAnswer("Dental clinic", options, optionLabels)).toBe("dental_clinic");
    expect(parseEnumAnswer("General multi-department hospital", options, optionLabels)).toBe(
      "general_multi_department",
    );
  });
});
