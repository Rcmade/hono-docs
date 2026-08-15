import type { OpenAPIV3 } from "openapi-types";
import { attachSchemaName } from "./schemaHelper";

export function buildSchema(
  type: import("ts-morph").Type,
  typeChecker: import("ts-morph").TypeChecker,
  contextNode: import("ts-morph").Node,
  seen = new WeakSet(),
  depth = 0,
): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject {
  // Prevent infinite recursion on circular/recursive types
  if (depth > 40) return {};

  const isComplex = type.isObject() || type.isArray() || type.isTuple();
  if (isComplex) {
    if (seen.has(type)) return {};
    seen.add(type);
  }

  // Handle Date
  const symbol = type.getSymbol() || type.getAliasSymbol();
  if (symbol && symbol.getName() === "Date") {
    return {
      type: "string",
      format: "date-time",
    };
  }

  if (type.isStringLiteral && type.isStringLiteral()) {
    return {
      type: "string",
      enum: [type.getLiteralValue()],
    };
  }
  if (type.isNumberLiteral && type.isNumberLiteral()) {
    return {
      type: "number",
      enum: [type.getLiteralValue()],
    };
  }
  const text = type.getText();
  if (text === "true" || text === "false") {
    return {
      type: "boolean",
      enum: [text === "true"],
    };
  }

  if (type.isUnion()) {
    const members = type.getUnionTypes();

    // 1. Simplify boolean unions (true | false)
    const hasTrue = members.some((m) => m.getText() === "true");
    const hasFalse = members.some((m) => m.getText() === "false");
    const onlyBools = members.every(
      (m) =>
        m.getText() === "true" ||
        m.getText() === "false" ||
        (m.isNull && m.isNull()) ||
        (m.isUndefined && m.isUndefined())
    );
    if (hasTrue && hasFalse && onlyBools) {
      const schema: OpenAPIV3.SchemaObject = {
        type: "boolean",
      };
      if (members.some((m) => m.isNull && m.isNull())) {
        schema.nullable = true;
      }
      return schema;
    }

    // 2. Simplify string enum unions
    const lits = members.filter((u) => u.isStringLiteral && u.isStringLiteral());
    const onlyNull = members.every(
      (u) =>
        (u.isStringLiteral && u.isStringLiteral()) ||
        (u.isNull && u.isNull()) ||
        (u.isUndefined && u.isUndefined()),
    );
    if (lits.length && onlyNull) {
      const schema: OpenAPIV3.SchemaObject = {
        type: "string",
        enum: lits.map((u) => String(u.getLiteralValue())),
      };
      if (members.some((u) => u.isNull && u.isNull()))
        schema.nullable = true;
      return schema;
    }

    // 3. General unions: filter out null / undefined and wrap with oneOf
    const hasNull = members.some((u) => u.isNull && u.isNull());
    const nonNull = members.filter(
      (u) => !(u.isNull && u.isNull()) && !(u.isUndefined && u.isUndefined())
    );

    let resultSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
    if (nonNull.length === 1) {
      resultSchema = buildSchema(nonNull[0], typeChecker, contextNode, seen, depth + 1);
    } else {
      resultSchema = {
        oneOf: nonNull.map((u) =>
          buildSchema(u, typeChecker, contextNode, seen, depth + 1),
        ),
      };
    }

    if (hasNull && typeof resultSchema === "object") {
      (resultSchema as OpenAPIV3.SchemaObject).nullable = true;
    }
    return resultSchema;
  }

  if (type.isIntersection()) {
    return {
      allOf: type
        .getIntersectionTypes()
        .map((t) => buildSchema(t, typeChecker, contextNode, seen, depth + 1)),
    };
  }

  if (type.isString()) return { type: "string" };
  if (type.isNumber()) return { type: "number" };
  if (type.isBoolean()) return { type: "boolean" };
  if (type.isArray()) {
    return {
      type: "array",
      items: buildSchema(
        type.getArrayElementTypeOrThrow(),
        typeChecker,
        contextNode,
        seen,
        depth + 1,
      ),
    };
  }

  if (type.isTuple()) {
    return {
      type: "array",
      items: {
        oneOf: type
          .getTupleElements()
          .map((el) =>
            buildSchema(el, typeChecker, contextNode, seen, depth + 1),
          ),
      },
      minItems: type.getTupleElements().length,
      maxItems: type.getTupleElements().length,
    };
  }

  // Any object type (whether literal, mapped, or interface)
  if (type.isObject()) {
    const props = type.getProperties();
    // Filter out built-in prototype methods or internal symbols
    const filteredProps = props.filter((p) => {
      const name = p.getName();
      return !name.startsWith("__@") && !name.startsWith("Symbol(");
    });

    const propsMap: Record<
      string,
      OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
    > = {};
    const req: string[] = [];

    for (const p of filteredProps) {
      const pType = typeChecker.getTypeOfSymbolAtLocation(p, contextNode);
      propsMap[p.getName()] = buildSchema(
        pType,
        typeChecker,
        contextNode,
        seen,
        depth + 1,
      );
      if (!p.isOptional()) req.push(p.getName());
    }

    const res: OpenAPIV3.SchemaObject = {
      type: "object",
    };
    
    if (Object.keys(propsMap).length > 0) {
      res.properties = propsMap;
    }
    
    if (req.length) res.required = req;

    const stringIndexType = type.getStringIndexType();
    const numberIndexType = type.getNumberIndexType();

    if (stringIndexType) {
      res.additionalProperties = buildSchema(
        stringIndexType,
        typeChecker,
        contextNode,
        seen,
        depth + 1
      ) as OpenAPIV3.SchemaObject;
    } else if (numberIndexType) {
      res.additionalProperties = buildSchema(
        numberIndexType,
        typeChecker,
        contextNode,
        seen,
        depth + 1
      ) as OpenAPIV3.SchemaObject;
    }

    const objSymbol = type.getAliasSymbol() || type.getSymbol();
    if (objSymbol) {
      const symName = objSymbol.getName();
      if (
        symName &&
        !symName.startsWith("__") &&
        symName !== "Object" &&
        symName !== "Record" &&
        symName !== "Partial" &&
        symName !== "Required" &&
        symName !== "Readonly" &&
        symName !== "Pick" &&
        symName !== "Omit"
      ) {
        attachSchemaName(res, symName);
      }
    }

    return res;
  }

  return {};
}
