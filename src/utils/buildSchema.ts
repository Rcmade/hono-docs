import type { OpenAPIV3 } from "openapi-types";

export function buildSchema(
  type: import("ts-morph").Type,
  typeChecker: import("ts-morph").TypeChecker,
  contextNode: import("ts-morph").Node,
  seen = new WeakSet(),
  depth = 0,
): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject {
  // Prevent infinite recursion on circular/recursive types
  if (depth > 40) return {};
  if (seen.has(type)) return {};
  seen.add(type);

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
    const lits = members.filter((u) => u.isStringLiteral());
    const onlyNull = members.every(
      (u) => u.isStringLiteral() || u.isNull() || u.isUndefined(),
    );
    if (lits.length && onlyNull) {
      const schema: OpenAPIV3.SchemaObject = {
        type: "string",
        enum: lits.map((u) => String(u.getLiteralValue())),
      };
      if (members.some((u) => u.isNull() || u.isUndefined()))
        schema.nullable = true;
      return schema;
    }
    const nonNull = members.filter((u) => !u.isNull() && !u.isUndefined());
    return {
      oneOf: nonNull.map((u) =>
        buildSchema(u, typeChecker, contextNode, seen, depth + 1),
      ),
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
      properties: propsMap,
    };
    if (req.length) res.required = req;
    return res;
  }

  return {};
}
