import { exhaustiveFormSchema } from "./src/schemas/exhaustiveSchemas";
import { z } from "zod";
// Simulate what zodConverter.ts does
const toJSONSchema = (z as any).toJSONSchema || (z as any).default?.toJSONSchema || (z as any).z?.toJSONSchema;
if (toJSONSchema) {
  const result = toJSONSchema(exhaustiveFormSchema, {
      target: "openapi-3.0",
      unrepresentable: "any",
  });
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("No toJSONSchema found");
}
