import { Project, SyntaxKind } from "ts-morph";

const source = `
const app = new Hono()
  /**
   * My Doc
   */
  // this is a line comment
  .get('/test', (c) => c.text('hello'));
`;

const project = new Project();
const sf = project.createSourceFile("test.ts", source);

const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
for (const call of calls) {
  const expr = call.getExpression();
  if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    const dotToken = expr.getChildAtIndex(1);
    
    // Get all leading comments of the dot token
    const comments = dotToken.getLeadingCommentRanges();
    let jsdocText = "";
    
    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (c.getKind() === SyntaxKind.MultiLineCommentTrivia) {
        const text = c.getText();
        if (text.startsWith("/**") && !text.startsWith("/**/")) {
          jsdocText = text;
          break; // Get the closest JSDoc
        }
      }
    }
    
    console.log("Extracted JSDoc:", jsdocText);
  }
}
