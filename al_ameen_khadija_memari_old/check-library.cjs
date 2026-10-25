const fs = require('fs');
const parser = require('@babel/parser');
const source = fs.readFileSync('src/app/library.tsx', 'utf8');
const ast = parser.parse(source, {sourceType:'module', plugins:['typescript','jsx']});
function walk(n) {
 if (!n || typeof n !== 'object') return;
 if(n.type==='JSXElement' && n.openingElement.name.name!=='Text') {
  for(const c of n.children) if(c.type==='JSXText') console.log(n.openingElement.name.name,JSON.stringify(c.value),c.start);
 }
 for(const v of Object.values(n)) if(Array.isArray(v)) v.forEach(walk); else if(v && typeof v==='object') walk(v);
}
walk(ast);
