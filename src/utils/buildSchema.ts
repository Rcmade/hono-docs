import { SyntaxKind } from "ts-morph";

export function buildSchema(
  type: import("ts-morph").Type,
  seen = new WeakSet(),
  depth = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
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
      (u) => u.isStringLiteral() || u.isNull() || u.isUndefined()
    );
    if (lits.length && onlyNull) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema: any = {
        type: "string",
        enum: lits.map((u) => u.getLiteralValue()),
      };
      if (members.some((u) => u.isNull() || u.isUndefined()))
        schema.nullable = true;
      return schema;
    }
    const nonNull = members.filter((u) => !u.isNull() && !u.isUndefined());
    return { oneOf: nonNull.map((u) => buildSchema(u, seen, depth + 1)) };
  }
  if (type.isString()) return { type: "string" };
  if (type.isNumber()) return { type: "number" };
  if (type.isBoolean()) return { type: "boolean" };
  if (type.isArray()) {
    return {
      type: "array",
      items: buildSchema(type.getArrayElementTypeOrThrow(), seen, depth + 1),
    };
  }

  const decls = type.getSymbol()?.getDeclarations() || [];
  const isLit = decls.some(
    (d) =>
      d.getKind() === SyntaxKind.TypeLiteral ||
      d.getKind() === SyntaxKind.InterfaceDeclaration
  );
  if (!isLit) return {};

  const props = type
    .getProperties()
    .filter(
      (p) => p.getValueDeclaration()?.getKind() === SyntaxKind.PropertySignature
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propsMap: Record<string, any> = {};
  const req: string[] = [];
  for (const p of props) {
    const decl = p.getValueDeclarationOrThrow();
    propsMap[p.getName()] = buildSchema(decl.getType(), seen, depth + 1);
    if (!p.isOptional()) req.push(p.getName());
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = { type: "object", properties: propsMap };
  if (req.length) res.required = req;
  return res;
}
