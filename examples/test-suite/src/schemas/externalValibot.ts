import * as v from "valibot";

export const externalValibotSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.minValue(18), v.maxValue(99)),
  country: v.pipe(v.string(), v.minLength(2), v.maxLength(2)),
  testCacheProp: v.optional(v.string()),
});
