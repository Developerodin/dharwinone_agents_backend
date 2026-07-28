// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  dialCodeForCountry,
  isUnrecognizedCountry,
  normalizeCountryInProfile,
  resolveCountry,
} from "./countryCodes";

describe("resolveCountry", () => {
  it("resolves USA acronyms to United States / US", () => {
    for (const input of ["USA", "US", "U.S.A.", "United States", "America"]) {
      expect(resolveCountry(input)).toEqual({
        country: "United States",
        country_code: "US",
      });
    }
  });

  it("resolves UAE acronyms to United Arab Emirates / AE", () => {
    for (const input of ["UAE", "U.A.E.", "United Arab Emirates", "Emirates"]) {
      expect(resolveCountry(input)).toEqual({
        country: "United Arab Emirates",
        country_code: "AE",
      });
    }
  });

  it("resolves UK aliases to United Kingdom / GB", () => {
    for (const input of ["UK", "U.K.", "United Kingdom", "Great Britain"]) {
      expect(resolveCountry(input)).toEqual({
        country: "United Kingdom",
        country_code: "GB",
      });
    }
  });

  it("resolves India from name or code", () => {
    expect(resolveCountry("India")).toEqual({ country: "India", country_code: "IN" });
    expect(resolveCountry("IN")).toEqual({ country: "India", country_code: "IN" });
  });

  it("returns null for unknown countries", () => {
    expect(resolveCountry("Atlantis")).toBeNull();
    expect(resolveCountry("")).toBeNull();
  });
});

describe("normalizeCountryInProfile", () => {
  it("stores canonical country and country_code when resolved", () => {
    expect(normalizeCountryInProfile({ country: "UAE", city: "Dubai" })).toEqual({
      country: "United Arab Emirates",
      country_code: "AE",
      city: "Dubai",
    });
  });

  it("keeps raw country and drops country_code when unresolved", () => {
    expect(normalizeCountryInProfile({ country: "Atlantis", country_code: "XX" })).toEqual({
      country: "Atlantis",
    });
  });

  it("leaves profile unchanged when country is absent", () => {
    expect(normalizeCountryInProfile({ city: "Jaipur" })).toEqual({ city: "Jaipur" });
  });
});

describe("isUnrecognizedCountry", () => {
  it("flags profiles with country text but no valid code", () => {
    expect(isUnrecognizedCountry({ country: "Atlantis" })).toBe(true);
    expect(isUnrecognizedCountry({ country: "United States", country_code: "US" })).toBe(false);
    expect(isUnrecognizedCountry({ city: "Jaipur" })).toBe(false);
  });
});

describe("dialCodeForCountry", () => {
  it("returns dial prefix for known codes", () => {
    expect(dialCodeForCountry("US")).toBe("1");
    expect(dialCodeForCountry("AE")).toBe("971");
    expect(dialCodeForCountry("IN")).toBe("91");
  });
});
