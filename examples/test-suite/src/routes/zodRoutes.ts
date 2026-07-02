import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// Native Enum for testing
enum Direction {
  Up = "UP",
  Down = "DOWN",
  Left = "LEFT",
  Right = "RIGHT",
}

// 1. A highly complex Zod schema using all possible ways to construct zod validations
const allZodFeaturesSchema = z.object({
  // Primitives & basic types
  str: z.string(),
  num: z.number(),
  bool: z.boolean(),
  big: z.coerce.bigint(),
  dt: z.coerce.date(),
  anyVal: z.any(),
  unknownVal: z.unknown(),
  nullVal: z.null(),
  undefVal: z.undefined().optional(),

  // String sub-validations
  emailStr: z.string().email(),
  urlStr: z.string().url(),
  uuidStr: z.string().uuid(),
  dateTimeStr: z.string().datetime(),
  minMaxStr: z.string().min(3).max(10),
  regexStr: z.string().regex(/^[a-z]+$/),

  // Number sub-validations
  integer: z.number().int(),
  positiveNum: z.number().positive(),
  negativeNum: z.number().negative(),
  minMaxNum: z.number().min(0).max(100),

  // Arrays, Sets & Tuples
  strArray: z.array(z.string()),
  setOfStrings: z.array(z.string()).transform((val) => new Set(val)),
  tupleOfTwo: z.tuple([z.string(), z.number()]),
  tupleWithRest: z.tuple([z.string()]).rest(z.number()),

  // Nested structures & modifiers
  nestedObj: z.object({
    nestedKey: z.string(),
  }),
  partialObj: z.object({
    x: z.string(),
    y: z.number(),
  }).partial(),

  // Unions & Intersections
  simpleUnion: z.union([z.string(), z.number()]),
  discriminatedUnion: z.discriminatedUnion("type", [
    z.object({ type: z.literal("admin"), adminRole: z.string() }),
    z.object({ type: z.literal("member"), memberCode: z.number() }),
  ]),
  intersectionObj: z.intersection(
    z.object({ partA: z.string() }),
    z.object({ partB: z.number() }),
  ),

  // Records, Maps & Enums
  stringRecord: z.record(z.string(), z.string()),
  numberRecord: z.record(z.string(), z.number()),
  enumColors: z.enum(["red", "green", "blue"]),
  nativeDirectionEnum: z.nativeEnum(Direction),
  literalValue: z.literal("fixed-value"),

  // Modifiers
  optionalStr: z.string().optional(),
  nullableStr: z.string().nullable(),
  nullishStr: z.string().nullish(),
  defaultStr: z.string().default("fallback"),

  // Transform, preprocess & branded types
  transformedNumber: z.string().transform((v) => parseInt(v, 10)),
  preprocessedStr: z.preprocess((val) => String(val), z.string()),
  refinedStr: z.string().refine((val) => val.length > 2, {
    message: "Must be more than 2 chars",
  }),
  brandedStr: z.string().brand<"MyCustomBrand">(),
});

export const zodRoutes = new Hono()
  /**
   * @summary Test All Zod Validations
   * @description Test route receiving a request body constructed with all possible Zod features.
   * @tag Zod Testing
   */
  .post("/all-features", zValidator("json", allZodFeaturesSchema), (c) => {
    const data = c.req.valid("json");
    // Ensure TypeScript is happy with the type inferences
    return c.json({
      success: true,
      data: {
        str: data.str,
        num: data.num,
        bool: data.bool,
        // serialize bigint safely
        big: data.big.toString(),
        dt: data.dt,
        anyVal: data.anyVal,
        unknownVal: data.unknownVal,
        nullVal: data.nullVal,
        undefVal: data.undefVal,
        emailStr: data.emailStr,
        urlStr: data.urlStr,
        uuidStr: data.uuidStr,
        dateTimeStr: data.dateTimeStr,
        minMaxStr: data.minMaxStr,
        regexStr: data.regexStr,
        integer: data.integer,
        positiveNum: data.positiveNum,
        negativeNum: data.negativeNum,
        minMaxNum: data.minMaxNum,
        strArray: data.strArray,
        setOfStrings: Array.from(data.setOfStrings),
        tupleOfTwo: data.tupleOfTwo,
        tupleWithRest: data.tupleWithRest,
        nestedObj: data.nestedObj,
        partialObj: data.partialObj,
        simpleUnion: data.simpleUnion,
        discriminatedUnion: data.discriminatedUnion,
        intersectionObj: data.intersectionObj,
        stringRecord: data.stringRecord,
        numberRecord: data.numberRecord,
        enumColors: data.enumColors,
        nativeDirectionEnum: data.nativeDirectionEnum,
        literalValue: data.literalValue,
        optionalStr: data.optionalStr,
        nullableStr: data.nullableStr,
        nullishStr: data.nullishStr,
        defaultStr: data.defaultStr,
        transformedNumber: data.transformedNumber,
        preprocessedStr: data.preprocessedStr,
        refinedStr: data.refinedStr,
        brandedStr: data.brandedStr as unknown as string,
      },
    });
  });
