// src/schema-resolver/detectLibrary.ts
// Identifies which validation library a type belongs to via type fingerprinting.
// Name-agnostic: works regardless of how the user named their middleware or variable.

import type { Type } from "ts-morph";
import type { ValidatorLibrary } from "../types/index";

/**
 * Detects the validation library from the static TypeScript type of a schema node.
 * Inspects type properties and text patterns — completely name-agnostic.
 */
export function detectLibrary(type: Type): ValidatorLibrary {
  const typeText = type.getText();

  // ── Zod detection ────────────────────────────────────────────────────────────
  // Zod schemas always have safeParse, parse, _def on their type
  if (
    type.getProperty("safeParse") ||
    type.getProperty("_def") ||
    /\bZod(Type|Object|String|Number|Boolean|Array|Enum|Union|Discriminated|Effects|Schema|Base)\b/.test(typeText)
  ) {
    return "zod";
  }

  // ── Valibot detection ─────────────────────────────────────────────────────────
  // Valibot schemas have _run, ~run, _types, ~types properties
  if (
    type.getProperty("_run") ||
    type.getProperty("~run") ||
    type.getProperty("_types") ||
    type.getProperty("~types") ||
    /\b(BaseSchema|GenericSchema|ObjectSchema|ArraySchema|StringSchema|NumberSchema)\b/.test(typeText)
  ) {
    return "valibot";
  }

  // ── TypeBox detection ─────────────────────────────────────────────────────────
  // TypeBox schemas have [Kind] symbol and static type property
  const hasStatic = type.getProperty("static") || type.getProperties().some(p => p.getName() === "static");
  if (
    hasStatic &&
    (typeText.includes("TSchema") || typeText.includes("TObject") || typeText.includes("TString"))
  ) {
    return "typebox";
  }

  // ── Yup detection ─────────────────────────────────────────────────────────────
  // Yup schemas have validate + validateSync methods
  if (type.getProperty("validate") && type.getProperty("validateSync")) {
    return "yup";
  }

  // ── Arktype detection ─────────────────────────────────────────────────────────
  // Arktype schemas have toJsonSchema, infer, and ~standard properties
  if (
    type.getProperty("toJsonSchema") &&
    type.getProperty("infer") &&
    type.getProperty("~standard")
  ) {
    return "arktype";
  }

  return "unsupported";
}
